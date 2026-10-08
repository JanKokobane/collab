import { activeView, currentUser, getAvatarSource, make, members, projects, renderAvatarElement } from './state.js'

const storageKey = 'collab-demo-messaging'
const maxAttachmentBytes = 512 * 1024
const demoReadDelayMs = 1800
const reactionChoices = ['👍', '❤️', '😂', '🎉', '👀', '🙌', '🔥', '✅', '🤔', '😄']
let demoState = loadDemoState()
let selectedConversationId = demoState.conversations[0]?.id || null
let pendingFiles = []
let replyTargetId = null
let editingMessageId = null
const pendingReadReceipts = new Set()

function getElements() {
  return {
    list: document.querySelector('#messages-conversation-list'),
    people: document.querySelector('#messages-people-list'),
    header: document.querySelector('#messages-thread-header'),
    feed: document.querySelector('#messages-feed'),
    error: document.querySelector('#messages-error'),
    form: document.querySelector('#messages-composer'),
    input: document.querySelector('#messages-input'),
    send: document.querySelector('.messages-send-button'),
    fileInput: document.querySelector('#messages-file-input'),
    attachmentList: document.querySelector('#messages-attachment-list'),
    emojiPicker: document.querySelector('#messages-emoji-picker'),
    composeField: document.querySelector('.messages-compose-field')
  }
}

function setSendButtonMode(isSaving = Boolean(editingMessageId)) {
  const send = getElements().send
  const icon = send.querySelector('svg')
  const label = send.querySelector('.messages-send-label')
  icon.hidden = isSaving
  label.hidden = !isSaving
  label.textContent = isSaving ? 'Save' : 'Send'
  send.classList.toggle('is-saving', isSaving)
  send.setAttribute('aria-label', isSaving ? 'Save edited message' : 'Send message')
}

function getContacts() {
  const contactMap = new Map()
  ;[...members, ...projects.flatMap(project => project.invitedMembers || [])].forEach(member => {
    const email = member.email?.trim().toLowerCase()
    if (email && email !== currentUser.email?.toLowerCase() && !contactMap.has(email)) {
      contactMap.set(email, {
        email,
        name: member.name || email,
        initials: member.initials || initialsFor(member.name || email),
        tone: member.tone || 'teal',
        profileImage: getAvatarSource(member)
      })
    } else if (email && email !== currentUser.email?.toLowerCase() && contactMap.has(email)) {
      const contact = contactMap.get(email)
      contact.profileImage ||= getAvatarSource(member)
    }
  })
  return [...contactMap.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function initialsFor(name) {
  return String(name || '?').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()
}

function loadDemoState() {
  const saved = localStorage.getItem(storageKey)
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed.conversations) && Array.isArray(parsed.messages)) return parsed
    } catch (error) {
      console.error('Saved demo messages could not be read.', error)
    }
  }
  const now = Date.now()
  const contacts = getContacts()
  const general = {
    id: `demo-channel-${now}`,
    type: 'channel',
    name: 'general',
    createdAt: new Date(now - 60000).toISOString(),
    members: [currentUser.email, ...contacts.map(contact => contact.email)]
  }
  const firstContact = contacts[0]
  const direct = firstContact ? {
    id: `demo-direct-${now}`,
    type: 'direct',
    name: '',
    createdAt: new Date(now - 30000).toISOString(),
    members: [currentUser.email, firstContact.email]
  } : null
  const messages = [
    {
      id: `demo-message-${now}-1`,
      conversationId: general.id,
      senderEmail: firstContact?.email || currentUser.email,
      senderName: firstContact?.name || currentUser.name,
      body: 'Welcome to the team chat! Share updates, files, and ideas here. 👋',
      createdAt: new Date(now - 3600000).toISOString(),
      attachments: [],
      reactions: [{ emoji: '👋', users: [currentUser.email] }, { emoji: '🎉', users: [firstContact?.email || currentUser.email] }]
    },
    {
      id: `demo-message-${now}-2`,
      conversationId: general.id,
      senderEmail: currentUser.email,
      senderName: currentUser.name,
      body: 'Thanks! Use the buttons on a message to add a reaction, or the smiley beside the composer to insert an emoji.',
      createdAt: new Date(now - 1800000).toISOString(),
      attachments: [],
      reactions: []
    }
  ]
  const state = { conversations: direct ? [general, direct] : [general], messages }
  localStorage.setItem(storageKey, JSON.stringify(state))
  return state
}

function persistDemoState() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(demoState))
    return true
  } catch (error) {
    showError(new Error('This browser could not save the demo conversation. Remove a large attachment or free up browser storage and try again.'))
    return false
  }
}

function showError(error) {
  const element = getElements().error
  if (!element) return
  element.textContent = error instanceof Error ? error.message : 'The demo message could not be completed.'
  element.hidden = false
}

function clearError() {
  const element = getElements().error
  if (!element) return
  element.hidden = true
  element.textContent = ''
}

function getConversationTitle(conversation) {
  if (conversation.type === 'channel') return conversation.name
  const otherEmails = conversation.members.filter(email => email !== currentUser.email?.toLowerCase())
  if (conversation.type === 'group') {
    return conversation.name || otherEmails.map(email => getContact(email)?.name || email).join(', ') || 'Group conversation'
  }
  return getContact(otherEmails[0])?.name || otherEmails[0] || 'Direct message'
}

function getContact(email) {
  return getContacts().find(contact => contact.email === email?.toLowerCase())
}

