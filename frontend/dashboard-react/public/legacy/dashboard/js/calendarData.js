import { api } from './api.js'
import { projects, reminders, replaceProjectTasksFromBackend, setReminders } from './state.js'

function normalizeReminder(record, project) {
  const date = record.reminder_date instanceof Date
    ? record.reminder_date.toISOString().slice(0, 10)
    : String(record.reminder_date || '').slice(0, 10)
  const timeValue = String(record.reminder_time || '').slice(0, 5)
  return {
    id: record.reminder_id,
    projectId: record.project_id,
    projectName: record.project_name || project.name,
    title: record.title,
    date,
    timeValue,
    time: timeValue,
    priority: record.priority,
    author: record.created_by_name || 'Project member',
    creatorFirebaseUid: record.created_by_firebase_uid
  }
}

export async function loadProjectCalendarData() {
  const projectData = await Promise.all(projects.map(async project => {
    const [taskResponse, reminderResponse] = await Promise.all([
      api.get(`/projects/${encodeURIComponent(project.projectId)}/tasks`),
      api.get(`/projects/${encodeURIComponent(project.projectId)}/reminders`)
    ])
    if (!Array.isArray(taskResponse?.data?.tasks)) {
      throw new Error(`The server returned an invalid tasks response for ${project.name}.`)
    }
    if (!Array.isArray(reminderResponse?.data?.reminders)) {
      throw new Error(`The server returned an invalid reminders response for ${project.name}.`)
    }
    return {
      projectId: project.projectId,
      tasks: taskResponse.data.tasks,
      reminders: reminderResponse.data.reminders.map(record => normalizeReminder(record, project))
    }
  }))

  replaceProjectTasksFromBackend(projectData.map(({ projectId, tasks }) => ({ projectId, tasks })))
  setReminders(projectData.flatMap(({ reminders }) => reminders).sort((first, second) =>
    first.date.localeCompare(second.date) || first.timeValue.localeCompare(second.timeValue)
  ))
}

export async function createProjectReminder(projectId, reminder) {
  const response = await api.post(
    `/projects/${encodeURIComponent(projectId)}/reminders`,
    reminder
  )
  const project = projects.find(item => item.projectId === projectId)
  const record = response?.data?.reminder
  if (!project || !record) {
    throw new Error('The reminder was created, but its project details could not be loaded. Refresh the page.')
  }
  const normalized = normalizeReminder(record, project)
  setReminders([
    ...reminders,
    normalized
  ].sort((first, second) =>
    first.date.localeCompare(second.date) || first.timeValue.localeCompare(second.timeValue)
  ))
  return normalized
}
