import { firebaseAuth } from '@/lib/firebase';

export type ConversationType = 'direct' | 'group' | 'channel';

export interface ConversationParticipant {
  firebaseUid: string;
  email: string;
  name: string;
  profileImage: string;
  isOnline: boolean;
  lastSeenAt: string | null;
}

export interface Conversation {
  id: string;
  projectId: string;
  type: ConversationType;
  name: string;
  memberUids: string[];
  participants: ConversationParticipant[];
  unreadCount: number;
  latestMessage: string;
  latestMessageCreatedAt: string | null;
  updatedAt: string | null;
}

export interface ProjectMember {
  firebaseUid: string;
  email: string;
  name: string;
  profileImage: string;
}

export interface MessagingProject {
  id: string;
  name: string;
  creator: ProjectMember;
  acceptedMembers: ProjectMember[];
}

export interface MessageAttachment {
  fileName: string;
  mediaType: string;
  size: number;
  data: string;
  is_voice_note?: boolean;
  duration_seconds?: number;
  waveform_peaks?: number[];
}

export interface MessageReaction {
  emoji: string;
  users: string[];
}

export interface Message {
  id: string;
  conversationId: string;
  clientMessageId: string | null;
  senderUid: string;
  senderEmail: string;
  senderName: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  readAt: string | null;
  deleted: boolean;
  attachments: MessageAttachment[];
  reactions: MessageReaction[];
  replyToId: string | null;
  replyToBody: string | null;
  replyToSenderName: string | null;
  forwardedFrom: { senderName: string } | null;
  pinned: boolean;
  isDecision: boolean;
}

export interface CallHistoryItem {
  id: string;
  conversationId: string;
  callerUid: string;
  callerName: string;
  calleeUid: string;
  calleeName: string;
  type: 'audio' | 'video';
  status: 'ringing' | 'accepted' | 'declined' | 'missed' | 'ended';
  createdAt: string;
}

export type MessageCallType = 'audio' | 'video';

export interface MessageCallParticipant {
  firebase_uid: string;
  display_name: string;
  status: 'ringing' | 'accepted' | 'declined' | 'missed' | 'left';
}

export interface MessageCallIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface MessageCallInvitation {
  call_id: string;
  conversation_id: string;
  caller_uid: string;
  caller_name: string;
  callee_uid: string;
  callee_name: string;
  call_type: MessageCallType;
  status: 'ringing' | 'accepted' | 'declined' | 'missed' | 'ended';
  ring_expires_at: string;
  added_participant?: boolean;
  peer_uid?: string;
  peer_name?: string;
  ice_servers?: MessageCallIceServer[];
  participants?: MessageCallParticipant[];
}

export interface MessageCallJoinResult {
  call?: MessageCallInvitation;
  participants?: MessageCallParticipant[];
  ice_servers?: MessageCallIceServer[];
  iceServers?: MessageCallIceServer[];
  conversationId?: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  code?: string;
  message?: string;
}

export class MessagesApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = 'MessagesApiError';
  }
}

const apiBaseUrl = (
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://collab-y7pb.onrender.com'
).replace(/\/+$/, '');

function normalizeConversation(row: Record<string, unknown>): Conversation {
  const participants = Array.isArray(row.members) ? row.members : [];
  return {
    id: String(row.conversation_id || row.id || ''),
    projectId: String(row.project_id || row.projectId || ''),
    type: (row.conversation_type || row.type || 'direct') as ConversationType,
    name: typeof row.name === 'string' ? row.name : '',
    memberUids: Array.isArray(row.member_uids)
      ? row.member_uids.filter((uid): uid is string => typeof uid === 'string')
      : participants.map((participant) => {
          if (!participant || typeof participant !== 'object') return '';
          const member = participant as Record<string, unknown>;
          return String(member.firebaseUid || member.firebase_uid || member.uid || '');
        }).filter(Boolean),
    participants: participants.flatMap((participant) => {
      if (!participant || typeof participant !== 'object') return [];
      const member = participant as Record<string, unknown>;
      return [{
        firebaseUid: String(member.firebaseUid || member.firebase_uid || member.uid || ''),
        email: typeof member.email === 'string' ? member.email.toLowerCase() : '',
        name: typeof member.name === 'string'
          ? member.name
          : typeof member.display_name === 'string'
            ? member.display_name
            : '',
        profileImage: typeof member.profileImage === 'string' ? member.profileImage : '',
        isOnline: Boolean(member.is_online ?? member.isOnline),
        lastSeenAt: typeof (member.lastSeenAt || member.last_seen_at) === 'string'
          ? String(member.lastSeenAt || member.last_seen_at)
          : null,
      }];
    }),
    unreadCount: Number(row.unread_count ?? row.unreadCount ?? 0),
    latestMessage: typeof (row.latest_message_body ?? row.latestMessage) === 'string'
      ? String(row.latest_message_body ?? row.latestMessage)
      : '',
    latestMessageCreatedAt: typeof row.latest_message_created_at === 'string'
      ? row.latest_message_created_at
      : null,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  };
}