function getDirectMessageCount(email) {
  const directConversationIds = new Set(demoState.conversations
    .filter(conversation => conversation.type === 'direct' && conversation.members.includes(email))
    .map(conversation => conversation.id))
  return demoState.messages.filter(message =>
    directConversationIds.has(message.conversationId) &&
    message.senderEmail !== currentUser.email?.toLowerCase() &&
    !message.readByCurrentUser
  ).length
}

function updateMessagesNavigationBadge() {
  const badge = document.querySelector('#messages-nav-badge')
  if (!badge) return
  const unreadCount = demoState.messages.filter(message =>
    message.senderEmail !== currentUser.email?.toLowerCase() &&
    !message.readByCurrentUser
  ).length
  badge.hidden = unreadCount === 0
  badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount)
  badge.setAttribute('aria-label', `${unreadCount} unread message${unreadCount === 1 ? '' : 's'}`)
}

function renderPeopleList() {
  const { people } = getElements()
  if (!people) return
  people.replaceChildren()
  const contacts = getContacts()
  const selfEmail = currentUser.email?.toLowerCase()
  const self = {
    email: selfEmail,
    name: currentUser.name,
    initials: initialsFor(currentUser.name),
    tone: currentUser.tone || 'teal',
    profileImage: getAvatarSource(currentUser)
  }
  const directConversationIds = new Set(demoState.conversations
    .filter(conversation => conversation.type === 'direct' && conversation.members.includes(selfEmail))
    .map(conversation => conversation.id))
  const selfCount = demoState.messages.filter(message =>
    directConversationIds.has(message.conversationId) &&
    message.senderEmail === selfEmail &&
    message.readAt === null
  ).length
  people.append(createPersonRow(self, selfCount, true))
  if (!contacts.length) {
    people.append(make('p', 'messages-list-empty', 'No invited teammates yet. Invite people to a project to message them here.'))
    return
  }
  contacts.forEach(contact => {
    people.append(createPersonRow(contact, getDirectMessageCount(contact.email)))
  })
}

function createPersonRow(contact, messageCount, isSelf = false) {
  const button = make('button', 'messages-person')
  button.type = 'button'
  button.title = isSelf ? `${messageCount} messages sent by you` : `${messageCount} messages in your conversation with ${contact.name}`
  if (isSelf) {
    button.classList.add('messages-person-self')
    button.disabled = true
  }
  const avatar = make('span', `messages-person-avatar ${contact.tone}-bg`)
  renderAvatarElement(avatar, contact, `messages-person-avatar ${contact.tone}-bg`)
  button.append(avatar)
  const details = make('span', 'messages-person-details')
  details.append(
    make('strong', '', isSelf ? `${contact.name} (You)` : contact.name),
    make('small', '', contact.email)
  )
  button.append(details)
  if (messageCount) {
    const badge = make('span', 'messages-person-message-count', messageCount > 99 ? '99+' : String(messageCount))
    badge.setAttribute('aria-label', `${messageCount} message${messageCount === 1 ? '' : 's'}`)
    button.append(badge)
  }
  if (!isSelf) button.addEventListener('click', () => openDirectConversation(contact))
  return button
}

function renderConversationList() {
  const { list } = getElements()
  if (!list) return
  list.replaceChildren()
  if (!demoState.conversations.length) {
    list.append(make('p', 'messages-list-empty', 'No conversations yet. Create a channel or start a message.'))
    return
  }
  const sections = [
    { type: 'channel', label: 'Channels' },
    { type: 'direct', label: 'Direct messages' },
    { type: 'group', label: 'Group conversations' }
  ]
  sections.forEach(section => {
    const conversations = demoState.conversations.filter(item => item.type === section.type)
    if (!conversations.length) return
    list.append(make('h3', 'messages-list-heading', section.label))
    conversations.forEach(conversation => {
      const button = make('button', `messages-conversation${conversation.id === selectedConversationId ? ' active' : ''}`)
      button.type = 'button'
      const prefix = conversation.type === 'channel' ? '# ' : conversation.type === 'group' ? '◉ ' : ''
      const titleRow = make('span', 'messages-conversation-title-row')
      titleRow.append(make('strong', 'messages-conversation-name', `${prefix}${getConversationTitle(conversation)}`))
      const messages = getConversationMessages(conversation.id)
      const unreadCount = messages.filter(message =>
        message.senderEmail !== currentUser.email?.toLowerCase() && !message.readByCurrentUser
      ).length
      if (unreadCount) {
        const badge = make('span', 'messages-unread-count', unreadCount > 99 ? '99+' : String(unreadCount))
        badge.setAttribute('aria-label', `${unreadCount} unread message${unreadCount === 1 ? '' : 's'}`)
        titleRow.append(badge)
        button.classList.add('has-unread')
      }
      button.append(titleRow)
      const latest = messages[messages.length - 1]
      button.append(make('span', 'messages-conversation-preview', latest?.body || section.label))
      button.addEventListener('click', () => {
        selectedConversationId = conversation.id
        markConversationRead(conversation.id)
        closeEmojiPicker()
        renderMessagesView()
      })
      list.append(button)
    })
  })
}

function markConversationRead(conversationId) {
  const unreadMessages = demoState.messages.filter(message =>
    message.conversationId === conversationId &&
    message.senderEmail !== currentUser.email?.toLowerCase() &&
    !message.readByCurrentUser
  )
  if (!unreadMessages.length) return
  unreadMessages.forEach(message => { message.readByCurrentUser = true })
  if (!persistDemoState()) unreadMessages.forEach(message => { delete message.readByCurrentUser })
}

