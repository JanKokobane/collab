import { getSvg, enhanceInputsWithIcons } from './icons.js'
import {
  projects,
  tasks,
  members,
  auditLogs,
  activeView,
  setActiveView,
  setActiveSprintFilter,
  make,
  hub
} from './state.js'
import { updateUserUI } from './auth.js'
import { initSettingsControls } from './theme.js'
import { loadProjectMeetings } from './meetings.js'
import { showDashboardToast } from './modalChrome.js'

// ============================================================
// VIEW SWITCHING (WORKSPACE COLLABORATION HUB)
// ============================================================

export function switchView(viewName) {
  setActiveView(viewName)
  setActiveSprintFilter('all')
  document.querySelectorAll('.primary-nav .nav-item, .sidebar-bottom .nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === viewName)
  })

  document.querySelectorAll('.project-nav .nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === viewName)
  })

  const breadcrumb = document.querySelector('#breadcrumb-title')

  if (breadcrumb) {
    breadcrumb.textContent = viewName === 'Workspace' ? 'All Collaboration Tasks' : viewName
  }

  updateUserUI()
  hub.renderWorkspaceSummary?.()

  const boardContainer = document.querySelector('#board-container')
  const calendarContainer = document.querySelector('#calendar-container')
  const adminContainer = document.querySelector('#admin-container')
  const settingsContainer = document.querySelector('#settings-container')
  const notificationsContainer = document.querySelector('#notifications-container')
  const messagesContainer = document.querySelector('#messages-container')
  const workspace = document.querySelector('.workspace')
  const mainContent = document.querySelector('.main-content')
  const projectSprintsStrip = document.querySelector('#project-sprints-strip')
  const brainstormContainer = document.querySelector('#brainstorm-container')
  const workspaceHubContainer = document.querySelector('#workspace-hub-container')
  const statsStrip = document.querySelector('.stats')
  const pageHeadingSubtitle = document.querySelector('.subtitle')
  const pageHeading = document.querySelector('.page-heading')

  if (pageHeading) {
    const hideProjectActions = ['Workspace', 'My Tasks', 'Overview', 'Calendar', 'Admin Console', 'Settings', 'Notifications', 'Brainstorm', 'Messages'].includes(activeView)
    pageHeading.style.display = hideProjectActions ? 'none' : ''
  }

  if (boardContainer) boardContainer.style.display = 'none'
  if (calendarContainer) calendarContainer.style.display = 'none'
  if (adminContainer) adminContainer.style.display = 'none'
  if (settingsContainer) settingsContainer.style.display = 'none'
  if (notificationsContainer) notificationsContainer.style.display = 'none'
  if (messagesContainer) messagesContainer.style.display = 'none'
  workspace?.classList.toggle('messages-active', activeView === 'Messages')
  mainContent?.classList.toggle('messages-view-active', activeView === 'Messages')
  if (brainstormContainer) brainstormContainer.style.display = 'none'
  if (workspaceHubContainer) workspaceHubContainer.style.display = 'none'
  if (projectSprintsStrip) projectSprintsStrip.style.display = 'none'

  if (activeView === 'Calendar') {
    if (calendarContainer) calendarContainer.style.display = 'flex'
    if (statsStrip) statsStrip.style.display = 'none'
    if (pageHeadingSubtitle) {
      pageHeadingSubtitle.textContent = 'Interactive calendar with pinned team meetings, deliverable deadlines, and collaboration syncs.'
    }
    hub.renderCalendarPanel?.()
  } else if (activeView === 'Admin Console') {
    if (adminContainer) adminContainer.style.display = 'flex'
    if (statsStrip) statsStrip.style.display = 'none'
    if (pageHeadingSubtitle) {
      pageHeadingSubtitle.textContent = 'Centrally manage workspace projects, members, task creation, and team meetings.'
    }
    hub.renderAdminProjectsTable?.()
    hub.renderMembersTable?.()
    hub.renderAdminTasksTable?.()
    hub.renderAdminMeetingsTable?.()
    hub.renderWorkspaceManagement?.()
  } else if (activeView === 'Settings') {
    if (settingsContainer) settingsContainer.style.display = 'flex'
    if (statsStrip) statsStrip.style.display = 'none'
    if (pageHeadingSubtitle) {
      pageHeadingSubtitle.textContent = 'Configure appearance themes (Dark / Light mode), collaboration tools, member permissions, and workspace security policies.'
    }
    initSettingsControls()
    hub.renderNotifications?.()
    hub.renderAuditLogs?.()
  } else if (activeView === 'Messages') {
    if (messagesContainer) messagesContainer.style.display = 'flex'
    if (statsStrip) statsStrip.style.display = 'none'
    hub.renderMessages?.()
  } else if (activeView === 'Notifications') {
    if (notificationsContainer) notificationsContainer.style.display = 'flex'
    if (statsStrip) statsStrip.style.display = 'none'
    hub.renderNotifications?.()
  } else if (activeView === 'Brainstorm') {
    if (brainstormContainer) brainstormContainer.style.display = 'flex'
    if (statsStrip) statsStrip.style.display = 'none'
    hub.renderBrainstorm?.()
  } else if (activeView === 'Workspace') {
    if (workspaceHubContainer) workspaceHubContainer.style.display = 'flex'
    if (statsStrip) statsStrip.style.display = 'none'
    hub.renderWorkspaceHub?.()
  } else if (activeView === 'My Tasks') {
    if (boardContainer) boardContainer.style.display = 'block'
    if (statsStrip) statsStrip.style.display = 'grid'
    if (pageHeadingSubtitle) {
      pageHeadingSubtitle.textContent = 'Unified collaboration board displaying all team deliverables across active projects.'
    }
    hub.renderTasks?.()
  } else {
    if (boardContainer) boardContainer.style.display = 'block'
    if (statsStrip) statsStrip.style.display = 'grid'
    if (pageHeadingSubtitle) {
      pageHeadingSubtitle.textContent = `A shared space for your team to plan, track, and ship meaningful work.`
    }
    hub.renderTasks?.()
  }

  enhanceInputsWithIcons(document)
  if (['Calendar', 'Workspace', 'Admin Console'].includes(viewName)) {
    loadProjectMeetings().then(() => {
      if (activeView !== viewName) return
      if (viewName === 'Calendar') hub.renderCalendarPanel?.()
      if (viewName === 'Workspace') hub.renderWorkspaceHub?.()
      if (viewName === 'Admin Console') hub.renderAdminMeetingsTable?.()
    }).catch(error => {
      console.error('Unable to refresh project meetings for this view:', error)
      if (activeView === viewName) {
        showDashboardToast(error.message || 'Project meetings could not be refreshed.', 'error')
      }
    })
  }
}

