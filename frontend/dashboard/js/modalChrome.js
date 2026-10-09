import { enhanceInputsWithIcons } from './icons.js'
import { closeModal, make, root } from './state.js'

export function showDashboardToast(message, type = 'success') {
  document.querySelector('.dashboard-toast')?.remove()
  const toast = make('div', `dashboard-toast is-${type}`, message)
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status')
  toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite')
  document.body.append(toast)
  window.setTimeout(() => {
    toast.classList.add('is-leaving')
    window.setTimeout(() => toast.remove(), 200)
  }, 4000)
}

export function showDashboardConfirmation({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false
}) {
  return new Promise(resolve => {
    const backdrop = make('div', 'modal-backdrop')
    const dialog = make('section', 'modal dashboard-confirmation-modal')
    dialog.setAttribute('role', 'alertdialog')
    dialog.setAttribute('aria-modal', 'true')
    const heading = make('h2', '', title)
    const copy = make('p', 'modal-copy', message)
    const actions = make('div', 'dashboard-confirmation-actions')
    const cancel = make('button', 'outline-button', cancelText)
    cancel.type = 'button'
    const confirm = make('button', danger ? 'primary-button danger' : 'primary-button gold', confirmText)
    confirm.type = 'button'

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
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) finish(false)
    })
    document.addEventListener('keydown', onKeyDown)

    actions.append(cancel, confirm)
    dialog.append(heading, copy, actions)
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
