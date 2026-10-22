import { showDashboardToast } from './modalChrome.js'

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

  const header = document.createElement('header')
  header.className = 'metered-meeting-header'
  const brand = document.createElement('div')
  brand.className = 'metered-meeting-brand'
  const mark = document.createElement('span')
  mark.className = 'metered-meeting-mark'
  mark.textContent = 'M'
  const brandName = document.createElement('span')
  brandName.textContent = 'Collab'
  const brandContext = document.createElement('span')
  brandContext.className = 'metered-meeting-context'
  brandContext.textContent = 'MEETING ROOM'
  brand.append(mark, brandName, brandContext)

  const headerActions = document.createElement('div')
  headerActions.className = 'metered-meeting-header-actions'
  const roomStatus = document.createElement('span')
  roomStatus.className = 'metered-meeting-status'
  roomStatus.textContent = 'Connecting to Metered'
  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'metered-meeting-close'
  closeButton.setAttribute('aria-label', 'Close meeting')
  closeButton.textContent = '×'
  headerActions.append(roomStatus, closeButton)
  header.append(brand, headerActions)

  const content = document.createElement('div')
  content.className = 'metered-meeting-content'
  const roomHeading = document.createElement('div')
  roomHeading.className = 'metered-meeting-room-heading'
  const roomTitle = document.createElement('h2')
  roomTitle.textContent = meetingTitle
  const roomSubtitle = document.createElement('p')
  roomSubtitle.textContent = 'Join the room, then share its link with your team.'
  roomHeading.append(roomTitle, roomSubtitle)

  const frameHost = document.createElement('div')
  frameHost.className = 'metered-meeting-frame'
  const loading = document.createElement('div')
  loading.className = 'metered-meeting-loading'
  loading.textContent = 'Loading the meeting room…'
  frameHost.append(loading)

  const invite = document.createElement('div')
  invite.className = 'metered-meeting-invite'
  const inviteText = document.createElement('div')
  inviteText.className = 'metered-meeting-invite-text'
  const inviteHeading = document.createElement('strong')
  inviteHeading.textContent = 'Invite Instructions'
  const inviteDescription = document.createElement('span')
  inviteDescription.textContent = 'Share the Meeting URL with others'
  inviteText.append(inviteHeading, inviteDescription)
  const shareField = document.createElement('input')
  shareField.className = 'metered-meeting-share-url'
  shareField.type = 'text'
  shareField.readOnly = true
  shareField.value = url.href
  shareField.setAttribute('aria-label', 'Meeting URL')
  const copyButton = document.createElement('button')
  copyButton.type = 'button'
  copyButton.className = 'metered-meeting-copy'
  copyButton.textContent = 'Copy link'
  invite.append(inviteText, shareField, copyButton)

  content.append(roomHeading, frameHost, invite)
  card.append(header, content)
  overlay.append(card)
  document.body.append(overlay)

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
  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url.href)
      showDashboardToast('Meeting link copied.')
    } catch (error) {
      console.error('Unable to copy Metered meeting link:', error)
      showDashboardToast('Meeting link could not be copied.', 'error')
    }
  })

  loadMeteredSdk().then(() => {
    if (session.closing || !overlay.isConnected) return
    const frame = new window.MeteredFrame()
    session.frame = frame
    frame.on('ready', () => {
      roomStatus.textContent = 'Metered video ready'
      loading.remove()
    })
    frame.on('meetingJoined', () => {
      session.joined = true
      roomStatus.textContent = 'Connected'
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
    roomStatus.textContent = 'Connection failed'
    showDashboardToast(error.message || 'Unable to load the meeting room.', 'error')
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
  if (activeSession === session) activeSession = undefined
}
