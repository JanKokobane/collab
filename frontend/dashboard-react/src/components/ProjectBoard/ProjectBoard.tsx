import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  getAvatarSource,
  getSprintMembers,
  getSprintMemberUids,
  getUserInitials,
  useDashboard
} from '../../context/DashboardContext';
import type { Project, ProjectMember, TaskFilterKey, TaskItem, TaskStatus } from '../../types/dashboard';
import { createCx } from '../../utils/cx';
import { toLocalDateKey } from '../../utils/dateUtils';
import { SvgIcon } from '../../utils/icons';
import styles from './ProjectBoard.module.css';

const cx = createCx(styles);

const BOARD_COLUMNS: Array<{
  status: TaskStatus;
  dotTone: 'gray' | 'coral' | 'green' | 'blue';
  countId: string;
  listId: string;
  allowAdd?: boolean;
}> = [
  { status: 'To do', dotTone: 'gray', countId: 'count-todo', listId: 'todo-list', allowAdd: true },
  { status: 'In progress', dotTone: 'coral', countId: 'count-progress', listId: 'progress-list' },
  { status: 'Blocked', dotTone: 'coral', countId: 'count-blocked', listId: 'blocked-list' },
  { status: 'Done', dotTone: 'green', countId: 'count-done', listId: 'done-list' },
  { status: 'Backlog', dotTone: 'blue', countId: 'count-backlog', listId: 'backlog-list' }
];

const FILTER_OPTIONS: Array<{ key: TaskFilterKey; label: string }> = [
  { key: 'all', label: 'All tasks' },
  { key: 'mine', label: 'My tasks' },
  { key: 'backlog', label: 'Backlog' },
  { key: 'todo', label: 'To do' },
  { key: 'progress', label: 'In progress' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'done', label: 'Completed (Done)' }
];

const MOVE_STATUSES: TaskStatus[] = ['To do', 'In progress', 'Done', 'Blocked', 'Backlog'];

function getTaskDeadline(dueDate?: string | null): Date | null {
  if (!dueDate) return null;
  const deadline = new Date(`${String(dueDate).slice(0, 10)}T23:59:59`);
  return Number.isNaN(deadline.getTime()) ? null : deadline;
}

function formatTaskCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${String(hours).padStart(2, '0')}h`;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

interface TaskCountdownBadgeProps {
  task: TaskItem;
}

const TaskCountdownBadge: React.FC<TaskCountdownBadgeProps> = ({ task }) => {
  const dueDate = task.due_date || (task.dueDate as string | undefined) || task.date;
  const dueDateKey = dueDate ? String(dueDate).slice(0, 10) : '';
  const deadline = getTaskDeadline(dueDateKey);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!deadline || task.status === 'Done') return;
    const isAlreadyOverdue = dueDateKey < toLocalDateKey() || deadline.getTime() - Date.now() <= 0;
    if (isAlreadyOverdue) return;
    const timer = window.setInterval(() => {
      setTick((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [deadline, dueDateKey, task.status]);

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

interface PersonAvatarProps {
  person: Partial<ProjectMember> & { name?: string; initials?: string; tone?: string };
  className?: string;
}

const PersonAvatar: React.FC<PersonAvatarProps> = ({ person, className }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const name = person.name || 'Project member';
  const initials = person.initials || getUserInitials(name);
  const tone = person.tone || 'teal';
  const imgSrc = getAvatarSource(person);

  if (imgSrc && !imgFailed) {
    return (
      <span
        className={`avatar ${tone}-bg has-photo${className ? ` ${className}` : ''}`}
        title={name}
      >
        <img
          src={imgSrc}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
        />
      </span>
    );
  }

  return (
    <span className={`avatar ${tone}-bg${className ? ` ${className}` : ''}`} title={name}>
      {initials}
    </span>
  );
};

export const ProjectBoard: React.FC = () => {
  const {
    activeView,
    activeProject,
    projects,
    tasks,
    accessibleTasks,
    activeFilter,
    setActiveFilter,
    activeSprintFilter,
    setActiveSprintFilter,
    activeDisplayMode,
    setActiveDisplayMode,
    currentUser,
    firebaseUser,
    isCurrentUserProjectCreator,
    moveTaskStatus,
    openTaskDetails,
    asideTaskId,
    setActiveModal,
    openMessageContext,
    showDashboardToast
  } = useDashboard();

  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [openStatusMenuTaskId, setOpenStatusMenuTaskId] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null);
  const [updatingTaskIds, setUpdatingTaskIds] = useState<Record<string, boolean>>({});
  const filterWrapRef = useRef<HTMLDivElement | null>(null);

  const currentUid = firebaseUser?.uid || currentUser?.uid || '';

  useEffect(() => {
    const handleDocClick = (event: MouseEvent) => {
      if (filterWrapRef.current && !filterWrapRef.current.contains(event.target as Node)) {
        setFilterMenuOpen(false);
      }
      setOpenStatusMenuTaskId(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFilterMenuOpen(false);
        setOpenStatusMenuTaskId(null);
      }
    };
    document.addEventListener('click', handleDocClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleDocClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const isProjectView =
    Boolean(activeProject) &&
    ![
      'Workspace',
      'My Tasks',
      'Overview',
      'Calendar',
      'Meetings',
      'Admin Console',
      'Settings',
      'Notifications',
      'Brainstorm',
      'Messages'
    ].includes(activeView);

  const isCurrentUserProjectTask = (task: TaskItem): boolean => {
    if (!task.backendPersistent || !currentUid) return false;
    const project = projects.find((candidate) => candidate.projectId === task.projectId);
    return Boolean(
      project?.creatorFirebaseUid === currentUid ||
        (project?.sprints || []).some((sprint) => getSprintMemberUids(sprint).includes(currentUid))
    );
  };

  const getTaskMoveRestriction = (task: TaskItem): string => {
    if (!task.backendPersistent) return '';
    const project = projects.find((candidate) => candidate.projectId === task.projectId);
    const isProjectOwner = Boolean(currentUid && project?.creatorFirebaseUid === currentUid);
    const isSprintMember = Boolean(currentUid && isCurrentUserProjectTask(task));
    if (!isProjectOwner && !isSprintMember) {
      return 'Only the project owner or a project sprint member can move this task.';
    }
    return '';
  };

  const filteredTasks = useMemo(() => {
    const accessibleProjectNames = new Set(projects.map((p) => p.name));
    let list = tasks.filter((task) => accessibleProjectNames.has(task.project));

    if (activeView === 'My Tasks') {
      list = list.filter(isCurrentUserProjectTask);
    } else if (activeView !== 'Workspace' && activeProject) {
      list = list.filter((t) => t.project === activeView);
    }

    if (activeFilter === 'mine') {
      list = list.filter(isCurrentUserProjectTask);
    } else if (activeFilter === 'backlog') {
      list = list.filter((t) => t.status === 'Backlog');
    } else if (activeFilter === 'todo') {
      list = list.filter((t) => t.status === 'To do');
    } else if (activeFilter === 'progress') {
      list = list.filter((t) => t.status === 'In progress');
    } else if (activeFilter === 'blocked') {
      list = list.filter((t) => t.status === 'Blocked');
    } else if (activeFilter === 'done') {
      list = list.filter((t) => t.status === 'Done');
    }

    if (activeSprintFilter && activeSprintFilter !== 'all') {
      list = list.filter((t) => !t.sprint || t.sprint === activeSprintFilter);
    }

    return list;
  }, [projects, tasks, activeView, activeProject, activeFilter, activeSprintFilter, currentUid]);

  const statsTasks = useMemo(() => {
    if (activeView === 'My Tasks') {
      return accessibleTasks.filter(isCurrentUserProjectTask);
    }
    if (activeProject && isProjectView) {
      return accessibleTasks.filter((t) => t.project === activeProject.name);
    }
    return accessibleTasks;
  }, [accessibleTasks, activeView, activeProject, isProjectView, currentUid]);

  const completedCount = useMemo(
    () => statsTasks.filter((t) => t.status === 'Done').length,
    [statsTasks]
  );

  const dueThisWeekStats = useMemo(() => {
    const todayKey = toLocalDateKey();
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndKey = toLocalDateKey(weekEnd);
    const dueThisWeek = statsTasks.filter((t) => {
      const key = String(t.due_date || t.date || '').slice(0, 10);
      return Boolean(key && key >= todayKey && key <= weekEndKey);
    });
    return {
      total: dueThisWeek.length,
      pending: dueThisWeek.filter((t) => t.status !== 'Done').length
    };
  }, [statsTasks]);

  const teamMembersForStats = useMemo(() => {
    const targetProjects: Project[] =
      isProjectView && activeProject ? [activeProject] : projects;
    const peopleMap = new Map<string, ProjectMember>();
    targetProjects.forEach((proj) => {
      if (proj.creatorEmail || proj.creatorName) {
        const key = (proj.creatorFirebaseUid || proj.creatorEmail || proj.creatorName).toLowerCase();
        if (!peopleMap.has(key)) {
          peopleMap.set(key, {
            firebaseUid: proj.creatorFirebaseUid || undefined,
            name: proj.creatorName,
            email: proj.creatorEmail,
            initials: proj.creatorInitials,
            profileImage: proj.creatorProfileImage,
            tone: proj.creatorTone || 'coral'
          });
        }
      }
      (proj.acceptedMembers || []).forEach((m) => {
        const key = String(m.firebaseUid || m.email || m.name || '').toLowerCase();
        if (key && !peopleMap.has(key)) {
          peopleMap.set(key, m);
        }
      });
    });
    return [...peopleMap.values()];
  }, [isProjectView, activeProject, projects]);

  const handleMoveStatus = async (task: TaskItem, nextStatus: TaskStatus) => {
    if (task.status === nextStatus || updatingTaskIds[String(task.id)]) return;
    const restriction = getTaskMoveRestriction(task);
    if (restriction) {
      showDashboardToast(restriction, 'error');
      return;
    }
    setUpdatingTaskIds((prev) => ({ ...prev, [String(task.id)]: true }));
    try {
      await moveTaskStatus(task.id, nextStatus);
    } finally {
      setUpdatingTaskIds((prev) => {
        const next = { ...prev };
        delete next[String(task.id)];
        return next;
      });
    }
  };

  const activeFilterLabel =
    FILTER_OPTIONS.find((item) => item.key === activeFilter)?.label || 'All tasks';

  const projectTasksAll = useMemo(
    () => (activeProject ? tasks.filter((t) => t.project === activeProject.name) : []),
    [tasks, activeProject]
  );

  const teamMemberCount = Number(activeProject?.teamMemberCount) || 0;
  const projectSprints = Array.isArray(activeProject?.sprints) ? activeProject.sprints : [];

  const canCreateCard = activeView === 'Workspace' || isCurrentUserProjectCreator;

  return (
    <>
      {isProjectView && activeProject && (
        <div className={cx('page-heading')}>
          <div
            className={`admin-tabs-nav ${cx('page-heading-actions', 'project-heading-actions')}`}
            id="project-heading-actions"
          >
            <button
              type="button"
              className={`admin-tab-btn ${cx('project-heading-action')}`}
              id="project-add-sticky-note"
              title="Add a private or shared sticky note to this project"
              onClick={() => window.dispatchEvent(new CustomEvent('collab-open-project-sticky-note'))}
            >
              <span aria-hidden="true">＋</span>
              <span>Sticky Note</span>
            </button>
            {isCurrentUserProjectCreator && (
              <>
                <button
                  type="button"
                  className={`admin-tab-btn ${cx('project-heading-action')}`}
                  id="project-invite-collab-btn"
                  title="Invite team members to this project by email"
                  onClick={() =>
                    setActiveModal({
                      type: 'inviteCollaborator',
                      projectId: activeProject.projectId
                    })
                  }
                >
                  <svg className="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="8.5" cy="7.5" r="4"></circle>
                    <line x1="20" y1="8" x2="20" y2="14"></line>
                    <line x1="23" y1="11" x2="17" y2="11"></line>
                  </svg>
                  <span>Invite Member</span>
                </button>
                <button
                  type="button"
                  className={`admin-tab-btn ${cx('project-heading-action')}`}
                  id="project-manage-collab-btn"
                  title="View & manage invited project members"
                  onClick={() =>
                    setActiveModal({
                      type: 'manageCollaborators',
                      projectId: activeProject.projectId
                    })
                  }
                >
                  <svg className="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                  <span id="collab-btn-count">
                    {teamMemberCount ? `${teamMemberCount} Team Members` : 'No team members invited'}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {isProjectView && activeProject && (
        <div className={cx('project-sprints-strip')} id="project-sprints-strip">
          <div className={cx('sprints-strip-left')}>
            <span className={cx('sprint-strip-label')}>
              <span>Project Sprints:</span>
            </span>
            <div className={cx('sprint-chips')} id="sprint-chips-list">
              <button
                type="button"
                className={cx('sprint-chip', activeSprintFilter === 'all' && 'active')}
                onClick={() => setActiveSprintFilter('all')}
              >
                <span>All Tasks</span> <small>{projectTasksAll.length}</small>
              </button>
              {projectSprints.map((sprint, idx) => {
                const isSelected = activeSprintFilter === sprint.name;
                return (
                  <button
                    key={sprint.id || sprint.sprintId || `${sprint.name}-${idx}`}
                    type="button"
                    className={cx('sprint-chip', isSelected && 'active')}
                    onClick={() =>
                      setActiveSprintFilter(isSelected ? 'all' : sprint.name || 'all')
                    }
                  >
                    <span>{sprint.name}</span> <small>{sprint.status || 'Upcoming'}</small>
                  </button>
                );
              })}
            </div>
          </div>
          {isCurrentUserProjectCreator && (
            <button
              type="button"
              className={cx('sprint-add-btn')}
              id="add-sprint-btn"
              title="Break project into another sprint or milestone"
              onClick={() =>
                setActiveModal({ type: 'addSprint', projectId: activeProject.projectId })
              }
            >
              + Break into Sprint
            </button>
          )}
        </div>
      )}

      <div className={cx('stats')}>
        <div className="stat-card">
          <div>
            <small>Tasks completed</small>
            <strong>
              <span id="stats-completed-task-count">{completedCount}</span>{' '}
              <em>
                of <span id="stats-task-total-count">{statsTasks.length}</span>
              </em>
            </strong>
          </div>
          <div className="mini-chart">
            <i></i>
            <i></i>
            <i></i>
            <i></i>
            <i></i>
            <i></i>
            <i></i>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <small>Due this week</small>
            <strong>
              <span id="stats-due-week-count">{dueThisWeekStats.total}</span> <em>tasks</em>
            </strong>
          </div>
          <span className="stat-note">
            <span id="stats-due-week-pending">{dueThisWeekStats.pending}</span> pending
          </span>
        </div>
        <div className="stat-card">
          <div>
            <small>Team members</small>
            <strong>
              <span id="stats-team-member-count">{teamMembersForStats.length}</span>{' '}
              <em>people</em>
            </strong>
          </div>
          <div className="avatars" id="stats-team-member-avatars">
            {teamMembersForStats.slice(0, 4).map((person, idx) => (
              <PersonAvatar
                key={person.firebaseUid || person.email || `${person.name}-${idx}`}
                person={person}
              />
            ))}
            {teamMembersForStats.length > 4 && (
              <span className="avatar more-count">+{teamMembersForStats.length - 4}</span>
            )}
          </div>
        </div>
      </div>

      <div id="board-container">
        <div className={cx('board-header')}>
          <div className={cx('board-actions')}>
            <div
              className={cx('filter-dropdown-wrap')}
              id="filter-dropdown-wrap"
              ref={filterWrapRef}
            >
              <button
                type="button"
                className={cx('filter-button')}
                id="filter-btn"
                aria-expanded={filterMenuOpen}
                onClick={(event) => {
                  event.stopPropagation();
                  setFilterMenuOpen((prev) => !prev);
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                </svg>
                <span id="filter-btn-label">{activeFilterLabel}</span> <span>▾</span>
              </button>
              {filterMenuOpen && (
                <div className={cx('filter-menu')} id="filter-menu">
                  {FILTER_OPTIONS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={cx('filter-item', activeFilter === item.key && 'active')}
                      data-filter={item.key}
                      onClick={() => {
                        setActiveFilter(item.key);
                        setFilterMenuOpen(false);
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              className={cx('view-button', activeDisplayMode === 'board' && 'active')}
              id="view-board-btn"
              onClick={() =>
                setActiveDisplayMode(activeDisplayMode === 'board' ? 'list' : 'board')
              }
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="3" width="7" height="18" rx="1"></rect>
                <rect x="14" y="3" width="7" height="10" rx="1"></rect>
              </svg>
              <span>{activeDisplayMode === 'board' ? 'Board' : 'List'}</span>
            </button>
          </div>
        </div>

        <div className="workspace-split-layout" id="workspace-split-layout">
          <div className="workspace-main-panel" id="workspace-main-panel">
            {activeDisplayMode === 'board' && (
              <div className={cx('board')} id="board-columns">
                {BOARD_COLUMNS.map((col) => {
                  const colTasks = filteredTasks.filter(
                    (t) => (t.status || (t.done ? 'Done' : 'To do')) === col.status
                  );
                  const isDragOver = dragOverCol === col.status;

                  return (
                    <div
                      key={col.status}
                      className={`column ${cx('column')}${isDragOver ? ' drag-over' : ''}`}
                      data-status={col.status}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                        if (dragOverCol !== col.status) setDragOverCol(col.status);
                      }}
                      onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                          setDragOverCol((prev) => (prev === col.status ? null : prev));
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDragOverCol(null);
                        const droppedId = event.dataTransfer.getData('text/plain');
                        if (!droppedId) return;
                        const targetTask = tasks.find((t) => String(t.id) === droppedId);
                        if (targetTask && targetTask.status !== col.status) {
                          void handleMoveStatus(targetTask, col.status);
                        }
                      }}
                    >
                      <div className={cx('column-header')}>
                        <span className={`status-dot ${col.dotTone}`}></span>
                        <h3>{col.status}</h3>
                        <span className="count" id={col.countId}>
                          {colTasks.length}
                        </span>
                        {col.allowAdd && canCreateCard && (
                          <button
                            type="button"
                            className={cx('column-plus')}
                            data-add={col.status}
                            aria-label={`Add task to ${col.status}`}
                            onClick={() =>
                              setActiveModal({
                                type: 'createTask',
                                projectId: activeProject?.projectId,
                                defaultStatus: col.status
                              })
                            }
                          >
                            +
                          </button>
                        )}
                      </div>

                      <div className={cx('task-list')} id={col.listId}>
                        {colTasks.map((task) => {
                          const taskIdStr = String(task.id);
                          const project = task.backendPersistent
                            ? projects.find((item) => item.projectId === task.projectId)
                            : undefined;
                          const moveRestriction = getTaskMoveRestriction(task);
                          const isUpdating = Boolean(updatingTaskIds[taskIdStr]);
                          const canMoveTask = !moveRestriction && !isUpdating;
                          const hasDepWarning = Boolean(
                            task.hasDependencyWarning ||
                              task.dependencies?.some(
                                (d) => typeof d === 'object' && Boolean((d as any).warning_reason)
                              )
                          );

                          const priorityVal = task.priority || 'medium';
                          const priorityLabel =
                            priorityVal[0].toUpperCase() + priorityVal.slice(1);

                          const isProjectOwner = Boolean(
                            project && currentUid && project.creatorFirebaseUid === currentUid
                          );
                          const projectTasksForReview = isProjectOwner
                            ? tasks.filter(
                                (candidate) =>
                                  candidate.backendPersistent &&
                                  candidate.projectId === task.projectId
                              )
                            : [];
                          const pendingSprintsCount =
                            isProjectOwner && Array.isArray(project?.sprints)
                              ? project.sprints.filter(
                                  (candidate) =>
                                    String(candidate.status || '')
                                      .trim()
                                      .toLowerCase() === 'pending review'
                                ).length
                              : 0;
                          const pendingTaskReviewsCount = projectTasksForReview.filter(
                            (candidate) =>
                              String(
                                candidate.taskSubmissionStatus ||
                                  (candidate as any).task_submission_status ||
                                  ''
                              )
                                .trim()
                                .toLowerCase() === 'pending review'
                          ).length;
                          const uniquePendingReviews =
                            pendingSprintsCount + pendingTaskReviewsCount;

                          // Collect visible sprint & owner people
                          const visiblePeople: Array<ProjectMember & { uid: string }> = [];
                          const seenPeople = new Set<string>();
                          const addVisiblePerson = (person?: ProjectMember | null) => {
                            if (!person) return;
                            const uid = String(
                              person.uid || person.firebaseUid || person.firebase_uid || ''
                            ).trim();
                            const initials = String(person.initials || '').trim().toUpperCase();
                            const name = String(person.name || '').trim();
                            const key = uid || name.toLowerCase() || initials;
                            if (!key || seenPeople.has(key)) return;
                            seenPeople.add(key);
                            visiblePeople.push({
                              ...person,
                              uid,
                              name,
                              initials: initials || getUserInitials(name),
                              profileImage: getAvatarSource(person),
                              tone: person.tone || 'teal'
                            });
                          };

                          if (task.backendPersistent && project) {
                            const sprintPeople = (project.sprints || []).flatMap((sprint) =>
                              getSprintMembers(project, sprint)
                            );
                            const owner = project.creatorFirebaseUid
                              ? getSprintMembers(project, {
                                  name: '',
                                  memberFirebaseUids: [project.creatorFirebaseUid]
                                })[0]
                              : null;
                            if (owner) sprintPeople.push(owner);
                            sprintPeople.forEach(addVisiblePerson);
                          }
                          const otherVisiblePeople = visiblePeople.filter(
                            (person) => person.uid !== currentUid
                          );

                          const taskProgress =
                            task.status === 'Done'
                              ? 100
                              : task.backendPersistent
                                ? task.status === 'In progress'
                                  ? 50
                                  : 0
                                : task.progress || 0;

                          const isMenuOpen = openStatusMenuTaskId === taskIdStr;
                          const isActiveDetail =
                            asideTaskId !== null && String(asideTaskId) === taskIdStr;

                          return (
                            <article
                              key={taskIdStr}
                              data-id={taskIdStr}
                              draggable={canMoveTask}
                              aria-busy={isUpdating ? 'true' : undefined}
                              title={
                                !canMoveTask && task.backendPersistent
                                  ? moveRestriction || 'This task is currently being updated.'
                                  : undefined
                              }
                              tabIndex={task.backendPersistent && project ? 0 : undefined}
                              aria-label={
                                task.backendPersistent && project
                                  ? `Open project details for ${task.title}`
                                  : undefined
                              }
                              className={`task-card ${cx(
                                'task-card',
                                hasDepWarning && 'has-dependency-warning',
                                task.backendPersistent &&
                                  project &&
                                  'task-card-has-project-details',
                                isActiveDetail && 'is-active-detail'
                              )}${draggingTaskId === taskIdStr ? ' is-dragging' : ''}`}
                              onDragStart={(event) => {
                                if (!canMoveTask) {
                                  event.preventDefault();
                                  return;
                                }
                                event.dataTransfer.setData('text/plain', taskIdStr);
                                event.dataTransfer.effectAllowed = 'move';
                                setDraggingTaskId(taskIdStr);
                              }}
                              onDragEnd={() => {
                                setDraggingTaskId(null);
                                setDragOverCol(null);
                              }}
                              onClick={(event) => {
                                if (!task.backendPersistent || !project) return;
                                const target = event.target as HTMLElement;
                                if (!target.closest('button, a, input, select, textarea, audio, video')) {
                                  openTaskDetails(task.id);
                                }
                              }}
                              onKeyDown={(event) => {
                                if (
                                  task.backendPersistent &&
                                  project &&
                                  (event.key === 'Enter' || event.key === ' ') &&
                                  event.target === event.currentTarget
                                ) {
                                  event.preventDefault();
                                  openTaskDetails(task.id);
                                }
                              }}
                            >
                              <div className={cx('task-top')}>
                                <TaskCountdownBadge task={task} />
                                {task.backendPersistent && (
                                  <span
                                    className={cx(
                                      'task-priority-badge',
                                      `is-${priorityVal}`
                                    )}
                                  >
                                    {priorityLabel} priority
                                  </span>
                                )}
                                <div
                                  className={cx('task-card-action-menu')}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    className={cx('card-more-btn')}
                                    title="Task actions"
                                    aria-label={`Change status for ${task.title}`}
                                    aria-expanded={isMenuOpen}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setOpenStatusMenuTaskId((prev) =>
                                        prev === taskIdStr ? null : taskIdStr
                                      );
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Escape') {
                                        setOpenStatusMenuTaskId(null);
                                      }
                                    }}
                                  >
                                    <SvgIcon name="dots" className="dots-svg" width={14} height={14} />
                                  </button>
                                  <div
                                    className={cx('task-card-status-menu')}
                                    hidden={!isMenuOpen}
                                    role="group"
                                    aria-label={`Move ${task.title} to a status`}
                                  >
                                    {MOVE_STATUSES.map((statusOption) => {
                                      const isCurrent = statusOption === task.status;
                                      return (
                                        <button
                                          key={statusOption}
                                          type="button"
                                          className={cx(
                                            'task-card-status-option',
                                            isCurrent && 'is-current'
                                          )}
                                          disabled={Boolean(
                                            isUpdating || moveRestriction || isCurrent
                                          )}
                                          title={moveRestriction || undefined}
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            setOpenStatusMenuTaskId(null);
                                            void handleMoveStatus(task, statusOption);
                                          }}
                                        >
                                          {statusOption}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>

                              <h4>{task.title}</h4>

                              {visiblePeople.length > 0 && (
                                <div className={cx('task-card-avatar-row')}>
                                  {otherVisiblePeople.map((person, idx) => (
                                    <span
                                      key={person.uid || person.email || `${person.name}-${idx}`}
                                      className={cx('task-card-avatar')}
                                    >
                                      <PersonAvatar person={person} />
                                    </span>
                                  ))}
                                </div>
                              )}

                              {task.backendPersistent &&
                                task.chatMessageId &&
                                task.chatConversationId && (
                                  <button
                                    type="button"
                                    className={cx('task-discussion-link')}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openMessageContext({
                                        projectId: task.projectId || '',
                                        conversationId: task.chatConversationId || '',
                                        messageId: task.chatMessageId || ''
                                      });
                                    }}
                                  >
                                    View discussion
                                  </button>
                                )}

                              <div className={cx('task-meta')}>
                                <span
                                  className={`${
                                    task.due === 'Today' ? 'due today ' : 'due '
                                  }${cx('meta-due-span')}`}
                                >
                                  <SvgIcon
                                    name="calendar"
                                    className="meta-icon"
                                    width={12}
                                    height={12}
                                  />{' '}
                                  <span>{task.due}</span>
                                </span>
                                {task.commentsList && task.commentsList.length > 0 && (
                                  <span className="meta-comment-span">
                                    <SvgIcon
                                      name="message"
                                      className="meta-icon"
                                      width={12}
                                      height={12}
                                    />{' '}
                                    <span>{task.commentsList.length}</span>
                                  </span>
                                )}
                                {hasDepWarning && (
                                  <span
                                    className={cx('task-dependency-warning')}
                                    title="A predecessor task is blocked or its due date moved later."
                                  >
                                    Dependency risk
                                  </span>
                                )}
                                {task.status === 'Done' &&
                                  task.approvalStatus === 'pending_approval' && (
                                    <span className={cx('approval-tag', 'pending')}>
                                      <SvgIcon
                                        name="clock"
                                        className="meta-icon"
                                        width={10}
                                        height={10}
                                      />{' '}
                                      <span>Needs Review</span>
                                    </span>
                                  )}
                                {task.status === 'Done' && task.approvalStatus === 'approved' && (
                                  <span className={cx('approval-tag', 'approved')}>
                                    <SvgIcon
                                      name="check"
                                      className="meta-icon"
                                      width={10}
                                      height={10}
                                    />{' '}
                                    <span>Approved</span>
                                  </span>
                                )}
                              </div>

                              <div className={cx('card-footer')}>
                                <div className={cx('card-footer-main')}>
                                  <div className={cx('task-progress-wrap')}>
                                    <div className={cx('task-progress-header')}>
                                      <span>Progress</span>
                                      <span>{taskProgress}%</span>
                                    </div>
                                    <div
                                      className="progress"
                                      role="progressbar"
                                      aria-valuemin={0}
                                      aria-valuemax={100}
                                      aria-valuenow={taskProgress}
                                      aria-label="Task progress"
                                    >
                                      <span style={{ width: `${taskProgress}%` }}></span>
                                    </div>
                                  </div>
                                </div>
                                {isProjectOwner && uniquePendingReviews > 0 && (
                                  <div className={cx('card-footer-review-row')}>
                                    <span className={cx('task-sprint-review-badge')}>
                                      {uniquePendingReviews} Awaiting Review
                                    </span>
                                  </div>
                                )}
                              </div>
                            </article>
                          );
                        })}
                      </div>

                      {col.allowAdd && canCreateCard && (
                        <button
                          type="button"
                          className={cx('add-card')}
                          data-add={col.status}
                          onClick={() =>
                            setActiveModal({
                              type: 'createTask',
                              projectId: activeProject?.projectId,
                              defaultStatus: col.status
                            })
                          }
                        >
                          + Add task
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {activeDisplayMode === 'list' && (
              <div className={cx('list-view-container')} id="list-view-container">
                <table className={cx('tasks-table')}>
                  <thead>
                    <tr>
                      <th style={{ width: '38px' }}>Done</th>
                      <th>Task Title</th>
                      <th>Project / Tag</th>
                      <th>Due Date</th>
                      <th>Comments</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody id="list-tasks-tbody">
                    {filteredTasks.map((task) => {
                      const moveRestriction = getTaskMoveRestriction(task);
                      const isDone = task.status === 'Done';
                      const commentCount = task.commentsList
                        ? task.commentsList.length
                        : task.comments || 0;

                      return (
                        <tr
                          key={String(task.id)}
                          onClick={() => {
                            if (task.backendPersistent) openTaskDetails(task.id);
                          }}
                        >
                          <td>
                            <button
                              type="button"
                              className={cx('task-checkbox-btn', isDone && 'checked')}
                              disabled={Boolean(moveRestriction)}
                              title={moveRestriction || undefined}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleMoveStatus(task, isDone ? 'To do' : 'Done');
                              }}
                            >
                              <SvgIcon
                                name="check"
                                className="check-icon"
                                width={12}
                                height={12}
                              />
                            </button>
                          </td>
                          <td>
                            <strong>{task.title}</strong>
                          </td>
                          <td>
                            <span className={`tag ${task.tagTone || 'blue'}`}>
                              {task.project} • {task.tag}
                            </span>
                          </td>
                          <td>
                            <span className={cx('meta-due-span')}>
                              <SvgIcon
                                name="calendar"
                                className="meta-icon"
                                width={12}
                                height={12}
                              />{' '}
                              <span>{task.due}</span>
                            </span>
                          </td>
                          <td>
                            <span className="meta-comment-span">
                              <SvgIcon
                                name="message"
                                className="meta-icon"
                                width={12}
                                height={12}
                              />{' '}
                              <span>{commentCount}</span>
                            </span>
                          </td>
                          <td>
                            <span className={`status-badge ${isDone ? 'active' : 'pending'}`}>
                              {task.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
