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
  saveMembers,
  renderAvatarElement,
  saveTasks,
  saveMeetings,
  saveProjects,
  addAuditLog,
  pushNotification,
  hub
} from './state.js'
import { getActiveProject } from './auth.js'
import { createScheduleCalendarPicker } from './calendar.js'
import { addDaysToDateKey, toLocalDateKey } from './dateUtils.js'
import { openInviteCollaboratorModal, openCreateProjectModal, openEditProjectModal } from './projects.js'
import { api } from './api.js'
import { firebaseAuth } from '../../firebase.js'

// ============================================================
// ADMIN CONSOLE TABLE & FUNCTIONS
// ============================================================

export function renderMembersTable() {
  const tbody = document.querySelector('#admin-members-tbody')
  const countBadge = document.querySelector('#admin-member-count')
  if (!tbody) return

  if (countBadge) countBadge.textContent = `${members.length} members`
  tbody.replaceChildren()

  members.forEach(member => {
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

    const tdStatus = document.createElement('td')
    const statusBadge = make('span', `status-badge ${member.status.toLowerCase()}`, `● ${member.status}`)
    tdStatus.append(statusBadge)

    const tdActions = document.createElement('td')
    const removeBtn = make('button', 'action-btn delete', 'Remove')
    removeBtn.type = 'button'
    removeBtn.addEventListener('click', () => {
      if (members.length <= 1) {
        pushNotification('Action Denied', 'Cannot remove the last member of the workspace.', '⚠️', 'coral-bg')
        return
      }
      const idx = members.findIndex(m => m.id === member.id)
      if (idx !== -1) members.splice(idx, 1)
      saveMembers()
      renderMembersTable()
      addAuditLog(`Member removed`, `${member.name} (${member.email}) removed from workspace.`, 'trash')
    })
    tdActions.append(removeBtn)

    tr.append(tdMember, tdRole, tdStatus, tdActions)
    tbody.append(tr)
  })
}

export function renderAdminTasksTable() {
  const tbody = document.querySelector('#admin-tasks-tbody')
  if (!tbody) return
  tbody.replaceChildren()
  const template = document.querySelector('#admin-task-row-template')
  if (!template) return

  tasks.forEach(task => {
    const tr = template.content.firstElementChild.cloneNode(true)
    const field = name => tr.querySelector(`[data-ref="${name}"]`)
    field('title').textContent = task.title
    const tag = field('tag')
    tag.classList.add(task.tagTone || 'blue')
    tag.textContent = task.tag || 'Work'

    const projObj = projects.find(p => p.name === task.project)
    const color = projObj ? projObj.color : 'coral'
    field('project-dot').classList.add(color)
    field('project').textContent = task.project

    const avatar = field('assignee-avatar')
    avatar.classList.add(`${task.assigneeTone || 'teal'}-bg`)
    avatar.textContent = task.assignee
    field('assignee-name').textContent = task.assigneeName || task.assignee
    field('sprint').textContent = task.sprint || 'Core Sprint'
    field('due').textContent = task.due

    const status = field('status')
    status.classList.add(task.status.toLowerCase().replace(' ', '-'))
    status.textContent = task.status

    const editBtn = field('edit')
    editBtn.addEventListener('click', () => openAdminEditTaskModal(task))
    const delBtn = field('delete')
    delBtn.addEventListener('click', () => {
      const idx = tasks.findIndex(t => t.id === task.id)
      if (idx !== -1) tasks.splice(idx, 1)
      saveTasks()
      hub.renderTasks?.()
      renderAdminTasksTable()
      hub.renderCalendarPanel?.()
      addAuditLog('Admin task deleted', `Deliverable "${task.title}" deleted by Admin.`, 'trash')
    })
    tbody.append(tr)
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

export function openAdminTaskModal(prefilledStatus = 'To do', prefilledProject = null, prefilledDate = toLocalDateKey()) {
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

export function openAdminEditTaskModal(task) {
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

export function renderAdminProjectsTable() {
  const tbody = document.querySelector('#admin-projects-tbody')
  const countBadge = document.querySelector('#admin-projects-count')
  if (!tbody) return

  if (countBadge) countBadge.textContent = `${projects.length} projects`
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
    const teamCount = (project.invitedMembers || []).length || members.length
    const teamBadge = make('span', 'status-badge active', `${teamCount} members`)
    teamWrap.append(teamBadge)
    tdTeam.append(teamWrap)

    // 6. Sprints
    const tdSprints = document.createElement('td')
    const sprintCount = (project.sprints || []).length
    const sprintText = make('span', 'admin-sprint-cell', `${sprintCount} ${sprintCount === 1 ? 'Sprint' : 'Sprints'}`)
    tdSprints.append(sprintText)

    // 7. Actions
    const tdActions = document.createElement('td')
    const actionsWrap = make('div', 'table-actions-cluster')
    const isProjectCreator = project.creatorFirebaseUid === firebaseAuth.currentUser?.uid

    const openBtn = make('button', 'action-btn primary gold', 'Open Board')
    openBtn.type = 'button'
    openBtn.title = `Switch to ${project.name} board`
    openBtn.addEventListener('click', () => {
      hub.switchView?.(project.name)
    })

    actionsWrap.append(openBtn)

    if (isProjectCreator) {
      const editBtn = make('button', 'action-btn edit', 'Edit')
      editBtn.type = 'button'
      editBtn.title = `Edit ${project.name}`
      editBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg><span>Edit</span>`
      editBtn.addEventListener('click', () => openEditProjectModal(project))

      const inviteBtn = make('button', 'action-btn invite-action-btn', 'Invite Member')
      inviteBtn.type = 'button'
      inviteBtn.title = `Invite member to ${project.name}`
      inviteBtn.addEventListener('click', () => openInviteCollaboratorModal(project))

      const deleteBtn = make('button', 'action-btn delete', 'Remove')
      deleteBtn.type = 'button'
      deleteBtn.title = `Delete ${project.name}`
      deleteBtn.addEventListener('click', async () => {
      if (projects.length <= 1) {
        pushNotification('Action Denied', 'Workspace must maintain at least one project.', '⚠️', 'coral-bg')
        return
      }
      const confirmed = window.confirm ? window.confirm(`Are you sure you want to remove project "${project.name}"?`) : true
      if (!confirmed) return

      deleteBtn.disabled = true
      try {
        await api.delete(`/projects/${encodeURIComponent(project.projectId || project.id)}`)
      } catch (error) {
        deleteBtn.disabled = false
        pushNotification(
          'Project Removal Failed',
          error.message || `Unable to remove "${project.name}".`,
          '⚠️',
          'coral-bg'
        )
        return
      }

      const idx = projects.findIndex(p => p.id === project.id)
      if (idx !== -1) {
        const removed = projects.splice(idx, 1)[0]
        saveProjects()
        renderAdminProjectsTable()
        hub.renderProjectNav?.()
        addAuditLog('Project deleted', `${currentUser.name} removed project "${removed.name}".`, 'trash')
        pushNotification('Project Removed', `"${removed.name}" was deleted.`, '🗑️', 'coral-bg')
      }
      })
      actionsWrap.append(editBtn, inviteBtn, deleteBtn)
    } else {
      actionsWrap.append(make('span', 'notification-read-label', 'Read only'))
    }
    tdActions.append(actionsWrap)

    tr.append(tdProject, tdType, tdTimeSpan, tdCreator, tdTeam, tdSprints, tdActions)
    tbody.append(tr)
  })
}