function getConversationMessages(conversationId) {
  return demoState.messages.filter(message => message.conversationId === conversationId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
}

function formatMessageTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
}

function appendEmojiButtons(container, onSelect, className = 'messages-emoji-menu') {
  const picker = make('div', className)
  picker.hidden = true
  reactionChoices.forEach(emoji => {
    const button = make('button', 'messages-emoji-choice', emoji)
    button.type = 'button'
    button.setAttribute('aria-label', `Insert ${emoji}`)
    button.addEventListener('click', () => {
      onSelect(emoji)
      picker.hidden = true
    })
    picker.append(button)
  })
  container.append(picker)
  return picker
}

function renderReactions(message, container) {
  const reactions = make('div', 'message-reactions')
  message.reactions = Array.isArray(message.reactions) ? message.reactions : []
  message.reactions.filter(reaction => reaction.users.length).forEach(reaction => {
    const button = make('button', `message-reaction${reaction.users.includes(currentUser.email) ? ' active' : ''}`)
    button.type = 'button'
    button.setAttribute('aria-label', `${reaction.emoji}, ${reaction.users.length} reactions`)
    button.setAttribute('aria-pressed', String(reaction.users.includes(currentUser.email)))
    button.append(make('span', '', reaction.emoji), make('span', '', String(reaction.users.length)))
    button.addEventListener('click', () => toggleReaction(message, reaction.emoji))
    reactions.append(button)
  })
  const addWrap = make('div', 'message-add-reaction-wrap')
  const addButton = make('button', 'message-add-reaction', '☺')
  addButton.type = 'button'
  addButton.title = 'Add reaction'
  addButton.setAttribute('aria-label', 'Add reaction')
  const picker = appendEmojiButtons(addWrap, emoji => toggleReaction(message, emoji))
  addButton.addEventListener('click', () => { picker.hidden = !picker.hidden })
  addWrap.append(addButton)
  reactions.append(addWrap)
  container.append(reactions)
}

function toggleReaction(message, emoji) {
  const reactions = Array.isArray(message.reactions) ? message.reactions : []
  let reaction = reactions.find(item => item.emoji === emoji)
  if (!reaction) {
    reaction = { emoji, users: [] }
    reactions.push(reaction)
  }
  const alreadyReacted = reaction.users.includes(currentUser.email)
  reaction.users = reaction.users.filter(email => email !== currentUser.email)
  if (!alreadyReacted) reaction.users.push(currentUser.email)
  message.reactions = reactions.filter(item => item.users.length)
  persistDemoState()
  renderMessagesView()
}

function renderMessageActions(message, container) {
  const actions = make('div', 'message-actions')
  const trigger = make('button', 'message-actions-trigger', '⋮')
  trigger.type = 'button'
  trigger.title = 'Message options'
  trigger.setAttribute('aria-label', 'Message options')
  trigger.setAttribute('aria-expanded', 'false')
  const menu = make('div', 'message-actions-menu')
  menu.hidden = true
  const positionMenu = () => {
    if (window.matchMedia('(max-width: 1024px)').matches) return
    const bubble = actions.closest('.message-row')?.querySelector('.message-bubble')
    if (!bubble) return
    const bubbleRect = bubble.getBoundingClientRect()
    const menuRect = menu.getBoundingClientRect()
    const gap = 4
    const edge = 8
    const desiredLeft = message.senderEmail === currentUser.email?.toLowerCase()
      ? bubbleRect.left - menuRect.width - gap
      : bubbleRect.right + gap
    const left = Math.max(edge, Math.min(desiredLeft, window.innerWidth - menuRect.width - edge))
    const top = Math.max(edge, Math.min(bubbleRect.top, window.innerHeight - menuRect.height - edge))
    menu.style.position = 'fixed'
    menu.style.top = `${top}px`
    menu.style.right = 'auto'
    menu.style.bottom = 'auto'
    menu.style.left = `${left}px`
  }
  const options = [
    { label: 'Reply', action: () => startReply(message) },
    { label: 'Edit', action: () => startEdit(message) },
    { label: 'Forward', action: () => openForwardModal(message) },
    { label: message.pinned ? 'Unpin' : 'Pin', action: () => togglePin(message) },
    { label: 'Delete', action: () => deleteMessage(message), destructive: true }
  ]
  options.forEach(option => {
    const button = make('button', `message-action-option${option.destructive ? ' destructive' : ''}`, option.label)
    button.type = 'button'
    button.addEventListener('click', () => {
      menu.hidden = true
      actions.classList.remove('open')
      trigger.setAttribute('aria-expanded', 'false')
      option.action()
    })
    menu.append(button)
  })
  trigger.addEventListener('click', event => {
    event.stopPropagation()
    const open = menu.hidden
    document.querySelectorAll('.message-actions-menu:not([hidden])').forEach(openMenu => {
      openMenu.hidden = true
      const actions = openMenu.parentElement
      actions?.classList.remove('open')
      actions?.querySelector('.message-actions-trigger')?.setAttribute('aria-expanded', 'false')
    })
    menu.hidden = !open
    actions.classList.toggle('open', open)
    trigger.setAttribute('aria-expanded', String(open))
    if (open) positionMenu()
  })
  actions.append(trigger, menu)
  container.append(actions)
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
  context.hidden = false
  const target = demoState.messages.find(message => message.id === (replyTargetId || editingMessageId))
  const details = make('div', 'messages-composer-context-details')
  details.append(
    make('strong', '', editingMessageId ? 'Editing message' : `Replying to ${target?.senderName || 'message'}`),
    make('span', '', target?.body || (target?.attachments?.length ? 'Attachment' : 'Message'))
  )
  const close = make('button', 'messages-composer-context-close', '×')
  close.type = 'button'
  close.setAttribute('aria-label', editingMessageId ? 'Cancel edit' : 'Cancel reply')
  close.addEventListener('click', cancelComposerContext)
  context.append(details, close)
  setSendButtonMode()
}

