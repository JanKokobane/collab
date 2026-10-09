import {
  tasks,
  currentUser,
  saveTasks,
  addAuditLog,
  pushNotification,
  setActiveFilter,
  setActiveDisplayMode
} from './state.js'
import { renderTasks, renderListView, getFilteredTasks } from './tasks.js'
import { openCreateProjectModal, openAddSprintModal, openInviteCollaboratorModal, openManageCollaboratorsModal } from './projects.js'
import { toLocalDateKey } from './dateUtils.js'
import {
  openScheduleMeetingModal,
  openAddReminderModal,
  calCurrentDate,
  setCalCurrentDate,
  setSelectedCalDate,
  renderActualCalendarGrid,
  setActiveCalendarFilter
} from './calendar.js'
import {
  renderAdminProjectsTable,
  renderMembersTable,
  filterMembersByProject,
  getSelectedMembersProject,
  loadProjectMembers,
  renderAdminTasksTable,
  renderAdminMeetingsTable,
  openInviteModal
} from './admin.js'
import {
  currentTheme,
  applyTheme,
  toggleDarkLightMode,
  applyAccent,
  collabSettings,
  saveCollabSettings
} from './theme.js'
import { switchView } from './navigation.js'
import { signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
import { firebaseAuth } from '../../firebase.js'
import { loadProjectMeetings } from './meetings.js'
import { showDashboardToast } from './modalChrome.js'

// ============================================================
// SIMULATE REAL-TIME COLLABORATION EVENT
// ============================================================

export const simulatedEvents = [
  { author: 'SK', name: 'Sam Kim', tone: 'teal-bg', title: 'Task Completed', text: 'Sam Kim completed "Review onboarding flow"', iconType: 'check' },
  { author: 'JL', name: 'Jordan Lee', tone: 'orange-bg', title: 'New Comment', text: 'Jordan Lee commented on "QA final release candidate"', iconType: 'comment' },
  { author: 'ER', name: 'Elena Rostova', tone: 'purple-bg', title: 'Code Review Passed', text: 'Elena Rostova approved PR for Website Redesign', iconType: 'check' },
  { author: 'DP', name: 'Devon Patel', tone: 'blue-bg', title: 'Task Started', text: 'Devon Patel moved "Coordinate newsletter dispatch" to In progress', iconType: 'task' }
]

export function simulateCollaborationEvent() {
  const ev = simulatedEvents[Math.floor(Math.random() * simulatedEvents.length)]
  pushNotification(ev.title, ev.text, ev.author, ev.tone)
  addAuditLog(ev.title, ev.text, ev.iconType)

  const pending = tasks.filter(t => t.status === 'To do')
  if (pending.length > 0) {
    pending[0].status = 'In progress'
    saveTasks()
    renderTasks()
  }
}

// ============================================================
// EVENT LISTENERS INITIALIZATION
// ============================================================

export function initEventListeners() {
  const signinUserBtn = document.querySelector('#signin-user-btn')
  const profileDropdown = document.querySelector('#profile-dropdown-menu')
  const sidebar = document.querySelector('#main-sidebar')
  const sidebarMenuToggle = document.querySelector('#sidebar-menu-toggle')
  const sidebarBackdrop = document.querySelector('#sidebar-backdrop')

  const closeSidebar = () => {
    sidebar?.classList.remove('is-open')
    sidebarBackdrop?.classList.remove('is-visible')
    sidebarMenuToggle?.setAttribute('aria-expanded', 'false')
    document.body.classList.remove('sidebar-open')
  }

  sidebarMenuToggle?.addEventListener('click', () => {
    const isOpen = sidebar?.classList.toggle('is-open') || false
    sidebarBackdrop?.classList.toggle('is-visible', isOpen)
    sidebarMenuToggle.setAttribute('aria-expanded', String(isOpen))
    document.body.classList.toggle('sidebar-open', isOpen)
  })

  sidebarBackdrop?.addEventListener('click', closeSidebar)
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeSidebar()
  })

  // Topbar profile dropdown
  signinUserBtn?.addEventListener('click', e => {
    e.stopPropagation()
    const isHidden = !profileDropdown.style.display || profileDropdown.style.display === 'none'
    profileDropdown.style.display = isHidden ? 'flex' : 'none'
    signinUserBtn.classList.toggle('active', isHidden)
  })

  document.querySelector('#user-profile')?.addEventListener('click', e => {
    e.stopPropagation()
    const isHidden = !profileDropdown.style.display || profileDropdown.style.display === 'none'
    profileDropdown.style.display = isHidden ? 'flex' : 'none'
    signinUserBtn?.classList.toggle('active', isHidden)
  })

  document.addEventListener('click', e => {
    if (profileDropdown && !e.target.closest('#profile-dropdown-wrap') && !e.target.closest('#user-profile')) {
      profileDropdown.style.display = 'none'
      signinUserBtn?.classList.remove('active')
    }
  })

  document.querySelector('#dropdown-settings-btn')?.addEventListener('click', () => {
    if (profileDropdown) profileDropdown.style.display = 'none'
    signinUserBtn?.classList.remove('active')
    switchView('Settings')
  })

  document.querySelector('#dropdown-switch-user-btn')?.addEventListener('click', () => {
    window.location.href = '../auth/auth.html'
  })

  document.querySelector('#dropdown-logout-btn')?.addEventListener('click', async () => {
    localStorage.removeItem('collab-logged-in')
    try {
      await signOut(firebaseAuth)
      window.location.href = '../auth/auth.html?mode=signin'
    } catch (error) {
      console.error('Unable to sign out of Firebase:', error)
      window.alert('Sign out failed. Please try again.')
    }
  })

  // Filter dropdown
  const filterBtn = document.querySelector('#filter-btn')
  const filterMenu = document.querySelector('#filter-menu')
  const filterBtnLabel = document.querySelector('#filter-btn-label')

  filterBtn?.addEventListener('click', e => {
    e.stopPropagation()
    const isFilterHidden = !filterMenu.style.display || filterMenu.style.display === 'none'
    filterMenu.style.display = isFilterHidden ? 'flex' : 'none'
  })

  document.addEventListener('click', e => {
    if (filterMenu && !e.target.closest('#filter-dropdown-wrap')) {
      filterMenu.style.display = 'none'
    }
  })

  document.querySelectorAll('.filter-item').forEach(item => {
    item.addEventListener('click', () => {
      setActiveFilter(item.dataset.filter)
      document.querySelectorAll('.filter-item').forEach(el => el.classList.remove('active'))
      item.classList.add('active')
      if (filterBtnLabel) filterBtnLabel.textContent = item.textContent
      filterMenu.style.display = 'none'
      renderTasks()
    })
  })

  // View mode switcher (Board vs List)
  const viewBoardBtn = document.querySelector('#view-board-btn')
  const viewListBtn = document.querySelector('#view-list-btn')
  const boardColumns = document.querySelector('#board-columns')
  const listViewContainer = document.querySelector('#list-view-container')

  viewBoardBtn?.addEventListener('click', () => {
    setActiveDisplayMode('board')
    viewBoardBtn.classList.add('active')
    viewListBtn?.classList.remove('active')
    if (boardColumns) boardColumns.style.display = 'grid'
    if (listViewContainer) listViewContainer.style.display = 'none'
  })

  viewListBtn?.addEventListener('click', () => {
    setActiveDisplayMode('list')
    viewListBtn.classList.add('active')
    viewBoardBtn?.classList.remove('active')
    if (boardColumns) boardColumns.style.display = 'none'
    if (listViewContainer) listViewContainer.style.display = 'block'
    renderListView(getFilteredTasks())
  })

  // Primary nav items
  document.querySelectorAll('[data-view]').forEach(item => {
    item.addEventListener('click', () => {
      switchView(item.dataset.view)
      closeSidebar()
    })
  })

  // Task creation buttons
  document.querySelectorAll('[data-add]').forEach(button => {
    button.addEventListener('click', () => {
      const currentActive = document.querySelector('.project-nav .nav-item.active')?.dataset?.view
      openAdminTaskModal(button.dataset.add || 'To do', currentActive)
    })
  })

  // Sprints management buttons
  document.querySelector('#add-sprint-btn')?.addEventListener('click', openAddSprintModal)

  // Collaborator invitation & management
  document.querySelector('#project-invite-collab-btn')?.addEventListener('click', openInviteCollaboratorModal)
  document.querySelector('#project-manage-collab-btn')?.addEventListener('click', openManageCollaboratorsModal)
  document.querySelector('#admin-invite-btn')?.addEventListener('click', openInviteCollaboratorModal)
  document.querySelector('#admin-members-invite-btn')?.addEventListener('click', () => {
    openInviteCollaboratorModal(getSelectedMembersProject())
  })
  document.querySelector('#admin-members-project-filter')?.addEventListener('change', event => {
    const filter = event.currentTarget
    if (!(filter instanceof HTMLSelectElement)) return
    filterMembersByProject(filter.value)
  })
  document.querySelector('#admin-invite-project-quick-btn')?.addEventListener('click', () => openInviteCollaboratorModal())

  // Project creation buttons
  document.querySelector('#add-project')?.addEventListener('click', openCreateProjectModal)
  document.querySelector('#admin-create-project-btn')?.addEventListener('click', openCreateProjectModal)
  document.querySelector('#admin-add-project-quick-btn')?.addEventListener('click', openCreateProjectModal)
  document.querySelector('#admin-create-task-btn')?.addEventListener('click', openCreateProjectModal)

  // Global delegated click handling as a fail-safe for project creation and invitation buttons
  document.addEventListener('click', (e) => {
    const createTarget = e.target.closest('#admin-create-project-btn, #admin-add-project-quick-btn, #add-project, #admin-create-task-btn')
    if (createTarget) {
      e.preventDefault()
      openCreateProjectModal()
      return
    }

    const inviteTarget = e.target.closest('#admin-invite-btn, #admin-members-invite-btn, #project-invite-collab-btn, #admin-invite-project-quick-btn')
    if (inviteTarget) {
      e.preventDefault()
      openInviteCollaboratorModal()
      return
    }
  })

  // Admin navigation tabs
  document.querySelectorAll('#admin-tabs-nav .admin-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab
      document.querySelectorAll('#admin-tabs-nav .admin-tab-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')

      document.querySelectorAll('.admin-tab-panel').forEach(panel => {
        const match = panel.id === `admin-tab-${targetTab}`
        panel.style.display = match ? 'flex' : 'none'
        panel.classList.toggle('active', match)
      })

      if (targetTab === 'projects') renderAdminProjectsTable()
      if (targetTab === 'members') {
        loadProjectMembers().catch(error => {
          console.error('Unable to refresh team members:', error)
        })
      }
      if (targetTab === 'tasks') renderAdminTasksTable()
      if (targetTab === 'meetings') {
        loadProjectMeetings().then(() => {
          renderAdminMeetingsTable()
        }).catch(error => {
          console.error('Unable to refresh project meetings:', error)
          showDashboardToast(error.message || 'Project meetings could not be refreshed.', 'error')
        })
      }
    })
  })

  // Theme switcher cards
  document.querySelectorAll('.theme-card').forEach(card => {
    card.addEventListener('click', () => {
      const theme = card.dataset.theme
      applyTheme(theme)
      addAuditLog('Theme changed', `Workspace appearance set to ${theme === 'dark' ? 'Dark Mode' : (theme === 'system' ? 'System Auto' : 'Light Mode')}.`, 'palette')
      pushNotification('Theme Updated', `Switched to ${theme === 'dark' ? 'Dark Mode 🌙' : (theme === 'system' ? 'System Preference 💻' : 'Light (Bright) Mode ☀️')}`, currentUser.initials, 'coral-bg')
    })
  })

  // Accent pills
  document.querySelectorAll('.accent-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      applyAccent(pill.dataset.accent)
      pushNotification('Accent Updated', `Workspace accent set to ${pill.textContent.trim()}`, currentUser.initials, 'blue-bg')
    })
  })

  // Quick Theme Toggle in Topbar
  document.querySelector('#theme-quick-toggle-btn')?.addEventListener('click', toggleDarkLightMode)

  // Banner Quick Theme Toggle in Settings
  document.querySelector('#settings-banner-theme-toggle')?.addEventListener('click', toggleDarkLightMode)

  // Profile Dropdown Quick Theme Toggle
  document.querySelector('#dropdown-theme-toggle-btn')?.addEventListener('click', () => {
    const menu = document.querySelector('#profile-dropdown-menu')
    if (menu) menu.style.display = 'none'
    toggleDarkLightMode()
  })

  // High contrast toggle listener
  document.querySelector('#toggle-high-contrast')?.addEventListener('change', (e) => {
    collabSettings.highContrast = e.target.checked
    document.body.classList.toggle('high-contrast', e.target.checked)
    saveCollabSettings()
    pushNotification('Contrast Updated', `High-contrast obsidian mode ${e.target.checked ? 'enabled' : 'disabled'}`, '👁️', 'coral-bg')
  })

  // Save all settings button
  document.querySelector('#save-all-settings-btn')?.addEventListener('click', () => {
    collabSettings.collabSync = document.querySelector('#toggle-collab-sync')?.checked ?? true
    collabSettings.calendarPins = document.querySelector('#toggle-calendar-pins')?.checked ?? true
    collabSettings.comments = document.querySelector('#toggle-comments')?.checked ?? true
    collabSettings.approvalWorkflow = document.querySelector('#toggle-approval-workflow')?.checked ?? true
    collabSettings.sprintCadence = document.querySelector('#toggle-sprint-cadence')?.checked ?? true
    collabSettings.publicShare = document.querySelector('#toggle-public-share')?.checked ?? true
    collabSettings.soundNotifs = document.querySelector('#toggle-sound-notifs')?.checked ?? true
    collabSettings.huddleLinks = document.querySelector('#toggle-huddle-links')?.checked ?? true
    collabSettings.sprintRollover = document.querySelector('#toggle-sprint-rollover')?.checked ?? true
    collabSettings.multiAssignee = document.querySelector('#toggle-multi-assignee')?.checked ?? true
    collabSettings.highContrast = document.querySelector('#toggle-high-contrast')?.checked ?? false
    collabSettings.adminAuthority = document.querySelector('#toggle-sec-admin-authority')?.checked ?? true
    collabSettings.sessionTimeout = document.querySelector('#toggle-sec-timeout')?.checked ?? true
    saveCollabSettings()

    document.body.classList.toggle('high-contrast', !!collabSettings.highContrast)

    const wsName = document.querySelector('#ws-name-input')?.value || 'Collab HQ'
    const defaultRole = document.querySelector('#ws-default-role-input')?.value || 'Engineer'
    localStorage.setItem('collab-workspace-settings', JSON.stringify({ name: wsName, defaultRole }))

    addAuditLog('Settings saved', 'Workspace preferences and collaboration tool settings saved.', 'shield')
    pushNotification('Settings Saved', 'Workspace settings & collaboration preferences updated.', 'AM', 'coral-bg')
  })

  // Save collaboration tab settings button
  document.querySelector('#save-collab-settings-btn')?.addEventListener('click', () => {
    document.querySelector('#save-all-settings-btn')?.click()
  })

  // Organization form submit
  document.querySelector('#workspace-config-form')?.addEventListener('submit', (e) => {
    e.preventDefault()
    const wsName = document.querySelector('#ws-name-input')?.value || 'Collab HQ'
    const defaultRole = document.querySelector('#ws-default-role-input')?.value || 'Engineer'
    localStorage.setItem('collab-workspace-settings', JSON.stringify({ name: wsName, defaultRole }))
    addAuditLog('Organization updated', `Workspace organization name set to "${wsName}".`, 'shield')
    pushNotification('Organization Saved', `Workspace updated to ${wsName}`, 'AM', 'coral-bg')
  })

  // System color scheme change listener
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (currentTheme === 'system') applyTheme('system')
    })
  }

  // Admin console buttons
  document.querySelector('#admin-create-task-btn')?.addEventListener('click', openCreateProjectModal)
  document.querySelector('#admin-schedule-meeting-btn')?.addEventListener('click', () => openScheduleMeetingModal())
  document.querySelector('#admin-add-meeting-quick-btn')?.addEventListener('click', () => openScheduleMeetingModal())
  document.querySelector('#admin-invite-btn')?.addEventListener('click', openInviteModal)
  // Calendar buttons
  document.querySelector('#cal-schedule-meeting-btn')?.addEventListener('click', () => openScheduleMeetingModal())
  document.querySelector('#cal-add-reminder-btn')?.addEventListener('click', () => openAddReminderModal())
  document.querySelector('#cal-admin-manage-btn')?.addEventListener('click', () => {
    switchView('Admin Console')
    document.querySelector('#admin-tabs-nav button[data-tab="meetings"]')?.click()
  })

  // Calendar Month Controls
  document.querySelector('#cal-prev-month')?.addEventListener('click', () => {
    setCalCurrentDate(new Date(calCurrentDate.getFullYear(), calCurrentDate.getMonth() - 1, 1))
    renderActualCalendarGrid()
  })

  document.querySelector('#cal-next-month')?.addEventListener('click', () => {
    setCalCurrentDate(new Date(calCurrentDate.getFullYear(), calCurrentDate.getMonth() + 1, 1))
    renderActualCalendarGrid()
  })

  document.querySelector('#cal-today-btn')?.addEventListener('click', () => {
    const today = new Date()
    setCalCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelectedCalDate(toLocalDateKey(today))
    renderActualCalendarGrid()
  })

  document.querySelectorAll('#cal-filter-pills .cal-filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#cal-filter-pills .cal-filter-pill').forEach(p => p.classList.remove('active'))
      pill.classList.add('active')
      setActiveCalendarFilter(pill.dataset.type)
      renderActualCalendarGrid()
    })
  })

  // Topbar search filter
  document.querySelector('#search')?.addEventListener('input', event => {
    const query = event.target.value.toLowerCase()
    document.querySelectorAll('.task-card').forEach(card => {
      card.hidden = !card.textContent.toLowerCase().includes(query)
    })
    document.querySelectorAll('#list-tasks-tbody tr').forEach(row => {
      row.hidden = !row.textContent.toLowerCase().includes(query)
    })
  })
}
