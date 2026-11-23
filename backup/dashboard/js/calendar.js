import { getSvg } from './icons.js'
import {
  getAccessibleTasks,
  meetings,
  reminders,
  make,
  closeModal,
  root,
  addAuditLog,
  hub,
  projects,
  activeView,
  renderAvatarElement
} from './state.js'
import { createProjectMeeting, deleteProjectMeeting, getMeetingProjectMembers, getSafeMeetingUrl } from './meetings.js'
import { createProjectReminder } from './calendarData.js'
import { showDashboardToast } from './modalChrome.js'
import { openMeteredMeetingModal } from './meteredMeetingModal.js'
import {
  addDaysToDateKey,
  formatRelativeDate,
  getDateDayOffset,
  normalizeDateKey,
  parseLocalDate,
  toLocalDateKey,
  notBeforeTodayDateKey,
  getEarliestDateTimeInput
} from './dateUtils.js?v=20261117-date-input-validation'

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
    if (!meet.isEnded && new Date(`${meet.date}T${meet.endTime}:00`) >= new Date()) {
      const join = make('button', 'pinned-join-btn', 'Join Meeting')
      join.type = 'button'
      join.setAttribute('aria-label', `Join ${meet.title}`)
      join.addEventListener('click', () => openMeteredMeetingModal(meet))
      footer.append(join)
    } else if (meet.isEnded) {
      footer.append(make('span', 'meeting-ended-label', 'Meeting ended'))
    }
    const meetingUrl = getSafeMeetingUrl(meet.location)
    if (meetingUrl && !meet.isEnded) {
      const externalLink = make('a', 'pinned-join-btn', 'Open link')
      externalLink.href = meetingUrl
      externalLink.target = '_blank'
      externalLink.rel = 'noopener noreferrer'
      footer.append(externalLink)
    }
    if (meet.location && !getSafeMeetingUrl(meet.location)) {
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
        workChip.title = `Task: ${t.title} (${t.project})`
        workChip.append(
          make('span', '', '📋'),
          make('span', '', t.title),
          make('small', '', `(${t.project})`)
        )
        cell.append(workChip)
      })
    }

    if (activeCalendarFilter === 'all' || activeCalendarFilter === 'reminder') {
      dayReminders.forEach(r => {
        const remChip = make('div', 'cal-event-pin reminder')
        remChip.title = `Reminder: ${r.title} (${r.time}) · ${r.projectName}`
        remChip.append(make('span', '', '🔔'), make('span', '', `${r.title} · ${r.projectName}`))
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
      if (!m.isEnded && new Date(`${m.date}T${m.endTime}:00`) >= new Date()) {
        const join = make('button', 'pinned-join-btn', 'Join Meeting')
        join.type = 'button'
        join.addEventListener('click', () => openMeteredMeetingModal(m))
        row.append(join)
      } else if (m.isEnded) {
        row.append(make('span', 'meeting-ended-label', 'Meeting ended'))
      }
      const meetingUrl = getSafeMeetingUrl(m.location)
      if (meetingUrl && !m.isEnded) {
        const externalLink = make('a', 'pinned-join-btn', 'Open link')
        externalLink.href = meetingUrl
        externalLink.target = '_blank'
        externalLink.rel = 'noopener noreferrer'
        row.append(externalLink)
      }
      if (m.location && !getSafeMeetingUrl(m.location)) {
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
      const description = make('div')
      const taskTitle = make('strong', '', `📋 ${t.title}`)
      taskTitle.style.fontSize = '12px'
      taskTitle.style.color = '#1E293B'
      taskTitle.style.display = 'block'
      const taskDetails = make('small', '', t.project)
      taskDetails.style.color = '#64748B'
      taskDetails.style.fontSize = '11px'
      description.append(taskTitle, taskDetails)
      const status = make('span', `status-badge ${t.status.toLowerCase().replace(' ', '-')}`, t.status)
      row.append(description, status)
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
      rBox.textContent = `🔔 ${r.title} • ${r.time} (${r.priority} Priority) · ${r.projectName}`
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

  const addRemBtn = make('button', 'outline-button-action', '+ Add Reminder')
  addRemBtn.type = 'button'
  addRemBtn.addEventListener('click', () => {
    closeModal()
    openAddReminderModal(dateStr)
  })

  actionsRow.append(scheduleBtn, addRemBtn)

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
        const sprintMemberNames = (t.sprintMembers || [])
          .map(member => member.name || member.email)
          .filter(Boolean)
        chip.setAttribute(
          'aria-label',
          `${t.title}, ${t.project}`
        )
        const taskTop = make('div', 'calendar-task-top')
        taskTop.append(
          make('span', 'calendar-task-project', t.project),
          make('span', 'calendar-task-due', t.due || col.label)
        )
        const taskTitle = make('strong', '', t.title)
        const meta = make('div', 'calendar-chip-meta')
        meta.append(
          make('span', 'calendar-task-category', t.tag || 'Task')
        )
        if (sprintMemberNames.length) {
          chip.title = `Project sprint members: ${sprintMemberNames.join(', ')}`
        }
        chip.append(taskTop, taskTitle, meta)
        colEl.append(chip)
      })
    }
    grid.append(colEl)
  })
}

