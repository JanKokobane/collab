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
}

export interface HomeTask {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  projectId: string;
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
  options: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH'; body?: unknown } = {},
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
  if (!payload?.data) {
    throw new HomeApiError('The server returned an invalid workspace response.', 502);
  }
  return payload.data;
}

export async function fetchHomeProjects(): Promise<HomeProject[]> {
  const data = await request<{ projects?: unknown[] }>('/projects');
  return (data.projects || []).flatMap((value) => {
    const row = asRecord(value);
    const id = asText(row.project_id);
    if (!id) return [];
    return [{ id, name: asText(row.name, 'Untitled project') }];
  });
}

export async function fetchHomeTasks(project: HomeProject): Promise<HomeTask[]> {
  const data = await request<{ tasks?: unknown[] }>(`/projects/${encodeURIComponent(project.id)}/tasks`);
  return (data.tasks || []).flatMap((value) => {
    const row = asRecord(value);
    const id = asText(row.task_id);
    if (!id) return [];
    return [{
      id,
      title: asText(row.title, 'Untitled task'),
      status: asText(row.status),
      dueDate: typeof row.due_date === 'string' ? row.due_date : null,
      projectId: project.id,
    }];
  });
}

export async function updateHomeTaskStatus(task: HomeTask, status: string): Promise<void> {
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
