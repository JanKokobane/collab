import { activeView, currentUser, getAccessibleMembers, getAvatarSource, hub, make, projects, renderAvatarElement } from './state.js'
import { firebaseAuth } from '../../firebase.js'
import { api, apiBaseUrl } from './api.js'
import {
  clearCallInterface,
  renderCallInterface,
  renderCallParticipants
} from './messageCallUI.js?v=20261022-call-timer-answer'

const maxAttachmentBytes = 512 * 1024
const messagesBuildId = '20261026-collaboration-context'
const presenceHeartbeatMs = 25000
const incomingCallRingDurationMs = 45000
const callSocketConnectTimeoutMs = 15000
const callMediaRequestTimeoutMs = 30000
const reactionChoices = ['👍', '❤️', '😂', '🎉', '👀', '🙌', '🔥', '✅', '🤔', '😄']
let messageState = { conversations: [], messages: [] }
let selectedConversationId = null
let pendingFiles = []
let replyTargetId = null
let editingMessageId = null
let messagesInitialized = false
let refreshPromise = null
let subscriptionsUid = null
let realtimeSocket = null
let realtimeSocketPromise = null
let realtimeSocketUid = null
const conversationMessageSubscriptions = new Map()
const conversationCallHistory = new Map()
const messageCursors = new Map()
const messageHasMore = new Map()
const loadingOlderMessages = new Set()
const joinedConversationIds = new Set()
const memberPresence = new Map()
let presenceWriteUid = null
let presenceHeartbeatTimer = null
let incomingCall = null
let activeCall = null
let incomingCallTimer = null
let callRingtoneContext = null
let callRingtoneTimer = null
let incomingRingtone = null
const callRingtoneOscillators = new Set()
let callStartInFlight = false
let callStartSequence = 0
let callStarting = null
let callError = null
let acceptingCallId = null
const pendingCallUpdates = new Map()
const pendingCallSignals = new Map()
let mediaRecorder = null
let mediaStream = null
let voiceRecordingChunks = []
let voiceRecordingTimer = null
let voiceRecordingFrame = null
let voiceRecordingAudioContext = null
let voiceRecordingSource = null
let voiceRecordingAnalyser = null
let voiceRecordingSamples = []
let voiceRecordingSampledAt = 0
let voiceRecordingStartedAt = 0
let voiceRecordingElapsedMs = 0
let voiceRecordingConversationId = null
let cancelVoiceRecordingOnStop = false
let voiceRecordingShouldSend = false
let voiceRecordingStarting = false
let activeVoiceNoteAudio = null
let voiceNoteAudioContext = null
const voiceNoteGainNodes = new WeakMap()

const currentEmail = () => currentUser.email?.trim().toLowerCase() || firebaseAuth.currentUser?.email?.trim().toLowerCase() || ''
const currentUid = () => firebaseAuth.currentUser?.uid || ''
const apiPath = conversationId => `/messages/conversations/${encodeURIComponent(conversationId)}`
const getMemberProfileImage = uid =>
  getAccessibleMembers().find(member => member.firebaseUid === uid)?.profileImage || ''
const normalizeCallParticipants = participants => (participants || []).map(participant => ({
  ...participant,
  profile_image: getMemberProfileImage(participant.firebase_uid)
}))

function getElements() {
  return {
    list: document.querySelector('#messages-conversation-list'),
    people: document.querySelector('#messages-people-list'),
    header: document.querySelector('#messages-thread-header'),
    feed: document.querySelector('#messages-feed'),
    error: document.querySelector('#messages-error'),
    input: document.querySelector('#messages-input'),
    send: document.querySelector('.messages-send-button'),
    attachmentList: document.querySelector('#messages-attachment-list'),
    emojiPicker: document.querySelector('#messages-emoji-picker'),
    composeField: document.querySelector('.messages-compose-field'),
    callRoot: document.querySelector('#messages-call-root'),
    voiceRecord: document.querySelector('#messages-voice-record'),
    voiceStatus: document.querySelector('#messages-voice-recording-status'),
    voiceCancel: document.querySelector('#messages-voice-cancel'),
    voicePause: document.querySelector('#messages-voice-pause'),
    voiceSend: document.querySelector('#messages-voice-send'),
    recordingPanel: document.querySelector('#messages-recording-panel'),
    recordingWaveform: document.querySelector('#messages-recording-waveform'),
    composer: document.querySelector('#messages-composer')
  }
}

function createVoiceRecordIcon(isRecording = false) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '19')
  svg.setAttribute('height', '19')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.8')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  const paths = isRecording
    ? ['M8 8h8v8H8z']
    : ['M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z', 'M19 10v1a7 7 0 0 1-14 0v-1', 'M12 18v4', 'M8 22h8']
  paths.forEach(pathData => {
    const path = document.createElementNS(svg.namespaceURI, 'path')
    path.setAttribute('d', pathData)
    svg.append(path)
  })
  return svg
}

function getLatestMessagePreview(body, attachments = []) {
  if (body) return body
  return attachments.some(attachment => attachment.is_voice_note || attachment.isVoiceNote)
    ? 'Voice message'
    : ''
}

function showError(error, operation = 'message operation') {
  console.error(`[messages] ${operation} failed`, {
    name: error?.name || 'Error',
    code: error?.code || null,
    status: error?.status || null,
    message: error?.message || String(error)
  })
  const element = getElements().error
  if (!element) return
  element.textContent = error instanceof Error ? error.message : 'The message could not be completed.'
  element.hidden = false
}

function showCallError(error, operation, context = {}) {
  const diagnosticId = `CALL-${crypto.randomUUID()}`
  const message = error?.message || 'The call could not be completed. Please try again.'
  console.error(`[messages] Call failure ${diagnosticId}`, {
    operation,
    ...context,
    errorName: error?.name || 'Error',
    code: error?.code || error?.payload?.code || null,
    status: error?.status ?? null,
    message,
    serverMessage: error?.payload?.message || null,
    stack: error?.stack || null
  })
  const errorElement = getElements().error
  if (errorElement) {
    errorElement.textContent = `${message} (Reference: ${diagnosticId})`
    errorElement.hidden = false
  }
  return { diagnosticId, message }
}

function logMessageApiFailure(operation, error, context = {}) {
  console.error(`[messages] ${operation} failed.`, {
    operation,
    code: error?.code || null,
    name: error?.name || 'Error',
    message: error?.message || String(error),
    uid: currentUid() || null,
    ...context
  })
}

function clearError() {
  const element = getElements().error
  if (!element) return
  element.hidden = true
  element.textContent = ''
}

function setSendButtonMode(isSaving = Boolean(editingMessageId)) {
  const send = getElements().send
  if (!send) return
  const icon = send.querySelector('svg')
  const label = send.querySelector('.messages-send-label')
  if (!icon || !label) return
  icon.hidden = isSaving
  label.hidden = !isSaving
  label.textContent = isSaving ? 'Save' : 'Send'
  send.classList.toggle('is-saving', isSaving)
  send.setAttribute('aria-label', isSaving ? 'Save edited message' : 'Send message')
}

function normalizeConversation(row) {
  const members = Array.isArray(row.members) ? row.members : []
  const memberUids = Array.isArray(row.member_uids || row.memberUids)
    ? [...new Set((row.member_uids || row.memberUids)
      .filter(uid => typeof uid === 'string' && uid.trim())
      .map(uid => uid.trim()))]
    : [...new Set(members
      .map(member => typeof member === 'string'
        ? ''
        : member.firebaseUid || member.firebase_uid || member.uid || '')
      .filter(uid => typeof uid === 'string' && uid.trim())
      .map(uid => uid.trim()))]
  return {
    ...row,
    id: row.conversation_id || row.id,
    type: row.conversation_type || row.type,
    projectId: row.project_id || row.projectId,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
    members: members.map(member => typeof member === 'string' ? member.toLowerCase() : member.email?.toLowerCase()).filter(Boolean),
    memberUids: memberUids.sort(),
    participants: members.map(member => typeof member === 'string'
      ? { email: member.toLowerCase(), name: member }
      : {
        ...member,
        firebaseUid: member.firebaseUid || member.firebase_uid || member.uid || null,
        email: member.email?.toLowerCase(),
        lastSeenAt: member.lastSeenAt || member.last_seen_at || null
      }),
    unreadCount: Number(row.unread_count ?? row.unreadCount ?? 0),
    latestMessage: row.latest_message_body ?? row.latestMessage ?? '',
    latestMessageCreatedAt: row.latest_message_created_at ?? row.latestMessageCreatedAt
  }
}

function normalizeMessage(row) {
  return {
    ...row,
    id: row.message_id || row.id,
    conversationId: row.conversation_id || row.conversationId,
    clientMessageId: row.clientMessageId || row.client_message_id || null,
    senderUid: row.sender_firebase_uid || row.senderUid,
    senderEmail: (row.sender_email || row.senderEmail || '').toLowerCase(),
    senderName: row.sender_name || row.senderName || 'Project member',
    replyToId: row.reply_to_message_id || row.replyToId || null,
    replyToBody: row.reply_to_body ?? row.replyToBody ?? null,
    replyToSenderName: row.reply_to_sender_name ?? row.replyToSenderName ?? null,
    forwardedFrom: row.forwarded_from ?? row.forwardedFrom ?? null,
    pinned: row.is_pinned ?? row.pinned ?? false,
    isDecision: row.is_decision ?? row.isDecision ?? false,
    linkedTaskId: row.linked_task_id || row.linkedTaskId || null,
    linkedTaskTitle: row.linked_task_title || row.linkedTaskTitle || '',
    linkedTaskProjectId: row.linked_task_project_id || row.linkedTaskProjectId || null,
    isDeleted: Boolean(row.is_deleted ?? row.isDeleted),
    editedAt: row.edited_at ?? row.editedAt ?? null,
    createdAt: row.created_at || row.createdAt,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    reactions: Array.isArray(row.reactions) ? row.reactions : [],
    readAt: row.read_at || row.readAt || null
  }
}

function getContacts(projectId = null) {
  const members = getAccessibleMembers()
  const permittedUids = projectId
    ? new Set(getProjectMembers(projects.find(project => project.projectId === projectId) || {}).map(member => member.firebaseUid))
    : null
  return members.filter(member => {
    const email = member.email?.trim().toLowerCase()
    return email && member.firebaseUid !== currentUid() && email !== currentEmail() &&
      (!permittedUids || permittedUids.has(member.firebaseUid))
  }).map(member => ({ ...member, email: member.email.toLowerCase(), profileImage: getAvatarSource(member) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function getProjectMembers(project) {
  const all = [
    {
      firebaseUid: project.creatorFirebaseUid,
      email: project.creatorEmail,
      name: project.creatorName,
      initials: project.creatorInitials,
      tone: project.creatorTone
    },
    ...(project.acceptedMembers || [])
  ]
  return [...new Map(all.filter(member => member.firebaseUid && member.email)
    .map(member => [member.firebaseUid, member])).values()]
}

function findSharedProjectWithMember(firebaseUid) {
  return projects.find(project => {
    const members = getProjectMembers(project)
    return members.some(member => member.firebaseUid === currentUid()) &&
      members.some(member => member.firebaseUid === firebaseUid)
  })
}

function getContact(email) {
  return getAccessibleMembers().find(member => member.email?.trim().toLowerCase() === email?.toLowerCase())
}

function getConversationTitle(conversation) {
  if (conversation.type === 'channel') return conversation.name
  const others = (conversation.participants || []).filter(member => member.firebaseUid !== currentUid() && member.email !== currentEmail())
  if (conversation.type === 'group') {
    return conversation.name || others.map(member => member.name || member.email).join(', ') || 'Group conversation'
  }
  return others[0]?.name || others[0]?.email || 'Direct message'
}

function getConversationMessages(conversationId) {
  return messageState.messages.filter(message => message.conversationId === conversationId)
}

function getConversationTimeline(conversationId) {
  const messages = getConversationMessages(conversationId)
  const calls = (conversationCallHistory.get(conversationId) || [])
    .filter(call => ['missed', 'declined', 'ended'].includes(call.status))
  return [...messages, ...calls].sort((a, b) =>
    Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id))
}

function upsertCallHistory(call, shouldRender = true) {
  if (!call?.call_id || !call.conversation_id) return
  const current = conversationCallHistory.get(call.conversation_id) || []
  const normalized = {
    ...call,
    id: `call:${call.call_id}`,
    callId: call.call_id,
    conversationId: call.conversation_id,
    createdAt: call.created_at || call.createdAt,
    callType: call.call_type || call.callType,
    callerUid: call.caller_uid || call.callerUid,
    callerName: call.caller_name || call.callerName,
    calleeUid: call.callee_uid || call.calleeUid,
    calleeName: call.callee_name || call.calleeName,
    endedByUid: call.ended_by_uid || call.endedByUid
  }
  const index = current.findIndex(item => item.callId === normalized.callId)
  if (index < 0) current.push(normalized)
  else current[index] = { ...current[index], ...normalized }
  current.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
  conversationCallHistory.set(call.conversation_id, current)
  if (shouldRender && selectedConversationId === call.conversation_id && activeView === 'Messages') {
    renderMessages()
  }
}

function replaceConversations(conversations) {
  const existingById = new Map(messageState.conversations.map(item => [item.id, item]))
  messageState.conversations = conversations.map(conversation => {
    const existing = existingById.get(conversation.id)
    if (!existing) return conversation
    Object.assign(existing, conversation)
    return existing
  })
}

function upsertMessage(message) {
  const normalized = normalizeMessage(message)
  let currentIndex = messageState.messages.findIndex(item => item.id === normalized.id)
  if (currentIndex < 0 && normalized.clientMessageId) {
    currentIndex = messageState.messages.findIndex(
      item => item.clientMessageId === normalized.clientMessageId
    )
  }
  const changed = currentIndex < 0 ||
    JSON.stringify(messageState.messages[currentIndex]) !== JSON.stringify(normalized)
  if (currentIndex < 0) messageState.messages.push(normalized)
  else messageState.messages[currentIndex] = normalized
  messageState.messages.sort((a, b) =>
    Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id))
  return { message: normalized, changed }
}

function renderDirectMessagePresence(conversation, element) {
  const otherMember = (conversation.participants || []).find(member =>
    member.firebaseUid !== currentUid() && member.email !== currentEmail()
  )
  if (!otherMember) {
    element.textContent = 'Last seen unavailable'
    element.classList.add('messages-presence-offline')
    return
  }

  const presence = otherMember.firebaseUid
    ? memberPresence.get(otherMember.firebaseUid)
    : null
  const lastSeenAt = presence?.lastSeenAt || otherMember.lastSeenAt
  const online = Boolean(presence?.isOnline)
  element.replaceChildren()
  element.classList.toggle('messages-presence-online', online)
  element.classList.toggle('messages-presence-offline', !online)

  if (online) {
    const dot = make('span', 'messages-presence-dot')
    dot.setAttribute('aria-hidden', 'true')
    element.append(dot, document.createTextNode('Online'))
    return
  }

  const parsedLastSeen = lastSeenAt ? new Date(lastSeenAt) : null
  const lastSeenText = parsedLastSeen && !Number.isNaN(parsedLastSeen.getTime())
    ? new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(parsedLastSeen)
    : 'unavailable'
  element.textContent = `Last seen ${lastSeenText}`
}

function updateMessagesNavigationBadge() {
  const unreadCount = messageState.conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0)
  const badge = document.querySelector('#messages-nav-badge')
  if (!badge) return
  badge.hidden = unreadCount === 0
  badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount)
  badge.setAttribute('aria-label', `${unreadCount} unread message${unreadCount === 1 ? '' : 's'}`)
}

function renderPeopleList() {
  const { people } = getElements()
  if (!people) return
  people.replaceChildren()
  const self = {
    email: currentEmail(),
    name: currentUser.name,
    initials: currentUser.initials,
    tone: currentUser.tone || 'teal',
    profileImage: getAvatarSource(currentUser)
  }
  const directUnreadFor = email => messageState.conversations
    .filter(conversation => conversation.type === 'direct' && conversation.members.includes(email))
    .reduce((sum, conversation) => sum + conversation.unreadCount, 0)
  people.append(createPersonRow(self, 0, true))
  const contacts = getContacts()
  if (!contacts.length) {
    people.append(make('p', 'messages-list-empty', 'No invited teammates yet. Invite people to a project to message them here.'))
    return
  }
  contacts.forEach(contact => people.append(createPersonRow(contact, directUnreadFor(contact.email))))
}

function createPersonRow(contact, count, isSelf = false) {
  const button = make('button', 'messages-person')
  button.type = 'button'
  button.disabled = isSelf
  if (isSelf) button.classList.add('messages-person-self')
  const avatar = make('span', `messages-person-avatar ${contact.tone || 'teal'}-bg`)
  renderAvatarElement(avatar, contact, `messages-person-avatar ${contact.tone || 'teal'}-bg`)
  const details = make('span', 'messages-person-details')
  details.append(make('strong', '', isSelf ? `${contact.name} (You)` : contact.name), make('small', '', contact.email))
  button.append(avatar, details)
  if (count) button.append(make('span', 'messages-person-message-count', count > 99 ? '99+' : String(count)))
  if (!isSelf) button.addEventListener('click', () => openDirectConversation(contact))
  return button
}

