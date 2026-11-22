import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getAvatarSource,
  getSprintMembers,
  getUserInitials,
  useDashboard
} from '../../context/DashboardContext';
import { api } from '../../services/api';
import { firebaseAuth } from '../../services/firebase';
import type {
  MeetingRecord,
  Project,
  ResourceItem,
  WorkspaceConsoleTab
} from '../../types/dashboard';
import { createCx } from '../../utils/cx';
import styles from './WorkspaceConsole.module.css';

const cx = createCx(styles);

interface ConsoleMemberRecord {
  id: string;
  firebaseUid: string;
  projectId: string;
  projectName: string;
  projectCreatorFirebaseUid?: string;
  invitationId?: string;
  name: string;
  email: string;
  role?: string;
  profileImage?: string;
  initials: string;
  tone: string;
  status: string;
  [key: string]: unknown;
}

function formatDurationInMonths(weeks: number): string {
  if (!Number.isFinite(weeks) || weeks <= 0) return 'Ongoing';
  if (weeks < 4) return 'Less than 1 Month';
  const months = Math.round(weeks / 4);
  return `${months} ${months === 1 ? 'Month' : 'Months'}`;
}

function formatProjectTimeSpanForDisplay(value?: string): string {
  const timeSpan = String(value || '').trim();
  const monthMatch = timeSpan.match(/\(about\s+([^;]+);/i);
  if (monthMatch) return monthMatch[1].trim();
  const weekMatch = timeSpan.match(/^(\d+(?:\.\d+)?)\s+weeks?\b/i);
  if (weekMatch) return formatDurationInMonths(Number(weekMatch[1]));
  return timeSpan || 'Ongoing';
}

function taskDateLabel(value?: string | null): string {
  if (!value) return '—';
  const dateKey = String(value).slice(0, 10);
  const date = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? dateKey
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function renumberSprintName(name: string, number: number): string {
  const title = String(name || 'Sprint')
    .replace(/^Sprint\s+\d+\s*:\s*/i, '')
    .trim();
  return `Sprint ${number}: ${title || 'Untitled'}`;
}

function getSafeExternalUrl(url?: string | null): string | null {
  const raw = String(url || '').trim();
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

const BRAND_LOGOS = [
  { domains: ['figma.com'], hint: 'figma', logo: 'https://cdn.simpleicons.org/figma/F24E1E' },
  { domains: ['github.com'], hint: 'github', logo: 'https://cdn.simpleicons.org/github/181717' },
  { domains: ['notion.so', 'notion.site'], hint: 'notion', logo: 'https://cdn.simpleicons.org/notion/000000' },
  { domains: ['meet.google.com'], hint: 'googlemeet', logo: 'https://cdn.simpleicons.org/googlemeet/00897B' }
];

function getResourcePlatformInfo(url = '', title = '') {
  let hostname = '';
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    hostname = '';
  }
  const identity = `${hostname} ${url} ${title}`.toLowerCase();
  const brand = BRAND_LOGOS.find(
    (candidate) =>
      candidate.domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`)) ||
      identity.includes(candidate.hint)
  );
  const isLocalHost =
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '::1';
  const src =
    brand?.logo ||
    (isLocalHost
      ? '/images/favicon.png'
      : `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`);
  return { src, label: `${title || hostname || 'Resource'} logo`, hostname };
}

export const WorkspaceConsole: React.FC = () => {
  const {
    activeWorkspaceTab,
    setActiveWorkspaceTab,
    projects,
    loadProjectsFromAPI,
    tasks,
    loadAllProjectTasks,
    deleteTask,
    meetings,
    loadProjectMeetings,
    deleteProjectMeeting,
    openMeteredMeetingModal,
    teamResources,
    resourcesLoading,
    resourcesLoadFailed,
    loadProjectResources,
    removeProjectResource,
    currentUser,
    switchView,
    setActiveModal,
    showDashboardConfirmation,
    showDashboardToast,
    addAuditLog,
    pushNotification
  } = useDashboard();

  const [selectedMembersProjectId, setSelectedMembersProjectId] = useState<string>('all');
  const [consoleMembers, setConsoleMembers] = useState<ConsoleMemberRecord[]>([]);
  const [membersError, setMembersError] = useState<string>('');
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [removingProjectId, setRemovingProjectId] = useState<string | null>(null);
  const [removingSprintKey, setRemovingSprintKey] = useState<string | null>(null);
  const [cancellingMeetingId, setCancellingMeetingId] = useState<string | null>(null);
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set());
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const actionsWrapRef = useRef<HTMLDivElement>(null);
  const currentUid = firebaseAuth.currentUser?.uid || currentUser?.uid || '';

  const accessibleProjects = useMemo(() => {
    const map = new Map<string, Project>();
    projects.forEach((p) => {
      if (p.projectId && p.name) map.set(p.projectId, p);
    });
    return [...map.values()];
  }, [projects]);

  const ownedProjects = useMemo(
    () => accessibleProjects.filter((p) => p.creatorFirebaseUid === currentUid),
    [accessibleProjects, currentUid]
  );

  // Close project dropdowns on outside click / Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionsWrapRef.current && !actionsWrapRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenDropdown(null);
    };
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const fetchConsoleMembers = useCallback(async () => {
    try {
      setMembersError('');
      const response = await api.get('/users/members');
      const records = response?.data?.members;
      if (!Array.isArray(records)) {
        throw new Error('The server returned an invalid team members response.');
      }
      setConsoleMembers(
        records.map((member: any) => ({
          ...member,
          id: `${member.project_id}:${member.firebase_uid}`,
          firebaseUid: member.firebase_uid,
          projectId: member.project_id,
          projectName: member.project_name,
          projectCreatorFirebaseUid: member.creator_firebase_uid,
          invitationId: member.invitation_id,
          profileImage:
            member.profile_image ||
            (member.firebase_uid === currentUser.uid
              ? currentUser.profileImage || currentUser.photoURL || ''
              : ''),
          initials: member.name ? getUserInitials(member.name) : '•',
          tone: 'coral',
          status: member.status || 'Active'
        }))
      );
    } catch (error: any) {
      setMembersError(error?.message || 'Team members could not be loaded.');
    }
  }, [currentUser.uid, currentUser.profileImage, currentUser.photoURL]);

  // Refresh data on console mount / tab switch
  useEffect(() => {
    fetchConsoleMembers().catch(() => {});
    loadAllProjectTasks().catch(() => {});
    loadProjectMeetings().catch(() => {});
    loadProjectResources().catch(() => {});
  }, [fetchConsoleMembers, loadAllProjectTasks, loadProjectMeetings, loadProjectResources]);

  useEffect(() => {
    if (
      selectedMembersProjectId !== 'all' &&
      !accessibleProjects.some((p) => p.projectId === selectedMembersProjectId)
    ) {
      setSelectedMembersProjectId('all');
    }
  }, [accessibleProjects, selectedMembersProjectId]);

  const visibleMembers = useMemo(() => {
    if (selectedMembersProjectId && selectedMembersProjectId !== 'all') {
      return consoleMembers.filter((m) => m.projectId === selectedMembersProjectId);
    }
    const allowedIds = new Set(accessibleProjects.map((p) => p.projectId));
    return consoleMembers.filter((m) => allowedIds.has(m.projectId));
  }, [consoleMembers, selectedMembersProjectId, accessibleProjects]);

  const uniqueMemberCount = useMemo(
    () => new Set(visibleMembers.map((m) => m.firebaseUid).filter(Boolean)).size,
    [visibleMembers]
  );

  const selectedProjectIsOwned = ownedProjects.some(
    (p) => p.projectId === selectedMembersProjectId
  );
  const showMembersInviteBtn =
    selectedMembersProjectId === 'all' ? ownedProjects.length > 0 : selectedProjectIsOwned;

  const handleRemoveProject = async (project: Project) => {
    const confirmed = await showDashboardConfirmation({
      title: 'Delete project?',
      message: `Are you sure you want to permanently delete "${project.name}"? This will remove the project and its related project access.`,
      confirmLabel: 'Delete project',
      destructive: true
    });
    if (!confirmed) return;

    setRemovingProjectId(project.projectId);
    try {
      await api.delete(`/projects/${encodeURIComponent(project.projectId || project.id)}`);
      await loadProjectsFromAPI({ silent: true });
      addAuditLog(
        'Project deleted',
        `${currentUser.name} removed project "${project.name}".`,
        'trash'
      );
      pushNotification('Project Removed', `"${project.name}" was deleted.`, '🗑️', 'coral-bg');
      showDashboardToast(`"${project.name}" was deleted.`, 'success');
    } catch (error: any) {
      pushNotification(
        'Project Removal Failed',
        error?.message || `Unable to remove "${project.name}".`,
        '⚠️',
        'coral-bg'
      );
    } finally {
      setRemovingProjectId(null);
      setOpenDropdown(null);
    }
  };

  const handleRemoveMember = async (member: ConsoleMemberRecord) => {
    if (!member.invitationId) return;
    const isPendingInvitation = member.status === 'Pending';
    const confirmed = await showDashboardConfirmation({
      title: isPendingInvitation ? 'Revoke project invitation?' : 'Remove project member?',
      message: isPendingInvitation
        ? `Revoke the invitation for ${member.name} to join ${member.projectName}?`
        : `Remove ${member.name} from ${member.projectName}?`,
      confirmLabel: isPendingInvitation ? 'Revoke invitation' : 'Remove member',
      destructive: true
    });
    if (!confirmed) return;

    setRemovingMemberId(member.id);
    try {
      await api.delete(
        `/projects/${encodeURIComponent(member.projectId)}/invitations/${encodeURIComponent(
          member.invitationId
        )}`
      );
      await fetchConsoleMembers();
      const action = isPendingInvitation ? 'Project invitation revoked' : 'Project member removed';
      const detail = isPendingInvitation
        ? `The invitation for ${member.name} to "${member.projectName}" was revoked.`
        : `${member.name} was removed from "${member.projectName}".`;
      addAuditLog(action, detail, 'trash');
      showDashboardToast(
        isPendingInvitation
          ? `The invitation for ${member.name} was revoked.`
          : `${member.name} was removed from ${member.projectName}.`,
        'success'
      );
    } catch (error: any) {
      pushNotification(
        'Member Removal Failed',
        error?.message || 'The project member could not be removed.',
        '⚠️',
        'coral-bg'
      );
    } finally {
      setRemovingMemberId(null);
    }
  };

  const handleRemoveSprint = async (project: Project, sprintIndex: number) => {
    const sprints = Array.isArray(project.sprints) ? project.sprints : [];
    const sprint = sprints[sprintIndex];
    if (!sprint) return;

    const confirmed = await showDashboardConfirmation({
      title: 'Remove project sprint?',
      message: `Remove "${sprint.name}" and update the numbering of the remaining sprints?`,
      confirmLabel: 'Remove sprint',
      destructive: true
    });
    if (!confirmed) return;

    const remainingSprints = sprints
      .filter((_, idx) => idx !== sprintIndex)
      .map((item, idx) => ({
        ...item,
        name: renumberSprintName(item.name, idx + 1)
      }));

    const sprintKey = `${project.projectId}:${sprintIndex}`;
    setRemovingSprintKey(sprintKey);
    try {
      await api.put(`/projects/${encodeURIComponent(project.projectId)}`, {
        sprints: remainingSprints
      });
      await loadProjectsFromAPI({ silent: true });
      showDashboardToast('Sprint removed.', 'success');
    } catch (error: any) {
      showDashboardToast(error?.message || 'The sprint could not be removed.', 'error');
    } finally {
      setRemovingSprintKey(null);
    }
  };

  const handleCancelMeeting = async (meet: MeetingRecord) => {
    setCancellingMeetingId(meet.id);
    try {
      await deleteProjectMeeting(meet);
      addAuditLog('Project meeting canceled', `Meeting "${meet.title}" canceled.`, 'trash');
      showDashboardToast('Meeting cancelled.', 'info');
    } catch (error: any) {
      showDashboardToast(error?.message || 'Unable to cancel this meeting.', 'error');
    } finally {
      setCancellingMeetingId(null);
    }
  };

  const toggleProjectExpand = (projectId: string) => {
    setExpandedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const renderProjectActionDropdown = (
    key: string,
    label: string,
    list: Project[],
    variantClass: string,
    onSelect: (project: Project) => void
  ) => {
    if (!list.length) return null;
    const isOpen = openDropdown === key;
    return (
      <details
        key={key}
        className={cx('admin-project-action-dropdown')}
        open={isOpen}
        onToggle={(e) => {
          const el = e.currentTarget;
          if (el.open) setOpenDropdown(key);
          else if (openDropdown === key) setOpenDropdown(null);
        }}
      >
        <summary
          className={`action-btn ${cx('admin-project-action-trigger', variantClass)}`}
          aria-label={`${label}: choose a project`}
          onClick={(e) => {
            e.preventDefault();
            setOpenDropdown(isOpen ? null : key);
          }}
        >
          {label}
        </summary>
        <div className={cx('admin-project-action-menu')}>
          {list.map((project) => (
            <button
              key={project.projectId}
              type="button"
              className={cx('admin-project-action-option')}
              onClick={() => {
                setOpenDropdown(null);
                onSelect(project);
              }}
            >
              <i className={`dot ${project.color || 'blue'}`} />
              <span>{project.name}</span>
            </button>
          ))}
        </div>
      </details>
    );
  };

  const TABS: Array<{ key: WorkspaceConsoleTab; label: string }> = [
    { key: 'projects', label: 'Projects' },
    { key: 'users', label: 'Team Members & Roles' },
    { key: 'tasks', label: 'Task Creation & Assignments' },
    { key: 'meetings', label: 'Meetings & Pinned Schedules' },
    { key: 'resources', label: 'Resources' }
  ];

  return (
    <div id="admin-container" className="admin-container" style={{ display: 'flex' }}>
      <div className="admin-tabs-nav" id="admin-tabs-nav">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`admin-tab-btn${activeWorkspaceTab === tab.key ? ' active' : ''}`}
            onClick={() => setActiveWorkspaceTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 0: Projects */}
      <div
        className={`admin-tab-panel${activeWorkspaceTab === 'projects' ? ' active' : ''}`}
        id="admin-tab-projects"
        style={{ display: activeWorkspaceTab === 'projects' ? 'block' : 'none' }}
      >
        <div className={`admin-card ${cx('admin-projects-card')}`}>
          <div className="admin-card-header">
            <div>
              <h3>Workspace Projects & Collaboration Boards</h3>
              <p>Manage projects, timelines, teams, and sprints.</p>
            </div>
            <div className={cx('admin-projects-toolbar')} id="admin-projects-toolbar">
              <div className="admin-card-badge" id="admin-projects-count">
                {projects.length} {projects.length === 1 ? 'project' : 'projects'}
              </div>
              <div
                ref={actionsWrapRef}
                className={cx('admin-project-actions')}
                id="admin-project-actions"
              >
                {renderProjectActionDropdown(
                  'open',
                  'Open Board',
                  projects,
                  'admin-project-open-action',
                  (p) => switchView(p.name)
                )}
                {renderProjectActionDropdown(
                  'edit',
                  'Edit',
                  ownedProjects,
                  'admin-project-edit-btn',
                  (p) => setActiveModal({ type: 'editProject', projectId: p.projectId })
                )}
                {renderProjectActionDropdown(
                  'invite',
                  'Invite Member',
                  ownedProjects,
                  'admin-project-invite-action',
                  (p) => setActiveModal({ type: 'inviteCollaborator', projectId: p.projectId })
                )}
                {renderProjectActionDropdown(
                  'remove',
                  removingProjectId ? 'Deleting…' : 'Remove',
                  ownedProjects,
                  'admin-project-remove-action',
                  (p) => handleRemoveProject(p)
                )}
              </div>
              <button
                type="button"
                className="primary-button gold"
                id="admin-add-project-quick-btn"
                onClick={() => setActiveModal({ type: 'createProject' })}
              >
                + <span>Create Project</span>
              </button>
            </div>
          </div>

          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Collaboration Type</th>
                  <th>Time Span</th>
                  <th>Creator</th>
                  <th>Collaborators</th>
                  <th>Sprints</th>
                </tr>
              </thead>
              <tbody id="admin-projects-tbody">
                {!projects.length ? (
                  <tr>
                    <td className="notification-empty-state" colSpan={6}>
                      No projects yet. Create a project to get started.
                    </td>
                  </tr>
                ) : (
                  projects.map((project) => {
                    const isCreator = Boolean(
                      project.creatorFirebaseUid &&
                        currentUid &&
                        project.creatorFirebaseUid === currentUid
                    );
                    const creatorName =
                      (isCreator ? currentUser.name?.trim() : '') ||
                      project.creatorName?.trim() ||
                      project.creatorEmail?.trim() ||
                      'Project creator';
                    const creatorEmail = project.creatorEmail?.trim();
                    const teamCount = new Set(
                      (project.acceptedMembers || [])
                        .map(
                          (m) =>
                            m.firebaseUid ||
                            m.firebase_uid ||
                            m.email?.trim().toLowerCase()
                        )
                        .filter(Boolean)
                    ).size;
                    const sprintCount = (project.sprints || []).length;

                    return (
                      <tr key={project.projectId}>
                        <td>
                          <div className="project-cell">
                            <div className="project-info">
                              <strong>{project.name}</strong>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="collab-type-badge">
                            {project.projectType || 'General Collaboration'}
                          </span>
                        </td>
                        <td>
                          <span className="time-span-text">
                            {formatProjectTimeSpanForDisplay(project.timeSpan)}
                          </span>
                        </td>
                        <td>
                          <div className="member-cell">
                            <div className="member-info">
                              <strong>{creatorName}</strong>
                              {creatorEmail && creatorName !== creatorEmail && (
                                <small>{creatorEmail}</small>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className={cx('collaborators-cell')}>
                            <span className="status-badge active">
                              {teamCount} {teamCount === 1 ? 'collaborator' : 'collaborators'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={cx('admin-sprint-cell')}>
                            {sprintCount} {sprintCount === 1 ? 'Sprint' : 'Sprints'}
                          </span>
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

      {/* TAB 1: Team Members & Roles */}
      <div
        className={`admin-tab-panel${activeWorkspaceTab === 'users' ? ' active' : ''}`}
        id="admin-tab-members"
        style={{ display: activeWorkspaceTab === 'users' ? 'block' : 'none' }}
      >
        <div className={`admin-card ${cx('admin-members-card')}`}>
          <div className="admin-card-header">
            <div>
              <h3>Team Members & Roles</h3>
              <p>Assign workspace permissions and administrative authority.</p>
            </div>
            <div className={cx('admin-members-header-controls')}>
              <div className="admin-card-badge" id="admin-member-count">
                {uniqueMemberCount} {uniqueMemberCount === 1 ? 'member' : 'members'}
              </div>
              <div className={cx('admin-members-project-actions')}>
                <div className={cx('admin-members-project-filter-wrap')}>
                  <select
                    id="admin-members-project-filter"
                    className={cx('admin-members-project-filter')}
                    aria-label="Filter members by project"
                    value={selectedMembersProjectId}
                    onChange={(e) => setSelectedMembersProjectId(e.target.value)}
                  >
                    <option value="all">All projects</option>
                    {accessibleProjects.map((project) => (
                      <option key={project.projectId} value={project.projectId}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  <svg
                    className={cx('admin-members-project-filter-icon')}
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    fill="none"
                  >
                    <path
                      d="m4 6 4 4 4-4"
                      stroke="currentColor"
                      strokeWidth={1.7}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <button
                  type="button"
                  className="primary-button gold"
                  id="admin-members-invite-btn"
                  hidden={!showMembersInviteBtn}
                  onClick={() => {
                    const targetProj = ownedProjects.find(
                      (p) => p.projectId === selectedMembersProjectId
                    );
                    setActiveModal({
                      type: 'inviteCollaborator',
                      projectId: targetProj?.projectId
                    });
                  }}
                >
                  + <span>Invite Member</span>
                </button>
              </div>
            </div>
          </div>

          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role & Permissions</th>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="admin-members-tbody">
                {membersError ? (
                  <tr>
                    <td className="notification-empty-state" colSpan={5}>
                      {membersError}
                    </td>
                  </tr>
                ) : !accessibleProjects.length ? (
                  <tr>
                    <td className="notification-empty-state" colSpan={5}>
                      No accessible projects to show.
                    </td>
                  </tr>
                ) : !visibleMembers.length ? (
                  <tr>
                    <td className="notification-empty-state" colSpan={5}>
                      No project members to show yet.
                    </td>
                  </tr>
                ) : (
                  visibleMembers.map((member) => {
                    const avatarSrc = getAvatarSource(member);
                    const canRemove =
                      Boolean(member.invitationId) &&
                      member.projectCreatorFirebaseUid === currentUid;
                    return (
                      <tr key={member.id}>
                        <td>
                          <div className="member-cell">
                            <div className={`avatar ${member.tone || 'coral'}-bg`}>
                              {avatarSrc ? (
                                <img
                                  src={avatarSrc}
                                  alt={member.name}
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    borderRadius: '50%'
                                  }}
                                />
                              ) : (
                                member.initials
                              )}
                            </div>
                            <div className="member-info">
                              <strong>{member.name}</strong>
                              <small>{member.email}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="member-role-text">{member.role || 'Member'}</span>
                        </td>
                        <td>{member.projectName || 'Project'}</td>
                        <td>
                          <span
                            className={`status-badge ${String(member.status || 'Active').toLowerCase()}`}
                          >
                            ● {member.status || 'Active'}
                          </span>
                        </td>
                        <td>
                          {canRemove ? (
                            <button
                              type="button"
                              className="action-btn delete"
                              disabled={removingMemberId === member.id}
                              onClick={() => handleRemoveMember(member)}
                            >
                              {removingMemberId === member.id ? 'Removing…' : 'Remove'}
                            </button>
                          ) : (
                            <span className="notification-read-label">—</span>
                          )}
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

      {/* TAB 2: Task Creation & Assignments */}
      <div
        className={`admin-tab-panel${activeWorkspaceTab === 'tasks' ? ' active' : ''}`}
        id="admin-tab-tasks"
        style={{ display: activeWorkspaceTab === 'tasks' ? 'block' : 'none' }}
      >
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>Admin Task Creation & Project Assignment Authority</h3>
              <p>Open a project to manage its sprints, tasks, and accepted invitees.</p>
            </div>
          </div>

          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Projects and project tasks</th>
                </tr>
              </thead>
              <tbody id="admin-tasks-tbody">
                {!projects.length ? (
                  <tr>
                    <td className="notification-empty-state">No projects are available yet.</td>
                  </tr>
                ) : (
                  projects.map((project) => {
                    const projectTasks = tasks.filter((t) => t.projectId === project.projectId);
                    const isExpanded = expandedProjectIds.has(project.projectId);
                    const isOwner = project.creatorFirebaseUid === currentUid;
                    const collaboratorCount = (project.acceptedMembers || []).length;
                    const sprints = Array.isArray(project.sprints) ? project.sprints : [];
                    const acceptedMembers = Array.isArray(project.acceptedMembers)
                      ? project.acceptedMembers
                      : [];

                    return (
                      <React.Fragment key={project.projectId}>
                        <tr
                          className={`project-task-project-row${isExpanded ? ' is-expanded' : ''}`}
                          data-project-id={project.projectId}
                        >
                          <td>
                            <div className="project-task-row-layout">
                              <button
                                type="button"
                                className={`project-task-project-toggle${
                                  isExpanded ? ' is-expanded' : ''
                                }`}
                                aria-expanded={isExpanded}
                                onClick={() => toggleProjectExpand(project.projectId)}
                              >
                                <span className="project-task-row-identity">
                                  <strong>{project.name}</strong>
                                  <small>
                                    {project.description || 'No description provided'}
                                  </small>
                                </span>
                                <span className="project-task-row-metadata">
                                  <span className="project-task-row-meta-item">
                                    <small className="project-task-row-meta-label">
                                      Collaboration type
                                    </small>
                                    <strong className="project-task-row-meta-value">
                                      {project.projectType || 'General Collaboration'}
                                    </strong>
                                  </span>
                                  <span className="project-task-row-meta-item">
                                    <small className="project-task-row-meta-label">Duration</small>
                                    <strong className="project-task-row-meta-value">
                                      {formatProjectTimeSpanForDisplay(project.timeSpan)}
                                    </strong>
                                  </span>
                                  <span className="project-task-row-meta-item">
                                    <small className="project-task-row-meta-label">
                                      Collaborators
                                    </small>
                                    <strong className="project-task-row-meta-value">
                                      {collaboratorCount}{' '}
                                      {collaboratorCount === 1 ? 'person' : 'people'}
                                    </strong>
                                  </span>
                                </span>
                              </button>

                              <div className="project-task-row-actions">
                                <small className="project-task-row-task-count">
                                  {projectTasks.length}{' '}
                                  {projectTasks.length === 1 ? 'task' : 'tasks'}
                                </small>
                                {isOwner && (
                                  <button
                                    type="button"
                                    className="primary-button gold project-task-row-add-button"
                                    title="Create a task for this project."
                                    onClick={() =>
                                      setActiveModal({
                                        type: 'createTask',
                                        projectId: project.projectId
                                      })
                                    }
                                  >
                                    + Add Task
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className={`project-task-row-expand-button${
                                    isExpanded ? ' is-expanded' : ''
                                  }`}
                                  aria-expanded={isExpanded}
                                  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${
                                    project.name
                                  }`}
                                  onClick={() => toggleProjectExpand(project.projectId)}
                                >
                                  <span className="project-task-chevron">⌄</span>
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>

                        <tr className="project-task-details-row" hidden={!isExpanded}>
                          <td>
                            <div className="project-task-details">
                              <div className="project-task-toolbar">
                                <section className="project-sprint-section">
                                  <div className="project-task-section-heading">
                                    <h4>Project sprints</h4>
                                    <span className="project-task-section-count">
                                      {sprints.length}
                                    </span>
                                  </div>
                                  <div className="project-sprint-list">
                                    {!sprints.length ? (
                                      <p className="project-task-empty">No project sprints yet.</p>
                                    ) : (
                                      sprints.map((sprint, sIdx) => {
                                        const sMembers = getSprintMembers(project, sprint);
                                        const sprintKey = `${project.projectId}:${sIdx}`;
                                        return (
                                          <span
                                            key={`${sprint.id || sprint.name}-${sIdx}`}
                                            className="project-sprint-chip"
                                          >
                                            <strong>{sprint.name || 'Sprint'}</strong>
                                            <small>{sprint.status || 'Upcoming'}</small>
                                            <small className="project-sprint-assignee">
                                              {sMembers.length
                                                ? `Members · ${sMembers
                                                    .map(
                                                      (m) =>
                                                        m.name || m.email || 'Project member'
                                                    )
                                                    .join(', ')}`
                                                : 'No members assigned'}
                                            </small>
                                            {isOwner && (
                                              <button
                                                type="button"
                                                className="project-sprint-remove"
                                                aria-label={`Remove ${sprint.name || 'sprint'}`}
                                                title="Remove sprint"
                                                disabled={removingSprintKey === sprintKey}
                                                onClick={() => handleRemoveSprint(project, sIdx)}
                                              >
                                                ×
                                              </button>
                                            )}
                                          </span>
                                        );
                                      })
                                    )}
                                  </div>
                                </section>

                                <section className="project-sprint-section">
                                  <div className="project-task-section-heading">
                                    <h4>Accepted project invitees</h4>
                                    <span className="project-task-section-count">
                                      {acceptedMembers.length}
                                    </span>
                                  </div>
                                  <div className="project-task-member-list">
                                    {!acceptedMembers.length ? (
                                      <div className="project-task-empty-state">
                                        <p>No accepted invitees yet.</p>
                                        <small>
                                          You can assign tasks to yourself as project owner or
                                          invite a teammate.
                                        </small>
                                        {isOwner && (
                                          <button
                                            type="button"
                                            className="outline-button project-task-invite-button"
                                            onClick={() =>
                                              setActiveModal({
                                                type: 'inviteCollaborator',
                                                projectId: project.projectId
                                              })
                                            }
                                          >
                                            + Invite Member
                                          </button>
                                        )}
                                      </div>
                                    ) : (
                                      acceptedMembers.map((member, mIdx) => {
                                        const mName =
                                          member.name || member.email || 'Project member';
                                        return (
                                          <span
                                            key={member.firebaseUid || member.email || mIdx}
                                            className="project-task-member-chip"
                                          >
                                            {mName}
                                            {member.role ? ` · ${member.role}` : ''}
                                          </span>
                                        );
                                      })
                                    )}
                                  </div>
                                </section>
                              </div>

                              <div className="project-task-table-wrap">
                                <table className="project-task-table">
                                  <thead>
                                    <tr>
                                      <th>Task</th>
                                      <th>Due date</th>
                                      <th>Status</th>
                                      {isOwner && <th>Actions</th>}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {!projectTasks.length ? (
                                      <tr>
                                        <td
                                          className="project-task-empty"
                                          colSpan={isOwner ? 4 : 3}
                                        >
                                          No tasks have been created for this project yet.
                                        </td>
                                      </tr>
                                    ) : (
                                      projectTasks.map((task) => {
                                        const statusSlug = String(task.status || 'To do')
                                          .toLowerCase()
                                          .replaceAll(' ', '-');
                                        return (
                                          <tr key={String(task.id)}>
                                            <td>
                                              <strong>{task.title}</strong>
                                              {task.description && (
                                                <small>{task.description}</small>
                                              )}
                                            </td>
                                            <td>{taskDateLabel(task.due_date || task.date)}</td>
                                            <td>
                                              <span className={`status-badge ${statusSlug}`}>
                                                {task.status || 'To do'}
                                              </span>
                                            </td>
                                            {isOwner && (
                                              <td>
                                                <button
                                                  type="button"
                                                  className="action-btn"
                                                  onClick={() =>
                                                    setActiveModal({
                                                      type: 'editTask',
                                                      taskId: task.taskId || task.id,
                                                      projectId: project.projectId
                                                    })
                                                  }
                                                >
                                                  Edit
                                                </button>
                                                <button
                                                  type="button"
                                                  className="action-btn delete"
                                                  onClick={() => deleteTask(task)}
                                                >
                                                  Delete
                                                </button>
                                              </td>
                                            )}
                                          </tr>
                                        );
                                      })
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* TAB 3: Meetings & Pinned Schedules */}
      <div
        className={`admin-tab-panel${activeWorkspaceTab === 'meetings' ? ' active' : ''}`}
        id="admin-tab-meetings"
        style={{ display: activeWorkspaceTab === 'meetings' ? 'block' : 'none' }}
      >
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>Meeting Scheduling & Collaboration Hub</h3>
              <p>
                Schedule team syncs, sprint reviews, and collaboration events with automatic
                calendar pins.
              </p>
            </div>
            <button
              type="button"
              className="primary-button gold"
              id="admin-add-meeting-quick-btn"
              onClick={() => setActiveModal({ type: 'scheduleMeeting' })}
            >
              + <span>Schedule Meeting (Pinned)</span>
            </button>
          </div>

          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Meeting Event</th>
                  <th>Date & Time</th>
                  <th>Calendar Pin</th>
                  <th>Attendees</th>
                  <th>Location / Link</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="admin-meetings-tbody">
                {!meetings.length ? (
                  <tr>
                    <td className="meeting-empty-state" colSpan={6}>
                      No project meetings scheduled.
                    </td>
                  </tr>
                ) : (
                  meetings.map((meet) => {
                    const isJoinable =
                      !meet.isEnded &&
                      new Date(`${meet.date}T${meet.endTime || '23:59'}:00`) >= new Date();
                    const externalUrl = getSafeExternalUrl(meet.location);

                    return (
                      <tr key={meet.id}>
                        <td>
                          <div className={cx('admin-meeting-cell')}>
                            <strong>{meet.title}</strong>
                            <small className={cx('admin-meeting-host')}>
                              <span
                                className={`avatar teal-bg ${cx('admin-meeting-host-avatar')}`}
                                aria-hidden="true"
                              >
                                {meet.hostProfileImage ? (
                                  <img
                                    src={meet.hostProfileImage}
                                    alt={meet.host}
                                    style={{
                                      width: '100%',
                                      height: '100%',
                                      objectFit: 'cover',
                                      borderRadius: '50%'
                                    }}
                                  />
                                ) : (
                                  getUserInitials(meet.host)
                                )}
                              </span>
                              <span>
                                Host: {meet.host} · Project: {meet.projectName}
                              </span>
                            </small>
                          </div>
                        </td>
                        <td>
                          <span className={cx('admin-meeting-date')}>
                            {meet.date} • {meet.time}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`status-badge ${cx(
                              'admin-meeting-pin',
                              meet.pinned ? 'pinned' : 'unpinned'
                            )}`}
                          >
                            {meet.pinned ? '📍 Pinned on Calendar' : 'Unpinned'}
                          </span>
                        </td>
                        <td>
                          <div className={cx('admin-attendees-cell')}>
                            {(meet.attendees || []).map((person, idx) => {
                              const attSrc = getAvatarSource(person);
                              return (
                                <span
                                  key={person.firebaseUid || person.email || idx}
                                  className={`avatar ${person.tone || 'teal'}-bg ${cx(
                                    'admin-attendee-avatar'
                                  )}`}
                                  title={person.name}
                                >
                                  {attSrc ? (
                                    <img
                                      src={attSrc}
                                      alt={person.name || 'Attendee'}
                                      style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        borderRadius: '50%'
                                      }}
                                    />
                                  ) : (
                                    person.initials || getUserInitials(person.name)
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td>
                          {isJoinable ? (
                            <a
                              className={cx('admin-meeting-link')}
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                openMeteredMeetingModal(meet);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  openMeteredMeetingModal(meet);
                                }
                              }}
                            >
                              Join meeting
                            </a>
                          ) : (
                            <a className={cx('admin-meeting-link')} aria-disabled="true">
                              Meeting ended
                            </a>
                          )}
                          {externalUrl && !meet.isEnded ? (
                            <>
                              {' '}
                              <a href={externalUrl} target="_blank" rel="noopener noreferrer">
                                Open external link ↗
                              </a>
                            </>
                          ) : meet.location ? (
                            <small className="meeting-location-detail"> {meet.location}</small>
                          ) : null}
                        </td>
                        <td>
                          {meet.canCancel && (
                            <button
                              type="button"
                              className="action-btn delete"
                              disabled={cancellingMeetingId === meet.id}
                              onClick={() => handleCancelMeeting(meet)}
                            >
                              {cancellingMeetingId === meet.id ? 'Cancelling…' : 'Cancel / Delete'}
                            </button>
                          )}
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

      {/* TAB 4: Resources */}
      <div
        className={`admin-tab-panel${activeWorkspaceTab === 'resources' ? ' active' : ''}`}
        id="admin-tab-updates"
        style={{ display: activeWorkspaceTab === 'resources' ? 'block' : 'none' }}
      >
        <div className="admin-card admin-resources-card">
          <div className="admin-card-header">
            <div>
              <h3>Project Resources</h3>
              <p>Shared links and tools for projects you can access.</p>
            </div>
            <button
              type="button"
              className="primary-button gold"
              id="hub-add-resource-btn"
              hidden={!ownedProjects.length}
              onClick={() => setActiveModal({ type: 'createResource' })}
            >
              + Add Resource
            </button>
          </div>

          <div className={cx('hub-resources-grid')} id="admin-hub-resources-list">
            {resourcesLoading ? (
              <p className={cx('hub-resources-empty')}>Loading project resources…</p>
            ) : resourcesLoadFailed && !teamResources.length ? (
              <p className={cx('hub-resources-empty')}>
                Project resources could not be loaded. Please try again.
              </p>
            ) : !teamResources.length ? (
              <p className={cx('hub-resources-empty')}>
                No resources have been pinned to your projects yet.
              </p>
            ) : (
              teamResources.map((res: ResourceItem) => {
                const logo = getResourcePlatformInfo(res.url, res.title);
                const safeUrl = getSafeExternalUrl(res.url) || '#';
                const isOwner = Boolean(
                  projects.some(
                    (p) => p.projectId === res.projectId && p.creatorFirebaseUid === currentUid
                  )
                );

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
                        decoding="async"
                        onError={(e) => {
                          if (e.currentTarget.dataset.fallback) return;
                          e.currentTarget.dataset.fallback = 'true';
                          e.currentTarget.src = '/images/favicon.png';
                        }}
                      />
                      <div className={cx('hub-res-content')}>
                        <div className={cx('hub-res-title-row')}>
                          <strong>{res.title}</strong>
                          <span className={cx('hub-res-tag')}>
                            {res.category || 'Workspace Resource'}
                          </span>
                        </div>
                        <small>
                          {res.projectName ? `${res.projectName} · ` : ''}
                          {logo.hostname || res.url}
                        </small>
                      </div>
                      <span className={cx('hub-res-arrow')} aria-hidden="true">
                        ↗
                      </span>
                    </a>
                    {isOwner && (
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
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
