export type DashboardStaticView =
  | 'Workspace'
  | 'My Tasks'
  | 'Meetings'
  | 'Messages'
  | 'Brainstorm'
  | 'Admin Console'
  | 'Settings'
  | 'Notifications'
  | 'Overview';

export type DashboardView = DashboardStaticView | (string & {});

export type WorkspaceConsoleTab =
  | 'projects'
  | 'users'
  | 'tasks'
  | 'meetings'
  | 'resources'
  | 'settings'
  | 'logs';

export type ThemeMode = 'light' | 'dark' | 'system';

export type AccentTheme = 'gold' | 'blue' | 'emerald' | 'coral' | 'purple';

export type NotificationFilter = 'all' | 'unread';

export type CalendarFilter = 'all' | 'tasks' | 'meetings' | 'reminders' | 'projects';

export type TaskStatus = 'Backlog' | 'To do' | 'In progress' | 'Blocked' | 'Done';

export type TaskFilterKey =
  | 'all'
  | 'mine'
  | 'backlog'
  | 'todo'
  | 'progress'
  | 'blocked'
  | 'done';

export type TaskPriority = 'low' | 'medium' | 'high';

export type ProjectColor =
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'coral'
  | 'orange'
  | 'rose';

export interface MediaAttachment {
  id?: string;
  name?: string;
  fileName?: string;
  type?: string;
  mimeType?: string;
  mime_type?: string;
  kind?: 'image' | 'audio' | 'video' | 'file';
  url?: string;
  dataUrl?: string;
  data_url?: string;
  size?: number;
  durationSec?: number;
  [key: string]: unknown;
}

export interface UserProfile {
  id?: string;
  uid?: string;
  firebaseUid?: string;
  name: string;
  email: string;
  initials: string;
  tone: string;
  role?: string;
  isAdmin?: boolean;
  profileImage?: string;
  profile_image?: string;
  photoURL?: string;
  avatar?: string;
  phoneCountryCode?: string;
  phoneNumber?: string;
  workspace?: string;
  collaborationType?: string;
  collaborationDetails?: string;
  industry?: string;
  bio?: string;
  timezone?: string;
  status?: string;
  providerData?: Array<{ providerId?: string }>;
  [key: string]: unknown;
}

export interface ProjectMember {
  id?: string;
  uid?: string;
  firebaseUid?: string;
  firebase_uid?: string;
  userId?: string;
  name?: string;
  email?: string;
  initials?: string;
  tone?: string;
  role?: string;
  invitationId?: string;
  status?: string;
  profileImage?: string;
  profile_image?: string;
  photoURL?: string;
  avatar?: string;
  [key: string]: unknown;
}

export interface ProjectSprint {
  id?: string;
  sprintId?: string;
  name: string;
  description?: string;
  startDate?: string | null;
  start_date?: string | null;
  endDate?: string | null;
  end_date?: string | null;
  dueDate?: string | null;
  status?: string;
  memberFirebaseUids?: string[];
  member_firebase_uids?: string[];
  assigneeFirebaseUid?: string;
  assignee_firebase_uid?: string;
  assigneeName?: string;
  assigneeProfileImage?: string;
  submissionStatus?: string;
  submissionNote?: string;
  submissionLinks?: string[];
  submissionAttachments?: MediaAttachment[];
  submittedAt?: string | null;
  submittedByFirebaseUid?: string | null;
  submittedByName?: string;
  reviewStatus?: string;
  reviewComment?: string;
  reviewedByFirebaseUid?: string | null;
  reviewedAt?: string | null;
  [key: string]: unknown;
}

export interface Project {
  id: string;
  projectId: string;
  name: string;
  projectType: string;
  timeSpan: string;
  startDate: string | null;
  dueDate: string | null;
  description: string;
  color: ProjectColor;
  creatorFirebaseUid: string | null;
  creatorEmail: string;
  creatorName: string;
  creatorInitials: string;
  creatorProfileImage: string;
  creatorTone?: string;
  invitedMembers: ProjectMember[];
  acceptedMembers: ProjectMember[];
  teamMemberCount: number;
  sprints: ProjectSprint[];
  createdAt?: string | null;
  updatedAt?: string | null;
  [key: string]: unknown;
}