function cancelComposerContext() {
  const { input } = getElements()
  if (editingMessageId) input.value = ''
  replyTargetId = null
  editingMessageId = null
  setSendButtonMode(false)
  renderComposerContext()
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

function deleteMessage(message) {
  const messageIndex = demoState.messages.findIndex(item => item.id === message.id)
  if (messageIndex < 0) return
  const [deleted] = demoState.messages.splice(messageIndex, 1)
  if (!persistDemoState()) {
    demoState.messages.splice(messageIndex, 0, deleted)
    return
  }
  if (replyTargetId === message.id || editingMessageId === message.id) cancelComposerContext()
  renderMessagesView()
}

function togglePin(message) {
  const previousPinned = Boolean(message.pinned)
  message.pinned = !previousPinned
  if (!persistDemoState()) {
    message.pinned = previousPinned
    return
  }
  renderMessagesView()
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
  const selectionCount = make('span', 'messages-forward-selection-count', '')
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
  senderDetails.append(
    make('strong', '', currentUser.name),
    make('small', '', currentUser.email)
  )
  sender.append(senderAvatar, senderDetails)
  const previewLabel = make('strong', '', 'Forwarded message')
  const previewText = make('span', '', message.body || (message.attachments?.length ? `${message.attachments.length} attachment${message.attachments.length === 1 ? '' : 's'}` : 'Message'))
  const previewContent = make('div', 'messages-forward-preview-content')
  previewContent.append(previewLabel, previewText)
  preview.append(sender, previewContent)
  const membersList = make('div', 'messages-forward-list')
  const contacts = getContacts()
  const contactByEmail = new Map(contacts.map(contact => [contact.email, contact]))
  const contactActivity = new Map(contacts.map(contact => [contact.email, 0]))
  const recentContacts = []
  const recentSeen = new Set()
  demoState.conversations
    .filter(conversation => conversation.type === 'direct')
    .map(conversation => {
      const email = conversation.members.find(member => member !== currentUser.email?.toLowerCase())
      if (!email || !contactByEmail.has(email)) return null
      const messages = getConversationMessages(conversation.id)
      const lastMessage = messages[messages.length - 1]
      return { email, timestamp: Date.parse(lastMessage?.createdAt || conversation.createdAt) || 0 }
    })
    .filter(Boolean)
    .sort((a, b) => b.timestamp - a.timestamp)
    .forEach(item => {
      if (!recentSeen.has(item.email)) {
        recentSeen.add(item.email)
        recentContacts.push(item.email)
      }
    })
  demoState.messages.forEach(item => {
    if (item.conversationId === message.conversationId) return
    const conversation = demoState.conversations.find(candidate => candidate.id === item.conversationId && candidate.type === 'direct')
    const email = conversation?.members.find(member => member !== currentUser.email?.toLowerCase())
    if (email && contactActivity.has(email)) contactActivity.set(email, contactActivity.get(email) + 1)
  })
  const frequentContacts = contacts
    .filter(contact => contactActivity.get(contact.email) > 0)
    .sort((a, b) => contactActivity.get(b.email) - contactActivity.get(a.email) || a.name.localeCompare(b.name))
    .slice(0, 5)
    .map(contact => contact.email)
  const frequentSet = new Set(frequentContacts)
  const recentOnly = recentContacts.filter(email => !frequentSet.has(email))
  const represented = new Set([...frequentContacts, ...recentOnly])
  const sections = [
    { title: 'Frequently contacted', emails: frequentContacts },
    { title: 'Recent chats', emails: recentOnly },
    { title: 'All teammates', emails: contacts.filter(contact => !represented.has(contact.email)).map(contact => contact.email) }
  ].filter(section => section.emails.length)
  const error = make('p', 'messages-error')
  error.setAttribute('role', 'alert')
  error.hidden = true
  const footer = make('footer', 'messages-forward-footer')
  const selectedSummary = make('span', 'messages-forward-selected', 'Select recipients')
  const submit = make('button', 'primary-button messages-forward-submit', 'Forward')
  submit.type = 'submit'
  submit.disabled = true
  footer.append(selectedSummary, submit)
  const selectedEmails = new Set()
  const renderRecipients = () => {
    const query = search.value.trim().toLowerCase()
    membersList.replaceChildren()
    sections.forEach(section => {
      const matches = section.emails
        .map(email => contactByEmail.get(email))
        .filter(contact => contact && (!query || `${contact.name} ${contact.email}`.toLowerCase().includes(query)))
      if (!matches.length) return
      membersList.append(make('h3', 'messages-forward-section-title', section.title))
      matches.forEach(contact => {
        const option = make('label', `messages-forward-recipient${selectedEmails.has(contact.email) ? ' selected' : ''}`)
        const avatar = make('span', 'messages-forward-avatar')
        renderAvatarElement(avatar, contact, 'messages-forward-avatar')
        const details = make('span', 'messages-forward-recipient-details')
        details.append(make('strong', '', contact.name), make('small', '', contact.email))
        const checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        checkbox.name = 'forward-members'
        checkbox.value = contact.email
        checkbox.checked = selectedEmails.has(contact.email)
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) selectedEmails.add(contact.email)
          else selectedEmails.delete(contact.email)
          option.classList.toggle('selected', checkbox.checked)
          updateSelection()
        })
        option.append(avatar, details, checkbox)
        membersList.append(option)
      })
    })
    if (!membersList.childElementCount) membersList.append(make('p', 'messages-forward-empty', query ? 'No matching teammates.' : 'No teammates are available to forward to.'))
  }
  const updateSelection = () => {
    const count = selectedEmails.size
    selectionCount.textContent = count ? `${count} selected` : ''
    selectedSummary.textContent = count ? `${count} recipient${count === 1 ? '' : 's'} selected` : 'Select recipients'
    submit.disabled = count === 0
  }
  search.addEventListener('input', renderRecipients)
  renderRecipients()
  form.append(header, searchWrap, preview, membersList, error, footer)
  backdrop.append(form)
  document.querySelector('#modal-root').append(backdrop)
  document.addEventListener('keydown', onKeyDown)
  search.focus()
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) closeModal()
  })
  form.addEventListener('submit', event => {
    event.preventDefault()
    if (!selectedEmails.size) return
    const previousConversations = [...demoState.conversations]
    const previousMessages = [...demoState.messages]
    selectedEmails.forEach(email => {
      const contact = getContact(email)
      if (!contact) return
      let conversation = demoState.conversations.find(item =>
        item.type === 'direct' &&
        item.members.length === 2 &&
        item.members.includes(contact.email) &&
        item.members.includes(currentUser.email?.toLowerCase())
      )
      if (!conversation) {
        conversation = {
          id: `direct-${crypto.randomUUID()}`,
          type: 'direct',
          name: '',
          createdAt: new Date().toISOString(),
          members: [currentUser.email.toLowerCase(), contact.email]
        }
        demoState.conversations.push(conversation)
      }
      demoState.messages.push({
        id: `message-${crypto.randomUUID()}`,
        conversationId: conversation.id,
        senderEmail: currentUser.email.toLowerCase(),
        senderName: currentUser.name,
        body: message.body,
        attachments: [...(message.attachments || [])],
        reactions: [],
        createdAt: new Date().toISOString(),
        forwardedFrom: { senderName: message.senderName }
      })
    })
    if (!persistDemoState()) {
      demoState.conversations = previousConversations
      demoState.messages = previousMessages
      error.textContent = 'The forwarded message could not be saved. Free up browser storage and try again.'
      error.hidden = false
      return
    }
    closeModal()
    renderMessages()
  })
}