function renderConversationList() {
  const { list } = getElements()
  if (!list) return
  list.replaceChildren()
  if (!messageState.conversations.length) {
    list.append(make('p', 'messages-list-empty', 'No conversations yet. Create a channel or start a message.'))
    return
  }
  const sections = [
    { type: 'channel', label: 'Channels' },
    { type: 'direct', label: 'Direct messages' },
    { type: 'group', label: 'Group conversations' }
  ]
  sections.forEach(section => {
    const conversations = messageState.conversations.filter(item => item.type === section.type)
    if (!conversations.length) return
    list.append(make('h3', 'messages-list-heading', section.label))
    conversations.forEach(conversation => {
      const button = make('button', `messages-conversation${conversation.id === selectedConversationId ? ' active' : ''}${conversation.unreadCount ? ' has-unread' : ''}`)
      button.type = 'button'
      const prefix = conversation.type === 'channel' ? '# ' : conversation.type === 'group' ? '◉ ' : ''
      const titleRow = make('span', 'messages-conversation-title-row')
      titleRow.append(make('strong', 'messages-conversation-name', `${prefix}${getConversationTitle(conversation)}`))
      if (conversation.unreadCount) {
        const badge = make('span', 'messages-unread-count', conversation.unreadCount > 99 ? '99+' : String(conversation.unreadCount))
        badge.setAttribute('aria-label', `${conversation.unreadCount} unread messages`)
        titleRow.append(badge)
      }
      button.append(titleRow, make('span', 'messages-conversation-preview', conversation.latestMessage || section.label))
      button.addEventListener('click', () => selectConversation(conversation.id))
      list.append(button)
    })
  })
}

function unsubscribeConversation(conversationId) {
  conversationMessageSubscriptions.get(conversationId)?.()
  conversationMessageSubscriptions.delete(conversationId)
  realtimeSocket?.emit('conversation:leave', conversationId)
  joinedConversationIds.delete(conversationId)
  messageCursors.delete(conversationId)
  messageHasMore.delete(conversationId)
  conversationCallHistory.delete(conversationId)
}

function getCallRingtoneContext() {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext
  if (!AudioContextConstructor) return null
  if (!callRingtoneContext) {
    try {
      callRingtoneContext = new AudioContextConstructor()
    } catch (error) {
      console.warn('[messages] Incoming-call sound is not supported.', error.message)
      return null
    }
  }
  return callRingtoneContext
}

function shouldPlayCallTone() {
  return Boolean(incomingCall || (activeCall?.isCaller && activeCall.status === 'ringing'))
}

function playCallRingtoneTone() {
  const context = callRingtoneContext
  if (!shouldPlayCallTone() || acceptingCallId || !context || context.state !== 'running') return
  const patternStart = context.currentTime
  ;[0, 0.68].forEach(offset => {
    ;[440, 480].forEach(frequency => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const startAt = patternStart + offset
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, startAt)
      gain.gain.setValueAtTime(0, startAt)
      gain.gain.linearRampToValueAtTime(0.18, startAt + 0.035)
      gain.gain.setValueAtTime(0.18, startAt + 0.38)
      gain.gain.linearRampToValueAtTime(0, startAt + 0.44)
      oscillator.connect(gain)
      gain.connect(context.destination)
      callRingtoneOscillators.add(oscillator)
      oscillator.addEventListener('ended', () => {
        callRingtoneOscillators.delete(oscillator)
        oscillator.disconnect()
        gain.disconnect()
      }, { once: true })
      oscillator.start(startAt)
      oscillator.stop(startAt + 0.46)
    })
  })
}

function playIncomingCallRingtone() {
  if (!incomingCall || acceptingCallId) return
  if (!incomingRingtone) {
    incomingRingtone = new Audio(new URL('../../images/microsoft_ringtone.mp3', import.meta.url))
    incomingRingtone.loop = true
    incomingRingtone.preload = 'auto'
  }
  incomingRingtone.volume = 1
  if (incomingRingtone.paused) {
    incomingRingtone.play().catch(error => {
      console.warn('[messages] Incoming ringtone awaits a user gesture.', error.message)
    })
  }
}

function startCallRingtone() {
  if (!shouldPlayCallTone() || acceptingCallId || callRingtoneTimer !== null) return
  if (incomingCall) {
    playIncomingCallRingtone()
    return
  }
  const context = getCallRingtoneContext()
  if (!context) return
  playCallRingtoneTone()
  callRingtoneTimer = setInterval(() => {
    if (shouldPlayCallTone()) playCallRingtoneTone()
    else stopCallRingtone()
  }, 3200)
}

function stopCallRingtone() {
  if (incomingRingtone) {
    incomingRingtone.pause()
    incomingRingtone.currentTime = 0
  }
  if (callRingtoneTimer !== null) {
    clearInterval(callRingtoneTimer)
    callRingtoneTimer = null
  }
  callRingtoneOscillators.forEach(oscillator => {
    try {
      oscillator.stop()
    } catch {}
  })
}

function unlockCallRingtone() {
  if (incomingCall) {
    playIncomingCallRingtone()
    return
  }
  const context = getCallRingtoneContext()
  if (!context || context.state !== 'suspended') return
  context.resume().then(() => {
    if (shouldPlayCallTone()) playCallRingtoneTone()
  }).catch(error => {
    console.warn('[messages] Incoming-call sound is unavailable until audio is enabled.', error.message)
  })
}

function handleCallUpdate(call) {
  const uid = currentUid()
  if (!call || (call.caller_uid !== uid && call.callee_uid !== uid)) return
  if (['missed', 'declined', 'ended'].includes(call.status)) upsertCallHistory(call)
  if (!activeCall && !incomingCall && call.callee_uid === uid &&
    call.status === 'ringing') {
    if (mediaRecorder) cancelVoiceRecording()
    incomingCall = {
      ...call,
      caller_profile_image: getMemberProfileImage(call.caller_uid)
    }
    startCallRingtone()
    clearTimeout(incomingCallTimer)
    incomingCallTimer = setTimeout(() => {
      if (incomingCall?.call_id === call.call_id) {
        incomingCall = null
        stopCallRingtone()
        renderCallOverlay()
        refreshCallHistory(call.conversation_id).catch(error =>
          showError(error, `refresh missed call history for ${call.conversation_id}`)
        )
      }
    }, incomingCallRingDurationMs)
    renderCallOverlay()
  } else if (incomingCall?.call_id === call.call_id && call.status !== 'ringing') {
    incomingCall = null
    stopCallRingtone()
    clearTimeout(incomingCallTimer)
    incomingCallTimer = null
    renderCallOverlay()
  }
  if (activeCall?.callId === call.call_id) {
    if (call.status === 'accepted') {
      activeCall.status = 'accepted'
      startCallDuration(activeCall)
      stopCallRingtone()
      clearTimeout(activeCall.ringingTimer)
      setActiveCallStatus(`${activeCall.callType === 'video' ? 'Video' : 'Voice'} · Connecting…`)
    } else if (['declined', 'missed', 'ended'].includes(call.status)) {
      finishActiveCall(false)
    }
  } else if (callStartInFlight && call.caller_uid === uid) {
    pendingCallUpdates.set(call.call_id, call)
  }
}

function setActiveCallStatus(text) {
  if (!activeCall) return
  const status = activeCall.overlay?.querySelector('.collab-call-status')
  if (status) status.textContent = text
  const placeholderStatus = activeCall.videoPlaceholder?.querySelector('span')
  if (placeholderStatus) {
    placeholderStatus.textContent = activeCall.status === 'ringing' ? 'Ringing…' : 'Connecting video…'
  }
}

function updateCallDuration(call) {
  if (!call?.connectedAt) return
  const totalSeconds = Math.floor((Date.now() - call.connectedAt) / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const duration = hours
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  const timer = call.overlay?.querySelector('.collab-call-duration')
  if (timer) {
    timer.hidden = false
    timer.textContent = duration
    timer.dateTime = `PT${hours ? `${hours}H` : ''}${minutes}M${seconds}S`
  }
}

function startCallDuration(call) {
  if (call.connectedAt) return
  call.connectedAt = Date.now()
  updateCallDuration(call)
  call.durationTimer = setInterval(() => updateCallDuration(call), 1000)
}

function waitForRealtimeConnection(socket) {
  if (socket?.connected) return Promise.resolve()
  if (!socket) return Promise.reject(new Error('Call signaling could not be initialized.'))
  return new Promise((resolve, reject) => {
    let lastError = null
    const cleanup = () => {
      clearTimeout(timeout)
      socket.off('connect', onConnect)
      socket.off('connect_error', onConnectError)
    }
    const onConnect = () => {
      cleanup()
      resolve()
    }
    const onConnectError = error => {
      lastError = error
    }
    const timeout = setTimeout(() => {
      cleanup()
      const detail = lastError?.message ? ` (${lastError.message})` : ''
      reject(new Error(`Call signaling did not connect within 15 seconds${detail}. Check the backend Socket.IO connection and try again.`))
    }, callSocketConnectTimeoutMs)
    socket.on('connect', onConnect)
    socket.on('connect_error', onConnectError)
    if (socket.connected) onConnect()
  })
}

function requestCallMedia(callType) {
  return new Promise((resolve, reject) => {
    let settled = false
    const timeout = setTimeout(() => {
      settled = true
      reject(new Error('Microphone or camera permission is taking too long. Allow access in your browser, then try again.'))
    }, callMediaRequestTimeoutMs)

    navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'video'
    }).then(stream => {
      clearTimeout(timeout)
      if (settled) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      settled = true
      resolve(stream)
    }, error => {
      clearTimeout(timeout)
      if (settled) return
      settled = true
      reject(error)
    })
  })
}

async function ensureRealtimeSocket() {
  const user = firebaseAuth.currentUser
  if (!user) return null
  if (realtimeSocket && realtimeSocketUid === user.uid) return realtimeSocket
  if (realtimeSocketPromise) return realtimeSocketPromise
  realtimeSocketPromise = (async () => {
    if (!window.io) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = `${apiBaseUrl}/socket.io/socket.io.js`
        script.async = true
        script.onload = () => window.io
          ? resolve()
          : reject(new Error('The realtime messaging client could not be loaded.'))
        script.onerror = () => reject(new Error('The realtime messaging client could not be loaded.'))
        document.head.append(script)
      })
    }
    const token = await user.getIdToken()
    if (firebaseAuth.currentUser?.uid !== user.uid) return null
    realtimeSocket?.disconnect()
    realtimeSocketUid = user.uid
    const socket = window.io(apiBaseUrl, {
      auth: { token },
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      transports: ['websocket', 'polling'],
      tryAllTransports: true
    })
    realtimeSocket = socket
    socket.on('connect', () => {
      joinedConversationIds.clear()
      messageState.conversations.forEach(conversation => {
        subscribeToConversationMessages(conversation)
        joinConversationRoom(conversation)
      })
      if (activeCall) {
        setActiveCallStatus(`${activeCall.callType === 'video' ? 'Video' : 'Voice'} · ${
          activeCall.status === 'accepted' ? 'Connecting…' : 'Calling…'
        }`)
        joinCallRoom(activeCall)
          .then(async () => {
            await syncCallPeers(activeCall, activeCall.participants)
            await applyPendingCallSignals(activeCall)
          })
          .catch(error => failActiveCall(error, 'rejoin active call'))
      }
    })
    socket.on('disconnect', () => {
      joinedConversationIds.clear()
      if (activeCall) {
        activeCall.callRoomJoined = false
        setActiveCallStatus('Signaling disconnected · reconnecting…')
      }
    })
    let refreshedRealtimeAuth = false
    socket.on('connect_error', async error => {
      console.error('[messages] Authenticated message realtime connection failed.', {
        message: error?.message || String(error),
        type: error?.type || null,
        description: error?.description || null,
        context: error?.context?.message || null,
        transport: socket.io?.engine?.transport?.name || null,
        uid: user.uid
      })
      if (activeCall) setActiveCallStatus('Signaling unavailable · reconnecting…')
      if (!refreshedRealtimeAuth && /authentication/i.test(error?.message || '') &&
        firebaseAuth.currentUser?.uid === user.uid) {
        try {
          refreshedRealtimeAuth = true
          socket.auth = { token: await user.getIdToken(true) }
          socket.connect()
          return
        } catch (refreshError) {
          showError(refreshError, 'refresh realtime authentication')
          return
        }
      }
      showError(error, 'connect to realtime messaging')
    })
    socket.on('connect', () => { refreshedRealtimeAuth = false })
    socket.on('presence:updated', presence => {
      if (!presence?.firebase_uid) return
      memberPresence.set(presence.firebase_uid, {
        isOnline: Boolean(presence.is_online),
        lastSeenAt: presence.last_seen_at || null
      })
      if (activeView === 'Messages') renderMessagesView()
    })
    socket.on('call:updated', ({ call } = {}) => {
      if (!call) return
      console.info('[messages] Realtime call update received.', {
        callId: call.call_id || null,
        conversationId: call.conversation_id || null,
        callType: call.call_type || null,
        status: call.status || null
      })
      handleCallUpdate(call)
    })
    socket.on('call:participant-updated', update => {
      updateCallParticipants(update)
    })
    socket.on('call:signal', packet => {
      handleCallSignal(packet).catch(error => {
        console.error('[messages] WebRTC call signaling failed.', {
          callId: packet?.call_id || null,
          message: error?.message || String(error)
        })
        if (activeCall?.callId === packet?.call_id) {
          failActiveCall(error, 'connect the call')
        }
      })
    })
    socket.on('conversation:created', () => refreshFromServer())
    socket.on('conversations:refresh', () => refreshFromServer())
    socket.on('conversation:removed', ({ conversation_id: conversationId } = {}) => {
      if (!conversationId) return
      unsubscribeConversation(conversationId)
      messageState.conversations = messageState.conversations.filter(item => item.id !== conversationId)
      if (selectedConversationId === conversationId) {
        selectedConversationId = messageState.conversations[0]?.id || null
        messageState.messages = []
        if (selectedConversationId) loadConversationMessages(selectedConversationId)
      }
      updateMessagesNavigationBadge()
      renderMessages()
    })
    socket.on('conversation:cleared', ({ conversation_id: conversationId } = {}) => {
      if (conversationId) conversationCallHistory.set(conversationId, [])
      if (conversationId && selectedConversationId === conversationId) {
        loadConversationMessages(conversationId)
      }
    })
    socket.connect()
    return socket
  })().finally(() => {
    realtimeSocketPromise = null
  })
  return realtimeSocketPromise
}

function subscribeToConversationMessages(conversation) {
  if (!realtimeSocket || conversationMessageSubscriptions.has(conversation.id)) return
  const uid = currentUid()
  const onCreated = ({ message } = {}) => {
    if (message?.conversation_id !== conversation.id) return
    const saved = upsertMessage(message)
    const activeConversation = messageState.conversations.find(item => item.id === conversation.id)
    if (activeConversation) {
      activeConversation.latestMessage = getLatestMessagePreview(message.body, message.attachments)
      activeConversation.latestMessageCreatedAt = message.created_at
      if (message.sender_firebase_uid !== uid && selectedConversationId !== conversation.id) {
        activeConversation.unreadCount += 1
      }
    }
    if (selectedConversationId === conversation.id) {
      if (saved.changed) renderMessages()
      if (message.sender_firebase_uid !== uid) {
        api.post(`${apiPath(conversation.id)}/read`, {})
          .catch(error => showError(error, `mark conversation ${conversation.id} as read`))
      }
    }
    updateMessagesNavigationBadge()
    if (activeView === 'Messages') renderMessages()
  }
  const onUpdated = ({ message } = {}) => {
    if (message?.conversation_id !== conversation.id) return
    upsertMessage(message)
    if (selectedConversationId === conversation.id) renderMessages()
  }
  const onDeleted = ({ conversation_id: id, message_id: messageId, scope, hidden_for_uid: hiddenUid } = {}) => {
    if (id !== conversation.id || !messageId) return
    if (scope === 'me') {
      if (hiddenUid === uid) {
        messageState.messages = messageState.messages.filter(message => message.id !== messageId)
      }
    } else {
      messageState.messages = messageState.messages.map(message =>
        message.id === messageId
          ? { ...message, body: 'This message was deleted', attachments: [], forwardedFrom: null, isDeleted: true }
          : message
      )
    }
    if (selectedConversationId === conversation.id) renderMessages()
  }
  const onRead = ({ conversation_id: id, firebase_uid: readerUid, read_at: readAt } = {}) => {
    if (id !== conversation.id || readerUid === uid) return
    messageState.messages = messageState.messages.map(message =>
      message.senderUid === uid ? { ...message, readAt: message.readAt || readAt } : message
    )
    if (selectedConversationId === conversation.id) renderMessages()
  }
  const onDelivered = ({ conversation_id: id, firebase_uid: recipientUid, message_ids: messageIds = [] } = {}) => {
    if (id !== conversation.id || recipientUid === uid) return
    const delivered = new Set(messageIds)
    messageState.messages = messageState.messages.map(message =>
      delivered.has(message.id) ? { ...message, deliveredAt: message.deliveredAt || new Date().toISOString() } : message
    )
    if (selectedConversationId === conversation.id) renderMessages()
  }
  realtimeSocket.on('message:created', onCreated)
  realtimeSocket.on('message:updated', onUpdated)
  realtimeSocket.on('message:deleted', onDeleted)
  realtimeSocket.on('message:read', onRead)
  realtimeSocket.on('message:delivered', onDelivered)
  conversationMessageSubscriptions.set(conversation.id, () => {
    realtimeSocket?.off('message:created', onCreated)
    realtimeSocket?.off('message:updated', onUpdated)
    realtimeSocket?.off('message:deleted', onDeleted)
    realtimeSocket?.off('message:read', onRead)
    realtimeSocket?.off('message:delivered', onDelivered)
  })
  if (realtimeSocket.connected) joinConversationRoom(conversation)
}