export function normalizeMessage(row: Record<string, unknown>): Message {
  const forwarded = row.forwarded_from || row.forwardedFrom;
  return {
    id: String(row.message_id || row.id || ''),
    conversationId: String(row.conversation_id || row.conversationId || ''),
    clientMessageId: typeof (row.client_message_id || row.clientMessageId) === 'string'
      ? String(row.client_message_id || row.clientMessageId)
      : null,
    senderUid: String(row.sender_firebase_uid || row.senderUid || ''),
    senderEmail: String(row.sender_email || row.senderEmail || '').toLowerCase(),
    senderName: String(row.sender_name || row.senderName || 'Project member'),
    body: typeof row.body === 'string' ? row.body : '',
    createdAt: String(row.created_at || row.createdAt || new Date().toISOString()),
    editedAt: typeof (row.edited_at || row.editedAt) === 'string'
      ? String(row.edited_at || row.editedAt)
      : null,
    readAt: typeof (row.read_at || row.readAt) === 'string'
      ? String(row.read_at || row.readAt)
      : null,
    deleted: Boolean(row.is_deleted ?? row.isDeleted),
    attachments: Array.isArray(row.attachments) ? row.attachments as MessageAttachment[] : [],
    reactions: Array.isArray(row.reactions) ? row.reactions as MessageReaction[] : [],
    replyToId: typeof (row.reply_to_message_id || row.replyToId) === 'string'
      ? String(row.reply_to_message_id || row.replyToId)
      : null,
    replyToBody: typeof (row.reply_to_body ?? row.replyToBody) === 'string'
      ? String(row.reply_to_body ?? row.replyToBody)
      : null,
    replyToSenderName: typeof (row.reply_to_sender_name ?? row.replyToSenderName) === 'string'
      ? String(row.reply_to_sender_name ?? row.replyToSenderName)
      : null,
    forwardedFrom: forwarded && typeof forwarded === 'object' &&
      typeof (forwarded as Record<string, unknown>).senderName === 'string'
      ? { senderName: String((forwarded as Record<string, unknown>).senderName) }
      : null,
    pinned: Boolean(row.is_pinned ?? row.pinned),
    isDecision: Boolean(row.is_decision ?? row.isDecision),
  };
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<ApiEnvelope<T>> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new MessagesApiError('Please sign in to use messages.', 401);

  const send = async (token: string) => {
    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}/api${path}`, {
        method: options.method || 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch {
      throw new MessagesApiError('Unable to connect. Check your internet connection and try again.', 0);
    }
    return response;
  };

  let response = await send(await user.getIdToken());
  if (response.status === 401) {
    response = await send(await user.getIdToken(true));
  }
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok) {
    throw new MessagesApiError(
      payload?.message || (response.status === 403
        ? "You don't have permission to access this conversation."
        : 'The messaging request could not be completed.'),
      response.status,
      payload?.code || null,
    );
  }
  return payload || { success: true };
}

export async function fetchConversations(): Promise<Conversation[]> {
  const result = await request<{ conversations?: Record<string, unknown>[] }>('/messages/conversations');
  return (result.data?.conversations || []).map(normalizeConversation);
}

export async function fetchCallHistory(): Promise<CallHistoryItem[]> {
  const result = await request<{ calls?: Record<string, unknown>[] }>('/messages/calls/history?limit=100');
  return (result.data?.calls || []).flatMap((row) => {
    const id = row.call_id;
    const conversationId = row.conversation_id;
    const createdAt = row.created_at;
    const type = row.call_type;
    const status = row.status;
    if (
      typeof id !== 'string' ||
      typeof conversationId !== 'string' ||
      typeof createdAt !== 'string' ||
      (type !== 'audio' && type !== 'video') ||
      (status !== 'ringing' &&
        status !== 'accepted' &&
        status !== 'declined' &&
        status !== 'missed' &&
        status !== 'ended')
    ) return [];
    return [{
      id,
      conversationId,
      callerUid: String(row.caller_uid || ''),
      callerName: String(row.caller_name || 'Project member'),
      calleeUid: String(row.callee_uid || ''),
      calleeName: String(row.callee_name || 'Project member'),
      type,
      status,
      createdAt,
    }];
  });
}

export async function startMessageCall(
  conversationId: string,
  callType: MessageCallType,
): Promise<MessageCallJoinResult> {
  const result = await request<MessageCallJoinResult>(
    `/messages/conversations/${encodeURIComponent(conversationId)}/calls`,
    { method: 'POST', body: { callType } },
  );
  return result.data || {};
}

export async function acceptMessageCall(
  conversationId: string,
  callId: string,
): Promise<MessageCallJoinResult> {
  const result = await request<MessageCallJoinResult>(
    `/messages/conversations/${encodeURIComponent(conversationId)}/calls/${encodeURIComponent(callId)}/accept`,
    { method: 'POST', body: {} },
  );
  return result.data || {};
}

export async function joinInvitedMessageCall(
  conversationId: string,
  callId: string,
): Promise<MessageCallJoinResult> {
  const result = await request<MessageCallJoinResult>(
    `/messages/conversations/${encodeURIComponent(conversationId)}/calls/${encodeURIComponent(callId)}/join`,
    { method: 'POST', body: {} },
  );
  return result.data || {};
}

export async function declineMessageCall(
  conversationId: string,
  callId: string,
  invitedParticipant: boolean,
): Promise<void> {
  await request(
    `/messages/conversations/${encodeURIComponent(conversationId)}/calls/${encodeURIComponent(callId)}/${invitedParticipant ? 'decline-invite' : 'decline'}`,
    { method: 'POST', body: {} },
  );
}

export async function endMessageCall(
  conversationId: string,
  callId: string,
): Promise<void> {
  await request(
    `/messages/conversations/${encodeURIComponent(conversationId)}/calls/${encodeURIComponent(callId)}/end`,
    { method: 'POST', body: {} },
  );
}

export async function leaveMessageCall(callId: string): Promise<void> {
  await request(`/messages/calls/${encodeURIComponent(callId)}/leave`, {
    method: 'POST',
    body: {},
  });
}

export async function markMessageCallMissed(
  conversationId: string,
  callId: string,
): Promise<{ stillRinging: boolean; retryAfterMs: number | null }> {
  const result = await request<{
    call?: { status?: string };
    retry_after_ms?: number;
  }>(
    `/messages/conversations/${encodeURIComponent(conversationId)}/calls/${encodeURIComponent(callId)}/missed`,
    { method: 'POST', body: {} },
  );
  return {
    stillRinging: result.code === 'CALL_NOT_EXPIRED' || result.data?.call?.status === 'ringing',
    retryAfterMs: Number.isFinite(result.data?.retry_after_ms)
      ? Number(result.data?.retry_after_ms)
      : null,
  };
}

function normalizeProjectMember(value: unknown): ProjectMember | null {
  if (!value || typeof value !== 'object') return null;
  const member = value as Record<string, unknown>;
  const firebaseUid = member.firebaseUid || member.invited_firebase_uid || member.firebase_uid;
  const email = member.email || member.invited_email;
  if (typeof firebaseUid !== 'string' || typeof email !== 'string') return null;
  return {
    firebaseUid,
    email: email.toLowerCase(),
    name: String(member.name || member.creator_name || member.invited_name || email),
    profileImage: typeof (member.profileImage ?? member.profile_image) === 'string'
      ? String(member.profileImage ?? member.profile_image)
      : '',
  };
}

export async function fetchMessagingProjects(): Promise<MessagingProject[]> {
  const result = await request<{ projects?: Record<string, unknown>[] }>('/projects');
  return (result.data?.projects || []).flatMap((row) => {
    const creator = normalizeProjectMember({
      firebaseUid: row.creator_firebase_uid,
      email: row.creator_email,
      name: row.creator_name,
      profileImage: row.creator_profile_image,
    });
    const acceptedMembers = Array.isArray(row.accepted_members)
      ? row.accepted_members.map(normalizeProjectMember).filter(
          (member): member is ProjectMember => member !== null,
        )
      : [];
    const id = row.project_id;
    if (typeof id !== 'string' || !creator) return [];
    return [{
      id,
      name: typeof row.name === 'string' ? row.name : 'Project',
      creator,
      acceptedMembers,
    }];
  });
}

export async function createConversation(input: {
  projectId: string;
  type: ConversationType;
  name?: string;
  memberFirebaseUids: string[];
}): Promise<string> {
  const result = await request<{ conversation?: { conversation_id?: string } }>(
    '/messages/conversations',
    {
      method: 'POST',
      body: {
        projectId: input.projectId,
        type: input.type,
        name: input.name || '',
        memberFirebaseUids: input.memberFirebaseUids,
      },
    },
  );
  const id = result.data?.conversation?.conversation_id;
  if (!id) throw new MessagesApiError('The server did not return the new conversation.', 502);
  return id;
}

export async function fetchMessages(
  conversationId: string,
  before: string | null = null,
): Promise<{ messages: Message[]; nextCursor: string | null; hasMore: boolean }> {
  const query = new URLSearchParams({ limit: '100' });
  if (before) query.set('before', before);
  const result = await request<{
    messages?: Record<string, unknown>[];
    nextCursor?: string | null;
    hasMore?: boolean;
  }>(`/messages/conversations/${encodeURIComponent(conversationId)}/messages?${query.toString()}`);
  return {
    messages: (result.data?.messages || []).map(normalizeMessage),
    nextCursor: result.data?.nextCursor || null,
    hasMore: Boolean(result.data?.hasMore),
  };
}

export async function sendTextMessage(
  conversationId: string,
  body: string,
  clientMessageId: string,
): Promise<Message> {
  const result = await request<{ message?: Record<string, unknown> }>(
    `/messages/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      body: { body, attachments: [], replyToId: null, forwardedFrom: null, clientMessageId },
    },
  );
  if (!result.data?.message) throw new MessagesApiError('The server did not return the sent message.', 502);
  return normalizeMessage(result.data.message);
}

