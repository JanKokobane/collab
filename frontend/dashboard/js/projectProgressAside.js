import { currentUser, make, projects, tasks, root, addAuditLog, hub, renderAvatarElement } from './state.js'
import { api } from './api.js'
import { openProjectTaskModal } from './admin.js?v=20261028-project-overview'
import { createTaskMediaEditor, renderTaskMediaAttachments } from './taskMedia.js?v=20261105-review-400-fix'
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
  const taskStatus = task => String(task.status || '').trim().toLowerCase()
  const sprintStatus = sprint => String(sprint.status || '').trim().toLowerCase()
  const activeTasks = projectTasks.filter(task => taskStatus(task) !== 'done')
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
  const blocked = activeTasks.filter(task => taskStatus(task) === 'blocked').length
  const dependencyRisks = activeTasks.filter(task =>
    task.hasDependencyWarning ||
    task.dependencies?.some(dependency => dependency.warning_reason)
  ).length
  const pendingReview = sprints.filter(sprint => sprintStatus(sprint) === 'pending review').length
  const sprintStatusBreakdown = [
    { label: 'Completed', count: sprints.filter(sprint => sprintStatus(sprint) === 'completed').length, tone: 'is-done' },
    { label: 'Active', count: sprints.filter(sprint => sprintStatus(sprint) === 'active').length, tone: 'is-progress' },
    { label: 'Pending review', count: pendingReview, tone: 'is-review' },
    { label: 'Changes requested', count: sprints.filter(sprint => sprintStatus(sprint) === 'changes requested').length, tone: 'is-blocked' },
    { label: 'Upcoming', count: sprints.filter(sprint => !sprintStatus(sprint) || sprintStatus(sprint) === 'upcoming').length, tone: 'is-backlog' }
  ]
  const knownSprintStatuses = new Set(['completed', 'active', 'pending review', 'changes requested', 'upcoming'])
  const otherSprintStatusCount = sprints.filter(sprint =>
    sprintStatus(sprint) && !knownSprintStatuses.has(sprintStatus(sprint))
  ).length
  if (otherSprintStatusCount) {
    sprintStatusBreakdown.push({ label: 'Other', count: otherSprintStatusCount, tone: 'is-backlog' })
  }
  const taskStatusBreakdown = [
    { label: 'To do', count: projectTasks.filter(task => taskStatus(task) === 'to do').length, tone: 'is-todo' },
    { label: 'In progress', count: projectTasks.filter(task => taskStatus(task) === 'in progress').length, tone: 'is-progress' },
    { label: 'Blocked', count: blocked, tone: 'is-blocked' },
    { label: 'Done', count: completed, tone: 'is-done' },
    { label: 'Backlog', count: projectTasks.filter(task => task.status === 'Backlog').length, tone: 'is-backlog' }
  ]
  const knownTaskStatuses = new Set(['to do', 'in progress', 'blocked', 'done', 'backlog'])
  const otherStatusCount = projectTasks.filter(task => !knownTaskStatuses.has(taskStatus(task))).length
  if (otherStatusCount) {
    taskStatusBreakdown.push({ label: 'Other', count: otherStatusCount, tone: 'is-backlog' })
  }
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
  const workload = new Map()
  activeTasks.forEach(task => {
    const identity = task.assigneeFirebaseUid || task.assignee_email || task.assigneeName || 'unassigned'
    const name = identity === 'unassigned'
      ? 'Unassigned'
      : task.assigneeName || task.assignee_email || 'Assigned teammate'
    const entry = workload.get(identity) || { label: name, count: 0 }
    entry.count += 1
    workload.set(identity, entry)
  })
  const sprintNames = new Set(sprints.map(sprint => String(sprint.name || '').trim()).filter(Boolean))
  const sprintProgress = sprints.map(sprint => {
    const sprintName = String(sprint.name || '').trim()
    const sprintTasks = sprintName
      ? projectTasks.filter(task => String(task.sprint_name || '').trim() === sprintName)
      : []
    const done = sprintTasks.filter(task => taskStatus(task) === 'done').length
    return {
      label: sprintName || 'Untitled sprint',
      status: sprint.status || 'Upcoming',
      count: sprintTasks.length,
      done,
      completion: sprintTasks.length ? Math.round((done / sprintTasks.length) * 100) : 0
    }
  })
  const noSprintTasks = projectTasks.filter(task =>
    !sprintNames.has(String(task.sprint_name || '').trim())
  )
  if (noSprintTasks.length) {
    const done = noSprintTasks.filter(task => taskStatus(task) === 'done').length
    sprintProgress.push({
      label: 'No sprint assigned',
      status: 'Unassigned',
      count: noSprintTasks.length,
      done,
      completion: Math.round((done / noSprintTasks.length) * 100)
    })
  }
  const workloadItems = [...workload.values()].sort((a, b) => b.count - a.count)
  const completion = projectTasks.length
    ? Math.round((completed / projectTasks.length) * 100)
    : 0

  return {
    completed,
    blocked,
    dependencyRisks,
    overdue,
    dueSoon,
    pendingReview,
    sprintCount: sprints.length,
    completion,
    taskStatusBreakdown,
    sprintStatusBreakdown,
    scheduleBreakdown,
    sprintProgress,
    workload: workloadItems
  }
}

