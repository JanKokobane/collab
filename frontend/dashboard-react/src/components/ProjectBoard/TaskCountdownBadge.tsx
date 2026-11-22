import React, { useEffect, useState } from 'react';
import type { TaskItem } from '../../types/dashboard';
import { createCx } from '../../utils/cx';
import { toLocalDateKey } from '../../utils/dateUtils';
import {
  formatTaskCountdown,
  getTaskDeadline,
  getTaskDueDateKey
} from './projectBoardConfig';
import styles from './ProjectBoard.module.css';

const cx = createCx(styles);

export interface TaskCountdownBadgeProps {
  task: TaskItem;
  variant?: 'badge' | 'inline';
}

export const TaskCountdownBadge: React.FC<TaskCountdownBadgeProps> = ({
  task,
  variant = 'badge'
}) => {
  const dueDateKey = getTaskDueDateKey(task);
  const deadline = getTaskDeadline(dueDateKey);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!deadline || task.status === 'Done') return;
    const isAlreadyOverdue = dueDateKey < toLocalDateKey() || deadline.getTime() <= Date.now();
    if (isAlreadyOverdue) return;
    const timer = window.setInterval(() => {
      setTick((prev) => prev + 1);
      if (deadline.getTime() <= Date.now()) {
        window.clearInterval(timer);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [deadline, dueDateKey, task.status]);

  if (variant === 'inline') {
    if (!deadline || task.status === 'Done') {
      if (task.status === 'Blocked') {
        return <span className={cx('board-overdue-inline')}>Blocked</span>;
      }
      return null;
    }

    const remaining = deadline.getTime() - Date.now();
    const isOverdue = dueDateKey < toLocalDateKey() || remaining <= 0;
    if (isOverdue) {
      return <span className={cx('board-overdue-inline')}>Overdue</span>;
    }
    if (task.status === 'Blocked') {
      return <span className={cx('board-overdue-inline')}>Blocked</span>;
    }
    if (remaining < 48 * 3600 * 1000) {
      return (
        <span className={cx('board-countdown-inline')} title="Time remaining until due date">
          {formatTaskCountdown(remaining)}
        </span>
      );
    }
    return null;
  }

  if (!deadline || task.status === 'Done') {
    const label =
      task.status === 'Done'
        ? 'FINISHED'
        : task.status === 'Blocked'
          ? 'BLOCKED'
          : task.tag || 'TASK';
    return <span className={cx('task-deadline-badge')}>{label}</span>;
  }

  const remaining = deadline.getTime() - Date.now();
  const isOverdue = dueDateKey < toLocalDateKey() || remaining <= 0;
  const label = isOverdue
    ? 'OVERDUE'
    : task.status === 'Blocked'
      ? 'BLOCKED'
      : formatTaskCountdown(remaining);

  return (
    <span className={cx('task-deadline-badge', isOverdue && 'is-expired')}>
      {label}
    </span>
  );
};
