import {
  addAuditLog,
  pushNotification,
  currentUser,
  setCurrentUser,
  members,
  saveMembers,
  auditLogs,
  hub,
  renderAvatarElement
} from './state.js'
import { updateUserUI } from './auth.js'
import {
  EmailAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  reauthenticateWithCredential,
  updateEmail,
  updatePassword,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
import { firebaseAuth } from '../../firebase.js'
import { validatePhoneNumber } from '../../shared/phoneValidation.js'

let passwordProviderObserverInitialized = false

// ============================================================
// THEME & APPEARANCE MANAGEMENT (DARK / LIGHT / SYSTEM)
// ============================================================

export let currentTheme = localStorage.getItem('collab_theme') || 'light'
export let currentAccent = localStorage.getItem('collab_accent') || 'gold'

export function applyTheme(theme) {
  currentTheme = theme
  localStorage.setItem('collab_theme', theme)

  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark)

  if (isDark) {
    document.documentElement.classList.add('dark-mode')
    document.body.classList.add('dark-mode')
  } else {
    document.documentElement.classList.remove('dark-mode')
    document.body.classList.remove('dark-mode')
  }

  document.querySelectorAll('.theme-card').forEach(card => {
    card.classList.toggle('active', card.dataset.theme === theme)
  })

  const badge = document.querySelector('#current-theme-badge')
  if (badge) {
    if (theme === 'dark') {
      badge.textContent = '🌙 Dark Mode Active'
      badge.style.background = '#362808'
      badge.style.color = '#FBBF24'
    } else if (theme === 'system') {
      badge.textContent = prefersDark ? '💻 System Default (Dark)' : '💻 System Default (Light)'
      badge.style.background = '#E0E7FF'
      badge.style.color = '#3730A3'
    } else {
      badge.textContent = '☀️ Light Mode'
      badge.style.background = '#FEF3C7'
      badge.style.color = '#92400E'
    }
  }

  const quickToggleBtn = document.querySelector('#theme-quick-toggle-btn')
  const quickToggleIcon = document.querySelector('#theme-toggle-icon')
  const quickToggleText = document.querySelector('#theme-toggle-text')
  if (quickToggleBtn && quickToggleIcon && quickToggleText) {
    if (isDark) {
      quickToggleIcon.textContent = '☀️'
      quickToggleText.textContent = 'Bright Mode'
      quickToggleBtn.title = 'Switch to Bright (Light) Mode'
    } else {
      quickToggleIcon.textContent = '🌙'
      quickToggleText.textContent = 'Dark Mode'
      quickToggleBtn.title = 'Switch to Dark Mode'
    }
  }

  const sidebarIndicator = document.querySelector('#sidebar-theme-indicator')
  if (sidebarIndicator) {
    sidebarIndicator.textContent = isDark ? '🌙 Dark' : '☀️ Bright'
  }

  const bannerIcon = document.querySelector('#banner-theme-icon')
  const bannerLabel = document.querySelector('#banner-theme-label')
  if (bannerIcon && bannerLabel) {
    if (isDark) {
      bannerIcon.textContent = '☀️'
      bannerLabel.textContent = 'Switch to Light Mode'
    } else {
      bannerIcon.textContent = '🌙'
      bannerLabel.textContent = 'Switch to Dark Mode'
    }
  }

  const dropdownThemeIcon = document.querySelector('#dropdown-theme-icon')
  const dropdownThemeText = document.querySelector('#dropdown-theme-text')
  if (dropdownThemeIcon && dropdownThemeText) {
    if (isDark) {
      dropdownThemeIcon.textContent = '☀️'
      dropdownThemeText.textContent = 'Switch to Light Mode'
    } else {
      dropdownThemeIcon.textContent = '🌙'
      dropdownThemeText.textContent = 'Switch to Dark Mode'
    }
  }
}

export function toggleDarkLightMode() {
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  const isCurrentlyDark = currentTheme === 'dark' || (currentTheme === 'system' && prefersDark)
  const nextTheme = isCurrentlyDark ? 'light' : 'dark'
  applyTheme(nextTheme)
  addAuditLog('Theme changed', `Workspace appearance toggled to ${nextTheme === 'dark' ? 'Dark Mode' : 'Light Mode'}.`, 'palette')
  pushNotification(
    'Theme Updated',
    `Workspace switched to ${nextTheme === 'dark' ? 'Dark Mode 🌙' : 'Light Mode ☀️'}`,
    nextTheme === 'dark' ? '🌙' : '☀️',
    'coral-bg'
  )
}

