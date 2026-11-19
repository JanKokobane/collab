import { getSvg } from './icons.js'
import {
  members,
  tasks,
  meetings,
  auditLogs,
  projects,
  currentUser,
  getSprintMembers,
  make,
  closeModal,
  root,
  renderAvatarElement,
  saveTasks,
  saveProjects,
  addAuditLog,
  pushNotification,
  hub,
  loadNotificationsFromAPI,
  replaceProjectTasksFromBackend
} from './state.js'
import { getActiveProject } from './auth.js?v=20261117-no-auto-sprints'
import {
  createDropdownDatePicker,
  createScheduleCalendarPicker
} from './calendar.js?v=20261121-task-sprint-decoupling'
import {
  addDaysToDateKey,
  normalizeDateKey,
  toLocalDateKey
} from './dateUtils.js?v=20261117-date-input-validation'
import {
  formatProjectTimeSpanForDisplay,
  openInviteCollaboratorModal,
  openCreateProjectModal,
  openEditProjectModal
} from './projects.js?v=20261121-task-sprint-decoupling'
import { api } from './api.js'
import { firebaseAuth } from '../../firebase.js'
import { setDashboardButtonLoading, showDashboardConfirmation, showDashboardToast } from './modalChrome.js'
import { deleteProjectMeeting, getSafeMeetingUrl } from './meetings.js'
import { openMeteredMeetingModal } from './meteredMeetingModal.js'
import { createTaskMediaEditor } from './taskMedia.js?v=20261118-real-file-icons'

// ============================================================
// ADMIN CONSOLE TABLE & FUNCTIONS
// ============================================================

let projectMembers = []
let selectedMembersProjectId = 'all'

export function getSelectedMembersProject() {
  return projects.find(project =>
    project.projectId === selectedMembersProjectId &&
    project.creatorFirebaseUid === firebaseAuth.currentUser?.uid
  ) || null
}

export function filterMembersByProject(projectId) {
  selectedMembersProjectId = projectId
  renderMembersTable()
}

export async function loadProjectMembers() {
  try {
    const response = await api.get('/users/members')
    const records = response?.data?.members
    if (!Array.isArray(records)) {
      throw new Error('The server returned an invalid team members response.')
    }

    projectMembers = records.map(member => ({
      ...member,
      id: `${member.project_id}:${member.firebase_uid}`,
      firebaseUid: member.firebase_uid,
      projectId: member.project_id,
      projectName: member.project_name,
      projectCreatorFirebaseUid: member.creator_firebase_uid,
      invitationId: member.invitation_id,
      profileImage: member.profile_image || (
        member.firebase_uid === currentUser.uid
          ? currentUser.profileImage || currentUser.photoURL || ''
          : ''
      ),
      initials: member.name
        ? member.name.trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()
        : '•',
      tone: 'coral',
      status: member.status || 'Active'
    }))
    renderMembersTable()
    return projectMembers
  } catch (error) {
    console.error('Unable to load project members:', error)
    const tbody = document.querySelector('#admin-members-tbody')
    if (tbody) {
      tbody.replaceChildren()
      const row = document.createElement('tr')
      const cell = make('td', 'notification-empty-state', error.message || 'Team members could not be loaded.')
      cell.colSpan = 5
      row.append(cell)
      tbody.append(row)
    }
    throw error
  }
}

export function renderMembersTable() {
  const tbody = document.querySelector('#admin-members-tbody')
  const countBadge = document.querySelector('#admin-member-count')
  if (!tbody) return

  const accessibleProjects = [...new Map(
    projects
      .filter(project => project.projectId && project.name)
      .map(project => [project.projectId, project])
  ).values()]
  const ownedProjects = accessibleProjects.filter(
    project => project.creatorFirebaseUid === firebaseAuth.currentUser?.uid
  )
  const projectFilter = document.querySelector('#admin-members-project-filter')
  if (projectFilter) {
    const availableProjectIds = new Set(accessibleProjects.map(project => project.projectId))
    if (selectedMembersProjectId !== 'all' && !availableProjectIds.has(selectedMembersProjectId)) {
      selectedMembersProjectId = 'all'
    }

    projectFilter.replaceChildren()
    const allOption = make('option', '', 'All projects')
    allOption.value = 'all'
    projectFilter.append(allOption)
    accessibleProjects.forEach(project => {
      const option = make('option', '', project.name)
      option.value = project.projectId
      projectFilter.append(option)
    })
    projectFilter.value = selectedMembersProjectId
  }
  const inviteButton = document.querySelector('#admin-members-invite-btn')
  if (inviteButton) {
    const selectedProjectIsOwned = ownedProjects.some(
      project => project.projectId === selectedMembersProjectId
    )
    inviteButton.hidden = selectedMembersProjectId === 'all'
      ? ownedProjects.length === 0
      : !selectedProjectIsOwned
  }
  const visibleMembers = selectedMembersProjectId && selectedMembersProjectId !== 'all'
    ? projectMembers.filter(member => member.projectId === selectedMembersProjectId)
    : projectMembers.filter(member =>
      accessibleProjects.some(project => project.projectId === member.projectId)
    )
  const memberCount = new Set(visibleMembers.map(member => member.firebaseUid).filter(Boolean)).size
  if (countBadge) countBadge.textContent = `${memberCount} ${memberCount === 1 ? 'member' : 'members'}`
  tbody.replaceChildren()

  if (!accessibleProjects.length) {
    const row = document.createElement('tr')
    const cell = make('td', 'notification-empty-state', 'No accessible projects to show.')
    cell.colSpan = 5
    row.append(cell)
    tbody.append(row)
    return
  }

  if (!visibleMembers.length) {
    const row = document.createElement('tr')
    const cell = make('td', 'notification-empty-state', 'No project members to show yet.')
    cell.colSpan = 5
    row.append(cell)
    tbody.append(row)
    return
  }

  visibleMembers.forEach(member => {
    const tr = document.createElement('tr')

    const tdMember = document.createElement('td')
    const cellWrap = make('div', 'member-cell')
    const av = make('div', `avatar ${member.tone || 'coral'}-bg`)
    renderAvatarElement(av, member)
    const info = make('div', 'member-info')
    info.append(make('strong', '', member.name), make('small', '', member.email))
    cellWrap.append(av, info)
    tdMember.append(cellWrap)

    const tdRole = document.createElement('td')
    const roleText = make('span', 'member-role-text', member.role || 'Member')
    tdRole.append(roleText)

    const tdProject = document.createElement('td')
    tdProject.textContent = member.projectName || 'Project'

    const tdStatus = document.createElement('td')
    const statusBadge = make('span', `status-badge ${String(member.status || 'Active').toLowerCase()}`, `● ${member.status || 'Active'}`)
    tdStatus.append(statusBadge)

    const tdActions = document.createElement('td')
    if (
      member.invitationId &&
      member.projectCreatorFirebaseUid === firebaseAuth.currentUser?.uid
    ) {
      const removeBtn = make('button', 'action-btn delete', 'Remove')
      removeBtn.type = 'button'
      removeBtn.addEventListener('click', async () => {
        const isPendingInvitation = member.status === 'Pending'
        const confirmed = await showDashboardConfirmation({
          title: isPendingInvitation ? 'Revoke project invitation?' : 'Remove project member?',
          message: isPendingInvitation
            ? `Revoke the invitation for ${member.name} to join ${member.projectName}?`
            : `Remove ${member.name} from ${member.projectName}?`,
          confirmText: isPendingInvitation ? 'Revoke invitation' : 'Remove member',
          danger: true
        })
        if (!confirmed) return

        const restoreRemove = setDashboardButtonLoading(removeBtn, 'Removing…')
        try {
          await api.delete(
            `/projects/${encodeURIComponent(member.projectId)}/invitations/${encodeURIComponent(member.invitationId)}`
          )
          await loadProjectMembers()
          const action = isPendingInvitation ? 'Project invitation revoked' : 'Project member removed'
          const detail = isPendingInvitation
            ? `The invitation for ${member.name} to "${member.projectName}" was revoked.`
            : `${member.name} was removed from "${member.projectName}".`
          addAuditLog(action, detail, 'trash')
          showDashboardToast(
            isPendingInvitation
              ? `The invitation for ${member.name} was revoked.`
              : `${member.name} was removed from ${member.projectName}.`,
            'success'
          )
        } catch (error) {
          restoreRemove()
          pushNotification('Member Removal Failed', error.message || 'The project member could not be removed.', '⚠️', 'coral-bg')
        }
      })
      tdActions.append(removeBtn)
    } else {
      tdActions.append(make('span', 'notification-read-label', '—'))
    }

    tr.append(tdMember, tdRole, tdProject, tdStatus, tdActions)
    tbody.append(tr)
  })
}

