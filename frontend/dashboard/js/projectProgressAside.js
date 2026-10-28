import { currentUser, make, projects, tasks, root, addAuditLog, hub, renderAvatarElement } from './state.js'
import { api } from './api.js'
import { openProjectTaskModal } from './admin.js?v=20261028-project-overview'
import { createTaskMediaEditor, renderTaskMediaAttachments } from './taskMedia.js'
import {
  showDashboardConfirmation,
  showDashboardToast,
  setDashboardButtonLoading
} from './modalChrome.js'

function displayDate(value) {
  if (!value) return '—'
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatSprintDate(value) {
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function getProductionAnalysis(projectTasks, sprints) {
  const activeTasks = projectTasks.filter(task => task.status !== 'Done')
  const completed = projectTasks.length - activeTasks.length
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dateKey = date => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
  const todayKey = dateKey(today)
  const weekEnd = new Date(today)
  weekEnd.setDate(weekEnd.getDate() + 7)
  const weekEndKey = dateKey(weekEnd)
  const overdue = activeTasks.filter(task => {
    const dueDate = task.due_date ? String(task.due_date).slice(0, 10) : ''
    return dueDate && dueDate < todayKey
  }).length
  const dueSoon = activeTasks.filter(task => {
    const dueDate = task.due_date ? String(task.due_date).slice(0, 10) : ''
    return dueDate && dueDate >= todayKey && dueDate <= weekEndKey
  }).length
  const blocked = activeTasks.filter(task => task.status === 'Blocked').length
  const dependencyRisks = activeTasks.filter(task =>
    task.hasDependencyWarning ||
    task.dependencies?.some(dependency => dependency.warning_reason)
  ).length
  const pendingReview = sprints.filter(sprint => sprint.status === 'Pending Review').length
  const taskStatusBreakdown = [
    { label: 'To do', count: projectTasks.filter(task => task.status === 'To do').length, tone: 'is-todo' },
    { label: 'In progress', count: projectTasks.filter(task => task.status === 'In progress').length, tone: 'is-progress' },
    { label: 'Blocked', count: blocked, tone: 'is-blocked' },
    { label: 'Done', count: completed, tone: 'is-done' },
    { label: 'Backlog', count: projectTasks.filter(task => task.status === 'Backlog').length, tone: 'is-backlog' }
  ]
  const sprintStatusBreakdown = [
    { label: 'Completed', count: sprints.filter(sprint => sprint.status === 'Completed').length, tone: 'is-done' },
    { label: 'Active', count: sprints.filter(sprint => sprint.status === 'Active').length, tone: 'is-progress' },
    { label: 'Pending review', count: pendingReview, tone: 'is-review' },
    { label: 'Changes requested', count: sprints.filter(sprint => sprint.status === 'Changes Requested').length, tone: 'is-blocked' },
    { label: 'Upcoming', count: sprints.filter(sprint => !sprint.status || sprint.status === 'Upcoming').length, tone: 'is-backlog' }
  ]
  const scheduleBreakdown = [
    { label: 'Overdue', count: overdue, tone: 'is-blocked' },
    { label: 'Due in 7 days', count: dueSoon, tone: 'is-upcoming' },
    {
      label: 'Due later',
      count: activeTasks.filter(task => {
        const dueDate = task.due_date ? String(task.due_date).slice(0, 10) : ''
        return dueDate > weekEndKey
      }).length,
      tone: 'is-progress'
    },
    {
      label: 'No due date',
      count: activeTasks.filter(task => !task.due_date).length,
      tone: 'is-backlog'
    }
  ]
  const unassigned = activeTasks.filter(task =>
    !task.assigneeFirebaseUid && !task.assignee_email && !task.assigneeName
  ).length
  const completion = projectTasks.length
    ? Math.round((completed / projectTasks.length) * 100)
    : 0

  let recommendation = 'Add tasks and due dates to track delivery progress.'
  let tone = 'is-neutral'
  if (overdue || blocked || dependencyRisks) {
    recommendation = [
      overdue ? `${overdue} overdue ${overdue === 1 ? 'task needs' : 'tasks need'} a date or delivery update` : '',
      blocked ? `${blocked} blocked ${blocked === 1 ? 'task needs' : 'tasks need'} an unblock plan` : '',
      dependencyRisks
        ? `${dependencyRisks} ${dependencyRisks === 1 ? 'task has' : 'tasks have'} a dependency warning`
        : ''
    ].filter(Boolean).join(' · ')
    tone = 'is-attention'
  } else if (dueSoon) {
    recommendation = `${dueSoon} ${dueSoon === 1 ? 'task is' : 'tasks are'} due within 7 days; confirm owners and next steps.`
    tone = 'is-upcoming'
  } else if (unassigned) {
    recommendation = `Assign an owner to ${unassigned} open ${unassigned === 1 ? 'task' : 'tasks'} to keep work moving.`
    tone = 'is-upcoming'
  } else if (pendingReview) {
    recommendation = `${pendingReview} ${pendingReview === 1 ? 'sprint is' : 'sprints are'} waiting for owner review.`
    tone = 'is-upcoming'
  } else if (projectTasks.length) {
    recommendation = 'No overdue or blocked work. Keep task owners and due dates current.'
    tone = 'is-positive'
  }

  return {
    completed,
    blocked,
    dependencyRisks,
    overdue,
    dueSoon,
    pendingReview,
    completion,
    taskStatusBreakdown,
    sprintStatusBreakdown,
    scheduleBreakdown,
    recommendation,
    tone
  }
}

function renderAnalysisChart(title, items, className) {
  const chart = make('div', `project-progress-chart ${className}`)
  chart.append(make('h4', '', title))
  const total = items.reduce((sum, item) => sum + item.count, 0)
  if (!total) {
    chart.append(make('p', 'project-progress-chart-empty', 'No data to display yet.'))
    return chart
  }

  const rows = make('div', 'project-progress-chart-rows')
  items.forEach(item => {
    const row = make('div', 'project-progress-chart-row')
    const rowHeader = make('div', 'project-progress-chart-row-header')
    const share = Math.round((item.count / total) * 100)
    rowHeader.append(
      make('span', '', item.label),
      make('strong', '', `${item.count} · ${share}%`)
    )
    const track = make('div', 'project-progress-chart-track')
    track.setAttribute('role', 'img')
    track.setAttribute('aria-label', `${item.label}: ${item.count}`)
    const fill = make('span', `project-progress-chart-fill ${item.tone}`)
    fill.style.width = `${share}%`
    track.append(fill)
    row.append(rowHeader, track)
    rows.append(row)
  })
  chart.append(rows)
  return chart
}

function sprintLeadName(project, sprint) {
  if (sprint.assigneeName) return sprint.assigneeName
  const member = sprintLeadMember(project, sprint)
  return member?.name || member?.email || 'No sprint lead'
}

function sprintLeadMember(project, sprint) {
  return [
    {
      firebaseUid: project.creatorFirebaseUid,
      name: project.creatorName,
      email: project.creatorEmail,
      initials: project.creatorInitials,
      profileImage: project.creatorProfileImage,
      tone: project.creatorTone
    },
    ...(project.acceptedMembers || [])
  ].find(candidate => candidate.firebaseUid === sprint.assigneeFirebaseUid)
}

function openCommentMediaPreview(media, trigger) {
  const backdrop = make('div', 'project-comment-media-preview-backdrop')
  const dialog = make('div', 'project-comment-media-preview')
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', media.alt || media.getAttribute('aria-label') || 'Shared media preview')
  const closeButton = make('button', 'project-comment-media-preview-close', '×')
  closeButton.type = 'button'
  closeButton.setAttribute('aria-label', 'Close media preview')
  const preview = media.cloneNode(false)
  preview.removeAttribute('style')
  if (preview.tagName === 'VIDEO') {
    preview.controls = true
    preview.preload = 'metadata'
    preview.classList.add('project-comment-media-preview-video')
  } else {
    preview.classList.add('project-comment-media-preview-image')
  }

  const closePreview = () => {
    document.removeEventListener('keydown', onKeyDown)
    backdrop.remove()
    trigger?.focus()
  }
  const onKeyDown = event => {
    if (event.key === 'Escape') closePreview()
  }

  closeButton.addEventListener('click', closePreview)
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) closePreview()
  })
  dialog.append(closeButton, preview)
  backdrop.append(dialog)
  document.body.append(backdrop)
  document.addEventListener('keydown', onKeyDown)
  closeButton.focus()
}