export function createDropdownDatePicker(
  initialDate = '',
  {
    minDate: requestedMinDate = null,
    maxDate: requestedMaxDate = null,
    onChange
  } = {}
) {
  let selectedDate = normalizeDateKey(initialDate) || ''
  let minDate = normalizeDateKey(requestedMinDate)
  let maxDate = normalizeDateKey(requestedMaxDate)
  const initialMonthDate = parseLocalDate(selectedDate || minDate || toLocalDateKey())
  let monthDate = new Date(initialMonthDate.getFullYear(), initialMonthDate.getMonth(), 1)

  const container = make('div', 'cal-sprint-date-picker')
  const trigger = make('button', 'cal-sprint-date-trigger')
  trigger.type = 'button'
  trigger.setAttribute('aria-haspopup', 'dialog')
  trigger.setAttribute('aria-expanded', 'false')
  trigger.setAttribute('aria-label', 'Choose sprint due date')
  const triggerLabel = make('span', 'cal-sprint-date-trigger-label', 'Select a date')
  const triggerDate = make('span', 'cal-sprint-date-trigger-date')
  trigger.append(triggerLabel, triggerDate)

  const popover = make('div', 'cal-sprint-date-popover project-time-span-calendar-grid')
  popover.hidden = true
  popover.setAttribute('role', 'dialog')
  popover.setAttribute('aria-label', 'Sprint due date calendar')
  const panel = make('section', 'project-time-span-calendar')
  const heading = make('h4', 'project-time-span-calendar-heading', 'Sprint due date')
  const header = make('div', 'cal-sprint-date-header')
  const headerDate = make('span', 'cal-sprint-date-header-value')
  header.append(heading, headerDate)
  const navigation = make('div', 'project-time-span-calendar-navigation')
  const previous = make('button', 'project-time-span-calendar-nav', '‹')
  previous.type = 'button'
  previous.setAttribute('aria-label', 'Show previous month')
  const month = make('div', 'project-time-span-calendar-month')
  const next = make('button', 'project-time-span-calendar-nav', '›')
  next.type = 'button'
  next.setAttribute('aria-label', 'Show next month')
  navigation.append(previous, month, next)
  const weekdays = make('div', 'project-time-span-calendar-weekdays')
  ;['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].forEach(day => {
    weekdays.append(make('span', '', day))
  })
  const days = make('div', 'project-time-span-calendar-days')
  const selectedDateOutput = make('output', 'project-time-span-selected-date')
  selectedDateOutput.setAttribute('aria-live', 'polite')
  panel.append(header, navigation, weekdays, days, selectedDateOutput)
  popover.append(panel)
  container.append(trigger, popover)

  const formatDate = dateKey => dateKey
    ? new Intl.DateTimeFormat(undefined, {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date(`${dateKey}T00:00:00Z`))
    : 'Select a date'

  const setOpen = isOpen => {
    popover.hidden = !isOpen
    trigger.setAttribute('aria-expanded', String(isOpen))
    container.classList.toggle('is-open', isOpen)
    if (isOpen) renderCalendar()
  }

  const renderCalendar = () => {
    const year = monthDate.getFullYear()
    const monthIndex = monthDate.getMonth()
    const monthStart = new Date(year, monthIndex, 1)
    const minimumMonth = minDate ? parseLocalDate(minDate) : null
    const maximumMonth = maxDate ? parseLocalDate(maxDate) : null
    month.textContent = new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric'
    }).format(monthDate)
    previous.disabled = Boolean(minimumMonth &&
      monthStart <= new Date(minimumMonth.getFullYear(), minimumMonth.getMonth(), 1))
    next.disabled = Boolean(maximumMonth &&
      monthStart >= new Date(maximumMonth.getFullYear(), maximumMonth.getMonth(), 1))
    days.replaceChildren()

    const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7
    for (let blank = 0; blank < firstWeekday; blank += 1) {
      days.append(make('span', 'project-time-span-calendar-blank'))
    }

    const todayKey = toLocalDateKey()
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const outsideRange = Boolean((minDate && dateKey < minDate) || (maxDate && dateKey > maxDate))
      const dayButton = make('button', 'project-time-span-calendar-day', String(day))
      dayButton.type = 'button'
      dayButton.disabled = outsideRange
      dayButton.setAttribute('aria-label', formatDate(dateKey))
      dayButton.setAttribute('aria-pressed', String(dateKey === selectedDate))
      if (dateKey === todayKey) dayButton.classList.add('is-today')
      if (dateKey === selectedDate) dayButton.classList.add('is-end-date')
      dayButton.addEventListener('click', () => {
        selectedDate = dateKey
        updateSelection()
        onChange?.(selectedDate)
        setOpen(false)
        trigger.focus()
      })
      days.append(dayButton)
    }

    selectedDateOutput.textContent = formatDate(selectedDate)
    headerDate.textContent = selectedDate ? formatDate(selectedDate) : 'Select a date'
  }

  const updateSelection = () => {
    triggerDate.textContent = formatDate(selectedDate)
    selectedDateOutput.textContent = formatDate(selectedDate)
    headerDate.textContent = selectedDate ? formatDate(selectedDate) : 'Select a date'
    renderCalendar()
  }

  previous.addEventListener('click', () => {
    if (previous.disabled) return
    monthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1)
    renderCalendar()
  })
  next.addEventListener('click', () => {
    if (next.disabled) return
    monthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1)
    renderCalendar()
  })
  trigger.addEventListener('click', () => setOpen(popover.hidden))
  container.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !popover.hidden) {
      setOpen(false)
      trigger.focus()
    }
  })
  const closeOnOutsidePointer = event => {
    if (!container.isConnected) {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      return
    }
    if (!container.contains(event.target)) setOpen(false)
  }
  document.addEventListener('pointerdown', closeOnOutsidePointer)

  updateSelection()

  return {
    element: container,
    getValue: () => selectedDate,
    setValue: value => {
      selectedDate = normalizeDateKey(value) || ''
      if (selectedDate) {
        const selected = parseLocalDate(selectedDate)
        monthDate = new Date(selected.getFullYear(), selected.getMonth(), 1)
      }
      updateSelection()
      onChange?.(selectedDate)
    },
    setRange: (minimum, maximum) => {
      minDate = normalizeDateKey(minimum)
      maxDate = normalizeDateKey(maximum)
      const currentMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
      const minimumMonth = minDate ? parseLocalDate(minDate) : null
      const maximumMonth = maxDate ? parseLocalDate(maxDate) : null
      if (minimumMonth && currentMonth < new Date(minimumMonth.getFullYear(), minimumMonth.getMonth(), 1)) {
        monthDate = new Date(minimumMonth.getFullYear(), minimumMonth.getMonth(), 1)
      } else if (maximumMonth &&
        currentMonth > new Date(maximumMonth.getFullYear(), maximumMonth.getMonth(), 1)) {
        monthDate = new Date(maximumMonth.getFullYear(), maximumMonth.getMonth(), 1)
      }
      renderCalendar()
    },
    focus: () => trigger.focus()
  }
}

