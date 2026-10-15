import { activeView, currentUser, getAccessibleMembers, getAvatarSource, make, projects, renderAvatarElement } from './state.js'
import { firebaseAuth } from '../../firebase.js'
import { api, apiBaseUrl } from './api.js'

const maxAttachmentBytes = 512 * 1024
const reactionChoices = ['👍', '❤️', '😂', '🎉', '👀', '🙌', '🔥', '✅', '🤔', '😄']
let messageState = { conversations: [], messages: [] }
let selectedConversationId = null
let pendingFiles = []
let replyTargetId = null
let editingMessageId = null
let messagesInitialized = false
let socket = null
let socketUid = null
let socketReady = false
let reconnectTimer = null
let reconnectAttempts = 0
let refreshPromise = null
let fallbackRefreshTimer = null
let heartbeatInterval = null
let heartbeatTimeout = null
let heartbeatTimestamp = null
const memberPresence = new Map()

const currentEmail = () => currentUser.email?.trim().toLowerCase() || firebaseAuth.currentUser?.email?.trim().toLowerCase() || ''
const currentUid = () => firebaseAuth.currentUser?.uid || ''
const apiPath = conversationId => `/messages/conversations/${encodeURIComponent(conversationId)}`

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
    composeField: document.querySelector('.messages-compose-field')
  }
}

