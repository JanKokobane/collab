import React, { useMemo, useState } from 'react';
import { useDashboard } from '../../context/DashboardContext';
import type { MeetingRecord } from '../../types/dashboard';
import { createCx } from '../../utils/cx';
import { formatRelativeDate } from '../../utils/dateUtils';
import { ActualCalendarGrid } from '../CalendarGrid';
import styles from './Meetings.module.css';

const cx = createCx(styles);

function formatMeetingTime(time = '09:00'): string {
  const [hours = 9, minutes = 0] = String(time || '09:00')
    .split(':')
    .map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
}

function getMeetingStart(meeting: MeetingRecord): Date {
  return new Date(`${meeting.date}T${meeting.startTime || '09:00'}:00`);
}

function getMeetingEnd(meeting: MeetingRecord): Date {
  return new Date(`${meeting.date}T${meeting.endTime || '10:00'}:00`);
}

function getSafeMeetingUrl(value?: string | null): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

export const Meetings: React.FC = () => {
  const {
    meetings,
    projects,
    setActiveModal,
    openMeteredMeetingModal,
    deleteProjectMeeting,
    showDashboardConfirmation,
    showDashboardToast,
    addAuditLog
  } = useDashboard();

  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const { upcoming, past } = useMemo(() => {
    const now = new Date();
    const ordered = [...meetings].sort(
      (first, second) => getMeetingStart(first).getTime() - getMeetingStart(second).getTime()
    );
    return {
      upcoming: ordered.filter((meeting) => getMeetingEnd(meeting) >= now),
      past: ordered.filter((meeting) => getMeetingEnd(meeting) < now).reverse()
    };
  }, [meetings]);

  const handleCopyLink = async (meetingUrl: string) => {
    try {
      await navigator.clipboard.writeText(meetingUrl);
      showDashboardToast('Meeting link copied.', 'success');
    } catch (error) {
      console.error('Unable to copy meeting link:', error);
      showDashboardToast('Meeting link could not be copied.', 'error');
    }
  };

  const handleCancelMeeting = async (meeting: MeetingRecord) => {
    const confirmed = await showDashboardConfirmation({
      title: 'Cancel this meeting?',
      message: `"${meeting.title}" will be removed from the project schedule.`,
      confirmLabel: 'Cancel meeting',
      destructive: true
    });
    if (!confirmed) return;

    setCancellingId(meeting.id);
    try {
      await deleteProjectMeeting(meeting);
      addAuditLog('Project meeting canceled', `Meeting "${meeting.title}" canceled.`, 'trash');
      showDashboardToast('Meeting cancelled.', 'info');
    } catch (error: any) {
      showDashboardToast(error?.message || 'Unable to cancel this meeting.', 'error');
    } finally {
      setCancellingId(null);
    }
  };

  const renderMeetingCard = (meeting: MeetingRecord) => {
    const now = new Date();
    const start = getMeetingStart(meeting);
    const end = getMeetingEnd(meeting);
    const isLive = !meeting.isEnded && start <= now && end >= now;
    const isPast = end < now;
    const dateObj = new Date(`${meeting.date}T12:00:00`);
    const safeLocationUrl = getSafeMeetingUrl(meeting.location);
    const meetingUrl = getSafeMeetingUrl(meeting.meetingUrl || meeting.location);
    const attendeeCount = Array.isArray(meeting.attendees) ? meeting.attendees.length : 0;

    return (
      <article
        key={meeting.id}
        className={cx('meetings-page-card', { 'is-live': isLive })}
      >
        <div className={cx('meetings-page-date')}>
          <span>{new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(dateObj)}</span>
          <strong>{new Intl.DateTimeFormat(undefined, { day: 'numeric' }).format(dateObj)}</strong>
          <small>{new Intl.DateTimeFormat(undefined, { month: 'short' }).format(dateObj)}</small>
        </div>

        <div className={cx('meetings-page-details')}>
          <span className={cx('meetings-page-status', { 'is-live': isLive })}>
            {meeting.isEnded
              ? 'Meeting ended'
              : isLive
                ? 'In progress'
                : isPast
                  ? 'Past meeting'
                  : formatRelativeDate(meeting.date)}
          </span>
          <h3>{meeting.title}</h3>
          <div className={cx('meetings-page-meta')}>
            <span>
              {formatMeetingTime(meeting.startTime)} - {formatMeetingTime(meeting.endTime)}
            </span>
            <span className={cx('meetings-page-project')}>
              {meeting.projectName || 'Project meeting'}
            </span>
            <span>
              {attendeeCount} attendee{attendeeCount === 1 ? '' : 's'}
            </span>
          </div>
          {meeting.location && !safeLocationUrl && (
            <p className={cx('meetings-page-location')}>{meeting.location}</p>
          )}
          {meeting.notes && <p className={cx('meetings-page-notes')}>{meeting.notes}</p>}
        </div>

        <div className={cx('meetings-page-actions')}>
          {!isPast && !meeting.isEnded && (
            <button
              type="button"
              className={cx('meetings-page-join')}
              aria-label={`${isLive ? 'Join' : 'Open'} meeting: ${meeting.title}`}
              onClick={() => openMeteredMeetingModal(meeting)}
            >
              {isLive ? 'Join meeting' : 'Open meeting'}
            </button>
          )}

          {meetingUrl && !isPast && !meeting.isEnded && (
            <>
              <a
                className={cx('meetings-page-join')}
                href={meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open external link
              </a>
              <button
                type="button"
                className={cx('meetings-page-copy')}
                onClick={() => handleCopyLink(meetingUrl)}
              >
                Copy link
              </button>
            </>
          )}

          {meeting.canCancel && (
            <button
              type="button"
              className={cx('meetings-page-cancel')}
              disabled={cancellingId === meeting.id}
              onClick={() => handleCancelMeeting(meeting)}
            >
              {cancellingId === meeting.id ? 'Cancelling…' : 'Cancel'}
            </button>
          )}
        </div>
      </article>
    );
  };

  return (
    <section
      id="meetings-page-container"
      className={cx('meetings-page-container')}
      style={{ display: 'flex' }}
      aria-label="Meetings"
    >
      <header className={cx('meetings-page-header')}>
        <div className={cx('meetings-page-heading')}>
          <p className={cx('meetings-page-eyebrow')}>TEAM SCHEDULE</p>
          <p>Plan team syncs, keep meeting details together, and open the shared meeting link.</p>
        </div>
        <div className={cx('meetings-page-header-actions', 'admin-tabs-nav')}>
          <button
            type="button"
            className="outline-button-action"
            id="cal-add-reminder-btn"
            disabled={!projects.length}
            onClick={() => setActiveModal({ type: 'createReminder' })}
          >
            + Add Reminder
          </button>
          <button
            type="button"
            className="admin-tab-btn"
            disabled={!projects.length}
            onClick={() => setActiveModal({ type: 'scheduleMeeting', isInstant: true })}
          >
            Start instant meeting
          </button>
          <button
            type="button"
            className="admin-tab-btn active"
            disabled={!projects.length}
            onClick={() => setActiveModal({ type: 'scheduleMeeting', isInstant: false })}
          >
            Schedule meeting
          </button>
        </div>
      </header>

      <div id="calendar-container" className="calendar-container" style={{ display: 'flex' }}>
        <ActualCalendarGrid />
      </div>

      {!meetings.length && !projects.length ? (
        <p className={cx('meetings-page-empty')}>
          Join or create a project to schedule a team meeting.
        </p>
      ) : (
        <>
          <section className={cx('meetings-page-group')}>
            <div className={cx('meetings-page-group-heading')}>
              <h2>Upcoming meetings</h2>
              <span>{upcoming.length}</span>
            </div>
            {!upcoming.length ? (
              <p className={cx('meetings-page-empty')}>
                No upcoming meetings. Schedule one to get your team together.
              </p>
            ) : (
              <div className={cx('meetings-page-list')}>
                {upcoming.map(renderMeetingCard)}
              </div>
            )}
          </section>

          {past.length > 0 && (
            <section className={cx('meetings-page-group')}>
              <div className={cx('meetings-page-group-heading')}>
                <h2>Past meetings</h2>
                <span>{past.length}</span>
              </div>
              <div className={cx('meetings-page-list')}>{past.map(renderMeetingCard)}</div>
            </section>
          )}
        </>
      )}
    </section>
  );
};
