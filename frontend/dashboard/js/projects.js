import {
  projects,
  members,
  tasks,
  currentUser,
  activeView,
  setActiveView,
  make,
  closeModal,
  root,
  saveProjects,
  saveMembers,
  saveTasks,
  addAuditLog,
  pushNotification,
  addPersistedNotification,
  hub
} from './state.js'
import { api } from './api.js'
import { firebaseAuth } from '../../firebase.js'
import { showDashboardConfirmation, showDashboardToast } from './modalChrome.js'

import {
  getActiveProject,
  isCurrentUserProjectCreator,
  showPermissionNotice,
  updateUserUI
} from './auth.js'

import { switchView } from './navigation.js'
import { toLocalDateKey } from './dateUtils.js'

// ============================================================
// PROJECTS MANAGEMENT (Create Group Projects)
// ============================================================

export function renderProjectNav() {
  const container = document.querySelector('#project-nav-list')

  if (!container) return

  container.replaceChildren()

  if (!projects.length) {
    const empty = make('div', 'project-nav-empty')
    empty.append(
      make('p', '', 'No projects yet. Create one to get started.')
    )
    const createButton = make('button', 'outline-button', 'Create a project')
    createButton.type = 'button'
    createButton.addEventListener('click', openCreateProjectModal)
    empty.append(createButton)
    container.append(empty)
    return
  }

  projects.forEach(project => {
    const item = document.createElement('a')

    item.className =
      `nav-item project ${activeView === project.name ? 'active' : ''}`

    item.dataset.view = project.name

    const dot = document.createElement('i')
    dot.className = `dot ${project.color || 'blue'}`

    const name = document.createElement('span')
    name.textContent = project.name

    item.append(dot, name)

    item.addEventListener('click', () => {
      switchView(project.name)
    })

    container.append(item)
  })
}

// ============================================================
// COLLABORATION TYPES & COLOR ACCENTS
// ============================================================

export const collaborationTypes = [
  { value: '', label: 'Choose a collaboration type' },
  { value: 'Software development', label: 'Software development' },
  { value: 'Web development', label: 'Web development' },
  { value: 'App development', label: 'App development' },
  { value: 'UI/UX design', label: 'UI/UX design' },
  { value: 'Graphic design', label: 'Graphic design' },
  { value: 'Product collaboration', label: 'Product collaboration' },
  { value: 'Marketing campaign', label: 'Marketing campaign' },
  { value: 'Digital marketing', label: 'Digital marketing' },
  { value: 'Social media marketing', label: 'Social media marketing' },
  { value: 'Content creation', label: 'Content creation' },
  { value: 'Content strategy', label: 'Content strategy' },
  { value: 'Influencer campaign', label: 'Influencer campaign' },
  { value: 'Brand partnership', label: 'Brand partnership' },
  { value: 'Event partnership', label: 'Event partnership' },
  { value: 'Event planning', label: 'Event planning' },
  { value: 'Photography', label: 'Photography' },
  { value: 'Videography', label: 'Videography' },
  { value: 'Video production', label: 'Video production' },
  { value: 'Copywriting', label: 'Copywriting' },
  { value: 'Public relations', label: 'Public relations' },
  { value: 'Advertising', label: 'Advertising' },
  { value: 'Sales partnership', label: 'Sales partnership' },
  { value: 'Business development', label: 'Business development' },
  { value: 'Research project', label: 'Research project' },
  { value: 'Consulting', label: 'Consulting' },
  { value: 'Startup collaboration', label: 'Startup collaboration' },
  { value: 'Community project', label: 'Community project' },
  { value: 'Education and training', label: 'Education and training' },
  { value: 'Music and entertainment', label: 'Music and entertainment' },
  { value: 'Fashion collaboration', label: 'Fashion collaboration' },
  { value: 'Creative project', label: 'Creative project' },
  { value: 'Nonprofit / social impact', label: 'Nonprofit / social impact' },
  { value: 'Other', label: 'Other' }
]

export const projectColors = [
  { value: 'yellow', label: 'Sunflower Yellow', color: '#EAB308' },
  { value: 'green', label: 'Emerald Green', color: '#2E8B57' },
  { value: 'blue', label: 'Sky Blue', color: '#4A90E2' },
  { value: 'purple', label: 'Royal Purple', color: '#7C3AED' },
  { value: 'coral', label: 'Coral', color: '#E07A5F' },
  { value: 'orange', label: 'Orange', color: '#F97316' },
  { value: 'rose', label: 'Rose', color: '#E11D48' }
]

export function createCollaborationTypeSelect(initialValue = '') {
  const typeSelect = document.createElement('select')
  typeSelect.className = 'project-type-select'
  typeSelect.required = true

  collaborationTypes.forEach(({ value, label }) => {
    const opt = document.createElement('option')
    opt.value = value
    opt.textContent = label
    if (value === '') {
      opt.disabled = true
      if (!initialValue) opt.selected = true
    } else if (value === initialValue) {
      opt.selected = true
    }
    typeSelect.append(opt)
  })

  return typeSelect
}

