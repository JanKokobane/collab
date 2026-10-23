const JITSI_API_URL = 'https://meet.jit.si/external_api.js'

let apiLoadPromise
let activeSession

function loadJitsiApi() {
  if (window.JitsiMeetExternalAPI) return Promise.resolve()
  if (apiLoadPromise) return apiLoadPromise

  apiLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = JITSI_API_URL
    script.async = true
    script.onload = () => {
      if (window.JitsiMeetExternalAPI) resolve()
      else reject(new Error('The Jitsi meeting API did not initialize.'))
    }
    script.onerror = () => reject(new Error('The Jitsi meeting API could not be loaded.'))
    document.head.append(script)
  }).catch(error => {
    apiLoadPromise = undefined
    throw error
  })

  return apiLoadPromise
}

export function getJitsiRoomName(projectId, meetingId) {
  if (!projectId || !meetingId) {
    throw new Error('This meeting is missing its project or meeting ID.')
  }
  const roomName = `collab_${projectId}_${meetingId}`
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (roomName.length < 3) throw new Error('This meeting does not have a valid Jitsi room name.')
  return roomName
}

export function getJitsiMeetingUrl(projectId, meetingId) {
  return `https://meet.jit.si/${encodeURIComponent(getJitsiRoomName(projectId, meetingId))}`
}

export function openJitsiMeetingModal(projectId, meetingId, meetingTitle, displayName) {
  if (activeSession) closeJitsiMeetingModal(activeSession)

  const roomName = getJitsiRoomName(projectId, meetingId)
  const overlay = document.createElement('div')
  overlay.className = 'jitsi-meeting-overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', meetingTitle)

  const frameHost = document.createElement('div')
  frameHost.className = 'jitsi-meeting-frame'
  const loading = document.createElement('div')
  loading.className = 'jitsi-meeting-loading'
  loading.textContent = 'Loading the Jitsi meeting…'
  frameHost.append(loading)

  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'jitsi-meeting-dismiss'
  closeButton.textContent = 'Close meeting'
  closeButton.setAttribute('aria-label', 'Close meeting')
  overlay.append(frameHost, closeButton)
  document.body.append(overlay)
  document.body.classList.add('jitsi-meeting-open')

  const session = { api: null, overlay, closing: false, disposed: false }
  activeSession = session

  const close = () => closeJitsiMeetingModal(session)
  closeButton.addEventListener('click', close)
  const onEscape = event => {
    if (event.key === 'Escape') close()
  }
  document.addEventListener('keydown', onEscape)

  session.cleanup = () => {
    document.removeEventListener('keydown', onEscape)
  }

  loadJitsiApi().then(() => {
    if (session.closing || !overlay.isConnected) return

    const api = new window.JitsiMeetExternalAPI('meet.jit.si', {
      roomName,
      width: '100%',
      height: '100%',
      parentNode: frameHost,
      userInfo: { displayName: displayName || 'Guest User' },
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        prejoinPageEnabled: true,
        disableDeepLinking: true
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        TOOLBAR_BUTTONS: [
          'microphone',
          'camera',
          'desktop',
          'chat',
          'raisehand',
          'participants-pane',
          'tileview',
          'hangup'
        ]
      }
    })
    session.api = api
    loading.remove()
    api.addEventListener('videoConferenceLeft', () => finishJitsiMeetingModal(session))
    api.addEventListener('readyToClose', () => finishJitsiMeetingModal(session))
  }).catch(error => {
    if (session.closing) return
    console.error('Unable to initialize Jitsi meeting:', error)
    loading.textContent = error.message || 'The Jitsi meeting could not be loaded.'
  })
}

function closeJitsiMeetingModal(session) {
  if (!session || session.closing || session.disposed) return
  session.closing = true
  if (session.api) {
    try {
      session.api.executeCommand('hangup')
    } catch (error) {
      console.error('Unable to leave Jitsi meeting cleanly:', error)
      finishJitsiMeetingModal(session)
      return
    }
    window.setTimeout(() => finishJitsiMeetingModal(session), 1500)
    return
  }
  finishJitsiMeetingModal(session)
}

function finishJitsiMeetingModal(session) {
  if (session.disposed) return
  session.disposed = true
  session.cleanup?.()
  try {
    session.api?.dispose()
  } catch (error) {
    console.error('Unable to dispose Jitsi meeting:', error)
  }
  session.overlay.remove()
  if (activeSession === session) {
    document.body.classList.remove('jitsi-meeting-open')
    activeSession = undefined
  }
}