function joinConversationRoom(conversation) {
  if (!realtimeSocket || joinedConversationIds.has(conversation.id)) return
  joinedConversationIds.add(conversation.id)
  realtimeSocket.emit('conversation:join', conversation.id, result => {
    if (!result?.success) {
      joinedConversationIds.delete(conversation.id)
      const error = new Error(result?.message || 'Conversation access was denied.')
      logMessageApiFailure('realtime conversation join', error, {
        conversationId: conversation.id, uid: currentUid()
      })
      showError(error, `join conversation ${conversation.id}`)
      return
    }
    result.activeCalls?.forEach(handleCallUpdate)
  })
}

function renderCallOverlay() {
  const { callRoot } = getElements()
  if (!callRoot) return
  if (activeCall?.overlay?.isConnected) return
  const view = renderCallInterface(callRoot, {
    activeCall,
    incomingCall,
    startingCall: null,
    callError
  }, {
    onHangUp: () => finishActiveCall(true),
    onAccept: () => acceptIncomingCall(),
    onDecline: () => declineIncomingCall(),
    onAddPeople: () => openCallInviteModal(activeCall),
    onCancelSetup: cancelCallSetup,
    onDismissError: dismissCallError
  })
  if (activeCall && view) {
    const call = activeCall
    call.overlay = view.overlay
    call.participantGrid = view.participantGrid
    call.renderParticipants = () =>
      renderCallParticipants(call.participantGrid, call, currentUid())
    call.renderParticipants()
  } else if (incomingCall && view) {
    incomingCall.overlay = view.overlay
  }
}

function cancelCallSetup() {
  callStartSequence += 1
  callStarting = null
  callError = null
  renderCallOverlay()
}

function dismissCallError() {
  callError = null
  renderCallOverlay()
}

function joinCallRoom(call) {
  if (!realtimeSocket?.connected) {
    return Promise.reject(new Error('Realtime call signaling is not connected.'))
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Joining the call room timed out.')), 10_000)
    realtimeSocket.emit('call:join', call.callId, result => {
      clearTimeout(timeout)
      if (!result?.success) {
        reject(new Error(result?.message || 'You could not join this call.'))
        return
      }
      call.conversationId = result.conversationId || call.conversationId
      call.iceServers = result.iceServers || call.iceServers || []
      call.participants = normalizeCallParticipants(result.participants || call.participants)
      call.callRoomJoined = true
      resolve()
    })
  })
}

function createCallPeerConnection(call, peerUid) {
  if (!call.peerConnections) call.peerConnections = new Map()
  const existing = call.peerConnections.get(peerUid)
  if (existing) return existing
  const peerConnection = new RTCPeerConnection({ iceServers: call.iceServers || [] })
  const peerState = {
    peerUid,
    peerConnection,
    remoteStream: new MediaStream(),
    pendingIceCandidates: [],
    offerStarted: false
  }
  call.peerConnections.set(peerUid, peerState)
  call.localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, call.localStream)
  })
  peerConnection.addEventListener('track', event => {
    if (event.streams[0]) {
      peerState.remoteStream = event.streams[0]
    } else if (!peerState.remoteStream.getTracks().some(track => track.id === event.track.id)) {
      peerState.remoteStream.addTrack(event.track)
    }
    call.renderParticipants?.()
    const audio = [...(call.participantGrid?.querySelectorAll('[data-participant-uid]') || [])]
      .find(tile => tile.dataset.participantUid === peerUid)
      ?.querySelector('audio')
    audio?.play().catch(error => {
      console.warn('[messages] Remote call audio awaits a user gesture.', error.message)
    })
  })
  peerConnection.addEventListener('icecandidate', event => {
    if (!event.candidate || activeCall?.callId !== call.callId) return
    sendCallSignal(call, peerUid, { candidate: event.candidate.toJSON() }).catch(error => {
      console.error('[messages] Unable to send WebRTC ICE candidate.', {
        callId: call.callId,
        peerUid,
        message: error.message
      })
    })
  })
  peerConnection.addEventListener('connectionstatechange', () => {
    if (activeCall?.callId !== call.callId) return
    if (peerConnection.connectionState === 'connected') {
      startCallDuration(call)
      setActiveCallStatus(`${call.callType === 'video' ? 'Video' : 'Voice'} · Connected`)
    } else if (peerConnection.connectionState === 'failed') {
      console.error('[messages] WebRTC peer connection failed.', {
        callId: call.callId,
        peerUid,
        state: peerConnection.connectionState
      })
    }
  })
  return peerState
}

function sendCallSignal(call, targetUid, signal) {
  if (!realtimeSocket?.connected) {
    return Promise.reject(new Error('Realtime signaling is disconnected. Reconnect and try the call again.'))
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Call signaling timed out.')), 10_000)
    realtimeSocket.emit('call:signal', {
      conversationId: call.conversationId,
      callId: call.callId,
      targetUid,
      signal
    }, result => {
      clearTimeout(timeout)
      if (result?.success) resolve()
      else reject(new Error(result?.message || 'Call signaling was denied.'))
    })
  })
}

async function startWebRtcOffer(call, peerUid) {
  const peer = call.peerConnections?.get(peerUid)
  if (!peer || currentUid() >= peerUid || peer.offerStarted ||
    activeCall?.callId !== call.callId) return
  peer.offerStarted = true
  const offer = await peer.peerConnection.createOffer()
  await peer.peerConnection.setLocalDescription(offer)
  await sendCallSignal(call, peerUid, {
    type: peer.peerConnection.localDescription.type,
    sdp: peer.peerConnection.localDescription.sdp
  })
}

async function syncCallPeers(call, participants = call.participants || []) {
  if (activeCall?.callId !== call.callId) return
  call.participants = normalizeCallParticipants(participants)
  const acceptedUids = new Set(participants
    .filter(participant => participant.status === 'accepted')
    .map(participant => participant.firebase_uid))
  for (const [uid, peer] of call.peerConnections || []) {
    if (!acceptedUids.has(uid)) {
      peer.peerConnection.close()
      call.peerConnections.delete(uid)
    }
  }
  call.renderParticipants?.()
  for (const peerUid of acceptedUids) {
    if (peerUid === currentUid()) continue
    createCallPeerConnection(call, peerUid)
    if (currentUid() < peerUid) {
      startWebRtcOffer(call, peerUid).catch(error => {
        failActiveCall(error, `connect call participant ${peerUid}`)
      })
    }
  }
}

function updateCallParticipants(update = {}) {
  const isTerminal = update.call_status && ['ended', 'declined', 'missed'].includes(update.call_status)
  if (incomingCall?.call_id === update.call_id && isTerminal) {
    incomingCall = null
    clearTimeout(incomingCallTimer)
    incomingCallTimer = null
    stopCallRingtone()
    renderCallOverlay()
  }
  if (!activeCall || activeCall.callId !== update.call_id) return
  if (isTerminal) {
    finishActiveCall(false)
    return
  }
  if (update.call_status === 'accepted' && activeCall.status !== 'accepted') {
    activeCall.status = 'accepted'
    startCallDuration(activeCall)
    stopCallRingtone()
    clearTimeout(activeCall.ringingTimer)
    setActiveCallStatus(`${activeCall.callType === 'video' ? 'Video' : 'Voice'} · Connecting…`)
  }
  syncCallPeers(activeCall, update.participants || [])
    .then(() => applyPendingCallSignals(activeCall))
    .catch(error => failActiveCall(error, 'update call participants'))
}

async function applyCallSignal(packet) {
  const call = activeCall
  if (!call || call.callId !== packet.call_id || call.conversationId !== packet.conversation_id) return
  const participant = call.participants?.find(item =>
    item.firebase_uid === packet.from_uid && item.status === 'accepted'
  )
  if (!participant) return
  const peer = createCallPeerConnection(call, packet.from_uid)
  const peerConnection = peer.peerConnection
  const signal = packet.signal
  if (signal.type === 'offer') {
    await peerConnection.setRemoteDescription(signal)
    for (const candidate of peer.pendingIceCandidates.splice(0)) {
      await peerConnection.addIceCandidate(candidate)
    }
    const answer = await peerConnection.createAnswer()
    await peerConnection.setLocalDescription(answer)
    await sendCallSignal(call, packet.from_uid, {
      type: peerConnection.localDescription.type,
      sdp: peerConnection.localDescription.sdp
    })
    return
  }
  if (signal.type === 'answer') {
    await peerConnection.setRemoteDescription(signal)
    for (const candidate of peer.pendingIceCandidates.splice(0)) {
      await peerConnection.addIceCandidate(candidate)
    }
    return
  }
  if (signal.candidate) {
    if (peerConnection.remoteDescription) {
      await peerConnection.addIceCandidate(signal.candidate)
    } else {
      peer.pendingIceCandidates.push(signal.candidate)
    }
  }
}

async function handleCallSignal(packet) {
  if (!packet?.call_id || !packet?.signal) return
  if (activeCall?.callId === packet.call_id) {
    const peerAccepted = activeCall.participants?.some(participant =>
      participant.firebase_uid === packet.from_uid && participant.status === 'accepted'
    )
    if (activeCall.callRoomJoined && peerAccepted) {
      await applyCallSignal(packet)
    } else {
      queuePendingCallSignal(packet)
    }
    return
  }
  if (activeCall?.callId !== packet.call_id &&
    incomingCall?.call_id !== packet.call_id && acceptingCallId !== packet.call_id) return
  queuePendingCallSignal(packet)
}

function queuePendingCallSignal(packet) {
  const signals = pendingCallSignals.get(packet.call_id) || []
  if (signals.length < 64) signals.push(packet)
  pendingCallSignals.set(packet.call_id, signals)
}

async function applyPendingCallSignals(call) {
  const signals = pendingCallSignals.get(call.callId) || []
  pendingCallSignals.delete(call.callId)
  const deferred = []
  for (const signal of signals) {
    const peerAccepted = call.participants?.some(participant =>
      participant.firebase_uid === signal.from_uid && participant.status === 'accepted'
    )
    if (call.callRoomJoined && peerAccepted) await applyCallSignal(signal)
    else deferred.push(signal)
  }
  if (deferred.length) pendingCallSignals.set(call.callId, deferred)
}

async function finishActiveCall(notifyPeer) {
  const call = activeCall
  if (!call) return
  stopCallRingtone()
  clearTimeout(call.ringingTimer)
  clearInterval(call.durationTimer)
  realtimeSocket?.emit('call:leave', call.callId)
  activeCall = null
  call.peerConnections?.forEach(peer => peer.peerConnection.close())
  call.peerConnections?.clear()
  call.localStream?.getTracks().forEach(track => track.stop())
  pendingCallSignals.delete(call.callId)
  pendingCallUpdates.delete(call.callId)
  callRootReplace()
  if (notifyPeer && call.callId) {
    try {
      if (call.isCaller) {
        await api.post(`${apiPath(call.conversationId)}/calls/${call.callId}/end`, {})
      } else {
        await api.post(`/messages/calls/${call.callId}/leave`, {})
      }
    } catch (error) {
      showCallError(error, 'end call', {
        callId: call.callId,
        conversationId: call.conversationId
      })
    }
  }
}

async function failActiveCall(error, operation) {
  const call = activeCall
  const failure = showCallError(error, operation, call ? {
    callId: call.callId,
    conversationId: call.conversationId,
    callType: call.callType
  } : {})
  await finishActiveCall(true)
  callError = failure
  renderCallOverlay()
}

async function callRootReplace() {
  const { callRoot } = getElements()
  if (!callRoot) return
  callStarting = null
  callError = null
  clearCallInterface(callRoot)
}

async function expireOutgoingCall(call) {
  let updatedCall = null
  let retryAfterMs = null
  const scheduleRetry = delay => {
    if (activeCall?.callId !== call.callId) return
    activeCall.ringingTimer = setTimeout(
      () => expireOutgoingCall(call),
      Number.isFinite(delay) ? Math.max(250, delay + 100) : 1000
    )
  }
  try {
    const result = await api.post(`${apiPath(call.conversationId)}/calls/${call.callId}/missed`, {})
    updatedCall = result?.data?.call || null
    retryAfterMs = Number(result?.data?.retry_after_ms)
  } catch (error) {
    if (error?.status !== 409) {
        showCallError(error, 'mark call as missed', {
          callId: call.callId,
          conversationId: call.conversationId
        })
      if (activeCall?.callId === call.callId) await finishActiveCall(false)
      return
    }
    if (error?.code === 'CALL_NOT_EXPIRED') {
      const retryAfter = Number(error.payload?.data?.retry_after_ms)
      activeCall.ringingTimer = setTimeout(
        () => expireOutgoingCall(call),
        Number.isFinite(retryAfter) ? Math.max(250, retryAfter + 100) : 1000
      )
      return
    }
    try {
      const result = await api.get(`${apiPath(call.conversationId)}/calls?limit=200`)
      updatedCall = result?.data?.calls?.find(item => item.call_id === call.callId) || null
    } catch (reconcileError) {
        showCallError(reconcileError, 'reconcile call after timeout', {
          callId: call.callId,
          conversationId: call.conversationId
        })
      if (activeCall?.callId === call.callId) await finishActiveCall(false)
      return
    }
    if (updatedCall?.status === 'ringing' && activeCall?.callId === call.callId) {
      const ringExpiry = Date.parse(updatedCall.ring_expires_at)
      scheduleRetry(Number.isFinite(ringExpiry) ? ringExpiry - Date.now() : retryAfterMs)
      return
    }
  }
  if (updatedCall?.status === 'ringing') {
    scheduleRetry(retryAfterMs)
    return
  }
  if (updatedCall) handleCallUpdate(updatedCall)
  else if (activeCall?.callId === call.callId) await finishActiveCall(false)
}

async function startCall(conversation, callType) {
  if (mediaRecorder) cancelVoiceRecording()
  if (activeCall?.status === 'ringing' && activeCall.ringExpiresAt <= Date.now()) {
    await finishActiveCall(true)
  }
  if (incomingCall && Date.parse(incomingCall.ring_expires_at) <= Date.now()) {
    incomingCall = null
    clearTimeout(incomingCallTimer)
    incomingCallTimer = null
    renderCallOverlay()
  }
  if (activeCall || incomingCall || callStartInFlight) {
    showError(new Error('Finish the current call invitation before starting another call.'))
    return
  }
  callStartInFlight = true
  const startSequence = ++callStartSequence
  callError = null
  callStarting = {
    callType,
    peerName: conversation.participants?.find(member => member.firebaseUid !== currentUid())?.name,
    status: 'Connecting to call service…'
  }
  renderCallOverlay()
  let localStream
  let createdCallId = null
  let callConversationId = conversation.id
  let setupStage = 'check browser call support'
  try {
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
      throw new Error('WebRTC calling is not available in this browser. Use a supported browser over HTTPS.')
    }
    setupStage = 'load realtime call signaling'
    const socket = await ensureRealtimeSocket()
    if (startSequence !== callStartSequence) return
    setupStage = 'connect realtime call signaling'
    await waitForRealtimeConnection(socket)
    if (startSequence !== callStartSequence) return
    setupStage = 'request microphone/camera permission'
    callStarting.status = 'Requesting microphone and camera access…'
    renderCallOverlay()
    localStream = await requestCallMedia(callType)
    if (startSequence !== callStartSequence) {
      localStream.getTracks().forEach(track => track.stop())
      localStream = null
      return
    }
    setupStage = 'create call with backend'
    let result
    try {
      result = await api.post(`${apiPath(callConversationId)}/calls`, { callType })
    } catch (error) {
      if (error?.status !== 404 || error?.code !== 'CONVERSATION_NOT_FOUND') throw error
      setupStage = 'reopen direct conversation'
      const reopenedConversationId = await reopenDirectConversation(conversation)
      if (!reopenedConversationId) {
        setupStage = 'create call with backend'
        throw error
      }
      callConversationId = reopenedConversationId
      setupStage = 'create call with backend'
      result = await api.post(`${apiPath(callConversationId)}/calls`, { callType })
    }
    const responseCall = result?.data?.call
    createdCallId = responseCall?.call_id || null
    if (startSequence !== callStartSequence) {
      localStream?.getTracks().forEach(track => track.stop())
      localStream = null
      if (createdCallId) {
        await api.post(`${apiPath(callConversationId)}/calls/${createdCallId}/end`, {})
          .catch(error => console.error('[messages] Unable to end cancelled call setup.', error.message))
      }
      return
    }
    setupStage = 'validate call setup response'
    if (!responseCall?.call_id || !responseCall.peer_uid ||
      !Array.isArray(responseCall.ice_servers) ||
      !Number.isFinite(Date.parse(responseCall.ring_expires_at))) {
      throw new Error('The call service returned incomplete WebRTC setup information.')
    }
    activeCall = {
      callId: responseCall.call_id,
      conversationId: callConversationId,
      callType,
      peerName: responseCall.peer_name,
      peerUid: responseCall.peer_uid,
      peerProfileImage: getMemberProfileImage(responseCall.peer_uid),
      localProfileImage: getAvatarSource(currentUser),
      status: responseCall.status,
      isCaller: true,
      localStream,
      peerConnections: new Map(),
      participants: responseCall.participants || [],
      iceServers: responseCall.ice_servers,
      ringExpiresAt: Date.parse(responseCall.ring_expires_at)
    }
    startCallRingtone()
    setupStage = 'initialize WebRTC media connection'
    callStarting = null
    localStream = null
    renderCallOverlay()
    await joinCallRoom(activeCall)
    await syncCallPeers(activeCall, activeCall.participants)
    const pendingUpdate = pendingCallUpdates.get(responseCall.call_id)
    if (pendingUpdate) {
      pendingCallUpdates.delete(responseCall.call_id)
      handleCallUpdate(pendingUpdate)
    }
    if (activeCall?.callId !== responseCall.call_id) return
    const ringExpiresAt = Date.parse(responseCall.ring_expires_at)
    activeCall.ringingTimer = setTimeout(() => {
      if (activeCall?.callId === responseCall.call_id && activeCall.status === 'ringing') {
        expireOutgoingCall(activeCall)
      }
    }, Math.max(0, ringExpiresAt - Date.now()) + 500)
    if (activeCall) await applyPendingCallSignals(activeCall)
  } catch (error) {
    const wasCancelled = startSequence !== callStartSequence
    const failure = showCallError(error, 'start call', {
      stage: setupStage,
      method: ['create call with backend', 'reopen direct conversation'].includes(setupStage)
        ? 'POST'
        : null,
      path: setupStage === 'reopen direct conversation'
        ? '/messages/conversations'
        : setupStage === 'create call with backend'
          ? `${apiPath(callConversationId)}/calls`
          : null,
      callType,
      conversationId: callConversationId,
    })
    if (activeCall) await finishActiveCall(Boolean(activeCall.callId))
    else if (createdCallId) {
      try {
        await api.post(`${apiPath(callConversationId)}/calls/${createdCallId}/end`, {})
      } catch (endError) {
        console.error('[messages] Unable to clean up failed call setup.', endError.message)
      }
    }
    for (const [callId, pendingCall] of pendingCallUpdates) {
      if (pendingCall.conversation_id === callConversationId) pendingCallUpdates.delete(callId)
    }
    localStream?.getTracks().forEach(track => track.stop())
    if (wasCancelled) return
    callStarting = null
    callError = failure
    renderCallOverlay()
  } finally {
    callStartInFlight = false
  }
}

