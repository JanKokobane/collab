import type { AuthUser } from '../auth/authClient.js'
import type {
  ApiFailure,
  ApiResponse,
  CurrentProfile,
  MessageConversation,
  Notification,
  ProfileImageData,
  ProfileSettingsInput,
  Project,
  ProjectMeeting,
  ProjectMember,
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

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
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

  fetchProjectTasks(user: AuthUser, projectId: string, options: ProjectTasksOptions = {}) {
    const query = options.assignedToMe ? '?assignedToMe=true' : ''
    return request<{ tasks: ProjectTask[] }>(user, `${projectPath(projectId)}/tasks${query}`, {
      signal: options.signal,
    })
  },

  fetchProjectMeetings(user: AuthUser, projectId: string, signal?: AbortSignal) {
    return request<{ meetings: ProjectMeeting[] }>(user, `${projectPath(projectId)}/meetings`, { signal })
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
