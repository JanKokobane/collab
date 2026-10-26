import { api } from './api.js'
import { firebaseAuth } from '../../firebase.js'

const SDK_URL = 'https://cdn.metered.ca/sdk/video/1.4.6/sdk.min.js'
const iconPaths = {
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
  micOff: '<path d="M9 9v3a3 3 0 0 0 5.1 2.1M15 9V5a3 3 0 0 0-5.8-1.2M5 10v2a7 7 0 0 0 12 5M19 10v2a7 7 0 0 1-.6 2.8M12 19v3m-4 0h8M2 2l20 20"/>',
  camera: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/>',
  cameraOff: '<path d="M3 7a2 2 0 0 1 2-1h8a2 2 0 0 1 2 2v1l6-4v14l-6-4v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM2 2l20 20"/>',
  share: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 22h8m-4-4v4m0-9V7m-3 3 3-3 3 3"/>',
  people: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  chat: '<path d="M14.5 4.5h.7a6.3 6.3 0 0 1 0 12.6h-1.5l-3.2 2.2v-3.1a6.3 6.3 0 0 1 4-11.7z" fill="currentColor" opacity=".22" stroke="none"/><path d="M10.6 7.2h-.8a6.3 6.3 0 0 0 0 12.6h1.5l3.2 2.2v-3.2a6.3 6.3 0 0 0-3.9-11.6z"/><path d="M8.2 12h5m-5 3h3"/>',
  leave: '<path d="M10 17l5-5-5-5m5 5H3m9-9h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6"/>'
}

let sdkLoadPromise
let activeSession

