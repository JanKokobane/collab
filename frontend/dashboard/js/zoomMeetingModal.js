import { api } from './api.js'
import { firebaseAuth } from '../../firebase.js'

const SDK_URL = 'https://source.zoom.us/videosdk/zoom-video-2.3.0.min.js'
const iconPaths = {
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
  camera: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/>',
  share: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 22h8m-4-4v4m0-9V7m-3 3 3-3 3 3"/>',
  people: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  chat: '<path d="M14.5 4.5h.7a6.3 6.3 0 0 1 0 12.6h-1.5l-3.2 2.2v-3.1a6.3 6.3 0 0 1 4-11.7z" fill="currentColor" opacity=".22" stroke="none"/><path d="M10.6 7.2h-.8a6.3 6.3 0 0 0 0 12.6h1.5l3.2 2.2v-3.2a6.3 6.3 0 0 0-3.9-11.6z"/><path d="M8.2 12h5m-5 3h3"/>',
  leave: '<path d="M10 17l5-5-5-5m5 5H3m9-9h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6"/>'
}

let sdkLoadPromise
let activeSession

function loadZoomSdk() {
  if (window.WebVideoSDK) return Promise.resolve()
  if (sdkLoadPromise) return sdkLoadPromise

  sdkLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SDK_URL
    script.async = true
    script.onload = () => {
      if (window.WebVideoSDK) resolve()
      else reject(new Error('The Zoom Video SDK did not initialize.'))
    }
    script.onerror = () => reject(new Error('The Zoom Video SDK could not be loaded.'))
    document.head.append(script)
  }).catch(error => {
    sdkLoadPromise = undefined
    throw error
  })

  return sdkLoadPromise
}

function makeIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.8')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.innerHTML = iconPaths[name]
  return svg
}

function createControl(name, label, onClick, danger = false) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `zoom-meeting-control${danger ? ' is-danger' : ''}`
  button.setAttribute('aria-label', label)
  button.title = label
  button.append(makeIcon(name))
  const text = document.createElement('span')
  text.textContent = label
  button.append(text)
  button.addEventListener('click', onClick)
  return button
}

function finishSession(session) {
  if (session.disposed) return
  session.disposed = true
  if (session.timer) window.clearInterval(session.timer)
  for (const [eventName, handler] of session.listeners) {
    session.client?.off?.(eventName, handler)
  }
  session.cleanup?.()
  session.overlay.remove()
  if (activeSession === session) {
    document.body.classList.remove('zoom-meeting-open')
    activeSession = undefined
  }
}

async function closeSession(session = activeSession) {
  if (!session || session.closing) return
  session.closing = true
  if (session.client && session.joined) {
    if (session.sharing) {
      try {
        await session.stream.stopShareScreen()
      } catch (error) {
        console.error('Unable to stop Zoom screen sharing:', error)
      }
    }
    try {
      await session.client.leave()
    } catch (error) {
      console.error('Unable to leave Zoom meeting cleanly:', error)
    }
  }
  finishSession(session)
}

function createVideoTile(session, userId, userName, isLocal = false) {
  const key = String(userId)
  if (session.tiles.has(key)) return session.tiles.get(key)
  const tile = document.createElement('article')
  tile.className = `zoom-meeting-tile${isLocal ? ' is-local' : ''}`
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 360
  canvas.setAttribute('aria-label', `${userName || 'Participant'} video`)
  const avatar = document.createElement('div')
  avatar.className = 'zoom-meeting-avatar'
  avatar.textContent = (userName || 'P').trim().slice(0, 1).toUpperCase()
  const label = document.createElement('span')
  label.className = 'zoom-meeting-participant-name'
  label.textContent = userName || (isLocal ? 'You' : 'Project member')
  tile.append(canvas, avatar, label)
  session.videoGrid.append(tile)
  const videoTile = { canvas, avatar, tile, userId }
  session.tiles.set(key, videoTile)
  return videoTile
}

