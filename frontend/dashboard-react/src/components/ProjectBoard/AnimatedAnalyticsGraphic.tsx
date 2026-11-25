import React from 'react';
import styles from './AnimatedAnalyticsGraphic.module.css';

interface AnimatedAnalyticsGraphicProps {
  variant?: 'total' | 'pending' | 'in-progress' | 'complete' | 'due-soon' | 'overdue';
}

export const AnimatedAnalyticsGraphic: React.FC<AnimatedAnalyticsGraphicProps> = ({
  variant = 'total'
}) => (
  <div
    className={styles['analytics-graphic']}
    role="img"
    aria-label={
      variant === 'complete'
        ? 'Completed task icon'
        : variant === 'pending'
          ? 'Pending tasks folder'
          : variant === 'in-progress'
            ? 'In progress work history'
            : variant === 'due-soon'
              ? 'Due soon calendar'
              : variant === 'overdue'
                ? 'Overdue task calendar'
                : 'Total tasks icon'
    }
  >
    {variant === 'pending' ? (
      <svg className={styles['graph-icon']} viewBox="0 0 24 24" aria-hidden="true">
        <title>graph-bar</title>
        <path
          fill="currentColor"
          d="M6 23H2a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1"
          opacity=".25"
        />
        <path
          fill="currentColor"
          d="M14 23h-4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v20a1 1 0 0 1-1 1"
        />
        <path
          fill="currentColor"
          d="M22 23h-4a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1"
          opacity=".5"
        />
      </svg>
    ) : variant === 'in-progress' ? (
      <img className={styles['graph-icon']} src="/images/task-in-progress-icon.png" alt="" />
    ) : variant === 'complete' ? (
      <img
        className={`${styles['graph-icon']} ${styles['complete-icon']}`}
        src="/images/task-complete-icon.png"
        alt=""
      />
    ) : variant === 'due-soon' ? (
      <img className={styles['graph-icon']} src="/images/task-due-soon-icon.png" alt="" />
    ) : variant === 'overdue' ? (
      <svg className={styles['graph-icon']} viewBox="0 0 24 24" aria-hidden="true">
        <title>danger</title>
        <path
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="M12 9v5m0 7.41H5.94c-3.47 0-4.92-2.48-3.24-5.51l3.12-5.62L8.76 5c1.78-3.21 4.7-3.21 6.48 0l2.94 5.29l3.12 5.62c1.68 3.03.22 5.51-3.24 5.51H12zM11.995 17h.009"
        />
      </svg>
    ) : (
      <svg className={styles['graph-icon']} viewBox="0 0 20 20" aria-hidden="true">
        <title>task-list-add-20-filled</title>
        <path
          fill="currentColor"
          d="M5.854 3.354a.5.5 0 1 0-.708-.708L3.5 4.293l-.646-.647a.5.5 0 1 0-.708.708l1 1a.5.5 0 0 0 .708 0zM8.75 3.5a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5zm0 5a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5zm1.272 6.5a5.5 5.5 0 0 1 .353-1.5H8.75a.75.75 0 0 0 0 1.5zM5.854 8.854a.5.5 0 1 0-.708-.708L3.5 9.793l-.646-.647a.5.5 0 1 0-.708.708l1 1a.5.5 0 0 0 .708 0zm0 4.292a.5.5 0 0 1 0 .708l-2 2a.5.5 0 0 1-.708 0l-1-1a.5.5 0 0 1 .708-.708l.646.647l1.646-1.647a.5.5 0 0 1 .708 0M20 15.5a4.5 4.5 0 1 1-9 0a4.5 4.5 0 0 1 9 0m-4-2a.5.5 0 0 0-1 0V15h-1.5a.5.5 0 0 0 0 1H15v1.5a.5.5 0 0 0 1 0V16h1.5a.5.5 0 0 0 0-1H16z"
        />
      </svg>
    )}
  </div>
);