async function acceptIncomingCall() {
  const call = incomingCall
  if (!call || activeCall || acceptingCallId) return
  acceptingCallId = call.call_id
  stopCallRingtone()
  let localStream
  try {
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
      throw new Error('WebRTC calling is not available in this browser. Use a supported browser over HTTPS.')
    }
    await waitForRealtimeConnection(await ensureRealtimeSocket())
    localStream = await requestCallMedia(call.call_type)
    const result = call.added_participant
      ? await api.post(`${apiPath(call.conversation_id)}/calls/${call.call_id}/join`, {})
      : await api.post(`${apiPath(call.conversation_id)}/calls/${call.call_id}/accept`, {})
    const responseCall = result?.data?.call
    const iceServers = result?.data?.ice_servers || responseCall?.ice_servers
    if (!Array.isArray(iceServers)) {
      throw new Error('The call service returned incomplete WebRTC setup information.')
    }
    incomingCall = null
    clearTimeout(incomingCallTimer)
    incomingCallTimer = null
    activeCall = {
      callId: call.call_id,
      conversationId: call.conversation_id,
      callType: call.call_type,
      peerName: call.caller_name,
      peerUid: call.caller_uid,
      peerProfileImage: call.caller_profile_image || getMemberProfileImage(call.caller_uid),
      localProfileImage: getAvatarSource(currentUser),
      participants: result?.data?.participants || [],
      peerConnections: new Map(),
      iceServers,
      status: 'accepted',
      isCaller: call.caller_uid === currentUid(),
      localStream,
      pendingIceCandidates: []
    }
    localStream = null
    renderCallOverlay()
    startCallDuration(activeCall)
    await joinCallRoom(activeCall)
    await syncCallPeers(activeCall, activeCall.participants)
    await applyPendingCallSignals(activeCall)
  } catch (error) {
    if (activeCall?.callId === call.call_id) await finishActiveCall(true)
    else {
      localStream?.getTracks().forEach(track => track.stop())
      acceptingCallId = null
      try {
        await api.post(
          `${apiPath(call.conversation_id)}/calls/${call.call_id}/${call.added_participant ? 'decline-invite' : 'end'}`,
          {}
        )
      } catch (endError) {
        console.error('[messages] Unable to end failed WebRTC call setup.', endError.message)
      }
      if (incomingCall?.call_id === call.call_id) {
        incomingCall = null
        clearTimeout(incomingCallTimer)
        incomingCallTimer = null
      }
    }
    callError = showCallError(error, 'accept call', {
      callId: call.call_id,
      conversationId: call.conversation_id,
      callType: call.call_type
    })
    renderCallOverlay()
  } finally {
    acceptingCallId = null
  }
}

async function declineIncomingCall() {
  const call = incomingCall
  if (!call) return
  incomingCall = null
  stopCallRingtone()
  pendingCallSignals.delete(call.call_id)
  clearTimeout(incomingCallTimer)
  incomingCallTimer = null
  renderCallOverlay()
  try {
    await api.post(
      `${apiPath(call.conversation_id)}/calls/${call.call_id}/${call.added_participant ? 'decline-invite' : 'decline'}`,
      {}
    )
  } catch (error) {
    showCallError(error, 'decline call', {
      callId: call.call_id,
      conversationId: call.conversation_id,
      callType: call.call_type
    })
  }
}

async function saveMessage({
  conversationId,
  body,
  attachments = [],
  replyToId = null,
  forwardedFrom = null,
  destinationConversation = null,
  destinationMemberUid = null,
  clientMessageId = crypto.randomUUID()
}) {
  const conversation = destinationConversation
    ? normalizeConversation(destinationConversation)
    : messageState.conversations.find(item => item.id === conversationId)
  if (!conversation || conversation.id !== conversationId ||
    !conversation.memberUids.includes(currentUid())) {
    throw new Error('You no longer have access to this conversation.')
  }
  if (destinationConversation &&
    (conversation.type !== 'direct' || !conversation.memberUids.includes(destinationMemberUid))) {
    throw new Error('The destination conversation does not include the selected recipient.')
  }
  let forwardedMetadata = null
  if (forwardedFrom !== null) {
    const senderName = typeof forwardedFrom.senderName === 'string'
      ? forwardedFrom.senderName.trim()
      : ''
    if (!senderName) throw new Error('The original message sender could not be identified.')
    forwardedMetadata = { senderName: senderName.slice(0, 160) }
  }
  if (replyToId && !messageState.messages.some(item => item.id === replyToId)) {
    throw new Error('The message being replied to is unavailable.')
  }
  const result = await api.post(`${apiPath(conversationId)}/messages`, {
    body,
    attachments,
    replyToId,
    forwardedFrom: forwardedMetadata,
    clientMessageId
  })
  return normalizeMessage(result?.data?.message || {})
}

async function loadConversationMessages(conversationId) {
  if (!conversationId) {
    messageState.messages = []
    return
  }
  try {
    const result = await api.get(
      `${apiPath(conversationId)}/messages?limit=100`
    )
    const data = result?.data || {}
    if (selectedConversationId === conversationId) {
      messageState.messages = (data.messages || []).map(normalizeMessage)
      messageCursors.set(conversationId, data.nextCursor || null)
      messageHasMore.set(conversationId, Boolean(data.hasMore))
      await refreshCallHistory(conversationId)
    }
  } catch (error) {
    logMessageApiFailure('message history fetch', error, { conversationId })
    throw error
  }
}

async function refreshCallHistory(conversationId) {
  const conversation = messageState.conversations.find(item => item.id === conversationId)
  if (!conversation || conversation.type !== 'direct') {
    conversationCallHistory.delete(conversationId)
    return
  }
  const result = await api.get(`${apiPath(conversationId)}/calls?limit=100`)
  const calls = result?.data?.calls || []
  conversationCallHistory.set(conversationId, [])
  calls.forEach(call => upsertCallHistory(call, false))
}

async function loadOlderMessages(conversationId) {
  const cursor = messageCursors.get(conversationId)
  if (!cursor || !messageHasMore.get(conversationId) || loadingOlderMessages.has(conversationId)) return
  loadingOlderMessages.add(conversationId)
  try {
    const feed = getElements().feed
    const oldHeight = feed?.scrollHeight || 0
    const result = await api.get(
      `${apiPath(conversationId)}/messages?limit=100&before=${encodeURIComponent(cursor)}`
    )
    const data = result?.data || {}
    if (selectedConversationId === conversationId) {
      const older = (data.messages || []).map(normalizeMessage)
      const existing = new Set(messageState.messages.map(message => message.id))
      messageState.messages = [...older.filter(message => !existing.has(message.id)), ...messageState.messages]
      messageCursors.set(conversationId, data.nextCursor || null)
      messageHasMore.set(conversationId, Boolean(data.hasMore))
      renderMessages()
      if (feed) feed.scrollTop = feed.scrollHeight - oldHeight
    }
  } catch (error) {
    showError(error, `load older messages for ${conversationId}`)
  } finally {
    loadingOlderMessages.delete(conversationId)
  }
}

async function reloadMessages() {
  const user = firebaseAuth.currentUser
  if (!user) {
    return
  }
  if (subscriptionsUid !== user.uid) {
    conversationMessageSubscriptions.forEach(unsubscribe => unsubscribe())
    conversationMessageSubscriptions.clear()
    realtimeSocket?.disconnect()
    realtimeSocket = null
    realtimeSocketUid = null
    messageState = { conversations: [], messages: [] }
    selectedConversationId = null
    memberPresence.clear()
    conversationCallHistory.clear()
    subscriptionsUid = user.uid
  }
  await ensureRealtimeSocket()
  const result = await api.get('/messages/conversations')
  const conversations = (result?.data?.conversations || []).map(normalizeConversation)
  const visibleIds = new Set(conversations.map(conversation => conversation.id))
  for (const oldConversation of messageState.conversations) {
    if (!visibleIds.has(oldConversation.id)) unsubscribeConversation(oldConversation.id)
  }
  replaceConversations(conversations)
  conversations.forEach(conversation => conversation.participants.forEach(member => {
    if (!member.firebaseUid) return
    memberPresence.set(member.firebaseUid, {
      isOnline: Boolean(member.is_online),
      lastSeenAt: member.lastSeenAt || null
    })
  }))
  messageState.conversations.forEach(subscribeToConversationMessages)
  if (!selectedConversationId || !visibleIds.has(selectedConversationId)) {
    selectedConversationId = conversations[0]?.id || null
  }
  await loadConversationMessages(selectedConversationId)
  updateMessagesNavigationBadge()
  if (activeView === 'Messages') renderMessages()
}

async function refreshFromServer() {
  if (refreshPromise) return refreshPromise
  refreshPromise = reloadMessages()
    .catch(error => showError(error, 'refresh messages from the authenticated messaging API'))
    .finally(() => { refreshPromise = null })
  return refreshPromise
}

async function selectConversation(conversationId) {
  if (mediaRecorder && voiceRecordingConversationId !== conversationId) cancelVoiceRecording()
  selectedConversationId = conversationId
  clearError()
  try {
    await loadConversationMessages(conversationId)
    const conversation = messageState.conversations.find(item => item.id === conversationId)
    await api.post(`${apiPath(conversationId)}/read`, {})
    if (conversation) {
      conversation.unreadCount = 0
      updateMessagesNavigationBadge()
    }
  } catch (error) {
    showError(error, 'load selected conversation and mark it read')
  }
  closeEmojiPicker()
  renderMessages()
}

export async function openMessageContext({ conversationId, messageId } = {}) {
  if (!conversationId || !messageId) return
  if (activeView !== 'Messages') hub.switchView?.('Messages')
  await refreshFromServer()
  if (!messageState.conversations.some(conversation => conversation.id === conversationId)) {
    showError(new Error('The discussion is not available to your account.'))
    return
  }
  await selectConversation(conversationId)
  window.requestAnimationFrame(() => {
    const target = [...(getElements().feed?.querySelectorAll('.message-row[data-message-id]') || [])]
      .find(row => row.dataset.messageId === messageId)
    if (!target) {
      showError(new Error('The linked message is not available in this conversation.'))
      return
    }
    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    target.classList.add('is-context-target')
    window.setTimeout(() => target.classList.remove('is-context-target'), 2200)
  })
}

function formatMessageTime(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
}

function formatFileSize(bytes) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
}

function createFileIcon(attachment) {
  const fileName = attachment.fileName || ''
  const extensionSeparator = fileName.lastIndexOf('.')
  const extension = extensionSeparator > 0 ? fileName.slice(extensionSeparator + 1).toLowerCase() : ''
  const mediaType = attachment.mediaType?.toLowerCase() || ''
  const types = [
    { category: 'pdf', label: 'PDF', extensions: ['pdf'], mediaTypes: ['application/pdf'] },
    {
      category: 'word',
      label: 'DOC',
      extensions: ['doc', 'docx', 'odt', 'rtf'],
      mediaTypes: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    },
    {
      category: 'spreadsheet',
      label: 'XLS',
      extensions: ['xls', 'xlsx', 'ods', 'csv'],
      mediaTypes: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv']
    },
    {
      category: 'presentation',
      label: 'PPT',
      extensions: ['ppt', 'pptx', 'odp'],
      mediaTypes: ['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']
    },
    { category: 'image', label: 'IMG', extensions: ['bmp', 'gif', 'heic', 'jpeg', 'jpg', 'png', 'svg', 'tif', 'tiff', 'webp'], mediaTypes: ['image/'] },
    { category: 'audio', label: 'AUD', extensions: ['aac', 'flac', 'm4a', 'mp3', 'ogg', 'wav'], mediaTypes: ['audio/'] },
    { category: 'video', label: 'VID', extensions: ['avi', 'm4v', 'mkv', 'mov', 'mp4', 'webm'], mediaTypes: ['video/'] },
    { category: 'archive', label: 'ZIP', extensions: ['7z', 'bz2', 'gz', 'rar', 'tar', 'xz', 'zip'], mediaTypes: ['application/zip', 'application/x-7z-compressed', 'application/x-rar-compressed', 'application/gzip'] },
    { category: 'text', label: 'TXT', extensions: ['css', 'html', 'js', 'json', 'md', 'sql', 'ts', 'txt', 'xml', 'yaml', 'yml'], mediaTypes: ['text/'] }
  ]
  const type = types.find(item =>
    item.extensions.includes(extension) || item.mediaTypes.some(mime => mime.endsWith('/') ? mediaType.startsWith(mime) : mediaType === mime)
  )
  const label = type?.label || (extension ? extension.slice(0, 4).toUpperCase() : 'FILE')
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  icon.setAttribute('class', `message-file-icon message-file-icon-${type?.category || 'generic'}`)
  icon.setAttribute('viewBox', '0 0 36 42')
  icon.setAttribute('aria-hidden', 'true')
  const page = document.createElementNS(icon.namespaceURI, 'path')
  page.setAttribute('d', 'M7 1.5h14l8 8V39a1.5 1.5 0 0 1-1.5 1.5h-20A1.5 1.5 0 0 1 6 39V3a1.5 1.5 0 0 1 1-1.5Z')
  page.setAttribute('fill', 'none')
  page.setAttribute('stroke', 'currentColor')
  page.setAttribute('stroke-width', '2')
  const fold = document.createElementNS(icon.namespaceURI, 'path')
  fold.setAttribute('d', 'M21 2v8h8')
  fold.setAttribute('fill', 'none')
  fold.setAttribute('stroke', 'currentColor')
  fold.setAttribute('stroke-width', '2')
  const format = document.createElementNS(icon.namespaceURI, 'text')
  format.setAttribute('x', '18')
  format.setAttribute('y', '29')
  format.setAttribute('text-anchor', 'middle')
  format.textContent = label
  icon.append(page, fold, format)
  return icon
}

function createVoiceWaveform(className, seed = '', waveformPeaks = null) {
  const waveform = make('div', className)
  let value = [...seed].reduce((sum, character) => sum + character.charCodeAt(0), 17) || 17
  for (let index = 0; index < 40; index += 1) {
    value = (value * 9301 + 49297) % 233280
    const normalizedPeak = Array.isArray(waveformPeaks) && Number.isFinite(waveformPeaks[index])
      ? Math.max(0, Math.min(1, waveformPeaks[index]))
      : 0.18 + (value / 233280) * 0.82
    const height = 16 + Math.round(normalizedPeak * 84)
    const bar = make('span', 'messages-waveform-bar')
    bar.style.setProperty('--bar-height', `${height}%`)
    bar.style.setProperty('--bar-delay', `${index * 18}ms`)
    waveform.append(bar)
  }
  return waveform
}

function updateVoicePlayerProgress(audio, waveform, timeLabel, playButton, storedDuration = 0) {
  const duration = Number.isFinite(audio.duration) && audio.duration > 0
    ? audio.duration
    : storedDuration
  const currentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0
  const progress = duration ? Math.min(1, currentTime / duration) : 0
  const bars = waveform.querySelectorAll('.messages-waveform-bar')
  bars.forEach((bar, index) => bar.classList.toggle(
    'is-played',
    index < Math.round(progress * bars.length)
  ))
  waveform.setAttribute('aria-valuenow', String(Math.round(progress * 100)))
  waveform.setAttribute('aria-valuetext', `${formatVoiceDuration(Math.floor(currentTime))} of ${formatVoiceDuration(Math.floor(duration))}`)
  timeLabel.textContent = duration
    ? `${formatVoiceDuration(Math.floor(currentTime))} / ${formatVoiceDuration(Math.ceil(duration))}`
    : 'Unavailable'
  const isPlaying = !audio.paused && !audio.ended
  playButton.setAttribute('aria-label', isPlaying ? 'Pause voice note' : 'Play voice note')
  playButton.title = isPlaying ? 'Pause voice note' : 'Play voice note'
  playButton.replaceChildren(createVoicePlayerIcon(isPlaying))
}