function addCommentMediaExpandButtons(container) {
  container.querySelectorAll('img.task-media-image, video.task-media-player').forEach(media => {
    const expandButton = make('button', 'project-comment-media-expand', 'Expand')
    expandButton.type = 'button'
    expandButton.setAttribute(
      'aria-label',
      `Expand ${media.getAttribute('aria-label') || media.alt || 'shared media'}`
    )
    expandButton.addEventListener('click', () => openCommentMediaPreview(media, expandButton))
    media.after(expandButton)
  })
}

async function removeProjectSprint(project, sprint, task, removeButton) {
  const sprints = Array.isArray(project.sprints) ? project.sprints : []
  const sprintIndex = sprints.indexOf(sprint)
  if (sprintIndex < 0) return

  const projectTasks = tasks.filter(candidate =>
    candidate.backendPersistent && candidate.projectId === project.projectId
  )
  const linkedTasks = projectTasks.filter(candidate => candidate.sprint_name === sprint.name)
  const remainingSprints = sprints.filter((_, index) => index !== sprintIndex)
  if (!remainingSprints.length && linkedTasks.length) {
    showDashboardToast(
      "Reassign or delete this sprint's tasks before removing the last sprint.",
      'error'
    )
    return
  }

  const updatedSprints = remainingSprints.map((item, index) => ({
    ...item,
    name: `Sprint ${index + 1}: ${String(item.name || 'Sprint')
      .replace(/^Sprint\s+\d+\s*:\s*/i, '')
      .trim() || 'Untitled'}`
  }))
  const sprintNameMap = {}
  sprints.forEach((item, oldIndex) => {
    const targetIndex = oldIndex < sprintIndex
      ? oldIndex
      : oldIndex === sprintIndex
        ? Math.min(sprintIndex, updatedSprints.length - 1)
        : oldIndex - 1
    const targetSprint = updatedSprints[targetIndex]
    if (targetSprint) sprintNameMap[item.name] = targetSprint.name
  })
  const taskDestination = remainingSprints[Math.min(sprintIndex, remainingSprints.length - 1)]
  const destinationName = updatedSprints[Math.min(sprintIndex, updatedSprints.length - 1)]?.name
  const destinationAssignment = taskDestination?.assigneeFirebaseUid
    ? `assigned to ${sprintLeadName(project, taskDestination)}`
    : 'keeping their current assignees'
  const confirmed = await showDashboardConfirmation({
    title: 'Remove project sprint?',
    message: linkedTasks.length
      ? `Remove "${sprint.name}"? Its ${linkedTasks.length} ${linkedTasks.length === 1 ? 'task will' : 'tasks will'} move to "${destinationName}", ${destinationAssignment}, and sprint numbers will be updated.`
      : `Remove "${sprint.name}" and update the numbering of the remaining sprints?`,
    confirmText: 'Remove sprint',
    danger: true,
    compact: true
  })
  if (!confirmed) return

  const restoreButton = setDashboardButtonLoading(removeButton, 'Removing…')
  try {
    await api.put(`/projects/${encodeURIComponent(project.projectId)}`, {
      sprints: updatedSprints,
      ...(Object.keys(sprintNameMap).length ? { sprint_name_map: sprintNameMap } : {})
    })
    project.sprints = updatedSprints
    await hub.renderAdminTasksTable?.()
    showDashboardToast('Sprint removed and remaining sprints renumbered.', 'success')
    closeAsideAndReopen(task)
  } catch (error) {
    restoreButton()
    showDashboardToast(error.message || 'The sprint could not be removed.', 'error')
  }
}