function renderMessagesList() {
  const { feed } = getElements()
  if (!feed) return
  const shouldScroll = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80
  feed.replaceChildren()
  const conversation = demoState.conversations.find(item => item.id === selectedConversationId)
  const messages = getConversationMessages(selectedConversationId)
  if (!messages.length) {
    feed.append(make('p', 'messages-placeholder', 'No messages yet. Start the conversation.'))
    return
  }
  messages.forEach(message => {
    const ownMessage = message.senderEmail === currentUser.email?.toLowerCase()
    const row = make('article', `message-row${ownMessage ? ' own' : ''}`)
    const body = make('div', 'message-content')
    const bubble = make('div', 'message-bubble')
    if (message.pinned) bubble.append(make('div', 'message-pinned-label', '📌 Pinned'))
    if (!ownMessage) bubble.append(make('div', 'message-meta', message.senderName))
    if (message.forwardedFrom?.senderName) {
      bubble.append(make('div', 'message-forwarded-label', `↪ Forwarded from ${message.forwardedFrom.senderName}`))
    }
    if (message.replyToId) {
      const repliedMessage = demoState.messages.find(item => item.id === message.replyToId)
      const quote = make('div', 'message-reply-quote')
      quote.append(
        make('strong', '', message.replyToSenderName || repliedMessage?.senderName || 'Message'),
        make('span', '', message.replyToBody || repliedMessage?.body || 'Attachment')
      )
      bubble.append(quote)
    }
    if (message.body) bubble.append(make('p', 'message-text', message.body))
    ;(message.attachments || []).forEach(attachment => renderAttachment(attachment, bubble))
    const timeRow = make('span', 'message-time-row')
    if (message.editedAt) timeRow.append(make('span', 'message-edited-label', 'Edited'))
    timeRow.append(make('time', 'message-time', formatMessageTime(message.createdAt)))
    if (ownMessage && conversation?.type === 'direct') {
      const isRead = Boolean(message.readAt)
      const receipt = make('span', `message-status${isRead ? ' read' : ''}`, isRead ? '✓✓' : '✓')
      receipt.title = isRead ? 'Read (demo)' : 'Sent (demo)'
      receipt.setAttribute('aria-label', receipt.title)
      timeRow.append(receipt)
      if (!isRead) scheduleDemoReadReceipt(message)
    }
    bubble.append(timeRow)
    body.append(bubble)
    renderMessageActions(message, body)
    renderReactions(message, body)
    row.append(body)
    feed.append(row)
  })
  if (shouldScroll) feed.scrollTop = feed.scrollHeight
}

