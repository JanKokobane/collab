// ============================================================
// INITIAL SEED DATA & STATE MANAGEMENT
// ============================================================

import {
  addDaysToDateKey,
  formatRelativeDate,
  toLocalDateKey
} from './dateUtils.js'
import { firebaseAuth } from '../../firebase.js'
import { api } from './api.js'

const seedToday = toLocalDateKey()
const seedDate = daysFromToday => addDaysToDateKey(seedToday, daysFromToday)

// ============================================================
// MEMBERS
// ============================================================

export const defaultMembers = [
  {
    id: 'm1',
    name: 'Alex Morgan',
    email: 'admin@collab.io',
    initials: 'AM',
    role: 'Workspace Admin',
    tone: 'coral',
    status: 'Active'
  },
  {
    id: 'm2',
    name: 'Sam Kim',
    email: 'sam@collab.io',
    initials: 'SK',
    role: 'Product Lead',
    tone: 'teal',
    status: 'Active'
  },
  {
    id: 'm3',
    name: 'Jordan Lee',
    email: 'jordan@collab.io',
    initials: 'JL',
    role: 'Designer',
    tone: 'orange',
    status: 'Active'
  },
  {
    id: 'm4',
    name: 'Elena Rostova',
    email: 'elena@collab.io',
    initials: 'ER',
    role: 'Engineer',
    tone: 'purple',
    status: 'Active'
  },
  {
    id: 'm5',
    name: 'Devon Patel',
    email: 'devon@collab.io',
    initials: 'DP',
    role: 'Engineer',
    tone: 'blue',
    status: 'Active'
  }
]

// ============================================================
// PROJECT STATE
// ============================================================
//
// Projects are now managed by the Collab backend/PostgreSQL.
// They are intentionally NOT loaded from or saved to localStorage.
//
// Backend:
// GET    /api/projects
// POST   /api/projects
// GET    /api/projects/:projectId
// PUT    /api/projects/:projectId
// DELETE /api/projects/:projectId
//
// Authentication is handled with a Firebase ID token.
// ============================================================

const API_BASE_URL = (window.COLLAB_API_BASE_URL || 'https://collab-y7pb.onrender.com').replace(/\/+$/, '')

export let projects = []

let projectsLoaded = false
let projectsLoading = false

async function getFirebaseToken() {
  const user = firebaseAuth.currentUser
  if (!user) {
    throw new Error('You must be signed in to load projects.')
  }
  return user.getIdToken(false)
}

/**
 * Convert a backend project into the shape expected by
 * the existing frontend project-management module.
 */
function normalizeProject(project) {
  if (!project) return null
  const allowedColors = ['yellow', 'green', 'blue', 'purple', 'coral', 'orange', 'rose']
  const color = allowedColors.includes(project.color) ? project.color : 'yellow'

  return {
    // Keep both because some existing frontend code uses id
    // while newer backend operations use projectId.
    id: project.project_id || project.id || '',
    projectId: project.project_id || project.id || '',

    name: project.name || '',

    projectType:
      project.project_type ||
      project.projectType ||
      'General Collaboration',

    timeSpan:
      project.time_span ||
      project.timeSpan ||
      'Ongoing',

    description: project.description || '',

    color,

    creatorFirebaseUid:
      project.creator_firebase_uid ||
      project.creatorFirebaseUid ||
      null,

    creatorEmail:
      project.creator_email ||
      project.creatorEmail ||
      '',

    creatorName:
      project.creator_name ||
      project.creatorName ||
      '',

    creatorInitials:
      project.creator_initials ||
      project.creatorInitials ||
      '',

    creatorProfileImage:
      project.creator_profile_image ||
      project.creatorProfileImage ||
      '',

    invitedMembers: Array.isArray(
      project.invited_members
    )
      ? project.invited_members
      : Array.isArray(project.invitedMembers)
        ? project.invitedMembers
        : [],

    acceptedMembers: Array.isArray(project.accepted_members)
      ? project.accepted_members
      : Array.isArray(project.acceptedMembers)
        ? project.acceptedMembers
        : [],

    sprints: Array.isArray(project.sprints)
      ? project.sprints
      : [],

    createdAt:
      project.created_at ||
      project.createdAt ||
      null,

    updatedAt:
      project.updated_at ||
      project.updatedAt ||
      null
  }
}