export function createColorPicker(initialColor = 'yellow', onColorChange = () => {}) {
  let selected = projectColors.some(({ value }) => value === initialColor) ? initialColor : 'yellow'
  const colorPicker = make('div', 'project-color-picker')
  const colorSelect = document.createElement('select')
  colorSelect.className = 'project-color-select'
  colorSelect.setAttribute('aria-label', 'Project color accent')
  const selectedSwatch = make('span', 'project-color-swatch')

  projectColors.forEach(({ value, label, color }) => {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label
    option.dataset.color = color
    colorSelect.append(option)
  })

  const updateSelection = () => {
    selected = colorSelect.value
    selectedSwatch.style.backgroundColor =
      projectColors.find(({ value }) => value === selected)?.color || ''
  }

  colorSelect.value = selected
  updateSelection()
  colorSelect.addEventListener('change', () => {
    updateSelection()
    onColorChange(selected)
  })
  colorPicker.append(selectedSwatch, colorSelect)

  return {
    element: colorPicker,
    getColor: () => selected,
    setColor: (val) => {
      selected = projectColors.some(({ value }) => value === val) ? val : 'yellow'
      colorSelect.value = selected
      updateSelection()
    }
  }
}

// ============================================================
// CREATE GROUP PROJECT
// ============================================================

export function openCreateProjectModal() {
  const backdrop = make('div', 'modal-backdrop')
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) closeModal()
  })

  const form = make('form', 'modal')

  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)

  const title = make('h2', '', 'Create Group Project')
  const copy = make(
    'p',
    'modal-copy',
    'Start a shared board for your team to plan, break into sprints, assign, and track work.'
  )

  const nameLabel = make('label', '', 'Project Name')
  const nameInput = make('input')
  nameInput.required = true
  nameInput.placeholder = 'e.g. Mobile App v2'
  nameLabel.append(nameInput)

  const typeLabel = make('label', '', 'Collaboration Type')
  const typeSelect = createCollaborationTypeSelect('')
  typeLabel.append(typeSelect)

  const timeSpanLabel = make('label', '', 'Time Span (Optional)')
  const timeSpanInput = make('input')
  timeSpanInput.placeholder = 'e.g. 6 weeks, Q4 2026, or Oct 15 - Dec 1'
  timeSpanLabel.append(timeSpanInput)

  const descLabel = make('label', '', 'Description (Optional)')
  const descInput = make('input')
  descInput.placeholder = 'Brief purpose of this project board'
  descLabel.append(descInput)

  const colorLabel = make('label', '', 'Color Accent')
  const colorPickerObj = createColorPicker('yellow')
  colorLabel.append(colorPickerObj.element)

  const submit = make('button', 'primary-button full gold', 'Create Project Board')
  submit.type = 'submit'
  const errorNotice = make('p', 'project-form-error')
  errorNotice.setAttribute('role', 'alert')
  errorNotice.hidden = true

  form.append(
    close,
    make('p', 'eyebrow', 'NEW GROUP PROJECT'),
    title,
    copy,
    nameLabel,
    typeLabel,
    timeSpanLabel,
    descLabel,
    colorLabel,
    errorNotice,
    submit
  )

  form.addEventListener('submit', async e => {
    e.preventDefault()

    const name = nameInput.value.trim()
    const projectType = typeSelect.value || 'General Collaboration'
    const timeSpan = timeSpanInput.value.trim() || 'Ongoing'
    const description = descInput.value.trim() || `Collaborative ${projectType.toLowerCase()} project board.`
    const color = colorPickerObj.getColor()

    if (!name) {
      nameInput.focus()
      return
    }

    const duplicateProject = projects.some(
      p => String(p.name).trim().toLowerCase() === name.toLowerCase()
    )
    if (duplicateProject) {
      nameInput.setCustomValidity('A project with this name already exists.')
      nameInput.reportValidity()
      return
    }
    nameInput.setCustomValidity('')

    const timestamp = Date.now()
    const newProject = {
      id: `p_${timestamp}`,
      name,
      projectType,
      timeSpan,
      color,
      description,
      creatorEmail: currentUser?.email || 'admin@collab.io',
      creatorName: currentUser?.name || 'Alex Morgan',
      creatorInitials: currentUser?.initials || 'AM',
      invitedMembers: members.map(member => ({ ...member })),
      sprints: [
        {
          id: `s_${timestamp}_1`,
          name: 'Sprint 1: Kickoff & Scoping',
          status: 'Active'
        },
        {
          id: `s_${timestamp}_2`,
          name: 'Sprint 2: Implementation',
          status: 'Upcoming'
        }
      ]
    }

    submit.disabled = true
    try {
      const response = await api.post('/projects', {
        project_id: newProject.id,
        name: newProject.name,
        project_type: newProject.projectType,
        time_span: newProject.timeSpan,
        description: newProject.description,
        color: newProject.color,
        invited_members: newProject.invitedMembers,
        sprints: newProject.sprints
      })
      const savedProject = response?.data?.project
      if (!savedProject) {
        throw new Error('The server did not return the created project.')
      }
      const savedNotification = response?.data?.notification
      if (!savedNotification) {
        throw new Error('The server did not return the project notification.')
      }
      addPersistedNotification(savedNotification)
      projects.push({
        ...newProject,
        ...savedProject,
        id: savedProject.project_id || savedProject.id || newProject.id,
        projectId: savedProject.project_id || savedProject.id || newProject.id,
        projectType: savedProject.project_type || newProject.projectType,
        timeSpan: savedProject.time_span || newProject.timeSpan,
        creatorFirebaseUid: savedProject.creator_firebase_uid || null,
        creatorEmail: savedProject.creator_email || newProject.creatorEmail,
        creatorName: savedProject.creator_name || newProject.creatorName,
        creatorInitials: savedProject.creator_initials || newProject.creatorInitials
      })
    } catch (error) {
      errorNotice.textContent = error.message || 'The project could not be created. Please try again.'
      errorNotice.hidden = false
      submit.disabled = false
      return
    }

    const today = toLocalDateKey()
    tasks.push({
      id: Date.now(),
      project: name,
      title: `Plan kickoff for ${name}`,
      tag: 'Product',
      tagTone: 'yellow',
      due: 'Today',
      startDate: today,
      date: today,
      assignee: currentUser?.initials || 'AM',
      assigneeName: currentUser?.name || 'Alex Morgan',
      assigneeTone: 'teal',
      status: 'To do',
      progress: 0,
      sprint: 'Sprint 1: Kickoff & Scoping',
      approvalStatus: 'none',
      description: `Initial planning checklist for ${name} (${projectType}).`,
      comments: 0,
      commentsList: []
    })
    saveTasks()

    closeModal()
    renderProjectNav()
    hub.renderAdminProjectsTable?.()
    switchView(name)

    addAuditLog(
      'Project created',
      `${currentUser?.name || 'Admin'} created ${projectType} project "${name}".`,
      'sync'
    )

  })

  backdrop.append(form)
  root.replaceChildren(backdrop)
  nameInput.focus()
}

