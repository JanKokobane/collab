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
let reconnectTimer = null
let refreshPromise = null

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
      : { ...member, email: member.email?.toLowerCase() }),
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
    senderUid: row.sender_firebase_uid || row.senderUid,
    senderEmail: (row.sender_email || row.senderEmail || '').toLowerCase(),
    senderName: row.sender_name || row.senderName || 'Project member',
    replyToId: row.reply_to_message_id || row.replyToId || null,
    replyToBody: row.reply_to_body ?? row.replyToBody ?? null,
    replyToSenderName: row.reply_to_sender_name ?? row.replyToSenderName ?? null,
    forwardedFrom: row.forwarded_from ?? row.forwardedFrom ?? null,
    pinned: row.is_pinned ?? row.pinned ?? false,
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
  const result = await api.get('/messages/conversations')
  messageState.conversations = (result?.data?.conversations || []).map(normalizeConversation)
  if (selectedId && messageState.conversations.some(item => item.id === selectedId)) {
    selectedConversationId = selectedId
  } else {
    selectedConversationId = messageState.conversations[0]?.id || null
  }
  await loadConversationMessages(selectedConversationId)
  updateMessagesNavigationBadge()
  renderMessages()
}

async function refreshFromServer() {
  if (refreshPromise) return refreshPromise
  refreshPromise = reloadMessages()
    .catch(showError)
    .finally(() => { refreshPromise = null })
  return refreshPromise
}