/**
 * Replace the local in-memory project state with projects
 * returned by the backend.
 */
function setProjectsFromBackend(serverProjects = []) {
  projects = serverProjects
    .map(normalizeProject)
    .filter(Boolean)

  projectsLoaded = true
}

/**
 * Load the authenticated user's projects from PostgreSQL.
 *
 * The backend determines ownership from the Firebase UID.
 * The frontend does NOT send or trust a creator UID.
 */
export async function loadProjectsFromAPI({
  silent = false
} = {}) {
  if (projectsLoading) {
    return projects
  }

  projectsLoading = true

  try {
    const token = await getFirebaseToken()

    const response = await fetch(
      `${API_BASE_URL}/api/projects`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      }
    )

    let result = null

    try {
      result = await response.json()
    } catch {
      result = null
    }

    if (!response.ok) {
      const message =
        result?.message ||
        'Projects could not be loaded.'

      throw new Error(message)
    }

    const serverProjects = result?.data?.projects
    if (!Array.isArray(serverProjects)) {
      throw new Error('The server returned an invalid projects response.')
    }

    setProjectsFromBackend(serverProjects)

    return projects
  } catch (error) {
    console.error(
      'Failed to load projects from backend:',
      error
    )

    if (!silent) {
      console.error(
        error?.message ||
        'Unable to load projects.'
      )
    }

    projects = []
    projectsLoaded = false

    throw error
  } finally {
    projectsLoading = false
  }
}

/**
 * Check whether the initial backend project request
 * has completed successfully.
 */
export function areProjectsLoaded() {
  return projectsLoaded
}

/**
 * Replace the in-memory project state.
 *
 * IMPORTANT:
 * This does NOT save anything to localStorage.
 * Project persistence must happen through the backend API.
 */
export function setProjects(newProjects) {
  projects = Array.isArray(newProjects)
    ? newProjects
        .map(normalizeProject)
        .filter(Boolean)
    : []

  projectsLoaded = true
}

/**
 * Kept for compatibility with existing modules that still
 * call saveProjects().
 *
 * Projects are no longer persisted through localStorage.
 */
export const saveProjects = () => {}

// ============================================================
// TASK SEED DATA
// ============================================================

