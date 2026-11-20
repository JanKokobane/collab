import { useCallback, useEffect, useRef, useState } from 'react'
import type { AuthUser } from '../../auth/authClient.js'
import type { ConversationMessage } from '../../types/dashboard.js'
import styles from './MessageCalls.module.css'

export type MessageCallMediaType = 'audio' | 'video'
export type MessageCallParticipantStatus = 'ringing' | 'accepted' | 'declined' | 'missed' | 'left'

export interface MessageCallMember {
  firebaseUid: string
  name: string
  profileImage?: string | null
}

export interface MessageCallConversation {
  id: string
  projectId?: string
  type?: string
  name?: string
  participants: MessageCallMember[]
}

export interface MessageCallParticipant {
  firebase_uid: string
  display_name: string
  status: MessageCallParticipantStatus
  profile_image?: string | null
}

export interface MessageCall {
  call_id: string
  conversation_id: string
  caller_uid: string
  caller_name: string
  callee_uid: string
  callee_name?: string
  call_type: MessageCallMediaType
  status: string
  ring_expires_at: string
  added_participant?: boolean
  participants?: MessageCallParticipant[]
  ice_servers?: RTCIceServer[]
}

export interface MessageCallInvitee {
  firebaseUid: string
  name: string
  profileImage?: string | null
}

export interface UseMessageCallsOptions {
  user: AuthUser
  conversation: MessageCallConversation | null
  /** Backend server origin, such as https://collab.example.com (without /api). */
  apiOrigin: string
  onError: (error: Error, operation: string) => void
  onRealtimeSocket?: (socket: RealtimeSocket | null) => void
  /** Optional project members eligible for the add-participants picker. */
  invitees?: MessageCallInvitee[]
}

export interface ActiveMessageCall {
  callId: string
  conversationId: string
  callType: MessageCallMediaType
  status: string
  caller: boolean
  localStream: MediaStream
  participants: MessageCallParticipant[]
  peerConnections: Map<string, PeerState>
  iceServers: RTCIceServer[]
  connectedAt: number | null
  isMuted: boolean
  isCameraOff: boolean
  ringExpiresAt: number
  durationTimer: ReturnType<typeof setInterval> | null
  ringingTimer: ReturnType<typeof setTimeout> | null
  callRoomJoined: boolean
}

interface PeerState {
  peerConnection: RTCPeerConnection
  remoteStream: MediaStream
  pendingIceCandidates: RTCIceCandidateInit[]
  offerStarted: boolean
}

interface CallSignalPacket {
  call_id: string
  conversation_id: string
  from_uid: string
  signal: RTCSessionDescriptionInit | { candidate: RTCIceCandidateInit }
}

interface CallAck {
  success: boolean
  message?: string
  conversationId?: string
  iceServers?: RTCIceServer[]
  participants?: MessageCallParticipant[]
}

interface CallSignalPayload {
  conversationId: string
  callId: string
  targetUid: string
  signal: RTCSessionDescriptionInit | { candidate: RTCIceCandidateInit }
}

export interface RealtimeSocket {
  connected: boolean
  auth: { token: string }
  connect(): this
  on(event: 'connect', listener: () => void): this
  on(event: 'disconnect', listener: (reason: string) => void): this
  on(event: 'connect_error', listener: (error: Error) => void): this
  on(event: 'call:updated', listener: (payload: { call?: MessageCall }) => void): this
  on(event: 'call:participant-updated', listener: (payload: {
    call_id: string
    call_status?: string
    participants?: MessageCallParticipant[]
  }) => void): this
  on(event: 'call:signal', listener: (packet: CallSignalPacket) => void): this
  on(event: 'message:created', listener: (payload: { message: ConversationMessage }) => void): this
  on(event: 'message:updated', listener: (payload: { message: ConversationMessage }) => void): this
  on(event: 'message:deleted', listener: (payload: {
    conversation_id: string
    message_id: string
    scope?: 'me' | 'everyone'
    hidden_for_uid?: string | null
  }) => void): this
  on(event: 'message:read' | 'message:delivered', listener: (payload: {
    conversation_id: string
    firebase_uid?: string
    message_ids?: string[]
    read_at?: string
  }) => void): this
  on(event: 'conversation:created' | 'conversations:refresh', listener: () => void): this
  on(event: 'conversation:removed' | 'conversation:cleared', listener: (payload: { conversation_id: string }) => void): this
  on(event: 'presence:updated', listener: (payload: {
    firebase_uid: string
    is_online: boolean
    last_seen_at: string | null
  }) => void): this
  on(event: 'call:updated', listener: (payload: { call?: MessageCall }) => void): this
  off(event: 'connect', listener: () => void): this
  off(event: 'connect_error', listener: (error: Error) => void): this
  off(event: 'message:created', listener: (payload: { message: ConversationMessage }) => void): this
  off(event: 'message:updated', listener: (payload: { message: ConversationMessage }) => void): this
  off(event: 'message:deleted', listener: (payload: {
    conversation_id: string
    message_id: string
    scope?: 'me' | 'everyone'
    hidden_for_uid?: string | null
  }) => void): this
  off(event: 'message:read' | 'message:delivered', listener: (payload: {
    conversation_id: string
    firebase_uid?: string
    message_ids?: string[]
    read_at?: string
  }) => void): this
  off(event: 'conversation:created' | 'conversations:refresh', listener: () => void): this
  off(event: 'conversation:removed' | 'conversation:cleared', listener: (payload: { conversation_id: string }) => void): this
  off(event: 'presence:updated', listener: (payload: {
    firebase_uid: string
    is_online: boolean
    last_seen_at: string | null
  }) => void): this
  off(event: 'call:updated', listener: (payload: { call?: MessageCall }) => void): this
  emit(event: 'call:join', callId: string, acknowledge: (result: CallAck) => void): void
  emit(event: 'call:leave', callId: string): void
  emit(event: 'call:signal', payload: CallSignalPayload, acknowledge: (result: CallAck) => void): void
  emit(event: 'conversation:join', conversationId: string, acknowledge?: (result: { success: boolean; message?: string }) => void): void
  emit(event: 'conversation:leave', conversationId: string): void
  disconnect(): void
}

