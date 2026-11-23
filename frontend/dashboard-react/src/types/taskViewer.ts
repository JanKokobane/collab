import type {
  Project as DashboardProject,
  ProjectMember,
  TaskComment as DashboardTaskComment,
  TaskItem as DashboardTaskItem,
  TaskPriority as DashboardTaskPriority,
  TaskStatus as DashboardTaskStatus
} from './dashboard';

export type Project = DashboardProject;
export type { ProjectMember };
export type TaskComment = DashboardTaskComment;
export type TaskStatus = DashboardTaskStatus;
export type TaskPriority = DashboardTaskPriority;

export interface TaskAttachment {
  id?: string;
  name?: string;
  size?: string | number;
  uploadedBy?: string;
  uploadedAt?: string;
  kind?: string;
  [key: string]: unknown;
}

export interface TaskSubtask {
  id: string;
  title: string;
  done?: boolean;
  due?: string;
  assignees?: ProjectMember[];
}

export type BoardColumnStatus = 'Pending' | 'In Progress' | 'Completed' | 'Launched';

export interface BoardCardItem {
  id: string;
  title: string;
  status: BoardColumnStatus;
  assignees: ProjectMember[];
  due?: string;
  dueDateKey?: string;
  priority?: 'high' | 'normal' | 'low';
  progress?: number;
  overdue?: boolean;
}

export interface TaskActivity {
  id: string;
  text: string;
  time: string;
}

export type TaskItem = DashboardTaskItem & {
  assignees?: ProjectMember[];
  owner?: ProjectMember;
  subtasks?: TaskSubtask[];
  activity?: TaskActivity[];
  boardItems?: BoardCardItem[];
};
