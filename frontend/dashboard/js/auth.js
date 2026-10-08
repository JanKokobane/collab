import { getSvg } from './icons.js'
import { firebaseAuth } from '../../firebase.js'
import {
  projects,
  members,
  tasks,
  currentUser,
  setCurrentUser,
  renderAvatarElement,
  activeView,
  activeSprintFilter,
  setActiveSprintFilter,
  make,
  closeModal,
  root,
  addAuditLog,
  pushNotification,
  hub
} from './state.js'

// ============================================================
// PROJECT CREATOR PRIVILEGES & ROLE HELPERS
// ============================================================

export function getActiveProject() {
  return projects.find(p => p.name === activeView) || projects[0]
}

export function isCurrentUserProjectCreator() {
  const proj = getActiveProject()
  const uid = firebaseAuth.currentUser?.uid
  return Boolean(proj?.creatorFirebaseUid && uid && proj.creatorFirebaseUid === uid)
}

export function updateCreatorControlStrip() {
  const proj = getActiveProject()
  const isCreator = isCurrentUserProjectCreator()
  const strip = document.querySelector('#creator-control-strip')
  const stripTitle = document.querySelector('#creator-strip-title')
  const stripDesc = document.querySelector('#creator-strip-desc')
  const pillCreator = document.querySelector('#pill-creator-view')
  const pillMember = document.querySelector('#pill-member-view')

  if (!strip) return

  if (activeView === 'Overview' || activeView === 'Calendar' || activeView === 'Admin Console' || activeView === 'Settings' || activeView === 'Notifications' || activeView === 'Brainstorm' || activeView === 'Messages' || activeView === 'Workspace' || activeView === 'My Tasks') {
    strip.style.display = 'none'
    return
  }
  strip.style.display = 'flex'

  if (isCreator) {
    if (stripTitle) stripTitle.textContent = `Project Creator: ${proj.creatorName} (Full Control)`
    if (stripDesc) stripDesc.textContent = `You created "${proj.name}". You have full authority to create tasks, assign members, break work into sprints, invite/remove collaborators, and approve completed work.`
    pillCreator?.classList.add('active')
    pillMember?.classList.remove('active')
  } else {
    if (stripTitle) stripTitle.textContent = `Invited Member View: ${currentUser.name}`
    if (stripDesc) stripDesc.textContent = `Only ${proj.creatorName} (who created "${proj.name}") can add tasks and assign people. You can work on assigned tasks, move cards between columns, submit work, and comment.`
    pillCreator?.classList.remove('active')
    pillMember?.classList.add('active')
  }
}

export function renderSprintChips() {
  const container = document.querySelector('#sprint-chips-list')
  const strip = document.querySelector('#project-sprints-strip')
  const proj = getActiveProject()
  if (!container || !strip) return

  if (activeView === 'Overview' || activeView === 'Calendar' || activeView === 'Admin Console' || activeView === 'Settings' || activeView === 'Notifications' || activeView === 'Brainstorm' || activeView === 'Messages' || activeView === 'Workspace' || activeView === 'My Tasks') {
    strip.style.display = 'none'
    return
  }

  strip.style.display = 'flex'
  container.replaceChildren()

  // "All Sprints" filter chip
  const allChip = make('div', `sprint-chip ${activeSprintFilter === 'all' ? 'active' : ''}`)
  allChip.innerHTML = `<span>All Tasks</span> <small>${tasks.filter(t => t.project === proj.name).length}</small>`
  allChip.addEventListener('click', () => {
    setActiveSprintFilter('all')
    renderSprintChips()
    hub.renderTasks?.()
  })
  container.append(allChip)

  if (!proj.sprints || proj.sprints.length === 0) {
    proj.sprints = [
      { id: `s_${Date.now()}`, name: 'Sprint 1: Core Deliverables', status: 'Active' }
    ]
  }

  proj.sprints.forEach(sprint => {
    const isAct = activeSprintFilter === sprint.name
    const chip = make('div', `sprint-chip ${isAct ? 'active' : ''}`)
    const count = tasks.filter(t => t.project === proj.name && t.sprint === sprint.name).length
    chip.innerHTML = `<span>${sprint.name}</span> <small>${sprint.status || 'Active'} • ${count}</small>`
    chip.addEventListener('click', () => {
      setActiveSprintFilter(isAct ? 'all' : sprint.name)
      renderSprintChips()
      hub.renderTasks?.()
    })
    container.append(chip)
  })
}

// ============================================================
// USER UI & PROFILE DROPDOWN
// ============================================================