function renderDeliveryIndicators(analysis, totalTasks, openTasks, totalSprints) {
  const items = [
    {
      label: 'Tasks complete',
      count: analysis.completed,
      total: totalTasks,
      totalLabel: 'project tasks',
      tone: 'is-done',
      chartValue: analysis.completion,
      valueLabel: `${analysis.completed} · ${analysis.completion}%`
    },
    { label: 'Blocked', count: analysis.blocked, total: openTasks, totalLabel: 'open tasks', tone: 'is-blocked' },
    { label: 'Dependency risk', count: analysis.dependencyRisks, total: openTasks, totalLabel: 'open tasks', tone: 'is-review' },
    { label: 'Overdue', count: analysis.overdue, total: openTasks, totalLabel: 'open tasks', tone: 'is-blocked' },
    { label: 'Due in 7 days', count: analysis.dueSoon, total: openTasks, totalLabel: 'open tasks', tone: 'is-upcoming' },
    { label: 'Awaiting review', count: analysis.pendingReview, total: totalSprints, totalLabel: 'project sprints', tone: 'is-review' }
  ]
  items.slice(1).forEach(item => {
    const percent = item.total ? Math.round((item.count / item.total) * 100) : 0
    item.chartValue = percent
    item.valueLabel = `${item.count} · ${percent}%`
    item.note = item.total
      ? `${item.count} of ${item.total} ${item.totalLabel}`
      : item.totalLabel === 'project sprints'
        ? 'No project sprints'
        : 'No open tasks'
  })
  items[0].note = totalTasks
    ? `${analysis.completed} of ${totalTasks} project tasks`
    : 'No project tasks'
  return renderProgressBars(
    'Delivery indicators',
    "Share of this project's tasks and sprints in each delivery state",
    items,
    'is-delivery-indicators',
    'percent',
    'Add project tasks and sprints to see delivery indicators.'
  )
}

function renderStatusDonut(items, options = {}) {
  const {
    title = 'Task status mix',
    subtitle = 'Current project tasks',
    centerLabel = 'complete',
    centerValue = '',
    ariaLabel = title
  } = options
  const chart = make('section', 'project-progress-chart project-progress-status-chart')
  chart.setAttribute('aria-label', ariaLabel)
  const heading = make('div', 'project-progress-chart-heading')
  const titleCopy = make('div', 'project-progress-chart-title')
  titleCopy.append(make('h4', '', title), make('small', '', subtitle))
  heading.append(titleCopy)
  chart.append(heading)
  const total = items.reduce((sum, item) => sum + item.count, 0)
  if (!total) {
    chart.append(make(
      'p',
      'project-progress-chart-empty',
      title === 'Project sprint status'
        ? 'Create sprints to view their delivery stages.'
        : 'Add tasks to view the status mix.'
    ))
    return chart
  }

  const body = make('div', 'project-progress-donut-layout')
  const svgNs = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(svgNs, 'svg')
  svg.setAttribute('viewBox', '0 0 120 120')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', ariaLabel)
  const track = document.createElementNS(svgNs, 'circle')
  track.setAttribute('cx', '60')
  track.setAttribute('cy', '60')
  track.setAttribute('r', '46')
  track.setAttribute('class', 'project-progress-donut-track')
  svg.append(track)
  const circumference = 2 * Math.PI * 46
  let offset = 0
  items.forEach(item => {
    if (!item.count) return
    const segment = document.createElementNS(svgNs, 'circle')
    const segmentLength = (item.count / total) * circumference
    segment.setAttribute('cx', '60')
    segment.setAttribute('cy', '60')
    segment.setAttribute('r', '46')
    segment.setAttribute('class', `project-progress-donut-segment ${item.tone}`)
    segment.setAttribute('stroke-dasharray', `${segmentLength} ${circumference - segmentLength}`)
    segment.setAttribute('stroke-dashoffset', String(-offset))
    segment.setAttribute('transform', 'rotate(-90 60 60)')
    segment.setAttribute('aria-label', `${item.label}: ${item.count}`)
    offset += segmentLength
    svg.append(segment)
  })
  const center = make('div', 'project-progress-donut-center')
  center.append(make('strong', '', centerValue || String(total)), make('small', '', centerLabel))
  const ring = make('div', 'project-progress-donut')
  ring.append(svg, center)
  const legend = make('div', 'project-progress-donut-legend')
  items.forEach(item => {
    const row = make('div', 'project-progress-donut-legend-item')
    row.append(
      make('span', `project-progress-legend-dot ${item.tone}`),
      make('span', 'project-progress-legend-label', item.label),
      make('strong', '', `${item.count} · ${Math.round((item.count / total) * 100)}%`)
    )
    legend.append(row)
  })
  body.append(ring, legend)
  chart.append(body)
  return chart
}