export const seedTasks = [
  {
    id: 1,
    project: 'Product Launch',
    title: 'Create wireframes for the new dashboard',
    tag: 'Design',
    tagTone: 'purple',
    due: formatRelativeDate(seedDate(0)),
    date: seedDate(0),
    assignee: 'AM',
    assigneeName: 'Alex Morgan',
    assigneeTone: 'teal',
    status: 'To do',
    progress: 72,
    sprint: 'Sprint 1: Wireframes',
    approvalStatus: 'approved',
    approvedBy: 'Alex Morgan',
    description:
      'Bring the dashboard concept to life with clear, low-fidelity wireframes.',
    comments: 2,
    commentsList: [
      {
        id: 101,
        author: 'JL',
        authorName: 'Jordan Lee',
        tone: 'orange',
        text: 'Reviewed the specs, looks solid!',
        time: '2 hours ago'
      },
      {
        id: 102,
        author: 'SK',
        authorName: 'Sam Kim',
        tone: 'teal',
        text: 'Make sure to include mobile responsiveness.',
        time: '1 hour ago'
      }
    ]
  },

  {
    id: 2,
    project: 'Product Launch',
    title: 'Set up analytics tracking',
    tag: 'Development',
    tagTone: 'blue',
    due: formatRelativeDate(seedDate(1)),
    date: seedDate(1),
    assignee: 'JL',
    assigneeName: 'Jordan Lee',
    assigneeTone: 'orange',
    status: 'To do',
    progress: 35,
    sprint: 'Sprint 2: Analytics & MVP',
    approvalStatus: 'none',
    description:
      'Add key events and conversion tracking for the product launch.',
    comments: 1,
    commentsList: [
      {
        id: 103,
        author: 'AM',
        authorName: 'Alex Morgan',
        tone: 'coral',
        text: 'Segment tracking IDs are ready in the repo.',
        time: '3 hours ago'
      }
    ]
  },

  {
    id: 3,
    project: 'Product Launch',
    title: 'Write launch announcement',
    tag: 'Marketing',
    tagTone: 'green',
    due: formatRelativeDate(seedDate(4)),
    date: seedDate(4),
    assignee: 'SK',
    assigneeName: 'Sam Kim',
    assigneeTone: 'pink',
    status: 'In progress',
    progress: 45,
    sprint: 'Sprint 2: Analytics & MVP',
    approvalStatus: 'none',
    description:
      'Draft the announcement for the upcoming launch campaign.',
    comments: 0,
    commentsList: []
  },

  {
    id: 4,
    project: 'Product Launch',
    title: 'Review onboarding flow',
    tag: 'Product',
    tagTone: 'yellow',
    due: formatRelativeDate(seedDate(6)),
    date: seedDate(6),
    assignee: 'AM',
    assigneeName: 'Alex Morgan',
    assigneeTone: 'teal',
    status: 'In progress',
    progress: 58,
    sprint: 'Sprint 2: Analytics & MVP',
    approvalStatus: 'none',
    description:
      'Review the onboarding experience and note opportunities to reduce friction.',
    comments: 1,
    commentsList: [
      {
        id: 104,
        author: 'JL',
        authorName: 'Jordan Lee',
        tone: 'orange',
        text: 'User drop-off is highest at step 2.',
        time: 'Yesterday'
      }
    ]
  },

  {
    id: 5,
    project: 'Product Launch',
    title: 'Prepare product screenshots',
    tag: 'Design',
    tagTone: 'purple',
    due: formatRelativeDate(seedDate(8)),
    date: seedDate(8),
    assignee: 'SK',
    assigneeName: 'Sam Kim',
    assigneeTone: 'pink',
    status: 'Done',
    progress: 100,
    sprint: 'Sprint 1: Wireframes',
    approvalStatus: 'approved',
    approvedBy: 'Alex Morgan',
    description:
      'Capture polished screenshots for the launch page and social channels.',
    comments: 1,
    commentsList: [
      {
        id: 105,
        author: 'SK',
        authorName: 'Sam Kim',
        tone: 'teal',
        text: 'Uploaded 4 high-res assets to the team Drive.',
        time: '2 days ago'
      }
    ]
  },

  {
    id: 6,
    project: 'Product Launch',
    title: 'QA final release candidate',
    tag: 'Development',
    tagTone: 'blue',
    due: formatRelativeDate(seedDate(10)),
    date: seedDate(10),
    assignee: 'JL',
    assigneeName: 'Jordan Lee',
    assigneeTone: 'orange',
    status: 'Done',
    progress: 100,
    sprint: 'Sprint 3: Release & Launch',
    approvalStatus: 'approved',
    approvedBy: 'Alex Morgan',
    description:
      'Run through the release checklist and record any blocking issues.',
    comments: 0,
    commentsList: []
  },

  {
    id: 7,
    project: 'Website Redesign',
    title: 'Optimize hero asset loading',
    tag: 'Development',
    tagTone: 'blue',
    due: formatRelativeDate(seedDate(0)),
    date: seedDate(0),
    assignee: 'ER',
    assigneeName: 'Elena Rostova',
    assigneeTone: 'purple',
    status: 'In progress',
    progress: 60,
    sprint: 'Sprint 1: Typography & Layout',
    approvalStatus: 'none',
    description:
      'Convert banners to WebP and enable responsive srcsets.',
    comments: 0,
    commentsList: []
  },

  {
    id: 8,
    project: 'Marketing Sprint',
    title: 'Coordinate newsletter dispatch',
    tag: 'Marketing',
    tagTone: 'green',
    due: formatRelativeDate(seedDate(1)),
    date: seedDate(1),
    assignee: 'DP',
    assigneeName: 'Devon Patel',
    assigneeTone: 'blue',
    status: 'To do',
    progress: 20,
    sprint: 'Sprint 1: Content & Dispatch',
    approvalStatus: 'none',
    description:
      'Finalize copy and preview test send to beta testers.',
    comments: 1,
    commentsList: [
      {
        id: 106,
        author: 'SK',
        authorName: 'Sam Kim',
        tone: 'teal',
        text: 'A/B testing subject lines is set up.',
        time: '4 hours ago'
      }
    ]
  }
]