// ============================================================
// OVERVIEW PANEL (Workspace Summary & Professional Activity)
// ============================================================

export function renderOverviewPanel() {
  const container = document.querySelector('#overview-projects-grid')
  const activityContainer = document.querySelector('#overview-activity-list')
  const workloadContainer = document.querySelector('#overview-workload-list')
  if (!container) return

  container.replaceChildren()
  projects.forEach(p => {
    const projTasks = tasks.filter(t => t.project === p.name)
    const completed = projTasks.filter(t => t.status === 'Done').length
    const pct = projTasks.length > 0 ? Math.round((completed / projTasks.length) * 100) : 0

    const card = make('div', 'overview-project-card')
    card.innerHTML = `
      <div class="project-card-top">
        <h3><i class="dot ${p.color}"></i> ${p.name}</h3>
        <span class="project-task-count">${completed} of ${projTasks.length} tasks</span>
      </div>
      <p class="project-card-desc">${p.description}</p>
      <div class="project-progress-wrap">
        <div class="progress-header">
          <span>Progress</span>
          <span>${pct}%</span>
        </div>
        <div class="progress" style="max-width: 100%;">
          <span style="width: ${pct}%;"></span>
        </div>
      </div>
      <div class="project-card-footer" style="margin-top: 14px; font-size: 11px; color: #71717A; display: flex; justify-content: space-between;">
        <span>👑 Lead: <strong>${p.creatorName}</strong></span>
        <span>⚡ Sprints: <strong>${(p.sprints || []).length}</strong></span>
      </div>
    `
    card.addEventListener('click', () => switchView(p.name))
    container.append(card)
  })

  if (activityContainer) {
    activityContainer.replaceChildren()
    auditLogs.slice(0, 4).forEach(log => {
      const item = make('div', 'audit-item')
      const iconKey = log.iconType || 'sync'
      item.innerHTML = `
        <span class="activity-icon-badge ${iconKey}">
          ${getSvg(iconKey, 'activity-svg', 16, 16)}
        </span>
        <div class="audit-content">
          <strong>${log.action}</strong>
          <p>${log.detail} • ${log.time}</p>
        </div>
      `
      activityContainer.append(item)
    })
  }

  if (workloadContainer) {
    workloadContainer.replaceChildren()
    members.forEach(m => {
      const count = tasks.filter(t => t.assignee === m.initials && t.status !== 'Done').length
      const item = make('div', 'workload-item')
      item.innerHTML = `
        <div class="workload-left">
          <div class="avatar ${m.tone}-bg">${m.initials}</div>
          <div>
            <strong>${m.name}</strong>
            <small>${m.role}</small>
          </div>
        </div>
        <span class="workload-count">${count} active ${count === 1 ? 'task' : 'tasks'}</span>
      `
      workloadContainer.append(item)
    })
  }
}