function renderProgressBars(
  title,
  subtitle,
  items,
  className,
  scale = 'max',
  emptyMessage = 'No data to display yet.'
) {
  const chart = make('section', `project-progress-chart ${className}`)
  const heading = make('div', 'project-progress-chart-title')
  heading.append(make('h4', '', title), make('small', '', subtitle))
  chart.append(heading)
  if (
    !items.length ||
    (!items.some(item => item.count > 0) && !items.some(item => item.completion !== undefined))
  ) {
    chart.append(make('p', 'project-progress-chart-empty', emptyMessage))
    return chart
  }

  const totalCount = items.reduce((sum, item) => sum + item.count, 0)
  const max = scale === 'percent' || scale === 'total'
    ? 100
    : Math.max(...items.map(item => item.count), 1)
  const isSprintCompletion = items.some(item => item.completion !== undefined)
  const axis = make('div', 'project-progress-column-axis')
  const axisValues = scale === 'percent' || scale === 'total'
    ? [100, 75, 50, 25, 0].map(value => `${value}%`)
    : max <= 3
      ? Array.from({ length: max + 1 }, (_, index) => String(max - index))
      : [max, .75, .5, .25, 0].map(value =>
          String(typeof value === 'number' && value <= 1
            ? Math.round(max * value)
            : value)
        )
  axisValues.forEach(value => {
    const tick = make('span', '', value)
    axis.append(tick)
  })

  const plot = make('div', 'project-progress-column-plot')
  plot.style.setProperty('--column-count', String(items.length))
  items.forEach(item => {
    const group = make('div', 'project-progress-column-group')
    group.setAttribute('role', 'img')
    group.setAttribute('aria-label', item.completion !== undefined
      ? `${item.label}: ${item.done} of ${item.count} tasks complete, ${item.completion}%`
      : `${item.label}: ${item.count}${item.note ? `, ${item.note}` : ''}`)
    const bars = make('div', 'project-progress-column-bars')
    const values = item.completion !== undefined
      ? [
          { value: item.count, label: String(item.count), tone: 'is-planned' },
          { value: item.done, label: String(item.done), tone: 'is-done' }
        ]
      : [{
          value: item.chartValue ?? (scale === 'total'
            ? (totalCount ? (item.count / totalCount) * 100 : 0)
            : item.count),
          label: item.valueLabel || String(item.count),
          tone: item.tone || 'is-progress'
        }]
    values.forEach(barData => {
      const bar = make('div', `project-progress-column-bar ${barData.tone}`)
      const barValue = make('small', 'project-progress-column-value', barData.label)
      const fill = make('span', 'project-progress-column-fill')
      const height = scale === 'total' && item.completion === undefined
        ? barData.value
        : max ? (barData.value / max) * 100 : 0
      bar.style.height = `${Math.max(height, 1)}%`
      fill.style.height = '100%'
      bar.append(barValue, fill)
      bars.append(bar)
    })
    const label = make('span', 'project-progress-column-label', item.label)
    group.append(bars, label)
    if (item.note || item.status) {
      group.append(make('small', 'project-progress-column-status', item.note || item.status))
    }
    plot.append(group)
  })

  const graph = make('div', 'project-progress-column-graph')
  graph.append(axis, plot)
  chart.append(graph)
  if (isSprintCompletion) {
    const legend = make('div', 'project-progress-column-legend')
    legend.append(
      make('span', '', 'Total tasks'),
      make('span', '', 'Completed tasks')
    )
    legend.children[0].classList.add('is-planned')
    legend.children[1].classList.add('is-done')
    chart.append(legend)
  }
  return chart
}

