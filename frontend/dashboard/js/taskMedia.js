import { createNativeFilePicker } from './filePicker.js?v=20261028-dedicated-file-picker'

const maxTaskMediaBytes = 100 * 1024 * 1024
const maxScreenClipMs = 90_000

function make(tagName, className = '', text = '') {
  const element = document.createElement(tagName)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
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
  maxAttachments = Infinity
} = {}) {
  const root = make('section', 'task-media-editor')
  const heading = make('div', 'task-media-heading')
  heading.append(make('strong', '', label), make('small', '', 'Up to 100 MB total'))
  const actions = make('div', 'task-media-actions')
  const filePicker = createNativeFilePicker({
    label: 'Attach file',
    ariaLabel: `Attach files for ${label}`,
    accept: 'image/*,audio/*,video/*,application/pdf',
    multiple: true,
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
  const audioButton = make('button', 'task-media-action', 'Record audio')
  audioButton.type = 'button'
  const screenButton = make('button', 'task-media-action', 'Record screen')
  screenButton.type = 'button'
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
      const tag = make('div', 'task-media-attachment')
      const name = make('span', '', `${fileName || 'Media'} · ${Math.max(1, Math.round(byteSize(item) / 1024))} KB`)
      const remove = make('button', 'task-media-remove', 'Remove')
      remove.type = 'button'
      remove.setAttribute('aria-label', `Remove ${fileName || 'media attachment'}`)
      remove.addEventListener('click', () => {
        items.splice(index, 1)
        setStatus('')
        render()
      })
      tag.append(name, remove)
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
    audioButton.textContent = 'Record audio'
    screenButton.textContent = 'Record screen'
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
      data: await fileToDataUrl(blob),
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
      stopButton.textContent = 'Stop recording'
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
        audioButton.textContent = 'Record audio'
        screenButton.textContent = 'Record screen'
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
      audioButton.textContent = 'Record audio'
      screenButton.textContent = 'Record screen'
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
        return {
          fileName: item.name,
          mediaType: item.type || 'application/octet-stream',
          size: item.size,
          data: await fileToDataUrl(item)
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
    if (attachment.mediaType.startsWith('image/')) {
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