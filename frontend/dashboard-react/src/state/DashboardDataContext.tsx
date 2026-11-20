import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AuthUser } from '../auth/authClient.js'
import { dashboardApi } from '../services/dashboardApi.js'
import type {
  CurrentProfile,
  MessageConversation,
  Notification,
  Project,
  ProjectMeeting,
  ProjectMember,
  ProjectTask,
} from '../types/dashboard.js'

export interface DashboardResource<T> {
  data: T
  loading: boolean
  error: string | null
}

export interface DashboardData {
  profile: DashboardResource<CurrentProfile | null>
  profileImage: DashboardResource<string>
  projects: DashboardResource<Project[]>
  notifications: DashboardResource<Notification[]>
  conversations: DashboardResource<MessageConversation[]>
  tasks: DashboardResource<Record<string, ProjectTask[]>>
  meetings: DashboardResource<Record<string, ProjectMeeting[]>>
  members: DashboardResource<ProjectMember[]>
  refresh: () => Promise<void>
  refreshProfile: () => Promise<void>
  refreshProfileImage: () => Promise<void>
  refreshProjects: () => Promise<void>
  refreshNotifications: () => Promise<void>
  refreshConversations: () => Promise<void>
  refreshTasks: () => Promise<void>
  refreshMeetings: () => Promise<void>
  refreshMembers: () => Promise<void>
}

type ResourceKey = 'profile' | 'profileImage' | 'projects' | 'notifications' | 'conversations' | 'tasks' | 'meetings' | 'members'
type Snapshot = Pick<DashboardData, 'profile' | 'profileImage' | 'projects' | 'notifications' | 'conversations' | 'tasks' | 'meetings' | 'members'>

const emptyResource = <T,>(data: T): DashboardResource<T> => ({ data, loading: false, error: null })
const initialSnapshot = (): Snapshot => ({
  profile: emptyResource(null),
  profileImage: emptyResource(''),
  projects: emptyResource([]),
  notifications: emptyResource([]),
  conversations: emptyResource([]),
  tasks: emptyResource({}),
  meetings: emptyResource({}),
  members: emptyResource([]),
})

const DashboardDataContext = createContext<DashboardData | null>(null)

interface DashboardDataProviderProps {
  user: AuthUser
  children: ReactNode
}

