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
  make,
  closeModal,
  root,
  saveTasks,
  addAuditLog,
  pushNotification,
  hub
} from './state.js'
import { getActiveProject, isCurrentUserProjectCreator, showPermissionNotice } from './auth.js'
import { openInflowTaskPane, currentDetailTaskId } from './taskDetail.js'
import { createScheduleCalendarPicker } from './calendar.js'

// ============================================================
// TASKS & BOARD MANAGEMENT
// ============================================================

export function getFilteredTasks() {
  const accessibleProjectNames = new Set(projects.map(project => project.name))
  let list = tasks.filter(task => accessibleProjectNames.has(task.project))

  if (activeView === 'Workspace') {
    // Show all tasks across active projects
  } else if (activeView === 'My Tasks') {
    list = list.filter(t => t.assignee === currentUser.initials)
  } else if (activeView !== 'Admin Console' && activeView !== 'Calendar' && activeView !== 'Overview') {
    list = list.filter(t => t.project === activeView)
  }

  if (activeSprintFilter !== 'all' && activeView !== 'Workspace' && activeView !== 'Overview' && activeView !== 'Calendar' && activeView !== 'My Tasks' && activeView !== 'Admin Console') {
    list = list.filter(t => t.sprint === activeSprintFilter)
  }

  if (activeFilter === 'mine') {
    list = list.filter(t => t.assignee === currentUser.initials)
  } else if (activeFilter === 'backlog') {
    list = list.filter(t => t.status === 'Backlog')
  } else if (activeFilter === 'todo') {
    list = list.filter(t => t.status === 'To do')
  } else if (activeFilter === 'progress') {
    list = list.filter(t => t.status === 'In progress')
  } else if (activeFilter === 'done') {
    list = list.filter(t => t.status === 'Done')
  }

  return list
}

export function updateTaskCounts(filtered) {
  const backlogCount = filtered.filter(t => t.status === 'Backlog').length
  const todoCount = filtered.filter(t => t.status === 'To do').length
  const progressCount = filtered.filter(t => t.status === 'In progress').length
  const doneCount = filtered.filter(t => t.status === 'Done').length

  const countBacklog = document.querySelector('#count-backlog')
  const countTodo = document.querySelector('#count-todo')
  const countProgress = document.querySelector('#count-progress')
  const countDone = document.querySelector('#count-done')

  if (countBacklog) countBacklog.textContent = backlogCount
  if (countTodo) countTodo.textContent = todoCount
  if (countProgress) countProgress.textContent = progressCount
  if (countDone) countDone.textContent = doneCount

  const workspaceNavBadge = document.querySelector('#workspace-tasks-nav-count') || document.querySelector('#my-tasks-nav-count')
  if (workspaceNavBadge) workspaceNavBadge.textContent = `${getAccessibleTasks().length}`
}

export function moveTaskStatus(taskId, newStatus) {
  const task = tasks.find(t => t.id === taskId)
  if (!task) return

  const oldStatus = task.status
  task.status = newStatus
  task.done = newStatus === 'Done'

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

  saveTasks()
  renderTasks()

  if (currentDetailTaskId === task.id) {
    openInflowTaskPane(task)
  }

  addAuditLog('Task status updated', `"${task.title}" moved from ${oldStatus} to ${newStatus}.`, newStatus === 'Done' ? 'check' : 'sync')
  pushNotification(`Task ${newStatus}`, `"${task.title}" moved to ${newStatus}`, newStatus === 'Done' ? '✓' : '⇄', newStatus === 'Done' ? 'green-bg' : 'coral-bg')
}

export function taskCard(task) {
  const card = make('article', 'task-card')
  card.dataset.id = String(task.id)
  card.setAttribute('draggable', 'true')

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

  const moveRow = make('div', 'card-move-row')
  if (task.status !== 'Backlog') {
    const btnBacklog = make('button', 'card-move-btn')
    btnBacklog.type = 'button'
    btnBacklog.innerHTML = `${getSvg('arrowLeft', 'arrow-svg', 11, 11)} <span>Backlog</span>`
    btnBacklog.addEventListener('click', e => { e.stopPropagation(); moveTaskStatus(task.id, 'Backlog') })
    moveRow.append(btnBacklog)
  }
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
      const taskId = Number(taskIdStr)
      const task = tasks.find(t => t.id === taskId)
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
  if (activeView === 'Calendar') {
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
    tr.addEventListener('click', () => openInflowTaskPane(task))
    tbody.append(tr)
  })
}

export function openTaskModal(prefilledStatus = 'To do') {
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
  ;['Backlog', 'To do', 'In progress', 'Done'].forEach(s => {
    const opt = make('option', '', s)
    opt.value = s
    if (typeof prefilledStatus === 'string' && prefilledStatus === s) opt.selected = true
    statusSelect.append(opt)
  })
  statusLabel.append(statusSelect)

  const schedulePicker = createScheduleCalendarPicker()

  const row1 = make('div', 'form-row'); row1.append(projectLabel, sprintLabel)
  const row2 = make('div', 'form-row'); row2.append(tagLabel, assigneeLabel)
  const row3 = make('div', 'form-row'); row3.append(statusLabel)

  const submit = make('button', 'primary-button full gold', 'Assign & Create Task')
  submit.type = 'submit'

  form.append(close, make('p', 'eyebrow', 'NEW TASK ASSIGNMENT'), title, copy, titleLabel, descLabel, row1, row2, row3, schedulePicker.element, submit)

  form.addEventListener('submit', event => {
    event.preventDefault()
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
  root.replaceChildren(backdrop)
  titleInput.focus()
}
