import { firebaseAuth } from '../../firebase.js'
import { api } from './api.js'
import { meetings, projects, setMeetings } from './state.js'

function initialsFor(name = '') {
  return name.trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()
}

function getProjectMembers(project) {
  const projectMembers = [
    {
      firebaseUid: project.creatorFirebaseUid,
      name: project.creatorName,
      email: project.creatorEmail,
      initials: project.creatorInitials,
      profileImage: project.creatorProfileImage,
      role: 'owner'
    },
    ...(project.acceptedMembers || []).map(member => ({
      ...member,
      firebaseUid: member.firebaseUid || member.firebase_uid || member.uid,
      profileImage: member.profileImage || member.profile_image,
      role: member.role || 'member'
    }))
  ]

  const uniqueMembers = new Map()
  projectMembers.filter(member => member.firebaseUid).forEach(member => {
    uniqueMembers.set(member.firebaseUid, {
      ...member,
      name: member.name || member.displayName || member.email || 'Project member',
      initials: member.initials || initialsFor(member.name || member.displayName || member.email || ''),
      tone: member.tone || 'teal'
    })
  })
  return [...uniqueMembers.values()]
}

function normalizeMeeting(record, project) {
  const attendeeUids = Array.isArray(record.attendee_firebase_uids)
    ? record.attendee_firebase_uids
    : []
  const people = getProjectMembers(project)
  const attendeeByUid = new Map(people.map(person => [person.firebaseUid, person]))
  const startTime = String(record.start_time || '').slice(0, 5)
  const endTime = String(record.end_time || '').slice(0, 5)
  const meetingDate = record.meeting_date instanceof Date
    ? record.meeting_date.toISOString().slice(0, 10)
    : String(record.meeting_date || '').slice(0, 10)
  const hostUid = record.host_firebase_uid
  const host = attendeeByUid.get(hostUid)

  return {
    id: record.meeting_id,
    projectId: record.project_id,
    projectName: record.project_name || project.name,
    title: record.title,
    date: meetingDate,
    startTime,
    endTime,
    time: `${startTime} - ${endTime}`,
    pinned: record.pinned,
    location: record.location || '',
    notes: record.notes || '',
    hostFirebaseUid: hostUid,
    host: host?.name || record.host_name || 'Project member',
    hostProfileImage: host?.profileImage || '',
    attendees: attendeeUids.map(uid => attendeeByUid.get(uid) || {
      firebaseUid: uid,
      name: 'Project member',
      initials: 'PM',
      tone: 'teal'
    }),
    canCancel: hostUid === firebaseAuth.currentUser?.uid ||
      project.creatorFirebaseUid === firebaseAuth.currentUser?.uid
  }
}

export async function loadProjectMeetings() {
  const recordsByProject = await Promise.all(projects.map(async project => {
    const response = await api.get(`/projects/${encodeURIComponent(project.projectId)}/meetings`)
    return (response?.data?.meetings || []).map(record => normalizeMeeting(record, project))
  }))
  const meetings = recordsByProject.flat().sort((first, second) =>
    first.date.localeCompare(second.date) || first.startTime.localeCompare(second.startTime)
  )
  setMeetings(meetings)
  return meetings
}

export async function createProjectMeeting(projectId, meeting) {
  const response = await api.post(
    `/projects/${encodeURIComponent(projectId)}/meetings`,
    meeting
  )
  const project = projects.find(item => item.projectId === projectId)
  const record = response?.data?.meeting
  if (!project || !record) {
    throw new Error('The meeting was created, but its project details could not be loaded. Refresh the page.')
  }
  const createdMeeting = normalizeMeeting(record, project)
  setMeetings([...meetings, createdMeeting].sort((first, second) =>
    first.date.localeCompare(second.date) || first.startTime.localeCompare(second.startTime)
  ))
  return record
}

export async function deleteProjectMeeting(meeting) {
  await api.delete(
    `/projects/${encodeURIComponent(meeting.projectId)}/meetings/${encodeURIComponent(meeting.id)}`
  )
  setMeetings(meetings.filter(item => item.id !== meeting.id))
}

export function getMeetingProjectMembers(projectId) {
  const project = projects.find(item => item.projectId === projectId)
  return project ? getProjectMembers(project) : []
}

export function getSafeMeetingUrl(location = '') {
  try {
    const url = new URL(location)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}