let projectTaskLoadVersion = 0

function taskDateLabel(value) {
  if (!value) return '—'
  const dateKey = String(value).slice(0, 10)
  const date = new Date(`${dateKey}T12:00:00`)
  return Number.isNaN(date.getTime())
    ? dateKey
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function taskTableCell(text, className = '') {
  const cell = document.createElement('td')
  if (className) cell.className = className
  cell.textContent = text || '—'
  return cell
}

function renumberSprintName(name, number) {
  const title = String(name || 'Sprint')
    .replace(/^Sprint\s+\d+\s*:\s*/i, '')
    .trim()
  return `Sprint ${number}: ${title || 'Untitled'}`
}

function renderProjectTaskDetails(project, taskRecords, loadError, refreshDetails) {
  const wrapper = make('div', 'project-task-details')
  const isOwner = project.creatorFirebaseUid === firebaseAuth.currentUser?.uid
  const acceptedMembers = Array.isArray(project.acceptedMembers) ? project.acceptedMembers : []
  const sprints = Array.isArray(project.sprints) ? project.sprints : []

  const toolbar = make('div', 'project-task-toolbar')
  const sprintSection = make('section', 'project-sprint-section')
  const sprintHeading = make('div', 'project-task-section-heading')
  sprintHeading.append(
    make('h4', '', 'Project sprints'),
    make('span', 'project-task-section-count', String(sprints.length))
  )
  sprintSection.append(sprintHeading)
  const sprintList = make('div', 'project-sprint-list')

  if (!sprints.length) {
    sprintList.append(make('p', 'project-task-empty', 'No project sprints yet.'))
  } else {
    sprints.forEach(sprint => {
      const sprintChip = make('span', 'project-sprint-chip')
      sprintChip.append(
        make('strong', '', sprint.name || 'Sprint'),
        make('small', '', sprint.status || 'Upcoming')
      )
      const sprintMembers = getSprintMembers(project, sprint)
      sprintChip.append(make(
        'small',
        'project-sprint-assignee',
        sprintMembers.length
          ? `Members · ${sprintMembers.map(member => member.name || member.email || 'Project member').join(', ')}`
          : 'No members assigned'
      ))
      if (isOwner && !loadError) {
        const removeSprintButton = make('button', 'project-sprint-remove', '×')
        removeSprintButton.type = 'button'
        removeSprintButton.setAttribute('aria-label', `Remove ${sprint.name || 'sprint'}`)
        removeSprintButton.title = 'Remove sprint'
        removeSprintButton.addEventListener('click', async () => {
          const sprintIndex = sprints.indexOf(sprint)
          if (sprintIndex < 0) return

          const remainingSprints = sprints.filter((_, index) => index !== sprintIndex)
          const confirmed = await showDashboardConfirmation({
            title: 'Remove project sprint?',
            message: `Remove "${sprint.name}" and update the numbering of the remaining sprints?`,
            confirmText: 'Remove sprint',
            danger: true,
            compact: true
          })
          if (!confirmed) return

          const updatedSprints = remainingSprints.map((item, index) => ({
            ...item,
            name: renumberSprintName(item.name, index + 1)
          }))
          const restoreRemove = setDashboardButtonLoading(removeSprintButton, 'Removing…')
          try {
            await api.put(`/projects/${encodeURIComponent(project.projectId)}`, {
              sprints: updatedSprints
            })
            project.sprints = updatedSprints
            refreshDetails()
            showDashboardToast('Sprint removed.', 'success')
          } catch (error) {
            restoreRemove()
            showDashboardToast(error.message || 'The sprint could not be removed.', 'error')
          }
        })
        sprintChip.append(removeSprintButton)
      }
      sprintList.append(sprintChip)
    })
  }
  sprintSection.append(sprintList)
  toolbar.append(sprintSection)

  const memberSection = make('section', 'project-sprint-section')
  const memberHeading = make('div', 'project-task-section-heading')
  memberHeading.append(
    make('h4', '', 'Accepted project invitees'),
    make('span', 'project-task-section-count', String(acceptedMembers.length))
  )
  memberSection.append(memberHeading)
  const memberList = make('div', 'project-task-member-list')
  if (!acceptedMembers.length) {
    const emptyInvitees = make('div', 'project-task-empty-state')
    emptyInvitees.append(
      make('p', '', 'No accepted invitees yet.'),
      make('small', '', 'You can assign tasks to yourself as project owner or invite a teammate.')
    )
    if (isOwner) {
      const inviteButton = make('button', 'outline-button project-task-invite-button', '+ Invite Member')
      inviteButton.type = 'button'
      inviteButton.addEventListener('click', () => openInviteCollaboratorModal(project))
      emptyInvitees.append(inviteButton)
    }
    memberList.append(emptyInvitees)
  } else {
    acceptedMembers.forEach(member => {
      const name = member.name || member.email || 'Project member'
      memberList.append(make('span', 'project-task-member-chip', `${name}${member.role ? ` · ${member.role}` : ''}`))
    })
  }
  memberSection.append(memberList)
  toolbar.append(memberSection)

  wrapper.append(toolbar)

  if (loadError) {
    wrapper.append(make('p', 'project-task-error', loadError))
    return wrapper
  }

  const taskTable = document.createElement('table')
  taskTable.className = 'project-task-table'
  const taskTableWrap = make('div', 'project-task-table-wrap')
  const head = document.createElement('thead')
  const headRow = document.createElement('tr')
  ;['Task', 'Due date', 'Status', ...(isOwner ? ['Actions'] : [])]
    .forEach(label => headRow.append(make('th', '', label)))
  head.append(headRow)
  taskTable.append(head)
  const body = document.createElement('tbody')

  if (!taskRecords.length) {
    const row = document.createElement('tr')
    const cell = taskTableCell('No tasks have been created for this project yet.', 'project-task-empty')
    cell.colSpan = isOwner ? 4 : 3
    row.append(cell)
    body.append(row)
  } else {
    taskRecords.forEach(task => {
      const row = document.createElement('tr')
      const taskCell = document.createElement('td')
      taskCell.append(make('strong', '', task.title))
      if (task.description) taskCell.append(make('small', '', task.description))
      row.append(taskCell)
      row.append(taskTableCell(taskDateLabel(task.due_date)))
      const statusCell = document.createElement('td')
      statusCell.append(make('span', `status-badge ${String(task.status || 'To do').toLowerCase().replaceAll(' ', '-')}`, task.status || 'To do'))
      row.append(statusCell)

      if (isOwner) {
        const actionCell = document.createElement('td')
        const editButton = make('button', 'action-btn', 'Edit')
        editButton.type = 'button'
        editButton.addEventListener('click', () => openProjectTaskModal(project, task))
        const deleteButton = make('button', 'action-btn delete', 'Delete')
        deleteButton.type = 'button'
        deleteButton.addEventListener('click', async () => {
          const confirmed = await showDashboardConfirmation({
            title: 'Delete project task?',
            message: `Delete "${task.title}" from ${project.name}?`,
            confirmText: 'Delete task',
            danger: true
          })
          if (!confirmed) return
          const restoreDelete = setDashboardButtonLoading(deleteButton, 'Deleting…')
          try {
            await api.delete(`/projects/${encodeURIComponent(project.projectId)}/tasks/${encodeURIComponent(task.task_id)}`)
            showDashboardToast('Project task deleted.', 'success')
            renderAdminTasksTable()
          } catch (error) {
            restoreDelete()
            showDashboardToast(error.message || 'The task could not be deleted.', 'error')
          }
        })
        actionCell.append(editButton, deleteButton)
        row.append(actionCell)
      }
      body.append(row)
    })
  }
  taskTable.append(body)
  taskTableWrap.append(taskTable)
  wrapper.append(taskTableWrap)
  return wrapper
}

export async function renderAdminTasksTable({ silent = false, canApply = () => true } = {}) {
  const tbody = document.querySelector('#admin-tasks-tbody')
  if (!tbody) return
  const loadVersion = ++projectTaskLoadVersion
  const expandedProjectIds = silent
    ? new Set([...tbody.querySelectorAll('.project-task-project-row[data-project-id]')]
      .filter(row => row.querySelector('.project-task-project-toggle')?.getAttribute('aria-expanded') === 'true')
      .map(row => row.dataset.projectId))
    : new Set()
  if (!silent) {
    tbody.replaceChildren()
    const loadingRow = document.createElement('tr')
    loadingRow.append(taskTableCell('Loading project tasks…', 'notification-empty-state'))
    tbody.append(loadingRow)
  }

  const projectResults = await Promise.all(projects.map(async project => {
    try {
      const response = await api.get(`/projects/${encodeURIComponent(project.projectId)}/tasks`)
      if (!Array.isArray(response?.data?.tasks)) throw new Error('The server returned an invalid project tasks response.')
      return { project, tasks: response.data.tasks }
    } catch (error) {
      return { project, tasks: [], error: error.message || 'Tasks could not be loaded.' }
    }
  }))
  if (loadVersion !== projectTaskLoadVersion || !tbody.isConnected) return
  if (silent && !canApply()) return
  if (silent && projectResults.some(result => result.error)) {
    throw new Error('One or more project task lists could not be refreshed.')
  }
  replaceProjectTasksFromBackend(projectResults.map(({ project, tasks: projectTasks, error }) => ({
    projectId: project.projectId,
    tasks: error
      ? tasks.filter(task => task.backendPersistent && task.projectId === project.projectId).map(task => ({
        task_id: task.taskId,
        title: task.title,
        description: task.description,
        category: task.category,
        status: task.status,
        start_date: task.start_date,
        due_date: task.due_date
      }))
      : projectTasks
  })))
  hub.renderTasks?.()
  tbody.replaceChildren()

  if (!projectResults.length) {
    const row = document.createElement('tr')
    row.append(taskTableCell('No projects are available yet.', 'notification-empty-state'))
    tbody.append(row)
    return
  }

  projectResults.forEach(({ project, tasks: projectTasks, error }) => {
    const projectRow = document.createElement('tr')
    projectRow.className = 'project-task-project-row'
    projectRow.dataset.projectId = project.projectId
    const projectCell = document.createElement('td')
    const rowLayout = make('div', 'project-task-row-layout')
    const expandButton = make('button', 'project-task-project-toggle')
    expandButton.type = 'button'
    expandButton.setAttribute('aria-expanded', 'false')
    const identity = make('span', 'project-task-row-identity')
    const projectTitle = make('strong', '', project.name)
    const projectDescription = make('small', '', project.description || 'No description provided')
    identity.append(projectTitle, projectDescription)
    const metadata = make('span', 'project-task-row-metadata')
    const metaItem = (label, value) => {
      const item = make('span', 'project-task-row-meta-item')
      item.append(
        make('small', 'project-task-row-meta-label', label),
        make('strong', 'project-task-row-meta-value', value)
      )
      return item
    }
    const collaboratorCount = (project.acceptedMembers || []).length
    metadata.append(
      metaItem('Collaboration type', project.projectType || 'General Collaboration'),
      metaItem('Duration', formatProjectTimeSpanForDisplay(project.timeSpan)),
      metaItem('Collaborators', `${collaboratorCount} ${collaboratorCount === 1 ? 'person' : 'people'}`)
    )
    expandButton.append(identity, metadata)
    const rowActions = make('div', 'project-task-row-actions')
    rowActions.append(make(
      'small',
      'project-task-row-task-count',
      `${projectTasks.length} ${projectTasks.length === 1 ? 'task' : 'tasks'}`
    ))
    if (project.creatorFirebaseUid === firebaseAuth.currentUser?.uid) {
      const addTaskButton = make('button', 'primary-button gold project-task-row-add-button', '+ Add Task')
      addTaskButton.type = 'button'
      addTaskButton.title = 'Create a task for this project.'
      addTaskButton.addEventListener('click', () => openProjectTaskModal(project))
      rowActions.append(addTaskButton)
    }
    const expandButtonToggle = make('button', 'project-task-row-expand-button')
    expandButtonToggle.type = 'button'
    expandButtonToggle.setAttribute('aria-expanded', 'false')
    expandButtonToggle.setAttribute('aria-label', `Expand ${project.name}`)
    const chevron = make('span', 'project-task-chevron', '⌄')
    expandButtonToggle.append(chevron)
    rowActions.append(expandButtonToggle)
    rowLayout.append(expandButton, rowActions)
    projectCell.append(rowLayout)
    projectRow.append(projectCell)

    const detailsRow = document.createElement('tr')
    detailsRow.className = 'project-task-details-row'
    detailsRow.hidden = true
    const detailsCell = document.createElement('td')
    const refreshProjectDetails = () => {
      detailsCell.replaceChildren(renderProjectTaskDetails(project, projectTasks, error, refreshProjectDetails))
    }
    detailsCell.append(renderProjectTaskDetails(project, projectTasks, error, refreshProjectDetails))
    detailsRow.append(detailsCell)
    const toggleProjectDetails = () => {
      const isExpanded = expandButton.getAttribute('aria-expanded') === 'true'
      expandButton.setAttribute('aria-expanded', String(!isExpanded))
      expandButtonToggle.setAttribute('aria-expanded', String(!isExpanded))
      expandButtonToggle.setAttribute('aria-label', `${isExpanded ? 'Expand' : 'Collapse'} ${project.name}`)
      detailsRow.hidden = isExpanded
      projectRow.classList.toggle('is-expanded', !isExpanded)
      expandButton.classList.toggle('is-expanded', !isExpanded)
      expandButtonToggle.classList.toggle('is-expanded', !isExpanded)
    }
    expandButton.addEventListener('click', toggleProjectDetails)
    expandButtonToggle.addEventListener('click', toggleProjectDetails)
    tbody.append(projectRow, detailsRow)
    if (expandedProjectIds.has(project.projectId)) toggleProjectDetails()
  })
}

export async function openProjectTaskModal(project, task = null, defaults = {}) {
  if (task?.task_id || task?.taskId) {
    try {
      const [taskResponse, projectResponse] = await Promise.all([
        api.get(
          `/projects/${encodeURIComponent(project.projectId)}/tasks/${encodeURIComponent(task.task_id || task.taskId)}`
        ),
        api.get(`/projects/${encodeURIComponent(project.projectId)}`)
      ])
      task = { ...task, ...(taskResponse?.data?.task || {}) }
      const latestProject = projectResponse?.data?.project
      project.startDate = latestProject.start_date || null
      project.dueDate = latestProject.due_date || null
    } catch (error) {
      showDashboardToast(error.message || 'Task and project details could not be loaded.', 'error')
      return
    }
  }
  const isOwner = project.creatorFirebaseUid === firebaseAuth.currentUser?.uid
  if (task && !isOwner) {
    showDashboardToast('Only the project owner can edit project tasks.', 'error')
    return
  }
  const backdrop = make('div', 'modal-backdrop')
  const form = make('form', 'modal project-task-parent-form')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', () => {
    descriptionMedia.dispose()
    closeModal()
  })
  const heading = make('h2', '', task ? 'Edit Project Task' : 'Create Project Task')
  const copy = make('p', 'modal-copy', `Create a task for ${project.name}. Project members collaborate on project tasks.`)

  const titleLabel = make('label', '', 'Task title')
  const titleInput = make('input')
  titleInput.required = true
  titleInput.maxLength = 255
  titleInput.value = task?.title || defaults.title || ''
  titleInput.placeholder = 'e.g. Prepare project deliverables'
  titleLabel.append(titleInput)

  const descriptionLabel = make('label', 'no-input-icon', 'Description')
  const descriptionInput = document.createElement('textarea')
  descriptionInput.rows = 3
  descriptionInput.maxLength = 10000
  descriptionInput.value = task?.description || defaults.description || ''
  descriptionInput.placeholder = 'Add details or acceptance criteria'
  descriptionLabel.append(descriptionInput)
  let chatMessageId = task?.chat_message_id || task?.chatMessageId || defaults.chatMessageId || null
  let descriptionAttachments = Array.isArray(task?.description_attachments)
    ? task.description_attachments
    : Array.isArray(task?.descriptionAttachments)
      ? task.descriptionAttachments
      : Array.isArray(defaults.descriptionAttachments) ? defaults.descriptionAttachments : []
  const descriptionMedia = createTaskMediaEditor({
    initialAttachments: descriptionAttachments,
    label: 'Description media'
  })
  const chatConversationId = task?.chat_conversation_id || task?.chatConversationId
  let discussionButton = null
  if (chatMessageId && chatConversationId) {
    discussionButton = make('button', 'project-progress-aside-context-link', 'View Discussion Context')
    discussionButton.type = 'button'
    discussionButton.addEventListener('click', () => {
      descriptionMedia.dispose()
      closeModal()
      hub.openMessageContext?.({ conversationId: chatConversationId, messageId: chatMessageId })
    })
  }

  const categoryLabel = make('label', 'no-input-icon', 'Category')
  const categorySelect = document.createElement('select')
  const taskCategories = [
    'Design',
    'Development',
    'Marketing',
    'Product',
    'Accessibility',
    'Analytics',
    'API Integration',
    'Backend Development',
    'Branding',
    'Business Development',
    'Collaboration',
    'Community Management',
    'Communication',
    'Content Strategy',
    'Content Writing',
    'Copywriting',
    'Customer Success',
    'Customer Support',
    'Data Analysis',
    'Data Engineering',
    'DevOps',
    'Documentation',
    'Education',
    'Event Planning',
    'Finance',
    'Frontend Development',
    'Graphic Design',
    'Human Resources',
    'Legal',
    'Logistics',
    'Mobile Development',
    'Operations',
    'Partnerships',
    'Photography',
    'Planning',
    'Product Strategy',
    'Project Management',
    'Prototyping',
    'Quality Assurance',
    'Recruiting',
    'Research',
    'Roadmapping',
    'Sales',
    'Security',
    'SEO',
    'Social Media',
    'Testing',
    'Training',
    'UI Design',
    'User Research',
    'UX Design',
    'Video Production',
    'Visual Design',
    'Web Development'
  ]
  taskCategories.forEach(category => {
    const option = make('option', '', category)
    option.value = category
    if (category === task?.category) option.selected = true
    categorySelect.append(option)
  })
  categoryLabel.append(categorySelect)

  const taskTagOptions = [
    'Accessibility',
    'Blocked',
    'Bug',
    'Content',
    'Customer Request',
    'Design',
    'Documentation',
    'Enhancement',
    'Feature',
    'Follow-up',
    'Infrastructure',
    'Needs Review',
    'Performance',
    'Release',
    'Research',
    'Security',
    'Technical Debt',
    'Testing',
    'Urgent',
    'UX/UI',
    'Account Management',
    'Accounts Payable',
    'Accounts Receivable',
    'Acquisition',
    'Agile Delivery',
    'Annual Planning',
    'Audit',
    'Automation',
    'Benefits',
    'Budget',
    'Business Continuity',
    'Business Intelligence',
    'Business Process',
    'Business Requirements',
    'Change Management',
    'Client Relations',
    'Cloud Migration',
    'Compliance',
    'Contract Management',
    'Corporate Communications',
    'Corporate Governance',
    'Cost Optimization',
    'Cross-functional',
    'Customer Experience',
    'Customer Onboarding',
    'Customer Retention',
    'Cybersecurity',
    'Data Governance',
    'Data Privacy',
    'Data Quality',
    'Data Strategy',
    'Decision Log',
    'Demand Generation',
    'Digital Transformation',
    'Due Diligence',
    'Employee Engagement',
    'Employee Onboarding',
    'Employee Relations',
    'Enterprise Architecture',
    'Escalation',
    'ESG',
    'Ethics',
    'Executive Review',
    'Facilities',
    'Forecasting',
    'Governance',
    'Hiring',
    'Incident Management',
    'Internal Communications',
    'Inventory',
    'Investor Relations',
    'IT Operations',
    'KPI Tracking',
    'Knowledge Management',
    'Leadership',
    'Learning & Development',
    'Market Analysis',
    'Market Research',
    'Marketing Operations',
    'Mergers & Acquisitions',
    'Monthly Reporting',
    'Negotiation',
    'Office Management',
    'OKRs',
    'Organizational Design',
    'Partner Management',
    'Payroll',
    'Policy',
    'Portfolio Management',
    'Pricing',
    'Process Improvement',
    'Procurement',
    'Product Launch',
    'Program Management',
    'Regulatory',
    'Relationship Management',
    'Risk Assessment',
    'Roadmap',
    'Sales Enablement',
    'Sales Operations',
    'Service Delivery',
    'SLA',
    'Stakeholder Alignment',
    'Strategic Partnerships',
    'Strategic Planning',
    'Succession Planning',
    'Supply Chain',
    'Sustainability',
    'Talent Acquisition',
    'Tax',
    'Team Development',
    'Vendor Management',
    'Workforce Planning',
    'Year-end Planning',
    'Business Case',
    'Capital Planning',
    'Channel Strategy',
    'Competitive Analysis',
    'Corporate Strategy',
    'Financial Planning'
  ]
  const selectedTags = new Set(
    Array.isArray(task?.tags) ? task.tags.filter(tag => taskTagOptions.includes(tag)) : []
  )
  const tagField = make('div', 'project-task-tag-field')
  const tagLabel = make('span', 'project-task-tag-label', 'Tags')
  const tagPicker = make('details', 'project-task-tag-picker')
  const tagPickerSummary = make('summary', 'project-task-tag-picker-summary')
  const tagSearchInput = document.createElement('input')
  tagSearchInput.type = 'search'
  tagSearchInput.className = 'project-task-tag-search'
  tagSearchInput.placeholder = 'Search tags...'
  tagSearchInput.setAttribute('aria-label', 'Search task tags')
  const tagOptionList = make('div', 'project-task-tag-option-list')
  const tagEmptyState = make('span', 'project-task-tag-empty', 'No matching tags')
  tagEmptyState.hidden = true
  const updateTagSummary = () => {
    const selectedTagNames = [...selectedTags]
    const visibleNames = selectedTagNames.slice(0, 2).join(', ')
    tagPickerSummary.textContent = selectedTagNames.length > 2
      ? `${visibleNames}, +${selectedTagNames.length - 2}`
      : visibleNames || 'Choose tags'
  }
  updateTagSummary()
  const tagOptions = make('div', 'project-task-tag-options')
  tagOptions.append(tagSearchInput, tagOptionList, tagEmptyState)
  const filterTagOptions = () => {
    const searchTerm = tagSearchInput.value.trim().toLowerCase()
    let visibleTagCount = 0
    tagOptionList.querySelectorAll('.project-task-tag-option').forEach(option => {
      const matches = option.dataset.tagName.startsWith(searchTerm)
      option.hidden = !matches
      if (matches) visibleTagCount += 1
    })
    tagEmptyState.hidden = visibleTagCount > 0
  }
  tagSearchInput.addEventListener('input', filterTagOptions)
  taskTagOptions.forEach(tag => {
    const optionLabel = make('label', 'project-task-tag-option')
    optionLabel.dataset.tagName = tag.toLowerCase()
    const optionName = make('span', '', tag)
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.value = tag
    checkbox.checked = selectedTags.has(tag)
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedTags.add(tag)
      else selectedTags.delete(tag)
      updateTagSummary()
    })
    optionLabel.append(optionName, checkbox)
    tagOptionList.append(optionLabel)
  })
  tagPicker.append(tagPickerSummary, tagOptions)
  tagField.append(tagLabel, tagPicker)
  tagPicker.addEventListener('toggle', () => {
    if (tagPicker.open) {
      tagSearchInput.focus()
      return
    }
    tagSearchInput.value = ''
    filterTagOptions()
  })
  backdrop.addEventListener('pointerdown', event => {
    if (!tagPicker.contains(event.target)) tagPicker.open = false
  })

  const statusLabel = make('label', 'no-input-icon', 'Status')
  const statusSelect = document.createElement('select')
  ;(task ? ['Backlog', 'To do', 'In progress', 'Blocked', 'Done'] : ['To do']).forEach(status => {
    const option = make('option', '', status)
    option.value = status
    if (status === (task?.status || 'To do')) option.selected = true
    statusSelect.append(option)
  })
  statusLabel.append(statusSelect)

  const priorityLabel = make('label', 'no-input-icon', 'Priority')
  const prioritySelect = document.createElement('select')
  ;['low', 'medium', 'high'].forEach(priority => {
    const option = make('option', '', priority[0].toUpperCase() + priority.slice(1))
    option.value = priority
    if (priority === (task?.priority || defaults.priority || 'medium')) option.selected = true
    prioritySelect.append(option)
  })
  priorityLabel.append(prioritySelect)
  const tagsPriorityRow = make('div', 'project-task-tags-priority-row')
  tagsPriorityRow.append(tagField, priorityLabel)

  const initialDueDate = task?.due_date
    ? String(task.due_date).slice(0, 10)
    : (defaults.dueDate || toLocalDateKey())
  const initialStartDate = task?.start_date
    ? String(task.start_date).slice(0, 10)
    : (defaults.startDate || initialDueDate)
  const projectStartDate = normalizeDateKey(project.startDate)
  const projectDueDate = normalizeDateKey(project.dueDate)
  const schedulePicker = createScheduleCalendarPicker(initialStartDate, initialDueDate, {
    minDate: projectStartDate,
    maxDate: projectDueDate
  })
  const assignmentRow = make('div', 'form-row project-task-assignment-row')
  assignmentRow.append(categoryLabel, statusLabel)
  const submit = make('button', 'primary-button full gold', task ? 'Save Task' : 'Create Task')
  submit.type = 'submit'
  submit.disabled = false
  form.append(
    close,
    heading,
    copy,
    titleLabel,
    descriptionLabel,
    schedulePicker.element,
    descriptionMedia.element,
    ...(discussionButton ? [discussionButton] : []),
    assignmentRow,
    tagsPriorityRow,
    submit
  )
  backdrop.append(form)
  root.replaceChildren(backdrop)
  titleInput.focus()

  form.addEventListener('submit', async event => {
    event.preventDefault()
    const schedule = schedulePicker.getValues()
    if (
      (projectStartDate && schedule.startDate < projectStartDate) ||
      (projectDueDate && schedule.dueDate > projectDueDate)
    ) {
      showDashboardToast('Task dates must fall within the project timeline.', 'error')
      return
    }
    const payload = {
      title: titleInput.value.trim(),
      description: descriptionInput.value.trim(),
      category: categorySelect.value,
      tags: [...selectedTags],
      status: task ? statusSelect.value : 'To do',
      priority: prioritySelect.value,
      startDate: schedule.startDate || null,
      dueDate: schedule.dueDate || null,
      chatMessageId,
      descriptionAttachments: []
    }
    const restoreSubmit = setDashboardButtonLoading(submit, task ? 'Saving task…' : 'Creating task…')
    try {
      payload.descriptionAttachments = await descriptionMedia.getAttachments()
      const projectId = encodeURIComponent(project.projectId)
      if (task) {
        await api.put(`/projects/${projectId}/tasks/${encodeURIComponent(task.task_id)}`, payload)
      } else {
        await api.post(`/projects/${projectId}/tasks`, payload)
      }
      closeModal()
      descriptionMedia.dispose()
      showDashboardToast(task ? 'Project task updated.' : 'Project task created.', 'success')
      await renderAdminTasksTable()
      if (task) await loadNotificationsFromAPI()
      await hub.refreshMessagesForCurrentUser?.()
    } catch (error) {
      restoreSubmit()
      showDashboardToast(error.message || 'The project task could not be saved.', 'error')
    }
  })
}