// ============================================================
// LOCAL TASK STATE
// ============================================================

export let members =
  JSON.parse(
    localStorage.getItem('collab-members') || 'null'
  ) || defaultMembers

function rebaseSeedDates(
  items,
  seeds,
  legacyDates,
  storageKey
) {
  let changed = false

  const updatedItems = items.map(item => {
    const seed = seeds.find(
      candidate =>
        String(candidate.id) === String(item.id) &&
        candidate.title === item.title
    )

    if (
      seed &&
      item.date === legacyDates[item.id] &&
      item.date !== seed.date
    ) {
      changed = true

      return {
        ...seed,
        ...item,
        date: seed.date,
        ...(
          'due' in seed
            ? { due: seed.due }
            : {}
        )
      }
    }

    return item
  })

  if (changed) {
    localStorage.setItem(
      storageKey,
      JSON.stringify(updatedItems)
    )
  }

  return updatedItems
}

let storedTasks =
  JSON.parse(
    localStorage.getItem('collab-tasks') || 'null'
  )

export let tasks =
  (
    !storedTasks ||
    storedTasks.length < 8 ||
    !storedTasks.some(
      t =>
        t.title ===
        'Optimize hero asset loading'
    )
  )
    ? seedTasks
    : rebaseSeedDates(
        storedTasks,
        seedTasks,
        {
          1: '2026-10-04',
          2: '2026-10-05',
          3: '2026-10-08',
          4: '2026-10-10',
          5: '2026-10-12',
          6: '2026-10-14',
          7: '2026-10-04',
          8: '2026-10-05'
        },
        'collab-tasks'
      )

localStorage.setItem(
  'collab-tasks',
  JSON.stringify(tasks)
)

export function getAccessibleTasks() {
  const accessibleProjectNames = new Set(projects.map(project => project.name))
  return tasks.filter(task =>
    task.backendPersistent && accessibleProjectNames.has(task.project)
  )
}