type SocketFactory = (
  origin: string,
  options: {
    auth: { token: string }
    autoConnect: boolean
    reconnection: boolean
    reconnectionAttempts: number
    transports: string[]
    tryAllTransports: boolean
  },
) => RealtimeSocket

declare global {
  interface Window {
    io?: SocketFactory
    webkitAudioContext?: typeof AudioContext
  }
}

interface ApiEnvelope<T> {
  success: boolean
  data?: T
  message?: string
  code?: string
}

interface CallSession extends ActiveMessageCall {
  peerName: string
}

interface PendingCallSignal {
  packet: CallSignalPacket
}

export interface UseMessageCallsResult {
  activeCall: ActiveMessageCall | null
  incomingCall: MessageCall | null
  startingCall: MessageCallMediaType | null
  callError: Error | null
  invitePickerOpen: boolean
  invitePending: boolean
  startCall: (mediaType: MessageCallMediaType) => Promise<void>
  acceptIncomingCall: () => Promise<void>
  declineIncomingCall: () => Promise<void>
  hangUp: () => Promise<void>
  toggleMicrophone: () => void
  toggleCamera: () => void
  openInvitePicker: () => void
  closeInvitePicker: () => void
  inviteParticipants: (firebaseUids: string[]) => Promise<void>
  dismissCallError: () => void
}

let socketClientLoading: Promise<void> | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizedOrigin(origin: string): string {
  return origin.replace(/\/+$/, '').replace(/\/api$/i, '')
}

async function loadSocketClient(origin: string): Promise<void> {
  if (window.io) return
  if (!socketClientLoading) {
    socketClientLoading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = `${origin}/socket.io/socket.io.js`
      script.async = true
      script.onload = () => window.io
        ? resolve()
        : reject(new Error('The realtime call client could not be loaded.'))
      script.onerror = () => reject(new Error('The realtime call client could not be loaded.'))
      document.head.append(script)
    }).catch(error => {
      socketClientLoading = null
      throw error
    })
  }
  if (!socketClientLoading) throw new Error('The realtime call client could not be loaded.')
  return socketClientLoading
}

function errorMessage(value: unknown, fallback: string): string {
  if (value instanceof Error && value.message) return value.message
  if (isRecord(value) && typeof value.message === 'string') return value.message
  return fallback
}

function asError(value: unknown, fallback: string): Error {
  return value instanceof Error ? value : new Error(errorMessage(value, fallback))
}

