import { activeView, addAuditLog, hub, make, meetings, projects } from './state.js'
import { deleteProjectMeeting, getSafeMeetingUrl } from './meetings.js'
import { openScheduleMeetingModal } from './calendar.js'
import { formatRelativeDate, toLocalDateKey } from './dateUtils.js'
import { showDashboardConfirmation, showDashboardToast } from './modalChrome.js'

const formatMeetingTime = time => {
  const [hours, minutes] = time.split(':').map(Number)
  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
}

const meetingStart = meeting => new Date(`${meeting.date}T${meeting.startTime}:00`)
const meetingEnd = meeting => new Date(`${meeting.date}T${meeting.endTime}:00`)

function createMeetingCard(meeting) {
  const now = new Date()
  const start = meetingStart(meeting)
  const end = meetingEnd(meeting)
  const isLive = start <= now && end >= now
  const isPast = end < now
  const card = make('article', `meetings-page-card${isLive ? ' is-live' : ''}`)
  const date = new Date(`${meeting.date}T12:00:00`)
  const dateBlock = make('div', 'meetings-page-date')
  dateBlock.append(
    make('span', '', new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date)),
    make('strong', '', new Intl.DateTimeFormat(undefined, { day: 'numeric' }).format(date)),
    make('small', '', new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date))
  )

  const details = make('div', 'meetings-page-details')
  const status = make('span', `meetings-page-status${isLive ? ' is-live' : ''}`,
    isLive ? 'In progress' : isPast ? 'Past meeting' : formatRelativeDate(meeting.date))
  const title = make('h3', '', meeting.title)
  const meta = make('div', 'meetings-page-meta')
  meta.append(
    make('span', '', `${formatMeetingTime(meeting.startTime)} - ${formatMeetingTime(meeting.endTime)}`),
    make('span', 'meetings-page-project', meeting.projectName || 'Project meeting'),
    make('span', '', `${meeting.attendees.length} attendee${meeting.attendees.length === 1 ? '' : 's'}`)
  )
  details.append(status, title, meta)
  if (meeting.location && !getSafeMeetingUrl(meeting.location)) {
    details.append(make('p', 'meetings-page-location', meeting.location))
  }
  if (meeting.notes) details.append(make('p', 'meetings-page-notes', meeting.notes))

  const actions = make('div', 'meetings-page-actions')
  const meetingUrl = getSafeMeetingUrl(meeting.meetingUrl || meeting.location)
  if (meetingUrl && !isPast) {
    const join = make('a', 'meetings-page-join', isLive ? 'Join meeting' : 'Open meeting link')
    join.href = meetingUrl
    join.target = '_blank'
    join.rel = 'noopener noreferrer'
    join.setAttribute('aria-label', `${isLive ? 'Join' : 'Open'} meeting: ${meeting.title}`)
    actions.append(join)

    const copy = make('button', 'meetings-page-copy', 'Copy link')
    copy.type = 'button'
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(meetingUrl)
        showDashboardToast('Meeting link copied.')
      } catch (error) {
        console.error('Unable to copy meeting link:', error)
        showDashboardToast('Meeting link could not be copied.', 'error')
      }
    })
    actions.append(copy)
  }

  if (meeting.canCancel) {
    const cancel = make('button', 'meetings-page-cancel', 'Cancel')
    cancel.type = 'button'
    cancel.addEventListener('click', async () => {
      const confirmed = await showDashboardConfirmation({
        title: 'Cancel this meeting?',
        message: `"${meeting.title}" will be removed from the project schedule.`,
        confirmText: 'Cancel meeting',
        danger: true
      })
      if (!confirmed) return
      cancel.disabled = true
      try {
        await deleteProjectMeeting(meeting)
        renderMeetingsPage()
        hub.renderCalendarPanel?.()
        hub.renderAdminMeetingsTable?.()
        hub.renderWorkspaceHub?.()
        addAuditLog('Project meeting canceled', `Meeting "${meeting.title}" canceled.`, 'trash')
        showDashboardToast('Meeting cancelled.')
      } catch (error) {
        cancel.disabled = false
        showDashboardToast(error.message || 'Unable to cancel this meeting.', 'error')
      }
    })
    actions.append(cancel)
  }

  card.append(dateBlock, details, actions)
  return card
}

function renderMeetingGroup(container, title, items, emptyMessage) {
  const section = make('section', 'meetings-page-group')
  const heading = make('div', 'meetings-page-group-heading')
  heading.append(make('h2', '', title), make('span', '', String(items.length)))
  section.append(heading)

  if (!items.length) {
    section.append(make('p', 'meetings-page-empty', emptyMessage))
  } else {
    const list = make('div', 'meetings-page-list')
    items.forEach(meeting => list.append(createMeetingCard(meeting)))
    section.append(list)
  }
  container.append(section)
}

export function renderMeetingsPage() {
  const container = document.querySelector('#meetings-page-container')
  if (!container || activeView !== 'Meetings') return
  container.replaceChildren()

  const now = new Date()
  const ordered = [...meetings].sort((first, second) =>
    meetingStart(first) - meetingStart(second)
  )
  const upcoming = ordered.filter(meeting => meetingEnd(meeting) >= now)
  const past = ordered.filter(meeting => meetingEnd(meeting) < now).reverse()
  const todaysCount = upcoming.filter(meeting => meeting.date === toLocalDateKey(now)).length

  const header = make('header', 'meetings-page-header')
  const heading = make('div', 'meetings-page-heading')
  heading.append(
    make('p', 'meetings-page-eyebrow', 'TEAM SCHEDULE'),
    make('h1', '', 'Meetings'),
    make('p', '', 'Plan team syncs, keep meeting details together, and open the shared meeting link.')
  )
  heading.querySelector('h1').id = 'meetings-page-title'
  const schedule = make('button', 'primary-button gold meetings-page-schedule', 'Schedule meeting')
  schedule.type = 'button'
  schedule.disabled = !projects.length
  schedule.addEventListener('click', () => openScheduleMeetingModal())
  const instant = make('button', 'primary-button meetings-page-schedule', 'Start instant meeting')
  instant.type = 'button'
  instant.disabled = !projects.length
  instant.addEventListener('click', () => openScheduleMeetingModal(undefined, { instant: true }))
  const actions = make('div', 'meetings-page-header-actions')
  actions.append(instant, schedule)
  header.append(heading, actions)
  container.append(header)

  const summary = make('div', 'meetings-page-summary')
  const upcomingMetric = make('div', 'meetings-page-metric')
  upcomingMetric.append(make('span', '', 'Upcoming'), make('strong', '', String(upcoming.length)))
  const todayMetric = make('div', 'meetings-page-metric')
  todayMetric.append(make('span', '', 'Today'), make('strong', '', String(todaysCount)))
  const nextMeeting = upcoming[0]
  const nextMetric = make('div', 'meetings-page-metric meetings-page-next')
  nextMetric.append(
    make('span', '', 'Next meeting'),
    make('strong', '', nextMeeting ? `${nextMeeting.title} - ${formatRelativeDate(nextMeeting.date)}` : 'Nothing scheduled')
  )
  summary.append(upcomingMetric, todayMetric, nextMetric)
  container.append(summary)

  if (!meetings.length && !projects.length) {
    container.append(make('p', 'meetings-page-empty', 'Join or create a project to schedule a team meeting.'))
    return
  }
  renderMeetingGroup(container, 'Upcoming meetings', upcoming, 'No upcoming meetings. Schedule one to get your team together.')
  if (past.length) renderMeetingGroup(container, 'Past meetings', past, '')
}
