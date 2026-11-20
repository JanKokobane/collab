import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { AuthUser } from '../../auth/authClient.js'
import { dashboardApi } from '../../services/dashboardApi.js'
import { useDashboardData } from '../../state/DashboardDataContext.js'
import type { ConversationMessage, MessageAttachment, MessageCallHistoryRecord, MessageConversation, Project } from '../../types/dashboard.js'
import { dashboardApiBaseUrl } from '../../services/dashboardApi.js'
import { MessageCalls, type RealtimeSocket } from './useMessageCalls.js'
import styles from './Messages.module.css'

type ConversationType = 'direct' | 'group' | 'channel'
type ComposerContext = { type: 'reply' | 'edit'; message: ConversationMessage } | null
const reactionChoices = ['👍', '❤️', '😂', '🎉', '👀', '🙌', '🔥', '✅', '🤔', '😄']
const maxAttachmentBytes = 200 * 1024 * 1024

export interface MessageContextReference {
  conversationId: string
  messageId: string
}

interface MessagesProps {
  user: AuthUser
  searchValue: string
  messageContext: MessageContextReference | null
  onOpenMessageContext: (reference: MessageContextReference) => void
  onMessageContextHandled: () => void
}

function conversationTitle(conversation: MessageConversation, uid: string) {
  if (conversation.conversation_type === 'channel') return conversation.name
  const others = conversation.members.filter((member) => member.firebaseUid !== uid)
  if (conversation.conversation_type === 'group') {
    return conversation.name || others.map((member) => member.name || member.email).join(', ') || 'Group conversation'
  }
  return others[0]?.name || others[0]?.email || 'Direct message'
}

function directPresenceText(conversation: MessageConversation, uid: string) {
  const member = conversation.members.find((person) => person.firebaseUid !== uid)
  if (!member) return 'Last seen unavailable'
  if (member.is_online) return 'Online'
  const lastSeen = member.last_seen_at || member.lastSeenAt
  const date = lastSeen ? new Date(lastSeen) : null
  const formatted = date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : 'unavailable'
  return `Last seen ${formatted}`
}

function attachmentPreview(attachments: MessageAttachment[]) {
  if (attachments.some((attachment) => attachment.is_voice_note)) return 'Voice message'
  if (attachments.some((attachment) => attachment.mediaType.startsWith('image/'))) return 'Sent a photo'
  return attachments.length ? 'Sent an attachment' : ''
}

function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
}

function formatFileSize(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
}

function toDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () => reject(new Error(`Unable to read ${file.name}.`)))
    reader.readAsDataURL(file)
  })
}

function projectContacts(project: Project, currentUid: string) {
  return [
    { firebaseUid: project.creator_firebase_uid, name: project.creator_name || project.creator_email || 'Project owner', email: project.creator_email, profileImage: project.creator_profile_image },
    ...project.accepted_members.map((member) => ({
      firebaseUid: member.firebaseUid,
      name: member.name || member.email || 'Project member',
      email: member.email,
      profileImage: member.profileImage,
    })),
  ].filter((member, index, list) =>
    member.firebaseUid && member.firebaseUid !== currentUid &&
    list.findIndex((candidate) => candidate.firebaseUid === member.firebaseUid) === index)
    .sort((first, second) => first.name.localeCompare(second.name))
}

