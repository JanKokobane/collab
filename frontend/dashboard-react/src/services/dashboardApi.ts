import type { AuthUser } from '../auth/authClient.js'
import type {
  ApiFailure,
  ApiResponse,
  CurrentProfile,
  ConversationMessage,
  MessageConversation,
  MessageAttachment,
  MessageCallHistoryRecord,
  Notification,
  ProfileImageData,
  ProfileSettingsInput,
  Project,
  ProjectMeeting,
  ProjectMember,
  ProjectReminder,
  ProjectTask,
  ProjectTasksOptions,
  ProjectResource,
  ProjectScratchpad,
  ProjectStickyNote,
} from '../types/dashboard.js'

const API_BASE_URL = (
  (window as Window & { COLLAB_API_BASE_URL?: string }).COLLAB_API_BASE_URL ||
  'https://collab-y7pb.onrender.com'
).replace(/\/+$/, '')

export const dashboardApiBaseUrl = API_BASE_URL

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

export class DashboardApiError extends Error {
  readonly status: number
  readonly payload: ApiFailure | null

  constructor(message: string, status: number, payload: ApiFailure | null = null) {
    super(message)
    this.name = 'DashboardApiError'
    this.status = status
    this.payload = payload
  }
}

async function request<TData>(
  user: AuthUser,
  path: string,
  { method = 'GET', body, signal }: RequestOptions = {},
): Promise<ApiResponse<TData>> {
  const token = await user.getIdToken(false)
  const response = await fetch(`${API_BASE_URL}/api${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal,
  })

  const payload = await response.json().catch(() => null) as ApiResponse<TData> | ApiFailure | null
  if (!response.ok) {
    const failure = payload && 'success' in payload && payload.success === false ? payload : null
    throw new DashboardApiError(
      failure?.message || `Request failed (${response.status}).`,
      response.status,
      failure,
    )
  }
  return payload as ApiResponse<TData>
}

const projectPath = (projectId: string) => `/projects/${encodeURIComponent(projectId)}`

export const dashboardApi = {
  fetchCurrentProfile(user: AuthUser, signal?: AbortSignal) {
    return request<{ profile: CurrentProfile | null }>(user, '/users/profile', { signal })
  },

  fetchProfileImage(user: AuthUser, signal?: AbortSignal) {
    return request<ProfileImageData>(user, '/users/profile-image', { signal })
  },

  fetchProjects(user: AuthUser, signal?: AbortSignal) {
    return request<{ projects: Project[]; count: number }>(user, '/projects', { signal })
  },

  fetchNotifications(user: AuthUser, signal?: AbortSignal) {
    return request<{ notifications: Notification[] }>(user, '/notifications', { signal })
  },

  fetchMessageConversations(user: AuthUser, signal?: AbortSignal) {
    return request<{ conversations: MessageConversation[] }>(user, '/messages/conversations', { signal })
  },

  createMessageConversation(
    user: AuthUser,
    input: { projectId: string; type: 'direct' | 'group' | 'channel'; name?: string; memberFirebaseUids: string[] },
    signal?: AbortSignal,
  ) {
    return request<{ conversation: MessageConversation }>(user, '/messages/conversations', {
      method: 'POST',
      body: input,
      signal,
    })
  },

  summarizeChat(user: AuthUser, messages: string[]) {
    return user.getIdToken(false).then(async (token) => {
      const response = await fetch(`${API_BASE_URL}/api/ai/summarize-chat`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages }),
      })
      const payload = await response.json().catch(() => null) as {
        success?: unknown
        summary?: unknown
        code?: unknown
        message?: unknown
      } | null
      if (!response.ok || payload?.success !== true) {
        throw new DashboardApiError(
          typeof payload?.message === 'string' ? payload.message : `Request failed (${response.status}).`,
          response.status,
          payload && payload.success === false
            ? {
              success: false,
              ...(typeof payload.code === 'string' ? { code: payload.code } : {}),
              message: typeof payload.message === 'string' ? payload.message : 'The chat summary could not be generated.',
            }
            : null,
        )
      }
      if (typeof payload.summary !== 'string' || !payload.summary.trim()) {
        throw new DashboardApiError('The AI service did not return a chat summary.', response.status)
      }
      return payload.summary.trim()
    })
  },

  fetchConversationMessages(user: AuthUser, conversationId: string, before?: string | null, signal?: AbortSignal) {
    const query = new URLSearchParams({ limit: '100' })
    if (before) query.set('before', before)
    return request<{
      messages: ConversationMessage[]
      nextCursor: string | null
      hasMore: boolean
    }>(user, `/messages/conversations/${encodeURIComponent(conversationId)}/messages?${query}`, { signal })
  },

  fetchConversationCallHistory(user: AuthUser, conversationId: string, signal?: AbortSignal) {
    return request<{ calls: MessageCallHistoryRecord[] }>(
      user,
      `/messages/conversations/${encodeURIComponent(conversationId)}/calls?limit=100`,
      { signal },
    )
  },

  createConversationMessage(
    user: AuthUser,
    conversationId: string,
    input: {
      body: string
      attachments: MessageAttachment[]
      replyToId?: string | null
      forwardedFrom?: { senderName: string } | null
      clientMessageId: string
    },
    signal?: AbortSignal,
  ) {
    return request<{ messageId: string; message: ConversationMessage }>(
      user,
      `/messages/conversations/${encodeURIComponent(conversationId)}/messages`,
      { method: 'POST', body: input, signal },
    )
  },

  markConversationRead(user: AuthUser, conversationId: string, signal?: AbortSignal) {
    return request<Record<string, never>>(
      user,
      `/messages/conversations/${encodeURIComponent(conversationId)}/read`,
      { method: 'POST', body: {}, signal },
    )
  },

  updateMessagePresence(user: AuthUser, isOnline: boolean, signal?: AbortSignal) {
    return request<Record<string, never>>(user, '/messages/presence', {
      method: 'POST',
      body: { isOnline },
      signal,
    })
  },

  mutateConversationMessage(
    user: AuthUser,
    conversationId: string,
    messageId: string,
    action: string,
    body: Record<string, unknown> = {},
    signal?: AbortSignal,
  ) {
    return request<{ message: ConversationMessage }>(
      user,
      `/messages/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/${encodeURIComponent(action)}`,
      { method: 'PATCH', body, signal },
    )
  },

  deleteConversationMessage(
    user: AuthUser,
    conversationId: string,
    messageId: string,
    scope: 'me' | 'everyone',
    signal?: AbortSignal,
  ) {
    return request<{ messageId: string }>(
      user,
      `/messages/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
      { method: 'DELETE', body: { scope }, signal },
    )
  },

  clearConversationMessages(user: AuthUser, conversationId: string, signal?: AbortSignal) {
    return request<{ deletedCount: number }>(
      user,
      `/messages/conversations/${encodeURIComponent(conversationId)}/messages`,
      { method: 'DELETE', signal },
    )
  },

  deleteMessageConversation(user: AuthUser, conversationId: string, signal?: AbortSignal) {
    return request<{ conversationId: string }>(
      user,
      `/messages/conversations/${encodeURIComponent(conversationId)}`,
      { method: 'DELETE', signal },
    )
  },

  fetchProjectTasks(user: AuthUser, projectId: string, options: ProjectTasksOptions = {}) {
    const query = options.assignedToMe ? '?assignedToMe=true' : ''
    return request<{ tasks: ProjectTask[] }>(user, `${projectPath(projectId)}/tasks${query}`, {
      signal: options.signal,
    })
  },

  createProjectTask(
    user: AuthUser,
    projectId: string,
    task: {
      title: string
      description: string
      category: string
      status: 'To do'
      priority: 'low' | 'medium' | 'high'
      chatMessageId: string
      descriptionAttachments: MessageAttachment[]
    },
    signal?: AbortSignal,
  ) {
    return request<{ taskId: string }>(user, `${projectPath(projectId)}/tasks`, {
      method: 'POST',
      body: task,
      signal,
    })
  },

  fetchProjectMeetings(user: AuthUser, projectId: string, signal?: AbortSignal) {
    return request<{ meetings: ProjectMeeting[] }>(user, `${projectPath(projectId)}/meetings`, { signal })
  },

  createProjectMeeting(
    user: AuthUser,
    projectId: string,
    meeting: {
      title: string
      date: string
      startTime: string
      endTime: string
      pinned: boolean
      location: string
      notes: string
      attendeeFirebaseUids: string[]
    },
    signal?: AbortSignal,
  ) {
    return request<{ meeting: ProjectMeeting }>(user, `${projectPath(projectId)}/meetings`, {
      method: 'POST',
      body: meeting,
      signal,
    })
  },

  deleteProjectMeeting(user: AuthUser, projectId: string, meetingId: string, signal?: AbortSignal) {
    return request<{ meetingId: string }>(
      user,
      `${projectPath(projectId)}/meetings/${encodeURIComponent(meetingId)}`,
      { method: 'DELETE', signal },
    )
  },

  fetchProjectReminders(user: AuthUser, projectId: string, signal?: AbortSignal) {
    return request<{ reminders: ProjectReminder[] }>(user, `${projectPath(projectId)}/reminders`, { signal })
  },

  createProjectReminder(
    user: AuthUser,
    projectId: string,
    reminder: { title: string; date: string; time: string; priority: ProjectReminder['priority'] },
    signal?: AbortSignal,
  ) {
    return request<{ reminder: ProjectReminder }>(user, `${projectPath(projectId)}/reminders`, {
      method: 'POST',
      body: reminder,
      signal,
    })
  },

  fetchMembers(user: AuthUser, signal?: AbortSignal) {
    return request<{ members: ProjectMember[] }>(user, '/users/members', { signal })
  },

  fetchProjectResources(user: AuthUser, projectId: string, signal?: AbortSignal) {
    return request<{ resources: ProjectResource[] }>(user, `${projectPath(projectId)}/resources`, { signal })
  },

  createProjectResource(user: AuthUser, projectId: string, title: string, targetUrl: string, category: string, signal?: AbortSignal) {
    return request<{ resource: ProjectResource }>(user, `${projectPath(projectId)}/resources`, {
      method: 'POST', body: { title, targetUrl, category }, signal,
    })
  },

  updateProjectResource(user: AuthUser, projectId: string, resourceId: string, title: string, targetUrl: string, category: string, signal?: AbortSignal) {
    return request<{ resource: ProjectResource }>(user, `${projectPath(projectId)}/resources/${encodeURIComponent(resourceId)}`, {
      method: 'PUT', body: { title, targetUrl, category }, signal,
    })
  },

  deleteProjectResource(user: AuthUser, projectId: string, resourceId: string, signal?: AbortSignal) {
    return request<{ resourceId: string }>(user, `${projectPath(projectId)}/resources/${encodeURIComponent(resourceId)}`, { method: 'DELETE', signal })
  },

  fetchProjectStickyNotes(user: AuthUser, projectId: string, signal?: AbortSignal) {
    return request<{ notes: ProjectStickyNote[] }>(user, `${projectPath(projectId)}/sticky-notes`, { signal })
  },

  createProjectStickyNote(user: AuthUser, projectId: string, content: string, color: ProjectStickyNote['color'], recipientFirebaseUids: string[], position: { x: number; y: number }, signal?: AbortSignal) {
    return request<{ note: ProjectStickyNote }>(user, `${projectPath(projectId)}/sticky-notes`, {
      method: 'POST', body: { content, color, recipientFirebaseUids, position }, signal,
    })
  },

  updateProjectStickyNote(user: AuthUser, projectId: string, noteId: string, changes: { content?: string; color?: ProjectStickyNote['color']; position?: { x: number; y: number } }, signal?: AbortSignal) {
    return request<{ note: ProjectStickyNote }>(user, `${projectPath(projectId)}/sticky-notes/${encodeURIComponent(noteId)}`, {
      method: 'PUT', body: changes, signal,
    })
  },

  deleteProjectStickyNote(user: AuthUser, projectId: string, noteId: string, signal?: AbortSignal) {
    return request<{ noteId: string }>(user, `${projectPath(projectId)}/sticky-notes/${encodeURIComponent(noteId)}`, { method: 'DELETE', signal })
  },

  fetchProjectScratchpad(user: AuthUser, projectId: string, signal?: AbortSignal) {
    return request<{ scratchpad: ProjectScratchpad }>(user, `${projectPath(projectId)}/scratchpad`, { signal })
  },

  saveProjectScratchpad(user: AuthUser, projectId: string, content: string, signal?: AbortSignal) {
    return request<{ scratchpad: ProjectScratchpad }>(user, `${projectPath(projectId)}/scratchpad`, {
      method: 'PUT',
      body: { content },
      signal,
    })
  },

  updateProfileSettings(user: AuthUser, settings: ProfileSettingsInput, signal?: AbortSignal) {
    return request<{ profile: CurrentProfile }>(user, '/users/profile', {
      method: 'PUT',
      body: settings,
      signal,
    })
  },

  updateProfileImage(user: AuthUser, profileImage: string, signal?: AbortSignal) {
    return request<ProfileImageData>(user, '/users/profile-image', {
      method: 'PUT',
      body: { profileImage },
      signal,
    })
  },
}