async function renderParticipant(session, participant) {
  const stream = session.stream
  if (!stream || !participant ||
      String(participant.userId) === String(session.localUserId)) return
  const key = String(participant.userId)
  const tile = createVideoTile(session, participant.userId, participant.displayName)
  if (session.renderedUsers.has(key)) return
  session.renderedUsers.add(key)
  try {
    await stream.renderVideo(tile.canvas, participant.userId, 640, 360, 0, 0, 3)
    tile.canvas.hidden = false
    tile.avatar.hidden = true
  } catch (error) {
    session.renderedUsers.delete(key)
    console.error('Unable to render Zoom participant video:', error)
  }
}

function stopRenderingParticipant(session, userId) {
  const key = String(userId)
  const tile = session.tiles.get(key)
  if (!tile || !session.renderedUsers.has(key)) return
  session.stream?.stopRenderVideo(tile.canvas, userId)
  session.renderedUsers.delete(key)
  tile.canvas.hidden = true
  tile.avatar.hidden = false
}

function removeParticipant(session, userId) {
  const key = String(userId)
  const tile = session.tiles.get(key)
  if (!tile) return
  stopRenderingParticipant(session, userId)
  tile.tile.remove()
  session.tiles.delete(key)
}

function renderParticipants(session) {
  const participants = session.client?.getAllUser?.() || []
  const heading = session.participantHeading
  heading.textContent = `People (${participants.length})`
  session.participantList.replaceChildren()
  participants.forEach(person => {
    const row = document.createElement('div')
    row.className = 'zoom-meeting-person'
    const avatar = document.createElement('span')
    avatar.className = 'zoom-meeting-person-avatar'
    avatar.textContent = (person.displayName || 'P').trim().slice(0, 1).toUpperCase()
    const name = document.createElement('span')
    name.className = 'zoom-meeting-person-name'
    name.textContent = person.displayName || 'Project member'
    const state = document.createElement('small')
    state.textContent = person.muted ? 'Muted' : person.audio ? 'Audio on' : 'In meeting'
    row.append(avatar, name, state)
    session.participantList.append(row)
  })
}

function renderChatMessage(session, message) {
  if (!message || !session.chatMessages) return
  const id = message.id || `${message.sender?.userId || ''}:${message.timestamp || ''}:${message.message}`
  if (session.chatIds.has(id)) return
  session.chatIds.add(id)
  session.chatMessages.querySelector('.zoom-meeting-chat-empty')?.remove()
  const item = document.createElement('article')
  item.className = 'zoom-meeting-chat-message'
  const author = document.createElement('strong')
  author.textContent = message.sender?.name ||
    (message.sender?.userId === session.localUserId ? 'You' : 'Participant')
  const body = document.createElement('p')
  body.textContent = message.message || ''
  item.append(author, body)
  session.chatMessages.append(item)
  session.chatMessages.scrollTop = session.chatMessages.scrollHeight
}

function showSessionError(session, error) {
  console.error('Zoom meeting action failed:', error)
  session.status.textContent = error.message || 'That meeting action could not be completed.'
  session.status.classList.add('is-error')
  window.setTimeout(() => {
    if (!session.closing && session.status.classList.contains('is-error')) {
      session.status.textContent = 'You’re in the meeting'
      session.status.classList.remove('is-error')
    }
  }, 5000)
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':')
}

function appendChatHistory(session, messages) {
  if (!Array.isArray(messages)) return
  messages.forEach(message => renderChatMessage(session, message))
}

