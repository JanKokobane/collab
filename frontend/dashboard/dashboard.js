// ============================================================
// COLLAB WORKSPACE — DASHBOARD MASTER ENTRY SCRIPT
// Directly links all modular JS scripts and coordinates UI
// ============================================================

import {
  registerHub,
  updateNotifCount,
  members,
  projects,
  tasks,
  meetings,
  reminders,
  currentUser,
  setCurrentUser,
  getUserInitials,
  activeView,
  activeFilter,
  activeSprintFilter,
  activeDisplayMode,
  auditLogs,
  loadProjectsFromAPI,
  loadNotificationsFromAPI,
  clearNotificationsForSignedOutUser
} from './js/state.js'

import {
  updateUserUI,
  getActiveProject,
  isCurrentUserProjectCreator,
  updateCreatorControlStrip,
  renderSprintChips,
  toggleAdminRole,
  switchTestingPerspective,
  showPermissionNotice
} from './js/auth.js'

import {
  renderProjectNav,
  openCreateProjectModal,
  openEditProjectModal,
  openAddSprintModal,
  openInviteCollaboratorModal,
  openManageCollaboratorsModal
} from './js/projects.js'

import { enhanceInputsWithIcons } from './js/icons.js'

import {
  renderTasks,
  renderListView,
  getFilteredTasks,
  updateTaskCounts,
  moveTaskStatus,
  taskCard,
  setupDragAndDrop
} from './js/tasks.js'

import {
  renderCalendarPanel,
  renderPinnedMeetingsStrip,
  renderActualCalendarGrid,
  renderCalendarDaysGrid,
  openScheduleMeetingModal,
  openAddReminderModal,
  openDayScheduleModal,
  createScheduleCalendarPicker
} from './js/calendar.js'

import {
  renderAdminProjectsTable,
  renderMembersTable,
  loadProjectMembers,
  renderAdminTasksTable,
  renderAdminMeetingsTable,
  renderAuditLogs,
  openAdminTaskModal,
  openAdminEditTaskModal,
  openInviteModal
} from './js/admin.js'

import {
  switchView,
  renderOverviewPanel
} from './js/navigation.js'

import {
  currentTheme,
  currentAccent,
  applyTheme,
  applyAccent,
  initSettingsControls,
  populateProfileForm,
  toggleDarkLightMode,
  collabSettings
} from './js/theme.js'
import { api } from './js/api.js'