function showError(error) {
  const element = getElements().error
  if (!element) return
  element.textContent = error instanceof Error ? error.message : 'The message could not be completed.'
  element.hidden = false
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
  return {
    ...row,
    id: row.conversation_id || row.id,
    type: row.conversation_type || row.type,
    projectId: row.project_id || row.projectId,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
    members: members.map(member => typeof member === 'string' ? member.toLowerCase() : member.email?.toLowerCase()).filter(Boolean),
    memberUids: members.map(member => typeof member === 'string' ? '' : member.firebaseUid).filter(Boolean),
    participants: members.map(member => typeof member === 'string'
      ? { email: member.toLowerCase(), name: member }
      : {
        ...member,
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

function receiveCreatedMessage(payload) {
  if (!payload.message || !messageState.conversations.some(item => item.id === payload.conversationId)) {
    refreshFromServer()
    return
  }
  const { message, changed } = upsertMessage({
    ...payload.message,
    clientMessageId: payload.clientMessageId || payload.message.clientMessageId
  })
  const conversation = messageState.conversations.find(item => item.id === message.conversationId)
  if (!conversation || !changed) return
  conversation.latestMessage = message.body
  conversation.latestMessageCreatedAt = message.createdAt
  if (message.senderUid !== currentUid() &&
      !(activeView === 'Messages' && selectedConversationId === message.conversationId)) {
    conversation.unreadCount += 1
  }
  renderMessages()
  if (activeView === 'Messages' && selectedConversationId === message.conversationId) {
    conversation.unreadCount = 0
    api.post(`${apiPath(message.conversationId)}/read`, {})
      .catch(showError)
  }
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
  const online = Boolean(presence?.isOnline)
  const lastSeenAt = presence?.lastSeenAt || otherMember.lastSeenAt
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

function receivePresenceUpdate(payload, shouldRender = true) {
  if (typeof payload.firebaseUid !== 'string') return
  memberPresence.set(payload.firebaseUid, {
    isOnline: Boolean(payload.isOnline),
    lastSeenAt: payload.lastSeenAt || null
  })
  if (shouldRender && activeView === 'Messages') renderMessagesView()
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

async function loadConversationMessages(conversationId) {
  if (!conversationId) {
    messageState.messages = []
    return
  }
  const result = await api.get(`${apiPath(conversationId)}/messages`)
  if (selectedConversationId === conversationId) {
    messageState.messages = (result?.data?.messages || []).map(normalizeMessage)
  }
}

async function reloadMessages() {
  const selectedId = selectedConversationId
  const previousConversationState = JSON.stringify(messageState.conversations.map(conversation => [
    conversation.id,
    conversation.unreadCount,
    conversation.latestMessage,
    conversation.latestMessageCreatedAt
  ]))
  const previousMessageState = JSON.stringify(messageState.messages)
  const result = await api.get('/messages/conversations')
  messageState.conversations = (result?.data?.conversations || []).map(normalizeConversation)
  if (selectedId && messageState.conversations.some(item => item.id === selectedId)) {
    selectedConversationId = selectedId
  } else {
    selectedConversationId = messageState.conversations[0]?.id || null
  }
  await loadConversationMessages(selectedConversationId)
  const conversationState = JSON.stringify(messageState.conversations.map(conversation => [
    conversation.id,
    conversation.unreadCount,
    conversation.latestMessage,
    conversation.latestMessageCreatedAt
  ]))
  const messageDataChanged = JSON.stringify(messageState.messages) !== previousMessageState
  updateMessagesNavigationBadge()
  if (
    conversationState !== previousConversationState ||
    messageDataChanged ||
    selectedId !== selectedConversationId
  ) renderMessages()
}

async function refreshFromServer() {
  if (refreshPromise) return refreshPromise
  refreshPromise = reloadMessages()
    .catch(showError)
    .finally(() => { refreshPromise = null })
  return refreshPromise
}

function clearSocketHeartbeat(connection) {
  if (socket !== connection) return
  if (heartbeatInterval) window.clearInterval(heartbeatInterval)
  if (heartbeatTimeout) window.clearTimeout(heartbeatTimeout)
  heartbeatInterval = null
  heartbeatTimeout = null
  heartbeatTimestamp = null
}

function startSocketHeartbeat(connection) {
  clearSocketHeartbeat(connection)
  heartbeatInterval = window.setInterval(() => {
    if (connection.readyState !== WebSocket.OPEN) {
      connection.close()
      return
    }
    if (heartbeatTimeout) {
      connection.close(4000, 'Heartbeat timed out')
      return
    }

    heartbeatTimestamp = Date.now()
    try {
      connection.send(JSON.stringify({ type: 'ping', timestamp: heartbeatTimestamp }))
      heartbeatTimeout = window.setTimeout(() => {
        connection.close(4000, 'Heartbeat timed out')
      }, 10_000)
    } catch (error) {
      showError(error)
      connection.close()
    }
  }, 18_000)
}

function scheduleSocketReconnect(userUid) {
  if (reconnectTimer || firebaseAuth.currentUser?.uid !== userUid) return
  const baseDelay = Math.min(1000 * (2 ** reconnectAttempts), 30_000)
  const delay = Math.round(baseDelay * (0.75 + Math.random() * 0.5))
  reconnectAttempts += 1
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null
    if (firebaseAuth.currentUser?.uid !== userUid) return
    socketUid = null
    connectMessageSocket()
  }, delay)
}

function connectMessageSocket() {
  const user = firebaseAuth.currentUser
  if (!user || socketUid === user.uid) return
  socketUid = user.uid
  socketReady = false
  const protocol = apiBaseUrl.startsWith('https:') ? 'wss:' : 'ws:'
  const url = `${protocol}//${new URL(apiBaseUrl).host}/api/messages/socket`
  let connection
  try {
    connection = new WebSocket(url)
  } catch (error) {
    socketUid = null
    showError(error)
    scheduleSocketReconnect(user.uid)
    return
  }
  socket = connection
  connection.addEventListener('open', async () => {
    try {
      connection.send(JSON.stringify({ type: 'authenticate', token: await user.getIdToken(false) }))
    } catch (error) {
      showError(error)
      connection.close()
    }
  })
  connection.addEventListener('message', event => {
    let payload
    try {
      payload = JSON.parse(event.data)
    } catch {
      showError(new Error('The live messages update was invalid.'))
      return
    }
    if (payload.type === 'message.created') {
      receiveCreatedMessage(payload)
    } else if (payload.type === 'presence.updated') {
      receivePresenceUpdate(payload)
    } else if (payload.type === 'pong') {
      if (payload.timestamp === heartbeatTimestamp) {
        if (heartbeatTimeout) window.clearTimeout(heartbeatTimeout)
        heartbeatTimeout = null
        heartbeatTimestamp = null
      }
    } else if (payload.type === 'ready') {
      socketReady = true
      reconnectAttempts = 0
      startSocketHeartbeat(connection)
      ;(payload.presence || []).forEach(item => receivePresenceUpdate(item, false))
      refreshFromServer()
      if (activeView === 'Messages') renderMessagesView()
    } else {
      refreshFromServer()
    }
  })
  connection.addEventListener('close', () => {
    if (socket !== connection) return
    socket = null
    socketReady = false
    clearSocketHeartbeat(null)
    if (firebaseAuth.currentUser?.uid !== socketUid) return
    scheduleSocketReconnect(socketUid)
  })
  connection.addEventListener('error', () => {
    if (connection.readyState !== WebSocket.CLOSED) showError(new Error('Live updates are disconnected. Reconnecting…'))
  })
}

async function selectConversation(conversationId) {
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
    showError(error)
  }
  closeEmojiPicker()
  renderMessages()
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

function renderAttachment(attachment, container) {
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
  const own = message.senderUid === currentUid()
  const options = message.isDeleted
    ? [{ label: 'Delete for me', action: () => deleteMessage(message, 'me'), destructive: true }]
    : [
        { label: 'Reply', action: () => startReply(message) },
        ...(own ? [{ label: 'Edit', action: () => startEdit(message) }] : []),
        { label: 'Forward', action: () => openForwardModal(message) },
        { label: message.pinned ? 'Unpin' : 'Pin', action: () => mutateMessage(message, 'pin') },
        { label: 'Delete for me', action: () => deleteMessage(message, 'me'), destructive: true },
        ...(own ? [{ label: 'Delete for everyone', action: () => deleteMessage(message, 'everyone'), destructive: true }] : [])
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

function renderMessagesList() {
  const { feed } = getElements()
  if (!feed) return
  const shouldScroll = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80
  feed.replaceChildren()
  if (!selectedConversationId || !messageState.conversations.some(item => item.id === selectedConversationId)) {
    feed.append(make('p', 'messages-placeholder', 'Choose a channel or start a direct message.'))
    return
  }
  const messages = getConversationMessages(selectedConversationId)
  if (!messages.length) {
    feed.append(make('p', 'messages-placeholder', 'No messages yet. Start the conversation.'))
    return
  }
  messages.forEach(message => {
    const own = message.senderUid === currentUid()
    const row = make('article', `message-row${own ? ' own message-row-sent' : ' message-row-received'}`)
    const body = make('div', `message-content${own ? ' message-content-sent' : ' message-content-received'}`)
    const bubble = make('div', `message-bubble${own ? ' message-bubble-sent' : ''}`)
    if (message.pinned) bubble.append(make('div', 'message-pinned-label', '📌 Pinned'))
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

function clearConversationMessages(conversation) {
  const backdrop = make('div', 'modal-backdrop')
  const form = make('form', 'modal messages-create-modal messages-clear-modal')
  form.setAttribute('role', 'dialog')
  form.setAttribute('aria-modal', 'true')
  const title = make('h2', '', 'Clear all messages?')
  title.id = 'messages-clear-title'
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
    make('p', 'modal-copy', 'Clear all messages from this conversation for you? Other members will still see them.'),
    close
  )

  const actions = make('div', 'messages-clear-actions')
  const confirm = make('button', 'primary-button messages-create-submit messages-clear-confirm', 'Clear all messages')
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
      await api.delete(`${apiPath(conversation.id)}/messages`)
      closeModal()
      await refreshFromServer()
    } catch (error) {
      confirm.disabled = false
      showError(error)
    }
  })
}

function renderMessagesView() {
  const { header, input, send } = getElements()
  if (!header || !input || !send) return
  const conversation = messageState.conversations.find(item => item.id === selectedConversationId)
  renderConversationList()
  if (!conversation) {
    header.replaceChildren()
    const heading = make('div')
    heading.append(make('h2', '', 'Select a conversation'), make('p', '', 'Start a direct message or create a group or channel.'))
    header.append(heading)
    input.disabled = true
    send.disabled = true
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
  menu.append(clearButton)
  trigger.addEventListener('click', () => {
    menu.hidden = !menu.hidden
    trigger.setAttribute('aria-expanded', String(!menu.hidden))
  })
  actions.append(trigger, menu)
  header.append(actions)
  input.disabled = false
  send.disabled = false
  renderMessagesList()
}

export function renderMessages() {
  if (activeView !== 'Messages') return
  updateMessagesNavigationBadge()
  renderPeopleList()
  renderMessagesView()
}

async function openDirectConversation(contact) {
  const project = projects.find(item => getProjectMembers(item).some(member => member.firebaseUid === contact.firebaseUid) &&
    getProjectMembers(item).some(member => member.firebaseUid === currentUid()))
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
    showError(error)
  }
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
    await refreshFromServer()
  } catch (error) {
    showError(error)
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
  if (message.senderUid !== currentUid()) return
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
        const option = make('label', `messages-forward-recipient${selectedUids.has(contact.firebaseUid) ? ' selected' : ''}`)
        const avatar = make('span', 'messages-forward-avatar')
        renderAvatarElement(avatar, contact, 'messages-forward-avatar')
        const details = make('span', 'messages-forward-recipient-details')
        details.append(make('strong', '', contact.name), make('small', '', contact.email))
        const checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        checkbox.name = 'forward-members'
        checkbox.value = contact.firebaseUid
        checkbox.checked = selectedUids.has(contact.firebaseUid)
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) selectedUids.add(contact.firebaseUid)
          else selectedUids.delete(contact.firebaseUid)
          option.classList.toggle('selected', checkbox.checked)
          updateSelection()
        })
        option.append(avatar, details, checkbox)
        membersList.append(option)
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
        const targetConversationId = result?.data?.conversation?.conversation_id
        await api.post(`${apiPath(targetConversationId)}/messages`, {
          body: message.body,
          attachments: message.attachments,
          forwardedFrom: { senderName: message.senderName }
        })
      }
      closeModal()
      await refreshFromServer()
    } catch (error) {
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

function renderPendingFiles() {
  const { attachmentList } = getElements()
  if (!attachmentList) return
  attachmentList.replaceChildren()
  pendingFiles.forEach((file, index) => {
    const tag = make('span', 'messages-attachment-tag', file.name)
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
    } else {
      if (!selectedConversationId || (!body && pendingFiles.length === 0)) return
      const attachments = await Promise.all(pendingFiles.map(async file => ({
        fileName: file.name,
        mediaType: file.type || 'application/octet-stream',
        size: file.size,
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
        conversation.latestMessage = body
        conversation.latestMessageCreatedAt = optimisticMessage.createdAt
      }
      renderMessages()
      const response = await api.post(`${apiPath(selectedConversationId)}/messages`, {
        clientMessageId,
        body,
        replyToId: replyTargetId,
        attachments
      })
      const savedMessage = response?.data?.message || (response?.data?.messageId
        ? {
          ...optimisticMessage.message,
          id: response.data.messageId,
          message_id: response.data.messageId
        }
        : null)
      if (!savedMessage) {
        throw new Error('The server did not return the saved message.')
      }
      const saved = upsertMessage({
        ...savedMessage,
        clientMessageId: savedMessage.clientMessageId || clientMessageId
      })
      if (conversation) {
        conversation.latestMessage = saved.message.body
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
  fallbackRefreshTimer = window.setInterval(() => {
    if (
      !firebaseAuth.currentUser ||
      activeView !== 'Messages' ||
      document.hidden ||
      socketReady
    ) return
    refreshFromServer()
  }, 2000)
  document.querySelector('#messages-new-channel')?.addEventListener('click', () => openConversationModal('channel'))
  document.querySelector('#messages-new-group')?.addEventListener('click', () => openConversationModal('group'))
  document.querySelector('#messages-new-direct')?.addEventListener('click', () => openConversationModal('direct'))
  document.querySelector('#messages-composer')?.addEventListener('submit', sendMessage)
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
  if (reconnectTimer) window.clearTimeout(reconnectTimer)
  if (reconnectTimer) reconnectTimer = null
  if (socket) {
    clearSocketHeartbeat(socket)
    if (socket.readyState !== WebSocket.CLOSED) socket.close()
  }
  socket = null
  socketUid = null
  socketReady = false
  reconnectAttempts = 0
  memberPresence.clear()
  if (!firebaseAuth.currentUser) {
    messageState = { conversations: [], messages: [] }
    selectedConversationId = null
    renderMessages()
    return
  }
  pendingFiles = []
  replyTargetId = null
  editingMessageId = null
  connectMessageSocket()
  await refreshFromServer()
}