export function updateUserUI() {
  const isAdmin = currentUser?.isAdmin || (currentUser?.role && currentUser.role.toLowerCase().includes('admin'))
  const ownsProject = projects.some(project =>
    project.creatorFirebaseUid && project.creatorFirebaseUid === firebaseAuth.currentUser?.uid
  )
  const proj = getActiveProject()
  const isCreator = isCurrentUserProjectCreator()

  const topbarInitials = document.querySelector('#topbar-avatar-initials')
  if (topbarInitials && currentUser) {
    renderAvatarElement(topbarInitials, currentUser, 'topbar-avatar-circle')
  }

  const topbarName = document.querySelector('#topbar-profile-name')
  const topbarRole = document.querySelector('#topbar-profile-role')
  if (topbarName && currentUser) topbarName.textContent = currentUser.name
  if (topbarRole && currentUser) topbarRole.textContent = currentUser.role || (isAdmin ? 'Workspace Admin' : 'Active Member')

  const userBtn = document.querySelector('#signin-user-btn')
  if (userBtn && currentUser) {
    userBtn.title = `${currentUser.name} (${currentUser.role || (isAdmin ? 'Workspace Admin' : 'Active Member')}) — Account Settings`
  }

  const dropdownAvatar = document.querySelector('#dropdown-avatar')
  if (dropdownAvatar && currentUser) {
    renderAvatarElement(dropdownAvatar, currentUser, 'profile-dropdown-avatar')
  }

  const dropdownName = document.querySelector('#dropdown-name')
  if (dropdownName && currentUser) {
    dropdownName.textContent = currentUser.name
  }

  const dropdownEmail = document.querySelector('#dropdown-email')
  if (dropdownEmail && currentUser) {
    dropdownEmail.textContent = currentUser.email
  }

  const dropdownRole = document.querySelector('#dropdown-role')
  if (dropdownRole && currentUser) {
    dropdownRole.textContent = `Role: ${currentUser.role || (isAdmin ? 'Workspace Admin' : 'Product Designer')}`
  }

  const avatar = document.querySelector('#sidebar-avatar')
  if (avatar && currentUser) {
    renderAvatarElement(avatar, currentUser, '')
  }

  const nameEl = document.querySelector('#sidebar-name')
  if (nameEl && currentUser) {
    nameEl.textContent = currentUser.name
  }

  const roleEl = document.querySelector('#sidebar-role')
  if (roleEl && currentUser) {
    roleEl.textContent = currentUser.role || (isAdmin ? 'Workspace Admin' : 'Active Member')
  }

  const adminTag = document.querySelector('#admin-active-status-tag')
  if (adminTag) {
    adminTag.textContent = ownsProject ? 'Project Creator' : 'Invited Member (Read Only)'
  }
  const adminNav = document.querySelector('#admin-nav-item')
  if (adminNav) adminNav.style.display = ownsProject ? '' : 'none'

  const creatorBadge = document.querySelector('#project-creator-badge')
  const creatorBadgeText = document.querySelector('#project-creator-badge-text')
  if (creatorBadge) {
    if (activeView === 'Calendar' || activeView === 'Admin Console') {
      creatorBadge.style.display = 'none'
    } else if (activeView === 'Workspace' || activeView === 'My Tasks') {
      creatorBadge.style.display = 'inline-flex'
      creatorBadge.className = 'creator-badge owner'
      if (creatorBadgeText) creatorBadgeText.textContent = `All Active Projects & Deliverables (${tasks.length} Total Tasks)`
    } else {
      creatorBadge.style.display = 'inline-flex'
      if (isCreator) {
        creatorBadge.className = 'creator-badge owner'
        if (creatorBadgeText) creatorBadgeText.textContent = `You created this project (${proj.creatorName} — Full Control)`
      } else {
        creatorBadge.className = 'creator-badge guest'
        if (creatorBadgeText) creatorBadgeText.textContent = `Created by ${proj.creatorName} (Project Lead)`
      }
    }
  }

  const newTaskBtn = document.querySelector('#new-task-btn')
  if (newTaskBtn) {
    if (activeView === 'Workspace' || activeView === 'My Tasks' || isCreator) {
      newTaskBtn.className = 'primary-button gold'
      newTaskBtn.innerHTML = '+ <span>New task</span>'
      newTaskBtn.title = `Create and assign a task`
    } else {
      newTaskBtn.className = 'primary-button disabled-permission'
      newTaskBtn.innerHTML = `${getSvg('lock', 'btn-lock-svg', 13, 13)} <span>New task (${proj.creatorName} Only)</span>`
      newTaskBtn.title = `Only ${proj.creatorName} (Project Creator) can create and assign tasks for ${proj.name}.`
    }
  }

  document.querySelectorAll('.column-plus, .add-card').forEach(btn => {
    btn.style.display = (activeView === 'Workspace' || isCreator) ? 'block' : 'none'
  })

  const addSprintBtn = document.querySelector('#add-sprint-btn')
  if (addSprintBtn) {
    addSprintBtn.style.display = isCreator ? 'inline-block' : 'none'
  }

  const sprintsBtnText = document.querySelector('#sprints-btn-text')
  if (sprintsBtnText && proj && proj.sprints) {
    sprintsBtnText.textContent = `Sprints (${proj.sprints.length})`
  }

  const collabBtnCount = document.querySelector('#collab-btn-count')
  if (collabBtnCount && proj) {
    const list = proj.invitedMembers || members
    collabBtnCount.textContent = `${list.length} Team Members`
  }

  updateCreatorControlStrip()
  renderSprintChips()
}

