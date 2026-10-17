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
import { loadProjectCalendarData } from './calendarData.js'
import { loadProjectResources, loadProjectScratchpad } from './workspaceResources.js'
import { showDashboardToast } from './modalChrome.js'
import { renderProjectStickyNotes } from './projectStickyNotes.js'

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

  renderProjectStickyNotes()
  enhanceInputsWithIcons(document)
  if (['Calendar', 'Workspace', 'Admin Console'].includes(viewName)) {
    const dataLoad = viewName === 'Calendar'
      ? Promise.all([loadProjectMeetings(), loadProjectCalendarData()])
      : Promise.all([
        loadProjectMeetings(),
        ...(viewName === 'Workspace' || viewName === 'Admin Console' ? [loadProjectResources()] : []),
        ...(viewName === 'Workspace' ? [loadProjectScratchpad()] : [])
      ])
    dataLoad.then(() => {
      if (activeView !== viewName) return
      if (viewName === 'Calendar') hub.renderCalendarPanel?.()
      if (viewName === 'Workspace') hub.renderWorkspaceHub?.()
      if (viewName === 'Admin Console') {
        hub.renderAdminMeetingsTable?.()
        hub.renderWorkspaceManagement?.()
      }
    }).catch(error => {
      console.error('Unable to refresh collaboration data for this view:', error)
      if (activeView === viewName) {
        showDashboardToast(error.message || 'Collaboration data could not be refreshed.', 'error')
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
    const cardTop = make('div', 'project-card-top')
    const heading = make('h3')
    const dot = make('i', 'dot')
    const allowedColors = ['yellow', 'green', 'blue', 'purple', 'coral', 'orange', 'rose']
    dot.classList.add(allowedColors.includes(p.color) ? p.color : 'yellow')
    heading.append(dot, document.createTextNode(p.name || ''))
    cardTop.append(heading, make(
      'span',
      'project-task-count',
      `${completed} of ${projTasks.length} tasks`
    ))

    const description = make('p', 'project-card-desc', p.description || '')
    const progressWrap = make('div', 'project-progress-wrap')
    const progressHeader = make('div', 'progress-header')
    progressHeader.append(make('span', '', 'Progress'), make('span', '', `${pct}%`))
    const progress = make('div', 'progress')
    progress.style.maxWidth = '100%'
    const progressBar = make('span')
    progressBar.style.width = `${pct}%`
    progress.append(progressBar)
    progressWrap.append(progressHeader, progress)

    const footer = make('div', 'project-card-footer')
    footer.style.cssText = 'margin-top: 14px; font-size: 11px; color: #71717A; display: flex; justify-content: space-between;'
    const lead = make('span')
    lead.append(document.createTextNode('👑 Lead: '), make('strong', '', p.creatorName || ''))
    const sprints = make('span')
    sprints.append(
      document.createTextNode('⚡ Sprints: '),
      make('strong', '', String((p.sprints || []).length))
    )
    footer.append(lead, sprints)
    card.append(cardTop, description, progressWrap, footer)
    card.addEventListener('click', () => switchView(p.name))
    container.append(card)
  })

  if (activityContainer) {
    activityContainer.replaceChildren()
    auditLogs.slice(0, 4).forEach(log => {
      const item = make('div', 'audit-item')
      const requestedIcon = log.iconType || 'sync'
      const iconKey = /^[a-zA-Z][\w-]*$/.test(requestedIcon) ? requestedIcon : 'sync'
      const iconBadge = make('span', 'activity-icon-badge')
      iconBadge.classList.add(iconKey)
      iconBadge.innerHTML = getSvg(iconKey, 'activity-svg', 16, 16)
      const content = make('div', 'audit-content')
      content.append(
        make('strong', '', log.action || ''),
        make('p', '', `${log.detail || ''} • ${log.time || ''}`)
      )
      item.append(iconBadge, content)
      activityContainer.append(item)
    })
  }

  if (workloadContainer) {
    workloadContainer.replaceChildren()
    members.forEach(m => {
      const count = tasks.filter(t => t.assignee === m.initials && t.status !== 'Done').length
      const item = make('div', 'workload-item')
      const workloadLeft = make('div', 'workload-left')
      const avatarTone = /^[a-zA-Z][\w-]*$/.test(m.tone || '') ? m.tone : 'coral'
      const avatar = make('div', `avatar ${avatarTone}-bg`, m.initials || '')
      const memberDetails = make('div')
      memberDetails.append(make('strong', '', m.name || ''), make('small', '', m.role || ''))
      workloadLeft.append(avatar, memberDetails)
      item.append(
        workloadLeft,
        make('span', 'workload-count', `${count} active ${count === 1 ? 'task' : 'tasks'}`)
      )
      workloadContainer.append(item)
    })
  }
}
