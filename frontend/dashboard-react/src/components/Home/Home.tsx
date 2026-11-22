import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAvatarSource, useDashboard } from '../../context/DashboardContext';
import { api } from '../../services/api';
import type { MeetingRecord } from '../../types/dashboard';
import { createCx } from '../../utils/cx';
import { toLocalDateKey } from '../../utils/dateUtils';
import styles from './Home.module.css';

const cx = createCx(styles);

function getResourcePlatformLogo(url = '') {
  const lower = String(url || '').toLowerCase();
  if (lower.includes('figma.com')) {
    return {
      src: 'https://www.google.com/s2/favicons?domain=figma.com&sz=64',
      label: 'Figma logo'
    };
  }
  if (lower.includes('github.com')) {
    return {
      src: 'https://www.google.com/s2/favicons?domain=github.com&sz=64',
      label: 'GitHub logo'
    };
  }
  if (lower.includes('notion.so') || lower.includes('notion.site')) {
    return {
      src: 'https://www.google.com/s2/favicons?domain=notion.so&sz=64',
      label: 'Notion logo'
    };
  }
  if (lower.includes('meet.google.com')) {
    return {
      src: 'https://www.google.com/s2/favicons?domain=meet.google.com&sz=64',
      label: 'Google Meet logo'
    };
  }
  try {
    const parsed = new URL(url);
    return {
      src: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`,
      label: `${parsed.hostname} logo`
    };
  } catch {
    return { src: '/images/favicon.png', label: 'Resource logo' };
  }
}

function getSafeExternalUrl(url = ''): string | null {
  try {
    const parsed = new URL(String(url || '').trim(), window.location.origin);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

export const Home: React.FC = () => {
  const {
    currentUser,
    projects,
    accessibleTasks,
    meetings,
    accessibleMembers,
    unreadNotificationCount,
    teamResources,
    resourcesLoading,
    resourcesLoadFailed,
    switchView,
    setActiveWorkspaceTab,
    setActiveModal,
    openMeteredMeetingModal,
    removeProjectResource,
    activePollPopup,
    dismissPollPopup,
    submitPollVote,
    showDashboardToast,
    showDashboardConfirmation
  } = useDashboard();

  const [selectedScratchpadProjectId, setSelectedScratchpadProjectId] = useState<string>('');
  const [scratchpadContent, setScratchpadContent] = useState<string>('');
  const [scratchpadStatus, setScratchpadStatus] = useState<string>('● Synced');
  const [scratchpadStatusColor, setScratchpadStatusColor] = useState<string>('#10B981');
  const [scratchpadDisabled, setScratchpadDisabled] = useState<boolean>(true);
  const [selectedPollOption, setSelectedPollOption] = useState<string | null>(null);

  const scratchpadDirtyRef = useRef(false);
  const scratchpadSavingRef = useRef(false);
  const scratchpadServerContentRef = useRef('');
  const scratchpadDebounceRef = useRef<number | null>(null);
  const scratchpadTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync default scratchpad project selection
  useEffect(() => {
    if (!projects.length) {
      setSelectedScratchpadProjectId('');
      setScratchpadContent('');
      setScratchpadDisabled(true);
      setScratchpadStatus('● Choose a project');
      setScratchpadStatusColor('#71717A');
      return;
    }
    setSelectedScratchpadProjectId((prev) =>
      prev && projects.some((p) => p.projectId === prev) ? prev : projects[0].projectId
    );
  }, [projects]);

  const loadScratchpadForProject = useCallback(async (projectId: string, silent = false) => {
    if (!projectId) return;
    if (!silent) {
      setScratchpadStatus('● Loading...');
      setScratchpadStatusColor('#71717A');
      setScratchpadDisabled(true);
    }
    try {
      const response = await api.get(
        `/projects/${encodeURIComponent(projectId)}/scratchpad`
      );
      let nextContent = response?.data?.scratchpad?.content ?? '';
      const legacyKey = 'collab_workspace_scratchpad';
      const legacyContent = localStorage.getItem(legacyKey);
      if (
        !nextContent &&
        legacyContent &&
        legacyContent.trim() &&
        response?.data?.scratchpad?.updated_at == null
      ) {
        await api.put(`/projects/${encodeURIComponent(projectId)}/scratchpad`, {
          content: legacyContent
        });
        nextContent = legacyContent;
        localStorage.removeItem(legacyKey);
      }
      scratchpadServerContentRef.current = nextContent;
      if (!scratchpadDirtyRef.current) {
        setScratchpadContent(nextContent);
        setScratchpadStatus('● Synced');
        setScratchpadStatusColor('#10B981');
      }
      setScratchpadDisabled(false);
    } catch {
      if (!silent) {
        setScratchpadStatus('● Unavailable');
        setScratchpadStatusColor('#DC2626');
      }
    }
  }, []);

  useEffect(() => {
    if (!selectedScratchpadProjectId) return;
    scratchpadDirtyRef.current = false;
    loadScratchpadForProject(selectedScratchpadProjectId, false);
  }, [selectedScratchpadProjectId, loadScratchpadForProject]);

  // Background refresh every 5s when visible, clean, and unfocused
  useEffect(() => {
    if (!selectedScratchpadProjectId) return;
    const timer = window.setInterval(() => {
      if (
        document.hidden ||
        scratchpadDirtyRef.current ||
        scratchpadSavingRef.current ||
        document.activeElement === scratchpadTextareaRef.current
      ) {
        return;
      }
      loadScratchpadForProject(selectedScratchpadProjectId, true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [selectedScratchpadProjectId, loadScratchpadForProject]);

  const persistScratchpad = useCallback(async (projectId: string, content: string) => {
    if (!projectId) return;
    scratchpadSavingRef.current = true;
    setScratchpadStatus('● Saving...');
    setScratchpadStatusColor('#F5B800');
    try {
      const res = await api.put(
        `/projects/${encodeURIComponent(projectId)}/scratchpad`,
        { content }
      );
      const saved = res?.data?.scratchpad?.content ?? content;
      scratchpadServerContentRef.current = saved;
      scratchpadDirtyRef.current = false;
      setScratchpadStatus('● Synced');
      setScratchpadStatusColor('#10B981');
    } catch {
      setScratchpadStatus('● Save failed');
      setScratchpadStatusColor('#DC2626');
    } finally {
      scratchpadSavingRef.current = false;
    }
  }, []);

  const handleScratchpadChange = (value: string) => {
    setScratchpadContent(value);
    if (!selectedScratchpadProjectId) return;
    scratchpadDirtyRef.current = true;
    setScratchpadStatus('● Unsaved changes');
    setScratchpadStatusColor('#D97706');
    if (scratchpadDebounceRef.current) {
      window.clearTimeout(scratchpadDebounceRef.current);
    }
    const targetId = selectedScratchpadProjectId;
    scratchpadDebounceRef.current = window.setTimeout(() => {
      persistScratchpad(targetId, value);
    }, 600);
  };

  const appendScratchpadTemplate = (template: string) => {
    if (!selectedScratchpadProjectId || scratchpadDisabled) return;
    const prefix = scratchpadContent && !scratchpadContent.endsWith('\n') ? '\n' : '';
    const next = `${scratchpadContent}${prefix}${template}`;
    handleScratchpadChange(next);
    window.setTimeout(() => scratchpadTextareaRef.current?.focus(), 0);
  };

  const handleClearScratchpad = async () => {
    if (!selectedScratchpadProjectId || scratchpadDisabled) return;
    const confirmed = await showDashboardConfirmation({
      eyebrow: 'Team scratchpad',
      title: 'Clear shared scratchpad notes?',
      message: 'This clears the current project scratchpad for everyone on the project.',
      confirmLabel: 'Clear notes',
      destructive: true
    });
    if (!confirmed) return;
    if (scratchpadDebounceRef.current) {
      window.clearTimeout(scratchpadDebounceRef.current);
    }
    setScratchpadContent('');
    scratchpadDirtyRef.current = false;
    await persistScratchpad(selectedScratchpadProjectId, '');
  };

  // Dashboard metrics
  const firstName = useMemo(() => {
    const raw = (currentUser?.name || '').trim().split(/\s+/)[0] || '';
    if (!raw || raw.toLowerCase() === 'collaborator') return '';
    return raw;
  }, [currentUser?.name]);

  const metrics = useMemo(() => {
    const doneCount = accessibleTasks.filter((t) => t.status === 'Done').length;
    const openCount = accessibleTasks.filter((t) => t.status !== 'Done').length;
    const todayKey = toLocalDateKey();
    const weekLater = new Date();
    weekLater.setDate(weekLater.getDate() + 7);
    const weekKey = toLocalDateKey(weekLater);
    const dueThisWeekTasks = accessibleTasks.filter(
      (t) =>
        t.status !== 'Done' &&
        t.date &&
        t.date >= todayKey &&
        t.date <= weekKey
    );
    const activeMeetings = meetings.filter((m) => !m.isEnded);
    const completedMeetings = meetings.filter((m) => m.isEnded);

    return {
      doneCount,
      totalTasks: accessibleTasks.length,
      openCount,
      dueThisWeekCount: dueThisWeekTasks.length,
      duePendingCount: openCount,
      upcomingMeetingsCount: activeMeetings.length,
      meetingsSummary:
        activeMeetings.length > 0
          ? `${activeMeetings.length} scheduled`
          : completedMeetings.length > 0
            ? `${completedMeetings.length} completed`
            : 'Schedule next',
      memberCount: accessibleMembers.length,
      unreadCount: unreadNotificationCount
    };
  }, [accessibleTasks, meetings, accessibleMembers, unreadNotificationCount]);

  // Reset poll option when popup switches
  useEffect(() => {
    setSelectedPollOption(null);
  }, [activePollPopup?.id]);

  const handleJoinMeetingClick = (e: React.MouseEvent, meeting: MeetingRecord) => {
    e.stopPropagation();
    if (meeting.isEnded) return;
    openMeteredMeetingModal(meeting);
  };

  return (
    <div id="workspace-hub-container" className={cx('workspace-hub-container')}>
      <div className={cx('hub-dashboard-header')}>
        <div>
          <h1 id="hub-welcome-title">
            {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
          </h1>
          <p className={cx('hub-dashboard-intro')} id="hub-welcome-intro">
            Here&apos;s what needs your attention across your projects today.
          </p>
        </div>
      </div>

      <section className={cx('hub-metrics')} aria-label="Workspace overview metrics">
        <button
          type="button"
          className={`stat-card ${cx('hub-metric')}`}
          onClick={() => switchView(projects[0]?.name || 'My Tasks')}
        >
          <div className={cx('hub-metric-copy')}>
            <span className={cx('hub-metric-label')}>Tasks completed</span>
            <strong>{metrics.doneCount}</strong>
          </div>
          <span className={cx('hub-metric-detail')}>
            {metrics.doneCount} of {metrics.totalTasks}
          </span>
        </button>

        <button
          type="button"
          className={`stat-card ${cx('hub-metric')}`}
          onClick={() => switchView('Meetings')}
        >
          <div className={cx('hub-metric-copy')}>
            <span className={cx('hub-metric-label')}>Due this week</span>
            <strong>{metrics.dueThisWeekCount} tasks</strong>
          </div>
          <span className={cx('hub-metric-detail')}>{metrics.duePendingCount} pending</span>
        </button>

        <button
          type="button"
          className={`stat-card ${cx('hub-metric')}`}
          onClick={() => switchView('My Tasks')}
        >
          <div className={cx('hub-metric-copy')}>
            <span className={cx('hub-metric-label')}>Open tasks</span>
            <strong>{metrics.openCount}</strong>
          </div>
          <span className={cx('hub-metric-detail')}>
            Across {projects.length} project{projects.length === 1 ? '' : 's'}
          </span>
        </button>

        <button
          type="button"
          className={`stat-card ${cx('hub-metric')}`}
          onClick={() => switchView('Meetings')}
        >
          <div className={cx('hub-metric-copy')}>
            <span className={cx('hub-metric-label')}>Upcoming meetings</span>
            <strong>{metrics.upcomingMeetingsCount}</strong>
          </div>
          <span className={cx('hub-metric-detail')}>{metrics.meetingsSummary}</span>
        </button>

        <button
          type="button"
          className={`stat-card ${cx('hub-metric')}`}
          onClick={() => {
            setActiveWorkspaceTab('users');
            switchView('Admin Console');
          }}
        >
          <div className={cx('hub-metric-copy')}>
            <span className={cx('hub-metric-label')}>Team members</span>
            <strong>{metrics.memberCount}</strong>
          </div>
          <div className="avatar-stack">
            {accessibleMembers.slice(0, 3).map((member, idx) => {
              const src = getAvatarSource(member);
              return src ? (
                <img
                  key={member.email || member.uid || idx}
                  className="avatar"
                  src={src}
                  alt={member.name || 'Member'}
                  style={{ objectFit: 'cover' }}
                />
              ) : (
                <span
                  key={member.email || member.uid || idx}
                  className={`avatar ${member.tone || 'teal'}-bg`}
                >
                  {member.initials || 'TM'}
                </span>
              );
            })}
            {accessibleMembers.length > 3 && (
              <span className="avatar more-avatar">+{accessibleMembers.length - 3}</span>
            )}
          </div>
        </button>

        <button
          type="button"
          className={`stat-card ${cx('hub-metric')}`}
          onClick={() => switchView('Notifications')}
        >
          <div className={cx('hub-metric-copy')}>
            <span className={cx('hub-metric-label')}>Unread updates</span>
            <strong>{metrics.unreadCount}</strong>
          </div>
          <span className={cx('hub-metric-detail')}>
            {metrics.unreadCount ? 'Review alerts' : 'All caught up'}
          </span>
        </button>
      </section>

      <section
        className={`hub-card ${cx('upcoming-meetings-card')}`}
        aria-label="Upcoming meetings"
      >
        <div className="hub-card-header">
          <div>
            <h3>Upcoming Meetings</h3>
            <p className="hub-card-subtitle">
              Your upcoming project meetings. Click a meeting to review details on the calendar.
            </p>
          </div>
          <button
            type="button"
            className={`outline-button ${cx('upcoming-calendar-link')}`}
            id="hub-open-calendar-btn"
            onClick={() => switchView('Meetings')}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>Calendar</span>
          </button>
        </div>

        <div className="upcoming-meetings-table-wrap">
          <table className="upcoming-meetings-table">
            <thead>
              <tr>
                <th>Meeting</th>
                <th>Date</th>
                <th>Time</th>
                <th>Host</th>
                <th>Attendees</th>
                <th>Project</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody id="hub-upcoming-meetings-body">
              {meetings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="upcoming-meetings-empty">
                    No project meetings are scheduled yet. Open Meetings to schedule one.
                  </td>
                </tr>
              ) : (
                meetings.slice(0, 6).map((meeting) => {
                  const externalUrl = getSafeExternalUrl(meeting.location || '');
                  const hostSrc = String((meeting as any).hostProfileImage || '');
                  return (
                    <tr
                      key={meeting.id}
                      className={cx('upcoming-meeting-row')}
                      tabIndex={0}
                      onClick={() =>
                        setActiveModal({ type: 'daySchedule', dateKey: meeting.date })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setActiveModal({ type: 'daySchedule', dateKey: meeting.date });
                        }
                      }}
                    >
                      <td>
                        <div className="upcoming-meeting-title">{meeting.title}</div>
                      </td>
                      <td>{meeting.date}</td>
                      <td>{meeting.time}</td>
                      <td>
                        <div className="upcoming-meeting-host">
                          {hostSrc ? (
                            <img
                              className="avatar"
                              src={hostSrc}
                              alt={meeting.hostName || 'Host'}
                              style={{ width: 24, height: 24, objectFit: 'cover' }}
                            />
                          ) : (
                            <span
                              className="avatar coral-bg"
                              style={{ width: 24, height: 24, fontSize: 10 }}
                            >
                              {(meeting.hostName || 'H').slice(0, 2).toUpperCase()}
                            </span>
                          )}
                          <span>{meeting.hostName || 'Project member'}</span>
                        </div>
                      </td>
                      <td>
                        <div className="upcoming-meeting-attendees">
                          <div className="avatar-stack">
                            {(meeting.attendees || []).slice(0, 3).map((att, idx) => {
                              const attSrc = getAvatarSource(att);
                              return attSrc ? (
                                <img
                                  key={att.firebaseUid || idx}
                                  className="avatar"
                                  src={attSrc}
                                  alt={att.name || 'Attendee'}
                                  style={{ objectFit: 'cover' }}
                                />
                              ) : (
                                <span
                                  key={att.firebaseUid || idx}
                                  className={`avatar ${att.tone || 'teal'}-bg`}
                                >
                                  {att.initials || 'PM'}
                                </span>
                              );
                            })}
                          </div>
                          <span>{(meeting.attendees || []).length}</span>
                        </div>
                      </td>
                      <td>{meeting.projectName || 'Workspace'}</td>
                      <td>
                        {meeting.meetingUrl ? (
                          meeting.isEnded ? (
                            <span style={{ fontSize: 11, color: '#71717A', fontWeight: 600 }}>
                              Meeting ended
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="upcoming-meeting-join-btn"
                              onClick={(e) => handleJoinMeetingClick(e, meeting)}
                            >
                              Join meeting
                            </button>
                          )
                        ) : externalUrl ? (
                          <a
                            className="upcoming-meeting-location-link"
                            href={externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Open link ↗
                          </a>
                        ) : (
                          <span>{meeting.location || 'Online'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className={cx('workspace-hub-grid')}>
        <div className={cx('workspace-hub-col')}>
          <div className="hub-card">
            <div className="hub-card-header">
              <div>
                <h3>Pinned Collaboration Resources</h3>
                <p className="hub-card-subtitle">
                  Project links shared by your collaborators across the projects you belong to.
                </p>
              </div>
              <button
                className="outline-button"
                id="hub-add-resource-btn"
                type="button"
                onClick={() => {
                  if (!projects.length) {
                    showDashboardToast('Create or join a project before adding a resource.', 'info');
                    return;
                  }
                  setActiveModal({
                    type: 'createResource',
                    projectId: projects[0]?.projectId
                  });
                }}
              >
                + Add Resource
              </button>
            </div>

            <div className={cx('hub-resources-grid')} id="hub-resources-grid">
              {resourcesLoading ? (
                <p className={cx('hub-resources-empty')}>Loading project resources...</p>
              ) : resourcesLoadFailed ? (
                <p className={cx('hub-resources-empty')}>
                  We couldn&apos;t load shared project resources right now.
                </p>
              ) : teamResources.length === 0 ? (
                <p className={cx('hub-resources-empty')}>
                  No shared project resources yet. Add one to share links with your project team.
                </p>
              ) : (
                teamResources.map((res) => {
                  const logo = getResourcePlatformLogo(res.url);
                  const safeUrl = getSafeExternalUrl(res.url) || '#';
                  return (
                    <div key={res.id} className={cx('hub-resource-item')}>
                      <a
                        className={cx('hub-resource-link')}
                        href={safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img
                          className={cx('hub-res-logo')}
                          src={logo.src}
                          alt={logo.label}
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.src = '/images/favicon.png';
                          }}
                        />
                        <div className={cx('hub-res-content')}>
                          <div className={cx('hub-res-title-row')}>
                            <strong>{res.title}</strong>
                            <span className={cx('hub-res-tag')}>{res.category}</span>
                          </div>
                          <small>{res.projectName || 'Workspace'}</small>
                        </div>
                        <span className={cx('hub-res-arrow')} aria-hidden="true">
                          ↗
                        </span>
                      </a>
                      <div className={cx('hub-resource-actions')}>
                        <button
                          type="button"
                          className={cx('hub-resource-action')}
                          aria-label={`Edit ${res.title}`}
                          onClick={() =>
                            setActiveModal({
                              type: 'createResource',
                              projectId: res.projectId,
                              resourceId: res.id
                            })
                          }
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={cx('hub-resource-action', 'is-danger')}
                          aria-label={`Remove ${res.title}`}
                          onClick={() => removeProjectResource(res)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className={cx('workspace-hub-col')}>
          <div className="hub-card">
            <div className="hub-card-header">
              <div>
                <h3>Team Collaborative Scratchpad</h3>
                <p className="hub-card-subtitle">
                  Live shared notes, action points, and sprint agendas synced with collaborators on the selected project.
                </p>
              </div>
              <span
                className={cx('hub-save-status')}
                id="scratchpad-save-status"
                style={{ color: scratchpadStatusColor }}
              >
                {scratchpadStatus}
              </span>
            </div>

            <div className={cx('scratchpad-project-control')}>
              <label htmlFor="scratchpad-project-select">Project:</label>
              <select
                id="scratchpad-project-select"
                value={selectedScratchpadProjectId}
                disabled={!projects.length}
                onChange={(e) => setSelectedScratchpadProjectId(e.target.value)}
              >
                {projects.length === 0 ? (
                  <option value="">No projects yet</option>
                ) : (
                  projects.map((project) => (
                    <option key={project.projectId} value={project.projectId}>
                      {project.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className={cx('scratchpad-toolbar')}>
              <button
                type="button"
                className={cx('scratchpad-btn')}
                disabled={scratchpadDisabled}
                onClick={() => appendScratchpadTemplate('- [ ] ')}
              >
                + Checklist Item
              </button>
              <button
                type="button"
                className={cx('scratchpad-btn')}
                disabled={scratchpadDisabled}
                onClick={() => appendScratchpadTemplate('• ')}
              >
                + Bullet Point
              </button>
              <button
                type="button"
                className={cx('scratchpad-btn')}
                disabled={scratchpadDisabled}
                onClick={() => appendScratchpadTemplate('```\n// Note snippet\n```\n')}
              >
                + Code Block
              </button>
              <button
                type="button"
                className={cx('scratchpad-btn', 'danger')}
                id="clear-scratchpad-btn"
                disabled={scratchpadDisabled}
                onClick={handleClearScratchpad}
              >
                Clear Notes
              </button>
            </div>

            <textarea
              ref={scratchpadTextareaRef}
              id="team-scratchpad-textarea"
              className={cx('scratchpad-textarea')}
              placeholder="Write shared sprint notes, team agendas, or decisions here. Everyone on the selected project can view and edit them."
              disabled={scratchpadDisabled}
              value={scratchpadContent}
              onChange={(e) => handleScratchpadChange(e.target.value)}
            />
          </div>
        </div>
      </div>

      {activePollPopup && (
        <div className={cx('poll-popup-backdrop')} role="dialog" aria-modal="true">
          <div className={cx('poll-popup')}>
            <div className={cx('poll-popup-header')}>
              <span className={cx('poll-popup-eyebrow')}>TEAM ALIGNMENT POLL</span>
              <h3 className={cx('poll-title')}>{activePollPopup.title}</h3>
              <p className={cx('poll-desc')}>{activePollPopup.description}</p>
              <button
                type="button"
                className="close-modal"
                aria-label="Close poll"
                onClick={() => dismissPollPopup(activePollPopup)}
              >
                ×
              </button>
            </div>

            <div className={cx('poll-options-list')}>
              {(activePollPopup.options || []).map((opt: any) => {
                const total = activePollPopup.totalVotes || 0;
                const pct = total > 0 ? Math.round(((opt.votes || 0) / total) * 100) : 0;
                const isSelected = selectedPollOption === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={`${cx('poll-option-row', { selected: isSelected })} ${cx('poll-popup-option')}`}
                    onClick={() => setSelectedPollOption(opt.id)}
                  >
                    <div className={cx('poll-option-progress')} style={{ width: `${pct}%` }} />
                    <div className={cx('poll-option-content')}>
                      <span className={cx('poll-opt-radio')}>{isSelected ? '●' : '○'}</span>
                      <span className={cx('poll-opt-text')}>{opt.text || opt.label}</span>
                      <span className={cx('poll-opt-pct')}>
                        {opt.votes || 0} ({pct}%)
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className={`primary-button ${cx('poll-popup-vote')}`}
              disabled={!selectedPollOption}
              onClick={() => {
                if (!selectedPollOption) return;
                submitPollVote(activePollPopup.id, selectedPollOption);
                dismissPollPopup(activePollPopup);
              }}
            >
              Submit Vote
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
