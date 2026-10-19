import { currentUser, make, projects, tasks, root, addAuditLog, hub, renderAvatarElement } from './state.js'
import { api } from './api.js'
import { openProjectTaskModal } from './admin.js'
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
    const row = make('span', 'project-sprint-chip')
    row.append(
      make('strong', '', sprint.name || 'Untitled sprint'),
      make('small', '', sprintStatus),
      make('small', 'project-sprint-assignee', `Assigned to ${sprintLeadName(project, sprint)}`)
    )
    if (isProjectOwner) {
      const removeButton = make('button', 'project-sprint-remove', '×')
      removeButton.type = 'button'
      removeButton.setAttribute('aria-label', `Remove ${sprint.name || 'sprint'}`)
      removeButton.title = 'Remove sprint'
      removeButton.addEventListener('click', () => removeProjectSprint(project, sprint, task, removeButton))
      row.append(removeButton)
    }
    if (
      currentUid &&
      sprint.assigneeFirebaseUid === currentUid &&
      sprint.status !== 'Completed'
    ) {
      const completeButton = make('button', 'project-progress-aside-complete', 'Complete sprint')
      completeButton.type = 'button'
      completeButton.addEventListener('click', async () => {
        const restoreButton = setDashboardButtonLoading(completeButton, 'Saving…')
        try {
          const response = await api.post(
            `/projects/${encodeURIComponent(project.projectId)}/sprints/${encodeURIComponent(sprint.name)}/complete`
          )
          const savedProject = response?.data?.project
          if (!Array.isArray(savedProject?.sprints)) {
            throw new Error('The server did not confirm completing this sprint.')
          }
          project.sprints = savedProject.sprints
          hub.renderTasks?.()
          addAuditLog('Sprint completed', `${currentUser.name} completed "${sprint.name}" in ${project.name}.`, 'check')
          showDashboardToast(`"${sprint.name}" marked as completed.`, 'success')
          close()
          openProjectProgressAside(task)
        } catch (error) {
          restoreButton()
          showDashboardToast(error.message || 'The sprint could not be completed.', 'error')
        }
      })
      row.append(completeButton)
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