import {
  initEventListeners,
  simulateCollaborationEvent
} from './js/events.js'
import {
  renderWorkspaceHub,
  renderWorkspaceSummary,
  renderWorkspaceManagement,
  renderBrainstorm,
  renderNotifications,
  initWorkspaceHubEvents
} from './js/workspaceHub.js'
import { initMessages, refreshMessagesForCurrentUser, renderMessages } from './js/messages.js'
import { initProfileOnboarding } from './js/profileOnboarding.js'
import {
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
import { firebaseAuth } from '../firebase.js'
import { loadProjectMeetings } from './js/meetings.js'
import { initModalChrome, showDashboardToast } from './js/modalChrome.js'

let notificationRefreshInterval = null
let notificationRefreshDelay = 30_000
let notificationRefreshWarningShown = false
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000
let inactivityTimer = null
let inactivityUserUid = null
let lastActivityAt = 0
let inactivityLogoutStarted = false

function isInactivityLogoutEnabled() {
  try {
    const savedSettings = JSON.parse(localStorage.getItem('collab_tool_settings') || '{}')
    return savedSettings.sessionTimeout !== false
  } catch (error) {
    console.warn('Unable to read the inactivity logout setting; using the enabled default.', error)
    return true
  }
}

function inactivityStorageKey(uid) {
  return `collab-last-activity-${uid}`
}

function clearInactivityTimer() {
  if (inactivityTimer !== null) {
    window.clearTimeout(inactivityTimer)
    inactivityTimer = null
  }
}

function scheduleInactivityLogout() {
  clearInactivityTimer()
  if (!inactivityUserUid || !firebaseAuth.currentUser || inactivityLogoutStarted || !isInactivityLogoutEnabled()) return

  const remaining = Math.max(0, INACTIVITY_TIMEOUT_MS - (Date.now() - lastActivityAt))
  inactivityTimer = window.setTimeout(() => {
    if (Date.now() - lastActivityAt >= INACTIVITY_TIMEOUT_MS) {
      logoutForInactivity()
    } else {
      scheduleInactivityLogout()
    }
  }, remaining)
}

function recordUserActivity() {
  const user = firebaseAuth.currentUser
  if (!user || !isInactivityLogoutEnabled() || inactivityLogoutStarted) return

  const now = Date.now()
  if (now - lastActivityAt < 5_000) return
  lastActivityAt = now
  localStorage.setItem(inactivityStorageKey(user.uid), String(now))
  scheduleInactivityLogout()
}

async function logoutForInactivity() {
  if (inactivityLogoutStarted || !firebaseAuth.currentUser) return
  if (!isInactivityLogoutEnabled()) {
    scheduleInactivityLogout()
    return
  }
  inactivityLogoutStarted = true
  clearInactivityTimer()
  const expiredUid = inactivityUserUid
  localStorage.removeItem('collab-logged-in')
  try {
    await signOut(firebaseAuth)
    if (expiredUid) localStorage.removeItem(inactivityStorageKey(expiredUid))
    window.location.replace('../auth/auth.html?mode=signin&reason=inactivity')
  } catch (error) {
    inactivityLogoutStarted = false
    console.error('Unable to sign out after inactivity:', error)
    showDashboardToast('Automatic sign-out failed. Please sign out manually.', 'error')
    scheduleInactivityLogout()
  }
}

function initializeInactivityLogout(user) {
  clearInactivityTimer()
  inactivityUserUid = user?.uid || null
  inactivityLogoutStarted = false
  if (!user) {
    lastActivityAt = 0
    return
  }

  const key = inactivityStorageKey(user.uid)
  const storedActivity = Number(localStorage.getItem(key))
  lastActivityAt = Number.isFinite(storedActivity) && storedActivity > 0
    ? storedActivity
    : Date.now()
  if (!storedActivity) localStorage.setItem(key, String(lastActivityAt))
  scheduleInactivityLogout()
}

for (const activityEvent of ['pointerdown', 'keydown', 'touchstart', 'scroll', 'mousemove']) {
  document.addEventListener(activityEvent, recordUserActivity, { passive: true })
}

window.addEventListener('storage', event => {
  if (event.key === 'collab_tool_settings') {
    scheduleInactivityLogout()
    return
  }
  if (inactivityUserUid && event.key === inactivityStorageKey(inactivityUserUid)) {
    const sharedActivity = Number(event.newValue)
    if (Number.isFinite(sharedActivity) && sharedActivity > lastActivityAt) {
      lastActivityAt = sharedActivity
      scheduleInactivityLogout()
    }
  }
})

window.addEventListener('collab-session-timeout-setting-changed', event => {
  if (event.detail?.enabled) {
    lastActivityAt = Date.now()
    if (inactivityUserUid) {
      localStorage.setItem(inactivityStorageKey(inactivityUserUid), String(lastActivityAt))
    }
  }
  scheduleInactivityLogout()
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && inactivityUserUid &&
      Date.now() - lastActivityAt >= INACTIVITY_TIMEOUT_MS && isInactivityLogoutEnabled()) {
    logoutForInactivity()
  }
})

function scheduleNotificationRefresh(delay = notificationRefreshDelay) {
  clearTimeout(notificationRefreshInterval)
  notificationRefreshInterval = window.setTimeout(async () => {
    notificationRefreshInterval = null
    if (!firebaseAuth.currentUser) return

    if (document.visibilityState !== 'visible') {
      scheduleNotificationRefresh(30_000)
      return
    }

    try {
      await loadNotificationsFromAPI()
      notificationRefreshDelay = 30_000
      notificationRefreshWarningShown = false
    } catch (error) {
      if (!notificationRefreshWarningShown) {
        console.warn('Unable to refresh notifications for the signed-in user; will retry:', error)
        notificationRefreshWarningShown = true
      }
      const retryDelay = notificationRefreshDelay
      notificationRefreshDelay = Math.min(notificationRefreshDelay * 2, 300_000)
      scheduleNotificationRefresh(retryDelay)
      return
    }

    scheduleNotificationRefresh()
  }, delay)
}

