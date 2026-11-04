import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { onAuthStateChanged, type User } from 'firebase/auth';
import type {
  MediaStream as WebRTCStream,
  RTCPeerConnection as WebRTCPeerConnection,
} from 'react-native-webrtc';
import {
  acceptMessageCall,
  declineMessageCall,
  endMessageCall,
  joinInvitedMessageCall,
  leaveMessageCall,
  markMessageCallMissed,
  startMessageCall,
  type MessageCallIceServer,
  type MessageCallInvitation,
  type MessageCallJoinResult,
  type MessageCallParticipant,
  type MessageCallType,
} from '@/lib/messagesApi';
import { firebaseAuth } from '@/lib/firebase';
import { MessagesRealtime } from '@/lib/messagesRealtime';

type ActiveCall = {
  invitation: MessageCallInvitation;
  peerName: string;
  localStream: WebRTCStream;
  remoteStreams: { uid: string; stream: WebRTCStream }[];
  participants: MessageCallParticipant[];
  iceServers: MessageCallIceServer[];
  roomJoined: boolean;
  connected: boolean;
  muted: boolean;
  cameraEnabled: boolean;
};

type IncomingCall = MessageCallInvitation;

type CallContextValue = {
  activeCall: ActiveCall | null;
  incomingCall: IncomingCall | null;
  startingCall: boolean;
  startCall: (conversationId: string, peerName: string, type: MessageCallType) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => Promise<void>;
  hangUp: () => Promise<void>;
  toggleMicrophone: () => void;
  toggleCamera: () => void;
};

type CallSignal = {
  type?: 'offer' | 'answer';
  sdp?: string;
  candidate?: {
    candidate?: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
    usernameFragment?: string | null;
  };
};

type CallSignalPacket = {
  call_id: string;
  conversation_id: string;
  from_uid: string;
  signal: CallSignal;
};

type CallUpdateEvent = { call?: MessageCallInvitation };
type ParticipantUpdateEvent = {
  call_id?: string;
  call_status?: string;
  participants?: MessageCallParticipant[];
};

type CallJoinAcknowledgement = {
  success?: boolean;
  message?: string;
  participants?: MessageCallParticipant[];
  iceServers?: MessageCallIceServer[];
  conversationId?: string;
};

type CallPeer = {
  connection: WebRTCPeerConnection;
  pendingCandidates: NonNullable<CallSignal['candidate']>[];
  offerStarted: boolean;
};

type NativeWebRTCModule = typeof import('react-native-webrtc');

let nativeWebRTC: NativeWebRTCModule | null = null;
let nativeWebRTCUnavailable: Error | null = null;

try {
  nativeWebRTC = require('react-native-webrtc') as NativeWebRTCModule;
} catch (cause) {
  if (cause instanceof Error && /WebRTC native module not found/i.test(cause.message)) {
    nativeWebRTCUnavailable = cause;
  } else {
    throw cause;
  }
}

const CallContext = createContext<CallContextValue | null>(null);
const terminalCallStatuses = new Set(['ended', 'declined', 'missed']);

function getNativeWebRTC(): NativeWebRTCModule {
  if (nativeWebRTC) return nativeWebRTC;
  if (nativeWebRTCUnavailable) {
    throw new Error(
      'Voice and video calls need the Collab development build. Expo Go does not include native WebRTC.',
    );
  }
  throw new Error('The native WebRTC module could not be initialized.');
}

function getErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

function CallVideo({
  streamURL,
  style,
  objectFit,
  mirror,
}: {
  streamURL: string;
  style: StyleProp<ViewStyle>;
  objectFit: 'cover' | 'contain';
  mirror?: boolean;
}) {
  const NativeRTCView = nativeWebRTC?.RTCView;
  if (!NativeRTCView) return null;
  return (
    <NativeRTCView
      streamURL={streamURL}
      style={style}
      objectFit={objectFit}
      mirror={mirror}
    />
  );
}

function getAcceptedUids(participants: MessageCallParticipant[]): Set<string> {
  return new Set(
    participants
      .filter((participant) => participant.status === 'accepted')
      .map((participant) => participant.firebase_uid),
  );
}

