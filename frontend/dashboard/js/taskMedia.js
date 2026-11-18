import { createNativeFilePicker } from './filePicker.js?v=20261118-real-file-icons'

const maxTaskMediaBytes = 100 * 1024 * 1024
const maxScreenClipMs = 90_000

const ACTION_ICONS = {
  attach: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
  mic: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>`,
  screen: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`
}

const MIME_BY_EXTENSION = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  xml: 'application/xml',
  zip: 'application/zip',
  gz: 'application/gzip',
  tar: 'application/x-tar',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime'
}

function make(tagName, className = '', text = '') {
  const element = document.createElement(tagName)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

function getFileExtension(fileName = '') {
  const match = String(fileName || '').trim().toLowerCase().match(/\.([a-z0-9]{1,8})$/)
  return match ? match[1] : ''
}

export function resolveAttachmentMediaType(fileName = '', mediaType = '') {
  const normalized = String(mediaType || '').trim().toLowerCase()
  if (normalized && normalized !== 'application/octet-stream') return normalized
  const ext = getFileExtension(fileName)
  return MIME_BY_EXTENSION[ext] || normalized || 'application/octet-stream'
}

export function getFileCategory(fileName = '', mediaType = '') {
  const mime = resolveAttachmentMediaType(fileName, mediaType)
  const ext = getFileExtension(fileName)

  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'heic', 'ico', 'avif'].includes(ext)) return 'image'
  if (mime.startsWith('audio/') || ['mp3', 'm4a', 'wav', 'ogg', 'aac', 'flac', 'weba'].includes(ext)) return 'audio'
  if (mime.startsWith('video/') || ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'].includes(ext)) return 'video'
  if (mime.includes('word') || mime.includes('opendocument.text') || mime.includes('rtf') || ['doc', 'docx', 'odt', 'rtf', 'pages'].includes(ext)) return 'word'
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime === 'text/csv' || ['xls', 'xlsx', 'ods', 'csv', 'tsv', 'numbers'].includes(ext)) return 'sheet'
  if (mime.includes('presentation') || mime.includes('powerpoint') || ['ppt', 'pptx', 'odp', 'key'].includes(ext)) return 'slide'
  if (mime.includes('zip') || mime.includes('tar') || mime.includes('rar') || mime.includes('7z') || mime.includes('gzip') || mime.includes('compressed') || ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2'].includes(ext)) return 'archive'
  if (mime.includes('json') || mime.includes('javascript') || mime.includes('typescript') || mime.includes('xml') || ['js', 'ts', 'jsx', 'tsx', 'json', 'py', 'sql', 'yaml', 'yml', 'html', 'css', 'xml', 'sh', 'java', 'go', 'rs', 'c', 'cpp'].includes(ext)) return 'code'
  if (mime.startsWith('text/') || ['txt', 'md', 'log', 'ini', 'env'].includes(ext)) return 'text'
  return 'file'
}