export function createScheduleCalendarPicker(
  initialStartDate = toLocalDateKey(),
  initialDueDate = toLocalDateKey(),
  { minDate: requestedMinDate, maxDate = null, onDateChange } = {}
) {
  const todayKey = toLocalDateKey()
  const projectStartDate = normalizeDateKey(requestedMinDate)
  const projectDueDate = normalizeDateKey(maxDate)
  const minDate = projectStartDate && projectStartDate > todayKey
    ? projectStartDate
    : todayKey
  const validMaxDate = projectDueDate && projectDueDate >= minDate
    ? projectDueDate
    : null
  const clampToProjectRange = value => {
    const dateKey = normalizeDateKey(value)
    if (!dateKey) return minDate
    if (dateKey < minDate) return minDate
    if (validMaxDate && dateKey > validMaxDate) return validMaxDate
    return dateKey
  }
  let startDate = clampToProjectRange(initialStartDate)
  let dueDate = clampToProjectRange(initialDueDate)
  if (dueDate < startDate) dueDate = startDate

  const container = make('div', 'cal-schedule-picker-card')

  const header = make('div', 'cal-schedule-header')
  const title = make('div', 'cal-schedule-title')
  title.innerHTML = `${getSvg('calendar', 'meta-icon', 13, 13)} <span>Due Date / Schedule Timeline</span>`
  
  const summary = make('div', 'cal-schedule-summary')
  header.append(title, summary)

  const presetsRow = make('div', 'cal-schedule-presets')
  const today = parseLocalDate(todayKey)
  const tomorrowKey = addDaysToDateKey(todayKey, 1)
  const thisWeekEndKey = addDaysToDateKey(todayKey, 6 - today.getDay())
  const nextWeekStartKey = addDaysToDateKey(thisWeekEndKey, 1)
  const nextWeekEndKey = addDaysToDateKey(nextWeekStartKey, 6)
  const presets = [
    { label: 'Today', start: todayKey, due: todayKey },
    { label: 'Tomorrow', start: todayKey, due: tomorrowKey },
    { label: 'This Week', start: todayKey, due: thisWeekEndKey },
    { label: 'Next Week', start: nextWeekStartKey, due: nextWeekEndKey }
  ]

  const calendarGrid = make('div', 'project-time-span-calendar-grid cal-schedule-calendar-grid')
  const firstMonth = new Date(parseLocalDate(startDate).getFullYear(), parseLocalDate(startDate).getMonth(), 1)
  const startDueMonth = new Date(parseLocalDate(dueDate).getFullYear(), parseLocalDate(dueDate).getMonth(), 1)
  const panels = [
    { key: 'start', label: 'Start Date', monthDate: firstMonth },
    { key: 'due', label: 'Due Date', monthDate: startDueMonth }
  ].map(({ key, label, monthDate }) => {
    const panel = make('section', 'project-time-span-calendar')
    const heading = make('h4', 'project-time-span-calendar-heading', label)
    const navigation = make('div', 'project-time-span-calendar-navigation')
    const previous = make('button', 'project-time-span-calendar-nav', '‹')
    previous.type = 'button'
    previous.setAttribute('aria-label', `Show previous ${label.toLowerCase()} month`)
    const month = make('div', 'project-time-span-calendar-month')
    const next = make('button', 'project-time-span-calendar-nav', '›')
    next.type = 'button'
    next.setAttribute('aria-label', `Show next ${label.toLowerCase()} month`)
    navigation.append(previous, month, next)
    const weekdays = make('div', 'project-time-span-calendar-weekdays')
    ;['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].forEach(day => {
      weekdays.append(make('span', '', day))
    })
    const days = make('div', 'project-time-span-calendar-days')
    const selectedDate = make('output', 'project-time-span-selected-date')
    selectedDate.setAttribute('aria-live', 'polite')
    panel.append(heading, navigation, weekdays, days, selectedDate)
    calendarGrid.append(panel)
    const state = { key, month, days, selectedDate, monthDate, previous, next }
    previous.addEventListener('click', () => {
      if (previous.disabled) return
      state.monthDate = new Date(state.monthDate.getFullYear(), state.monthDate.getMonth() - 1, 1)
      renderCalendars()
    })
    next.addEventListener('click', () => {
      state.monthDate = new Date(state.monthDate.getFullYear(), state.monthDate.getMonth() + 1, 1)
      renderCalendars()
    })
    return state
  })

  container.append(header, presetsRow, calendarGrid)

  const presetPills = []

  function renderCalendars() {
    const minMonth = parseLocalDate(minDate)
    const minimumMonth = new Date(minMonth.getFullYear(), minMonth.getMonth(), 1)
    const maxMonth = validMaxDate ? parseLocalDate(validMaxDate) : null
    const maximumMonth = maxMonth
      ? new Date(maxMonth.getFullYear(), maxMonth.getMonth(), 1)
      : null
    panels.forEach(panel => {
      const { monthDate, key, month, days, selectedDate, previous, next } = panel
      const year = monthDate.getFullYear()
      const monthIndex = monthDate.getMonth()
      const monthStart = new Date(year, monthIndex, 1)
      month.textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(monthDate)
      previous.disabled = monthStart <= minimumMonth
      next.disabled = Boolean(maximumMonth && monthStart >= maximumMonth)
      days.replaceChildren()

      const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7
      for (let blank = 0; blank < firstWeekday; blank += 1) {
        days.append(make('span', 'project-time-span-calendar-blank'))
      }

      const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
      const selectedKey = key === 'start' ? startDate : dueDate
      for (let day = 1; day <= daysInMonth; day += 1) {
        const dateKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const isStart = dateKey === startDate
        const isDue = dateKey === dueDate
        const beforeStart = key === 'due' && dateKey < startDate
        const outsideRange = dateKey < minDate || Boolean(validMaxDate && dateKey > validMaxDate)
        const dayButton = make('button', 'project-time-span-calendar-day', String(day))
        dayButton.type = 'button'
        dayButton.dataset.dateKey = dateKey
        dayButton.disabled = outsideRange || beforeStart
        dayButton.setAttribute('aria-label', new Intl.DateTimeFormat('en-US', {
          timeZone: 'UTC',
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        }).format(new Date(`${dateKey}T00:00:00Z`)))
        dayButton.setAttribute('aria-pressed', String(dateKey === selectedKey))
        if (dateKey === todayKey) dayButton.classList.add('is-today')
        if (isStart) dayButton.classList.add('is-start-date')
        if (isDue) dayButton.classList.add('is-end-date')
        if (dateKey > startDate && dateKey < dueDate) dayButton.classList.add('is-in-range')
        dayButton.addEventListener('click', () => {
          if (key === 'start') {
            startDate = dateKey
            if (dueDate < startDate) {
              dueDate = startDate
              panels.find(item => item.key === 'due').monthDate = new Date(year, monthIndex, 1)
            }
          } else {
            dueDate = dateKey
          }
          updateSummaryAndUI()
          panel.days.querySelector(`[data-date-key="${dateKey}"]`)?.focus()
        })
        days.append(dayButton)
      }

      selectedDate.textContent = selectedKey
        ? new Intl.DateTimeFormat('en-US', {
          timeZone: 'UTC',
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }).format(new Date(`${selectedKey}T00:00:00Z`))
        : 'Select a date'
    })
  }

  function updateSummaryAndUI() {

    presetPills.forEach((p, idx) => {
      const preset = presets[idx]
      const presetStart = clampToProjectRange(preset.start)
      let presetDue = clampToProjectRange(preset.due)
      if (presetDue < presetStart) presetDue = presetStart
      if (presetStart === startDate && presetDue === dueDate) {
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

    onDateChange?.({ startDate, dueDate })
    renderCalendars()
  }

  presets.forEach(p => {
    const pill = make('button', 'cal-preset-pill', p.label)
    pill.type = 'button'
    pill.addEventListener('click', () => {
      startDate = clampToProjectRange(p.start)
      dueDate = clampToProjectRange(p.due)
      if (dueDate < startDate) dueDate = startDate
      const startMonth = parseLocalDate(startDate)
      const dueMonth = parseLocalDate(dueDate)
      const startPanel = panels.find(panel => panel.key === 'start')
      const duePanel = panels.find(panel => panel.key === 'due')
      startPanel.monthDate = new Date(startMonth.getFullYear(), startMonth.getMonth(), 1)
      duePanel.monthDate = new Date(dueMonth.getFullYear(), dueMonth.getMonth(), 1)
      updateSummaryAndUI()
    })
    presetsRow.append(pill)
    presetPills.push(pill)
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

export function openScheduleMeetingModal(prefilledDate = toLocalDateKey(), { instant = false } = {}) {
  const instantStart = new Date()
  instantStart.setSeconds(0, 0)
  if (instant) instantStart.setMinutes(instantStart.getMinutes() + 1)
  const instantEnd = new Date(instantStart.getTime() + 60 * 60 * 1000)
  const timeStep = instant ? 60 : 900
  const earliestTime = getEarliestDateTimeInput(timeStep)
  if (instant && toLocalDateKey(instantEnd) !== toLocalDateKey(instantStart)) {
    instantEnd.setTime(instantStart.getTime())
    instantEnd.setHours(23, 59, 0, 0)
    if (instantEnd <= instantStart) {
      instantStart.setDate(instantStart.getDate() + 1)
      instantStart.setHours(0, 0, 0, 0)
      instantEnd.setTime(instantStart.getTime() + 60 * 60 * 1000)
    }
  }
  const formatInputTime = date =>
    `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  const backdrop = make('div', 'modal-backdrop')
  const form = make('form', 'modal')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)

  const title = make('h2', '', instant ? 'Start Instant Meeting' : 'Schedule Team Meeting')
  const copy = make('p', 'modal-copy', instant
    ? 'Create a video meeting room and invite your project members to join now.'
    : 'Schedule a meeting for a project you own or have joined.')

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

  const titleLabel = make('label', 'no-input-icon', 'Meeting Title')
  const titleInput = make('input')
  titleInput.required = true
  titleInput.maxLength = 255
  titleInput.placeholder = 'e.g. Sprint 2 Planning & Review'
  titleLabel.append(titleInput)

  const dateLabel = make('label', '', 'Date')
  const dateInput = make('input')
  dateInput.type = 'date'
  dateInput.value = notBeforeTodayDateKey(
    instant ? toLocalDateKey(instantStart) : prefilledDate,
    earliestTime.date
  )
  dateInput.required = true
  dateLabel.append(dateInput)

  const timeRange = make('div', 'form-row meeting-time-range')
  const startTimeLabel = make('label', '', 'Start time')
  const startTimeInput = make('input')
  startTimeInput.type = 'time'
  startTimeInput.value = instant ? formatInputTime(instantStart) : '10:00'
  startTimeInput.step = String(timeStep)
  if (dateInput.value === earliestTime.date && startTimeInput.value < earliestTime.time) {
    startTimeInput.value = earliestTime.time
  }
  startTimeInput.required = true
  startTimeLabel.append(startTimeInput)

  const endTimeLabel = make('label', '', 'End time')
  const endTimeInput = make('input')
  endTimeInput.type = 'time'
  endTimeInput.value = instant ? formatInputTime(instantEnd) : '11:00'
  endTimeInput.step = String(timeStep)
  if (dateInput.value === earliestTime.date && endTimeInput.value <= startTimeInput.value) {
    const adjustedEnd = new Date(`2000-01-01T${startTimeInput.value}:00`)
    adjustedEnd.setMinutes(adjustedEnd.getMinutes() + (instant ? 60 : 15))
    endTimeInput.value = formatInputTime(adjustedEnd)
  }
  endTimeInput.required = true
  endTimeLabel.append(endTimeInput)
  const updateMeetingTimeLimits = () => {
    const earliest = getEarliestDateTimeInput(timeStep)
    dateInput.min = earliest.date
    startTimeInput.min = dateInput.value === earliest.date ? earliest.time : ''
    endTimeInput.min = dateInput.value === earliest.date ? earliest.time : ''
    if (startTimeInput.min && startTimeInput.value < startTimeInput.min) {
      startTimeInput.value = startTimeInput.min
    }
    if (endTimeInput.min && endTimeInput.value < endTimeInput.min) {
      endTimeInput.value = endTimeInput.min
    }
  }
  const toSelectedDateTime = time => {
    if (!dateInput.value || !time) return null
    const selected = new Date(`${dateInput.value}T${time}:00`)
    return Number.isNaN(selected.getTime()) ? null : selected
  }
  const validateMeetingTime = () => {
    updateMeetingTimeLimits()
    const now = new Date()
    const selectedStart = toSelectedDateTime(startTimeInput.value)
    const selectedEnd = toSelectedDateTime(endTimeInput.value)
    startTimeInput.setCustomValidity(
      selectedStart && selectedStart <= now
        ? 'Start time must be in the future.'
        : ''
    )
    endTimeInput.setCustomValidity(
      selectedEnd && selectedEnd <= now
        ? 'End time must be in the future.'
        : selectedEnd && selectedStart && selectedEnd <= selectedStart
          ? 'End time must be later than start time.'
          : ''
    )
  }
  updateMeetingTimeLimits()
  startTimeInput.addEventListener('input', validateMeetingTime)
  endTimeInput.addEventListener('input', validateMeetingTime)
  dateInput.addEventListener('input', validateMeetingTime)
  dateInput.addEventListener('change', validateMeetingTime)
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

  const locLabel = make('label', '', 'Additional Link / Physical Location')
  const locInput = make('input')
  locInput.type = 'text'
  locInput.maxLength = 2048
  locInput.placeholder = 'Optional: address or another meeting link'
  locInput.title = 'Enter an optional HTTPS or HTTP meeting link, or a physical location.'
  locLabel.append(locInput)

  const notesLabel = make('label', 'no-input-icon', 'Agenda & Discussion Topics')
  const notesInput = document.createElement('textarea')
  notesInput.rows = 2
  notesInput.maxLength = 10000
  notesInput.placeholder = 'Key discussion points for this collaborative sync...'
  notesLabel.append(notesInput)

  const submit = make('button', 'primary-button gold', 'Schedule & Pin Meeting')
  submit.type = 'submit'
  submit.disabled = projects.length === 0
  const submitText = instant ? 'Create meeting' : 'Schedule & Pin Meeting'
  const submitLabel = make('span', '', submitText)
  const submitSpinner = make('span', 'form-submit-spinner')
  submitSpinner.setAttribute('aria-hidden', 'true')
  submitSpinner.hidden = true
  submit.replaceChildren(submitSpinner, submitLabel)

  if (instant) titleInput.value = 'Instant team meeting'
  form.append(close, title, copy, projectLabel, attendeesFieldset, titleLabel, dateLabel, timeRange, pinLabel, locLabel, notesLabel, submit)
  backdrop.append(form)
  root.replaceChildren(backdrop)

  form.addEventListener('submit', async e => {
    e.preventDefault()
    validateMeetingTime()
    if (!form.reportValidity()) return
    if (!projectSelect.value) {
      showDashboardToast('Choose a project before scheduling a meeting.', 'error')
      return
    }
    submit.disabled = true
    submitSpinner.hidden = false
    submitLabel.textContent = instant ? 'Creating room…' : 'Scheduling…'
    submit.setAttribute('aria-busy', 'true')
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
      hub.renderMeetingsPage?.()
      hub.renderAdminMeetingsTable?.()
      hub.renderWorkspaceHub?.()
      addAuditLog('Project meeting scheduled', `${newMeet.title} scheduled for ${newMeet.meeting_date}.`, 'sync')
      if (instant) {
        const attendeeUids = new Set(newMeet.attendee_firebase_uids || [])
        openMeteredMeetingModal({
          id: newMeet.meeting_id,
          projectId: newMeet.project_id,
          title: newMeet.title,
          attendees: getMeetingProjectMembers(projectSelect.value)
            .filter(member => attendeeUids.has(member.firebaseUid))
        })
      } else {
        showDashboardToast('Meeting scheduled.')
      }
    } catch (error) {
      submit.disabled = false
      submitSpinner.hidden = true
      submitLabel.textContent = submitText
      submit.removeAttribute('aria-busy')
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
  const copy = make('p', 'modal-copy', 'Set a project reminder visible to everyone with access to that project.')

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
  if (!projects.length) {
    projectSelect.disabled = true
    copy.textContent = 'Create or join a project before adding a reminder.'
  }

  const titleLabel = make('label', '', 'Reminder Title')
  const titleInput = make('input')
  titleInput.required = true
  titleInput.maxLength = 255
  titleInput.placeholder = 'e.g. Submit newsletter draft copy'
  titleLabel.append(titleInput)

  const dateLabel = make('label', '', 'Date')
  const dateInput = make('input')
  dateInput.type = 'date'
  const earliestTime = getEarliestDateTimeInput(900)
  dateInput.value = notBeforeTodayDateKey(prefilledDate, earliestTime.date)
  dateInput.required = true
  dateLabel.append(dateInput)

  const timeLabel = make('label', '', 'Time')
  const timeInput = make('input')
  timeInput.type = 'time'
  timeInput.value = '09:00'
  timeInput.step = '900'
  if (dateInput.value === earliestTime.date && timeInput.value < earliestTime.time) {
    timeInput.value = earliestTime.time
  }
  timeInput.required = true
  timeLabel.append(timeInput)
  const validateReminderTime = () => {
    const earliest = getEarliestDateTimeInput(900)
    dateInput.min = earliest.date
    timeInput.min = dateInput.value === earliest.date ? earliest.time : ''
    if (timeInput.min && timeInput.value < timeInput.min) {
      timeInput.value = timeInput.min
    }
    if (!dateInput.value || !timeInput.value) {
      timeInput.setCustomValidity('')
      return
    }
    const selected = new Date(`${dateInput.value}T${timeInput.value}:00`)
    timeInput.setCustomValidity(
      !Number.isNaN(selected.getTime()) && selected <= new Date()
        ? 'Reminder time must be in the future.'
        : ''
    )
  }
  validateReminderTime()
  dateInput.addEventListener('input', validateReminderTime)
  dateInput.addEventListener('change', validateReminderTime)
  timeInput.addEventListener('input', validateReminderTime)
  timeInput.addEventListener('change', validateReminderTime)

  const prioLabel = make('label', '', 'Priority')
  const prioSelect = document.createElement('select')
  ;['Normal', 'High', 'Urgent'].forEach(p => {
    const opt = make('option', '', p)
    prioSelect.append(opt)
  })
  prioLabel.append(prioSelect)

  const submit = make('button', 'primary-button gold', 'Save Reminder')
  submit.type = 'submit'
  submit.disabled = projects.length === 0
  const submitLabel = make('span', '', 'Save Reminder')
  const submitSpinner = make('span', 'form-submit-spinner')
  submitSpinner.setAttribute('aria-hidden', 'true')
  submitSpinner.hidden = true
  submit.replaceChildren(submitSpinner, submitLabel)

  form.append(close, title, copy, projectLabel, titleLabel, dateLabel, timeLabel, prioLabel, submit)
  backdrop.append(form)
  root.replaceChildren(backdrop)

  form.addEventListener('submit', async e => {
    e.preventDefault()
    validateReminderTime()
    if (!form.reportValidity()) return
    if (!projectSelect.value) {
      showDashboardToast('Choose a project before adding a reminder.', 'error')
      return
    }
    submit.disabled = true
    submitSpinner.hidden = false
    submitLabel.textContent = 'Saving Reminder…'
    submit.setAttribute('aria-busy', 'true')
    try {
      const newRem = await createProjectReminder(projectSelect.value, {
        title: titleInput.value.trim(),
        date: dateInput.value,
        time: timeInput.value,
        priority: prioSelect.value
      })
      closeModal()
      renderCalendarPanel()
      addAuditLog('Project reminder added', `${newRem.title} on ${newRem.date} in ${newRem.projectName}.`, 'bell')
      showDashboardToast('Reminder saved.')
    } catch (error) {
      submit.disabled = false
      submitSpinner.hidden = true
      submitLabel.textContent = 'Save Reminder'
      submit.removeAttribute('aria-busy')
      showDashboardToast(error.message || 'Unable to save this reminder.', 'error')
    }
  })
}