export function renderAdminMeetingsTable() {
  const tbody = document.querySelector('#admin-meetings-tbody')
  if (!tbody) return
  tbody.replaceChildren()
  const template = document.querySelector('#admin-meeting-row-template')
  const attendeeTemplate = document.querySelector('#admin-attendee-template')
  if (!template || !attendeeTemplate) return

  if (!meetings.length) {
    const row = document.createElement('tr')
    const cell = document.createElement('td')
    cell.colSpan = 6
    cell.className = 'meeting-empty-state'
    cell.textContent = 'No project meetings scheduled.'
    row.append(cell)
    tbody.append(row)
    return
  }

  meetings.forEach(meet => {
    const tr = template.content.firstElementChild.cloneNode(true)
    const field = name => tr.querySelector(`[data-ref="${name}"]`)
    field('title').textContent = meet.title
    const host = field('host')
    host.replaceChildren()
    host.classList.add('admin-meeting-host')
    const hostAvatar = make('span', 'avatar admin-meeting-host-avatar')
    renderAvatarElement(hostAvatar, {
      name: meet.host,
      profileImage: meet.hostProfileImage,
      tone: 'teal'
    }, 'admin-meeting-host-avatar')
    hostAvatar.setAttribute('aria-hidden', 'true')
    host.append(
      hostAvatar,
      make('span', '', `Host: ${meet.host} · Project: ${meet.projectName}`)
    )
    field('date').textContent = `${meet.date} • ${meet.time}`

    const pin = field('pin')
    pin.classList.add('admin-meeting-pin', meet.pinned ? 'pinned' : 'unpinned')
    pin.textContent = meet.pinned ? '📍 Pinned on Calendar' : 'Unpinned'

    const attendees = field('attendees')
    ;(meet.attendees || []).forEach(person => {
      const attendee = attendeeTemplate.content.firstElementChild.cloneNode(true)
      attendee.classList.add(`${person.tone || 'teal'}-bg`)
      attendee.title = person.name
      renderAvatarElement(attendee, person, 'admin-attendee-avatar')
      attendees.append(attendee)
    })

    const location = field('location')
    location.removeAttribute('href')
    location.textContent = 'Join meeting'
    location.setAttribute('role', 'button')
    location.tabIndex = 0
    const join = location
    const isJoinable = !meet.isEnded && new Date(`${meet.date}T${meet.endTime}:00`) >= new Date()
    if (isJoinable) {
      join.addEventListener('click', event => {
        event.stopPropagation()
        openMeteredMeetingModal(meet)
      })
      join.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        openMeteredMeetingModal(meet)
      })
    } else {
      join.textContent = 'Meeting ended'
      join.setAttribute('aria-disabled', 'true')
      join.removeAttribute('role')
      join.removeAttribute('tabindex')
    }
    const meetingUrl = getSafeMeetingUrl(meet.location)
    if (meetingUrl && !meet.isEnded) {
      const externalLink = make('a', '', 'Open external link ↗')
      externalLink.href = meetingUrl
      externalLink.target = '_blank'
      externalLink.rel = 'noopener noreferrer'
      join.after(externalLink)
    } else if (meet.location) {
      join.after(make('small', 'meeting-location-detail', meet.location))
    }
    const delBtn = field('delete')
    delBtn.style.display = meet.canCancel ? '' : 'none'
    delBtn.addEventListener('click', async () => {
      delBtn.disabled = true
      try {
        await deleteProjectMeeting(meet)
        renderAdminMeetingsTable()
        hub.renderCalendarPanel?.()
        hub.renderWorkspaceHub?.()
        addAuditLog('Project meeting canceled', `Meeting "${meet.title}" canceled.`, 'trash')
        showDashboardToast('Meeting cancelled.')
      } catch (error) {
        delBtn.disabled = false
        showDashboardToast(error.message || 'Unable to cancel this meeting.', 'error')
      }
    })
    tbody.append(tr)
  })
}