function getFileIconSvg(category) {
  switch (category) {
    case 'pdf':
      return `<svg viewBox="0 0 32 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 3.5A2.5 2.5 0 0 1 7.5 1H20l9 9v22.5A2.5 2.5 0 0 1 26.5 35h-19A2.5 2.5 0 0 1 5 32.5V3.5Z" fill="#FFF5F5" stroke="#E11D48" stroke-width="1.5"/>
        <path d="M20 1v6.5A2.5 2.5 0 0 0 22.5 10H29" fill="#FECDD3" stroke="#E11D48" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M12.5 19.5c1.6-3.7 2.8-6.4 3-8.1.2-1.3-.8-1.8-1.4-.9-.7 1.1.2 4 2.4 6.5 1.8 2 4.3 3.2 5.7 3 .9-.1 1-1.1.1-1.5-1.5-.7-5-.2-8.2 1.2-2.6 1.1-4.3 2.5-3.9 3.4.3.7 1.3.4 2.3-1.4" stroke="#E11D48" stroke-width="1.35" stroke-linecap="round"/>
        <rect x="2" y="23.5" width="22" height="9" rx="2.2" fill="#E11D48"/>
        <text x="13" y="30" text-anchor="middle" fill="#FFFFFF" font-family="DM Sans, Arial, sans-serif" font-size="6.8" font-weight="800" letter-spacing="0.4">PDF</text>
      </svg>`
    case 'word':
      return `<svg viewBox="0 0 32 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 3.5A2.5 2.5 0 0 1 7.5 1H20l9 9v22.5A2.5 2.5 0 0 1 26.5 35h-19A2.5 2.5 0 0 1 5 32.5V3.5Z" fill="#EFF6FF" stroke="#2563EB" stroke-width="1.5"/>
        <path d="M20 1v6.5A2.5 2.5 0 0 0 22.5 10H29" fill="#BFDBFE" stroke="#2563EB" stroke-width="1.5" stroke-linejoin="round"/>
        <line x1="10" y1="15.5" x2="23" y2="15.5" stroke="#2563EB" stroke-width="1.6" stroke-linecap="round"/>
        <line x1="10" y1="19.5" x2="23" y2="19.5" stroke="#60A5FA" stroke-width="1.6" stroke-linecap="round"/>
        <rect x="2" y="23.5" width="22" height="9" rx="2.2" fill="#2563EB"/>
        <text x="13" y="30" text-anchor="middle" fill="#FFFFFF" font-family="DM Sans, Arial, sans-serif" font-size="6.4" font-weight="800" letter-spacing="0.3">DOC</text>
      </svg>`
    case 'sheet':
      return `<svg viewBox="0 0 32 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 3.5A2.5 2.5 0 0 1 7.5 1H20l9 9v22.5A2.5 2.5 0 0 1 26.5 35h-19A2.5 2.5 0 0 1 5 32.5V3.5Z" fill="#ECFDF5" stroke="#16A34A" stroke-width="1.5"/>
        <path d="M20 1v6.5A2.5 2.5 0 0 0 22.5 10H29" fill="#BBF7D0" stroke="#16A34A" stroke-width="1.5" stroke-linejoin="round"/>
        <rect x="9.5" y="13.5" width="14" height="8.5" rx="1.2" stroke="#16A34A" stroke-width="1.35"/>
        <line x1="16.5" y1="13.5" x2="16.5" y2="22" stroke="#16A34A" stroke-width="1.2"/>
        <line x1="9.5" y1="17.8" x2="23.5" y2="17.8" stroke="#16A34A" stroke-width="1.2"/>
        <rect x="2" y="23.5" width="22" height="9" rx="2.2" fill="#16A34A"/>
        <text x="13" y="30" text-anchor="middle" fill="#FFFFFF" font-family="DM Sans, Arial, sans-serif" font-size="6.5" font-weight="800" letter-spacing="0.3">XLS</text>
      </svg>`
    case 'slide':
      return `<svg viewBox="0 0 32 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 3.5A2.5 2.5 0 0 1 7.5 1H20l9 9v22.5A2.5 2.5 0 0 1 26.5 35h-19A2.5 2.5 0 0 1 5 32.5V3.5Z" fill="#FFF7ED" stroke="#EA580C" stroke-width="1.5"/>
        <path d="M20 1v6.5A2.5 2.5 0 0 0 22.5 10H29" fill="#FED7AA" stroke="#EA580C" stroke-width="1.5" stroke-linejoin="round"/>
        <rect x="10" y="14" width="13" height="8" rx="1.3" stroke="#EA580C" stroke-width="1.4"/>
        <rect x="2" y="23.5" width="22" height="9" rx="2.2" fill="#EA580C"/>
        <text x="13" y="30" text-anchor="middle" fill="#FFFFFF" font-family="DM Sans, Arial, sans-serif" font-size="6.5" font-weight="800" letter-spacing="0.3">PPT</text>
      </svg>`
    case 'archive':
      return `<svg viewBox="0 0 32 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 3.5A2.5 2.5 0 0 1 7.5 1H20l9 9v22.5A2.5 2.5 0 0 1 26.5 35h-19A2.5 2.5 0 0 1 5 32.5V3.5Z" fill="#FFFBEB" stroke="#D97706" stroke-width="1.5"/>
        <path d="M20 1v6.5A2.5 2.5 0 0 0 22.5 10H29" fill="#FDE68A" stroke="#D97706" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M16 4v14" stroke="#D97706" stroke-width="2" stroke-dasharray="2 2"/>
        <rect x="2" y="23.5" width="22" height="9" rx="2.2" fill="#D97706"/>
        <text x="13" y="30" text-anchor="middle" fill="#FFFFFF" font-family="DM Sans, Arial, sans-serif" font-size="6.8" font-weight="800" letter-spacing="0.4">ZIP</text>
      </svg>`
    case 'code':
      return `<svg viewBox="0 0 32 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 3.5A2.5 2.5 0 0 1 7.5 1H20l9 9v22.5A2.5 2.5 0 0 1 26.5 35h-19A2.5 2.5 0 0 1 5 32.5V3.5Z" fill="#EEF2FF" stroke="#4F46E5" stroke-width="1.5"/>
        <path d="M20 1v6.5A2.5 2.5 0 0 0 22.5 10H29" fill="#C7D2FE" stroke="#4F46E5" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="m12.5 15.5-3 3 3 3M20.5 15.5l3 3-3 3M17.5 14.5l-2 8" stroke="#4F46E5" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="2" y="24.5" width="22" height="8" rx="2" fill="#4F46E5"/>
        <text x="13" y="30.5" text-anchor="middle" fill="#FFFFFF" font-family="DM Sans, Arial, sans-serif" font-size="5.8" font-weight="800" letter-spacing="0.3">CODE</text>
      </svg>`
    case 'image':
      return `<svg viewBox="0 0 32 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 3.5A2.5 2.5 0 0 1 7.5 1H20l9 9v22.5A2.5 2.5 0 0 1 26.5 35h-19A2.5 2.5 0 0 1 5 32.5V3.5Z" fill="#ECFDF5" stroke="#059669" stroke-width="1.5"/>
        <path d="M20 1v6.5A2.5 2.5 0 0 0 22.5 10H29" fill="#A7F3D0" stroke="#059669" stroke-width="1.5" stroke-linejoin="round"/>
        <circle cx="12" cy="16" r="2.2" fill="#059669"/>
        <path d="m8.5 27 5.2-6 4 4.2 2.8-3 4.5 4.8" stroke="#059669" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`
    case 'audio':
      return `<svg viewBox="0 0 32 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 3.5A2.5 2.5 0 0 1 7.5 1H20l9 9v22.5A2.5 2.5 0 0 1 26.5 35h-19A2.5 2.5 0 0 1 5 32.5V3.5Z" fill="#F5F3FF" stroke="#7C3AED" stroke-width="1.5"/>
        <path d="M20 1v6.5A2.5 2.5 0 0 0 22.5 10H29" fill="#DDD6FE" stroke="#7C3AED" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M15.5 24.5V14.5l7-1.6v9.8" stroke="#7C3AED" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="13" cy="25" r="2.5" fill="#7C3AED"/>
        <circle cx="20" cy="23.2" r="2.5" fill="#7C3AED"/>
      </svg>`
    case 'video':
      return `<svg viewBox="0 0 32 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 3.5A2.5 2.5 0 0 1 7.5 1H20l9 9v22.5A2.5 2.5 0 0 1 26.5 35h-19A2.5 2.5 0 0 1 5 32.5V3.5Z" fill="#F3E8FF" stroke="#6D28D9" stroke-width="1.5"/>
        <path d="M20 1v6.5A2.5 2.5 0 0 0 22.5 10H29" fill="#DDD6FE" stroke="#6D28D9" stroke-width="1.5" stroke-linejoin="round"/>
        <polygon points="13,15 23,20.5 13,26" fill="#6D28D9"/>
      </svg>`
    case 'text':
      return `<svg viewBox="0 0 32 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 3.5A2.5 2.5 0 0 1 7.5 1H20l9 9v22.5A2.5 2.5 0 0 1 26.5 35h-19A2.5 2.5 0 0 1 5 32.5V3.5Z" fill="#F8FAFC" stroke="#475569" stroke-width="1.5"/>
        <path d="M20 1v6.5A2.5 2.5 0 0 0 22.5 10H29" fill="#CBD5E1" stroke="#475569" stroke-width="1.5" stroke-linejoin="round"/>
        <line x1="10" y1="15.5" x2="23" y2="15.5" stroke="#475569" stroke-width="1.6" stroke-linecap="round"/>
        <line x1="10" y1="20" x2="23" y2="20" stroke="#64748B" stroke-width="1.6" stroke-linecap="round"/>
        <line x1="10" y1="24.5" x2="18.5" y2="24.5" stroke="#94A3B8" stroke-width="1.6" stroke-linecap="round"/>
      </svg>`
    default:
      return `<svg viewBox="0 0 32 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 3.5A2.5 2.5 0 0 1 7.5 1H20l9 9v22.5A2.5 2.5 0 0 1 26.5 35h-19A2.5 2.5 0 0 1 5 32.5V3.5Z" fill="#F8FAFC" stroke="#64748B" stroke-width="1.5"/>
        <path d="M20 1v6.5A2.5 2.5 0 0 0 22.5 10H29" fill="#E2E8F0" stroke="#64748B" stroke-width="1.5" stroke-linejoin="round"/>
        <line x1="10" y1="17" x2="22" y2="17" stroke="#64748B" stroke-width="1.6" stroke-linecap="round"/>
        <line x1="10" y1="22" x2="19" y2="22" stroke="#94A3B8" stroke-width="1.6" stroke-linecap="round"/>
      </svg>`
  }
}

