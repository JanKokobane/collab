import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { api, apiBaseUrl } from '../services/api';
import type { ChatAttachment, ChatMessage, Conversation } from '../types/dashboard';
import { getAvatarSource, getUserInitials, useDashboard } from './DashboardContext';

export interface TeammateRecord {
  firebaseUid: string;
  name: string;
  email: string;
  role: string;
  profileImage?: string;
  initials: string;
  tone?: string;
  isOnline: boolean;
  lastSeenAt?: string | null;
}

export interface NormalizedCallParticipant {
  firebaseUid: string;
  name: string;
  email?: string;
  initials: string;
  profileImage?: string;
  role?: string;
  isMuted?: boolean;
  isCameraOff?: boolean;
  joinedAt?: string;
}

export interface NormalizedCallRecord {
  callId: string;
  conversationId: string;
  projectId?: string | null;
  callType: 'audio' | 'video';
  status: 'ringing' | 'active' | 'ended' | 'missed' | 'declined' | string;
  initiatorUid: string;
  initiatorName: string;
  initiatorAvatar?: string;
  conversationName?: string;
  conversationType?: string;
  participants: NormalizedCallParticipant[];
  startedAt?: string | null;
  answeredAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number;
  isMissed?: boolean;
  missedReason?: string;
  endReason?: string;
  iceServers?: RTCIceServer[];
}

export interface RemotePeerMedia {
  firebaseUid: string;
  name: string;
  initials: string;
  profileImage?: string;
  stream: MediaStream | null;
  isMuted?: boolean;
  isCameraOff?: boolean;
  connectionState?: string;
}

export interface ActiveCallSession {
  call: NormalizedCallRecord;
  isOutgoing: boolean;
  startedAtMs: number | null;
  elapsedSeconds: number;
  isMuted: boolean;
  isCameraOff: boolean;
  statusText: string;
  canInvite: boolean;
}

interface MessagesCallContextValue {
  conversations: Conversation[];
  teammates: TeammateRecord[];
  activeConversationId: string | null;
  activeConversation: Conversation | null;
  messages: ChatMessage[];
  callHistory: NormalizedCallRecord[];
  hasOlderMessages: boolean;
  loadingConversations: boolean;
  loadingMessages: boolean;
  loadingOlderMessages: boolean;
  messagesError: string;
  presenceMap: Record<string, { isOnline: boolean; lastSeenAt?: string | null }>;
  selectConversation: (conversationId: string | null) => void;
  refreshConversations: (options?: { selectLatest?: boolean }) => Promise<Conversation[]>;
  loadOlderMessages: () => Promise<void>;
  sendMessage: (payload: {
    body: string;
    attachments?: ChatAttachment[];
    replyToId?: string | null;
    forwardedFrom?: { senderName?: string; conversationName?: string } | null;
  }) => Promise<ChatMessage | null>;
  editMessage: (messageId: string, body: string) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  togglePinMessage: (messageId: string, pinned: boolean) => Promise<void>;
  toggleDecisionMessage: (messageId: string, isDecision: boolean) => Promise<void>;
  deleteMessage: (messageId: string, scope: 'me' | 'everyone') => Promise<void>;
  forwardMessage: (message: ChatMessage, targetConversationId: string) => Promise<void>;
  createConversation: (payload: {
    projectId?: string | null;
    type: 'channel' | 'group' | 'direct' | 'dm';
    name?: string;
    memberFirebaseUids: string[];
  }) => Promise<Conversation | null>;
  clearConversation: (conversationId: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  summarizeConversation: (conversationId: string) => Promise<string>;
  linkTaskToMessage: (messageId: string, taskId: string, taskTitle?: string) => void;
  // Calls
  activeCall: ActiveCallSession | null;
  incomingCall: NormalizedCallRecord | null;
  startingCall: { callType: 'audio' | 'video'; conversationName: string } | null;
  callError: string;
  dismissCallError: () => void;
  localStream: MediaStream | null;
  remotePeers: RemotePeerMedia[];
  startCall: (callType: 'audio' | 'video', targetConversation?: Conversation | null) => Promise<void>;
  acceptIncomingCall: () => Promise<void>;
  declineIncomingCall: () => Promise<void>;
  hangUpCall: () => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => Promise<void>;
  inviteToCall: (participantUids: string[]) => Promise<void>;
  joinOngoingCall: (call: NormalizedCallRecord) => Promise<void>;
}

const MessagesCallContext = createContext<MessagesCallContextValue | null>(null);

declare global {
  interface Window {
    io?: (
      uri: string,
      opts?: Record<string, unknown>
    ) => {
      connected: boolean;
      auth: Record<string, unknown>;
      connect: () => void;
      disconnect: () => void;
      emit: (event: string, ...args: any[]) => void;
      on: (event: string, fn: (...args: any[]) => void) => void;
      off: (event: string, fn?: (...args: any[]) => void) => void;
    };
  }
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

let socketScriptPromise: Promise<void> | null = null;

function loadSocketIoClient(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.io) return Promise.resolve();
  if (socketScriptPromise) return socketScriptPromise;

  socketScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${apiBaseUrl}/socket.io/socket.io.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      socketScriptPromise = null;
      reject(new Error('Unable to load Socket.IO client'));
    };
    document.head.appendChild(script);
  });
  return socketScriptPromise;
}

function normalizeAttachments(raw: unknown): ChatAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      ...item,
      id: typeof item.id === 'string' ? item.id : undefined,
      name: String(item.name || item.fileName || 'Attachment'),
      fileName: String(item.fileName || item.name || 'Attachment'),
      mimeType: String(item.mimeType || item.mime_type || item.type || 'application/octet-stream'),
      size: Number(item.size || 0),
      url: typeof item.url === 'string' ? item.url : undefined,
      dataUrl:
        typeof item.dataUrl === 'string'
          ? item.dataUrl
          : typeof item.data_url === 'string'
            ? item.data_url
            : typeof item.data === 'string'
              ? item.data
              : undefined,
      isVoiceNote: Boolean(item.isVoiceNote || item.is_voice_note),
      durationSeconds: Number(item.durationSeconds ?? item.duration_seconds ?? 0),
      waveformPeaks: Array.isArray(item.waveformPeaks || item.waveform_peaks)
        ? ((item.waveformPeaks || item.waveform_peaks) as number[])
        : undefined
    }));
}

function normalizeReactions(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object') return {};
  const result: Record<string, string[]> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([emoji, val]) => {
    if (Array.isArray(val)) {
      const uids = val.map((x) => String(x)).filter(Boolean);
      if (uids.length) result[emoji] = uids;
    } else if (typeof val === 'number' && val > 0) {
      result[emoji] = Array.from({ length: val }, (_, idx) => `u_${idx}`);
    }
  });
  return result;
}