export function renderAuditLogs() {
  const containers = [
    document.querySelector('#settings-audit-list'),
    document.querySelector('#admin-audit-list')
  ].filter(Boolean)

  if (containers.length === 0) return
  const template = document.querySelector('#audit-log-template')
  if (!template) return

  containers.forEach(container => {
    container.replaceChildren()
    auditLogs.slice(0, 8).forEach(log => {
      const item = template.content.firstElementChild.cloneNode(true)
      const iconKey = log.iconType || 'sync'
      const icon = item.querySelector('[data-ref="icon"]')
      icon.classList.add(iconKey)
      const parsedIcon = new DOMParser().parseFromString(getSvg(iconKey, 'activity-svg', 16, 16), 'image/svg+xml')
      icon.append(parsedIcon.documentElement)
      item.querySelector('[data-ref="action"]').textContent = log.action
      item.querySelector('[data-ref="detail"]').textContent = `${log.detail} • ${log.time}`
      container.append(item)
    })
  })
}

export function openInviteModal() {
  openInviteCollaboratorModal()
}

export function openLegacyAdminTaskModal(prefilledStatus = 'To do', prefilledProject = null, prefilledDate = toLocalDateKey()) {
  const currentProj = prefilledProject ? (projects.find(p => p.name === prefilledProject) || getActiveProject()) : getActiveProject()

  const backdrop = make('div', 'modal-backdrop')
  const form = make('form', 'modal')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)

  const title = make('h2', '', 'Admin Console: Create Task Deliverable')
  const copy = make('p', 'modal-copy', 'Create a task for the selected project. Project members collaborate on project tasks.')

  const projectLabel = make('label', '', 'Target Collaboration Project')
  const projectSelect = document.createElement('select')
  projects.forEach(p => {
    const opt = make('option', '', p.name)
    opt.value = p.name
    if (p.name === currentProj.name) opt.selected = true
    projectSelect.append(opt)
  })
  projectLabel.append(projectSelect)

  const titleLabel = make('label', '', 'Task Title')
  const titleInput = make('input')
  titleInput.required = true
  titleInput.placeholder = 'e.g. Implement user onboarding step 2'
  titleLabel.append(titleInput)

  const descLabel = make('label', '', 'Deliverable Context / Specifications')
  const descInput = document.createElement('textarea')
  descInput.rows = 2
  descInput.placeholder = 'Description, acceptance criteria, or requirements...'
  descLabel.append(descInput)

  const tagLabel = make('label', '', 'Category Tag')
  const tagSelect = document.createElement('select')
  ;['Design', 'Development', 'Marketing', 'Product'].forEach(val => tagSelect.append(make('option', '', val)))
  tagLabel.append(tagSelect)

  const statusLabel = make('label', '', 'Initial Status')
  const statusSelect = document.createElement('select')
  ;['Backlog', 'To do', 'In progress', 'Blocked', 'Done'].forEach(val => {
    const opt = make('option', '', val)
    opt.value = val
    if (val === prefilledStatus) opt.selected = true
    statusSelect.append(opt)
  })
  statusLabel.append(statusSelect)

  const initDate = prefilledDate || toLocalDateKey()
  const schedulePicker = createScheduleCalendarPicker(initDate, initDate)

  const rowProjectSprint = make('div', 'form-row')
  rowProjectSprint.append(projectLabel)

  const rowTag = make('div', 'form-row')
  rowTag.append(tagLabel)

  const rowStatus = make('div', 'form-row')
  rowStatus.append(statusLabel)

  const submit = make('button', 'primary-button full gold', 'Add Task to Workspace')
  submit.type = 'submit'

  form.append(
    close,
    title,
    copy,
    rowProjectSprint,
    titleLabel,
    descLabel,
    rowTag,
    rowStatus,
    schedulePicker.element,
    submit
  )

  backdrop.append(form)
  root.replaceChildren(backdrop)

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const targetProjectName = projectSelect.value

    let tagColor = 'blue'
    if (tagSelect.value === 'Design') tagColor = 'purple'
    if (tagSelect.value === 'Marketing') tagColor = 'green'
    if (tagSelect.value === 'Product') tagColor = 'yellow'

    const schedule = schedulePicker.getValues()

    const newTask = {
      id: Date.now(),
      project: targetProjectName,
      title: titleInput.value.trim(),
      description: descInput.value.trim() || 'No additional specifications provided.',
      tag: tagSelect.value,
      tagTone: tagColor,
      due: schedule.dueLabel,
      startDate: schedule.startDate,
      date: schedule.dueDate,
      status: statusSelect.value,
      progress: statusSelect.value === 'Done' ? 100 : (statusSelect.value === 'In progress' ? 50 : 0),
      approvalStatus: statusSelect.value === 'Done' ? 'approved' : 'none',
      approvedBy: statusSelect.value === 'Done' ? currentUser.name : null,
      comments: 0,
      commentsList: []
    }

    tasks.push(newTask)
    saveTasks()
    closeModal()
    hub.renderTasks?.()
    renderAdminTasksTable()
    hub.renderCalendarPanel?.()

    addAuditLog('Admin task created', `Admin created deliverable "${newTask.title}" in ${newTask.project}.`, 'task')
    showDashboardToast(`Task "${newTask.title}" created.`, 'success')
  })
}