export function createFileTypeIcon(fileName = '', mediaType = '', extraClass = '') {
  const category = getFileCategory(fileName, mediaType)
  const wrapper = make('span', `collab-file-icon is-${category}${extraClass ? ` ${extraClass}` : ''}`)
  wrapper.setAttribute('aria-hidden', 'true')
  wrapper.innerHTML = getFileIconSvg(category)
  return wrapper
}

function setActionButtonContent(button, iconHtml, labelText) {
  button.replaceChildren()
  const iconWrap = make('span', 'task-media-action-icon')
  iconWrap.setAttribute('aria-hidden', 'true')
  iconWrap.innerHTML = iconHtml
  button.append(iconWrap, make('span', 'task-media-action-label', labelText))
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`
}

function fileToDataUrl(file, fallbackMediaType = 'application/octet-stream') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      let result = String(reader.result)
      if (result.startsWith('data:;base64,')) {
        result = `data:${fallbackMediaType};base64,${result.slice('data:;base64,'.length)}`
      } else if (fallbackMediaType !== 'application/octet-stream' && result.startsWith('data:application/octet-stream;base64,')) {
        result = `data:${fallbackMediaType};base64,${result.slice('data:application/octet-stream;base64,'.length)}`
      }
      resolve(result)
    })
    reader.addEventListener('error', () => {
      const error = reader.error || new Error(`Unable to read ${file.name}.`)
      console.error('[task-media] FileReader failed.', { fileName: file.name, error })
      reject(error)
    })
    reader.readAsDataURL(file)
  })
}

export function createTaskMediaEditor({
  initialAttachments = [],
  label = 'Media',
  allowScreenRecording = true,
  maxAttachments = Infinity,
  accept = ''
} = {}) {
  const root = make('section', 'task-media-editor')
  const heading = make('div', 'task-media-heading')
  heading.append(make('strong', '', label), make('small', '', 'Up to 100 MB total'))
  const actions = make('div', 'task-media-actions')
  const filePicker = createNativeFilePicker({
    label: 'Attach file',
    ariaLabel: `Attach files for ${label}`,
    accept,
    multiple: true,
    iconHtml: ACTION_ICONS.attach,
    onFiles: incoming => {
      try {
        if (items.length + incoming.length > maxAttachments) {
          setStatus(`You can attach up to ${maxAttachments} files.`, true)
        } else if (totalBytes() + incoming.reduce((sum, file) => sum + file.size, 0) > maxTaskMediaBytes) {
          setStatus('Task media must total 100 MB or less.', true)
        } else {
          items.push(...incoming)
          setStatus('')
          render()
        }
      } catch (error) {
        console.error('[task-media] Unable to add selected files.', {
          inputId: filePicker.id,
          error
        })
        setStatus('The selected file could not be added.', true)
      }
    },
    onError: error => {
      console.error('[task-media] File picker error.', {
        inputId: filePicker.id,
        error
      })
      setStatus('The selected file could not be added.', true)
    }
  })
  const fileInput = filePicker.input
  const attachButton = filePicker.trigger
  const audioButton = make('button', 'task-media-action')
  audioButton.type = 'button'
  setActionButtonContent(audioButton, ACTION_ICONS.mic, 'Record audio')
  const screenButton = make('button', 'task-media-action')
  screenButton.type = 'button'
  setActionButtonContent(screenButton, ACTION_ICONS.screen, 'Record screen')
  screenButton.hidden = !allowScreenRecording
  const status = make('p', 'task-media-status')
  status.setAttribute('role', 'status')
  status.hidden = true
  const attachmentList = make('div', 'task-media-attachment-list')
  const picker = make('div', 'task-media-picker')
  picker.append(attachButton, audioButton, screenButton)
  actions.append(fileInput, picker, status)
  root.append(heading, actions, attachmentList)

  let items = [...initialAttachments]
  let recorder = null
  let stream = null
  let chunks = []
  let mode = null
  let startedAt = 0
  let timer = null
  let cancelled = false
  let disposed = false
  let recordingFinalization = null

  const byteSize = item => item instanceof File ? item.size : Number(item?.size) || 0
  const totalBytes = () => items.reduce((total, item) => total + byteSize(item), 0)
  const setStatus = (text, isError = false) => {
    status.hidden = !text
    status.textContent = text
    status.classList.toggle('is-error', isError)
  }
  const stopTracks = () => {
    stream?.getTracks().forEach(track => track.stop())
    stream = null
  }
  const render = () => {
    attachmentList.replaceChildren()
    items.forEach((item, index) => {
      const fileName = item instanceof File ? item.name : item.fileName
      const mediaType = resolveAttachmentMediaType(
        fileName,
        item instanceof File ? item.type : item.mediaType
      )
      const tag = make('div', 'task-media-attachment')
      const icon = createFileTypeIcon(fileName, mediaType, 'task-media-attachment-icon')
      const name = make('span', 'task-media-attachment-name', `${fileName || 'File'} · ${Math.max(1, Math.round(byteSize(item) / 1024))} KB`)
      const remove = make('button', 'task-media-remove', 'Remove')
      remove.type = 'button'
      remove.setAttribute('aria-label', `Remove ${fileName || 'media attachment'}`)
      remove.addEventListener('click', () => {
        items.splice(index, 1)
        setStatus('')
        render()
      })
      tag.append(icon, name, remove)
      attachmentList.append(tag)
    })
  }

  const finalizeRecording = async () => {
    const capturedMode = mode
    const capturedChunks = chunks
    const elapsed = Math.max(1, Math.ceil((Date.now() - startedAt) / 1000))
    const capturedRecorder = recorder
    recorder = null
    mode = null
    chunks = []
    clearInterval(timer)
    timer = null
    stopTracks()
    audioButton.disabled = false
    screenButton.disabled = false
    setActionButtonContent(audioButton, ACTION_ICONS.mic, 'Record audio')
    setActionButtonContent(screenButton, ACTION_ICONS.screen, 'Record screen')
    if (cancelled || disposed || !capturedChunks.length) {
      cancelled = false
      return
    }
    if (items.length >= maxAttachments) {
      setStatus(`You can attach up to ${maxAttachments} files.`, true)
      return
    }
    const recorded = new Blob(capturedChunks, { type: capturedRecorder?.mimeType || capturedChunks[0].type })
    if (!recorded.size || totalBytes() + recorded.size > maxTaskMediaBytes) {
      setStatus('This recording exceeds the remaining 100 MB task media limit.', true)
      return
    }
    const mediaType = recorded.type.split(';')[0] || (capturedMode === 'audio' ? 'audio/webm' : 'video/webm')
    const blob = new Blob([recorded], { type: mediaType })
    const extension = mediaType === 'audio/mp4' ? 'm4a' :
      mediaType === 'audio/ogg' ? 'ogg' : mediaType.startsWith('audio/') ? 'webm' :
        mediaType === 'video/mp4' ? 'mp4' : 'webm'
    const fileName = `${capturedMode === 'audio' ? 'task-voice-note' : 'task-screen-clip'}-${Date.now()}.${extension}`
    items.push({
      fileName,
      mediaType,
      size: blob.size,
      data: await fileToDataUrl(blob, mediaType),
      is_voice_note: capturedMode === 'audio',
      duration_seconds: elapsed
    })
    setStatus(capturedMode === 'audio' ? 'Voice note attached.' : 'Screen clip attached.')
    render()
  }

  const startRecording = async captureMode => {
    if (recorder || disposed) return
    const available = maxTaskMediaBytes - totalBytes()
    if (available < 1024) {
      setStatus('Remove an attachment to make room for a recording.', true)
      return
    }
    try {
      if (captureMode === 'audio') {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone recording is unavailable in this browser.')
        stream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        })
      } else {
        if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen recording is unavailable in this browser.')
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 12, max: 15 }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true
        })
      }
      if (disposed) {
        stopTracks()
        return
      }
      const candidates = captureMode === 'audio'
        ? ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
        : ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'video/webm']
      const mimeType = candidates.find(type => MediaRecorder.isTypeSupported?.(type))
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 48_000,
        videoBitsPerSecond: captureMode === 'screen' ? 260_000 : undefined
      })
      mode = captureMode
      chunks = []
      cancelled = false
      startedAt = Date.now()
      const activeRecorder = recorder
      let resolveFinalization
      recordingFinalization = new Promise(resolve => { resolveFinalization = resolve })
      audioButton.disabled = true
      screenButton.disabled = true
      const stopButton = captureMode === 'audio' ? audioButton : screenButton
      stopButton.disabled = false
      setActionButtonContent(
        stopButton,
        captureMode === 'audio' ? ACTION_ICONS.mic : ACTION_ICONS.screen,
        'Stop recording'
      )
      setStatus(`${captureMode === 'audio' ? 'Recording voice note' : 'Recording screen'} · 00:00`)
      activeRecorder.addEventListener('dataavailable', event => {
        if (event.data.size) chunks.push(event.data)
        const totalChunkBytes = chunks.reduce((sum, chunk) => sum + chunk.size, 0)
        if (totalChunkBytes >= available ||
            (captureMode === 'screen' && Date.now() - startedAt >= maxScreenClipMs)) {
          activeRecorder.stop()
        }
      })
      activeRecorder.addEventListener('stop', () => {
        void finalizeRecording().catch(error => {
          setStatus(error.message || 'The recording could not be attached.', true)
        }).finally(() => {
          resolveFinalization()
          recordingFinalization = null
        })
      }, { once: true })
      activeRecorder.addEventListener('error', () => {
        cancelled = true
        stopTracks()
        recorder = null
        setStatus('Recording failed. Check browser permissions and try again.', true)
        audioButton.disabled = false
        screenButton.disabled = false
        setActionButtonContent(audioButton, ACTION_ICONS.mic, 'Record audio')
        setActionButtonContent(screenButton, ACTION_ICONS.screen, 'Record screen')
        resolveFinalization()
        recordingFinalization = null
      }, { once: true })
      stream.getVideoTracks().forEach(track => {
        track.addEventListener('ended', () => {
          if (activeRecorder.state === 'recording') activeRecorder.stop()
        }, { once: true })
      })
      activeRecorder.start(500)
      timer = window.setInterval(() => {
        const seconds = Math.floor((Date.now() - startedAt) / 1000)
        setStatus(`${captureMode === 'audio' ? 'Recording voice note' : 'Recording screen'} · ${formatTime(seconds)}`)
        if (captureMode === 'screen' && seconds >= 90 && activeRecorder.state === 'recording') activeRecorder.stop()
      }, 500)
    } catch (error) {
      stopTracks()
      recorder = null
      audioButton.disabled = false
      screenButton.disabled = false
      setActionButtonContent(audioButton, ACTION_ICONS.mic, 'Record audio')
      setActionButtonContent(screenButton, ACTION_ICONS.screen, 'Record screen')
      recordingFinalization = null
      setStatus(error.message || 'Recording could not start.', true)
    }
  }

  audioButton.addEventListener('click', () => {
    if (recorder?.state === 'recording' && mode === 'audio') recorder.stop()
    else void startRecording('audio')
  })
  screenButton.addEventListener('click', () => {
    if (recorder?.state === 'recording' && mode === 'screen') recorder.stop()
    else void startRecording('screen')
  })

  render()
  return {
    element: root,
    hasAttachments: () => items.length > 0,
    getAttachments: async () => {
      if (recorder?.state === 'recording') recorder.stop()
      if (recordingFinalization) await recordingFinalization
      return Promise.all(items.map(async item => {
        if (!(item instanceof File)) return item
        const mediaType = resolveAttachmentMediaType(item.name, item.type)
        return {
          fileName: item.name,
          mediaType,
          size: item.size,
          data: await fileToDataUrl(item, mediaType)
        }
      }))
    },
    clear: () => {
      items = []
      setStatus('')
      render()
    },
    dispose: () => {
      disposed = true
      cancelled = true
      clearInterval(timer)
      if (recorder?.state === 'recording') recorder.stop()
      stopTracks()
    }
  }
}

export function renderTaskMediaAttachments(attachments = []) {
  const container = make('div', 'task-media-player-list')
  attachments.forEach(attachment => {
    if (!attachment?.data || typeof attachment.mediaType !== 'string') return
    const media = attachment.mediaType.startsWith('video/')
      ? document.createElement('video')
      : attachment.mediaType.startsWith('audio/')
        ? document.createElement('audio')
        : null
    if (media) {
      media.className = 'task-media-player'
      media.controls = true
      media.preload = 'metadata'
      media.src = attachment.data
      media.setAttribute('aria-label', attachment.fileName || 'Task media')
      container.append(media)
      return
    }
    if (attachment.mediaType.startsWith('image/') && attachment.mediaType !== 'image/svg+xml') {
      const image = document.createElement('img')
      image.className = 'task-media-image'
      image.src = attachment.data
      image.alt = attachment.fileName || 'Task attachment'
      image.loading = 'lazy'
      container.append(image)
    }
  })
  return container
}