function useMessageCalls(options: UseMessageCallsOptions): UseMessageCallsResult {
  const { user, conversation, apiOrigin, onError, onRealtimeSocket, invitees = [] } = options
  const userRef = useRef(user)
  const conversationRef = useRef(conversation)
  const originRef = useRef(normalizedOrigin(apiOrigin))
  const errorCallbackRef = useRef(onError)
  const socketCallbackRef = useRef(onRealtimeSocket)
  const inviteesRef = useRef(invitees)
  userRef.current = user
  conversationRef.current = conversation
  originRef.current = normalizedOrigin(apiOrigin)
  errorCallbackRef.current = onError
  socketCallbackRef.current = onRealtimeSocket
  inviteesRef.current = invitees

  const socketRef = useRef<RealtimeSocket | null>(null)
  const activeRef = useRef<CallSession | null>(null)
  const getActiveCall = () => activeRef.current
  const incomingRef = useRef<MessageCall | null>(null)
  const acceptingRef = useRef<string | null>(null)
  const startingRef = useRef(false)
  const pendingSignalsRef = useRef<Map<string, PendingCallSignal[]>>(new Map())
  const incomingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startSequenceRef = useRef(0)
  const ringtoneRef = useRef<{
    context: AudioContext
    timer: ReturnType<typeof setInterval> | null
    oscillators: Set<OscillatorNode>
  } | null>(null)

  const [activeCall, setActiveCallState] = useState<CallSession | null>(null)
  const [incomingCall, setIncomingCallState] = useState<MessageCall | null>(null)
  const [startingCall, setStartingCall] = useState<MessageCallMediaType | null>(null)
  const [callError, setCallError] = useState<Error | null>(null)
  const [invitePickerOpen, setInvitePickerOpen] = useState(false)
  const [invitePending, setInvitePending] = useState(false)
  const [, setRenderVersion] = useState(0)

  const refresh = useCallback(() => setRenderVersion(version => version + 1), [])
  const setActiveCall = useCallback((call: CallSession | null) => {
    activeRef.current = call
    setActiveCallState(call)
  }, [])
  const setIncomingCall = useCallback((call: MessageCall | null) => {
    incomingRef.current = call
    setIncomingCallState(call)
  }, [])

  const reportError = useCallback((error: unknown, operation: string) => {
    const failure = asError(error, 'The call could not be completed.')
    console.error(`[messages] ${operation} failed.`, {
      message: failure.message,
      callId: activeRef.current?.callId || incomingRef.current?.call_id || null,
      conversationId: activeRef.current?.conversationId || incomingRef.current?.conversation_id || null,
    })
    errorCallbackRef.current(failure, operation)
    return failure
  }, [])

  const request = useCallback(async <TData,>(
    path: string,
    method: 'GET' | 'POST',
    body?: unknown,
  ): Promise<TData> => {
    const currentUser = userRef.current
    const token = await currentUser.getIdToken(false)
    const response = await fetch(`${originRef.current}/api${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const payload = await response.json().catch(() => null) as ApiEnvelope<TData> | null
    if (!response.ok || !payload?.success) {
      const failure = new Error(payload?.message || `Call request failed (${response.status}).`)
      if (payload?.code) Object.assign(failure, { code: payload.code })
      if (response.status) Object.assign(failure, { status: response.status })
      throw failure
    }
    return payload.data as TData
  }, [])

  const stopRingtone = useCallback(() => {
    const ringtone = ringtoneRef.current
    if (!ringtone) return
    if (ringtone.timer !== null) clearInterval(ringtone.timer)
    ringtone.timer = null
    ringtone.oscillators.forEach(oscillator => {
      try {
        oscillator.stop()
      } catch {
        // The oscillator may already have stopped naturally.
      }
    })
  }, [])

  const playTone = useCallback(() => {
    const context = ringtoneRef.current?.context
    const shouldRing = Boolean(incomingRef.current ||
      (activeRef.current?.caller && activeRef.current.status === 'ringing'))
    if (!context || context.state !== 'running' || !shouldRing || acceptingRef.current) return
    const startAt = context.currentTime
    for (const offset of [0, 0.68]) {
      for (const frequency of [440, 480]) {
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(frequency, startAt + offset)
        gain.gain.setValueAtTime(0, startAt + offset)
        gain.gain.linearRampToValueAtTime(0.18, startAt + offset + 0.035)
        gain.gain.setValueAtTime(0.18, startAt + offset + 0.38)
        gain.gain.linearRampToValueAtTime(0, startAt + offset + 0.44)
        oscillator.connect(gain)
        gain.connect(context.destination)
        ringtoneRef.current?.oscillators.add(oscillator)
        oscillator.addEventListener('ended', () => {
          ringtoneRef.current?.oscillators.delete(oscillator)
          oscillator.disconnect()
          gain.disconnect()
        }, { once: true })
        oscillator.start(startAt + offset)
        oscillator.stop(startAt + offset + 0.46)
      }
    }
  }, [])

  const ensureRingtoneContext = useCallback((): AudioContext | null => {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext
    if (!AudioContextConstructor) return null
    if (!ringtoneRef.current) {
      try {
        ringtoneRef.current = {
          context: new AudioContextConstructor(),
          timer: null,
          oscillators: new Set(),
        }
      } catch (error) {
        console.warn('[messages] Call ringtone is not supported.', errorMessage(error, 'Audio is unavailable.'))
        return null
      }
    }
    return ringtoneRef.current.context
  }, [])

  const ensureConnected = useCallback(async (): Promise<RealtimeSocket> => {
    let socket = socketRef.current
    if (!socket) {
      const currentUser = userRef.current
      await loadSocketClient(originRef.current)
      const client = window.io
      if (!client) throw new Error('The realtime call client is unavailable.')
      const token = await currentUser.getIdToken(false)
      if (userRef.current.uid !== currentUser.uid) throw new Error('The signed-in user changed during call setup.')
      socket = client(originRef.current, {
        auth: { token },
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: Infinity,
        transports: ['websocket', 'polling'],
        tryAllTransports: true,
      })
      socketRef.current = socket
      socketCallbackRef.current?.(socket)
    }
    if (socket.connected) return socket
    await new Promise<void>((resolve, reject) => {
      let lastError: Error | null = null
      const cleanup = () => {
        clearTimeout(timeout)
        socket?.off?.('connect', onConnect)
        socket?.off?.('connect_error', onError)
      }
      const onConnect = () => {
        cleanup()
        resolve()
      }
      const onError = (error: Error) => {
        lastError = error
      }
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error(`Call signaling did not connect within 15 seconds${lastError ? ` (${lastError.message})` : ''}.`))
      }, 15_000)
      socket?.on('connect', onConnect)
      socket?.on('connect_error', onError)
      socket?.connect()
      if (socket?.connected) onConnect()
    })
    return socket
  }, [])

  const sendSignal = useCallback(async (
    call: CallSession,
    targetUid: string,
    signal: CallSignalPayload['signal'],
  ): Promise<void> => {
    const socket = socketRef.current
    if (!socket?.connected) throw new Error('Call signaling is disconnected. Reconnect and try again.')
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Call signaling timed out.')), 10_000)
      socket.emit('call:signal', {
        conversationId: call.conversationId,
        callId: call.callId,
        targetUid,
        signal,
      }, result => {
        clearTimeout(timeout)
        if (result.success) resolve()
        else reject(new Error(result.message || 'Call signaling was denied.'))
      })
    })
  }, [])

  const createPeer = useCallback((call: CallSession, uid: string): PeerState => {
    const existing = call.peerConnections.get(uid)
    if (existing) return existing
    const peerConnection = new RTCPeerConnection({ iceServers: call.iceServers })
    const peer: PeerState = {
      peerConnection,
      remoteStream: new MediaStream(),
      pendingIceCandidates: [],
      offerStarted: false,
    }
    call.peerConnections.set(uid, peer)
    call.localStream.getTracks().forEach(track => peerConnection.addTrack(track, call.localStream))
    peerConnection.addEventListener('track', event => {
      if (event.streams[0]) {
        peer.remoteStream = event.streams[0]
      } else if (!peer.remoteStream.getTracks().some(track => track.id === event.track.id)) {
        peer.remoteStream.addTrack(event.track)
      }
      refresh()
    })
    peerConnection.addEventListener('icecandidate', event => {
      if (!event.candidate || activeRef.current?.callId !== call.callId) return
      void sendSignal(call, uid, { candidate: event.candidate.toJSON() }).catch(error => {
        console.error('[messages] Unable to send WebRTC ICE candidate.', {
          callId: call.callId,
          peerUid: uid,
          message: errorMessage(error, 'Unknown signaling error.'),
        })
      })
    })
    peerConnection.addEventListener('connectionstatechange', () => {
      if (activeRef.current?.callId !== call.callId) return
      if (peerConnection.connectionState === 'connected') {
        if (!call.connectedAt) {
          call.connectedAt = Date.now()
          call.durationTimer = setInterval(refresh, 1000)
        }
        call.status = 'accepted'
        refresh()
      } else if (peerConnection.connectionState === 'failed') {
        console.error('[messages] WebRTC peer connection failed.', {
          callId: call.callId,
          peerUid: uid,
          state: peerConnection.connectionState,
        })
      }
    })
    return peer
  }, [refresh, sendSignal])

  const applySignal = useCallback(async (packet: CallSignalPacket): Promise<void> => {
    const call = activeRef.current
    if (!call || call.callId !== packet.call_id || call.conversationId !== packet.conversation_id) return
    if (!call.participants.some(person =>
      person.firebase_uid === packet.from_uid && person.status === 'accepted'
    )) return
    const peer = createPeer(call, packet.from_uid)
    const connection = peer.peerConnection
    const signal = packet.signal
    if ('type' in signal && signal.type === 'offer') {
      await connection.setRemoteDescription(signal)
      for (const candidate of peer.pendingIceCandidates.splice(0)) {
        await connection.addIceCandidate(candidate)
      }
      const answer = await connection.createAnswer()
      await connection.setLocalDescription(answer)
      if (connection.localDescription) {
        await sendSignal(call, packet.from_uid, {
          type: connection.localDescription.type,
          sdp: connection.localDescription.sdp || '',
        })
      }
    } else if ('type' in signal && signal.type === 'answer') {
      await connection.setRemoteDescription(signal)
      for (const candidate of peer.pendingIceCandidates.splice(0)) {
        await connection.addIceCandidate(candidate)
      }
    } else if ('candidate' in signal) {
      if (connection.remoteDescription) await connection.addIceCandidate(signal.candidate)
      else peer.pendingIceCandidates.push(signal.candidate)
    }
  }, [createPeer, sendSignal])

  const applyPendingSignals = useCallback(async (call: CallSession): Promise<void> => {
    const queued = pendingSignalsRef.current.get(call.callId) || []
    pendingSignalsRef.current.delete(call.callId)
    const deferred: PendingCallSignal[] = []
    for (const { packet } of queued) {
      const accepted = call.participants.some(person =>
        person.firebase_uid === packet.from_uid && person.status === 'accepted'
      )
      if (call.callRoomJoined && accepted) await applySignal(packet)
      else deferred.push({ packet })
    }
    if (deferred.length) pendingSignalsRef.current.set(call.callId, deferred)
  }, [applySignal])

  const syncPeers = useCallback(async (
    call: CallSession,
    participants: MessageCallParticipant[],
  ): Promise<void> => {
    if (activeRef.current?.callId !== call.callId) return
    call.participants = participants
    const acceptedUids = new Set(participants
      .filter(person => person.status === 'accepted')
      .map(person => person.firebase_uid))
    call.peerConnections.forEach((peer, uid) => {
      if (!acceptedUids.has(uid)) {
        peer.peerConnection.close()
        call.peerConnections.delete(uid)
      }
    })
    refresh()
    for (const uid of acceptedUids) {
      if (uid === userRef.current.uid) continue
      const peer = createPeer(call, uid)
      if (userRef.current.uid < uid && !peer.offerStarted) {
        peer.offerStarted = true
        const offer = await peer.peerConnection.createOffer()
        await peer.peerConnection.setLocalDescription(offer)
        if (peer.peerConnection.localDescription) {
          await sendSignal(call, uid, {
            type: peer.peerConnection.localDescription.type,
            sdp: peer.peerConnection.localDescription.sdp || '',
          })
        }
      }
    }
  }, [createPeer, refresh, sendSignal])

  const joinCallRoom = useCallback(async (call: CallSession): Promise<void> => {
    const socket = socketRef.current
    if (!socket?.connected) throw new Error('Realtime call signaling is not connected.')
    const result = await new Promise<CallAck>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Joining the call room timed out.')), 10_000)
      socket.emit('call:join', call.callId, ack => {
        clearTimeout(timeout)
        resolve(ack)
      })
    })
    if (!result.success) throw new Error(result.message || 'You could not join this call.')
    call.conversationId = result.conversationId || call.conversationId
    call.iceServers = result.iceServers || call.iceServers
    call.participants = result.participants || call.participants
    call.callRoomJoined = true
  }, [])

  const clearSession = useCallback((call: CallSession, leaveRoom: boolean) => {
    if (leaveRoom) socketRef.current?.emit('call:leave', call.callId)
    if (call.ringingTimer !== null) clearTimeout(call.ringingTimer)
    if (call.durationTimer !== null) clearInterval(call.durationTimer)
    call.peerConnections.forEach(peer => peer.peerConnection.close())
    call.peerConnections.clear()
    call.localStream.getTracks().forEach(track => track.stop())
    pendingSignalsRef.current.delete(call.callId)
    stopRingtone()
  }, [stopRingtone])

  const hangUp = useCallback(async (): Promise<void> => {
    const call = activeRef.current
    if (!call) return
    clearSession(call, true)
    setActiveCall(null)
    try {
      const endpoint = call.caller
        ? `/messages/conversations/${encodeURIComponent(call.conversationId)}/calls/${encodeURIComponent(call.callId)}/end`
        : `/messages/calls/${encodeURIComponent(call.callId)}/leave`
      await request(endpoint, 'POST', {})
    } catch (error) {
      reportError(error, 'end call')
    }
  }, [clearSession, reportError, request, setActiveCall])

  const finishCallWithoutRequest = useCallback((call: CallSession) => {
    clearSession(call, true)
    setActiveCall(null)
  }, [clearSession, setActiveCall])

  const handleCallUpdate = useCallback((call: MessageCall | undefined): void => {
    if (!call || (call.caller_uid !== userRef.current.uid && call.callee_uid !== userRef.current.uid)) return
    const active = activeRef.current
    if (active?.callId === call.call_id) {
      if (call.status === 'accepted') {
        active.status = 'accepted'
        active.ringExpiresAt = 0
        if (active.ringingTimer !== null) clearTimeout(active.ringingTimer)
        active.ringingTimer = null
        stopRingtone()
        refresh()
      } else if (['declined', 'missed', 'ended'].includes(call.status)) {
        finishCallWithoutRequest(active)
      }
      return
    }
    if (incomingRef.current?.call_id === call.call_id && call.status !== 'ringing') {
      setIncomingCall(null)
      if (incomingTimerRef.current !== null) clearTimeout(incomingTimerRef.current)
      incomingTimerRef.current = null
      stopRingtone()
      refresh()
      return
    }
    if (!active && !incomingRef.current && call.callee_uid === userRef.current.uid &&
      call.status === 'ringing') {
      setIncomingCall(call)
      if (incomingTimerRef.current !== null) clearTimeout(incomingTimerRef.current)
      incomingTimerRef.current = setTimeout(() => {
        if (incomingRef.current?.call_id === call.call_id) {
          setIncomingCall(null)
          stopRingtone()
        }
      }, 45_000)
    }
  }, [finishCallWithoutRequest, refresh, setIncomingCall, stopRingtone])

  const queueSignal = useCallback((packet: CallSignalPacket) => {
    const signals = pendingSignalsRef.current.get(packet.call_id) || []
    if (signals.length < 64) signals.push({ packet })
    pendingSignalsRef.current.set(packet.call_id, signals)
  }, [])

  const handleSignal = useCallback(async (packet: CallSignalPacket): Promise<void> => {
    const call = activeRef.current
    if (!packet?.call_id || !packet.signal) return
    if (call?.callId === packet.call_id && call.callRoomJoined &&
      call.participants.some(person =>
        person.firebase_uid === packet.from_uid && person.status === 'accepted'
      )) {
      await applySignal(packet)
      return
    }
    if (call?.callId === packet.call_id ||
      incomingRef.current?.call_id === packet.call_id ||
      acceptingRef.current === packet.call_id) queueSignal(packet)
  }, [applySignal, queueSignal])

  const handleParticipantUpdate = useCallback((update: {
    call_id: string
    call_status?: string
    participants?: MessageCallParticipant[]
  }) => {
    if (incomingRef.current?.call_id === update.call_id &&
      update.call_status && ['ended', 'declined', 'missed'].includes(update.call_status)) {
      setIncomingCall(null)
      if (incomingTimerRef.current !== null) clearTimeout(incomingTimerRef.current)
      incomingTimerRef.current = null
      stopRingtone()
    }
    const call = activeRef.current
    if (!call || call.callId !== update.call_id) return
    if (update.call_status && ['ended', 'declined', 'missed'].includes(update.call_status)) {
      finishCallWithoutRequest(call)
      return
    }
    if (update.call_status === 'accepted' && call.status !== 'accepted') {
      call.status = 'accepted'
      call.ringExpiresAt = 0
      if (call.ringingTimer !== null) clearTimeout(call.ringingTimer)
      call.ringingTimer = null
      stopRingtone()
    }
    void syncPeers(call, update.participants || [])
      .then(() => applyPendingSignals(call))
      .catch(error => {
        reportError(error, 'update call participants')
        void hangUp()
      })
  }, [applyPendingSignals, finishCallWithoutRequest, hangUp, reportError, setIncomingCall, stopRingtone, syncPeers])

  const startCall = useCallback(async (mediaType: MessageCallMediaType): Promise<void> => {
    const conversationNow = conversationRef.current
    if (!conversationNow) {
      reportError(new Error('Select a conversation before starting a call.'), 'start call')
      return
    }
    if (activeRef.current || incomingRef.current || startingRef.current) {
      reportError(new Error('Finish the current call invitation before starting another call.'), 'start call')
      return
    }
    const sequence = ++startSequenceRef.current
    startingRef.current = true
    setStartingCall(mediaType)
    setCallError(null)
    let localStream: MediaStream | null = null
    let createdCallId: string | null = null
    const conversationId = conversationNow.id
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
        throw new Error('WebRTC calling is unavailable in this browser. Use a supported browser over HTTPS.')
      }
      await ensureConnected()
      if (sequence !== startSequenceRef.current) return
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mediaType === 'video' })
      if (sequence !== startSequenceRef.current) {
        localStream.getTracks().forEach(track => track.stop())
        localStream = null
        return
      }
      const result = await request<{
        call: MessageCall & {
          peer_uid: string
          peer_name: string
          ice_servers: RTCIceServer[]
          participants: MessageCallParticipant[]
        }
      }>(`/messages/conversations/${encodeURIComponent(conversationId)}/calls`, 'POST', {
        callType: mediaType,
      })
      const responseCall = result.call
      createdCallId = responseCall?.call_id || null
      if (sequence !== startSequenceRef.current) {
        localStream.getTracks().forEach(track => track.stop())
        localStream = null
        if (createdCallId) {
          await request(
            `/messages/conversations/${encodeURIComponent(conversationId)}/calls/${encodeURIComponent(createdCallId)}/end`,
            'POST',
            {},
          ).catch(error => console.error('[messages] Unable to end cancelled call setup.', error))
        }
        return
      }
      if (!responseCall?.call_id || !responseCall.peer_uid ||
        !Array.isArray(responseCall.ice_servers) ||
        !Number.isFinite(Date.parse(responseCall.ring_expires_at))) {
        throw new Error('The call service returned incomplete WebRTC setup information.')
      }
      const session: CallSession = {
        callId: responseCall.call_id,
        conversationId,
        callType: mediaType,
        status: responseCall.status,
        caller: true,
        peerName: responseCall.peer_name || conversationNow.name || 'Teammate',
        localStream,
        participants: responseCall.participants || [],
        peerConnections: new Map(),
        iceServers: responseCall.ice_servers,
        connectedAt: null,
        isMuted: false,
        isCameraOff: false,
        ringExpiresAt: Date.parse(responseCall.ring_expires_at),
        durationTimer: null,
        ringingTimer: null,
        callRoomJoined: false,
      }
      localStream = null
      setActiveCall(session)
      void ensureRingtoneContext()
      await joinCallRoom(session)
      await syncPeers(session, session.participants)
      await applyPendingSignals(session)
      if (getActiveCall()?.callId !== responseCall.call_id) return
      session.ringingTimer = setTimeout(() => {
        if (getActiveCall()?.callId !== responseCall.call_id || session.status !== 'ringing') return
        void request(
          `/messages/conversations/${encodeURIComponent(conversationId)}/calls/${encodeURIComponent(responseCall.call_id)}/missed`,
          'POST',
          {},
        ).then(() => finishCallWithoutRequest(session)).catch(error => {
          reportError(error, 'mark call as missed')
          finishCallWithoutRequest(session)
        })
      }, Math.max(0, session.ringExpiresAt - Date.now()) + 500)
    } catch (error) {
      if (sequence === startSequenceRef.current) {
        const failure = reportError(error, 'start call')
        setCallError(failure)
      }
      if (activeRef.current) finishCallWithoutRequest(activeRef.current)
      else if (createdCallId) {
        await request(
          `/messages/conversations/${encodeURIComponent(conversationId)}/calls/${encodeURIComponent(createdCallId)}/end`,
          'POST',
          {},
        ).catch(endError => console.error('[messages] Unable to clean up failed call setup.', endError))
      }
      localStream?.getTracks().forEach(track => track.stop())
    } finally {
      if (sequence === startSequenceRef.current) {
        startingRef.current = false
        setStartingCall(null)
      }
    }
  }, [
    applyPendingSignals, ensureConnected, ensureRingtoneContext, finishCallWithoutRequest,
    joinCallRoom, reportError, request, setActiveCall, syncPeers,
  ])

  const acceptIncomingCall = useCallback(async (): Promise<void> => {
    const call = incomingRef.current
    if (!call || activeRef.current || acceptingRef.current) return
    acceptingRef.current = call.call_id
    stopRingtone()
    let localStream: MediaStream | null = null
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
        throw new Error('WebRTC calling is unavailable in this browser. Use a supported browser over HTTPS.')
      }
      await ensureConnected()
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: call.call_type === 'video',
      })
      const endpoint = call.added_participant
        ? `/messages/conversations/${encodeURIComponent(call.conversation_id)}/calls/${encodeURIComponent(call.call_id)}/join`
        : `/messages/conversations/${encodeURIComponent(call.conversation_id)}/calls/${encodeURIComponent(call.call_id)}/accept`
      const result = await request<{
        call?: MessageCall
        participants?: MessageCallParticipant[]
        ice_servers?: RTCIceServer[]
      }>(endpoint, 'POST', {})
      const iceServers = result.ice_servers || result.call?.ice_servers
      if (!Array.isArray(iceServers)) {
        throw new Error('The call service returned incomplete WebRTC setup information.')
      }
      const session: CallSession = {
        callId: call.call_id,
        conversationId: call.conversation_id,
        callType: call.call_type,
        status: 'accepted',
        caller: call.caller_uid === userRef.current.uid,
        peerName: call.caller_name || 'Teammate',
        localStream,
        participants: result.participants || [],
        peerConnections: new Map(),
        iceServers,
        connectedAt: null,
        isMuted: false,
        isCameraOff: false,
        ringExpiresAt: 0,
        durationTimer: null,
        ringingTimer: null,
        callRoomJoined: false,
      }
      localStream = null
      setIncomingCall(null)
      if (incomingTimerRef.current !== null) clearTimeout(incomingTimerRef.current)
      incomingTimerRef.current = null
      setActiveCall(session)
      await joinCallRoom(session)
      await syncPeers(session, session.participants)
      await applyPendingSignals(session)
    } catch (error) {
      const activeCallNow = getActiveCall()
      if (activeCallNow?.callId === call.call_id) finishCallWithoutRequest(activeCallNow)
      else {
        localStream?.getTracks().forEach(track => track.stop())
        const action = call.added_participant ? 'decline-invite' : 'end'
        await request(
          `/messages/conversations/${encodeURIComponent(call.conversation_id)}/calls/${encodeURIComponent(call.call_id)}/${action}`,
          'POST',
          {},
        ).catch(endError => console.error('[messages] Unable to clean up failed call setup.', endError))
        if (incomingRef.current?.call_id === call.call_id) setIncomingCall(null)
      }
      setCallError(reportError(error, 'accept call'))
    } finally {
      acceptingRef.current = null
    }
  }, [
    applyPendingSignals, ensureConnected, finishCallWithoutRequest, joinCallRoom,
    reportError, request, setActiveCall, setIncomingCall, stopRingtone, syncPeers,
  ])

  const declineIncomingCall = useCallback(async (): Promise<void> => {
    const call = incomingRef.current
    if (!call) return
    setIncomingCall(null)
    stopRingtone()
    pendingSignalsRef.current.delete(call.call_id)
    if (incomingTimerRef.current !== null) clearTimeout(incomingTimerRef.current)
    incomingTimerRef.current = null
    try {
      const action = call.added_participant ? 'decline-invite' : 'decline'
      await request(
        `/messages/conversations/${encodeURIComponent(call.conversation_id)}/calls/${encodeURIComponent(call.call_id)}/${action}`,
        'POST',
        {},
      )
    } catch (error) {
      setCallError(reportError(error, 'decline call'))
    }
  }, [reportError, request, setIncomingCall, stopRingtone])

  const toggleMicrophone = useCallback(() => {
    const call = activeRef.current
    if (!call) return
    call.isMuted = !call.isMuted
    call.localStream.getAudioTracks().forEach(track => { track.enabled = !call.isMuted })
    refresh()
  }, [refresh])

  const toggleCamera = useCallback(() => {
    const call = activeRef.current
    if (!call) return
    call.isCameraOff = !call.isCameraOff
    call.localStream.getVideoTracks().forEach(track => { track.enabled = !call.isCameraOff })
    refresh()
  }, [refresh])

  const inviteParticipants = useCallback(async (firebaseUids: string[]): Promise<void> => {
    const call = activeRef.current
    const currentConversation = conversationRef.current
    if (!call || !currentConversation?.projectId || !call.caller) return
    const uids = [...new Set(firebaseUids)].filter(uid =>
      uid && uid !== userRef.current.uid && !call.participants.some(person => person.firebase_uid === uid)
    )
    if (!uids.length || uids.length > 3) {
      reportError(new Error('Choose one to three eligible project members to invite.'), 'invite call participants')
      return
    }
    setInvitePending(true)
    try {
      await request(
        `/messages/conversations/${encodeURIComponent(call.conversationId)}/calls/${encodeURIComponent(call.callId)}/invite`,
        'POST',
        { projectId: currentConversation.projectId, participantFirebaseUids: uids },
      )
      setInvitePickerOpen(false)
    } catch (error) {
      setCallError(reportError(error, 'invite call participants'))
    } finally {
      setInvitePending(false)
    }
  }, [reportError, request])

  const openInvitePicker = useCallback(() => setInvitePickerOpen(true), [])
  const closeInvitePicker = useCallback(() => setInvitePickerOpen(false), [])
  const dismissCallError = useCallback(() => setCallError(null), [])

  useEffect(() => {
    let disposed = false
    let socket: RealtimeSocket | null = null
    let refreshedAuth = false
    const setup = async () => {
      try {
        await loadSocketClient(originRef.current)
        if (disposed || !window.io) return
        const token = await userRef.current.getIdToken(false)
        if (disposed) return
        socket = window.io(originRef.current, {
          auth: { token },
          autoConnect: false,
          reconnection: true,
          reconnectionAttempts: Infinity,
          transports: ['websocket', 'polling'],
          tryAllTransports: true,
        })
        socketRef.current = socket
        socket.on('connect', () => { refreshedAuth = false })
        socket.on('disconnect', reason => {
          const currentCall = activeRef.current
          if (currentCall) {
            currentCall.callRoomJoined = false
            console.warn('[messages] Call signaling disconnected.', {
              callId: currentCall.callId,
              reason,
            })
          }
        })
        socket.on('connect_error', error => {
          console.error('[messages] Authenticated call signaling failed.', {
            message: error.message,
            uid: userRef.current.uid,
          })
          errorCallbackRef.current(error, 'connect to realtime calls')
          if (!refreshedAuth && /authentication/i.test(error.message)) {
            refreshedAuth = true
            void userRef.current.getIdToken(true).then(nextToken => {
              if (!disposed && socket) {
                socket.auth = { token: nextToken }
                socket.connect()
              }
            }).catch(refreshError => {
              errorCallbackRef.current(asError(refreshError, 'Could not refresh call authentication.'), 'refresh call authentication')
            })
          }
        })
        socket.on('call:updated', payload => handleCallUpdate(payload?.call))
        socket.on('call:participant-updated', handleParticipantUpdate)
        socket.on('call:signal', packet => {
          void handleSignal(packet).catch(error => {
            console.error('[messages] WebRTC call signaling failed.', {
              callId: packet?.call_id || null,
              message: errorMessage(error, 'Unknown signaling error.'),
            })
            if (activeRef.current?.callId === packet?.call_id) {
              const call = activeRef.current
              if (call) finishCallWithoutRequest(call)
              setCallError(asError(error, 'Call signaling failed.'))
            }
          })
        })
        socket.connect()
      } catch (error) {
        if (!disposed) {
          console.error('[messages] Unable to initialize call signaling.', error)
          errorCallbackRef.current(asError(error, 'Call signaling could not be initialized.'), 'initialize call signaling')
        }
      }
    }
    void setup()
    return () => {
      disposed = true
      if (incomingTimerRef.current !== null) clearTimeout(incomingTimerRef.current)
      incomingTimerRef.current = null
      const call = activeRef.current
      if (call) {
        clearSession(call, false)
        activeRef.current = null
      }
      incomingRef.current = null
      socket?.disconnect()
      socketCallbackRef.current?.(null)
      if (socketRef.current === socket) socketRef.current = null
      const ringtone = ringtoneRef.current
      if (ringtone) {
        stopRingtone()
        void ringtone.context.close().catch(error => {
          console.warn('[messages] Unable to close ringtone audio context.', error)
        })
        ringtoneRef.current = null
      }
    }
  }, [
    apiOrigin, clearSession, finishCallWithoutRequest, handleCallUpdate,
    handleParticipantUpdate, handleSignal, stopRingtone, user.uid,
  ])

  useEffect(() => {
    const shouldRing = Boolean(incomingCall ||
      (activeCall?.caller && activeCall.status === 'ringing'))
    if (!shouldRing) {
      stopRingtone()
      return
    }
    const context = ensureRingtoneContext()
    if (!context) return
    if (context.state === 'running') {
      playTone()
      const ringtone = ringtoneRef.current
      if (ringtone && ringtone.timer === null) {
        ringtone.timer = setInterval(() => {
          const stillRinging = Boolean(incomingRef.current ||
            (activeRef.current?.caller && activeRef.current.status === 'ringing'))
          if (stillRinging) playTone()
          else stopRingtone()
        }, 3200)
      }
    }
  }, [activeCall, ensureRingtoneContext, incomingCall, playTone, stopRingtone])

  useEffect(() => {
    const unlock = () => {
      const context = ensureRingtoneContext()
      if (context?.state === 'suspended') {
        void context.resume().then(playTone).catch(error => {
          console.warn('[messages] Call ringtone is unavailable until audio is enabled.', error)
        })
      } else {
        playTone()
      }
    }
    document.addEventListener('pointerdown', unlock)
    document.addEventListener('keydown', unlock)
    return () => {
      document.removeEventListener('pointerdown', unlock)
      document.removeEventListener('keydown', unlock)
    }
  }, [ensureRingtoneContext, playTone])

  return {
    activeCall,
    incomingCall,
    startingCall,
    callError,
    invitePickerOpen,
    invitePending,
    startCall,
    acceptIncomingCall,
    declineIncomingCall,
    hangUp,
    toggleMicrophone,
    toggleCamera,
    openInvitePicker,
    closeInvitePicker,
    inviteParticipants,
    dismissCallError,
  }
}

export { useMessageCalls }

export function MessageCalls(options: UseMessageCallsOptions) {
  const calls = useMessageCalls(options)
  const { activeCall, incomingCall, startingCall, callError } = calls
  const conversation = options.conversation
  const eligibleInvitees = (options.invitees || []).filter(member =>
    member.firebaseUid !== options.user.uid &&
    !activeCall?.participants.some(person => person.firebase_uid === member.firebaseUid)
  )

  return (
    <>
      {conversation && !activeCall && !incomingCall && (
        <div className={styles.launchActions} aria-label="Call actions">
          <button type="button" onClick={() => void calls.startCall('audio')} disabled={Boolean(startingCall)}>
            Voice call
          </button>
          <button type="button" onClick={() => void calls.startCall('video')} disabled={Boolean(startingCall)}>
            Video call
          </button>
        </div>
      )}
      {incomingCall && (
        <div className={styles.backdrop}>
          <section className={styles.dialog} role="dialog" aria-modal="true" aria-label="Incoming call">
            <div className={styles.avatar}>{incomingCall.caller_name.slice(0, 1) || '•'}</div>
            <h2>Incoming {incomingCall.call_type === 'video' ? 'video' : 'voice'} call</h2>
            <p>{incomingCall.caller_name || 'Teammate'}</p>
            <div className={styles.actions}>
              <button type="button" className={styles.decline} onClick={() => void calls.declineIncomingCall()}>
                Decline
              </button>
              <button type="button" className={styles.accept} onClick={() => void calls.acceptIncomingCall()}>
                Accept
              </button>
            </div>
          </section>
        </div>
      )}
      {startingCall && (
        <div className={styles.backdrop}>
          <section className={styles.dialog} role="dialog" aria-modal="true" aria-label="Starting call">
            <h2>Starting {startingCall === 'video' ? 'video' : 'voice'} call</h2>
            <p>Connecting to call service and requesting microphone access…</p>
          </section>
        </div>
      )}
      {activeCall && (
        <ActiveCallDialog
          call={activeCall}
          currentUid={options.user.uid}
          invitees={eligibleInvitees}
          calls={calls}
        />
      )}
      {calls.invitePickerOpen && activeCall && (
        <InviteParticipantsDialog
          invitees={eligibleInvitees}
          pending={calls.invitePending}
          onClose={calls.closeInvitePicker}
          onInvite={calls.inviteParticipants}
        />
      )}
      {callError && (
        <div className={styles.backdrop}>
          <section className={styles.dialog} role="alertdialog" aria-modal="true" aria-label="Call error">
            <h2>Call could not be completed</h2>
            <p>{callError.message}</p>
            <button type="button" onClick={calls.dismissCallError}>Close</button>
          </section>
        </div>
      )}
    </>
  )
}

function ActiveCallDialog({
  call,
  currentUid,
  invitees,
  calls,
}: {
  call: ActiveMessageCall
  currentUid: string
  invitees: MessageCallInvitee[]
  calls: UseMessageCallsResult
}) {
  const elapsed = call.connectedAt ? Math.max(0, Math.floor((Date.now() - call.connectedAt) / 1000)) : 0
  const duration = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`
  const localVideo = useCallback((node: HTMLVideoElement | null) => {
    if (node) node.srcObject = call.localStream
  }, [call.localStream])

  return (
    <div className={styles.backdrop}>
      <section className={`${styles.dialog} ${styles.active}`} role="dialog" aria-modal="true" aria-label={`${call.callType} call`}>
        <header className={styles.callHeader}>
          <div>
            <h2>{call.callType === 'video' ? 'Video' : 'Voice'} call</h2>
            <p>{call.status === 'ringing' ? 'Ringing…' : `Connected · ${duration}`}</p>
          </div>
        </header>
        <div className={`${styles.stage} ${call.callType === 'video' ? styles.videoStage : ''}`}>
          {call.callType === 'video' && (
            <div className={styles.participantTile}>
              <video ref={localVideo} autoPlay muted playsInline />
              <span>You</span>
            </div>
          )}
          {call.participants
            .filter(person => person.firebase_uid !== currentUid && ['accepted', 'ringing'].includes(person.status))
            .map(person => {
              const stream = call.peerConnections.get(person.firebase_uid)?.remoteStream || null
              return (
                <div className={styles.participantTile} key={person.firebase_uid}>
                  {call.callType === 'video'
                    ? <RemoteVideo stream={stream} />
                    : <RemoteAudio stream={stream} />}
                  <span>{person.display_name || 'Teammate'}{person.status === 'ringing' ? ' · Ringing…' : ''}</span>
                </div>
              )
            })}
          {call.participants.filter(person =>
            person.firebase_uid !== currentUid && ['accepted', 'ringing'].includes(person.status)
          ).length === 0 && <p className={styles.waiting}>Waiting for others to join…</p>}
        </div>
        <div className={styles.controls}>
          <button type="button" aria-pressed={call.isMuted} onClick={calls.toggleMicrophone}>
            {call.isMuted ? 'Unmute' : 'Mute'}
          </button>
          {call.callType === 'video' && (
            <button type="button" aria-pressed={call.isCameraOff} onClick={calls.toggleCamera}>
              {call.isCameraOff ? 'Turn camera on' : 'Turn camera off'}
            </button>
          )}
          {call.caller && invitees.length > 0 && (
            <button type="button" onClick={calls.openInvitePicker}>Add people</button>
          )}
          <button type="button" className={styles.decline} onClick={() => void calls.hangUp()}>
            {call.caller ? 'End call' : 'Leave call'}
          </button>
        </div>
      </section>
    </div>
  )
}

function RemoteVideo({ stream }: { stream: MediaStream | null }) {
  const attach = useCallback((node: HTMLVideoElement | null) => {
    if (node) node.srcObject = stream
  }, [stream])
  return <video ref={attach} autoPlay playsInline />
}

function RemoteAudio({ stream }: { stream: MediaStream | null }) {
  const attach = useCallback((node: HTMLAudioElement | null) => {
    if (node) {
      node.srcObject = stream
      void node.play().catch(error => {
        console.warn('[messages] Remote call audio awaits a user gesture.', error)
      })
    }
  }, [stream])
  return <audio ref={attach} autoPlay />
}

function InviteParticipantsDialog({
  invitees,
  pending,
  onClose,
  onInvite,
}: {
  invitees: MessageCallInvitee[]
  pending: boolean
  onClose: () => void
  onInvite: (firebaseUids: string[]) => Promise<void>
}) {
  const [selected, setSelected] = useState<string[]>([])
  return (
    <div className={styles.backdrop}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-label="Add participants">
        <h2>Add people to call</h2>
        {invitees.length
          ? (
            <select
              multiple
              aria-label="Project members to invite"
              value={selected}
              onChange={event => {
                setSelected(Array.from(event.currentTarget.selectedOptions, option => option.value).slice(0, 3))
              }}
            >
              {invitees.map(person => (
                <option key={person.firebaseUid} value={person.firebaseUid}>{person.name}</option>
              ))}
            </select>
          )
          : <p>No eligible project members are available.</p>}
        <div className={styles.actions}>
          <button type="button" onClick={onClose} disabled={pending}>Cancel</button>
          <button
            type="button"
            className={styles.accept}
            onClick={() => void onInvite(selected)}
            disabled={pending || selected.length === 0}
          >
            {pending ? 'Inviting…' : 'Invite'}
          </button>
        </div>
      </section>
    </div>
  )
}
