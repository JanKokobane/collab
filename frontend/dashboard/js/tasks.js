import { getSvg } from './icons.js'
import {
  tasks,
  projects,
  getAccessibleTasks,
  members,
  currentUser,
  activeView,
  activeFilter,
  activeSprintFilter,
  loadNotificationsFromAPI,
  make,
  closeModal,
  root,
  saveTasks,
  addAuditLog,
  pushNotification,
  renderAvatarElement,
  hub
} from './state.js'
import { getActiveProject, isCurrentUserProjectCreator, showPermissionNotice } from './auth.js'
import { createScheduleCalendarPicker } from './calendar.js'
import { api } from './api.js'
import { setDashboardButtonLoading, showDashboardToast } from './modalChrome.js'
import { openProjectProgressAside } from './projectProgressAside.js?v=20261105-sprint-submission-media'

// ============================================================
// TASKS & BOARD MANAGEMENT
// ============================================================

export function getFilteredTasks() {
  const accessibleProjectNames = new Set(projects.map(project => project.name))
  let list = tasks.filter(task => accessibleProjectNames.has(task.project))

  if (activeView === 'Workspace') {
    // Show all tasks across active projects
  } else if (activeView === 'My Tasks') {
    list = list.filter(t => t.backendPersistent
      ? t.assigneeFirebaseUid === currentUser.uid
      : t.assignee === currentUser.initials)
  } else if (activeView !== 'Admin Console' && activeView !== 'Calendar' && activeView !== 'Overview') {
    list = list.filter(t => t.project === activeView)
  }

  if (activeSprintFilter !== 'all' && activeView !== 'Workspace' && activeView !== 'Overview' && activeView !== 'Calendar' && activeView !== 'My Tasks' && activeView !== 'Admin Console') {
    list = list.filter(t => t.sprint === activeSprintFilter)
  }

  if (activeFilter === 'mine') {
    list = list.filter(t => t.backendPersistent
      ? t.assigneeFirebaseUid === currentUser.uid
      : t.assignee === currentUser.initials)
  } else if (activeFilter === 'backlog') {
    list = list.filter(t => t.status === 'Backlog')
  } else if (activeFilter === 'todo') {
    list = list.filter(t => t.status === 'To do')
  } else if (activeFilter === 'progress') {
    list = list.filter(t => t.status === 'In progress')
  } else if (activeFilter === 'blocked') {
    list = list.filter(t => t.status === 'Blocked')
  } else if (activeFilter === 'done') {
    list = list.filter(t => t.status === 'Done')
  }

  return list
}

export function updateTaskCounts(filtered) {
  const backlogCount = filtered.filter(t => t.status === 'Backlog').length
  const todoCount = filtered.filter(t => t.status === 'To do').length
  const progressCount = filtered.filter(t => t.status === 'In progress').length
  const blockedCount = filtered.filter(t => t.status === 'Blocked').length
  const doneCount = filtered.filter(t => t.status === 'Done').length

  const countBacklog = document.querySelector('#count-backlog')
  const countTodo = document.querySelector('#count-todo')
  const countProgress = document.querySelector('#count-progress')
  const countBlocked = document.querySelector('#count-blocked')
  const countDone = document.querySelector('#count-done')

  if (countBacklog) countBacklog.textContent = backlogCount
  if (countTodo) countTodo.textContent = todoCount
  if (countProgress) countProgress.textContent = progressCount
  if (countBlocked) countBlocked.textContent = blockedCount
  if (countDone) countDone.textContent = doneCount

  const workspaceNavBadge = document.querySelector('#workspace-tasks-nav-count') || document.querySelector('#my-tasks-nav-count')
  if (workspaceNavBadge) workspaceNavBadge.textContent = `${getAccessibleTasks().length}`
}

function canCurrentUserMoveTask(task) {
  return !getTaskMoveRestriction(task)
}

function isTaskLockedUntilSprintsComplete(task) {
  if (!task.backendPersistent || task.status !== 'In progress') return false
  const project = projects.find(candidate => candidate.projectId === task.projectId)
  const sprints = Array.isArray(project?.sprints) ? project.sprints : []
  return !sprints.length || sprints.some(sprint => sprint.status !== 'Completed')
}

