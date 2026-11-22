import React, { useState } from 'react';
import { useDashboard } from '../../context/DashboardContext';
import { api } from '../../services/api';
import type { NotificationRecord } from '../../types/dashboard';
import { createCx } from '../../utils/cx';
import styles from './Notifications.module.css';

const cx = createCx(styles);

function hashString(input = ''): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export const Notifications: React.FC = () => {
  const {
    notifications,
    unreadNotificationCount,
    loadNotificationsFromAPI,
    loadProjectsFromAPI,
    loadProjectMembers,
    loadAllProjectTasks,
    loadProjectMeetings,
    loadProjectResources,
    markNotificationRead,
    markAllNotificationsRead,
    clearAllNotifications,
    openTaskDetails,
    openBrainstormFromNotification,
    switchView,
    showDashboardConfirmation,
    showDashboardToast
  } = useDashboard();

  const [busyInvitationId, setBusyInvitationId] = useState<string | null>(null);

  const handleMarkAllRead = async () => {
    if (unreadNotificationCount === 0) {
      showDashboardToast('All notifications are already read.', 'info');
      return;
    }
    const confirmed = await showDashboardConfirmation({
      eyebrow: 'Notifications',
      title: 'Mark all notifications as read?',
      message: `Mark all ${unreadNotificationCount} unread notification(s) as read?`,
      confirmLabel: 'Mark all read'
    });
    if (!confirmed) return;
    await markAllNotificationsRead();
  };

  const handleClearAll = async () => {
    if (notifications.length === 0) {
      showDashboardToast('There are no notifications to clear.', 'info');
      return;
    }
    const confirmed = await showDashboardConfirmation({
      eyebrow: 'Notifications',
      title: 'Clear all notifications?',
      message: 'This removes your notification history from the list.',
      confirmLabel: 'Clear all',
      destructive: true
    });
    if (!confirmed) return;
    await clearAllNotifications();
  };

  const handleInvitationAction = async (
    notif: NotificationRecord,
    action: 'accept' | 'decline'
  ) => {
    if (!notif.invitationId) return;
    setBusyInvitationId(notif.invitationId);
    try {
      const endpoint = action === 'accept' ? '/invitations/accept' : '/invitations/decline-in-app';
      const result = await api.post(endpoint, { invitationId: notif.invitationId });
      await markNotificationRead(notif.id);
      const updatedProjects = await loadProjectsFromAPI({ silent: true }).catch(() => []);
      await Promise.all([
        loadNotificationsFromAPI().catch(() => []),
        loadProjectMembers(updatedProjects).catch(() => []),
        loadAllProjectTasks(updatedProjects).catch(() => []),
        loadProjectMeetings(updatedProjects).catch(() => []),
        loadProjectResources(updatedProjects).catch(() => [])
      ]);

      if (action === 'accept') {
        const joinedProjectName =
          result?.data?.projectName ||
          updatedProjects.find((p) => p.projectId === result?.data?.projectId)?.name;
        showDashboardToast('Project invitation accepted.', 'success');
        if (joinedProjectName) {
          switchView(joinedProjectName);
        }
      } else {
        showDashboardToast('Invitation declined.', 'info');
      }
    } catch (error: any) {
      showDashboardToast(
        error?.message || `Unable to ${action} invitation right now.`,
        'error'
      );
    } finally {
      setBusyInvitationId(null);
    }
  };

  const handleOpenBrainstorm = (notif: NotificationRecord) => {
    if (notif.unread) {
      markNotificationRead(notif.id).catch(() => {});
    }
    if (notif.boardId) {
      openBrainstormFromNotification(notif.boardId);
    } else {
      switchView('Brainstorm');
    }
  };

  const handleOpenTask = (notif: NotificationRecord) => {
    if (notif.unread) {
      markNotificationRead(notif.id).catch(() => {});
    }
    if (notif.relatedTaskId) {
      openTaskDetails(notif.relatedTaskId);
    }
  };

  return (
    <div id="notifications-container" className={cx('settings-container')}>
      <div className="settings-card">
        <div className={`settings-card-header ${cx('notification-settings-header')}`}>
          <div>
            <h3>Notifications</h3>
            <p>
              Respond to project invitations, review workspace updates, and track unread activity.
            </p>
          </div>
          <div className={cx('notification-header-actions')}>
            <button
              type="button"
              className="outline-button"
              id="notifications-mark-all-read-btn"
              onClick={handleMarkAllRead}
            >
              Mark all read
            </button>
            <button
              type="button"
              className={`action-btn ${cx('notification-clear-button')}`}
              id="notifications-clear-all-btn"
              onClick={handleClearAll}
            >
              Clear all
            </button>
          </div>
        </div>

        <div className={cx('notification-settings-table-wrap')}>
          <table className={`${cx('notification-settings-table')} notification-settings-table`}>
            <thead>
              <tr>
                <th>Time</th>
                <th>Notification</th>
                <th>Details</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="notifications-table-body">
              {notifications.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }}>
                    All caught up! No notifications right now.
                  </td>
                </tr>
              ) : (
                notifications.map((notif) => {
                  const isInvite = Boolean(notif.invitationId);
                  const isPerson = isInvite || notif.type === 'meeting_invitation';
                  const toneIdx = hashString(notif.id || notif.title) % 6;
                  const isExpired =
                    isInvite &&
                    ((notif.invitationExpiresAt &&
                      new Date(notif.invitationExpiresAt).getTime() < Date.now()) ||
                      notif.invitationStatus === 'expired');
                  const inviteStatus = String(notif.invitationStatus || '').toLowerCase();
                  const isPendingInvite =
                    isInvite &&
                    !isExpired &&
                    (inviteStatus === '' || inviteStatus === 'pending');

                  return (
                    <tr
                      key={notif.id}
                      className={notif.unread ? cx('notification-row-unread') : undefined}
                    >
                      <td>{notif.time}</td>
                      <td>
                        <div className="settings-notification-title">
                          {isPerson ? (
                            <span
                              className={`${cx('notif-avatar')} notif-avatar ${cx('notification-person-avatar')} notification-person-avatar ${cx(`notification-user-tone-${toneIdx}`)}`}
                              aria-hidden="true"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                              </svg>
                            </span>
                          ) : (
                            <span className={`${cx('notif-avatar')} notif-avatar ${notif.toneClass || 'coral-bg'}`}>
                              {notif.avatar || '•'}
                            </span>
                          )}
                          <strong>{notif.title}</strong>
                        </div>
                      </td>
                      <td className={cx('notification-detail-cell')}>{notif.detail}</td>
                      <td>
                        <span
                          className={cx(
                            'notification-status',
                            notif.unread ? 'unread' : 'read'
                          )}
                        >
                          {notif.unread ? 'Unread' : 'Read'}
                        </span>
                      </td>
                      <td>
                        <div className={cx('notification-action-buttons')}>
                          {isPendingInvite ? (
                            <>
                              <button
                                type="button"
                                className="action-btn"
                                disabled={busyInvitationId === notif.invitationId}
                                onClick={() => handleInvitationAction(notif, 'accept')}
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                className="action-btn ghost-button"
                                disabled={busyInvitationId === notif.invitationId}
                                onClick={() => handleInvitationAction(notif, 'decline')}
                              >
                                Decline
                              </button>
                            </>
                          ) : isExpired ? (
                            <span className={cx('notification-read-label')}>Expired</span>
                          ) : notif.boardId ? (
                            <button
                              type="button"
                              className="action-btn"
                              onClick={() => handleOpenBrainstorm(notif)}
                            >
                              Open board
                            </button>
                          ) : notif.relatedTaskId ? (
                            <button
                              type="button"
                              className="action-btn"
                              onClick={() => handleOpenTask(notif)}
                            >
                              Open task
                            </button>
                          ) : notif.unread ? (
                            <button
                              type="button"
                              className="action-btn"
                              onClick={() => markNotificationRead(notif.id)}
                            >
                              Mark read
                            </button>
                          ) : (
                            <span className={cx('notification-read-label')}>Done</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