export function replaceProjectTasksFromBackend(projectTaskGroups = []) {
  const accessibleProjectNames = new Set(projects.map(project => project.name))
  const projectById = new Map(projects.map(project => [project.projectId, project]))
  const backendTasks = projectTaskGroups.flatMap(({ projectId, tasks: projectTasks }) => {
    const project = projectById.get(projectId)
    if (!project || !Array.isArray(projectTasks)) return []
    return projectTasks.map(task => {
      const assigneeName = task.assignee_name || task.assignee_email || 'Project invitee'
      const assignee = assigneeName
        .trim()
        .split(/\s+/)
        .map(part => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
      const dueDate = task.due_date ? String(task.due_date).slice(0, 10) : null
      const tagTone = {
        Design: 'purple',
        Development: 'blue',
        Marketing: 'green',
        Product: 'yellow'
      }[task.category] || 'blue'

      return {
        id: task.task_id,
        taskId: task.task_id,
        task_id: task.task_id,
        projectId,
        project_id: projectId,
        backendPersistent: true,
        project: project.name,
        title: task.title,
        description: task.description || '',
        tag: task.category || 'Product',
        category: task.category || 'Product',
        tagTone,
        due: dueDate ? formatRelativeDate(dueDate) : '—',
        date: dueDate,
        due_date: dueDate,
        startDate: task.start_date ? String(task.start_date).slice(0, 10) : null,
        start_date: task.start_date ? String(task.start_date).slice(0, 10) : null,
        assignee,
        assigneeName,
        assignee_name: task.assignee_name,
        assignee_email: task.assignee_email,
        assigneeFirebaseUid: task.assignee_firebase_uid,
        assignee_firebase_uid: task.assignee_firebase_uid,
        assigneeTone: 'teal',
        status: task.status || 'To do',
        done: task.status === 'Done',
        progress: task.status === 'Done' ? 100 : task.status === 'In progress' ? 50 : 0,
        sprint: task.sprint_name,
        sprint_name: task.sprint_name,
        approvalStatus: 'none',
        comments: 0,
        commentsList: []
      }
    })
  })

  tasks = [
    ...tasks.filter(task =>
      !task.backendPersistent && !accessibleProjectNames.has(task.project)
    ),
    ...backendTasks
  ]
}

export function getAccessibleMembers() {
  const memberMap = new Map()
  const addMember = member => {
    const email = member.email?.trim().toLowerCase()
    if (!email) return
    const name = member.name || email
    if (!memberMap.has(email)) {
      memberMap.set(email, {
        ...member,
        email,
        name,
        initials: member.initials || name.trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase(),
        tone: member.tone || 'teal'
      })
    }
  }

  projects.forEach(project => {
    addMember({
      firebaseUid: project.creatorFirebaseUid,
      email: project.creatorEmail,
      name: project.creatorName,
      initials: project.creatorInitials,
      tone: project.creatorTone
    })
    project.acceptedMembers?.forEach(addMember)
  })
  if (projects.length) {
    addMember({
      firebaseUid: currentUser.uid,
      email: currentUser.email,
      name: currentUser.name,
      initials: currentUser.initials,
      tone: currentUser.tone
    })
  }

  return [...memberMap.values()]
}

// ============================================================
// BACKEND-PERSISTED MEETING STATE
// ============================================================

export let meetings = []

// ============================================================
// BACKEND-PERSISTED PROJECT REMINDERS
// ============================================================

export let reminders = []

export const saveTasks = () =>
  localStorage.setItem(
    'collab-tasks',
    JSON.stringify(tasks.filter(task => !task.backendPersistent))
  )

export const saveMembers = () =>
  localStorage.setItem(
    'collab-members',
    JSON.stringify(members)
  )

// ============================================================
// STATE MUTATION HELPERS
// ============================================================

export function setMembers(newMembers) {
  members = newMembers
  saveMembers()
}

export function setTasks(newTasks) {
  tasks = newTasks
  saveTasks()
}

export function setMeetings(newMeetings) {
  meetings = newMeetings
}

export function setReminders(newReminders) {
  reminders = newReminders
}

// ============================================================
// TASK NORMALIZATION
// ============================================================

tasks.forEach(task => {
  if (task.approvalStatus === undefined) {
    task.approvalStatus =
      task.status === 'Done'
        ? 'approved'
        : 'none'
  }

  if (!task.sprint) {
    task.sprint =
      'Sprint 2: Core Implementation'
  }
})

// ============================================================
// CURRENT USER
// ============================================================

export const defaultUser = {
  name: 'Alex Morgan',
  email: 'admin@collab.io',
  initials: 'AM',
  tone: 'coral',
  role: 'Workspace Admin',
  isAdmin: true,
  profileImage: ''
}

export let currentUser =
  JSON.parse(
    localStorage.getItem('collab-user') || 'null'
  ) || defaultUser

export function setCurrentUser(user) {
  currentUser = user

  const storedUser = {
    ...currentUser,
    profileImage: /^data:image\//i.test(currentUser.profileImage || '')
      ? ''
      : currentUser.profileImage || '',
    photoURL: /^data:image\//i.test(currentUser.photoURL || '')
      ? ''
      : currentUser.photoURL || ''
  }
  localStorage.setItem(
    'collab-user',
    JSON.stringify(storedUser)
  )
}

// ============================================================
// USER / AVATAR HELPERS
// ============================================================

export function getUserInitials(name = '') {
  const cleaned = String(name || '').trim()

  if (!cleaned) return 'AM'

  const parts = cleaned
    .split(/\s+/)
    .filter(Boolean)

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase()
  }

  return (
    parts[0][0] +
    parts[parts.length - 1][0]
  ).toUpperCase()
}

export function getAvatarSource(person = {}) {
  return (
    person?.profileImage ||
    person?.photoURL ||
    person?.avatar ||
    ''
  )
}