function scheduleDemoReadReceipt(message) {
  if (pendingReadReceipts.has(message.id)) return
  pendingReadReceipts.add(message.id)
  window.setTimeout(() => {
    pendingReadReceipts.delete(message.id)
    const latestMessage = demoState.messages.find(item => item.id === message.id)
    if (!latestMessage || latestMessage.readAt) return
    latestMessage.readAt = new Date().toISOString()
    if (!persistDemoState()) {
      latestMessage.readAt = null
      return
    }
    if (activeView === 'Messages') renderMessages()
  }, demoReadDelayMs)
}

function renderMessagesView() {
  const { header, input, send } = getElements()
  const conversation = demoState.conversations.find(item => item.id === selectedConversationId)
  if (conversation && activeView === 'Messages') markConversationRead(conversation.id)
  updateMessagesNavigationBadge()
  renderPeopleList()
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
  const titlePrefix = conversation.type === 'channel' ? '# ' : conversation.type === 'group' ? '◉ ' : ''
  heading.append(make('h2', '', `${titlePrefix}${getConversationTitle(conversation)}`))
  const participantNames = conversation.members.map(email => email === currentUser.email?.toLowerCase()
    ? currentUser.name
    : getContact(email)?.name || email)
  heading.append(make('p', '', participantNames.join(', ')))
  header.append(heading)
  input.disabled = false
  send.disabled = false
  renderMessagesList()
}

export function renderMessages() {
  if (activeView !== 'Messages') return
  renderPeopleList()
  renderMessagesView()
}

function openDirectConversation(contact) {
  let conversation = demoState.conversations.find(item =>
    item.type === 'direct' &&
    item.members.length === 2 &&
    item.members.includes(contact.email) &&
    item.members.includes(currentUser.email?.toLowerCase())
  )
  if (!conversation) {
    conversation = {
      id: `direct-${crypto.randomUUID()}`,
      type: 'direct',
      name: '',
      createdAt: new Date().toISOString(),
      members: [currentUser.email.toLowerCase(), contact.email]
    }
    demoState.conversations.push(conversation)
    if (!persistDemoState()) {
      demoState.conversations = demoState.conversations.filter(item => item.id !== conversation.id)
      return
    }
  }
  selectedConversationId = conversation.id
  renderMessages()
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
  const isChannel = type === 'channel'
  const isGroup = type === 'group'
  const title = make('h2', '', isChannel ? 'Create a channel' : isGroup ? 'Create a group' : 'Start a direct message')
  title.id = 'messages-create-title'
  form.setAttribute('aria-labelledby', title.id)
  const description = make('p', 'modal-copy', isChannel
    ? 'Create a shared channel and invite teammates.'
    : isGroup
      ? 'Name a group conversation and choose at least two teammates.'
      : 'Choose one teammate to start a private conversation.')
  const header = make('header', 'messages-create-header')
  header.append(make('span', 'messages-create-eyebrow', 'MESSAGES'), title, description, close)
  const nameInput = make('input')
  nameInput.placeholder = isChannel ? 'e.g. design-team' : 'e.g. Product launch team'
  nameInput.maxLength = 60
  nameInput.required = isChannel || isGroup
  nameInput.setAttribute('aria-label', isChannel ? 'Channel name' : 'Group name')
  const nameLabel = make('label', 'messages-create-label', isChannel ? 'Channel name' : 'Group name')
  nameLabel.append(nameInput)
  const memberLabel = make('p', 'messages-create-label', isChannel ? 'Invite teammates' : 'Choose teammates')
  const checkboxes = getContacts().map(contact => {
    const option = make('label', 'messages-member-option')
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.name = 'message-members'
    checkbox.value = contact.email
    checkbox.dataset.memberName = contact.name
    checkbox.addEventListener('change', () => option.classList.toggle('selected', checkbox.checked))
    const avatar = make('span', 'messages-create-avatar')
    renderAvatarElement(avatar, contact, 'messages-create-avatar')
    option.append(checkbox, avatar, make('span', '', contact.name), make('small', '', contact.email))
    return option
  })
  const membersList = make('div', 'messages-member-list')
  if (checkboxes.length) membersList.append(...checkboxes)
  else membersList.append(make('p', 'messages-list-empty', 'No invited teammates are available.'))
  const submit = make('button', 'primary-button full messages-create-submit', isChannel ? 'Create channel' : isGroup ? 'Create group' : 'Start direct message')
  submit.type = 'submit'
  const error = make('p', 'messages-error')
  error.setAttribute('role', 'alert')
  error.hidden = true
  const selectedMembers = () => [...form.querySelectorAll('input[name="message-members"]:checked')]
  const isValid = () => {
    const count = selectedMembers().length
    return (isChannel ? count >= 1 : isGroup ? count >= 2 : count === 1) &&
      (!(isChannel || isGroup) || Boolean(nameInput.value.trim()))
  }
  const updateSubmit = () => { submit.disabled = !isValid() }
  membersList.addEventListener('change', updateSubmit)
  nameInput.addEventListener('input', updateSubmit)
  updateSubmit()
  form.append(header)
  if (isChannel || isGroup) form.append(nameLabel)
  form.append(memberLabel, membersList, error, submit)
  backdrop.append(form)
  document.querySelector('#modal-root').append(backdrop)
  if (isGroup) nameInput.focus()
  else if (!isChannel) checkboxes[0]?.querySelector('input')?.focus()
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) backdrop.remove()
  })
  form.addEventListener('submit', event => {
    event.preventDefault()
    if (!isValid()) return
    const selected = selectedMembers()
    let conversation
    if (type === 'direct') {
      openDirectConversation(getContact(selected[0].value))
      backdrop.remove()
      return
    }
    conversation = {
      id: `${type}-${crypto.randomUUID()}`,
      type,
      name: nameInput.value.trim(),
      createdAt: new Date().toISOString(),
      members: [currentUser.email.toLowerCase(), ...selected.map(input => input.value)]
    }
    demoState.conversations.unshift(conversation)
    if (!persistDemoState()) {
      demoState.conversations = demoState.conversations.filter(item => item.id !== conversation.id)
      return
    }
    selectedConversationId = conversation.id
    backdrop.remove()
    renderMessages()
  })
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function getAttachmentKind(attachment) {
  const mediaType = attachment.mediaType || ''
  if (mediaType.startsWith('image/')) return 'image'
  if (mediaType.startsWith('video/')) return 'video'
  if (mediaType.startsWith('audio/')) return 'audio'
  return null
}

