import { currentUser, make, root } from './state.js'
import { switchView } from './navigation.js'

const PROFILE_ONBOARDING_KEY = 'collab-profile-onboarding-uid'

function hasCompleteProfile(user) {
  return Boolean(
    user?.name?.trim() &&
    user?.email?.trim() &&
    user?.phoneCountryCode &&
    user?.phoneNumber?.trim() &&
    user?.workspace?.trim() &&
    user?.role?.trim() &&
    user?.collaborationType &&
    user?.industry &&
    (user.collaborationType !== 'Other' || user.collaborationDetails?.trim())
  )
}

export function initProfileOnboarding() {
  const pendingUserId = localStorage.getItem(PROFILE_ONBOARDING_KEY)
  if (!pendingUserId || pendingUserId !== currentUser?.uid) return
  if (hasCompleteProfile(currentUser)) {
    localStorage.removeItem(PROFILE_ONBOARDING_KEY)
    return
  }

  const backdrop = make('div', 'modal-backdrop profile-onboarding-backdrop')
  const dialog = make('section', 'modal notification-confirmation-modal profile-onboarding-modal')
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-labelledby', 'profile-onboarding-title')
  dialog.setAttribute('aria-describedby', 'profile-onboarding-copy')

  const close = () => {
    localStorage.removeItem(PROFILE_ONBOARDING_KEY)
    root.replaceChildren()
  }

  const closeButton = make('button', 'close-modal', '×')
  closeButton.type = 'button'
  closeButton.setAttribute('aria-label', 'Close')
  closeButton.addEventListener('click', close)

  const header = make('header', 'notification-confirmation-header profile-onboarding-header')
  const iconWrap = make('div', 'notification-confirmation-icon')
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  icon.setAttribute('viewBox', '0 0 24 24')
  icon.setAttribute('fill', 'none')
  icon.setAttribute('stroke', 'currentColor')
  icon.setAttribute('stroke-width', '1.8')
  icon.setAttribute('stroke-linecap', 'round')
  icon.setAttribute('stroke-linejoin', 'round')
  icon.setAttribute('aria-hidden', 'true')
  const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  iconPath.setAttribute('d', 'M20 21a8 8 0 0 0-16 0m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z')
  icon.append(iconPath)
  iconWrap.append(icon)

  const eyebrow = make('span', 'notification-confirmation-eyebrow', 'Profile setup')
  const title = make('h2', '', 'Your account is ready')
  title.id = 'profile-onboarding-title'
  header.append(closeButton, iconWrap, eyebrow, title)

  const copy = make(
    'p',
    'modal-copy',
    'Review your profile details in Settings so teammates can see your name, company, role, and collaboration preferences.'
  )
  copy.id = 'profile-onboarding-copy'
  const actions = make('div', 'notification-confirmation-actions profile-onboarding-actions')
  const later = make('button', 'outline-button notification-confirmation-cancel', "I'll do this later")
  later.type = 'button'
  later.addEventListener('click', close)
  const update = make('button', 'primary-button gold notification-confirmation-submit', 'Update my profile')
  update.type = 'button'
  update.addEventListener('click', () => {
    close()
    switchView('Settings')
    window.setTimeout(() => document.querySelector('#profile-name-input')?.focus(), 0)
  })

  actions.append(later, update)
  const body = make('div', 'notification-confirmation-body profile-onboarding-body')
  body.append(copy, actions)
  dialog.append(header, body)
  backdrop.append(dialog)
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) close()
  })
  root.replaceChildren(backdrop)
  update.focus()
}
