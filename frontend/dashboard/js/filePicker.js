let filePickerId = 0

function make(tagName, className = '', text = '') {
  const element = document.createElement(tagName)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

export function createNativeFilePicker({
  label = 'Attach file',
  ariaLabel = label,
  accept = '',
  multiple = true,
  onFiles,
  onError
} = {}) {
  const id = `collab-attachment-picker-${++filePickerId}`
  const input = make('input', 'task-media-file-input')
  input.id = id
  input.type = 'file'
  input.accept = accept
  input.multiple = multiple
  input.setAttribute('aria-label', ariaLabel)

  const trigger = make('button', 'task-media-action', label)
  trigger.type = 'button'
  trigger.setAttribute('aria-controls', id)
  trigger.addEventListener('click', event => {
    event.preventDefault()
    input.click()
  })

  input.addEventListener('change', () => {
    try {
      const files = Array.from(input.files || [])
      console.info('[file-picker] File selection changed.', {
        inputId: id,
        count: files.length
      })
      onFiles?.(files)
    } catch (error) {
      console.error('[file-picker] Unable to process selected files.', {
        inputId: id,
        error
      })
      onError?.(error)
    } finally {
      input.value = ''
    }
  })

  input.addEventListener('invalid', event => {
    console.error('[file-picker] File input became invalid.', {
      inputId: id,
      event
    })
    onError?.(new Error('The attachment file input is invalid.'))
  })

  return {
    input,
    trigger,
    id
  }
}
