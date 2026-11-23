import React from 'react';
import { X } from 'lucide-react';
import type { TaskItem } from '../../types/taskViewer';
import styles from './ProjectProgressAside.module.css';

export interface ProjectProgressAsideProps {
  task: TaskItem | null;
  onClose: () => void;
}

export const ProjectProgressAside: React.FC<ProjectProgressAsideProps> = ({ task, onClose }) => {
  if (!task) return null;

  return (
    <div
      className={styles['aside-backdrop']}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        className={styles['aside-panel']}
        role="dialog"
        aria-label="Project progress aside"
      >
        <div className={styles['aside-header']}>
          <div>
            <span className={styles['aside-eyebrow']}>
              Task Progress · {task.project}
            </span>
            <h2 className={styles['aside-title']}>{task.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close progress aside"
            className={styles['aside-close-btn']}
          >
            <X size={16} />
          </button>
        </div>

        <div className={styles['aside-body']}>
          <div className={styles['aside-row']}>
            <span className={styles['aside-label']}>Status</span>
            <span className={styles['aside-value']}>{task.status}</span>
          </div>
          <div className={styles['aside-row']}>
            <span className={styles['aside-label']}>Progress</span>
            <span className={styles['aside-value']}>{task.progress ?? 0}%</span>
          </div>
          <div className={styles['aside-row']}>
            <span className={styles['aside-label']}>Due Date</span>
            <span className={styles['aside-value']}>
              {task.due || 'Unscheduled'}
            </span>
          </div>
          <p className={styles['aside-description']}>
            {task.description || 'No description provided for this task yet.'}
          </p>
        </div>
      </aside>
    </div>
  );
};
