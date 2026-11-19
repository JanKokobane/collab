// ============================================================
// DASHBOARD ENTRY POINT
// ============================================================

import { updateNotifCount } from './state.js'
import { updateUserUI } from './auth.js?v=20261117-no-auto-sprints'
import { renderProjectNav } from './projects.js?v=20261121-task-sprint-decoupling'
import { renderTasks } from './tasks.js?v=20261121-task-sprint-decoupling'
import {
  renderMembersTable,
  renderAdminTasksTable,
  renderAdminMeetingsTable,
  renderAuditLogs
} from './admin.js?v=20261121-task-sprint-decoupling'
import {
  currentTheme,
  currentAccent,
  applyTheme,
  applyAccent,
  initSettingsControls
} from './theme.js'
import { initEventListeners } from './events.js?v=20261028-project-comments'

// Apply user theme and accent immediately
applyTheme(currentTheme)
applyAccent(currentAccent)
initSettingsControls()
initEventListeners()

// Initial Dashboard Renders
updateUserUI()
renderProjectNav()
renderTasks()
renderMembersTable()
renderAdminTasksTable()
renderAdminMeetingsTable()
renderAuditLogs()
updateNotifCount()