// ============================================================
// EDIT GROUP PROJECT
// ============================================================

export function openEditProjectModal(project) {
  if (!project) return

  const backdrop = make('div', 'modal-backdrop')
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) closeModal()
  })

  const form = make('form', 'modal')

  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)

  const title = make('h2', '', 'Edit Group Project')
  const copy = make(
    'p',
    'modal-copy',
    'Update project name, collaboration type, timeline schedule, description, or color theme.'
  )

  const nameLabel = make('label', '', 'Project Name')
  const nameInput = make('input')
  nameInput.required = true
  nameInput.value = project.name || ''
  nameInput.placeholder = 'e.g. Mobile App v2'
  nameLabel.append(nameInput)

  const typeLabel = make('label', '', 'Collaboration Type')
  const typeSelect = createCollaborationTypeSelect(project.projectType || '')
  typeLabel.append(typeSelect)

  const timeSpanLabel = make('label', '', 'Time Span (Optional)')
  const timeSpanInput = make('input')
  timeSpanInput.placeholder = 'e.g. 6 weeks, Q4 2026, or Oct 15 - Dec 1'
  timeSpanInput.value = project.timeSpan || ''
  timeSpanLabel.append(timeSpanInput)

  const descLabel = make('label', '', 'Description (Optional)')
  const descInput = make('input')
  descInput.placeholder = 'Brief purpose of this project board'
  descInput.value = project.description || ''
  descLabel.append(descInput)

  const colorLabel = make('label', '', 'Color Accent')
  const colorPickerObj = createColorPicker(project.color || 'yellow')
  colorLabel.append(colorPickerObj.element)

  const submit = make('button', 'primary-button full gold', 'Save Project Changes')
  submit.type = 'submit'
  const errorNotice = make('p', 'project-form-error')
  errorNotice.setAttribute('role', 'alert')
  errorNotice.hidden = true

  form.append(
    close,
    make('p', 'eyebrow', 'EDIT GROUP PROJECT'),
    title,
    copy,
    nameLabel,
    typeLabel,
    timeSpanLabel,
    descLabel,
    colorLabel,
    errorNotice,
    submit
  )

  form.addEventListener('submit', async e => {
    e.preventDefault()

    const name = nameInput.value.trim()
    const projectType = typeSelect.value || project.projectType || 'Product collaboration'
    const timeSpan = timeSpanInput.value.trim() || 'Ongoing'
    const description = descInput.value.trim() || `Collaborative ${projectType.toLowerCase()} project board.`
    const color = colorPickerObj.getColor()

    if (!name) {
      nameInput.focus()
      return
    }

    const duplicate = projects.some(
      p => p.id !== project.id && String(p.name).trim().toLowerCase() === name.toLowerCase()
    )
    if (duplicate) {
      nameInput.setCustomValidity('Another project with this name already exists.')
      nameInput.reportValidity()
      return
    }
    nameInput.setCustomValidity('')

    const oldName = project.name
    submit.disabled = true
    try {
      const response = await api.put(`/projects/${encodeURIComponent(project.projectId || project.id)}`, {
        name,
        project_type: projectType,
        time_span: timeSpan,
        description,
        color
      })
      const savedProject = response?.data?.project
      if (!savedProject) {
        throw new Error('The server did not return the updated project.')
      }
      project.name = savedProject.name || name
      project.projectType = savedProject.project_type || projectType
      project.timeSpan = savedProject.time_span || timeSpan
      project.description = savedProject.description ?? description
      project.color = savedProject.color || color
    } catch (error) {
      errorNotice.textContent = error.message || 'The project could not be updated. Please try again.'
      errorNotice.hidden = false
      submit.disabled = false
      return
    }

    if (oldName !== name) {
      tasks.forEach(t => {
        if (t.project === oldName) {
          t.project = name
        }
      })
      saveTasks()

      if (activeView === oldName) {
        setActiveView(name)
      }
    }

    saveProjects()
    closeModal()

    renderProjectNav()
    hub.renderAdminProjectsTable?.()
    hub.renderTasks?.()
    hub.renderOverviewPanel?.()
    hub.renderListView?.()

    addAuditLog(
      'Project updated',
      `${currentUser?.name || 'Admin'} updated project "${name}".`,
      'edit'
    )

    pushNotification(
      'Project Updated',
      `"${name}" details were updated.`,
      '✏️',
      'teal-bg'
    )
  })

  backdrop.append(form)
  root.replaceChildren(backdrop)
  nameInput.focus()
}