function loadMeteredSdk() {
  if (window.Metered?.Meeting) return Promise.resolve()
  if (sdkLoadPromise) return sdkLoadPromise

  sdkLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SDK_URL
    script.async = true
    script.onload = () => {
      if (window.Metered?.Meeting) resolve()
      else reject(new Error('The Metered Video SDK loaded without its meeting client.'))
    }
    script.onerror = () => reject(new Error('The Metered Video SDK could not be loaded.'))
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

function detachMeetingListeners(session) {
  for (const [eventName, handler] of session.listeners) {
    if (typeof session.meeting?.off === 'function') {
      session.meeting.off(eventName, handler)
    } else if (typeof session.meeting?.removeListener === 'function') {
      session.meeting.removeListener(eventName, handler)
    }
  }
  session.listeners = []
}

function finishSession(session) {
  if (session.disposed) return
  session.disposed = true
  if (session.timer) window.clearInterval(session.timer)
  if (session.chatPollTimer) window.clearInterval(session.chatPollTimer)
  detachMeetingListeners(session)
  for (const tile of session.tiles.values()) {
    tile.video.pause()
    tile.audio.pause()
    tile.video.srcObject = null
    tile.audio.srcObject = null
  }
  session.shareVideo.pause()
  session.shareVideo.srcObject = null
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
  if (session.meeting && session.joined) {
    try {
      await session.meeting.leaveMeeting()
    } catch (error) {
      console.error('Unable to leave Metered meeting cleanly:', error)
    }
  }
  finishSession(session)
}

function createVideoTile(session, userId, userName, isLocal = false) {
  const key = String(userId)
  if (session.tiles.has(key)) return session.tiles.get(key)
  const tile = document.createElement('article')
  tile.className = `zoom-meeting-tile${isLocal ? ' is-local' : ''}`
  const video = document.createElement('video')
  video.autoplay = true
  video.playsInline = true
  video.muted = isLocal
  video.hidden = true
  video.style.cssText = 'position:relative;z-index:1;display:block;width:100%;height:100%;object-fit:cover'
  video.setAttribute('aria-label', `${userName || 'Participant'} video`)
  const audio = document.createElement('audio')
  audio.autoplay = true
  audio.hidden = true
  const avatar = document.createElement('div')
  avatar.className = 'zoom-meeting-avatar'
  avatar.textContent = (userName || 'P').trim().slice(0, 1).toUpperCase()
  const mediaIndicators = document.createElement('div')
  mediaIndicators.className = 'zoom-meeting-media-indicators'
  mediaIndicators.setAttribute('aria-live', 'polite')
  const label = document.createElement('span')
  label.className = 'zoom-meeting-participant-name'
  label.textContent = userName || (isLocal ? 'You' : 'Project member')
  tile.append(video, audio, avatar, mediaIndicators, label)
  session.videoGrid.append(tile)
  const videoTile = {
    audio,
    audioTracks: new Map(),
    avatar,
    isLocal,
    mediaIndicators,
    tile,
    userId,
    video,
    videoTracks: new Map()
  }
  session.tiles.set(key, videoTile)
  renderParticipantMediaIndicators(session, key)
  return videoTile
}

function renderParticipantMediaIndicators(session, userId) {
  const tile = session.tiles.get(String(userId))
  const state = session.mediaStateByUserId.get(String(userId))
  if (!tile || !state) return
  tile.mediaIndicators.replaceChildren()
  if (state.muted) {
    const microphone = makeIcon('micOff')
    microphone.setAttribute('aria-hidden', 'true')
    const indicator = document.createElement('span')
    indicator.className = 'zoom-meeting-media-indicator'
    indicator.setAttribute('aria-label', 'Microphone muted')
    indicator.title = 'Microphone muted'
    indicator.append(microphone)
    tile.mediaIndicators.append(indicator)
  }
  if (state.cameraOff) {
    const camera = makeIcon('cameraOff')
    camera.setAttribute('aria-hidden', 'true')
    const indicator = document.createElement('span')
    indicator.className = 'zoom-meeting-media-indicator'
    indicator.setAttribute('aria-label', 'Camera off')
    indicator.title = 'Camera off'
    indicator.append(camera)
    tile.mediaIndicators.append(indicator)
  }
}

function updateParticipantMediaState(session, userId, updates) {
  if (userId === undefined || userId === null) return
  const key = String(userId)
  const state = session.mediaStateByUserId.get(key) || {}
  Object.assign(state, updates)
  session.mediaStateByUserId.set(key, state)
  renderParticipantMediaIndicators(session, key)
}

function updateParticipantFromMetered(session, participant) {
  const userId = participant?.participantSessionId || participant?._id
  if (!userId) return
  const updates = {}
  if (typeof participant.sharingAudio === 'boolean') {
    updates.muted = !participant.sharingAudio
  }
  if (typeof participant.sharingVideo === 'boolean') {
    updates.cameraOff = !participant.sharingVideo
  }
  if (Object.keys(updates).length) updateParticipantMediaState(session, userId, updates)
}

function renderVideoTracks(tile) {
  const tracks = [...tile.videoTracks.values()]
  if (!tracks.length) {
    tile.video.pause()
    tile.video.srcObject = null
    tile.video.hidden = true
    tile.avatar.hidden = false
    return
  }
  tile.video.srcObject = new MediaStream(tracks)
  tile.video.hidden = false
  tile.avatar.hidden = true
  void tile.video.play().catch(error => {
    console.warn('Unable to play meeting video:', error.message)
  })
}

function renderAudioTracks(tile) {
  const tracks = [...tile.audioTracks.values()]
  tile.audio.srcObject = tracks.length ? new MediaStream(tracks) : null
  if (tracks.length) {
    void tile.audio.play().catch(error => {
      console.warn('Unable to play meeting audio:', error.message)
    })
  }
}

function attachLocalTrack(session, item) {
  if (!item?.track || session.disposed) return
  if (item.type === 'audio') return
  const localTile = createVideoTile(
    session,
    session.localUserId,
    `${session.userName} (You)`,
    true
  )
  if (session.sharing) {
    session.shareVideo.srcObject = new MediaStream([item.track])
    session.shareVideo.hidden = false
    void session.shareVideo.play().catch(error => {
      console.warn('Unable to play the shared screen:', error.message)
    })
    localTile.videoTracks.clear()
    renderVideoTracks(localTile)
  } else {
    localTile.videoTracks.set(item.streamId, item.track)
    renderVideoTracks(localTile)
  }
}

function detachLocalTrack(session, item) {
  if (item?.type === 'audio') {
    return
  }
  const localTile = session.tiles.get(String(session.localUserId))
  if (localTile && item?.streamId) {
    localTile.videoTracks.delete(item.streamId)
    renderVideoTracks(localTile)
  }
  if (session.sharing) {
    session.shareVideo.pause()
    session.shareVideo.srcObject = null
    session.shareVideo.hidden = true
    session.sharing = false
    session.shareStage.hidden = true
    session.syncMediaControls?.()
  }
}

function attachRemoteTrack(session, item) {
  if (!item?.track || !item.participantSessionId || session.disposed) return
  const tile = createVideoTile(session, item.participantSessionId, item.name)
  if (item.type === 'audio') {
    tile.audioTracks.set(item.streamId, item.track)
    renderAudioTracks(tile)
  } else {
    tile.videoTracks.set(item.streamId, item.track)
    renderVideoTracks(tile)
  }
}

function detachRemoteTrack(session, item) {
  if (!item?.participantSessionId) return
  const tile = session.tiles.get(String(item.participantSessionId))
  if (!tile) return
  if (item.type === 'audio') {
    tile.audioTracks.delete(item.streamId)
    renderAudioTracks(tile)
  } else {
    tile.videoTracks.delete(item.streamId)
    renderVideoTracks(tile)
  }
}

function renderParticipants(session, participants = session.meeting?.getOnlineParticipants?.() || []) {
  session.participantHeading.textContent = `People (${participants.length})`
  session.participantList.replaceChildren()
  participants.forEach(person => {
    updateParticipantFromMetered(session, person)
    if (person._id) {
      createVideoTile(
        session,
        person._id,
        person.name,
        String(person._id) === String(session.localUserId)
      )
    }
    const row = document.createElement('div')
    row.className = 'zoom-meeting-person'
    const avatar = document.createElement('span')
    avatar.className = 'zoom-meeting-person-avatar'
    avatar.textContent = (person.name || 'P').trim().slice(0, 1).toUpperCase()
    const name = document.createElement('span')
    name.className = 'zoom-meeting-person-name'
    name.textContent = person.name || 'Project member'
    const state = document.createElement('small')
    state.textContent = String(person._id) === String(session.localUserId) ? 'You' : 'In meeting'
    row.append(avatar, name, state)
    session.participantList.append(row)
  })
}

function renderChatMessage(session, message) {
  if (!message || !session.chatMessages) return
  const id = message.message_id || message._id ||
    `${message.senderParticipantSessionId || message.sender_firebase_uid || ''}:${message.created_at || message.created || ''}:${message.content || message.message || ''}`
  if (session.chatIds.has(id)) return
  session.chatIds.add(id)
  session.chatMessages.querySelector('.zoom-meeting-chat-empty')?.remove()
  const item = document.createElement('article')
  item.className = 'zoom-meeting-chat-message'
  const author = document.createElement('strong')
  author.textContent = message.sender_name || message.senderName ||
    (message.sender_firebase_uid === session.firebaseUid ||
      message.senderParticipantSessionId === session.localUserId ? 'You' : 'Participant')
  const body = document.createElement('p')
  body.textContent = message.content || message.message || ''
  item.append(author, body)
  session.chatMessages.append(item)
  session.chatMessages.scrollTop = session.chatMessages.scrollHeight
}

async function syncMeetingChat(session) {
  const response = await api.get(
    `/projects/${encodeURIComponent(session.meeting.projectId)}/meetings/${encodeURIComponent(session.meeting.id)}/messages`
  )
  response?.data?.messages?.forEach(message => renderChatMessage(session, message))
}

function showSessionError(session, error) {
  console.error('Metered meeting action failed:', error)
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

export function openMeteredMeetingModal(meeting) {
  if (!meeting?.projectId || !meeting?.id) {
    throw new Error('This meeting is missing its project or meeting ID.')
  }
  if (activeSession) void closeSession(activeSession)

  const overlay = document.createElement('div')
  overlay.className = 'zoom-meeting-overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', meeting.title || 'Project meeting')

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
  status.textContent = 'Connecting to meeting…'
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
  const shareVideo = document.createElement('video')
  shareVideo.autoplay = true
  shareVideo.playsInline = true
  shareVideo.muted = true
  shareVideo.className = 'zoom-meeting-share-canvas'
  shareStage.append(shareLabel, shareVideo)
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
    shareVideo,
    tiles: new Map(),
    chatIds: new Set(),
    mediaStateByUserId: new Map(),
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
    muted: false,
    cameraOn: false,
    sharing: false,
    startedAt: 0
  }
  activeSession = session
  panelParts.chatForm.addEventListener('submit', async event => {
    event.preventDefault()
    const text = panelParts.chatInput.value.trim()
    if (!text || !session.meeting || session.chatSending) return
    session.chatSending = true
    panelParts.sendButton.disabled = true
    try {
      const response = await api.post(
        `/projects/${encodeURIComponent(meeting.projectId)}/meetings/${encodeURIComponent(meeting.id)}/messages`,
        { content: text }
      )
      renderChatMessage(session, response?.data?.message)
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
    session.meeting.on(eventName, handler)
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
      if (session.muted) {
        await session.meeting.startAudio()
        session.muted = false
      } else {
        await session.meeting.stopAudio()
        session.muted = true
      }
      setControlState(micButton, session.muted, session.muted ? 'Unmute' : 'Mute',
        session.muted ? 'Unmute microphone' : 'Mute microphone')
      updateParticipantMediaState(session, session.localUserId, { muted: session.muted })
    } catch (error) {
      showSessionError(session, error)
    }
  })
  const cameraButton = createControl('camera', 'Turn off camera', async () => {
    try {
      if (session.cameraOn) {
        await session.meeting.stopVideo()
        session.cameraOn = false
      } else {
        if (session.sharing) {
          await session.meeting.stopVideo()
          session.sharing = false
          session.shareStage.hidden = true
          session.shareVideo.pause()
          session.shareVideo.srcObject = null
          session.syncMediaControls()
        }
        await session.meeting.startVideo()
        session.cameraOn = true
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
        await session.meeting.stopVideo()
        session.sharing = false
        session.cameraOn = false
        session.shareStage.hidden = true
        session.shareVideo.pause()
        session.shareVideo.srcObject = null
      } else {
        const cameraWasOn = session.cameraOn
        session.shareLabel.textContent = 'You are sharing your screen'
        session.shareStage.hidden = false
        session.sharing = true
        session.cameraOn = false
        try {
          await session.meeting.startScreenShare()
        } catch (error) {
          session.sharing = false
          session.cameraOn = cameraWasOn
          session.shareStage.hidden = true
          session.shareVideo.pause()
          session.shareVideo.srcObject = null
          throw error
        }
      }
      session.syncMediaControls()
    } catch (error) {
      showSessionError(session, error)
    }
  })
  session.shareButton = shareButton
  session.cameraButton = cameraButton
  session.syncMediaControls = () => {
    setControlState(shareButton, session.sharing,
      session.sharing ? 'Stop sharing' : 'Share screen',
      session.sharing ? 'Stop screen sharing' : 'Share screen')
    setControlState(cameraButton, !session.cameraOn,
      session.cameraOn ? 'Camera' : 'Camera off',
      session.cameraOn ? 'Turn off camera' : 'Turn on camera')
    updateParticipantMediaState(session, session.localUserId, {
      cameraOff: !session.cameraOn
    })
  }
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
      await loadMeteredSdk()
      if (session.closing || !overlay.isConnected) return
      const tokenResponse = await api.post(
        `/projects/${encodeURIComponent(meeting.projectId)}/meetings/${encodeURIComponent(meeting.id)}/token`,
        {}
      )
      if (session.closing) return
      const { accessToken, roomURL } = tokenResponse?.data || {}
      if (!accessToken || !roomURL) {
        throw new Error('The server did not return a valid Metered meeting token.')
      }

      const meetingClient = new window.Metered.Meeting()
      session.meeting = meetingClient
      const currentUser = firebaseAuth.currentUser
      session.userName = currentUser?.displayName ||
        currentUser?.email?.split('@')[0] ||
        'Project member'
      const onLocalTrackStarted = item => attachLocalTrack(session, item)
      const onLocalTrackStopped = item => detachLocalTrack(session, item)
      const onLocalTrackUpdated = item => attachLocalTrack(session, item)
      const onRemoteTrackStarted = item => attachRemoteTrack(session, item)
      const onRemoteTrackStopped = item => detachRemoteTrack(session, item)
      const onParticipantJoined = participant => {
        if (participant?._id) createVideoTile(session, participant._id, participant.name)
        renderParticipants(session)
      }
      const onParticipantLeft = participant => {
        const tile = session.tiles.get(String(participant?._id))
        if (tile) {
          tile.video.pause()
          tile.audio.pause()
          tile.video.srcObject = null
          tile.audio.srcObject = null
          tile.tile.remove()
          session.tiles.delete(String(participant._id))
        }
        renderParticipants(session)
      }
      const onOnlineParticipants = participants => renderParticipants(session, participants)
      const onParticipantSharingStateUpdated = update => {
        if (!update?.participantSessionId) return
        updateParticipantMediaState(session, update.participantSessionId, {
          ...(typeof update.sharingAudio === 'boolean' ? { muted: !update.sharingAudio } : {}),
          ...(typeof update.sharingVideo === 'boolean' ? { cameraOff: !update.sharingVideo } : {})
        })
      }
      const onStateChanged = state => {
        if (state === 'network_connection_lost') {
          status.textContent = 'Connection interrupted. Reconnecting…'
        } else if (state === 'network_connection_restored' || state === 'reconnect_success') {
          status.textContent = 'Connection restored'
        }
      }
      const onMeetingEnded = () => void closeSession(session)
      const onMeetingLeft = () => {
        if (!session.closing) finishSession(session)
      }
      addListener('localTrackStarted', onLocalTrackStarted)
      addListener('localTrackStopped', onLocalTrackStopped)
      addListener('localTrackUpdated', onLocalTrackUpdated)
      addListener('remoteTrackStarted', onRemoteTrackStarted)
      addListener('remoteTrackStopped', onRemoteTrackStopped)
      addListener('participantJoined', onParticipantJoined)
      addListener('participantLeft', onParticipantLeft)
      addListener('onlineParticipants', onOnlineParticipants)
      addListener('participantSharingStateUpdated', onParticipantSharingStateUpdated)
      addListener('stateChanged', onStateChanged)
      addListener('meetingEnded', onMeetingEnded)
      addListener('meetingLeft', onMeetingLeft)

      const meetingInfo = await meetingClient.join({
        roomURL,
        name: session.userName,
        accessToken
      })
      session.joined = true
      if (session.closing) {
        await meetingClient.leaveMeeting()
        finishSession(session)
        return
      }
      session.localUserId = meetingInfo?.participantSessionId
      session.firebaseUid = firebaseAuth.currentUser?.uid || null
      renderParticipants(session, meetingInfo?.onlineParticipants || [])
      const mediaErrors = []
      try {
        await meetingClient.startAudio()
      } catch (error) {
        console.error('Unable to start Metered meeting audio:', error)
        session.muted = true
        mediaErrors.push('microphone unavailable')
      }
      if (session.closing) return
      try {
        await meetingClient.startVideo()
        session.cameraOn = true
      } catch (error) {
        console.error('Unable to start Metered meeting video:', error)
        mediaErrors.push('camera unavailable')
      }
      if (session.closing) return

      setControlState(micButton, session.muted, session.muted ? 'Unmute' : 'Mute',
        session.muted ? 'Unmute microphone' : 'Mute microphone')
      setControlState(cameraButton, !session.cameraOn,
        session.cameraOn ? 'Camera' : 'Camera off',
        session.cameraOn ? 'Turn off camera' : 'Turn on camera')
      updateParticipantMediaState(session, session.localUserId, {
        muted: session.muted,
        cameraOff: !session.cameraOn
      })
      status.textContent = mediaErrors.length
        ? `Joined; ${mediaErrors.join(' and ')}. Check browser permissions.`
        : 'You’re in the meeting'
      if (mediaErrors.length) status.classList.add('is-error')
      session.startedAt = Date.now()
      session.timer = window.setInterval(() => {
        duration.textContent = formatDuration(Date.now() - session.startedAt)
      }, 1000)
      meetingControls.forEach(button => { button.disabled = false })
      panelParts.sendButton.disabled = false
      void syncMeetingChat(session).catch(error => {
        console.warn('Unable to load meeting chat messages:', error)
      })
      session.chatPollTimer = window.setInterval(() => {
        void syncMeetingChat(session).catch(error => {
          console.warn('Unable to refresh meeting chat messages:', error)
        })
      }, 3000)
      if (typeof meetingClient.getChatHistory === 'function') {
        try {
          meetingClient.getChatHistory()
        } catch (error) {
          console.error('Unable to load Metered meeting chat history:', error)
        }
      }
    } catch (error) {
      if (session.closing || session.disposed) return
      console.error('Unable to join Metered meeting:', error)
      status.textContent = error.message || 'The Metered meeting could not be joined.'
      status.classList.add('is-error')
    }
  }

  void initialize()
}
