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
  openInflowTaskPane,
  closeInflowTaskPane,
  openEditTaskInline,
  currentDetailTaskId
} from './js/taskDetail.js'

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
import { initMessages, renderMessages } from './js/messages.js'
import { initModalChrome } from './js/modalChrome.js'
import { initProfileOnboarding } from './js/profileOnboarding.js'
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
import { firebaseAuth } from '../firebase.js'
import { api } from './js/api.js'

let notificationRefreshInterval = null

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
  renderAdminTasksTable,
  renderAdminMeetingsTable,
  renderAuditLogs,
  renderProjectNav,
  switchView,
  openInflowTaskPane,
  closeInflowTaskPane,
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
  if (notificationRefreshInterval) {
    clearInterval(notificationRefreshInterval)
    notificationRefreshInterval = null
  }
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
  updateUserUI()

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
    renderProjectNav()
    renderAdminProjectsTable()
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
    await loadNotificationsFromAPI()
    notificationRefreshInterval = setInterval(async () => {
      if (document.visibilityState !== 'visible') return
      try {
        await loadNotificationsFromAPI()
      } catch (error) {
        console.error('Unable to refresh notifications for the signed-in user:', error)
      }
    }, 30_000)
  } catch (error) {
    console.error('Unable to load notifications for the signed-in user:', error)
  }
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
  openInflowTaskPane,
  closeInflowTaskPane,
  openEditTaskInline,
  currentDetailTaskId,
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
