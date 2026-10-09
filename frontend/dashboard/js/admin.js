import { getSvg } from './icons.js'
import {
  members,
  tasks,
  meetings,
  auditLogs,
  projects,
  currentUser,
  make,
  closeModal,
  root,
  renderAvatarElement,
  saveTasks,
  saveMeetings,
  saveProjects,
  addAuditLog,
  pushNotification,
  hub,
  replaceProjectTasksFromBackend
} from './state.js'
import { getActiveProject } from './auth.js'
import { createScheduleCalendarPicker } from './calendar.js'
import { addDaysToDateKey, toLocalDateKey } from './dateUtils.js'
import { openInviteCollaboratorModal, openCreateProjectModal, openEditProjectModal } from './projects.js'
import { api } from './api.js'
import { firebaseAuth } from '../../firebase.js'
import { showDashboardConfirmation, showDashboardToast } from './modalChrome.js'

// ============================================================
// ADMIN CONSOLE TABLE & FUNCTIONS
// ============================================================

let projectMembers = []

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
      profileImage: member.profile_image || '',
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

  const memberCount = new Set(projectMembers.map(member => member.firebaseUid).filter(Boolean)).size
  if (countBadge) countBadge.textContent = `${memberCount} ${memberCount === 1 ? 'member' : 'members'}`
  tbody.replaceChildren()

  if (!projectMembers.length) {
    const row = document.createElement('tr')
    const cell = make('td', 'notification-empty-state', 'No project members to show yet.')
    cell.colSpan = 5
    row.append(cell)
    tbody.append(row)
    return
  }

  projectMembers.forEach(member => {
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

        removeBtn.disabled = true
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
          removeBtn.disabled = false
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

function renderProjectTaskDetails(project, taskRecords, loadError) {
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
    sprintList.append(make('p', 'project-task-empty', 'No sprints yet. Add a sprint before creating tasks.'))
  } else {
    sprints.forEach(sprint => {
      const sprintChip = make('span', 'project-sprint-chip')
      sprintChip.append(
        make('strong', '', sprint.name || 'Sprint'),
        make('small', '', sprint.status || 'Upcoming')
      )
      if (sprint.assigneeName) {
        sprintChip.append(make('small', 'project-sprint-assignee', `Assigned to ${sprint.assigneeName}`))
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
      make('small', '', 'Invite a teammate. Tasks can be assigned once they accept.')
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
  ;['Task', 'Sprint', 'Assigned to', 'Due date', 'Status', ...(isOwner ? ['Actions'] : [])]
    .forEach(label => headRow.append(make('th', '', label)))
  head.append(headRow)
  taskTable.append(head)
  const body = document.createElement('tbody')

  if (!taskRecords.length) {
    const row = document.createElement('tr')
    const cell = taskTableCell('No tasks have been created for this project yet.', 'project-task-empty')
    cell.colSpan = isOwner ? 6 : 5
    row.append(cell)
    body.append(row)
  } else {
    taskRecords.forEach(task => {
      const row = document.createElement('tr')
      const taskCell = document.createElement('td')
      taskCell.append(make('strong', '', task.title))
      if (task.description) taskCell.append(make('small', '', task.description))
      row.append(taskCell)
      row.append(taskTableCell(task.sprint_name))
      const assigned = task.assignee_name || task.assignee_email || 'Project invitee'
      row.append(taskTableCell(assigned))
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
          deleteButton.disabled = true
          try {
            await api.delete(`/projects/${encodeURIComponent(project.projectId)}/tasks/${encodeURIComponent(task.task_id)}`)
            showDashboardToast('Project task deleted.', 'success')
            renderAdminTasksTable()
          } catch (error) {
            deleteButton.disabled = false
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

export async function renderAdminTasksTable() {
  const tbody = document.querySelector('#admin-tasks-tbody')
  if (!tbody) return
  const loadVersion = ++projectTaskLoadVersion
  tbody.replaceChildren()
  const loadingRow = document.createElement('tr')
  loadingRow.append(taskTableCell('Loading project tasks…', 'notification-empty-state'))
  tbody.append(loadingRow)

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
  replaceProjectTasksFromBackend(projectResults.map(({ project, tasks: projectTasks }) => ({
    projectId: project.projectId,
    tasks: projectTasks
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
    metadata.append(
      make('span', 'collab-type-badge', project.projectType || 'General Collaboration'),
      make('span', '', project.timeSpan || 'Ongoing'),
      make('span', '', `${(project.acceptedMembers || []).length} ${(project.acceptedMembers || []).length === 1 ? 'collaborator' : 'collaborators'}`)
    )
    const taskCount = make('small', '', `${projectTasks.length} ${projectTasks.length === 1 ? 'task' : 'tasks'}`)
    expandButton.append(identity, metadata)
    const rowActions = make('div', 'project-task-row-actions')
    rowActions.append(taskCount)
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
    detailsCell.append(renderProjectTaskDetails(project, projectTasks, error))
    detailsRow.append(detailsCell)
    const toggleProjectDetails = () => {
      const isExpanded = expandButton.getAttribute('aria-expanded') === 'true'
      expandButton.setAttribute('aria-expanded', String(!isExpanded))
      expandButtonToggle.setAttribute('aria-expanded', String(!isExpanded))
      expandButtonToggle.setAttribute('aria-label', `${isExpanded ? 'Expand' : 'Collapse'} ${project.name}`)
      detailsRow.hidden = isExpanded
      expandButton.classList.toggle('is-expanded', !isExpanded)
      expandButtonToggle.classList.toggle('is-expanded', !isExpanded)
    }
    expandButton.addEventListener('click', toggleProjectDetails)
    expandButtonToggle.addEventListener('click', toggleProjectDetails)
    tbody.append(projectRow, detailsRow)
  })
}

function openProjectTaskModal(project, task = null, defaults = {}) {
  const isOwner = project.creatorFirebaseUid === firebaseAuth.currentUser?.uid
  const acceptedMembers = Array.isArray(project.acceptedMembers) ? project.acceptedMembers : []
  let sprints = Array.isArray(project.sprints) ? project.sprints : []
  if (!isOwner) return

  const backdrop = make('div', 'modal-backdrop')
  const form = make('form', 'modal project-task-parent-form')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)
  const heading = make('h2', '', task ? 'Edit Project Task' : 'Create Project Task')
  const copy = make('p', 'modal-copy', `Task assignments are limited to accepted invitees of ${project.name}.`)

  const titleLabel = make('label', '', 'Task title')
  const titleInput = make('input')
  titleInput.required = true
  titleInput.maxLength = 255
  titleInput.value = task?.title || ''
  titleInput.placeholder = 'e.g. Prepare project deliverables'
  titleLabel.append(titleInput)

  const descriptionLabel = make('label', 'no-input-icon', 'Description')
  const descriptionInput = document.createElement('textarea')
  descriptionInput.rows = 3
  descriptionInput.maxLength = 10000
  descriptionInput.value = task?.description || ''
  descriptionInput.placeholder = 'Add details or acceptance criteria'
  descriptionLabel.append(descriptionInput)

  const initialSprint = task
    ? sprints.find(sprint => sprint.name === task.sprint_name)
    : [...sprints].reverse().find(sprint => sprint.assigneeFirebaseUid)
  let selectedSprintIsInProject = Boolean(initialSprint)
  let selectedSprintName = task?.sprint_name || initialSprint?.name || ''
  let selectedAssigneeFirebaseUid = initialSprint?.assigneeFirebaseUid || task?.assignee_firebase_uid || ''
  const originalSprintSelection = {
    isInProject: selectedSprintIsInProject,
    name: selectedSprintName,
    assigneeFirebaseUid: selectedAssigneeFirebaseUid
  }
  const draftSprints = []
  let editingDraftSprintId = null
  let selectedDraftSprintId = null

  const createSprintToggle = make('button', 'primary-button gold project-task-create-sprint-toggle', '+ Add Sprint')
  createSprintToggle.type = 'button'
  const sprintCreatePanel = make('section', 'project-task-create-sprint-panel')
  sprintCreatePanel.setAttribute('role', 'region')
  sprintCreatePanel.setAttribute('aria-labelledby', 'project-task-sprint-title')
  sprintCreatePanel.hidden = true

  const sprintCreateTitle = make('h4', '', 'Create a project sprint')
  sprintCreateTitle.id = 'project-task-sprint-title'
  const closeSprintPanel = make('button', 'project-task-close-sprint', 'Close')
  closeSprintPanel.type = 'button'
  const sprintPanelHeader = make('div', 'project-task-sprint-panel-header')
  sprintPanelHeader.append(sprintCreateTitle, closeSprintPanel)
  const sprintCreateCopy = make('p', 'modal-copy', task
    ? 'Add sprint drafts here. They will be added to the project when you save this task; edit or remove them first if needed.'
    : 'Add sprint drafts here. They will be added to the project when you create the task; edit or remove them first if needed.')
  const draftSprintList = make('div', 'project-task-draft-sprint-list')
  const draftSprintListHeading = make('h4', 'project-task-draft-sprint-heading', 'Sprints to add when the task is saved')
  draftSprintList.hidden = true
  const newSprintNameLabel = make('label', 'no-input-icon', 'Sprint title')
  const newSprintNameInput = make('input')
  newSprintNameInput.maxLength = 240
  newSprintNameInput.placeholder = `Sprint ${sprints.length + 1}: Your title`
  newSprintNameLabel.append(newSprintNameInput)

  const newSprintAssigneeLabel = make('label', 'no-input-icon', `Assign sprint to accepted invitee${task ? ' (optional)' : ''}`)
  const newSprintAssigneeSelect = document.createElement('select')
  const noSprintAssigneeOption = make('option', '', 'No sprint lead')
  noSprintAssigneeOption.value = ''
  newSprintAssigneeSelect.append(noSprintAssigneeOption)
  acceptedMembers.forEach(member => {
    const option = make('option', '', `${member.name || member.email || 'Invitee'}${member.role ? ` (${member.role})` : ''}`)
    option.value = member.firebaseUid
    newSprintAssigneeSelect.append(option)
  })
  newSprintAssigneeLabel.append(newSprintAssigneeSelect)

  const newSprintStatusLabel = make('label', 'no-input-icon', 'Sprint status')
  const newSprintStatusSelect = document.createElement('select')
  ;['Upcoming', 'Active', 'Completed'].forEach(status => {
    const option = make('option', '', status)
    option.value = status
    newSprintStatusSelect.append(option)
  })
  newSprintStatusLabel.append(newSprintStatusSelect)

  const sprintCreateRow = make('div', 'form-row')
  sprintCreateRow.append(newSprintAssigneeLabel, newSprintStatusLabel)
  const saveSprintButton = make('button', 'primary-button gold project-task-save-sprint', 'Add Sprint')
  saveSprintButton.type = 'button'
  const sprintCreateError = make('p', 'project-form-error')
  sprintCreateError.hidden = true
  sprintCreatePanel.append(
    sprintPanelHeader,
    sprintCreateCopy,
    newSprintNameLabel,
    sprintCreateRow,
    sprintCreateError,
    saveSprintButton
  )
  const setSprintPanelOpen = isOpen => {
    sprintCreatePanel.hidden = !isOpen
    if (isOpen) {
      newSprintNameInput.focus()
    } else {
      createSprintToggle.focus()
    }
    createSprintToggle.textContent = isOpen ? 'Cancel Sprint' : '+ Add Sprint'
  }
  createSprintToggle.addEventListener('click', () => {
    setSprintPanelOpen(sprintCreatePanel.hidden)
  })
  closeSprintPanel.addEventListener('click', () => setSprintPanelOpen(false))
  const updateSprintDrafts = () => {
    draftSprints.forEach((sprint, index) => {
      const title = sprint.name.replace(/^Sprint\s+\d+\s*:\s*/i, '').trim()
      sprint.name = `Sprint ${index + 1}: ${title}`
    })

    draftSprintList.replaceChildren()
    draftSprintList.hidden = draftSprints.length === 0
    if (draftSprints.length) draftSprintList.append(draftSprintListHeading)
    draftSprints.forEach((sprint, index) => {
      const item = make('article', 'project-task-draft-sprint')
      const details = make('div', 'project-task-draft-sprint-details')
      const lead = acceptedMembers.find(member => member.firebaseUid === sprint.assigneeFirebaseUid)
      details.append(
        make('strong', '', sprint.name),
        make('small', '', `${sprint.status}${lead ? ` · ${lead.name || lead.email}` : ''}`)
      )
      const actions = make('div', 'project-task-draft-sprint-actions')
      const editButton = make('button', 'project-task-draft-action', 'Edit')
      editButton.type = 'button'
      editButton.addEventListener('click', () => {
        editingDraftSprintId = sprint.id
        newSprintNameInput.value = sprint.name.replace(/^Sprint\s+\d+\s*:\s*/i, '')
        newSprintAssigneeSelect.value = sprint.assigneeFirebaseUid || ''
        newSprintStatusSelect.value = sprint.status
        saveSprintButton.textContent = 'Update Sprint'
        sprintCreateError.hidden = true
        newSprintNameInput.focus()
      })
      const removeButton = make('button', 'project-task-draft-action is-danger', 'Remove')
      removeButton.type = 'button'
      removeButton.addEventListener('click', () => {
        const removedSelectedSprint = selectedDraftSprintId === sprint.id
        draftSprints.splice(index, 1)
        if (removedSelectedSprint) selectedDraftSprintId = draftSprints.at(-1)?.id || null
        if (editingDraftSprintId === sprint.id) {
          editingDraftSprintId = null
          saveSprintButton.textContent = 'Add Sprint'
          newSprintNameInput.value = ''
          newSprintAssigneeSelect.value = ''
          newSprintStatusSelect.value = 'Upcoming'
        }
        updateSprintDrafts()
        const selectedSprint = draftSprints.find(draft => draft.id === selectedDraftSprintId)
        selectedSprintName = selectedSprint?.name || originalSprintSelection.name
        selectedAssigneeFirebaseUid = selectedSprint?.assigneeFirebaseUid || originalSprintSelection.assigneeFirebaseUid
        selectedSprintIsInProject = Boolean(selectedSprint) || originalSprintSelection.isInProject
        submit.disabled = !selectedSprintIsInProject || !selectedSprintName || !selectedAssigneeFirebaseUid
      })
      actions.append(editButton, removeButton)
      item.append(details, actions)
      draftSprintList.append(item)
    })
    const selectedDraftSprint = draftSprints.find(sprint => sprint.id === selectedDraftSprintId)
    if (selectedDraftSprint) selectedSprintName = selectedDraftSprint.name
  }

  saveSprintButton.addEventListener('click', () => {
    const title = newSprintNameInput.value.trim().replace(/^Sprint\s+\d+\s*:\s*/i, '')
    if (!title) {
      newSprintNameInput.focus()
      return
    }

    const draftToUpdate = draftSprints.find(sprint => sprint.id === editingDraftSprintId)
    const draftPosition = draftToUpdate
      ? draftSprints.findIndex(sprint => sprint.id === editingDraftSprintId)
      : draftSprints.length
    const sprintName = `Sprint ${draftPosition + 1}: ${title}`
    const persistedSprintName = `Sprint ${sprints.length + draftPosition + 1}: ${title}`
    const duplicate = sprints.some(sprint => sprint.name.trim().toLowerCase() === persistedSprintName.toLowerCase()) ||
      draftSprints.some((sprint, index) =>
        index !== draftPosition && sprint.name.replace(/^Sprint\s+\d+\s*:/i, '').trim().toLowerCase() === title.toLowerCase()
      )
    if (duplicate) {
      sprintCreateError.textContent = 'A sprint with this title already exists in the project.'
      sprintCreateError.hidden = false
      return
    }

    const selectedSprintMember = acceptedMembers.find(member => member.firebaseUid === newSprintAssigneeSelect.value)
    if (!task && !selectedSprintMember) {
      sprintCreateError.textContent = 'Select an accepted invitee to assign tasks in this sprint.'
      sprintCreateError.hidden = false
      return
    }

    const draftSprint = {
      id: draftToUpdate?.id || `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: sprintName,
      status: newSprintStatusSelect.value,
      ...(selectedSprintMember ? {
        assigneeFirebaseUid: selectedSprintMember.firebaseUid,
        assigneeName: selectedSprintMember.name || selectedSprintMember.email
      } : {})
    }
    if (draftToUpdate) {
      delete draftToUpdate.assigneeFirebaseUid
      delete draftToUpdate.assigneeName
      Object.assign(draftToUpdate, draftSprint)
    } else {
      draftSprints.push(draftSprint)
    }

    updateSprintDrafts()
    selectedDraftSprintId = draftSprint.id
    selectedSprintName = draftSprint.name
    selectedAssigneeFirebaseUid = draftSprint.assigneeFirebaseUid || task?.assignee_firebase_uid || ''
    selectedSprintIsInProject = true
    submit.disabled = !selectedSprintName || !selectedAssigneeFirebaseUid
    editingDraftSprintId = null
    newSprintNameInput.value = ''
    newSprintAssigneeSelect.value = ''
    newSprintStatusSelect.value = 'Upcoming'
    saveSprintButton.textContent = 'Add Sprint'
    sprintCreateError.hidden = true
  })

  const sprintSection = make('div', 'project-task-sprint-field')
  sprintSection.append(createSprintToggle)

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

  const statusLabel = make('label', 'no-input-icon', 'Status')
  const statusSelect = document.createElement('select')
  ;['Backlog', 'To do', 'In progress', 'Done'].forEach(status => {
    const option = make('option', '', status)
    option.value = status
    if (status === (task?.status || defaults.status || 'To do')) option.selected = true
    statusSelect.append(option)
  })
  statusLabel.append(statusSelect)

  const initialDueDate = task?.due_date
    ? String(task.due_date).slice(0, 10)
    : (defaults.dueDate || toLocalDateKey())
  const initialStartDate = task?.start_date
    ? String(task.start_date).slice(0, 10)
    : (defaults.startDate || initialDueDate)
  const schedulePicker = createScheduleCalendarPicker(initialStartDate, initialDueDate)

  const assignmentRow = make('div', 'form-row project-task-assignment-row')
  assignmentRow.append(sprintSection, categoryLabel, statusLabel)
  const submit = make('button', 'primary-button full gold', task ? 'Save Task' : 'Create Task')
  submit.type = 'submit'
  submit.disabled = !selectedSprintIsInProject || !selectedSprintName || !selectedAssigneeFirebaseUid
  form.append(close, heading, copy, titleLabel, descriptionLabel, assignmentRow, sprintCreatePanel, draftSprintList, schedulePicker.element, submit)
  backdrop.append(form)
  root.replaceChildren(backdrop)
  titleInput.focus()

  form.addEventListener('submit', async event => {
    event.preventDefault()
    submit.disabled = true
    const schedule = schedulePicker.getValues()
    const payload = {
      title: titleInput.value.trim(),
      description: descriptionInput.value.trim(),
      category: categorySelect.value,
      sprintName: selectedSprintName,
      assigneeFirebaseUid: selectedAssigneeFirebaseUid,
      status: statusSelect.value,
      startDate: schedule.startDate || null,
      dueDate: schedule.dueDate || null
    }
    try {
      const projectId = encodeURIComponent(project.projectId)
      if (draftSprints.length) {
        const persistedDraftSprints = draftSprints.map((draft, index) => ({
          ...draft,
          name: draft.name.replace(/^Sprint\s+\d+\s*:\s*/i, `Sprint ${sprints.length + index + 1}: `)
        }))
        const selectedDraftIndex = draftSprints.findIndex(draft => draft.id === selectedDraftSprintId)
        const persistedSelectedSprintName = selectedDraftIndex >= 0
          ? persistedDraftSprints[selectedDraftIndex].name
          : selectedSprintName
        const updatedSprints = [...sprints, ...persistedDraftSprints]
        await api.put(`/projects/${projectId}`, { sprints: updatedSprints })
        project.sprints = updatedSprints
        sprints = updatedSprints
        selectedSprintName = persistedSelectedSprintName
        selectedSprintIsInProject = true
        draftSprints.splice(0, draftSprints.length)
        selectedDraftSprintId = null
        updateSprintDrafts()
        payload.sprintName = selectedSprintName
      }
      if (task) {
        await api.put(`/projects/${projectId}/tasks/${encodeURIComponent(task.task_id)}`, payload)
      } else {
        await api.post(`/projects/${projectId}/tasks`, payload)
      }
      closeModal()
      showDashboardToast(task ? 'Project task updated.' : 'Project task created.', 'success')
      renderAdminTasksTable()
    } catch (error) {
      submit.disabled = false
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

  meetings.forEach(meet => {
    const tr = template.content.firstElementChild.cloneNode(true)
    const field = name => tr.querySelector(`[data-ref="${name}"]`)
    field('title').textContent = meet.title
    field('host').textContent = `Host: ${meet.host || 'Alex Morgan'}`
    field('date').textContent = `${meet.date} • ${meet.time}`

    const pin = field('pin')
    pin.classList.add('admin-meeting-pin', meet.pinned ? 'pinned' : 'unpinned')
    pin.textContent = meet.pinned ? '📍 Pinned on Calendar' : 'Unpinned'

    const attendees = field('attendees')
    ;(meet.attendees || ['AM', 'SK']).forEach(initials => {
      const mem = members.find(m => m.initials === initials)
      const tone = mem ? mem.tone : 'coral'
      const attendee = attendeeTemplate.content.firstElementChild.cloneNode(true)
      attendee.classList.add(`${tone}-bg`)
      attendee.title = mem ? mem.name : initials
      attendee.textContent = initials
      attendees.append(attendee)
    })

    field('location').textContent = `${meet.location || 'Google Meet'} ↗`
    const delBtn = field('delete')
    delBtn.addEventListener('click', () => {
      const idx = meetings.findIndex(m => m.id === meet.id)
      if (idx !== -1) meetings.splice(idx, 1)
      saveMeetings()
      renderAdminMeetingsTable()
      hub.renderCalendarPanel?.()
      addAuditLog('Admin meeting canceled', `Meeting "${meet.title}" deleted by Admin.`, 'trash')
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
  const copy = make('p', 'modal-copy', 'Central Workspace Administration: Define deliverable, set due date, and assign a team member.')

  const projectLabel = make('label', '', 'Target Collaboration Project')
  const projectSelect = document.createElement('select')
  projects.forEach(p => {
    const opt = make('option', '', p.name)
    opt.value = p.name
    if (p.name === currentProj.name) opt.selected = true
    projectSelect.append(opt)
  })
  projectLabel.append(projectSelect)

  const sprintLabel = make('label', '', 'Sprint')
  const sprintSelect = document.createElement('select')
  function updateSprints() {
    sprintSelect.replaceChildren()
    const selectedProj = projects.find(p => p.name === projectSelect.value) || currentProj
    const curSprints = selectedProj.sprints || [{ name: 'Sprint 1: Wireframes' }]
    curSprints.forEach(s => {
      const opt = make('option', '', s.name)
      opt.value = s.name
      sprintSelect.append(opt)
    })
  }
  updateSprints()
  projectSelect.addEventListener('change', updateSprints)
  sprintLabel.append(sprintSelect)

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

  const assigneeLabel = make('label', '', 'Assign Deliverable To')
  const assigneeSelect = document.createElement('select')
  members.forEach(m => {
    const opt = make('option', '', `${m.name} (${m.role}) - ${m.initials}`)
    opt.value = m.initials
    if (m.initials === 'JL' || (!members.some(mem => mem.initials === 'JL') && m.initials === currentUser.initials)) {
      opt.selected = true
    }
    assigneeSelect.append(opt)
  })
  assigneeLabel.append(assigneeSelect)

  const statusLabel = make('label', '', 'Initial Status')
  const statusSelect = document.createElement('select')
  ;['Backlog', 'To do', 'In progress', 'Done'].forEach(val => {
    const opt = make('option', '', val)
    opt.value = val
    if (val === prefilledStatus) opt.selected = true
    statusSelect.append(opt)
  })
  statusLabel.append(statusSelect)

  const initDate = prefilledDate || toLocalDateKey()
  const schedulePicker = createScheduleCalendarPicker(initDate, initDate)

  const rowProjectSprint = make('div', 'form-row')
  rowProjectSprint.append(projectLabel, sprintLabel)

  const rowTagAssignee = make('div', 'form-row')
  rowTagAssignee.append(tagLabel, assigneeLabel)

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
    rowTagAssignee,
    rowStatus,
    schedulePicker.element,
    submit
  )

  backdrop.append(form)
  root.replaceChildren(backdrop)

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const targetProjectName = projectSelect.value
    const assignedMember = members.find(m => m.initials === assigneeSelect.value) || members[0]

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
      assignee: assignedMember.initials,
      assigneeName: assignedMember.name,
      assigneeTone: assignedMember.tone || 'teal',
      status: statusSelect.value,
      progress: statusSelect.value === 'Done' ? 100 : (statusSelect.value === 'In progress' ? 50 : 0),
      sprint: sprintSelect.value,
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

    addAuditLog('Admin task created', `Admin created deliverable "${newTask.title}" in ${newTask.project} assigned to ${assignedMember.name}.`, 'task')
    pushNotification('New Deliverable Assigned', `"${newTask.title}" in ${newTask.project}`, assignedMember.initials, `${assignedMember.tone}-bg`)
  })
}

export function openAdminTaskModal(prefilledStatus = 'To do', prefilledProject = null, prefilledDate = toLocalDateKey()) {
  const ownedProjects = projects.filter(project => project.creatorFirebaseUid === firebaseAuth.currentUser?.uid)
  const requestedProject = (prefilledProject && typeof prefilledProject === 'object'
    ? prefilledProject
    : ownedProjects.find(project =>
      project.name === prefilledProject ||
      project.projectId === prefilledProject ||
      project.id === prefilledProject
    ))
  if (prefilledProject && requestedProject?.creatorFirebaseUid !== firebaseAuth.currentUser?.uid) {
    showDashboardToast('Only the project creator can create tasks for that project.', 'error')
    return
  }
  const activeProject = getActiveProject()
  const targetProject = requestedProject ||
    (!prefilledProject
      ? ownedProjects.find(project => project.projectId === activeProject?.projectId) ||
        (!activeProject && ownedProjects.length === 1 ? ownedProjects[0] : null)
      : null)
  const defaults = { status: prefilledStatus, dueDate: prefilledDate }

  if (targetProject) {
    openProjectTaskModal(targetProject, null, defaults)
    return
  }
  if (!ownedProjects.length) {
    showDashboardToast('Only a project creator can create project tasks.', 'error')
    return
  }

  const backdrop = make('div', 'modal-backdrop')
  const form = make('form', 'modal')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)
  const projectLabel = make('label', '', 'Choose a project')
  const projectSelect = document.createElement('select')
  ownedProjects.forEach(project => {
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
    const project = ownedProjects.find(item => item.projectId === projectSelect.value)
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
  const copy = make('p', 'modal-copy', `Update task specifications, assignee, schedule, or sprint status.`)

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

  const assigneeLabel = make('label', '', 'Assignee')
  const assigneeSelect = document.createElement('select')
  members.forEach(m => {
    const opt = make('option', '', `${m.name} (${m.role})`)
    opt.value = m.initials
    if (m.initials === task.assignee) opt.selected = true
    assigneeSelect.append(opt)
  })
  assigneeLabel.append(assigneeSelect)

  const statusLabel = make('label', '', 'Status')
  const statusSelect = document.createElement('select')
  ;['Backlog', 'To do', 'In progress', 'Done'].forEach(s => {
    const opt = make('option', '', s)
    opt.value = s
    if (s === task.status) opt.selected = true
    statusSelect.append(opt)
  })
  statusLabel.append(statusSelect)

  const rowAssigneeStatus = make('div', 'form-row')
  rowAssigneeStatus.append(assigneeLabel, statusLabel)

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

  form.append(close, title, copy, titleLabel, descLabel, rowAssigneeStatus, schedulePicker.element, submit)
  backdrop.append(form)
  root.replaceChildren(backdrop)

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    task.title = titleInput.value.trim()
    task.description = descInput.value.trim()

    const schedule = schedulePicker.getValues()
    task.startDate = schedule.startDate
    task.date = schedule.dueDate
    task.due = schedule.dueLabel

    task.status = statusSelect.value
    task.done = task.status === 'Done'

    const assigned = members.find(m => m.initials === assigneeSelect.value)
    if (assigned) {
      task.assignee = assigned.initials
      task.assigneeName = assigned.name
      task.assigneeTone = assigned.tone || 'teal'
    }

    saveTasks()
    closeModal()
    hub.renderTasks?.()
    renderAdminTasksTable()
    hub.renderCalendarPanel?.()
    addAuditLog('Admin updated task', `Updated "${task.title}".`, 'edit')
  })
}

function renderProjectActionDropdown(container, label, availableProjects, onSelect, variant = '') {
  if (!availableProjects.length) return

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
    option.addEventListener('click', () => {
      container.querySelectorAll('details[open]').forEach(item => {
        item.open = false
      })
      onSelect(project)
    })
    menu.append(option)
  })

  dropdown.append(trigger, menu)
  container.append(dropdown)
}

async function removeProject(project, deleteButton) {
  if (projects.length <= 1) {
    pushNotification('Action Denied', 'Workspace must maintain at least one project.', '⚠️', 'coral-bg')
    return
  }

  const confirmed = await showDashboardConfirmation({
    title: 'Delete project?',
    message: `Are you sure you want to permanently delete "${project.name}"? This will remove the project and its related project access.`,
    confirmText: 'Delete project',
    danger: true
  })
  if (!confirmed) return

  if (deleteButton) deleteButton.disabled = true
  try {
    await api.delete(`/projects/${encodeURIComponent(project.projectId || project.id)}`)
  } catch (error) {
    if (deleteButton) deleteButton.disabled = false
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
      project => removeProject(project),
      'admin-project-remove-action'
    )
  }
  tbody.replaceChildren()

  projects.forEach(project => {
    const tr = document.createElement('tr')

    // 1. Project Info (Name + Color dot + Description)
    const tdProject = document.createElement('td')
    const projWrap = make('div', 'project-cell')
    const dot = make('i', `dot ${project.color || 'blue'}`)
    const info = make('div', 'project-info')
    const nameStrong = make('strong', '', project.name)
    const descSmall = make('small', '', project.description || 'No description provided')
    info.append(nameStrong, descSmall)
    projWrap.append(dot, info)
    tdProject.append(projWrap)

    // 2. Collaboration Type
    const tdType = document.createElement('td')
    const typeBadge = make('span', 'collab-type-badge', project.projectType || 'General Collaboration')
    tdType.append(typeBadge)

    // 3. Time Span
    const tdTimeSpan = document.createElement('td')
    const timeSpanText = make('span', 'time-span-text', project.timeSpan || 'Ongoing')
    tdTimeSpan.append(timeSpanText)

    // 4. Creator
    const tdCreator = document.createElement('td')
    const creatorWrap = make('div', 'member-cell')
    const creatorTone = project.creatorInitials === 'ER' ? 'purple' : project.creatorInitials === 'SK' ? 'teal' : 'coral'
    const creatorAv = make('div', `avatar ${creatorTone}-bg`)
    creatorAv.textContent = project.creatorInitials || 'AM'
    const creatorInfo = make('div', 'member-info')
    creatorInfo.append(
      make('strong', '', project.creatorName || 'Alex Morgan'),
      make('small', '', project.creatorEmail || 'admin@collab.io')
    )
    creatorWrap.append(creatorAv, creatorInfo)
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