export function applyAccent(accent) {
  currentAccent = accent
  localStorage.setItem('collab_accent', accent)

  const colors = {
    gold: { gold: '#F5B800', hover: '#E5AA00' },
    blue: { gold: '#3B82F6', hover: '#2563EB' },
    emerald: { gold: '#10B981', hover: '#059669' },
    coral: { gold: '#EF4444', hover: '#DC2626' },
    purple: { gold: '#8B5CF6', hover: '#7C3AED' }
  }

  const chosen = colors[accent] || colors.gold
  document.documentElement.style.setProperty('--gold', chosen.gold)
  document.documentElement.style.setProperty('--gold-hover', chosen.hover)

  document.querySelectorAll('.accent-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.accent === accent)
  })
}

export const defaultCollabSettings = {
  collabSync: true,
  calendarPins: true,
  comments: true,
  approvalWorkflow: true,
  sprintCadence: true,
  publicShare: true,
  soundNotifs: true,
  huddleLinks: true,
  sprintRollover: true,
  multiAssignee: true,
  highContrast: false,
  adminAuthority: true,
  sessionTimeout: true,
  twoFactor: true
}

export let collabSettings = defaultCollabSettings
try {
  const saved = localStorage.getItem('collab_tool_settings')
  if (saved) collabSettings = { ...defaultCollabSettings, ...JSON.parse(saved) }
} catch (e) {}

export function saveCollabSettings() {
  localStorage.setItem('collab_tool_settings', JSON.stringify(collabSettings))
}

// User Profile Form Population & Preview
export function populateProfileForm() {
  if (!currentUser) return

  const nameInput = document.querySelector('#profile-name-input')
  const emailInput = document.querySelector('#profile-email-input')
  const phoneCountryInput = document.querySelector('#profile-phone-country-input')
  const phoneInput = document.querySelector('#profile-phone-input')
  const roleInput = document.querySelector('#profile-role-input')
  const workspaceInput = document.querySelector('#profile-workspace-input')
  const collaborationTypeInput = document.querySelector('#profile-collaboration-type-input')
  const collaborationDetailsInput = document.querySelector('#profile-collaboration-details-input')
  const industryInput = document.querySelector('#profile-industry-input')
  const toneInput = document.querySelector('#profile-avatar-tone')
  const statusInput = document.querySelector('#profile-status-input')
  const tzInput = document.querySelector('#profile-timezone-input')

  if (nameInput) nameInput.value = currentUser.name || ''
  if (emailInput) emailInput.value = currentUser.email || ''
  if (phoneCountryInput) phoneCountryInput.value = currentUser.phoneCountryCode || ''
  if (phoneInput) phoneInput.value = currentUser.phoneNumber || ''
  if (roleInput) roleInput.value = currentUser.role || ''
  if (workspaceInput) workspaceInput.value = currentUser.workspace || ''
  if (collaborationTypeInput) collaborationTypeInput.value = currentUser.collaborationType || ''
  if (collaborationDetailsInput) collaborationDetailsInput.value = currentUser.collaborationDetails || ''
  const collaborationDetailsGroup = document.querySelector('#profile-collaboration-details-group')
  if (collaborationDetailsGroup) collaborationDetailsGroup.hidden = collaborationTypeInput?.value !== 'Other'
  if (collaborationDetailsInput) collaborationDetailsInput.required = collaborationTypeInput?.value === 'Other'
  if (industryInput) industryInput.value = currentUser.industry || ''
  if (toneInput) toneInput.value = currentUser.tone || 'coral'
  if (statusInput) statusInput.value = currentUser.status || '⚡ Focused on Q4 deliverables'
  if (tzInput && currentUser.timezone) tzInput.value = currentUser.timezone

  updateProfilePreview()
}

export function updateProfilePreview() {
  if (!currentUser) return
  const av = document.querySelector('#profile-preview-avatar')
  const nm = document.querySelector('#profile-preview-name')
  const em = document.querySelector('#profile-preview-email')
  const rl = document.querySelector('#profile-preview-role')

  if (av) renderAvatarElement(av, currentUser, 'profile-preview-avatar')
  if (nm) nm.textContent = currentUser.name || 'Alex Morgan'
  if (em) em.textContent = currentUser.email || 'admin@collab.io'
  if (rl) rl.textContent = currentUser.role || 'Workspace Admin'
}

