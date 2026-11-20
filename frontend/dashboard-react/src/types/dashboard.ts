export interface ApiSuccess<TData> {
  success: true
  data: TData
  message?: string
}

export interface ApiFailure {
  success: false
  code?: string
  message: string
}

export type ApiResponse<TData> = ApiSuccess<TData>

export interface CurrentProfile {
  name: string | null
  email: string | null
  phoneCountryCode: string | null
  phoneNumber: string | null
  workspace: string | null
  role: string | null
  collaborationType: string | null
  collaborationDetails: string | null
  industry: string | null
  tone: string | null
  status: string | null
  timezone: string | null
  updatedAt: string | null
}

export interface ProfileImageData {
  profileImage: string
}

export interface ProjectAcceptedMember {
  firebaseUid: string
  email: string
  name: string
  role: string
  profileImage: string | null
}

export interface Project {
  id: number | string
  project_id: string
  name: string
  project_type: string
  time_span: string
  start_date: string | null
  due_date: string | null
  description: string
  color: string
  creator_firebase_uid: string
  creator_email: string
  creator_name: string
  creator_initials: string
  creator_profile_image: string | null
  invited_members: unknown[]
  team_member_count: number
  accepted_members: ProjectAcceptedMember[]
  sprints: unknown[]
  created_at: string
  updated_at: string
}

export interface Notification {
  id: number
  project_id: string | null
  related_task_id: string | null
  brainstorm_board_id: string | null
  invitation_id: string | null
  invitation_status: string | null
  invitation_expires_at: string | null
  type: string
  title: string
  detail: string
  avatar: string
  tone_class: string
  is_read: boolean
  created_at: string
}

export interface MessageConversationMember {
  firebaseUid: string
  email: string
  name: string
  profileImage: string
  last_seen_at: string | null
  is_online: boolean
  last_read_at: string | null
  lastSeenAt: string | null
}

export interface MessageConversation {
  conversation_id: string
  project_id: string
  conversation_type: string
  name: string
  created_by_firebase_uid: string
  created_at: string
  updated_at: string
  latest_message_body: string
  latest_message_deleted_at: string | null
  latest_message_attachments: unknown[] | null
  latest_message_created_at: string | null
  latest_message_id: string | null
  unread_count: number
  members: MessageConversationMember[]
  member_uids: string[]
}

export interface MessageAttachment {
  fileName: string
  mediaType: string
  size: number
  data: string
  is_voice_note?: boolean
  duration_seconds?: number
  waveform_peaks?: number[]
}

export interface MessageReaction {
  emoji: string
  users: string[]
}

export interface MessageCallHistoryRecord {
  call_id: string
  conversation_id: string
  caller_uid: string
  caller_name: string
  callee_uid: string
  callee_name: string
  call_type: 'audio' | 'video'
  status: string
  created_at: string
  accepted_at: string | null
  ended_at: string | null
  ended_by_uid: string | null
  ring_expires_at: string
}

export interface ConversationMessage {
  message_id: string
  conversation_id: string
  client_message_id?: string | null
  sender_firebase_uid: string
  sender_email: string
  sender_name: string
  body: string
  reply_to_message_id: string | null
  reply_to_body: string | null
  reply_to_sender_name: string | null
  forwarded_from: { senderName: string } | null
  is_pinned: boolean
  is_decision: boolean
  linked_task_id: string | null
  linked_task_title: string | null
  linked_task_project_id: string | null
  is_deleted: boolean
  edited_at: string | null
  created_at: string
  read_at: string | null
  attachments: MessageAttachment[]
  reactions: MessageReaction[]
}

export interface TaskDependency {
  task_id: string
  project_id: string
  title: string
  status: string
  warning_reason: string | null
}

export interface TaskAttachment {
  attachment_index: number
  fileName: string
  mediaType: string
  size: number
  is_voice_note?: boolean
}

export interface ProjectTask {
  task_id: string
  project_id: string
  project_name: string
  title: string
  description: string
  category: string | null
  tags: string[]
  task_submission_status: string | null
  task_submission_note: string | null
  task_submission_links: string[]
  task_submitted_at: string | null
  task_submitted_by_firebase_uid: string | null
  task_review_comment: string | null
  task_reviewed_by_firebase_uid: string | null
  task_reviewed_at: string | null
  task_submission_attachments: TaskAttachment[]
  chat_message_id: string | null
  chat_conversation_id: string | null
  description_attachments: TaskAttachment[]
  status: string
  priority: string
  dependencies: TaskDependency[]
  has_dependency_warning: boolean
  start_date: string | null
  due_date: string | null
  created_by_firebase_uid: string
  created_at: string
  updated_at: string
}

export interface ProjectMeeting {
  meeting_id: string
  project_id: string
  project_name: string
  title: string
  meeting_date: string
  start_time: string
  end_time: string
  pinned: boolean
  location: string | null
  meeting_url: string | null
  notes: string | null
  host_firebase_uid: string
  host_name: string
  attendee_firebase_uids: string[]
  ended_at: string | null
  created_at: string
  updated_at: string
}

export interface ProjectReminder {
  reminder_id: string
  project_id: string
  project_name: string
  title: string
  reminder_date: string
  reminder_time: string
  priority: 'Normal' | 'High' | 'Urgent'
  created_by_firebase_uid: string
  created_by_name: string
  created_at: string
  updated_at: string
}

export interface ProjectMember {
  project_id: string
  project_name: string
  creator_firebase_uid: string
  invitation_id: string | null
  firebase_uid: string
  email: string
  name: string
  role: string
  status: 'Pending' | 'Active'
  profile_image: string | null
}

export interface ProfileSettingsInput {
  name: string
  email: string
  phoneCountryCode: string
  phoneNumber: string
  workspace: string
  role: string
  collaborationType: string
  collaborationDetails: string
  industry: string
  tone: string
  status: string
  timezone: string
}

export interface ProjectTasksOptions {
  assignedToMe?: boolean
  signal?: AbortSignal
}

export interface ProjectResource {
  resource_id: string
  project_id: string
  project_name: string
  title: string
  target_url: string
  category: string
}

export interface ProjectStickyNoteRecipient {
  firebaseUid: string
  name?: string
  profileImage?: string | null
}

export interface ProjectStickyNote {
  note_id: string
  project_id: string
  created_by_firebase_uid: string
  author_name?: string
  author_profile_image?: string
  content: string
  color: 'yellow' | 'pink' | 'blue' | 'green'
  position_x: number
  position_y: number
  recipients?: ProjectStickyNoteRecipient[]
}

export interface ProjectScratchpad {
  project_id: string
  content: string
  updated_at: string | null
}
