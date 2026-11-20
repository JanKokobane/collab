import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { AuthUser } from '../../auth/authClient.js'
import { dashboardApi } from '../../services/dashboardApi.js'
import { useDashboardData } from '../../state/DashboardDataContext.js'
import type { ProjectMeeting, ProjectResource, ProjectStickyNote } from '../../types/dashboard.js'
import fallbackLogo from '../../../../images/favicon.png'
import styles from './Home.module.css'

type HomeProps = { user: AuthUser; onNavigate: (view: string) => void }

function startOfToday() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

function getWeekRange() {
  const today = startOfToday()
  const start = new Date(today)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('') || 'AM'
}

function formatMeetingDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

export default function Home({ user, onNavigate }: HomeProps) {
  const dashboard = useDashboardData()
  const [resources, setResources] = useState<ProjectResource[]>([])
  const [resourcesLoading, setResourcesLoading] = useState(false)
  const [resourcesError, setResourcesError] = useState<string | null>(null)
  const [scratchpadProjectId, setScratchpadProjectId] = useState('')
  const [scratchpadValue, setScratchpadValue] = useState('')
  const [savedScratchpadValue, setSavedScratchpadValue] = useState('')
  const [scratchpadStatus, setScratchpadStatus] = useState('● Choose a project')
  const scratchpadSaveTimer = useRef<number | null>(null)
  const scratchpadPollTimer = useRef<number | null>(null)
  const scratchpadTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const stickyBoardRef = useRef<HTMLDivElement | null>(null)
  const [resourceModal, setResourceModal] = useState<{ resource?: ProjectResource; projectId?: string } | null>(null)
  const [resourceForm, setResourceForm] = useState({ title: '', targetUrl: '', category: 'Other' })
  const [resourceFormError, setResourceFormError] = useState<string | null>(null)
  const [stickyNotes, setStickyNotes] = useState<ProjectStickyNote[]>([])
  const [stickyModal, setStickyModal] = useState<ProjectStickyNote | 'new' | null>(null)
  const [stickyContent, setStickyContent] = useState('')
  const [stickyColor, setStickyColor] = useState<ProjectStickyNote['color']>('yellow')
  const [stickyRecipients, setStickyRecipients] = useState<string[]>([])
  const [draggingSticky, setDraggingSticky] = useState<{ noteId: string; offsetX: number; offsetY: number } | null>(null)

  const allTasks = useMemo(() => Object.values(dashboard.tasks.data).flat(), [dashboard.tasks.data])
  const allMeetings = useMemo(() => Object.values(dashboard.meetings.data).flat(), [dashboard.meetings.data])
  const { start: weekStart, end: weekEnd } = getWeekRange()
  const completedCount = allTasks.filter(task => task.status.toLowerCase() === 'done').length
  const dueThisWeek = allTasks.filter(task => {
    if (!task.due_date) return false
    const date = new Date(`${task.due_date}T00:00:00`)
    return !Number.isNaN(date.getTime()) && date >= weekStart && date <= weekEnd
  })
  const openTaskCount = allTasks.filter(task => task.status.toLowerCase() !== 'done').length
  const upcomingMeetings = allMeetings
    .filter(meeting => { const date = new Date(`${meeting.meeting_date}T00:00:00`); return !Number.isNaN(date.getTime()) && date >= startOfToday() })
    .sort((a, b) => `${a.meeting_date}${a.start_time}`.localeCompare(`${b.meeting_date}${b.start_time}`))

  const teamMembers = useMemo(() => {
    const unique = new Map<string, { name: string; profileImage: string }>()
    dashboard.projects.data.forEach(project => {
      if (project.creator_firebase_uid && project.creator_firebase_uid !== user.uid) unique.set(project.creator_firebase_uid, { name: project.creator_name || project.creator_email || 'Project member', profileImage: project.creator_profile_image || '' })
      project.accepted_members.forEach(member => {
        if (member.firebaseUid && member.firebaseUid !== user.uid) unique.set(member.firebaseUid, { name: member.name || member.email || 'Project member', profileImage: member.profileImage || '' })
      })
    })
    return [...unique.values()]
  }, [dashboard.projects.data, user.uid])

  useEffect(() => {
    if (!dashboard.projects.data.length) { setResources([]); return }
    const controller = new AbortController()
    setResourcesLoading(true)
    setResourcesError(null)
    void Promise.allSettled(dashboard.projects.data.map(project => dashboardApi.fetchProjectResources(user, project.project_id, controller.signal))).then(results => {
      const next: ProjectResource[] = []
      const failure = results.find(result => result.status === 'rejected')
      results.forEach(result => { if (result.status === 'fulfilled') next.push(...result.value.data.resources) })
      setResources(next)
      setResourcesError(failure ? 'Project resources could not be loaded. Please try again.' : null)
    }).finally(() => setResourcesLoading(false))
    return () => controller.abort()
  }, [dashboard.projects.data, user])

  useEffect(() => {
    if (!dashboard.projects.data.length) {
      setScratchpadProjectId(''); setScratchpadValue(''); setSavedScratchpadValue(''); setScratchpadStatus('● Choose a project'); return
    }
    const stored = localStorage.getItem('collab_workspace_scratchpad_project')
    setScratchpadProjectId(dashboard.projects.data.some(project => project.project_id === stored) ? stored || '' : dashboard.projects.data[0].project_id)
  }, [dashboard.projects.data])

  useEffect(() => {
    if (!scratchpadProjectId) return
    const controller = new AbortController()
    setScratchpadStatus('● Loading…')
    void dashboardApi.fetchProjectScratchpad(user, scratchpadProjectId, controller.signal).then(async response => {
      let content = response.data.scratchpad?.content || ''
      const legacyContent = localStorage.getItem('collab_workspace_scratchpad')
      const migrated = localStorage.getItem('collab_workspace_scratchpad_migrated') === 'true'
      if (!content && legacyContent && !migrated) {
        content = legacyContent
        const saved = await dashboardApi.saveProjectScratchpad(user, scratchpadProjectId, content, controller.signal)
        content = saved.data.scratchpad?.content ?? content
        localStorage.setItem('collab_workspace_scratchpad_migrated', 'true')
        localStorage.removeItem('collab_workspace_scratchpad')
      }
      setScratchpadValue(content); setSavedScratchpadValue(content); setScratchpadStatus('● Synced')
      localStorage.setItem('collab_workspace_scratchpad_project', scratchpadProjectId)
    }).catch(error => { if (!controller.signal.aborted) { setScratchpadStatus('● Load failed'); console.error(error) } })
    return () => controller.abort()
  }, [scratchpadProjectId, user])

  useEffect(() => () => {
    if (scratchpadSaveTimer.current !== null) window.clearTimeout(scratchpadSaveTimer.current)
    if (scratchpadPollTimer.current !== null) window.clearInterval(scratchpadPollTimer.current)
  }, [])

  useEffect(() => {
    if (scratchpadPollTimer.current !== null) window.clearInterval(scratchpadPollTimer.current)
    if (!scratchpadProjectId) return
    scratchpadPollTimer.current = window.setInterval(() => {
      if (document.hidden || document.activeElement === scratchpadTextareaRef.current || scratchpadValue !== savedScratchpadValue) return
      void dashboardApi.fetchProjectScratchpad(user, scratchpadProjectId).then(response => {
        const content = response.data.scratchpad?.content || ''
        setScratchpadValue(content)
        setSavedScratchpadValue(content)
      }).catch(error => console.error(error))
    }, 5000)
    return () => {
      if (scratchpadPollTimer.current !== null) window.clearInterval(scratchpadPollTimer.current)
    }
  }, [scratchpadProjectId, scratchpadValue, savedScratchpadValue, user])

  useEffect(() => {
    if (!scratchpadProjectId) { setStickyNotes([]); return }
    const controller = new AbortController()
    void dashboardApi.fetchProjectStickyNotes(user, scratchpadProjectId, controller.signal)
      .then(response => setStickyNotes(response.data.notes))
      .catch(error => { if (!controller.signal.aborted) console.error(error) })
    return () => controller.abort()
  }, [scratchpadProjectId, user])

  useEffect(() => {
    if (!scratchpadProjectId) return
    const timer = window.setInterval(() => {
      if (document.hidden) return
      void dashboardApi.fetchProjectStickyNotes(user, scratchpadProjectId)
        .then(response => setStickyNotes(response.data.notes))
        .catch(error => console.error(error))
    }, 5000)
    return () => window.clearInterval(timer)
  }, [scratchpadProjectId, user])

  const saveScratchpad = async (content: string) => {
    if (!scratchpadProjectId) return
    setScratchpadStatus('● Saving…')
    try {
      const response = await dashboardApi.saveProjectScratchpad(user, scratchpadProjectId, content)
      setSavedScratchpadValue(response.data.scratchpad?.content ?? content)
      setScratchpadStatus('● Synced')
    } catch (error) { setScratchpadStatus('● Save failed'); console.error(error) }
  }

  const updateScratchpad = (value: string) => {
    setScratchpadValue(value)
    setScratchpadStatus(value === savedScratchpadValue ? '● Synced' : '● Unsaved changes')
    if (scratchpadSaveTimer.current !== null) window.clearTimeout(scratchpadSaveTimer.current)
    scratchpadSaveTimer.current = window.setTimeout(() => void saveScratchpad(value), 600)
  }

  const changeScratchpadProject = (projectId: string) => {
    if (scratchpadSaveTimer.current !== null) window.clearTimeout(scratchpadSaveTimer.current)
    if (scratchpadValue !== savedScratchpadValue && scratchpadProjectId) void saveScratchpad(scratchpadValue)
    localStorage.setItem('collab_workspace_scratchpad_project', projectId)
    setScratchpadProjectId(projectId)
  }

  const appendScratchpad = (text: string) => updateScratchpad(`${scratchpadValue}${scratchpadValue.trimEnd() ? '\n' : ''}${text}`)

  const ownedProjects = dashboard.projects.data.filter(project => project.creator_firebase_uid === user.uid)

  const openResourceModal = (resource?: ProjectResource) => {
    setResourceForm(resource
      ? { title: resource.title, targetUrl: resource.target_url, category: resource.category }
      : { title: '', targetUrl: '', category: 'Other' })
    setResourceFormError(null)
    setResourceModal(resource ? { resource, projectId: resource.project_id } : { projectId: ownedProjects[0]?.project_id || '' })
  }

  const saveResource = async (event: FormEvent) => {
    event.preventDefault()
    const projectId = resourceModal?.resource?.project_id || resourceModal?.projectId || ownedProjects[0]?.project_id
    if (!projectId) { setResourceFormError('Create a project first.'); return }
    try {
      const response = resourceModal?.resource
        ? await dashboardApi.updateProjectResource(user, projectId, resourceModal.resource.resource_id, resourceForm.title, resourceForm.targetUrl, resourceForm.category)
        : await dashboardApi.createProjectResource(user, projectId, resourceForm.title, resourceForm.targetUrl, resourceForm.category)
      const saved = response.data.resource
      setResources(current => resourceModal?.resource
        ? current.map(item => item.resource_id === saved.resource_id ? saved : item)
        : [saved, ...current])
      setResourceModal(null)
    } catch (error) { setResourceFormError(error instanceof Error ? error.message : 'The resource could not be saved.') }
  }

  const deleteResource = async (resource: ProjectResource) => {
    if (!window.confirm(`Remove "${resource.title}" from ${resource.project_name}? Project members will be notified.`)) return
    try {
      await dashboardApi.deleteProjectResource(user, resource.project_id, resource.resource_id)
      setResources(current => current.filter(item => item.resource_id !== resource.resource_id))
    } catch (error) { console.error(error) }
  }

  const openStickyModal = (note?: ProjectStickyNote) => {
    setStickyContent(note?.content || '')
    setStickyColor(note?.color || 'yellow')
    setStickyRecipients([])
    setStickyModal(note || 'new')
  }

  const saveSticky = async (event: FormEvent) => {
    event.preventDefault()
    if (!scratchpadProjectId || !stickyContent.trim()) return
    try {
      if (stickyModal && stickyModal !== 'new') {
        const response = await dashboardApi.updateProjectStickyNote(user, scratchpadProjectId, stickyModal.note_id, { content: stickyContent.trim(), color: stickyColor })
        setStickyNotes(current => current.map(note => note.note_id === stickyModal.note_id ? { ...note, ...response.data.note } : note))
      } else {
        const count = stickyNotes.length
        const position = { x: Math.min(0.72, 0.06 + (count % 3) * 0.22), y: Math.min(0.76, 0.08 + Math.floor(count / 3) * 0.2) }
        const response = await dashboardApi.createProjectStickyNote(user, scratchpadProjectId, stickyContent.trim(), stickyColor, stickyRecipients, position)
        setStickyNotes(current => [...current, response.data.note])
      }
      setStickyModal(null)
    } catch (error) { console.error(error) }
  }

  const deleteSticky = async (note: ProjectStickyNote) => {
    if (!window.confirm('Delete this sticky note?')) return
    try {
      await dashboardApi.deleteProjectStickyNote(user, scratchpadProjectId, note.note_id)
      setStickyNotes(current => current.filter(item => item.note_id !== note.note_id))
    } catch (error) { console.error(error) }
  }

  const meetingLocation = (meeting: ProjectMeeting) => meeting.meeting_url ? meeting.meeting_url : meeting.location || ''

  return (
    <section className={styles.workspaceHubContainer}>
      <header className={styles.header}><div><p className={styles.eyebrow}>WORKSPACE OVERVIEW</p><p className={styles.intro}>Your team’s schedule, resources, and decisions at a glance.</p></div></header>

      <section className={styles.metrics} aria-label="Workspace overview">
        <button type="button" className={styles.metric} onClick={() => onNavigate('Overview')} aria-label="Open all-project task progress"><div className={styles.metricCopy}><small className={styles.metricLabel}>Tasks completed</small><strong>{completedCount} <em>of {allTasks.length}</em></strong></div><div className={styles.miniChart} aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div></button>
        <button type="button" className={styles.metric} onClick={() => onNavigate('Overview')} aria-label="Open all-project tasks due this week"><div className={styles.metricCopy}><small className={styles.metricLabel}>Due this week</small><strong>{dueThisWeek.length} <em>tasks</em></strong></div><span className={styles.statNote}>{dueThisWeek.filter(task => task.status.toLowerCase() !== 'done').length} pending</span></button>
        <button type="button" className={styles.metric} onClick={() => onNavigate('Overview')} aria-label="Open tasks across all projects"><div className={styles.metricCopy}><small className={styles.metricLabel}>Open tasks</small><strong>{openTaskCount}</strong></div><span className={styles.metricDetail}>Across all projects</span></button>
        <button type="button" className={styles.metric} onClick={() => onNavigate('Meetings')} aria-label="Open upcoming meetings on the team calendar"><div className={styles.metricCopy}><small className={styles.metricLabel}>Upcoming meetings</small><strong>{upcomingMeetings.length}</strong></div><span className={styles.metricDetail}>On the team calendar</span></button>
        <button type="button" className={styles.metric} onClick={() => onNavigate('Admin Console')} aria-label="Open workspace team members"><div className={styles.metricCopy}><small className={styles.metricLabel}>Team members</small><strong>{teamMembers.length}</strong></div><div className={styles.avatars} aria-hidden="true">{teamMembers.slice(0, 3).map((member, index) => <span className={`${styles.avatar} ${styles.avatarTeal}`} title={member.name} key={`${member.name}-${index}`}>{member.profileImage ? <img src={member.profileImage} alt="" /> : initials(member.name)}</span>)}{teamMembers.length > 3 && <span className={`${styles.avatar} ${styles.moreAvatar}`}>+{teamMembers.length - 3}</span>}</div></button>
        <button type="button" className={styles.metric} onClick={() => onNavigate('Notifications')} aria-label="Open unread updates and announcements"><div className={styles.metricCopy}><small className={styles.metricLabel}>Unread updates</small><strong>{dashboard.notifications.data.filter(notification => !notification.is_read).length}</strong></div><span className={styles.metricDetail}>Workspace activity</span></button>
      </section>

      <section className={`${styles.card} ${styles.upcomingCard}`} aria-labelledby="upcoming-meetings-title">
        <div className={styles.cardHeader}><div><h3 id="upcoming-meetings-title">Upcoming Meetings</h3><p>Scheduled team syncs, reviews, and project meetings.</p></div><button type="button" className={styles.calendarLink} onClick={() => onNavigate('Meetings')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg><span>Calendar</span></button></div>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Meeting</th><th>Date</th><th>Time</th><th>Host</th><th>Attendees</th><th>Project</th><th>Location</th></tr></thead><tbody>{upcomingMeetings.length === 0 ? <tr><td className={styles.emptyMeeting} colSpan={7}>No upcoming meetings scheduled.</td></tr> : upcomingMeetings.map(meeting => { const location = meetingLocation(meeting); return <tr className={styles.meetingRow} key={meeting.meeting_id} onClick={() => onNavigate('Meetings')}><td className={styles.meetingTitle} data-label="Meeting">{meeting.title}</td><td data-label="Date">{formatMeetingDate(meeting.meeting_date)}</td><td data-label="Time">{meeting.start_time || 'Time not set'}</td><td data-label="Host">{meeting.host_name || 'Not assigned'}</td><td data-label="Attendees">{meeting.attendee_firebase_uids.length}</td><td data-label="Project">{meeting.project_name || 'Project'}</td><td data-label="Location">{meeting.meeting_url ? <a className={styles.joinLink} href={meeting.meeting_url} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()}>Join meeting</a> : location || '—'}</td></tr> })}</tbody></table></div>
      </section>

      <div className={styles.grid}>
        <div className={styles.column}><div className={styles.card}><div className={styles.cardHeader}><div><h3>Pinned Collaboration Resources</h3><p>Central links to team specs, Figma boards, repos, and environments.</p></div>{ownedProjects.length > 0 && <button type="button" className={styles.toolbarButton} onClick={() => openResourceModal()}>＋ Pin resource</button>}</div><div className={styles.resourcesGrid}>{resourcesLoading ? <p className={styles.resourcesEmpty}>Loading project resources…</p> : resourcesError ? <p className={styles.resourcesEmpty}>{resourcesError}</p> : resources.length === 0 ? <p className={styles.resourcesEmpty}>No resources have been pinned to your projects yet.</p> : resources.map(resource => { let hostname = ''; try { hostname = new URL(resource.target_url).hostname.replace(/^www\./, '') } catch { hostname = '' }; const owned = ownedProjects.some(project => project.project_id === resource.project_id); return <div className={styles.resourceItem} key={resource.resource_id}><a className={styles.resourceLink} href={resource.target_url} target="_blank" rel="noopener noreferrer"><img className={styles.resourceLogo} src={hostname ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64` : fallbackLogo} alt="" /><div className={styles.resourceContent}><div className={styles.resourceTitleRow}><strong>{resource.title}</strong><span className={styles.resourceTag}>{resource.category}</span></div><small>{resource.project_name ? `${resource.project_name} · ` : ''}{hostname || resource.target_url}</small></div><span className={styles.resourceArrow}>↗</span></a>{owned && <div className={styles.resourceActions}><button type="button" className={styles.resourceAction} onClick={() => openResourceModal(resource)}>Edit</button><button type="button" className={`${styles.resourceAction} ${styles.resourceActionDanger}`} onClick={() => void deleteResource(resource)}>Remove</button></div>}</div> })}</div></div></div>
        <div className={styles.column}><div className={styles.card}><div className={styles.cardHeader}><div><h3>Team Collaborative Scratchpad</h3><p>Shared workspace canvas for sprint brainstorming, checklists, and quick architecture notes.</p></div><span className={scratchpadStatus.includes('failed') ? styles.saveStatusError : styles.saveStatus}>{scratchpadStatus}</span></div><label className={styles.projectControl}>Project<select value={scratchpadProjectId} onChange={event => changeScratchpadProject(event.target.value)} disabled={!dashboard.projects.data.length}>{dashboard.projects.data.map(project => <option value={project.project_id} key={project.project_id}>{project.name}</option>)}</select></label><div className={styles.toolbar}><button type="button" className={styles.toolbarButton} disabled={!scratchpadProjectId} onClick={() => appendScratchpad('- [ ] New sprint target: ')}>+ Checklist Item</button><button type="button" className={styles.toolbarButton} disabled={!scratchpadProjectId} onClick={() => appendScratchpad('- Note: ')}>+ Bullet Point</button><button type="button" className={styles.toolbarButton} disabled={!scratchpadProjectId} onClick={() => appendScratchpad('```js\n// Architecture snippet\nconst config = {}\n```')}>+ Code Block</button><button type="button" className={`${styles.toolbarButton} ${styles.danger}`} disabled={!scratchpadProjectId} onClick={() => updateScratchpad('')}>Clear Notes</button></div><textarea ref={scratchpadTextareaRef} className={styles.textarea} value={scratchpadValue} disabled={!scratchpadProjectId} onChange={event => updateScratchpad(event.target.value)} placeholder={scratchpadProjectId ? 'Start typing team notes, sprint targets, or architectural decisions...' : 'Create or join a project to start shared notes.'} /></div></div>
      </div>

      <section className={`${styles.card} ${styles.stickyCard}`} aria-labelledby="project-sticky-notes-title">
        <div className={styles.cardHeader}><div><h3 id="project-sticky-notes-title">Project Sticky Notes</h3><p>Movable private and tagged notes for {dashboard.projects.data.find(project => project.project_id === scratchpadProjectId)?.name || 'this project'}.</p></div>{scratchpadProjectId && <button type="button" className={styles.toolbarButton} onClick={() => openStickyModal()}>＋ Sticky Note</button>}</div>
        <div ref={stickyBoardRef} className={styles.stickyBoard}>
          {stickyNotes.map(note => (
            <article key={note.note_id} className={`${styles.stickyNote} ${styles[`sticky${note.color[0].toUpperCase()}${note.color.slice(1)}`]}`} style={{ left: `${Math.min(92, note.position_x * 100)}%`, top: `${note.position_y * 100}%` }}>
              <div className={styles.stickyHandle}
                onPointerDown={event => {
                  if ((event.target as HTMLElement).closest('button')) return
                  const card = event.currentTarget.parentElement as HTMLElement
                  const bounds = card.getBoundingClientRect()
                  setDraggingSticky({ noteId: note.note_id, offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top })
                  event.currentTarget.setPointerCapture(event.pointerId)
                  card.setAttribute('data-dragging', 'true')
                  event.preventDefault()
                }}
                onPointerMove={event => {
                  if (!draggingSticky || draggingSticky.noteId !== note.note_id) return
                  const card = event.currentTarget.parentElement as HTMLElement
                  const board = card.parentElement as HTMLElement
                  const bounds = board.getBoundingClientRect()
                  const x = Math.max(0, Math.min(board.clientWidth - card.offsetWidth, event.clientX - bounds.left - draggingSticky.offsetX))
                  const y = Math.max(0, Math.min(board.clientHeight - card.offsetHeight, event.clientY - bounds.top - draggingSticky.offsetY))
                  card.style.left = `${x}px`; card.style.top = `${y}px`
                }}
                onPointerUp={event => {
                  if (!draggingSticky || draggingSticky.noteId !== note.note_id) return
                  const card = event.currentTarget.parentElement as HTMLElement
                  const board = card.parentElement as HTMLElement
                  const position = { x: card.offsetLeft / Math.max(1, board.clientWidth), y: card.offsetTop / Math.max(1, board.clientHeight) }
                  setDraggingSticky(null); card.removeAttribute('data-dragging')
                  void dashboardApi.updateProjectStickyNote(user, scratchpadProjectId, note.note_id, { position }).then(() => {
                    setStickyNotes(current => current.map(item => item.note_id === note.note_id ? { ...item, position_x: position.x, position_y: position.y } : item))
                  }).catch(error => console.error(error))
                }}>
                <span>{note.author_name || (note.created_by_firebase_uid === user.uid ? 'You' : 'Project member')}</span>
                {note.created_by_firebase_uid === user.uid && <><button type="button" className={styles.stickyEdit} onClick={() => openStickyModal(note)}>Edit</button><button type="button" className={styles.stickyDelete} onClick={() => void deleteSticky(note)}>×</button></>}
              </div>
              <p className={styles.stickyText}>{note.content}</p>
            </article>
          ))}
        </div>
      </section>

      {resourceModal && <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setResourceModal(null) }}><form className={styles.modal} onSubmit={saveResource}><div className={styles.modalHeader}><h3>{resourceModal.resource ? 'Edit Pinned Resource' : 'Add Pinned Resource'}</h3><p>{resourceModal.resource ? 'Update this project resource. Project members will be notified.' : 'Pin a resource to one of your projects.'}</p></div><label className={styles.modalField}>Project<select value={resourceModal.resource?.project_id || resourceModal.projectId || ''} disabled={Boolean(resourceModal.resource)} onChange={event => setResourceModal({ ...resourceModal, projectId: event.target.value })}>{ownedProjects.map(project => <option key={project.project_id} value={project.project_id}>{project.name}</option>)}</select></label><label className={styles.modalField}>Title<input required maxLength={255} value={resourceForm.title} onChange={event => setResourceForm(current => ({ ...current, title: event.target.value }))} placeholder="e.g. Design Tokens Figma" /></label><label className={styles.modalField}>URL<input required type="url" maxLength={2048} value={resourceForm.targetUrl} onChange={event => setResourceForm(current => ({ ...current, targetUrl: event.target.value }))} placeholder="https://figma.com/@your-project" /></label><label className={styles.modalField}>Category<select value={resourceForm.category} onChange={event => setResourceForm(current => ({ ...current, category: event.target.value }))}>{['Design','Engineering','Product','Testing','Meetings','Analytics','Documentation','Other','Specifications','Architecture','Code Repositories','DevOps','Planning','Roadmaps','Marketing','Operations'].map(category => <option key={category}>{category}</option>)}</select></label>{resourceFormError && <p className={styles.modalError}>{resourceFormError}</p>}<div className={styles.modalActions}><button type="button" className={styles.toolbarButton} onClick={() => setResourceModal(null)}>Cancel</button><button type="submit" className={styles.toolbarButton}>{resourceModal.resource ? 'Save Changes' : 'Pin Resource'}</button></div></form></div>}

      {stickyModal && <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setStickyModal(null) }}><form className={styles.modal} onSubmit={saveSticky}><div className={styles.modalHeader}><h3>{stickyModal === 'new' ? 'New Sticky Note' : 'Edit Sticky Note'}</h3><p>{stickyModal === 'new' ? 'Place a movable note on this project board.' : 'Update this note on the project board.'}</p></div><label className={styles.modalField}>Note<textarea required maxLength={2000} value={stickyContent} onChange={event => setStickyContent(event.target.value)} placeholder="Write a reminder, checklist, or quick note…" /></label><div className={styles.modalField}>Color<div className={styles.colorPicker}>{(['yellow','pink','blue','green'] as const).map(color => <button key={color} type="button" aria-label={`${color} note`} aria-pressed={stickyColor === color} className={`${styles.colorOption} ${styles[`color${color[0].toUpperCase()}${color.slice(1)}`]} ${stickyColor === color ? styles.colorSelected : ''}`} onClick={() => setStickyColor(color)} />)}</div></div>{stickyModal === 'new' && <div className={styles.modalField}>Share with project members<p className={styles.recipientHelp}>Leave everyone unchecked to keep this note private to you. Tagged members will be notified.</p><div className={styles.recipientList}>{(() => { const project = dashboard.projects.data.find(item => item.project_id === scratchpadProjectId); const people = project ? [{ firebaseUid: project.creator_firebase_uid, name: project.creator_name || project.creator_email, profileImage: project.creator_profile_image }, ...project.accepted_members].filter(member => member.firebaseUid !== user.uid) : []; return people.length ? people.map(member => <label className={styles.recipient} key={member.firebaseUid}><input type="checkbox" checked={stickyRecipients.includes(member.firebaseUid)} onChange={event => setStickyRecipients(current => event.target.checked ? [...current, member.firebaseUid] : current.filter(uid => uid !== member.firebaseUid))} /><span>{member.name || 'Project member'}</span></label>) : <span>No other accepted project members are available.</span> })()}</div></div>}<div className={styles.modalActions}><button type="button" className={styles.toolbarButton} onClick={() => setStickyModal(null)}>Cancel</button><button type="submit" className={styles.toolbarButton}>{stickyModal === 'new' ? 'Create Sticky Note' : 'Save Changes'}</button></div></form></div>}
    </section>
  )
}