function getIceServers(result: MessageCallJoinResult): MessageCallIceServer[] | null {
  const servers = result.ice_servers || result.iceServers || result.call?.ice_servers;
  return Array.isArray(servers) ? servers : null;
}

function stopStream(stream: WebRTCStream): void {
  stream.getTracks().forEach((track) => track.stop());
}

function CallAction({
  label,
  onPress,
  variant = 'default',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'default' | 'danger' | 'accept';
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.callAction,
        variant === 'danger' && styles.dangerAction,
        variant === 'accept' && styles.acceptAction,
        disabled && styles.disabledAction,
        pressed && !disabled && styles.pressedAction,
      ]}>
      <Text style={styles.callActionText}>{label}</Text>
    </Pressable>
  );
}

export function MessageCallProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(firebaseAuth.currentUser);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [startingCall, setStartingCall] = useState(false);
  const [acceptingCall, setAcceptingCall] = useState(false);
  const userRef = useRef(user);
  const realtimeRef = useRef<MessagesRealtime | null>(null);
  const callRef = useRef<ActiveCall | null>(null);
  const incomingRef = useRef<IncomingCall | null>(null);
  const startingRef = useRef(false);
  const acceptingRef = useRef(false);
  const peerConnections = useRef(new Map<string, CallPeer>());
  const pendingSignals = useRef(new Map<string, CallSignalPacket[]>());

  userRef.current = user;
  callRef.current = activeCall;
  incomingRef.current = incomingCall;
  startingRef.current = startingCall;

  const updateCall = useCallback((update: Partial<ActiveCall>) => {
    const current = callRef.current;
    if (!current) return;
    const next = { ...current, ...update };
    callRef.current = next;
    setActiveCall(next);
  }, []);

  const setCurrentCall = useCallback((call: ActiveCall | null) => {
    callRef.current = call;
    setActiveCall(call);
  }, []);

  const setCurrentIncoming = useCallback((call: IncomingCall | null) => {
    incomingRef.current = call;
    setIncomingCall(call);
  }, []);

  const disposeCall = useCallback(() => {
    peerConnections.current.forEach(({ connection }) => connection.close());
    peerConnections.current.clear();
    const current = callRef.current;
    if (current) stopStream(current.localStream);
    pendingSignals.current.delete(current?.invitation.call_id || '');
    setCurrentCall(null);
  }, [setCurrentCall]);

  const sendSignal = useCallback(async (
    call: ActiveCall,
    targetUid: string,
    signal: CallSignal,
  ) => {
    const socket = realtimeRef.current;
    if (!socket?.isConnected) throw new Error('Call signaling disconnected. Reconnecting…');
    const result = await socket.emitWithAck('call:signal', {
      conversationId: call.invitation.conversation_id,
      callId: call.invitation.call_id,
      targetUid,
      signal,
    }) as { success?: boolean; message?: string };
    if (!result?.success) {
      throw new Error(result?.message || 'Call signaling was denied.');
    }
  }, []);

  const createPeer = useCallback((call: ActiveCall, peerUid: string): CallPeer => {
    const existing = peerConnections.current.get(peerUid);
    if (existing) return existing;

    const { RTCPeerConnection } = getNativeWebRTC();
    const connection = new RTCPeerConnection({ iceServers: call.iceServers });
    const peer: CallPeer = {
      connection,
      pendingCandidates: [],
      offerStarted: false,
    };
    peerConnections.current.set(peerUid, peer);
    call.localStream.getTracks().forEach((track) => {
      connection.addTrack(track, call.localStream);
    });
    connection.ontrack = (event) => {
      const { MediaStream } = getNativeWebRTC();
      const stream = event.streams[0] || new MediaStream([event.track]);
      const current = callRef.current;
      if (!current || current.invitation.call_id !== call.invitation.call_id) return;
      const remoteStreams = current.remoteStreams.filter((item) => item.uid !== peerUid);
      updateCall({ remoteStreams: [...remoteStreams, { uid: peerUid, stream }] });
    };
    connection.onicecandidate = (event) => {
      if (!event.candidate || callRef.current?.invitation.call_id !== call.invitation.call_id) return;
      void sendSignal(call, peerUid, { candidate: event.candidate.toJSON() }).catch((cause) => {
        console.error('Unable to send a mobile call ICE candidate:', cause);
      });
    };
    connection.onconnectionstatechange = () => {
      if (callRef.current?.invitation.call_id !== call.invitation.call_id) return;
      if (connection.connectionState === 'connected') updateCall({ connected: true });
      if (connection.connectionState === 'failed') {
        Alert.alert('Call connection failed', 'Check your internet connection and try again.');
      }
    };
    return peer;
  }, [sendSignal, updateCall]);

  const startOffer = useCallback(async (callId: string, peerUid: string) => {
    const call = callRef.current;
    const peer = peerConnections.current.get(peerUid);
    if (!call || call.invitation.call_id !== callId || !peer ||
        !userRef.current || userRef.current.uid >= peerUid || peer.offerStarted) return;
    peer.offerStarted = true;
    try {
      const offer = await peer.connection.createOffer();
      await peer.connection.setLocalDescription(offer);
      const localDescription = peer.connection.localDescription;
      if (!localDescription?.sdp) throw new Error('The WebRTC offer could not be created.');
      await sendSignal(call, peerUid, {
        type: 'offer',
        sdp: localDescription.sdp,
      });
    } catch (cause) {
      console.error('Unable to start a mobile WebRTC offer:', cause);
      Alert.alert('Call connection failed', getErrorMessage(cause, 'Unable to start the call.'));
    }
  }, [sendSignal]);

  const syncPeers = useCallback(async (
    callId: string,
    participants: MessageCallParticipant[],
  ) => {
    const call = callRef.current;
    if (!call || call.invitation.call_id !== callId) return;
    const accepted = getAcceptedUids(participants);
    const currentUid = userRef.current?.uid;
    for (const [uid, peer] of peerConnections.current) {
      if (!accepted.has(uid)) {
        peer.connection.close();
        peerConnections.current.delete(uid);
      }
    }
    updateCall({ participants });
    for (const uid of accepted) {
      if (uid === currentUid) continue;
      createPeer(call, uid);
      if (currentUid && currentUid < uid) await startOffer(callId, uid);
    }
    const queued = pendingSignals.current.get(callId) || [];
    pendingSignals.current.delete(callId);
    for (const packet of queued) await handleSignalRef.current(packet);
  }, [createPeer, startOffer, updateCall]);

  const joinCallRoom = useCallback(async (callId: string) => {
    const socket = realtimeRef.current;
    if (!socket?.isConnected) throw new Error('Call signaling is reconnecting. Please try again.');
    const result = await socket.emitWithAck('call:join', callId) as CallJoinAcknowledgement;
    if (!result?.success) throw new Error(result?.message || 'Unable to join the call.');
    updateCall({
      roomJoined: true,
      ...(Array.isArray(result.iceServers) ? { iceServers: result.iceServers } : {}),
    });
    await syncPeers(callId, result.participants || []);
  }, [syncPeers, updateCall]);

  const joinCallRoomRef = useRef(joinCallRoom);
  joinCallRoomRef.current = joinCallRoom;

  const handleSignal = useCallback(async (packet: CallSignalPacket) => {
    const call = callRef.current;
    if (!call || call.invitation.call_id !== packet.call_id ||
        call.invitation.conversation_id !== packet.conversation_id) return;
    const accepted = getAcceptedUids(call.participants);
    if (!call.roomJoined || !accepted.has(packet.from_uid)) {
      const pending = pendingSignals.current.get(packet.call_id) || [];
      pending.push(packet);
      pendingSignals.current.set(packet.call_id, pending);
      return;
    }
    const peer = createPeer(call, packet.from_uid);
    const { connection } = peer;
    const signal = packet.signal;
    if (signal.type === 'offer' && typeof signal.sdp === 'string') {
      await connection.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
      for (const candidate of peer.pendingCandidates.splice(0)) {
        await connection.addIceCandidate(candidate);
      }
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      const localDescription = connection.localDescription;
      if (!localDescription?.sdp) throw new Error('The WebRTC answer could not be created.');
      await sendSignal(call, packet.from_uid, {
        type: 'answer',
        sdp: localDescription.sdp,
      });
    } else if (signal.type === 'answer' && typeof signal.sdp === 'string') {
      await connection.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
      for (const candidate of peer.pendingCandidates.splice(0)) {
        await connection.addIceCandidate(candidate);
      }
    } else if (signal.candidate?.candidate) {
      if (connection.remoteDescription) {
        await connection.addIceCandidate(signal.candidate);
      } else {
        peer.pendingCandidates.push(signal.candidate);
      }
    }
  }, [createPeer, sendSignal]);

  const handleSignalRef = useRef(handleSignal);
  handleSignalRef.current = handleSignal;

  const finishCall = useCallback(async (notifyPeer: boolean) => {
    const call = callRef.current;
    if (!call) return;
    disposeCall();
    realtimeRef.current?.emit('call:leave', call.invitation.call_id);
    if (!notifyPeer) return;
    try {
      if (userRef.current?.uid === call.invitation.caller_uid) {
        await endMessageCall(call.invitation.conversation_id, call.invitation.call_id);
      } else {
        await leaveMessageCall(call.invitation.call_id);
      }
    } catch (cause) {
      Alert.alert('Unable to end call', getErrorMessage(cause, 'Please try again.'));
    }
  }, [disposeCall]);

  const hangUp = useCallback(() => finishCall(true), [finishCall]);

  const startCall = useCallback(async (
    conversationId: string,
    peerName: string,
    type: MessageCallType,
  ) => {
    if (startingRef.current || callRef.current || incomingRef.current) {
      Alert.alert('Call in progress', 'Finish the current call before starting another.');
      return;
    }
    startingRef.current = true;
    setStartingCall(true);
    let localStream: WebRTCStream | null = null;
    let createdCall: MessageCallInvitation | undefined;
    try {
      const { mediaDevices } = getNativeWebRTC();
      localStream = await mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video',
      });
      const result = await startMessageCall(conversationId, type);
      createdCall = result.call;
      if (!createdCall?.call_id || !Array.isArray(createdCall.participants) ||
          !Array.isArray(createdCall.ice_servers)) {
        throw new Error('The call service returned incomplete setup information.');
      }
      setCurrentCall({
        invitation: createdCall,
        peerName: createdCall.peer_name || peerName,
        localStream,
        remoteStreams: [],
        participants: createdCall.participants,
        iceServers: createdCall.ice_servers,
        roomJoined: false,
        connected: false,
        muted: false,
        cameraEnabled: type === 'video',
      });
      localStream = null;
      await joinCallRoomRef.current(createdCall.call_id);
    } catch (cause) {
      if (localStream) stopStream(localStream);
      const active = callRef.current;
      if (active) {
        await finishCall(false);
        if (userRef.current?.uid === active.invitation.caller_uid) {
          try {
            await endMessageCall(active.invitation.conversation_id, active.invitation.call_id);
          } catch (endCause) {
            console.error('Unable to clean up a failed mobile call setup:', endCause);
          }
        }
      } else if (createdCall) {
        try {
          await endMessageCall(createdCall.conversation_id, createdCall.call_id);
        } catch (endCause) {
          console.error('Unable to clean up a failed mobile call setup:', endCause);
        }
      }
      Alert.alert('Unable to start call', getErrorMessage(cause, 'Check microphone and camera permissions.'));
    } finally {
      startingRef.current = false;
      setStartingCall(false);
    }
  }, [finishCall, setCurrentCall]);

  const acceptCall = useCallback(async () => {
    const invitation = incomingRef.current;
    if (!invitation || acceptingRef.current || callRef.current) return;
    acceptingRef.current = true;
    setAcceptingCall(true);
    let localStream: WebRTCStream | null = null;
    try {
      const { mediaDevices } = getNativeWebRTC();
      localStream = await mediaDevices.getUserMedia({
        audio: true,
        video: invitation.call_type === 'video',
      });
      const result = invitation.added_participant
        ? await joinInvitedMessageCall(invitation.conversation_id, invitation.call_id)
        : await acceptMessageCall(invitation.conversation_id, invitation.call_id);
      const iceServers = getIceServers(result);
      const participants = result.participants || result.call?.participants;
      if (!iceServers || !Array.isArray(participants)) {
        throw new Error('The call service returned incomplete setup information.');
      }
      setCurrentIncoming(null);
      setCurrentCall({
        invitation: { ...invitation, status: 'accepted' },
        peerName: invitation.caller_name,
        localStream,
        remoteStreams: [],
        participants,
        iceServers,
        roomJoined: false,
        connected: false,
        muted: false,
        cameraEnabled: invitation.call_type === 'video',
      });
      localStream = null;
      await joinCallRoomRef.current(invitation.call_id);
    } catch (cause) {
      if (localStream) stopStream(localStream);
      if (callRef.current?.invitation.call_id === invitation.call_id) {
        await finishCall(false);
        try {
          if (invitation.added_participant) {
            await leaveMessageCall(invitation.call_id);
          } else {
            await endMessageCall(invitation.conversation_id, invitation.call_id);
          }
        } catch (endCause) {
          console.error('Unable to clean up a failed incoming call setup:', endCause);
        }
        setCurrentIncoming(null);
      }
      Alert.alert('Unable to join call', getErrorMessage(cause, 'Check microphone and camera permissions.'));
    } finally {
      acceptingRef.current = false;
      setAcceptingCall(false);
    }
  }, [finishCall, setCurrentCall]);

  const declineCall = useCallback(async () => {
    const invitation = incomingRef.current;
    if (!invitation) return;
    setCurrentIncoming(null);
    try {
      await declineMessageCall(
        invitation.conversation_id,
        invitation.call_id,
        Boolean(invitation.added_participant),
      );
    } catch (cause) {
      Alert.alert('Unable to decline call', getErrorMessage(cause, 'Please try again.'));
    }
  }, []);

  const toggleMicrophone = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    const nextMuted = !call.muted;
    call.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    updateCall({ muted: nextMuted });
  }, [updateCall]);

  const toggleCamera = useCallback(() => {
    const call = callRef.current;
    if (!call || call.invitation.call_type !== 'video') return;
    const nextEnabled = !call.cameraEnabled;
    call.localStream.getVideoTracks().forEach((track) => {
      track.enabled = nextEnabled;
    });
    updateCall({ cameraEnabled: nextEnabled });
  }, [updateCall]);

  useEffect(() => onAuthStateChanged(firebaseAuth, setUser), []);

  useEffect(() => {
    if (!user) {
      setCurrentIncoming(null);
      return undefined;
    }
    const socket = new MessagesRealtime(user);
    realtimeRef.current = socket;
    const removers = [
      socket.on<CallUpdateEvent>('call:updated', (event) => {
        const call = event?.call;
        if (!call?.call_id || call.callee_uid !== user.uid) return;
        if (terminalCallStatuses.has(call.status)) {
          if (incomingRef.current?.call_id === call.call_id) setCurrentIncoming(null);
          if (callRef.current?.invitation.call_id === call.call_id) void finishCall(false);
          return;
        }
        if (callRef.current?.invitation.call_id === call.call_id) {
          updateCall({ invitation: call });
          return;
        }
        if (AppState.currentState !== 'active') {
          void declineMessageCall(call.conversation_id, call.call_id, Boolean(call.added_participant))
            .catch((cause) => console.error('Unable to decline a background mobile call:', cause));
          return;
        }
        if (callRef.current || startingRef.current) {
          void declineMessageCall(call.conversation_id, call.call_id, Boolean(call.added_participant))
            .catch((cause) => console.error('Unable to decline a busy mobile call:', cause));
          return;
        }
        if (call.status === 'ringing') {
          setCurrentIncoming(call);
        } else if (call.status === 'accepted' && incomingRef.current?.call_id === call.call_id) {
          setCurrentIncoming(null);
        }
      }),
      socket.on<ParticipantUpdateEvent>('call:participant-updated', (event) => {
        if (!event?.call_id || !event.participants) return;
        if (terminalCallStatuses.has(event.call_status || '')) {
          if (callRef.current?.invitation.call_id === event.call_id) void finishCall(false);
          if (incomingRef.current?.call_id === event.call_id) setCurrentIncoming(null);
          return;
        }
        if (event.call_status === 'accepted' &&
            callRef.current?.invitation.call_id === event.call_id) {
          updateCall({
            invitation: { ...callRef.current.invitation, status: 'accepted' },
          });
        }
        void syncPeers(event.call_id, event.participants);
      }),
      socket.on<CallSignalPacket>('call:signal', (packet) => {
        void handleSignalRef.current(packet).catch((cause) => {
          console.error('Unable to process a mobile WebRTC signal:', cause);
          Alert.alert('Call connection failed', getErrorMessage(cause, 'Unable to connect this call.'));
        });
      }),
      socket.on('connect', () => {
        const call = callRef.current;
        if (call) {
          void joinCallRoomRef.current(call.invitation.call_id).catch((cause) => {
            console.error('Unable to rejoin mobile call signaling:', cause);
          });
        }
      }),
      socket.on('disconnect', () => updateCall({ roomJoined: false })),
    ];
    socket.start();
    return () => {
      removers.forEach((remove) => remove());
      socket.stop();
      if (realtimeRef.current === socket) realtimeRef.current = null;
      disposeCall();
      setCurrentIncoming(null);
    };
  }, [disposeCall, finishCall, handleSignal, setCurrentIncoming, syncPeers, updateCall, user]);

  useEffect(() => {
    const call = incomingCall;
    if (!call) return undefined;
    const expiresAt = Date.parse(call.ring_expires_at);
    if (!Number.isFinite(expiresAt)) return undefined;
    const timer = setTimeout(() => {
      if (incomingRef.current?.call_id === call.call_id) setCurrentIncoming(null);
    }, Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [incomingCall]);

  useEffect(() => {
    const call = activeCall;
    if (!call || call.invitation.status !== 'ringing' ||
        user?.uid !== call.invitation.caller_uid) return undefined;
    const expiresAt = Date.parse(call.invitation.ring_expires_at);
    if (!Number.isFinite(expiresAt)) return undefined;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const expire = async () => {
      if (cancelled || callRef.current?.invitation.call_id !== call.invitation.call_id) return;
      try {
        const result = await markMessageCallMissed(
          call.invitation.conversation_id,
          call.invitation.call_id,
        );
        if (cancelled) return;
        if (result.stillRinging) {
          timer = setTimeout(expire, Math.max(250, result.retryAfterMs ?? 1000));
          return;
        }
      } catch (cause) {
        console.error('Unable to mark the mobile call as missed:', cause);
        if (!cancelled) {
          timer = setTimeout(expire, 3000);
          return;
        }
      }
      if (!cancelled) void finishCall(false);
    };
    timer = setTimeout(expire, Math.max(0, expiresAt - Date.now()));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeCall, finishCall, user?.uid]);

  const contextValue = useMemo<CallContextValue>(() => ({
    activeCall,
    incomingCall,
    startingCall,
    startCall,
    acceptCall,
    declineCall,
    hangUp,
    toggleMicrophone,
    toggleCamera,
  }), [
    acceptCall,
    activeCall,
    declineCall,
    hangUp,
    incomingCall,
    startCall,
    startingCall,
    toggleCamera,
    toggleMicrophone,
  ]);

  return (
    <CallContext.Provider value={contextValue}>
      <View style={styles.root}>
        {children}
        <Modal
          visible={Boolean(incomingCall || activeCall || startingCall)}
          animationType="fade"
          onRequestClose={() => {
            if (activeCall) void hangUp();
            else if (incomingCall && !acceptingCall) void declineCall();
          }}
          statusBarTranslucent>
          <SafeAreaView style={styles.callScreen}>
            {incomingCall ? (
              <View style={styles.incomingPanel}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(incomingCall.caller_name || 'U').trim().slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.callTitle}>{incomingCall.caller_name || 'Incoming call'}</Text>
                <Text style={styles.callSubtitle}>
                  Incoming {incomingCall.call_type === 'video' ? 'video' : 'voice'} call
                </Text>
                <View style={styles.callControls}>
                  <CallAction
                    label="Decline"
                    onPress={() => { void declineCall(); }}
                    variant="danger"
                    disabled={acceptingCall}
                  />
                  <CallAction
                    label={acceptingCall ? 'Connecting…' : 'Accept'}
                    onPress={() => { void acceptCall(); }}
                    variant="accept"
                    disabled={acceptingCall}
                  />
                </View>
              </View>
            ) : activeCall ? (
              <View style={styles.activePanel}>
                {activeCall.invitation.call_type === 'video' && activeCall.remoteStreams[0] ? (
                  <CallVideo
                    streamURL={activeCall.remoteStreams[0].stream.toURL()}
                    style={styles.remoteVideo}
                    objectFit="cover"
                  />
                ) : (
                  <View style={styles.remotePlaceholder}>
                    {activeCall.invitation.call_type === 'video' && (
                      <CallVideo
                        streamURL={activeCall.localStream.toURL()}
                        style={styles.localVideo}
                        objectFit="cover"
                        mirror
                      />
                    )}
                    <View style={styles.callStatus}>
                      {!activeCall.connected && <ActivityIndicator color="#FFFFFF" />}
                      <Text style={styles.callTitle}>{activeCall.peerName}</Text>
                      <Text style={styles.callSubtitle}>
                        {activeCall.connected ? 'Connected' : activeCall.invitation.status === 'ringing' ? 'Calling…' : 'Connecting…'}
                      </Text>
                    </View>
                  </View>
                )}
                {activeCall.invitation.call_type === 'video' && activeCall.cameraEnabled &&
                  activeCall.remoteStreams.length > 0 && (
                    <CallVideo
                      streamURL={activeCall.localStream.toURL()}
                      style={styles.localVideo}
                      objectFit="cover"
                      mirror
                    />
                  )}
                <View style={styles.activeHeader}>
                  <Text style={styles.activeTitle}>{activeCall.peerName}</Text>
                  <Text style={styles.activeSubtitle}>
                    {activeCall.connected ? 'Connected' : activeCall.invitation.status === 'ringing' ? 'Calling…' : 'Connecting…'}
                  </Text>
                </View>
                <View style={styles.callControls}>
                  <CallAction
                    label={activeCall.muted ? 'Unmute' : 'Mute'}
                    onPress={toggleMicrophone}
                  />
                  {activeCall.invitation.call_type === 'video' && (
                    <CallAction
                      label={activeCall.cameraEnabled ? 'Camera off' : 'Camera on'}
                      onPress={toggleCamera}
                    />
                  )}
                  <CallAction label="End" onPress={() => { void hangUp(); }} variant="danger" />
                </View>
              </View>
            ) : (
              <View style={styles.incomingPanel}>
                <ActivityIndicator color="#FFFFFF" />
                <Text style={styles.callTitle}>Starting call…</Text>
              </View>
            )}
          </SafeAreaView>
        </Modal>
      </View>
    </CallContext.Provider>
  );
}