async function prepareVoiceNotePlayback(audio) {
  if (activeVoiceNoteAudio && activeVoiceNoteAudio !== audio) {
    activeVoiceNoteAudio.pause()
    activeVoiceNoteAudio.currentTime = 0
  }
  activeVoiceNoteAudio = audio

  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext
  if (!AudioContextConstructor) return
  try {
    if (!voiceNoteAudioContext) voiceNoteAudioContext = new AudioContextConstructor()
    if (!voiceNoteGainNodes.has(audio)) {
      const source = voiceNoteAudioContext.createMediaElementSource(audio)
      const gain = voiceNoteAudioContext.createGain()
      const compressor = voiceNoteAudioContext.createDynamicsCompressor()
      gain.gain.value = 2
      compressor.threshold.value = -18
      compressor.knee.value = 10
      compressor.ratio.value = 4
      compressor.attack.value = 0.003
      compressor.release.value = 0.25
      source.connect(gain)
      gain.connect(compressor)
      compressor.connect(voiceNoteAudioContext.destination)
      voiceNoteGainNodes.set(audio, compressor)
    }
    if (voiceNoteAudioContext.state === 'suspended') await voiceNoteAudioContext.resume()
  } catch (error) {
    console.warn('[messages] Voice note volume boost unavailable; using normal playback volume.', error)
  }
}

function createVoicePlayerIcon(isPlaying) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(svg.namespaceURI, 'path')
  path.setAttribute('d', isPlaying ? 'M8 5h3v14H8zM15 5h3v14h-3z' : 'm8 5 11 7-11 7z')
  svg.append(path)
  return svg
}

function renderAttachment(attachment, container) {
  if (attachment.is_voice_note || attachment.mediaType?.startsWith('audio/')) {
    const player = document.createElement('audio')
    player.className = 'messages-voice-note-audio'
    player.preload = 'metadata'
    player.src = attachment.data
    player.setAttribute('aria-label', attachment.fileName || 'Voice note')
    const playerUi = make('div', 'messages-voice-note-player')
    const playButton = make('button', 'messages-voice-play')
    playButton.type = 'button'
    playButton.setAttribute('aria-label', 'Play voice note')
    playButton.append(createVoicePlayerIcon(false))
    const waveform = createVoiceWaveform(
      'messages-voice-waveform',
      `${attachment.fileName || ''}${attachment.size || ''}`,
      attachment.waveform_peaks || attachment.waveformPeaks
    )
    waveform.setAttribute('role', 'slider')
    waveform.setAttribute('aria-label', 'Voice note playback position')
    waveform.setAttribute('aria-valuemin', '0')
    waveform.setAttribute('aria-valuemax', '100')
    waveform.setAttribute('aria-valuenow', '0')
    waveform.tabIndex = 0
    const savedDuration = attachment.fileName?.match(/^voice-note-(\d+)s-/i)?.[1]
    const storedDuration = Number.isFinite(attachment.duration_seconds)
      ? attachment.duration_seconds
      : Number(savedDuration) || 0
    const timeLabel = make(
      'span',
      'messages-voice-time',
      storedDuration ? `00:00 / ${formatVoiceDuration(storedDuration)}` : 'Unavailable'
    )
    const visualizer = make('div', 'messages-voice-note-visualizer')
    visualizer.append(waveform, timeLabel)
    const speedButton = make('button', 'messages-voice-speed', '1x')
    speedButton.type = 'button'
    speedButton.setAttribute('aria-label', 'Playback speed 1x')
    const playbackSpeeds = [1, 1.5, 2]
    let playbackSpeedIndex = 0
    speedButton.addEventListener('click', () => {
      playbackSpeedIndex = (playbackSpeedIndex + 1) % playbackSpeeds.length
      const speed = playbackSpeeds[playbackSpeedIndex]
      player.playbackRate = speed
      speedButton.textContent = `${speed}x`
      speedButton.setAttribute('aria-label', `Playback speed ${speed}x`)
    })
    const togglePlayback = async () => {
      if (player.paused) {
        try {
          await prepareVoiceNotePlayback(player)
          await player.play()
        } catch (error) {
          if (activeVoiceNoteAudio === player) activeVoiceNoteAudio = null
          showError(error, 'play voice note')
        }
      } else {
        player.pause()
      }
    }
    playButton.addEventListener('click', togglePlayback)
    waveform.addEventListener('click', event => {
      const bounds = waveform.getBoundingClientRect()
      const progress = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width))
      if (Number.isFinite(player.duration)) player.currentTime = progress * player.duration
    })
    waveform.addEventListener('keydown', event => {
      if (!Number.isFinite(player.duration)) return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        player.currentTime = Math.max(0, Math.min(
          player.duration,
          player.currentTime + (event.key === 'ArrowRight' ? 5 : -5)
        ))
      } else if (event.key === 'Home') {
        player.currentTime = 0
      } else if (event.key === 'End') {
        player.currentTime = player.duration
      }
    })
    ;['loadedmetadata', 'timeupdate', 'play', 'pause', 'ended'].forEach(eventName => {
      player.addEventListener(eventName, () =>
        updateVoicePlayerProgress(player, waveform, timeLabel, playButton, storedDuration)
      )
    })
    player.addEventListener('ended', () => {
      if (activeVoiceNoteAudio === player) activeVoiceNoteAudio = null
    })
    player.addEventListener('error', () => {
      console.error('[messages] Voice note audio failed to load.', {
        fileName: attachment.fileName,
        mediaErrorCode: player.error?.code || null,
        mediaErrorMessage: player.error?.message || null
      })
      showError(new Error('This voice note could not be played. Please try downloading or resending it.'), 'load voice note')
    })
    playerUi.append(playButton, visualizer, speedButton)
    container.append(player, playerUi)
    updateVoicePlayerProgress(player, waveform, timeLabel, playButton, storedDuration)
    return
  }
  if (attachment.mediaType?.startsWith('image/')) {
    const preview = document.createElement('a')
    preview.className = 'message-attachment-preview image'
    preview.href = attachment.data
    preview.target = '_blank'
    preview.rel = 'noopener noreferrer'
    const image = document.createElement('img')
    image.src = attachment.data
    image.alt = attachment.fileName
    image.loading = 'lazy'
    preview.append(image)
    container.append(preview)
    return
  }
  const link = make('a', 'message-attachment message-attachment-file')
  link.href = attachment.data
  link.download = attachment.fileName
  const details = make('span', 'message-attachment-preview-details')
  details.append(make('strong', '', attachment.fileName), make('small', '', formatFileSize(attachment.size)))
  link.append(createFileIcon(attachment), details)
  container.append(link)
}

function renderReactions(message, container, bubble) {
  if (message.isDeleted) return
  const reactions = make('div', 'message-reactions')
  const activeReactions = (message.reactions || []).filter(reaction => reaction.users?.length)
  activeReactions.forEach(reaction => {
    const active = reaction.users.includes(currentEmail())
    const button = make('button', `message-reaction${active ? ' active' : ''}`)
    button.type = 'button'
    button.setAttribute('aria-label', `${reaction.emoji}, ${reaction.users.length} reactions`)
    button.setAttribute('aria-pressed', String(active))
    button.append(make('span', '', reaction.emoji), make('span', '', String(reaction.users.length)))
    button.addEventListener('click', () => toggleReaction(message, reaction.emoji))
    reactions.append(button)
  })
  const addWrap = make('div', 'message-add-reaction-wrap')
  const add = make('button', 'message-add-reaction', '＋')
  add.type = 'button'
  add.setAttribute('aria-label', 'Add reaction')
  const picker = make('div', 'messages-emoji-menu')
  picker.hidden = true
  reactionChoices.forEach(emoji => {
    const choice = make('button', 'messages-emoji-choice', emoji)
    choice.type = 'button'
    choice.addEventListener('click', () => {
      picker.hidden = true
      toggleReaction(message, emoji)
    })
    picker.append(choice)
  })
  add.addEventListener('click', event => {
    event.stopPropagation()
    const shouldOpen = picker.hidden
    document.querySelectorAll('.messages-emoji-menu:not([hidden])').forEach(openPicker => { openPicker.hidden = true })
    picker.hidden = !shouldOpen
  })
  addWrap.append(add, picker)
  bubble.append(addWrap)
  if (activeReactions.length) {
    container.append(reactions)
  }
}

function renderMessageActions(message, container) {
  const actions = make('div', 'message-actions')
  const trigger = make('button', 'message-actions-trigger', '⋮')
  trigger.type = 'button'
  trigger.setAttribute('aria-label', 'Message actions')
  const menu = make('div', 'message-actions-menu')
  menu.hidden = true
  const options = message.isDeleted
    ? [{ label: 'Delete for me', action: () => deleteMessage(message, 'me'), destructive: true }]
    : [
       { label: 'Reply', action: () => startReply(message) },
       ...(message.senderUid === currentUid()
         ? [{ label: 'Edit', action: () => startEdit(message) }]
         : []),
       ...(message.linkedTaskId
         ? [{ label: 'Open linked task', action: () => hub.openProjectTaskDetails?.(message.linkedTaskId) }]
         : [{ label: 'Convert to Task', action: () => convertMessageToTask(message) }]),
       { label: message.isDecision ? 'Unpin Decision' : 'Pin as Decision', action: () => mutateMessage(message, 'decision') },
       { label: 'Forward', action: () => openForwardModal(message) },
       { label: message.pinned ? 'Unpin' : 'Pin', action: () => mutateMessage(message, 'pin') },
       { label: 'Delete for me', action: () => deleteMessage(message, 'me'), destructive: true },
       { label: 'Delete for everyone', action: () => deleteMessage(message, 'everyone'), destructive: true }
      ]
  options.forEach(option => {
    const button = make('button', `message-action-option${option.destructive ? ' destructive' : ''}`, option.label)
    button.type = 'button'
    button.addEventListener('click', () => {
      menu.hidden = true
      option.action()
    })
    menu.append(button)
  })
  trigger.addEventListener('click', () => { menu.hidden = !menu.hidden })
  actions.append(trigger, menu)
  container.append(actions)
}

function convertMessageToTask(message) {
  const conversation = messageState.conversations.find(item => item.id === message.conversationId)
  const project = projects.find(item => item.projectId === conversation?.projectId)
  if (!project) {
    showError(new Error('The project for this discussion could not be found.'))
    return
  }
  const transcript = (message.attachments || []).find(attachment =>
    attachment.transcript || attachment.transcription
  )
  const content = message.body || transcript?.transcript || transcript?.transcription ||
    (message.attachments?.some(attachment => attachment.is_voice_note) ? 'Voice note from discussion' : 'Follow up from discussion')
  const title = content.split(/\r?\n/)[0].trim().slice(0, 255) || 'Follow up from discussion'
  hub.openProjectTaskModal?.(project, null, {
    title,
    description: content.slice(0, 10000),
    chatMessageId: message.id,
    descriptionAttachments: (message.attachments || []).filter(attachment =>
      attachment.is_voice_note || attachment.isVoiceNote
    )
  })
}

function showChatBriefing(summary) {
  const backdrop = make('div', 'modal-backdrop')
  const dialog = make('section', 'modal messages-create-modal ai-briefing-modal')
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-labelledby', 'ai-chat-briefing-title')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.setAttribute('aria-label', 'Close chat briefing')
  const title = make('h2', '', 'Chat briefing')
  title.id = 'ai-chat-briefing-title'
  const content = make('p', 'ai-briefing-copy', summary)
  const closeDialog = () => backdrop.remove()
  close.addEventListener('click', closeDialog)
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) closeDialog()
  })
  dialog.append(close, title, content)
  backdrop.append(dialog)
  document.querySelector('#modal-root')?.append(backdrop)
  close.focus()
}

async function summarizeActiveConversation(button) {
  const messages = getConversationTimeline(selectedConversationId)
    .filter(message => !message.callId && !message.isDeleted)
    .slice(-100)
    .map(message => {
      const transcript = (message.attachments || []).find(attachment =>
        attachment.transcript || attachment.transcription
      )
      const body = message.body || transcript?.transcript || transcript?.transcription ||
        (message.attachments?.length ? '[Attachment]' : '')
      return body ? `${message.senderName}: ${body.slice(0, 1800)}` : ''
    })
    .filter(Boolean)
  const boundedMessages = []
  let totalCharacters = 0
  for (const message of messages.reverse()) {
    if (totalCharacters + message.length > 20000) continue
    boundedMessages.unshift(message)
    totalCharacters += message.length
  }
  if (!boundedMessages.length) {
    showError(new Error('There are no readable messages to summarize.'), 'summarize conversation')
    return
  }

  button.disabled = true
  button.textContent = 'Summarizing…'
  try {
    const response = await api.post('/ai/summarize-chat', { messages: boundedMessages })
    if (!response?.success || typeof response.summary !== 'string' || !response.summary.trim()) {
      throw new Error('The AI service did not return a chat summary.')
    }
    showChatBriefing(response.summary)
  } catch (error) {
    showError(error, 'summarize conversation')
  } finally {
    button.disabled = false
    button.textContent = '⚡ Catch Me Up'
  }
}

function renderCallRecord(call) {
  const isCaller = call.callerUid === currentUid()
  const callType = call.callType === 'video' ? 'Video' : 'Voice'
  let label
  let icon
  if (call.status === 'missed') {
    label = isCaller ? `${callType} call · No answer` : `Missed ${callType.toLowerCase()} call`
    icon = '↙'
  } else if (call.status === 'declined') {
    label = isCaller ? `${callType} call declined` : `Declined ${callType.toLowerCase()} call`
    icon = '↙'
  } else {
    label = `${callType} call ended`
    icon = '↗'
  }
  const row = make('article', `message-row call-log-row${isCaller ? ' own message-row-sent' : ' message-row-received'}`)
  const content = make('div', `message-content${isCaller ? ' message-content-sent' : ' message-content-received'}`)
  const card = make('div', `call-log-card${call.status === 'missed' ? ' is-missed' : ''}`)
  const glyph = make('span', 'call-log-icon', icon)
  glyph.setAttribute('aria-hidden', 'true')
  const text = make('div', 'call-log-copy')
  text.append(
    make('strong', 'call-log-label', label),
    make('span', 'call-log-participant', isCaller ? call.calleeName : call.callerName)
  )
  const time = make('time', 'call-log-time', formatMessageTime(call.createdAt))
  time.dateTime = call.createdAt
  card.append(glyph, text, time)
  content.append(card)
  row.append(content)
  return row
}

function renderMessagesList() {
  const { feed } = getElements()
  if (!feed) return
  const shouldScroll = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80
  feed.replaceChildren()
  if (!selectedConversationId || !messageState.conversations.some(item => item.id === selectedConversationId)) {
    feed.append(make('p', 'messages-placeholder', 'Choose a channel or start a direct message.'))
    return
  }
  const messages = getConversationTimeline(selectedConversationId)
  if (!messages.length) {
    feed.append(make('p', 'messages-placeholder', 'No messages yet. Start the conversation.'))
    return
  }
  messages.forEach(message => {
    if (message.callId) {
      feed.append(renderCallRecord(message))
      return
    }
    const own = message.senderUid === currentUid()
    const row = make('article', `message-row${own ? ' own message-row-sent' : ' message-row-received'}`)
    row.dataset.messageId = message.id
    const body = make('div', `message-content${own ? ' message-content-sent' : ' message-content-received'}`)
    const bubble = make('div', `message-bubble${own ? ' message-bubble-sent' : ''}`)
    if (message.pinned) bubble.append(make('div', 'message-pinned-label', '📌 Pinned'))
    if (message.isDecision) bubble.append(make('div', 'message-decision-label', 'Decision'))
    if (message.linkedTaskId) {
      const linkedTask = make('button', 'message-linked-task-badge', message.linkedTaskTitle || 'View linked task')
      linkedTask.type = 'button'
      linkedTask.addEventListener('click', () => hub.openProjectTaskDetails?.(message.linkedTaskId))
      bubble.append(linkedTask)
    }
    if (!own) bubble.append(make('div', 'message-meta', message.senderName))
    if (message.forwardedFrom?.senderName) bubble.append(make('div', 'message-forwarded-label', `↪ Forwarded from ${message.forwardedFrom.senderName}`))
    if (message.replyToId) {
      const quote = make('div', 'message-reply-quote')
      quote.append(make('strong', '', message.replyToSenderName || 'Message'), make('span', '', message.replyToBody || 'Attachment'))
      bubble.append(quote)
    }
    if (message.body) {
      bubble.append(make('p', `message-text${own ? ' message-text-sent' : ''}${message.isDeleted ? ' deleted' : ''}`, message.body))
    }
    ;(message.attachments || []).forEach(attachment => renderAttachment(attachment, bubble))
    const time = make('span', 'message-time-row')
    if (message.editedAt) time.append(make('span', 'message-edited-label', 'Edited'))
    time.append(make('time', 'message-time', formatMessageTime(message.createdAt)))
    if (own) {
      const receipt = make('span', `message-status${message.readAt ? ' read' : ''}`, message.readAt ? '✓✓' : '✓')
      receipt.title = message.readAt ? 'Viewed' : 'Sent'
      receipt.setAttribute('aria-label', message.readAt ? 'Viewed' : 'Sent')
      time.append(receipt)
    }
    bubble.append(time)
    body.append(bubble)
    renderMessageActions(message, bubble)
    renderReactions(message, body, bubble)
    row.append(body)
    feed.append(row)
  })
  if (shouldScroll) feed.scrollTop = feed.scrollHeight
}

