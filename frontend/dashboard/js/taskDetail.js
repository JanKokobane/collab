import { getSvg } from './icons.js'
import {
  tasks,
  projects,
  members,
  currentUser,
  activeView,
  make,
  saveTasks,
  addAuditLog,
  pushNotification,
  hub
} from './state.js'
import { getActiveProject, isCurrentUserProjectCreator } from './auth.js'
import { switchView } from './navigation.js'

// ============================================================
// IN-FLOW TASK DETAIL PANE (NO MODAL / NO BACKDROP)
// ============================================================

export let currentDetailTaskId = null

export function closeInflowTaskPane() {
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

export function openInflowTaskPane(task) {
  currentDetailTaskId = task.id

  if (activeView === 'Overview' || activeView === 'Calendar' || activeView === 'Admin Console') {
    switchView(task.project || 'Product Launch')
  }

  const pane = document.querySelector('#inflow-task-pane')
  const layout = document.querySelector('#workspace-split-layout')
  if (!pane || !layout) return

  layout.classList.add('has-detail-open')
  pane.style.display = 'flex'
  pane.replaceChildren()

  document.querySelectorAll('.task-card').forEach(c => {
    c.classList.toggle('is-active-detail', c.dataset.id === String(task.id))
  })

  const proj = projects.find(p => p.name === task.project) || getActiveProject()
  const isCreator = isCurrentUserProjectCreator()

  const headerRow = make('div', 'inflow-pane-header')
  const breadcrumb = make('div', 'inflow-pane-breadcrumbs')
  breadcrumb.innerHTML = `<span>${task.project}</span> <span>›</span> <span class="tag ${task.tagTone || 'blue'}">${task.tag}</span>`

  const actionsGroup = make('div', 'inflow-pane-header-actions')
  if (isCreator) {
    const editBtn = make('button', 'inflow-edit-btn')
    editBtn.type = 'button'
    editBtn.innerHTML = `<span>Edit</span>`
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

  const title = make('h2', '', task.title)
  const description = make('p', 'inflow-desc', task.description)

  const metaBox = make('div', 'inflow-meta-box')
  const assignedMember = members.find(m => m.initials === task.assignee) || { name: task.assigneeName || task.assignee, initials: task.assignee, role: 'Team Member' }

  const person = make('div', 'inflow-meta-item')
  person.append(make('small', '', 'ASSIGNEE'), make('span', '', `${assignedMember.initials} ${assignedMember.name}`))

  const date = make('div', 'inflow-meta-item')
  date.innerHTML = `<small>DUE DATE</small><span class="meta-due-span">${getSvg('calendar', 'meta-icon', 12, 12)} <span>${task.due}</span></span>`

  metaBox.append(person, date)

  const sprintRow = make('div', 'inflow-meta-box')
  sprintRow.style.marginTop = '-4px'
  const sprintItem = make('div', 'inflow-meta-item')
  sprintItem.innerHTML = `<small>SPRINT / MILESTONE</small><span> ${task.sprint || 'Sprint 2: Core Implementation'}</span>`

  const creatorItem = make('div', 'inflow-meta-item')
  creatorItem.innerHTML = `<small>PROJECT LEAD</small><span>${proj.creatorName}</span>`
  sprintRow.append(sprintItem, creatorItem)

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
          hub.renderTasks?.()
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
            hub.renderTasks?.()
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

  const statusRow = make('div', 'inflow-status-row')
  const statusLabel = make('strong', '', 'Status:')
  statusLabel.style.fontSize = '12px'

  const statusSelect = document.createElement('select')
  statusSelect.className = 'inflow-status-select'
  ;['Backlog', 'To do', 'In progress', 'Done'].forEach(s => {
    const opt = make('option', '', s)
    opt.value = s
    if (task.status === s) opt.selected = true
    statusSelect.append(opt)
  })
  statusSelect.addEventListener('change', () => {
    hub.moveTaskStatus?.(task.id, statusSelect.value)
  })
  statusRow.append(statusLabel, statusSelect)

  const isDone = task.status === 'Done'
  const completeBtn = make('button', `inflow-complete-btn ${isDone ? 'is-completed' : ''}`)
  completeBtn.type = 'button'
  completeBtn.innerHTML = isDone
    ? `${getSvg('check', 'btn-icon', 13, 13)} <span>Completed</span>`
    : `${getSvg('check', 'btn-icon', 13, 13)} <span>Mark as complete</span>`
  completeBtn.addEventListener('click', () => {
    hub.moveTaskStatus?.(task.id, isDone ? 'To do' : 'Done')
  })

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

  const commentForm = document.createElement('form')
  commentForm.className = 'comment-form'
  const commentInput = document.createElement('input')
  commentInput.className = 'comment-input'
  commentInput.placeholder = 'Write a comment or project update...'
  commentInput.required = true

  const commentSubmit = document.createElement('button')
  commentSubmit.type = 'submit'
  commentSubmit.className = 'primary-button gold comment-submit-btn'
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
    hub.renderTasks?.()

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

export function openEditTaskInline(task) {
  const proj = getActiveProject()
  const pane = document.querySelector('#inflow-task-pane')
  if (!pane) return

  pane.replaceChildren()

  const headerRow = make('div', 'inflow-pane-header')
  headerRow.append(make('strong', '', `Edit Deliverable`), make('button', 'inflow-close-btn', '×'))
  headerRow.querySelector('.inflow-close-btn').addEventListener('click', () => openInflowTaskPane(task))

  const form = document.createElement('form')
  form.className = 'inflow-edit-form'

  const titleInput = make('input')
  titleInput.value = task.title
  titleInput.required = true
  titleInput.placeholder = 'Task Title'

  const descText = document.createElement('textarea')
  descText.value = task.description || ''
  descText.placeholder = 'Deliverable description...'
  descText.rows = 3

  const assigneeSelect = document.createElement('select')
  const eligible = proj.invitedMembers || members
  eligible.forEach(m => {
    const opt = make('option', '', `${m.name} (${m.role})`)
    opt.value = m.initials
    if (m.initials === task.assignee) opt.selected = true
    assigneeSelect.append(opt)
  })

  const sprintSelect = document.createElement('select')
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
    hub.renderTasks?.()
    openInflowTaskPane(task)
    addAuditLog('Task updated', `${proj.creatorName} updated deliverable "${task.title}".`, 'edit')
  })

  pane.append(headerRow, form)
}