function createMeetingPanel() {
  const panel = document.createElement('aside')
  panel.className = 'zoom-meeting-side-panel'
  panel.hidden = true
  const tabs = document.createElement('div')
  tabs.className = 'zoom-meeting-panel-tabs'
  const peopleTab = document.createElement('button')
  peopleTab.type = 'button'
  peopleTab.textContent = 'People'
  peopleTab.className = 'is-active'
  const chatTab = document.createElement('button')
  chatTab.type = 'button'
  chatTab.textContent = 'Chat'
  tabs.append(peopleTab, chatTab)

  const peoplePane = document.createElement('section')
  peoplePane.className = 'zoom-meeting-panel-pane'
  const participantHeading = document.createElement('h3')
  participantHeading.textContent = 'People'
  const participantList = document.createElement('div')
  participantList.className = 'zoom-meeting-participant-list'
  peoplePane.append(participantHeading, participantList)

  const chatPane = document.createElement('section')
  chatPane.className = 'zoom-meeting-panel-pane zoom-meeting-chat-pane'
  chatPane.hidden = true
  const chatHeading = document.createElement('h3')
  chatHeading.textContent = 'In-meeting chat'
  const chatMessages = document.createElement('div')
  chatMessages.className = 'zoom-meeting-chat-messages'
  const chatEmpty = document.createElement('p')
  chatEmpty.className = 'zoom-meeting-chat-empty'
  chatEmpty.textContent = 'Messages sent here are visible to everyone in the meeting.'
  chatMessages.append(chatEmpty)
  const chatForm = document.createElement('form')
  chatForm.className = 'zoom-meeting-chat-form'
  const chatInput = document.createElement('input')
  chatInput.type = 'text'
  chatInput.maxLength = 1000
  chatInput.placeholder = 'Message everyone…'
  chatInput.setAttribute('aria-label', 'Meeting chat message')
  const sendButton = document.createElement('button')
  sendButton.type = 'submit'
  sendButton.textContent = 'Send'
  chatForm.append(chatInput, sendButton)
  chatPane.append(chatHeading, chatMessages, chatForm)
  panel.append(tabs, peoplePane, chatPane)

  return {
    panel,
    peopleTab,
    chatTab,
    participantHeading,
    participantList,
    chatPane,
    chatMessages,
    chatForm,
    chatInput,
    sendButton
  }
}