function getAttachmentType(attachment) {
  const extension = attachment.fileName?.split('.').pop()?.toLowerCase()
  if (['doc', 'docx', 'odt', 'rtf'].includes(extension)) return { label: 'Word document', badge: 'WORD', style: 'word' }
  if (['xls', 'xlsx', 'ods', 'csv'].includes(extension)) return { label: 'Spreadsheet', badge: 'XLS', style: 'spreadsheet' }
  if (['ppt', 'pptx', 'odp'].includes(extension)) return { label: 'Presentation', badge: 'PPT', style: 'presentation' }
  if (extension === 'pdf' || attachment.mediaType === 'application/pdf') return { label: 'PDF document', badge: 'PDF', style: 'pdf' }
  if (extension === 'svg' || attachment.mediaType === 'image/svg+xml') return { label: 'SVG image', badge: 'SVG', style: 'image' }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) return { label: 'Archive', badge: 'ZIP', style: 'archive' }
  if (attachment.mediaType?.startsWith('audio/')) return { label: 'Audio', badge: 'AUDIO', style: 'audio' }
  if (attachment.mediaType?.startsWith('video/')) return { label: 'Video', badge: 'VIDEO', style: 'video' }
  if (attachment.mediaType?.startsWith('image/')) return { label: 'Image', badge: 'IMAGE', style: 'image' }
  if (['txt', 'md', 'json', 'xml', 'html', 'css', 'js', 'ts'].includes(extension)) return { label: 'Text file', badge: 'TXT', style: 'text' }
  return { label: 'File', badge: 'FILE', style: 'generic' }
}

function createAttachmentIcon(attachment) {
  const type = getAttachmentType(attachment)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.classList.add('message-file-icon', `message-file-icon-${type.style}`)
  svg.setAttribute('viewBox', '0 0 40 48')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', type.label)
  const page = document.createElementNS(svg.namespaceURI, 'path')
  page.setAttribute('d', 'M7 2.5h17l10 10v30H7z')
  page.setAttribute('fill', 'currentColor')
  page.setAttribute('fill-opacity', '.12')
  page.setAttribute('stroke', 'currentColor')
  page.setAttribute('stroke-width', '2')
  page.setAttribute('stroke-linejoin', 'round')
  const fold = document.createElementNS(svg.namespaceURI, 'path')
  fold.setAttribute('d', 'M24 3v10h10')
  fold.setAttribute('fill', 'none')
  fold.setAttribute('stroke', 'currentColor')
  fold.setAttribute('stroke-width', '2')
  fold.setAttribute('stroke-linejoin', 'round')
  const badge = document.createElementNS(svg.namespaceURI, 'rect')
  badge.setAttribute('x', '2')
  badge.setAttribute('y', '30')
  badge.setAttribute('width', '36')
  badge.setAttribute('height', '13')
  badge.setAttribute('rx', '3')
  badge.setAttribute('fill', 'currentColor')
  const label = document.createElementNS(svg.namespaceURI, 'text')
  label.setAttribute('x', '20')
  label.setAttribute('y', '39')
  label.setAttribute('text-anchor', 'middle')
  label.setAttribute('fill', '#FFFFFF')
  label.textContent = type.badge
  svg.append(page, fold, badge, label)
  return svg
}

function openAttachmentViewer(attachment, kind) {
  const backdrop = make('div', 'message-attachment-viewer-backdrop')
  const viewer = make('section', 'message-attachment-viewer')
  viewer.setAttribute('role', 'dialog')
  viewer.setAttribute('aria-modal', 'true')
  viewer.setAttribute('aria-label', `Preview ${attachment.fileName}`)
  const header = make('header', 'message-attachment-viewer-header')
  header.append(make('h2', '', attachment.fileName))
  const actions = make('div', 'message-attachment-viewer-actions')
  const save = make('a', 'message-attachment-save', 'Save')
  save.href = attachment.data
  save.download = attachment.fileName
  const close = make('button', 'message-attachment-close', 'Close')
  close.type = 'button'
  const closeViewer = () => {
    backdrop.remove()
    document.removeEventListener('keydown', onKeyDown)
  }
  const onKeyDown = event => {
    if (event.key === 'Escape') closeViewer()
  }
  close.addEventListener('click', closeViewer)
  actions.append(save, close)
  header.append(actions)
  const content = make('div', 'message-attachment-viewer-content')
  let media
  if (kind === 'image') {
    media = document.createElement('img')
    media.alt = attachment.fileName
  } else if (kind === 'video') {
    media = document.createElement('video')
    media.controls = true
    media.autoplay = true
  } else {
    media = document.createElement('audio')
    media.controls = true
    media.autoplay = true
  }
  media.src = attachment.data
  content.append(media)
  viewer.append(header, content)
  backdrop.append(viewer)
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) closeViewer()
  })
  document.querySelector('#modal-root').append(backdrop)
  document.addEventListener('keydown', onKeyDown)
  close.focus()
}