export function useMessageCalls(): CallContextValue {
  const context = useContext(CallContext);
  if (!context) throw new Error('useMessageCalls must be used within MessageCallProvider.');
  return context;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  callScreen: { flex: 1, backgroundColor: '#111111' },
  incomingPanel: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  avatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#303039',
    marginBottom: 24,
  },
  avatarText: { color: '#FFFFFF', fontSize: 44, fontWeight: '700' },
  callTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '700', textAlign: 'center' },
  callSubtitle: { color: '#C6C6CB', fontSize: 15, marginTop: 8, textAlign: 'center' },
  callControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: 42,
  },
  callAction: {
    minWidth: 82,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: '#37373F',
  },
  dangerAction: { backgroundColor: '#D92D20' },
  acceptAction: { backgroundColor: '#12B76A' },
  disabledAction: { opacity: 0.6 },
  pressedAction: { opacity: 0.8 },
  callActionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  activePanel: { flex: 1, backgroundColor: '#111111', justifyContent: 'center' },
  remoteVideo: { ...StyleSheet.absoluteFillObject },
  remotePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#202027',
  },
  localVideo: {
    position: 'absolute',
    top: 20,
    right: 16,
    width: 104,
    height: 148,
    borderRadius: 14,
    backgroundColor: '#303039',
    zIndex: 2,
  },
  callStatus: { alignItems: 'center', gap: 12 },
  activeHeader: {
    position: 'absolute',
    top: 24,
    left: 20,
    right: 130,
    zIndex: 3,
  },
  activeTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  activeSubtitle: { color: '#E4E4E7', fontSize: 13, marginTop: 4 },
});