export function openAdminTaskModal(prefilledStatus = 'To do', prefilledProject = null, prefilledDate = toLocalDateKey()) {
  const availableProjects = projects
  const requestedProject = (prefilledProject && typeof prefilledProject === 'object'
    ? availableProjects.find(project => project.projectId === prefilledProject.projectId)
    : availableProjects.find(project =>
      project.name === prefilledProject ||
      project.projectId === prefilledProject ||
      project.id === prefilledProject
    ))
  if (prefilledProject && !requestedProject) {
    showDashboardToast('The selected project could not be found in your workspace.', 'error')
    return
  }
  const activeProject = getActiveProject()
  const targetProject = requestedProject ||
    (!prefilledProject
      ? availableProjects.find(project => project.projectId === activeProject?.projectId) ||
        (!activeProject && availableProjects.length === 1 ? availableProjects[0] : null)
      : null)
  const defaults = { status: prefilledStatus, dueDate: prefilledDate }

  if (targetProject) {
    openProjectTaskModal(targetProject, null, defaults)
    return
  }
  if (!availableProjects.length) {
    showDashboardToast('No accessible projects are available for task creation.', 'error')
    return
  }

  const backdrop = make('div', 'modal-backdrop')
  const form = make('form', 'modal')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)
  const projectLabel = make('label', '', 'Choose a project')
  const projectSelect = document.createElement('select')
  availableProjects.forEach(project => {
    const option = make('option', '', project.name)
    option.value = project.projectId
    projectSelect.append(option)
  })
  projectLabel.append(projectSelect)
  const submit = make('button', 'primary-button full gold', 'Continue')
  submit.type = 'submit'
  form.append(close, make('h2', '', 'Create Project Task'), projectLabel, submit)
  backdrop.append(form)
  root.replaceChildren(backdrop)
  form.addEventListener('submit', event => {
    event.preventDefault()
    const project = availableProjects.find(item => item.projectId === projectSelect.value)
    if (project) openProjectTaskModal(project, null, defaults)
  })
}

