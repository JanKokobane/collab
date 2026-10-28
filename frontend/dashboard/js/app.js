// ============================================================
// DASHBOARD ENTRY POINT
// ============================================================

import { updateNotifCount } from './state.js'
import { updateUserUI } from './auth.js'
import { renderProjectNav } from './projects.js?v=20261105-invitation-roles'
import { renderTasks } from './tasks.js'
import {
  renderMembersTable,
  renderAdminTasksTable,
  renderAdminMeetingsTable,
  renderAuditLogs
} from './admin.js?v=20261028-file-picker-fix'
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