// Register all actions on the central hub for synchronous, zero-lag coordination
registerHub({
  renderWorkspaceHub,
  renderWorkspaceManagement,
  renderBrainstorm,
  renderNotifications,
  renderMessages,
  renderTasks,
  renderListView,
  renderOverviewPanel,
  renderWorkspaceSummary,
  renderCalendarPanel,
  renderAdminProjectsTable,
  renderMembersTable,
  loadProjectMembers,
  renderAdminTasksTable,
  renderAdminMeetingsTable,
  renderAuditLogs,
  renderProjectNav,
  switchView,
  openDayScheduleModal,
  openAdminTaskModal,
  openCreateProjectModal,
  openEditProjectModal,
  openInviteCollaboratorModal,
  moveTaskStatus,
  updateUserUI
})

// Initialize workspace theme, accent, and settings controls
applyTheme(currentTheme)
applyAccent(currentAccent)
initSettingsControls()
initModalChrome()
initEventListeners()
initWorkspaceHubEvents()
initMessages()

// Initial Dashboard Renders
updateUserUI()
renderProjectNav()
renderTasks()
renderAdminProjectsTable()
renderMembersTable()
renderAdminTasksTable()
renderAdminMeetingsTable()
renderAuditLogs()
updateNotifCount()
switchView(activeView)
initProfileOnboarding()
enhanceInputsWithIcons(document)