export function renderAvatarElement(
  element,
  person = {},
  extraClasses = ''
) {
  if (!element) return

  const source =
    getAvatarSource(person)

  const initials =
    person?.initials ||
    getUserInitials(person?.name || '') ||
    'AM'

  const tone =
    person?.tone || 'coral'

  const className =
    `avatar ${tone}-bg ${extraClasses}`.trim()

  element.className = className
  element.textContent = ''
  element.innerHTML = ''

  if (source) {
    const img =
      document.createElement('img')

    img.src = source
    img.alt =
      person?.name ||
      'User avatar'

    img.style.width = '100%'
    img.style.height = '100%'
    img.style.objectFit = 'cover'
    img.style.borderRadius = '50%'
    img.style.display = 'block'

    img.addEventListener(
      'error',
      () => {
        img.remove()
        element.textContent = initials
      },
      { once: true }
    )

    element.appendChild(img)
    return
  }

  element.textContent = initials
}

// ============================================================
// ACTIVE VIEW
// ============================================================

export let activeView = 'Workspace'

export function setActiveView(v) {
  activeView = v
}

// ============================================================
// ACTIVE FILTER
// ============================================================

export let activeFilter = 'all'

export function setActiveFilter(f) {
  activeFilter = f
}

// ============================================================
// ACTIVE SPRINT FILTER
// ============================================================

export let activeSprintFilter = 'all'

export function setActiveSprintFilter(s) {
  activeSprintFilter = s
}

// ============================================================
// DISPLAY MODE
// ============================================================

export let activeDisplayMode = 'board'

export function setActiveDisplayMode(m) {
  activeDisplayMode = m
}

// ============================================================
// MODAL ROOT
// ============================================================

export function getModalRoot() {
  return document.querySelector('#modal-root')
}

export const root = {
  replaceChildren(...args) {
    const el = getModalRoot()

    if (el) {
      el.replaceChildren(...args)
    }
  },

  append(...args) {
    const el = getModalRoot()

    if (el) {
      el.append(...args)
    }
  },

  appendChild(...args) {
    const el = getModalRoot()

    if (el) {
      el.appendChild(...args)
    }
  }
}

// ============================================================
// CENTRAL SYNCHRONOUS HUB
// ============================================================
//
// Used for inter-module coordination without circular
// dependencies.
// ============================================================

export const hub = {
  renderTasks: () => {},
  renderListView: () => {},
  renderOverviewPanel: () => {},
  renderCalendarPanel: () => {},
  renderMembersTable: () => {},
  renderAdminTasksTable: () => {},
  renderAdminMeetingsTable: () => {},
  loadProjectMembers: () => {},
  renderAuditLogs: () => {},
  renderMessages: () => {},
  switchView: () => {},
  openAdminTaskModal: () => {},
  openCreateProjectModal: () => {},
  openEditProjectModal: () => {},
  openInviteCollaboratorModal: () => {},
  renderAdminProjectsTable: () => {},
  moveTaskStatus: () => {},
  renderNotifications: () => {}
}

export function registerHub(actions) {
  Object.assign(hub, actions)
}

// ============================================================
// AUDIT LOGS
// ============================================================

export let auditLogs = [
  {
    iconType: 'shield',
    action: 'Collaborator session active',
    detail:
      'Alex Morgan (mashathabiso2006) active in Collab workspace.',
    time: 'Just now'
  },
  {
    iconType: 'sync',
    action: 'Group projects synchronized',
    detail:
      '3 collaborative boards ready for active sprints.',
    time: '5 mins ago'
  },
  {
    iconType: 'team',
    action: 'Team active',
    detail:
      '5 collaborators available for task assignments.',
    time: '15 mins ago'
  }
]

// ============================================================
// NOTIFICATIONS
// ============================================================

export let notifications = []

const localNotificationsKey = () => {
  const uid = firebaseAuth.currentUser?.uid
  return uid ? `collab_notifications_${uid}` : null
}

export function saveNotifications() {
  const storageKey = localNotificationsKey()
  if (storageKey) {
    localStorage.setItem(
      storageKey,
      JSON.stringify(notifications.filter(notification => !notification.persisted))
    )
  }
  updateNotifCount()
  hub.renderNotifications?.()
}

function normalizeNotification(notification) {
  return {
    id: String(notification.id),
    type: notification.type,
    title: notification.title,
    detail: notification.detail,
    boardId: notification.brainstorm_board_id || null,
    avatar: notification.avatar || '•',
    toneClass: notification.tone_class || 'coral-bg',
    invitationId: notification.invitation_id || null,
    invitationStatus: notification.invitation_status || null,
    invitationExpiresAt: notification.invitation_expires_at || null,
    time: notification.created_at
      ? new Date(notification.created_at).toLocaleString()
      : 'Just now',
    unread: !notification.is_read,
    persisted: true
  }
}