// ============================================================
// BREAK PROJECT INTO SMALL SPRINTS
// ============================================================

export function openAddSprintModal() {
  const proj = getActiveProject()

  const isCreator =
    isCurrentUserProjectCreator()

  if (!isCreator) {
    showPermissionNotice()
    return
  }

  if (!proj) {
    return
  }

  const backdrop =
    make('div', 'modal-backdrop')

  const form =
    make('form', 'modal')

  const close =
    make('button', 'close-modal', '×')

  close.type = 'button'

  close.addEventListener(
    'click',
    closeModal
  )

  const title =
    make(
      'h2',
      '',
      `Break ${proj.name} into Sprint`
    )

  const copy =
    make(
      'p',
      'modal-copy',
      `Project Creator (${proj.creatorName}): Define a focused milestone sprint for your team.`
    )

  const nameLabel =
    make(
      'label',
      '',
      'Sprint / Milestone Title'
    )

  const nameInput =
    make('input')

  nameInput.required = true

  const count =
    (proj.sprints
      ? proj.sprints.length
      : 0) + 1

  nameInput.placeholder =
    `e.g. Sprint ${count}: Core Implementation`

  nameLabel.append(nameInput)

  const statusLabel =
    make(
      'label',
      '',
      'Sprint Status'
    )

  const statusSelect =
    document.createElement('select')

  ;[
    'Active',
    'Upcoming',
    'Completed'
  ].forEach(status => {
    const opt =
      make(
        'option',
        '',
        status
      )

    opt.value = status

    statusSelect.append(opt)
  })

  statusLabel.append(statusSelect)

  const submit =
    make(
      'button',
      'primary-button full gold',
      'Add Sprint to Project'
    )

  submit.type = 'submit'

  form.append(
    close,
    make(
      'p',
      'eyebrow',
      'PROJECT MILESTONE'
    ),
    title,
    copy,
    nameLabel,
    statusLabel,
    submit
  )

  form.addEventListener(
    'submit',
    e => {
      e.preventDefault()

      const sName =
        nameInput.value.trim()

      if (!sName) {
        nameInput.focus()
        return
      }

      if (!proj.sprints) {
        proj.sprints = []
      }

      proj.sprints.push({
        id: `s_${Date.now()}`,
        name: sName,
        status: statusSelect.value
      })

      saveProjects()

      closeModal()

      updateUserUI()

      addAuditLog(
        'Sprint created',
        `${proj.creatorName} added "${sName}" to ${proj.name}.`,
        'flag'
      )

      pushNotification(
        'Sprint Created',
        `"${sName}" added to ${proj.name}`,
        '⚡',
        'blue-bg'
      )
    }
  )

  backdrop.append(form)

  root.replaceChildren(backdrop)

  nameInput.focus()
}

