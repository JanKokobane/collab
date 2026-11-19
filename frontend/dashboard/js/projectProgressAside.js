import {
  currentUser,
  getSprintMembers,
  getSprintMemberUids,
  make,
  projects,
  tasks,
  root,
  addAuditLog,
  hub,
  renderAvatarElement
} from './state.js'
import { api } from './api.js'
import {
  createFileTypeIcon,
  createTaskMediaEditor,
  renderTaskMediaAttachments,
  resolveAttachmentMediaType
} from './taskMedia.js?v=20261118-real-file-icons'
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

async function refreshProjectTaskBoard() {
  try {
    await hub.renderAdminTasksTable?.({ silent: true })
  } catch (error) {
    console.error('Project sprint update saved, but project tasks could not be refreshed:', error)
    showDashboardToast('Project sprint update saved, but task status and analytics could not be refreshed.', 'error')
  }
  hub.renderTasks?.()
  hub.renderWorkspaceSummary?.()
}

function pluralize(count, singular, pluralForm = `${singular}s`) {
  return count === 1 ? singular : pluralForm
}

function getProjectSprintMembers(project) {
  return [...new Map((project.sprints || [])
    .flatMap(sprint => getSprintMembers(project, sprint))
    .map(member => [member.firebaseUid || member.email || member.name, member]))
    .values()]
}

function getProductionAnalysis(project, projectTasks, sprints) {
  const taskStatus = task => String(task.status || '').trim().toLowerCase()
  const sprintStatus = sprint => String(sprint.status || '').trim().toLowerCase()
  const taskSubmissionStatus = task => String(
    task.taskSubmissionStatus || task.task_submission_status || ''
  ).trim().toLowerCase()
  const taskPriority = task => String(task.priority || 'medium').trim().toLowerCase()

  const activeTasks = projectTasks.filter(task => taskStatus(task) !== 'done')
  const completed = projectTasks.length - activeTasks.length
  const inProgress = projectTasks.filter(task => taskStatus(task) === 'in progress').length
  const toDo = projectTasks.filter(task => taskStatus(task) === 'to do').length
  const backlog = projectTasks.filter(task => taskStatus(task) === 'backlog').length

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
  const dueLater = activeTasks.filter(task => {
    const dueDate = task.due_date ? String(task.due_date).slice(0, 10) : ''
    return dueDate && dueDate > weekEndKey
  }).length
  const noDueDate = activeTasks.filter(task => !task.due_date).length

  const blocked = activeTasks.filter(task => taskStatus(task) === 'blocked').length
  const dependencyRisks = activeTasks.filter(task =>
    task.hasDependencyWarning ||
    task.dependencies?.some(dependency => dependency.warning_reason)
  ).length
  const pendingSprintReviews = sprints.filter(sprint => sprintStatus(sprint) === 'pending review').length
  const pendingTaskReviews = projectTasks.filter(task => taskSubmissionStatus(task) === 'pending review').length
  const totalPendingReviews = pendingTaskReviews + pendingSprintReviews
  const taskSubmissionStatusBreakdown = [
    { label: 'Not submitted', count: projectTasks.filter(task => !taskSubmissionStatus(task) || taskSubmissionStatus(task) === 'not submitted').length, tone: 'is-backlog' },
    { label: 'Pending review', count: projectTasks.filter(task => taskSubmissionStatus(task) === 'pending review').length, tone: 'is-review' },
    { label: 'Completed', count: projectTasks.filter(task => taskSubmissionStatus(task) === 'completed').length, tone: 'is-done' },
    { label: 'Changes requested', count: projectTasks.filter(task => taskSubmissionStatus(task) === 'changes requested').length, tone: 'is-blocked' }
  ]

  const sprintStatusBreakdown = [
    { label: 'Completed', count: sprints.filter(sprint => sprintStatus(sprint) === 'completed').length, tone: 'is-done' },
    { label: 'Active', count: sprints.filter(sprint => sprintStatus(sprint) === 'active').length, tone: 'is-progress' },
    { label: 'Pending review', count: pendingSprintReviews, tone: 'is-review' },
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
    { label: 'To do', count: toDo, tone: 'is-todo' },
    { label: 'In progress', count: inProgress, tone: 'is-progress' },
    { label: 'Blocked', count: blocked, tone: 'is-blocked' },
    { label: 'Done', count: completed, tone: 'is-done' },
    { label: 'Backlog', count: backlog, tone: 'is-backlog' }
  ]
  const knownTaskStatuses = new Set(['to do', 'in progress', 'blocked', 'done', 'backlog'])
  const otherStatusCount = projectTasks.filter(task => !knownTaskStatuses.has(taskStatus(task))).length
  if (otherStatusCount) {
    taskStatusBreakdown.push({ label: 'Other', count: otherStatusCount, tone: 'is-backlog' })
  }

  const openTaskShare = count => activeTasks.length
    ? `${Math.round((count / activeTasks.length) * 100)}% of open`
    : '0% of open'
  const scheduleBreakdown = [
    { label: 'Overdue', count: overdue, tone: 'is-blocked', note: openTaskShare(overdue) },
    { label: 'Due in 7 days', count: dueSoon, tone: 'is-upcoming', note: openTaskShare(dueSoon) },
    { label: 'Due later', count: dueLater, tone: 'is-progress', note: openTaskShare(dueLater) },
    { label: 'No due date', count: noDueDate, tone: 'is-backlog', note: openTaskShare(noDueDate) }
  ]

  const priorityCounts = {
    high: activeTasks.filter(task => taskPriority(task) === 'high').length,
    medium: activeTasks.filter(task => taskPriority(task) === 'medium').length,
    low: activeTasks.filter(task => taskPriority(task) === 'low').length
  }

  const workload = new Map()
  projectTasks.forEach(task => {
    getProjectSprintMembers(project).forEach(member => {
      const identity = member.firebaseUid || member.email || member.name
      if (!identity) return
      const name = member.name || member.email || 'Sprint member'
      const entry = workload.get(identity) || { label: name, open: 0, done: 0, count: 0 }
      if (taskStatus(task) === 'done') {
        entry.done += 1
      } else {
        entry.open += 1
      }
      entry.count = entry.open + entry.done
      workload.set(identity, entry)
    })
  })
  const workloadItems = [...workload.values()]
    .sort((a, b) => b.open - a.open || b.count - a.count || a.label.localeCompare(b.label))
    .map(item => ({
      ...item,
      completion: item.count ? Math.round((item.done / item.count) * 100) : 0,
      note: `${item.open} open · ${item.done} done`
    }))

  const completion = projectTasks.length
    ? Math.round((completed / projectTasks.length) * 100)
    : 0

  return {
    completed,
    inProgress,
    toDo,
    backlog,
    blocked,
    dependencyRisks,
    overdue,
    dueSoon,
    dueLater,
    noDueDate,
    pendingReview: pendingSprintReviews,
    pendingSprintReviews,
    pendingTaskReviews,
    totalPendingReviews,
    priorityCounts,
    sprintCount: sprints.length,
    completion,
    taskStatusBreakdown,
    sprintStatusBreakdown,
    taskSubmissionStatusBreakdown,
    scheduleBreakdown,
    workload: workloadItems
  }
}

