import { getSvg } from './icons.js'
import {
  getAccessibleTasks,
  meetings,
  reminders,
  getAccessibleMembers,
  currentUser,
  make,
  closeModal,
  root,
  saveReminders,
  addAuditLog,
  pushNotification,
  hub,
  projects,
  activeView,
  renderAvatarElement
} from './state.js'
import { createProjectMeeting, deleteProjectMeeting, getMeetingProjectMembers, getSafeMeetingUrl } from './meetings.js'
import { showDashboardToast } from './modalChrome.js'
import {
  addDaysToDateKey,
  formatRelativeDate,
  getDateDayOffset,
  parseLocalDate,
  toLocalDateKey
} from './dateUtils.js'

// ============================================================
// CALENDAR TIMELINE PANEL & INTERACTIVE MONTH CALENDAR
// ============================================================

const initialToday = new Date()
export let calCurrentDate = new Date(initialToday.getFullYear(), initialToday.getMonth(), 1)
export let activeCalendarFilter = 'all' // 'all' | 'meeting' | 'task' | 'reminder'
export let selectedCalDate = toLocalDateKey()

export function setCalCurrentDate(d) { calCurrentDate = d }
export function setActiveCalendarFilter(f) { activeCalendarFilter = f }
export function setSelectedCalDate(d) { selectedCalDate = d }

function formatTimeForDisplay(time) {
  const [hours, minutes] = time.split(':').map(Number)
  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
}

function formatTimeRangeForDisplay(startTime, endTime) {
  return `${formatTimeForDisplay(startTime)} - ${formatTimeForDisplay(endTime)}`
}

function getMeetingTimeRange(meeting) {
  return meeting.startTime && meeting.endTime
    ? formatTimeRangeForDisplay(meeting.startTime, meeting.endTime)
    : meeting.time || ''
}

function getMeetingStartTime(meeting) {
  return meeting.startTime
    ? formatTimeForDisplay(meeting.startTime)
    : (meeting.time || '').split(' - ')[0]
}

export function renderCalendarPanel() {
  renderPinnedMeetingsStrip()
  renderActualCalendarGrid()
  renderCalendarDaysGrid()
}

export function renderPinnedMeetingsStrip() {
  const container = document.querySelector('#pinned-meetings-grid')
  if (!container) return
  container.replaceChildren()

  const pinned = meetings.filter(m => m.pinned)
  if (pinned.length === 0) {
    container.innerHTML = `<p class="modal-copy" style="grid-column: 1 / -1; padding: 12px; background: #FAFAFA; border-radius: 8px;">No pinned meetings scheduled. Use "+ Schedule Meeting (Pinned)" to schedule one.</p>`
    return
  }

  pinned.forEach(meet => {
    const card = make('div', 'pinned-meeting-card')
    const dateLabel = formatRelativeDate(meet.date)
    const top = make('div', 'pinned-card-top')
    const when = make('div', 'pinned-meeting-when')
    when.append(
      make('span', 'pinned-date-badge', dateLabel),
      make('time', 'pinned-meeting-time', getMeetingTimeRange(meet))
    )
    const actions = make('div', 'pinned-meeting-actions')
    actions.append(make('span', 'pinned-meeting-tag', 'Pinned'))
    if (meet.canCancel) {
      const cancel = make('button', 'action-btn delete', '×')
      cancel.type = 'button'
      cancel.setAttribute('aria-label', `Cancel ${meet.title}`)
      cancel.title = 'Cancel meeting'
      cancel.addEventListener('click', event => {
        event.stopPropagation()
        deleteMeeting(meet, cancel)
      })
      actions.append(cancel)
    }
    top.append(when, actions)

    const openButton = make('button', 'pinned-meeting-open')
    openButton.type = 'button'
    openButton.setAttribute('aria-label', `Open schedule for ${meet.title}`)
    openButton.append(
      make('h4', 'pinned-card-title', meet.title),
      make('p', 'pinned-card-notes', meet.notes || 'No agenda provided.')
    )
    openButton.addEventListener('click', () => {
      openDayScheduleModal(meet.date)
    })

    const footer = make('div', 'pinned-card-footer')
    const team = make('div', 'pinned-attendees')
    const attendeeList = make('div', 'pinned-attendee-list')
    team.append(make('span', 'pinned-attendees-label', 'Team'))
    ;(meet.attendees || []).forEach(person => {
      const avatar = make('span', `avatar pinned-attendee-avatar ${person.tone || 'teal'}-bg`)
      renderAvatarElement(avatar, person, 'pinned-attendee-avatar')
      avatar.title = person.name
      attendeeList.append(avatar)
    })
    team.append(attendeeList)
    footer.append(team)
    const meetingUrl = getSafeMeetingUrl(meet.location)
    if (meetingUrl) {
      const join = make('a', 'pinned-join-btn', 'Join Meeting')
      join.href = meetingUrl
      join.target = '_blank'
      join.rel = 'noopener noreferrer'
      join.setAttribute('aria-label', `Open meeting link for ${meet.title}`)
      footer.append(join)
    } else if (meet.location) {
      footer.append(make('span', 'meeting-location', meet.location))
    }
    card.append(top, openButton, footer)
    container.append(card)
  })
}