function closeAsideAndReopen(task) {
  document.querySelector('.project-progress-aside-close')?.click()
  openProjectProgressAside(task)
}

async function loadTaskComments(project, task, container) {
  try {
    const response = await api.get(
      `/projects/${encodeURIComponent(project.projectId)}/tasks/${encodeURIComponent(task.taskId)}/comments`
    )
    const comments = response?.data?.comments || []
    task.commentsList = comments
    task.comments = comments.length
    container.replaceChildren()
    if (!comments.length) {
      container.append(make('p', 'project-comments-empty', 'No comments yet. Share an update to start the discussion.'))
      return comments
    }
    comments.forEach(comment => {
      const row = make('article', 'task-comment-item project-comment-item')
      const avatar = make('span')
      const authorName = comment.author_name || comment.author_email || 'Project member'
      renderAvatarElement(avatar, {
        name: authorName,
        profileImage: comment.author_profile_image || comment.profile_image || ''
      }, 'project-comment-avatar')
      const copy = make('div', 'project-comment-content')
      const header = make('div', 'task-comment-header project-comment-header')
      header.append(
        make('strong', '', authorName),
        make('time', '', new Date(comment.created_at).toLocaleString(undefined, {
          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
        }))
      )
      copy.append(header)
      if (comment.body) copy.append(make('p', 'task-comment-body', comment.body))
      const attachments = comment.attachments || []
      const playableAttachments = attachments.filter(attachment =>
        attachment?.mediaType?.startsWith('image/') ||
        attachment?.mediaType?.startsWith('audio/') ||
        attachment?.mediaType?.startsWith('video/')
      )
      const attachmentContent = renderTaskMediaAttachments(playableAttachments)
      addCommentMediaExpandButtons(attachmentContent)
      const documentAttachments = attachments.filter(attachment =>
        attachment?.mediaType === 'application/pdf' &&
        typeof attachment.data === 'string' &&
        typeof attachment.fileName === 'string'
      )
      documentAttachments.forEach(attachment => {
        const documentLink = make('a', 'project-comment-document')
        documentLink.href = attachment.data
        documentLink.download = attachment.fileName
        documentLink.setAttribute('aria-label', `Download ${attachment.fileName}`)
        documentLink.append(
          make('span', 'project-comment-document-type', 'PDF'),
          make('span', 'project-comment-document-name', attachment.fileName),
          make(
            'span',
            'project-comment-document-size',
            `${Math.max(1, Math.round((Number(attachment.size) || 0) / 1024))} KB`
          )
        )
        attachmentContent.append(documentLink)
      })
      if (attachmentContent.childElementCount) copy.append(attachmentContent)
      row.append(avatar, copy)
      container.append(row)
    })
    return comments
  } catch (error) {
    container.replaceChildren(make('p', 'task-media-status is-error', error.message || 'Task comments could not be loaded.'))
    return []
  }
}