// ============================================================
// INVITE A REGISTERED COLLAB USER TO A PROJECT
// ============================================================

function prepareInvitationAvatar(source) {
  const value = String(source || '').trim()
  if (!value) return Promise.resolve('')

  if (value.startsWith('https://')) {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !url.hostname || value.length > 2048) {
      return Promise.reject(new Error('The profile photo URL is invalid.'))
    }
    return Promise.resolve(value)
  }

  if (!/^data:image\/(?:jpeg|png|webp|gif);base64,/.test(value)) {
    return Promise.reject(new Error('The profile photo format is not supported.'))
  }

  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const size = 256
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('The profile photo could not be prepared.'))
        return
      }
      const scale = Math.max(size / image.width, size / image.height)
      const width = image.width * scale
      const height = image.height * scale
      context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.75))
    }
    image.onerror = () => reject(new Error('The profile photo could not be loaded.'))
    image.src = value
  })
}

export function openInviteCollaboratorModal(
  targetProject = null
) {
  const ownedProjects = projects.filter(project =>
    project.creatorFirebaseUid && project.creatorFirebaseUid === firebaseAuth.currentUser?.uid
  )
  const activeProject = getActiveProject()
  const proj = targetProject || ownedProjects.find(project => project.id === activeProject?.id) || ownedProjects[0]
  if (!ownedProjects.length || (targetProject && !ownedProjects.some(project => project.id === targetProject.id))) {
    showPermissionNotice()
    return
  }

  const backdrop =
    make('div', 'modal-backdrop')

  const form =
    make('form', 'modal')

  const close =
    make(
      'button',
      'close-modal',
      '×'
    )

  close.type = 'button'

  close.addEventListener(
    'click',
    closeModal
  )

  const title =
    make(
      'h2',
      '',
      `Invite Member to ${proj ? proj.name : 'Workspace'}`
    )

  const copy =
    make(
      'p',
      'modal-copy',
      'Search for an existing Collab user. They will receive an invitation in their dashboard and can accept or decline it there.'
    )

  const searchLabel = make('label', '', 'Search registered Collab users')
  const searchInput = make('input')
  searchInput.type = 'search'
  searchInput.placeholder = 'Search by name or email...'
  searchInput.autocomplete = 'off'
  searchInput.minLength = 2
  searchLabel.append(searchInput)

  const searchStatus = make('p', 'modal-copy')
  searchStatus.setAttribute('role', 'status')
  searchStatus.setAttribute('aria-live', 'polite')
  searchStatus.textContent = 'Enter at least 2 characters to search.'

  const searchResults = make('div', 'invite-user-search-results')
  const selectedUsersLabel = make('p', 'modal-copy', 'Selected users')
  const selectedUsersList = make('div', 'invite-selected-users')
  selectedUsersLabel.hidden = true
  selectedUsersList.hidden = true

  const selectedUsers = new Map()
  let searchTimer = null
  let searchSequence = 0

  const roleLabel =
    make(
      'label',
      '',
      'Role & Permissions'
    )

  const roleSelect =
    document.createElement('select')

  const invitationRoles = [
    'Workspace Admin',
    'Product Lead',
    'Designer',
    'Engineer',
    'QA Specialist',
    'Content Strategist',
    'Member'
  ]
  invitationRoles.forEach(role => {
    const opt =
      make(
        'option',
        '',
        role
      )

    opt.value = role

    roleSelect.append(opt)
  })

  roleLabel.append(roleSelect)

  // ==========================================================
  // PROJECT
  // ==========================================================

  const projectLabel =
    make(
      'label',
      '',
      'Assign to Project'
    )

  const projectSelect =
    document.createElement('select')

  ownedProjects.forEach(project => {
    const opt =
      make(
        'option',
        '',
        project.name
      )

    opt.value =
      project.id

    if (targetProject ? project.id === targetProject.id : project.name === proj?.name) {
      opt.selected = true
    }

    projectSelect.append(opt)
  })

  projectLabel.append(projectSelect)

  // ==========================================================
  // SUBMIT
  // ==========================================================

  const submit =
    make(
      'button',
      'primary-button full gold',
      ''
    )

  submit.type = 'submit'
  submit.disabled = true
  const submitLabel = make('span', '', 'Send Invitation')
  const submitSpinner = make('span', 'invite-submit-spinner')
  submitSpinner.setAttribute('aria-hidden', 'true')
  submitSpinner.hidden = true
  submit.append(submitSpinner, submitLabel)
  const errorNotice = make('p', 'project-form-error')
  errorNotice.setAttribute('role', 'alert')
  errorNotice.hidden = true

  form.append(
    close,
    make(
      'p',
      'eyebrow',
      'PROJECT COLLABORATOR'
    ),
    title,
    copy,
    searchLabel,
    searchStatus,
    searchResults,
    selectedUsersLabel,
    selectedUsersList,
    roleLabel,
    projectLabel,
    errorNotice,
    submit
  )

  const renderSelectedUsers = () => {
    selectedUsersList.replaceChildren()
    selectedUsers.forEach(user => {
      const entry = make('div', 'invite-selected-user')
      entry.append(
        make('span', '', `${user.name} (${user.email})`)
      )
      const remove = make('button', 'invite-selected-user-remove', 'Remove')
      remove.type = 'button'
      remove.setAttribute('aria-label', `Remove ${user.name} from invitation`)
      remove.addEventListener('click', () => {
        selectedUsers.delete(user.firebaseUid)
        renderSelectedUsers()
        searchInput.dispatchEvent(new Event('input'))
      })
      entry.append(remove)
      selectedUsersList.append(entry)
    })
    const hasSelection = selectedUsers.size > 0
    selectedUsersLabel.hidden = !hasSelection
    selectedUsersList.hidden = !hasSelection
    submit.disabled = !hasSelection
  }

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer)
    const requestSequence = ++searchSequence
    const search = searchInput.value.trim()
    renderSelectedUsers()
    errorNotice.hidden = true
    searchResults.replaceChildren()

    if (search.length < 2) {
      searchStatus.textContent = 'Enter at least 2 characters to search.'
      return
    }

    searchStatus.textContent = 'Waiting to search...'
    searchTimer = setTimeout(async () => {
      searchStatus.textContent = 'Searching registered users...'
      try {
        const response = await api.get(`/users/search?q=${encodeURIComponent(search)}`)
        if (requestSequence !== searchSequence) return
        const users = response?.users
        if (!Array.isArray(users)) {
          throw new Error('The server returned an invalid user search response.')
        }
        searchResults.replaceChildren()
        if (!users.length) {
          searchStatus.textContent = 'No users found.'
          return
        }

        users.forEach(user => {
          const firebaseUid = user?.firebaseUid || user?.firebase_uid || user?.uid
          const email = user?.email
          const name = user?.name || user?.displayName || user?.display_name || email
          if (!firebaseUid || !email || !name) return
          const selectedUser = { firebaseUid, email, name }
          const resultButton = make('button', 'invite-user-search-result')
          resultButton.type = 'button'
          resultButton.disabled = selectedUsers.has(firebaseUid)
          resultButton.append(
            make('strong', '', name),
            make('span', '', email),
            make('span', '', resultButton.disabled ? 'Already selected' : 'Add to invitation')
          )
          resultButton.addEventListener('click', () => {
            if (selectedUsers.has(firebaseUid)) return
            selectedUsers.set(firebaseUid, selectedUser)
            renderSelectedUsers()
            resultButton.disabled = true
            resultButton.lastElementChild.textContent = 'Already selected'
            errorNotice.hidden = true
          })
          searchResults.append(resultButton)
        })
        searchStatus.textContent = `${users.length} user${users.length === 1 ? '' : 's'} found. Select one to invite.`
      } catch (error) {
        if (requestSequence !== searchSequence) return
        searchStatus.textContent = error.message || 'User search failed. Please try again.'
      }
    }, 300)
  })

  form.addEventListener(
    'submit',
    async e => {
      e.preventDefault()
      const role =
        roleSelect.value

      if (!selectedUsers.size) {
        errorNotice.textContent = 'Search for and select at least one registered Collab user first.'
        errorNotice.hidden = false
        return
      }

      const invitees = [...selectedUsers.values()]
      const selectedProjectId = projectSelect.value
      submit.disabled = true
      submitSpinner.hidden = false
      submit.setAttribute('aria-busy', 'true')
      submitLabel.textContent = 'Sending invitations...'
      try {
        const inviterAvatar = await prepareInvitationAvatar(
          currentUser.profileImage || currentUser.photoURL || firebaseAuth.currentUser?.photoURL
        )
        await api.post('/invitations', {
          firebaseUids: invitees.map(user => user.firebaseUid),
          firebaseUid: invitees.length === 1 ? invitees[0].firebaseUid : undefined,
          users: invitees.map(user => ({
            firebaseUid: user.firebaseUid,
            email: user.email
          })),
          emails: invitees.map(user => user.email),
          role,
          projectId: selectedProjectId,
          inviterAvatar
        })
      } catch (error) {
        errorNotice.textContent = error.code
          ? `${error.message} (${error.code})`
          : error.message || 'The invitation could not be sent.'
        errorNotice.hidden = false
        submit.disabled = false
        submitSpinner.hidden = true
        submit.removeAttribute('aria-busy')
        submitLabel.textContent = 'Send Invitation'
        return
      }

      addAuditLog(
        'Member invited',
        `${currentUser.name || 'Project creator'} invited ${invitees.map(user => user.name).join(', ')} to ${proj.name}.`,
        'userPlus'
      )
      pushNotification(
        'Invitation Sent',
        `${invitees.length} ${invitees.length === 1 ? 'person has' : 'people have'} been invited to ${proj.name}.`,
        '✉️',
        'blue-bg'
      )
      closeModal()
      showDashboardToast(
        `Invitation${invitees.length === 1 ? '' : 's'} sent to ${invitees.map(user => user.name).join(', ')}.`,
        'success'
      )
    }
  )

  backdrop.append(form)

  root.replaceChildren(backdrop)

  searchInput.focus()
}