async function deleteMeeting(meet, button) {
  button.disabled = true
  try {
    await deleteProjectMeeting(meet)
    renderCalendarPanel()
    hub.renderAdminMeetingsTable?.()
    hub.renderWorkspaceHub?.()
    addAuditLog('Pinned meeting cancelled', `Cancelled "${meet.title}".`, 'trash')
    showDashboardToast('Meeting cancelled.')
  } catch (error) {
    button.disabled = false
    showDashboardToast(error.message || 'Unable to cancel this meeting.', 'error')
  }
}

export function renderActualCalendarGrid() {
  const monthTitle = document.querySelector('#cal-month-title')
  const grid = document.querySelector('#cal-days-month-grid')
  if (!grid) return

  const year = calCurrentDate.getFullYear()
  const month = calCurrentDate.getMonth()
  const todayKey = toLocalDateKey()

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  if (monthTitle) {
    monthTitle.textContent = `${monthNames[month]} ${year}`
  }

  grid.replaceChildren()

  const firstDayIndex = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const prevMonthDays = new Date(year, month, 0).getDate()

  const totalCells = Math.ceil((firstDayIndex + daysInMonth) / 7) * 7

  for (let i = 0; i < totalCells; i++) {
    const cell = make('div', 'cal-month-day-cell')
    let dayNum
    let cellDateStr
    let isCurrentMonth = true

    if (i < firstDayIndex) {
      dayNum = prevMonthDays - (firstDayIndex - 1 - i)
      cell.classList.add('other-month')
      isCurrentMonth = false
      const mStr = String(month === 0 ? 12 : month).padStart(2, '0')
      const yStr = month === 0 ? year - 1 : year
      cellDateStr = `${yStr}-${mStr}-${String(dayNum).padStart(2, '0')}`
    } else if (i >= firstDayIndex + daysInMonth) {
      dayNum = i - (firstDayIndex + daysInMonth) + 1
      cell.classList.add('other-month')
      isCurrentMonth = false
      const mStr = String(month === 11 ? 1 : month + 2).padStart(2, '0')
      const yStr = month === 11 ? year + 1 : year
      cellDateStr = `${yStr}-${mStr}-${String(dayNum).padStart(2, '0')}`
    } else {
      dayNum = i - firstDayIndex + 1
      cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`

      if (cellDateStr === todayKey) {
        cell.classList.add('is-today')
      }
    }

    if (selectedCalDate === cellDateStr) {
      cell.style.borderColor = '#1C1C1F'
      cell.style.boxShadow = '0 0 0 2px rgba(28,28,31,0.12)'
    }

    const dayNumEl = make('div', 'cal-day-num')
    dayNumEl.textContent = `${dayNum}`
    if (cellDateStr === todayKey && isCurrentMonth) {
      const todayBadge = make('span', '', 'TODAY')
      todayBadge.style.cssText = 'font-size: 9px; background: #F5B800; color: #1C1C1F; border-radius: 4px; padding: 1px 5px; font-weight: 800;'
      dayNumEl.append(todayBadge)
    }
    cell.append(dayNumEl)

    const dayMeetings = meetings.filter(m => m.date === cellDateStr)
    const dayTasks = getAccessibleTasks().filter(t => t.date === cellDateStr)

    const dayReminders = reminders.filter(r => r.date === cellDateStr)

    if (activeCalendarFilter === 'all' || activeCalendarFilter === 'meeting') {
      dayMeetings.forEach(m => {
        const pin = make('div', 'cal-event-pin meeting')
        pin.title = `PINNED MEETING: ${m.title} (${getMeetingTimeRange(m)})`
        pin.append(make('span', '', '📍'))
        const time = make('time', '', getMeetingStartTime(m))
        if (m.startTime) time.dateTime = `${m.date}T${m.startTime}`
        pin.append(time, make('span', '', m.title))
        pin.addEventListener('click', (e) => {
          e.stopPropagation()
          openDayScheduleModal(cellDateStr)
        })
        cell.append(pin)
      })
    }

    if (activeCalendarFilter === 'all' || activeCalendarFilter === 'task') {
      dayTasks.forEach(t => {
        const workChip = make('div', 'cal-event-pin work')
        workChip.title = `Deliverable: ${t.title} (${t.project}) • Assignee: ${t.assignee}`
        workChip.innerHTML = `<span>📋</span> <span>${t.title}</span> <small>(${t.assignee})</small>`
        cell.append(workChip)
      })
    }

    if (activeCalendarFilter === 'all' || activeCalendarFilter === 'reminder') {
      dayReminders.forEach(r => {
        const remChip = make('div', 'cal-event-pin reminder')
        remChip.title = `Reminder: ${r.title} (${r.time})`
        remChip.innerHTML = `<span>🔔</span> <span>${r.title}</span>`
        cell.append(remChip)
      })
    }

    cell.addEventListener('click', () => {
      selectedCalDate = cellDateStr
      openDayScheduleModal(cellDateStr)
      renderActualCalendarGrid()
    })

    grid.append(cell)
  }
}

export function openDayScheduleModal(dateStr) {
  const backdrop = make('div', 'modal-backdrop')
  const modal = make('div', 'modal')
  modal.style.maxWidth = '560px'

  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)

  const dayMeetings = meetings.filter(m => m.date === dateStr)
  const dayTasks = getAccessibleTasks().filter(t => t.date === dateStr)
  const dayReminders = reminders.filter(r => r.date === dateStr)

  const todayKey = toLocalDateKey()
  const tomorrowKey = addDaysToDateKey(todayKey, 1)
  const dateFormatted = `${dateStr === todayKey ? 'Today (' : dateStr === tomorrowKey ? 'Tomorrow (' : ''}${new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(parseLocalDate(dateStr))}${dateStr === todayKey || dateStr === tomorrowKey ? ')' : ''}`

  const title = make('h2', '', `Schedule for ${dateFormatted}`)
  const copy = make('p', 'modal-copy', 'Pinned collaboration syncs, deliverable deadlines, and reminders for this day.')

  const contentWrap = make('div', 'day-modal-content')
  contentWrap.style.display = 'flex'
  contentWrap.style.flexDirection = 'column'
  contentWrap.style.gap = '14px'
  contentWrap.style.margin = '16px 0'

  const meetSec = make('div', 'day-modal-section')
  meetSec.innerHTML = `<h4 style="font-size: 13px; font-weight: 700; color: #1C1C1F; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;"><span>📍</span> Pinned Team Meetings (${dayMeetings.length})</h4>`
  if (dayMeetings.length === 0) {
    meetSec.innerHTML += `<p class="modal-copy" style="font-size: 11px;">No meetings scheduled for this date.</p>`
  } else {
    dayMeetings.forEach(m => {
      const row = make('div', 'day-meet-row')
      row.style.background = '#FFFBEB'
      row.style.border = '1px solid #FDE68A'
      row.style.borderRadius = '8px'
      row.style.padding = '8px 12px'
      row.style.display = 'flex'
      row.style.justifyContent = 'space-between'
      row.style.alignItems = 'center'
      const description = make('div')
      const meetingTitle = make('strong', '', `📍 ${m.title}`)
      meetingTitle.style.fontSize = '12px'
      meetingTitle.style.color = '#92400E'
      meetingTitle.style.display = 'block'
      const details = make('small', '', `${getMeetingTimeRange(m)} • Host: ${m.host}`)
      details.style.color = '#71717A'
      details.style.fontSize = '11px'
      description.append(meetingTitle, details)
      row.append(description)
      const meetingUrl = getSafeMeetingUrl(m.location)
      if (meetingUrl) {
        const join = make('a', 'pinned-join-btn', 'Join Meeting')
        join.href = meetingUrl
        join.target = '_blank'
        join.rel = 'noopener noreferrer'
        row.append(join)
      } else if (m.location) {
        row.append(make('span', 'meeting-location', m.location))
      }
      meetSec.append(row)
    })
  }
  contentWrap.append(meetSec)

  const taskSec = make('div', 'day-modal-section')
  taskSec.innerHTML = `<h4 style="font-size: 13px; font-weight: 700; color: #1C1C1F; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;"><span>📋</span> Scheduled Work Deliverables (${dayTasks.length})</h4>`
  if (dayTasks.length === 0) {
    taskSec.innerHTML += `<p class="modal-copy" style="font-size: 11px;">No deliverable deadlines for this date.</p>`
  } else {
    dayTasks.forEach(t => {
      const row = make('div', 'day-task-row')
      row.style.background = '#F8FAFC'
      row.style.border = '1px solid #E2E8F0'
      row.style.borderRadius = '8px'
      row.style.padding = '8px 12px'
      row.style.display = 'flex'
      row.style.justifyContent = 'space-between'
      row.style.alignItems = 'center'
      row.innerHTML = `
        <div>
          <strong style="font-size: 12px; color: #1E293B; display: block;">📋 ${t.title}</strong>
          <small style="color: #64748B; font-size: 11px;">${t.project} • Assignee: <b>${t.assignee}</b> (${t.assigneeName || t.assignee})</small>
        </div>
        <span class="status-badge ${t.status.toLowerCase().replace(' ', '-')}">${t.status}</span>
      `
      taskSec.append(row)
    })
  }
  contentWrap.append(taskSec)

  if (dayReminders.length > 0) {
    const remSec = make('div', 'day-modal-section')
    remSec.innerHTML = `<h4 style="font-size: 13px; font-weight: 700; color: #1C1C1F; margin-bottom: 6px;">🔔 Reminders (${dayReminders.length})</h4>`
    dayReminders.forEach(r => {
      const rBox = make('div', '')
      rBox.style.background = '#FAF5FF'
      rBox.style.border = '1px solid #F3E8FF'
      rBox.style.borderRadius = '6px'
      rBox.style.padding = '6px 10px'
      rBox.style.fontSize = '12px'
      rBox.style.color = '#6B21A8'
      rBox.innerHTML = `🔔 <strong>${r.title}</strong> • ${r.time} (${r.priority} Priority)`
      remSec.append(rBox)
    })
    contentWrap.append(remSec)
  }

  const actionsRow = make('div', 'modal-actions-row')
  actionsRow.style.display = 'flex'
  actionsRow.style.gap = '8px'
  actionsRow.style.marginTop = '16px'

  const scheduleBtn = make('button', 'primary-button gold', '+ Schedule Meeting')
  scheduleBtn.type = 'button'
  scheduleBtn.addEventListener('click', () => {
    closeModal()
    openScheduleMeetingModal(dateStr)
  })

  const addTaskBtn = make('button', 'outline-button-action', '+ Add Deliverable')
  addTaskBtn.type = 'button'
  addTaskBtn.addEventListener('click', () => {
    closeModal()
    hub.openAdminTaskModal?.('To do', null, dateStr)
  })

  const addRemBtn = make('button', 'outline-button-action', '+ Add Reminder')
  addRemBtn.type = 'button'
  addRemBtn.addEventListener('click', () => {
    closeModal()
    openAddReminderModal(dateStr)
  })

  actionsRow.append(scheduleBtn, addTaskBtn, addRemBtn)

  modal.append(close, title, copy, contentWrap, actionsRow)
  backdrop.append(modal)
  root.replaceChildren(backdrop)
}

export function renderCalendarDaysGrid() {
  const grid = document.querySelector('#calendar-days-grid')
  if (!grid) return
  grid.replaceChildren()

  const today = new Date()
  const todayKey = toLocalDateKey(today)
  const tomorrowKey = addDaysToDateKey(todayKey, 1)
  const weekEndKey = addDaysToDateKey(todayKey, 6 - today.getDay())
  const nextWeekEndKey = addDaysToDateKey(weekEndKey, 7)
  const columns = [
    {
      label: 'Today',
      filterFn: t => t.date === todayKey && t.status !== 'Done'
    },
    {
      label: 'Tomorrow',
      filterFn: t => t.date === tomorrowKey && t.status !== 'Done'
    },
    {
      label: 'This Week',
      filterFn: t => t.date > tomorrowKey && t.date <= weekEndKey && t.status !== 'Done'
    },
    {
      label: 'Next Week',
      filterFn: t => t.date > weekEndKey && t.date <= nextWeekEndKey && t.status !== 'Done'
    },
    {
      label: 'Completed',
      filterFn: t => t.status === 'Done'
    }
  ]

  columns.forEach(col => {
    const colTasks = getAccessibleTasks().filter(col.filterFn)
    const colEl = make('div', 'calendar-day-col')
    colEl.dataset.urgency = col.label.toLowerCase().replace(' ', '-')

    const titleEl = make('div', 'calendar-day-title')
    const titleLabel = make('span', 'calendar-day-title-label')
    titleLabel.append(make('span', 'calendar-day-status-dot'), make('span', '', col.label))
    titleEl.append(titleLabel, make('span', 'calendar-day-count', `${colTasks.length}`))
    colEl.append(titleEl)

    if (colTasks.length === 0) {
      colEl.append(make('p', 'calendar-day-empty', col.label === 'Completed' ? 'No completed milestones yet.' : 'No tasks scheduled.'))
    } else {
      colTasks.forEach(t => {
        const chip = make('div', 'calendar-task-chip')
        const assignee = getAccessibleMembers().find(member => member.initials === t.assignee)
        const assigneeName = t.assigneeName || assignee?.name || t.assignee || 'Unassigned'
        const assigneeTone = t.assigneeTone || assignee?.tone || 'teal'
        chip.setAttribute('aria-label', `${t.title}, ${t.project}, assigned to ${assigneeName}`)
        chip.innerHTML = `
          <div class="calendar-task-top">
            <span class="calendar-task-project">${t.project}</span>
            <span class="calendar-task-due">${t.due || col.label}</span>
          </div>
          <strong>${t.title}</strong>
          <div class="calendar-chip-meta">
            <span class="calendar-task-assignee"><span class="avatar calendar-task-avatar ${assigneeTone}-bg">${t.assignee || '?'}</span><span>${assigneeName}</span></span>
            <span class="calendar-task-category">${t.tag || 'Task'}</span>
          </div>
        `
        colEl.append(chip)
      })
    }
    grid.append(colEl)
  })
}

export function createScheduleCalendarPicker(initialStartDate = toLocalDateKey(), initialDueDate = toLocalDateKey()) {
  let startDate = initialStartDate || toLocalDateKey()
  let dueDate = initialDueDate || toLocalDateKey()
  let activeField = 'due'

  const initialDateObj = parseLocalDate(dueDate)
  let curYear = isNaN(initialDateObj.getFullYear()) ? new Date().getFullYear() : initialDateObj.getFullYear()
  let curMonth = isNaN(initialDateObj.getMonth()) ? new Date().getMonth() : initialDateObj.getMonth()

  const container = make('div', 'cal-schedule-picker-card')

  const header = make('div', 'cal-schedule-header')
  const title = make('div', 'cal-schedule-title')
  title.innerHTML = `${getSvg('calendar', 'meta-icon', 13, 13)} <span>Due Date / Schedule Timeline</span>`
  
  const summary = make('div', 'cal-schedule-summary')
  header.append(title, summary)

  const presetsRow = make('div', 'cal-schedule-presets')
  const todayKey = toLocalDateKey()
  const today = parseLocalDate(todayKey)
  const tomorrowKey = addDaysToDateKey(todayKey, 1)
  const thisWeekEndKey = addDaysToDateKey(todayKey, 6 - today.getDay())
  const nextWeekStartKey = addDaysToDateKey(thisWeekEndKey, 1)
  const nextWeekEndKey = addDaysToDateKey(nextWeekStartKey, 6)
  const presets = [
    { label: 'Today', start: todayKey, due: todayKey },
    { label: 'Tomorrow', start: todayKey, due: tomorrowKey },
    { label: 'This Week', start: todayKey, due: thisWeekEndKey },
    { label: 'Next Week', start: nextWeekStartKey, due: nextWeekEndKey },
    { label: 'Sprint (2 Wks)', start: todayKey, due: addDaysToDateKey(todayKey, 13) }
  ]

  const inputsRow = make('div', 'cal-date-inputs-row')
  
  const startField = make('div', 'cal-date-input-field')
  const startLabel = make('label', '', 'Start Date')
  const startInput = make('input')
  startInput.type = 'date'
  startInput.value = startDate
  startField.append(startLabel, startInput)

  const dueField = make('div', 'cal-date-input-field')
  const dueLabel = make('label', '', 'Due Date')
  const dueInput = make('input')
  dueInput.type = 'date'
  dueInput.value = dueDate
  dueField.append(dueLabel, dueInput)

  inputsRow.append(startField, dueField)

  const modeBar = make('div', 'cal-mode-selector')
  const modeStartBtn = make('button', 'cal-mode-btn', '📅 Pick Start Date')
  modeStartBtn.type = 'button'
  const modeDueBtn = make('button', 'cal-mode-btn active', '🎯 Pick Due Date')
  modeDueBtn.type = 'button'
  modeBar.append(modeStartBtn, modeDueBtn)

  const miniCal = make('div', 'mini-cal-container')
  const calNav = make('div', 'mini-cal-nav')
  const calTitle = make('span', 'mini-cal-month-title')
  
  const btnGroup = make('div', 'mini-cal-btn-group')
  const prevBtn = make('button', 'mini-cal-nav-btn', '‹')
  prevBtn.type = 'button'
  const todayBtn = make('button', 'mini-cal-today-btn', 'Today')
  todayBtn.type = 'button'
  const nextBtn = make('button', 'mini-cal-nav-btn', '›')
  nextBtn.type = 'button'
  btnGroup.append(prevBtn, todayBtn, nextBtn)
  calNav.append(calTitle, btnGroup)

  const weekdaysRow = make('div', 'mini-cal-weekdays')
  ;['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].forEach(w => {
    weekdaysRow.append(make('span', '', w))
  })

  const daysGrid = make('div', 'mini-cal-grid')
  const instruction = make('div', 'mini-cal-instruction')
  instruction.innerHTML = `<span>👆 Click any date on the calendar to set Start or Due date</span>`

  miniCal.append(calNav, weekdaysRow, daysGrid, instruction)

  container.append(header, presetsRow, inputsRow, modeBar, miniCal)

  const presetPills = []

  function renderGrid() {
    daysGrid.replaceChildren()
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    calTitle.textContent = `${monthNames[curMonth]} ${curYear}`

    const firstDay = new Date(curYear, curMonth, 1)
    const lastDay = new Date(curYear, curMonth + 1, 0)
    const daysInMonth = lastDay.getDate()
    
    let startDayOfWeek = firstDay.getDay() - 1
    if (startDayOfWeek === -1) startDayOfWeek = 6

    const prevMonthLastDay = new Date(curYear, curMonth, 0).getDate()
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDay - i
      const cell = make('div', 'mini-cal-day other-month', dayNum)
      daysGrid.append(cell)
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${curYear}-${String(curMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const cell = make('div', 'mini-cal-day', day)

      if (dateStr === toLocalDateKey()) cell.classList.add('is-today')

      const isStart = dateStr === startDate
      const isDue = dateStr === dueDate
      const inRange = startDate && dueDate && dateStr > startDate && dateStr < dueDate

      if (isStart) cell.classList.add('range-start')
      if (isDue) cell.classList.add('range-end')
      if (inRange) cell.classList.add('in-range')

      cell.addEventListener('click', () => {
        if (activeField === 'start') {
          startDate = dateStr
          if (dueDate < startDate) dueDate = startDate
          activeField = 'due'
        } else {
          if (dateStr < startDate) {
            startDate = dateStr
            dueDate = dateStr
          } else {
            dueDate = dateStr
          }
        }
        updateSummaryAndUI()
      })

      daysGrid.append(cell)
    }

    const totalCells = startDayOfWeek + daysInMonth
    const remaining = (7 - (totalCells % 7)) % 7
    for (let i = 1; i <= remaining; i++) {
      const cell = make('div', 'mini-cal-day other-month', i)
      daysGrid.append(cell)
    }
  }

  function updateSummaryAndUI() {
    startInput.value = startDate
    dueInput.value = dueDate

    modeStartBtn.className = activeField === 'start' ? 'cal-mode-btn active' : 'cal-mode-btn'
    modeDueBtn.className = activeField === 'due' ? 'cal-mode-btn active' : 'cal-mode-btn'

    if (activeField === 'start') {
      startField.classList.add('active-field')
      dueField.classList.remove('active-field')
    } else {
      dueField.classList.add('active-field')
      startField.classList.remove('active-field')
    }

    presetPills.forEach((p, idx) => {
      const preset = presets[idx]
      if (preset.start === startDate && preset.due === dueDate) {
        p.classList.add('active')
      } else {
        p.classList.remove('active')
      }
    })

    const sDate = parseLocalDate(startDate)
    const dDate = parseLocalDate(dueDate)
    const diffDays = Math.max(1, getDateDayOffset(dueDate, sDate) + 1)

    const friendly = formatRelativeDate(dueDate)
    const sMonth = sDate.toLocaleString('default', { month: 'short' })
    const dMonth = dDate.toLocaleString('default', { month: 'short' })

    const dateRangeStr = startDate === dueDate 
      ? `${dMonth} ${dDate.getDate()}, ${dDate.getFullYear()}${friendly ? ` • ${friendly}` : ''}`
      : `${sMonth} ${sDate.getDate()} ➔ ${dMonth} ${dDate.getDate()} (${diffDays} days)${friendly ? ` • ${friendly}` : ''}`

    summary.innerHTML = `<span>🗓️</span> <strong>${dateRangeStr}</strong>`

    renderGrid()
  }

  presets.forEach(p => {
    const pill = make('button', 'cal-preset-pill', p.label)
    pill.type = 'button'
    pill.addEventListener('click', () => {
      startDate = p.start
      dueDate = p.due
      activeField = 'due'
      const d = parseLocalDate(p.due)
      curYear = d.getFullYear()
      curMonth = d.getMonth()
      updateSummaryAndUI()
    })
    presetsRow.append(pill)
    presetPills.push(pill)
  })

  startInput.addEventListener('change', () => {
    if (startInput.value) {
      startDate = startInput.value
      if (dueDate < startDate) dueDate = startDate
      const d = parseLocalDate(startDate)
      curYear = d.getFullYear()
      curMonth = d.getMonth()
      updateSummaryAndUI()
    }
  })

  dueInput.addEventListener('change', () => {
    if (dueInput.value) {
      dueDate = dueInput.value
      if (startDate > dueDate) startDate = dueDate
      const d = parseLocalDate(dueDate)
      curYear = d.getFullYear()
      curMonth = d.getMonth()
      updateSummaryAndUI()
    }
  })

  startInput.addEventListener('focus', () => {
    activeField = 'start'
    updateSummaryAndUI()
  })

  dueInput.addEventListener('focus', () => {
    activeField = 'due'
    updateSummaryAndUI()
  })

  modeStartBtn.addEventListener('click', () => {
    activeField = 'start'
    updateSummaryAndUI()
  })

  modeDueBtn.addEventListener('click', () => {
    activeField = 'due'
    updateSummaryAndUI()
  })

  prevBtn.addEventListener('click', () => {
    curMonth--
    if (curMonth < 0) {
      curMonth = 11
      curYear--
    }
    renderGrid()
  })

  nextBtn.addEventListener('click', () => {
    curMonth++
    if (curMonth > 11) {
      curMonth = 0
      curYear++
    }
    renderGrid()
  })

  todayBtn.addEventListener('click', () => {
    const todayKey = toLocalDateKey()
    const today = parseLocalDate(todayKey)
    curYear = today.getFullYear()
    curMonth = today.getMonth()
    startDate = todayKey
    dueDate = todayKey
    activeField = 'due'
    updateSummaryAndUI()
  })

  updateSummaryAndUI()

  return {
    element: container,
    getValues: () => {
      return {
        startDate,
        dueDate,
        dueLabel: formatRelativeDate(dueDate)
      }
    }
  }
}

export function openScheduleMeetingModal(prefilledDate = toLocalDateKey()) {
  const backdrop = make('div', 'modal-backdrop')
  const form = make('form', 'modal')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)

  const title = make('h2', '', 'Schedule Team Meeting')
  const copy = make('p', 'modal-copy', 'Schedule a meeting for a project you own or have joined.')

  const projectLabel = make('label', '', 'Project')
  const projectSelect = document.createElement('select')
  projectSelect.required = true
  projects.forEach(project => {
    const option = make('option', '', project.name)
    option.value = project.projectId
    projectSelect.append(option)
  })
  const activeProject = projects.find(project => project.name === activeView)
  if (activeProject) projectSelect.value = activeProject.projectId
  projectLabel.append(projectSelect)

  const attendeesFieldset = document.createElement('fieldset')
  attendeesFieldset.className = 'meeting-attendees-fieldset'
  const attendeesLegend = document.createElement('legend')
  attendeesLegend.textContent = 'Invite project members'
  const attendeesList = make('div', 'meeting-attendees-options')
  attendeesFieldset.append(attendeesLegend, attendeesList)
  const renderAttendeeOptions = () => {
    attendeesList.replaceChildren()
    getMeetingProjectMembers(projectSelect.value).forEach(person => {
      const label = make('label', 'checkbox-label')
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.name = 'meetingAttendee'
      checkbox.value = person.firebaseUid
      checkbox.checked = true
      label.append(checkbox, make('span', '', person.name))
      attendeesList.append(label)
    })
  }
  projectSelect.addEventListener('change', renderAttendeeOptions)
  renderAttendeeOptions()
  if (!projects.length) {
    projectSelect.disabled = true
    attendeesFieldset.disabled = true
    copy.textContent = 'Create or join a project before scheduling a project meeting.'
  }

  const titleLabel = make('label', '', 'Meeting Title')
  const titleInput = make('input')
  titleInput.required = true
  titleInput.maxLength = 255
  titleInput.placeholder = 'e.g. Sprint 2 Planning & Review'
  titleLabel.append(titleInput)

  const dateLabel = make('label', '', 'Date')
  const dateInput = make('input')
  dateInput.type = 'date'
  dateInput.value = prefilledDate
  dateInput.required = true
  dateLabel.append(dateInput)

  const timeRange = make('div', 'form-row meeting-time-range')
  const startTimeLabel = make('label', '', 'Start time')
  const startTimeInput = make('input')
  startTimeInput.type = 'time'
  startTimeInput.value = '10:00'
  startTimeInput.step = '900'
  startTimeInput.required = true
  startTimeLabel.append(startTimeInput)

  const endTimeLabel = make('label', '', 'End time')
  const endTimeInput = make('input')
  endTimeInput.type = 'time'
  endTimeInput.value = '11:00'
  endTimeInput.step = '900'
  endTimeInput.required = true
  endTimeLabel.append(endTimeInput)
  const validateMeetingTime = () => {
    endTimeInput.setCustomValidity(
      endTimeInput.value && startTimeInput.value && endTimeInput.value <= startTimeInput.value
        ? 'End time must be later than start time.'
        : ''
    )
  }
  startTimeInput.addEventListener('input', validateMeetingTime)
  endTimeInput.addEventListener('input', validateMeetingTime)
  timeRange.append(startTimeLabel, endTimeLabel)

  const pinLabel = make('label', 'checkbox-label', '')
  pinLabel.style.display = 'flex'
  pinLabel.style.alignItems = 'center'
  pinLabel.style.gap = '8px'
  pinLabel.style.margin = '4px 0'
  const pinInput = document.createElement('input')
  pinInput.type = 'checkbox'
  pinInput.checked = true
  pinLabel.append(pinInput, make('span', '', '📍 Pin this meeting on the Calendar for all team members'))

  const locLabel = make('label', '', 'Meeting Link / Location')
  const locInput = make('input')
  locInput.type = 'text'
  locInput.maxLength = 2048
  locInput.placeholder = 'https://meet.google.com/... or a physical location'
  locInput.title = 'Enter an HTTPS or HTTP meeting link, or a physical location.'
  locLabel.append(locInput)

  const notesLabel = make('label', '', 'Agenda & Discussion Topics')
  const notesInput = document.createElement('textarea')
  notesInput.rows = 2
  notesInput.maxLength = 10000
  notesInput.placeholder = 'Key discussion points for this collaborative sync...'
  notesLabel.append(notesInput)

  const submit = make('button', 'primary-button gold', 'Schedule & Pin Meeting')
  submit.type = 'submit'
  submit.disabled = projects.length === 0

  form.append(close, title, copy, projectLabel, attendeesFieldset, titleLabel, dateLabel, timeRange, pinLabel, locLabel, notesLabel, submit)
  backdrop.append(form)
  root.replaceChildren(backdrop)

  form.addEventListener('submit', async e => {
    e.preventDefault()
    validateMeetingTime()
    if (!form.reportValidity()) return
    if (!projectSelect.value) {
      showDashboardToast('Choose a project before scheduling a meeting.')
      return
    }
    submit.disabled = true
    try {
      const newMeet = await createProjectMeeting(projectSelect.value, {
        title: titleInput.value.trim(),
        date: dateInput.value,
        startTime: startTimeInput.value,
        endTime: endTimeInput.value,
        pinned: pinInput.checked,
        location: locInput.value.trim(),
        notes: notesInput.value.trim(),
        attendeeFirebaseUids: [...attendeesList.querySelectorAll('input[name="meetingAttendee"]:checked')]
          .map(input => input.value)
      })
      closeModal()
      renderCalendarPanel()
      hub.renderAdminMeetingsTable?.()
      hub.renderWorkspaceHub?.()
      addAuditLog('Project meeting scheduled', `${newMeet.title} scheduled for ${newMeet.meeting_date}.`, 'sync')
      pushNotification('New Team Meeting Scheduled', `${newMeet.title} on ${newMeet.meeting_date}`, '📅', 'coral-bg')
      showDashboardToast('Meeting scheduled.')
    } catch (error) {
      submit.disabled = false
      showDashboardToast(error.message || 'Unable to schedule this meeting.', 'error')
    }
  })
}

export function openAddReminderModal(prefilledDate = toLocalDateKey()) {
  const backdrop = make('div', 'modal-backdrop')
  const form = make('form', 'modal')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)

  const title = make('h2', '', 'Add Team Reminder')
  const copy = make('p', 'modal-copy', 'Set a deadline alert or deliverable check on the calendar.')

  const titleLabel = make('label', '', 'Reminder Title')
  const titleInput = make('input')
  titleInput.required = true
  titleInput.placeholder = 'e.g. Submit newsletter draft copy'
  titleLabel.append(titleInput)

  const dateLabel = make('label', '', 'Date')
  const dateInput = make('input')
  dateInput.type = 'date'
  dateInput.value = prefilledDate
  dateInput.required = true
  dateLabel.append(dateInput)

  const timeLabel = make('label', '', 'Time')
  const timeInput = make('input')
  timeInput.type = 'time'
  timeInput.value = '09:00'
  timeInput.step = '900'
  timeInput.required = true
  timeLabel.append(timeInput)

  const prioLabel = make('label', '', 'Priority')
  const prioSelect = document.createElement('select')
  ;['Normal', 'High', 'Urgent'].forEach(p => {
    const opt = make('option', '', p)
    prioSelect.append(opt)
  })
  prioLabel.append(prioSelect)

  const submit = make('button', 'primary-button gold', 'Save Reminder')
  submit.type = 'submit'

  form.append(close, title, copy, titleLabel, dateLabel, timeLabel, prioLabel, submit)
  backdrop.append(form)
  root.replaceChildren(backdrop)

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const newRem = {
      id: `rem-${Date.now()}`,
      title: titleInput.value.trim(),
      date: dateInput.value,
      timeValue: timeInput.value,
      time: formatTimeForDisplay(timeInput.value),
      priority: prioSelect.value,
      author: currentUser.name
    }
    reminders.push(newRem)
    saveReminders()
    closeModal()
    renderCalendarPanel()
    addAuditLog('Reminder added', `${newRem.title} on ${newRem.date}`, 'bell')
  })
}