export function openZoomMeetingModal(meeting) {
  if (!meeting?.projectId || !meeting?.id) {
    throw new Error('This meeting is missing its project or meeting ID.')
  }
  if (activeSession) void closeSession(activeSession)

  const overlay = document.createElement('div')
  overlay.className = 'zoom-meeting-overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', meeting.title || 'Zoom meeting')

  const card = document.createElement('section')
  card.className = 'zoom-meeting-card'
  const header = document.createElement('header')
  header.className = 'zoom-meeting-header'
  const brand = document.createElement('div')
  brand.className = 'zoom-meeting-brand'
  const brandLogo = document.createElement('img')
  brandLogo.className = 'zoom-meeting-brand-logo'
  brandLogo.src = '../images/logo.png'
  brandLogo.alt = 'Collab'
  brand.append(brandLogo)
  const meetingInfo = document.createElement('div')
  meetingInfo.className = 'zoom-meeting-info'
  const title = document.createElement('h2')
  title.textContent = meeting.title || 'Project meeting'
  const status = document.createElement('p')
  status.className = 'zoom-meeting-status'
  status.textContent = 'Connecting to Zoom…'
  meetingInfo.append(title, status)
  const info = document.createElement('button')
  info.type = 'button'
  info.className = 'zoom-meeting-id'
  info.title = 'Copy meeting ID'
  info.textContent = `ID ${meeting.id}`
  info.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(meeting.id)
      info.textContent = 'Meeting ID copied'
      window.setTimeout(() => { info.textContent = `ID ${meeting.id}` }, 1800)
    } catch (error) {
      console.error('Unable to copy meeting ID:', error)
    }
  })
  header.append(brand, meetingInfo, info)

  const content = document.createElement('div')
  content.className = 'zoom-meeting-content'
  const stage = document.createElement('main')
  stage.className = 'zoom-meeting-stage'
  const shareStage = document.createElement('div')
  shareStage.className = 'zoom-meeting-share-stage'
  shareStage.hidden = true
  const shareLabel = document.createElement('span')
  shareLabel.className = 'zoom-meeting-share-label'
  shareLabel.textContent = 'Screen sharing'
  const shareCanvas = document.createElement('canvas')
  shareCanvas.width = 1280
  shareCanvas.height = 720
  shareCanvas.className = 'zoom-meeting-share-canvas'
  shareStage.append(shareLabel, shareCanvas)
  const videoGrid = document.createElement('div')
  videoGrid.className = 'zoom-meeting-video-grid'
  stage.append(shareStage, videoGrid)

  const panelParts = createMeetingPanel()
  content.append(stage, panelParts.panel)

  const footer = document.createElement('footer')
  footer.className = 'zoom-meeting-footer'
  const meetingMeta = document.createElement('div')
  meetingMeta.className = 'zoom-meeting-footer-meta'
  const duration = document.createElement('time')
  duration.textContent = '00:00:00'
  const footerDivider = document.createElement('span')
  footerDivider.textContent = '·'
  const footerTitle = document.createElement('span')
  footerTitle.textContent = meeting.projectName || 'Project meeting'
  meetingMeta.append(duration, footerDivider, footerTitle)
  const controls = document.createElement('div')
  controls.className = 'zoom-meeting-controls'
  footer.append(meetingMeta, controls)
  card.append(header, content, footer)
  overlay.append(card)
  document.body.append(overlay)
  document.body.classList.add('zoom-meeting-open')

  const session = {
    overlay,
    status,
    videoGrid,
    shareStage,
    shareLabel,
    shareCanvas,
    tiles: new Map(),
    renderedUsers: new Set(),
    chatIds: new Set(),
    listeners: [],
    participantHeading: panelParts.participantHeading,
    participantList: panelParts.participantList,
    panel: panelParts.panel,
    peopleTab: panelParts.peopleTab,
    chatTab: panelParts.chatTab,
    chatPane: panelParts.chatPane,
    chatMessages: panelParts.chatMessages,
    joined: false,
    closing: false,
    disposed: false,
    audioJoined: false,
    muted: false,
    cameraOn: false,
    sharing: false,
    startedAt: 0
  }
  activeSession = session
  panelParts.chatForm.addEventListener('submit', async event => {
    event.preventDefault()
    const text = panelParts.chatInput.value.trim()
    if (!text || !session.chatClient || session.chatSending) return
    session.chatSending = true
    panelParts.sendButton.disabled = true
    try {
      const sent = await session.chatClient.sendToAll(text)
      renderChatMessage(session, sent)
      panelParts.chatInput.value = ''
    } catch (error) {
      showSessionError(session, error)
    } finally {
      session.chatSending = false
      panelParts.sendButton.disabled = false
    }
  })

  const addListener = (eventName, handler) => {
    session.listeners.push([eventName, handler])
  }
  const setControlState = (button, active, text, label) => {
    button.classList.toggle('is-active', active)
    button.setAttribute('aria-pressed', String(active))
    button.setAttribute('aria-label', label)
    button.title = label
    button.querySelector('span').textContent = text
  }
  const togglePanel = tab => {
    const isOpen = !panelParts.panel.hidden && tab.classList.contains('is-active')
    panelParts.panel.hidden = isOpen
    if (isOpen) {
      panelParts.peopleTab.classList.remove('is-active')
      panelParts.chatTab.classList.remove('is-active')
    } else {
      panelParts.peopleTab.classList.toggle('is-active', tab === panelParts.peopleTab)
      panelParts.chatTab.classList.toggle('is-active', tab === panelParts.chatTab)
      panelParts.participantList.parentElement.hidden = tab !== panelParts.peopleTab
      panelParts.chatPane.hidden = tab !== panelParts.chatTab
    }
  }

  const micButton = createControl('mic', 'Mute', async () => {
    try {
      if (!session.audioJoined) {
        await session.stream.startAudio()
        session.audioJoined = true
        session.muted = false
      } else if (session.muted) {
        await session.stream.unmuteAudio()
        session.muted = false
      } else {
        await session.stream.muteAudio()
        session.muted = true
      }
      setControlState(micButton, session.muted, session.muted ? 'Unmute' : 'Mute',
        session.muted ? 'Unmute microphone' : 'Mute microphone')
    } catch (error) {
      showSessionError(session, error)
    }
  })
  const cameraButton = createControl('camera', 'Turn off camera', async () => {
    try {
      if (session.cameraOn) {
        await session.stream.stopVideo()
        session.cameraOn = false
        const localTile = session.tiles.get(String(session.localUserId))
        if (localTile) {
          if (session.renderedUsers.has(String(session.localUserId))) {
            session.stream.stopRenderVideo(localTile.canvas, session.localUserId)
            session.renderedUsers.delete(String(session.localUserId))
          }
          localTile.canvas.hidden = true
          localTile.avatar.hidden = false
        }
      } else {
        await session.stream.startVideo()
        session.cameraOn = true
        const localUser = session.client.getCurrentUserInfo()
        const localTile = createVideoTile(session, session.localUserId, `${localUser.displayName || 'You'} (You)`, true)
        await session.stream.renderVideo(localTile.canvas, session.localUserId, 640, 360, 0, 0, 3)
        session.renderedUsers.add(String(session.localUserId))
        localTile.canvas.hidden = false
        localTile.avatar.hidden = true
      }
      setControlState(cameraButton, !session.cameraOn,
        session.cameraOn ? 'Camera' : 'Camera off',
        session.cameraOn ? 'Turn off camera' : 'Turn on camera')
    } catch (error) {
      showSessionError(session, error)
    }
  })
  const shareButton = createControl('share', 'Share screen', async () => {
    try {
      if (session.sharing) {
        await session.stream.stopShareScreen()
        session.sharing = false
        session.shareStage.hidden = true
      } else {
        session.shareLabel.textContent = 'You are sharing your screen'
        session.shareStage.hidden = false
        await session.stream.startShareScreen(session.shareCanvas)
        session.sharing = true
      }
      setControlState(shareButton, session.sharing,
        session.sharing ? 'Stop sharing' : 'Share screen',
        session.sharing ? 'Stop screen sharing' : 'Share screen')
    } catch (error) {
      session.sharing = false
      session.shareStage.hidden = true
      setControlState(shareButton, false, 'Share screen', 'Share screen')
      showSessionError(session, error)
    }
  })
  const peopleButton = createControl('people', 'People', () => togglePanel(panelParts.peopleTab))
  const chatButton = createControl('chat', 'Chat', () => togglePanel(panelParts.chatTab))
  const leaveButton = createControl('leave', 'Leave', () => void closeSession(session), true)
  controls.append(micButton, cameraButton, shareButton, peopleButton, chatButton, leaveButton)
  const meetingControls = [micButton, cameraButton, shareButton, peopleButton, chatButton]
  meetingControls.forEach(button => { button.disabled = true })
  panelParts.sendButton.disabled = true
  panelParts.peopleTab.addEventListener('click', () => togglePanel(panelParts.peopleTab))
  panelParts.chatTab.addEventListener('click', () => togglePanel(panelParts.chatTab))
  session.cleanup = () => document.removeEventListener('keydown', session.onEscape)
  session.onEscape = event => {
    if (event.key === 'Escape') void closeSession(session)
  }
  document.addEventListener('keydown', session.onEscape)

  const initialize = async () => {
    try {
      await loadZoomSdk()
      if (session.closing || !overlay.isConnected) return
      const tokenResponse = await api.post(
        `/projects/${encodeURIComponent(meeting.projectId)}/meetings/${encodeURIComponent(meeting.id)}/token`,
        {}
      )
      if (session.closing) return
      const { signature, sessionName } = tokenResponse?.data || {}
      if (!signature || !sessionName) {
        throw new Error('The server did not return a valid Zoom meeting token.')
      }

      const client = window.WebVideoSDK.createClient()
      session.client = client
      await client.init('en-US', 'Global', { patchJsMedia: true })
      if (session.closing) return

      const onUserAdded = users => {
        ;(Array.isArray(users) ? users : [users]).forEach(user => void renderParticipant(session, user))
        renderParticipants(session)
      }
      const onUserRemoved = users => {
        ;(Array.isArray(users) ? users : [users]).forEach(user => removeParticipant(session, user.userId))
        renderParticipants(session)
      }
      const onVideoChange = payload => {
        const userId = payload.userId
        if (payload.action === 'Start') {
          const user = client.getAllUser().find(person => String(person.userId) === String(userId))
          if (user) void renderParticipant(session, user)
        } else if (payload.action === 'Stop') {
          stopRenderingParticipant(session, userId)
        }
      }
      const onShareChange = async payload => {
        if (payload.state === 'Active' && String(payload.userId) !== String(session.localUserId)) {
          session.shareLabel.textContent = `${payload.userName || 'A participant'} is sharing their screen`
          session.shareStage.hidden = false
          try {
            await session.stream.startShareView(session.shareCanvas, payload.userId)
          } catch (error) {
            showSessionError(session, error)
          }
        } else if (payload.state === 'Inactive') {
          try {
            await session.stream.stopShareView()
          } catch (error) {
            console.error('Unable to stop rendering Zoom screen share:', error)
          }
          if (!session.sharing) {
            session.shareStage.hidden = true
          }
        }
      }
      const onChatMessage = message => renderChatMessage(session, message)
      addListener('user-added', onUserAdded)
      addListener('user-removed', onUserRemoved)
      addListener('peer-video-state-change', onVideoChange)
      addListener('active-share-change', onShareChange)
      addListener('chat-on-message', onChatMessage)
      client.on('user-added', onUserAdded)
      client.on('user-removed', onUserRemoved)
      client.on('peer-video-state-change', onVideoChange)
      client.on('active-share-change', onShareChange)
      client.on('chat-on-message', onChatMessage)

      const currentUser = firebaseAuth.currentUser
      const userName = currentUser?.displayName ||
        currentUser?.email?.split('@')[0] ||
        'Project member'
      await client.join(sessionName, signature, userName)
      session.joined = true
      if (session.closing) {
        await client.leave()
        finishSession(session)
        return
      }
      session.localUserId = client.getCurrentUserInfo().userId
      session.stream = client.getMediaStream()
      const mediaErrors = []
      try {
        await session.stream.startAudio()
        session.audioJoined = true
      } catch (error) {
        console.error('Unable to start Zoom meeting audio:', error)
        mediaErrors.push('microphone unavailable')
      }
      if (session.closing) return
      try {
        await session.stream.startVideo()
        session.cameraOn = true
        const localTile = createVideoTile(
          session,
          session.localUserId,
          `${client.getCurrentUserInfo().displayName || userName} (You)`,
          true
        )
        await session.stream.renderVideo(localTile.canvas, session.localUserId, 640, 360, 0, 0, 3)
        session.renderedUsers.add(String(session.localUserId))
      } catch (error) {
        console.error('Unable to start Zoom meeting video:', error)
        mediaErrors.push('camera unavailable')
      }
      if (session.closing) return

      setControlState(micButton, session.muted, session.muted ? 'Unmute' : 'Mute',
        session.muted ? 'Unmute microphone' : 'Mute microphone')
      setControlState(cameraButton, !session.cameraOn,
        session.cameraOn ? 'Camera' : 'Camera off',
        session.cameraOn ? 'Turn off camera' : 'Turn on camera')
      status.textContent = mediaErrors.length
        ? `Joined; ${mediaErrors.join(' and ')}. Check browser permissions.`
        : 'You’re in the meeting'
      if (mediaErrors.length) status.classList.add('is-error')
      session.startedAt = Date.now()
      session.timer = window.setInterval(() => {
        duration.textContent = formatDuration(Date.now() - session.startedAt)
      }, 1000)
      session.chatClient = client.getChatClient()
      appendChatHistory(session, session.chatClient.getHistory())
      renderParticipants(session)
      client.getAllUser().forEach(user => void renderParticipant(session, user))
      meetingControls.forEach(button => { button.disabled = false })
      panelParts.sendButton.disabled = false
    } catch (error) {
      if (session.closing || session.disposed) return
      console.error('Unable to join Zoom meeting:', error)
      status.textContent = error.message || 'The Zoom meeting could not be joined.'
      status.classList.add('is-error')
    }
  }

  void initialize()
}
