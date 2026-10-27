import { api } from './api.js'
import { firebaseAuth } from '../../firebase.js'
import { hub, projects } from './state.js'

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

const meetingReactions = ['👍', '❤️', '😂', '👏', '🎉', '🤔']

function element(tagName, className = '', text = '') {
  const node = document.createElement(tagName)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

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
  if (session.meetingInfoPollTimer) window.clearInterval(session.meetingInfoPollTimer)
  if (session.actionItemsPollTimer) window.clearInterval(session.actionItemsPollTimer)
  if (session.screenShareHeartbeatTimer) window.clearInterval(session.screenShareHeartbeatTimer)
  detachMeetingListeners(session)
  for (const tile of session.tiles.values()) {
    tile.video.pause()
    tile.audio.pause()
    tile.video.srcObject = null
    tile.audio.srcObject = null
  }
  session.shareVideo.pause()
  session.shareVideo.srcObject = null
  session.displayedScreenTrack = null
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
  if (session.sharing && session.localUserId) {
    await updateScreenShareLease(session, 'release').catch(error => {
      console.warn('Unable to release the screen-share lock:', error)
    })
  }
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
  if (typeof updates.sharingScreen === 'boolean') {
    updateScreenShareFromParticipants(session)
  }
}

function updateParticipantFromMetered(session, participant) {
  const userId = participant?.participantSessionId || participant?._id
  if (!userId) return
  const updates = {}
  if (typeof participant.sharingScreen === 'boolean') {
    updates.sharingScreen = participant.sharingScreen
  }
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

function playSharedScreen(session) {
  session.shareVideo.hidden = false
  void session.shareVideo.play().catch(error => {
    if (error?.name !== 'AbortError' && !session.closing && !session.disposed) {
      console.warn('Unable to play the shared screen:', error.message)
    }
  })
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
    if (session.displayedScreenTrack === item.track &&
        session.shareVideo.srcObject?.getVideoTracks?.()[0] === item.track) {
      setScreenSharePresentation(session, {
        participantSessionId: session.localUserId,
        name: `${session.userName} (You)`,
        isLocal: true
      })
      return
    }
    session.displayedScreenTrack = item.track
    session.displayedScreenStreamId = item.streamId
    session.shareVideo.srcObject = new MediaStream([item.track])
    playSharedScreen(session)
    localTile.videoTracks.clear()
    renderVideoTracks(localTile)
    setScreenSharePresentation(session, {
      participantSessionId: session.localUserId,
      name: `${session.userName} (You)`,
      isLocal: true
    })
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
  const stoppedScreenTrack = item?.track === session.displayedScreenTrack ||
    (item?.streamId && item.streamId === session.displayedScreenStreamId)
  if (session.sharing && stoppedScreenTrack) {
    void updateScreenShareLease(session, 'release').catch(error => {
      console.warn('Unable to release the screen-share lock:', error)
    })
    if (session.screenShareHeartbeatTimer) {
      window.clearInterval(session.screenShareHeartbeatTimer)
      session.screenShareHeartbeatTimer = null
    }
    session.shareVideo.pause()
    session.shareVideo.srcObject = null
    session.shareVideo.hidden = true
    session.displayedScreenTrack = null
    session.displayedScreenStreamId = null
    session.sharing = false
    setScreenSharePresentation(session, null)
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
    tile.latestVideoTrack = item.track
    tile.latestVideoStreamId = item.streamId
    renderVideoTracks(tile)
    if (session.mediaStateByUserId.get(String(item.participantSessionId))?.sharingScreen) {
      showRemoteScreenTrack(session, item.participantSessionId, item.track)
    }
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
    if (tile.latestVideoStreamId === item.streamId) {
      const tracks = [...tile.videoTracks.values()]
      const streamIds = [...tile.videoTracks.keys()]
      tile.latestVideoTrack = tracks[tracks.length - 1] || null
      tile.latestVideoStreamId = streamIds[streamIds.length - 1] || null
    }
    renderVideoTracks(tile)
    if (session.screenShareOwnerId === String(item.participantSessionId) &&
        (!tile.latestVideoTrack || tile.latestVideoTrack === item.track)) {
      setScreenSharePresentation(session, null)
    }
  }
}

function setScreenSharePresentation(session, share) {
  const isSharing = Boolean(share)
  const previousOwnerId = session.screenShareOwnerId
  session.screenShareOwnerId = share ? String(share.participantSessionId) : null
  session.shareStage.hidden = !isSharing
  session.videoGrid.hidden = isSharing
  session.content?.classList.toggle('has-screen-share', isSharing)
  session.panel?.classList.toggle('is-screen-sharing', isSharing)
  if (!isSharing) {
    session.shareVideo.pause()
    session.shareVideo.srcObject = null
    session.displayedScreenTrack = null
    session.displayedScreenStreamId = null
    const tabs = [session.peopleTab, session.chatTab, session.notesTab, session.actionsTab]
    const panes = [session.participantList.parentElement, session.chatPane, session.notesPane, session.actionsPane]
    const previousTab = session.panelTabBeforeScreenShare || session.peopleTab
    tabs.forEach(tab => tab.classList.toggle('is-active', tab === previousTab))
    panes.forEach((pane, index) => { pane.hidden = tabs[index] !== previousTab })
    session.panel.hidden = Boolean(session.panelWasHiddenBeforeScreenShare)
    session.content?.classList.remove('has-screen-share-panel')
    session.panelWasHiddenBeforeScreenShare = false
    session.panelTabBeforeScreenShare = null
    return
  }
  if (!previousOwnerId || previousOwnerId !== session.screenShareOwnerId) {
    session.panelWasHiddenBeforeScreenShare = session.panel.hidden
    session.panelTabBeforeScreenShare = [session.peopleTab, session.chatTab, session.notesTab, session.actionsTab]
      .find(tab => tab.classList.contains('is-active')) || session.peopleTab
  }
  session.panel.hidden = true
  session.content?.classList.remove('has-screen-share-panel')
  session.shareLabel.textContent = `${share.name || 'A participant'} is sharing their screen`
  const tabs = [session.peopleTab, session.chatTab, session.notesTab, session.actionsTab]
  const panes = [session.participantList.parentElement, session.chatPane, session.notesPane, session.actionsPane]
  tabs.forEach(tab => tab.classList.toggle('is-active', tab === session.peopleTab))
  panes.forEach((pane, index) => { pane.hidden = tabs[index] !== session.peopleTab })
  session.shareVideo.hidden = false
}

function showRemoteScreenTrack(session, participantSessionId, track) {
  if (session.screenShareOwnerId === String(participantSessionId) &&
      session.displayedScreenTrack === track) {
    return
  }
  const person = session.onlineParticipants?.find(participant =>
    String(participant._id || participant.participantSessionId) === String(participantSessionId)
  )
  session.shareVideo.srcObject = new MediaStream([track])
  session.displayedScreenTrack = track
  session.displayedScreenStreamId = null
  playSharedScreen(session)
  setScreenSharePresentation(session, {
    participantSessionId,
    name: person?.name || 'A participant'
  })
}

function updateScreenShareFromParticipants(session) {
  const sharer = [...session.mediaStateByUserId.entries()]
    .find(([, state]) => state.sharingScreen)
  if (!sharer) {
    if (session.screenShareOwnerId && !session.sharing) {
      const ownerTile = session.tiles.get(session.screenShareOwnerId)
      if (!ownerTile?.latestVideoTrack) setScreenSharePresentation(session, null)
    }
    return
  }
  const [participantSessionId] = sharer
  const tile = session.tiles.get(participantSessionId)
  const person = session.onlineParticipants?.find(participant =>
    String(participant._id || participant.participantSessionId) === participantSessionId
  )
  if (participantSessionId === String(session.localUserId)) {
    setScreenSharePresentation(session, {
      participantSessionId,
      name: `${session.userName} (You)`,
      isLocal: true
    })
  } else if (tile?.latestVideoTrack &&
      (session.screenShareOwnerId !== participantSessionId ||
       session.displayedScreenTrack !== tile.latestVideoTrack)) {
    showRemoteScreenTrack(session, participantSessionId, tile.latestVideoTrack)
  } else {
    setScreenSharePresentation(session, {
      participantSessionId,
      name: person?.name || 'A participant'
    })
  }
}

function renderParticipants(session, participants = session.meeting?.getOnlineParticipants?.() || []) {
  session.onlineParticipants = participants
  session.participantHeading.textContent = `People (${participants.length})`
  session.participantList.replaceChildren()
  participants.forEach(person => {
    updateParticipantFromMetered(session, person)
    const userId = person.participantSessionId || person._id
    if (userId) {
      createVideoTile(
        session,
        userId,
        person.name,
        String(userId) === String(session.localUserId)
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
    const participantState = session.mediaStateByUserId.get(String(userId))
    state.textContent = participantState?.sharingScreen
      ? 'Sharing screen'
      : String(userId) === String(session.localUserId) ? 'You' : 'In meeting'
    row.append(avatar, name, state)
    session.participantList.append(row)
  })
}

function isMeetingChatOpen(session) {
  return !session.panel.hidden && !session.chatPane.hidden
}

function renderChatMessage(session, message, { countAsUnread = true } = {}) {
  if (!message || !session.chatMessages) return
  const content = message.content || message.message || ''
  const id = message.message_id || message._id ||
    `${message.senderParticipantSessionId || message.sender_firebase_uid || ''}:${message.created_at || message.created || ''}:${content}`
  if (session.chatIds.has(id)) return
  session.chatIds.add(id)
  const reactionMatch = /^\[\[collab-reaction:(.+)\]\]$/.exec(content)
  if (reactionMatch && meetingReactions.includes(reactionMatch[1])) {
    showMeetingReaction(session, reactionMatch[1])
    return
  }
  if (countAsUnread && !isMeetingChatOpen(session)) {
    session.unreadMessageCount += 1
  }
  session.updateChatCount?.()
  session.chatMessages.querySelector('.zoom-meeting-chat-empty')?.remove()
  const item = document.createElement('article')
  item.className = 'zoom-meeting-chat-message'
  const author = document.createElement('strong')
  author.textContent = message.sender_name || message.senderName ||
    (message.sender_firebase_uid === session.firebaseUid ||
      message.senderParticipantSessionId === session.localUserId ? 'You' : 'Participant')
  const body = document.createElement('p')
  body.textContent = content
  item.append(author, body)
  session.chatMessages.append(item)
  session.chatMessages.scrollTop = session.chatMessages.scrollHeight
}

function showMeetingReaction(session, reaction) {
  const now = Date.now()
  const laneCount = 6
  const lanes = session.reactionLaneNextAt ||= Array(laneCount).fill(0)
  let lane = session.nextReactionLane || 0
  let startDelay = 0
  for (let offset = 0; offset < laneCount; offset += 1) {
    const candidate = (lane + offset) % laneCount
    if (lanes[candidate] <= now) {
      lane = candidate
      break
    }
    if (lanes[candidate] < lanes[lane]) lane = candidate
  }
  startDelay = Math.max(0, lanes[lane] - now)
  lanes[lane] = now + startDelay + 2800
  session.nextReactionLane = (lane + 1) % laneCount
  const bubble = element('span', 'zoom-meeting-reaction-float', reaction)
  bubble.style.setProperty('--reaction-x', `${[8, 25, 42, 58, 75, 92][lane]}%`)
  bubble.style.animationDelay = `${startDelay}ms`
  bubble.setAttribute('aria-label', `Meeting reaction ${reaction}`)
  session.reactionLayer.append(bubble)
  window.setTimeout(() => bubble.remove(), startDelay + 2800)
}

async function syncMeetingChat(session) {
  if (session.chatPolling || session.closing || session.disposed ||
      isPollBackedOff(session, 'chat')) return
  session.chatPolling = true
  try {
    const response = await api.get(
      `/projects/${encodeURIComponent(session.projectId)}/meetings/${encodeURIComponent(session.meetingId)}/messages`
    )
    response?.data?.messages?.forEach(message => renderChatMessage(session, message, {
      countAsUnread: session.chatInitialized
    }))
    session.chatInitialized = true
    clearPollBackoff(session, 'chat')
  } catch (error) {
    recordPollFailure(session, 'chat', error)
    throw error
  } finally {
    session.chatPolling = false
  }
}

function isPollBackedOff(session, name) {
  return Date.now() < (session[`${name}RetryAt`] || 0)
}

function clearPollBackoff(session, name) {
  session[`${name}RetryAt`] = 0
  session[`${name}RetryDelay`] = 30_000
}

function recordPollFailure(session, name, error) {
  if (error?.status !== 429) return
  const delay = session[`${name}RetryDelay`] || 30_000
  session[`${name}RetryAt`] = Date.now() + delay
  session[`${name}RetryDelay`] = Math.min(delay * 2, 300_000)
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

async function updateScreenShareLease(session, action) {
  return api.post(
    `/projects/${encodeURIComponent(session.projectId)}/meetings/${encodeURIComponent(session.meetingId)}/screen-share`,
    { action, participantSessionId: String(session.localUserId) }
  )
}

async function pollMeetingLiveStatus(session) {
  if (session.liveStatusPolling || session.closing || session.disposed || !session.localUserId ||
      isPollBackedOff(session, 'liveStatus')) return
  session.liveStatusPolling = true
  try {
    const response = await api.get(
      `/projects/${encodeURIComponent(session.projectId)}/meetings/${encodeURIComponent(session.meetingId)}/live-status`
    )
    clearPollBackoff(session, 'liveStatus')
    const data = response?.data
    if (data?.endedAt) {
      session.meetingRecord.endedAt = data.endedAt
      session.meetingRecord.isEnded = true
      session.status.textContent = 'The host ended this meeting for everyone.'
      session.closing = true
      if (session.meeting && typeof session.meeting.leaveMeeting === 'function') {
        await session.meeting.leaveMeeting().catch(error => {
          console.warn('Unable to leave the ended meeting cleanly:', error)
        })
      }
      finishSession(session)
      return
    }
    session.canEndMeeting = Boolean(data?.canEnd)
    if (session.leaveButton && !session.ending) {
      session.leaveButton.classList.toggle('is-danger', session.canEndMeeting)
      session.leaveButton.querySelector('span').textContent =
        session.canEndMeeting ? 'End meeting' : 'Leave'
      session.leaveButton.setAttribute('aria-label',
        session.canEndMeeting ? 'End meeting for everyone' : 'Leave meeting')
      session.leaveButton.title =
        session.canEndMeeting ? 'End meeting for everyone' : 'Leave meeting'
    }
    const screenShare = data?.screenShare
    session.screenShareHeldByOther = Boolean(screenShare &&
      !(screenShare.firebaseUid === session.firebaseUid &&
        String(screenShare.participantSessionId) === String(session.localUserId)))
    updateShareControl(session)
    if (screenShare) {
      const ownerId = String(screenShare.participantSessionId)
      const participant = session.onlineParticipants?.find(person =>
        String(person._id || person.participantSessionId) === ownerId
      )
      const tile = session.tiles.get(ownerId)
      if (ownerId === String(session.localUserId)) {
        setScreenSharePresentation(session, {
          participantSessionId: ownerId,
          name: `${session.userName} (You)`,
          isLocal: true
        })
      } else if (ownerId !== session.screenShareOwnerId && tile?.latestVideoTrack) {
        showRemoteScreenTrack(session, ownerId, tile.latestVideoTrack)
      } else if (ownerId !== session.screenShareOwnerId) {
        setScreenSharePresentation(session, {
          participantSessionId: ownerId,
          name: participant?.name || 'A participant'
        })
      } else if (!session.shareVideo.srcObject && tile?.latestVideoTrack) {
        showRemoteScreenTrack(session, ownerId, tile.latestVideoTrack)
      }
    } else if (session.screenShareOwnerId && !session.sharing) {
      setScreenSharePresentation(session, null)
    }
  } catch (error) {
    recordPollFailure(session, 'liveStatus', error)
    if (!session.closing && !session.disposed) {
      console.warn('Unable to refresh meeting controls:', error)
    }
  } finally {
    session.liveStatusPolling = false
  }
}

function updateShareControl(session) {
  const button = session.shareButton
  if (!button) return
  const blocked = session.screenShareHeldByOther && !session.sharing
  button.disabled = blocked
  const label = blocked ? 'Screen share in use'
    : session.sharing ? 'Stop sharing' : 'Share screen'
  button.querySelector('span').textContent = label
  button.setAttribute('aria-label', blocked ? 'Another participant is sharing their screen' : label)
  button.title = blocked ? 'Another participant is sharing their screen' : label
  button.classList.toggle('is-active', session.sharing)
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
  const notesTab = document.createElement('button')
  notesTab.type = 'button'
  notesTab.textContent = 'Notes'
  const actionsTab = document.createElement('button')
  actionsTab.type = 'button'
  actionsTab.textContent = 'Actions'
  tabs.append(peopleTab, chatTab, notesTab, actionsTab)

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

  const notesPane = document.createElement('section')
  notesPane.className = 'zoom-meeting-panel-pane zoom-meeting-notes-pane'
  notesPane.hidden = true
  const notesHeading = document.createElement('h3')
  notesHeading.textContent = 'Meeting notes'
  const notesForm = document.createElement('form')
  notesForm.className = 'zoom-meeting-notes-form'
  const notesInput = document.createElement('textarea')
  notesInput.maxLength = 20000
  notesInput.placeholder = 'Capture decisions, context, and follow-ups…'
  notesInput.setAttribute('aria-label', 'Meeting notes')
  const notesStatus = document.createElement('small')
  notesStatus.className = 'zoom-meeting-notes-status'
  const saveNotesButton = document.createElement('button')
  saveNotesButton.type = 'submit'
  saveNotesButton.textContent = 'Save notes'
  notesForm.append(notesInput, notesStatus, saveNotesButton)
  const aiMeetingButton = element('button', 'zoom-meeting-ai-button', '✨ Extract action items with AI')
  aiMeetingButton.type = 'button'
  const aiMeetingResults = element('div', 'zoom-meeting-ai-results')
  aiMeetingResults.setAttribute('aria-live', 'polite')
  notesPane.append(notesHeading, notesForm, aiMeetingButton, aiMeetingResults)

  const actionsPane = document.createElement('section')
  actionsPane.className = 'zoom-meeting-panel-pane zoom-meeting-actions-pane'
  actionsPane.hidden = true
  const actionsHeading = document.createElement('h3')
  actionsHeading.textContent = 'Action items'
  const actionItemList = document.createElement('div')
  actionItemList.className = 'zoom-meeting-action-list'
  const actionItemForm = document.createElement('form')
  actionItemForm.className = 'zoom-meeting-action-form'
  const actionItemInput = document.createElement('input')
  actionItemInput.type = 'text'
  actionItemInput.maxLength = 500
  actionItemInput.placeholder = 'Add an action item…'
  actionItemInput.setAttribute('aria-label', 'New meeting action item')
  const addActionItemButton = document.createElement('button')
  addActionItemButton.type = 'submit'
  addActionItemButton.textContent = 'Add'
  actionItemForm.append(actionItemInput, addActionItemButton)
  actionsPane.append(actionsHeading, actionItemList, actionItemForm)

  panel.append(tabs, peoplePane, chatPane, notesPane, actionsPane)

  return {
    panel,
    peopleTab,
    chatTab,
    notesTab,
    actionsTab,
    participantHeading,
    participantList,
    chatPane,
    chatMessages,
    chatForm,
    chatInput,
    sendButton,
    notesPane,
    notesForm,
    notesInput,
    notesStatus,
    saveNotesButton,
    aiMeetingButton,
    aiMeetingResults,
    actionsPane,
    actionItemList,
    actionItemForm,
    actionItemInput,
    addActionItemButton
  }
}

export function openMeteredMeetingModal(meeting) {
  if (!meeting?.projectId || !meeting?.id) {
    throw new Error('This meeting is missing its project or meeting ID.')
  }
  if (meeting.isEnded || meeting.endedAt) return
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
    projectId: meeting.projectId,
    meetingId: meeting.id,
    overlay,
    status,
    videoGrid,
    content,
    shareStage,
    shareLabel,
    shareVideo,
    reactionLayer: element('div', 'zoom-meeting-reaction-layer'),
    tiles: new Map(),
    chatIds: new Set(),
    unreadMessageCount: 0,
    chatInitialized: false,
    mediaStateByUserId: new Map(),
    listeners: [],
    participantHeading: panelParts.participantHeading,
    participantList: panelParts.participantList,
    panel: panelParts.panel,
    peopleTab: panelParts.peopleTab,
    chatTab: panelParts.chatTab,
    notesTab: panelParts.notesTab,
    actionsTab: panelParts.actionsTab,
    chatPane: panelParts.chatPane,
    chatMessages: panelParts.chatMessages,
    notesPane: panelParts.notesPane,
    actionsPane: panelParts.actionsPane,
    notesInput: panelParts.notesInput,
    notesStatus: panelParts.notesStatus,
    saveNotesButton: panelParts.saveNotesButton,
    actionItemList: panelParts.actionItemList,
    actionItemInput: panelParts.actionItemInput,
    addActionItemButton: panelParts.addActionItemButton,
    projectRecord: projects.find(project => project.projectId === meeting.projectId),
    canEndMeeting: meeting.hostFirebaseUid === firebaseAuth.currentUser?.uid ||
      projects.find(project => project.projectId === meeting.projectId)?.creatorFirebaseUid === firebaseAuth.currentUser?.uid,
    joined: false,
    closing: false,
    disposed: false,
    muted: false,
    cameraOn: false,
    sharing: false,
    screenShareHeldByOther: false,
    meetingRecord: meeting,
    startedAt: 0
  }
  content.append(session.reactionLayer)
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
    if (session.screenShareOwnerId) {
      const currentPane = [panelParts.peopleTab, panelParts.chatTab, panelParts.notesTab, panelParts.actionsTab]
        .find((item, index) => ![
          panelParts.participantList.parentElement,
          panelParts.chatPane,
          panelParts.notesPane,
          panelParts.actionsPane
        ][index].hidden)
      const closePanel = tab === panelParts.peopleTab &&
        !session.panel.hidden && currentPane === panelParts.peopleTab
      session.panel.hidden = closePanel
      session.content.classList.toggle('has-screen-share-panel', !closePanel)
      if (!closePanel) {
        const tabs = [panelParts.peopleTab, panelParts.chatTab, panelParts.notesTab, panelParts.actionsTab]
        const panes = [
          panelParts.participantList.parentElement,
          panelParts.chatPane,
          panelParts.notesPane,
          panelParts.actionsPane
        ]
        tabs.forEach(item => item.classList.toggle('is-active', item === tab))
        panes.forEach((pane, index) => { pane.hidden = tabs[index] !== tab })
        if (tab === panelParts.chatTab) {
          session.unreadMessageCount = 0
          session.updateChatCount?.()
        }
      }
      return
    }
    const isOpen = !panelParts.panel.hidden && tab.classList.contains('is-active')
    panelParts.panel.hidden = isOpen
    const tabs = [panelParts.peopleTab, panelParts.chatTab, panelParts.notesTab, panelParts.actionsTab]
    const panes = [
      panelParts.participantList.parentElement,
      panelParts.chatPane,
      panelParts.notesPane,
      panelParts.actionsPane
    ]
    if (isOpen) {
      tabs.forEach(item => item.classList.remove('is-active'))
    } else {
      tabs.forEach(item => item.classList.toggle('is-active', item === tab))
      panes.forEach((pane, index) => { pane.hidden = tabs[index] !== tab })
      session.panelTabBeforeScreenShare = tab
      if (tab === panelParts.notesTab) void session.refreshMeetingNotes?.()
      if (tab === panelParts.actionsTab) void session.refreshActionItems?.()
    }
  }

  const meetingApiPath = suffix =>
    `/projects/${encodeURIComponent(session.projectId)}/meetings/${encodeURIComponent(session.meetingId)}${suffix}`
  const meetingAttendeeUids = () => (meeting.attendees || [])
    .map(attendee => attendee.firebaseUid)
    .filter(Boolean)
  const renderActionItems = items => {
    panelParts.actionItemList.replaceChildren()
    if (!items.length) {
      panelParts.actionItemList.append(element('p', 'zoom-meeting-chat-empty', 'No action items yet.'))
      return
    }
    items.forEach(item => {
      const row = element('article', 'zoom-meeting-action-item')
      const copy = element('p', 'zoom-meeting-action-copy', item.content)
      row.append(copy)
      if (item.task_id) {
        row.append(element('span', 'zoom-meeting-action-dispatched', 'Added to task board'))
      } else {
        const dispatchForm = element('form', 'zoom-meeting-action-dispatch')
        const attendeeSelect = document.createElement('select')
        attendeeSelect.required = true
        attendeeSelect.setAttribute('aria-label', 'Assign action item to an invited attendee')
        const attendeePlaceholder = element('option', '', 'Assign attendee')
        attendeePlaceholder.value = ''
        attendeeSelect.append(attendeePlaceholder)
        ;(meeting.attendees || []).forEach(attendee => {
          const option = element('option', '', attendee.name || attendee.email || 'Project attendee')
          option.value = attendee.firebaseUid
          attendeeSelect.append(option)
        })
        const sprintSelect = document.createElement('select')
        sprintSelect.required = true
        sprintSelect.setAttribute('aria-label', 'Project sprint')
        const sprintPlaceholder = element('option', '', 'Choose sprint')
        sprintPlaceholder.value = ''
        sprintSelect.append(sprintPlaceholder)
        const noSprintMessage = element('small', 'zoom-meeting-action-hint', '')
        const updateSprintChoices = () => {
          sprintSelect.replaceChildren(sprintPlaceholder)
          const eligibleSprints = (session.projectRecord?.sprints || []).filter(sprint =>
            sprint.assigneeFirebaseUid === attendeeSelect.value
          )
          eligibleSprints.forEach(sprint => {
            const option = element('option', '', sprint.name)
            option.value = sprint.name
            sprintSelect.append(option)
          })
          noSprintMessage.textContent = attendeeSelect.value && !eligibleSprints.length
            ? 'This attendee does not lead a project sprint yet.'
            : ''
          dispatch.disabled = !attendeeSelect.value || !eligibleSprints.length
        }
        attendeeSelect.addEventListener('change', updateSprintChoices)
        const dueDate = document.createElement('input')
        dueDate.type = 'date'
        dueDate.required = true
        dueDate.setAttribute('aria-label', 'Action item due date')
        dueDate.min = new Date().toISOString().slice(0, 10)
        const dispatch = element('button', 'zoom-meeting-action-dispatch-button', 'Dispatch to Board')
        dispatch.type = 'submit'
        dispatch.disabled = true
        dispatchForm.append(attendeeSelect, sprintSelect, dueDate, noSprintMessage, dispatch)
        dispatchForm.addEventListener('submit', async event => {
          event.preventDefault()
          if (!attendeeSelect.value || !sprintSelect.value || !dueDate.value) return
          dispatch.disabled = true
          try {
            const response = await api.post(
              `${meetingApiPath(`/action-items/${encodeURIComponent(item.action_item_id)}/dispatch`)}`,
              {
                assigneeFirebaseUid: attendeeSelect.value,
                sprintName: sprintSelect.value,
                dueDate: dueDate.value
              }
            )
            const taskId = response?.data?.taskId
            item.task_id = taskId
            row.replaceChildren(copy, element('span', 'zoom-meeting-action-dispatched', 'Added to task board'))
            await hub.renderAdminTasksTable?.({ silent: true })
            hub.renderTasks?.()
          } catch (error) {
            dispatch.disabled = false
            showSessionError(session, error)
          }
        })
        row.append(dispatchForm)
      }
      panelParts.actionItemList.append(row)
    })
  }
  const loadMeetingNotes = async () => {
    if (session.notesDirty || document.activeElement === panelParts.notesInput ||
        session.notesLoading || session.closing) return
    session.notesLoading = true
    try {
      const response = await api.get(meetingApiPath('/notes'))
      if (!session.notesDirty && document.activeElement !== panelParts.notesInput) {
        panelParts.notesInput.value = response?.data?.notes?.body || ''
      }
    } finally {
      session.notesLoading = false
    }
  }
  panelParts.notesInput.addEventListener('input', () => {
    session.notesDirty = true
    panelParts.notesStatus.textContent = 'Unsaved changes'
  })
  const saveMeetingNotes = async event => {
    event.preventDefault()
    if (session.notesSaving) return
    session.notesSaving = true
    panelParts.saveNotesButton.disabled = true
    panelParts.notesStatus.textContent = 'Saving…'
    try {
      await api.put(meetingApiPath('/notes'), { body: panelParts.notesInput.value })
      session.notesDirty = false
      panelParts.notesStatus.textContent = 'Saved'
      panelParts.notesStatus.classList.remove('is-error')
    } catch (error) {
      panelParts.notesStatus.textContent = error.message || 'Could not save notes.'
      panelParts.notesStatus.classList.add('is-error')
    } finally {
      session.notesSaving = false
      panelParts.saveNotesButton.disabled = false
    }
  }
  const loadMeetingActionItems = async () => {
    if (session.actionItemsLoading || session.closing ||
        isPollBackedOff(session, 'actionItems')) return
    session.actionItemsLoading = true
    try {
      const response = await api.get(meetingApiPath('/action-items'))
      renderActionItems(response?.data?.actionItems || [])
      clearPollBackoff(session, 'actionItems')
    } catch (error) {
      recordPollFailure(session, 'actionItems', error)
      throw error
    } finally {
      session.actionItemsLoading = false
    }
  }
  session.refreshMeetingNotes = loadMeetingNotes
  session.refreshActionItems = loadMeetingActionItems
  panelParts.aiMeetingButton.addEventListener('click', async () => {
    const meetingNotes = panelParts.notesInput.value.trim()
    if (!meetingNotes) {
      panelParts.notesStatus.textContent = 'Add meeting notes before extracting action items.'
      panelParts.notesStatus.classList.add('is-error')
      panelParts.notesInput.focus()
      return
    }
    panelParts.aiMeetingButton.disabled = true
    panelParts.aiMeetingButton.textContent = 'Analyzing notes…'
    panelParts.aiMeetingResults.replaceChildren()
    try {
      const response = await api.post('/ai/summarize-meeting', { meetingNotes })
      const summary = response?.summary
      if (!response?.success || !Array.isArray(summary?.decisions) ||
          !Array.isArray(summary?.actionItems)) {
        throw new Error('The AI service returned an invalid meeting summary.')
      }
      const decisions = element('section', 'zoom-meeting-ai-section')
      decisions.append(element('h4', '', 'Decisions'))
      if (summary.decisions.length) {
        const list = document.createElement('ul')
        summary.decisions.forEach(decision => list.append(element('li', '', decision)))
        decisions.append(list)
      } else {
        decisions.append(element('p', 'zoom-meeting-chat-empty', 'No explicit decisions found.'))
      }
      panelParts.aiMeetingResults.append(decisions)
      const actionSection = element('section', 'zoom-meeting-ai-section')
      actionSection.append(element('h4', '', 'Action items'))
      if (summary.actionItems.length) {
        summary.actionItems.forEach(item => {
          const row = element('article', 'zoom-meeting-ai-action')
          row.append(element('span', '', item.taskTitle))
          if (item.suggestedAssignee) {
            row.append(element('small', '', `Suggested: ${item.suggestedAssignee}`))
          }
          const add = element('button', 'zoom-meeting-ai-add-button', 'Add to action pad')
          add.type = 'button'
          add.addEventListener('click', async () => {
            add.disabled = true
            try {
              await api.post(meetingApiPath('/action-items'), { content: item.taskTitle })
              add.textContent = 'Added'
              await loadMeetingActionItems()
            } catch (error) {
              add.disabled = false
              showSessionError(session, error)
            }
          })
          row.append(add)
          actionSection.append(row)
        })
      } else {
        actionSection.append(element('p', 'zoom-meeting-chat-empty', 'No action items found.'))
      }
      panelParts.aiMeetingResults.append(actionSection)
      panelParts.notesStatus.textContent = 'AI suggestions are ready. Review them before adding.'
      panelParts.notesStatus.classList.remove('is-error')
    } catch (error) {
      panelParts.notesStatus.textContent = error.message || 'Meeting notes could not be analyzed.'
      panelParts.notesStatus.classList.add('is-error')
    } finally {
      panelParts.aiMeetingButton.disabled = false
      panelParts.aiMeetingButton.textContent = '✨ Extract action items with AI'
    }
  })
  panelParts.notesForm.addEventListener('submit', saveMeetingNotes)
  panelParts.actionItemForm.addEventListener('submit', async event => {
    event.preventDefault()
    const content = panelParts.actionItemInput.value.trim()
    if (!content || session.actionItemSaving) return
    session.actionItemSaving = true
    panelParts.addActionItemButton.disabled = true
    try {
      const response = await api.post(meetingApiPath('/action-items'), { content })
      panelParts.actionItemInput.value = ''
      const items = await api.get(meetingApiPath('/action-items'))
      renderActionItems(items?.data?.actionItems || [response?.data?.actionItem].filter(Boolean))
    } catch (error) {
      showSessionError(session, error)
    } finally {
      session.actionItemSaving = false
      panelParts.addActionItemButton.disabled = false
    }
  })

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
          if (session.screenShareHeartbeatTimer) {
            window.clearInterval(session.screenShareHeartbeatTimer)
            session.screenShareHeartbeatTimer = null
          }
          void updateScreenShareLease(session, 'release').catch(error => {
            console.warn('Unable to release the screen-share lock:', error)
          })
          setScreenSharePresentation(session, null)
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
        if (session.screenShareHeartbeatTimer) {
          window.clearInterval(session.screenShareHeartbeatTimer)
          session.screenShareHeartbeatTimer = null
        }
        await updateScreenShareLease(session, 'release')
        setScreenSharePresentation(session, null)
      } else {
        await updateScreenShareLease(session, 'claim')
        const cameraWasOn = session.cameraOn
        session.shareLabel.textContent = 'You are sharing your screen'
        session.shareStage.hidden = false
        session.sharing = true
        session.cameraOn = false
        try {
          await session.meeting.startScreenShare()
          setScreenSharePresentation(session, {
            participantSessionId: session.localUserId,
            name: `${session.userName} (You)`,
            isLocal: true
          })
          session.screenShareHeartbeatTimer = window.setInterval(() => {
            void updateScreenShareLease(session, 'heartbeat').catch(async error => {
              console.warn('Screen-share lock heartbeat failed:', error)
              if (!session.closing && session.sharing) {
                try {
                  await session.meeting.stopVideo()
                } catch (stopError) {
                  console.warn('Unable to stop sharing after losing the lock:', stopError)
                }
                session.sharing = false
                session.screenShareHeartbeatTimer && window.clearInterval(session.screenShareHeartbeatTimer)
                session.screenShareHeartbeatTimer = null
                setScreenSharePresentation(session, null)
                showSessionError(session, new Error('The screen-share lock was lost. Screen sharing has stopped.'))
                session.syncMediaControls()
              }
            })
          }, 5000)
        } catch (error) {
          session.sharing = false
          session.cameraOn = cameraWasOn
          await updateScreenShareLease(session, 'release').catch(releaseError => {
            console.warn('Unable to release a canceled screen-share lock:', releaseError)
          })
          setScreenSharePresentation(session, null)
          throw error
        }
      }
      session.syncMediaControls()
      updateShareControl(session)
    } catch (error) {
      showSessionError(session, error)
    }
  })
  session.shareButton = shareButton
  session.cameraButton = cameraButton
  session.syncMediaControls = () => {
    updateShareControl(session)
    setControlState(cameraButton, !session.cameraOn,
      session.cameraOn ? 'Camera' : 'Camera off',
      session.cameraOn ? 'Turn off camera' : 'Turn on camera')
    updateParticipantMediaState(session, session.localUserId, {
      cameraOff: !session.cameraOn
    })
  }
  const peopleButton = createControl('people', 'People', () => togglePanel(panelParts.peopleTab))
  const chatButton = createControl('chat', 'Chat', () => {
    togglePanel(panelParts.chatTab)
    if (isMeetingChatOpen(session)) {
      session.unreadMessageCount = 0
      session.updateChatCount()
    }
  })
  const chatCountBadge = document.createElement('span')
  chatCountBadge.className = 'zoom-meeting-chat-count'
  chatCountBadge.hidden = true
  chatCountBadge.setAttribute('aria-hidden', 'true')
  chatButton.append(chatCountBadge)
  session.updateChatCount = () => {
    const count = session.unreadMessageCount
    chatCountBadge.hidden = count === 0
    chatCountBadge.textContent = count > 99 ? '99+' : String(count)
    const label = count ? `Chat, ${count} messages` : 'Chat'
    chatButton.setAttribute('aria-label', label)
    chatButton.title = label
  }
  const leaveButton = createControl('leave', session.canEndMeeting ? 'End meeting' : 'Leave', async () => {
    if (!session.canEndMeeting) {
      await closeSession(session)
      return
    }
    if (!window.confirm('End this meeting for everyone?')) return
    session.ending = true
    leaveButton.disabled = true
    try {
      const response = await api.post(meetingApiPath('/end'), {})
      meeting.endedAt = response?.data?.endedAt || new Date().toISOString()
      meeting.isEnded = true
      session.status.textContent = 'Meeting ended for everyone.'
      hub.renderCalendarPanel?.()
      hub.renderMeetingsPage?.()
      hub.renderAdminMeetingsTable?.()
      hub.renderWorkspaceHub?.()
      session.sharing = false
      if (session.screenShareHeartbeatTimer) {
        window.clearInterval(session.screenShareHeartbeatTimer)
        session.screenShareHeartbeatTimer = null
      }
      await closeSession(session)
    } catch (error) {
      session.ending = false
      leaveButton.disabled = false
      showSessionError(session, error)
    }
  }, session.canEndMeeting)
  session.leaveButton = leaveButton
  controls.append(micButton, cameraButton, shareButton, peopleButton, chatButton, leaveButton)
  const reactionButton = element('button', 'zoom-meeting-reaction-button', '😊')
  reactionButton.type = 'button'
  reactionButton.setAttribute('aria-label', 'Send a meeting reaction')
  reactionButton.title = 'Send a meeting reaction'
  const reactionPicker = element('div', 'zoom-meeting-reaction-picker')
  reactionPicker.hidden = true
  meetingReactions.forEach(reaction => {
    const option = element('button', '', reaction)
    option.type = 'button'
    option.setAttribute('aria-label', `Send ${reaction} reaction`)
    option.addEventListener('click', async () => {
      option.disabled = true
      try {
        const content = `[[collab-reaction:${reaction}]]`
        const response = await api.post(meetingApiPath('/messages'), { content })
        renderChatMessage(session, response?.data?.message || { content })
      } catch (error) {
        showSessionError(session, error)
      } finally {
        option.disabled = false
        reactionPicker.hidden = true
      }
    })
    reactionPicker.append(option)
  })
  reactionButton.addEventListener('click', () => {
    reactionPicker.hidden = !reactionPicker.hidden
  })
  reactionButton.disabled = true
  controls.append(reactionButton, reactionPicker)
  const meetingControls = [micButton, cameraButton, shareButton, peopleButton, chatButton, reactionButton]
  meetingControls.forEach(button => { button.disabled = true })
  panelParts.sendButton.disabled = true
  panelParts.peopleTab.addEventListener('click', () => togglePanel(panelParts.peopleTab))
  panelParts.notesTab.addEventListener('click', () => togglePanel(panelParts.notesTab))
  panelParts.actionsTab.addEventListener('click', () => togglePanel(panelParts.actionsTab))
  panelParts.chatTab.addEventListener('click', () => {
    togglePanel(panelParts.chatTab)
    if (isMeetingChatOpen(session)) {
      session.unreadMessageCount = 0
      session.updateChatCount()
    }
  })
  ;[
    panelParts.peopleTab,
    panelParts.chatTab,
    panelParts.notesTab,
    panelParts.actionsTab
  ].forEach(tab => { tab.disabled = true })
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
        const participantId = participant?.participantSessionId || participant?._id
        if (participantId) createVideoTile(session, participantId, participant.name)
        renderParticipants(session)
      }
      const onParticipantLeft = participant => {
        const participantId = participant?.participantSessionId || participant?._id
        const participantKey = String(participantId)
        const tile = session.tiles.get(participantKey)
        if (tile) {
          tile.video.pause()
          tile.audio.pause()
          tile.video.srcObject = null
          tile.audio.srcObject = null
          tile.tile.remove()
          session.tiles.delete(participantKey)
        }
        session.mediaStateByUserId.delete(participantKey)
        if (session.screenShareOwnerId === participantKey) {
          setScreenSharePresentation(session, null)
        }
        renderParticipants(session)
      }
      const onOnlineParticipants = participants => renderParticipants(session, participants)
      const onParticipantSharingStateUpdated = update => {
        if (!update?.participantSessionId) return
        updateParticipantMediaState(session, update.participantSessionId, {
          ...(typeof update.sharingAudio === 'boolean' ? { muted: !update.sharingAudio } : {}),
          ...(typeof update.sharingVideo === 'boolean' ? { cameraOff: !update.sharingVideo } : {}),
          ...(typeof update.sharingScreen === 'boolean' ? { sharingScreen: update.sharingScreen } : {})
        })
      }
      const onStateChanged = state => {
        if (state === 'network_connection_lost') {
          status.textContent = 'Connection interrupted. Reconnecting…'
        } else if (state === 'network_connection_restored' || state === 'reconnect_success') {
          status.textContent = 'Connection restored'
        }
      }
      const onMeetingEnded = () => {
        status.textContent = 'Meeting ended · Notes and action items are still available'
        meetingControls.forEach(button => { button.disabled = true })
        panelParts.sendButton.disabled = true
      }
      const onMeetingLeft = () => {
        if (session.closing) return
        status.textContent = 'You left the meeting · Notes and action items are still available'
        meetingControls.forEach(button => { button.disabled = true })
        panelParts.sendButton.disabled = true
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
      session.meetingInfo = meetingInfo
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
      reactionButton.disabled = false
      panelParts.sendButton.disabled = false
      ;[
        panelParts.peopleTab,
        panelParts.chatTab,
        panelParts.notesTab,
        panelParts.actionsTab
      ].forEach(tab => { tab.disabled = false })
      void syncMeetingChat(session).catch(error => {
        console.warn('Unable to load meeting chat messages:', error)
      })
      session.chatPollTimer = window.setInterval(() => {
        void syncMeetingChat(session).catch(error => {
          console.warn('Unable to refresh meeting chat messages:', error)
        })
      }, 8000)
      session.meetingInfoPollTimer = window.setInterval(() => {
        void pollMeetingLiveStatus(session)
      }, 5000)
      session.actionItemsPollTimer = window.setInterval(() => {
        if (!panelParts.panel.hidden && !panelParts.actionsPane.hidden &&
            !panelParts.actionsPane.contains(document.activeElement)) {
          void loadMeetingActionItems().catch(error => {
            console.warn('Unable to refresh meeting action items:', error)
          })
        }
      }, 30000)
      void pollMeetingLiveStatus(session)
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
