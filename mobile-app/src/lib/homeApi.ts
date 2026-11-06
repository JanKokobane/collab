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
  isRead: boolean;
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
  options: { method?: 'GET' | 'PUT'; body?: unknown } = {},
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
    return [{ id, isRead: Boolean(row.is_read) }];
  });
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
