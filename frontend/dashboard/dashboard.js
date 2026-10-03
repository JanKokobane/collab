// ============================================================
// CLEAN PROFESSIONAL SVG ICON GENERATOR
// ============================================================

function getSvg(iconName, extraClass = '', width = 14, height = 14) {
  const icons = {
    shield: `<svg class="${extraClass}" width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
    sync: `<svg class="${extraClass}" width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"></path></svg>`,
    team: `<svg class="${extraClass}" width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
    check: `<svg class="${extraClass}" width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    checkCircle: `<svg class="${extraClass}" width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
    calendar: `<svg class="${extraClass}" width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,
    clock: `<svg class="${extraClass}" width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
    message: `<svg class="${extraClass}" width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
    dots: `<svg class="${extraClass}" width="${width}" height="${height}" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="19" cy="12" r="2"></circle></svg>`,
    lock: `<svg class="${extraClass}" width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`,
    edit: `<svg class="${extraClass}" width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
    plus: `<svg class="${extraClass}" width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    crown: `<svg class="${extraClass}" width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
    arrowRight: `<svg class="${extraClass}" width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
    arrowLeft: `<svg class="${extraClass}" width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>`,
    userPlus: `<svg class="${extraClass}" width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7.5" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>`,
    trash: `<svg class="${extraClass}" width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
    flag: `<svg class="${extraClass}" width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>`
  }
  return icons[iconName] || icons.shield
}

// ============================================================
// INITIAL SEED DATA
// ============================================================

const defaultMembers = [
  { id: 'm1', name: 'Alex Morgan', email: 'admin@collab.io', initials: 'AM', role: 'Workspace Admin', tone: 'coral', status: 'Active' },
  { id: 'm2', name: 'Sam Kim', email: 'sam@collab.io', initials: 'SK', role: 'Product Lead', tone: 'teal', status: 'Active' },
  { id: 'm3', name: 'Jordan Lee', email: 'jordan@collab.io', initials: 'JL', role: 'Designer', tone: 'orange', status: 'Active' },
  { id: 'm4', name: 'Elena Rostova', email: 'elena@collab.io', initials: 'ER', role: 'Engineer', tone: 'purple', status: 'Active' },
  { id: 'm5', name: 'Devon Patel', email: 'devon@collab.io', initials: 'DP', role: 'Engineer', tone: 'blue', status: 'Active' }
]

const defaultProjects = [
  {
    id: 'p1',
    name: 'Product Launch',
    color: 'coral',
    description: 'Plan, coordinate and ship the Q4 product release.',
    creatorEmail: 'admin@collab.io',
    creatorName: 'Alex Morgan',
    creatorInitials: 'AM',
    invitedMembers: [
      { id: 'm1', name: 'Alex Morgan', email: 'admin@collab.io', initials: 'AM', role: 'Project Creator (Admin)', tone: 'coral' },
      { id: 'm2', name: 'Sam Kim', email: 'sam@collab.io', initials: 'SK', role: 'Product Lead', tone: 'teal' },
      { id: 'm3', name: 'Jordan Lee', email: 'jordan@collab.io', initials: 'JL', role: 'Designer', tone: 'orange' },
      { id: 'm4', name: 'Elena Rostova', email: 'elena@collab.io', initials: 'ER', role: 'Engineer', tone: 'purple' },
      { id: 'm5', name: 'Devon Patel', email: 'devon@collab.io', initials: 'DP', role: 'Engineer', tone: 'blue' }
    ],
    sprints: [
      { id: 's1', name: 'Sprint 1: Wireframes', status: 'Completed' },
      { id: 's2', name: 'Sprint 2: Analytics & MVP', status: 'Active' },
      { id: 's3', name: 'Sprint 3: Release & Launch', status: 'Upcoming' }
    ]
  },
  {
    id: 'p2',
    name: 'Website Redesign',
    color: 'blue',
    description: 'Modernize marketing website, improve UX, and boost conversion.',
    creatorEmail: 'elena@collab.io',
    creatorName: 'Elena Rostova',
    creatorInitials: 'ER',
    invitedMembers: [
      { id: 'm4', name: 'Elena Rostova', email: 'elena@collab.io', initials: 'ER', role: 'Project Creator', tone: 'purple' },
      { id: 'm1', name: 'Alex Morgan', email: 'admin@collab.io', initials: 'AM', role: 'Workspace Admin', tone: 'coral' },
      { id: 'm3', name: 'Jordan Lee', email: 'jordan@collab.io', initials: 'JL', role: 'Designer', tone: 'orange' }
    ],
    sprints: [
      { id: 's4', name: 'Sprint 1: Typography & Layout', status: 'Active' },
      { id: 's5', name: 'Sprint 2: Performance & SEO', status: 'Upcoming' }
    ]
  },
  {
    id: 'p3',
    name: 'Marketing Sprint',
    color: 'green',
    description: 'Multi-channel acquisition sprint across paid and content.',
    creatorEmail: 'sam@collab.io',
    creatorName: 'Sam Kim',
    creatorInitials: 'SK',
    invitedMembers: [
      { id: 'm2', name: 'Sam Kim', email: 'sam@collab.io', initials: 'SK', role: 'Project Creator', tone: 'teal' },
      { id: 'm1', name: 'Alex Morgan', email: 'admin@collab.io', initials: 'AM', role: 'Workspace Admin', tone: 'coral' },
      { id: 'm5', name: 'Devon Patel', email: 'devon@collab.io', initials: 'DP', role: 'Engineer', tone: 'blue' }
    ],
    sprints: [
      { id: 's6', name: 'Sprint 1: Content & Dispatch', status: 'Active' }
    ]
  }
]

const seedTasks = [
  {
    id: 1,
    project: 'Product Launch',
    title: 'Create wireframes for the new dashboard',
    tag: 'Design',
    tagTone: 'purple',
    due: 'Today',
    assignee: 'AM',
    assigneeName: 'Alex Morgan',
    assigneeTone: 'teal',
    status: 'To do',
    progress: 72,
    sprint: 'Sprint 1: Wireframes',
    approvalStatus: 'approved',
    approvedBy: 'Alex Morgan',
    description: 'Bring the dashboard concept to life with clear, low-fidelity wireframes.',
    comments: 2,
    commentsList: [
      { id: 101, author: 'JL', authorName: 'Jordan Lee', tone: 'orange', text: 'Reviewed the specs, looks solid!', time: '2 hours ago' },
      { id: 102, author: 'SK', authorName: 'Sam Kim', tone: 'teal', text: 'Make sure to include mobile responsiveness.', time: '1 hour ago' }
    ]
  },
  {
    id: 2,
    project: 'Product Launch',
    title: 'Set up analytics tracking',
    tag: 'Development',
    tagTone: 'blue',
    due: 'Tomorrow',
    assignee: 'JL',
    assigneeName: 'Jordan Lee',
    assigneeTone: 'orange',
    status: 'To do',
    progress: 35,
    sprint: 'Sprint 2: Analytics & MVP',
    approvalStatus: 'none',
    description: 'Add key events and conversion tracking for the product launch.',
    comments: 1,
    commentsList: [
      { id: 103, author: 'AM', authorName: 'Alex Morgan', tone: 'coral', text: 'Segment tracking IDs are ready in the repo.', time: '3 hours ago' }
    ]
  },
  {
    id: 3,
    project: 'Product Launch',
    title: 'Write launch announcement',
    tag: 'Marketing',
    tagTone: 'green',
    due: 'Oct 8',
    assignee: 'SK',
    assigneeName: 'Sam Kim',
    assigneeTone: 'pink',
    status: 'In progress',
    progress: 45,
    sprint: 'Sprint 2: Analytics & MVP',
    approvalStatus: 'none',
    description: 'Draft the announcement for the upcoming launch campaign.',
    comments: 0,
    commentsList: []
  },
  {
    id: 4,
    project: 'Product Launch',
    title: 'Review onboarding flow',
    tag: 'Product',
    tagTone: 'yellow',
    due: 'Oct 10',
    assignee: 'AM',
    assigneeName: 'Alex Morgan',
    assigneeTone: 'teal',
    status: 'In progress',
    progress: 58,
    sprint: 'Sprint 2: Analytics & MVP',
    approvalStatus: 'none',
    description: 'Review the onboarding experience and note opportunities to reduce friction.',
    comments: 1,
    commentsList: [
      { id: 104, author: 'JL', authorName: 'Jordan Lee', tone: 'orange', text: 'User drop-off is highest at step 2.', time: 'Yesterday' }
    ]
  },
  {
    id: 5,
    project: 'Product Launch',
    title: 'Prepare product screenshots',
    tag: 'Design',
    tagTone: 'purple',
    due: 'Oct 12',
    assignee: 'SK',
    assigneeName: 'Sam Kim',
    assigneeTone: 'pink',
    status: 'Done',
    progress: 100,
    sprint: 'Sprint 1: Wireframes',
    approvalStatus: 'approved',
    approvedBy: 'Alex Morgan',
    description: 'Capture polished screenshots for the launch page and social channels.',
    comments: 1,
    commentsList: [
      { id: 105, author: 'SK', authorName: 'Sam Kim', tone: 'teal', text: 'Uploaded 4 high-res assets to the team Drive.', time: '2 days ago' }
    ]
  },
  {
    id: 6,
    project: 'Product Launch',
    title: 'QA final release candidate',
    tag: 'Development',
    tagTone: 'blue',
    due: 'Oct 14',
    assignee: 'JL',
    assigneeName: 'Jordan Lee',
    assigneeTone: 'orange',
    status: 'Done',
    progress: 100,
    sprint: 'Sprint 3: Release & Launch',
    approvalStatus: 'pending_approval',
    description: 'Run through the release checklist and record any blocking issues.',
    comments: 0,
    commentsList: []
  },
  {
    id: 7,
    project: 'Website Redesign',
    title: 'Optimize hero asset loading',
    tag: 'Development',
    tagTone: 'blue',
    due: 'Today',
    assignee: 'ER',
    assigneeName: 'Elena Rostova',
    assigneeTone: 'purple',
    status: 'In progress',
    progress: 60,
    sprint: 'Sprint 1: Typography & Layout',
    approvalStatus: 'none',
    description: 'Convert banners to WebP and enable responsive srcsets.',
    comments: 0,
    commentsList: []
  },
  {
    id: 8,
    project: 'Marketing Sprint',
    title: 'Coordinate newsletter dispatch',
    tag: 'Marketing',
    tagTone: 'green',
    due: 'Tomorrow',
    assignee: 'DP',
    assigneeName: 'Devon Patel',
    assigneeTone: 'blue',
    status: 'To do',
    progress: 20,
    sprint: 'Sprint 1: Content & Dispatch',
    approvalStatus: 'none',
    description: 'Finalize copy and preview test send to beta testers.',
    comments: 1,
    commentsList: [
      { id: 106, author: 'SK', authorName: 'Sam Kim', tone: 'teal', text: 'A/B testing subject lines is set up.', time: '4 hours ago' }
    ]
  }
]

// ============================================================
// STATE & DATA REPAIR / HYDRATION
// ============================================================

let members = JSON.parse(localStorage.getItem('collab-members') || 'null') || defaultMembers
let projects = JSON.parse(localStorage.getItem('collab-projects') || 'null') || defaultProjects
let tasks = JSON.parse(localStorage.getItem('collab-tasks') || 'null') || seedTasks

// Ensure projects have creator, invitedMembers, and sprints
projects.forEach(p => {
  if (!p.creatorEmail) {
    p.creatorEmail = 'admin@collab.io'
    p.creatorName = 'Alex Morgan'
    p.creatorInitials = 'AM'
  }
  if (!p.invitedMembers || p.invitedMembers.length === 0) {
    p.invitedMembers = members.map(m => ({ ...m }))
  }
  if (!p.sprints || p.sprints.length === 0) {
    p.sprints = [
      { id: `s_${p.id}_1`, name: 'Sprint 1: Wireframes & Setup', status: 'Completed' },
      { id: `s_${p.id}_2`, name: 'Sprint 2: Core Implementation', status: 'Active' },
      { id: `s_${p.id}_3`, name: 'Sprint 3: Release & Launch', status: 'Upcoming' }
    ]
  }
})

// Ensure tasks have approvalStatus and sprint
tasks.forEach(t => {
  if (t.approvalStatus === undefined) {
    t.approvalStatus = t.status === 'Done' ? 'approved' : 'none'
  }
  if (!t.sprint) {
    t.sprint = 'Sprint 2: Core Implementation'
  }
})

const defaultUser = { name: 'Alex Morgan', email: 'admin@collab.io', initials: 'AM', tone: 'coral', role: 'Workspace Admin', isAdmin: true }
let currentUser = JSON.parse(localStorage.getItem('collab-user') || 'null') || defaultUser

let activeView = 'Product Launch'
let activeFilter = 'all' // 'all' | 'mine' | 'todo' | 'progress' | 'done'
let activeSprintFilter = 'all' // 'all' | sprintName
let activeDisplayMode = 'board' // 'board' | 'list'

const root = document.querySelector('#modal-root')

const saveProjects = () => localStorage.setItem('collab-projects', JSON.stringify(projects))
const saveTasks = () => localStorage.setItem('collab-tasks', JSON.stringify(tasks))
const saveMembers = () => localStorage.setItem('collab-members', JSON.stringify(members))

// Professional activity and audit log with SVG icon keys
let auditLogs = [
  { iconType: 'shield', action: 'Collaborator session active', detail: 'Alex Morgan (mashathabiso2006) active in Collab workspace.', time: 'Just now' },
  { iconType: 'sync', action: 'Group projects synchronized', detail: '3 collaborative boards ready for active sprints.', time: '5 mins ago' },
  { iconType: 'team', action: 'Team active', detail: '5 collaborators available for task assignments.', time: '15 mins ago' }
]

function addAuditLog(action, detail, iconType = 'sync') {
  auditLogs.unshift({ iconType, action, detail, time: 'Just now' })
  if (auditLogs.length > 20) auditLogs.pop()
  renderAuditLogs()
  renderOverviewPanel()
}

// Push Live Notification
function pushNotification(titleText, detailText, avatarText = '⚡', toneClass = 'coral-bg') {
  const list = document.querySelector('#notification-list')
  if (!list) return

  const item = document.createElement('div')
  item.className = 'notification-item unread'
  item.innerHTML = `
    <span class="notif-avatar ${toneClass}">${avatarText}</span>
    <div class="notif-content">
      <p><strong>${titleText}</strong></p>
      <small>${detailText} • Just now</small>
    </div>
    <span class="notif-dot"></span>
  `
  item.addEventListener('click', () => {
    item.classList.remove('unread')
    const dot = item.querySelector('.notif-dot')
    if (dot) dot.style.display = 'none'
    updateNotifCount()
  })

  list.prepend(item)
  updateNotifCount()
}

function updateNotifCount() {
  const unreadCount = document.querySelectorAll('.notification-item.unread').length
  const badge = document.querySelector('#notification-badge')
  const tag = document.querySelector('#notification-tag')
  if (badge) {
    badge.textContent = unreadCount
    badge.style.display = unreadCount > 0 ? 'flex' : 'none'
  }
  if (tag) {
    tag.textContent = unreadCount > 0 ? `${unreadCount} new` : 'All read'
  }
}

// DOM helper
const make = (tag, className, text) => {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (text !== undefined) element.textContent = text
  return element
}

function closeModal() {
  if (root) root.replaceChildren()
}

// ============================================================
// PROJECT CREATOR PRIVILEGES & ROLE HELPERS
// ============================================================

function getActiveProject() {
  return projects.find(p => p.name === activeView) || projects[0]
}

function isCurrentUserProjectCreator() {
  const proj = getActiveProject()
  if (!proj) return true

  // Check if current user is the project creator
  const isDirectCreator = (
    (currentUser.email && proj.creatorEmail && currentUser.email.toLowerCase() === proj.creatorEmail.toLowerCase()) ||
    (currentUser.name && proj.creatorName && currentUser.name.toLowerCase() === proj.creatorName.toLowerCase()) ||
    (currentUser.initials && proj.creatorInitials && currentUser.initials.toUpperCase() === proj.creatorInitials.toUpperCase())
  )

  const isWorkspaceAdmin = currentUser?.isAdmin || (currentUser?.role && currentUser.role.toLowerCase().includes('admin'))

  return isDirectCreator || isWorkspaceAdmin
}

function updateCreatorControlStrip() {
  const proj = getActiveProject()
  const isCreator = isCurrentUserProjectCreator()
  const strip = document.querySelector('#creator-control-strip')
  const stripTitle = document.querySelector('#creator-strip-title')
  const stripDesc = document.querySelector('#creator-strip-desc')
  const pillCreator = document.querySelector('#pill-creator-view')
  const pillMember = document.querySelector('#pill-member-view')

  if (!strip) return

  if (activeView === 'Overview' || activeView === 'Calendar' || activeView === 'Admin Console') {
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

function renderSprintChips() {
  const container = document.querySelector('#sprint-chips-list')
  const strip = document.querySelector('#project-sprints-strip')
  const proj = getActiveProject()
  if (!container || !strip) return

  if (activeView === 'Overview' || activeView === 'Calendar' || activeView === 'Admin Console') {
    strip.style.display = 'none'
    return
  }

  strip.style.display = 'flex'
  container.replaceChildren()

  // "All Sprints" filter chip
  const allChip = make('div', `sprint-chip ${activeSprintFilter === 'all' ? 'active' : ''}`)
  allChip.innerHTML = `<span>All Tasks</span> <small>${tasks.filter(t => t.project === proj.name).length}</small>`
  allChip.addEventListener('click', () => {
    activeSprintFilter = 'all'
    renderSprintChips()
    renderTasks()
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
      activeSprintFilter = isAct ? 'all' : sprint.name
      renderSprintChips()
      renderTasks()
    })
    container.append(chip)
  })
}

// ============================================================
// USER UI & PROFILE DROPDOWN
// ============================================================

function updateUserUI() {
  const isAdmin = currentUser?.isAdmin || (currentUser?.role && currentUser.role.toLowerCase().includes('admin'))
  const proj = getActiveProject()
  const isCreator = isCurrentUserProjectCreator()

  const topbarInitials = document.querySelector('#topbar-avatar-initials')
  if (topbarInitials && currentUser) {
    topbarInitials.textContent = currentUser.initials || 'AM'
    topbarInitials.className = `avatar ${currentUser.tone || 'coral'}-bg topbar-avatar-circle`
  }

  const userBtn = document.querySelector('#signin-user-btn')
  if (userBtn && currentUser) {
    userBtn.title = `${currentUser.name} (${currentUser.role || (isAdmin ? 'Workspace Admin' : 'Active Member')}) — Account Settings`
  }

  const dropdownAvatar = document.querySelector('#dropdown-avatar')
  if (dropdownAvatar && currentUser) {
    dropdownAvatar.textContent = currentUser.initials || 'AM'
    dropdownAvatar.className = `avatar ${currentUser.tone || 'coral'}-bg profile-dropdown-avatar`
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

  const dropdownToggleRoleText = document.querySelector('#dropdown-toggle-role-text')
  if (dropdownToggleRoleText) {
    dropdownToggleRoleText.textContent = isAdmin ? 'Switch to Member Role (Testing)' : 'Promote to Admin Role (Testing)'
  }

  const avatar = document.querySelector('#sidebar-avatar')
  if (avatar && currentUser) {
    avatar.textContent = currentUser.initials
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
    adminTag.textContent = isAdmin ? 'Full Admin Privileges' : 'Member View (Read Only)'
  }

  const toggleBtn = document.querySelector('#admin-toggle-role-btn')
  if (toggleBtn) {
    toggleBtn.textContent = isAdmin ? 'Switch to Member View' : 'Switch to Admin View'
  }

  // Project Creator Badge
  const creatorBadge = document.querySelector('#project-creator-badge')
  const creatorBadgeText = document.querySelector('#project-creator-badge-text')
  if (creatorBadge) {
    if (activeView === 'Overview' || activeView === 'Calendar' || activeView === 'Admin Console') {
      creatorBadge.style.display = 'none'
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

  // Task creation button permission enforcement (Only Project Creator or Admin)
  const newTaskBtn = document.querySelector('#new-task-btn')
  if (newTaskBtn) {
    if (isCreator) {
      newTaskBtn.className = 'primary-button gold'
      newTaskBtn.innerHTML = '+ <span>New task</span>'
      newTaskBtn.title = `Create and assign a task (${proj.creatorName})`
    } else {
      newTaskBtn.className = 'primary-button disabled-permission'
      newTaskBtn.innerHTML = `${getSvg('lock', 'btn-lock-svg', 13, 13)} <span>New task (${proj.creatorName} Only)</span>`
      newTaskBtn.title = `Only ${proj.creatorName} (Project Creator) can create and assign tasks for ${proj.name}.`
    }
  }

  // Column plus and add-card buttons
  document.querySelectorAll('.column-plus, .add-card').forEach(btn => {
    btn.style.display = isCreator ? 'block' : 'none'
  })

  // Add sprint button
  const addSprintBtn = document.querySelector('#add-sprint-btn')
  if (addSprintBtn) {
    addSprintBtn.style.display = isCreator ? 'inline-block' : 'none'
  }

  // Sprints button text count
  const sprintsBtnText = document.querySelector('#sprints-btn-text')
  if (sprintsBtnText && proj && proj.sprints) {
    sprintsBtnText.textContent = `Sprints (${proj.sprints.length})`
  }

  // Team collaborators button count
  const collabBtnCount = document.querySelector('#collab-btn-count')
  if (collabBtnCount && proj) {
    const list = proj.invitedMembers || members
    collabBtnCount.textContent = `${list.length} Team Members`
  }

  updateCreatorControlStrip()
  renderSprintChips()
}

function toggleAdminRole() {
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
  localStorage.setItem('collab-user', JSON.stringify(currentUser))
  updateUserUI()
  renderMembersTable()
  renderTasks()
}

// Switch testing perspective (Creator vs Invited Member)
function switchTestingPerspective(mode) {
  const proj = getActiveProject()
  if (mode === 'creator') {
    currentUser = {
      name: proj.creatorName,
      email: proj.creatorEmail,
      initials: proj.creatorInitials,
      role: 'Project Creator (Lead)',
      isAdmin: true,
      tone: 'coral'
    }
    pushNotification('Creator Perspective Active', `Logged in as ${proj.creatorName} with full management powers`, proj.creatorInitials, 'coral-bg')
    addAuditLog('Perspective switched', `Active test user set to Project Creator: ${proj.creatorName}.`, 'shield')
  } else {
    currentUser = {
      name: 'Jordan Lee',
      email: 'jordan@collab.io',
      initials: 'JL',
      role: 'Designer (Invited Member)',
      isAdmin: false,
      tone: 'orange'
    }
    pushNotification('Member Perspective Active', `Logged in as Jordan Lee (Invited Collaborator — Task creation restricted)`, 'JL', 'orange-bg')
    addAuditLog('Perspective switched', `Active test user set to Invited Collaborator: Jordan Lee.`, 'team')
  }
  localStorage.setItem('collab-user', JSON.stringify(currentUser))
  updateUserUI()
  renderTasks()
  renderMembersTable()
  if (currentDetailTaskId) {
    const t = tasks.find(x => x.id === currentDetailTaskId)
    if (t) openInflowTaskPane(t)
  }
}

// ============================================================
// PROJECTS MANAGEMENT (Create Group Projects)
// ============================================================

function renderProjectNav() {
  const container = document.querySelector('#project-nav-list')
  if (!container) return
  container.replaceChildren()

  projects.forEach(project => {
    const item = document.createElement('a')
    item.className = `nav-item project ${activeView === project.name ? 'active' : ''}`
    item.dataset.view = project.name
    item.innerHTML = `<i class="dot ${project.color || 'blue'}"></i><span>${project.name}</span>`
    item.addEventListener('click', () => switchView(project.name))
    container.append(item)
  })
}

function openCreateProjectModal() {
  const backdrop = make('div', 'modal-backdrop')
  const form = make('form', 'modal')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)

  const title = make('h2', '', 'Create Group Project')
  const copy = make('p', 'modal-copy', 'Start a shared board for your team to plan, break into sprints, assign, and track work.')

  const nameLabel = make('label', '', 'Project Name')
  const nameInput = make('input')
  nameInput.required = true
  nameInput.placeholder = 'e.g. Mobile App v2'
  nameLabel.append(nameInput)

  const descLabel = make('label', '', 'Description')
  const descInput = make('input')
  descInput.placeholder = 'Brief purpose of this project board'
  descLabel.append(descInput)

  const colorLabel = make('label', '', 'Color Accent')
  const colorSelect = document.createElement('select')
  ;[
    ['coral', 'Coral Gold'],
    ['blue', 'Sky Blue'],
    ['green', 'Emerald Green'],
    ['purple', 'Royal Purple'],
    ['yellow', 'Sunflower Yellow']
  ].forEach(([val, txt]) => {
    const opt = make('option', '', txt)
    opt.value = val
    colorSelect.append(opt)
  })
  colorLabel.append(colorSelect)

  const submit = make('button', 'primary-button full gold', 'Create Project Board')
  submit.type = 'submit'

  form.append(close, make('p', 'eyebrow', 'NEW GROUP PROJECT'), title, copy, nameLabel, descLabel, colorLabel, submit)

  form.addEventListener('submit', e => {
    e.preventDefault()
    const name = nameInput.value.trim()
    const description = descInput.value.trim() || 'A collaborative team project board.'
    const color = colorSelect.value

    if (!name) return

    const newProject = {
      id: `p_${Date.now()}`,
      name,
      color,
      description,
      creatorEmail: currentUser.email || 'admin@collab.io',
      creatorName: currentUser.name || 'Alex Morgan',
      creatorInitials: currentUser.initials || 'AM',
      invitedMembers: members.map(m => ({ ...m })),
      sprints: [
        { id: `s_${Date.now()}_1`, name: 'Sprint 1: Kickoff & Scoping', status: 'Active' },
        { id: `s_${Date.now()}_2`, name: 'Sprint 2: Implementation', status: 'Upcoming' }
      ]
    }

    projects.push(newProject)
    saveProjects()

    // Add 2 starter tasks for this project
    tasks.push({
      id: Date.now(),
      project: name,
      title: `Plan kickoff for ${name}`,
      tag: 'Product',
      tagTone: 'yellow',
      due: 'Today',
      assignee: currentUser.initials,
      assigneeName: currentUser.name,
      assigneeTone: 'teal',
      status: 'To do',
      progress: 0,
      sprint: 'Sprint 1: Kickoff & Scoping',
      approvalStatus: 'none',
      description: `Initial planning checklist for ${name}.`,
      comments: 0,
      commentsList: []
    })
    saveTasks()

    closeModal()
    renderProjectNav()
    switchView(name)

    addAuditLog(`Project created`, `${currentUser.name} created group project "${name}".`, 'sync')
    pushNotification(`Project Created`, `${currentUser.name} created "${name}"`, '📁', 'blue-bg')
  })

  backdrop.append(form)
  root.append(backdrop)
  nameInput.focus()
}

// ============================================================
// TASKS & BOARD MANAGEMENT
// ============================================================

function getFilteredTasks() {
  let list = tasks

  // Filter by active project or view
  if (activeView === 'My Tasks') {
    list = list.filter(t => t.assignee === currentUser.initials)
  } else if (activeView === 'Overview' || activeView === 'Calendar') {
    // Show all tasks across projects
  } else if (activeView !== 'Admin Console') {
    // Match specific project
    list = list.filter(t => t.project === activeView)
  }

  // Filter by Sprint if set
  if (activeSprintFilter !== 'all' && activeView !== 'Overview' && activeView !== 'Calendar' && activeView !== 'My Tasks') {
    list = list.filter(t => t.sprint === activeSprintFilter)
  }

  // Filter by status dropdown
  if (activeFilter === 'mine') {
    list = list.filter(t => t.assignee === currentUser.initials)
  } else if (activeFilter === 'todo') {
    list = list.filter(t => t.status === 'To do')
  } else if (activeFilter === 'progress') {
    list = list.filter(t => t.status === 'In progress')
  } else if (activeFilter === 'done') {
    list = list.filter(t => t.status === 'Done')
  }

  return list
}

function updateTaskCounts(filtered) {
  const todoCount = filtered.filter(t => t.status === 'To do').length
  const progressCount = filtered.filter(t => t.status === 'In progress').length
  const doneCount = filtered.filter(t => t.status === 'Done').length

  const countTodo = document.querySelector('#count-todo')
  const countProgress = document.querySelector('#count-progress')
  const countDone = document.querySelector('#count-done')

  if (countTodo) countTodo.textContent = todoCount
  if (countProgress) countProgress.textContent = progressCount
  if (countDone) countDone.textContent = doneCount

  // My Tasks counter in sidebar
  const myCount = tasks.filter(t => t.assignee === currentUser.initials && t.status !== 'Done').length
  const navBadge = document.querySelector('#my-tasks-nav-count')
  if (navBadge) navBadge.textContent = myCount
}

// Move task status with Creator Approval workflow
function moveTaskStatus(taskId, newStatus) {
  const task = tasks.find(t => t.id === taskId)
  if (!task) return

  const oldStatus = task.status
  task.status = newStatus
  task.done = newStatus === 'Done'

  if (newStatus === 'Done') {
    task.progress = 100
    // If completed by someone other than project creator, mark as pending review
    const isCreator = isCurrentUserProjectCreator()
    if (!isCreator) {
      task.approvalStatus = 'pending_approval'
      pushNotification('Deliverable Submitted', `${currentUser.name} completed "${task.title}" — awaiting creator approval`, currentUser.initials, 'orange-bg')
    } else {
      task.approvalStatus = 'approved'
      task.approvedBy = currentUser.name
    }
  } else if (newStatus === 'In progress') {
    task.progress = task.progress && task.progress > 0 && task.progress < 100 ? task.progress : 50
    task.approvalStatus = 'none'
  } else {
    task.progress = 0
    task.approvalStatus = 'none'
  }

  saveTasks()
  renderTasks()

  if (currentDetailTaskId === task.id) {
    openInflowTaskPane(task)
  }

  addAuditLog('Task status updated', `"${task.title}" moved from ${oldStatus} to ${newStatus}.`, newStatus === 'Done' ? 'check' : 'sync')
  pushNotification(`Task ${newStatus}`, `"${task.title}" moved to ${newStatus}`, newStatus === 'Done' ? '✓' : '⇄', newStatus === 'Done' ? 'green-bg' : 'coral-bg')
}

// Task Card with proper SVG icons and drag & drop
function taskCard(task) {
  const card = make('article', 'task-card')
  card.dataset.id = String(task.id)
  card.setAttribute('draggable', 'true')

  // Drag and Drop handlers
  card.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', String(task.id))
    e.dataTransfer.effectAllowed = 'move'
    card.classList.add('is-dragging')
  })

  card.addEventListener('dragend', () => {
    card.classList.remove('is-dragging')
    document.querySelectorAll('.column').forEach(c => c.classList.remove('drag-over'))
  })

  const top = make('div', 'task-top')
  const tagWrap = make('span', `tag ${task.tagTone || 'blue'}`, task.tag)
  const moreBtn = make('button', 'card-more-btn')
  moreBtn.type = 'button'
  moreBtn.innerHTML = getSvg('dots', 'dots-svg', 14, 14)
  moreBtn.title = 'Task actions'
  top.append(tagWrap, moreBtn)

  const title = make('h4', '', task.title)

  const meta = make('div', 'task-meta')
  const dueSpan = make('span', task.due === 'Today' ? 'due today meta-due-span' : 'due meta-due-span')
  dueSpan.innerHTML = `${getSvg('calendar', 'meta-icon', 12, 12)} <span>${task.due}</span>`
  meta.append(dueSpan)

  if (task.commentsList && task.commentsList.length > 0) {
    const commentSpan = make('span', 'meta-comment-span')
    commentSpan.innerHTML = `${getSvg('message', 'meta-icon', 12, 12)} <span>${task.commentsList.length}</span>`
    meta.append(commentSpan)
  }

  // Approval badge
  if (task.status === 'Done') {
    if (task.approvalStatus === 'pending_approval') {
      const reviewBadge = make('span', 'approval-tag pending')
      reviewBadge.innerHTML = `${getSvg('clock', 'meta-icon', 10, 10)} <span>Needs Review</span>`
      meta.append(reviewBadge)
    } else if (task.approvalStatus === 'approved') {
      const approvedBadge = make('span', 'approval-tag approved')
      approvedBadge.innerHTML = `${getSvg('check', 'meta-icon', 10, 10)} <span>Approved</span>`
      meta.append(approvedBadge)
    }
  }

  const footer = make('div', 'card-footer')
  const assigneeEl = make('div', `avatar ${task.assigneeTone || 'teal'}-bg`, task.assignee)
  assigneeEl.title = `${task.assigneeName || task.assignee}`
  footer.append(assigneeEl)

  if (task.status === 'Done') {
    const doneLabel = make('span', 'done-label')
    doneLabel.innerHTML = `${getSvg('check', 'done-icon', 12, 12)} <span>Done</span>`
    footer.append(doneLabel)
  } else {
    const progress = make('div', 'progress')
    const bar = make('span')
    bar.style.width = `${task.progress || 0}%`
    progress.append(bar)
    footer.append(progress)
  }

  // Quick move buttons row
  const moveRow = make('div', 'card-move-row')
  if (task.status !== 'To do') {
    const btnTodo = make('button', 'card-move-btn')
    btnTodo.type = 'button'
    btnTodo.innerHTML = `${getSvg('arrowLeft', 'arrow-svg', 11, 11)} <span>To do</span>`
    btnTodo.addEventListener('click', e => { e.stopPropagation(); moveTaskStatus(task.id, 'To do') })
    moveRow.append(btnTodo)
  }
  if (task.status !== 'In progress') {
    const btnProg = make('button', 'card-move-btn')
    btnProg.type = 'button'
    btnProg.innerHTML = `<span>In prog</span> ${getSvg('arrowRight', 'arrow-svg', 11, 11)}`
    btnProg.addEventListener('click', e => { e.stopPropagation(); moveTaskStatus(task.id, 'In progress') })
    moveRow.append(btnProg)
  }
  if (task.status !== 'Done') {
    const btnDone = make('button', 'card-move-btn')
    btnDone.type = 'button'
    btnDone.innerHTML = `${getSvg('check', 'check-svg', 11, 11)} <span>Done</span>`
    btnDone.addEventListener('click', e => { e.stopPropagation(); moveTaskStatus(task.id, 'Done') })
    moveRow.append(btnDone)
  }

  card.append(top, title, meta, footer, moveRow)
  card.addEventListener('click', () => openInflowTaskPane(task))
  return card
}

function setupDragAndDrop() {
  document.querySelectorAll('.column').forEach(col => {
    const status = col.dataset.status
    if (!status) return

    col.ondragover = e => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      col.classList.add('drag-over')
    }

    col.ondragleave = e => {
      if (!col.contains(e.relatedTarget)) {
        col.classList.remove('drag-over')
      }
    }

    col.ondrop = e => {
      e.preventDefault()
      col.classList.remove('drag-over')
      const taskIdStr = e.dataTransfer.getData('text/plain')
      if (!taskIdStr) return
      const taskId = Number(taskIdStr)
      const task = tasks.find(t => t.id === taskId)
      if (task && task.status !== status) {
        moveTaskStatus(task.id, status)
      }
    }
  })
}

function renderTasks() {
  const lists = {
    'To do': document.querySelector('#todo-list'),
    'In progress': document.querySelector('#progress-list'),
    Done: document.querySelector('#done-list')
  }

  const filtered = getFilteredTasks()
  updateTaskCounts(filtered)

  // Render Kanban Columns
  if (lists['To do']) {
    Object.values(lists).forEach(list => { if (list) list.replaceChildren() })
    filtered.forEach(task => {
      const status = task.status || (task.done ? 'Done' : 'To do')
      if (lists[status]) {
        lists[status].append(taskCard(task))
      }
    })
  }

  // Setup drag and drop on column containers
  setupDragAndDrop()

  // Render List View Table
  renderListView(filtered)

  // Re-render overview if active
  if (activeView === 'Overview') renderOverviewPanel()
  if (activeView === 'Calendar') renderCalendarPanel()
}

function renderListView(filtered) {
  const tbody = document.querySelector('#list-tasks-tbody')
  if (!tbody) return
  tbody.replaceChildren()

  filtered.forEach(task => {
    const tr = document.createElement('tr')

    // Checkbox Done cell
    const tdCheck = document.createElement('td')
    const checkBtn = make('button', `task-checkbox-btn ${task.status === 'Done' ? 'checked' : ''}`)
    checkBtn.type = 'button'
    checkBtn.innerHTML = getSvg('check', 'check-icon', 12, 12)
    checkBtn.addEventListener('click', e => {
      e.stopPropagation()
      moveTaskStatus(task.id, task.status === 'Done' ? 'To do' : 'Done')
    })
    tdCheck.append(checkBtn)

    // Title cell
    const tdTitle = document.createElement('td')
    tdTitle.innerHTML = `<strong>${task.title}</strong>`

    // Project / Tag cell
    const tdTag = document.createElement('td')
    tdTag.innerHTML = `<span class="tag ${task.tagTone || 'blue'}">${task.project} • ${task.tag}</span>`

    // Assignee cell
    const tdAssignee = document.createElement('td')
    const wrap = make('div', 'list-assignee-cell')
    wrap.append(make('div', `avatar ${task.assigneeTone || 'teal'}-bg`, task.assignee), make('small', '', task.assigneeName || task.assignee))
    tdAssignee.append(wrap)

    // Due cell
    const tdDue = document.createElement('td')
    tdDue.innerHTML = `<span class="meta-due-span">${getSvg('calendar', 'meta-icon', 12, 12)} <span>${task.due}</span></span>`

    // Comments count cell
    const tdComments = document.createElement('td')
    const count = task.commentsList ? task.commentsList.length : (task.comments || 0)
    tdComments.innerHTML = `<span class="meta-comment-span">${getSvg('message', 'meta-icon', 12, 12)} <span>${count}</span></span>`

    // Status cell
    const tdStatus = document.createElement('td')
    const isDone = task.status === 'Done'
    tdStatus.innerHTML = `<span class="status-badge ${isDone ? 'active' : 'pending'}">${task.status}</span>`

    tr.append(tdCheck, tdTitle, tdTag, tdAssignee, tdDue, tdComments, tdStatus)
    tr.addEventListener('click', () => openInflowTaskPane(task))
    tbody.append(tr)
  })
}

// ============================================================
// PERMISSION NOTICE MODAL (Explaining Creator Rule)
// ============================================================

function showPermissionNotice() {
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
    openCreateProjectModal()
  })

  box.append(close, crown, title, copy, switchBtn, createOwnBtn)
  backdrop.append(box)
  root.append(backdrop)
}

// ============================================================
// BREAK PROJECT INTO SMALL SPRINTS
// ============================================================

function openAddSprintModal() {
  const proj = getActiveProject()
  const isCreator = isCurrentUserProjectCreator()
  if (!isCreator) {
    showPermissionNotice()
    return
  }

  const backdrop = make('div', 'modal-backdrop')
  const form = make('form', 'modal')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)

  const title = make('h2', '', `Break ${proj.name} into Sprint`)
  const copy = make('p', 'modal-copy', `Project Creator (${proj.creatorName}): Define a focused milestone sprint for your team.`)

  const nameLabel = make('label', '', 'Sprint / Milestone Title')
  const nameInput = make('input')
  nameInput.required = true
  const count = (proj.sprints ? proj.sprints.length : 0) + 1
  nameInput.placeholder = `e.g. Sprint ${count}: Core Implementation`
  nameLabel.append(nameInput)

  const statusLabel = make('label', '', 'Sprint Status')
  const statusSelect = document.createElement('select')
  ;['Active', 'Upcoming', 'Completed'].forEach(s => {
    const opt = make('option', '', s)
    opt.value = s
    statusSelect.append(opt)
  })
  statusLabel.append(statusSelect)

  const submit = make('button', 'primary-button full gold', 'Add Sprint to Project')
  submit.type = 'submit'

  form.append(close, make('p', 'eyebrow', 'PROJECT MILESTONE'), title, copy, nameLabel, statusLabel, submit)

  form.addEventListener('submit', e => {
    e.preventDefault()
    const sName = nameInput.value.trim()
    if (!sName) return

    if (!proj.sprints) proj.sprints = []
    proj.sprints.push({
      id: `s_${Date.now()}`,
      name: sName,
      status: statusSelect.value
    })
    saveProjects()
    closeModal()
    updateUserUI()
    addAuditLog('Sprint created', `${proj.creatorName} added "${sName}" to ${proj.name}.`, 'flag')
    pushNotification('Sprint Created', `"${sName}" added to ${proj.name}`, '⚡', 'blue-bg')
  })

  backdrop.append(form)
  root.append(backdrop)
  nameInput.focus()
}

// ============================================================
// INVITE COLLABORATOR BY EMAIL TO PROJECT
// ============================================================

function openInviteCollaboratorModal() {
  const proj = getActiveProject()
  const isCreator = isCurrentUserProjectCreator()
  if (!isCreator) {
    showPermissionNotice()
    return
  }

  const backdrop = make('div', 'modal-backdrop')
  const form = make('form', 'modal')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)

  const title = make('h2', '', `Invite Member to ${proj.name}`)
  const copy = make('p', 'modal-copy', `Project Creator (${proj.creatorName}): Invite team collaborators using their email address.`)

  const emailLabel = make('label', '', 'Collaborator Email')
  const emailInput = make('input')
  emailInput.type = 'email'
  emailInput.required = true
  emailInput.placeholder = 'e.g. janko@collab.io'
  emailLabel.append(emailInput)

  const nameLabel = make('label', '', 'Full Name')
  const nameInput = make('input')
  nameInput.required = true
  nameInput.placeholder = 'e.g. Janko Kobane'
  nameLabel.append(nameInput)

  const roleLabel = make('label', '', 'Project Role')
  const roleSelect = document.createElement('select')
  ;['Product Lead', 'Designer', 'Engineer', 'QA Specialist', 'Content Strategist'].forEach(r => {
    const opt = make('option', '', r)
    opt.value = r
    roleSelect.append(opt)
  })
  roleLabel.append(roleSelect)

  const submit = make('button', 'primary-button full gold', 'Send Project Invitation')
  submit.type = 'submit'

  form.append(close, make('p', 'eyebrow', 'PROJECT COLLABORATOR'), title, copy, emailLabel, nameLabel, roleLabel, submit)

  form.addEventListener('submit', e => {
    e.preventDefault()
    const email = emailInput.value.trim()
    const name = nameInput.value.trim()
    const role = roleSelect.value

    if (!email || !name) return

    const initials = name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() || 'TM'
    const tones = ['coral', 'teal', 'orange', 'purple', 'blue']
    const tone = tones[Math.floor(Math.random() * tones.length)]

    const newMember = {
      id: `m_${Date.now()}`,
      name,
      email,
      initials,
      role,
      tone,
      status: 'Active'
    }

    // Add to project invited members
    if (!proj.invitedMembers) proj.invitedMembers = []
    proj.invitedMembers.push(newMember)
    saveProjects()

    // Add to workspace global members if not already present
    if (!members.find(m => m.email.toLowerCase() === email.toLowerCase())) {
      members.push(newMember)
      saveMembers()
    }

    closeModal()
    updateUserUI()
    renderMembersTable()
    addAuditLog('Member invited', `${proj.creatorName} invited ${name} (${email}) to ${proj.name}.`, 'userPlus')
    pushNotification('Collaborator Added', `${name} invited to ${proj.name}`, initials, `${tone}-bg`)
  })

  backdrop.append(form)
  root.append(backdrop)
  emailInput.focus()
}

// ============================================================
// MANAGE & REMOVE COLLABORATORS MODAL
// ============================================================

function openManageCollaboratorsModal() {
  const proj = getActiveProject()
  const isCreator = isCurrentUserProjectCreator()

  const backdrop = make('div', 'modal-backdrop')
  const box = make('div', 'modal')
  box.style.maxWidth = '540px'
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)

  const title = make('h2', '', `${proj.name} — Team Collaborators`)
  const copy = make('p', 'modal-copy', `Collaborators invited to work on ${proj.name}. Project creator: ${proj.creatorName}.`)

  const listContainer = make('div', 'admin-table-wrapper')
  listContainer.style.margin = '16px 0 20px'

  const table = make('table', 'admin-table')
  table.innerHTML = `
    <thead>
      <tr>
        <th>Collaborator</th>
        <th>Role</th>
        <th>Tasks</th>
        ${isCreator ? '<th>Action</th>' : ''}
      </tr>
    </thead>
    <tbody id="proj-collab-tbody"></tbody>
  `
  listContainer.append(table)

  const tbody = table.querySelector('#proj-collab-tbody')
  const invited = proj.invitedMembers || members

  invited.forEach(m => {
    const tr = document.createElement('tr')
    const isThisCreator = m.email === proj.creatorEmail || m.name === proj.creatorName

    // Member cell
    const tdMem = document.createElement('td')
    const wrap = make('div', 'member-cell')
    wrap.append(make('div', `avatar ${m.tone || 'coral'}-bg`, m.initials), make('strong', '', m.name))
    tdMem.append(wrap)

    // Role cell
    const tdRole = document.createElement('td')
    tdRole.textContent = isThisCreator ? `${m.role} (Creator)` : m.role

    // Tasks count cell
    const tdTasks = document.createElement('td')
    const taskCount = tasks.filter(t => t.project === proj.name && t.assignee === m.initials).length
    tdTasks.textContent = `${taskCount} active`

    tr.append(tdMem, tdRole, tdTasks)

    if (isCreator) {
      const tdAct = document.createElement('td')
      if (!isThisCreator) {
        const removeBtn = make('button', 'action-btn delete', 'Remove')
        removeBtn.type = 'button'
        removeBtn.addEventListener('click', () => {
          proj.invitedMembers = proj.invitedMembers.filter(x => x.id !== m.id && x.email !== m.email)
          saveProjects()
          addAuditLog('Collaborator removed', `${proj.creatorName} removed ${m.name} from ${proj.name}.`, 'trash')
          closeModal()
          openManageCollaboratorsModal()
          updateUserUI()
        })
        tdAct.append(removeBtn)
      } else {
        tdAct.innerHTML = `<small style="color: #A1A1AA;">Owner</small>`
      }
      tr.append(tdAct)
    }

    tbody.append(tr)
  })

  const actionsRow = make('div', 'modal-actions-row')
  if (isCreator) {
    const inviteBtn = make('button', 'primary-button gold', '+ Invite Another Member')
    inviteBtn.type = 'button'
    inviteBtn.addEventListener('click', () => {
      closeModal()
      openInviteCollaboratorModal()
    })
    actionsRow.append(inviteBtn)
  }

  box.append(close, make('p', 'eyebrow', 'PROJECT TEAM'), title, copy, listContainer, actionsRow)
  backdrop.append(box)
  root.append(backdrop)
}

// ============================================================
// CREATE & ASSIGN TASK MODAL (Enforces Creator Privilege)
// ============================================================

function openTaskModal(prefilledStatus = 'To do') {
  const proj = getActiveProject()
  const isCreator = isCurrentUserProjectCreator()

  if (!isCreator) {
    showPermissionNotice()
    return
  }

  const backdrop = make('div', 'modal-backdrop')
  const form = make('form', 'modal')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)

  const title = make('h2', '', `Create Task for ${proj.name}`)
  const copy = make('p', 'modal-copy', `Project Creator (${proj.creatorName}): Define deliverable and assign a team member.`)

  const titleLabel = make('label', '', 'Task Title')
  const titleInput = make('input')
  titleInput.required = true
  titleInput.placeholder = 'e.g. Design responsive navigation'
  titleLabel.append(titleInput)

  const descLabel = make('label', '', 'Description')
  const descInput = make('input')
  descInput.placeholder = 'Details and context for this deliverable'
  descLabel.append(descInput)

  // Project selector
  const projectLabel = make('label', '', 'Group Project')
  const projectSelect = document.createElement('select')
  projects.forEach(p => {
    const opt = make('option', '', p.name)
    opt.value = p.name
    if (activeView === p.name) opt.selected = true
    projectSelect.append(opt)
  })
  projectLabel.append(projectSelect)

  // Sprint selector
  const sprintLabel = make('label', '', 'Project Sprint')
  const sprintSelect = document.createElement('select')
  const curProjSprints = proj.sprints || [{ name: 'Sprint 1: Core Deliverables' }]
  curProjSprints.forEach(s => {
    const opt = make('option', '', s.name)
    opt.value = s.name
    sprintSelect.append(opt)
  })
  sprintLabel.append(sprintSelect)

  // Tag selector
  const tagLabel = make('label', '', 'Category Tag')
  const tagSelect = document.createElement('select')
  ;['Design', 'Development', 'Marketing', 'Product'].forEach(val => tagSelect.append(make('option', '', val)))
  tagLabel.append(tagSelect)

  // Assignee selector (from project invited members)
  const assigneeLabel = make('label', '', 'Assign Task To')
  const assigneeSelect = document.createElement('select')
  const eligibleAssignees = proj.invitedMembers && proj.invitedMembers.length > 0 ? proj.invitedMembers : members
  eligibleAssignees.forEach(m => {
    const opt = make('option', '', `${m.name} (${m.role})`)
    opt.value = m.initials
    if (m.initials === currentUser.initials) opt.selected = true
    assigneeSelect.append(opt)
  })
  assigneeLabel.append(assigneeSelect)

  // Due date & Status row
  const dueLabel = make('label', '', 'Due date')
  const dueInput = make('input')
  dueInput.placeholder = 'e.g. Tomorrow or Oct 20'
  dueInput.defaultValue = 'Tomorrow'
  dueLabel.append(dueInput)

  const statusLabel = make('label', '', 'Initial Status')
  const statusSelect = document.createElement('select')
  ;['To do', 'In progress', 'Done'].forEach(s => {
    const opt = make('option', '', s)
    opt.value = s
    if (typeof prefilledStatus === 'string' && prefilledStatus === s) opt.selected = true
    statusSelect.append(opt)
  })
  statusLabel.append(statusSelect)

  const row1 = make('div', 'form-row'); row1.append(projectLabel, sprintLabel)
  const row2 = make('div', 'form-row'); row2.append(tagLabel, assigneeLabel)
  const row3 = make('div', 'form-row'); row3.append(dueLabel, statusLabel)

  const submit = make('button', 'primary-button full gold', 'Assign & Create Task')
  submit.type = 'submit'

  form.append(close, make('p', 'eyebrow', 'NEW TASK ASSIGNMENT'), title, copy, titleLabel, descLabel, row1, row2, row3, submit)

  form.addEventListener('submit', event => {
    event.preventDefault()
    const assignedMember = eligibleAssignees.find(m => m.initials === assigneeSelect.value) || eligibleAssignees[0]
    const tagTone = { Design: 'purple', Development: 'blue', Marketing: 'green', Product: 'yellow' }[tagSelect.value] || 'blue'

    const newTask = {
      id: Date.now(),
      project: projectSelect.value,
      title: titleInput.value.trim(),
      description: descInput.value.trim() || 'A new task for the group project.',
      tag: tagSelect.value,
      tagTone,
      due: dueInput.value || 'Tomorrow',
      assignee: assignedMember.initials,
      assigneeName: assignedMember.name,
      assigneeTone: assignedMember.tone || 'teal',
      status: statusSelect.value,
      done: statusSelect.value === 'Done',
      sprint: sprintSelect.value,
      approvalStatus: statusSelect.value === 'Done' ? 'approved' : 'none',
      progress: statusSelect.value === 'Done' ? 100 : statusSelect.value === 'In progress' ? 50 : 0,
      comments: 0,
      commentsList: []
    }

    tasks.push(newTask)
    saveTasks()
    closeModal()
    renderTasks()

    addAuditLog('Task created', `${currentUser.name} assigned "${newTask.title}" to ${assignedMember.name}.`, 'task')
    pushNotification('Task Assigned', `"${newTask.title}" assigned to ${assignedMember.name}`, assignedMember.initials, `${assignedMember.tone}-bg`)
  })

  backdrop.append(form)
  root.append(backdrop)
  titleInput.focus()
}

// ============================================================
// IN-FLOW TASK DETAIL PANE (NO MODAL / NO BACKDROP)
// ============================================================

let currentDetailTaskId = null

function closeInflowTaskPane() {
  currentDetailTaskId = null
  const pane = document.querySelector('#inflow-task-pane')
  const layout = document.querySelector('#workspace-split-layout')
  if (pane) {
    pane.style.display = 'none'
    pane.replaceChildren()
  }
  if (layout) layout.classList.remove('has-detail-open')
  document.querySelectorAll('.task-card.is-active-detail').forEach(c => c.classList.remove('is-active-detail'))
}

function openInflowTaskPane(task) {
  currentDetailTaskId = task.id

  // If in Overview or Calendar, switch to project board first so it appears in-flow
  if (activeView === 'Overview' || activeView === 'Calendar' || activeView === 'Admin Console') {
    switchView(task.project || 'Product Launch')
  }

  const pane = document.querySelector('#inflow-task-pane')
  const layout = document.querySelector('#workspace-split-layout')
  if (!pane || !layout) return

  layout.classList.add('has-detail-open')
  pane.style.display = 'flex'
  pane.replaceChildren()

  // Highlight active card on board
  document.querySelectorAll('.task-card').forEach(c => {
    c.classList.toggle('is-active-detail', c.dataset.id === String(task.id))
  })

  const proj = projects.find(p => p.name === task.project) || getActiveProject()
  const isCreator = isCurrentUserProjectCreator()

  // Header row with Breadcrumb & actions
  const headerRow = make('div', 'inflow-pane-header')
  const breadcrumb = make('div', 'inflow-pane-breadcrumbs')
  breadcrumb.innerHTML = `<span>${task.project}</span> <span>›</span> <span class="tag ${task.tagTone || 'blue'}">${task.tag}</span>`

  const actionsGroup = make('div', 'inflow-pane-header-actions')
  if (isCreator) {
    const editBtn = make('button', 'inflow-edit-btn')
    editBtn.type = 'button'
    editBtn.innerHTML = `${getSvg('edit', 'btn-icon', 12, 12)} <span>Edit</span>`
    editBtn.title = 'Edit task title, description, and assignment'
    editBtn.addEventListener('click', () => openEditTaskInline(task))
    actionsGroup.append(editBtn)
  }

  const closeBtn = make('button', 'inflow-close-btn', '×')
  closeBtn.type = 'button'
  closeBtn.title = 'Close task pane'
  closeBtn.addEventListener('click', closeInflowTaskPane)
  actionsGroup.append(closeBtn)

  headerRow.append(breadcrumb, actionsGroup)

  // Title & Description
  const title = make('h2', '', task.title)
  const description = make('p', 'inflow-desc', task.description)

  // Meta Box (Assignee, Due Date, Sprint)
  const metaBox = make('div', 'inflow-meta-box')
  const assignedMember = members.find(m => m.initials === task.assignee) || { name: task.assigneeName || task.assignee, initials: task.assignee, role: 'Team Member' }

  const person = make('div', 'inflow-meta-item')
  person.append(make('small', '', 'ASSIGNEE'), make('span', '', `${assignedMember.initials} ${assignedMember.name}`))

  const date = make('div', 'inflow-meta-item')
  date.innerHTML = `<small>DUE DATE</small><span class="meta-due-span">${getSvg('calendar', 'meta-icon', 12, 12)} <span>${task.due}</span></span>`

  metaBox.append(person, date)

  // Sprint row
  const sprintRow = make('div', 'inflow-meta-box')
  sprintRow.style.marginTop = '-4px'
  const sprintItem = make('div', 'inflow-meta-item')
  sprintItem.innerHTML = `<small>SPRINT / MILESTONE</small><span>⚡ ${task.sprint || 'Sprint 2: Core Implementation'}</span>`

  const creatorItem = make('div', 'inflow-meta-item')
  creatorItem.innerHTML = `<small>PROJECT LEAD</small><span>👑 ${proj.creatorName}</span>`
  sprintRow.append(sprintItem, creatorItem)

  // Approval Workflow Banner (if task is in review or approved)
  const approvalBox = make('div', 'inflow-approval-card')
  if (task.status === 'Done') {
    if (task.approvalStatus === 'pending_approval') {
      approvalBox.className = 'inflow-approval-card pending'
      if (isCreator) {
        approvalBox.innerHTML = `
          <strong>⚠️ Deliverable submitted by ${task.assigneeName || 'invited collaborator'} — Requires your approval</strong>
          <p>Review the completed work and approve or request revisions.</p>
          <div class="inflow-approval-actions">
            <button type="button" class="inflow-approve-work-btn" id="inflow-approve-btn">
              ${getSvg('check', 'btn-icon', 12, 12)} Approve Work
            </button>
            <button type="button" class="inflow-reject-work-btn" id="inflow-reject-btn">
              Request Changes
            </button>
          </div>
        `
        const approveBtn = approvalBox.querySelector('#inflow-approve-btn')
        approveBtn?.addEventListener('click', () => {
          task.approvalStatus = 'approved'
          task.approvedBy = proj.creatorName
          saveTasks()
          renderTasks()
          openInflowTaskPane(task)
          addAuditLog('Deliverable approved', `"${task.title}" approved by ${proj.creatorName}.`, 'check')
          pushNotification('Task Approved', `"${task.title}" approved by ${proj.creatorName}`, '✓', 'green-bg')
        })

        const rejectBtn = approvalBox.querySelector('#inflow-reject-btn')
        rejectBtn?.addEventListener('click', () => {
          const reason = prompt('Feedback note for revisions needed:', 'Please verify edge cases and mobile responsiveness.')
          if (reason) {
            task.status = 'In progress'
            task.approvalStatus = 'none'
            task.commentsList.push({
              id: Date.now(),
              author: currentUser.initials,
              authorName: currentUser.name,
              tone: 'coral',
              text: `Revisions requested by Project Lead: ${reason}`,
              time: 'Just now'
            })
            saveTasks()
            renderTasks()
            openInflowTaskPane(task)
            addAuditLog('Revisions requested', `Project Lead requested changes on "${task.title}".`, 'sync')
          }
        })
      } else {
        approvalBox.innerHTML = `
          <strong>⏳ Submitted for Creator Review</strong>
          <p>Waiting for ${proj.creatorName} to review and approve your completed deliverable.</p>
        `
      }
    } else {
      approvalBox.className = 'inflow-approval-card approved'
      approvalBox.innerHTML = `
        <strong>✓ Deliverable Approved by ${task.approvedBy || proj.creatorName}</strong>
        <p>This work has met all project specifications and is verified complete.</p>
      `
    }
  } else {
    approvalBox.style.display = 'none'
  }

  // Status Row with Dropdown
  const statusRow = make('div', 'inflow-status-row')
  const statusLabel = make('strong', '', 'Status:')
  statusLabel.style.fontSize = '12px'

  const statusSelect = document.createElement('select')
  statusSelect.className = 'inflow-status-select'
  ;['To do', 'In progress', 'Done'].forEach(s => {
    const opt = make('option', '', s)
    opt.value = s
    if (task.status === s) opt.selected = true
    statusSelect.append(opt)
  })
  statusSelect.addEventListener('change', () => {
    moveTaskStatus(task.id, statusSelect.value)
  })
  statusRow.append(statusLabel, statusSelect)

  // Complete action button
  const isDone = task.status === 'Done'
  const completeBtn = make('button', `inflow-complete-btn ${isDone ? 'is-completed' : ''}`)
  completeBtn.type = 'button'
  completeBtn.innerHTML = isDone
    ? `${getSvg('check', 'btn-icon', 13, 13)} <span>Completed</span>`
    : `${getSvg('check', 'btn-icon', 13, 13)} <span>Mark as complete</span>`
  completeBtn.addEventListener('click', () => {
    moveTaskStatus(task.id, isDone ? 'To do' : 'Done')
  })

  // Comments Section
  const commentsSection = make('div', 'drawer-section')
  if (!task.commentsList) task.commentsList = []

  const sectionTitle = make('div', 'section-title', `Comments (${task.commentsList.length})`)
  const commentsThread = make('div', 'drawer-comments-thread')

  function renderThread() {
    commentsThread.replaceChildren()
    if (task.commentsList.length === 0) {
      commentsThread.append(make('p', 'modal-copy', 'No comments yet. Start the conversation below!'))
      return
    }

    task.commentsList.forEach(c => {
      const card = make('div', 'comment-card')
      const av = make('div', `avatar ${c.tone || 'orange'}-bg`, c.author)
      const bubble = make('div', 'comment-bubble')
      const hdr = make('div', 'comment-header')
      hdr.append(make('strong', '', c.authorName || c.author), make('small', '', c.time || 'Just now'))
      bubble.append(hdr, make('p', '', c.text))
      card.append(av, bubble)
      commentsThread.append(card)
    })
  }
  renderThread()

  // New Comment Form
  const commentForm = document.createElement('form')
  commentForm.className = 'comment-form'
  const commentInput = document.createElement('input')
  commentInput.className = 'comment-input'
  commentInput.placeholder = 'Write a comment or project update...'
  commentInput.required = true

  const commentSubmit = document.createElement('button')
  commentSubmit.type = 'submit'
  commentSubmit.className = 'comment-submit-btn'
  commentSubmit.textContent = 'Post'

  commentForm.append(commentInput, commentSubmit)
  commentForm.addEventListener('submit', e => {
    e.preventDefault()
    const text = commentInput.value.trim()
    if (!text) return

    const newComment = {
      id: Date.now(),
      author: currentUser.initials,
      authorName: currentUser.name,
      tone: currentUser.tone || 'coral',
      text,
      time: 'Just now'
    }

    task.commentsList.push(newComment)
    task.comments = task.commentsList.length
    saveTasks()

    commentInput.value = ''
    renderThread()
    sectionTitle.textContent = `Comments (${task.commentsList.length})`
    renderTasks()

    pushNotification(
      `New Comment on "${task.title}"`,
      `${currentUser.name}: "${text.slice(0, 32)}..."`,
      currentUser.initials,
      `${currentUser.tone || 'coral'}-bg`
    )
  })

  commentsSection.append(sectionTitle, commentsThread, commentForm)

  pane.append(headerRow, title, description, metaBox, sprintRow, approvalBox, statusRow, completeBtn, commentsSection)
}

function openEditTaskInline(task) {
  const proj = getActiveProject()
  const pane = document.querySelector('#inflow-task-pane')
  if (!pane) return

  pane.replaceChildren()

  const headerRow = make('div', 'inflow-pane-header')
  headerRow.append(make('strong', '', `Edit Deliverable`), make('button', 'inflow-close-btn', '×'))
  headerRow.querySelector('.inflow-close-btn').addEventListener('click', () => openInflowTaskPane(task))

  const form = document.createElement('form')
  form.className = 'inflow-edit-form'
  form.style.display = 'flex'
  form.style.flexDirection = 'column'
  form.style.gap = '12px'

  const titleInput = make('input')
  titleInput.value = task.title
  titleInput.required = true
  titleInput.placeholder = 'Task Title'
  titleInput.style.padding = '8px 10px'
  titleInput.style.borderRadius = '6px'
  titleInput.style.border = '1px solid #D4D4D8'

  const descText = document.createElement('textarea')
  descText.value = task.description || ''
  descText.placeholder = 'Deliverable description...'
  descText.rows = 3
  descText.style.padding = '8px 10px'
  descText.style.borderRadius = '6px'
  descText.style.border = '1px solid #D4D4D8'
  descText.style.fontFamily = 'inherit'
  descText.style.fontSize = '12px'

  const assigneeSelect = document.createElement('select')
  assigneeSelect.style.padding = '8px 10px'
  assigneeSelect.style.borderRadius = '6px'
  assigneeSelect.style.border = '1px solid #D4D4D8'
  const eligible = proj.invitedMembers || members
  eligible.forEach(m => {
    const opt = make('option', '', `${m.name} (${m.role})`)
    opt.value = m.initials
    if (m.initials === task.assignee) opt.selected = true
    assigneeSelect.append(opt)
  })

  const sprintSelect = document.createElement('select')
  sprintSelect.style.padding = '8px 10px'
  sprintSelect.style.borderRadius = '6px'
  sprintSelect.style.border = '1px solid #D4D4D8'
  const curSprints = proj.sprints || [{ name: 'Sprint 1: Core Deliverables' }]
  curSprints.forEach(s => {
    const opt = make('option', '', s.name)
    opt.value = s.name
    if (s.name === task.sprint) opt.selected = true
    sprintSelect.append(opt)
  })

  const dueInput = make('input')
  dueInput.value = task.due
  dueInput.placeholder = 'Due date'
  dueInput.style.padding = '8px 10px'
  dueInput.style.borderRadius = '6px'
  dueInput.style.border = '1px solid #D4D4D8'

  const saveBtn = make('button', 'primary-button full gold', 'Save Deliverable Updates')
  saveBtn.type = 'submit'

  form.append(
    make('label', '', 'Title'), titleInput,
    make('label', '', 'Description'), descText,
    make('label', '', 'Assignee (Creator Authority)'), assigneeSelect,
    make('label', '', 'Project Sprint'), sprintSelect,
    make('label', '', 'Due Date'), dueInput,
    saveBtn
  )

  form.addEventListener('submit', e => {
    e.preventDefault()
    task.title = titleInput.value.trim()
    task.description = descText.value.trim()
    task.sprint = sprintSelect.value
    task.due = dueInput.value.trim() || 'Tomorrow'

    const assigned = eligible.find(m => m.initials === assigneeSelect.value)
    if (assigned) {
      task.assignee = assigned.initials
      task.assigneeName = assigned.name
      task.assigneeTone = assigned.tone || 'teal'
    }

    saveTasks()
    renderTasks()
    openInflowTaskPane(task)
    addAuditLog('Task updated', `${proj.creatorName} updated deliverable "${task.title}".`, 'edit')
  })

  pane.append(headerRow, form)
}

// ============================================================
// OVERVIEW PANEL (Workspace Summary & Professional Activity)
// ============================================================

function renderOverviewPanel() {
  const container = document.querySelector('#overview-projects-grid')
  const activityContainer = document.querySelector('#overview-activity-list')
  const workloadContainer = document.querySelector('#overview-workload-list')
  if (!container) return

  // Render Project Cards
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

  // Render Activity List with Professional Colored SVG Badges
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

  // Render Workload List
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

// ============================================================
// CALENDAR TIMELINE PANEL
// ============================================================

function renderCalendarPanel() {
  const grid = document.querySelector('#calendar-days-grid')
  if (!grid) return
  grid.replaceChildren()

  const columns = [
    { label: 'Today', filterFn: t => t.due === 'Today' },
    { label: 'Tomorrow', filterFn: t => t.due === 'Tomorrow' },
    { label: 'This Week', filterFn: t => t.due.includes('Oct 8') || t.due.includes('Oct 10') },
    { label: 'Next Week', filterFn: t => t.due.includes('Oct 12') || t.due.includes('Oct 14') || t.due.includes('Oct 18') },
    { label: 'Completed', filterFn: t => t.status === 'Done' }
  ]

  columns.forEach(col => {
    const colTasks = tasks.filter(col.filterFn)
    const colEl = make('div', 'calendar-day-col')

    const titleEl = make('div', 'calendar-day-title')
    titleEl.append(make('span', '', col.label), make('span', 'calendar-day-count', `${colTasks.length}`))
    colEl.append(titleEl)

    if (colTasks.length === 0) {
      colEl.append(make('p', 'modal-copy', 'No tasks scheduled'))
    } else {
      colTasks.forEach(t => {
        const chip = make('div', 'calendar-task-chip')
        chip.innerHTML = `
          <strong>${t.title}</strong>
          <div class="calendar-chip-meta">
            <span class="tag ${t.tagTone || 'blue'}">${t.project}</span>
            <span class="avatar ${t.assigneeTone || 'teal'}-bg" style="width: 18px; height: 18px; font-size: 8px;">${t.assignee}</span>
          </div>
        `
        chip.addEventListener('click', () => openInflowTaskPane(t))
        colEl.append(chip)
      })
    }
    grid.append(colEl)
  })
}

// ============================================================
// VIEW SWITCHING
// ============================================================

function switchView(viewName) {
  activeView = viewName
  activeSprintFilter = 'all'
  closeInflowTaskPane()

  // Update primary navigation active state
  document.querySelectorAll('.primary-nav .nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === viewName)
  })

  // Update project nav active state
  document.querySelectorAll('.project-nav .nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === viewName)
  })

  // Update breadcrumb and page titles
  const breadcrumb = document.querySelector('#breadcrumb-title')
  const pageTitle = document.querySelector('#page-title')
  const pageEyebrow = document.querySelector('#page-eyebrow')

  if (breadcrumb) breadcrumb.textContent = viewName
  if (pageTitle) pageTitle.textContent = viewName

  if (pageEyebrow) {
    if (viewName === 'Overview') pageEyebrow.textContent = 'WORKSPACE OVERVIEW'
    else if (viewName === 'My Tasks') pageEyebrow.textContent = 'PERSONAL WORKSPACE'
    else if (viewName === 'Calendar') pageEyebrow.textContent = 'SCHEDULE TIMELINE'
    else if (viewName === 'Admin Console') pageEyebrow.textContent = 'ORGANIZATION SECURITY'
    else pageEyebrow.textContent = 'PROJECT BOARD'
  }

  updateUserUI()

  const boardContainer = document.querySelector('#board-container')
  const overviewContainer = document.querySelector('#overview-container')
  const calendarContainer = document.querySelector('#calendar-container')
  const adminContainer = document.querySelector('#admin-container')
  const statsStrip = document.querySelector('.stats')
  const pageHeadingSubtitle = document.querySelector('.subtitle')

  // Hide all panels by default
  if (boardContainer) boardContainer.style.display = 'none'
  if (overviewContainer) overviewContainer.style.display = 'none'
  if (calendarContainer) calendarContainer.style.display = 'none'
  if (adminContainer) adminContainer.style.display = 'none'

  if (activeView === 'Overview') {
    if (overviewContainer) overviewContainer.style.display = 'flex'
    if (statsStrip) statsStrip.style.display = 'grid'
    if (pageHeadingSubtitle) pageHeadingSubtitle.textContent = 'Workspace dashboard showing projects, deliverables, and team deliverables.'
    renderOverviewPanel()
  } else if (activeView === 'Calendar') {
    if (calendarContainer) calendarContainer.style.display = 'flex'
    if (statsStrip) statsStrip.style.display = 'none'
    if (pageHeadingSubtitle) pageHeadingSubtitle.textContent = 'Timeline view of tasks, deadlines, and project milestones.'
    renderCalendarPanel()
  } else if (activeView === 'Admin Console') {
    if (adminContainer) adminContainer.style.display = 'flex'
    if (statsStrip) statsStrip.style.display = 'none'
    if (pageHeadingSubtitle) pageHeadingSubtitle.textContent = 'Workspace settings, roles, member management, and security policies.'
    renderMembersTable()
    renderAuditLogs()
  } else {
    // Project Board or My Tasks
    if (boardContainer) boardContainer.style.display = 'block'
    if (statsStrip) statsStrip.style.display = 'grid'
    if (pageHeadingSubtitle) {
      pageHeadingSubtitle.textContent = activeView === 'My Tasks'
        ? `Tasks assigned to ${currentUser.name} across all active projects.`
        : `A shared space for your team to plan, track, and ship meaningful work.`
    }
    renderTasks()
  }
}

// ============================================================
// ADMIN CONSOLE TABLE & FUNCTIONS
// ============================================================

function renderMembersTable() {
  const tbody = document.querySelector('#admin-members-tbody')
  const countBadge = document.querySelector('#admin-member-count')
  if (!tbody) return

  if (countBadge) countBadge.textContent = `${members.length} members`
  tbody.replaceChildren()

  members.forEach(member => {
    const tr = document.createElement('tr')

    // Member cell
    const tdMember = document.createElement('td')
    const cellWrap = make('div', 'member-cell')
    const av = make('div', `avatar ${member.tone || 'coral'}-bg`, member.initials)
    const info = make('div', 'member-info')
    info.append(make('strong', '', member.name), make('small', '', member.email))
    cellWrap.append(av, info)
    tdMember.append(cellWrap)

    // Role cell
    const tdRole = document.createElement('td')
    const roleSelect = document.createElement('select')
    roleSelect.className = 'admin-role-select'
    ;['Workspace Admin', 'Product Lead', 'Designer', 'Engineer', 'Viewer'].forEach(r => {
      const opt = make('option', '', r)
      opt.value = r
      if (member.role === r) opt.selected = true
      roleSelect.append(opt)
    })
    roleSelect.addEventListener('change', () => {
      const oldRole = member.role
      member.role = roleSelect.value
      saveMembers()
      addAuditLog(`Role updated for ${member.name}`, `Changed from ${oldRole} to ${member.role}`, 'team')
    })
    tdRole.append(roleSelect)

    // Status cell
    const tdStatus = document.createElement('td')
    const statusBadge = make('span', `status-badge ${member.status.toLowerCase()}`, `● ${member.status}`)
    tdStatus.append(statusBadge)

    // Actions cell
    const tdActions = document.createElement('td')
    const removeBtn = make('button', 'action-btn delete', 'Remove')
    removeBtn.type = 'button'
    removeBtn.addEventListener('click', () => {
      if (members.length <= 1) {
        alert('Cannot remove the last member of the workspace.')
        return
      }
      members = members.filter(m => m.id !== member.id)
      saveMembers()
      renderMembersTable()
      addAuditLog(`Member removed`, `${member.name} (${member.email}) removed from workspace.`, 'trash')
    })
    tdActions.append(removeBtn)

    tr.append(tdMember, tdRole, tdStatus, tdActions)
    tbody.append(tr)
  })
}

function renderAuditLogs() {
  const container = document.querySelector('#admin-audit-list')
  if (!container) return
  container.replaceChildren()

  auditLogs.slice(0, 5).forEach(log => {
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
    container.append(item)
  })
}

function openInviteModal() {
  openInviteCollaboratorModal()
}

// ============================================================
// SIMULATE REAL-TIME COLLABORATION EVENT
// ============================================================

const simulatedEvents = [
  { author: 'SK', name: 'Sam Kim', tone: 'teal-bg', title: 'Task Completed', text: 'Sam Kim completed "Review onboarding flow"', iconType: 'check' },
  { author: 'JL', name: 'Jordan Lee', tone: 'orange-bg', title: 'New Comment', text: 'Jordan Lee commented on "QA final release candidate"', iconType: 'comment' },
  { author: 'ER', name: 'Elena Rostova', tone: 'purple-bg', title: 'Code Review Passed', text: 'Elena Rostova approved PR for Website Redesign', iconType: 'check' },
  { author: 'DP', name: 'Devon Patel', tone: 'blue-bg', title: 'Task Started', text: 'Devon Patel moved "Coordinate newsletter dispatch" to In progress', iconType: 'task' }
]

function simulateCollaborationEvent() {
  const ev = simulatedEvents[Math.floor(Math.random() * simulatedEvents.length)]
  pushNotification(ev.title, ev.text, ev.author, ev.tone)
  addAuditLog(ev.title, ev.text, ev.iconType)

  // Randomly advance a task
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

// Topbar profile dropdown
const signinUserBtn = document.querySelector('#signin-user-btn')
const profileDropdown = document.querySelector('#profile-dropdown-menu')

signinUserBtn?.addEventListener('click', e => {
  e.stopPropagation()
  if (notifDropdown) {
    notifDropdown.style.display = 'none'
    notifBtn?.classList.remove('active')
  }
  const isHidden = profileDropdown.style.display === 'none'
  profileDropdown.style.display = isHidden ? 'flex' : 'none'
  signinUserBtn.classList.toggle('active', isHidden)
})

document.querySelector('#user-profile')?.addEventListener('click', e => {
  e.stopPropagation()
  if (notifDropdown) notifDropdown.style.display = 'none'
  const isHidden = profileDropdown.style.display === 'none'
  profileDropdown.style.display = isHidden ? 'flex' : 'none'
  signinUserBtn?.classList.toggle('active', isHidden)
})

document.addEventListener('click', e => {
  if (profileDropdown && !e.target.closest('#profile-dropdown-wrap') && !e.target.closest('#user-profile')) {
    profileDropdown.style.display = 'none'
    signinUserBtn?.classList.remove('active')
  }
})

document.querySelector('#dropdown-toggle-role-btn')?.addEventListener('click', () => {
  toggleAdminRole()
})

document.querySelector('#dropdown-settings-btn')?.addEventListener('click', () => {
  if (profileDropdown) profileDropdown.style.display = 'none'
  signinUserBtn?.classList.remove('active')
  switchView('Admin Console')
})

document.querySelector('#dropdown-switch-user-btn')?.addEventListener('click', () => {
  window.location.href = '../auth/auth.html'
})

document.querySelector('#dropdown-logout-btn')?.addEventListener('click', () => {
  localStorage.removeItem('collab-logged-in')
  window.location.href = '../index.html'
})

// Notification dropdown
const notifBtn = document.querySelector('#notification-btn')
const notifDropdown = document.querySelector('#notification-dropdown')
const markReadBtn = document.querySelector('#mark-read-btn')

notifBtn?.addEventListener('click', e => {
  e.stopPropagation()
  if (profileDropdown) {
    profileDropdown.style.display = 'none'
    signinUserBtn?.classList.remove('active')
  }
  const isHidden = notifDropdown.style.display === 'none'
  notifDropdown.style.display = isHidden ? 'block' : 'none'
  notifBtn.classList.toggle('active', isHidden)
})

document.addEventListener('click', e => {
  if (notifDropdown && !e.target.closest('#notification-wrap')) {
    notifDropdown.style.display = 'none'
    notifBtn?.classList.remove('active')
  }
})

markReadBtn?.addEventListener('click', e => {
  e.stopPropagation()
  document.querySelectorAll('.notification-item.unread').forEach(item => {
    item.classList.remove('unread')
    const dot = item.querySelector('.notif-dot')
    if (dot) dot.style.display = 'none'
  })
  updateNotifCount()
})

document.querySelector('#simulate-notif-btn')?.addEventListener('click', e => {
  e.stopPropagation()
  simulateCollaborationEvent()
})

// Filter dropdown
const filterBtn = document.querySelector('#filter-btn')
const filterMenu = document.querySelector('#filter-menu')
const filterBtnLabel = document.querySelector('#filter-btn-label')

filterBtn?.addEventListener('click', e => {
  e.stopPropagation()
  filterMenu.style.display = filterMenu.style.display === 'none' ? 'flex' : 'none'
})

document.addEventListener('click', e => {
  if (filterMenu && !e.target.closest('#filter-dropdown-wrap')) {
    filterMenu.style.display = 'none'
  }
})

document.querySelectorAll('.filter-item').forEach(item => {
  item.addEventListener('click', () => {
    activeFilter = item.dataset.filter
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
  activeDisplayMode = 'board'
  viewBoardBtn.classList.add('active')
  viewListBtn?.classList.remove('active')
  if (boardColumns) boardColumns.style.display = 'grid'
  if (listViewContainer) listViewContainer.style.display = 'none'
})

viewListBtn?.addEventListener('click', () => {
  activeDisplayMode = 'list'
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
  })
})

// Testing Perspective Pills
document.querySelector('#pill-creator-view')?.addEventListener('click', () => {
  switchTestingPerspective('creator')
})

document.querySelector('#pill-member-view')?.addEventListener('click', () => {
  switchTestingPerspective('member')
})

// Task creation buttons
document.querySelector('#new-task-btn')?.addEventListener('click', () => openTaskModal('To do'))
document.querySelectorAll('[data-add]').forEach(button => {
  button.addEventListener('click', () => openTaskModal(button.dataset.add || 'To do'))
})

// Sprints management buttons
document.querySelector('#add-sprint-btn')?.addEventListener('click', openAddSprintModal)
document.querySelector('#project-sprints-btn')?.addEventListener('click', openAddSprintModal)

// Collaborator invitation & management
document.querySelector('#project-invite-collab-btn')?.addEventListener('click', openInviteCollaboratorModal)
document.querySelector('#project-manage-collab-btn')?.addEventListener('click', openManageCollaboratorsModal)

// Project creation buttons
document.querySelector('#add-project')?.addEventListener('click', openCreateProjectModal)
document.querySelector('#overview-create-proj-btn')?.addEventListener('click', openCreateProjectModal)

// Admin controls
document.querySelector('#admin-invite-btn')?.addEventListener('click', openInviteModal)
document.querySelector('#admin-toggle-role-btn')?.addEventListener('click', toggleAdminRole)

document.querySelector('#admin-settings-form')?.addEventListener('submit', e => {
  e.preventDefault()
  const wsName = document.querySelector('#admin-ws-name')?.value || 'Collab HQ'
  const defaultRole = document.querySelector('#admin-default-role')?.value || 'Engineer'
  localStorage.setItem('collab-workspace-settings', JSON.stringify({ name: wsName, defaultRole }))
  addAuditLog('Settings saved', `Workspace name set to "${wsName}".`, 'shield')
  alert(`✓ Workspace settings saved successfully!`)
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

// ============================================================
// INITIALIZATION
// ============================================================

updateUserUI()
renderProjectNav()
renderTasks()
renderMembersTable()
renderAuditLogs()
updateNotifCount()