function showProfileSavedToast() {
  document.querySelector('.profile-save-toast')?.remove()
  const toast = document.createElement('div')
  toast.className = 'profile-save-toast'
  toast.setAttribute('role', 'status')
  toast.setAttribute('aria-live', 'polite')
  toast.textContent = 'Your profile has been updated.'
  document.body.append(toast)
  window.setTimeout(() => toast.remove(), 4000)
}

export async function saveUserProfile(e) {
  if (e) e.preventDefault()

  const nameInput = document.querySelector('#profile-name-input')
  const emailInput = document.querySelector('#profile-email-input')
  const phoneCountryInput = document.querySelector('#profile-phone-country-input')
  const phoneInput = document.querySelector('#profile-phone-input')
  const workspaceInput = document.querySelector('#profile-workspace-input')
  const roleInput = document.querySelector('#profile-role-input')
  const collaborationTypeInput = document.querySelector('#profile-collaboration-type-input')
  const collaborationDetailsInput = document.querySelector('#profile-collaboration-details-input')
  const industryInput = document.querySelector('#profile-industry-input')
  const name = nameInput?.value.trim() || ''
  const email = emailInput?.value.trim().toLowerCase() || ''
  const phoneCountryCode = phoneCountryInput?.value || ''
  const phoneNumber = phoneInput?.value.trim() || ''
  const workspace = workspaceInput?.value.trim() || ''
  const role = roleInput?.value.trim() || ''
  const collaborationType = collaborationTypeInput?.value || ''
  const collaborationDetails = collaborationDetailsInput?.value.trim() || ''
  const industry = industryInput?.value || ''
  const tone = document.querySelector('#profile-avatar-tone')?.value || currentUser.tone || 'coral'
  const status = document.querySelector('#profile-status-input')?.value.trim() || ''
  const timezone = document.querySelector('#profile-timezone-input')?.value || 'America/Los_Angeles'
  const profileImageInput = document.querySelector('#profile-image-input')
  const selectedImage = profileImageInput?.dataset.imageData || currentUser.profileImage || ''
  const previousEmail = currentUser.email

  if (!name || !email || !phoneCountryCode || !phoneNumber || !workspace || !role || !collaborationType || !industry ||
    (collaborationType === 'Other' && !collaborationDetails)) {
    pushNotification('Profile Incomplete', 'Please complete all required profile fields before saving.', '⚠️', 'coral-bg')
    return
  }

  const phoneValidation = validatePhoneNumber(phoneNumber, phoneCountryInput)
  if (!phoneValidation.valid) {
    pushNotification('Invalid Phone Number', phoneValidation.message, '⚠️', 'coral-bg')
    phoneInput?.focus()
    return
  }

  const firebaseUser = firebaseAuth.currentUser
  try {
    if (firebaseUser && email !== firebaseUser.email) {
      await updateEmail(firebaseUser, email)
    }
    if (firebaseUser && name !== firebaseUser.displayName) {
      await updateProfile(firebaseUser, { displayName: name })
    }
  } catch (error) {
    console.error('Unable to update Firebase profile:', error)
    const message = error.code === 'auth/requires-recent-login'
      ? 'Please sign out and sign in again before changing your profile email or name.'
      : error.message || 'Firebase could not update your profile. Please try again.'
    pushNotification('Profile Update Failed', message, '⚠️', 'coral-bg')
    return
  }

  // Calculate clean 2-letter initials
  const words = name.split(/\s+/).filter(Boolean)
  const initials = words.length > 1
    ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
    : (words[0] ? words[0].slice(0, 2).toUpperCase() : 'AM')

  currentUser.name = name
  currentUser.email = email
  currentUser.phoneCountryCode = phoneCountryCode
  currentUser.phoneNumber = phoneNumber
  currentUser.workspace = workspace
  currentUser.role = role
  currentUser.collaborationType = collaborationType
  currentUser.collaborationDetails = collaborationDetails
  currentUser.industry = industry
  currentUser.tone = tone
  currentUser.initials = initials
  currentUser.status = status
  currentUser.timezone = timezone
  currentUser.profileImage = selectedImage
  currentUser.photoURL = selectedImage

  setCurrentUser(currentUser)
  if (localStorage.getItem('collab-profile-onboarding-uid') === currentUser.uid) {
    localStorage.removeItem('collab-profile-onboarding-uid')
  }

  // Sync with workspace members list
  const memberMatch = members.find(m => m.email && previousEmail && m.email.toLowerCase() === previousEmail.toLowerCase())
  if (memberMatch) {
    memberMatch.name = name
    memberMatch.email = email
    memberMatch.role = role
    memberMatch.tone = tone
    memberMatch.initials = initials
    memberMatch.profileImage = selectedImage
    memberMatch.photoURL = selectedImage
    saveMembers()
    hub.renderMembersTable?.()
  }

  updateProfilePreview()
  updateUserUI()

  addAuditLog('Profile updated', `${currentUser.name} updated profile details, avatar tone, and job role to ${role}.`, 'user')
  pushNotification(
    'Profile Updated',
    `Saved changes for ${currentUser.name} (${role})`,
    currentUser.initials,
    `${currentUser.tone}-bg`
  )
  showProfileSavedToast()
}