onAuthStateChanged(firebaseAuth, async user => {
  initializeInactivityLogout(user)
  clearTimeout(notificationRefreshInterval)
  notificationRefreshInterval = null
  notificationRefreshDelay = 30_000
  notificationRefreshWarningShown = false
  clearNotificationsForSignedOutUser()
  if (!user) {
    const returnToDashboard = encodeURIComponent('../dashboard/dashboard.html')
    window.location.replace(`../auth/auth.html?mode=signin&return=${returnToDashboard}`)
    return
  }

  let storedUser = null
  try {
    storedUser = JSON.parse(localStorage.getItem('collab-user') || 'null')
  } catch (error) {
    console.warn('Unable to read the saved dashboard profile:', error)
  }
  const savedUser = currentUser?.uid === user.uid
    ? currentUser
    : storedUser?.uid === user.uid
      ? storedUser
      : null
  const userName = (
    savedUser?.uid === user.uid ? savedUser.name : ''
  ) || user.displayName || user.email?.split('@')[0] || 'Collab User'
  setCurrentUser({
    ...(savedUser?.uid === user.uid ? savedUser : {}),
    uid: user.uid,
    name: userName,
    email: user.email || savedUser?.email || '',
    initials: getUserInitials(userName),
    photoURL: user.photoURL || savedUser?.photoURL || '',
    profileImage: user.photoURL || savedUser?.profileImage || '',
    role: savedUser?.uid === user.uid ? savedUser.role || 'Member' : 'Member',
    isAdmin: savedUser?.uid === user.uid ? Boolean(savedUser.isAdmin) : false
  })

  try {
    let profileImageResponse = await api.get('/users/profile-image')
    let savedProfileImage = profileImageResponse?.data?.profileImage || ''

    const legacyProfileImage = savedUser?.uid === user.uid
      ? savedUser.profileImage || ''
      : ''
    if (
      !savedProfileImage &&
      /^data:image\/(?:jpeg|png|webp);base64,/.test(legacyProfileImage) &&
      legacyProfileImage.length <= 350_000
    ) {
      profileImageResponse = await api.put('/users/profile-image', {
        profileImage: legacyProfileImage
      })
      savedProfileImage = profileImageResponse?.data?.profileImage || ''
    }

    if (savedProfileImage) {
      setCurrentUser({
        ...currentUser,
        profileImage: savedProfileImage,
        photoURL: savedProfileImage
      })
    }
  } catch (error) {
    console.error('Unable to restore the signed-in user profile photo:', error)
  }

  try {
    const response = await api.get('/users/profile')
    const savedProfile = response?.data?.profile
    if (savedProfile) {
      setCurrentUser({
        ...currentUser,
        ...Object.fromEntries(
          Object.entries(savedProfile).filter(([, value]) => value !== null && value !== undefined)
        ),
        uid: user.uid,
        initials: getUserInitials(savedProfile.name || currentUser.name)
      })
    }
  } catch (error) {
    console.error('Unable to restore the signed-in user profile:', error)
    showDashboardToast(error.message || 'Your profile could not be loaded from the server.', 'error')
  }

  updateUserUI()
  populateProfileForm()

  try {
    const inviteToken = new URLSearchParams(window.location.search).get('invite')
    let acceptedProjectId = null
    if (inviteToken) {
      const acceptance = await api.post('/invitations/accept', { token: inviteToken })
      acceptedProjectId = acceptance?.data?.projectId || null
      const url = new URL(window.location.href)
      url.searchParams.delete('invite')
      window.history.replaceState({}, '', url)
    }
    await loadProjectsFromAPI()
    try {
      await loadProjectMeetings()
    } catch (error) {
      console.error('Unable to load project meetings:', error)
      showDashboardToast(error.message || 'Project meetings could not be loaded.', 'error')
    }
    refreshMessagesForCurrentUser()
    renderProjectNav()
    renderAdminProjectsTable()
    renderAdminMeetingsTable()
    await renderAdminTasksTable()
    const selectedProject = projects.find(project => project.id === acceptedProjectId)
    const builtInViews = [
      'Overview',
      'Calendar',
      'Admin Console',
      'Settings',
      'Notifications',
      'Brainstorm',
      'Messages',
      'Workspace',
      'My Tasks'
    ]
    const activeProjectIsAvailable = projects.some(project => project.name === activeView)
    switchView(
      selectedProject?.name ||
      (builtInViews.includes(activeView) || activeProjectIsAvailable ? activeView : 'Workspace')
    )
  } catch (error) {
    console.error('Unable to load projects for the dashboard:', error)
  }

  try {
    await loadProjectMembers()
  } catch (error) {
    console.error('Unable to load project members for the dashboard:', error)
  }

  scheduleNotificationRefresh(0)
})

// Re-export core modules and functions
export {
  members,
  projects,
  tasks,
  meetings,
  reminders,
  currentUser,
  activeView,
  activeFilter,
  activeSprintFilter,
  activeDisplayMode,
  auditLogs,
  collabSettings,
  updateUserUI,
  getActiveProject,
  isCurrentUserProjectCreator,
  updateCreatorControlStrip,
  renderSprintChips,
  toggleAdminRole,
  switchTestingPerspective,
  showPermissionNotice,
  renderProjectNav,
  renderAdminProjectsTable,
  openCreateProjectModal,
  openEditProjectModal,
  openAddSprintModal,
  openInviteCollaboratorModal,
  openManageCollaboratorsModal,
  renderTasks,
  renderListView,
  getFilteredTasks,
  updateTaskCounts,
  moveTaskStatus,
  taskCard,
  setupDragAndDrop,
  renderCalendarPanel,
  renderPinnedMeetingsStrip,
  renderActualCalendarGrid,
  renderCalendarDaysGrid,
  openScheduleMeetingModal,
  openAddReminderModal,
  openDayScheduleModal,
  createScheduleCalendarPicker,
  renderMembersTable,
  renderAdminTasksTable,
  renderAdminMeetingsTable,
  renderAuditLogs,
  openAdminTaskModal,
  openAdminEditTaskModal,
  openInviteModal,
  switchView,
  renderOverviewPanel,
  currentTheme,
  currentAccent,
  applyTheme,
  applyAccent,
  initSettingsControls,
  toggleDarkLightMode,
  initEventListeners,
  simulateCollaborationEvent
}
