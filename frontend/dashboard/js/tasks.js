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
import { openProjectProgressAside } from './projectProgressAside.js'

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
  return !task.backendPersistent ||
    Boolean(currentUser.uid && task.assigneeFirebaseUid === currentUser.uid)
}

export async function moveTaskStatus(taskId, newStatus) {
  const task = tasks.find(t => t.id === taskId)
  if (!task || task.status === newStatus || task.statusUpdating) return
  if (!canCurrentUserMoveTask(task)) {
    showDashboardToast('Only the assigned user can move this project task.', 'error')
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
  const canMoveTask = canCurrentUserMoveTask(task) && !task.statusUpdating
  card.setAttribute('draggable', String(canMoveTask))
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
  const moreBtn = make('button', 'card-more-btn')
  moreBtn.type = 'button'
  moreBtn.innerHTML = getSvg('dots', 'dots-svg', 14, 14)
  moreBtn.title = 'Task actions'
  top.append(tagWrap, moreBtn)

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

  const moveRow = make('div', 'card-move-row')
  if (task.statusUpdating) {
    const loading = make('span', 'task-status-loading')
    const spinner = make('span', 'form-submit-spinner')
    spinner.setAttribute('aria-hidden', 'true')
    loading.append(spinner, make('span', '', 'Updating…'))
    loading.setAttribute('role', 'status')
    moveRow.append(loading)
  } else if (canMoveTask && task.status !== 'Backlog') {
    const btnBacklog = make('button', 'card-move-btn')
    btnBacklog.type = 'button'
    btnBacklog.innerHTML = `${getSvg('arrowLeft', 'arrow-svg', 11, 11)} <span>Backlog</span>`
    btnBacklog.addEventListener('click', e => { e.stopPropagation(); moveTaskStatus(task.id, 'Backlog') })
    moveRow.append(btnBacklog)
  }
  if (!task.statusUpdating && canMoveTask && task.status !== 'To do') {
    const btnTodo = make('button', 'card-move-btn')
    btnTodo.type = 'button'
    btnTodo.innerHTML = `${getSvg('arrowLeft', 'arrow-svg', 11, 11)} <span>To do</span>`
    btnTodo.addEventListener('click', e => { e.stopPropagation(); moveTaskStatus(task.id, 'To do') })
    moveRow.append(btnTodo)
  }
  if (!task.statusUpdating && canMoveTask && task.status !== 'In progress') {
    const btnProg = make('button', 'card-move-btn')
    btnProg.type = 'button'
    btnProg.innerHTML = `<span>In prog</span> ${getSvg('arrowRight', 'arrow-svg', 11, 11)}`
    btnProg.addEventListener('click', e => { e.stopPropagation(); moveTaskStatus(task.id, 'In progress') })
    moveRow.append(btnProg)
  }
  if (!task.statusUpdating && canMoveTask && task.status !== 'Blocked') {
    const btnBlocked = make('button', 'card-move-btn task-move-blocked')
    btnBlocked.type = 'button'
    btnBlocked.textContent = 'Blocked'
    btnBlocked.addEventListener('click', event => {
      event.stopPropagation()
      moveTaskStatus(task.id, 'Blocked')
    })
    moveRow.append(btnBlocked)
  }
  if (!task.statusUpdating && canMoveTask && task.status !== 'Done') {
    const btnDone = make('button', 'card-move-btn')
    btnDone.type = 'button'
    btnDone.innerHTML = `${getSvg('check', 'check-svg', 11, 11)} <span>Done</span>`
    btnDone.addEventListener('click', e => { e.stopPropagation(); moveTaskStatus(task.id, 'Done') })
    moveRow.append(btnDone)
  }

  card.append(
    top,
    title,
    ...(discussionButton ? [discussionButton] : []),
    meta,
    footer,
    moveRow
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
      checkBtn.title = 'Only the assigned user can complete this project task.'
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