function confirmConversationAction(conversation, action) {
  const backdrop = make('div', 'modal-backdrop')
  const form = make('form', 'modal messages-create-modal messages-clear-modal')
  form.setAttribute('role', 'dialog')
  form.setAttribute('aria-modal', 'true')
  const deletingChat = action === 'delete-chat'
  const title = make('h2', '', deletingChat ? 'Delete chat for you?' : 'Clear all messages?')
  title.id = deletingChat ? 'messages-delete-chat-title' : 'messages-clear-title'
  form.setAttribute('aria-labelledby', title.id)

  const closeModal = () => {
    backdrop.remove()
    document.removeEventListener('keydown', onKeyDown)
  }
  const onKeyDown = event => {
    if (event.key === 'Escape') closeModal()
  }

  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.setAttribute('aria-label', 'Close dialog')
  close.addEventListener('click', closeModal)

  const header = make('header', 'messages-create-header messages-clear-modal-header')
  header.append(
    make('span', 'messages-create-eyebrow', 'MESSAGES'),
    title,
    make('p', 'modal-copy', deletingChat
      ? 'This removes the chat from your list only. Other members will keep the conversation and its messages.'
      : 'Clear all messages from this conversation for you? Other members will still see them.'),
    close
  )

  const actions = make('div', 'messages-clear-actions')
  const confirm = make(
    'button',
    `primary-button messages-create-submit messages-clear-confirm${deletingChat ? ' destructive' : ''}`,
    deletingChat ? 'Delete chat for me' : 'Clear all messages'
  )
  confirm.type = 'submit'
  actions.append(confirm)
  form.append(header, actions)
  backdrop.append(form)
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) closeModal()
  })
  document.querySelector('#modal-root').append(backdrop)
  document.addEventListener('keydown', onKeyDown)
  confirm.focus()

  form.addEventListener('submit', async event => {
    event.preventDefault()
    confirm.disabled = true
    try {
      if (deletingChat) {
        const wasSelected = selectedConversationId === conversation.id
        await api.delete(apiPath(conversation.id))
        unsubscribeConversation(conversation.id)
        messageState.conversations = messageState.conversations
          .filter(item => item.id !== conversation.id)
        if (wasSelected || selectedConversationId === conversation.id) {
          selectedConversationId = messageState.conversations[0]?.id || null
          messageState.messages = []
          if (selectedConversationId) await loadConversationMessages(selectedConversationId)
        }
      } else {
        await api.delete(`${apiPath(conversation.id)}/messages`)
        messageState.messages = messageState.messages.filter(
          message => message.conversationId !== conversation.id
        )
        conversation.latestMessage = ''
        conversation.latestMessageCreatedAt = null
        conversationCallHistory.set(conversation.id, [])
      }
      closeModal()
      renderMessages()
      await refreshFromServer()
    } catch (error) {
      confirm.disabled = false
      showError(error, deletingChat
        ? `delete conversation ${conversation.id} for current user`
        : `clear messages in conversation ${conversation.id}`)
    }
  })
}

function clearConversationMessages(conversation) {
  confirmConversationAction(conversation, 'clear-messages')
}

function deleteConversationForMe(conversation) {
  confirmConversationAction(conversation, 'delete-chat')
}

function createCallLaunchButton(conversation, callType) {
  const isVideo = callType === 'video'
  const label = isVideo ? 'Start video call' : 'Start voice call'
  const button = make('button', 'collab-call-launch')
  button.type = 'button'
  button.setAttribute('aria-label', label)
  button.title = label
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  icon.setAttribute('viewBox', '0 0 24 24')
  icon.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(icon.namespaceURI, 'path')
  path.setAttribute('d', isVideo
    ? 'M15 10l5-3v10l-5-3zM3 6h12v12H3z'
    : 'M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.14 4.2 2 2 0 0 1 4.13 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8.03 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92z')
  icon.append(path)
  button.append(icon)
  button.addEventListener('click', () => startCall(conversation, callType))
  return button
}

function renderMessagesView() {
  const { header, input, send } = getElements()
  if (!header || !input || !send) return
  const { voiceRecord } = getElements()
  const conversation = messageState.conversations.find(item => item.id === selectedConversationId)
  renderConversationList()
  if (!conversation) {
    header.replaceChildren()
    const heading = make('div')
    heading.append(make('h2', '', 'Select a conversation'), make('p', '', 'Start a direct message or create a group or channel.'))
    header.append(heading)
    input.disabled = true
    send.disabled = true
    if (voiceRecord) voiceRecord.disabled = true
    renderMessagesList()
    return
  }
  header.replaceChildren()
  const heading = make('div')
  const prefix = conversation.type === 'channel' ? '# ' : conversation.type === 'group' ? '◉ ' : ''
  heading.append(make('h2', '', `${prefix}${getConversationTitle(conversation)}`))
  const subtitle = make('p')
  if (conversation.type === 'direct') {
    subtitle.className = 'messages-presence messages-presence-offline'
    subtitle.setAttribute('aria-live', 'polite')
    renderDirectMessagePresence(conversation, subtitle)
  } else {
    subtitle.textContent = conversation.participants.map(member => member.name || member.email).join(', ')
  }
  heading.append(subtitle)
  header.append(heading)
  const actions = make('div', 'messages-thread-actions')
  if (conversation.type === 'direct') {
    actions.append(
      createCallLaunchButton(conversation, 'audio'),
      createCallLaunchButton(conversation, 'video')
    )
  }
  if (conversation.type === 'channel') {
    const catchUp = make('button', 'catch-up-ai-btn', '⚡ Catch Me Up')
    catchUp.type = 'button'
    catchUp.addEventListener('click', () => summarizeActiveConversation(catchUp))
    actions.append(catchUp)
  }
  const trigger = make('button', 'message-actions-trigger messages-thread-actions-trigger', '⋮')
  trigger.type = 'button'
  trigger.setAttribute('aria-label', 'Conversation actions')
  trigger.setAttribute('aria-expanded', 'false')
  const menu = make('div', 'message-actions-menu messages-thread-actions-menu')
  menu.hidden = true
  const clearButton = make('button', 'message-action-option destructive', 'Clear all messages')
  clearButton.type = 'button'
  clearButton.addEventListener('click', () => {
    menu.hidden = true
    trigger.setAttribute('aria-expanded', 'false')
    clearConversationMessages(conversation)
  })
  const deleteChatButton = make('button', 'message-action-option destructive', 'Delete chat for me')
  deleteChatButton.type = 'button'
  deleteChatButton.addEventListener('click', () => {
    menu.hidden = true
    trigger.setAttribute('aria-expanded', 'false')
    deleteConversationForMe(conversation)
  })
  menu.append(clearButton, deleteChatButton)
  trigger.addEventListener('click', () => {
    menu.hidden = !menu.hidden
    trigger.setAttribute('aria-expanded', String(!menu.hidden))
  })
  actions.append(trigger, menu)
  header.append(actions)
  input.disabled = false
  send.disabled = false
  if (voiceRecord) voiceRecord.disabled = false
  renderMessagesList()
}

export function renderMessages() {
  if (activeView !== 'Messages') return
  updateMessagesNavigationBadge()
  renderPeopleList()
  renderMessagesView()
}

async function openDirectConversation(contact) {
  const project = findSharedProjectWithMember(contact.firebaseUid)
  if (!project) {
    showError(new Error('You and this teammate do not share an accessible project.'))
    return
  }
  try {
    const result = await api.post('/messages/conversations', {
      projectId: project.projectId,
      type: 'direct',
      memberFirebaseUids: [contact.firebaseUid]
    })
    const conversation = result?.data?.conversation
    await refreshFromServer()
    if (conversation?.conversation_id) await selectConversation(conversation.conversation_id)
  } catch (error) {
    showError(error, 'POST /messages/conversations (start direct conversation)')
  }
}

async function reopenDirectConversation(conversation) {
  const peerUid = conversation.memberUids?.find(uid => uid !== currentUid()) ||
    conversation.participants?.find(member => member.firebaseUid !== currentUid())?.firebaseUid
  const project = peerUid ? findSharedProjectWithMember(peerUid) : null
  if (!project) return null
  const result = await api.post('/messages/conversations', {
    projectId: project.projectId,
    type: 'direct',
    memberFirebaseUids: [peerUid]
  })
  const conversationId = result?.data?.conversation?.conversation_id
  if (!conversationId) {
    throw new Error('The messaging service did not return the reopened conversation.')
  }
  return conversationId
}

function openConversationModal(type) {
  const backdrop = make('div', 'modal-backdrop')
  const form = make('form', 'modal messages-create-modal')
  form.setAttribute('role', 'dialog')
  form.setAttribute('aria-modal', 'true')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.setAttribute('aria-label', 'Close dialog')
  close.addEventListener('click', () => backdrop.remove())
  const channel = type === 'channel'
  const group = type === 'group'
  const title = make('h2', '', channel ? 'Create a channel' : group ? 'Create a group' : 'Start a direct message')
  title.id = 'messages-create-title'
  form.setAttribute('aria-labelledby', title.id)
  const header = make('header', 'messages-create-header')
  header.append(make('span', 'messages-create-eyebrow', 'MESSAGES'), title,
    make('p', 'modal-copy', channel ? 'Create a shared channel and invite teammates.' : group ? 'Name a group conversation and choose teammates.' : 'Choose one teammate to start a private conversation.'), close)
  const projectSelect = document.createElement('select')
  projectSelect.required = true
  projectSelect.setAttribute('aria-label', 'Project')
  projects.forEach(project => {
    const option = document.createElement('option')
    option.value = project.projectId
    option.textContent = project.name
    projectSelect.append(option)
  })
  const projectLabel = make('label', 'messages-create-label', 'Project')
  projectLabel.append(projectSelect)
  const nameInput = make('input')
  nameInput.placeholder = channel ? 'e.g. design-team' : 'e.g. Product launch team'
  nameInput.maxLength = 60
  nameInput.required = channel || group
  nameInput.setAttribute('aria-label', channel ? 'Channel name' : 'Group name')
  const nameLabel = make('label', 'messages-create-label', channel ? 'Channel name' : 'Group name')
  if (channel || group) nameLabel.append(nameInput)
  else nameLabel.hidden = true
  const memberLabel = make('p', 'messages-create-label', channel ? 'Invite teammates' : 'Choose teammates')
  const membersList = make('div', 'messages-member-list')
  const renderMembers = () => {
    membersList.replaceChildren()
    const contacts = getContacts(projectSelect.value)
    contacts.forEach(contact => {
      const option = make('label', 'messages-member-option')
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.name = 'message-members'
      checkbox.value = contact.firebaseUid
      checkbox.addEventListener('change', () => option.classList.toggle('selected', checkbox.checked))
      const avatar = make('span', 'messages-create-avatar')
      renderAvatarElement(avatar, contact, 'messages-create-avatar')
      option.append(checkbox, avatar, make('span', '', contact.name), make('small', '', contact.email))
      membersList.append(option)
    })
    if (!contacts.length) membersList.append(make('p', 'messages-list-empty', 'No accepted teammates are available in this project.'))
  }
  projectSelect.addEventListener('change', renderMembers)
  renderMembers()
  const submit = make('button', 'primary-button full messages-create-submit', channel ? 'Create channel' : group ? 'Create group' : 'Start direct message')
  submit.type = 'submit'
  const error = make('p', 'messages-error')
  error.setAttribute('role', 'alert')
  error.hidden = true
  form.append(header, projectLabel, nameLabel, memberLabel, membersList, error, submit)
  backdrop.append(form)
  backdrop.addEventListener('click', event => { if (event.target === backdrop) backdrop.remove() })
  document.querySelector('#modal-root').append(backdrop)
  const selectedMembers = () => [...form.querySelectorAll('input[name="message-members"]:checked')]
  form.addEventListener('submit', async event => {
    event.preventDefault()
    const selected = selectedMembers()
    if (!projectSelect.value || (type === 'direct' && selected.length !== 1) ||
      (group && selected.length < 2) || (channel && selected.length < 1)) {
      error.textContent = type === 'direct' ? 'Choose one teammate.' : group ? 'Choose at least two teammates.' : 'Choose at least one teammate.'
      error.hidden = false
      return
    }
    submit.disabled = true
    try {
      const result = await api.post('/messages/conversations', {
        projectId: projectSelect.value,
        type,
        name: nameInput.value.trim(),
        memberFirebaseUids: selected.map(input => input.value)
      })
      backdrop.remove()
      await refreshFromServer()
      const conversationId = result?.data?.conversation?.conversation_id
      if (conversationId) await selectConversation(conversationId)
    } catch (requestError) {
      showError(requestError, `POST /messages/conversations (create ${type})`)
      error.textContent = requestError.message
      error.hidden = false
      submit.disabled = false
    }
  })
}

async function mutateMessage(message, action, body = {}) {
  try {
    await api.patch(`${apiPath(message.conversationId)}/messages/${encodeURIComponent(message.id)}/${action}`, body)
    await refreshFromServer()
  } catch (error) {
    showError(error)
  }
}

function toggleReaction(message, emoji) {
  return mutateMessage(message, 'reaction', { emoji })
}

async function deleteMessage(message, scope) {
  try {
    await api.delete(
      `${apiPath(message.conversationId)}/messages/${encodeURIComponent(message.id)}`,
      { scope }
    )
    if (scope === 'me') {
      messageState.messages = messageState.messages.filter(item => item.id !== message.id)
    } else {
      messageState.messages = messageState.messages.map(item =>
        item.id === message.id
          ? { ...item, body: 'This message was deleted', attachments: [], isDeleted: true }
          : item
      )
    }
    renderMessages()
  } catch (error) {
    console.error('[messages] Message deletion API request failed.', {
      conversationId: message.conversationId,
      messageId: message.id,
      scope,
      status: error?.status || null,
      code: error?.code || error?.payload?.code || null,
      message: error?.message || String(error),
      serverMessage: error?.payload?.message || null
    })
    showError(error, `delete message ${message.id} (${scope})`)
  }
}

function startReply(message) {
  replyTargetId = message.id
  editingMessageId = null
  setSendButtonMode(false)
  renderComposerContext()
  getElements().input.focus()
}

function startEdit(message) {
  replyTargetId = null
  editingMessageId = message.id
  getElements().input.value = message.body
  renderComposerContext()
  getElements().input.focus()
}

function renderComposerContext() {
  const { composeField } = getElements()
  if (!composeField) return
  let context = composeField.querySelector('.messages-composer-context')
  if (!context) {
    context = make('div', 'messages-composer-context')
    composeField.prepend(context)
  }
  context.replaceChildren()
  if (!replyTargetId && !editingMessageId) {
    context.hidden = true
    return
  }
  const target = messageState.messages.find(item => item.id === (replyTargetId || editingMessageId))
  context.hidden = false
  const details = make('div', 'messages-composer-context-details')
  details.append(make('strong', '', editingMessageId ? 'Editing message' : `Replying to ${target?.senderName || 'message'}`),
    make('span', '', target?.body || (target?.attachments?.length ? 'Attachment' : 'Message')))
  const close = make('button', 'messages-composer-context-close', '×')
  close.type = 'button'
  close.setAttribute('aria-label', 'Cancel')
  close.addEventListener('click', cancelComposerContext)
  context.append(details, close)
}

function cancelComposerContext() {
  if (editingMessageId) getElements().input.value = ''
  replyTargetId = null
  editingMessageId = null
  setSendButtonMode(false)
  renderComposerContext()
}

function createRecipientOption(member, {
  selected,
  disabled = false,
  name = '',
  onChange
}) {
  const option = make('label', `messages-forward-recipient${selected ? ' selected' : ''}`)
  const avatar = make('span', 'messages-forward-avatar')
  renderAvatarElement(avatar, member, 'messages-forward-avatar')
  const details = make('span', 'messages-forward-recipient-details')
  details.append(make('strong', '', member.name), make('small', '', member.email))
  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  if (name) checkbox.name = name
  if (member.firebaseUid) checkbox.value = member.firebaseUid
  checkbox.checked = selected
  checkbox.disabled = disabled
  checkbox.addEventListener('change', () => {
    option.classList.toggle('selected', checkbox.checked)
    onChange(checkbox.checked, option)
  })
  option.append(avatar, details, checkbox)
  return option
}