function getTaskMoveRestriction(task) {
  if (!task.backendPersistent) return ''

  const project = projects.find(candidate => candidate.projectId === task.projectId)
  const isProjectOwner = Boolean(
    currentUser.uid && project?.creatorFirebaseUid === currentUser.uid
  )
  const isAssignee = Boolean(
    currentUser.uid && task.assigneeFirebaseUid === currentUser.uid
  )
  if (!isProjectOwner && !isAssignee) {
    return 'Only the project owner or assigned user can move this project task.'
  }

  if (isTaskLockedUntilSprintsComplete(task)) {
    return 'This in-progress task cannot be moved until every project sprint is complete.'
  }

  return ''
}

export async function moveTaskStatus(taskId, newStatus) {
  const task = tasks.find(t => t.id === taskId)
  if (!task || task.status === newStatus || task.statusUpdating) return
  const moveRestriction = getTaskMoveRestriction(task)
  if (moveRestriction) {
    showDashboardToast(moveRestriction, 'error')
    return
  }

  const oldStatus = task.status
  const previousState = {
    status: task.status,
    done: task.done,
    progress: task.progress,
    approvalStatus: task.approvalStatus,
    approvedBy: task.approvedBy
  }

  if (!task.backendPersistent) {
    task.statusUpdating = true
    renderTasks()
    await new Promise(resolve => window.requestAnimationFrame(resolve))
  }

  task.status = newStatus
  task.done = newStatus === 'Done'

  if (task.backendPersistent) {
    task.progress = newStatus === 'Done' ? 100 : newStatus === 'In progress' ? 50 : 0
    task.approvalStatus = 'none'
    task.statusUpdating = true
    renderTasks()
    hub.renderWorkspaceSummary?.()
    try {
      await api.patch(
        `/projects/${encodeURIComponent(task.projectId)}/tasks/${encodeURIComponent(task.taskId)}/status`,
        { status: newStatus }
      )
    } catch (error) {
      Object.assign(task, previousState)
      task.statusUpdating = false
      renderTasks()
      hub.renderWorkspaceSummary?.()
      showDashboardToast(error.message || 'The task status could not be updated.', 'error')
      return
    }
    task.statusUpdating = false
  } else {
    if (newStatus === 'Done') {
      task.progress = 100
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
    task.statusUpdating = false
  }

  saveTasks()
  renderTasks()
  hub.renderWorkspaceSummary?.()

  if (task.backendPersistent) {
    await hub.renderAdminTasksTable?.()
    try {
      await loadNotificationsFromAPI()
    } catch (error) {
      console.warn('Unable to refresh task dependency notifications:', error)
    }
  }

  addAuditLog('Task status updated', `"${task.title}" moved from ${oldStatus} to ${newStatus}.`, newStatus === 'Done' ? 'check' : 'sync')
  pushNotification(`Task ${newStatus}`, `"${task.title}" moved to ${newStatus}`, newStatus === 'Done' ? '✓' : '⇄', newStatus === 'Done' ? 'green-bg' : 'coral-bg')
  showDashboardToast(`"${task.title}" moved to ${newStatus}.`, 'success')
}

export function taskCard(task) {
  const card = make('article', 'task-card')
  card.dataset.id = String(task.id)
  if (task.hasDependencyWarning || task.dependencies?.some(dependency => dependency.warning_reason)) {
    card.classList.add('has-dependency-warning')
  }
  const project = task.backendPersistent
    ? projects.find(item => item.projectId === task.projectId)
    : null
  const moveRestriction = getTaskMoveRestriction(task)
  const canMoveTask = !moveRestriction && !task.statusUpdating
  card.setAttribute('draggable', String(canMoveTask))
  if (isTaskLockedUntilSprintsComplete(task)) {
    card.classList.add('is-sprint-locked')
  }
  if (!canMoveTask && task.backendPersistent) {
    card.title = moveRestriction || 'This task is currently being updated.'
  }
  if (task.statusUpdating) card.setAttribute('aria-busy', 'true')

  card.addEventListener('dragstart', e => {
    if (!canMoveTask) {
      e.preventDefault()
      return
    }
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
  const priorityLabel = (task.priority || 'medium')[0].toUpperCase() +
    (task.priority || 'medium').slice(1)
  const priority = make(
    'span',
    `task-priority-badge is-${task.priority || 'medium'}`,
    `${priorityLabel} priority`
  )
  const actionMenu = make('div', 'task-card-action-menu')
  const moreBtn = make('button', 'card-more-btn')
  moreBtn.type = 'button'
  moreBtn.innerHTML = getSvg('dots', 'dots-svg', 14, 14)
  moreBtn.title = 'Task actions'
  moreBtn.setAttribute('aria-label', `Change status for ${task.title}`)
  moreBtn.setAttribute('aria-expanded', 'false')
  const statusMenu = make('div', 'task-card-status-menu')
  statusMenu.hidden = true
  statusMenu.setAttribute('role', 'group')
  statusMenu.setAttribute('aria-label', `Move ${task.title} to a status`)
  const closeStatusMenu = () => {
    statusMenu.hidden = true
    moreBtn.setAttribute('aria-expanded', 'false')
    document.removeEventListener('click', closeWhenClickingOutside)
  }
  const closeWhenClickingOutside = event => {
    if (!actionMenu.contains(event.target)) closeStatusMenu()
  }
  const moveRestrictionForMenu = getTaskMoveRestriction(task)
  ;['To do', 'In progress', 'Done', 'Blocked', 'Backlog'].forEach(status => {
    const statusButton = make(
      'button',
      `task-card-status-option${status === task.status ? ' is-current' : ''}`,
      status
    )
    statusButton.type = 'button'
    statusButton.disabled = Boolean(
      task.statusUpdating ||
      moveRestrictionForMenu ||
      status === task.status
    )
    if (moveRestrictionForMenu) statusButton.title = moveRestrictionForMenu
    statusButton.addEventListener('click', event => {
      event.stopPropagation()
      closeStatusMenu()
      void moveTaskStatus(task.id, status)
    })
    statusMenu.append(statusButton)
  })
  moreBtn.addEventListener('click', event => {
    event.stopPropagation()
    if (statusMenu.hidden) {
      statusMenu.hidden = false
      moreBtn.setAttribute('aria-expanded', 'true')
      document.addEventListener('click', closeWhenClickingOutside)
    } else {
      closeStatusMenu()
    }
  })
  actionMenu.addEventListener('click', event => event.stopPropagation())
  moreBtn.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeStatusMenu()
    }
  })
  actionMenu.append(moreBtn, statusMenu)
  top.append(tagWrap, ...(task.backendPersistent ? [priority] : []), actionMenu)

  const title = make('h4', '', task.title)
  let discussionButton = null
  if (task.backendPersistent && task.chatMessageId && task.chatConversationId) {
    discussionButton = make('button', 'task-discussion-link', 'View discussion')
    discussionButton.type = 'button'
    discussionButton.addEventListener('click', event => {
      event.stopPropagation()
      hub.openMessageContext?.({
        conversationId: task.chatConversationId,
        messageId: task.chatMessageId
      })
    })
  }
  if (task.backendPersistent && project) {
    card.classList.add('task-card-has-project-details')
    card.tabIndex = 0
    card.setAttribute('aria-label', `Open project details for ${task.title}`)
    card.addEventListener('click', event => {
      if (!event.target.closest('button, a, input, select, textarea, audio, video')) {
        openProjectProgressAside(task)
      }
    })
    card.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target === card) {
        event.preventDefault()
        openProjectProgressAside(task)
      }
    })
  }

  const meta = make('div', 'task-meta')
  const dueSpan = make('span', task.due === 'Today' ? 'due today meta-due-span' : 'due meta-due-span')
  dueSpan.innerHTML = `${getSvg('calendar', 'meta-icon', 12, 12)} <span>${task.due}</span>`
  meta.append(dueSpan)

  if (task.commentsList && task.commentsList.length > 0) {
    const commentSpan = make('span', 'meta-comment-span')
    commentSpan.innerHTML = `${getSvg('message', 'meta-icon', 12, 12)} <span>${task.commentsList.length}</span>`
    meta.append(commentSpan)
  }
  if (task.hasDependencyWarning || task.dependencies?.some(dependency => dependency.warning_reason)) {
    const warning = make('span', 'task-dependency-warning', 'Dependency risk')
    warning.title = 'A predecessor task is blocked or its due date moved later.'
    meta.append(warning)
  }
  if (isTaskLockedUntilSprintsComplete(task)) {
    const sprintLock = make('span', 'task-sprint-lock-badge', 'Sprint lock')
    sprintLock.title = 'Complete every project sprint before moving this in-progress task.'
    meta.append(sprintLock)
  }

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
  const assigneeEl = make('div')
  renderAvatarElement(assigneeEl, {
    name: task.assigneeName || task.assignee,
    initials: task.assignee,
    profileImage: task.assigneeProfileImage,
    tone: task.assigneeTone || 'teal'
  })
  assigneeEl.title = `${task.assigneeName || task.assignee}`
  footer.append(assigneeEl)

  if (task.status === 'Done') {
    const doneLabel = make('span', 'done-label')
    doneLabel.innerHTML = `${getSvg('check', 'done-icon', 12, 12)} <span>Done</span>`
    footer.append(doneLabel)
  } else {
    const progress = make('div', 'progress')
    const bar = make('span')
    const projectSprints = Array.isArray(project?.sprints) ? project.sprints : []
    const completedSprintCount = projectSprints.filter(
      sprint => String(sprint.status || '').trim().toLowerCase() === 'completed'
    ).length
    const taskProgress = task.backendPersistent
      ? projectSprints.length
        ? Math.round((completedSprintCount / projectSprints.length) * 100)
        : 0
      : task.progress || 0
    progress.setAttribute('role', 'progressbar')
    progress.setAttribute('aria-valuemin', '0')
    progress.setAttribute('aria-valuemax', '100')
    progress.setAttribute('aria-valuenow', String(taskProgress))
    progress.setAttribute(
      'aria-label',
      task.backendPersistent
        ? `${completedSprintCount} of ${projectSprints.length} project sprints completed`
        : 'Task progress'
    )
    bar.style.width = `${taskProgress}%`
    progress.append(bar)
    footer.append(progress)
  }

  card.append(
    top,
    title,
    ...(discussionButton ? [discussionButton] : []),
    meta,
    footer
  )
  return card
}