export function DashboardDataProvider({ user, children }: DashboardDataProviderProps) {
  const [snapshot, setSnapshot] = useState<Snapshot>(initialSnapshot)
  const controllerRef = useRef<AbortController | null>(null)

  const markLoading = useCallback((keys: ResourceKey[], loading: boolean) => {
    setSnapshot((current) => {
      let next = current
      for (const key of keys) {
        if (key === 'profile') next = { ...next, profile: { ...next.profile, loading, error: loading ? null : next.profile.error } }
        else if (key === 'profileImage') next = { ...next, profileImage: { ...next.profileImage, loading, error: loading ? null : next.profileImage.error } }
        else if (key === 'projects') next = { ...next, projects: { ...next.projects, loading, error: loading ? null : next.projects.error } }
        else if (key === 'notifications') next = { ...next, notifications: { ...next.notifications, loading, error: loading ? null : next.notifications.error } }
        else if (key === 'conversations') next = { ...next, conversations: { ...next.conversations, loading, error: loading ? null : next.conversations.error } }
        else if (key === 'tasks') next = { ...next, tasks: { ...next.tasks, loading, error: loading ? null : next.tasks.error } }
        else if (key === 'meetings') next = { ...next, meetings: { ...next.meetings, loading, error: loading ? null : next.meetings.error } }
        else if (key === 'members') next = { ...next, members: { ...next.members, loading, error: loading ? null : next.members.error } }
      }
      return next
    })
  }, [])

  const setError = useCallback((key: ResourceKey, error: unknown) => {
    const message = error instanceof Error ? error.message : 'The dashboard data could not be loaded.'
    setSnapshot((current) => {
      if (key === 'profile') return { ...current, profile: { ...current.profile, loading: false, error: message } }
      if (key === 'profileImage') return { ...current, profileImage: { ...current.profileImage, loading: false, error: message } }
      if (key === 'projects') return { ...current, projects: { ...current.projects, loading: false, error: message } }
      if (key === 'notifications') return { ...current, notifications: { ...current.notifications, loading: false, error: message } }
      if (key === 'conversations') return { ...current, conversations: { ...current.conversations, loading: false, error: message } }
      if (key === 'tasks') return { ...current, tasks: { ...current.tasks, loading: false, error: message } }
      if (key === 'meetings') return { ...current, meetings: { ...current.meetings, loading: false, error: message } }
      return { ...current, members: { ...current.members, loading: false, error: message } }
    })
  }, [])

  const loadProfile = useCallback(async (signal: AbortSignal) => {
    markLoading(['profile'], true)
    try {
      const response = await dashboardApi.fetchCurrentProfile(user, signal)
      setSnapshot((current) => ({ ...current, profile: { data: response.data.profile, loading: false, error: null } }))
    } catch (error) {
      if (!signal.aborted) setError('profile', error)
    }
  }, [markLoading, setError, user])

  const loadProfileImage = useCallback(async (signal: AbortSignal) => {
    markLoading(['profileImage'], true)
    try {
      const response = await dashboardApi.fetchProfileImage(user, signal)
      setSnapshot((current) => ({ ...current, profileImage: { data: response.data.profileImage, loading: false, error: null } }))
    } catch (error) {
      if (!signal.aborted) setError('profileImage', error)
    }
  }, [markLoading, setError, user])

  const loadProjects = useCallback(async (signal: AbortSignal) => {
    markLoading(['projects', 'tasks', 'meetings'], true)
    try {
      const response = await dashboardApi.fetchProjects(user, signal)
      const projects = response.data.projects
      setSnapshot((current) => ({ ...current, projects: { data: projects, loading: false, error: null } }))
      await Promise.all([
        loadProjectTasks(user, projects, signal, setSnapshot, setError),
        loadProjectMeetings(user, projects, signal, setSnapshot, setError),
      ])
    } catch (error) {
      if (!signal.aborted) {
        setError('projects', error)
        markLoading(['tasks', 'meetings'], false)
      }
    }
  }, [markLoading, setError, user])

  const loadNotifications = useCallback(async (signal: AbortSignal) => {
    markLoading(['notifications'], true)
    try {
      const response = await dashboardApi.fetchNotifications(user, signal)
      setSnapshot((current) => ({ ...current, notifications: { data: response.data.notifications, loading: false, error: null } }))
    } catch (error) {
      if (!signal.aborted) setError('notifications', error)
    }
  }, [markLoading, setError, user])

  const loadConversations = useCallback(async (signal: AbortSignal) => {
    markLoading(['conversations'], true)
    try {
      const response = await dashboardApi.fetchMessageConversations(user, signal)
      setSnapshot((current) => ({ ...current, conversations: { data: response.data.conversations, loading: false, error: null } }))
    } catch (error) {
      if (!signal.aborted) setError('conversations', error)
    }
  }, [markLoading, setError, user])

  const loadMembers = useCallback(async (signal: AbortSignal) => {
    markLoading(['members'], true)
    try {
      const response = await dashboardApi.fetchMembers(user, signal)
      setSnapshot((current) => ({ ...current, members: { data: response.data.members, loading: false, error: null } }))
    } catch (error) {
      if (!signal.aborted) setError('members', error)
    }
  }, [markLoading, setError, user])

  const withController = useCallback(async (action: (signal: AbortSignal) => Promise<void>) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    await action(controller.signal)
  }, [])

  const refresh = useCallback(() => withController(async (signal) => {
    await Promise.all([
      loadProfile(signal),
      loadProfileImage(signal),
      loadProjects(signal),
      loadNotifications(signal),
      loadConversations(signal),
      loadMembers(signal),
    ])
  }), [loadConversations, loadMembers, loadNotifications, loadProfile, loadProfileImage, loadProjects, withController])

  const refreshProfile = useCallback(() => withController(loadProfile), [loadProfile, withController])
  const refreshProfileImage = useCallback(() => withController(loadProfileImage), [loadProfileImage, withController])
  const refreshProjects = useCallback(() => withController(loadProjects), [loadProjects, withController])
  const refreshNotifications = useCallback(() => withController(loadNotifications), [loadNotifications, withController])
  const refreshConversations = useCallback(() => withController(loadConversations), [loadConversations, withController])
  const refreshTasks = useCallback(() => withController(async (signal) => {
    await loadProjectTasks(user, snapshot.projects.data, signal, setSnapshot, setError)
  }), [setError, snapshot.projects.data, user])
  const refreshMeetings = useCallback(() => withController(async (signal) => {
    await loadProjectMeetings(user, snapshot.projects.data, signal, setSnapshot, setError)
  }), [setError, snapshot.projects.data, user])
  const refreshMembers = useCallback(() => withController(loadMembers), [loadMembers, withController])

  useEffect(() => {
    void refresh()
    return () => controllerRef.current?.abort()
  }, [refresh])

  const value = useMemo<DashboardData>(() => ({
    ...snapshot,
    refresh,
    refreshProfile,
    refreshProfileImage,
    refreshProjects,
    refreshNotifications,
    refreshConversations,
    refreshTasks,
    refreshMeetings,
    refreshMembers,
  }), [refresh, refreshConversations, refreshMeetings, refreshMembers, refreshNotifications, refreshProfile, refreshProfileImage, refreshProjects, refreshTasks, snapshot])

  return <DashboardDataContext.Provider value={value}>{children}</DashboardDataContext.Provider>
}