// ============================================================
// MANAGE & REMOVE COLLABORATORS MODAL
// ============================================================

function openLegacyManageCollaboratorsModal() {
  const proj =
    getActiveProject()

  if (!proj) {
    return
  }

  const isCreator =
    isCurrentUserProjectCreator()

  const backdrop =
    make(
      'div',
      'modal-backdrop'
    )

  const box =
    make(
      'div',
      'modal'
    )

  box.style.maxWidth =
    '540px'

  const close =
    make(
      'button',
      'close-modal',
      '×'
    )

  close.type = 'button'

  close.addEventListener(
    'click',
    closeModal
  )

  const title =
    make(
      'h2',
      '',
      `${proj.name} — Team Collaborators`
    )

  const copy =
    make(
      'p',
      'modal-copy',
      `Collaborators invited to work on ${proj.name}. Project creator: ${proj.creatorName}.`
    )

  const listContainer =
    make(
      'div',
      'admin-table-wrapper'
    )

  listContainer.style.margin =
    '16px 0 20px'

  const table =
    make(
      'table',
      'admin-table'
    )

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

  const tbody =
    table.querySelector(
      '#proj-collab-tbody'
    )

  const invited =
    proj.invitedMembers ||
    members

  invited.forEach(member => {
    const tr =
      document.createElement('tr')

    const isThisCreator =
      member.email ===
        proj.creatorEmail ||
      member.name ===
        proj.creatorName

    // ========================================================
    // MEMBER
    // ========================================================

    const tdMem =
      document.createElement('td')

    const wrap =
      make(
        'div',
        'member-cell'
      )

    wrap.append(
      make(
        'div',
        `avatar ${member.tone || 'coral'}-bg`,
        member.initials
      ),
      make(
        'strong',
        '',
        member.name
      )
    )

    tdMem.append(wrap)

    // ========================================================
    // ROLE
    // ========================================================

    const tdRole =
      document.createElement('td')

    tdRole.textContent =
      isThisCreator
        ? `${member.role} (Creator)`
        : member.role

    // ========================================================
    // TASK COUNT
    // ========================================================

    const tdTasks =
      document.createElement('td')

    const taskCount =
      tasks.filter(
        task =>
          task.project ===
            proj.name &&
          task.assignee ===
            member.initials
      ).length

    tdTasks.textContent =
      `${taskCount} active`

    tr.append(
      tdMem,
      tdRole,
      tdTasks
    )

    // ========================================================
    // ACTION
    // ========================================================

    if (isCreator) {
      const tdAct =
        document.createElement('td')

      if (!isThisCreator) {
        const removeBtn =
          make(
            'button',
            'action-btn delete',
            'Remove'
          )

        removeBtn.type =
          'button'

        removeBtn.addEventListener(
          'click',
          () => {
            proj.invitedMembers =
              (
                proj.invitedMembers ||
                []
              ).filter(
                member =>
                  member.id !==
                    member.id &&
                  member.email !==
                    member.email
              )

            saveProjects()

            addAuditLog(
              'Collaborator removed',
              `${proj.creatorName} removed ${member.name} from ${proj.name}.`,
              'trash'
            )

            closeModal()

            openManageCollaboratorsModal()

            updateUserUI()
          }
        )

        tdAct.append(removeBtn)
      } else {
        const ownerText =
          document.createElement('small')

        ownerText.style.color =
          '#A1A1AA'

        ownerText.textContent =
          'Owner'

        tdAct.append(ownerText)
      }

      tr.append(tdAct)
    }

    tbody.append(tr)
  })

  // ==========================================================
  // ACTIONS
  // ==========================================================

  const actionsRow =
    make(
      'div',
      'modal-actions-row'
    )

  if (isCreator) {
    const inviteBtn =
      make(
        'button',
        'primary-button gold',
        '+ Invite Another Member'
      )

    inviteBtn.type =
      'button'

    inviteBtn.addEventListener(
      'click',
      () => {
        closeModal()

        openInviteCollaboratorModal()
      }
    )

    actionsRow.append(inviteBtn)
  }

  box.append(
    close,
    make(
      'p',
      'eyebrow',
      'PROJECT TEAM'
    ),
    title,
    copy,
    listContainer,
    actionsRow
  )

  backdrop.append(box)

  root.replaceChildren(backdrop)
}