export async function sendMessage(input: {
  conversationId: string;
  body: string;
  clientMessageId: string;
  attachments?: MessageAttachment[];
  replyToId?: string | null;
  forwardedFrom?: { senderName: string } | null;
}): Promise<Message> {
  const result = await request<{ message?: Record<string, unknown> }>(
    `/messages/conversations/${encodeURIComponent(input.conversationId)}/messages`,
    {
      method: 'POST',
      body: {
        body: input.body,
        attachments: input.attachments || [],
        replyToId: input.replyToId || null,
        forwardedFrom: input.forwardedFrom || null,
        clientMessageId: input.clientMessageId,
      },
    },
  );
  if (!result.data?.message) throw new MessagesApiError('The server did not return the sent message.', 502);
  return normalizeMessage(result.data.message);
}

export async function updateMessage(
  conversationId: string,
  messageId: string,
  action: 'edit' | 'pin' | 'decision' | 'reaction',
  body: Record<string, unknown> = {},
): Promise<void> {
  await request(
    `/messages/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/${action}`,
    { method: 'PATCH', body },
  );
}

export async function deleteMessage(
  conversationId: string,
  messageId: string,
  scope: 'me' | 'everyone',
): Promise<void> {
  await request(
    `/messages/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
    { method: 'DELETE', body: { scope } },
  );
}

export async function clearConversationMessages(conversationId: string): Promise<void> {
  await request(`/messages/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'DELETE',
  });
}

export async function hideConversation(conversationId: string): Promise<void> {
  await request(`/messages/conversations/${encodeURIComponent(conversationId)}`, {
    method: 'DELETE',
  });
}

export async function markConversationRead(conversationId: string): Promise<void> {
  await request(`/messages/conversations/${encodeURIComponent(conversationId)}/read`, {
    method: 'POST',
    body: {},
  });
}

export function createClientMessageId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}
