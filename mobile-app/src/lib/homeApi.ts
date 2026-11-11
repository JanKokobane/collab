import { firebaseAuth } from '@/lib/firebase';

const apiBaseUrl = (
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://collab-y7pb.onrender.com'
).replace(/\/+$/, '');

export class HomeApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'HomeApiError';
  }
}

export interface HomeProject {
  id: string;
  name: string;
  projectType?: string;
  timeSpan?: string;
  description?: string;
  color?: string;
  creatorFirebaseUid?: string;
  creatorName?: string;
  creatorEmail?: string;
  creatorProfileImage?: string | null;
  acceptedMembers?: HomeProjectMember[];
  sprints?: HomeProjectSprint[];
}

export interface HomeProjectMember {
  firebaseUid: string;
  name: string;
  email: string;
  role: string;
  profileImage: string | null;
}

export interface HomeProjectSprint {
  [key: string]: unknown;
  id?: string;
  name: string;
  status: string;
  assigneeFirebaseUid?: string;
  assigneeName?: string;
  assigneeEmail?: string;
  assigneeProfileImage?: string | null;
  submissionNote?: string;
  reviewComment?: string;
  submittedAt?: string;
}

export interface HomeTask {
  id: string;
  title: string;
  status: string;
  updatedAt?: string;
  dueDate: string | null;
  projectId: string;
  description?: string;
  category?: string;
  sprintName?: string;
  createdByFirebaseUid?: string;
  assigneeFirebaseUid?: string;
  assigneeName?: string;
  assigneeEmail?: string;
  assigneeProfileImage?: string | null;
  descriptionAttachments?: HomeTaskAttachment[];
  tags?: string[];
  priority?: string;
}

export interface HomeTaskAttachment {
  fileName: string;
  mediaType: string;
  size: number | null;
  isVoiceNote: boolean;
}

export interface HomeMeeting {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  endedAt: string | null;
  projectName: string;
}

export interface HomeMember {
  id: string;
  name: string;
  email: string;
  profileImage: string | null;
}

export interface HomeNotification {
  id: string;
  projectId: string | null;
  relatedTaskId: string | null;
  type: string;
  title: string;
  detail: string;
  avatar: string;
  toneClass: string;
  isRead: boolean;
  createdAt: string;
}

export interface HomeResource {
  id: string;
  title: string;
  url: string;
  category: string;
  projectName: string;
}

export interface HomeScratchpad {
  content: string;
  updatedAt: string | null;
}

export interface BrainstormBoardSummary {
  id: string;
  projectId: string;
  title: string;
  updatedAt: string;
}

export interface BrainstormReaction {
  emoji: string;
  firebaseUid: string;
}

export interface BrainstormNote {
  id: string;
  category: string;
  content: string;
  author: string;
  authorUid?: string | null;
  color: string;
  position: { x: number; y: number };
  reactions: BrainstormReaction[];
}

export interface BrainstormLink {
  id: string;
  from: string;
  to: string;
  type: string;
}

export interface BrainstormBoard extends BrainstormBoardSummary {
  createdByFirebaseUid: string;
  notes: BrainstormNote[];
  links: BrainstormLink[];
}