function connectMessageSocket() {
  const user = firebaseAuth.currentUser
  if (!user || socketUid === user.uid) return
  socketUid = user.uid
  const protocol = apiBaseUrl.startsWith('https:') ? 'wss:' : 'ws:'
  const url = `${protocol}//${new URL(apiBaseUrl).host}/api/messages/socket`
  const connection = new WebSocket(url)
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
    refreshFromServer()
  })
  connection.addEventListener('close', () => {
    if (socket !== connection) return
    socket = null
    if (firebaseAuth.currentUser?.uid !== socketUid) return
    reconnectTimer = window.setTimeout(() => {
      socketUid = null
      connectMessageSocket()
    }, 3000)
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
    if (conversation?.unreadCount) {
      await api.post(`${apiPath(conversationId)}/read`, {})
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
  link.append(make('strong', '', attachment.fileName), make('small', '', formatFileSize(attachment.size)))
  container.append(link)
}

function renderReactions(message, container) {
  const reactions = make('div', 'message-reactions')
  ;(message.reactions || []).filter(reaction => reaction.users?.length).forEach(reaction => {
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
  add.addEventListener('click', () => { picker.hidden = !picker.hidden })
  addWrap.append(add, picker)
  reactions.append(addWrap)
  container.append(reactions)
}

function renderMessageActions(message, container) {
  const actions = make('div', 'message-actions')
  const trigger = make('button', 'message-actions-trigger', '⋯')
  trigger.type = 'button'
  trigger.setAttribute('aria-label', 'Message actions')
  const menu = make('div', 'message-actions-menu')
  menu.hidden = true
  const own = message.senderUid === currentUid()
  const options = [
    { label: 'Reply', action: () => startReply(message) },
    ...(own ? [{ label: 'Edit', action: () => startEdit(message) }] : []),
    { label: 'Forward', action: () => openForwardModal(message) },
    { label: message.pinned ? 'Unpin' : 'Pin', action: () => mutateMessage(message, 'pin') },
    ...(own ? [{ label: 'Delete', action: () => mutateMessage(message, 'delete'), destructive: true }] : [])
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
    const row = make('article', `message-row${own ? ' own' : ''}`)
    const body = make('div', 'message-content')
    const bubble = make('div', 'message-bubble')
    if (message.pinned) bubble.append(make('div', 'message-pinned-label', '📌 Pinned'))
    if (!own) bubble.append(make('div', 'message-meta', message.senderName))
    if (message.forwardedFrom?.senderName) bubble.append(make('div', 'message-forwarded-label', `↪ Forwarded from ${message.forwardedFrom.senderName}`))
    if (message.replyToId) {
      const quote = make('div', 'message-reply-quote')
      quote.append(make('strong', '', message.replyToSenderName || 'Message'), make('span', '', message.replyToBody || 'Attachment'))
      bubble.append(quote)
    }
    if (message.body) bubble.append(make('p', 'message-text', message.body))
    ;(message.attachments || []).forEach(attachment => renderAttachment(attachment, bubble))
    const time = make('span', 'message-time-row')
    if (message.editedAt) time.append(make('span', 'message-edited-label', 'Edited'))
    time.append(make('time', 'message-time', formatMessageTime(message.createdAt)))
    const conversation = messageState.conversations.find(item => item.id === selectedConversationId)
    if (own && conversation?.type === 'direct') {
      const receipt = make('span', `message-status${message.readAt ? ' read' : ''}`, message.readAt ? '✓✓' : '✓')
      receipt.title = message.readAt ? 'Read' : 'Sent'
      time.append(receipt)
    }
    bubble.append(time)
    body.append(bubble)
    renderMessageActions(message, body)
    renderReactions(message, body)
    row.append(body)
    feed.append(row)
  })
  if (shouldScroll) feed.scrollTop = feed.scrollHeight
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
  heading.append(make('p', '', conversation.participants.map(member => member.name || member.email).join(', ')))
  header.append(heading)
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
  const header = make('header', 'messages-forward-header')
  header.append(make('h2', '', 'Forward message'))
  const projectSelect = document.createElement('select')
  projects.forEach(project => {
    const option = document.createElement('option')
    option.value = project.projectId
    option.textContent = project.name
    projectSelect.append(option)
  })
  const recipients = document.createElement('select')
  recipients.multiple = true
  recipients.setAttribute('aria-label', 'Recipients')
  const renderRecipients = () => {
    recipients.replaceChildren()
    getContacts(projectSelect.value).forEach(contact => {
      const option = document.createElement('option')
      option.value = contact.firebaseUid
      option.textContent = contact.name
      recipients.append(option)
    })
  }
  projectSelect.addEventListener('change', renderRecipients)
  renderRecipients()
  const cancel = make('button', 'messages-forward-cancel', 'Cancel')
  cancel.type = 'button'
  cancel.addEventListener('click', () => backdrop.remove())
  const submit = make('button', 'primary-button', 'Forward')
  submit.type = 'submit'
  form.append(header, projectSelect, recipients, cancel, submit)
  form.addEventListener('submit', async event => {
    event.preventDefault()
    if (!recipients.selectedOptions.length) return
    submit.disabled = true
    try {
      for (const option of recipients.selectedOptions) {
        const result = await api.post('/messages/conversations', {
          projectId: projectSelect.value,
          type: 'direct',
          memberFirebaseUids: [option.value]
        })
        const targetConversationId = result?.data?.conversation?.conversation_id
        await api.post(`${apiPath(targetConversationId)}/messages`, {
          body: message.body,
          attachments: message.attachments,
          forwardedFrom: { senderName: message.senderName }
        })
      }
      backdrop.remove()
      await refreshFromServer()
    } catch (error) {
      showError(error)
      submit.disabled = false
    }
  })
  backdrop.append(form)
  document.querySelector('#modal-root').append(backdrop)
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
      await api.post(`${apiPath(selectedConversationId)}/messages`, {
        body,
        replyToId: replyTargetId,
        attachments
      })
    }
    input.value = ''
    pendingFiles = []
    renderPendingFiles()
    cancelComposerContext()
    clearError()
    await refreshFromServer()
  } catch (error) {
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
    if (event.target.closest('.message-actions')) return
    document.querySelectorAll('.message-actions-menu:not([hidden])').forEach(menu => { menu.hidden = true })
  })
}

export async function refreshMessagesForCurrentUser() {
  if (reconnectTimer) window.clearTimeout(reconnectTimer)
  if (socket && socket.readyState !== WebSocket.CLOSED) socket.close()
  socket = null
  socketUid = null
  if (!firebaseAuth.currentUser) {
    messageState = { conversations: [], messages: [] }
    selectedConversationId = null
    renderMessages()
    return
  }
  pendingFiles = []
  replyTargetId = null
  editingMessageId = null
  await refreshFromServer()
  connectMessageSocket()
}
