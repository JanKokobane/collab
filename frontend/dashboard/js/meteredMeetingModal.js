const SDK_URL = 'https://cdn.metered.ca/sdk/frame/1.4.3/sdk-frame.min.js'

let sdkLoadPromise
let activeSession

function loadMeteredSdk() {
  if (window.MeteredFrame) return Promise.resolve()
  if (sdkLoadPromise) return sdkLoadPromise

  sdkLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SDK_URL
    script.async = true
    script.onload = () => {
      if (window.MeteredFrame) resolve()
      else reject(new Error('The Metered meeting SDK did not initialize.'))
    }
    script.onerror = () => reject(new Error('The Metered meeting SDK could not be loaded.'))
    document.head.append(script)
  }).catch(error => {
    sdkLoadPromise = undefined
    throw error
  })

  return sdkLoadPromise
}

export function isMeteredRoomUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      url.hostname.toLowerCase().endsWith('.metered.live') &&
      url.pathname.length > 1
  } catch {
    return false
  }
}

export function openMeteredMeetingModal(roomUrl, meetingTitle = 'Meeting') {
  if (!isMeteredRoomUrl(roomUrl)) {
    throw new Error('This is not a valid Metered meeting room URL.')
  }
  if (activeSession) closeMeteredMeetingModal()

  const url = new URL(roomUrl)
  const overlay = document.createElement('div')
  overlay.className = 'metered-meeting-overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', meetingTitle)

  const card = document.createElement('section')
  card.className = 'metered-meeting-card'

  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'metered-meeting-dismiss'
  closeButton.textContent = 'Close meeting'
  closeButton.setAttribute('aria-label', 'Close meeting')

  const frameHost = document.createElement('div')
  frameHost.className = 'metered-meeting-frame'
  const loading = document.createElement('div')
  loading.className = 'metered-meeting-loading'
  loading.textContent = 'Loading the meeting room…'
  frameHost.append(loading)

  card.append(frameHost, closeButton)
  overlay.append(card)
  document.body.append(overlay)
  document.body.classList.add('metered-meeting-open')

  const session = { frame: null, joined: false, overlay, closing: false }
  activeSession = session

  const close = () => closeMeteredMeetingModal(session)
  closeButton.addEventListener('click', close)
  overlay.addEventListener('click', event => {
    if (event.target === overlay) close()
  })
  const onEscape = event => {
    if (event.key === 'Escape') close()
  }
  document.addEventListener('keydown', onEscape)
  loadMeteredSdk().then(() => {
    if (session.closing || !overlay.isConnected) return
    const frame = new window.MeteredFrame()
    session.frame = frame
    frame.on('ready', () => {
      loading.remove()
    })
    frame.on('meetingJoined', () => {
      session.joined = true
    })
    frame.on('meetingLeft', () => {
      session.joined = false
      finishMeteredMeetingModal(session)
    })
    frame.init({
      roomURL: `${url.host}${url.pathname}`,
      width: '100%',
      height: '100%',
      autoJoin: false,
      joinVideoOn: true,
      joinAudioOn: true,
      disableChat: false,
      disableScreenSharing: false,
      showInviteBox: false
    }, frameHost)
  }).catch(error => {
    if (session.closing) return
    console.error('Unable to initialize Metered meeting:', error)
    loading.textContent = error.message || 'The Metered meeting could not be loaded.'
  })

  session.cleanup = () => {
    document.removeEventListener('keydown', onEscape)
  }
}

function closeMeteredMeetingModal(session = activeSession) {
  if (!session || session.closing) return
  session.closing = true
  if (session.joined) {
    try {
      session.frame?.leave()
    } catch (error) {
      console.error('Unable to leave Metered meeting cleanly:', error)
      finishMeteredMeetingModal(session)
      return
    }
    window.setTimeout(() => finishMeteredMeetingModal(session), 1500)
    return
  }
  finishMeteredMeetingModal(session)
}

function finishMeteredMeetingModal(session) {
  if (session.disposed) return
  session.disposed = true
  session.cleanup?.()
  session.overlay.remove()
  document.body.classList.remove('metered-meeting-open')
  if (activeSession === session) activeSession = undefined
}
