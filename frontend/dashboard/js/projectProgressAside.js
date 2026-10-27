import { currentUser, make, projects, tasks, root, addAuditLog, hub, renderAvatarElement } from './state.js'
import { api } from './api.js'
import { openProjectTaskModal } from './admin.js'
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

function sprintLeadName(project, sprint) {
  if (sprint.assigneeName) return sprint.assigneeName
  const member = [
    {
      firebaseUid: project.creatorFirebaseUid,
      name: project.creatorName,
      email: project.creatorEmail
    },
    ...(project.acceptedMembers || [])
  ].find(candidate => candidate.firebaseUid === sprint.assigneeFirebaseUid)
  return member?.name || member?.email || 'No sprint lead'
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
      container.append(make('p', 'project-progress-aside-empty', 'No task comments yet.'))
      return comments
    }
    comments.forEach(comment => {
      const row = make('article', 'task-comment-item')
      const header = make('div', 'task-comment-header')
      header.append(
        make('strong', '', comment.author_name || 'Project member'),
        make('time', '', new Date(comment.created_at).toLocaleString(undefined, {
          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
        }))
      )
      row.append(header)
      if (comment.body) row.append(make('p', 'task-comment-body', comment.body))
      row.append(renderTaskMediaAttachments(comment.attachments || []))
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

  const summary = make('div', 'project-progress-aside-summary')
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

  const focusSection = make('section', 'project-progress-aside-section project-progress-aside-focus')
  const descriptionMediaContainer = make('div', 'task-media-player-list')
  focusSection.append(make('div', 'project-progress-aside-section-heading', 'Task context'))
  if (task.chatMessageId && task.chatConversationId) {
    const discussionButton = make('button', 'project-progress-aside-context-link', 'View Discussion Context')
    discussionButton.type = 'button'
    discussionButton.addEventListener('click', () => {
      close()
      hub.openMessageContext?.({
        conversationId: task.chatConversationId,
        messageId: task.chatMessageId
      })
    })
    focusSection.append(discussionButton)
  }
  if (task.hasDependencyWarning) {
    focusSection.append(make('p', 'task-dependency-warning', 'A predecessor task is blocked or its due date moved later.'))
  }
  focusSection.append(descriptionMediaContainer)
  content.append(focusSection)
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
  }).catch(error => {
    if (aside.isConnected && task.descriptionAttachments?.length) {
      descriptionMediaContainer.replaceChildren(
        make('p', 'project-progress-aside-empty', error.message || 'Task media could not be loaded.')
      )
    }
  })

  const dependencySection = make('section', 'project-progress-aside-section')
  const dependencyHeading = make('div', 'project-progress-aside-section-heading')
  dependencyHeading.append(make('h3', '', 'Dependencies'))
  dependencySection.append(dependencyHeading)
  const dependencySelect = document.createElement('select')
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
  content.append(dependencySection)

  const commentsSection = make('section', 'project-progress-aside-section')
  const commentsHeading = make('div', 'project-progress-aside-section-heading')
  commentsHeading.append(make('h3', '', 'Comments and media'))
  const commentsList = make('div', 'task-comment-list')
  commentsSection.append(commentsHeading, commentsList)
  const commentForm = document.createElement('form')
  commentForm.className = 'task-comment-form'
  const commentInput = document.createElement('textarea')
  commentInput.maxLength = 5000
  commentInput.rows = 2
  commentInput.placeholder = 'Add a comment…'
  commentInput.setAttribute('aria-label', 'Task comment')
  const commentMedia = createTaskMediaEditor({ label: 'Comment media' })
  const commentSubmit = make('button', 'project-progress-aside-context-link', 'Post Comment')
  commentSubmit.type = 'submit'
  commentForm.append(commentInput, commentMedia.element, commentSubmit)
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
    } catch (error) {
      restoreButton()
      showDashboardToast(error.message || 'The comment could not be posted.', 'error')
    }
  })
  commentsSection.append(commentForm)
  content.append(commentsSection)
  void loadTaskComments(project, task, commentsList)

  const sprintSection = make('section', 'project-progress-aside-section')
  sprintSection.setAttribute('aria-labelledby', 'project-progress-aside-sprints-title')
  const sprintHeading = make('div', 'project-progress-aside-section-heading')
  const sprintHeadingTitle = make('h3', '', 'Project sprints')
  sprintHeadingTitle.id = 'project-progress-aside-sprints-title'
  sprintHeading.append(sprintHeadingTitle, make('span', 'project-progress-aside-count', String(sprints.length)))
  sprintSection.append(sprintHeading)
  const sprintList = make('div', 'project-sprint-list project-progress-aside-sprints')
  sprints.forEach(sprint => {
    const sprintStatus = sprint.status || 'Upcoming'
    const row = make('div', 'project-sprint-chip project-progress-aside-sprint')
    row.append(
      make('strong', '', sprint.name || 'Untitled sprint'),
      make('small', '', sprintStatus),
      make('small', 'project-sprint-assignee', `Assigned to ${sprintLeadName(project, sprint)}`)
    )
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

  const memberSection = make('section', 'project-progress-aside-section')
  memberSection.setAttribute('aria-labelledby', 'project-progress-aside-members-title')
  const memberHeading = make('div', 'project-progress-aside-section-heading')
  const memberHeadingTitle = make('h3', '', 'Accepted project invitees')
  memberHeadingTitle.id = 'project-progress-aside-members-title'
  memberHeading.append(
    memberHeadingTitle,
    make('span', 'project-progress-aside-count', String(acceptedMembers.length))
  )
  memberSection.append(memberHeading)
  const memberList = make('div', 'project-progress-aside-members')
  if (!acceptedMembers.length) {
    memberList.append(make('p', 'project-progress-aside-empty', 'No accepted invitees yet.'))
  } else {
    acceptedMembers.forEach(member => {
      const memberRow = make('div', 'project-progress-aside-member')
      const avatar = make('span')
      renderAvatarElement(avatar, member, 'project-progress-aside-avatar')
      const memberDetails = make('span', 'project-progress-aside-member-details')
      memberDetails.append(
        make('strong', '', member.name || member.email || 'Project member'),
        make('small', '', member.role || member.email || 'Accepted invitee')
      )
      memberRow.append(avatar, memberDetails)
      memberList.append(memberRow)
    })
  }
  memberSection.append(memberList)
  content.append(memberSection)

  const taskSection = make('section', 'project-progress-aside-section')
  taskSection.setAttribute('aria-labelledby', 'project-progress-aside-tasks-title')
  const taskHeading = make('div', 'project-progress-aside-section-heading')
  const taskHeadingTitle = make('h3', '', 'Tasks')
  taskHeadingTitle.id = 'project-progress-aside-tasks-title'
  taskHeading.append(taskHeadingTitle, make('span', 'project-progress-aside-count', String(projectTasks.length)))
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
        currentUid &&
        projectTask.assigneeFirebaseUid === currentUid &&
        projectTask.status !== 'Done'
      ) {
        const completeTaskButton = make('button', 'project-progress-aside-task-complete', 'Complete task')
        completeTaskButton.type = 'button'
        completeTaskButton.addEventListener('click', async () => {
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