export function normalizeChatMessage(raw: any): ChatMessage {
  const id = String(raw?.message_id || raw?.messageId || raw?.id || '');
  const convId = String(raw?.conversation_id || raw?.conversationId || '');
  const senderUid = String(
    raw?.sender_firebase_uid || raw?.senderFirebaseUid || raw?.senderId || ''
  );
  const replyRaw = raw?.reply_to || raw?.replyTo || null;
  const replyToId = raw?.reply_to_message_id || raw?.replyToMessageId || replyRaw?.id || null;
  const forwardedRaw = raw?.forwarded_from || raw?.forwardedFrom || null;

  return {
    ...raw,
    id,
    messageId: id,
    conversationId: convId,
    clientMessageId: raw?.client_message_id || raw?.clientMessageId,
    senderId: senderUid,
    senderFirebaseUid: senderUid,
    senderName: raw?.sender_name || raw?.senderName || raw?.senderEmail || 'Teammate',
    senderEmail: raw?.sender_email || raw?.senderEmail || '',
    senderAvatar: raw?.sender_profile_image || raw?.senderProfileImage || raw?.senderAvatar || '',
    senderProfileImage:
      raw?.sender_profile_image || raw?.senderProfileImage || raw?.senderAvatar || '',
    body: String(raw?.body ?? raw?.text ?? ''),
    attachments: normalizeAttachments(raw?.attachments),
    replyToMessageId: replyToId ? String(replyToId) : null,
    replyTo: replyRaw
      ? {
          id: String(replyRaw.message_id || replyRaw.id || replyToId || ''),
          senderName: replyRaw.sender_name || replyRaw.senderName || 'Teammate',
          body: String(replyRaw.body || '')
        }
      : null,
    forwardedFrom: forwardedRaw
      ? {
          senderName: forwardedRaw.sender_name || forwardedRaw.senderName || '',
          conversationName: forwardedRaw.conversation_name || forwardedRaw.conversationName || ''
        }
      : null,
    reactions: normalizeReactions(raw?.reactions),
    isPinned: Boolean(raw?.is_pinned ?? raw?.isPinned),
    isDecision: Boolean(raw?.is_decision ?? raw?.isDecision),
    linkedTaskId: raw?.linked_task_id || raw?.linkedTaskId || null,
    linkedProjectId: raw?.linked_project_id || raw?.linkedProjectId || null,
    linkedTaskTitle: raw?.linked_task_title || raw?.linkedTaskTitle || null,
    readBy: Array.isArray(raw?.read_by || raw?.readBy) ? raw.read_by || raw.readBy : [],
    readAt: raw?.read_at || raw?.readAt || null,
    editedAt: raw?.edited_at || raw?.editedAt || null,
    deletedForEveryone: Boolean(raw?.is_deleted || raw?.deleted_for_everyone || raw?.deletedForEveryone),
    createdAt: String(raw?.created_at || raw?.createdAt || new Date().toISOString())
  };
}

export function normalizeConversation(raw: any): Conversation {
  const id = String(raw?.conversation_id || raw?.conversationId || raw?.id || '');
  const type = String(raw?.conversation_type || raw?.type || 'channel').toLowerCase();
  const membersRaw = Array.isArray(raw?.members)
    ? raw.members
    : Array.isArray(raw?.participants)
      ? raw.participants
      : [];
  const participants = membersRaw.map((m: any) => {
    const uid = String(m?.firebase_uid || m?.firebaseUid || m?.uid || m?.id || '');
    const name = String(m?.name || m?.displayName || m?.email || 'Teammate');
    return {
      ...m,
      id: uid,
      uid,
      firebaseUid: uid,
      name,
      email: String(m?.email || ''),
      avatar: m?.profile_image || m?.profileImage || m?.photoURL || m?.avatar || '',
      profileImage: m?.profile_image || m?.profileImage || m?.photoURL || m?.avatar || '',
      initials: m?.initials || getUserInitials(name),
      tone: m?.tone || 'teal',
      role: m?.role || 'Member',
      isOnline: Boolean(m?.is_online ?? m?.isOnline),
      lastSeenAt: m?.last_seen_at || m?.lastSeenAt || null
    };
  });

  return {
    ...raw,
    id,
    conversationId: id,
    type,
    name: String(raw?.name || raw?.title || 'Conversation'),
    title: String(raw?.title || raw?.name || 'Conversation'),
    projectId: raw?.project_id || raw?.projectId || null,
    participants,
    memberUids: Array.isArray(raw?.member_uids || raw?.memberUids)
      ? raw.member_uids || raw.memberUids
      : participants.map((p: any) => p.firebaseUid).filter(Boolean),
    unreadCount: Number(raw?.unread_count ?? raw?.unreadCount ?? 0),
    lastMessageText: String(raw?.latest_message_body ?? raw?.last_message_text ?? raw?.lastMessageText ?? ''),
    lastMessageAt: String(
      raw?.latest_message_created_at || raw?.last_message_at || raw?.lastMessageAt || raw?.updated_at || ''
    )
  };
}

export function normalizeCallRecord(raw: any): NormalizedCallRecord {
  const callId = String(raw?.call_id || raw?.callId || raw?.id || '');
  const rawType = String(raw?.call_type || raw?.callType || 'audio').toLowerCase();
  const callType: 'audio' | 'video' = rawType === 'video' ? 'video' : 'audio';
  const participantsRaw = Array.isArray(raw?.participants) ? raw.participants : [];
  const participants: NormalizedCallParticipant[] = participantsRaw.map((p: any) => {
    const uid = String(p?.firebase_uid || p?.firebaseUid || p?.userId || p?.uid || '');
    const name = String(p?.name || p?.email || 'Teammate');
    return {
      firebaseUid: uid,
      name,
      email: p?.email || '',
      initials: p?.initials || getUserInitials(name),
      profileImage: p?.profile_image || p?.profileImage || p?.avatar || '',
      role: p?.role || '',
      isMuted: Boolean(p?.is_muted ?? p?.muted),
      isCameraOff: Boolean(p?.is_camera_off ?? p?.cameraOff),
      joinedAt: p?.joined_at || p?.joinedAt
    };
  });

  const startedAt = raw?.started_at || raw?.startedAt || raw?.created_at || null;
  const endedAt = raw?.ended_at || raw?.endedAt || null;
  let durationSeconds = Number(raw?.duration_seconds ?? raw?.durationSeconds ?? 0);
  if (!durationSeconds && startedAt && endedAt) {
    const startMs = new Date(startedAt).getTime();
    const endMs = new Date(endedAt).getTime();
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      durationSeconds = Math.round((endMs - startMs) / 1000);
    }
  }
  const status = String(raw?.status || 'ringing').toLowerCase();

  return {
    callId,
    conversationId: String(raw?.conversation_id || raw?.conversationId || ''),
    projectId: raw?.project_id || raw?.projectId || null,
    callType,
    status,
    initiatorUid: String(raw?.initiator_firebase_uid || raw?.initiatorUid || raw?.initiatorId || ''),
    initiatorName: String(raw?.initiator_name || raw?.initiatorName || 'Teammate'),
    initiatorAvatar: raw?.initiator_profile_image || raw?.initiatorAvatar || '',
    conversationName: raw?.conversation_name || raw?.conversationName || '',
    conversationType: raw?.conversation_type || raw?.conversationType || '',
    participants,
    startedAt,
    answeredAt: raw?.answered_at || raw?.answeredAt || null,
    endedAt,
    durationSeconds,
    isMissed: status === 'missed' || status === 'declined',
    missedReason: raw?.missed_reason || raw?.missedReason || '',
    endReason: raw?.end_reason || raw?.endReason || '',
    iceServers: Array.isArray(raw?.ice_servers || raw?.iceServers)
      ? raw.ice_servers || raw.iceServers
      : undefined
  };
}