function openCallInviteModal(call) {
  if (!call?.isCaller) return
  const availableProjects = projects.filter(project =>
    getProjectMembers(project).some(member => member.firebaseUid === currentUid())
  )
  if (!availableProjects.length) {
    showCallError(new Error('You do not have a project with members available to invite.'), 'load call invite projects', {
      callId: call.callId
    })
    return
  }

  const backdrop = make('div', 'modal-backdrop messages-call-invite-backdrop')
  const form = make('form', 'modal messages-forward-modal messages-call-invite-modal')
  form.setAttribute('role', 'dialog')
  form.setAttribute('aria-modal', 'true')
  form.setAttribute('aria-label', 'Add people to call')
  const closeModal = () => {
    backdrop.remove()
    document.removeEventListener('keydown', onKeyDown)
  }
  const onKeyDown = event => {
    if (event.key === 'Escape') closeModal()
  }
  const header = make('header', 'messages-forward-header')
  const cancel = make('button', 'messages-forward-cancel', 'Cancel')
  cancel.type = 'button'
  cancel.addEventListener('click', closeModal)
  header.append(cancel, make('h2', '', 'Add people to call'), make('span', 'messages-forward-selection-count'))

  const projectControl = make('div', 'messages-call-project-control')
  const projectSelect = document.createElement('select')
  projectSelect.className = 'messages-call-project-select'
  projectSelect.id = `call-project-${call.callId}`
  const projectLabel = make('label', '', 'Project')
  projectLabel.htmlFor = projectSelect.id
  availableProjects.forEach(project => {
    const option = document.createElement('option')
    option.value = project.projectId
    option.textContent = project.name
    projectSelect.append(option)
  })
  projectControl.append(projectLabel, projectSelect)

  const searchWrap = make('label', 'messages-forward-search')
  const searchIcon = make('span', '', '⌕')
  searchIcon.setAttribute('aria-hidden', 'true')
  const search = document.createElement('input')
  search.type = 'search'
  search.placeholder = 'Search name or email'
  search.setAttribute('aria-label', 'Search project members')
  searchWrap.append(searchIcon, search)
  const membersList = make('div', 'messages-forward-list messages-call-member-list')
  const modalError = make('p', 'messages-error')
  modalError.setAttribute('role', 'alert')
  modalError.hidden = true
  const footer = make('footer', 'messages-forward-footer')
  const selectedSummary = make('span', 'messages-forward-selected', 'Select teammates')
  const submit = make('button', 'primary-button messages-forward-submit', 'Add to call')
  submit.type = 'submit'
  submit.disabled = true
  footer.append(selectedSummary, submit)

  const activeUids = new Set((call.participants || [])
    .filter(participant => ['ringing', 'accepted'].includes(participant.status))
    .map(participant => participant.firebase_uid))
  const maxAdditional = Math.max(0, 4 - activeUids.size)
  const selectedUids = new Set()
  const selectionCount = header.querySelector('.messages-forward-selection-count')
  const updateSelection = () => {
    const count = selectedUids.size
    selectionCount.textContent = count ? `${count} selected` : ''
    selectedSummary.textContent = count
      ? `${count} selected · ${maxAdditional} available`
      : `${maxAdditional} invite${maxAdditional === 1 ? '' : 's'} available`
    submit.disabled = count === 0 || count > maxAdditional
  }
  const renderRecipients = () => {
    const query = search.value.trim().toLowerCase()
    const project = availableProjects.find(item => item.projectId === projectSelect.value)
    const recipients = (project ? getProjectMembers(project) : [])
      .filter(member => member.firebaseUid !== currentUid() && !activeUids.has(member.firebaseUid))
      .filter(member => !query || `${member.name} ${member.email}`.toLowerCase().includes(query))
      .sort((left, right) => left.name.localeCompare(right.name))
    membersList.replaceChildren()
    recipients.forEach(member => {
      const selected = selectedUids.has(member.firebaseUid)
      const option = createRecipientOption(member, {
        selected,
        disabled: !selected && selectedUids.size >= maxAdditional,
        onChange: checked => {
          if (checked) selectedUids.add(member.firebaseUid)
          else selectedUids.delete(member.firebaseUid)
          updateSelection()
          renderRecipients()
        }
      })
      membersList.append(option)
    })
    if (!membersList.childElementCount) {
      membersList.append(make('p', 'messages-forward-empty', query
        ? 'No matching project members.'
        : 'No eligible members in this project.'))
    }
  }
  search.addEventListener('input', renderRecipients)
  projectSelect.addEventListener('change', () => {
    selectedUids.clear()
    updateSelection()
    renderRecipients()
  })
  renderRecipients()
  updateSelection()
  form.append(header, projectControl, searchWrap, membersList, modalError, footer)
  backdrop.append(form)
  document.querySelector('#modal-root').append(backdrop)
  document.addEventListener('keydown', onKeyDown)
  search.focus()
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) closeModal()
  })
  form.addEventListener('submit', async event => {
    event.preventDefault()
    if (!selectedUids.size || selectedUids.size > maxAdditional) return
    submit.disabled = true
    try {
      const result = await api.post(
        `${apiPath(call.conversationId)}/calls/${call.callId}/invite`,
        { projectId: projectSelect.value, participantFirebaseUids: [...selectedUids] }
      )
      if (!result?.data?.invited?.length) {
        throw new Error('Those teammates are already invited or in the call.')
      }
      closeModal()
    } catch (error) {
      showCallError(error, 'invite call participants', {
        callId: call.callId,
        conversationId: call.conversationId,
        projectId: projectSelect.value
      })
      modalError.textContent = error.message
      modalError.hidden = false
      submit.disabled = false
    }
  })
}

function openForwardModal(message) {
  const backdrop = make('div', 'modal-backdrop')
  const form = make('form', 'modal messages-forward-modal')
  form.setAttribute('role', 'dialog')
  form.setAttribute('aria-modal', 'true')
  form.setAttribute('aria-label', 'Forward message')
  const closeModal = () => {
    backdrop.remove()
    document.removeEventListener('keydown', onKeyDown)
  }
  const onKeyDown = event => {
    if (event.key === 'Escape') closeModal()
  }
  const header = make('header', 'messages-forward-header')
  const cancel = make('button', 'messages-forward-cancel', 'Cancel')
  cancel.type = 'button'
  cancel.addEventListener('click', closeModal)
  const title = make('h2', '', 'Send to')
  const selectionCount = make('span', 'messages-forward-selection-count')
  header.append(cancel, title, selectionCount)

  const searchWrap = make('label', 'messages-forward-search')
  const searchIcon = make('span', '', '⌕')
  searchIcon.setAttribute('aria-hidden', 'true')
  const search = document.createElement('input')
  search.type = 'search'
  search.placeholder = 'Search name or email'
  search.setAttribute('aria-label', 'Search recipients')
  searchWrap.append(searchIcon, search)

  const preview = make('div', 'messages-forward-preview')
  const sender = make('div', 'messages-forward-sender')
  const senderAvatar = make('span', 'messages-forward-avatar')
  renderAvatarElement(senderAvatar, currentUser, 'messages-forward-avatar')
  const senderDetails = make('span', 'messages-forward-sender-details')
  senderDetails.append(make('strong', '', currentUser.name), make('small', '', currentUser.email))
  sender.append(senderAvatar, senderDetails)
  const previewLabel = make('strong', '', 'Forwarded message')
  const previewText = make('span', '', message.body || (message.attachments?.length
    ? `${message.attachments.length} attachment${message.attachments.length === 1 ? '' : 's'}`
    : 'Message'))
  const previewContent = make('div', 'messages-forward-preview-content')
  previewContent.append(previewLabel, previewText)
  preview.append(sender, previewContent)

  const contacts = getContacts().map(contact => {
    const project = projects.find(item => {
      const members = getProjectMembers(item)
      return members.some(member => member.firebaseUid === currentUid()) &&
        members.some(member => member.firebaseUid === contact.firebaseUid)
    })
    return project ? { ...contact, projectId: project.projectId } : null
  }).filter(Boolean)
  const contactsByEmail = new Map(contacts.map(contact => [contact.email, contact]))
  const frequency = new Map(contacts.map(contact => [contact.email, 0]))
  const recent = []
  const recentSet = new Set()
  messageState.conversations
    .filter(conversation => conversation.type === 'direct')
    .sort((a, b) => Date.parse(b.latestMessageCreatedAt || b.createdAt) - Date.parse(a.latestMessageCreatedAt || a.createdAt))
    .forEach(conversation => {
      const participant = conversation.participants.find(member =>
        member.firebaseUid !== currentUid() && member.email !== currentEmail())
      const contact = contactsByEmail.get(participant?.email)
      if (contact && !recentSet.has(contact.email)) {
        recentSet.add(contact.email)
        recent.push(contact.email)
      }
      messageState.messages.filter(message => message.conversationId === conversation.id)
        .forEach(message => {
          if (message.senderEmail !== currentEmail() && frequency.has(message.senderEmail)) {
            frequency.set(message.senderEmail, frequency.get(message.senderEmail) + 1)
          }
        })
    })
  const frequent = contacts
    .filter(contact => frequency.get(contact.email) > 0)
    .sort((a, b) => frequency.get(b.email) - frequency.get(a.email) || a.name.localeCompare(b.name))
    .slice(0, 5)
    .map(contact => contact.email)
  const frequentSet = new Set(frequent)
  const recentOnly = recent.filter(email => !frequentSet.has(email))
  const represented = new Set([...frequent, ...recentOnly])
  const sections = [
    { title: 'Frequently contacted', emails: frequent },
    { title: 'Recent chats', emails: recentOnly },
    { title: 'All teammates', emails: contacts.filter(contact => !represented.has(contact.email)).map(contact => contact.email) }
  ].filter(section => section.emails.length)

  const membersList = make('div', 'messages-forward-list')
  const modalError = make('p', 'messages-error')
  modalError.setAttribute('role', 'alert')
  modalError.hidden = true
  const footer = make('footer', 'messages-forward-footer')
  const selectedSummary = make('span', 'messages-forward-selected', 'Select recipients')
  const submit = make('button', 'primary-button messages-forward-submit', 'Forward')
  submit.type = 'submit'
  submit.disabled = true
  footer.append(selectedSummary, submit)

  const selectedUids = new Set()
  const updateSelection = () => {
    const count = selectedUids.size
    selectionCount.textContent = count ? `${count} selected` : ''
    selectedSummary.textContent = count ? `${count} recipient${count === 1 ? '' : 's'} selected` : 'Select recipients'
    submit.disabled = count === 0
  }
  const renderRecipients = () => {
    const query = search.value.trim().toLowerCase()
    membersList.replaceChildren()
    sections.forEach(section => {
      const matches = section.emails
        .map(email => contactsByEmail.get(email))
        .filter(contact => contact && (!query || `${contact.name} ${contact.email}`.toLowerCase().includes(query)))
      if (!matches.length) return
      membersList.append(make('h3', 'messages-forward-section-title', section.title))
      matches.forEach(contact => {
        membersList.append(createRecipientOption(contact, {
          selected: selectedUids.has(contact.firebaseUid),
          name: 'forward-members',
          onChange: checked => {
            if (checked) selectedUids.add(contact.firebaseUid)
            else selectedUids.delete(contact.firebaseUid)
          updateSelection()
          }
        }))
      })
    })
    if (!membersList.childElementCount) {
      membersList.append(make('p', 'messages-forward-empty', query
        ? 'No matching teammates.'
        : 'No teammates are available to forward to.'))
    }
  }
  search.addEventListener('input', renderRecipients)
  renderRecipients()
  form.append(header, searchWrap, preview, membersList, modalError, footer)
  backdrop.append(form)
  document.querySelector('#modal-root').append(backdrop)
  document.addEventListener('keydown', onKeyDown)
  search.focus()
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) closeModal()
  })
  form.addEventListener('submit', async event => {
    event.preventDefault()
    if (!selectedUids.size) return
    submit.disabled = true
    try {
      for (const uid of selectedUids) {
        const contact = contacts.find(item => item.firebaseUid === uid)
        if (!contact) continue
        const result = await api.post('/messages/conversations', {
          projectId: contact.projectId,
          type: 'direct',
          memberFirebaseUids: [uid]
        })
        const destinationConversation = result?.data?.conversation
        const targetConversationId = destinationConversation?.conversation_id
        if (!targetConversationId) {
          throw new Error('The destination conversation could not be identified.')
        }
        await saveMessage({
          conversationId: targetConversationId,
          body: message.body,
          attachments: message.attachments,
          forwardedFrom: { senderName: message.senderName },
          destinationConversation,
          destinationMemberUid: uid
        })
      }
      closeModal()
      await refreshFromServer()
    } catch (error) {
      showError(error, 'create conversation and send forwarded message')
      modalError.textContent = error.message
      modalError.hidden = false
      submit.disabled = false
    }
  })
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () => reject(reader.error || new Error(`Unable to read ${file.name}.`)))
    reader.readAsDataURL(file)
  })
}

function formatVoiceDuration(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0')
  return `${minutes}:${remainingSeconds}`
}

function buildVoiceWaveformPeaks(samples, peakCount = 40) {
  if (!samples.length) return Array(peakCount).fill(0.08)
  return Array.from({ length: peakCount }, (_, index) => {
    const start = Math.floor(index * samples.length / peakCount)
    const end = Math.max(start + 1, Math.floor((index + 1) * samples.length / peakCount))
    const peak = Math.max(...samples.slice(start, end))
    return Math.round(Math.max(0.08, Math.min(1, peak)) * 1000) / 1000
  })
}

function drawLiveVoiceWaveform() {
  if (!mediaRecorder || mediaRecorder.state !== 'recording' || !voiceRecordingAnalyser) return
  const now = performance.now()
  if (now - voiceRecordingSampledAt >= 80) {
    const samples = new Uint8Array(voiceRecordingAnalyser.fftSize)
    voiceRecordingAnalyser.getByteTimeDomainData(samples)
    const rms = Math.sqrt(samples.reduce((sum, sample) => {
      const amplitude = (sample - 128) / 128
      return sum + amplitude * amplitude
    }, 0) / samples.length)
    voiceRecordingSamples.push(Math.max(0.08, Math.min(1, rms * 3.5)))
    voiceRecordingSampledAt = now

    const { recordingWaveform } = getElements()
    const bars = recordingWaveform?.querySelectorAll('.messages-waveform-bar') || []
    const livePeaks = buildVoiceWaveformPeaks(voiceRecordingSamples.slice(-bars.length), bars.length)
    bars.forEach((bar, index) => {
      bar.style.setProperty('--bar-height', `${16 + Math.round(livePeaks[index] * 84)}%`)
    })
  }
  voiceRecordingFrame = window.requestAnimationFrame(drawLiveVoiceWaveform)
}

function releaseVoiceRecordingAudioGraph() {
  if (voiceRecordingFrame !== null) {
    window.cancelAnimationFrame(voiceRecordingFrame)
    voiceRecordingFrame = null
  }
  try {
    voiceRecordingSource?.disconnect()
    voiceRecordingSource = null
    voiceRecordingAnalyser?.disconnect()
    voiceRecordingAnalyser = null
  } catch (error) {
    console.warn('[messages] Unable to disconnect the voice waveform analyser.', error)
  }
  if (voiceRecordingAudioContext) {
    const context = voiceRecordingAudioContext
    voiceRecordingAudioContext = null
    context.close().catch(error => {
      console.warn('[messages] Unable to close the voice recording audio context.', error)
    })
  }
}

function updateVoiceRecordingStatus() {
  const { voiceStatus } = getElements()
  if (voiceStatus) {
    const elapsed = voiceRecordingElapsedMs +
      (mediaRecorder?.state === 'recording' ? Date.now() - voiceRecordingStartedAt : 0)
    voiceStatus.textContent = formatVoiceDuration(Math.floor(elapsed / 1000))
  }
}

function resetVoiceRecordingUi() {
  const { voiceRecord, voiceStatus, voiceCancel, voicePause, recordingPanel, composer } = getElements()
  clearInterval(voiceRecordingTimer)
  voiceRecordingTimer = null
  voiceRecordingElapsedMs = 0
  voiceRecordingStartedAt = 0
  voiceRecordingSamples = []
  voiceRecordingSampledAt = 0
  voiceRecordingShouldSend = false
  if (voiceRecord) {
    voiceRecord.replaceChildren(createVoiceRecordIcon())
    voiceRecord.classList.remove('is-recording')
    voiceRecord.setAttribute('aria-label', 'Record a voice note')
    voiceRecord.title = 'Record a voice note'
    voiceRecord.disabled = !selectedConversationId
  }
  if (voiceStatus) voiceStatus.textContent = '00:00'
  if (voiceCancel) voiceCancel.hidden = true
  if (voicePause) {
    voicePause.disabled = false
    voicePause.replaceChildren(createVoicePlayerIcon(true), make('span', '', 'Pause'))
  }
  if (recordingPanel) {
    recordingPanel.hidden = true
    recordingPanel.classList.remove('is-paused')
    recordingPanel.querySelector('#messages-recording-waveform')?.replaceChildren()
  }
  composer?.classList.remove('is-recording')
}

function toggleVoiceRecordingPause() {
  if (!mediaRecorder) return
  const { recordingPanel, voicePause } = getElements()
  if (mediaRecorder.state === 'recording') {
    voiceRecordingElapsedMs += Date.now() - voiceRecordingStartedAt
    voiceRecordingStartedAt = 0
    mediaRecorder.pause()
    if (voiceRecordingFrame !== null) {
      window.cancelAnimationFrame(voiceRecordingFrame)
      voiceRecordingFrame = null
    }
    recordingPanel?.classList.add('is-paused')
    if (voicePause) {
      voicePause.replaceChildren(createVoicePlayerIcon(false), make('span', '', 'Resume'))
      voicePause.setAttribute('aria-label', 'Resume voice recording')
    }
  } else if (mediaRecorder.state === 'paused') {
    voiceRecordingStartedAt = Date.now()
    mediaRecorder.resume()
    recordingPanel?.classList.remove('is-paused')
    if (voicePause) {
      voicePause.replaceChildren(createVoicePlayerIcon(true), make('span', '', 'Pause'))
      voicePause.setAttribute('aria-label', 'Pause voice recording')
    }
    voiceRecordingFrame = window.requestAnimationFrame(drawLiveVoiceWaveform)
  }
  updateVoiceRecordingStatus()
}

function stopVoiceRecording() {
  if (!mediaRecorder || !['recording', 'paused'].includes(mediaRecorder.state)) return
  if (mediaRecorder.state === 'recording') {
    voiceRecordingElapsedMs += Date.now() - voiceRecordingStartedAt
  }
  voiceRecordingStartedAt = 0
  mediaRecorder.stop()
}

function sendVoiceRecording() {
  if (!mediaRecorder || !['recording', 'paused'].includes(mediaRecorder.state)) return
  voiceRecordingShouldSend = true
  stopVoiceRecording()
}