export function openManageCollaboratorsModal() {
  const project = getActiveProject()
  if (!project) return

  if (!isCurrentUserProjectCreator()) {
    showPermissionNotice()
    return
  }

  const backdrop = make('div', 'modal-backdrop')
  const dialog = make('section', 'modal')
  dialog.style.maxWidth = '680px'
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.setAttribute('aria-label', 'Close')
  close.addEventListener('click', closeModal)

  const title = make('h2', '', `${project.name} — Invitations`)
  const copy = make('p', 'modal-copy', 'Review invite status. Removing an accepted collaborator revokes their project access.')
  const notice = make('p', 'project-form-error')
  notice.setAttribute('role', 'alert')
  notice.hidden = true
  const tableWrap = make('div', 'admin-table-wrapper invitation-table-wrapper')
  const table = make('table', 'admin-table invitation-table')
  table.innerHTML = '<thead><tr><th>Collaborator</th><th>Role</th><th>Status</th><th>Invited</th><th>Action</th></tr></thead><tbody></tbody>'
  tableWrap.append(table)
  const tbody = table.querySelector('tbody')

  const refresh = async () => {
    notice.hidden = true
    tbody.replaceChildren()
    try {
      const response = await api.get(`/projects/${encodeURIComponent(project.projectId || project.id)}/invitations`)
      const invitations = response?.data?.invitations
      if (!Array.isArray(invitations)) throw new Error('The server returned an invalid invitations response.')
      if (!invitations.length) {
        const row = document.createElement('tr')
        const empty = make('td', 'notification-empty-state', 'No invitations for this project yet.')
        empty.colSpan = 5
        row.append(empty)
        tbody.append(row)
        return
      }
      invitations.forEach(invitation => {
        const row = document.createElement('tr')
        const identity = make('div', 'member-info invitation-identity')
        identity.append(
          make('strong', '', invitation.invited_name || 'Collab user'),
          make('small', '', invitation.invited_email || 'Email unavailable')
        )
        const identityCell = make('td')
        identityCell.append(identity)

        const roleCell = make('td')
        roleCell.append(make('span', 'invitation-role', invitation.role || 'Member'))

        const statusCell = make('td')
        const normalizedStatus = String(invitation.status || 'unknown').toLowerCase()
        const statusClass = normalizedStatus === 'accepted'
          ? 'active'
          : normalizedStatus === 'pending'
            ? 'pending'
            : 'invitation-status-other'
        statusCell.append(make('span', `status-badge invitation-status ${statusClass}`, normalizedStatus))

        const invitedDate = new Date(invitation.created_at)
        const invitedCell = make(
          'td',
          'invitation-date',
          Number.isNaN(invitedDate.getTime()) ? 'Date unavailable' : invitedDate.toLocaleDateString()
        )

        row.append(identityCell, roleCell, statusCell, invitedCell)

        const actions = make('td')
        if (invitation.status === 'pending' || invitation.status === 'accepted') {
          const remove = make('button', 'action-btn delete', invitation.status === 'pending' ? 'Revoke' : 'Remove')
          remove.type = 'button'
          remove.addEventListener('click', async () => {
            const confirmed = await showDashboardConfirmation({
              title: invitation.status === 'pending' ? 'Revoke invitation?' : 'Remove collaborator?',
              message: `Are you sure you want to ${invitation.status === 'pending' ? 'revoke this invitation for' : 'remove access for'} ${invitation.invited_name || invitation.invited_email}?`,
              confirmText: invitation.status === 'pending' ? 'Revoke invitation' : 'Remove access',
              danger: true
            })
            if (!confirmed) return

            remove.disabled = true
            try {
              await api.delete(`/projects/${encodeURIComponent(project.projectId || project.id)}/invitations/${encodeURIComponent(invitation.invitation_id)}`)
              await refresh()
              showDashboardToast(
                invitation.status === 'pending' ? 'Invitation revoked.' : 'Collaborator access removed.',
                'success'
              )
            } catch (error) {
              notice.textContent = error.message || 'The invitation or access could not be removed.'
              notice.hidden = false
              remove.disabled = false
            }
          })
          actions.append(remove)
        } else {
          actions.textContent = '—'
        }
        row.append(actions)
        tbody.append(row)
      })
    } catch (error) {
      notice.textContent = error.message || 'Invitations could not be loaded.'
      notice.hidden = false
    }
  }

  const invite = make('button', 'primary-button gold', '+ Invite another member')
  invite.type = 'button'
  invite.addEventListener('click', () => {
    closeModal()
    openInviteCollaboratorModal(project)
  })
  dialog.append(close, make('p', 'eyebrow', 'PROJECT TEAM'), title, copy, notice, tableWrap, invite)
  backdrop.append(dialog)
  root.replaceChildren(backdrop)
  refresh()
}