function downloadProjectAnalysis(project, projectTasks, analysis) {
  const escapeCsv = value => {
    const text = String(value ?? '')
    const spreadsheetSafe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
    return `"${spreadsheetSafe.replaceAll('"', '""')}"`
  }
  const rows = [
    ['Project', project.name],
    ['Generated', new Date().toLocaleString()],
    ['Completion', `${analysis.completion}%`],
    ['Tasks completed', `${analysis.completed}/${projectTasks.length}`],
    ['Open tasks', projectTasks.length - analysis.completed],
    ['Blocked tasks', analysis.blocked],
    ['Dependency risks', analysis.dependencyRisks],
    ['Overdue tasks', analysis.overdue],
    ['Due in 7 days', analysis.dueSoon],
    ['Sprints', analysis.sprintCount],
    [],
    ['Sprint status', 'Count'],
    ...analysis.sprintStatusBreakdown.map(item => [item.label, item.count]),
    [],
    ['Schedule outlook', 'Open tasks'],
    ...analysis.scheduleBreakdown.map(item => [item.label, item.count]),
    [],
    ['Open workload by assignee', 'Open tasks'],
    ...analysis.workload.map(item => [item.label, item.count]),
    [],
    ['Task', 'Status', 'Assignee', 'Sprint', 'Due date', 'Dependency warning'],
    ...projectTasks.map(task => [
      task.title,
      task.status,
      task.assigneeName || task.assignee_email || 'Unassigned',
      task.sprint_name || '',
      task.due_date || '',
      task.hasDependencyWarning || task.dependencies?.some(dependency => dependency.warning_reason)
        ? 'Yes'
        : 'No'
    ]),
    [],
    ['Sprint', 'Status', 'Tasks', 'Completed tasks', 'Completion'],
    ...analysis.sprintProgress.map(sprint => [
      sprint.label,
      sprint.status,
      sprint.count,
      sprint.done,
      `${sprint.completion}%`
    ])
  ]
  const csv = rows.map(row => row.map(escapeCsv).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${String(project.name || 'project').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'project'}-production-report.csv`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
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

function openSprintAttachmentPreview(attachment, trigger) {
  const backdrop = make('div', 'project-comment-media-preview-backdrop')
  backdrop.classList.add('is-sprint-attachment-preview')
  const dialog = make('div', 'project-comment-media-preview project-sprint-attachment-preview')
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', `${attachment.fileName || 'Sprint attachment'} preview`)
  const heading = make('strong', 'project-sprint-attachment-preview-title', attachment.fileName || 'Sprint attachment')
  const closeButton = make('button', 'project-comment-media-preview-close', '×')
  closeButton.type = 'button'
  closeButton.setAttribute('aria-label', 'Close attachment preview')

  let preview
  if (attachment.mediaType?.startsWith('image/')) {
    preview = make('img', 'project-comment-media-preview-image')
    preview.alt = attachment.fileName || 'Sprint submission image'
  } else if (attachment.mediaType?.startsWith('video/')) {
    preview = make('video', 'project-comment-media-preview-video')
    preview.controls = true
    preview.preload = 'metadata'
  } else if (attachment.mediaType?.startsWith('audio/')) {
    preview = make('audio', 'project-sprint-attachment-preview-audio')
    preview.controls = true
    preview.preload = 'metadata'
  } else {
    preview = make('iframe', 'project-sprint-attachment-preview-document')
    preview.title = attachment.fileName || 'Sprint document preview'
    preview.setAttribute('sandbox', '')
  }
  preview.src = attachment.data

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
  dialog.append(heading, closeButton, preview)
  backdrop.append(dialog)
  document.body.append(backdrop)
  document.addEventListener('keydown', onKeyDown)
  closeButton.focus()
}

function renderSprintSubmissionAttachments(attachments) {
  const list = make('div', 'project-sprint-submission-files')
  attachments.forEach(attachment => {
    const data = attachment?.data || attachment?.dataUrl || attachment?.url
    const mediaType = attachment?.mediaType || attachment?.mimeType || attachment?.type
    if (typeof data !== 'string' || typeof mediaType !== 'string') return
    const fileName = attachment.fileName || attachment.name || 'Sprint attachment'
    const size = Number(attachment.size) || 0
    const row = make('div', 'project-sprint-submission-file')
    const iconType = mediaType === 'application/pdf'
      ? 'pdf'
      : mediaType.startsWith('image/')
        ? 'image'
        : mediaType.startsWith('audio/')
          ? 'audio'
          : mediaType.startsWith('video/')
            ? 'video'
            : 'file'
    const iconText = {
      pdf: 'PDF',
      image: 'IMG',
      audio: '♪',
      video: '▶',
      file: 'FILE'
    }[iconType]
    const icon = make('span', `project-sprint-submission-file-icon is-${iconType}`, iconText)
    icon.setAttribute('aria-hidden', 'true')
    const details = make('span', 'project-sprint-submission-file-details')
    details.append(
      make('strong', 'project-sprint-submission-file-name', fileName),
      make('small', 'project-sprint-submission-file-size', `${Math.max(1, Math.round(size / 1024))} KB`)
    )
    const actions = make('span', 'project-sprint-submission-file-actions')
    if (!mediaType.startsWith('audio/')) {
      const viewButton = make('button', 'project-sprint-submission-file-view', 'View')
      viewButton.type = 'button'
      viewButton.addEventListener('click', () => openSprintAttachmentPreview({
        ...attachment,
        data,
        mediaType,
        fileName
      }, viewButton))
      actions.append(viewButton)
    }
    const downloadLink = make('a', 'project-sprint-submission-file-download', 'Download')
    downloadLink.href = data
    downloadLink.download = fileName
    actions.append(downloadLink)
    row.append(icon, details, actions)
    if (mediaType.startsWith('audio/')) {
      const audioPlayer = make('audio', 'project-sprint-submission-audio')
      audioPlayer.controls = true
      audioPlayer.preload = 'metadata'
      audioPlayer.src = data
      audioPlayer.setAttribute('aria-label', fileName)
      row.append(audioPlayer)
    }
    list.append(row)
  })
  return list
}

function sprintSubmissionContent(sprint) {
  const submission = sprint.submission && typeof sprint.submission === 'object'
    ? sprint.submission
    : {}
  const content = sprint.content && typeof sprint.content === 'object'
    ? sprint.content
    : {}
  const firstText = (...values) => values.find(value =>
    typeof value === 'string' && value.trim()
  )?.trim() || ''
  const attachmentSources = [
    sprint.submissionAttachments,
    sprint.submission_attachments,
    sprint.submissionMedia,
    sprint.submission_media,
    sprint.attachments,
    submission.attachments,
    submission.media,
    content.attachments,
    content.media
  ].filter(Array.isArray)
  const attachmentsByKey = new Map()
  attachmentSources.flat().forEach(attachment => {
    if (!attachment || typeof attachment !== 'object') return
    const key = [
      attachment.fileName || attachment.name || '',
      attachment.data || attachment.dataUrl || attachment.url || ''
    ].join(':')
    if (!attachmentsByKey.has(key)) attachmentsByKey.set(key, attachment)
  })
  const notes = [
    sprint.submissionNote,
    sprint.submission_note,
    typeof sprint.submission === 'string' ? sprint.submission : '',
    sprint.completionNote,
    sprint.completion_note,
    sprint.notes,
    sprint.note,
    sprint.text,
    typeof sprint.content === 'string' ? sprint.content : '',
    submission.note,
    submission.text,
    content.note,
    content.text,
    content.notes
  ].flatMap(value => Array.isArray(value) ? value : [value])
    .filter(value => typeof value === 'string' && value.trim())
    .map(value => value.trim())
  const uniqueNotes = [...new Set(notes)]

  return {
    notes: uniqueNotes,
    attachments: [...attachmentsByKey.values()],
    feedback: firstText(
      sprint.reviewComment,
      sprint.review_comment,
      sprint.ownerFeedback,
      sprint.owner_feedback,
      sprint.feedback,
      submission.reviewComment,
      submission.feedback,
      content.reviewComment,
      content.feedback
    ),
    reviewAttachments: [
      sprint.reviewAttachments,
      sprint.review_attachments,
      submission.reviewAttachments,
      submission.review_attachments,
      content.reviewAttachments,
      content.review_attachments
    ].filter(Array.isArray).flat(),
    submittedBy: firstText(
      sprint.submittedByName,
      sprint.submitted_by_name,
      submission.submittedByName,
      submission.submitted_by_name,
      content.submittedByName
    ),
    submittedAt: sprint.submittedAt || sprint.submitted_at || submission.submittedAt ||
      submission.submitted_at || content.submittedAt || '',
    reviewedBy: firstText(
      sprint.reviewedByName,
      sprint.reviewed_by_name,
      submission.reviewedByName,
      submission.reviewed_by_name,
      content.reviewedByName
    ),
    reviewedAt: sprint.reviewedAt || sprint.reviewed_at || submission.reviewedAt ||
      submission.reviewed_at || content.reviewedAt || ''
  }
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
  const header = make('header', 'project-progress-aside-header')
  const brand = make('a', 'project-progress-aside-brand')
  brand.href = '../index.html'
  brand.setAttribute('aria-label', 'Collab home')
  const logo = make('img', 'project-progress-aside-logo')
  logo.src = '../images/logo.png'
  logo.alt = 'Collab'
  brand.append(logo)
  const headerCopy = make('div')
  headerCopy.className = 'project-progress-aside-header-copy'
  headerCopy.append(title)
  header.append(brand, headerCopy, closeButton)
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
  const analysisHeadingCopy = make('div', 'project-progress-analysis-heading-copy')
  analysisHeadingCopy.append(
    make('h3', '', 'Production analysis'),
    make('small', '', 'Live task, sprint, workload, and schedule analytics')
  )
  analysisHeading.append(analysisHeadingCopy)
  const analysisActions = make('div', 'project-progress-analysis-actions')
  const downloadReport = make('button', 'project-progress-report-download', 'Download report')
  downloadReport.type = 'button'
  downloadReport.addEventListener('click', () => {
    try {
      downloadProjectAnalysis(project, projectTasks, analysis)
    } catch (error) {
      showDashboardToast(error.message || 'The production report could not be downloaded.', 'error')
    }
  })
  analysisActions.append(downloadReport)
  analysisHeading.append(analysisActions)
  const openTasks = projectTasks.filter(task =>
    String(task.status || '').trim().toLowerCase() !== 'done'
  ).length
  const charts = make('div', 'project-progress-analysis-charts')
  charts.append(
    renderDeliveryIndicators(analysis, projectTasks.length, openTasks, sprints.length),
    renderStatusDonut(analysis.taskStatusBreakdown, {
      title: 'Task status mix',
      subtitle: `${projectTasks.length} total project tasks`,
      centerValue: `${analysis.completion}%`,
      centerLabel: 'complete',
      ariaLabel: `${analysis.completion}% complete across ${projectTasks.length} project tasks`
    }),
    renderStatusDonut(analysis.sprintStatusBreakdown, {
      title: 'Project sprint status',
      subtitle: `${sprints.length} total project sprints`,
      centerValue: String(sprints.length),
      centerLabel: 'sprints',
      ariaLabel: `${sprints.length} project sprints by delivery status`
    }),
    renderProgressBars(
      'Sprint delivery',
      `${projectTasks.length} total project tasks · grouped by sprint assignment`,
      analysis.sprintProgress.map(sprint => ({
        label: sprint.label,
        status: sprint.status,
        count: sprint.count,
        done: sprint.done,
        completion: sprint.completion,
        tone: 'is-done'
      })),
      'is-sprint-progress',
      'max',
      'Add tasks to sprints to see delivery progress.'
    ),
    renderProgressBars(
      'Schedule outlook',
      `${openTasks} open tasks grouped by due date`,
      analysis.scheduleBreakdown,
      'is-schedule',
      'total',
      'No open tasks to analyze.'
    ),
    renderProgressBars(
      'Open work by assignee',
      `${openTasks} open tasks grouped by assignee`,
      analysis.workload.map(item => ({
        ...item,
        tone: item.label === 'Unassigned' ? 'is-blocked' : 'is-progress'
      })),
      'is-workload',
      'max',
      'No open work to compare.'
    )
  )
  analysisSection.append(
    analysisHeading,
    charts
  )
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
  const submissionMediaEditors = []
  sprints.forEach((sprint, sprintIndex) => {
    const sprintStatus = sprint.status || 'Upcoming'
    const row = make('div', 'project-sprint-chip project-progress-aside-sprint')
    row.setAttribute('aria-label', `${sprint.name || 'Untitled sprint'}: ${sprintStatus}`)
    const sprintTop = make('span', 'project-sprint-card-top')
    sprintTop.append(make('strong', 'project-sprint-card-name', sprint.name || 'Untitled sprint'))
    const normalizedStatus = String(sprintStatus).toLowerCase().replaceAll(' ', '-')
    sprintTop.append(make('span', `project-sprint-status is-${normalizedStatus}`, sprintStatus))
    const sprintLead = sprintLeadMember(project, sprint)
    const lead = sprintLead || (sprint.assigneeName
      ? { name: sprint.assigneeName, firebaseUid: sprint.assigneeFirebaseUid }
      : null)
    const leadRow = make('span', 'project-sprint-card-lead')
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
    const detailsId = `project-sprint-details-${sprintIndex}`
    const toggle = make('button', 'project-sprint-card-toggle')
    toggle.type = 'button'
    toggle.setAttribute('aria-expanded', 'false')
    toggle.setAttribute('aria-controls', detailsId)
    toggle.append(sprintTop)
    if (sprintDates) toggle.append(make('small', 'project-sprint-card-dates', sprintDates))
    toggle.append(
      progressSummary,
      make('span', 'project-sprint-card-toggle-label', 'View sprint details'),
      make('span', 'project-sprint-card-toggle-icon', '⌄')
    )
    const details = make('div', 'project-sprint-card-details')
    details.id = detailsId
    details.hidden = true
    details.setAttribute('role', 'region')
    details.setAttribute('aria-labelledby', `${detailsId}-toggle`)
    toggle.id = `${detailsId}-toggle`
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true'
      toggle.setAttribute('aria-expanded', String(!expanded))
      details.hidden = expanded
      row.classList.toggle('is-expanded', !expanded)
      toggle.querySelector('.project-sprint-card-toggle-label').textContent =
        expanded ? 'View sprint details' : 'Hide sprint details'
    })
    row.append(toggle, details)
    const sprintDescriptions = [
      sprint.description,
      sprint.details,
      sprint.goal,
      sprint.objective,
      sprint.summary
    ].filter(value => typeof value === 'string' && value.trim())
      .map(value => value.trim())
    const uniqueDescriptions = [...new Set(sprintDescriptions)]
    if (uniqueDescriptions.length) {
      const description = make('div', 'project-sprint-card-descriptions')
      uniqueDescriptions.forEach(text => {
        description.append(make('p', 'project-sprint-card-description', text))
      })
      details.append(description)
    }
    details.append(progress)
    const submission = sprintSubmissionContent(sprint)
    if (submission.notes.length) {
      const submissionNote = make('div', 'project-sprint-submission-note')
      submissionNote.append(make('strong', 'project-sprint-card-section-label', 'Sprint notes'))
      submission.notes.forEach(note => submissionNote.append(make('p', '', note)))
      details.append(submissionNote)
    }
    if (submission.attachments.length) {
      const attachmentList = renderSprintSubmissionAttachments(submission.attachments)
      if (attachmentList.childElementCount) {
        const submissionMedia = make('div', 'project-sprint-submission-media')
        submissionMedia.append(make('strong', 'project-sprint-submission-media-title', 'Submission attachments'))
        submissionMedia.append(attachmentList)
        details.append(submissionMedia)
      }
    }
    if (submission.submittedBy || submission.submittedAt) {
      const submittedMetadata = make('small', 'project-sprint-submission-metadata')
      const submittedDate = submission.submittedAt
        ? new Date(submission.submittedAt).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        })
        : ''
      submittedMetadata.textContent = [
        submission.submittedBy ? `Submitted by ${submission.submittedBy}` : '',
        submittedDate
      ].filter(Boolean).join(' · ')
      details.append(submittedMetadata)
    }
    if (submission.feedback) {
      const ownerFeedback = make('div', 'project-sprint-review-comment')
      ownerFeedback.append(
        make('strong', 'project-sprint-card-section-label', 'Owner feedback'),
        make('p', '', submission.feedback)
      )
      const reviewAttachments = renderSprintSubmissionAttachments(submission.reviewAttachments)
      if (reviewAttachments.childElementCount) ownerFeedback.append(reviewAttachments)
      details.append(ownerFeedback)
    } else if (submission.reviewAttachments.length) {
      const ownerFeedback = make('div', 'project-sprint-review-comment')
      ownerFeedback.append(make('strong', 'project-sprint-card-section-label', 'Owner feedback'))
      ownerFeedback.append(renderSprintSubmissionAttachments(submission.reviewAttachments))
      details.append(ownerFeedback)
    }
    if (submission.reviewedBy || submission.reviewedAt) {
      const reviewedDate = submission.reviewedAt
        ? new Date(submission.reviewedAt).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        })
        : ''
      details.append(make(
        'small',
        'project-sprint-submission-metadata',
        [
          submission.reviewedBy ? `Reviewed by ${submission.reviewedBy}` : '',
          reviewedDate
        ].filter(Boolean).join(' · ')
      ))
    }
    if (isProjectOwner) {
      const removeButton = make('button', 'project-sprint-remove', '×')
      removeButton.type = 'button'
      removeButton.setAttribute('aria-label', `Remove ${sprint.name || 'sprint'}`)
      removeButton.title = 'Remove sprint'
      removeButton.addEventListener('click', () => removeProjectSprint(project, sprint, task, removeButton))
      details.append(removeButton)
    }

    if (currentUid && sprint.assigneeFirebaseUid === currentUid &&
      !['Completed', 'Pending Review'].includes(sprint.status)) {
      const submissionForm = document.createElement('form')
      submissionForm.className = 'project-sprint-review-form no-input-icon'
      const submissionInput = document.createElement('textarea')
      submissionInput.rows = 3
      submissionInput.maxLength = 5000
      submissionInput.placeholder = sprint.status === 'Changes Requested'
        ? 'Describe your updates before resubmitting…'
        : 'Summarize the completed sprint work for the project owner…'
      submissionInput.setAttribute('aria-label', `Submission note for ${sprint.name}`)
      const submissionMedia = createTaskMediaEditor({
        label: 'Attach a file or voice note',
        allowScreenRecording: false,
        maxAttachments: 10
      })
      submissionMedia.element.classList.add('project-sprint-submission-editor')
      submissionMediaEditors.push(submissionMedia)
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
      submissionForm.append(submissionInput, submissionMedia.element, submitButton)
      submissionForm.addEventListener('submit', async event => {
        event.preventDefault()
        const submissionNote = submissionInput.value.trim()
        const restoreButton = setDashboardButtonLoading(submitButton, 'Submitting…')
        try {
          const submissionAttachments = await submissionMedia.getAttachments()
          if (!submissionNote && !submissionAttachments.length) {
            restoreButton()
            submissionInput.focus()
            showDashboardToast('Add a submission note or attach a file or voice note.', 'error')
            return
          }
          const response = await api.post(
            `/projects/${encodeURIComponent(project.projectId)}/sprints/${encodeURIComponent(sprint.name)}/submit`,
            { submissionNote, submissionAttachments }
          )
          const savedProject = response?.data?.project
          if (response?.success !== true || !Array.isArray(savedProject?.sprints)) {
            throw new Error(response?.message || 'The server did not confirm that the sprint submission was saved.')
          }
          project.sprints = savedProject.sprints
          hub.renderTasks?.()
          addAuditLog(
            isProjectOwner ? 'Sprint completed' : 'Sprint submitted for review',
            `${currentUser.name} ${isProjectOwner ? 'completed' : 'submitted'} "${sprint.name}" in ${project.name}.`,
            isProjectOwner ? 'check' : 'send'
          )
          showDashboardToast(
            response.notificationWarning ||
            (isProjectOwner
              ? `"${sprint.name}" completed.`
              : `"${sprint.name}" submitted to the project owner for review.`),
            response.notificationWarning ? 'error' : 'success'
          )
          close()
          openProjectProgressAside(task)
        } catch (error) {
          restoreButton()
          showDashboardToast(error.message || 'The sprint could not be submitted.', 'error')
        }
      })
      details.append(submissionForm)
    }

    if (isProjectOwner && sprint.status === 'Pending Review') {
      const reviewForm = document.createElement('form')
      reviewForm.className = 'project-sprint-review-form no-input-icon'
      const reviewInput = document.createElement('textarea')
      reviewInput.rows = 3
      reviewInput.maxLength = 5000
      reviewInput.placeholder = 'Add optional feedback for the sprint lead…'
      reviewInput.setAttribute('aria-label', `Review comment for ${sprint.name}`)
      const reviewMedia = createTaskMediaEditor({
        label: 'Attach feedback file or voice note',
        allowScreenRecording: false,
        maxAttachments: 10
      })
      reviewMedia.element.classList.add('project-sprint-submission-editor')
      submissionMediaEditors.push(reviewMedia)
      const actions = make('div', 'project-sprint-review-actions')
      const acceptButton = make('button', 'project-progress-aside-complete', 'Accept submission')
      acceptButton.type = 'button'
      const changesButton = make('button', 'project-sprint-request-changes', 'Request changes')
      changesButton.type = 'submit'
      actions.append(acceptButton, changesButton)
      reviewForm.append(reviewInput, reviewMedia.element, actions)

      const submitReview = async (decision, button) => {
        const comment = reviewInput.value.trim()
        const restoreButton = setDashboardButtonLoading(button, decision === 'accept' ? 'Accepting…' : 'Sending…')
        try {
          const reviewAttachments = await reviewMedia.getAttachments()
          if (decision === 'request_changes' && !comment) {
            restoreButton()
            reviewInput.focus()
            showDashboardToast('Add written feedback explaining the requested changes. You can also attach a file or voice note.', 'error')
            return
          }
          const response = await api.post(
            `/projects/${encodeURIComponent(project.projectId)}/sprints/${encodeURIComponent(sprint.name)}/review`,
            {
              decision,
              comment,
              ...(reviewAttachments.length ? { reviewAttachments } : {})
            }
          )
          const savedProject = response?.data?.project
          if (response?.success !== true || !Array.isArray(savedProject?.sprints)) {
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
            response.notificationWarning ||
              (decision === 'accept' ? `"${sprint.name}" accepted and completed.` : `Changes requested for "${sprint.name}".`),
            response.notificationWarning ? 'error' : 'success'
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
      details.append(reviewForm)
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
    submissionMediaEditors.forEach(editor => editor.dispose())
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
