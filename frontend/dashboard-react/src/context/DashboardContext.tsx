import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { api } from '../services/api';
import { firebaseAuth, markCurrentUserOffline } from '../services/firebase';
import { formatRelativeDate } from '../utils/dateUtils';
import type {
  AccentTheme,
  ActiveMeteredMeetingState,
  ActiveModalState,
  AnnouncementItem,
  AuditEntry,
  ConfirmationModalState,
  DashboardToast,
  DashboardView,
  MeetingRecord,
  NotificationRecord,
  Project,
  ProjectMember,
  ProjectSprint,
  ReminderRecord,
  ResourceItem,
  TaskFilterKey,
  TaskItem,
  TaskPriority,
  TaskStatus,
  ThemeMode,
  UserProfile,
  WorkspaceConsoleTab
} from '../types/dashboard';

export interface CollabToolSettings {
  collabSync: boolean;
  calendarPins: boolean;
  comments: boolean;
  approvalWorkflow: boolean;
  sprintCadence: boolean;
  publicShare: boolean;
  soundNotifs: boolean;
  huddleLinks: boolean;
  sprintRollover: boolean;
  multiAssignee: boolean;
  highContrast: boolean;
  adminAuthority: boolean;
  sessionTimeout: boolean;
  twoFactor: boolean;
}

export const defaultCollabSettings: CollabToolSettings = {
  collabSync: true,
  calendarPins: true,
  comments: true,
  approvalWorkflow: true,
  sprintCadence: true,
  publicShare: true,
  soundNotifs: true,
  huddleLinks: true,
  sprintRollover: true,
  multiAssignee: true,
  highContrast: false,
  adminAuthority: true,
  sessionTimeout: true,
  twoFactor: true
};

export const defaultUser: UserProfile = {
  name: 'Alex Morgan',
  email: 'admin@collab.io',
  initials: 'AM',
  tone: 'coral',
  role: 'Workspace Admin',
  isAdmin: true,
  profileImage: ''
};

