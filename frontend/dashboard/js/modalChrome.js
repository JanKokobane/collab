import { enhanceInputsWithIcons } from './icons.js'

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