async function loadProjectTasks(
  user: AuthUser,
  projects: Project[],
  signal: AbortSignal,
  setSnapshot: React.Dispatch<React.SetStateAction<Snapshot>>,
  setError: (key: ResourceKey, error: unknown) => void,
) {
  setSnapshot((current) => ({ ...current, tasks: { ...current.tasks, loading: true, error: null } }))
  const results = await Promise.allSettled(projects.map(async (project) => {
    const response = await dashboardApi.fetchProjectTasks(user, project.project_id, { signal })
    return [project.project_id, response.data.tasks] as const
  }))
  if (signal.aborted) return
  const tasks: Record<string, ProjectTask[]> = {}
  const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
  for (const result of results) if (result.status === 'fulfilled') tasks[result.value[0]] = result.value[1]
  setSnapshot((current) => ({
    ...current,
    tasks: { data: tasks, loading: false, error: failure ? errorMessage(failure.reason) : null },
  }))
  if (failure) setError('tasks', failure.reason)
}

async function loadProjectMeetings(
  user: AuthUser,
  projects: Project[],
  signal: AbortSignal,
  setSnapshot: React.Dispatch<React.SetStateAction<Snapshot>>,
  setError: (key: ResourceKey, error: unknown) => void,
) {
  setSnapshot((current) => ({ ...current, meetings: { ...current.meetings, loading: true, error: null } }))
  const results = await Promise.allSettled(projects.map(async (project) => {
    const response = await dashboardApi.fetchProjectMeetings(user, project.project_id, signal)
    return [project.project_id, response.data.meetings] as const
  }))
  if (signal.aborted) return
  const meetings: Record<string, ProjectMeeting[]> = {}
  const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
  for (const result of results) if (result.status === 'fulfilled') meetings[result.value[0]] = result.value[1]
  setSnapshot((current) => ({
    ...current,
    meetings: { data: meetings, loading: false, error: failure ? errorMessage(failure.reason) : null },
  }))
  if (failure) setError('meetings', failure.reason)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The dashboard data could not be loaded.'
}

export function useDashboardData() {
  const context = useContext(DashboardDataContext)
  if (!context) throw new Error('useDashboardData must be used within DashboardDataProvider.')
  return context
}