export function setupDragAndDrop() {
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
      const task = tasks.find(t => String(t.id) === taskIdStr)
      if (task && task.status !== status) {
        moveTaskStatus(task.id, status)
      }
    }
  })
}

export function renderTasks() {
  const lists = {
    Backlog: document.querySelector('#backlog-list'),
    'To do': document.querySelector('#todo-list'),
    'In progress': document.querySelector('#progress-list'),
    Blocked: document.querySelector('#blocked-list'),
    Done: document.querySelector('#done-list')
  }

  const filtered = getFilteredTasks()
  updateTaskCounts(filtered)

  if (lists.Backlog && lists['To do']) {
    Object.values(lists).forEach(list => { if (list) list.replaceChildren() })
    filtered.forEach(task => {
      const status = task.status || (task.done ? 'Done' : 'To do')
      if (lists[status]) {
        lists[status].append(taskCard(task))
      }
    })
  }

  setupDragAndDrop()
  renderListView(filtered)

  if (activeView === 'Overview') {
    hub.renderOverviewPanel?.()
  }
  if (activeView === 'Meetings') {
    hub.renderCalendarPanel?.()
  }
}

export function renderListView(filtered) {
  const tbody = document.querySelector('#list-tasks-tbody')
  if (!tbody) return
  tbody.replaceChildren()

  filtered.forEach(task => {
    const tr = document.createElement('tr')

    const tdCheck = document.createElement('td')
    const checkBtn = make('button', `task-checkbox-btn ${task.status === 'Done' ? 'checked' : ''}`)
    checkBtn.type = 'button'
    checkBtn.disabled = !canCurrentUserMoveTask(task)
    if (checkBtn.disabled) {
      checkBtn.title = getTaskMoveRestriction(task)
    }
    checkBtn.innerHTML = getSvg('check', 'check-icon', 12, 12)
    checkBtn.addEventListener('click', e => {
      e.stopPropagation()
      moveTaskStatus(task.id, task.status === 'Done' ? 'To do' : 'Done')
    })
    tdCheck.append(checkBtn)

    const tdTitle = document.createElement('td')
    tdTitle.innerHTML = `<strong>${task.title}</strong>`

    const tdTag = document.createElement('td')
    tdTag.innerHTML = `<span class="tag ${task.tagTone || 'blue'}">${task.project} • ${task.tag}</span>`

    const tdAssignee = document.createElement('td')
    const wrap = make('div', 'list-assignee-cell')
    wrap.append(make('div', `avatar ${task.assigneeTone || 'teal'}-bg`, task.assignee), make('small', '', task.assigneeName || task.assignee))
    tdAssignee.append(wrap)

    const tdDue = document.createElement('td')
    tdDue.innerHTML = `<span class="meta-due-span">${getSvg('calendar', 'meta-icon', 12, 12)} <span>${task.due}</span></span>`

    const tdComments = document.createElement('td')
    const count = task.commentsList ? task.commentsList.length : (task.comments || 0)
    tdComments.innerHTML = `<span class="meta-comment-span">${getSvg('message', 'meta-icon', 12, 12)} <span>${count}</span></span>`

    const tdStatus = document.createElement('td')
    const isDone = task.status === 'Done'
    tdStatus.innerHTML = `<span class="status-badge ${isDone ? 'active' : 'pending'}">${task.status}</span>`

    tr.append(tdCheck, tdTitle, tdTag, tdAssignee, tdDue, tdComments, tdStatus)
    tbody.append(tr)
  })
}