export function toggleAdminRole() {
  const currentIsAdmin = currentUser.isAdmin || (currentUser.role && currentUser.role.toLowerCase().includes('admin'))
  if (currentIsAdmin) {
    currentUser.isAdmin = false
    currentUser.role = 'Product Designer (Invited Member)'
    addAuditLog('Role switched', `${currentUser.name} switched to Member view.`, 'team')
    pushNotification('Role Changed', `${currentUser.name} switched to Member view (Task creation restricted)`, '👤', 'orange-bg')
  } else {
    currentUser.isAdmin = true
    currentUser.role = 'Workspace Admin'
    addAuditLog('Role elevated', `${currentUser.name} elevated to Workspace Admin.`, 'shield')
    pushNotification('Admin Role Granted', `${currentUser.name} now has full workspace permissions`, '👑', 'coral-bg')
  }
  setCurrentUser(currentUser)
  updateUserUI()
  hub.renderMembersTable?.()
  hub.renderTasks?.()
}

export function switchTestingPerspective(mode) {
  const proj = getActiveProject()
  if (mode === 'creator') {
    setCurrentUser({
      name: proj.creatorName,
      email: proj.creatorEmail,
      initials: proj.creatorInitials,
      role: 'Project Creator (Lead)',
      isAdmin: true,
      tone: 'coral'
    })
    pushNotification('Creator Perspective Active', `Logged in as ${proj.creatorName} with full management powers`, proj.creatorInitials, 'coral-bg')
    addAuditLog('Perspective switched', `Active test user set to Project Creator: ${proj.creatorName}.`, 'shield')
  } else {
    setCurrentUser({
      name: 'Jordan Lee',
      email: 'jordan@collab.io',
      initials: 'JL',
      role: 'Designer (Invited Member)',
      isAdmin: false,
      tone: 'orange'
    })
    pushNotification('Member Perspective Active', `Logged in as Jordan Lee (Invited Collaborator — Task creation restricted)`, 'JL', 'orange-bg')
    addAuditLog('Perspective switched', `Active test user set to Invited Collaborator: Jordan Lee.`, 'team')
  }
  updateUserUI()
  hub.renderTasks?.()
  hub.renderMembersTable?.()
}

export function showPermissionNotice() {
  const proj = getActiveProject()
  const backdrop = make('div', 'modal-backdrop')
  const box = make('div', 'modal')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)

  const crown = make('div', 'avatar coral-bg')
  crown.innerHTML = getSvg('crown', 'modal-crown-svg', 24, 24)
  crown.style.width = '52px'
  crown.style.height = '52px'
  crown.style.margin = '0 auto 16px'
  crown.style.display = 'flex'
  crown.style.alignItems = 'center'
  crown.style.justifyContent = 'center'

  const title = make('h2', '', 'Project Creator Privileges Required')
  title.style.textAlign = 'center'
  title.style.marginBottom = '8px'

  const copy = make('p', 'modal-copy', `Only ${proj.creatorName} (who created "${proj.name}") has authority to add new tasks, assign collaborators, break the project into sprints, and approve deliverables. You are currently viewing as an invited collaborator (${currentUser.name}). You have full access to view, update statuses, move task cards, and comment on work.`)
  copy.style.textAlign = 'center'
  copy.style.lineHeight = '1.5'
  copy.style.marginBottom = '20px'

  const switchBtn = make('button', 'primary-button full gold', `👑 Switch to ${proj.creatorName} View (Test Creator Mode)`)
  switchBtn.type = 'button'
  switchBtn.addEventListener('click', () => {
    closeModal()
    switchTestingPerspective('creator')
  })

  const createOwnBtn = make('button', 'outline-button', '+ Create My Own Project Board')
  createOwnBtn.type = 'button'
  createOwnBtn.style.marginTop = '10px'
  createOwnBtn.addEventListener('click', () => {
    closeModal()
    hub.openCreateProjectModal?.()
  })

  box.append(close, crown, title, copy, switchBtn, createOwnBtn)
  backdrop.append(box)
  root.replaceChildren(backdrop)
}