export const MessagesCallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    firebaseUser,
    authReady,
    currentUser,
    activeView,
    projects,
    accessibleMembers,
    pendingMessageContext,
    clearPendingMessageContext,
    setMessagesUnreadCount,
    showDashboardToast,
    collabSettings
  } = useDashboard();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [callHistory, setCallHistory] = useState<NormalizedCallRecord[]>([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [olderMessagesCursor, setOlderMessagesCursor] = useState<string | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [messagesError, setMessagesError] = useState('');
  const [presenceMap, setPresenceMap] = useState<
    Record<string, { isOnline: boolean; lastSeenAt?: string | null }>
  >({});

  // Call state
  const [activeCall, setActiveCall] = useState<ActiveCallSession | null>(null);
  const [incomingCall, setIncomingCall] = useState<NormalizedCallRecord | null>(null);
  const [startingCall, setStartingCall] = useState<{
    callType: 'audio' | 'video';
    conversationName: string;
  } | null>(null);
  const [callError, setCallError] = useState('');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<RemotePeerMedia[]>([]);

  const socketRef = useRef<ReturnType<NonNullable<typeof window.io>> | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  activeConversationIdRef.current = activeConversationId;
  const activeViewRef = useRef(activeView);
  activeViewRef.current = activeView;
  const conversationsRef = useRef<Conversation[]>([]);
  conversationsRef.current = conversations;
  const activeCallRef = useRef<ActiveCallSession | null>(null);
  activeCallRef.current = activeCall;
  const incomingCallRef = useRef<NormalizedCallRecord | null>(null);
  incomingCallRef.current = incomingCall;
  const localStreamRef = useRef<MediaStream | null>(null);
  localStreamRef.current = localStream;

  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const ringTimeoutRef = useRef<number | null>(null);
  const ringAudioRef = useRef<HTMLAudioElement | null>(null);
  const ringSynthStopRef = useRef<(() => void) | null>(null);
  const missedCallRetryTimerRef = useRef<number | null>(null);

  const currentUid = firebaseUser?.uid || currentUser?.uid || '';

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || null,
    [conversations, activeConversationId]
  );

  // Compute teammates merging project members, accessibleMembers, and conversation participants + live presence
  const teammates = useMemo<TeammateRecord[]>(() => {
    const map = new Map<string, TeammateRecord>();
    const addPerson = (raw: any) => {
      const uid = String(raw?.firebaseUid || raw?.firebase_uid || raw?.uid || '').trim();
      if (!uid || uid === currentUid) return;
      const existing = map.get(uid);
      const presence = presenceMap[uid];
      const name = String(raw?.name || raw?.displayName || existing?.name || raw?.email || 'Teammate');
      const isOnline =
        presence !== undefined
          ? presence.isOnline
          : Boolean(raw?.isOnline ?? raw?.is_online ?? existing?.isOnline);
      const lastSeenAt =
        presence?.lastSeenAt ?? raw?.lastSeenAt ?? raw?.last_seen_at ?? existing?.lastSeenAt ?? null;
      map.set(uid, {
        firebaseUid: uid,
        name,
        email: String(raw?.email || existing?.email || ''),
        role: String(raw?.role || existing?.role || 'Member'),
        profileImage: getAvatarSource(raw) || existing?.profileImage || '',
        initials: raw?.initials || existing?.initials || getUserInitials(name),
        tone: raw?.tone || existing?.tone || 'teal',
        isOnline,
        lastSeenAt
      });
    };

    projects.forEach((p) => {
      if (p.creatorFirebaseUid) {
        addPerson({
          firebaseUid: p.creatorFirebaseUid,
          name: p.creatorName,
          email: p.creatorEmail,
          initials: p.creatorInitials,
          profileImage: p.creatorProfileImage,
          tone: p.creatorTone,
          role: 'Project Owner'
        });
      }
      (p.acceptedMembers || []).forEach(addPerson);
    });
    accessibleMembers.forEach(addPerson);
    conversations.forEach((conv) => {
      (conv.participants || []).forEach(addPerson);
    });

    return [...map.values()].sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [projects, accessibleMembers, conversations, currentUid, presenceMap]);

  // Update total unread count badge in DashboardContext whenever conversations change
  useEffect(() => {
    const total = conversations.reduce((sum, c) => sum + (Number(c.unreadCount) || 0), 0);
    setMessagesUnreadCount(total);
  }, [conversations, setMessagesUnreadCount]);

  // Ringtone helpers
  const stopRingtone = useCallback(() => {
    if (ringAudioRef.current) {
      try {
        ringAudioRef.current.pause();
        ringAudioRef.current.currentTime = 0;
      } catch {
        // ignore
      }
      ringAudioRef.current = null;
    }
    if (ringSynthStopRef.current) {
      ringSynthStopRef.current();
      ringSynthStopRef.current = null;
    }
  }, []);

  const startRingtone = useCallback(() => {
    stopRingtone();
    if (!collabSettings.soundNotifs) return;
    try {
      const audio = new Audio('/images/microsoft_ringtone.mp3');
      audio.loop = true;
      audio.volume = 0.72;
      ringAudioRef.current = audio;
      audio.play().catch(() => {
        // Browser autoplay fallback synth chime
        try {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (!AudioCtx) return;
          const ctx = new AudioCtx();
          let stopped = false;
          const playPattern = () => {
            if (stopped) return;
            const now = ctx.currentTime;
            [523.25, 659.25, 783.99].forEach((freq, i) => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = 'sine';
              osc.frequency.setValueAtTime(freq, now + i * 0.14);
              gain.gain.setValueAtTime(0.08, now + i * 0.14);
              gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.14 + 0.3);
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.start(now + i * 0.14);
              osc.stop(now + i * 0.14 + 0.32);
            });
          };
          playPattern();
          const timer = window.setInterval(playPattern, 2400);
          ringSynthStopRef.current = () => {
            stopped = true;
            window.clearInterval(timer);
            ctx.close().catch(() => {});
          };
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }
  }, [collabSettings.soundNotifs, stopRingtone]);

  // WebRTC cleanup helper
  const cleanupWebRtc = useCallback(() => {
    if (ringTimeoutRef.current) {
      window.clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
    if (missedCallRetryTimerRef.current) {
      window.clearTimeout(missedCallRetryTimerRef.current);
      missedCallRetryTimerRef.current = null;
    }
    stopRingtone();
    peerConnectionsRef.current.forEach((pc) => {
      try {
        pc.close();
      } catch {
        // ignore
      }
    });
    peerConnectionsRef.current.clear();
    pendingIceCandidatesRef.current.clear();
    remoteStreamsRef.current.clear();
    setRemotePeers([]);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      setLocalStream(null);
    }
  }, [stopRingtone]);

  const markConversationRead = useCallback(async (conversationId: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c))
    );
    try {
      await api.post(`/messages/conversations/${encodeURIComponent(conversationId)}/read`, {});
    } catch {
      // ignore non-fatal read receipt error
    }
  }, []);

  const fetchConversationThread = useCallback(
    async (conversationId: string) => {
      setLoadingMessages(true);
      setMessagesError('');
      setOlderMessagesCursor(null);
      setHasOlderMessages(false);
      try {
        const [msgRes, callRes] = await Promise.all([
          api.get(`/messages/conversations/${encodeURIComponent(conversationId)}/messages?limit=100`),
          api
            .get(`/messages/conversations/${encodeURIComponent(conversationId)}/calls?limit=100`)
            .catch(() => null)
        ]);
        const rawMsgs = msgRes?.data?.messages || [];
        const normalizedMsgs = Array.isArray(rawMsgs)
          ? rawMsgs
              .map(normalizeChatMessage)
              .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          : [];
        if (activeConversationIdRef.current !== conversationId) return;
        setMessages(normalizedMsgs);
        const nextCursor =
          typeof msgRes?.data?.nextCursor === 'string' ? msgRes.data.nextCursor : null;
        setOlderMessagesCursor(nextCursor);
        setHasOlderMessages(
          Boolean(msgRes?.data?.hasMore || msgRes?.data?.has_more) && Boolean(nextCursor)
        );

        const rawCalls = callRes?.data?.calls || [];
        setCallHistory(Array.isArray(rawCalls) ? rawCalls.map(normalizeCallRecord) : []);
        markConversationRead(conversationId);
      } catch (err: any) {
        if (activeConversationIdRef.current === conversationId) {
          setMessagesError(err?.message || 'Unable to load conversation messages.');
        }
      } finally {
        if (activeConversationIdRef.current === conversationId) {
          setLoadingMessages(false);
        }
      }
    },
    [markConversationRead]
  );

  const selectConversation = useCallback(
    (conversationId: string | null) => {
      setActiveConversationId(conversationId);
      if (!conversationId) {
        setMessages([]);
        setCallHistory([]);
        setHasOlderMessages(false);
        setOlderMessagesCursor(null);
        return;
      }
      setOlderMessagesCursor(null);
      setHasOlderMessages(false);
      fetchConversationThread(conversationId);
    },
    [fetchConversationThread]
  );

  const refreshConversations = useCallback(
    async ({ selectLatest = false }: { selectLatest?: boolean } = {}): Promise<Conversation[]> => {
      setLoadingConversations(true);
      setMessagesError('');
      try {
        const res = await api.get('/messages/conversations');
        const list = Array.isArray(res?.data?.conversations)
          ? res.data.conversations.map(normalizeConversation)
          : [];
        setConversations(list);

        // Seed initial presence map
        setPresenceMap((prev) => {
          const next = { ...prev };
          list.forEach((conv: Conversation) => {
            (conv.participants || []).forEach((p: any) => {
              if (p.firebaseUid) {
                next[p.firebaseUid] = {
                  isOnline: Boolean(p.isOnline),
                  lastSeenAt: p.lastSeenAt || null
                };
              }
            });
          });
          return next;
        });

        if (selectLatest && list.length && !activeConversationIdRef.current) {
          selectConversation(list[0].id);
        } else if (
          activeConversationIdRef.current &&
          !list.some((c: Conversation) => c.id === activeConversationIdRef.current)
        ) {
          selectConversation(list[0]?.id || null);
        }
        return list;
      } catch (err: any) {
        setMessagesError(err?.message || 'Unable to load conversations.');
        return [];
      } finally {
        setLoadingConversations(false);
      }
    },
    [selectConversation]
  );

  const loadOlderMessages = useCallback(async () => {
    const convId = activeConversationIdRef.current;
    if (
      !convId ||
      loadingOlderMessages ||
      !hasOlderMessages ||
      !olderMessagesCursor ||
      !messages.length
    ) return;
    setLoadingOlderMessages(true);
    try {
      const res = await api.get(
        `/messages/conversations/${encodeURIComponent(convId)}/messages?limit=100&before=${encodeURIComponent(olderMessagesCursor)}`
      );
      if (activeConversationIdRef.current !== convId) return;
      const older = Array.isArray(res?.data?.messages)
        ? res.data.messages.map(normalizeChatMessage)
        : [];
      const nextCursor =
        typeof res?.data?.nextCursor === 'string' ? res.data.nextCursor : null;
      setOlderMessagesCursor(nextCursor);
      setHasOlderMessages(
        Boolean(res?.data?.hasMore || res?.data?.has_more) && Boolean(nextCursor)
      );
      if (older.length) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const merged = [...older.filter((m: ChatMessage) => !existingIds.has(m.id)), ...prev];
          return merged.sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        });
      }
    } catch (err: any) {
      showDashboardToast(err?.message || 'Unable to load earlier messages.', 'error');
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [
    hasOlderMessages,
    loadingOlderMessages,
    messages.length,
    olderMessagesCursor,
    showDashboardToast
  ]);

  const sendMessage = useCallback(
    async ({
      body,
      attachments = [],
      replyToId = null,
      forwardedFrom = null
    }: {
      body: string;
      attachments?: ChatAttachment[];
      replyToId?: string | null;
      forwardedFrom?: { senderName?: string; conversationName?: string } | null;
    }): Promise<ChatMessage | null> => {
      const convId = activeConversationIdRef.current;
      if (!convId) return null;
      const clientMessageId = crypto.randomUUID();
      const replyTarget = replyToId ? messages.find((m) => m.id === replyToId) : null;
      const optimisticMsg: ChatMessage = {
        id: clientMessageId,
        clientMessageId,
        conversationId: convId,
        senderId: currentUid,
        senderFirebaseUid: currentUid,
        senderName: currentUser.name,
        senderEmail: currentUser.email,
        senderAvatar: getAvatarSource(currentUser),
        senderProfileImage: getAvatarSource(currentUser),
        body,
        attachments,
        replyToMessageId: replyToId,
        replyTo: replyTarget
          ? { id: replyTarget.id, senderName: replyTarget.senderName, body: replyTarget.body }
          : null,
        forwardedFrom,
        reactions: {},
        createdAt: new Date().toISOString(),
        optimistic: true
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      try {
        const res = await api.post(
          `/messages/conversations/${encodeURIComponent(convId)}/messages`,
          {
            body,
            attachments,
            replyToId,
            forwardedFrom,
            clientMessageId
          }
        );
        const saved = res?.data?.message ? normalizeChatMessage(res.data.message) : null;
        if (saved) {
          setMessages((prev) => {
            const withoutOpt = prev.filter(
              (m) => m.clientMessageId !== clientMessageId && m.id !== saved.id
            );
            return [...withoutOpt, saved].sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
          });
          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId
                ? {
                    ...c,
                    lastMessageText: saved.body || (saved.attachments?.length ? 'Attachment' : ''),
                    lastMessageAt: saved.createdAt
                  }
                : c
            )
          );
        }
        return saved;
      } catch (err: any) {
        setMessages((prev) =>
          prev.map((m) =>
            m.clientMessageId === clientMessageId ? { ...m, optimistic: false, failed: true } : m
          )
        );
        showDashboardToast(err?.message || 'Unable to send message.', 'error');
        return null;
      }
    },
    [currentUid, currentUser, messages, showDashboardToast]
  );

  const editMessage = useCallback(
    async (messageId: string, body: string) => {
      const convId = activeConversationIdRef.current;
      if (!convId) return;
      try {
        const res = await api.patch(
          `/messages/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(messageId)}/edit`,
          { body }
        );
        const updated = res?.data?.message ? normalizeChatMessage(res.data.message) : null;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? updated || { ...m, body, editedAt: new Date().toISOString() }
              : m
          )
        );
      } catch (err: any) {
        showDashboardToast(err?.message || 'Unable to edit message.', 'error');
      }
    },
    [showDashboardToast]
  );

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      const convId = activeConversationIdRef.current;
      if (!convId) return;
      try {
        const res = await api.patch(
          `/messages/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(messageId)}/reaction`,
          { emoji }
        );
        const updated = res?.data?.message ? normalizeChatMessage(res.data.message) : null;
        if (updated) {
          setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
        }
      } catch (err: any) {
        showDashboardToast(err?.message || 'Unable to update reaction.', 'error');
      }
    },
    [showDashboardToast]
  );

  const togglePinMessage = useCallback(
    async (messageId: string, pinned: boolean) => {
      const convId = activeConversationIdRef.current;
      if (!convId) return;
      try {
        const res = await api.patch(
          `/messages/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(messageId)}/pin`,
          { isPinned: pinned }
        );
        const updated = res?.data?.message ? normalizeChatMessage(res.data.message) : null;
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? updated || { ...m, isPinned: pinned } : m))
        );
      } catch (err: any) {
        showDashboardToast(err?.message || 'Unable to pin message.', 'error');
      }
    },
    [showDashboardToast]
  );

  const toggleDecisionMessage = useCallback(
    async (messageId: string, isDecision: boolean) => {
      const convId = activeConversationIdRef.current;
      if (!convId) return;
      try {
        const res = await api.patch(
          `/messages/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(messageId)}/decision`,
          { isDecision }
        );
        const updated = res?.data?.message ? normalizeChatMessage(res.data.message) : null;
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? updated || { ...m, isDecision } : m))
        );
      } catch (err: any) {
        showDashboardToast(err?.message || 'Unable to update decision marker.', 'error');
      }
    },
    [showDashboardToast]
  );

  const deleteMessage = useCallback(
    async (messageId: string, scope: 'me' | 'everyone') => {
      const convId = activeConversationIdRef.current;
      if (!convId) return;
      try {
        await api.delete(
          `/messages/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(messageId)}`,
          { scope }
        );
        if (scope === 'me') {
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? { ...m, deletedForEveryone: true, body: '', attachments: [] }
                : m
            )
          );
        }
      } catch (err: any) {
        showDashboardToast(err?.message || 'Unable to delete message.', 'error');
      }
    },
    [showDashboardToast]
  );

  const forwardMessage = useCallback(
    async (message: ChatMessage, targetConversationId: string) => {
      const sourceConv = conversationsRef.current.find((c) => c.id === message.conversationId);
      const clientMessageId = crypto.randomUUID();
      try {
        await api.post(
          `/messages/conversations/${encodeURIComponent(targetConversationId)}/messages`,
          {
            body: message.body,
            attachments: message.attachments || [],
            forwardedFrom: {
              senderName: message.senderName || 'Teammate',
              conversationName: sourceConv?.name || 'Conversation'
            },
            clientMessageId
          }
        );
        showDashboardToast('Message forwarded.', 'success');
        if (targetConversationId === activeConversationIdRef.current) {
          fetchConversationThread(targetConversationId);
        }
      } catch (err: any) {
        showDashboardToast(err?.message || 'Unable to forward message.', 'error');
      }
    },
    [fetchConversationThread, showDashboardToast]
  );

  const createConversation = useCallback(
    async (payload: {
      projectId?: string | null;
      type: 'channel' | 'group' | 'direct' | 'dm';
      name?: string;
      memberFirebaseUids: string[];
    }): Promise<Conversation | null> => {
      try {
        const normalizedPayload = {
          ...payload,
          type: payload.type === 'dm' ? 'direct' : payload.type
        };
        const res = await api.post('/messages/conversations', normalizedPayload);
        const conv = res?.data?.conversation ? normalizeConversation(res.data.conversation) : null;
        if (conv) {
          setConversations((prev) => {
            const exists = prev.some((c) => c.id === conv.id);
            return exists ? prev.map((c) => (c.id === conv.id ? conv : c)) : [conv, ...prev];
          });
          selectConversation(conv.id);
        }
        return conv;
      } catch (err: any) {
        showDashboardToast(err?.message || 'Unable to create conversation.', 'error');
        return null;
      }
    },
    [selectConversation, showDashboardToast]
  );

  const clearConversation = useCallback(
    async (conversationId: string) => {
      try {
        await api.delete(`/messages/conversations/${encodeURIComponent(conversationId)}/messages`);
        if (activeConversationIdRef.current === conversationId) {
          setMessages([]);
          setHasOlderMessages(false);
          setOlderMessagesCursor(null);
        }
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId ? { ...c, lastMessageText: '', unreadCount: 0 } : c
          )
        );
        showDashboardToast('Chat messages cleared for you.', 'success');
      } catch (err: any) {
        showDashboardToast(err?.message || 'Unable to clear chat.', 'error');
      }
    },
    [showDashboardToast]
  );

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      try {
        await api.delete(`/messages/conversations/${encodeURIComponent(conversationId)}`);
        const remaining = conversationsRef.current.filter((c) => c.id !== conversationId);
        setConversations(remaining);
        if (activeConversationIdRef.current === conversationId) {
          selectConversation(remaining[0]?.id || null);
        }
        showDashboardToast('Conversation deleted.', 'success');
      } catch (err: any) {
        showDashboardToast(err?.message || 'Unable to delete conversation.', 'error');
      }
    },
    [selectConversation, showDashboardToast]
  );

  const summarizeConversation = useCallback(async (conversationId: string): Promise<string> => {
    const targetMsgs =
      conversationId === activeConversationIdRef.current
        ? messages
        : ((
            await api.get(
              `/messages/conversations/${encodeURIComponent(conversationId)}/messages?limit=100`
            )
          )?.data?.messages || []).map(normalizeChatMessage);

    const formatted: string[] = [];
    let totalChars = 0;
    for (const m of targetMsgs.slice(-100)) {
      if (m.deletedForEveryone || !m.body?.trim()) continue;
      const line = `${m.senderName || 'Teammate'}: ${m.body.trim()}`;
      if (totalChars + line.length > 19500) break;
      formatted.push(line);
      totalChars += line.length;
    }
    if (!formatted.length) {
      throw new Error('There are no recent text messages in this conversation to summarize.');
    }
    const res = await api.post('/ai/summarize-chat', { messages: formatted });
    return String(res?.data?.summary || res?.summary || '');
  }, [messages]);

  const linkTaskToMessage = useCallback(
    (messageId: string, taskId: string, taskTitle?: string) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, linkedTaskId: taskId, linkedTaskTitle: taskTitle || m.linkedTaskTitle }
            : m
        )
      );
    },
    []
  );

  // ==================== WEBRTC PEER SIGNALING ====================

  const getIceServersForCall = useCallback(async (call?: NormalizedCallRecord | null) => {
    if (call?.iceServers?.length) return call.iceServers;
    try {
      const res = await api.get('/messages/calls/ice-config');
      const servers = res?.data?.iceServers || res?.data?.ice_servers;
      if (Array.isArray(servers) && servers.length) return servers;
    } catch {
      // fallback
    }
    return DEFAULT_ICE_SERVERS;
  }, []);

  const syncRemotePeersState = useCallback(() => {
    const call = activeCallRef.current?.call;
    const peers: RemotePeerMedia[] = [];
    const seen = new Set<string>();

    (call?.participants || []).forEach((p) => {
      if (!p.firebaseUid || p.firebaseUid === currentUid) return;
      seen.add(p.firebaseUid);
      peers.push({
        firebaseUid: p.firebaseUid,
        name: p.name,
        initials: p.initials,
        profileImage: p.profileImage,
        stream: remoteStreamsRef.current.get(p.firebaseUid) || null,
        isMuted: p.isMuted,
        isCameraOff: p.isCameraOff,
        connectionState: peerConnectionsRef.current.get(p.firebaseUid)?.connectionState
      });
    });

    remoteStreamsRef.current.forEach((stream, uid) => {
      if (uid === currentUid || seen.has(uid)) return;
      const mate = teammates.find((t) => t.firebaseUid === uid);
      peers.push({
        firebaseUid: uid,
        name: mate?.name || 'Participant',
        initials: mate?.initials || 'TM',
        profileImage: mate?.profileImage,
        stream,
        connectionState: peerConnectionsRef.current.get(uid)?.connectionState
      });
    });

    setRemotePeers(peers);
  }, [currentUid, teammates]);

  const createPeerConnection = useCallback(
    async (remoteUid: string, shouldOffer: boolean) => {
      const existing = peerConnectionsRef.current.get(remoteUid);
      if (existing) {
        if (shouldOffer && existing.signalingState === 'stable') {
          const offer = await existing.createOffer();
          await existing.setLocalDescription(offer);
          socketRef.current?.emit('call:signal', {
            callId: activeCallRef.current?.call.callId,
            targetFirebaseUid: remoteUid,
            signal: { type: 'offer', sdp: offer }
          });
        }
        return existing;
      }

      const iceServers = await getIceServersForCall(activeCallRef.current?.call);
      const pc = new RTCPeerConnection({ iceServers });
      peerConnectionsRef.current.set(remoteUid, pc);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate && activeCallRef.current?.call.callId) {
          socketRef.current?.emit('call:signal', {
            callId: activeCallRef.current.call.callId,
            targetFirebaseUid: remoteUid,
            signal: { type: 'candidate', candidate: event.candidate }
          });
        }
      };

      pc.ontrack = (event) => {
        const stream = event.streams?.[0] || new MediaStream([event.track]);
        remoteStreamsRef.current.set(remoteUid, stream);
        syncRemotePeersState();
      };

      pc.onconnectionstatechange = () => {
        syncRemotePeersState();
      };

      if (shouldOffer) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current?.emit('call:signal', {
          callId: activeCallRef.current?.call.callId,
          targetFirebaseUid: remoteUid,
          signal: { type: 'offer', sdp: offer }
        });
      }

      return pc;
    },
    [getIceServersForCall, syncRemotePeersState]
  );

  const acquireLocalMedia = useCallback(async (callType: 'audio' | 'video'): Promise<MediaStream> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Your browser does not allow microphone or camera access here.');
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'video' ? { facingMode: 'user' } : false
    });
    setLocalStream(stream);
    localStreamRef.current = stream;
    return stream;
  }, []);

  const joinCallRoomSocket = useCallback((callId: string) => {
    socketRef.current?.emit('call:join', { callId });
  }, []);

  const scheduleMissedTimeout = useCallback(
    (call: NormalizedCallRecord) => {
      if (ringTimeoutRef.current) window.clearTimeout(ringTimeoutRef.current);
      const tryMarkMissed = async () => {
        const cur = activeCallRef.current;
        if (!cur || cur.call.callId !== call.callId || cur.call.status !== 'ringing') return;
        try {
          await api.post(
            `/messages/conversations/${encodeURIComponent(call.conversationId)}/calls/${encodeURIComponent(call.callId)}/missed`,
            {}
          );
          cleanupWebRtc();
          setActiveCall(null);
          fetchConversationThread(call.conversationId);
        } catch (err: any) {
          const retryMs = Number(err?.data?.retry_after_ms || err?.retry_after_ms || 0);
          if (err?.status === 409 && retryMs > 0) {
            missedCallRetryTimerRef.current = window.setTimeout(tryMarkMissed, retryMs + 120);
          }
        }
      };
      ringTimeoutRef.current = window.setTimeout(tryMarkMissed, 32000);
    },
    [cleanupWebRtc, fetchConversationThread]
  );

  const startCall = useCallback(
    async (callType: 'audio' | 'video', targetConv?: Conversation | null) => {
      const conv = targetConv || activeConversation;
      if (!conv) {
        setCallError('Select a conversation before starting a call.');
        return;
      }
      if (activeCallRef.current || startingCall) return;
      setCallError('');
      setStartingCall({ callType, conversationName: conv.name || 'Team call' });

      try {
        await acquireLocalMedia(callType);
        let targetConvId = conv.id;
        let res: any;
        try {
          res = await api.post(
            `/messages/conversations/${encodeURIComponent(targetConvId)}/calls`,
            { callType }
          );
        } catch (err: any) {
          if (err?.status === 404 && (conv.type === 'direct' || conv.type === 'dm')) {
            const partner = (conv.participants || []).find((p) => p.firebaseUid !== currentUid);
            if (partner?.firebaseUid) {
              const recreated = await api.post('/messages/conversations', {
                type: 'direct',
                projectId: conv.projectId || null,
                memberFirebaseUids: [partner.firebaseUid]
              });
              const nextConv = recreated?.data?.conversation;
              if (nextConv?.conversation_id || nextConv?.id) {
                targetConvId = String(nextConv.conversation_id || nextConv.id);
                res = await api.post(
                  `/messages/conversations/${encodeURIComponent(targetConvId)}/calls`,
                  { callType }
                );
                await refreshConversations();
                selectConversation(targetConvId);
              } else {
                throw err;
              }
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        }

        const createdCall = normalizeCallRecord(res?.data?.call || res?.call || {});
        setStartingCall(null);
        setActiveCall({
          call: createdCall,
          isOutgoing: true,
          startedAtMs: null,
          elapsedSeconds: 0,
          isMuted: false,
          isCameraOff: callType !== 'video',
          statusText: 'Ringing…',
          canInvite: createdCall.participants.length < 4
        });
        joinCallRoomSocket(createdCall.callId);
        startRingtone();
        scheduleMissedTimeout(createdCall);
      } catch (err: any) {
        cleanupWebRtc();
        setStartingCall(null);
        setCallError(err?.message || 'Unable to start the call.');
      }
    },
    [
      acquireLocalMedia,
      activeConversation,
      cleanupWebRtc,
      currentUid,
      joinCallRoomSocket,
      refreshConversations,
      scheduleMissedTimeout,
      selectConversation,
      startRingtone,
      startingCall
    ]
  );

  const acceptIncomingCall = useCallback(async () => {
    const incoming = incomingCallRef.current;
    if (!incoming) return;
    stopRingtone();
    setCallError('');
    try {
      await acquireLocalMedia(incoming.callType);
      const res = await api.post(
        `/messages/conversations/${encodeURIComponent(incoming.conversationId)}/calls/${encodeURIComponent(incoming.callId)}/accept`,
        {}
      );
      const call = normalizeCallRecord(res?.data?.call || incoming);
      setIncomingCall(null);
      setActiveCall({
        call,
        isOutgoing: false,
        startedAtMs: Date.now(),
        elapsedSeconds: 0,
        isMuted: false,
        isCameraOff: call.callType !== 'video',
        statusText: 'Connecting…',
        canInvite: call.participants.length < 4
      });
      joinCallRoomSocket(call.callId);
      for (const p of call.participants) {
        if (p.firebaseUid && p.firebaseUid !== currentUid) {
          createPeerConnection(p.firebaseUid, true).catch(() => {});
        }
      }
    } catch (err: any) {
      cleanupWebRtc();
      setIncomingCall(null);
      setCallError(err?.message || 'Unable to answer the call.');
    }
  }, [acquireLocalMedia, cleanupWebRtc, createPeerConnection, currentUid, joinCallRoomSocket, stopRingtone]);

  const declineIncomingCall = useCallback(async () => {
    const incoming = incomingCallRef.current;
    if (!incoming) return;
    stopRingtone();
    setIncomingCall(null);
    try {
      await api.post(
        `/messages/conversations/${encodeURIComponent(incoming.conversationId)}/calls/${encodeURIComponent(incoming.callId)}/decline`,
        {}
      );
    } catch {
      // ignore
    }
  }, [stopRingtone]);

  const joinOngoingCall = useCallback(
    async (targetCall: NormalizedCallRecord) => {
      if (activeCallRef.current) return;
      setCallError('');
      try {
        await acquireLocalMedia(targetCall.callType);
        const res = await api.post(
          `/messages/conversations/${encodeURIComponent(targetCall.conversationId)}/calls/${encodeURIComponent(targetCall.callId)}/join`,
          {}
        );
        const call = normalizeCallRecord(res?.data?.call || targetCall);
        setIncomingCall(null);
        setActiveCall({
          call,
          isOutgoing: false,
          startedAtMs: Date.now(),
          elapsedSeconds: 0,
          isMuted: false,
          isCameraOff: call.callType !== 'video',
          statusText: 'Connected',
          canInvite: call.participants.length < 4
        });
        joinCallRoomSocket(call.callId);
        for (const p of call.participants) {
          if (p.firebaseUid && p.firebaseUid !== currentUid) {
            createPeerConnection(p.firebaseUid, true).catch(() => {});
          }
        }
      } catch (err: any) {
        cleanupWebRtc();
        setCallError(err?.message || 'Unable to join the call.');
      }
    },
    [acquireLocalMedia, cleanupWebRtc, createPeerConnection, currentUid, joinCallRoomSocket]
  );

  const hangUpCall = useCallback(async () => {
    const cur = activeCallRef.current;
    if (!cur) return;
    const { call } = cur;
    socketRef.current?.emit('call:leave', { callId: call.callId });
    cleanupWebRtc();
    setActiveCall(null);
    try {
      const otherCount = call.participants.filter((p) => p.firebaseUid !== currentUid).length;
      if (call.status === 'ringing' || otherCount <= 1) {
        await api.post(
          `/messages/conversations/${encodeURIComponent(call.conversationId)}/calls/${encodeURIComponent(call.callId)}/end`,
          {}
        );
      } else {
        await api.post(`/messages/calls/${encodeURIComponent(call.callId)}/leave`, {});
      }
      if (activeConversationIdRef.current === call.conversationId) {
        fetchConversationThread(call.conversationId);
      }
    } catch {
      // ignore cleanup error
    }
  }, [cleanupWebRtc, currentUid, fetchConversationThread]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    setActiveCall((prev) => {
      if (!prev) return null;
      const nextMuted = !prev.isMuted;
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
      return { ...prev, isMuted: nextMuted };
    });
  }, []);

  const toggleCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    const prevSession = activeCallRef.current;
    if (!stream || !prevSession) return;
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length) {
      const nextOff = !prevSession.isCameraOff;
      videoTracks.forEach((track) => {
        track.enabled = !nextOff;
      });
      setActiveCall((prev) => (prev ? { ...prev, isCameraOff: nextOff } : null));
    } else if (prevSession.isCameraOff) {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        const newTrack = camStream.getVideoTracks()[0];
        if (newTrack) {
          stream.addTrack(newTrack);
          peerConnectionsRef.current.forEach((pc) => {
            pc.addTrack(newTrack, stream);
          });
          setLocalStream(new MediaStream(stream.getTracks()));
          setActiveCall((prev) => (prev ? { ...prev, isCameraOff: false } : null));
        }
      } catch {
        showDashboardToast('Unable to access camera.', 'error');
      }
    }
  }, [showDashboardToast]);

  const inviteToCall = useCallback(
    async (participantUids: string[]) => {
      const cur = activeCallRef.current;
      if (!cur || !participantUids.length) return;
      try {
        const res = await api.post(
          `/messages/conversations/${encodeURIComponent(cur.call.conversationId)}/calls/${encodeURIComponent(cur.call.callId)}/invite`,
          {
            projectId: cur.call.projectId || null,
            participantFirebaseUids: participantUids
          }
        );
        const updatedCall = res?.data?.call ? normalizeCallRecord(res.data.call) : null;
        if (updatedCall) {
          setActiveCall((prev) =>
            prev
              ? {
                  ...prev,
                  call: updatedCall,
                  canInvite: updatedCall.participants.length < 4
                }
              : null
          );
        }
        showDashboardToast('Call invitation sent.', 'success');
      } catch (err: any) {
        showDashboardToast(err?.message || 'Unable to invite teammates.', 'error');
      }
    },
    [showDashboardToast]
  );

  // Elapsed timer for active call
  useEffect(() => {
    if (!activeCall || activeCall.call.status !== 'active' || !activeCall.startedAtMs) return;
    const timer = window.setInterval(() => {
      setActiveCall((prev) => {
        if (!prev || !prev.startedAtMs) return prev;
        return {
          ...prev,
          elapsedSeconds: Math.max(0, Math.floor((Date.now() - prev.startedAtMs) / 1000))
        };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeCall?.call.status, activeCall?.startedAtMs]);

  // Initial load + Presence Heartbeat + Socket.IO connection
  useEffect(() => {
    if (!authReady || !firebaseUser) return;
    let cancelled = false;
    let presenceTimer: number | null = null;
    let tokenRefreshedOnce = false;

    refreshConversations({ selectLatest: true }).catch(() => {});

    const sendPresence = (isOnline: boolean) => {
      if (!firebaseUser) return;
      api.post('/messages/presence', { isOnline }).catch(() => {});
    };

    sendPresence(document.visibilityState !== 'hidden');
    presenceTimer = window.setInterval(() => {
      if (!cancelled) sendPresence(document.visibilityState !== 'hidden');
    }, 25000);

    const handleVisibility = () => sendPresence(document.visibilityState !== 'hidden');
    const handlePageHide = () => sendPresence(false);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handleVisibility);

    (async () => {
      try {
        await loadSocketIoClient();
        if (cancelled || !window.io) return;
        const token = await firebaseUser.getIdToken();
        if (cancelled) return;
        const socket = window.io(apiBaseUrl, {
          auth: { token },
          autoConnect: false,
          reconnection: true,
          reconnectionAttempts: Infinity,
          transports: ['websocket', 'polling'],
          tryAllTransports: true
        });
        socketRef.current = socket;

        socket.on('connect_error', async (err: any) => {
          if (!tokenRefreshedOnce && /auth|token|expired/i.test(String(err?.message || ''))) {
            tokenRefreshedOnce = true;
            try {
              const freshToken = await firebaseUser.getIdToken(true);
              socket.auth = { token: freshToken };
              socket.connect();
            } catch {
              // ignore
            }
          }
        });

        socket.on('presence:updated', (payload: any) => {
          const uid = String(payload?.firebaseUid || payload?.firebase_uid || '');
          if (!uid) return;
          setPresenceMap((prev) => ({
            ...prev,
            [uid]: {
              isOnline: Boolean(payload.isOnline ?? payload.is_online),
              lastSeenAt: payload.lastSeenAt ?? payload.last_seen_at ?? prev[uid]?.lastSeenAt ?? null
            }
          }));
        });

        socket.on('conversation:created', (payload: any) => {
          const raw = payload?.conversation || payload;
          if (!raw) return;
          const conv = normalizeConversation(raw);
          setConversations((prev) =>
            prev.some((c) => c.id === conv.id) ? prev : [conv, ...prev]
          );
        });

        socket.on('conversation:updated', (payload: any) => {
          const raw = payload?.conversation || payload;
          if (!raw) return;
          const conv = normalizeConversation(raw);
          setConversations((prev) => {
            const exists = prev.some((c) => c.id === conv.id);
            const updated = exists ? prev.map((c) => (c.id === conv.id ? conv : c)) : [conv, ...prev];
            return updated.sort(
              (a, b) =>
                new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime()
            );
          });
        });

        socket.on('conversation:deleted', (payload: any) => {
          const cid = String(payload?.conversationId || payload?.conversation_id || '');
          if (!cid) return;
          setConversations((prev) => prev.filter((c) => c.id !== cid));
          if (activeConversationIdRef.current === cid) {
            selectConversation(null);
          }
        });

        socket.on('conversation:cleared', (payload: any) => {
          const cid = String(payload?.conversationId || payload?.conversation_id || '');
          if (cid && activeConversationIdRef.current === cid) {
            setMessages([]);
            setHasOlderMessages(false);
            setOlderMessagesCursor(null);
          }
        });

        socket.on('message:created', (payload: any) => {
          const msg = normalizeChatMessage(payload?.message || payload);
          const convId = msg.conversationId;
          const viewingThisThread =
            activeViewRef.current === 'Messages' && activeConversationIdRef.current === convId;

          if (activeConversationIdRef.current === convId) {
            setMessages((prev) => {
              const filtered = prev.filter(
                (m) =>
                  m.id !== msg.id &&
                  (!msg.clientMessageId || m.clientMessageId !== msg.clientMessageId)
              );
              return [...filtered, msg].sort(
                (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
              );
            });
          }

          setConversations((prev) => {
            const next = prev.map((c) => {
              if (c.id !== convId) return c;
              return {
                ...c,
                lastMessageText: msg.body || (msg.attachments?.length ? 'Attachment' : ''),
                lastMessageAt: msg.createdAt,
                unreadCount:
                  viewingThisThread || msg.senderFirebaseUid === firebaseUser.uid
                    ? 0
                    : (Number(c.unreadCount) || 0) + 1
              };
            });
            return next.sort(
              (a, b) =>
                new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime()
            );
          });

          if (viewingThisThread && msg.senderFirebaseUid !== firebaseUser.uid) {
            markConversationRead(convId);
          }
        });

        socket.on('message:updated', (payload: any) => {
          const msg = normalizeChatMessage(payload?.message || payload);
          if (activeConversationIdRef.current === msg.conversationId) {
            setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
          }
        });

        socket.on('call:updated', (payload: any) => {
          const call = normalizeCallRecord(payload?.call || payload);
          if (activeConversationIdRef.current === call.conversationId) {
            setCallHistory((prev) => {
              const idx = prev.findIndex((c) => c.callId === call.callId);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = call;
                return next;
              }
              return [call, ...prev];
            });
          }

          if (call.status === 'ringing' && call.initiatorUid !== firebaseUser.uid && !activeCallRef.current) {
            const alreadyInvited = call.participants.some((p) => p.firebaseUid === firebaseUser.uid);
            if (alreadyInvited || call.participants.length === 0) {
              setIncomingCall(call);
              startRingtone();
            }
          }

          if (incomingCallRef.current?.callId === call.callId && call.status !== 'ringing') {
            stopRingtone();
            setIncomingCall(null);
          }

          if (activeCallRef.current?.call.callId === call.callId) {
            if (call.status === 'ended' || call.status === 'missed' || call.status === 'declined') {
              cleanupWebRtc();
              setActiveCall(null);
            } else {
              if (call.status === 'active') {
                stopRingtone();
                if (ringTimeoutRef.current) {
                  window.clearTimeout(ringTimeoutRef.current);
                  ringTimeoutRef.current = null;
                }
              }
              setActiveCall((prev) =>
                prev
                  ? {
                      ...prev,
                      call,
                      startedAtMs:
                        prev.startedAtMs || (call.status === 'active' ? Date.now() : null),
                      statusText: call.status === 'active' ? 'Connected' : 'Ringing…',
                      canInvite: call.participants.length < 4
                    }
                  : null
              );
              syncRemotePeersState();
            }
          }
        });

        socket.on('call:join', (payload: any) => {
          const callId = String(payload?.callId || '');
          const joinerUid = String(payload?.firebaseUid || payload?.firebase_uid || '');
          if (
            activeCallRef.current?.call.callId === callId &&
            joinerUid &&
            joinerUid !== firebaseUser.uid
          ) {
            createPeerConnection(joinerUid, true).catch(() => {});
          }
        });

        socket.on('call:leave', (payload: any) => {
          const callId = String(payload?.callId || '');
          const leaverUid = String(payload?.firebaseUid || payload?.firebase_uid || '');
          if (activeCallRef.current?.call.callId === callId && leaverUid) {
            const pc = peerConnectionsRef.current.get(leaverUid);
            if (pc) {
              pc.close();
              peerConnectionsRef.current.delete(leaverUid);
            }
            remoteStreamsRef.current.delete(leaverUid);
            syncRemotePeersState();
          }
        });

        socket.on('call:signal', async (payload: any) => {
          const fromUid = String(payload?.fromFirebaseUid || payload?.from || '');
          const callId = String(payload?.callId || '');
          const signal = payload?.signal;
          if (!fromUid || !signal || activeCallRef.current?.call.callId !== callId) return;

          try {
            const pc = await createPeerConnection(fromUid, false);
            if (signal.type === 'offer' && signal.sdp) {
              await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
              const queued = pendingIceCandidatesRef.current.get(fromUid) || [];
              for (const cand of queued) {
                await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
              }
              pendingIceCandidatesRef.current.delete(fromUid);
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              socket.emit('call:signal', {
                callId,
                targetFirebaseUid: fromUid,
                signal: { type: 'answer', sdp: answer }
              });
            } else if (signal.type === 'answer' && signal.sdp) {
              await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
              const queued = pendingIceCandidatesRef.current.get(fromUid) || [];
              for (const cand of queued) {
                await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
              }
              pendingIceCandidatesRef.current.delete(fromUid);
            } else if (signal.type === 'candidate' && signal.candidate) {
              if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
              } else {
                const list = pendingIceCandidatesRef.current.get(fromUid) || [];
                list.push(signal.candidate);
                pendingIceCandidatesRef.current.set(fromUid, list);
              }
            }
          } catch (err) {
            console.error('WebRTC signal error:', err);
          }
        });

        socket.connect();
      } catch (err) {
        console.error('Messages socket setup error:', err);
      }
    })();

    return () => {
      cancelled = true;
      if (presenceTimer) window.clearInterval(presenceTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handleVisibility);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      cleanupWebRtc();
    };
  }, [
    authReady,
    cleanupWebRtc,
    createPeerConnection,
    firebaseUser,
    markConversationRead,
    refreshConversations,
    selectConversation,
    startRingtone,
    stopRingtone,
    syncRemotePeersState
  ]);

  // Handle pending message context navigation
  useEffect(() => {
    if (activeView !== 'Messages' || !pendingMessageContext || !authReady || !firebaseUser) return;
    let active = true;
    (async () => {
      if (pendingMessageContext.conversationId) {
        selectConversation(pendingMessageContext.conversationId);
        clearPendingMessageContext();
        return;
      }
      if (pendingMessageContext.targetUid) {
        const existingDm = conversationsRef.current.find(
          (c) =>
            (c.type === 'direct' || c.type === 'dm') &&
            c.participants?.some((p) => p.firebaseUid === pendingMessageContext.targetUid)
        );
        if (existingDm) {
          selectConversation(existingDm.id);
        } else if (active) {
          await createConversation({
            type: 'direct',
            projectId: pendingMessageContext.projectId || null,
            memberFirebaseUids: [pendingMessageContext.targetUid]
          });
        }
        clearPendingMessageContext();
      }
    })();
    return () => {
      active = false;
    };
  }, [
    activeView,
    authReady,
    clearPendingMessageContext,
    createConversation,
    firebaseUser,
    pendingMessageContext,
    selectConversation
  ]);

  // Mark active conversation read when switching into Messages view
  useEffect(() => {
    if (activeView === 'Messages' && activeConversationId) {
      markConversationRead(activeConversationId);
    }
  }, [activeView, activeConversationId, markConversationRead]);

  const value: MessagesCallContextValue = {
    conversations,
    teammates,
    activeConversationId,
    activeConversation,
    messages,
    callHistory,
    hasOlderMessages,
    loadingConversations,
    loadingMessages,
    loadingOlderMessages,
    messagesError,
    presenceMap,
    selectConversation,
    refreshConversations,
    loadOlderMessages,
    sendMessage,
    editMessage,
    toggleReaction,
    togglePinMessage,
    toggleDecisionMessage,
    deleteMessage,
    forwardMessage,
    createConversation,
    clearConversation,
    deleteConversation,
    summarizeConversation,
    linkTaskToMessage,
    activeCall,
    incomingCall,
    startingCall,
    callError,
    dismissCallError: () => setCallError(''),
    localStream,
    remotePeers,
    startCall,
    acceptIncomingCall,
    declineIncomingCall,
    hangUpCall,
    toggleMute,
    toggleCamera,
    inviteToCall,
    joinOngoingCall
  };

  return <MessagesCallContext.Provider value={value}>{children}</MessagesCallContext.Provider>;
};

export function useMessagesCall(): MessagesCallContextValue {
  const ctx = useContext(MessagesCallContext);
  if (!ctx) {
    throw new Error('useMessagesCall must be used within MessagesCallProvider');
  }
  return ctx;
}