export function openTaskModal() {
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

  const projectLabel = make('label', '', 'Group Project')
  const projectSelect = document.createElement('select')
  projects.forEach(p => {
    const opt = make('option', '', p.name)
    opt.value = p.name
    if (activeView === p.name) opt.selected = true
    projectSelect.append(opt)
  })
  projectLabel.append(projectSelect)

  const sprintLabel = make('label', '', 'Project Sprint')
  const sprintSelect = document.createElement('select')
  const curProjSprints = proj.sprints || [{ name: 'Sprint 1: Core Deliverables' }]
  curProjSprints.forEach(s => {
    const opt = make('option', '', s.name)
    opt.value = s.name
    sprintSelect.append(opt)
  })
  sprintLabel.append(sprintSelect)

  const tagLabel = make('label', '', 'Category Tag')
  const tagSelect = document.createElement('select')
  ;['Design', 'Development', 'Marketing', 'Product'].forEach(val => tagSelect.append(make('option', '', val)))
  tagLabel.append(tagSelect)

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

  const statusLabel = make('label', '', 'Initial Status')
  const statusSelect = document.createElement('select')
  const todoOption = make('option', '', 'To do')
  todoOption.value = 'To do'
  todoOption.selected = true
  statusSelect.append(todoOption)
  statusLabel.append(statusSelect)

  const schedulePicker = createScheduleCalendarPicker()

  const row1 = make('div', 'form-row'); row1.append(projectLabel, sprintLabel)
  const row2 = make('div', 'form-row'); row2.append(tagLabel, assigneeLabel)
  const row3 = make('div', 'form-row'); row3.append(statusLabel)

  const submit = make('button', 'primary-button full gold', 'Assign & Create Task')
  submit.type = 'submit'

  form.append(close, make('p', 'eyebrow', 'NEW TASK ASSIGNMENT'), title, copy, titleLabel, descLabel, row1, row2, row3, schedulePicker.element, submit)

  form.addEventListener('submit', async event => {
    event.preventDefault()
    setDashboardButtonLoading(submit, 'Creating task…')
    await new Promise(resolve => window.requestAnimationFrame(resolve))
    const assignedMember = eligibleAssignees.find(m => m.initials === assigneeSelect.value) || eligibleAssignees[0]
    const tagTone = { Design: 'purple', Development: 'blue', Marketing: 'green', Product: 'yellow' }[tagSelect.value] || 'blue'
    const schedule = schedulePicker.getValues()

    const newTask = {
      id: Date.now(),
      project: projectSelect.value,
      title: titleInput.value.trim(),
      description: descInput.value.trim() || 'A new task for the group project.',
      tag: tagSelect.value,
      tagTone,
      due: schedule.dueLabel,
      startDate: schedule.startDate,
      date: schedule.dueDate,
      assignee: assignedMember.initials,
      assigneeName: assignedMember.name,
      assigneeTone: assignedMember.tone || 'teal',
      status: 'To do',
      done: false,
      sprint: sprintSelect.value,
      approvalStatus: 'none',
      progress: 0,
      comments: 0,
      commentsList: []
    }

    tasks.push(newTask)
    saveTasks()
    closeModal()
    renderTasks()

    addAuditLog('Task created', `${currentUser.name} assigned "${newTask.title}" to ${assignedMember.name}.`, 'task')
    pushNotification('Task Assigned', `"${newTask.title}" assigned to ${assignedMember.name}`, assignedMember.initials, `${assignedMember.tone}-bg`)
    showDashboardToast(`Task "${newTask.title}" created.`, 'success')
  })

  backdrop.append(form)
  root.replaceChildren(backdrop)
  titleInput.focus()
}
