import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { AuthUser } from '../../auth/authClient.js'
import { openExistingMeetingRoom } from '../../meetingRoom.js'
import { dashboardApi } from '../../services/dashboardApi.js'
import { useDashboardData } from '../../state/DashboardDataContext.js'
import type { Project, ProjectMeeting, ProjectReminder, ProjectTask } from '../../types/dashboard.js'
import styles from './Meetings.module.css'

type Modal = 'schedule' | 'reminder' | null
type CalendarFilter = 'all' | 'meeting' | 'task' | 'reminder'

interface MeetingsProps {
  user: AuthUser
  activeProjectName: string
}

interface MeetingView extends ProjectMeeting {
  date: string
  startTime: string
  endTime: string
  attendees: string[]
  canCancel: boolean
  location: string
  notes: string
  meetingUrl: string
  ended: boolean
}

const localDateKey = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const datePart = (value: string) => value.slice(0, 10)
const timePart = (value: string) => value.slice(0, 5)

function meetingStart(meeting: MeetingView) {
  return new Date(`${meeting.date}T${meeting.startTime}:00`)
}

function meetingEnd(meeting: MeetingView) {
  return new Date(`${meeting.date}T${meeting.endTime}:00`)
}

function formatTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return new Intl.DateTimeFormat(undefined, options).format(new Date(`${value}T12:00:00`))
}

function safeMeetingUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''
  } catch {
    return ''
  }
}

function projectPeople(project: Project) {
  const people = [
    { firebaseUid: project.creator_firebase_uid, name: project.creator_name || project.creator_email || 'Project owner' },
    ...project.accepted_members.map((member) => ({ firebaseUid: member.firebaseUid, name: member.name || member.email || 'Project member' })),
  ]
  return [...new Map(people.filter((person) => person.firebaseUid).map((person) => [person.firebaseUid, person])).values()]
}

function asMeeting(record: ProjectMeeting, project: Project, uid: string): MeetingView {
  return {
    ...record,
    date: datePart(record.meeting_date),
    startTime: timePart(record.start_time),
    endTime: timePart(record.end_time),
    attendees: Array.isArray(record.attendee_firebase_uids) ? record.attendee_firebase_uids : [],
    canCancel: record.host_firebase_uid === uid || project.creator_firebase_uid === uid,
    location: record.location || '',
    notes: record.notes || '',
    meetingUrl: record.meeting_url || '',
    ended: Boolean(record.ended_at),
  }
}