export function openAdminEditTaskModal(task) {
  const project = projects.find(item => item.projectId === (task?.project_id || task?.projectId))
  if (!project || !(task?.task_id || task?.taskId)) {
    showDashboardToast('Open a project in Admin Task Creation to edit its persisted tasks.', 'error')
    return
  }
  openProjectTaskModal(project, {
    ...task,
    task_id: task.task_id || task.taskId
  })
}

export function openLegacyAdminEditTaskModal(task) {
  const backdrop = make('div', 'modal-backdrop')
  const form = make('form', 'modal')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)

  const title = make('h2', '', 'Admin: Edit Deliverable')
  const copy = make('p', 'modal-copy', `Update task specifications and schedule.`)

  const titleLabel = make('label', '', 'Task Title')
  const titleInput = make('input')
  titleInput.value = task.title
  titleInput.required = true
  titleLabel.append(titleInput)

  const descLabel = make('label', '', 'Description')
  const descInput = document.createElement('textarea')
  descInput.rows = 2
  descInput.value = task.description || ''
  descLabel.append(descInput)

  const statusLabel = make('label', '', 'Status')
  const statusSelect = document.createElement('select')
  ;['Backlog', 'To do', 'In progress', 'Blocked', 'Done'].forEach(s => {
    const opt = make('option', '', s)
    opt.value = s
    if (s === task.status) opt.selected = true
    statusSelect.append(opt)
  })
  statusLabel.append(statusSelect)

  const rowStatus = make('div', 'form-row')
  rowStatus.append(statusLabel)

  const today = toLocalDateKey()
  const taskStartDate = task.startDate || today
  const taskDueDate = task.date || (
    task.due === 'Tomorrow' ? addDaysToDateKey(today, 1) :
      task.due === 'This Week' ? addDaysToDateKey(today, 4) :
        task.due === 'Next Week' ? addDaysToDateKey(today, 8) : today
  )
  const schedulePicker = createScheduleCalendarPicker(taskStartDate, taskDueDate)

  const submit = make('button', 'primary-button full gold', 'Save Changes')
  submit.type = 'submit'

  form.append(close, title, copy, titleLabel, descLabel, rowStatus, schedulePicker.element, submit)
  backdrop.append(form)
  root.replaceChildren(backdrop)

  form.addEventListener('submit', async e => {
    e.preventDefault()
    setDashboardButtonLoading(submit, 'Saving task…')
    await new Promise(resolve => window.requestAnimationFrame(resolve))
    task.title = titleInput.value.trim()
    task.description = descInput.value.trim()

    const schedule = schedulePicker.getValues()
    task.startDate = schedule.startDate
    task.date = schedule.dueDate
    task.due = schedule.dueLabel

    task.status = statusSelect.value
    task.done = task.status === 'Done'

    saveTasks()
    closeModal()
    hub.renderTasks?.()
    renderAdminTasksTable()
    hub.renderCalendarPanel?.()
    addAuditLog('Admin updated task', `Updated "${task.title}".`, 'edit')
    showDashboardToast(`Task "${task.title}" updated.`, 'success')
  })
}