export function initSettingsControls() {
  // Appearance Theme Cards
  document.querySelectorAll('.theme-card').forEach(card => {
    card.onclick = () => {
      const selected = card.dataset.theme
      applyTheme(selected)
      addAuditLog('Theme changed', `Workspace appearance set to ${selected === 'dark' ? 'Dark Mode' : (selected === 'system' ? 'System Default' : 'Light Mode')}.`, 'palette')
      pushNotification(
        'Theme Updated',
        `Switched to ${selected === 'dark' ? 'Dark Mode 🌙' : (selected === 'system' ? 'System Default 💻' : 'Light Mode ☀️')}`,
        selected === 'dark' ? '🌙' : '☀️',
        'coral-bg'
      )
    }
  })

  // Accent Pills
  document.querySelectorAll('.accent-color-options .accent-pill').forEach(pill => {
    pill.onclick = () => {
      const accent = pill.dataset.accent
      applyAccent(accent)
      addAuditLog('Accent changed', `Workspace accent tint set to ${accent}.`, 'palette')
      pushNotification('Accent Updated', `Accent color changed to ${accent}`, '🎨', 'coral-bg')
    }
  })

  // High contrast switch
  const highContrastToggle = document.querySelector('#toggle-high-contrast')
  if (highContrastToggle) {
    highContrastToggle.checked = !!collabSettings.highContrast
  }
  document.body.classList.toggle('high-contrast', !!collabSettings.highContrast)

  // Collaboration Toggles
  const syncToggle = document.querySelector('#toggle-collab-sync')
  if (syncToggle) syncToggle.checked = collabSettings.collabSync !== false

  const pinToggle = document.querySelector('#toggle-calendar-pins')
  if (pinToggle) pinToggle.checked = collabSettings.calendarPins !== false

  const commentsToggle = document.querySelector('#toggle-comments')
  if (commentsToggle) commentsToggle.checked = collabSettings.comments !== false

  const approvalToggle = document.querySelector('#toggle-approval-workflow')
  if (approvalToggle) approvalToggle.checked = collabSettings.approvalWorkflow !== false

  const sprintToggle = document.querySelector('#toggle-sprint-cadence')
  if (sprintToggle) sprintToggle.checked = collabSettings.sprintCadence !== false

  const shareToggle = document.querySelector('#toggle-public-share')
  if (shareToggle) shareToggle.checked = collabSettings.publicShare !== false

  const soundToggle = document.querySelector('#toggle-sound-notifs')
  if (soundToggle) soundToggle.checked = collabSettings.soundNotifs !== false

  const huddleToggle = document.querySelector('#toggle-huddle-links')
  if (huddleToggle) huddleToggle.checked = collabSettings.huddleLinks !== false

  const rolloverToggle = document.querySelector('#toggle-sprint-rollover')
  if (rolloverToggle) rolloverToggle.checked = collabSettings.sprintRollover !== false

  const multiToggle = document.querySelector('#toggle-multi-assignee')
  if (multiToggle) multiToggle.checked = collabSettings.multiAssignee !== false

  const authorityToggle = document.querySelector('#toggle-sec-admin-authority')
  if (authorityToggle) authorityToggle.checked = collabSettings.adminAuthority !== false

  const timeoutToggle = document.querySelector('#toggle-sec-timeout')
  if (timeoutToggle) timeoutToggle.checked = collabSettings.sessionTimeout !== false

  const twoFactorToggle = document.querySelector('#toggle-2fa')
  const badge2FA = document.querySelector('#badge-2fa-status')
  if (twoFactorToggle) {
    twoFactorToggle.checked = collabSettings.twoFactor !== false
    if (badge2FA) badge2FA.textContent = twoFactorToggle.checked ? 'Active' : 'Disabled'
    twoFactorToggle.onchange = (e) => {
      collabSettings.twoFactor = e.target.checked
      saveCollabSettings()
      if (badge2FA) badge2FA.textContent = e.target.checked ? 'Active' : 'Disabled'
      addAuditLog('2FA Updated', `Two-factor authentication ${e.target.checked ? 'enabled' : 'disabled'}.`, 'shield')
      pushNotification('Security Updated', `2FA is now ${e.target.checked ? 'Active 🔒' : 'Disabled ⚠️'}`, '🔒', 'teal-bg')
    }
  }

  // Active Session Revocation Handlers
  document.querySelector('#revoke-mobile-session-btn')?.addEventListener('click', (e) => {
    const row = e.target.closest('div')
    if (row) row.style.opacity = '0.4'
    e.target.textContent = 'Revoked'
    e.target.disabled = true
    addAuditLog('Session Revoked', 'Collab iOS mobile session token invalidated.', 'shield')
    pushNotification('Session Revoked', 'Mobile device logged out successfully.', '📱', 'coral-bg')
  })

  document.querySelector('#signout-other-sessions-btn')?.addEventListener('click', () => {
    const mobileRow = document.querySelector('#revoke-mobile-session-btn')?.closest('div')
    if (mobileRow) {
      mobileRow.style.opacity = '0.4'
      const btn = mobileRow.querySelector('button')
      if (btn) { btn.textContent = 'Revoked'; btn.disabled = true }
    }
    addAuditLog('Sessions Terminated', 'All remote workspace sessions signed out.', 'shield')
    pushNotification('Security Updated', 'All other browser and mobile sessions terminated.', '🛡️', 'teal-bg')
  })

  // Export Audit Log
  document.querySelector('#export-audit-btn')?.addEventListener('click', () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(auditLogs, null, 2))
    const a = document.createElement('a')
    a.setAttribute('href', dataStr)
    a.setAttribute('download', `collab_audit_log_${new Date().toISOString().slice(0, 10)}.json`)
    document.body.appendChild(a)
    a.click()
    a.remove()
    pushNotification('Audit Log Exported', 'Security log saved as JSON.', '📋', 'teal-bg')
  })

  // Load Workspace Org Settings
  try {
    const org = JSON.parse(localStorage.getItem('collab-workspace-settings') || '{}')
    if (org.name && document.querySelector('#ws-name-input')) {
      document.querySelector('#ws-name-input').value = org.name
    }
    if (org.defaultRole && document.querySelector('#ws-default-role-input')) {
      document.querySelector('#ws-default-role-input').value = org.defaultRole
    }
  } catch (e) {}

  // Populate Profile Form
  populateProfileForm()

  const profileImageInput = document.querySelector('#profile-image-input')
  profileImageInput?.addEventListener('change', (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      pushNotification('Image Too Large', 'Please upload a profile photo smaller than 2 MB.', '⚠️', 'coral-bg')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const imageData = String(reader.result || '')
      event.target.dataset.imageData = imageData
      currentUser.profileImage = imageData
      currentUser.photoURL = imageData
      setCurrentUser(currentUser)
      updateProfilePreview()
      updateUserUI()
      pushNotification('Profile Photo Updated', 'Your new picture is now visible in the workspace.', '✅', 'teal-bg')
    }
    reader.readAsDataURL(file)
  })

  // Profile Form Submit
  const profileForm = document.querySelector('#profile-settings-form')
  if (profileForm) {
    profileForm.onsubmit = saveUserProfile
  }
  const collaborationTypeInput = document.querySelector('#profile-collaboration-type-input')
  const collaborationDetailsInput = document.querySelector('#profile-collaboration-details-input')
  const collaborationDetailsGroup = document.querySelector('#profile-collaboration-details-group')
  collaborationTypeInput?.addEventListener('change', () => {
    const isOther = collaborationTypeInput.value === 'Other'
    if (collaborationDetailsGroup) collaborationDetailsGroup.hidden = !isOther
    if (collaborationDetailsInput) {
      collaborationDetailsInput.required = isOther
      if (!isOther) collaborationDetailsInput.value = ''
    }
  })

  // Password Change Handling
  const pwdForm = document.querySelector('#password-settings-form')
  const newPwdInput = document.querySelector('#new-password-input')
  const confirmPwdInput = document.querySelector('#confirm-password-input')
  const currentPwdInput = document.querySelector('#current-password-input')
  const strengthBar = document.querySelector('#pwd-strength-bar')
  const strengthText = document.querySelector('#pwd-strength-text')
  const currentPasswordGroup = currentPwdInput?.closest('.admin-form-group')
  if (!passwordProviderObserverInitialized) {
    passwordProviderObserverInitialized = true
    onAuthStateChanged(firebaseAuth, user => {
      const hasPasswordProvider = user?.providerData.some(provider => provider.providerId === 'password') || false
      if (currentPasswordGroup) currentPasswordGroup.hidden = Boolean(user && !hasPasswordProvider)
      if (currentPwdInput) currentPwdInput.required = Boolean(user && hasPasswordProvider)
    })
  }

  if (newPwdInput) {
    newPwdInput.oninput = () => {
      const val = newPwdInput.value
      if (!val) {
        if (strengthBar) strengthBar.style.width = '0%'
        if (strengthText) strengthText.textContent = 'Password strength'
        return
      }
      let score = 0
      if (val.length >= 6) score++
      if (val.length >= 10) score++
      if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score++
      if (/[0-9]/.test(val) || /[^A-Za-z0-9]/.test(val)) score++

      if (score <= 1) {
        if (strengthBar) { strengthBar.style.width = '25%'; strengthBar.style.background = '#EF4444' }
        if (strengthText) { strengthText.textContent = 'Weak'; strengthText.style.color = '#EF4444' }
      } else if (score <= 3) {
        if (strengthBar) { strengthBar.style.width = '65%'; strengthBar.style.background = '#F5B800' }
        if (strengthText) { strengthText.textContent = 'Moderate'; strengthText.style.color = '#D97706' }
      } else {
        if (strengthBar) { strengthBar.style.width = '100%'; strengthBar.style.background = '#10B981' }
        if (strengthText) { strengthText.textContent = 'Strong'; strengthText.style.color = '#059669' }
      }
    }
  }

  // Password Visibility Toggle Buttons
  document.querySelectorAll('.pwd-toggle-btn').forEach(btn => {
    btn.onclick = () => {
      const targetId = btn.dataset.target
      const input = document.getElementById(targetId)
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password'
        btn.textContent = input.type === 'password' ? '👁️' : '🔒'
      }
    }
  })

  if (pwdForm) {
    pwdForm.onsubmit = async (e) => {
      e.preventDefault()
      const newPwd = newPwdInput?.value || ''
      const confirmPwd = confirmPwdInput?.value || ''
      const currentPwd = currentPwdInput?.value || ''

      if (newPwd.length < 6) {
        pushNotification('Security Notice', 'New password must contain at least 6 characters.', '⚠️', 'coral-bg')
        return
      }
      if (newPwd !== confirmPwd) {
        pushNotification('Mismatch Error', 'New password and confirmation do not match.', '⚠️', 'coral-bg')
        return
      }

      try {
        const activeFirebaseUser = firebaseAuth.currentUser
        if (activeFirebaseUser) {
          const hasPasswordProvider = activeFirebaseUser.providerData.some(provider => provider.providerId === 'password')
          if (hasPasswordProvider) {
            if (!currentPwd) {
              pushNotification('Security Notice', 'Enter your current password to update it.', '⚠️', 'coral-bg')
              return
            }
            const credential = EmailAuthProvider.credential(activeFirebaseUser.email, currentPwd)
            await reauthenticateWithCredential(activeFirebaseUser, credential)
            await updatePassword(activeFirebaseUser, newPwd)
          } else {
            const credential = EmailAuthProvider.credential(activeFirebaseUser.email, newPwd)
            await linkWithCredential(activeFirebaseUser, credential)
          }
        } else {
          localStorage.setItem('collab_password_timestamp', Date.now().toString())
        }
      } catch (error) {
        console.error('Unable to update Firebase password:', error)
        const message = error.code === 'auth/requires-recent-login'
          ? 'Please sign out and sign in again, then retry the password update.'
          : error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential'
            ? 'The current password is incorrect.'
            : error.message || 'The password could not be updated. Please try again.'
        pushNotification('Password Update Failed', message, '⚠️', 'coral-bg')
        return
      }

      if (currentPwdInput) currentPwdInput.value = ''
      if (newPwdInput) newPwdInput.value = ''
      if (confirmPwdInput) confirmPwdInput.value = ''
      if (strengthBar) strengthBar.style.width = '0%'
      if (strengthText) strengthText.textContent = 'Password strength'

      addAuditLog('Password changed', `${currentUser.name} successfully updated account authentication password.`, 'shield')
      pushNotification('Password Updated', 'Your security password has been changed successfully.', '🔒', 'teal-bg')
    }
  }

  // Apply Theme and Accent
  applyTheme(currentTheme)
  applyAccent(currentAccent)
}
