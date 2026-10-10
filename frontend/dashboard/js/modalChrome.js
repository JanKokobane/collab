import { enhanceInputsWithIcons } from './icons.js'
import { closeModal, make, root } from './state.js'

export function showDashboardToast(message, type = 'success', { dismissible = false, duration = 4000 } = {}) {
  document.querySelector('.dashboard-toast')?.remove()
  const toast = make('div', `dashboard-toast is-${type}${dismissible ? ' is-dismissible' : ''}`)
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status')
  toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite')
  const text = make('span', 'dashboard-toast-message', message)
  toast.append(text)
  let leaveTimer
  let removeTimer
  const dismiss = () => {
    window.clearTimeout(leaveTimer)
    window.clearTimeout(removeTimer)
    toast.classList.add('is-leaving')
    removeTimer = window.setTimeout(() => toast.remove(), 200)
  }
  if (dismissible) {
    const close = make('button', 'dashboard-toast-close', '×')
    close.type = 'button'
    close.setAttribute('aria-label', 'Dismiss notification')
    close.addEventListener('click', dismiss)
    toast.append(close)
  }
  document.body.append(toast)
  if (duration > 0) {
    leaveTimer = window.setTimeout(dismiss, duration)
  }
}

export function showDashboardConfirmation({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false,
  compact = false,
  className = ''
}) {
  return new Promise(resolve => {
    const backdrop = make('div', 'modal-backdrop')
    const dialog = make(
      'section',
      `modal notification-confirmation-modal${compact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`
    )
    dialog.setAttribute('role', 'alertdialog')
    dialog.setAttribute('aria-modal', 'true')
    dialog.dataset.chromeReady = 'true'

    const close = make('button', 'close-modal', '×')
    close.type = 'button'
    close.setAttribute('aria-label', 'Cancel')

    const header = make('header', 'notification-confirmation-header')
    const iconWrap = make('div', `notification-confirmation-icon${danger ? ' destructive' : ''}`)
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    icon.setAttribute('viewBox', '0 0 24 24')
    icon.setAttribute('fill', 'none')
    icon.setAttribute('stroke', 'currentColor')
    icon.setAttribute('stroke-width', '1.8')
    icon.setAttribute('stroke-linecap', 'round')
    icon.setAttribute('stroke-linejoin', 'round')
    icon.setAttribute('aria-hidden', 'true')
    const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    iconPath.setAttribute('d', danger
      ? 'M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6'
      : 'M20 7 10 17l-5-5')
    icon.append(iconPath)
    iconWrap.append(icon)

    const eyebrow = make('span', 'notification-confirmation-eyebrow', 'Project confirmation')
    const heading = make('h2', '', title)
    heading.id = `dashboard-confirmation-title-${crypto.randomUUID()}`
    dialog.setAttribute('aria-labelledby', heading.id)
    const body = make('div', 'notification-confirmation-body')
    const copy = make('p', 'modal-copy', message)
    copy.id = `dashboard-confirmation-copy-${crypto.randomUUID()}`
    dialog.setAttribute('aria-describedby', copy.id)
    const actions = make('div', 'notification-confirmation-actions')
    const cancel = make('button', 'outline-button notification-confirmation-cancel', cancelText)
    cancel.type = 'button'
    const confirm = make('button', `primary-button${danger ? ' notification-confirmation-danger' : ' gold'}`, confirmText)
    confirm.type = 'button'
    confirm.classList.add('notification-confirmation-submit')

    let settled = false
    const finish = confirmed => {
      if (settled) return
      settled = true
      closeModal()
      document.removeEventListener('keydown', onKeyDown)
      resolve(confirmed)
    }
    const onKeyDown = event => {
      if (event.key === 'Escape') finish(false)
    }

    cancel.addEventListener('click', () => finish(false))
    confirm.addEventListener('click', () => finish(true))
    close.addEventListener('click', () => finish(false))
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) finish(false)
    })
    document.addEventListener('keydown', onKeyDown)

    actions.append(cancel, confirm)
    header.append(close, iconWrap, eyebrow, heading)
    body.append(copy, actions)
    dialog.append(header, body)
    backdrop.append(dialog)
    root.replaceChildren(backdrop)
    cancel.focus()
  })
}

function enhanceModal(modal) {
  if (modal.dataset.chromeReady === 'true') {
    enhanceInputsWithIcons(modal)
    return
  }
  const title = [...modal.children].find(child => child.tagName === 'H2')
  if (!title) {
    enhanceInputsWithIcons(modal)
    return
  }

  const header = document.createElement('header')
  header.className = 'dashboard-modal-header'
  const previous = title.previousElementSibling
  const eyebrow = previous?.classList.contains('eyebrow') || previous?.classList.contains('notification-confirmation-eyebrow')
    ? previous
    : null
  const close = [...modal.children].find(child => child.classList.contains('close-modal'))
  if (eyebrow) header.append(eyebrow)
  header.append(title)
  if (close) header.append(close)

  const body = document.createElement('div')
  body.className = 'modal-body'
  for (const child of [...modal.children]) {
    if (child !== header && child !== title && child !== eyebrow && child !== close) body.append(child)
  }
  modal.replaceChildren(header, body)
  modal.dataset.chromeReady = 'true'

  // Enhance all inputs inside modal body with SVG icons
  enhanceInputsWithIcons(body)

  const dialogLabelId = title.id || `dashboard-modal-title-${crypto.randomUUID()}`
  title.id = dialogLabelId
  if (modal.getAttribute('role') === 'dialog' || modal.getAttribute('role') === 'alertdialog') {
    modal.setAttribute('aria-labelledby', dialogLabelId)
  }
}

export function initModalChrome() {
  const modalRoot = document.querySelector('#modal-root')
  if (!modalRoot) return
  const observer = new MutationObserver(() => {
    modalRoot.querySelectorAll('.modal').forEach(enhanceModal)
    enhanceInputsWithIcons(document)
  })
  observer.observe(modalRoot, { childList: true, subtree: true })
  modalRoot.querySelectorAll('.modal').forEach(enhanceModal)

  // Run initial icon enhancement for all inputs on the dashboard page
  enhanceInputsWithIcons(document)
}