let projectActionDropdownListenersReady = false

function ensureProjectActionDropdownDismissal() {
  if (projectActionDropdownListenersReady) return
  projectActionDropdownListenersReady = true

  document.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('.admin-project-action-dropdown')) {
      return
    }
    document.querySelectorAll('.admin-project-action-dropdown[open]').forEach(dropdown => {
      dropdown.open = false
    })
  })

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return
    document.querySelectorAll('.admin-project-action-dropdown[open]').forEach(dropdown => {
      dropdown.open = false
    })
  })
}

function renderProjectActionDropdown(container, label, availableProjects, onSelect, variant = '') {
  if (!availableProjects.length) return
  ensureProjectActionDropdownDismissal()

  const dropdown = make('details', 'admin-project-action-dropdown')
  const trigger = make('summary', `action-btn admin-project-action-trigger ${variant}`, label)
  trigger.setAttribute('aria-label', `${label}: choose a project`)
  const menu = make('div', 'admin-project-action-menu')

  dropdown.addEventListener('toggle', () => {
    if (!dropdown.open) return
    container.querySelectorAll('details[open]').forEach(item => {
      if (item !== dropdown) item.open = false
    })
  })

  availableProjects.forEach(project => {
    const option = make('button', 'admin-project-action-option')
    option.type = 'button'
    option.append(
      make('i', `dot ${project.color || 'blue'}`),
      make('span', '', project.name)
    )
    option.addEventListener('click', async () => {
      await onSelect(project, option)
      container.querySelectorAll('details[open]').forEach(item => {
        item.open = false
      })
    })
    menu.append(option)
  })

  dropdown.append(trigger, menu)
  container.append(dropdown)
}