function CalendarGrid({
  month,
  selectedDate,
  filter,
  meetings,
  tasks,
  reminders,
  onMonthChange,
  onSelect,
}: {
  month: Date
  selectedDate: string
  filter: CalendarFilter
  meetings: MeetingView[]
  tasks: ProjectTask[]
  reminders: ProjectReminder[]
  onMonthChange: (month: Date) => void
  onSelect: (date: string) => void
}) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1)
  const gridStart = new Date(firstDay)
  gridStart.setDate(1 - firstDay.getDay())
  const cellCount = Math.ceil((firstDay.getDay() + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7) * 7
  const days = Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    const key = localDateKey(date)
    return {
      date,
      key,
      meetings: meetings.filter((meeting) => meeting.date === key),
      tasks: tasks.filter((task) => task.due_date && datePart(task.due_date) === key),
      reminders: reminders.filter((reminder) => datePart(reminder.reminder_date) === key),
    }
  })

  return (
    <section className={styles.calendar} aria-label="Meetings calendar">
      <header className={styles.calendarHeader}>
        <div>
          <h2>{new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(month)}</h2>
          <p>Meetings, project deadlines, and reminders</p>
        </div>
        <div className={styles.calendarControls}>
          <label className={styles.filter}>
            <span className={styles.visuallyHidden}>Show calendar events</span>
            <select value={filter} onChange={(event) => onSelect(`filter:${event.target.value}`)}>
              <option value="all">All events</option>
              <option value="meeting">Meetings</option>
              <option value="task">Tasks</option>
              <option value="reminder">Reminders</option>
            </select>
          </label>
          <button type="button" aria-label="Previous month" onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
          <button type="button" aria-label="Next month" onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
        </div>
      </header>
      <div className={styles.weekdays} aria-hidden="true">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className={styles.monthGrid}>
        {days.map((day) => {
          const currentMonth = day.date.getMonth() === month.getMonth()
          const today = day.key === localDateKey()
          return (
            <button
              aria-label={`${formatDate(day.key, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}${today ? ', today' : ''}`}
              aria-pressed={selectedDate === day.key}
              className={`${styles.day} ${!currentMonth ? styles.otherMonth : ''} ${today ? styles.today : ''} ${selectedDate === day.key ? styles.selectedDay : ''}`}
              key={day.key}
              onClick={() => onSelect(day.key)}
              type="button"
            >
              <span className={styles.dayNumber}>{day.date.getDate()}</span>
              {(filter === 'all' || filter === 'meeting') && day.meetings.slice(0, 2).map((meeting) => (
                <span className={`${styles.event} ${styles.meetingEvent}`} key={meeting.meeting_id}>{meeting.title}</span>
              ))}
              {(filter === 'all' || filter === 'task') && day.tasks.slice(0, 1).map((task) => (
                <span className={`${styles.event} ${styles.taskEvent}`} key={task.task_id}>{task.title}</span>
              ))}
              {(filter === 'all' || filter === 'reminder') && day.reminders.slice(0, 1).map((reminder) => (
                <span className={`${styles.event} ${styles.reminderEvent}`} key={reminder.reminder_id}>{reminder.title}</span>
              ))}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function MeetingModal({
  mode,
  projects,
  activeProjectName,
  selectedDate,
  currentUid,
  instant,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  mode: Exclude<Modal, null>
  projects: Project[]
  activeProjectName: string
  selectedDate: string
  currentUid: string
  instant: boolean
  submitting: boolean
  error: string
  onClose: () => void
  onSubmit: (data: Record<string, unknown>, projectId: string) => Promise<void>
}) {
  const initialProject = projects.find((project) => project.name === activeProjectName) || projects[0]
  const now = new Date()
  const initialDate = selectedDate < localDateKey() ? localDateKey() : selectedDate
  let initialStart = new Date(`${initialDate}T10:00:00`)
  if (instant) {
    initialStart = new Date()
    initialStart.setMinutes(initialStart.getMinutes() + 1, 0, 0)
  } else if (mode === 'reminder') {
    initialStart = new Date(`${initialDate}T09:00:00`)
  }
  if (initialStart <= now) initialStart = new Date(now.getTime() + (mode === 'reminder' ? 15 : 2) * 60 * 1000)
  const initialEnd = new Date(initialStart.getTime() + 60 * 60 * 1000)
  const initialDateValue = localDateKey(initialStart)
  const defaultStart = `${String(initialStart.getHours()).padStart(2, '0')}:${String(initialStart.getMinutes()).padStart(2, '0')}`
  const defaultEndDate = initialEnd
  const [projectId, setProjectId] = useState(initialProject?.project_id || '')
  const [attendees, setAttendees] = useState<string[]>(initialProject ? projectPeople(initialProject).map((person) => person.firebaseUid) : [])
  const [date, setDate] = useState(initialDateValue)
  const [startTime, setStartTime] = useState(defaultStart)
  const [endTime, setEndTime] = useState(`${String(defaultEndDate.getHours()).padStart(2, '0')}:${String(defaultEndDate.getMinutes()).padStart(2, '0')}`)
  const selectedProject = projects.find((project) => project.project_id === projectId)

  function changeProject(nextProjectId: string) {
    setProjectId(nextProjectId)
    const project = projects.find((item) => item.project_id === nextProjectId)
    setAttendees(project ? projectPeople(project).map((person) => person.firebaseUid) : [])
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (mode === 'schedule') {
      await onSubmit({
        title: String(form.get('title') || '').trim(),
        date,
        startTime,
        endTime,
        pinned: form.get('pinned') === 'on',
        location: String(form.get('location') || '').trim(),
        notes: String(form.get('notes') || '').trim(),
        attendeeFirebaseUids: attendees.filter((uid) => uid !== currentUid),
      }, projectId)
    } else {
      await onSubmit({
        title: String(form.get('title') || '').trim(),
        date,
        time: startTime,
        priority: String(form.get('priority') || 'Normal'),
      }, projectId)
    }
  }

  return (
    <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section aria-labelledby="meeting-modal-title" aria-modal="true" className={styles.modal} role="dialog">
        <button aria-label="Close dialog" className={styles.closeModal} onClick={onClose} type="button">×</button>
        <h2 id="meeting-modal-title">{mode === 'schedule' ? instant ? 'Start Instant Meeting' : 'Schedule Team Meeting' : 'Add Reminder'}</h2>
        <p>{mode === 'schedule' ? instant ? 'Create a video meeting room and invite your project members to join now.' : 'Schedule a meeting and invite your project members.' : 'Add a reminder to your project calendar.'}</p>
        {!projects.length ? <p className={styles.formError}>Create or join a project before continuing.</p> : (
          <form className={styles.form} onSubmit={(event) => void submit(event)}>
            <label>
              Project
              <select onChange={(event) => changeProject(event.target.value)} required value={projectId}>
                {projects.map((project) => <option key={project.project_id} value={project.project_id}>{project.name}</option>)}
              </select>
            </label>
            <label>
              {mode === 'schedule' ? 'Meeting title' : 'Reminder title'}
              <input
                autoFocus
                defaultValue={mode === 'schedule' && instant ? 'Instant team meeting' : ''}
                maxLength={255}
                name="title"
                placeholder={mode === 'schedule' ? 'e.g. Sprint planning' : 'e.g. Prepare project update'}
                required
              />
            </label>
            <div className={styles.formRow}>
              <label>
                Date
                <input min={localDateKey()} onChange={(event) => setDate(event.target.value)} required type="date" value={date} />
              </label>
              <label>
                {mode === 'schedule' ? 'Start time' : 'Time'}
                <input onChange={(event) => setStartTime(event.target.value)} required type="time" value={startTime} />
              </label>
              {mode === 'schedule' && (
                <label>
                  End time
                  <input onChange={(event) => setEndTime(event.target.value)} required type="time" value={endTime} />
                </label>
              )}
            </div>
            {mode === 'schedule' ? (
              <>
                <fieldset className={styles.attendees}>
                  <legend>Invite project members</legend>
                  {selectedProject && projectPeople(selectedProject).map((person) => (
                    <label key={person.firebaseUid}>
                      <input
                        checked={attendees.includes(person.firebaseUid)}
                        onChange={(event) => setAttendees((current) => event.target.checked
                          ? [...current, person.firebaseUid]
                          : current.filter((uid) => uid !== person.firebaseUid))}
                        type="checkbox"
                        value={person.firebaseUid}
                      />
                      {person.name}{person.firebaseUid === selectedProject.creator_firebase_uid ? ' (owner)' : ''}
                    </label>
                  ))}
                </fieldset>
                <label>
                  Meeting link or location
                  <input maxLength={2048} name="location" placeholder="Video link or meeting location" />
                </label>
                <label>
                  Notes
                  <textarea maxLength={10000} name="notes" placeholder="Add an agenda or other details" rows={3} />
                </label>
                <label className={styles.inlineCheck}>
                  <input defaultChecked name="pinned" type="checkbox" />
                  Pin this meeting on the calendar
                </label>
              </>
            ) : (
              <label>
                Priority
                <select defaultValue="Normal" name="priority">
                  <option>Normal</option>
                  <option>High</option>
                  <option>Urgent</option>
                </select>
              </label>
            )}
            {error && <p className={styles.formError} role="alert">{error}</p>}
            <div className={styles.modalActions}>
              <button className={styles.secondaryButton} onClick={onClose} type="button">Cancel</button>
              <button className={styles.primaryButton} disabled={submitting || !projectId} type="submit">
                {submitting ? instant ? 'Creating room…' : 'Saving…' : mode === 'schedule' ? instant ? 'Start meeting' : 'Schedule meeting' : 'Add reminder'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}

function MeetingCard({
  meeting,
  onCancel,
  onCopy,
  onJoin,
}: {
  meeting: MeetingView
  onCancel: (meeting: MeetingView) => void
  onCopy: (url: string) => void
  onJoin: (meeting: MeetingView) => void
}) {
  const now = new Date()
  const live = !meeting.ended && meetingStart(meeting) <= now && meetingEnd(meeting) >= now
  const past = meetingEnd(meeting) < now
  const externalUrl = safeMeetingUrl(meeting.meetingUrl || meeting.location)
  const date = new Date(`${meeting.date}T12:00:00`)

  return (
    <article className={`${styles.meetingCard} ${live ? styles.liveCard : ''}`}>
      <div className={styles.dateBadge}>
        <span>{new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date)}</span>
        <strong>{date.getDate()}</strong>
        <small>{new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date)}</small>
      </div>
      <div className={styles.meetingDetails}>
        <span className={`${styles.status} ${live ? styles.liveStatus : ''}`}>
          {meeting.ended ? 'Meeting ended' : live ? 'In progress' : past ? 'Past meeting' : 'Upcoming'}
        </span>
        <h3>{meeting.title}</h3>
        <div className={styles.meta}>
          <span>{formatTime(meeting.startTime)} – {formatTime(meeting.endTime)}</span>
          <span>{meeting.project_name || 'Project meeting'}</span>
          <span>{meeting.attendees.length} attendee{meeting.attendees.length === 1 ? '' : 's'}</span>
        </div>
        {meeting.location && !externalUrl && <p>{meeting.location}</p>}
        {meeting.notes && <p>{meeting.notes}</p>}
      </div>
      <div className={styles.cardActions}>
        {!past && !meeting.ended && <button className={styles.primaryButton} onClick={() => onJoin(meeting)} type="button">{live ? 'Join meeting' : 'Open meeting'}</button>}
        {externalUrl && !past && !meeting.ended && (
          <>
            <a className={styles.secondaryButton} href={externalUrl} rel="noopener noreferrer" target="_blank">Open external link</a>
          <button className={styles.secondaryButton} onClick={() => onCopy(externalUrl)} type="button">Copy link</button>
          </>
        )}
        {meeting.canCancel && (
          <button className={styles.cancelButton} onClick={() => onCancel(meeting)} type="button">Cancel</button>
        )}
      </div>
    </article>
  )
}

export default function Meetings({ user, activeProjectName }: MeetingsProps) {
  const dashboard = useDashboardData()
  const [modal, setModal] = useState<Modal>(null)
  const [instantMeeting, setInstantMeeting] = useState(false)
  const [selectedDate, setSelectedDate] = useState(localDateKey())
  const [month, setMonth] = useState(() => {
    const today = new Date()
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })
  const [filter, setFilter] = useState<CalendarFilter>('all')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')
  const projects = dashboard.projects.data
  const projectById = useMemo(() => new Map(projects.map((project) => [project.project_id, project])), [projects])
  const meetings = useMemo(() => Object.values(dashboard.meetings.data).flatMap((items) => items.map((record) => {
    const project = projectById.get(record.project_id)
    return project ? asMeeting(record, project, user.uid) : null
  })).filter((meeting): meeting is MeetingView => meeting !== null)
    .sort((first, second) => meetingStart(first).getTime() - meetingStart(second).getTime()), [dashboard.meetings.data, projectById, user.uid])
  const tasks = useMemo(() => Object.values(dashboard.tasks.data).flat(), [dashboard.tasks.data])
  const reminders = useMemo(() => Object.values(dashboard.reminders.data).flat(), [dashboard.reminders.data])
  const upcoming = meetings.filter((meeting) => meetingEnd(meeting) >= new Date())
  const past = meetings.filter((meeting) => meetingEnd(meeting) < new Date()).reverse()
  const selectedMeetings = meetings.filter((meeting) => meeting.date === selectedDate)
  const selectedTasks = tasks.filter((task) => task.due_date && datePart(task.due_date) === selectedDate)
  const selectedReminders = reminders.filter((reminder) => datePart(reminder.reminder_date) === selectedDate)

  useEffect(() => {
    let lastRefreshAt = Date.now()
    const refreshVisibleDashboard = () => {
      if (document.visibilityState !== 'visible') return
      lastRefreshAt = Date.now()
      void dashboard.refresh().catch((error: unknown) => {
        console.error('Unable to refresh meeting calendar data:', error)
      })
    }
    const intervalId = window.setInterval(refreshVisibleDashboard, 60_000)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefreshAt >= 15_000) {
        refreshVisibleDashboard()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [dashboard.refresh])

  function selectCalendarValue(value: string) {
    if (value.startsWith('filter:')) setFilter(value.slice(7) as CalendarFilter)
    else setSelectedDate(value)
  }

  function openModal(nextModal: Exclude<Modal, null>, instant = false) {
    setFormError('')
    setActionError('')
    setInstantMeeting(instant)
    setModal(nextModal)
  }

  async function submitModal(data: Record<string, unknown>, projectId: string) {
    if (!projectId) return
    const today = localDateKey()
    if (typeof data.date !== 'string' || data.date < today) {
      setFormError('Choose today or a future date.')
      return
    }
    if (modal === 'schedule' && typeof data.startTime === 'string' && typeof data.endTime === 'string') {
      if (data.endTime <= data.startTime) {
        setFormError('The end time must be after the start time.')
        return
      }
      if (data.date === today && data.startTime <= `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`) {
        setFormError('Choose a start time in the future.')
        return
      }
    }
    if (modal === 'reminder' && typeof data.time === 'string' && data.date === today) {
      const reminderDate = new Date(`${data.date}T${data.time}:00`)
      if (reminderDate <= new Date()) {
        setFormError('Choose a reminder time in the future.')
        return
      }
    }
    setSaving(true)
    setFormError('')
    try {
      if (modal === 'schedule') {
        const response = await dashboardApi.createProjectMeeting(user, projectId, data as {
          title: string
          date: string
          startTime: string
          endTime: string
          pinned: boolean
          location: string
          notes: string
          attendeeFirebaseUids: string[]
        })
        await dashboard.refreshMeetings()
        setModal(null)
        if (instantMeeting) {
          const project = projectById.get(projectId)
          if (!project) throw new Error('Meeting created, but its project could not be found.')
          try {
            openExistingMeetingRoom(user, project, response.data.meeting, () => { void dashboard.refresh() })
          } catch (error) {
            console.error('Unable to open the new meeting room:', error)
            setActionError(error instanceof Error ? error.message : 'The meeting was created, but the room could not be opened.')
          }
          return
        }
      } else {
        await dashboardApi.createProjectReminder(user, projectId, data as {
          title: string
          date: string
          time: string
          priority: ProjectReminder['priority']
        })
        await dashboard.refreshReminders()
      }
      setModal(null)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The request could not be completed.')
    } finally {
      setSaving(false)
    }
  }

  async function cancelMeeting(meeting: MeetingView) {
    if (!window.confirm(`Cancel "${meeting.title}"? It will be removed from the project schedule.`)) return
    setActionError('')
    try {
      await dashboardApi.deleteProjectMeeting(user, meeting.project_id, meeting.meeting_id)
      await dashboard.refreshMeetings()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'This meeting could not be cancelled.')
    }
  }

  function joinMeeting(meeting: MeetingView) {
    const project = projectById.get(meeting.project_id)
    if (!project) {
      setActionError('This meeting’s project could not be found.')
      return
    }
    try {
      openExistingMeetingRoom(user, project, meeting, () => { void dashboard.refresh() })
    } catch (error) {
      console.error('Unable to open the meeting room:', error)
      setActionError(error instanceof Error ? error.message : 'The meeting room could not be opened.')
    }
  }

  async function copyMeetingUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setActionError('Meeting link copied.')
    } catch (error) {
      console.error('Unable to copy meeting link:', error)
      setActionError('Meeting link could not be copied. Check clipboard permissions and try again.')
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>TEAM SCHEDULE</p>
          <h1>Meetings</h1>
          <p>Plan team syncs, keep meeting details together, and join the Collab room or a shared meeting link.</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.secondaryButton} disabled={!projects.length} onClick={() => openModal('reminder')} type="button">+ Add Reminder</button>
          <button className={styles.primaryButton} disabled={!projects.length} onClick={() => openModal('schedule')} type="button">Schedule meeting</button>
        </div>
      </header>

      {(dashboard.meetings.error || dashboard.reminders.error || dashboard.tasks.error) && (
        <p className={styles.errorBanner} role="alert">
          Some calendar data could not be loaded: {[dashboard.meetings.error, dashboard.reminders.error, dashboard.tasks.error].filter(Boolean).join(' ')}
        </p>
      )}
      {actionError && <p aria-live="polite" className={styles.notice}>{actionError}</p>}

      <section className={styles.calendarSection}>
        <div className={styles.calendarIntro}>
          <div>
            <h2>Calendar</h2>
            <p>Select a day to view its schedule.</p>
          </div>
          <button className={styles.secondaryButton} disabled={!projects.length} onClick={() => openModal('schedule', true)} type="button">Start instant meeting</button>
        </div>
        <CalendarGrid
          filter={filter}
          meetings={meetings}
          month={month}
          onMonthChange={setMonth}
          onSelect={selectCalendarValue}
          reminders={reminders}
          selectedDate={selectedDate}
          tasks={tasks}
        />
        <section className={styles.daySchedule} aria-label={`Schedule for ${formatDate(selectedDate)}`}>
          <header>
            <div>
              <h3>Schedule for {formatDate(selectedDate, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</h3>
              <p>Pinned meetings, deliverable deadlines, and reminders for this day.</p>
            </div>
            <div className={styles.dayActions}>
              <button className={styles.secondaryButton} disabled={!projects.length} onClick={() => openModal('schedule')} type="button">+ Schedule Meeting</button>
              <button className={styles.secondaryButton} disabled={!projects.length} onClick={() => openModal('reminder')} type="button">+ Add Reminder</button>
            </div>
          </header>
          <div className={styles.dayItems}>
            <section>
              <h4>📍 Meetings <span>{selectedMeetings.length}</span></h4>
              {selectedMeetings.length ? selectedMeetings.map((meeting) => (
                <div className={styles.agendaItem} key={meeting.meeting_id}>
                  <strong>{meeting.title}</strong>
                  <span>{formatTime(meeting.startTime)}–{formatTime(meeting.endTime)} · {meeting.project_name}</span>
                  {meeting.canCancel && <button className={styles.cancelText} onClick={() => void cancelMeeting(meeting)} type="button">Cancel</button>}
                </div>
              )) : <p className={styles.emptyAgenda}>No meetings scheduled for this date.</p>}
            </section>
            <section>
              <h4>📋 Project deadlines <span>{selectedTasks.length}</span></h4>
              {selectedTasks.length ? selectedTasks.map((task) => (
                <div className={styles.agendaItem} key={task.task_id}>
                  <strong>{task.title}</strong><span>{task.project_name} · {task.status}</span>
                </div>
              )) : <p className={styles.emptyAgenda}>No deliverable deadlines for this date.</p>}
            </section>
            <section>
              <h4>🔔 Reminders <span>{selectedReminders.length}</span></h4>
              {selectedReminders.length ? selectedReminders.map((reminder) => (
                <div className={styles.agendaItem} key={reminder.reminder_id}>
                  <strong>{reminder.title}</strong>
                  <span>{formatTime(timePart(reminder.reminder_time))} · {reminder.project_name} · {reminder.priority} priority</span>
                </div>
              )) : <p className={styles.emptyAgenda}>No reminders for this date.</p>}
            </section>
          </div>
        </section>
      </section>

      <MeetingGroup
        empty={dashboard.meetings.loading ? 'Loading meetings…' : 'No upcoming meetings. Schedule one to get your team together.'}
        items={upcoming}
        onCancel={cancelMeeting}
        onCopy={copyMeetingUrl}
        onJoin={joinMeeting}
        title="Upcoming meetings"
        loading={dashboard.meetings.loading}
      />
      {past.length > 0 && <MeetingGroup empty="" items={past} onCancel={cancelMeeting} onCopy={copyMeetingUrl} onJoin={joinMeeting} title="Past meetings" />}

      {modal && (
        <MeetingModal
          activeProjectName={activeProjectName}
          currentUid={user.uid}
          error={formError}
          instant={instantMeeting}
          mode={modal}
          onClose={() => setModal(null)}
          onSubmit={submitModal}
          projects={projects}
          selectedDate={selectedDate}
          submitting={saving}
        />
      )}
    </div>
  )
}

function MeetingGroup({
  title,
  items,
  empty,
  onCancel,
  onCopy,
  onJoin,
  loading = false,
}: {
  title: string
  items: MeetingView[]
  empty: string
  onCancel: (meeting: MeetingView) => void
  onCopy: (url: string) => void
  onJoin: (meeting: MeetingView) => void
  loading?: boolean
}) {
  return (
    <section className={styles.meetingGroup}>
      <header className={styles.groupHeading}><h2>{title}</h2><span>{items.length}</span></header>
      {items.length ? (
        <div className={styles.meetingList}>
          {items.map((meeting) => <MeetingCard key={meeting.meeting_id} meeting={meeting} onCancel={onCancel} onCopy={(url) => void onCopy(url)} onJoin={onJoin} />)}
        </div>
      ) : <p aria-live={loading ? 'polite' : undefined} className={styles.emptyState}>{empty}</p>}
    </section>
  )
}