export function openProjectProgressAside(task) {
  const project = projects.find(candidate => candidate.projectId === task.projectId)
  if (!project) {
    showDashboardToast('The project details for this task could not be found.', 'error')
    return
  }

  const projectTasks = tasks.filter(candidate =>
    candidate.backendPersistent && candidate.projectId === project.projectId
  )
  const sprints = Array.isArray(project.sprints) ? project.sprints : []
  const acceptedMembers = Array.isArray(project.acceptedMembers) ? project.acceptedMembers : []
  const projectSprints = Array.isArray(project.sprints) ? project.sprints : []
  const projectOwner = {
    firebaseUid: project.creatorFirebaseUid,
    name: project.creatorName || project.creatorEmail || 'Project owner',
    email: project.creatorEmail,
    profileImage: project.creatorProfileImage,
    role: 'Project owner'
  }
  const currentUid = currentUser.uid
  const isProjectOwner = Boolean(currentUid && project.creatorFirebaseUid === currentUid)
  const backdrop = make('div', 'project-progress-aside-backdrop')
  const aside = make('aside', 'project-progress-aside')
  aside.setAttribute('role', 'dialog')
  aside.setAttribute('aria-modal', 'true')
  aside.setAttribute('aria-labelledby', 'project-progress-aside-title')

  const closeButton = make('button', 'project-progress-aside-close', '×')
  closeButton.type = 'button'
  closeButton.setAttribute('aria-label', 'Close project details')
  const title = make('h2', '', project.name)
  title.id = 'project-progress-aside-title'
  const description = make('p', 'project-progress-aside-description', project.description || 'Project board')
  const header = make('header', 'project-progress-aside-header')
  const headerCopy = make('div')
  headerCopy.append(make('span', 'project-progress-aside-eyebrow', 'Project overview'), title, description)
  header.append(headerCopy, closeButton)
  aside.append(header)

  const summary = make('div', 'project-progress-aside-summary is-overview')
  ;[
    ['Project type', project.projectType || 'Collaboration'],
    ['Duration', project.timeSpan || 'Ongoing'],
    ['Invitees', String(acceptedMembers.length)],
    ['Tasks', String(projectTasks.length)]
  ].forEach(([label, value]) => {
    const metric = make('div', 'project-progress-aside-metric')
    metric.append(make('small', '', label), make('strong', '', value))
    summary.append(metric)
  })
  const content = make('div', 'project-progress-aside-content')
  content.append(summary)

  const analysis = getProductionAnalysis(projectTasks, sprints)
  const analysisSection = make('section', 'project-progress-aside-section project-progress-aside-analysis')
  const analysisHeading = make('div', 'project-progress-aside-section-heading')
  analysisHeading.append(make('h3', '', 'Production analysis'))
  const analysisGrid = make('div', 'project-progress-analysis-grid')
  ;[
    ['Completion', `${analysis.completion}%`, `${analysis.completed} of ${projectTasks.length} tasks complete`],
    ['Blocked', String(analysis.blocked), 'Open tasks marked blocked'],
    ['Dependency risk', String(analysis.dependencyRisks), 'Open tasks with a predecessor warning'],
    ['Overdue', String(analysis.overdue), 'Open tasks past their due date'],
    ['Due in 7 days', String(analysis.dueSoon), 'Open tasks due this week'],
    ['Awaiting review', String(analysis.pendingReview), 'Sprints submitted to the owner']
  ].forEach(([label, value, detail]) => {
    const metric = make('div', 'project-progress-analysis-metric')
    metric.append(make('small', '', label), make('strong', '', value), make('span', '', detail))
    analysisGrid.append(metric)
  })
  const progressTrack = make('div', 'project-progress-analysis-track')
  progressTrack.setAttribute('role', 'progressbar')
  progressTrack.setAttribute('aria-label', 'Project task completion')
  progressTrack.setAttribute('aria-valuemin', '0')
  progressTrack.setAttribute('aria-valuemax', '100')
  progressTrack.setAttribute('aria-valuenow', String(analysis.completion))
  const progressFill = make('span', 'project-progress-analysis-fill')
  progressFill.style.width = `${analysis.completion}%`
  progressTrack.append(progressFill)
  const recommendation = make(
    'p',
    `project-progress-analysis-recommendation ${analysis.tone}`,
    analysis.recommendation
  )
  const charts = make('div', 'project-progress-analysis-charts')
  charts.append(
    renderAnalysisChart('Task status mix', analysis.taskStatusBreakdown, 'is-task-status'),
    renderAnalysisChart('Sprint delivery', analysis.sprintStatusBreakdown, 'is-sprint-status'),
    renderAnalysisChart('Schedule outlook', analysis.scheduleBreakdown, 'is-schedule')
  )
  analysisSection.append(analysisHeading, analysisGrid, progressTrack, recommendation, charts)
  content.append(analysisSection)

  const focusSection = make('section', 'project-progress-aside-section project-progress-aside-focus')
  const descriptionMediaContainer = make('div', 'task-media-player-list')
  focusSection.className = 'project-progress-aside-task-context'
  focusSection.hidden = true
  focusSection.append(make('h4', '', 'Task context'))
  const discussionButton = make('button', 'project-progress-aside-context-link', 'View Discussion Context')
  discussionButton.type = 'button'
  discussionButton.hidden = true
  discussionButton.addEventListener('click', () => {
    close()
    hub.openMessageContext?.({
      conversationId: task.chatConversationId,
      messageId: task.chatMessageId
    })
  })
  focusSection.append(discussionButton)
  if (task.hasDependencyWarning) {
    focusSection.append(make('p', 'task-dependency-warning', 'A predecessor task is blocked or its due date moved later.'))
  }
  focusSection.append(descriptionMediaContainer)
  const updateTaskContextVisibility = () => {
    const hasDiscussionContext = Boolean(task.chatMessageId && task.chatConversationId)
    discussionButton.hidden = !hasDiscussionContext
    focusSection.hidden = !(
      hasDiscussionContext ||
      task.hasDependencyWarning ||
      descriptionMediaContainer.childElementCount
    )
  }
  updateTaskContextVisibility()
  if (task.descriptionAttachments?.length) {
    descriptionMediaContainer.append(make('p', 'project-progress-aside-empty', 'Loading task media…'))
  }
  void api.get(
    `/projects/${encodeURIComponent(project.projectId)}/tasks/${encodeURIComponent(task.taskId)}`
  ).then(response => {
    const detail = response?.data?.task
    if (!detail || !aside.isConnected) return
    task.descriptionAttachments = detail.description_attachments || []
    task.chatMessageId = detail.chat_message_id || task.chatMessageId
    task.chatConversationId = detail.chat_conversation_id || task.chatConversationId
    descriptionMediaContainer.replaceChildren(renderTaskMediaAttachments(task.descriptionAttachments))
    updateTaskContextVisibility()
  }).catch(error => {
    if (aside.isConnected && task.descriptionAttachments?.length) {
      descriptionMediaContainer.replaceChildren(
        make('p', 'project-progress-aside-empty', error.message || 'Task media could not be loaded.')
      )
    }
  })

  const dependencySection = make('section', 'project-progress-aside-section is-dependencies')
  const dependencyHeading = make('div', 'project-progress-aside-section-heading')
  const dependencyHeadingCopy = make('div', 'project-comments-title')
  dependencyHeadingCopy.append(
    make('span', 'project-progress-aside-eyebrow', 'Task planning'),
    make('h3', '', 'Dependencies')
  )
  dependencyHeading.append(dependencyHeadingCopy)
  dependencySection.append(dependencyHeading)
  const dependencySelect = document.createElement('select')
  dependencySelect.className = 'project-dependency-select no-input-icon'
  dependencySelect.multiple = true
  dependencySelect.size = 5
  dependencySelect.setAttribute('aria-label', 'Predecessor tasks across accessible projects')
  tasks.filter(candidate => candidate.backendPersistent && candidate.taskId !== task.taskId)
    .forEach(candidate => {
      const option = make('option', '', `${candidate.project} · ${candidate.title} · ${candidate.status}`)
      option.value = candidate.taskId
      option.selected = (task.dependencies || []).some(dependency => dependency.task_id === candidate.taskId)
      dependencySelect.append(option)
    })
  const dependencyHelp = make('small', 'project-progress-aside-help', 'Select tasks that must finish first. Select multiple with Ctrl or Command.')
  dependencyHelp.id = 'project-dependency-help'
  dependencySelect.setAttribute('aria-describedby', dependencyHelp.id)
  const dependencySave = make('button', 'project-progress-aside-context-link', 'Save Dependencies')
  dependencySave.type = 'button'
  dependencySave.addEventListener('click', async () => {
    const restoreButton = setDashboardButtonLoading(dependencySave, 'Saving…')
    try {
      const predecessorTaskIds = [...dependencySelect.selectedOptions].map(option => option.value)
      await api.put(
        `/projects/${encodeURIComponent(project.projectId)}/tasks/${encodeURIComponent(task.taskId)}/dependencies`,
        { predecessorTaskIds }
      )
      task.dependencies = predecessorTaskIds.map(id => {
        const predecessor = tasks.find(candidate => candidate.taskId === id)
        return {
          task_id: id,
          project_id: predecessor?.projectId,
          title: predecessor?.title,
          status: predecessor?.status
        }
      })
      await hub.renderAdminTasksTable?.({ silent: true })
      showDashboardToast('Task dependencies saved.', 'success')
      closeAsideAndReopen(task)
    } catch (error) {
      restoreButton()
      showDashboardToast(error.message || 'Task dependencies could not be saved.', 'error')
    }
  })
  dependencySection.append(dependencySelect, dependencyHelp, dependencySave)

  const commentsSection = make('section', 'project-progress-aside-section is-comments collab-card')
  const commentsHeading = make('div', 'project-progress-aside-section-heading')
  const commentsTitle = make('div', 'project-comments-title')
  commentsTitle.append(
    make('span', 'project-progress-aside-eyebrow', 'Collaboration'),
    make('h3', '', 'Comments and media')
  )
  commentsHeading.append(commentsTitle)
  const commentsList = make('div', 'task-comment-list')
  commentsList.setAttribute('aria-label', 'Task comments')
  commentsSection.append(commentsHeading)
  const commentForm = document.createElement('form')
  commentForm.className = 'task-comment-form collab-textarea-wrap'
  const commentInput = document.createElement('textarea')
  commentInput.className = 'collab-textarea'
  commentInput.classList.add('no-input-icon')
  commentInput.maxLength = 5000
  commentInput.rows = 3
  commentInput.placeholder = 'Share feedback, review notes, or attach delivery clips…'
  commentInput.setAttribute('aria-label', 'Task comment')
  const commentMedia = createTaskMediaEditor({ label: 'Comment media' })
  commentMedia.element.classList.add('collab-comment-media')
  const commentActions = make('div', 'collab-action-bar')
  const commentSubmit = make('button', 'collab-post-btn', 'Post comment')
  commentSubmit.type = 'submit'
  commentActions.append(commentMedia.element, commentSubmit)
  commentForm.append(commentInput, commentActions)
  commentForm.addEventListener('submit', async event => {
    event.preventDefault()
    const text = commentInput.value.trim()
    if (!text && !commentMedia.hasAttachments()) {
      commentInput.focus()
      return
    }
    const restoreButton = setDashboardButtonLoading(commentSubmit, 'Posting…')
    try {
      const attachments = await commentMedia.getAttachments()
      await api.post(
        `/projects/${encodeURIComponent(project.projectId)}/tasks/${encodeURIComponent(task.taskId)}/comments`,
        { text, attachments }
      )
      commentInput.value = ''
      commentMedia.clear()
      await loadTaskComments(project, task, commentsList)
      restoreButton()
    } catch (error) {
      restoreButton()
      showDashboardToast(error.message || 'The comment could not be posted.', 'error')
    }
  })
  commentsSection.append(commentForm, commentsList)
  content.append(commentsSection)
  void loadTaskComments(project, task, commentsList)

  const sprintSection = make('section', 'project-progress-aside-section is-sprints')
  sprintSection.setAttribute('aria-labelledby', 'project-progress-aside-sprints-title')
  const sprintHeading = make('div', 'project-progress-aside-section-heading')
  const sprintHeadingCopy = make('div', 'project-comments-title')
  sprintHeadingCopy.append(make('span', 'project-progress-aside-eyebrow', 'Delivery plan'))
  const sprintHeadingTitle = make('h3', '', 'Project sprints')
  sprintHeadingTitle.id = 'project-progress-aside-sprints-title'
  sprintHeadingCopy.append(sprintHeadingTitle)
  sprintHeading.append(sprintHeadingCopy)
  sprintSection.append(sprintHeading)
  const sprintList = make('div', 'project-sprint-list project-progress-aside-sprints')
  sprints.forEach(sprint => {
    const sprintStatus = sprint.status || 'Upcoming'
    const row = make('div', 'project-sprint-chip project-progress-aside-sprint')
    row.setAttribute('aria-label', `${sprint.name || 'Untitled sprint'}: ${sprintStatus}`)
    const sprintTop = make('div', 'project-sprint-card-top')
    sprintTop.append(make('strong', 'project-sprint-card-name', sprint.name || 'Untitled sprint'))
    const normalizedStatus = String(sprintStatus).toLowerCase().replaceAll(' ', '-')
    sprintTop.append(make('span', `project-sprint-status is-${normalizedStatus}`, sprintStatus))
    const sprintLead = sprintLeadMember(project, sprint)
    const lead = sprintLead || (sprint.assigneeName
      ? { name: sprint.assigneeName, firebaseUid: sprint.assigneeFirebaseUid }
      : null)
    const leadRow = make('div', 'project-sprint-card-lead')
    if (lead) {
      const leadAvatar = make('span')
      renderAvatarElement(leadAvatar, lead, 'project-sprint-lead-avatar')
      const leadLabel = lead.firebaseUid && lead.firebaseUid === project.creatorFirebaseUid
        ? 'Owner'
        : sprintLeadName(project, sprint)
      leadRow.append(
        leadAvatar,
        make('span', 'project-sprint-card-lead-name', leadLabel)
      )
    } else {
      leadRow.append(make('span', 'project-sprint-card-unassigned', 'No sprint lead assigned'))
    }
    sprintTop.append(leadRow)
    const sprintTasks = projectTasks.filter(candidate => candidate.sprint_name === sprint.name)
    const sprintStart = sprint.startDate || sprint.start_date
    const sprintEnd = sprint.endDate || sprint.end_date
    const sprintStartLabel = sprintStart ? formatSprintDate(sprintStart) : ''
    const sprintEndLabel = sprintEnd ? formatSprintDate(sprintEnd) : ''
    const sprintDates = sprintStartLabel && sprintEndLabel
      ? `${sprintStartLabel} — ${sprintEndLabel}`
      : ''
    const completedSprintTasks = sprintTasks.filter(candidate => candidate.status === 'Done').length
    const sprintProgress = sprintTasks.length
      ? Math.round((completedSprintTasks / sprintTasks.length) * 100)
      : 0
    const progress = make('div', 'project-sprint-card-progress')
    const progressTrack = make('div', 'project-sprint-card-track')
    progressTrack.setAttribute('role', 'progressbar')
    progressTrack.setAttribute('aria-label', `${sprint.name || 'Sprint'} task completion`)
    progressTrack.setAttribute('aria-valuemin', '0')
    progressTrack.setAttribute('aria-valuemax', '100')
    progressTrack.setAttribute('aria-valuenow', String(sprintProgress))
    const progressFill = make('span', 'project-sprint-card-fill')
    progressFill.style.width = `${sprintProgress}%`
    progressTrack.append(progressFill)
    progress.append(
      progressTrack,
      make('strong', 'project-sprint-card-percent', sprintTasks.length ? `${sprintProgress}%` : '—')
    )
    const progressSummary = make(
      'small',
      'project-sprint-card-summary',
      sprintTasks.length
        ? `${completedSprintTasks} of ${sprintTasks.length} ${sprintTasks.length === 1 ? 'task' : 'tasks'} complete`
        : 'No tasks assigned to this sprint'
    )
    row.append(sprintTop)
    if (sprintDates) row.append(make('small', 'project-sprint-card-dates', sprintDates))
    row.append(progress, progressSummary)
    if (sprint.submissionNote) {
      row.append(make('p', 'project-sprint-submission-note', sprint.submissionNote))
    }
    if (sprint.reviewComment) {
      row.append(make('p', 'project-sprint-review-comment', `Owner feedback: ${sprint.reviewComment}`))
    }
    if (isProjectOwner) {
      const removeButton = make('button', 'project-sprint-remove', '×')
      removeButton.type = 'button'
      removeButton.setAttribute('aria-label', `Remove ${sprint.name || 'sprint'}`)
      removeButton.title = 'Remove sprint'
      removeButton.addEventListener('click', () => removeProjectSprint(project, sprint, task, removeButton))
      row.append(removeButton)
    }

    if (currentUid && sprint.assigneeFirebaseUid === currentUid &&
      !['Completed', 'Pending Review'].includes(sprint.status)) {
      const submissionForm = document.createElement('form')
      submissionForm.className = 'project-sprint-review-form'
      const submissionInput = document.createElement('textarea')
      submissionInput.rows = 3
      submissionInput.maxLength = 5000
      submissionInput.required = true
      submissionInput.placeholder = sprint.status === 'Changes Requested'
        ? 'Describe your updates before resubmitting…'
        : 'Summarize the completed sprint work for the project owner…'
      submissionInput.setAttribute('aria-label', `Submission note for ${sprint.name}`)
      const submitButton = make(
        'button',
        'project-progress-aside-complete',
        isProjectOwner
          ? 'Complete sprint'
          : sprint.status === 'Changes Requested'
            ? 'Resubmit for review'
            : 'Submit for review'
      )
      submitButton.type = 'submit'
      submissionForm.append(submissionInput, submitButton)
      submissionForm.addEventListener('submit', async event => {
        event.preventDefault()
        const submissionNote = submissionInput.value.trim()
        if (!submissionNote) {
          submissionInput.focus()
          return
        }
        const restoreButton = setDashboardButtonLoading(submitButton, 'Submitting…')
        try {
          const response = await api.post(
            `/projects/${encodeURIComponent(project.projectId)}/sprints/${encodeURIComponent(sprint.name)}/submit`,
            { submissionNote }
          )
          const savedProject = response?.data?.project
          if (!Array.isArray(savedProject?.sprints)) {
            throw new Error('The server did not confirm the sprint submission.')
          }
          project.sprints = savedProject.sprints
          hub.renderTasks?.()
          addAuditLog(
            isProjectOwner ? 'Sprint completed' : 'Sprint submitted for review',
            `${currentUser.name} ${isProjectOwner ? 'completed' : 'submitted'} "${sprint.name}" in ${project.name}.`,
            isProjectOwner ? 'check' : 'send'
          )
          showDashboardToast(
            isProjectOwner
              ? `"${sprint.name}" completed.`
              : `"${sprint.name}" submitted to the project owner for review.`,
            'success'
          )
          close()
          openProjectProgressAside(task)
        } catch (error) {
          restoreButton()
          showDashboardToast(error.message || 'The sprint could not be submitted.', 'error')
        }
      })
      row.append(submissionForm)
    }

    if (isProjectOwner && sprint.status === 'Pending Review') {
      const reviewForm = document.createElement('form')
      reviewForm.className = 'project-sprint-review-form'
      const reviewInput = document.createElement('textarea')
      reviewInput.rows = 3
      reviewInput.maxLength = 5000
      reviewInput.placeholder = 'Add optional feedback for the sprint lead…'
      reviewInput.setAttribute('aria-label', `Review comment for ${sprint.name}`)
      const actions = make('div', 'project-sprint-review-actions')
      const acceptButton = make('button', 'project-progress-aside-complete', 'Accept submission')
      acceptButton.type = 'button'
      const changesButton = make('button', 'project-sprint-request-changes', 'Request changes')
      changesButton.type = 'submit'
      actions.append(acceptButton, changesButton)
      reviewForm.append(reviewInput, actions)

      const submitReview = async (decision, button) => {
        const comment = reviewInput.value.trim()
        if (decision === 'request_changes' && !comment) {
          reviewInput.required = true
          reviewInput.placeholder = 'Explain what needs to change before returning the sprint…'
          reviewInput.focus()
          return
        }
        reviewInput.required = false
        const restoreButton = setDashboardButtonLoading(button, decision === 'accept' ? 'Accepting…' : 'Sending…')
        try {
          const response = await api.post(
            `/projects/${encodeURIComponent(project.projectId)}/sprints/${encodeURIComponent(sprint.name)}/review`,
            { decision, comment }
          )
          const savedProject = response?.data?.project
          if (!Array.isArray(savedProject?.sprints)) {
            throw new Error('The server did not confirm the sprint review.')
          }
          project.sprints = savedProject.sprints
          hub.renderTasks?.()
          addAuditLog(
            decision === 'accept' ? 'Sprint submission accepted' : 'Sprint changes requested',
            `${currentUser.name} ${decision === 'accept' ? 'accepted' : 'requested changes to'} "${sprint.name}" in ${project.name}.${comment ? ` ${comment}` : ''}`,
            decision === 'accept' ? 'check' : 'comment'
          )
          showDashboardToast(
            decision === 'accept' ? `"${sprint.name}" accepted and completed.` : `Changes requested for "${sprint.name}".`,
            'success'
          )
          close()
          openProjectProgressAside(task)
        } catch (error) {
          restoreButton()
          showDashboardToast(error.message || 'The sprint review could not be saved.', 'error')
        }
      }

      acceptButton.addEventListener('click', () => submitReview('accept', acceptButton))
      reviewForm.addEventListener('submit', event => {
        event.preventDefault()
        void submitReview('request_changes', changesButton)
      })
      row.append(reviewForm)
    }
    sprintList.append(row)
  })
  if (!sprints.length) sprintList.append(make('p', 'project-progress-aside-empty', 'No project sprints yet.'))
  sprintSection.append(sprintList)
  content.append(sprintSection)

  const memberSection = make('section', 'project-progress-aside-section is-members')
  memberSection.setAttribute('aria-labelledby', 'project-progress-aside-members-title')
  const memberHeading = make('div', 'project-progress-aside-section-heading')
  const memberHeadingCopy = make('div', 'project-comments-title')
  memberHeadingCopy.append(make('span', 'project-progress-aside-eyebrow', 'Project team'))
  const memberHeadingTitle = make('h3', '', 'Accepted project invitees')
  memberHeadingTitle.id = 'project-progress-aside-members-title'
  memberHeadingCopy.append(memberHeadingTitle)
  const teamMembers = acceptedMembers.filter(member =>
    !(projectOwner.firebaseUid && member.firebaseUid === projectOwner.firebaseUid) &&
    !(projectOwner.email && member.email?.toLowerCase() === projectOwner.email.toLowerCase())
  )
  const hasProjectOwner = Boolean(
    projectOwner.firebaseUid || projectOwner.email || projectOwner.name !== 'Project owner'
  )
  const listedMembers = hasProjectOwner
    ? [projectOwner, ...teamMembers]
    : teamMembers
  memberHeading.append(memberHeadingCopy)
  memberSection.append(memberHeading)
  const memberList = make('div', 'project-progress-aside-members')
  if (!listedMembers.length) {
    memberList.append(make('p', 'project-progress-aside-empty', 'No accepted invitees yet.'))
  } else {
    listedMembers.forEach(member => {
      const memberTaskCount = projectTasks.filter(projectTask =>
        (member.firebaseUid && projectTask.assigneeFirebaseUid === member.firebaseUid) ||
        (!member.firebaseUid && member.email && projectTask.assignee_email === member.email)
      ).length
      const isOwner = member.role === 'Project owner'
      const memberRow = make(
        'div',
        `project-progress-aside-member project-progress-aside-invitee${isOwner ? ' is-owner' : ''}`
      )
      const avatar = make('span')
      renderAvatarElement(avatar, member, 'project-progress-aside-avatar project-progress-aside-invitee-avatar')
      const memberDetails = make('span', 'project-progress-aside-member-details')
      memberDetails.append(
        make('strong', '', member.name || member.email || 'Project member'),
        make('small', '', isOwner ? 'Project owner' : member.role || member.email || 'Accepted invitee')
      )
      memberRow.append(
        avatar,
        memberDetails,
        make('small', 'project-progress-aside-member-task-count', `${memberTaskCount} ${memberTaskCount === 1 ? 'task' : 'tasks'}`)
      )
      memberList.append(memberRow)
    })
  }
  memberSection.append(memberList)
  if (listedMembers.length) {
    const teamFooter = make('div', 'project-progress-aside-team-footer')
    teamFooter.append(make('span', 'project-progress-aside-team-label', 'TEAM'))
    const avatarStack = make('div', 'project-progress-aside-team-avatars')
    avatarStack.setAttribute('role', 'img')
    avatarStack.setAttribute(
      'aria-label',
      `Team members: ${listedMembers.map(member => member.name || member.email || 'Project member').join(', ')}`
    )
    listedMembers.forEach(member => {
      const avatar = make('span')
      renderAvatarElement(avatar, member, 'project-progress-aside-team-avatar')
      avatar.setAttribute('aria-hidden', 'true')
      avatarStack.append(avatar)
    })
    teamFooter.append(avatarStack)
    memberSection.append(teamFooter)
  }
  content.insertBefore(memberSection, commentsSection)
  content.append(dependencySection)

  const taskSection = make('section', 'project-progress-aside-section is-tasks')
  taskSection.setAttribute('aria-labelledby', 'project-progress-aside-tasks-title')
  const taskHeading = make('div', 'project-progress-aside-section-heading')
  const taskHeadingCopy = make('div', 'project-comments-title')
  taskHeadingCopy.append(make('span', 'project-progress-aside-eyebrow', 'Project board'))
  const taskHeadingTitle = make('h3', '', 'Tasks')
  taskHeadingTitle.id = 'project-progress-aside-tasks-title'
  taskHeadingCopy.append(taskHeadingTitle)
  taskHeading.append(taskHeadingCopy)
  taskSection.append(taskHeading)
  const taskList = make('div', 'project-progress-aside-tasks')
  if (!projectTasks.length) {
    taskList.append(make('p', 'project-progress-aside-empty', 'No project tasks yet.'))
  } else {
    projectTasks.forEach(projectTask => {
      const taskRow = make('article', `project-progress-aside-task${projectTask.taskId === task.taskId ? ' is-selected' : ''}`)
      const taskTop = make('div', 'project-progress-aside-task-top')
      const taskIdentity = make('div', 'project-progress-aside-task-identity')
      taskIdentity.append(make('strong', '', projectTask.title))
      if (projectTask.description) taskIdentity.append(make('p', '', projectTask.description))
      const taskStatus = make('span', `project-progress-aside-status is-${String(projectTask.status || 'To do').toLowerCase().replaceAll(' ', '-')}`, projectTask.status || 'To do')
      taskTop.append(taskIdentity, taskStatus)
      const taskMeta = make('div', 'project-progress-aside-task-meta')
      taskMeta.append(
        make('span', '', `Sprint · ${projectTask.sprint_name || 'No sprint'}`),
        make('span', '', `Assigned · ${projectTask.assigneeName || projectTask.assignee_email || 'Unassigned'}`),
        make('span', '', `Due · ${displayDate(projectTask.due_date)}`)
      )
      taskRow.append(taskTop, taskMeta)
      if (projectTask.taskId === task.taskId) taskRow.append(focusSection)
      const canManageProjectTask = Boolean(
        currentUid && (
          isProjectOwner ||
          projectTask.assigneeFirebaseUid === currentUid
        )
      )
      const taskMovementLocked = projectTask.status === 'In progress' && (
        !projectSprints.length ||
        projectSprints.some(sprint => sprint.status !== 'Completed')
      )
      if (isProjectOwner) {
        const actions = make('div', 'project-progress-aside-task-actions')
        const editButton = make('button', 'project-progress-aside-task-action', 'Edit')
        editButton.type = 'button'
        editButton.addEventListener('click', () => {
          close()
          openProjectTaskModal(project, projectTask)
        })
        const deleteButton = make('button', 'project-progress-aside-task-action is-danger', 'Delete')
        deleteButton.type = 'button'
        deleteButton.addEventListener('click', async () => {
          const confirmed = await showDashboardConfirmation({
            title: 'Delete project task?',
            message: `Delete "${projectTask.title}" from ${project.name}?`,
            confirmText: 'Delete task',
            danger: true
          })
          if (!confirmed) return
          const restoreButton = setDashboardButtonLoading(deleteButton, 'Deleting…')
          try {
            await api.delete(
              `/projects/${encodeURIComponent(project.projectId)}/tasks/${encodeURIComponent(projectTask.taskId)}`
            )
            const taskIndex = tasks.findIndex(candidate =>
              candidate.backendPersistent && candidate.taskId === projectTask.taskId
            )
            if (taskIndex >= 0) tasks.splice(taskIndex, 1)
            hub.renderTasks?.()
            hub.renderWorkspaceSummary?.()
            await hub.renderAdminTasksTable?.()
              await hub.renderTasks?.()
            showDashboardToast('Project task deleted.', 'success')
            close()
            openProjectProgressAside(task)
          } catch (error) {
            restoreButton()
            showDashboardToast(error.message || 'The project task could not be deleted.', 'error')
          }
        })
        actions.append(editButton, deleteButton)
        taskRow.append(actions)
      }
      if (
        canManageProjectTask &&
        projectTask.status !== 'Done'
      ) {
        const completeTaskButton = make(
          'button',
          'project-progress-aside-task-complete',
          taskMovementLocked ? 'Locked until sprints complete' : 'Complete task'
        )
        completeTaskButton.type = 'button'
        completeTaskButton.disabled = taskMovementLocked
        if (taskMovementLocked) {
          completeTaskButton.title = 'Complete every project sprint before moving this in-progress task.'
        }
        completeTaskButton.addEventListener('click', async () => {
          if (taskMovementLocked) return
          const restoreButton = setDashboardButtonLoading(completeTaskButton, 'Saving…')
          try {
            await api.patch(
              `/projects/${encodeURIComponent(project.projectId)}/tasks/${encodeURIComponent(projectTask.taskId)}/status`,
              { status: 'Done' }
            )
            projectTask.status = 'Done'
            projectTask.done = true
            projectTask.progress = 100
            hub.renderTasks?.()
            hub.renderWorkspaceSummary?.()
            addAuditLog('Task completed', `${currentUser.name} completed "${projectTask.title}".`, 'check')
            showDashboardToast(`"${projectTask.title}" marked as done.`, 'success')
            close()
          } catch (error) {
            restoreButton()
            showDashboardToast(error.message || 'The task could not be completed.', 'error')
          }
        })
        taskRow.append(completeTaskButton)
      }
      taskList.append(taskRow)
    })
    if (!projectTasks.some(projectTask => projectTask.taskId === task.taskId)) {
      taskSection.append(focusSection)
    }
  }
  taskSection.append(taskList)
  content.append(taskSection)
  aside.append(content)

  const trigger = document.activeElement
  const close = () => {
    document.removeEventListener('keydown', onKeyDown)
    commentMedia.dispose()
    backdrop.remove()
    trigger?.focus?.()
  }
  const onKeyDown = event => {
    if (event.key === 'Escape') close()
  }
  closeButton.addEventListener('click', close)
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) close()
  })
  document.addEventListener('keydown', onKeyDown)
  backdrop.append(aside)
  root.replaceChildren(backdrop)
  closeButton.focus()
}

export function openProjectTaskDetails(taskId) {
  const task = tasks.find(candidate =>
    candidate.backendPersistent && candidate.taskId === taskId
  )
  if (!task) {
    showDashboardToast('The linked task could not be found on your project boards.', 'error')
    return
  }
  openProjectProgressAside(task)
}