export interface TaskCommentItem {
  id: string | number;
  comment_id?: string | number;
  taskId?: string;
  author?: string;
  authorName?: string;
  author_name?: string;
  authorEmail?: string;
  authorUid?: string;
  profileImage?: string;
  authorProfileImage?: string;
  author_profile_image?: string;
  tone?: string;
  text: string;
  body?: string;
  time?: string;
  createdAt?: string;
  created_at?: string;
  attachments?: MediaAttachment[];
  [key: string]: unknown;
}

export type TaskComment = TaskCommentItem;

export interface TaskDependency {
  taskId?: string;
  dependsOnTaskId?: string;
  title?: string;
  status?: string;
  [key: string]: unknown;
}

export interface TaskItem {
  id: string | number;
  taskId?: string;
  task_id?: string;
  projectId?: string;
  project_id?: string;
  backendPersistent?: boolean;
  project: string;
  title: string;
  description: string;
  tag: string;
  category?: string;
  tagTone?: string;
  tags?: string[];
  due: string;
  date: string | null;
  due_date?: string | null;
  startDate?: string | null;
  start_date?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  done?: boolean;
  progress: number;
  sprint?: string;
  sprintMembers?: ProjectMember[];
  submission_status?: string;
  taskSubmissionStatus?: string;
  taskSubmissionNote?: string;
  taskSubmissionLinks?: string[];
  taskSubmissionAttachments?: MediaAttachment[];
  taskSubmittedAt?: string | null;
  taskSubmittedByFirebaseUid?: string | null;
  taskReviewComment?: string;
  taskReviewedByFirebaseUid?: string | null;
  taskReviewedAt?: string | null;
  chatMessageId?: string | null;
  chat_message_id?: string | null;
  chatConversationId?: string | null;
  descriptionAttachments?: MediaAttachment[];
  dependencies?: Array<string | TaskDependency>;
  predecessorTaskIds?: string[];
  hasDependencyWarning?: boolean;
  approvalStatus?: string;
  approvedBy?: string;
  comments: number;
  commentsList: TaskCommentItem[];
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface MeetingRecord {
  id: string;
  meetingId?: string;
  meeting_id?: string;
  projectId?: string;
  project_id?: string;
  projectName?: string;
  title: string;
  description?: string;
  notes?: string;
  date: string;
  time?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  pinned?: boolean;
  location?: string;
  meetingUrl?: string;
  meeting_url?: string;
  roomUrl?: string;
  roomName?: string;
  room_name?: string;
  isInstant?: boolean;
  is_instant?: boolean;
  isLive?: boolean;
  isEnded?: boolean;
  endedAt?: string | null;
  status?: string;
  hostFirebaseUid?: string;
  host_firebase_uid?: string;
  host?: string;
  hostName?: string;
  hostEmail?: string;
  hostProfileImage?: string;
  canCancel?: boolean;
  attendees?: ProjectMember[];
  createdAt?: string;
  [key: string]: unknown;
}

export interface ReminderRecord {
  id: string;
  reminderId?: string;
  reminder_id?: string;
  projectId?: string;
  project_id?: string;
  projectName?: string;
  title: string;
  description?: string;
  date: string;
  time?: string;
  timeValue?: string;
  priority?: string;
  author?: string;
  creatorFirebaseUid?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface NotificationRecord {
  id: string;
  type: string;
  title: string;
  detail: string;
  boardId?: string | null;
  relatedTaskId?: string | null;
  avatar: string;
  toneClass: string;
  invitationId?: string | null;
  invitationStatus?: string | null;
  invitationExpiresAt?: string | null;
  time: string;
  unread: boolean;
  persisted: boolean;
  [key: string]: unknown;
}

export interface ResourceItem {
  id: string;
  resourceId?: string;
  resource_id?: string;
  projectId: string;
  project_id?: string;
  projectName?: string;
  title: string;
  category: string;
  url: string;
  description?: string;
  pinned?: boolean;
  createdByName?: string;
  createdByFirebaseUid?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface BrainstormStickyNote {
  id: string;
  noteId?: string;
  boardId?: string;
  text: string;
  content?: string;
  color?: string;
  category?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  authorName?: string;
  authorEmail?: string;
  authorUid?: string;
  votes?: string[];
  reactions?: Record<string, string[]>;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface BrainstormLink {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
  color?: string;
  [key: string]: unknown;
}

export interface BrainstormBoard {
  id: string;
  boardId?: string;
  board_id?: string;
  projectId: string;
  project_id?: string;
  projectName?: string;
  title: string;
  name?: string;
  description?: string;
  notes?: BrainstormStickyNote[];
  links?: BrainstormLink[];
  strokes?: Array<Record<string, unknown>>;
  members?: ProjectMember[];
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface ProjectStickyNote {
  id: string;
  noteId?: string;
  note_id?: string;
  projectId: string;
  project_id?: string;
  projectName?: string;
  title?: string;
  content: string;
  color?: string;
  x?: number;
  y?: number;
  zIndex?: number;
  sharedWith?: ProjectMember[];
  shared_with?: ProjectMember[];
  isOwner?: boolean;
  is_owner?: boolean;
  hidden?: boolean;
  authorUid?: string;
  authorName?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface ChatParticipant {
  id?: string;
  uid?: string;
  firebaseUid?: string;
  firebase_uid?: string;
  name?: string;
  email?: string;
  initials?: string;
  tone?: string;
  profileImage?: string;
  profile_image?: string;
  photoURL?: string;
  role?: string;
  online?: boolean;
  isOnline?: boolean;
  is_online?: boolean;
  lastSeenAt?: string | null;
  last_seen_at?: string | null;
  [key: string]: unknown;
}

export interface Conversation {
  id: string;
  conversationId?: string;
  conversation_id?: string;
  type: 'channel' | 'dm' | 'direct' | 'group' | string;
  name?: string;
  title?: string;
  description?: string;
  projectId?: string | null;
  project_id?: string | null;
  participants?: ChatParticipant[];
  unreadCount?: number;
  unread_count?: number;
  lastMessageText?: string;
  last_message_text?: string;
  lastMessageAt?: string;
  last_message_at?: string;
  pinnedMessageId?: string | null;
  [key: string]: unknown;
}

export interface ChatAttachment {
  id?: string;
  name?: string;
  fileName?: string;
  mimeType?: string;
  mime_type?: string;
  type?: string;
  size?: number;
  url?: string;
  dataUrl?: string;
  data_url?: string;
  isVoiceNote?: boolean;
  durationSeconds?: number;
  waveformPeaks?: number[];
  [key: string]: unknown;
}

export interface ChatMessage {
  id: string;
  messageId?: string;
  message_id?: string;
  conversationId: string;
  conversation_id?: string;
  clientMessageId?: string;
  senderId?: string;
  senderFirebaseUid?: string;
  sender_firebase_uid?: string;
  senderName?: string;
  sender_name?: string;
  senderEmail?: string;
  senderAvatar?: string;
  senderProfileImage?: string;
  body: string;
  text?: string;
  attachments?: ChatAttachment[];
  replyToMessageId?: string | null;
  replyTo?: {
    id: string;
    senderName?: string;
    body?: string;
  } | null;
  forwardedFrom?: {
    senderName?: string;
    conversationName?: string;
  } | null;
  reactions?: Record<string, string[]>;
  isPinned?: boolean;
  isDecision?: boolean;
  linkedTaskId?: string | null;
  linkedProjectId?: string | null;
  linkedTaskTitle?: string | null;
  readBy?: string[];
  editedAt?: string | null;
  deletedForEveryone?: boolean;
  createdAt: string;
  optimistic?: boolean;
  failed?: boolean;
  [key: string]: unknown;
}

export interface CallParticipantState {
  userId?: string;
  firebaseUid?: string;
  name?: string;
  initials?: string;
  profileImage?: string;
  muted?: boolean;
  cameraOff?: boolean;
  status?: string;
  joinedAt?: string;
}

export interface CallRecord {
  id: string;
  callId?: string;
  conversationId: string;
  callType: 'voice' | 'video' | 'audio';
  status: 'ringing' | 'active' | 'ended' | 'missed' | 'declined' | string;
  initiatorId?: string;
  initiatorName?: string;
  initiatorAvatar?: string;
  participants?: CallParticipantState[];
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  [key: string]: unknown;
}

export interface AuditEntry {
  id?: string;
  iconType: string;
  action: string;
  detail: string;
  time: string;
}

export interface ToolSettings {
  theme: ThemeMode;
  accent: AccentTheme;
  highContrast: boolean;
  stickyNotesVisible: boolean;
  compactMode: boolean;
  desktopNotifications: boolean;
  soundEffects: boolean;
  brainstormAutoSave: boolean;
}

export interface WorkspaceSettingsConfig {
  workspaceName: string;
  timezone: string;
  defaultProjectType: string;
  defaultTaskPriority: TaskPriority;
  inactivityTimeoutMinutes: number;
  twoFactorEnabled: boolean;
  toggles: {
    allowGuestInvites: boolean;
    requireTaskReviewBeforeDone: boolean;
    enableAutoSprintRollover: boolean;
    enableRealtimePresence: boolean;
    enableSoundEffects: boolean;
    enableDesktopNotifications: boolean;
    enableAiMeetingSummaries: boolean;
    enableStickyNoteSharing: boolean;
    showCompletedTasksOnBoard: boolean;
  };
}

export interface PollOption {
  id: string;
  label: string;
  votes: string[];
}

export interface TeamPoll {
  id: string;
  question: string;
  options: PollOption[];
  createdBy: string;
  createdAt: string;
  closed?: boolean;
}

export interface AnnouncementItem {
  id: string;
  title: string;
  body: string;
  category?: string;
  authorName: string;
  createdAt: string;
  pinned?: boolean;
}

export interface TaskFilterState {
  status: string;
  priority: string;
  category: string;
  tag: string;
  sprint: string;
  onlyMine: boolean;
}

export interface ConfirmationModalState {
  isOpen: boolean;
  eyebrow?: string;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  resolve?: (confirmed: boolean) => void;
}

export type ActiveModalState =
  | { type: null }
  | { type: 'createProject' }
  | { type: 'editProject'; projectId: string }
  | { type: 'addSprint'; projectId: string }
  | { type: 'inviteCollaborator'; projectId?: string }
  | { type: 'manageCollaborators'; projectId: string }
  | {
      type: 'createTask';
      projectId?: string;
      defaultStatus?: TaskStatus;
      defaultDate?: string;
      prefill?: {
        title?: string;
        description?: string;
        priority?: TaskPriority;
        dueDate?: string;
      };
    }
  | { type: 'editTask'; taskId: string | number; projectId?: string }
  | { type: 'scheduleMeeting'; projectId?: string; defaultDate?: string; isInstant?: boolean }
  | { type: 'createReminder'; projectId?: string; defaultDate?: string }
  | { type: 'daySchedule'; dateKey: string }
  | { type: 'createResource'; projectId?: string; resourceId?: string }
  | { type: 'permissionNotice'; title: string; message: string; eyebrow?: string }
  | { type: 'profileOnboarding' };

export interface ActiveMeteredMeetingState {
  isOpen: boolean;
  meeting: MeetingRecord | null;
  roomUrl?: string;
  token?: string;
  isHost?: boolean;
  minimized?: boolean;
}

export interface DashboardToast {
  id: string;
  message: string;
  tone: 'info' | 'success' | 'warning' | 'error';
}