function renderDeliveryIndicators(analysis, totalTasks, totalSprints) {
  const reviewPool = totalTasks + totalSprints
  const items = [
    {
      label: 'Completed',
      count: analysis.completed,
      total: totalTasks,
      tone: 'is-done',
      note: totalTasks ? `${analysis.completed} of ${totalTasks} ${pluralize(totalTasks, 'task')}` : 'No project tasks'
    },
    {
      label: 'In progress',
      count: analysis.inProgress,
      total: totalTasks,
      tone: 'is-progress',
      note: totalTasks
        ? `${analysis.inProgress} of ${totalTasks} ${pluralize(totalTasks, 'task')}`
        : 'No project tasks'
    },
    {
      label: 'Blocked',
      count: analysis.blocked,
      total: totalTasks,
      tone: 'is-blocked',
      note: totalTasks ? `${analysis.blocked} of ${totalTasks} ${pluralize(totalTasks, 'task')}` : 'No project tasks'
    },
    {
      label: 'Overdue',
      count: analysis.overdue,
      total: totalTasks,
      tone: 'is-blocked',
      note: totalTasks ? `${analysis.overdue} of ${totalTasks} ${pluralize(totalTasks, 'task')}` : 'No project tasks'
    },
    {
      label: 'Due in 7 days',
      count: analysis.dueSoon,
      total: totalTasks,
      tone: 'is-upcoming',
      note: totalTasks ? `${analysis.dueSoon} of ${totalTasks} ${pluralize(totalTasks, 'task')}` : 'No project tasks'
    },
    {
      label: 'Awaiting review',
      count: analysis.totalPendingReviews,
      total: reviewPool,
      tone: 'is-review',
      note: reviewPool
        ? `${analysis.pendingTaskReviews} ${pluralize(analysis.pendingTaskReviews, 'task')} · ${analysis.pendingSprintReviews} ${pluralize(analysis.pendingSprintReviews, 'sprint')}`
        : 'No deliverables'
    }
  ]
  if (analysis.dependencyRisks > 0) {
    items.push({
      label: 'Dependency risk',
      count: analysis.dependencyRisks,
      total: totalTasks,
      tone: 'is-review',
      note: `${analysis.dependencyRisks} of ${totalTasks} ${pluralize(totalTasks, 'task')}`
    })
  }
  items.forEach(item => {
    const percent = item.total ? Math.round((item.count / item.total) * 100) : 0
    item.chartValue = percent
    item.valueLabel = `${item.count} · ${percent}%`
  })
  return renderProgressBars(
    'Delivery indicators',
    `Task & review readiness across ${totalTasks} ${pluralize(totalTasks, 'task')}${totalSprints ? ` · ${totalSprints} ${pluralize(totalSprints, 'sprint')}` : ''}`,
    items,
    'is-delivery-indicators',
    {
      scale: 'percent',
      emptyMessage: 'Add project tasks and sprints to see delivery indicators.'
    }
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
  const heading = make('div', 'project-progress-chart-title')
  heading.append(make('h4', '', title), make('small', '', subtitle))
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
  options = 'max',
  legacyEmptyMessage = 'No data to display yet.'
) {
  const config = typeof options === 'string'
    ? { scale: options, emptyMessage: legacyEmptyMessage }
    : options
  const {
    scale = 'max',
    emptyMessage = 'No data to display yet.',
    pairedSeries = null
  } = config

  const chart = make('section', `project-progress-chart ${className}`)
  const heading = make('div', 'project-progress-chart-title')
  heading.append(make('h4', '', title), make('small', '', subtitle))
  chart.append(heading)

  const hasSeriesData = items.some(item =>
    pairedSeries
      ? Number(item[pairedSeries[0].key] || 0) > 0 || Number(item[pairedSeries[1].key] || 0) > 0
      : Number(item.count || 0) > 0
  )
  if (!items.length || (!hasSeriesData && !pairedSeries)) {
    chart.append(make('p', 'project-progress-chart-empty', emptyMessage))
    return chart
  }
  if (!hasSeriesData && pairedSeries && items.every(item => !item.count)) {
    chart.append(make('p', 'project-progress-chart-empty', emptyMessage))
    return chart
  }

  const maxValue = scale === 'percent'
    ? 100
    : pairedSeries
      ? Math.max(...items.flatMap(item => [
          Number(item[pairedSeries[0].key] || 0),
          Number(item[pairedSeries[1].key] || 0)
        ]), 1)
      : Math.max(...items.map(item => Number(item.count || 0)), 1)

  const axisValues = scale === 'percent'
    ? [100, 75, 50, 25, 0].map(value => `${value}%`)
    : maxValue <= 3
      ? Array.from({ length: maxValue + 1 }, (_, index) => String(maxValue - index))
      : [maxValue, 0.75, 0.5, 0.25, 0].map(value =>
          String(value === maxValue ? maxValue : Math.round(maxValue * value))
        )

  const axis = make('div', 'project-progress-column-axis')
  axisValues.forEach(value => {
    axis.append(make('span', '', value))
  })

  const plot = make('div', 'project-progress-column-plot')
  plot.style.setProperty('--column-count', String(items.length))
  plot.style.setProperty('--grid-step', `${100 / Math.max(axisValues.length - 1, 1)}%`)

  items.forEach(item => {
    const group = make('div', 'project-progress-column-group')
    const ariaSummary = pairedSeries
      ? `${item.label}: ${pairedSeries[0].label} ${item[pairedSeries[0].key] || 0}, ${pairedSeries[1].label} ${item[pairedSeries[1].key] || 0}`
      : `${item.label}: ${item.count}${item.note ? `, ${item.note}` : ''}`
    group.setAttribute('role', 'img')
    group.setAttribute('aria-label', ariaSummary)
    group.title = item.note ? `${item.label} — ${item.note}` : item.label

    const bars = make('div', `project-progress-column-bars${pairedSeries ? ' is-paired' : ''}`)
    const values = pairedSeries
      ? pairedSeries.map(series => ({
          value: Number(item[series.key] || 0),
          label: String(Number(item[series.key] || 0)),
          tone: series.tone
        }))
      : [{
          value: scale === 'percent'
            ? Number(item.chartValue ?? 0)
            : Number(item.count || 0),
          label: item.valueLabel || String(item.count || 0),
          tone: item.tone || 'is-progress'
        }]

    values.forEach(barData => {
      const bar = make('div', `project-progress-column-bar ${barData.tone}`)
      const barValue = make('small', 'project-progress-column-value', barData.label)
      const fill = make('span', 'project-progress-column-fill')
      const rawHeight = maxValue ? (barData.value / maxValue) * 100 : 0
      const height = barData.value <= 0 ? 0 : Math.max(rawHeight, 2)
      bar.classList.toggle('is-zero', barData.value <= 0)
      bar.style.height = `${Math.min(height, 100)}%`
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
  if (pairedSeries) {
    const legend = make('div', 'project-progress-column-legend')
    pairedSeries.forEach(series => {
      const entry = make('span', series.tone, series.label)
      legend.append(entry)
    })
    chart.append(legend)
  }
  return chart
}

function animateAnalysisCharts(aside) {
  const animatedElements = aside.querySelectorAll(
    '.project-progress-column-fill, .project-progress-donut-segment'
  )
  animatedElements.forEach((element, index) => {
    element.classList.remove('is-animated')
    element.style.animationDelay = `${index * 70}ms`
  })
  void aside.offsetWidth
  animatedElements.forEach(element => element.classList.add('is-animated'))
}

function downloadProjectAnalysis(project, projectTasks, analysis) {
  const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
  const percentage = (count, total) => total ? Math.round((count / total) * 100) : 0
  const openTasks = projectTasks.length - analysis.completed
  const reviewPool = projectTasks.length + analysis.sprintCount
  const deliveryIndicators = [
    ['Completed', analysis.completed, projectTasks.length],
    ['In progress', analysis.inProgress, projectTasks.length],
    ['Blocked', analysis.blocked, projectTasks.length],
    ['Overdue', analysis.overdue, projectTasks.length],
    ['Due in 7 days', analysis.dueSoon, projectTasks.length],
    ['Awaiting review', analysis.totalPendingReviews, reviewPool]
  ]
  const metricCards = [
    ['Completion', `${analysis.completion}%`, 'of project tasks'],
    ['Tasks complete', `${analysis.completed}/${projectTasks.length}`, 'completed'],
    ['Open tasks', openTasks, 'remaining'],
    ['Sprints', analysis.sprintCount, pluralize(analysis.sprintCount, 'project sprint')]
  ].map(([label, value, note]) => `
    <article class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>
  `).join('')
  const barSection = (title, items, total, valueLabel) => `
    <section class="panel">
      <h2>${escapeHtml(title)}</h2>
      <div class="bars">
        ${items.map(item => {
          const value = Number(item.count || 0)
          const ratio = percentage(value, item.total ?? total)
          return `<div class="bar-row">
            <div class="bar-label"><span>${escapeHtml(item.label)}</span><b>${escapeHtml(valueLabel ? valueLabel(item, value) : value)}</b></div>
            <div class="track"><i style="width:${ratio}%"></i></div>
          </div>`
        }).join('')}
      </div>
    </section>
  `
  const taskRows = projectTasks.map(task => `
    <tr>
      <td>${escapeHtml(task.title)}</td>
      <td><span class="status">${escapeHtml(task.status)}</span></td>
      <td>${escapeHtml(getProjectSprintMembers(project).map(member => member.name || member.email).filter(Boolean).join(', ') || 'No project sprint members')}</td>
      <td>${escapeHtml(task.due_date || '—')}</td>
      <td>${task.hasDependencyWarning || task.dependencies?.some(dependency => dependency.warning_reason) ? 'Yes' : 'No'}</td>
    </tr>
  `).join('')
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(project.name)} production report</title>
<style>
  :root { color-scheme: light; font-family: Inter, Arial, sans-serif; color: #20232a; background: #f5f7fb; }
  body { margin: 0; padding: 36px; } .report { max-width: 1180px; margin: auto; }
  header { background: linear-gradient(135deg,#18243a,#315c87); color: white; padding: 32px; border-radius: 16px; margin-bottom: 20px; }
  h1 { margin: 0 0 8px; font-size: 30px; } h2 { font-size: 17px; margin: 0 0 18px; } p { margin: 0; opacity: .8; }
  .metrics { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; margin-bottom: 20px; }
  .metric,.panel { background: white; border: 1px solid #e4e8ef; border-radius: 12px; padding: 20px; box-shadow: 0 3px 12px #20304d0b; }
  .metric span,.metric small { display:block; color:#667085; font-size:12px; } .metric strong { display:block; font-size:26px; margin:10px 0 4px; }
  .charts { display:grid; grid-template-columns:repeat(2,1fr); gap:16px; margin-bottom:20px; }
  .bar-row { margin: 14px 0; } .bar-label { display:flex; justify-content:space-between; font-size:13px; margin-bottom:6px; }
  .track { height:10px; background:#edf0f5; border-radius:3px; overflow:hidden; } .track i { display:block; height:100%; min-width:0; background:#3b82f6; border-radius:3px; }
  .panel:nth-child(2) .track i { background:#10a878; } .panel:nth-child(3) .track i { background:#d88a45; }
  table { width:100%; border-collapse:collapse; font-size:12px; background:white; } th,td { text-align:left; padding:11px 12px; border-bottom:1px solid #edf0f5; vertical-align:top; } th { background:#f7f8fb; color:#667085; font-weight:700; }
  .table-panel { overflow:auto; margin-bottom:20px; } .status { display:inline-block; padding:3px 7px; border-radius:3px; background:#eef2ff; color:#3730a3; white-space:nowrap; }
  @media (max-width: 760px) { body { padding:16px; } .metrics,.charts { grid-template-columns:1fr 1fr; } }
  @media print { body { padding:0; background:white; } .panel,.metric,header { box-shadow:none; } }
</style>
</head>
<body><main class="report">
  <header><h1>${escapeHtml(project.name)}</h1><p>Production report generated ${escapeHtml(new Date().toLocaleString())}</p></header>
  <div class="metrics">${metricCards}</div>
  <div class="charts">
    ${barSection('Delivery indicators', deliveryIndicators.map(([label, count, total]) => ({ label, count, total })), projectTasks.length, (item, value) => `${value} · ${percentage(value, item.total)}%`)}
    ${barSection('Task status', analysis.taskStatusBreakdown, projectTasks.length)}
    ${barSection('Sprint status', analysis.sprintStatusBreakdown, analysis.sprintCount)}
    ${barSection('Schedule outlook', analysis.scheduleBreakdown, openTasks)}
    ${barSection('Workload by sprint member', analysis.workload, projectTasks.length, item => `${item.open} open · ${item.done} done`)}
  </div>
  <section class="panel table-panel"><h2>Task details</h2><table><thead><tr><th>Task</th><th>Status</th><th>Project sprint members</th><th>Due date</th><th>Dependency warning</th></tr></thead><tbody>${taskRows || '<tr><td colspan="5">No tasks found.</td></tr>'}</tbody></table></section>
</main></body></html>`
  const reportWindow = window.open('', '_blank')
  if (!reportWindow) {
    throw new Error('The report window was blocked. Allow pop-ups and try again.')
  }
  const reportUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  reportWindow.location.href = reportUrl
  reportWindow.addEventListener('load', () => {
    reportWindow.focus()
    window.setTimeout(() => {
      reportWindow.print()
      window.setTimeout(() => URL.revokeObjectURL(reportUrl), 1000)
    }, 300)
  }, { once: true })
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
  } else if (attachment.mediaType === 'application/pdf') {
    preview = make('iframe', 'project-sprint-attachment-preview-document')
    preview.title = attachment.fileName || 'Sprint submission PDF'
  } else {
    return
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
    const icon = createFileTypeIcon(fileName, mediaType, 'project-sprint-submission-file-icon')
    const details = make('span', 'project-sprint-submission-file-details')
    details.append(
      make('strong', 'project-sprint-submission-file-name', fileName),
      make('small', 'project-sprint-submission-file-size', `${Math.max(1, Math.round(size / 1024))} KB`)
    )
    const actions = make('span', 'project-sprint-submission-file-actions')
    if (mediaType.startsWith('image/')) {
      const viewButton = make('button', 'project-sprint-submission-file-view', 'View')
      viewButton.type = 'button'
      viewButton.setAttribute('aria-label', `View ${fileName}`)
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
    } else if (mediaType.startsWith('video/')) {
      const videoPlayer = make('video', 'project-sprint-submission-video')
      videoPlayer.controls = true
      videoPlayer.preload = 'metadata'
      videoPlayer.playsInline = true
      videoPlayer.src = data
      videoPlayer.setAttribute('aria-label', fileName)
      row.append(videoPlayer)
    }
    list.append(row)
  })
  return list
}

function renderTaskSubmissionAttachments(project, task, attachments) {
  const list = make('div', 'project-sprint-submission-files')
  attachments.forEach((attachment, attachmentPosition) => {
    const fileName = attachment?.fileName || 'Task submission attachment'
    const mediaType = attachment?.mediaType || 'application/octet-stream'
    const size = Number(attachment?.size) || 0
    const attachmentIndex = Number.isSafeInteger(Number(attachment?.attachment_index))
      ? Number(attachment.attachment_index)
      : attachmentPosition
    const row = make('div', 'project-sprint-submission-file')
    const icon = createFileTypeIcon(fileName, mediaType, 'project-sprint-submission-file-icon')
    const details = make('span', 'project-sprint-submission-file-details')
    details.append(
      make('strong', 'project-sprint-submission-file-name', fileName),
      make('small', 'project-sprint-submission-file-size', `${Math.max(1, Math.round(size / 1024))} KB`)
    )
    const actions = make('span', 'project-sprint-submission-file-actions')
    const canPreview = mediaType.startsWith('image/') ||
      mediaType.startsWith('audio/') ||
      mediaType.startsWith('video/') ||
      mediaType === 'application/pdf'

    const fetchAttachment = async () => {
      const response = await api.get(
        `/projects/${encodeURIComponent(project.projectId)}/tasks/${encodeURIComponent(task.taskId)}/submission-attachments/${attachmentIndex}`
      )
      const payload = response?.data?.attachment
      if (typeof payload?.data !== 'string') {
        throw new Error(`The attachment "${fileName}" could not be loaded.`)
      }
      return { ...attachment, ...payload, fileName, mediaType }
    }

    if (canPreview) {
      const isAudio = mediaType.startsWith('audio/')
      const previewButton = make(
        'button',
        'project-sprint-submission-file-view',
        isAudio ? 'Play' : 'View'
      )
      previewButton.type = 'button'
      previewButton.setAttribute('aria-label', `${isAudio ? 'Play' : 'View'} ${fileName}`)
      previewButton.addEventListener('click', async () => {
        previewButton.disabled = true
        previewButton.textContent = 'Loading…'
        try {
          const payload = await fetchAttachment()
          if (isAudio) {
            const audioPlayer = make('audio', 'project-sprint-submission-audio')
            audioPlayer.controls = true
            audioPlayer.preload = 'metadata'
            audioPlayer.src = payload.data
            audioPlayer.setAttribute('aria-label', fileName)
            row.append(audioPlayer)
            previewButton.hidden = true
          } else {
            openSprintAttachmentPreview(payload, previewButton)
          }
        } catch (error) {
          showDashboardToast(error.message || `The attachment "${fileName}" could not be opened.`, 'error')
        } finally {
          previewButton.disabled = false
          previewButton.textContent = isAudio ? 'Play' : 'View'
        }
      })
      actions.append(previewButton)
    }

    const downloadLink = make('a', 'project-sprint-submission-file-download', 'Download')
    downloadLink.href = '#'
    downloadLink.addEventListener('click', async event => {
      event.preventDefault()
      downloadLink.setAttribute('aria-disabled', 'true')
      downloadLink.textContent = 'Loading…'
      try {
        const payload = await fetchAttachment()
        const download = make('a')
        download.href = payload.data
        download.download = fileName
        download.hidden = true
        document.body.append(download)
        download.click()
        download.remove()
      } catch (error) {
        showDashboardToast(error.message || `The attachment "${fileName}" could not be downloaded.`, 'error')
      } finally {
        downloadLink.removeAttribute('aria-disabled')
        downloadLink.textContent = 'Download'
      }
    })
    row.append(icon, details, actions)
    actions.append(downloadLink)
    list.append(row)
  })
  return list
}

function renderTaskSubmission(project, task, isProjectOwner, afterReview) {
  const submissionStatus = String(task.taskSubmissionStatus || 'Not submitted')
  if (submissionStatus.trim().toLowerCase() === 'not submitted') return null

  const section = make('section', `project-task-sprint-submission is-${submissionStatus.toLowerCase().replaceAll(' ', '-')}`)
  section.append(
    make('strong', 'project-task-sprint-submission-title', `Task submission · ${submissionStatus}`)
  )
  if (task.taskSubmittedAt) {
    const submittedAt = new Date(task.taskSubmittedAt)
    if (!Number.isNaN(submittedAt.getTime())) {
      const submittedByUid = task.taskSubmittedByFirebaseUid || task.task_submitted_by_firebase_uid
      const submittedByMember = project.acceptedMembers?.find(member =>
        member.firebaseUid === submittedByUid
      )
      const submittedBy = submittedByUid === project.creatorFirebaseUid
        ? project.creatorName || project.creatorEmail
        : submittedByMember?.name || submittedByMember?.email
      section.append(make(
        'small',
        'project-sprint-submission-metadata',
        `Submitted ${submittedAt.toLocaleString()}${submittedBy ? ` by ${submittedBy}` : ''}`
      ))
    }
  }
  if (task.taskSubmissionNote) {
    const note = make('div', 'project-sprint-submission-note')
    note.append(
      make('strong', 'project-sprint-card-section-label', 'Member submission note'),
      make('p', '', task.taskSubmissionNote)
    )
    section.append(note)
  }
  if (Array.isArray(task.taskSubmissionLinks) && task.taskSubmissionLinks.length) {
    const links = make('div', 'project-task-sprint-submission-links')
    links.append(make('strong', 'project-sprint-card-section-label', 'Submitted links'))
    task.taskSubmissionLinks.forEach(value => {
      try {
        const url = new URL(value)
        if (!['http:', 'https:'].includes(url.protocol)) return
        const link = make('a', 'project-task-sprint-submission-link', url.href)
        link.href = url.href
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        links.append(link)
      } catch (error) {
        console.error('Ignoring invalid task submission link:', error)
      }
    })
    section.append(links)
  }
  if (Array.isArray(task.taskSubmissionAttachments) && task.taskSubmissionAttachments.length) {
    const media = make('div', 'project-sprint-submission-media')
    media.append(
      make('strong', 'project-sprint-submission-media-title', 'Submitted files and voice notes'),
      renderTaskSubmissionAttachments(project, task, task.taskSubmissionAttachments)
    )
    section.append(media)
  }
  if (task.taskReviewComment) {
    const feedback = make('div', 'project-sprint-review-comment')
    feedback.append(
      make('strong', 'project-sprint-card-section-label', 'Review feedback'),
      make('p', '', task.taskReviewComment)
    )
    section.append(feedback)
  }

  if (isProjectOwner && submissionStatus === 'Pending Review') {
    const reviewForm = make('div', 'project-task-sprint-review-form')
    const reviewInput = make('textarea', 'project-sprint-review-input')
    reviewInput.rows = 3
    reviewInput.maxLength = 5000
    reviewInput.placeholder = 'Add feedback for the project members…'
    reviewInput.setAttribute('aria-label', `Review submission for ${task.title}`)
    const error = make('p', 'project-task-sprint-review-error')
    error.setAttribute('role', 'alert')
    error.hidden = true
    const actions = make('div', 'project-sprint-review-actions')
    const acceptButton = make('button', 'project-progress-aside-complete', 'Accept submission')
    acceptButton.type = 'button'
    const changesButton = make('button', 'project-sprint-request-changes', 'Request changes')
    changesButton.type = 'button'
    const submitReview = async (decision, button) => {
      const comment = reviewInput.value.trim()
      if (decision === 'request_changes' && !comment) {
        error.textContent = 'Add written feedback explaining the requested changes.'
        error.hidden = false
        reviewInput.focus()
        return
      }
      button.disabled = true
      error.hidden = true
      const previousText = button.textContent
      button.textContent = decision === 'accept' ? 'Accepting…' : 'Sending…'
      try {
        const response = await api.post(
          `/projects/${encodeURIComponent(project.projectId)}/tasks/${encodeURIComponent(task.taskId)}/review-submission`,
          { decision, comment }
        )
        if (response?.success !== true || !response?.data?.task) {
          throw new Error(response?.message || 'The server did not confirm the task review.')
        }
        if (response.notificationWarning) {
          showDashboardToast(response.notificationWarning, 'error')
        } else {
          showDashboardToast(
            decision === 'accept' ? 'Task submission accepted.' : 'Changes requested from the project members.',
            'success'
          )
        }
        await afterReview(response.data.task)
      } catch (reviewError) {
        error.textContent = reviewError.message || 'The task submission could not be reviewed.'
        error.hidden = false
        button.disabled = false
        button.textContent = previousText
      }
    }
    acceptButton.addEventListener('click', () => submitReview('accept', acceptButton))
    changesButton.addEventListener('click', () => submitReview('request_changes', changesButton))
    actions.append(acceptButton, changesButton)
    reviewForm.append(reviewInput, error, actions)
    section.append(reviewForm)
  }
  return section
}

function applyTaskSubmission(task, record) {
  if (record.status) task.status = record.status
  if (record.task_submission_status !== undefined) {
    task.taskSubmissionStatus = record.task_submission_status
  }
  if (record.task_submission_note !== undefined) {
    task.taskSubmissionNote = record.task_submission_note
  }
  if (Array.isArray(record.task_submission_links)) {
    task.taskSubmissionLinks = record.task_submission_links
  }
  if (Array.isArray(record.task_submission_attachments)) {
    task.taskSubmissionAttachments = record.task_submission_attachments
  }
  if (record.task_submitted_at !== undefined) task.taskSubmittedAt = record.task_submitted_at
  if (record.task_submitted_by_firebase_uid !== undefined) {
    task.taskSubmittedByFirebaseUid = record.task_submitted_by_firebase_uid
  }
  if (record.task_review_comment !== undefined) {
    task.taskReviewComment = record.task_review_comment
  }
  if (record.task_reviewed_by_firebase_uid !== undefined) {
    task.taskReviewedByFirebaseUid = record.task_reviewed_by_firebase_uid
  }
  if (record.task_reviewed_at !== undefined) task.taskReviewedAt = record.task_reviewed_at
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
  const contentSources = [sprint, submission, content]
  const messageSources = contentSources.flatMap(source => [
    source.messages,
    source.message,
    source.comments,
    source.history,
    source.submissionHistory,
    source.submission_history,
    source.submissionMessages,
    source.submission_messages,
    source.reviewHistory,
    source.review_history
  ]).filter(Array.isArray).flat()
  const messageText = messageSources.flatMap(message => {
    if (typeof message === 'string') return [message]
    if (!message || typeof message !== 'object') return []
    return [
      message.text,
      message.message,
      message.body,
      message.note,
      message.comment,
      message.content
    ]
  })
  const attachmentSources = [
    sprint.submissionAttachments,
    sprint.submission_attachments,
    sprint.submissionMedia,
    sprint.submission_media,
    sprint.attachments,
    submission.attachments,
    submission.media,
    content.attachments,
    content.media,
    ...messageSources.flatMap(message => [
      message?.attachments,
      message?.media,
      message?.files
    ])
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
    content.notes,
    ...messageText
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
  if (!media || !['IMG', 'VIDEO'].includes(media.tagName)) return
  const aside = media.closest('.project-progress-aside')
  if (!aside) return

  const backdrop = make('div', 'project-comment-media-preview-backdrop')
  backdrop.classList.add('is-aside-preview')
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
    if (event.key === 'Escape') {
      event.stopImmediatePropagation()
      closePreview()
    }
  }

  closeButton.addEventListener('click', closePreview)
  closeButton.addEventListener('pointerdown', event => event.stopPropagation())
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) closePreview()
  })
  dialog.append(closeButton, preview)
  backdrop.append(dialog)
  aside.append(backdrop)
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

  const remainingSprints = sprints.filter((_, index) => index !== sprintIndex)
  const updatedSprints = remainingSprints.map((item, index) => ({
    ...item,
    name: `Sprint ${index + 1}: ${String(item.name || 'Sprint')
      .replace(/^Sprint\s+\d+\s*:\s*/i, '')
      .trim() || 'Untitled'}`
  }))
  const confirmed = await showDashboardConfirmation({
    title: 'Remove project sprint?',
    message: `Remove "${sprint.name}" and update the numbering of the remaining sprints?`,
    confirmText: 'Remove sprint',
    danger: true,
    compact: true
  })
  if (!confirmed) return

  const restoreButton = setDashboardButtonLoading(removeButton, 'Removing…')
  try {
    await api.put(`/projects/${encodeURIComponent(project.projectId)}`, { sprints: updatedSprints })
    project.sprints = updatedSprints
    showDashboardToast('Sprint removed.', 'success')
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

async function loadTaskComments(project, task, container, options = {}) {
  const { onCountChange, onError } = options
  try {
    const response = await api.get(
      `/projects/${encodeURIComponent(project.projectId)}/tasks/${encodeURIComponent(task.taskId)}/comments`
    )
    const comments = response?.data?.comments || []
    task.commentsList = comments
    task.comments = comments.length
    onCountChange?.(comments.length, comments)
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
      const isInlinePlayable = attachment => {
        const type = resolveAttachmentMediaType(attachment?.fileName, attachment?.mediaType)
        return (type.startsWith('image/') && type !== 'image/svg+xml') ||
          type.startsWith('audio/') ||
          type.startsWith('video/')
      }
      const playableAttachments = attachments.filter(isInlinePlayable)
      const attachmentContent = renderTaskMediaAttachments(playableAttachments)
      addCommentMediaExpandButtons(attachmentContent)
      const documentAttachments = attachments.filter(attachment =>
        !isInlinePlayable(attachment) &&
        typeof attachment?.data === 'string' &&
        typeof attachment?.fileName === 'string'
      )
      documentAttachments.forEach(attachment => {
        const mediaType = resolveAttachmentMediaType(attachment.fileName, attachment.mediaType)
        const documentLink = make('a', 'project-comment-document')
        documentLink.href = attachment.data
        documentLink.download = attachment.fileName
        documentLink.target = '_self'
        documentLink.setAttribute('aria-label', `Download ${attachment.fileName}`)
        documentLink.addEventListener('click', event => {
          event.preventDefault()
          const download = document.createElement('a')
          download.href = attachment.data
          download.download = attachment.fileName
          download.style.display = 'none'
          document.body.append(download)
          download.click()
          download.remove()
        })
        documentLink.append(
          createFileTypeIcon(attachment.fileName, mediaType, 'project-comment-document-icon'),
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
    onError?.(error)
    container.replaceChildren(make('p', 'task-media-status is-error', error.message || 'Task comments could not be loaded.'))
    return []
  }
}

export async function openProjectProgressAside(task) {
  const project = projects.find(candidate => candidate.projectId === task.projectId)
  if (!project) {
    showDashboardToast('The project details for this task could not be found.', 'error')
    return
  }

  const currentTask = task.taskId
    ? tasks.find(candidate =>
      candidate.backendPersistent && candidate.taskId === task.taskId
    ) || task
    : task
  if (currentTask.taskId) {
    try {
      const response = await api.get(
        `/projects/${encodeURIComponent(project.projectId)}/tasks/${encodeURIComponent(currentTask.taskId)}?metadataOnly=true`
      )
      if (!response?.data?.task) {
        throw new Error('The server did not return the latest task details.')
      }
      applyTaskSubmission(currentTask, response.data.task)
    } catch (error) {
      console.error('Unable to refresh task submission details:', error)
      showDashboardToast(
        'Latest task submission details could not be refreshed. Showing the most recently loaded task data.',
        'error'
      )
    }
  }
  task = currentTask
  const projectTasks = tasks.filter(candidate =>
    candidate.backendPersistent && candidate.projectId === project.projectId
  )
  const sprints = Array.isArray(project.sprints) ? project.sprints : []
  const acceptedMembers = Array.isArray(project.acceptedMembers) ? project.acceptedMembers : []
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

  const analysis = getProductionAnalysis(project, projectTasks, sprints)
  const analysisSection = make('section', 'project-progress-aside-section project-progress-aside-analysis')
  const analysisHeading = make('div', 'project-progress-aside-section-heading')
  const analysisHeadingCopy = make('div', 'project-progress-analysis-heading-copy')
  analysisHeadingCopy.append(
    make('h3', '', 'Production analysis'),
    make('small', '', 'Live task, sprint, workload, and schedule analytics')
  )
  analysisHeading.append(analysisHeadingCopy)
  const openTasks = projectTasks.filter(task =>
    String(task.status || '').trim().toLowerCase() !== 'done'
  ).length
  const scheduleSubtitle = openTasks
    ? `${openTasks} open ${pluralize(openTasks, 'task')} by due date`
    : projectTasks.length
      ? 'All project tasks completed'
      : 'No open tasks scheduled'
  const charts = make('div', 'project-progress-analysis-charts')
  charts.append(
    renderDeliveryIndicators(analysis, projectTasks.length, sprints.length),
    renderStatusDonut(analysis.taskStatusBreakdown, {
      title: 'Task status',
      subtitle: `${projectTasks.length} ${pluralize(projectTasks.length, 'project task')}`,
      centerValue: `${analysis.completion}%`,
      centerLabel: 'complete',
      ariaLabel: `${analysis.completion}% complete across ${projectTasks.length} ${pluralize(projectTasks.length, 'project task')}`
    }),
    renderStatusDonut(analysis.sprintStatusBreakdown, {
      title: 'Project sprint status',
      subtitle: `${sprints.length} ${pluralize(sprints.length, 'project sprint')}`,
      centerValue: String(sprints.length),
      centerLabel: pluralize(sprints.length, 'sprint'),
      ariaLabel: `${sprints.length} ${pluralize(sprints.length, 'project sprint')} by delivery status`
    }),
    renderProgressBars(
      'Schedule outlook',
      scheduleSubtitle,
      analysis.scheduleBreakdown,
      'is-schedule',
      {
        scale: 'max',
        emptyMessage: projectTasks.length
          ? 'All project tasks are completed.'
          : 'Add tasks with due dates to track schedule outlook.'
      }
    ),
    renderProgressBars(
      'Workload by sprint member',
      `${projectTasks.length} ${pluralize(projectTasks.length, 'task')} across ${analysis.workload.length} ${pluralize(analysis.workload.length, 'sprint member')}`,
      analysis.workload,
      'is-workload',
      {
        scale: 'max',
        emptyMessage: 'Add members to project sprints to compare workload.',
        pairedSeries: [
          { key: 'open', label: 'Open tasks', tone: 'is-progress' },
          { key: 'done', label: 'Completed tasks', tone: 'is-done' }
        ]
      }
    )
  )
  analysisSection.append(
    analysisHeading,
    charts
  )
  content.append(analysisSection)

  const dependencySection = make('section', 'project-progress-aside-section is-dependencies')
  const dependencyHeading = make('div', 'project-progress-aside-section-heading')
  const dependencyHeadingCopy = make('div', 'project-comments-title')
  dependencyHeadingCopy.append(
    make('span', 'project-progress-aside-eyebrow', 'Task planning'),
    make('h3', '', 'Dependencies')
  )
  dependencyHeading.append(dependencyHeadingCopy)
  dependencySection.append(dependencyHeading)
  const dependencyCandidates = tasks.filter(candidate =>
    candidate.backendPersistent && candidate.taskId !== task.taskId
  )
  const selectedDependencyIds = new Set(
    (task.dependencies || []).map(dependency => dependency.task_id)
  )
  const dependencyGraph = make('div', 'project-dependency-graph')
  dependencyGraph.setAttribute('aria-label', 'Task dependency connections')
  const dependencyTarget = make('div', 'project-dependency-target')
  dependencyTarget.append(
    make('span', 'project-dependency-node-label', 'This task'),
    make('strong', '', task.title),
    make('small', '', `${project.name} · ${task.status || 'To do'}`)
  )
  dependencyGraph.append(dependencyTarget)
  const dependencyList = make('div', 'project-dependency-list')
  const renderDependencyGraph = () => {
    dependencyList.replaceChildren()
    if (!dependencyCandidates.length) {
      dependencyList.append(make('p', 'project-progress-aside-empty', 'No other accessible tasks are available.'))
      return
    }
    dependencyCandidates.forEach(candidate => {
      const connected = selectedDependencyIds.has(candidate.taskId)
      const row = make('div', `project-dependency-row${connected ? ' is-connected' : ''}`)
      const checkbox = make('input')
      checkbox.type = 'checkbox'
      checkbox.value = candidate.taskId
      checkbox.checked = connected
      checkbox.id = `project-dependency-${candidate.taskId}`
      checkbox.setAttribute('aria-label', `Make ${candidate.title} a predecessor`)
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedDependencyIds.add(candidate.taskId)
        else selectedDependencyIds.delete(candidate.taskId)
        row.classList.toggle('is-connected', checkbox.checked)
      })
      const predecessor = make('label', 'project-dependency-node')
      predecessor.htmlFor = checkbox.id
      predecessor.append(
        make('span', 'project-dependency-node-label', 'Predecessor'),
        make('strong', '', candidate.title),
        make('small', '', `${candidate.project || 'Project'} · ${candidate.status || 'To do'}`)
      )
      const arrow = make('span', 'project-dependency-arrow', '→')
      arrow.setAttribute('aria-hidden', 'true')
      row.append(checkbox, predecessor, arrow)
      dependencyList.append(row)
    })
  }
  renderDependencyGraph()
  const dependencyHelp = make('small', 'project-progress-aside-help', 'Select the predecessor tasks that must finish before this task. Arrows show the direction of each connection.')
  const dependencySave = make('button', 'project-progress-aside-context-link', 'Save Dependencies')
  dependencySave.type = 'button'
  dependencySave.addEventListener('click', async () => {
    const restoreButton = setDashboardButtonLoading(dependencySave, 'Saving…')
    try {
      const predecessorTaskIds = [...selectedDependencyIds]
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
  dependencySection.append(dependencyGraph, dependencyList, dependencyHelp, dependencySave)

  const commentsSection = make('section', 'project-progress-aside-section is-comments collab-card')
  const commentsHeading = make('div', 'project-progress-aside-section-heading')
  const commentsTitle = make('div', 'project-comments-title')
  commentsTitle.append(
    make('span', 'project-progress-aside-eyebrow', 'Collaboration'),
    make('h3', '', 'Comments and media')
  )
  commentsHeading.append(commentsTitle)
  const commentsList = make('div', 'task-comment-list')
  const commentsListId = `project-comments-list-${String(task.taskId || 'task').replace(/[^a-zA-Z0-9_-]/g, '')}`
  commentsList.id = commentsListId
  commentsList.setAttribute('aria-label', 'Task comments')
  commentsList.hidden = true

  const commentsDrawer = make('div', 'project-comments-drawer')
  const commentsToggle = make('button', 'project-comments-toggle')
  commentsToggle.type = 'button'
  commentsToggle.setAttribute('aria-expanded', 'false')
  commentsToggle.setAttribute('aria-controls', commentsListId)

  const commentsToggleCopy = make('span', 'project-comments-toggle-copy')
  const commentsToggleTitle = make('span', 'project-comments-toggle-title', 'Click to view messages')
  const commentsToggleHint = make('span', 'project-comments-toggle-hint', 'Checking messages…')
  commentsToggleCopy.append(commentsToggleTitle, commentsToggleHint)

  const commentsToggleRight = make('span', 'project-comments-toggle-right')
  const commentsCountBadge = make('span', 'project-comments-count-badge', '0')
  commentsCountBadge.hidden = true
  const commentsChevron = make('span', 'project-comments-chevron')
  commentsChevron.setAttribute('aria-hidden', 'true')
  commentsChevron.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 4 4 4-4 4"/></svg>'
  commentsToggleRight.append(commentsCountBadge, commentsChevron)
  commentsToggle.append(commentsToggleCopy, commentsToggleRight)

  let loadedComments = Array.isArray(task.commentsList) ? task.commentsList : []
  let commentsLoaded = false
  let commentPollTimer = null
  let commentRefreshPromise = null
  const commentReadMarkerKey = `collab-task-comments-read:${currentUser.uid}:${task.taskId}`
  const isCommentsExpanded = () => commentsToggle.getAttribute('aria-expanded') === 'true'
  const saveCommentReadMarker = comments => {
    if (!currentUser.uid) return
    const latest = comments[comments.length - 1]
    const marker = latest
      ? {
        commentId: String(latest.comment_id || ''),
        createdAt: String(latest.created_at || '')
      }
      : { commentId: null, createdAt: null }
    try {
      localStorage.setItem(commentReadMarkerKey, JSON.stringify(marker))
    } catch (error) {
      console.error('Unable to save the task comment read marker:', error)
    }
  }
  const readCommentMarker = () => {
    try {
      const stored = localStorage.getItem(commentReadMarkerKey)
      if (stored === null) return null
      const marker = JSON.parse(stored)
      return marker && typeof marker === 'object' ? marker : null
    } catch (error) {
      console.error('Unable to read the task comment read marker:', error)
      return null
    }
  }
  const getUnreadComments = comments => {
    if (!currentUser.uid) return []
    const marker = readCommentMarker()
    if (!marker) {
      saveCommentReadMarker(comments)
      return []
    }
    const markerIndex = marker.commentId
      ? comments.findIndex(comment => String(comment.comment_id) === marker.commentId)
      : -1
    const newerComments = markerIndex >= 0
      ? comments.slice(markerIndex + 1)
      : marker.createdAt
        ? comments.filter(comment => String(comment.created_at || '') > marker.createdAt)
        : comments
    return newerComments.filter(comment => comment.author_firebase_uid !== currentUser.uid)
  }

  const setCommentsExpanded = expanded => {
    commentsToggle.setAttribute('aria-expanded', String(expanded))
    commentsToggle.classList.toggle('is-expanded', expanded)
    commentsDrawer.classList.toggle('is-expanded', expanded)
    commentsList.hidden = !expanded
    commentsToggleTitle.textContent = expanded ? 'Hide messages' : 'Click to view messages'
    if (expanded && commentsLoaded) {
      saveCommentReadMarker(loadedComments)
      updateCommentsCount(loadedComments.length, loadedComments)
    }
  }

  const updateCommentsCount = (count, comments = []) => {
    const total = Math.max(0, Number(count) || 0)
    loadedComments = comments
    commentsLoaded = true
    task.commentsList = comments
    task.comments = total
    if (isCommentsExpanded()) saveCommentReadMarker(comments)
    const unreadComments = isCommentsExpanded() ? [] : getUnreadComments(comments)
    const unreadCount = unreadComments.length
    commentsToggle.classList.toggle('has-messages', unreadCount > 0)
    commentsCountBadge.hidden = unreadCount === 0
    commentsCountBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount)
    commentsCountBadge.setAttribute(
      'aria-label',
      `${unreadCount} new ${unreadCount === 1 ? 'message' : 'messages'}`
    )
    if (!total) {
      commentsToggleHint.textContent = 'No messages yet'
    } else if (!unreadCount) {
      commentsToggleHint.textContent = isCommentsExpanded()
        ? 'No new messages'
        : 'Open to view messages'
    } else {
      const latest = unreadComments[unreadComments.length - 1]
      const latestAuthor = latest?.author_name || latest?.author_email || ''
      commentsToggleHint.textContent = latestAuthor
        ? `${unreadCount} new ${unreadCount === 1 ? 'message' : 'messages'} · Latest by ${latestAuthor}`
        : `${unreadCount} new ${unreadCount === 1 ? 'message' : 'messages'}`
    }
  }

  const refreshTaskComments = async ({ force = false } = {}) => {
    if (!force && isCommentsExpanded()) return
    while (commentRefreshPromise) await commentRefreshPromise
    if (!force && isCommentsExpanded()) return
    const refreshPromise = loadTaskComments(project, task, commentsList, {
      onCountChange: updateCommentsCount,
      onError: () => {
        commentsToggleHint.textContent = 'Unable to load messages'
      }
    })
    commentRefreshPromise = refreshPromise
    try {
      await refreshPromise
    } finally {
      if (commentRefreshPromise === refreshPromise) commentRefreshPromise = null
    }
  }

  const startCommentPolling = () => {
    if (commentPollTimer) clearInterval(commentPollTimer)
    commentPollTimer = null
    if (!isCommentsExpanded()) {
      commentPollTimer = window.setInterval(() => {
        if (aside.isConnected) void refreshTaskComments()
      }, 30_000)
    }
  }

  commentsToggle.addEventListener('click', () => {
    const isExpanded = commentsToggle.getAttribute('aria-expanded') === 'true'
    setCommentsExpanded(!isExpanded)
    if (isExpanded) {
      startCommentPolling()
    } else {
      if (commentPollTimer) clearInterval(commentPollTimer)
      commentPollTimer = null
      void refreshTaskComments({ force: true })
    }
  })

  commentsDrawer.append(commentsToggle, commentsList)

  commentsSection.append(commentsHeading)
  const commentForm = document.createElement('form')
  commentForm.className = 'task-comment-form collab-textarea-wrap'
  const commentInput = document.createElement('textarea')
  commentInput.className = 'collab-textarea'
  commentInput.classList.add('no-input-icon')
  commentInput.maxLength = 5000
  commentInput.rows = 2
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
      setCommentsExpanded(true)
      await refreshTaskComments({ force: true })
      restoreButton()
    } catch (error) {
      restoreButton()
      showDashboardToast(error.message || 'The comment could not be posted.', 'error')
    }
  })
  commentsSection.append(commentForm, commentsDrawer)
  content.append(commentsSection)
  void refreshTaskComments({ force: true })

  const sprintSection = make('section', 'project-progress-aside-section is-sprints')
  sprintSection.setAttribute('aria-labelledby', 'project-progress-aside-sprints-title')
  const sprintHeading = make('div', 'project-progress-aside-section-heading')
  const sprintHeadingLeft = make('div', 'project-progress-aside-heading-group')
  const sprintHeadingCopy = make('div', 'project-comments-title')
  sprintHeadingCopy.append(make('span', 'project-progress-aside-eyebrow', 'Delivery plan'))
  const sprintHeadingTitle = make('h3', '', 'Project sprints')
  sprintHeadingTitle.id = 'project-progress-aside-sprints-title'
  sprintHeadingCopy.append(sprintHeadingTitle)
  sprintHeadingLeft.append(
    sprintHeadingCopy,
    make(
      'span',
      'project-progress-aside-count',
      `${sprints.length} ${sprints.length === 1 ? 'sprint' : 'sprints'}`
    )
  )
  sprintHeading.append(sprintHeadingLeft)
  const sprintExpandControls = []
  if (sprints.length) {
    const expandAllButton = make('button', 'project-sprint-sheet-bulk-toggle', 'Expand all')
    expandAllButton.type = 'button'
    expandAllButton.addEventListener('click', () => {
      const anyCollapsed = sprintExpandControls.some(control => !control.isExpanded())
      sprintExpandControls.forEach(control => control.setExpanded(anyCollapsed))
      expandAllButton.textContent = anyCollapsed ? 'Collapse all' : 'Expand all'
    })
    sprintHeading.append(expandAllButton)
  }
  sprintSection.append(sprintHeading)

  const submissionMediaEditors = []
  if (!sprints.length) {
    sprintSection.append(make('p', 'project-progress-aside-empty', 'No project sprints yet.'))
  } else {
    const sheetWrap = make('div', 'project-sprint-sheet-wrap')
    const sheetTable = make('table', 'project-sprint-sheet')
    sheetTable.setAttribute('aria-label', 'Project sprints delivery plan')

    const thead = document.createElement('thead')
    const headRow = document.createElement('tr')
    ;[
      ['#', 'is-index'],
      ['Sprint', 'is-sprint'],
      ['Status', 'is-status'],
      ['Members', 'is-members'],
      ['Schedule', 'is-schedule'],
      ['Details', 'is-actions']
    ].forEach(([label, colClass]) => {
      const th = document.createElement('th')
      th.scope = 'col'
      th.className = colClass
      th.textContent = label
      headRow.append(th)
    })
    thead.append(headRow)
    sheetTable.append(thead)

    const tbody = document.createElement('tbody')
    const syncBulkToggleLabel = () => {
      const bulkButton = sprintHeading.querySelector('.project-sprint-sheet-bulk-toggle')
      if (!bulkButton || !sprintExpandControls.length) return
      const allExpanded = sprintExpandControls.every(control => control.isExpanded())
      bulkButton.textContent = allExpanded ? 'Collapse all' : 'Expand all'
    }

    sprints.forEach((sprint, sprintIndex) => {
      const sprintStatus = sprint.status || 'Upcoming'
      const normalizedStatus = String(sprintStatus).toLowerCase().replaceAll(' ', '-')
      const sprintMembers = getSprintMembers(project, sprint)

      const sprintStart = sprint.startDate || sprint.start_date
      const sprintEnd = sprint.endDate || sprint.end_date
      const sprintStartLabel = sprintStart ? formatSprintDate(sprintStart) : ''
      const sprintEndLabel = sprintEnd ? formatSprintDate(sprintEnd) : ''
      const sprintDates = sprintStartLabel && sprintEndLabel
        ? `${sprintStartLabel} – ${sprintEndLabel}`
        : sprintStartLabel || sprintEndLabel || 'Not scheduled'

      const sprintDescriptions = [
        sprint.description,
        sprint.details,
        sprint.goal,
        sprint.objective,
        sprint.summary
      ].filter(value => typeof value === 'string' && value.trim())
        .map(value => value.trim())
      const uniqueDescriptions = [...new Set(sprintDescriptions)]

      const dataRow = make('tr', 'project-sprint-sheet-row')
      dataRow.setAttribute('aria-label', `${sprint.name || 'Untitled sprint'}: ${sprintStatus}`)

      const indexCell = make('td', 'project-sprint-sheet-cell is-index')
      indexCell.append(make('span', 'project-sprint-sheet-index', String(sprintIndex + 1).padStart(2, '0')))

      const sprintCell = make('td', 'project-sprint-sheet-cell is-sprint')
      const sprintTitleBtn = make('button', 'project-sprint-sheet-title-btn')
      sprintTitleBtn.type = 'button'
      sprintTitleBtn.append(make('strong', 'project-sprint-sheet-name', sprint.name || 'Untitled sprint'))
      if (uniqueDescriptions[0]) {
        sprintTitleBtn.append(make('span', 'project-sprint-sheet-brief', uniqueDescriptions[0]))
      }
      sprintCell.append(sprintTitleBtn)

      const statusCell = make('td', 'project-sprint-sheet-cell is-status')
      statusCell.append(make('span', `project-sprint-status is-${normalizedStatus}`, sprintStatus))

      const membersCell = make('td', 'project-sprint-sheet-cell is-members')
      if (sprintMembers.length) {
        const membersWrap = make('div', 'project-sprint-sheet-lead')
        sprintMembers.forEach(member => {
          const memberItem = make('span', 'project-sprint-sheet-member')
          const avatar = make('span')
          renderAvatarElement(avatar, member, 'project-sprint-lead-avatar')
          avatar.setAttribute('aria-hidden', 'true')
          memberItem.append(
            avatar,
            make('span', 'project-sprint-sheet-lead-name', member.name || member.email || 'Project member')
          )
          memberItem.title = member.name || member.email || 'Project member'
          membersWrap.append(memberItem)
        })
        membersCell.append(membersWrap)
      } else {
        membersCell.append(make('span', 'project-sprint-sheet-muted', 'No members assigned'))
      }

      const scheduleCell = make('td', 'project-sprint-sheet-cell is-schedule')
      scheduleCell.append(make(
        'span',
        sprintDates === 'Not scheduled' ? 'project-sprint-sheet-muted' : 'project-sprint-sheet-date',
        sprintDates
      ))

      const detailsId = `project-sprint-details-${sprintIndex}`
      const actionCell = make('td', 'project-sprint-sheet-cell is-actions')
      const toggle = make('button', 'project-sprint-sheet-toggle')
      toggle.type = 'button'
      toggle.id = `${detailsId}-toggle`
      toggle.setAttribute('aria-expanded', 'false')
      toggle.setAttribute('aria-controls', detailsId)

      const canSubmitSprint = Boolean(
        currentUid &&
        sprintMembers.some(member =>
          (member.firebaseUid || member.firebase_uid || member.uid) === currentUid
        ) &&
        !['Completed', 'Pending Review'].includes(sprint.status)
      )
      const canReviewSprint = Boolean(isProjectOwner && sprint.status === 'Pending Review')

      const toggleLabel = make('span', 'project-sprint-card-toggle-label', 'Details')
      const toggleIcon = make('span', 'project-sprint-card-toggle-icon', '⌄')
      toggleIcon.setAttribute('aria-hidden', 'true')
      toggle.append(toggleLabel, toggleIcon)
      if (canSubmitSprint || canReviewSprint) {
        toggle.classList.add('has-pending-action')
        toggle.title = canReviewSprint ? 'Review pending sprint submission' : 'Open details to submit sprint work'
      }
      actionCell.append(toggle)

      dataRow.append(
        indexCell,
        sprintCell,
        statusCell,
        membersCell,
        scheduleCell,
        actionCell
      )

      const detailRow = make('tr', 'project-sprint-sheet-detail-row')
      detailRow.hidden = true
      const detailTd = document.createElement('td')
      detailTd.colSpan = 6
      detailTd.className = 'project-sprint-sheet-detail-cell'

      const details = make('div', 'project-sprint-card-details project-sprint-sheet-details')
      details.id = detailsId
      details.setAttribute('role', 'region')
      details.setAttribute('aria-labelledby', toggle.id)

      const setExpanded = expanded => {
        toggle.setAttribute('aria-expanded', String(expanded))
        detailRow.hidden = !expanded
        dataRow.classList.toggle('is-expanded', expanded)
        detailRow.classList.toggle('is-expanded', expanded)
        toggleLabel.textContent = expanded ? 'Hide' : 'Details'
        syncBulkToggleLabel()
      }
      sprintExpandControls.push({
        isExpanded: () => toggle.getAttribute('aria-expanded') === 'true',
        setExpanded
      })

      const handleToggle = () => {
        const expanded = toggle.getAttribute('aria-expanded') === 'true'
        setExpanded(!expanded)
      }
      toggle.addEventListener('click', handleToggle)
      sprintTitleBtn.addEventListener('click', handleToggle)

      const detailGrid = make('div', 'project-sprint-sheet-detail-grid')
      const infoPane = make('div', 'project-sprint-sheet-detail-pane is-info')

      if (uniqueDescriptions.length) {
        const scopeBlock = make('div', 'project-sprint-sheet-block')
        scopeBlock.append(make('strong', 'project-sprint-card-section-label', 'Sprint scope & deliverables'))
        const description = make('div', 'project-sprint-card-descriptions')
        uniqueDescriptions.forEach(text => {
          description.append(make('p', 'project-sprint-card-description', text))
        })
        scopeBlock.append(description)
        infoPane.append(scopeBlock)
      }

      const submission = sprintSubmissionContent(sprint)
      if (submission.notes.length) {
        const submissionNote = make('div', 'project-sprint-submission-note')
        submissionNote.append(make('strong', 'project-sprint-card-section-label', 'Sprint notes'))
        submission.notes.forEach(note => submissionNote.append(make('p', '', note)))
        infoPane.append(submissionNote)
      }
      if (submission.attachments.length) {
        const attachmentList = renderSprintSubmissionAttachments(submission.attachments)
        if (attachmentList.childElementCount) {
          const submissionMedia = make('div', 'project-sprint-submission-media')
          submissionMedia.append(make('strong', 'project-sprint-submission-media-title', 'Submission attachments'))
          submissionMedia.append(attachmentList)
          infoPane.append(submissionMedia)
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
        infoPane.append(submittedMetadata)
      }
      if (submission.feedback) {
        const ownerFeedback = make('div', 'project-sprint-review-comment')
        ownerFeedback.append(
          make('strong', 'project-sprint-card-section-label', 'Owner feedback'),
          make('p', '', submission.feedback)
        )
        const reviewAttachments = renderSprintSubmissionAttachments(submission.reviewAttachments)
        if (reviewAttachments.childElementCount) ownerFeedback.append(reviewAttachments)
        infoPane.append(ownerFeedback)
      } else if (submission.reviewAttachments.length) {
        const ownerFeedback = make('div', 'project-sprint-review-comment')
        ownerFeedback.append(make('strong', 'project-sprint-card-section-label', 'Owner feedback'))
        ownerFeedback.append(renderSprintSubmissionAttachments(submission.reviewAttachments))
        infoPane.append(ownerFeedback)
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
        infoPane.append(make(
          'small',
          'project-sprint-submission-metadata',
          [
            submission.reviewedBy ? `Reviewed by ${submission.reviewedBy}` : '',
            reviewedDate
          ].filter(Boolean).join(' · ')
        ))
      }

      detailGrid.append(infoPane)

      const actionPane = make('div', 'project-sprint-sheet-detail-pane is-actions')

      if (canSubmitSprint) {
        const submissionPanel = make('div', 'project-sprint-sheet-action-card')
        submissionPanel.append(make(
          'strong',
          'project-sprint-card-section-label',
          isProjectOwner ? 'Complete sprint' : 'Sprint submission'
        ))
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
            await refreshProjectTaskBoard()
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
        submissionPanel.append(submissionForm)
        actionPane.append(submissionPanel)
      }

      if (canReviewSprint) {
        const reviewPanel = make('div', 'project-sprint-sheet-action-card')
        reviewPanel.append(make('strong', 'project-sprint-card-section-label', 'Owner review'))
        const reviewForm = document.createElement('form')
        reviewForm.className = 'project-sprint-review-form no-input-icon'
        const reviewInput = document.createElement('textarea')
        reviewInput.rows = 3
        reviewInput.maxLength = 5000
        reviewInput.placeholder = 'Add optional feedback for sprint members…'
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
            await refreshProjectTaskBoard()
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
        reviewPanel.append(reviewForm)
        actionPane.append(reviewPanel)
      }

      if (actionPane.childElementCount) {
        detailGrid.append(actionPane)
      } else {
        detailGrid.classList.add('is-single-pane')
      }

      details.append(detailGrid)

      if (isProjectOwner) {
        const footerBar = make('div', 'project-sprint-sheet-detail-footer')
        const removeButton = make('button', 'project-sprint-sheet-remove-btn', 'Remove sprint')
        removeButton.type = 'button'
        removeButton.setAttribute('aria-label', `Remove ${sprint.name || 'sprint'}`)
        removeButton.title = 'Remove sprint'
        removeButton.addEventListener('click', () => removeProjectSprint(project, sprint, task, removeButton))
        footerBar.append(removeButton)
        details.append(footerBar)
      }

      detailTd.append(details)
      detailRow.append(detailTd)
      tbody.append(dataRow, detailRow)
    })

    sheetTable.append(tbody)
    sheetWrap.append(sheetTable)
    sprintSection.append(sheetWrap)
  }
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
        member.firebaseUid === project.creatorFirebaseUid ||
        (project.sprints || []).some(sprint =>
          getSprintMemberUids(sprint).includes(member.firebaseUid)
        )
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
    projectTasks.forEach((projectTask, taskIndex) => {
      const taskRow = make('article', `project-progress-aside-task${projectTask.taskId === task.taskId ? ' is-selected' : ''}`)
      const taskTop = make('button', 'project-progress-aside-task-top', '')
      taskTop.type = 'button'
      taskTop.setAttribute('aria-expanded', String(projectTask.taskId === task.taskId))
      const taskDetails = make('div', 'project-progress-aside-task-details')
      taskDetails.id = `project-progress-aside-task-details-${taskIndex}`
      taskDetails.hidden = projectTask.taskId !== task.taskId
      taskTop.setAttribute('aria-controls', taskDetails.id)
      const taskIdentity = make('div', 'project-progress-aside-task-identity')
      taskIdentity.append(make('strong', '', projectTask.title))
      if (projectTask.taskSubmissionStatus &&
        projectTask.taskSubmissionStatus !== 'Not submitted') {
        taskIdentity.append(make(
          'span',
          `project-progress-aside-submission-status is-${projectTask.taskSubmissionStatus.toLowerCase().replaceAll(' ', '-')}`,
          projectTask.taskSubmissionStatus
        ))
      }
      const taskStatus = make('span', `project-progress-aside-status is-${String(projectTask.status || 'To do').toLowerCase().replaceAll(' ', '-')}`, projectTask.status || 'To do')
      const taskExpandIcon = make('span', 'project-progress-aside-task-expand-icon', '⌄')
      taskExpandIcon.setAttribute('aria-hidden', 'true')
      taskTop.append(taskIdentity, taskStatus, taskExpandIcon)
      taskTop.addEventListener('click', () => {
        const isExpanded = taskTop.getAttribute('aria-expanded') === 'true'
        taskDetails.hidden = isExpanded
        taskTop.setAttribute('aria-expanded', String(!isExpanded))
        taskRow.classList.toggle('is-expanded', !isExpanded)
      })
      const taskMeta = make('div', 'project-progress-aside-task-meta')
      taskMeta.append(
        make('span', '', `Due · ${displayDate(projectTask.due_date)}`)
      )
      if (projectTask.description) {
        taskDetails.append(make('p', 'project-progress-aside-task-description', projectTask.description))
      }
      taskDetails.append(taskMeta)
      const taskSubmission = renderTaskSubmission(
        project,
        projectTask,
        isProjectOwner,
        async review => {
          applyTaskSubmission(projectTask, review)
          projectTask.done = projectTask.status === 'Done'
          projectTask.progress = projectTask.done ? 100 : projectTask.status === 'In progress' ? 50 : 0
          try {
            await hub.renderAdminTasksTable?.({ silent: true })
            hub.renderTasks?.()
            hub.renderWorkspaceSummary?.()
          } catch (error) {
            console.error('Task review saved, but dashboard task data could not be refreshed:', error)
            showDashboardToast('Review saved, but the dashboard task list could not be refreshed.', 'error')
          }
          const refreshedTask = tasks.find(candidate =>
            candidate.backendPersistent && candidate.taskId === projectTask.taskId
          ) || projectTask
          close()
          void openProjectProgressAside(refreshedTask)
        }
      )
      if (taskSubmission) taskDetails.append(taskSubmission)
      const canManageProjectTask = Boolean(
        currentUid && (
          isProjectOwner ||
          (project.sprints || []).some(sprint =>
            getSprintMemberUids(sprint).includes(currentUid)
          )
        )
      )
      const taskMovementLocked = (
        String(projectTask.taskSubmissionStatus || projectTask.task_submission_status || '')
          .trim().toLowerCase() !== 'completed'
      )
      if (
        canManageProjectTask &&
        projectTask.status !== 'Done'
      ) {
        const completeTaskButton = make(
          'button',
          'project-progress-aside-task-complete',
          taskMovementLocked ? 'Awaiting accepted submission' : 'Complete task'
        )
        completeTaskButton.type = 'button'
        completeTaskButton.disabled = taskMovementLocked
        if (taskMovementLocked) {
          completeTaskButton.title = 'The project owner must accept this task submission before it can be completed.'
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
        taskDetails.append(completeTaskButton)
      }
      taskRow.classList.toggle('is-expanded', projectTask.taskId === task.taskId)
      taskRow.append(taskTop, taskDetails)
      taskList.append(taskRow)
    })
  }
  taskSection.append(taskList)
  content.append(taskSection)
  aside.append(content)

  const trigger = document.activeElement
  let analysisAnimationTimer = null
  const close = () => {
    document.removeEventListener('keydown', onKeyDown)
    if (commentPollTimer) {
      clearInterval(commentPollTimer)
      commentPollTimer = null
    }
    if (analysisAnimationTimer) {
      clearInterval(analysisAnimationTimer)
      analysisAnimationTimer = null
    }
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
  requestAnimationFrame(() => {
    if (!aside.isConnected) return
    animateAnalysisCharts(aside)
    startCommentPolling()
    analysisAnimationTimer = setInterval(() => {
      if (!document.hidden && aside.isConnected) animateAnalysisCharts(aside)
    }, 5 * 60 * 1000)
  })
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