function renderAttachment(attachment, container) {
  const kind = getAttachmentKind(attachment)
  if (!kind) {
    const type = getAttachmentType(attachment)
    const link = make('a', `message-attachment message-attachment-file message-file-icon-${type.style}`)
    link.href = attachment.data
    link.download = attachment.fileName
    const details = make('span', 'message-attachment-preview-details')
    details.append(
      make('strong', '', attachment.fileName),
      make('small', '', `${type.label} · ${formatFileSize(attachment.size)}`)
    )
    link.append(createAttachmentIcon(attachment), details)
    container.append(link)
    return
  }
  const preview = make('button', `message-attachment-preview ${kind}`)
  preview.type = 'button'
  preview.setAttribute('aria-label', `Open ${attachment.fileName}`)
  preview.title = `Open ${attachment.fileName}`
  if (kind === 'image') {
    const image = document.createElement('img')
    image.src = attachment.data
    image.alt = attachment.fileName
    image.loading = 'lazy'
    preview.append(image)
  } else {
    preview.append(createAttachmentIcon(attachment))
    const details = make('span', 'message-attachment-preview-details')
    details.append(make('strong', '', attachment.fileName), make('small', '', `${getAttachmentType(attachment).label} · ${formatFileSize(attachment.size)}`))
    preview.append(details)
  }
  preview.addEventListener('click', () => openAttachmentViewer(attachment, kind))
  container.append(preview)
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

function sendMessage(event) {
  event.preventDefault()
  const { input } = getElements()
  const body = input.value.trim()
  if (editingMessageId) {
    const message = demoState.messages.find(item => item.id === editingMessageId)
    if (!message || !body) return
    const previousBody = message.body
    const previousEditedAt = message.editedAt
    message.body = body
    message.editedAt = new Date().toISOString()
    if (!persistDemoState()) {
      message.body = previousBody
      if (previousEditedAt) message.editedAt = previousEditedAt
      else delete message.editedAt
      return
    }
    input.value = ''
    cancelComposerContext()
    clearError()
    renderMessages()
    return
  }
  if (!selectedConversationId || (!body && pendingFiles.length === 0)) return
  const readerResults = Promise.all(pendingFiles.map(async file => ({
    fileName: file.name,
    mediaType: file.type || 'application/octet-stream',
    size: file.size,
    data: await fileToDataUrl(file)
  })))
  readerResults.then(attachments => {
    const message = {
      id: `message-${crypto.randomUUID()}`,
      conversationId: selectedConversationId,
      senderEmail: currentUser.email.toLowerCase(),
      senderName: currentUser.name,
      body,
      replyToId: replyTargetId || null,
      replyToSenderName: replyTargetId ? demoState.messages.find(item => item.id === replyTargetId)?.senderName : null,
      replyToBody: replyTargetId ? demoState.messages.find(item => item.id === replyTargetId)?.body : null,
      createdAt: new Date().toISOString(),
      attachments,
      reactions: [],
      readAt: null
    }
    demoState.messages.push(message)
    if (!persistDemoState()) {
      demoState.messages = demoState.messages.filter(item => item.id !== message.id)
      return
    }
    input.value = ''
    replyTargetId = null
    editingMessageId = null
    setSendButtonMode(false)
    renderComposerContext()
    pendingFiles = []
    renderPendingFiles()
    clearError()
    renderMessages()
  }).catch(showError)
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
  document.querySelector('#messages-new-channel')?.addEventListener('click', () => openConversationModal('channel'))
  document.querySelector('#messages-new-group')?.addEventListener('click', () => openConversationModal('group'))
  document.querySelector('#messages-new-direct')?.addEventListener('click', () => openConversationModal('direct'))
  document.querySelector('#messages-composer')?.addEventListener('submit', sendMessage)
  document.querySelector('#messages-file-input')?.addEventListener('change', event => {
    const incomingFiles = [...event.currentTarget.files]
    const totalSize = [...pendingFiles, ...incomingFiles].reduce((sum, file) => sum + file.size, 0)
    if (totalSize > maxAttachmentBytes) {
      showError(new Error('Demo attachments must total 512 KB or less per message to fit browser storage.'))
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
    if (!event.target.closest('.message-actions')) {
      document.querySelectorAll('.message-actions-menu:not([hidden])').forEach(menu => {
        menu.hidden = true
        const actions = menu.parentElement
        actions?.classList.remove('open')
        actions?.querySelector('.message-actions-trigger')?.setAttribute('aria-expanded', 'false')
      })
    }
  })
  window.addEventListener('storage', event => {
    if (event.key !== storageKey || !event.newValue) return
    try {
      demoState = JSON.parse(event.newValue)
      updateMessagesNavigationBadge()
      renderMessages()
    } catch (error) {
      showError(new Error('Updated demo messages could not be read from browser storage.'))
    }
  })
}