async function startVoiceRecording() {
  if (mediaRecorder) {
    stopVoiceRecording()
    return
  }
  if (voiceRecordingStarting) return
  if (!selectedConversationId || !navigator.mediaDevices?.getUserMedia ||
    typeof MediaRecorder === 'undefined') {
    showError(new Error('Voice recording is not available in this browser or secure connection.'))
    return
  }
  const remainingBytes = maxAttachmentBytes -
    pendingFiles.reduce((total, file) => total + file.size, 0)
  if (remainingBytes <= 0) {
    showError(new Error('Remove an attachment before recording a voice note.'))
    return
  }
  voiceRecordingStarting = true
  const targetConversationId = selectedConversationId
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        channelCount: { ideal: 1 },
        sampleRate: { ideal: 48_000 },
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true },
        autoGainControl: { ideal: true }
      }
    })
    if (!firebaseAuth.currentUser || targetConversationId !== selectedConversationId) {
      mediaStream.getTracks().forEach(track => track.stop())
      mediaStream = null
      return
    }
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext
    if (AudioContextConstructor) {
      try {
        voiceRecordingAudioContext = new AudioContextConstructor()
        await voiceRecordingAudioContext.resume()
        voiceRecordingAnalyser = voiceRecordingAudioContext.createAnalyser()
        voiceRecordingAnalyser.fftSize = 1024
        voiceRecordingSource = voiceRecordingAudioContext.createMediaStreamSource(mediaStream)
        voiceRecordingSource.connect(voiceRecordingAnalyser)
      } catch (error) {
        console.warn('[messages] Live voice-note waveform is unavailable; recording will continue.', error)
        releaseVoiceRecordingAudioGraph()
      }
    }

    const preferredMimeTypes = [
      'audio/ogg;codecs=opus',
      'audio/webm;codecs=opus',
      'audio/mp4;codecs=mp4a.40.2',
      'audio/mp4'
    ]
    const supportedMimeTypes = typeof MediaRecorder.isTypeSupported === 'function'
      ? preferredMimeTypes.filter(type => MediaRecorder.isTypeSupported(type))
      : []
    let selectedRecorder
    let recorderError
    for (const mimeType of supportedMimeTypes) {
      try {
        selectedRecorder = new MediaRecorder(mediaStream, {
          mimeType,
          audioBitsPerSecond: 24_000
        })
        break
      } catch (error) {
        if (error.name !== 'NotSupportedError') throw error
        recorderError = error
      }
    }
    if (!selectedRecorder) {
      try {
        selectedRecorder = new MediaRecorder(mediaStream, { audioBitsPerSecond: 24_000 })
      } catch (error) {
        if (error.name !== 'NotSupportedError' || !supportedMimeTypes.length) throw error
        throw new Error('This browser cannot record audio in a format supported by Collab.', {
          cause: recorderError || error
        })
      }
    }
    mediaRecorder = selectedRecorder
    voiceRecordingChunks = []
    voiceRecordingSamples = []
    voiceRecordingSampledAt = 0
    voiceRecordingConversationId = targetConversationId
    cancelVoiceRecordingOnStop = false
    voiceRecordingShouldSend = false
    voiceRecordingElapsedMs = 0
    voiceRecordingStartedAt = Date.now()
    const { voiceRecord, voiceStatus, voiceCancel, voicePause, recordingPanel, recordingWaveform, composer } = getElements()
    voiceRecord?.replaceChildren(createVoiceRecordIcon(true))
    voiceRecord?.classList.add('is-recording')
    voiceRecord?.setAttribute('aria-label', 'Stop recording voice note')
    if (voiceRecord) voiceRecord.title = 'Stop recording'
    if (voiceStatus) voiceStatus.textContent = '00:00'
    if (voiceCancel) voiceCancel.hidden = false
    if (voicePause) voicePause.setAttribute('aria-label', 'Pause voice recording')
    if (recordingPanel) {
      recordingPanel.hidden = false
      recordingPanel.classList.remove('is-paused')
    }
    if (recordingWaveform) {
      const bars = createVoiceWaveform('messages-recording-bars', '', Array(40).fill(0.08))
      recordingWaveform.replaceChildren(...Array.from(bars.children))
    }
    composer?.classList.add('is-recording')
    updateVoiceRecordingStatus()
    voiceRecordingTimer = setInterval(updateVoiceRecordingStatus, 1000)
    voiceRecordingFrame = window.requestAnimationFrame(drawLiveVoiceWaveform)
    mediaRecorder.addEventListener('dataavailable', event => {
      if (event.data.size) voiceRecordingChunks.push(event.data)
      const totalSize = voiceRecordingChunks.reduce((size, chunk) => size + chunk.size, 0)
      const safetyMargin = Math.min(24 * 1024, Math.ceil(remainingBytes * 0.06))
      const stopThreshold = remainingBytes - safetyMargin
      if (totalSize >= stopThreshold && mediaRecorder?.state === 'recording') {
        stopVoiceRecording()
      }
    })
    mediaRecorder.addEventListener('stop', async () => {
      const recorder = mediaRecorder
      const chunks = voiceRecordingChunks
      const recordingType = recorder?.mimeType || chunks[0]?.type || 'audio/webm'
      mediaRecorder = null
      mediaStream?.getTracks().forEach(track => track.stop())
      mediaStream = null
      voiceRecordingChunks = []
      const conversationId = voiceRecordingConversationId
      voiceRecordingConversationId = null
      const cancelled = cancelVoiceRecordingOnStop
      cancelVoiceRecordingOnStop = false
      const shouldSend = voiceRecordingShouldSend
      const durationSeconds = Math.max(1, Math.ceil(voiceRecordingElapsedMs / 1000))
      const waveformPeaks = buildVoiceWaveformPeaks(voiceRecordingSamples)
      releaseVoiceRecordingAudioGraph()
      resetVoiceRecordingUi()
      if (cancelled || conversationId !== selectedConversationId || !chunks.length) return
      const currentAttachmentBytes = pendingFiles.reduce((size, file) => size + file.size, 0)
      const voiceNoteByteLimit = maxAttachmentBytes - currentAttachmentBytes
      const blob = new Blob(chunks, { type: recordingType })
      if (blob.size > voiceNoteByteLimit) {
        showError(new Error(
          'The voice note reached the message size limit and could not be added. Remove another attachment or record a shorter note.'
        ))
        return
      }
      const extension = recordingType.includes('mp4') ? 'm4a' :
        recordingType.includes('ogg') ? 'ogg' : 'webm'
      const voiceFile = new File([blob], `voice-note-${durationSeconds}s-${Date.now()}.${extension}`, {
        type: recordingType
      })
      voiceFile.isVoiceNote = true
      voiceFile.durationSeconds = durationSeconds
      voiceFile.waveformPeaks = waveformPeaks
      pendingFiles.push(voiceFile)
      clearError()
      if (shouldSend) getElements().composer?.requestSubmit()
      else renderPendingFiles()
    })
    mediaRecorder.addEventListener('error', event => {
      cancelVoiceRecordingOnStop = true
      mediaRecorder = null
      mediaStream?.getTracks().forEach(track => track.stop())
      mediaStream = null
      voiceRecordingChunks = []
      releaseVoiceRecordingAudioGraph()
      resetVoiceRecordingUi()
      showError(event.error || new Error('Voice recording failed.'))
    })
    mediaRecorder.start(250)
    voiceRecordingStarting = false
  } catch (error) {
    mediaStream?.getTracks().forEach(track => track.stop())
    mediaStream = null
    mediaRecorder = null
    voiceRecordingChunks = []
    releaseVoiceRecordingAudioGraph()
    resetVoiceRecordingUi()
    showError(error, 'start voice recording')
  } finally {
    voiceRecordingStarting = false
  }
}

function cancelVoiceRecording() {
  if (!mediaRecorder) return
  cancelVoiceRecordingOnStop = true
  if (['recording', 'paused'].includes(mediaRecorder.state)) mediaRecorder.stop()
  else {
    mediaStream?.getTracks().forEach(track => track.stop())
    mediaStream = null
    mediaRecorder = null
    voiceRecordingChunks = []
    releaseVoiceRecordingAudioGraph()
    resetVoiceRecordingUi()
  }
}

function renderPendingFiles() {
  const { attachmentList } = getElements()
  if (!attachmentList) return
  attachmentList.replaceChildren()
  pendingFiles.forEach((file, index) => {
    const tag = make(
      'span',
      `messages-attachment-tag${file.isVoiceNote ? ' messages-voice-note-tag' : ''}`,
      file.isVoiceNote ? `Voice note · ${formatFileSize(file.size)}` : file.name
    )
    const remove = make('button', '', '×')
    remove.type = 'button'
    remove.setAttribute('aria-label', `Remove ${file.name}`)
    remove.addEventListener('click', () => {
      pendingFiles.splice(index, 1)
      renderPendingFiles()
    })
    tag.append(remove)
    attachmentList.append(tag)
  })
}

async function sendMessage(event) {
  event.preventDefault()
  const { input } = getElements()
  const body = input.value.trim()
  let optimisticMessageId = null
  let optimisticConversation = null
  let previousLatestMessage = ''
  let previousLatestMessageCreatedAt = null
  try {
    if (editingMessageId) {
      if (!body) return
      const message = messageState.messages.find(item => item.id === editingMessageId)
      if (!message) return
      await api.patch(`${apiPath(message.conversationId)}/messages/${encodeURIComponent(message.id)}/edit`, { body })
      await loadConversationMessages(message.conversationId)
      renderMessages()
    } else {
      if (!selectedConversationId || (!body && pendingFiles.length === 0)) return
      const attachments = await Promise.all(pendingFiles.map(async file => ({
        fileName: file.name,
        mediaType: file.type || 'application/octet-stream',
        size: file.size,
        is_voice_note: Boolean(file.isVoiceNote),
        ...(file.isVoiceNote ? {
          duration_seconds: file.durationSeconds,
          waveform_peaks: file.waveformPeaks
        } : {}),
        data: await fileToDataUrl(file)
      })))
      const clientMessageId = crypto.randomUUID()
      optimisticMessageId = `temp:${clientMessageId}`
      const conversation = messageState.conversations.find(item => item.id === selectedConversationId)
      optimisticConversation = conversation
      previousLatestMessage = conversation?.latestMessage || ''
      previousLatestMessageCreatedAt = conversation?.latestMessageCreatedAt || null
      const replyTarget = messageState.messages.find(item => item.id === replyTargetId)
      const optimisticMessage = upsertMessage({
        id: optimisticMessageId,
        clientMessageId,
        conversation_id: selectedConversationId,
        sender_firebase_uid: currentUid(),
        sender_email: currentEmail(),
        sender_name: currentUser.name,
        body,
        reply_to_message_id: replyTargetId,
        reply_to_sender_name: replyTarget?.senderName || null,
        reply_to_body: replyTarget?.body || null,
        attachments,
        reactions: [],
        is_pinned: false,
        created_at: new Date().toISOString()
      })
      if (conversation) {
        conversation.latestMessage = getLatestMessagePreview(body, attachments)
        conversation.latestMessageCreatedAt = optimisticMessage.message.createdAt
      }
      renderMessages()
      const savedMessage = await saveMessage({
        conversationId: selectedConversationId,
        clientMessageId,
        body,
        replyToId: replyTargetId,
        attachments
      })
      const saved = upsertMessage({
        ...savedMessage,
        clientMessageId: savedMessage.clientMessageId || clientMessageId
      })
      if (conversation) {
        conversation.latestMessage = getLatestMessagePreview(
          saved.message.body,
          saved.message.attachments
        )
        conversation.latestMessageCreatedAt = saved.message.createdAt
      }
      if (saved.changed) renderMessages()
    }
    input.value = ''
    pendingFiles = []
    renderPendingFiles()
    cancelComposerContext()
    clearError()
  } catch (error) {
    showError(error, `send message to conversation ${selectedConversationId || 'unknown'}`)
    if (optimisticMessageId) {
      const pendingMessageExists = messageState.messages.some(item => item.id === optimisticMessageId)
      if (pendingMessageExists) {
        messageState.messages = messageState.messages.filter(item => item.id !== optimisticMessageId)
      }
      const savedMessageExists = messageState.messages.some(
        item => item.clientMessageId === optimisticMessageId.slice('temp:'.length)
      )
      if (pendingMessageExists && !savedMessageExists && optimisticConversation) {
        optimisticConversation.latestMessage = previousLatestMessage
        optimisticConversation.latestMessageCreatedAt = previousLatestMessageCreatedAt
      }
      if (pendingMessageExists) renderMessages()
    }
    showError(error)
  }
}

function insertEmoji(emoji) {
  const { input } = getElements()
  const start = input.selectionStart
  const end = input.selectionEnd
  input.setRangeText(emoji, start, end, 'end')
  input.focus()
}

function closeEmojiPicker() {
  const picker = getElements().emojiPicker
  if (picker) picker.hidden = true
}

export function initMessages() {
  if (messagesInitialized) return
  messagesInitialized = true
  console.info('[messages] Messaging client build loaded.', { buildId: messagesBuildId })
  document.querySelector('#messages-new-channel')?.addEventListener('click', () => openConversationModal('channel'))
  document.querySelector('#messages-new-group')?.addEventListener('click', () => openConversationModal('group'))
  document.querySelector('#messages-new-direct')?.addEventListener('click', () => openConversationModal('direct'))
  const { voiceRecord, voiceCancel, voicePause, voiceSend } = getElements()
  document.addEventListener('pointerdown', unlockCallRingtone)
  document.addEventListener('keydown', unlockCallRingtone)
  voiceRecord?.replaceChildren(createVoiceRecordIcon())
  if (voiceRecord) {
    voiceRecord.disabled = !selectedConversationId
    voiceRecord.addEventListener('click', startVoiceRecording)
  }
  voiceCancel?.addEventListener('click', cancelVoiceRecording)
  voicePause?.addEventListener('click', toggleVoiceRecordingPause)
  voiceSend?.addEventListener('click', sendVoiceRecording)
  document.querySelector('#messages-composer')?.addEventListener('submit', sendMessage)
  getElements().feed?.addEventListener('scroll', () => {
    if (selectedConversationId && getElements().feed.scrollTop < 80) {
      loadOlderMessages(selectedConversationId)
    }
  })
  document.querySelector('#messages-file-input')?.addEventListener('change', event => {
    const incomingFiles = [...event.currentTarget.files]
    const totalSize = [...pendingFiles, ...incomingFiles].reduce((sum, file) => sum + file.size, 0)
    if (totalSize > maxAttachmentBytes) {
      showError(new Error('Attachments must total 512 KB or less per message.'))
      event.currentTarget.value = ''
      return
    }
    pendingFiles.push(...incomingFiles)
    event.currentTarget.value = ''
    renderPendingFiles()
  })
  const emojiPicker = getElements().emojiPicker
  if (emojiPicker) {
    reactionChoices.forEach(emoji => {
      const button = make('button', 'messages-emoji-choice', emoji)
      button.type = 'button'
      button.setAttribute('aria-label', `Insert ${emoji}`)
      button.addEventListener('click', () => {
        insertEmoji(emoji)
        closeEmojiPicker()
      })
      emojiPicker.append(button)
    })
  }
  document.querySelector('#messages-emoji-toggle')?.addEventListener('click', () => {
    const picker = getElements().emojiPicker
    if (picker) picker.hidden = !picker.hidden
  })
  document.addEventListener('click', event => {
    const picker = getElements().emojiPicker
    if (picker && !picker.contains(event.target) && !event.target.closest('#messages-emoji-toggle')) closeEmojiPicker()
  })
  document.addEventListener('click', event => {
    if (event.target.closest('.message-add-reaction-wrap, .messages-emoji-menu')) return
    document.querySelectorAll('.messages-emoji-menu:not([hidden])').forEach(picker => { picker.hidden = true })
  })
  document.addEventListener('click', event => {
    if (event.target.closest('.message-actions, .messages-thread-actions')) return
    document.querySelectorAll('.message-actions-menu:not([hidden])').forEach(menu => { menu.hidden = true })
    document.querySelectorAll('.message-actions-trigger[aria-expanded="true"]').forEach(trigger => {
      trigger.setAttribute('aria-expanded', 'false')
    })
  })
}

export async function refreshMessagesForCurrentUser() {
  callStartSequence += 1
  callStarting = null
  callError = null
  if (!firebaseAuth.currentUser) {
    if (mediaRecorder) cancelVoiceRecording()
    selectedConversationId = null
    voiceRecordingStarting = false
  }
  realtimeSocket?.disconnect()
  realtimeSocket = null
  realtimeSocketUid = null
  subscriptionsUid = null
  conversationMessageSubscriptions.forEach(unsubscribe => unsubscribe())
  conversationMessageSubscriptions.clear()
  conversationCallHistory.clear()
  clearTimeout(incomingCallTimer)
  incomingCallTimer = null
  incomingCall = null
  stopCallRingtone()
  if (activeCall) await finishActiveCall(false)
  callRootReplace()
  memberPresence.clear()
  clearInterval(presenceHeartbeatTimer)
  presenceHeartbeatTimer = null
  if (!firebaseAuth.currentUser) {
    presenceWriteUid = null
    messageState = { conversations: [], messages: [] }
    selectedConversationId = null
    renderMessages()
    return
  }
  pendingFiles = []
  replyTargetId = null
  editingMessageId = null
  presenceWriteUid = firebaseAuth.currentUser.uid
  setOwnPresence(true)
  presenceHeartbeatTimer = setInterval(() => {
    if (!presenceWriteUid) return
    setOwnPresence(true)
  }, presenceHeartbeatMs)
  await refreshFromServer()
}

function setOwnPresence(isOnline) {
  const uid = firebaseAuth.currentUser?.uid
  if (!uid || uid !== presenceWriteUid) return
  api.post('/messages/presence', { isOnline })
    .catch(error => showError(error, `update authenticated presence for ${uid}`))
}

document.addEventListener('visibilitychange', () => {
  if (presenceWriteUid && !document.hidden) setOwnPresence(true)
})
window.addEventListener('pagehide', () => {
  if (mediaRecorder) cancelVoiceRecording()
  if (presenceWriteUid) setOwnPresence(false)
})
window.addEventListener('pageshow', () => {
  if (presenceWriteUid) setOwnPresence(true)
})