interface ApiEnvelope<T> {
  success?: boolean;
  message?: string;
  data?: T;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

async function request<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
    body?: unknown;
    allowRootPayload?: boolean;
  } = {},
): Promise<T> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new HomeApiError('Please sign in to load your workspace.', 401);

  const send = async (token: string) => {
    try {
      return await fetch(`${apiBaseUrl}/api${path}`, {
        method: options.method || 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch {
      throw new HomeApiError('Unable to connect. Check your internet connection and try again.', 0);
    }
  };

  let response = await send(await user.getIdToken());
  if (response.status === 401) response = await send(await user.getIdToken(true));
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || payload?.success === false) {
    throw new HomeApiError(
      payload?.message || 'Workspace data could not be retrieved.',
      response.status,
    );
  }
  if (options.allowRootPayload) {
    if (!payload || typeof payload !== 'object') {
      throw new HomeApiError('The server returned an invalid workspace response.', 502);
    }
    return payload as T;
  }
  if (!payload?.data) {
    throw new HomeApiError('The server returned an invalid workspace response.', 502);
  }
  return payload.data;
}

function parseHomeProject(value: unknown): HomeProject | null {
  const row = asRecord(value);
  const id = asText(row.project_id, asText(row.id));
  if (!id) return null;

  const acceptedMembers = Array.isArray(row.accepted_members)
    ? row.accepted_members.flatMap((memberValue) => {
      const member = asRecord(memberValue);
      const firebaseUid = asText(member.firebaseUid, asText(member.firebase_uid));
      if (!firebaseUid) return [];
      return [{
        firebaseUid,
        name: asText(member.name, asText(member.email, 'Project member')),
        email: asText(member.email),
        role: asText(member.role, 'Member'),
        profileImage: typeof member.profileImage === 'string'
          ? member.profileImage
          : typeof member.profile_image === 'string' ? member.profile_image : null,
      }];
    })
    : [];
  const sprints = Array.isArray(row.sprints)
    ? row.sprints.flatMap((sprintValue) => {
      const sprint = asRecord(sprintValue);
      const name = asText(sprint.name);
      if (!name) return [];
      return [{
        ...sprint,
        id: asText(sprint.id) || undefined,
        name,
        status: asText(sprint.status, 'Upcoming'),
        assigneeFirebaseUid: asText(sprint.assigneeFirebaseUid, asText(sprint.assignee_firebase_uid)) || undefined,
        assigneeName: asText(sprint.assigneeName, asText(sprint.assignee_name)) || undefined,
        assigneeEmail: asText(sprint.assigneeEmail, asText(sprint.assignee_email)) || undefined,
        submissionNote: asText(sprint.submissionNote, asText(sprint.submission_note)) || undefined,
        reviewComment: asText(sprint.reviewComment, asText(sprint.review_comment)) || undefined,
        submittedAt: asText(sprint.submittedAt, asText(sprint.submitted_at)) || undefined,
      }];
    })
    : [];

  return {
    id,
    name: asText(row.name, 'Untitled project'),
    projectType: asText(row.project_type, asText(row.projectType)),
    timeSpan: asText(row.time_span, asText(row.timeSpan)),
    description: asText(row.description),
    color: asText(row.color),
    creatorFirebaseUid: asText(row.creator_firebase_uid, asText(row.creatorFirebaseUid)),
    creatorName: asText(row.creator_name, asText(row.creatorName)),
    creatorEmail: asText(row.creator_email, asText(row.creatorEmail)),
    creatorProfileImage: typeof row.creator_profile_image === 'string'
      ? row.creator_profile_image
      : typeof row.creatorProfileImage === 'string' ? row.creatorProfileImage : null,
    acceptedMembers,
    sprints,
  };
}

export async function fetchHomeProjects(): Promise<HomeProject[]> {
  const data = await request<{ projects?: unknown[] }>('/projects');
  return (data.projects || []).flatMap((value) => {
    const project = parseHomeProject(value);
    return project ? [project] : [];
  });
}

export async function fetchHomeTasks(
  project: HomeProject,
  assignedToCurrentUser = false,
): Promise<HomeTask[]> {
  const assignedFilter = assignedToCurrentUser ? '?assignedToMe=true' : '';
  const data = await request<{ tasks?: unknown[] }>(
    `/projects/${encodeURIComponent(project.id)}/tasks${assignedFilter}`,
  );
  return (data.tasks || []).flatMap((value) => {
    const row = asRecord(value);
    const id = asText(row.task_id);
    if (!id) return [];
    const descriptionAttachments = Array.isArray(row.description_attachments)
      ? row.description_attachments.flatMap((attachmentValue) => {
        const attachment = asRecord(attachmentValue);
        const fileName = asText(attachment.fileName);
        if (!fileName) return [];
        return [{
          fileName,
          mediaType: asText(attachment.mediaType),
          size: typeof attachment.size === 'number' && Number.isFinite(attachment.size)
            ? attachment.size
            : null,
          isVoiceNote: attachment.is_voice_note === true || attachment.isVoiceNote === true,
        }];
      })
      : [];
    return [{
      id,
      title: asText(row.title, 'Untitled task'),
      status: asText(row.status),
      updatedAt: asText(row.updated_at) || undefined,
      dueDate: typeof row.due_date === 'string' ? row.due_date : null,
      projectId: project.id,
      description: asText(row.description),
      category: asText(row.category),
      tags: Array.isArray(row.tags)
        ? row.tags.filter((tag): tag is string => typeof tag === 'string')
        : [],
      sprintName: asText(row.sprint_name, asText(row.sprintName)),
      createdByFirebaseUid: asText(row.created_by_firebase_uid) || undefined,
      assigneeFirebaseUid: asText(row.assignee_firebase_uid) || undefined,
      assigneeName: asText(row.assignee_name) || undefined,
      assigneeEmail: asText(row.assignee_email) || undefined,
      assigneeProfileImage: typeof row.assignee_profile_image === 'string'
        ? row.assignee_profile_image
        : null,
      descriptionAttachments,
      priority: asText(row.priority),
    }];
  });
}

export interface HomeUserSearchResult {
  firebaseUid: string;
  name: string;
  email: string;
  profileImage: string | null;
}

export async function searchHomeUsers(queryText: string): Promise<HomeUserSearchResult[]> {
  const query = await request<{ users?: unknown[] }>(
    `/users/search?q=${encodeURIComponent(queryText.trim())}`,
    { allowRootPayload: true },
  );
  return (query.users || []).flatMap((value) => {
    const row = asRecord(value);
    const firebaseUid = asText(row.firebase_uid, asText(row.firebaseUid));
    const email = asText(row.email);
    if (!firebaseUid || !email) return [];
    return [{
      firebaseUid,
      email,
      name: asText(row.name, email),
      profileImage: typeof row.profile_image === 'string'
        ? row.profile_image
        : typeof row.profileImage === 'string' ? row.profileImage : null,
    }];
  });
}

export async function createHomeProject(input: {
  name: string;
  projectType: string;
  timeSpan: string;
  description: string;
}): Promise<HomeProject> {
  const timestamp = Date.now();
  const data = await request<{ project?: unknown }>('/projects', {
    method: 'POST',
    body: {
      project_id: `p_${timestamp}`,
      name: input.name.trim(),
      project_type: input.projectType,
      time_span: input.timeSpan,
      description: input.description.trim(),
      color: 'coral',
      invited_members: [],
      sprints: [
        { id: `s_${timestamp}_1`, name: 'Sprint 1: Kickoff & Scoping', status: 'Active' },
        { id: `s_${timestamp}_2`, name: 'Sprint 2: Implementation', status: 'Upcoming' },
      ],
    },
  });
  const project = parseHomeProject(data.project);
  if (!project) throw new HomeApiError('The server did not return the created project.', 502);
  return project;
}

export async function sendHomeProjectInvitation(
  projectId: string,
  invitee: HomeUserSearchResult,
  role: string,
): Promise<void> {
  await request<{ invitations?: unknown[] }>('/invitations', {
    method: 'POST',
    body: {
      projectId,
      firebaseUid: invitee.firebaseUid,
      firebaseUids: [invitee.firebaseUid],
      users: [{ firebaseUid: invitee.firebaseUid, email: invitee.email }],
      emails: [invitee.email],
      role,
      inviterAvatar: firebaseAuth.currentUser?.photoURL || '',
    },
  });
}

export async function updateHomeProjectSprints(
  project: HomeProject,
  sprints: HomeProjectSprint[],
): Promise<HomeProject> {
  const data = await request<{ project?: unknown }>(
    `/projects/${encodeURIComponent(project.id)}`,
    {
      method: 'PUT',
      body: { sprints },
    },
  );
  const updatedProject = parseHomeProject(data.project);
  if (!updatedProject) {
    throw new HomeApiError('The server did not return the updated project.', 502);
  }
  return updatedProject;
}

export async function createHomeTask(input: {
  projectId: string;
  title: string;
  description: string;
  category: string;
  sprintName: string;
  assigneeFirebaseUid: string;
  priority: string;
  dueDate: string | null;
}): Promise<void> {
  await request<{ taskId?: string }>(
    `/projects/${encodeURIComponent(input.projectId)}/tasks`,
    {
      method: 'POST',
      body: {
        title: input.title.trim(),
        description: input.description.trim(),
        category: input.category,
        sprintName: input.sprintName,
        assigneeFirebaseUid: input.assigneeFirebaseUid,
        status: 'To do',
        priority: input.priority,
        startDate: null,
        dueDate: input.dueDate,
      },
    },
  );
}

export async function submitHomeSprint(
  projectId: string,
  sprintName: string,
  note: string,
): Promise<HomeProjectSprint[]> {
  const data = await request<{ project?: { sprints?: unknown[] } }>(
    `/projects/${encodeURIComponent(projectId)}/sprints/${encodeURIComponent(sprintName)}/submit`,
    { method: 'POST', body: { submissionNote: note.trim() } },
  );
  const project = parseHomeProject({ project_id: projectId, sprints: data.project?.sprints });
  return project?.sprints || [];
}

export async function reviewHomeSprint(
  projectId: string,
  sprintName: string,
  decision: 'accept' | 'request_changes',
  comment: string,
): Promise<HomeProjectSprint[]> {
  const data = await request<{ project?: { sprints?: unknown[] } }>(
    `/projects/${encodeURIComponent(projectId)}/sprints/${encodeURIComponent(sprintName)}/review`,
    {
      method: 'POST',
      body: { decision, comment: comment.trim() },
    },
  );
  const project = parseHomeProject({ project_id: projectId, sprints: data.project?.sprints });
  return project?.sprints || [];
}

export async function updateHomeTaskStatus(
  task: Pick<HomeTask, 'id' | 'projectId'>,
  status: string,
): Promise<void> {
  await request<{ taskId?: string; status?: string }>(
    `/projects/${encodeURIComponent(task.projectId)}/tasks/${encodeURIComponent(task.id)}/status`,
    { method: 'PATCH', body: { status } },
  );
}

export async function fetchHomeMeetings(project: HomeProject): Promise<HomeMeeting[]> {
  const data = await request<{ meetings?: unknown[] }>(
    `/projects/${encodeURIComponent(project.id)}/meetings`,
  );
  return (data.meetings || []).flatMap((value) => {
    const row = asRecord(value);
    const id = asText(row.meeting_id);
    const date = asText(row.meeting_date);
    if (!id || !date) return [];
    return [{
      id,
      title: asText(row.title, 'Untitled meeting'),
      date,
      startTime: asText(row.start_time),
      endTime: asText(row.end_time),
      endedAt: typeof row.ended_at === 'string' ? row.ended_at : null,
      projectName: project.name,
    }];
  });
}

export async function fetchHomeResources(project: HomeProject): Promise<HomeResource[]> {
  const data = await request<{ resources?: unknown[] }>(
    `/projects/${encodeURIComponent(project.id)}/resources`,
  );
  return (data.resources || []).flatMap((value) => {
    const row = asRecord(value);
    const id = asText(row.resource_id);
    if (!id) return [];
    return [{
      id,
      title: asText(row.title, 'Resource'),
      url: asText(row.target_url),
      category: asText(row.category, 'Other'),
      projectName: project.name,
    }];
  });
}

export async function fetchHomeMembers(): Promise<HomeMember[]> {
  const data = await request<{ members?: unknown[] }>('/users/members');
  const members = (data.members || []).flatMap((value) => {
    const row = asRecord(value);
    const id = asText(row.firebase_uid);
    if (!id || asText(row.status).toLowerCase() !== 'active') return [];
    return [{
      id,
      name: asText(row.name, asText(row.email, 'Team member')),
      email: asText(row.email),
      profileImage: typeof row.profile_image === 'string' ? row.profile_image : null,
    }];
  });
  return [...new Map(members.map((member) => [member.id, member])).values()];
}

export async function fetchHomeNotifications(): Promise<HomeNotification[]> {
  const data = await request<{ notifications?: unknown[] }>('/notifications');
  return (data.notifications || []).flatMap((value) => {
    const row = asRecord(value);
    const id = String(row.id ?? '');
    if (!id) return [];
    return [{
      id,
      projectId: typeof row.project_id === 'string' ? row.project_id : null,
      relatedTaskId: typeof row.related_task_id === 'string' ? row.related_task_id : null,
      type: asText(row.type, 'update'),
      title: asText(row.title, 'Notification'),
      detail: asText(row.detail),
      avatar: asText(row.avatar),
      toneClass: asText(row.tone_class),
      isRead: Boolean(row.is_read),
      createdAt: asText(row.created_at),
    }];
  });
}

export async function markHomeNotificationRead(notificationId: string): Promise<void> {
  await request<{ notification?: unknown }>(
    `/notifications/${encodeURIComponent(notificationId)}/read`,
    { method: 'PATCH' },
  );
}

export async function markAllHomeNotificationsRead(): Promise<void> {
  await request<{ updatedCount?: number }>('/notifications/read-all', { method: 'PATCH' });
}

export async function fetchHomeScratchpad(project: HomeProject): Promise<HomeScratchpad> {
  const data = await request<{ scratchpad?: unknown }>(
    `/projects/${encodeURIComponent(project.id)}/scratchpad`,
  );
  const row = asRecord(data.scratchpad);
  return {
    content: asText(row.content),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  };
}

export async function saveHomeScratchpad(
  project: HomeProject,
  content: string,
): Promise<HomeScratchpad> {
  const data = await request<{ scratchpad?: unknown }>(
    `/projects/${encodeURIComponent(project.id)}/scratchpad`,
    { method: 'PUT', body: { content } },
  );
  const row = asRecord(data.scratchpad);
  return {
    content: asText(row.content, content),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  };
}

export async function fetchBrainstormBoards(project: HomeProject): Promise<BrainstormBoardSummary[]> {
  const data = await request<{ boards?: unknown[] }>(
    `/projects/${encodeURIComponent(project.id)}/brainstorm-boards`,
  );
  return (data.boards || []).flatMap((value) => {
    const row = asRecord(value);
    const id = asText(row.board_id);
    if (!id) return [];
    return [{
      id,
      projectId: asText(row.project_id, project.id),
      title: asText(row.title, 'Untitled board'),
      updatedAt: asText(row.updated_at),
    }];
  });
}

export async function fetchBrainstormBoard(boardId: string): Promise<BrainstormBoard> {
  const data = await request<{ board?: unknown }>(
    `/projects/brainstorm-boards/${encodeURIComponent(boardId)}`,
  );
  const row = asRecord(data.board);
  const boardData = asRecord(row.board_data);
  const id = asText(row.board_id);
  if (!id) throw new HomeApiError('The server returned an invalid brainstorm board.', 502);

  const notes = (Array.isArray(boardData.notes) ? boardData.notes : []).flatMap((value) => {
    const note = asRecord(value);
    const noteId = asText(note.id);
    const position = asRecord(note.position);
    if (!noteId || typeof position.x !== 'number' || typeof position.y !== 'number') return [];
    return [{
      id: noteId,
      category: asText(note.category, 'Ideas'),
      content: asText(note.content),
      author: asText(note.author),
      authorUid: typeof note.authorUid === 'string' ? note.authorUid : null,
      color: asText(note.color, 'yellow'),
      position: { x: position.x, y: position.y },
      reactions: (Array.isArray(note.reactions) ? note.reactions : []).flatMap((item) => {
        const reaction = asRecord(item);
        const emoji = asText(reaction.emoji);
        const firebaseUid = asText(reaction.firebaseUid);
        return emoji && firebaseUid ? [{ emoji, firebaseUid }] : [];
      }),
    }];
  });
  const links = (Array.isArray(boardData.links) ? boardData.links : []).flatMap((value) => {
    const link = asRecord(value);
    const linkId = asText(link.id);
    const from = asText(link.from);
    const to = asText(link.to);
    if (!linkId || !from || !to) return [];
    return [{ id: linkId, from, to, type: asText(link.type, 'related') }];
  });

  return {
    id,
    projectId: asText(row.project_id),
    title: asText(row.title, 'Untitled board'),
    updatedAt: asText(row.updated_at),
    createdByFirebaseUid: asText(row.created_by_firebase_uid),
    notes,
    links,
  };
}

export async function createBrainstormBoard(project: HomeProject, title: string): Promise<string> {
  const data = await request<{ board?: unknown }>(
    `/projects/${encodeURIComponent(project.id)}/brainstorm-boards`,
    { method: 'POST', body: { title, memberFirebaseUids: [] } },
  );
  const board = asRecord(data.board);
  const id = asText(board.board_id);
  if (!id) throw new HomeApiError('The server did not return the created brainstorm board.', 502);
  return id;
}

export async function saveBrainstormBoard(
  boardId: string,
  boardData: { notes: BrainstormNote[]; links: BrainstormLink[] },
): Promise<void> {
  await request<{ board?: unknown }>(
    `/projects/brainstorm-boards/${encodeURIComponent(boardId)}`,
    { method: 'PUT', body: { boardData } },
  );
}

export async function toggleBrainstormReaction(
  boardId: string,
  noteId: string,
  emoji: string,
): Promise<BrainstormReaction[]> {
  const data = await request<{ note?: unknown }>(
    `/projects/brainstorm-boards/${encodeURIComponent(boardId)}/notes/${encodeURIComponent(noteId)}/reactions`,
    { method: 'POST', body: { emoji } },
  );
  const note = asRecord(data.note);
  return (Array.isArray(note.reactions) ? note.reactions : []).flatMap((value) => {
    const reaction = asRecord(value);
    const reactionEmoji = asText(reaction.emoji);
    const firebaseUid = asText(reaction.firebaseUid);
    return reactionEmoji && firebaseUid ? [{ emoji: reactionEmoji, firebaseUid }] : [];
  });
}
