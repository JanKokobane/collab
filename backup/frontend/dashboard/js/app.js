// ============================================================
// DASHBOARD ENTRY POINT
// ============================================================

import { updateNotifCount } from './state.js'
import { updateUserUI } from './auth.js'
import { renderProjectNav } from './projects.js'
import { renderTasks } from './tasks.js'
import {
  renderMembersTable,
  renderAdminTasksTable,
  renderAdminMeetingsTable,
  renderAuditLogs
} from './admin.js'
import {
  currentTheme,
  currentAccent,
  applyTheme,
  applyAccent,
  initSettingsControls
} from './theme.js'
import { initEventListeners } from './events.js'

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