export default function Messages({
  user,
  searchValue,
  messageContext,
  onOpenMessageContext,
  onMessageContextHandled,
}: MessagesProps) {
  const dashboard = useDashboardData()
  const [conversations, setConversations] = useState<MessageConversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [callHistory, setCallHistory] = useState<MessageCallHistoryRecord[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([])
  const [recordingVoice, setRecordingVoice] = useState(false)
  const [context, setContext] = useState<ComposerContext>(null)
  const [modal, setModal] = useState<ConversationType | null>(null)
  const [taskMessage, setTaskMessage] = useState<ConversationMessage | null>(null)
  const [forwardMessage, setForwardMessage] = useState<ConversationMessage | null>(null)
  const [summary, setSummary] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const [messageSocket, setMessageSocket] = useState<RealtimeSocket | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const selectedRef = useRef<string | null>(null)
  const conversationsRef = useRef(dashboard.conversations.data)
  const voiceRecorderRef = useRef<MediaRecorder | null>(null)
  const voiceStreamRef = useRef<MediaStream | null>(null)
  const voiceStartedAtRef = useRef(0)
  const cancelVoiceRecordingRef = useRef(false)
  const scrollToBottomRef = useRef(false)
  const messageRowRefs = useRef(new Map<string, HTMLElement>())
  const contextHandledRef = useRef(onMessageContextHandled)
  const draftSelectionRef = useRef<{ start: number; end: number } | null>(null)
  conversationsRef.current = dashboard.conversations.data
  contextHandledRef.current = onMessageContextHandled

  const projects = dashboard.projects.data
  const selected = conversations.find((conversation) => conversation.conversation_id === selectedId) || null
  const callConversation = selected?.conversation_type === 'direct'
    ? {
      id: selected.conversation_id,
      projectId: selected.project_id,
      type: selected.conversation_type,
      name: conversationTitle(selected, user.uid),
      participants: selected.members.map((member) => ({
        firebaseUid: member.firebaseUid,
        name: member.name || member.email,
        profileImage: member.profileImage,
      })),
    }
    : null
  const callInvitees = useMemo(() => {
    if (!selected) return []
    const project = projects.find((item) => item.project_id === selected.project_id)
    if (!project) return []
    return projectContacts(project, user.uid).map((person) => ({
      firebaseUid: person.firebaseUid,
      name: person.name,
      profileImage: person.profileImage,
    }))
  }, [projects, selected, user.uid])
  const profileImages = useMemo(() => {
    const images = new Map<string, string>()
    for (const project of projects) {
      if (project.creator_firebase_uid && project.creator_profile_image) {
        images.set(project.creator_firebase_uid, project.creator_profile_image)
      }
      for (const member of project.accepted_members) {
        if (member.firebaseUid && member.profileImage) images.set(member.firebaseUid, member.profileImage)
      }
    }
    return images
  }, [projects])
  const contacts = useMemo(() => {
    const seen = new Set<string>()
    return projects.flatMap((project) => projectContacts(project, user.uid).map((person) => ({ ...person, projectId: project.project_id, projectName: project.name })))
      .filter((person) => {
        if (seen.has(person.firebaseUid)) return false
        seen.add(person.firebaseUid)
        return true
      })
  }, [projects, user.uid])
  const filteredConversations = useMemo(() => {
    const query = searchValue.trim().toLowerCase()
    if (!query) return conversations
    return conversations.filter((conversation) =>
      `${conversationTitle(conversation, user.uid)} ${conversation.latest_message_body} ${conversation.members.map((member) => `${member.name} ${member.email}`).join(' ')}`
        .toLowerCase().includes(query))
  }, [conversations, searchValue, user.uid])
  const filteredContacts = useMemo(() => {
    const query = searchValue.trim().toLowerCase()
    return contacts.filter((contact) =>
      !query || `${contact.name} ${contact.email} ${contact.projectName}`.toLowerCase().includes(query))
  }, [contacts, searchValue])

  useEffect(() => {
    setConversations(dashboard.conversations.data)
  }, [dashboard.conversations.data])

  useEffect(() => {
    selectedRef.current = selectedId
  }, [selectedId])

  useEffect(() => () => {
    cancelVoiceRecordingRef.current = true
    voiceRecorderRef.current?.stop()
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

  const refreshConversationList = useCallback(async () => {
    try {
      const response = await dashboardApi.fetchMessageConversations(user)
      setConversations(response.data.conversations)
      dashboard.replaceConversations(response.data.conversations)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Conversations could not be refreshed.')
    }
  }, [dashboard.replaceConversations, user])

  const loadMessages = useCallback(async (conversationId: string, before?: string | null) => {
    if (!before) setLoadingMessages(true)
    try {
      const response = await dashboardApi.fetchConversationMessages(user, conversationId, before)
      if (selectedRef.current !== conversationId) return
      setMessages((current) => before
        ? [...response.data.messages, ...current.filter((message) =>
          !response.data.messages.some((older) => older.message_id === message.message_id))]
        : response.data.messages)
      setCursor(response.data.nextCursor)
      setHasMore(response.data.hasMore)
    } catch (requestError) {
      if (selectedRef.current === conversationId) {
        setError(requestError instanceof Error ? requestError.message : 'Messages could not be loaded.')
      }
    } finally {
      setLoadingMessages(false)
      setLoadingOlder(false)
    }
  }, [user])

  const loadCallHistory = useCallback(async (conversationId: string) => {
    try {
      const response = await dashboardApi.fetchConversationCallHistory(user, conversationId)
      if (selectedRef.current === conversationId) setCallHistory(response.data.calls)
    } catch (requestError) {
      if (selectedRef.current === conversationId) {
        setError(requestError instanceof Error ? requestError.message : 'Call history could not be loaded.')
      }
    }
  }, [user])

  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      setCallHistory([])
      setCursor(null)
      setHasMore(false)
      return
    }
    selectedRef.current = selectedId
    setError('')
    setMessages([])
    setCallHistory([])
    void loadMessages(selectedId)
    if (conversationsRef.current.find((conversation) => conversation.conversation_id === selectedId)?.conversation_type === 'direct') {
      void loadCallHistory(selectedId)
    }
    void dashboardApi.markConversationRead(user, selectedId).then(() => {
      const updated = conversationsRef.current.map((conversation) => conversation.conversation_id === selectedId
        ? { ...conversation, unread_count: 0 }
        : conversation)
      setConversations(updated)
      dashboard.replaceConversations(updated)
    }).catch((requestError: unknown) => {
      setError(requestError instanceof Error ? requestError.message : 'Conversation could not be marked as read.')
    })
  }, [dashboard.replaceConversations, loadCallHistory, loadMessages, selectedId, user])

  useEffect(() => {
    if (!messageContext) return
    let active = true
    const openContext = async () => {
      try {
        const response = await dashboardApi.fetchMessageConversations(user)
        if (!active) return
        setConversations(response.data.conversations)
        dashboard.replaceConversations(response.data.conversations)
        const conversation = response.data.conversations.find((item) => item.conversation_id === messageContext.conversationId)
        if (!conversation) {
          setError('The discussion is not available to your account.')
          return
        }
        selectedRef.current = conversation.conversation_id
        scrollToBottomRef.current = false
        setSelectedId(conversation.conversation_id)
        setMessages([])
        setCallHistory([])
        setLoadingMessages(true)
        let before: string | null = null
        let found = false
        let collected: ConversationMessage[] = []
        do {
          const page = await dashboardApi.fetchConversationMessages(user, conversation.conversation_id, before)
          if (!active) return
          collected = [...page.data.messages, ...collected]
          setMessages(collected)
          setCursor(page.data.nextCursor)
          setHasMore(page.data.hasMore)
          found = collected.some((message) => message.message_id === messageContext.messageId)
          before = page.data.hasMore ? page.data.nextCursor : null
        } while (before && !found)
        if (!found) {
          setError('The linked message is not available in this conversation.')
          return
        }
        setHighlightedMessageId(messageContext.messageId)
        if (conversation.conversation_type === 'direct') void loadCallHistory(conversation.conversation_id)
        await dashboardApi.markConversationRead(user, conversation.conversation_id)
        const updated = conversationsRef.current.map((item) => item.conversation_id === conversation.conversation_id
          ? { ...item, unread_count: 0 }
          : item)
        setConversations(updated)
        dashboard.replaceConversations(updated)
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : 'The linked message could not be opened.')
      } finally {
        if (active) {
          setLoadingMessages(false)
          contextHandledRef.current()
        }
      }
    }
    void openContext()
    return () => { active = false }
  }, [dashboard.replaceConversations, loadCallHistory, messageContext, user])

  useEffect(() => {
    if (!highlightedMessageId) return
    const row = messageRowRefs.current.get(highlightedMessageId)
    if (!row) return
    row.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const timeoutId = window.setTimeout(() => setHighlightedMessageId(null), 2200)
    return () => window.clearTimeout(timeoutId)
  }, [highlightedMessageId, messages])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (selectedId) {
        void loadMessages(selectedId)
        if (conversationsRef.current.find((conversation) => conversation.conversation_id === selectedId)?.conversation_type === 'direct') {
          void loadCallHistory(selectedId)
        }
      }
      void refreshConversationList()
    }, 8000)
    return () => window.clearInterval(intervalId)
  }, [loadCallHistory, loadMessages, refreshConversationList, selectedId])

  useEffect(() => {
    if (!messageSocket) return
    const refreshForConversation = (conversationId: string, markRead = false) => {
      void refreshConversationList()
      if (conversationId !== selectedRef.current) return
      void loadMessages(conversationId)
      if (!markRead) return
      void dashboardApi.markConversationRead(user, conversationId).then(() => {
        const updated = conversationsRef.current.map((conversation) => conversation.conversation_id === conversationId
          ? { ...conversation, unread_count: 0 }
          : conversation)
        setConversations(updated)
        dashboard.replaceConversations(updated)
      }).catch((requestError: unknown) => {
        setError(requestError instanceof Error ? requestError.message : 'Conversation could not be marked as read.')
      })
    }
    const onMessageCreated = ({ message }: { message: ConversationMessage }) => refreshForConversation(message.conversation_id, true)
    const onMessageUpdated = ({ message }: { message: ConversationMessage }) => refreshForConversation(message.conversation_id)
    const onMessageDeleted = ({ conversation_id: conversationId }: { conversation_id: string }) => refreshForConversation(conversationId)
    const onMessageRead = ({ conversation_id: conversationId }: { conversation_id: string }) => refreshForConversation(conversationId)
    const onMessageDelivered = ({ conversation_id: conversationId }: { conversation_id: string }) => refreshForConversation(conversationId)
    const onConversationCreated = () => void refreshConversationList()
    const onConversationRemoved = ({ conversation_id: conversationId }: { conversation_id: string }) => {
      const next = conversationsRef.current.filter((conversation) => conversation.conversation_id !== conversationId)
      setConversations(next)
      dashboard.replaceConversations(next)
      if (selectedRef.current === conversationId) setSelectedId(next[0]?.conversation_id || null)
    }
    const onConversationCleared = ({ conversation_id: conversationId }: { conversation_id: string }) => {
      if (conversationId === selectedRef.current) void loadMessages(conversationId)
    }
    const onPresenceUpdated = (presence: { firebase_uid: string; is_online: boolean; last_seen_at: string | null }) => {
      const next = conversationsRef.current.map((conversation) => ({
        ...conversation,
        members: conversation.members.map((member) => member.firebaseUid === presence.firebase_uid
          ? {
            ...member,
            is_online: presence.is_online,
            last_seen_at: presence.last_seen_at,
            lastSeenAt: presence.last_seen_at,
          }
          : member),
      }))
      setConversations(next)
      dashboard.replaceConversations(next)
    }
    const onCallUpdated = ({ call }: { call?: { conversation_id?: string } }) => {
      if (call?.conversation_id === selectedRef.current) void loadCallHistory(call.conversation_id)
    }
    const joinSelectedConversation = () => {
      if (!selectedId) return
      messageSocket.emit('conversation:join', selectedId, (result) => {
        if (!result.success) setError(result.message || 'This conversation could not be joined.')
      })
    }
    messageSocket.on('message:created', onMessageCreated)
    messageSocket.on('message:updated', onMessageUpdated)
    messageSocket.on('message:deleted', onMessageDeleted)
    messageSocket.on('message:read', onMessageRead)
    messageSocket.on('message:delivered', onMessageDelivered)
    messageSocket.on('conversation:created', onConversationCreated)
    messageSocket.on('conversations:refresh', onConversationCreated)
    messageSocket.on('conversation:removed', onConversationRemoved)
    messageSocket.on('conversation:cleared', onConversationCleared)
    messageSocket.on('presence:updated', onPresenceUpdated)
    messageSocket.on('call:updated', onCallUpdated)
    messageSocket.on('connect', joinSelectedConversation)
    if (messageSocket.connected) joinSelectedConversation()
    return () => {
      messageSocket.off('message:created', onMessageCreated)
      messageSocket.off('message:updated', onMessageUpdated)
      messageSocket.off('message:deleted', onMessageDeleted)
      messageSocket.off('message:read', onMessageRead)
      messageSocket.off('message:delivered', onMessageDelivered)
      messageSocket.off('conversation:created', onConversationCreated)
      messageSocket.off('conversations:refresh', onConversationCreated)
      messageSocket.off('conversation:removed', onConversationRemoved)
      messageSocket.off('conversation:cleared', onConversationCleared)
      messageSocket.off('presence:updated', onPresenceUpdated)
      messageSocket.off('call:updated', onCallUpdated)
      messageSocket.off('connect', joinSelectedConversation)
      if (selectedId) messageSocket.emit('conversation:leave', selectedId)
    }
  }, [dashboard.replaceConversations, loadCallHistory, loadMessages, messageSocket, refreshConversationList, selectedId, user])

  useEffect(() => {
    const feed = feedRef.current
    if (!feed || !messages.length || loadingOlder) return
    if (scrollToBottomRef.current) {
      feed.scrollTop = feed.scrollHeight
      scrollToBottomRef.current = false
      return
    }
    const nearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 120
    if (nearBottom) feed.scrollTop = feed.scrollHeight
  }, [messages, loadingOlder])

  async function selectConversation(conversationId: string) {
    if (voiceRecorderRef.current?.state === 'recording') cancelVoiceRecording()
    scrollToBottomRef.current = true
    setSelectedId(conversationId)
    setContext(null)
    setDraft('')
    setPendingFiles([])
    setPendingAttachments([])
    setMenuOpen(false)
  }

  async function loadOlder() {
    if (!selectedId || !cursor || !hasMore || loadingOlder) return
    setLoadingOlder(true)
    const feed = feedRef.current
    const previousHeight = feed?.scrollHeight || 0
    await loadMessages(selectedId, cursor)
    requestAnimationFrame(() => {
      if (feed) feed.scrollTop = feed.scrollHeight - previousHeight
    })
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedId || sending) return
    const body = draft.trim()
    if (context?.type === 'edit') {
      if (!body) return
      setSending(true)
      try {
        await dashboardApi.mutateConversationMessage(user, selectedId, context.message.message_id, 'edit', { body })
        setContext(null)
        setDraft('')
        await loadMessages(selectedId)
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'The message could not be edited.')
      } finally {
        setSending(false)
      }
      return
    }
    if (!body && !pendingFiles.length && !pendingAttachments.length) return
    setSending(true)
    setError('')
    try {
      const fileAttachments = await Promise.all(pendingFiles.map(async (file): Promise<MessageAttachment> => ({
        fileName: file.name,
        mediaType: file.type || 'application/octet-stream',
        size: file.size,
        data: await toDataUrl(file),
      })))
      const attachments = [...pendingAttachments, ...fileAttachments]
      const clientMessageId = crypto.randomUUID()
      const replyTo = context?.type === 'reply' ? context.message : null
      const response = await dashboardApi.createConversationMessage(user, selectedId, {
        body,
        attachments,
        replyToId: replyTo?.message_id || null,
        clientMessageId,
      })
      setMessages((current) => [...current.filter((item) => item.message_id !== response.data.message.message_id), response.data.message]
        .sort((first, second) => Date.parse(first.created_at) - Date.parse(second.created_at)))
      const updatedConversations = conversationsRef.current.map((conversation) => conversation.conversation_id === selectedId
        ? { ...conversation, latest_message_body: body || attachmentPreview(attachments), latest_message_created_at: response.data.message.created_at }
        : conversation)
      setConversations(updatedConversations)
      dashboard.replaceConversations(updatedConversations)
      setDraft('')
      setPendingFiles([])
      setPendingAttachments([])
      setContext(null)
      void refreshConversationList()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The message could not be sent.')
    } finally {
      setSending(false)
    }
  }

  async function forwardToMembers(message: ConversationMessage, recipients: Array<{ firebaseUid: string; projectId: string }>) {
    try {
      for (const recipient of recipients) {
        const conversationResponse = await dashboardApi.createMessageConversation(user, {
          projectId: recipient.projectId,
          type: 'direct',
          memberFirebaseUids: [recipient.firebaseUid],
        })
        await dashboardApi.createConversationMessage(user, conversationResponse.data.conversation.conversation_id, {
          body: message.body,
          attachments: message.attachments,
          forwardedFrom: { senderName: message.sender_name },
          clientMessageId: crypto.randomUUID(),
        })
      }
      setForwardMessage(null)
      await refreshConversationList()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The message could not be forwarded.')
      throw requestError
    }
  }

  async function convertMessageToTask(message: ConversationMessage, input: { title: string; description: string; category: string; priority: 'low' | 'medium' | 'high' }) {
    const projectId = conversations.find((conversation) => conversation.conversation_id === message.conversation_id)?.project_id
    if (!projectId) {
      setError('The project for this discussion could not be found.')
      throw new Error('The project for this discussion could not be found.')
    }
    try {
      await dashboardApi.createProjectTask(user, projectId, {
        ...input,
        status: 'To do',
        chatMessageId: message.message_id,
        descriptionAttachments: message.attachments.filter((attachment) => attachment.is_voice_note),
      })
      await dashboard.refreshTasks()
      setTaskMessage(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The task could not be created.')
      throw requestError
    }
  }

  async function summarizeConversation() {
    if (!selected || selected.conversation_type !== 'channel' || summarizing) return
    const lines = messages.filter((message) => !message.is_deleted).slice(-100).map((message) => {
      const body = message.body || (message.attachments.length ? '[Attachment]' : '')
      return body ? `${message.sender_name}: ${body.slice(0, 1800)}` : ''
    }).filter(Boolean)
    const bounded: string[] = []
    let totalCharacters = 0
    for (const line of lines.reverse()) {
      if (totalCharacters + line.length > 20000) continue
      bounded.unshift(line)
      totalCharacters += line.length
    }
    if (!bounded.length) {
      setError('There are no readable messages to summarize.')
      return
    }
    setSummarizing(true)
    try {
      setSummary(await dashboardApi.summarizeChat(user, bounded))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The conversation could not be summarized.')
    } finally {
      setSummarizing(false)
    }
  }

  async function createConversation(type: ConversationType, projectId: string, name: string, memberUids: string[]) {
    try {
      const response = await dashboardApi.createMessageConversation(user, {
        projectId,
        type,
        name,
        memberFirebaseUids: memberUids,
      })
      const conversation = response.data.conversation
      const updatedConversations = [
        conversation,
        ...conversationsRef.current.filter((item) => item.conversation_id !== conversation.conversation_id),
      ]
      setConversations(updatedConversations)
      dashboard.replaceConversations(updatedConversations)
      setModal(null)
      setSelectedId(conversation.conversation_id)
      void refreshConversationList()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The conversation could not be created.')
      throw requestError
    }
  }

  async function mutateMessage(message: ConversationMessage, action: string, body: Record<string, unknown> = {}) {
    try {
      await dashboardApi.mutateConversationMessage(user, message.conversation_id, message.message_id, action, body)
      await loadMessages(message.conversation_id)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The message could not be updated.')
    }
  }

  async function deleteMessage(message: ConversationMessage, scope: 'me' | 'everyone') {
    if (scope === 'everyone' && message.sender_firebase_uid !== user.uid) return
    if (!window.confirm(scope === 'everyone' ? 'Delete this message for everyone?' : 'Delete this message for you?')) return
    try {
      await dashboardApi.deleteConversationMessage(user, message.conversation_id, message.message_id, scope)
      await loadMessages(message.conversation_id)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The message could not be deleted.')
    }
  }

  async function conversationAction(action: 'clear' | 'delete') {
    if (!selected) return
    const prompt = action === 'clear'
      ? 'Clear all messages from this conversation for you? Other members will still see them.'
      : 'Delete this chat for you? Other members will keep the conversation.'
    if (!window.confirm(prompt)) return
    try {
      if (action === 'clear') {
        await dashboardApi.clearConversationMessages(user, selected.conversation_id)
        setMessages([])
      } else {
        await dashboardApi.deleteMessageConversation(user, selected.conversation_id)
        const remaining = conversations.filter((conversation) => conversation.conversation_id !== selected.conversation_id)
        setConversations(remaining)
        setSelectedId(remaining[0]?.conversation_id || null)
      }
      setMenuOpen(false)
      await refreshConversationList()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The conversation action could not be completed.')
    }
  }

  function startEdit(message: ConversationMessage) {
    setPendingFiles([])
    setPendingAttachments([])
    setContext({ type: 'edit', message })
    setDraft(message.body)
    inputRef.current?.focus()
  }

  function startReply(message: ConversationMessage) {
    setContext({ type: 'reply', message })
    inputRef.current?.focus()
  }

  async function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.currentTarget.files || [])
    const total = [...pendingFiles, ...incoming].reduce((sum, file) => sum + file.size, 0) +
      pendingAttachments.reduce((sum, attachment) => sum + attachment.size, 0)
    event.currentTarget.value = ''
    if (total > maxAttachmentBytes) {
      setError('Attachments must total 200 MB or less per message.')
      return
    }
    setError('')
    setPendingFiles((current) => [...current, ...incoming])
  }

  async function toggleVoiceRecording() {
    const recorder = voiceRecorderRef.current
    if (recorder?.state === 'recording') {
      recorder.stop()
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Voice recording is unavailable in this browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const nextRecorder = new MediaRecorder(stream)
      const chunks: Blob[] = []
      voiceStreamRef.current = stream
      voiceRecorderRef.current = nextRecorder
      voiceStartedAtRef.current = Date.now()
      cancelVoiceRecordingRef.current = false
      nextRecorder.addEventListener('dataavailable', (event) => {
        if (event.data.size) chunks.push(event.data)
      })
      nextRecorder.addEventListener('stop', () => {
        const duration = Math.max(1, Math.round((Date.now() - voiceStartedAtRef.current) / 1000))
        const blob = new Blob(chunks, { type: nextRecorder.mimeType || 'audio/webm' })
        stream.getTracks().forEach((track) => track.stop())
        voiceStreamRef.current = null
        voiceRecorderRef.current = null
        setRecordingVoice(false)
        if (cancelVoiceRecordingRef.current || !blob.size) return
        const file = new File([blob], `voice-message-${Date.now()}.webm`, { type: blob.type || 'audio/webm' })
        const total = pendingFiles.reduce((sum, pendingFile) => sum + pendingFile.size, 0) +
          pendingAttachments.reduce((sum, attachment) => sum + attachment.size, 0) + file.size
        if (total > maxAttachmentBytes) {
          setError('Attachments must total 200 MB or less per message.')
          return
        }
        void toDataUrl(file).then((data) => {
          setPendingAttachments((current) => [...current, {
            fileName: file.name,
            mediaType: file.type,
            size: file.size,
            data,
            is_voice_note: true,
            duration_seconds: duration,
            waveform_peaks: [],
          }])
        }).catch((readError: unknown) => {
          setError(readError instanceof Error ? readError.message : 'The voice recording could not be prepared.')
        })
      })
      nextRecorder.start()
      setError('')
      setRecordingVoice(true)
    } catch (recordError) {
      setError(recordError instanceof Error ? recordError.message : 'Microphone access was not available.')
    }
  }

  function cancelVoiceRecording() {
    cancelVoiceRecordingRef.current = true
    voiceRecorderRef.current?.stop()
  }

  return (
    <div className={styles.page}>
      <section aria-label="Messages" className={styles.shell}>
        <aside aria-label="Conversations" className={styles.sidebar}>
          <header className={styles.sidebarHeader}>
            <div><h1>Messages</h1><p>Project conversations</p></div>
            <button aria-label="Create a channel" className={styles.addButton} onClick={() => setModal('channel')} type="button">+</button>
          </header>
          <div className={styles.sidebarActions}>
            <button onClick={() => setModal('direct')} type="button">+ New message</button>
            <button onClick={() => setModal('group')} type="button">+ New group</button>
          </div>
          <div className={styles.conversationList}>
            {!filteredConversations.length && <p className={styles.empty}>{searchValue.trim() ? 'No matching conversations.' : 'No conversations yet. Create a channel or start a message.'}</p>}
            {(['channel', 'direct', 'group'] as const).map((type) => {
              const items = filteredConversations.filter((conversation) => conversation.conversation_type === type)
              if (!items.length) return null
              const label = type === 'channel' ? 'Channels' : type === 'direct' ? 'Direct messages' : 'Group conversations'
              return (
                <section key={type}>
                  <h2 className={styles.sectionLabel}>{label}</h2>
                  {items.map((conversation) => (
                    <button
                      aria-current={conversation.conversation_id === selectedId ? 'page' : undefined}
                      className={`${styles.conversation}${conversation.conversation_id === selectedId ? ` ${styles.active}` : ''}${conversation.unread_count ? ` ${styles.unread}` : ''}`}
                      key={conversation.conversation_id}
                      onClick={() => void selectConversation(conversation.conversation_id)}
                      type="button"
                    >
                      <span className={styles.conversationTitle}>
                        <strong>{type === 'channel' ? '# ' : type === 'group' ? '◉ ' : ''}{conversationTitle(conversation, user.uid)}</strong>
                        {conversation.unread_count > 0 && <span className={styles.unreadBadge}>{conversation.unread_count > 99 ? '99+' : conversation.unread_count}</span>}
                      </span>
                      <span className={styles.preview}>{conversation.latest_message_body || label}</span>
                    </button>
                  ))}
                </section>
              )
            })}
          </div>
          <section aria-label="Teammates" className={styles.teammates}>
            <h2 className={styles.sectionLabel}>Teammates</h2>
            {!filteredContacts.length && <p className={styles.empty}>{searchValue.trim() ? 'No matching teammates.' : 'No invited teammates yet. Invite people to a project to message them here.'}</p>}
            {filteredContacts.map((contact) => (
              <button
                className={styles.contact}
                key={contact.firebaseUid}
                onClick={() => { void createConversation('direct', contact.projectId, '', [contact.firebaseUid]).catch(() => undefined) }}
                type="button"
              >
                <span className={styles.avatar}>{contact.profileImage
                  ? <img alt="" src={contact.profileImage} />
                  : contact.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
                <span><strong>{contact.name}</strong><small>{contact.email}</small></span>
              </button>
            ))}
          </section>
        </aside>

        <section aria-label="Conversation" className={styles.thread}>
          <header className={styles.threadHeader}>
            <div>
              <h2>{selected ? `${selected.conversation_type === 'channel' ? '# ' : selected.conversation_type === 'group' ? '◉ ' : ''}${conversationTitle(selected, user.uid)}` : 'Select a conversation'}</h2>
              <p>{selected?.conversation_type === 'direct'
                ? directPresenceText(selected, user.uid)
                : selected ? selected.members.map((member) => member.name || member.email).join(', ') : 'Start a direct message or create a group or channel.'}</p>
            </div>
            <div className={styles.threadActions}>
              <MessageCalls
                apiOrigin={dashboardApiBaseUrl}
                conversation={callConversation}
                invitees={callInvitees}
                onError={(callError, operation) => setError(`Call ${operation} failed: ${callError.message}`)}
                onRealtimeSocket={setMessageSocket}
                user={user}
              />
              {selected?.conversation_type === 'channel' && <button className={styles.actionButton} disabled={summarizing} onClick={() => void summarizeConversation()} type="button">{summarizing ? 'Summarizing…' : '⚡ Catch Me Up'}</button>}
              {selected && <>
                <button aria-expanded={menuOpen} aria-label="Conversation actions" className={styles.moreButton} onClick={() => setMenuOpen((open) => !open)} type="button">⋮</button>
                {menuOpen && <div className={styles.actionsMenu}>
                  <button onClick={() => void conversationAction('clear')} type="button">Clear all messages</button>
                  <button onClick={() => void conversationAction('delete')} type="button">Delete chat for me</button>
                </div>}
              </>}
            </div>
          </header>
          {error && <div className={styles.error} role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')} type="button">×</button></div>}
          <div
            aria-live="polite"
            className={styles.feed}
            onScroll={(event) => {
              if (event.currentTarget.scrollTop < 50 && hasMore && !loadingOlder) void loadOlder()
            }}
            ref={feedRef}
          >
            {loadingOlder && <p className={styles.loading}>Loading older messages…</p>}
            {loadingMessages && <p className={styles.loading}>Loading messages…</p>}
            {!selected && !loadingMessages && <p className={styles.placeholder}>Choose a channel or start a direct message.</p>}
            {selected && !messages.length && !loadingMessages && <p className={styles.placeholder}>No messages yet. Start the conversation.</p>}
            {[
              ...messages.map((message) => ({ kind: 'message' as const, timestamp: message.created_at, message })),
              ...callHistory.map((call) => ({ kind: 'call' as const, timestamp: call.created_at, call })),
            ].sort((first, second) => Date.parse(first.timestamp) - Date.parse(second.timestamp))
              .map((item) => item.kind === 'call' ? (
                <CallHistoryRow call={item.call} currentUid={user.uid} key={`call-${item.call.call_id}`} />
              ) : (
                <MessageRow
                  key={item.message.message_id}
                  currentUid={user.uid}
                  currentEmail={user.email || ''}
                  highlighted={highlightedMessageId === item.message.message_id}
                  message={item.message}
                  senderAvatarUrl={profileImages.get(item.message.sender_firebase_uid) || ''}
                  onRegisterRow={(node) => {
                    if (node) messageRowRefs.current.set(item.message.message_id, node)
                    else messageRowRefs.current.delete(item.message.message_id)
                  }}
                  onOpenContext={() => onOpenMessageContext({ conversationId: item.message.conversation_id, messageId: item.message.message_id })}
                  onDelete={(scope) => void deleteMessage(item.message, scope)}
                  onEdit={() => startEdit(item.message)}
                  onConvertToTask={() => setTaskMessage(item.message)}
                  onForward={() => setForwardMessage(item.message)}
                  onReact={(emoji) => void mutateMessage(item.message, 'reaction', { emoji })}
                  onReply={() => startReply(item.message)}
                  onTogglePin={() => void mutateMessage(item.message, 'pin')}
                  onToggleDecision={() => void mutateMessage(item.message, 'decision')}
                />
              ))}
          </div>
          <form className={styles.composer} onSubmit={(event) => void submitMessage(event)}>
            {context && (
              <div className={styles.composerContext}>
                <span><strong>{context.type === 'edit' ? 'Editing message' : `Replying to ${context.message.sender_name}`}</strong>{context.message.body || 'Attachment'}</span>
                <button aria-label="Cancel" onClick={() => { setContext(null); setDraft('') }} type="button">×</button>
              </div>
            )}
            {pendingFiles.length + pendingAttachments.length > 0 && <div className={styles.pendingFiles}>
              {pendingFiles.map((file, index) => <span key={`${file.name}-${index}`}>{file.name}<button aria-label={`Remove ${file.name}`} onClick={() => setPendingFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} type="button">×</button></span>)}
              {pendingAttachments.map((attachment, index) => <span key={`${attachment.fileName}-${index}`}>{attachment.fileName}<button aria-label={`Remove ${attachment.fileName}`} onClick={() => setPendingAttachments((current) => current.filter((_, attachmentIndex) => attachmentIndex !== index))} type="button">×</button></span>)}
            </div>}
            {recordingVoice && <span className={styles.recordingStatus}>Recording voice message…</span>}
            <label className={styles.attachButton} title="Attach files">
              +
              <input aria-label="Attach files" disabled={!selected || sending} multiple onChange={(event) => void chooseFiles(event)} type="file" />
            </label>
            <button aria-pressed={recordingVoice} className={styles.voiceButton} disabled={!selected || sending} onClick={() => void toggleVoiceRecording()} type="button">{recordingVoice ? 'Stop voice' : 'Voice'}</button>
            {recordingVoice && <button className={styles.voiceCancelButton} onClick={cancelVoiceRecording} type="button">Cancel</button>}
            <textarea
              aria-label="Write a message"
              disabled={!selected || sending}
              maxLength={5000}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
              onSelect={(event) => {
                draftSelectionRef.current = {
                  start: event.currentTarget.selectionStart,
                  end: event.currentTarget.selectionEnd,
                }
              }}
              placeholder="Write a message…"
              ref={inputRef}
              rows={1}
              value={draft}
            />
            {emojiPickerOpen && <div aria-label="Insert emoji" className={styles.composerEmojiPicker} role="group">
              {reactionChoices.map((emoji) => <button key={emoji} onClick={() => {
                const input = inputRef.current
                if (!input) return
                const start = draftSelectionRef.current?.start ?? input.selectionStart
                const end = draftSelectionRef.current?.end ?? input.selectionEnd
                const nextDraft = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`
                setDraft(nextDraft)
                setEmojiPickerOpen(false)
                requestAnimationFrame(() => {
                  input.focus()
                  const position = start + emoji.length
                  input.setSelectionRange(position, position)
                })
              }} type="button">{emoji}</button>)}
            </div>}
            <div className={styles.composerBottomRow}>
              <button aria-expanded={emojiPickerOpen} aria-label="Insert emoji" className={styles.emojiToggle} onClick={() => setEmojiPickerOpen((open) => !open)} type="button">☺</button>
              <button className={styles.sendButton} disabled={!selected || sending || (!draft.trim() && !pendingFiles.length && !pendingAttachments.length)} type="submit">{sending ? '…' : context?.type === 'edit' ? 'Save' : 'Send'}</button>
            </div>
          </form>
        </section>
      </section>

      {modal && <NewConversationModal
        currentUid={user.uid}
        onClose={() => setModal(null)}
        onCreate={createConversation}
        projects={projects}
        type={modal}
      />}
      {taskMessage && <TaskFromMessageModal
        message={taskMessage}
        onClose={() => setTaskMessage(null)}
        onCreate={(input) => convertMessageToTask(taskMessage, input)}
      />}
      {forwardMessage && <ForwardMessageModal
        message={forwardMessage}
        onClose={() => setForwardMessage(null)}
        onForward={(recipients) => forwardToMembers(forwardMessage, recipients)}
        recipients={contacts}
      />}
      {summary && <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setSummary('') }}>
        <section aria-labelledby="message-summary-title" aria-modal="true" className={styles.modal} role="dialog">
          <button aria-label="Close summary" className={styles.closeModal} onClick={() => setSummary('')} type="button">×</button>
          <span className={styles.eyebrow}>CHANNEL CATCH-UP</span>
          <h2 id="message-summary-title">Chat briefing</h2>
          <p className={styles.summaryText}>{summary}</p>
        </section>
      </div>}
    </div>
  )
}

function MessageRow({
  message,
  currentUid,
  currentEmail,
  highlighted,
  senderAvatarUrl,
  onRegisterRow,
  onOpenContext,
  onReply,
  onEdit,
  onDelete,
  onForward,
  onConvertToTask,
  onReact,
  onTogglePin,
  onToggleDecision,
}: {
  message: ConversationMessage
  currentUid: string
  currentEmail: string
  highlighted: boolean
  senderAvatarUrl: string
  onRegisterRow: (node: HTMLElement | null) => void
  onOpenContext: () => void
  onReply: () => void
  onEdit: () => void
  onDelete: (scope: 'me' | 'everyone') => void
  onForward: () => void
  onConvertToTask: () => void
  onReact: (emoji: string) => void
  onTogglePin: () => void
  onToggleDecision: () => void
}) {
  const own = message.sender_firebase_uid === currentUid
  const [actionsOpen, setActionsOpen] = useState(false)
  return (
    <article
      className={`${styles.messageRow} ${own ? styles.ownMessage : ''}${highlighted ? ` ${styles.contextTarget}` : ''}`}
      data-message-id={message.message_id}
      ref={onRegisterRow}
    >
      <span className={styles.messageAvatar} aria-hidden="true">
        {senderAvatarUrl
          ? <img alt="" loading="lazy" src={senderAvatarUrl} />
          : message.sender_name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
      </span>
      <div className={styles.bubble}>
        {message.is_pinned && <span className={styles.messageFlag}>📌 Pinned</span>}
        {message.is_decision && <span className={styles.messageFlag}>Decision</span>}
        {message.linked_task_title && <button className={styles.linkedTask} onClick={onOpenContext} type="button">Task: {message.linked_task_title} · open discussion</button>}
        {!own && <strong className={styles.sender}>{message.sender_name}</strong>}
        {message.forwarded_from?.senderName && <span className={styles.messageFlag}>↪ Forwarded from {message.forwarded_from.senderName}</span>}
        {message.reply_to_message_id && <blockquote><strong>{message.reply_to_sender_name || 'Message'}</strong><span>{message.reply_to_body || 'Attachment'}</span></blockquote>}
        {message.body && <p className={message.is_deleted ? styles.deletedText : ''}>{message.body}</p>}
        {(message.attachments || []).map((attachment, index) => (
          <MessageAttachmentView attachment={attachment} key={`${attachment.fileName}-${index}`} />
        ))}
        <div className={styles.messageTime}>
          {message.edited_at && <span>Edited</span>}
          <time dateTime={message.created_at}>{formatTime(message.created_at)}</time>
          {own && <span className={message.read_at ? styles.readReceipt : ''} title={message.read_at ? 'Viewed' : 'Sent'}>{message.read_at ? '✓✓' : '✓'}</span>}
        </div>
        <div className={styles.messageTools}>
          <button aria-expanded={actionsOpen} aria-label="Message actions" onClick={() => setActionsOpen((open) => !open)} type="button">⋮</button>
          {actionsOpen && <div className={styles.messageMenu}>
            {!message.is_deleted && <>
              <button onClick={onReply} type="button">Reply</button>
              {own && <button onClick={onEdit} type="button">Edit</button>}
              {!message.linked_task_id && <button onClick={onConvertToTask} type="button">Convert to task</button>}
              <button onClick={onOpenContext} type="button">Open message in discussion</button>
              <button onClick={onToggleDecision} type="button">{message.is_decision ? 'Unpin Decision' : 'Pin as Decision'}</button>
              <button onClick={onForward} type="button">Forward</button>
              <button onClick={onTogglePin} type="button">{message.is_pinned ? 'Unpin' : 'Pin'}</button>
            </>}
            <button onClick={() => onDelete('me')} type="button">Delete for me</button>
            {!message.is_deleted && own && <button onClick={() => onDelete('everyone')} type="button">Delete for everyone</button>}
          </div>}
        </div>
        {message.reactions?.length > 0 && <div className={styles.reactions}>
          {message.reactions.filter((reaction) => reaction.users.length > 0).map((reaction) => (
          <button
            aria-label={`${reaction.emoji}, ${reaction.users.length} reactions`}
            aria-pressed={reaction.users.includes(currentEmail.trim().toLowerCase())}
            key={reaction.emoji}
            onClick={() => onReact(reaction.emoji)}
            type="button"
          >{reaction.emoji} {reaction.users.length}</button>
          ))}
        </div>}
        {!message.is_deleted && <div className={styles.quickReactions}>
          {reactionChoices.map((emoji) => <button aria-label={`React ${emoji}`} key={emoji} onClick={() => onReact(emoji)} type="button">{emoji}</button>)}
        </div>}
      </div>
    </article>
  )
}

function CallHistoryRow({ call, currentUid }: { call: MessageCallHistoryRecord; currentUid: string }) {
  const isCaller = call.caller_uid === currentUid
  const callType = call.call_type === 'video' ? 'Video' : 'Voice'
  const label = call.status === 'missed'
    ? isCaller ? `${callType} call · No answer` : `Missed ${callType.toLowerCase()} call`
    : call.status === 'declined'
      ? isCaller ? `${callType} call declined` : `Declined ${callType.toLowerCase()} call`
      : `${callType} call ended`
  return (
    <article className={styles.callRow}>
      <span className={`${styles.callIcon}${call.status === 'missed' ? ` ${styles.missedCall}` : ''}`} aria-hidden="true">{call.status === 'missed' || call.status === 'declined' ? '↙' : '↗'}</span>
      <span className={styles.callDetails}><strong>{label}</strong><small>{isCaller ? call.callee_name : call.caller_name}</small></span>
      <time dateTime={call.created_at}>{formatTime(call.created_at)}</time>
    </article>
  )
}

function MessageAttachmentView({ attachment }: { attachment: MessageAttachment }) {
  if (attachment.is_voice_note || attachment.mediaType.startsWith('audio/')) {
    return <audio aria-label={attachment.fileName || 'Voice note'} controls className={styles.audioAttachment} src={attachment.data} />
  }
  if (attachment.mediaType.startsWith('image/')) {
    return <a className={styles.imageAttachment} href={attachment.data} rel="noreferrer" target="_blank"><img alt={attachment.fileName} loading="lazy" src={attachment.data} /></a>
  }
  if (attachment.mediaType.startsWith('video/')) {
    return <video className={styles.videoAttachment} controls preload="metadata" src={attachment.data} />
  }
  return <a className={styles.fileAttachment} download={attachment.fileName} href={attachment.data}>
    <span aria-hidden="true">▤</span><span><strong>{attachment.fileName}</strong><small>{formatFileSize(attachment.size)}</small></span>
  </a>
}

function NewConversationModal({
  type,
  projects,
  currentUid,
  onClose,
  onCreate,
}: {
  type: ConversationType
  projects: Project[]
  currentUid: string
  onClose: () => void
  onCreate: (type: ConversationType, projectId: string, name: string, memberUids: string[]) => Promise<void>
}) {
  const [projectId, setProjectId] = useState(projects[0]?.project_id || '')
  const [name, setName] = useState('')
  const [selectedUids, setSelectedUids] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const members = useMemo(() => {
    const project = projects.find((item) => item.project_id === projectId)
    if (!project) return []
    return projectContacts(project, currentUid).filter((member) =>
      `${member.name} ${member.email}`.toLowerCase().includes(search.trim().toLowerCase()))
  }, [currentUid, projectId, projects, search])
  const title = type === 'channel' ? 'Create a channel' : type === 'group' ? 'Create a group' : 'Start a direct message'
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const minimum = type === 'direct' ? 1 : type === 'group' ? 2 : 1
    if (selectedUids.length !== (type === 'direct' ? 1 : selectedUids.length) || selectedUids.length < minimum) {
      setError(type === 'direct' ? 'Choose one teammate.' : type === 'group' ? 'Choose at least two teammates.' : 'Choose at least one teammate.')
      return
    }
    if (type !== 'direct' && !name.trim()) {
      setError(type === 'channel' ? 'Enter a channel name.' : 'Enter a group name.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onCreate(type, projectId, name.trim(), selectedUids)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The conversation could not be created.')
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form aria-labelledby="new-conversation-title" aria-modal="true" className={styles.modal} onSubmit={(event) => void submit(event)} role="dialog">
        <button aria-label="Close dialog" className={styles.closeModal} onClick={onClose} type="button">×</button>
        <span className={styles.eyebrow}>MESSAGES</span>
        <h2 id="new-conversation-title">{title}</h2>
        <p>{type === 'channel' ? 'Create a shared channel and invite teammates.' : type === 'group' ? 'Name a group conversation and choose teammates.' : 'Choose one teammate to start a private conversation.'}</p>
        {!projects.length ? <p className={styles.formError}>Create or join a project before starting a conversation.</p> : <>
          <label className={styles.formLabel}>Project
            <select onChange={(event) => { setProjectId(event.target.value); setSelectedUids([]) }} required value={projectId}>
              {projects.map((project) => <option key={project.project_id} value={project.project_id}>{project.name}</option>)}
            </select>
          </label>
          {type !== 'direct' && <label className={styles.formLabel}>{type === 'channel' ? 'Channel name' : 'Group name'}
            <input maxLength={60} onChange={(event) => setName(event.target.value)} placeholder={type === 'channel' ? 'e.g. design-team' : 'e.g. Product launch team'} required value={name} />
          </label>}
          <label className={styles.formLabel}>Search teammates
            <input onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" value={search} />
          </label>
          <div className={styles.memberList}>
            {!members.length && <p className={styles.empty}>No accepted teammates are available in this project.</p>}
            {members.map((member) => <label className={styles.memberOption} key={member.firebaseUid}>
              <input checked={selectedUids.includes(member.firebaseUid)} onChange={(event) => {
                setSelectedUids((current) => {
                  if (type === 'direct') return event.target.checked ? [member.firebaseUid] : []
                  return event.target.checked ? [...current, member.firebaseUid] : current.filter((uid) => uid !== member.firebaseUid)
                })
              }} type="checkbox" value={member.firebaseUid} />
              <span className={styles.avatar}>{member.profileImage
                ? <img alt="" src={member.profileImage} />
                : member.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
              <span><strong>{member.name}</strong><small>{member.email}</small></span>
            </label>)}
          </div>
          {error && <p className={styles.formError} role="alert">{error}</p>}
          <div className={styles.modalActions}>
            <button className={styles.secondaryButton} onClick={onClose} type="button">Cancel</button>
            <button className={styles.primaryButton} disabled={saving || !projectId} type="submit">{saving ? 'Creating…' : title}</button>
          </div>
        </>}
      </form>
    </div>
  )
}

function TaskFromMessageModal({
  message,
  onClose,
  onCreate,
}: {
  message: ConversationMessage
  onClose: () => void
  onCreate: (input: { title: string; description: string; category: string; priority: 'low' | 'medium' | 'high' }) => Promise<void>
}) {
  const initialDescription = message.body ||
    (message.attachments.some((attachment) => attachment.is_voice_note) ? 'Voice note from discussion' : 'Follow up from discussion')
  const [title, setTitle] = useState(initialDescription.split(/\r?\n/)[0].trim().slice(0, 255) || 'Follow up from discussion')
  const [description, setDescription] = useState(initialDescription.slice(0, 10000))
  const [category, setCategory] = useState('Product')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onCreate({ title: title.trim(), description: description.trim(), category: category.trim(), priority })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The task could not be created.')
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form aria-labelledby="message-task-title" aria-modal="true" className={styles.modal} onSubmit={(event) => void submit(event)} role="dialog">
        <button aria-label="Close dialog" className={styles.closeModal} onClick={onClose} type="button">×</button>
        <span className={styles.eyebrow}>MESSAGE ACTION</span>
        <h2 id="message-task-title">Create task from message</h2>
        <p>This task will link back to the original conversation message.</p>
        <label className={styles.formLabel}>Task title
          <input maxLength={255} onChange={(event) => setTitle(event.target.value)} required value={title} />
        </label>
        <label className={styles.formLabel}>Description
          <textarea className={styles.taskDescription} maxLength={10000} onChange={(event) => setDescription(event.target.value)} value={description} />
        </label>
        <label className={styles.formLabel}>Category
          <input maxLength={100} onChange={(event) => setCategory(event.target.value)} required value={category} />
        </label>
        <label className={styles.formLabel}>Priority
          <select onChange={(event) => setPriority(event.target.value as 'low' | 'medium' | 'high')} value={priority}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        {error && <p className={styles.formError} role="alert">{error}</p>}
        <div className={styles.modalActions}>
          <button className={styles.secondaryButton} onClick={onClose} type="button">Cancel</button>
          <button className={styles.primaryButton} disabled={saving} type="submit">{saving ? 'Creating…' : 'Create task'}</button>
        </div>
      </form>
    </div>
  )
}

function ForwardMessageModal({
  message,
  recipients,
  onClose,
  onForward,
}: {
  message: ConversationMessage
  recipients: Array<{ firebaseUid: string; name: string; email: string; projectId: string; projectName: string; profileImage?: string | null }>
  onClose: () => void
  onForward: (recipients: Array<{ firebaseUid: string; projectId: string }>) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [selectedUids, setSelectedUids] = useState<string[]>([])
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const matches = recipients.filter((person) =>
    `${person.name} ${person.email}`.toLowerCase().includes(query.trim().toLowerCase()))
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const selected = recipients.filter((person) => selectedUids.includes(person.firebaseUid))
    if (!selected.length) {
      setError('Choose at least one teammate.')
      return
    }
    setSending(true)
    setError('')
    try {
      await onForward(selected)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The message could not be forwarded.')
    } finally {
      setSending(false)
    }
  }
  return (
    <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form aria-labelledby="forward-message-title" aria-modal="true" className={styles.modal} onSubmit={(event) => void submit(event)} role="dialog">
        <button aria-label="Close dialog" className={styles.closeModal} onClick={onClose} type="button">×</button>
        <span className={styles.eyebrow}>MESSAGE ACTION</span>
        <h2 id="forward-message-title">Forward message</h2>
        <p className={styles.forwardPreview}><strong>{message.sender_name}</strong>{message.body || attachmentPreview(message.attachments) || 'Message'}</p>
        <label className={styles.formLabel}>Search teammates
          <input onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email" value={query} />
        </label>
        <div className={styles.memberList}>
          {!matches.length && <p className={styles.empty}>No teammates are available to forward to.</p>}
          {matches.map((person) => <label className={styles.memberOption} key={person.firebaseUid}>
            <input checked={selectedUids.includes(person.firebaseUid)} onChange={(event) => setSelectedUids((current) =>
              event.target.checked ? [...current, person.firebaseUid] : current.filter((uid) => uid !== person.firebaseUid))} type="checkbox" />
            <span className={styles.avatar}>{person.profileImage
              ? <img alt="" src={person.profileImage} />
              : person.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
            <span><strong>{person.name}</strong><small>{person.email} · {person.projectName}</small></span>
          </label>)}
        </div>
        {error && <p className={styles.formError} role="alert">{error}</p>}
        <div className={styles.modalActions}>
          <button className={styles.secondaryButton} onClick={onClose} type="button">Cancel</button>
          <button className={styles.primaryButton} disabled={sending || !selectedUids.length} type="submit">{sending ? 'Forwarding…' : `Forward${selectedUids.length ? ` to ${selectedUids.length}` : ''}`}</button>
        </div>
      </form>
    </div>
  )
}