async function removeProject(project, deleteButton) {
  const confirmed = await showDashboardConfirmation({
    title: 'Delete project?',
    message: `Are you sure you want to permanently delete "${project.name}"? This will remove the project and its related project access.`,
    confirmText: 'Delete project',
    danger: true
  })
  if (!confirmed) return

  const restoreDelete = deleteButton
    ? setDashboardButtonLoading(deleteButton, 'Deleting…')
    : null
  try {
    await api.delete(`/projects/${encodeURIComponent(project.projectId || project.id)}`)
  } catch (error) {
    restoreDelete?.()
    pushNotification(
      'Project Removal Failed',
      error.message || `Unable to remove "${project.name}".`,
      '⚠️',
      'coral-bg'
    )
    return
  }

  const idx = projects.findIndex(item => item.id === project.id)
  if (idx !== -1) {
    const removed = projects.splice(idx, 1)[0]
    saveProjects()
    renderAdminProjectsTable()
    hub.renderProjectNav?.()
    addAuditLog('Project deleted', `${currentUser.name} removed project "${removed.name}".`, 'trash')
    pushNotification('Project Removed', `"${removed.name}" was deleted.`, '🗑️', 'coral-bg')
    showDashboardToast(`"${removed.name}" was deleted.`, 'success')
  }
}

export function renderAdminProjectsTable() {
  const tbody = document.querySelector('#admin-projects-tbody')
  const countBadge = document.querySelector('#admin-projects-count')
  const projectActions = document.querySelector('#admin-project-actions')
  if (!tbody) return

  if (countBadge) countBadge.textContent = `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`
  if (projectActions) {
    projectActions.replaceChildren()
    const ownedProjects = projects.filter(
      project => project.creatorFirebaseUid === firebaseAuth.currentUser?.uid
    )
    renderProjectActionDropdown(
      projectActions,
      'Open Board',
      projects,
      project => hub.switchView?.(project.name),
      'admin-project-open-action'
    )
    renderProjectActionDropdown(
      projectActions,
      'Edit',
      ownedProjects,
      project => openEditProjectModal(project),
      'admin-project-edit-btn'
    )
    renderProjectActionDropdown(
      projectActions,
      'Invite Member',
      ownedProjects,
      project => openInviteCollaboratorModal(project),
      'admin-project-invite-action'
    )
    renderProjectActionDropdown(
      projectActions,
      'Remove',
      ownedProjects,
      (project, button) => removeProject(project, button),
      'admin-project-remove-action'
    )
  }
  tbody.replaceChildren()

  if (!projects.length) {
    const row = document.createElement('tr')
    const cell = make('td', 'notification-empty-state', 'No projects yet. Create a project to get started.')
    cell.colSpan = 6
    row.append(cell)
    tbody.append(row)
    return
  }

  projects.forEach(project => {
    const tr = document.createElement('tr')

    // 1. Project name
    const tdProject = document.createElement('td')
    const projWrap = make('div', 'project-cell')
    const info = make('div', 'project-info')
    const nameStrong = make('strong', '', project.name)
    info.append(nameStrong)
    projWrap.append(info)
    tdProject.append(projWrap)

    // 2. Collaboration Type
    const tdType = document.createElement('td')
    const typeBadge = make('span', 'collab-type-badge', project.projectType || 'General Collaboration')
    tdType.append(typeBadge)

    // 3. Time Span
    const tdTimeSpan = document.createElement('td')
    const timeSpanText = make(
      'span',
      'time-span-text',
      formatProjectTimeSpanForDisplay(project.timeSpan)
    )
    tdTimeSpan.append(timeSpanText)

    // 4. Creator
    const tdCreator = document.createElement('td')
    const creatorWrap = make('div', 'member-cell')
    const currentFirebaseUid = firebaseAuth.currentUser?.uid || currentUser.uid
    const isCurrentUserCreator = Boolean(project.creatorFirebaseUid && currentFirebaseUid &&
      project.creatorFirebaseUid === currentFirebaseUid)
    const creatorName = (
      isCurrentUserCreator ? currentUser.name?.trim() : ''
    ) || project.creatorName?.trim() || project.creatorEmail?.trim() || 'Project creator'
    const creatorEmail = project.creatorEmail?.trim()
    const creatorInfo = make('div', 'member-info')
    creatorInfo.append(
      make('strong', '', creatorName),
      ...(creatorEmail && creatorName !== creatorEmail ? [make('small', '', creatorEmail)] : [])
    )
    creatorWrap.append(creatorInfo)
    tdCreator.append(creatorWrap)

    // 5. Team / Collaborators
    const tdTeam = document.createElement('td')
    const teamWrap = make('div', 'collaborators-cell')
    const teamCount = new Set(
      (project.acceptedMembers || [])
        .map(member => member.firebaseUid || member.firebase_uid || member.email?.trim().toLowerCase())
        .filter(Boolean)
    ).size
    const teamBadge = make('span', 'status-badge active', `${teamCount} ${teamCount === 1 ? 'collaborator' : 'collaborators'}`)
    teamWrap.append(teamBadge)
    tdTeam.append(teamWrap)

    // 6. Sprints
    const tdSprints = document.createElement('td')
    const sprintCount = (project.sprints || []).length
    const sprintText = make('span', 'admin-sprint-cell', `${sprintCount} ${sprintCount === 1 ? 'Sprint' : 'Sprints'}`)
    tdSprints.append(sprintText)

    tr.append(tdProject, tdType, tdTimeSpan, tdCreator, tdTeam, tdSprints)
    tbody.append(tr)
  })
}