export function getUserInitials(name = ''): string {
  const cleaned = String(name || '').trim();
  if (!cleaned) return 'AM';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getAvatarSource(person?: Partial<UserProfile | ProjectMember> | null): string {
  if (!person) return '';
  return String(
    person.profileImage ||
      person.profile_image ||
      person.photoURL ||
      person.avatar ||
      ''
  );
}

export function getSprintMemberUids(sprint?: ProjectSprint | null): string[] {
  const raw = Array.isArray(sprint?.memberFirebaseUids)
    ? sprint.memberFirebaseUids
    : Array.isArray(sprint?.member_firebase_uids)
      ? sprint.member_firebase_uids
      : [sprint?.assigneeFirebaseUid || sprint?.assignee_firebase_uid];
  return [
    ...new Set(
      (raw || [])
        .filter((uid): uid is string => typeof uid === 'string')
        .map((uid) => uid.trim())
        .filter(Boolean)
    )
  ];
}

export function getSprintMembers(project?: Project | null, sprint?: ProjectSprint | null): ProjectMember[] {
  const memberUids = getSprintMemberUids(sprint);
  const legacyAssigneeUid = String(
    sprint?.assigneeFirebaseUid || sprint?.assignee_firebase_uid || ''
  ).trim();
  const creatorUid = String(project?.creatorFirebaseUid || '').trim();
  const acceptedMembers = project?.acceptedMembers || [];

  return memberUids
    .map((uid) => {
      if (project && uid === creatorUid) {
        return {
          firebaseUid: creatorUid,
          name: project.creatorName || '',
          email: project.creatorEmail || '',
          initials: project.creatorInitials || '',
          profileImage: project.creatorProfileImage || '',
          tone: project.creatorTone || 'teal'
        };
      }
      return (
        acceptedMembers.find(
          (member) =>
            String(member.firebaseUid || member.firebase_uid || member.uid || '').trim() === uid
        ) || {
          firebaseUid: uid,
          name: uid === legacyAssigneeUid ? sprint?.assigneeName || '' : '',
          profileImage: uid === legacyAssigneeUid ? sprint?.assigneeProfileImage || '' : ''
        }
      );
    })
    .filter(Boolean);
}

export function normalizeProject(project: any): Project | null {
  if (!project) return null;
  const allowedColors = [
    'red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink', 'brown', 'black',
    'white', 'gray', 'violet', 'indigo', 'magenta', 'turquoise', 'cyan', 'teal',
    'maroon', 'beige', 'burgundy', 'lavender', 'peach', 'lime', 'olive', 'coral',
    'gold', 'silver', 'bronze', 'amber', 'aqua', 'navy', 'mint', 'charcoal',
    'crimson', 'fuchsia', 'khaki', 'salmon', 'ivory', 'saffron', 'mustard', 'rose'
  ] as const;
  const color = allowedColors.includes(project.color) ? project.color : 'yellow';
  const acceptedMembers = Array.isArray(project.accepted_members)
    ? project.accepted_members
    : Array.isArray(project.acceptedMembers)
      ? project.acceptedMembers
      : [];
  const backendTeamMemberCount = Number(project.team_member_count ?? project.teamMemberCount);

  return {
    id: project.project_id || project.id || '',
    projectId: project.project_id || project.id || '',
    name: project.name || '',
    projectType: project.project_type || project.projectType || 'General Collaboration',
    timeSpan: project.time_span || project.timeSpan || 'Ongoing',
    startDate: project.start_date || project.startDate || null,
    dueDate: project.due_date || project.dueDate || null,
    description: project.description || '',
    color,
    creatorFirebaseUid: project.creator_firebase_uid || project.creatorFirebaseUid || null,
    creatorEmail: project.creator_email || project.creatorEmail || '',
    creatorName: project.creator_name || project.creatorName || '',
    creatorInitials: project.creator_initials || project.creatorInitials || '',
    creatorProfileImage: project.creator_profile_image || project.creatorProfileImage || '',
    creatorTone: project.creator_tone || project.creatorTone || 'teal',
    invitedMembers: Array.isArray(project.invited_members)
      ? project.invited_members
      : Array.isArray(project.invitedMembers)
        ? project.invitedMembers
        : [],
    acceptedMembers,
    teamMemberCount: Number.isFinite(backendTeamMemberCount)
      ? backendTeamMemberCount
      : acceptedMembers.length,
    sprints: Array.isArray(project.sprints) ? project.sprints : [],
    createdAt: project.created_at || project.createdAt || null,
    updatedAt: project.updated_at || project.updatedAt || null
  };
}

export function normalizeTaskRecord(task: any, project: Project): TaskItem {
  const sprintMembers = [
    ...new Map(
      (project.sprints || [])
        .flatMap((sprint) => getSprintMembers(project, sprint))
        .map((member) => [member.firebaseUid || member.email || member.name || '', member])
    ).values()
  ].map((member) => ({
    ...member,
    uid: member.firebaseUid || member.firebase_uid || member.uid || '',
    profileImage: member.profileImage || member.profile_image || ''
  }));

  const dueDate = task.due_date ? String(task.due_date).slice(0, 10) : task.date ? String(task.date).slice(0, 10) : null;
  const startDate = task.start_date
    ? String(task.start_date).slice(0, 10)
    : task.startDate
      ? String(task.startDate).slice(0, 10)
      : null;

  const category = task.category || task.tag || 'Product';
  const tagToneMap: Record<string, string> = {
    Design: 'purple',
    Development: 'blue',
    Marketing: 'green',
    Product: 'yellow'
  };
  const status = (task.status || 'To do') as TaskStatus;
  const priority = (String(task.priority || 'medium').toLowerCase() as TaskPriority) || 'medium';

  return {
    id: task.task_id || task.id,
    taskId: task.task_id || task.taskId || task.id,
    task_id: task.task_id || task.id,
    projectId: project.projectId,
    project_id: project.projectId,
    backendPersistent: true,
    project: project.name,
    title: task.title || '',
    description: task.description || '',
    tag: category,
    category,
    tagTone: tagToneMap[category] || 'blue',
    tags: Array.isArray(task.tags) ? task.tags : [],
    due: dueDate ? formatRelativeDate(dueDate) : '—',
    date: dueDate,
    due_date: dueDate,
    startDate,
    start_date: startDate,
    status,
    priority,
    done: status === 'Done',
    progress: status === 'Done' ? 100 : status === 'In progress' ? 50 : 0,
    sprint: task.sprint || '',
    sprintMembers,
    taskSubmissionStatus: task.task_submission_status || task.taskSubmissionStatus || 'Not submitted',
    taskSubmissionNote: task.task_submission_note || task.taskSubmissionNote || '',
    taskSubmissionLinks: Array.isArray(task.task_submission_links)
      ? task.task_submission_links
      : Array.isArray(task.taskSubmissionLinks)
        ? task.taskSubmissionLinks
        : [],
    taskSubmissionAttachments: Array.isArray(task.task_submission_attachments)
      ? task.task_submission_attachments
      : Array.isArray(task.taskSubmissionAttachments)
        ? task.taskSubmissionAttachments
        : [],
    taskSubmittedAt: task.task_submitted_at || task.taskSubmittedAt || null,
    taskSubmittedByFirebaseUid:
      task.task_submitted_by_firebase_uid || task.taskSubmittedByFirebaseUid || null,
    taskReviewComment: task.task_review_comment || task.taskReviewComment || '',
    taskReviewedByFirebaseUid:
      task.task_reviewed_by_firebase_uid || task.taskReviewedByFirebaseUid || null,
    taskReviewedAt: task.task_reviewed_at || task.taskReviewedAt || null,
    chatMessageId: task.chat_message_id || task.chatMessageId || null,
    chat_message_id: task.chat_message_id || task.chatMessageId || null,
    chatConversationId: task.chat_conversation_id || task.chatConversationId || null,
    descriptionAttachments: Array.isArray(task.description_attachments)
      ? task.description_attachments
      : Array.isArray(task.descriptionAttachments)
        ? task.descriptionAttachments
        : [],
    dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
    hasDependencyWarning: Boolean(task.has_dependency_warning || task.hasDependencyWarning),
    approvalStatus: task.approvalStatus || 'none',
    comments: Number(task.comments || 0),
    commentsList: Array.isArray(task.commentsList) ? task.commentsList : [],
    createdAt: task.created_at || task.createdAt,
    updatedAt: task.updated_at || task.updatedAt
  };
}

function getMeetingProjectMembers(project: Project): ProjectMember[] {
  const projectMembers: ProjectMember[] = [
    {
      firebaseUid: project.creatorFirebaseUid || undefined,
      name: project.creatorName,
      email: project.creatorEmail,
      initials: project.creatorInitials,
      profileImage: project.creatorProfileImage,
      role: 'owner'
    },
    ...(project.acceptedMembers || []).map((member) => ({
      ...member,
      firebaseUid: member.firebaseUid || member.firebase_uid || member.uid,
      profileImage: member.profileImage || member.profile_image,
      role: member.role || 'member'
    }))
  ];

  const uniqueMembers = new Map<string, ProjectMember>();
  projectMembers
    .filter((member) => member.firebaseUid)
    .forEach((member) => {
      const uid = member.firebaseUid as string;
      const displayName = member.name || (member as any).displayName || member.email || 'Project member';
      uniqueMembers.set(uid, {
        ...member,
        name: displayName,
        initials: member.initials || getUserInitials(displayName),
        tone: member.tone || 'teal'
      });
    });
  return [...uniqueMembers.values()];
}

export function normalizeMeetingRecord(record: any, project: Project): MeetingRecord {
  const attendeeUids: string[] = Array.isArray(record.attendee_firebase_uids)
    ? record.attendee_firebase_uids
    : [];
  const people = getMeetingProjectMembers(project);
  const attendeeByUid = new Map(people.map((person) => [person.firebaseUid, person]));
  const startTime = String(record.start_time || '').slice(0, 5);
  const endTime = String(record.end_time || '').slice(0, 5);
  const meetingDate =
    record.meeting_date instanceof Date
      ? record.meeting_date.toISOString().slice(0, 10)
      : String(record.meeting_date || '').slice(0, 10);
  const hostUid = record.host_firebase_uid;
  const host = attendeeByUid.get(hostUid);
  const endedAt = record.ended_at || record.endedAt || null;
  const currentUid = firebaseAuth.currentUser?.uid;

  return {
    id: record.meeting_id,
    meetingId: record.meeting_id,
    projectId: record.project_id,
    projectName: record.project_name || project.name,
    title: record.title,
    date: meetingDate,
    startTime,
    endTime,
    time: `${startTime} - ${endTime}`,
    pinned: Boolean(record.pinned),
    location: record.location || '',
    meetingUrl: record.meeting_url || record.meetingUrl || '',
    notes: record.notes || '',
    hostFirebaseUid: hostUid,
    endedAt,
    isEnded: Boolean(endedAt),
    host: host?.name || record.host_name || 'Project member',
    hostName: host?.name || record.host_name || 'Project member',
    hostProfileImage: host?.profileImage || '',
    attendees: attendeeUids.map(
      (uid) =>
        attendeeByUid.get(uid) || {
          firebaseUid: uid,
          name: 'Project member',
          initials: 'PM',
          tone: 'teal'
        }
    ),
    canCancel: hostUid === currentUid || project.creatorFirebaseUid === currentUid
  };
}

function normalizeReminderRecord(record: any, project: Project): ReminderRecord {
  const date =
    record.reminder_date instanceof Date
      ? record.reminder_date.toISOString().slice(0, 10)
      : String(record.reminder_date || '').slice(0, 10);
  const timeValue = String(record.reminder_time || '').slice(0, 5);
  return {
    id: record.reminder_id,
    reminderId: record.reminder_id,
    projectId: record.project_id,
    projectName: record.project_name || project.name,
    title: record.title,
    date,
    timeValue,
    time: timeValue,
    priority: record.priority,
    author: record.created_by_name || 'Project member',
    creatorFirebaseUid: record.created_by_firebase_uid
  };
}

function normalizeNotification(notification: any): NotificationRecord {
  return {
    id: String(notification.id),
    type: notification.type || 'info',
    title: notification.title || '',
    detail: notification.detail || '',
    boardId: notification.brainstorm_board_id || null,
    relatedTaskId: notification.related_task_id || null,
    avatar: notification.avatar || '•',
    toneClass: notification.tone_class || 'coral-bg',
    invitationId: notification.invitation_id || null,
    invitationStatus: notification.invitation_status || null,
    invitationExpiresAt: notification.invitation_expires_at || null,
    time: notification.created_at
      ? new Date(notification.created_at).toLocaleString()
      : 'Just now',
    unread: !notification.is_read,
    persisted: true
  };
}

export function normalizeResourceRecord(resource: any, project?: Project): ResourceItem {
  return {
    id: resource.resource_id || resource.id,
    resourceId: resource.resource_id || resource.id,
    projectId: resource.project_id || project?.projectId || project?.id || '',
    projectName: resource.project_name || project?.name || '',
    title: resource.title || '',
    url: resource.target_url || resource.url || '',
    category: resource.category || 'Other'
  };
}

const defaultAuditLogs: AuditEntry[] = [
  {
    iconType: 'shield',
    action: 'Collaborator session active',
    detail: 'Alex Morgan (mashathabiso2006) active in Collab workspace.',
    time: 'Just now'
  },
  {
    iconType: 'sync',
    action: 'Group projects synchronized',
    detail: '3 collaborative boards ready for active sprints.',
    time: '5 mins ago'
  },
  {
    iconType: 'team',
    action: 'Team active',
    detail: '5 collaborators available for task assignments.',
    time: '15 mins ago'
  }
];

const defaultAnnouncements: AnnouncementItem[] = [
  {
    id: 'ann-1',
    authorName: 'Alex Morgan',
    authorInitials: 'AM',
    tone: 'coral',
    role: 'Workspace Admin',
    time: '2 hours ago',
    title: 'Q4 Sprint Kickoff & Spec Finalization',
    body: "All feature specs and Figma wireframes for the Q4 cycle are officially signed off. Please review your sprint commitments before Wednesday's team sync!",
    createdAt: new Date().toISOString(),
    reactions: { '🚀': 4, '🎉': 5, '👀': 3 }
  } as any,
  {
    id: 'ann-2',
    authorName: 'Elena Rostova',
    authorInitials: 'ER',
    tone: 'purple',
    role: 'Lead Engineer',
    time: 'Yesterday at 4:30 PM',
    title: 'Staging Environment Updated (v2.4.0-rc2)',
    body: 'Release candidate build v2.4.0-rc2 has been deployed to staging.collab.io. Database migrations and responsive typography updates are live for smoke testing.',
    createdAt: new Date().toISOString(),
    reactions: { '❤️': 3, '💡': 4, '🚀': 2 }
  } as any
];

function hasCompleteProfile(user: UserProfile | null): boolean {
  return Boolean(
    user?.name?.trim() &&
      user?.email?.trim() &&
      user?.phoneCountryCode &&
      user?.phoneNumber?.trim() &&
      user?.workspace?.trim() &&
      user?.role?.trim() &&
      user?.collaborationType &&
      user?.industry &&
      (user.collaborationType !== 'Other' || user.collaborationDetails?.trim())
  );
}

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const PROFILE_ONBOARDING_KEY = 'collab-profile-onboarding-uid';

export interface MessageContextTarget {
  projectId: string;
  conversationId?: string;
  targetUid?: string;
  messageId?: string;
  title?: string;
  subtitle?: string;
}

export interface ConfirmOptions {
  eyebrow?: string;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export interface DashboardContextValue {
  firebaseUser: User | null;
  authReady: boolean;
  currentUser: UserProfile;
  setCurrentUserProfile: (next: UserProfile) => void;
  signOutUser: () => Promise<void>;

  currentTheme: ThemeMode;
  isDarkThemeActive: boolean;
  currentAccent: AccentTheme;
  collabSettings: CollabToolSettings;
  applyTheme: (theme: ThemeMode, logChange?: boolean) => void;
  applyAccent: (accent: AccentTheme, logChange?: boolean) => void;
  toggleDarkLightMode: () => void;
  updateCollabSetting: (key: keyof CollabToolSettings, value: boolean) => void;

  activeView: DashboardView;
  switchView: (view: DashboardView) => void;
  isSidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  isMobileSidebarOpen: boolean;
  setMobileSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  activeDisplayMode: 'board' | 'list';
  setActiveDisplayMode: (mode: 'board' | 'list') => void;
  activeFilter: TaskFilterKey;
  setActiveFilter: (filter: TaskFilterKey) => void;
  activeSprintFilter: string;
  setActiveSprintFilter: (sprintName: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeWorkspaceTab: WorkspaceConsoleTab;
  setActiveWorkspaceTab: (tab: WorkspaceConsoleTab) => void;

  projects: Project[];
  projectsLoaded: boolean;
  activeProject: Project | undefined;
  isCurrentUserProjectCreator: boolean;
  loadProjectsFromAPI: (opts?: { silent?: boolean }) => Promise<Project[]>;

  tasks: TaskItem[];
  accessibleTasks: TaskItem[];
  setTasks: React.Dispatch<React.SetStateAction<TaskItem[]>>;
  loadAllProjectTasks: (projectList?: Project[]) => Promise<TaskItem[]>;
  moveTaskStatus: (taskId: string | number, nextStatus: TaskStatus) => Promise<void>;
  deleteTask: (task: TaskItem) => Promise<void>;

  members: ProjectMember[];
  accessibleMembers: ProjectMember[];
  setMembers: React.Dispatch<React.SetStateAction<ProjectMember[]>>;
  loadProjectMembers: (projectList?: Project[]) => Promise<ProjectMember[]>;

  meetings: MeetingRecord[];
  setMeetings: React.Dispatch<React.SetStateAction<MeetingRecord[]>>;
  loadProjectMeetings: (projectList?: Project[]) => Promise<MeetingRecord[]>;
  createProjectMeeting: (projectId: string, payload: Record<string, unknown>) => Promise<MeetingRecord>;
  deleteProjectMeeting: (meeting: MeetingRecord) => Promise<void>;

  reminders: ReminderRecord[];
  loadProjectCalendarData: (projectList?: Project[]) => Promise<void>;
  createProjectReminder: (projectId: string, payload: Record<string, unknown>) => Promise<ReminderRecord>;

  notifications: NotificationRecord[];
  unreadNotificationCount: number;
  loadNotificationsFromAPI: () => Promise<NotificationRecord[]>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  pushNotification: (title: string, detail: string, avatar?: string, toneClass?: string) => void;

  auditLogs: AuditEntry[];
  addAuditLog: (action: string, detail: string, iconType?: string) => void;

  teamResources: ResourceItem[];
  resourcesLoading: boolean;
  resourcesLoadFailed: boolean;
  loadProjectResources: (projectList?: Project[]) => Promise<ResourceItem[]>;
  upsertResourceLocal: (resource: ResourceItem, editing?: boolean) => void;
  removeProjectResource: (resource: ResourceItem) => Promise<void>;

  announcements: any[];
  addAnnouncement: (text: string) => void;
  reactToAnnouncement: (annId: string, emoji: string) => void;

  teamPolls: any[];
  createTeamPoll: (title: string, description: string, options: string[]) => void;
  submitPollVote: (pollId: string, optionId: string) => void;
  activePollPopup: any | null;
  dismissPollPopup: (poll: any) => void;

  asideTaskId: string | number | null;
  openTaskDetails: (taskId: string | number) => void;
  closeTaskDetails: () => void;

  selectedTaskViewId: string | number | null;
  openFullTaskView: (taskId: string | number, projectName?: string) => void;
  closeFullTaskView: () => void;

  activeModal: ActiveModalState;
  setActiveModal: React.Dispatch<React.SetStateAction<ActiveModalState>>;
  closeModal: () => void;
  openPermissionNotice: () => void;

  confirmationState: ConfirmationModalState;
  showDashboardConfirmation: (options: ConfirmOptions) => Promise<boolean>;
  resolveConfirmation: (confirmed: boolean) => void;

  activeMeteredMeeting: ActiveMeteredMeetingState;
  openMeteredMeetingModal: (meeting: MeetingRecord) => void;
  closeMeteredMeetingModal: () => void;
  setMeteredMeetingMinimized: (minimized: boolean) => void;

  toasts: DashboardToast[];
  showDashboardToast: (message: string, tone?: 'info' | 'success' | 'warning' | 'error') => void;
  dismissToast: (id: string) => void;

  pendingBrainstormBoardId: string | null;
  setPendingBrainstormBoardId: React.Dispatch<React.SetStateAction<string | null>>;
  openBrainstormFromNotification: (boardId: string) => void;

  pendingMessageContext: MessageContextTarget | null;
  openMessageContext: (target: MessageContextTarget) => void;
  clearPendingMessageContext: () => void;

  messagesUnreadCount: number;
  setMessagesUnreadCount: React.Dispatch<React.SetStateAction<number>>;

  stickyNotesRevision: number;
  bumpStickyNotesRevision: () => void;
  refreshAllDashboardData: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export const DashboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(firebaseAuth.currentUser);
  const [authReady, setAuthReady] = useState(false);

  const [currentUser, setCurrentUserState] = useState<UserProfile>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('collab-user') || 'null');
      return saved || defaultUser;
    } catch {
      return defaultUser;
    }
  });

  const [currentTheme, setCurrentTheme] = useState<ThemeMode>(
    () => (localStorage.getItem('collab_theme') as ThemeMode) || 'light'
  );
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(
    () => Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  );
  const [currentAccent, setCurrentAccent] = useState<AccentTheme>(
    () => (localStorage.getItem('collab_accent') as AccentTheme) || 'gold'
  );
  const [collabSettings, setCollabSettings] = useState<CollabToolSettings>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('collab_tool_settings') || 'null');
      return saved ? { ...defaultCollabSettings, ...saved } : defaultCollabSettings;
    } catch {
      return defaultCollabSettings;
    }
  });

  const [activeView, setActiveView] = useState<DashboardView>('Workspace');
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeDisplayMode, setActiveDisplayMode] = useState<'board' | 'list'>('board');
  const [activeFilter, setActiveFilter] = useState<TaskFilterKey>('all');
  const [activeSprintFilter, setActiveSprintFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceConsoleTab>('projects');

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('collab-members') || 'null') || [];
    } catch {
      return [];
    }
  });
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [reminders, setReminders] = useState<ReminderRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>(defaultAuditLogs);

  const [teamResources, setTeamResources] = useState<ResourceItem[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [resourcesLoadFailed, setResourcesLoadFailed] = useState(false);

  const [announcements, setAnnouncements] = useState<any[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('collab_announcements') || 'null') || defaultAnnouncements;
    } catch {
      return defaultAnnouncements;
    }
  });
  const [teamPolls, setTeamPolls] = useState<any[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('collab_team_polls') || 'null') || [];
      return Array.isArray(stored) ? stored.filter((p) => p.id !== 'poll-1') : [];
    } catch {
      return [];
    }
  });
  const [dismissedPollIds, setDismissedPollIds] = useState<string[]>([]);

  const [asideTaskId, setAsideTaskId] = useState<string | number | null>(null);
  const [selectedTaskViewId, setSelectedTaskViewId] = useState<string | number | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModalState>({ type: null });
  const [confirmationState, setConfirmationState] = useState<ConfirmationModalState>({
    isOpen: false,
    title: '',
    message: ''
  });
  const [activeMeteredMeeting, setActiveMeteredMeeting] = useState<ActiveMeteredMeetingState>({
    isOpen: false,
    meeting: null,
    minimized: false
  });
  const [toasts, setToasts] = useState<DashboardToast[]>([]);
  const [pendingBrainstormBoardId, setPendingBrainstormBoardId] = useState<string | null>(null);
  const [pendingMessageContext, setPendingMessageContext] = useState<MessageContextTarget | null>(
    null
  );
  const [messagesUnreadCount, setMessagesUnreadCount] = useState(0);
  const [stickyNotesRevision, setStickyNotesRevision] = useState(0);

  const projectsRef = useRef<Project[]>([]);
  projectsRef.current = projects;
  const currentUserRef = useRef<UserProfile>(currentUser);
  currentUserRef.current = currentUser;
  const activeViewRef = useRef<DashboardView>(activeView);
  activeViewRef.current = activeView;
  const notificationsRef = useRef<NotificationRecord[]>(notifications);
  notificationsRef.current = notifications;

  const isDarkThemeActive =
    currentTheme === 'dark' || (currentTheme === 'system' && systemPrefersDark);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Synchronize dark-mode & high-contrast classes and CSS variables globally
  useEffect(() => {
    if (isDarkThemeActive) {
      document.documentElement.classList.add('dark-mode');
      document.body.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
      document.body.classList.remove('dark-mode');
    }
  }, [isDarkThemeActive]);

  useEffect(() => {
    document.body.classList.toggle('high-contrast', Boolean(collabSettings.highContrast));
  }, [collabSettings.highContrast]);

  useEffect(() => {
    const colors: Record<AccentTheme, { gold: string; hover: string }> = {
      gold: { gold: '#F5B800', hover: '#E5AA00' },
      blue: { gold: '#3B82F6', hover: '#2563EB' },
      emerald: { gold: '#10B981', hover: '#059669' },
      coral: { gold: '#EF4444', hover: '#DC2626' },
      purple: { gold: '#8B5CF6', hover: '#7C3AED' }
    };
    const chosen = colors[currentAccent] || colors.gold;
    document.documentElement.style.setProperty('--gold', chosen.gold);
    document.documentElement.style.setProperty('--gold-hover', chosen.hover);
  }, [currentAccent]);

  const showDashboardToast = useCallback(
    (message: string, tone: 'info' | 'success' | 'warning' | 'error' = 'info') => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, 4200);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const setCurrentUserProfile = useCallback((user: UserProfile) => {
    setCurrentUserState(user);
    const storedUser = {
      ...user,
      profileImage: /^data:image\//i.test(user.profileImage || '') ? '' : user.profileImage || '',
      photoURL: /^data:image\//i.test(user.photoURL || '') ? '' : user.photoURL || ''
    };
    try {
      localStorage.setItem('collab-user', JSON.stringify(storedUser));
    } catch {
      // Ignore quota issues
    }
  }, []);

  const addAuditLog = useCallback((action: string, detail: string, iconType = 'sync') => {
    setAuditLogs((prev) => [{ iconType, action, detail, time: 'Just now' }, ...prev].slice(0, 20));
  }, []);

  const pushNotification = useCallback(
    (titleText: string, detailText: string, avatarText = '⚡', toneClass = 'coral-bg') => {
      const nextItem: NotificationRecord = {
        id: `notification-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'local',
        title: String(titleText),
        detail: String(detailText),
        avatar: String(avatarText),
        toneClass,
        time: 'Just now',
        unread: true,
        persisted: false
      };
      setNotifications((prev) => {
        const next = [nextItem, ...prev].slice(0, 50);
        const uid = firebaseAuth.currentUser?.uid;
        if (uid) {
          try {
            localStorage.setItem(
              `collab_notifications_${uid}`,
              JSON.stringify(next.filter((n) => !n.persisted))
            );
          } catch {
            // ignore
          }
        }
        return next;
      });
    },
    []
  );

  const applyTheme = useCallback(
    (theme: ThemeMode, logChange = false) => {
      setCurrentTheme(theme);
      localStorage.setItem('collab_theme', theme);
      if (logChange) {
        addAuditLog(
          'Theme changed',
          `Workspace appearance set to ${
            theme === 'dark' ? 'Dark Mode' : theme === 'system' ? 'System Default' : 'Light Mode'
          }.`,
          'palette'
        );
        pushNotification(
          'Theme Updated',
          `Switched to ${
            theme === 'dark'
              ? 'Dark Mode 🌙'
              : theme === 'system'
                ? 'System Default 💻'
                : 'Light Mode ☀️'
          }`,
          theme === 'dark' ? '🌙' : '☀️',
          'coral-bg'
        );
      }
    },
    [addAuditLog, pushNotification]
  );

  const applyAccent = useCallback(
    (accent: AccentTheme, logChange = false) => {
      setCurrentAccent(accent);
      localStorage.setItem('collab_accent', accent);
      if (logChange) {
        addAuditLog('Accent changed', `Workspace accent tint set to ${accent}.`, 'palette');
        pushNotification('Accent Updated', `Accent color changed to ${accent}`, '🎨', 'coral-bg');
      }
    },
    [addAuditLog, pushNotification]
  );

  const toggleDarkLightMode = useCallback(() => {
    const nextTheme: ThemeMode = isDarkThemeActive ? 'light' : 'dark';
    applyTheme(nextTheme, false);
    addAuditLog(
      'Theme changed',
      `Workspace appearance toggled to ${nextTheme === 'dark' ? 'Dark Mode' : 'Light Mode'}.`,
      'palette'
    );
    pushNotification(
      'Theme Updated',
      `Workspace switched to ${nextTheme === 'dark' ? 'Dark Mode 🌙' : 'Light Mode ☀️'}`,
      nextTheme === 'dark' ? '🌙' : '☀️',
      'coral-bg'
    );
  }, [isDarkThemeActive, applyTheme, addAuditLog, pushNotification]);

  const updateCollabSetting = useCallback(
    (key: keyof CollabToolSettings, value: boolean) => {
      setCollabSettings((prev) => {
        const next = { ...prev, [key]: value };
        localStorage.setItem('collab_tool_settings', JSON.stringify(next));
        return next;
      });
      if (key === 'sessionTimeout') {
        window.dispatchEvent(
          new CustomEvent('collab-session-timeout-setting-changed', { detail: { enabled: value } })
        );
      }
    },
    []
  );

  const switchView = useCallback((viewName: DashboardView) => {
    const resolved = viewName === 'Calendar' ? 'Meetings' : viewName;
    setActiveView(resolved);
    setSelectedTaskViewId(null);
    setActiveSprintFilter('all');
    setMobileSidebarOpen(false);
  }, []);

  const loadProjectsFromAPI = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}): Promise<Project[]> => {
      try {
        const result = await api.get('/projects');
        const serverProjects = result?.data?.projects;
        if (!Array.isArray(serverProjects)) {
          throw new Error('The server returned an invalid projects response.');
        }
        const normalized = serverProjects.map(normalizeProject).filter(Boolean) as Project[];
        setProjects(normalized);
        setProjectsLoaded(true);
        return normalized;
      } catch (error) {
        console.error('Failed to load projects from backend:', error);
        if (!silent) {
          setProjects([]);
          setProjectsLoaded(false);
        }
        throw error;
      }
    },
    []
  );

  const loadAllProjectTasks = useCallback(
    async (projectList?: Project[]): Promise<TaskItem[]> => {
      const targetProjects = projectList || projectsRef.current;
      if (!targetProjects.length) {
        setTasks([]);
        return [];
      }
      const taskGroups = await Promise.all(
        targetProjects.map(async (project) => {
          const response = await api.get(
            `/projects/${encodeURIComponent(project.projectId)}/tasks`
          );
          const rawTasks = response?.data?.tasks;
          if (!Array.isArray(rawTasks)) return [];
          return rawTasks.map((t: any) => normalizeTaskRecord(t, project));
        })
      );
      const flattened = taskGroups.flat();
      setTasks(flattened);
      return flattened;
    },
    []
  );

  const loadProjectMembers = useCallback(
    async (projectList?: Project[]): Promise<ProjectMember[]> => {
      const targetProjects = projectList || projectsRef.current;
      const memberMap = new Map<string, ProjectMember>();
      const addMember = (m: ProjectMember) => {
        const email = m.email?.trim().toLowerCase();
        if (!email) return;
        const name = m.name || email;
        if (!memberMap.has(email)) {
          memberMap.set(email, {
            ...m,
            email,
            name,
            profileImage: m.profileImage || m.profile_image || m.photoURL || '',
            initials: m.initials && m.initials !== '•' ? m.initials : getUserInitials(name),
            tone: m.tone || 'teal',
            status: m.status || 'Active'
          });
        }
      };

      targetProjects.forEach((project) => {
        addMember({
          firebaseUid: project.creatorFirebaseUid || undefined,
          email: project.creatorEmail,
          name: project.creatorName,
          initials: project.creatorInitials,
          tone: project.creatorTone || 'coral',
          profileImage: project.creatorProfileImage,
          role: 'Project Creator'
        });
        (project.acceptedMembers || []).forEach(addMember);
      });

      const user = currentUserRef.current;
      if (targetProjects.length && user?.email) {
        addMember({
          firebaseUid: user.uid,
          email: user.email,
          name: user.name,
          initials: user.initials,
          tone: user.tone,
          profileImage: user.profileImage || user.photoURL,
          role: user.role
        });
      }

      const list = [...memberMap.values()];
      setMembers(list);
      localStorage.setItem('collab-members', JSON.stringify(list));
      return list;
    },
    []
  );

  const loadProjectMeetings = useCallback(
    async (projectList?: Project[]): Promise<MeetingRecord[]> => {
      const targetProjects = projectList || projectsRef.current;
      if (!targetProjects.length) {
        setMeetings([]);
        return [];
      }
      const recordsByProject = await Promise.all(
        targetProjects.map(async (project) => {
          const response = await api.get(
            `/projects/${encodeURIComponent(project.projectId)}/meetings`
          );
          return (response?.data?.meetings || []).map((record: any) =>
            normalizeMeetingRecord(record, project)
          );
        })
      );
      const sorted = recordsByProject
        .flat()
        .sort(
          (first, second) =>
            first.date.localeCompare(second.date) ||
            (first.startTime || '').localeCompare(second.startTime || '')
        );
      setMeetings(sorted);
      return sorted;
    },
    []
  );

  const createProjectMeeting = useCallback(
    async (projectId: string, meetingPayload: Record<string, unknown>): Promise<MeetingRecord> => {
      const response = await api.post(
        `/projects/${encodeURIComponent(projectId)}/meetings`,
        meetingPayload
      );
      const project = projectsRef.current.find((item) => item.projectId === projectId);
      const record = response?.data?.meeting;
      if (!project || !record) {
        throw new Error(
          'The meeting was created, but its project details could not be loaded. Refresh the page.'
        );
      }
      const created = normalizeMeetingRecord(record, project);
      setMeetings((prev) =>
        [...prev, created].sort(
          (first, second) =>
            first.date.localeCompare(second.date) ||
            (first.startTime || '').localeCompare(second.startTime || '')
        )
      );
      return created;
    },
    []
  );

  const deleteProjectMeeting = useCallback(async (meeting: MeetingRecord) => {
    if (!meeting.projectId) return;
    await api.delete(
      `/projects/${encodeURIComponent(meeting.projectId)}/meetings/${encodeURIComponent(meeting.id)}`
    );
    setMeetings((prev) => prev.filter((item) => item.id !== meeting.id));
  }, []);

  const loadProjectCalendarData = useCallback(async (projectList?: Project[]) => {
    const targetProjects = projectList || projectsRef.current;
    if (!targetProjects.length) {
      setReminders([]);
      return;
    }
    const projectData = await Promise.all(
      targetProjects.map(async (project) => {
        const [taskResponse, reminderResponse] = await Promise.all([
          api.get(`/projects/${encodeURIComponent(project.projectId)}/tasks`),
          api.get(`/projects/${encodeURIComponent(project.projectId)}/reminders`)
        ]);
        const normalizedTasks = Array.isArray(taskResponse?.data?.tasks)
          ? taskResponse.data.tasks.map((t: any) => normalizeTaskRecord(t, project))
          : [];
        const normalizedReminders = Array.isArray(reminderResponse?.data?.reminders)
          ? reminderResponse.data.reminders.map((r: any) => normalizeReminderRecord(r, project))
          : [];
        return { tasks: normalizedTasks, reminders: normalizedReminders };
      })
    );
    setTasks(projectData.flatMap((d) => d.tasks));
    setReminders(
      projectData
        .flatMap((d) => d.reminders)
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            String((a as any).timeValue || '').localeCompare(String((b as any).timeValue || ''))
        )
    );
  }, []);

  const createProjectReminder = useCallback(
    async (projectId: string, reminderPayload: Record<string, unknown>): Promise<ReminderRecord> => {
      const response = await api.post(
        `/projects/${encodeURIComponent(projectId)}/reminders`,
        reminderPayload
      );
      const project = projectsRef.current.find((item) => item.projectId === projectId);
      const record = response?.data?.reminder;
      if (!project || !record) {
        throw new Error(
          'The reminder was created, but its project details could not be loaded. Refresh the page.'
        );
      }
      const normalized = normalizeReminderRecord(record, project);
      setReminders((prev) =>
        [...prev, normalized].sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            String((a as any).timeValue || '').localeCompare(String((b as any).timeValue || ''))
        )
      );
      return normalized;
    },
    []
  );

  const loadNotificationsFromAPI = useCallback(async (): Promise<NotificationRecord[]> => {
    const response = await api.get('/notifications');
    const records = response?.data?.notifications;
    if (!Array.isArray(records)) {
      throw new Error('The server returned an invalid notifications response.');
    }
    const uid = firebaseAuth.currentUser?.uid;
    const cached: NotificationRecord[] = uid
      ? JSON.parse(localStorage.getItem(`collab_notifications_${uid}`) || '[]')
      : [];
    const existingIds = new Set(notificationsRef.current.map((n) => n.id));
    const hasNewDependencyWarning = records.some(
      (n: any) =>
        n.type === 'task_dependency_warning' && !n.is_read && !existingIds.has(String(n.id))
    );
    const merged = [
      ...records.map(normalizeNotification),
      ...(Array.isArray(cached) ? cached : [])
    ];
    setNotifications(merged);
    if (hasNewDependencyWarning) {
      loadAllProjectTasks().catch(() => {});
    }
    return merged;
  }, [loadAllProjectTasks]);

  const markNotificationRead = useCallback(async (id: string) => {
    const target = notificationsRef.current.find((n) => n.id === id);
    if (!target || !target.unread) return;
    if (target.persisted) {
      await api.patch(`/notifications/${encodeURIComponent(id)}/read`, {});
    }
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, unread: false } : n));
      const uid = firebaseAuth.currentUser?.uid;
      if (uid) {
        localStorage.setItem(
          `collab_notifications_${uid}`,
          JSON.stringify(next.filter((n) => !n.persisted))
        );
      }
      return next;
    });
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    if (notificationsRef.current.some((n) => n.persisted && n.unread)) {
      await api.patch('/notifications/read-all', {});
    }
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, unread: false }));
      const uid = firebaseAuth.currentUser?.uid;
      if (uid) {
        localStorage.setItem(
          `collab_notifications_${uid}`,
          JSON.stringify(next.filter((n) => !n.persisted))
        );
      }
      return next;
    });
  }, []);

  const clearAllNotifications = useCallback(async () => {
    if (!notificationsRef.current.length) return;
    if (notificationsRef.current.some((n) => n.persisted)) {
      await api.delete('/notifications');
    }
    setNotifications([]);
    const uid = firebaseAuth.currentUser?.uid;
    if (uid) {
      localStorage.setItem(`collab_notifications_${uid}`, '[]');
    }
  }, []);

  const loadProjectResources = useCallback(async (projectList?: Project[]): Promise<ResourceItem[]> => {
    const targetProjects = projectList || projectsRef.current;
    setResourcesLoading(true);
    setResourcesLoadFailed(false);
    try {
      const results = await Promise.all(
        targetProjects.map(async (project) => {
          const response = await api.get(
            `/projects/${encodeURIComponent(project.projectId)}/resources`
          );
          return (response?.data?.resources || []).map((r: any) =>
            normalizeResourceRecord(r, project)
          );
        })
      );
      const flattened = results.flat();
      setTeamResources(flattened);
      return flattened;
    } catch (error) {
      setResourcesLoadFailed(true);
      throw error;
    } finally {
      setResourcesLoading(false);
    }
  }, []);

  const upsertResourceLocal = useCallback((resource: ResourceItem, editing = false) => {
    setTeamResources((prev) =>
      editing
        ? prev.map((item) => (item.id === resource.id ? resource : item))
        : [resource, ...prev]
    );
  }, []);

  const showDashboardConfirmation = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmationState({
        isOpen: true,
        eyebrow: options.eyebrow,
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel || 'Confirm',
        cancelLabel: options.cancelLabel || 'Cancel',
        destructive: Boolean(options.destructive),
        resolve
      });
    });
  }, []);

  const resolveConfirmation = useCallback((confirmed: boolean) => {
    setConfirmationState((prev) => {
      if (prev.resolve) prev.resolve(confirmed);
      return { isOpen: false, title: '', message: '' };
    });
  }, []);

  const removeProjectResource = useCallback(
    async (resource: ResourceItem) => {
      const confirmed = await showDashboardConfirmation({
        title: 'Remove project resource?',
        message: `Remove "${resource.title}" from ${resource.projectName || 'this project'}? Project members will be notified.`,
        confirmLabel: 'Remove resource',
        destructive: true
      });
      if (!confirmed) return;
      try {
        await api.delete(
          `/projects/${encodeURIComponent(resource.projectId)}/resources/${encodeURIComponent(resource.id)}`
        );
        setTeamResources((prev) => prev.filter((item) => item.id !== resource.id));
        showDashboardToast('Resource removed. Project members have been notified.', 'success');
      } catch (error: any) {
        console.error('Unable to remove project resource:', error);
        showDashboardToast(error?.message || 'The project resource could not be removed.', 'error');
      }
    },
    [showDashboardConfirmation, showDashboardToast]
  );

  const moveTaskStatus = useCallback(
    async (taskId: string | number, nextStatus: TaskStatus) => {
      const target = tasks.find((t) => String(t.id) === String(taskId));
      if (!target || target.status === nextStatus) return;

      const prevStatus = target.status;
      setTasks((prev) =>
        prev.map((item) =>
          String(item.id) === String(taskId)
            ? {
                ...item,
                status: nextStatus,
                done: nextStatus === 'Done',
                progress: nextStatus === 'Done' ? 100 : nextStatus === 'In progress' ? 50 : 0
              }
            : item
        )
      );

      if (target.backendPersistent && target.projectId) {
        try {
          await api.patch(
            `/projects/${encodeURIComponent(target.projectId)}/tasks/${encodeURIComponent(String(target.taskId || target.id))}/status`,
            { status: nextStatus }
          );
          addAuditLog(
            'Task status updated',
            `Moved "${target.title}" to ${nextStatus}.`,
            'checkCircle'
          );
        } catch (error: any) {
          setTasks((prev) =>
            prev.map((item) =>
              String(item.id) === String(taskId)
                ? {
                    ...item,
                    status: prevStatus,
                    done: prevStatus === 'Done'
                  }
                : item
            )
          );
          showDashboardToast(error?.message || 'Task status could not be updated.', 'error');
        }
      }
    },
    [tasks, addAuditLog, showDashboardToast]
  );

  const deleteTask = useCallback(
    async (task: TaskItem) => {
      const confirmed = await showDashboardConfirmation({
        eyebrow: 'Task management',
        title: 'Delete this task?',
        message: `"${task.title}" will be permanently removed from ${task.project}.`,
        confirmLabel: 'Delete task',
        destructive: true
      });
      if (!confirmed) return;

      if (task.backendPersistent && task.projectId) {
        await api.delete(
          `/projects/${encodeURIComponent(task.projectId)}/tasks/${encodeURIComponent(String(task.taskId || task.id))}`
        );
      }
      setTasks((prev) => prev.filter((item) => String(item.id) !== String(task.id)));
      if (asideTaskId && String(asideTaskId) === String(task.id)) {
        setAsideTaskId(null);
      }
      if (
        selectedTaskViewId &&
        (String(selectedTaskViewId) === String(task.id) ||
          String(selectedTaskViewId) === String(task.taskId || ''))
      ) {
        setSelectedTaskViewId(null);
      }
      addAuditLog('Task deleted', `Deleted task "${task.title}" from ${task.project}.`, 'trash');
      showDashboardToast('Task deleted.', 'success');
    },
    [asideTaskId, selectedTaskViewId, addAuditLog, showDashboardConfirmation, showDashboardToast]
  );

  const addAnnouncement = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const lines = trimmed.split('\n').filter(Boolean);
      const title = lines[0].length > 60 ? `${lines[0].slice(0, 57)}...` : lines[0];
      const body = lines.length > 1 ? lines.slice(1).join('\n') : trimmed;
      const post = {
        id: `ann_${Date.now()}`,
        authorName: currentUser.name,
        authorInitials: currentUser.initials,
        tone: currentUser.tone || 'coral',
        role: currentUser.role,
        time: 'Just now',
        title,
        body,
        content: body,
        createdAt: new Date().toISOString(),
        reactions: { '🚀': 1, '❤️': 1 }
      };
      setAnnouncements((prev) => {
        const next = [post, ...prev];
        localStorage.setItem('collab_announcements', JSON.stringify(next));
        return next;
      });
      addAuditLog('Announcement posted', `${currentUser.name} posted: "${title}".`, 'broadcast');
      pushNotification(
        'New Announcement',
        `"${title}" broadcasted to workspace`,
        currentUser.initials,
        `${currentUser.tone || 'coral'}-bg`
      );
    },
    [currentUser, addAuditLog, pushNotification]
  );

  const reactToAnnouncement = useCallback(
    (annId: string, emoji: string) => {
      let reactedTitle = '';
      setAnnouncements((prev) => {
        const next = prev.map((ann) => {
          if (ann.id !== annId) return ann;
          reactedTitle = ann.title;
          const reactions = { ...(ann.reactions || {}) };
          reactions[emoji] = (reactions[emoji] || 0) + 1;
          return { ...ann, reactions };
        });
        localStorage.setItem('collab_announcements', JSON.stringify(next));
        return next;
      });
      if (reactedTitle) {
        pushNotification('Reaction Added', `Reacted with ${emoji} to "${reactedTitle}"`, '🎉', 'teal-bg');
      }
    },
    [pushNotification]
  );

  const createTeamPoll = useCallback(
    (title: string, description: string, optionTexts: string[]) => {
      const invitedMemberEmails = [
        ...new Set([...members.map((m) => m.email), currentUser.email].filter(Boolean))
      ];
      const poll = {
        id: `poll_${Date.now()}`,
        title: title.trim(),
        description: description.trim() || 'Team alignment poll.',
        creator: currentUser.name,
        creatorEmail: currentUser.email,
        invitedMemberEmails,
        viewedBy: [],
        votesByMember: {},
        totalVotes: 0,
        options: optionTexts
          .map((t) => t.trim())
          .filter(Boolean)
          .map((text, idx) => ({ id: `opt_${Date.now()}_${idx + 1}`, text, votes: 0 }))
      };
      setTeamPolls((prev) => {
        const next = [poll, ...prev];
        localStorage.setItem('collab_team_polls', JSON.stringify(next));
        return next;
      });
      addAuditLog('Poll created', `${currentUser.name} created decision poll: "${poll.title}".`, 'poll');
      pushNotification('New Poll Launched', `Vote now on "${poll.title}"`, '📊', 'teal-bg');
    },
    [members, currentUser, addAuditLog, pushNotification]
  );

  const submitPollVote = useCallback(
    (pollId: string, optionId: string) => {
      const voterEmail = currentUser.email;
      let votedTitle = '';
      let chosenText = '';
      setTeamPolls((prev) => {
        const next = prev.map((poll) => {
          if (poll.id !== pollId) return poll;
          const votesByMember = { ...(poll.votesByMember || {}) };
          const previousChoice =
            votesByMember[voterEmail] || (poll.creatorEmail === voterEmail ? poll.userChoice : null);
          if (previousChoice === optionId) return poll;
          const options = (poll.options || []).map((opt: any) => {
            let votes = Number(opt.votes) || 0;
            if (previousChoice && opt.id === previousChoice && votes > 0) votes -= 1;
            if (opt.id === optionId) {
              votes += 1;
              chosenText = opt.text || opt.label || '';
            }
            return { ...opt, votes };
          });
          votesByMember[voterEmail] = optionId;
          votedTitle = poll.title;
          return {
            ...poll,
            options,
            votesByMember,
            totalVotes: options.reduce((sum: number, o: any) => sum + (o.votes || 0), 0)
          };
        });
        localStorage.setItem('collab_team_polls', JSON.stringify(next));
        return next;
      });
      if (votedTitle) {
        addAuditLog('Vote submitted', `${currentUser.name} voted on "${votedTitle}".`, 'poll');
        pushNotification('Vote Recorded', `You voted for: "${chosenText.slice(0, 32)}..."`, '🗳️', 'teal-bg');
      }
    },
    [currentUser, addAuditLog, pushNotification]
  );

  const dismissPollPopup = useCallback(
    (poll: any) => {
      if (!poll) return;
      setDismissedPollIds((prev) => [...prev, poll.id]);
      setTeamPolls((prev) => {
        const next = prev.map((item) => {
          if (item.id !== poll.id) return item;
          const viewedBy = Array.isArray(item.viewedBy) ? [...item.viewedBy] : [];
          if (currentUser.email && !viewedBy.includes(currentUser.email)) {
            viewedBy.push(currentUser.email);
          }
          return { ...item, viewedBy };
        });
        localStorage.setItem('collab_team_polls', JSON.stringify(next));
        return next;
      });
    },
    [currentUser.email]
  );

  const activePollPopup = useMemo(() => {
    if (activeView !== 'Workspace' || !currentUser?.email) return null;
    return (
      teamPolls.find((item) => {
        if (dismissedPollIds.includes(item.id)) return false;
        const audience: string[] = Array.isArray(item.invitedMemberEmails)
          ? item.invitedMemberEmails
          : members.map((m) => m.email).filter(Boolean) as string[];
        if (!audience.includes(currentUser.email)) return false;
        const isCreator = item.creatorEmail
          ? item.creatorEmail === currentUser.email
          : item.creator === currentUser.name;
        const alreadyViewed = Array.isArray(item.viewedBy) && item.viewedBy.includes(currentUser.email);
        return !isCreator && !alreadyViewed;
      }) || null
    );
  }, [activeView, currentUser, teamPolls, dismissedPollIds, members]);

  const openTaskDetails = useCallback((taskId: string | number) => {
    setAsideTaskId(taskId);
  }, []);

  const closeTaskDetails = useCallback(() => {
    setAsideTaskId(null);
  }, []);

  const openFullTaskView = useCallback(
    (taskId: string | number, projectName?: string) => {
      setAsideTaskId(null);
      if (projectName) {
        setActiveView(projectName);
      } else {
        const matchedTask = tasks.find(
          (item) =>
            String(item.id) === String(taskId) ||
            String(item.taskId || item.task_id || '') === String(taskId)
        );
        if (matchedTask?.project) {
          setActiveView(matchedTask.project);
        } else if (matchedTask?.projectId) {
          const matchedProject = projectsRef.current.find(
            (p) => p.projectId === matchedTask.projectId
          );
          if (matchedProject) setActiveView(matchedProject.name);
        }
      }
      setSelectedTaskViewId(taskId);
      setMobileSidebarOpen(false);
    },
    [tasks]
  );

  const closeFullTaskView = useCallback(() => {
    setSelectedTaskViewId(null);
  }, []);

  const closeModal = useCallback(() => {
    setActiveModal({ type: null });
  }, []);

  const activeProject = useMemo(
    () => projects.find((p) => p.name === activeView) || projects[0],
    [projects, activeView]
  );

  const isCurrentUserProjectCreator = useMemo(() => {
    const uid = firebaseUser?.uid || currentUser?.uid;
    return Boolean(activeProject?.creatorFirebaseUid && uid && activeProject.creatorFirebaseUid === uid);
  }, [activeProject, firebaseUser, currentUser]);

  const openPermissionNotice = useCallback(() => {
    const uid = firebaseUser?.uid || currentUser?.uid;
    const hasOwned = projects.some((p) => p.creatorFirebaseUid === uid);
    setActiveModal({
      type: 'permissionNotice',
      eyebrow: 'PROJECT ACCESS',
      title: hasOwned ? 'Project Creator Privileges Required' : 'Create a Project First',
      message:
        hasOwned && activeProject
          ? `Only ${activeProject.creatorName} (who created "${activeProject.name}") can create or edit project tasks and approve submissions. As an invited collaborator, you can view the project, update task statuses, move task cards, and comment on work.`
          : 'You do not own an active project yet. Create a project first, then you can invite people to collaborate with you.'
    });
  }, [projects, activeProject, firebaseUser, currentUser]);

  const openMeteredMeetingModal = useCallback(
    (meeting: MeetingRecord) => {
      const uid = firebaseUser?.uid || currentUser?.uid;
      setActiveMeteredMeeting({
        isOpen: true,
        meeting,
        roomUrl: meeting.meetingUrl || meeting.roomUrl || '',
        isHost: Boolean(meeting.hostFirebaseUid && uid && meeting.hostFirebaseUid === uid),
        minimized: false
      });
    },
    [firebaseUser, currentUser]
  );

  const closeMeteredMeetingModal = useCallback(() => {
    setActiveMeteredMeeting({ isOpen: false, meeting: null, minimized: false });
  }, []);

  const setMeteredMeetingMinimized = useCallback((minimized: boolean) => {
    setActiveMeteredMeeting((prev) => ({ ...prev, minimized }));
  }, []);

  const openBrainstormFromNotification = useCallback((boardId: string) => {
    setPendingBrainstormBoardId(boardId);
    setActiveView('Brainstorm');
  }, []);

  const openMessageContext = useCallback((target: MessageContextTarget) => {
    setPendingMessageContext(target);
    setActiveView('Messages');
  }, []);

  const clearPendingMessageContext = useCallback(() => {
    setPendingMessageContext(null);
  }, []);

  const bumpStickyNotesRevision = useCallback(() => {
    setStickyNotesRevision((r) => r + 1);
  }, []);

  const refreshAllDashboardData = useCallback(async () => {
    const loadedProjects = await loadProjectsFromAPI({ silent: true });
    await Promise.allSettled([
      loadAllProjectTasks(loadedProjects),
      loadProjectMeetings(loadedProjects),
      loadProjectCalendarData(loadedProjects),
      loadProjectResources(loadedProjects),
      loadProjectMembers(loadedProjects),
      loadNotificationsFromAPI()
    ]);
  }, [
    loadProjectsFromAPI,
    loadAllProjectTasks,
    loadProjectMeetings,
    loadProjectCalendarData,
    loadProjectResources,
    loadProjectMembers,
    loadNotificationsFromAPI
  ]);

  const signOutUser = useCallback(async () => {
    localStorage.removeItem('collab-logged-in');
    try {
      await markCurrentUserOffline();
    } catch (error) {
      console.error('Unable to mark presence offline before sign-out:', error);
    }
    try {
      await signOut(firebaseAuth);
      window.location.replace('/auth/auth.html?mode=signin');
    } catch (error) {
      console.error('Unable to sign out cleanly:', error);
      showDashboardToast('Could not complete sign out cleanly. Please try again.', 'error');
    }
  }, [showDashboardToast]);

  // Firebase Auth & Initial Sync Lifecycle
  useEffect(() => {
    let cancelled = false;
    let notificationTimer: number | null = null;
    let syncTimer: number | null = null;
    let inactivityTimer: number | null = null;
    let lastActivityAt = Date.now();

    const inactivityKey = (uid: string) => `collab-last-activity-${uid}`;

    const isTimeoutEnabled = () => {
      try {
        const s = JSON.parse(localStorage.getItem('collab_tool_settings') || '{}');
        return s.sessionTimeout !== false;
      } catch {
        return true;
      }
    };

    const scheduleInactivity = (uid: string) => {
      if (inactivityTimer !== null) window.clearTimeout(inactivityTimer);
      if (!isTimeoutEnabled()) return;
      const remaining = Math.max(0, INACTIVITY_TIMEOUT_MS - (Date.now() - lastActivityAt));
      inactivityTimer = window.setTimeout(async () => {
        if (Date.now() - lastActivityAt >= INACTIVITY_TIMEOUT_MS && isTimeoutEnabled()) {
          localStorage.removeItem('collab-logged-in');
          try {
            await markCurrentUserOffline();
          } catch {
            // ignore
          }
          await signOut(firebaseAuth);
          localStorage.removeItem(inactivityKey(uid));
          window.location.replace('/auth/auth.html?mode=signin&reason=inactivity');
        } else {
          scheduleInactivity(uid);
        }
      }, remaining);
    };

    const onUserActivity = () => {
      const u = firebaseAuth.currentUser;
      if (!u || !isTimeoutEnabled()) return;
      const now = Date.now();
      if (now - lastActivityAt < 5000) return;
      lastActivityAt = now;
      localStorage.setItem(inactivityKey(u.uid), String(now));
      scheduleInactivity(u.uid);
    };

    const activityEvents = ['pointerdown', 'keydown', 'touchstart', 'scroll', 'mousemove'] as const;
    activityEvents.forEach((ev) => document.addEventListener(ev, onUserActivity, { passive: true }));

    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      if (cancelled) return;
      setFirebaseUser(user);
      setAuthReady(true);
      if (notificationTimer) window.clearTimeout(notificationTimer);
      if (syncTimer) window.clearTimeout(syncTimer);
      if (inactivityTimer) window.clearTimeout(inactivityTimer);

      if (!user) {
        setNotifications([]);
        const returnTo = encodeURIComponent('/');
        window.location.replace(`/auth/auth.html?mode=signin&return=${returnTo}`);
        return;
      }

      const storedActivity = Number(localStorage.getItem(inactivityKey(user.uid)));
      lastActivityAt = Number.isFinite(storedActivity) && storedActivity > 0 ? storedActivity : Date.now();
      if (!storedActivity) localStorage.setItem(inactivityKey(user.uid), String(lastActivityAt));
      scheduleInactivity(user.uid);

      let storedUser: any = null;
      try {
        storedUser = JSON.parse(localStorage.getItem('collab-user') || 'null');
      } catch {
        storedUser = null;
      }
      const savedUser = storedUser?.uid === user.uid ? storedUser : null;
      const userName =
        savedUser?.name || user.displayName || user.email?.split('@')[0] || 'Collab User';

      let assembledUser: UserProfile = {
        ...(savedUser || {}),
        uid: user.uid,
        name: userName,
        email: user.email || savedUser?.email || '',
        initials: getUserInitials(userName),
        tone: savedUser?.tone || 'coral',
        photoURL: user.photoURL || savedUser?.photoURL || '',
        profileImage: user.photoURL || savedUser?.profileImage || '',
        role: savedUser?.role || 'Member',
        isAdmin: Boolean(savedUser?.isAdmin)
      };
      setCurrentUserProfile(assembledUser);

      try {
        const imgRes = await api.get('/users/profile-image');
        let savedImg = imgRes?.data?.profileImage || '';
        const legacyImg = savedUser?.profileImage || '';
        if (
          !savedImg &&
          /^data:image\/(?:jpeg|png|webp);base64,/.test(legacyImg) &&
          legacyImg.length <= 350_000
        ) {
          const putRes = await api.put('/users/profile-image', { profileImage: legacyImg });
          savedImg = putRes?.data?.profileImage || '';
        }
        if (savedImg) {
          assembledUser = { ...assembledUser, profileImage: savedImg, photoURL: savedImg };
          setCurrentUserProfile(assembledUser);
        }
      } catch (err) {
        console.error('Unable to restore the signed-in user profile photo:', err);
      }

      try {
        const profRes = await api.get('/users/profile');
        const savedProfile = profRes?.data?.profile;
        if (savedProfile) {
          assembledUser = {
            ...assembledUser,
            ...Object.fromEntries(
              Object.entries(savedProfile).filter(([, v]) => v !== null && v !== undefined)
            ),
            uid: user.uid,
            initials: getUserInitials(savedProfile.name || assembledUser.name)
          };
          setCurrentUserProfile(assembledUser);
        }
      } catch (err: any) {
        console.error('Unable to restore the signed-in user profile:', err);
        showDashboardToast(
          err?.message || 'Your profile could not be loaded from the server.',
          'error'
        );
      }

      // Check profile onboarding
      if (localStorage.getItem(PROFILE_ONBOARDING_KEY) === user.uid) {
        if (hasCompleteProfile(assembledUser)) {
          localStorage.removeItem(PROFILE_ONBOARDING_KEY);
        } else {
          setActiveModal({ type: 'profileOnboarding' });
        }
      }

      // Accept invite token in URL if present & load dashboard data
      try {
        const inviteToken = new URLSearchParams(window.location.search).get('invite');
        let acceptedProjectId: string | null = null;
        if (inviteToken) {
          const acceptance = await api.post('/invitations/accept', { token: inviteToken });
          acceptedProjectId = acceptance?.data?.projectId || null;
          const url = new URL(window.location.href);
          url.searchParams.delete('invite');
          window.history.replaceState({}, '', url);
        }
        const loadedProjects = await loadProjectsFromAPI();
        await Promise.allSettled([
          loadAllProjectTasks(loadedProjects),
          loadProjectMeetings(loadedProjects),
          loadProjectResources(loadedProjects),
          loadProjectMembers(loadedProjects),
          loadNotificationsFromAPI()
        ]);
        if (acceptedProjectId) {
          const accepted = loadedProjects.find((p) => p.id === acceptedProjectId);
          if (accepted) setActiveView(accepted.name);
        }
      } catch (err) {
        console.error('Unable to load initial projects for the dashboard:', err);
      }

      const scheduleNotifPoll = (delay = 30000) => {
        notificationTimer = window.setTimeout(async () => {
          if (cancelled || !firebaseAuth.currentUser) return;
          if (document.visibilityState === 'visible' && activeViewRef.current !== 'Notifications') {
            await loadNotificationsFromAPI().catch(() => {});
          }
          scheduleNotifPoll(30000);
        }, delay);
      };
      scheduleNotifPoll(30000);

      const scheduleDashPoll = (delay = 60000) => {
        syncTimer = window.setTimeout(async () => {
          if (cancelled || !firebaseAuth.currentUser) return;
          if (document.visibilityState === 'visible') {
            try {
              const latest = await loadProjectsFromAPI({ silent: true });
              await Promise.allSettled([
                loadAllProjectTasks(latest),
                loadProjectMeetings(latest),
                loadProjectMembers(latest)
              ]);
            } catch {
              // ignore background sync error
            }
          }
          scheduleDashPoll(60000);
        }, delay);
      };
      scheduleDashPoll(60000);
    });

    return () => {
      cancelled = true;
      unsubscribe();
      activityEvents.forEach((ev) => document.removeEventListener(ev, onUserActivity));
      if (notificationTimer) window.clearTimeout(notificationTimer);
      if (syncTimer) window.clearTimeout(syncTimer);
      if (inactivityTimer) window.clearTimeout(inactivityTimer);
    };
  }, [
    loadAllProjectTasks,
    loadNotificationsFromAPI,
    loadProjectMeetings,
    loadProjectMembers,
    loadProjectResources,
    loadProjectsFromAPI,
    setCurrentUserProfile,
    showDashboardToast
  ]);

  const accessibleTasks = useMemo(() => {
    const names = new Set(projects.map((p) => p.name));
    return tasks.filter((t) => names.has(t.project));
  }, [projects, tasks]);

  const accessibleMembers = useMemo(() => {
    const map = new Map<string, ProjectMember>();
    const add = (m: ProjectMember) => {
      const email = m.email?.trim().toLowerCase();
      if (!email) return;
      const name = m.name || email;
      if (!map.has(email)) {
        map.set(email, {
          ...m,
          email,
          name,
          profileImage: m.profileImage || m.profile_image || m.photoURL || '',
          initials: m.initials && m.initials !== '•' ? m.initials : getUserInitials(name),
          tone: m.tone || 'teal'
        });
      }
    };
    projects.forEach((project) => {
      add({
        firebaseUid: project.creatorFirebaseUid || undefined,
        email: project.creatorEmail,
        name: project.creatorName,
        initials: project.creatorInitials,
        tone: project.creatorTone || 'coral',
        profileImage: project.creatorProfileImage
      });
      project.acceptedMembers?.forEach(add);
    });
    if (projects.length && currentUser?.email) {
      add({
        firebaseUid: currentUser.uid,
        email: currentUser.email,
        name: currentUser.name,
        initials: currentUser.initials,
        tone: currentUser.tone,
        profileImage: currentUser.profileImage || currentUser.photoURL
      });
    }
    return [...map.values()];
  }, [projects, currentUser]);

  const unreadNotificationCount = useMemo(
    () => notifications.filter((n) => n.unread).length,
    [notifications]
  );

  const value: DashboardContextValue = {
    firebaseUser,
    authReady,
    currentUser,
    setCurrentUserProfile,
    signOutUser,
    currentTheme,
    isDarkThemeActive,
    currentAccent,
    collabSettings,
    applyTheme,
    applyAccent,
    toggleDarkLightMode,
    updateCollabSetting,
    activeView,
    switchView,
    isSidebarCollapsed,
    setSidebarCollapsed,
    isMobileSidebarOpen,
    setMobileSidebarOpen,
    activeDisplayMode,
    setActiveDisplayMode,
    activeFilter,
    setActiveFilter,
    activeSprintFilter,
    setActiveSprintFilter,
    searchQuery,
    setSearchQuery,
    activeWorkspaceTab,
    setActiveWorkspaceTab,
    projects,
    projectsLoaded,
    activeProject,
    isCurrentUserProjectCreator,
    loadProjectsFromAPI,
    tasks,
    accessibleTasks,
    setTasks,
    loadAllProjectTasks,
    moveTaskStatus,
    deleteTask,
    members,
    accessibleMembers,
    setMembers,
    loadProjectMembers,
    meetings,
    setMeetings,
    loadProjectMeetings,
    createProjectMeeting,
    deleteProjectMeeting,
    reminders,
    loadProjectCalendarData,
    createProjectReminder,
    notifications,
    unreadNotificationCount,
    loadNotificationsFromAPI,
    markNotificationRead,
    markAllNotificationsRead,
    clearAllNotifications,
    pushNotification,
    auditLogs,
    addAuditLog,
    teamResources,
    resourcesLoading,
    resourcesLoadFailed,
    loadProjectResources,
    upsertResourceLocal,
    removeProjectResource,
    announcements,
    addAnnouncement,
    reactToAnnouncement,
    teamPolls,
    createTeamPoll,
    submitPollVote,
    activePollPopup,
    dismissPollPopup,
    asideTaskId,
    openTaskDetails,
    closeTaskDetails,
    selectedTaskViewId,
    openFullTaskView,
    closeFullTaskView,
    activeModal,
    setActiveModal,
    closeModal,
    openPermissionNotice,
    confirmationState,
    showDashboardConfirmation,
    resolveConfirmation,
    activeMeteredMeeting,
    openMeteredMeetingModal,
    closeMeteredMeetingModal,
    setMeteredMeetingMinimized,
    toasts,
    showDashboardToast,
    dismissToast,
    pendingBrainstormBoardId,
    setPendingBrainstormBoardId,
    openBrainstormFromNotification,
    pendingMessageContext,
    openMessageContext,
    clearPendingMessageContext,
    messagesUnreadCount,
    setMessagesUnreadCount,
    stickyNotesRevision,
    bumpStickyNotesRevision,
    refreshAllDashboardData
  };

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
};

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error('useDashboard must be used within DashboardProvider');
  }
  return ctx;
}