export async function loadNotificationsFromAPI() {
  const response = await api.get('/notifications')
  const records = response?.data?.notifications
  if (!Array.isArray(records)) {
    throw new Error('The server returned an invalid notifications response.')
  }
  const storageKey = localNotificationsKey()
  const cached = storageKey
    ? JSON.parse(localStorage.getItem(storageKey) || '[]')
    : []
  notifications = [
    ...records.map(normalizeNotification),
    ...(Array.isArray(cached) ? cached : [])
  ]
  updateNotifCount()
  hub.renderNotifications?.()
  hub.renderWorkspaceSummary?.()
  return notifications
}

export function clearNotificationsForSignedOutUser() {
  notifications = []
  updateNotifCount()
  hub.renderNotifications?.()
  hub.renderWorkspaceSummary?.()
}

export function addPersistedNotification(notification) {
  const saved = normalizeNotification(notification)
  notifications = [saved, ...notifications.filter(item => item.id !== saved.id)].slice(0, 50)
  updateNotifCount()
  hub.renderNotifications?.()
  hub.renderWorkspaceSummary?.()
}

// ============================================================
// NOTIFICATION HELPERS
// ============================================================

export async function markNotificationRead(id) {
  const notification =
    notifications.find(
      item => item.id === id
    )

  if (
    !notification ||
    !notification.unread
  ) {
    return
  }

  if (notification.persisted) {
    await api.patch(`/notifications/${encodeURIComponent(id)}/read`, {})
  }
  notification.unread = false

  saveNotifications()
}

export async function markAllNotificationsRead() {
  if (notifications.some(notification => notification.persisted && notification.unread)) {
    await api.patch('/notifications/read-all', {})
  }
  notifications.forEach(
    notification => {
      notification.unread = false
    }
  )

  saveNotifications()
}

export async function clearAllNotifications() {
  if (notifications.length === 0) {
    return
  }

  if (notifications.some(notification => notification.persisted)) {
    await api.delete('/notifications')
  }
  notifications = []

  saveNotifications()
}

// ============================================================
// AUDIT LOG HELPER
// ============================================================

export function addAuditLog(
  action,
  detail,
  iconType = 'sync'
) {
  auditLogs.unshift({
    iconType,
    action,
    detail,
    time: 'Just now'
  })

  if (auditLogs.length > 20) {
    auditLogs.pop()
  }

  hub.renderAuditLogs?.()
  hub.renderOverviewPanel?.()
}

// ============================================================
// PUSH NOTIFICATION
// ============================================================

export function pushNotification(
  titleText,
  detailText,
  avatarText = '⚡',
  toneClass = 'coral-bg'
) {
  notifications.unshift({
    id:
      `notification-${Date.now()}-` +
      Math.random()
        .toString(36)
        .slice(2, 7),

    title: String(titleText),

    detail: String(detailText),

    avatar: String(avatarText),

    toneClass,

    time: 'Just now',

    unread: true,
    persisted: false
  })

  notifications =
    notifications.slice(0, 50)

  saveNotifications()
}

// ============================================================
// NOTIFICATION COUNT
// ============================================================

export function updateNotifCount() {
  const unreadCount =
    notifications.filter(
      notification =>
        notification.unread
    ).length

  document
    .querySelectorAll(
      '.notification-badge'
    )
    .forEach(badge => {
      badge.textContent = unreadCount

      badge.style.display =
        unreadCount > 0
          ? 'flex'
          : 'none'
    })
}

// ============================================================
// DOM FACTORY
// ============================================================

export const make = (
  tag,
  className,
  text
) => {
  const element =
    document.createElement(tag)

  if (className) {
    element.className =
      className
  }

  if (text !== undefined) {
    element.textContent = text
  }

  return element
}

// ============================================================
// MODAL CLOSE
// ============================================================

export function closeModal() {
  const modalRoot =
    getModalRoot()

  if (modalRoot) {
    modalRoot.replaceChildren()
  }
}