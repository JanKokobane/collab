import type { TaskFilterKey, TaskItem, TaskStatus } from '../../types/dashboard';

export type BoardViewTab = 'overview' | 'list' | 'board' | 'calendar' | 'files';

export type DueDateFilterKey = 'all' | 'today' | 'week' | 'overdue' | 'unscheduled';
export type PriorityFilterKey = 'all' | 'high' | 'medium' | 'low';

export interface LocalProjectFile {
  id: string;
  name: string;
  size: string;
  uploadedBy: string;
  uploadedAt: string;
}

export const BOARD_COLUMNS: Array<{
  status: TaskStatus;
  dotTone: 'gray' | 'coral' | 'green' | 'blue';
  countId: string;
  listId: string;
  allowAdd?: boolean;
}> = [
  { status: 'To do', dotTone: 'gray', countId: 'count-todo', listId: 'todo-list', allowAdd: true },
  { status: 'In progress', dotTone: 'coral', countId: 'count-progress', listId: 'progress-list' },
  { status: 'Done', dotTone: 'green', countId: 'count-done', listId: 'done-list' },
  { status: 'Backlog', dotTone: 'blue', countId: 'count-backlog', listId: 'backlog-list' },
  { status: 'Blocked', dotTone: 'coral', countId: 'count-blocked', listId: 'blocked-list' }
];

export const FILTER_OPTIONS: Array<{ key: TaskFilterKey; label: string }> = [
  { key: 'all', label: 'All tasks' },
  { key: 'mine', label: 'My tasks' },
  { key: 'backlog', label: 'Backlog' },
  { key: 'todo', label: 'To do' },
  { key: 'progress', label: 'In progress' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'done', label: 'Completed (Done)' }
];

export const DUE_DATE_FILTER_OPTIONS: Array<{ key: DueDateFilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'unscheduled', label: 'No due date' }
];

export const PRIORITY_FILTER_OPTIONS: Array<{ key: PriorityFilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Normal' },
  { key: 'low', label: 'Low' }
];

export const MOVE_STATUSES: TaskStatus[] = ['To do', 'In progress', 'Done', 'Blocked', 'Backlog'];

export function getTaskDueDateKey(task: TaskItem): string {
  const dueDate = task.due_date || task.dueDate || task.date;
  return typeof dueDate === 'string' ? dueDate.slice(0, 10) : '';
}

export function getTaskDeadline(dueDate?: string | null): Date | null {
  if (!dueDate) return null;
  const deadline = new Date(`${String(dueDate).slice(0, 10)}T23:59:59`);
  return Number.isNaN(deadline.getTime()) ? null : deadline;
}

export function formatTaskCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${String(hours).padStart(2, '0')}h`;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
