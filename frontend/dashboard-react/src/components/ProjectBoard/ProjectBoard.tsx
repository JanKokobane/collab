import React from 'react';
import {
  AlertCircle,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock,
  FileText,
  Flag,
  Kanban,
  List as ListIcon,
  MoreHorizontal,
  Plus,
  SlidersHorizontal,
  StickyNote,
  UserCircle2,
  UserPlus
} from 'lucide-react';
import { createCx } from '../../utils/cx';
import { SvgIcon } from '../../utils/icons';
import { PersonAvatar } from './PersonAvatar';
import {
  BOARD_COLUMNS,
  DUE_DATE_FILTER_OPTIONS,
  FILTER_OPTIONS,
  MOVE_STATUSES,
  PRIORITY_FILTER_OPTIONS
} from './projectBoardConfig';
import styles from './ProjectBoard.module.css';
import { TaskCountdownBadge } from './TaskCountdownBadge';
import { useProjectBoard } from './useProjectBoard';

const cx = createCx(styles);

export const ProjectBoard: React.FC = () => {
  const {
    activeProject,
    projects,
    tasks,
    activeFilter,
    setActiveFilter,
    activeSprintFilter,
    setActiveSprintFilter,
    activeDisplayMode,
    isCurrentUserProjectCreator,
    openTaskDetails,
    asideTaskId,
    setActiveModal,
    openMessageContext,
    showDashboardToast,
    activeBoardTab,
    boardSummaryExpanded,
    uploadedFiles,
    showAllActivity,
    setShowAllActivity,
    dueDateFilter,
    setDueDateFilter,
    assigneeFilter,
    setAssigneeFilter,
    priorityFilter,
    setPriorityFilter,
    openToolbarDropdown,
    setOpenToolbarDropdown,
    openColumnMenuStatus,
    setOpenColumnMenuStatus,
    openStatusMenuTaskId,
    setOpenStatusMenuTaskId,
    draggingTaskId,
    setDraggingTaskId,
    dragOverCol,
    setDragOverCol,
    updatingTaskIds,
    boardToolbarRef,
    fileInputRef,
    currentUid,
    isProjectView,
    getTaskMoveRestriction,
    filteredTasks,
    boardFilteredTasks,
    statsTasks,
    completedCount,
    dueThisWeekStats,
    teamMembersForStats,
    handleMoveStatus,
    activeDueDateLabel,
    activeAssigneeLabel,
    activePriorityLabel,
    activeAdvanceFilterCount,
    hasAnyToolbarFilter,
    clearAllBoardFilters,
    projectTasksAll,
    projectSprints,
    canCreateCard,
    displayProjectTitle,
    projectOwnerPerson,
    getTaskVisiblePeople,
    recentActivityItems,
    calendarGroups,
    summaryStatusHeadline,
    handleFilePicked
  } = useProjectBoard({ overviewOnly: true });

  const renderSprintsAndBoardHeader = () => (
    <>
      {boardSummaryExpanded && (
        <div className={cx('board-summary-drawer')}>
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
        </div>
      )}

      <div className={cx('board-toolbar')} ref={boardToolbarRef}>
        <div className={cx('board-toolbar-left')}>
          {/* Due Date Dropdown */}
          <div className={cx('toolbar-dropdown-wrap')}>
            <button
              type="button"
              className={cx(
                'toolbar-filter-btn',
                dueDateFilter !== 'all' && 'is-filtered'
              )}
              aria-expanded={openToolbarDropdown === 'dueDate'}
              onClick={(event) => {
                event.stopPropagation();
                setOpenToolbarDropdown((prev) => (prev === 'dueDate' ? null : 'dueDate'));
              }}
            >
              <span className={cx('toolbar-filter-key')}>Due Date</span>
              <span className={cx('toolbar-filter-val')}>{activeDueDateLabel}</span>
              <ChevronDown size={13} strokeWidth={2} />
            </button>

            {openToolbarDropdown === 'dueDate' && (
              <div className={cx('toolbar-popover')} role="menu">
                {DUE_DATE_FILTER_OPTIONS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={cx('filter-item', dueDateFilter === item.key && 'active')}
                    onClick={() => {
                      setDueDateFilter(item.key);
                      setOpenToolbarDropdown(null);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Assignee Dropdown */}
          <div className={cx('toolbar-dropdown-wrap')}>
            <button
              type="button"
              className={cx(
                'toolbar-filter-btn',
                assigneeFilter !== 'all' && 'is-filtered'
              )}
              aria-expanded={openToolbarDropdown === 'assignee'}
              onClick={(event) => {
                event.stopPropagation();
                setOpenToolbarDropdown((prev) => (prev === 'assignee' ? null : 'assignee'));
              }}
            >
              <span className={cx('toolbar-filter-key')}>Assignee</span>
              <span className={cx('toolbar-filter-val')}>{activeAssigneeLabel}</span>
              <ChevronDown size={13} strokeWidth={2} />
            </button>

            {openToolbarDropdown === 'assignee' && (
              <div className={cx('toolbar-popover')} role="menu">
                <button
                  type="button"
                  className={cx('filter-item', assigneeFilter === 'all' && 'active')}
                  onClick={() => {
                    setAssigneeFilter('all');
                    setOpenToolbarDropdown(null);
                  }}
                >
                  All
                </button>
                <button
                  type="button"
                  className={cx('filter-item', assigneeFilter === 'unassigned' && 'active')}
                  onClick={() => {
                    setAssigneeFilter('unassigned');
                    setOpenToolbarDropdown(null);
                  }}
                >
                  Unassigned
                </button>
                {teamMembersForStats.map((member, idx) => {
                  const key = member.uid || member.firebaseUid || member.email || member.name || '';
                  if (!key) return null;
                  return (
                    <button
                      key={`${key}-${idx}`}
                      type="button"
                      className={cx('filter-item', assigneeFilter === key && 'active')}
                      onClick={() => {
                        setAssigneeFilter(key);
                        setOpenToolbarDropdown(null);
                      }}
                    >
                      {member.name || member.email}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Priority Dropdown */}
          <div className={cx('toolbar-dropdown-wrap')}>
            <button
              type="button"
              className={cx(
                'toolbar-filter-btn',
                priorityFilter !== 'all' && 'is-filtered'
              )}
              aria-expanded={openToolbarDropdown === 'priority'}
              onClick={(event) => {
                event.stopPropagation();
                setOpenToolbarDropdown((prev) => (prev === 'priority' ? null : 'priority'));
              }}
            >
              <span className={cx('toolbar-filter-key')}>Priority</span>
              <span className={cx('toolbar-filter-val')}>{activePriorityLabel}</span>
              <ChevronDown size={13} strokeWidth={2} />
            </button>

            {openToolbarDropdown === 'priority' && (
              <div className={cx('toolbar-popover')} role="menu">
                {PRIORITY_FILTER_OPTIONS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={cx('filter-item', priorityFilter === item.key && 'active')}
                    onClick={() => {
                      setPriorityFilter(item.key);
                      setOpenToolbarDropdown(null);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className={cx('toolbar-divider')} aria-hidden="true" />

          {/* Advance Filters (Status Filter + Sprint Filter) */}
          <div className={cx('toolbar-dropdown-wrap')} id="filter-dropdown-wrap">
            <button
              type="button"
              className={cx(
                'toolbar-filter-btn',
                activeAdvanceFilterCount > 0 && 'is-filtered'
              )}
              id="filter-btn"
              aria-expanded={openToolbarDropdown === 'advance'}
              onClick={(event) => {
                event.stopPropagation();
                setOpenToolbarDropdown((prev) => (prev === 'advance' ? null : 'advance'));
              }}
            >
              <SlidersHorizontal size={13} strokeWidth={2} />
              <span>Advance Filters</span>
              {activeAdvanceFilterCount > 0 && (
                <span className={cx('toolbar-filter-badge')}>{activeAdvanceFilterCount}</span>
              )}
            </button>

            {openToolbarDropdown === 'advance' && (
              <div className={cx('toolbar-popover', 'is-advance-popover')} id="filter-menu">
                <div className={cx('advance-popover-section')}>
                  <div className={cx('advance-popover-heading')}>Status & Ownership</div>
                  {FILTER_OPTIONS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={cx('filter-item', activeFilter === item.key && 'active')}
                      data-filter={item.key}
                      onClick={() => {
                        setActiveFilter(item.key);
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {isProjectView && activeProject && (
                  <div className={cx('advance-popover-section')}>
                    <div className={cx('advance-popover-heading')}>Project Sprints</div>
                    <button
                      type="button"
                      className={cx('filter-item', activeSprintFilter === 'all' && 'active')}
                      onClick={() => setActiveSprintFilter('all')}
                    >
                      All Sprints ({projectTasksAll.length})
                    </button>
                    {projectSprints.map((sprint, idx) => {
                      const isSelected = activeSprintFilter === sprint.name;
                      return (
                        <button
                          key={sprint.id || sprint.sprintId || `${sprint.name}-${idx}`}
                          type="button"
                          className={cx('filter-item', isSelected && 'active')}
                          onClick={() =>
                            setActiveSprintFilter(isSelected ? 'all' : sprint.name || 'all')
                          }
                        >
                          {sprint.name}
                        </button>
                      );
                    })}
                    {isCurrentUserProjectCreator && (
                      <button
                        type="button"
                        className={cx('advance-sprint-add-link')}
                        onClick={() => {
                          setOpenToolbarDropdown(null);
                          setActiveModal({ type: 'addSprint', projectId: activeProject.projectId });
                        }}
                      >
                        + Break into Sprint
                      </button>
                    )}
                  </div>
                )}

                {hasAnyToolbarFilter && (
                  <button
                    type="button"
                    className={cx('advance-clear-btn')}
                    onClick={() => {
                      clearAllBoardFilters();
                      setOpenToolbarDropdown(null);
                    }}
                  >
                    Reset all filters
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className={cx('board-toolbar-right')}>
          {canCreateCard && (
            <button
              type="button"
              className={cx('board-add-new-btn')}
              onClick={() =>
                setActiveModal({
                  type: 'createTask',
                  projectId: activeProject?.projectId,
                  defaultStatus: 'To do'
                })
              }
            >
              <Plus size={15} strokeWidth={2.2} />
              <span>Add New</span>
            </button>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className={cx('project-board-shell')}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        aria-hidden="true"
        onChange={handleFilePicked}
      />

      {/* OVERVIEW TAB */}
      {activeBoardTab === 'overview' && (
        <div className={cx('overview-split-grid')}>
          <div className={cx('overview-left-col')}>
            <section aria-labelledby="overview-desc-heading">
              <h2 id="overview-desc-heading" className={cx('overview-section-title')}>
                Project Descriptions
              </h2>
              <p className={cx('overview-description-text')}>
                {activeProject?.description ||
                  "Provides a clear overview of a project's purpose, scope, objectives, and key details. It serves as a guide for all stakeholders involved, ensuring alignment and clarity throughout the project lifecycle."}
              </p>
            </section>

            <hr className={cx('overview-divider')} />

            <section aria-labelledby="overview-assignee-heading">
              <h2 id="overview-assignee-heading" className={cx('overview-section-title')}>
                Assignee
              </h2>
              <div className={cx('overview-assignees-row')}>
                {teamMembersForStats.map((member, idx) => {
                  const isOwner =
                    activeProject?.creatorFirebaseUid &&
                    member.firebaseUid === activeProject.creatorFirebaseUid;
                  const roleLabel = isOwner ? 'Project Owner' : member.role || '';
                  return (
                    <div
                      key={member.firebaseUid || member.email || `${member.name}-${idx}`}
                      className={cx('overview-assignee-item')}
                    >
                      <PersonAvatar person={member} />
                      <div className={cx('overview-assignee-info')}>
                        <span className={cx('overview-assignee-name')}>
                          {member.name || 'Team Member'}
                        </span>
                        {roleLabel ? (
                          <span className={cx('overview-assignee-role')}>{roleLabel}</span>
                        ) : (
                          <button
                            type="button"
                            className={cx('overview-add-role-btn')}
                            onClick={() => {
                              if (activeProject) {
                                setActiveModal({
                                  type: 'manageCollaborators',
                                  projectId: activeProject.projectId
                                });
                              }
                            }}
                          >
                            + Add role
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <hr className={cx('overview-divider')} />

            <section aria-labelledby="overview-recent-tasks-heading">
              <h2 id="overview-recent-tasks-heading" className={cx('overview-section-title')}>
                Recent Tasks
              </h2>

              <div className={cx('recent-tasks-table')}>
                <div className={cx('recent-tasks-head')}>
                  <span>Name</span>
                  <span>Assignee</span>
                  <span>Due Date</span>
                  <span aria-hidden="true" />
                </div>

                {filteredTasks.slice(0, 5).map((task) => {
                  const taskIdStr = String(task.id);
                  const isDone = task.status === 'Done';
                  const moveRestriction = getTaskMoveRestriction(task);
                  const isUpdating = Boolean(updatingTaskIds[taskIdStr]);
                  const taskPeople = getTaskVisiblePeople(task);
                  const isMenuOpen = openStatusMenuTaskId === taskIdStr;
                  const dueLabel = task.due || task.due_date || '';

                  return (
                    <div
                      key={taskIdStr}
                      className={cx('recent-tasks-row')}
                      onClick={() => {
                        if (task.backendPersistent) openTaskDetails(task.id);
                      }}
                    >
                      <div className={cx('recent-task-name-cell')}>
                        <button
                          type="button"
                          className={cx('recent-task-circle-btn', isDone && 'is-done')}
                          aria-label={
                            isDone ? `Mark ${task.title} To do` : `Mark ${task.title} Done`
                          }
                          disabled={Boolean(moveRestriction || isUpdating)}
                          title={moveRestriction || undefined}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleMoveStatus(task, isDone ? 'To do' : 'Done');
                          }}
                        >
                          {isDone && <Check size={11} strokeWidth={2.5} />}
                        </button>
                        <span className={cx('recent-task-title', isDone && 'is-done')}>
                          {task.title}
                        </span>
                      </div>

                      <div className={cx('recent-task-assignee-cell')}>
                        {taskPeople.length > 0 ? (
                          <div className={cx('recent-task-avatars')}>
                            {taskPeople.slice(0, 3).map((person, idx) => (
                              <span
                                key={person.uid || person.email || `${person.name}-${idx}`}
                                className={cx('task-card-avatar')}
                              >
                                <PersonAvatar person={person} />
                              </span>
                            ))}
                          </div>
                        ) : (
                          <button
                            type="button"
                            className={cx('recent-task-placeholder-action')}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (task.backendPersistent) {
                                openTaskDetails(task.id);
                              } else if (activeProject) {
                                setActiveModal({
                                  type: 'manageCollaborators',
                                  projectId: activeProject.projectId
                                });
                              }
                            }}
                          >
                            <UserPlus size={13} strokeWidth={1.8} />
                            <span>Assign</span>
                          </button>
                        )}
                      </div>

                      <div className={cx('recent-task-date-cell')}>
                        {dueLabel ? (
                          <span>{dueLabel}</span>
                        ) : (
                          <button
                            type="button"
                            className={cx('recent-task-placeholder-action')}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (task.backendPersistent) openTaskDetails(task.id);
                            }}
                          >
                            <CalendarIcon size={13} strokeWidth={1.8} />
                            <span>Add date</span>
                          </button>
                        )}
                      </div>

                      <div
                        className={cx('recent-task-more-cell', 'task-card-action-menu')}
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
                                disabled={Boolean(isUpdating || moveRestriction || isCurrent)}
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
                  );
                })}
              </div>

            </section>
          </div>

          <aside className={cx('overview-right-col')} aria-label="Project Summary">
            {canCreateCard && (
              <button
                type="button"
                className={cx('overview-add-task-button')}
                onClick={() =>
                  setActiveModal({
                    type: 'createTask',
                    projectId: activeProject?.projectId,
                    defaultStatus: 'To do'
                  })
                }
              >
                <Plus size={14} strokeWidth={2.2} />
                <span>Add Task</span>
              </button>
            )}
            <h2 className={cx('overview-section-title')}>Summary</h2>

            <div className={cx('summary-status-card')}>
              <div className={cx('summary-status-body')}>
                <h3 className={cx('summary-status-title')}>{summaryStatusHeadline}</h3>
                <p className={cx('summary-status-copy')}>
                  This project focuses on delivering a streamlined and efficient solution to meet
                  business needs ({completedCount} of {statsTasks.length} tasks completed,{' '}
                  {dueThisWeekStats.pending} due this week).
                </p>
                <p className={cx('summary-status-note')}>
                  Carefully planned to achieve success. 🚀
                </p>
                <div className={cx('summary-owner-row')}>
                  <PersonAvatar person={projectOwnerPerson} />
                  <div className={cx('summary-owner-meta')}>
                    <strong>{projectOwnerPerson.name}</strong>
                    <span>Project Owner</span>
                  </div>
                </div>
              </div>
            </div>

            <div className={cx('recent-activity-card')}>
              <h3 className={cx('recent-activity-title')}>Recent Activity</h3>
              <div className={cx('activity-timeline')}>
                {recentActivityItems.map((item) => (
                  <div key={item.id} className={cx('activity-item')}>
                    <span className={cx('activity-check-dot')} aria-hidden="true">
                      <Check size={11} strokeWidth={2.6} />
                    </span>
                    <span className={cx('activity-text')}>
                      <strong>{item.text}</strong>
                      <span className={cx('activity-time')}>· {item.time}</span>
                    </span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className={cx('activity-view-all-btn')}
                onClick={() => {
                  setShowAllActivity((previous) => !previous);
                }}
              >
                {showAllActivity ? 'Show Less' : 'View All'}
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* BOARD / LIST TABS */}
      {(activeBoardTab === 'board' || activeBoardTab === 'list') && (
        <>
          {renderSprintsAndBoardHeader()}

          <div id="board-container">
            <div className="workspace-split-layout" id="workspace-split-layout">
              <div className="workspace-main-panel" id="workspace-main-panel">
                {activeDisplayMode === 'board' && (
                  <div className={cx('board')} id="board-columns">
                    {BOARD_COLUMNS.map((col) => {
                      const colTasks = boardFilteredTasks.filter(
                        (t) => (t.status || (t.done ? 'Done' : 'To do')) === col.status
                      );
                      const isDragOver = dragOverCol === col.status;
                      const colToneKey = col.status.toLowerCase().replace(/\s+/g, '-');
                      const isColMenuOpen = openColumnMenuStatus === col.status;

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
                            <span className={cx('col-status-pill', `tone-${colToneKey}`)}>
                              {col.status === 'To do' && <Circle size={12} strokeWidth={2.2} />}
                              {col.status === 'In progress' && (
                                <Clock size={12} strokeWidth={2.2} />
                              )}
                              {col.status === 'Done' && (
                                <CheckCircle2 size={12} strokeWidth={2.2} />
                              )}
                              {col.status === 'Backlog' && (
                                <CheckCircle2 size={12} strokeWidth={2.2} />
                              )}
                              {col.status === 'Blocked' && (
                                <AlertCircle size={12} strokeWidth={2.2} />
                              )}
                              <span>{col.status}</span>
                            </span>
                            <span className={cx('col-count-label')} id={col.countId}>
                              {colTasks.length}
                            </span>

                            <div
                              className={cx('col-header-actions')}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <div className={cx('col-menu-wrap')}>
                                <button
                                  type="button"
                                  className={cx('col-icon-btn')}
                                  aria-label={`${col.status} column options`}
                                  aria-expanded={isColMenuOpen}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setOpenColumnMenuStatus((prev) =>
                                      prev === col.status ? null : col.status
                                    );
                                  }}
                                >
                                  <MoreHorizontal size={15} strokeWidth={2} />
                                </button>
                                {isColMenuOpen && (
                                  <div className={cx('col-actions-menu')} role="menu">
                                    {canCreateCard && (
                                      <button
                                        type="button"
                                        className={cx('filter-item')}
                                        onClick={() => {
                                          setOpenColumnMenuStatus(null);
                                          setActiveModal({
                                            type: 'createTask',
                                            projectId: activeProject?.projectId,
                                            defaultStatus: col.status
                                          });
                                        }}
                                      >
                                        + Add task to {col.status}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className={cx('filter-item')}
                                      onClick={() => {
                                        setOpenColumnMenuStatus(null);
                                        const map: Record<
                                          string,
                                          'todo' | 'progress' | 'blocked' | 'done' | 'backlog'
                                        > = {
                                          'To do': 'todo',
                                          'In progress': 'progress',
                                          Blocked: 'blocked',
                                          Done: 'done',
                                          Backlog: 'backlog'
                                        };
                                        setActiveFilter(map[col.status] || 'all');
                                      }}
                                    >
                                      Filter only {col.status}
                                    </button>
                                    {activeFilter !== 'all' && (
                                      <button
                                        type="button"
                                        className={cx('filter-item')}
                                        onClick={() => {
                                          setOpenColumnMenuStatus(null);
                                          setActiveFilter('all');
                                        }}
                                      >
                                        Show all columns
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>

                              {canCreateCard && (
                                <button
                                  type="button"
                                  className={cx('col-icon-btn')}
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
                                  <Plus size={15} strokeWidth={2} />
                                </button>
                              )}
                            </div>
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
                                    (d) =>
                                      typeof d === 'object' &&
                                      Boolean((d as { warning_reason?: string }).warning_reason)
                                  )
                              );

                              const priorityVal = (task.priority || '').toLowerCase();
                              const priorityText =
                                priorityVal === 'high'
                                  ? 'High Priority'
                                  : priorityVal === 'low'
                                    ? 'Low Priority'
                                    : priorityVal === 'medium'
                                      ? 'Normal Priority'
                                      : '-';

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
                                      (candidate as { task_submission_status?: string })
                                        .task_submission_status ||
                                      ''
                                  )
                                    .trim()
                                    .toLowerCase() === 'pending review'
                              ).length;
                              const uniquePendingReviews =
                                pendingSprintsCount + pendingTaskReviewsCount;

                              const visiblePeople = getTaskVisiblePeople(task);

                              const taskProgress =
                                task.status === 'Done'
                                  ? 100
                                  : task.backendPersistent
                                    ? task.progress || (task.status === 'In progress' ? 55 : 0)
                                    : task.progress || 0;

                              const showProgressRing =
                                task.status === 'In progress' ||
                                (taskProgress > 0 && taskProgress < 100);
                              const ringCircumference = 2 * Math.PI * 7;
                              const ringOffset =
                                ringCircumference * (1 - Math.min(100, Math.max(0, taskProgress)) / 100);

                              const dueLabel = task.due || task.due_date || '';
                              const hasBackendExtras = Boolean(
                                (task.commentsList && task.commentsList.length > 0) ||
                                  (task.backendPersistent &&
                                    task.chatMessageId &&
                                    task.chatConversationId) ||
                                  hasDepWarning ||
                                  (task.status === 'Done' &&
                                    (task.approvalStatus === 'pending_approval' ||
                                      task.approvalStatus === 'approved')) ||
                                  (isProjectOwner && uniquePendingReviews > 0)
                              );

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
                                    if (
                                      !target.closest(
                                        'button, a, input, select, textarea, audio, video'
                                      )
                                    ) {
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
                                  <div className={cx('card-title-row')}>
                                    <h4>{task.title}</h4>
                                    <div className={cx('card-title-right')}>
                                      {showProgressRing && (
                                        <svg
                                          className={cx('card-progress-ring')}
                                          width="18"
                                          height="18"
                                          viewBox="0 0 18 18"
                                          role="progressbar"
                                          aria-valuemin={0}
                                          aria-valuemax={100}
                                          aria-valuenow={taskProgress}
                                          aria-label={`Progress ${taskProgress}%`}
                                        >
                                          <circle
                                            cx="9"
                                            cy="9"
                                            r="7"
                                            fill="none"
                                            stroke="#E2E8F0"
                                            strokeWidth="2.2"
                                          />
                                          <circle
                                            cx="9"
                                            cy="9"
                                            r="7"
                                            fill="none"
                                            stroke="#2563EB"
                                            strokeWidth="2.2"
                                            strokeDasharray={ringCircumference}
                                            strokeDashoffset={ringOffset}
                                            strokeLinecap="round"
                                            transform="rotate(-90 9 9)"
                                          />
                                        </svg>
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
                                          <MoreHorizontal size={15} strokeWidth={2} />
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
                                  </div>

                                  <div className={cx('card-dashed-divider')} />

                                  <div className={cx('card-meta-list')}>
                                    {/* Row 1: Assignees */}
                                    <div className={cx('card-meta-row')}>
                                      <UserCircle2
                                        size={14}
                                        strokeWidth={1.8}
                                        className={cx('card-meta-icon')}
                                      />
                                      {visiblePeople.length > 0 ? (
                                        <div className={cx('task-card-avatar-row')}>
                                          {visiblePeople.slice(0, 4).map((person, idx) => (
                                            <span
                                              key={
                                                person.uid ||
                                                person.email ||
                                                `${person.name}-${idx}`
                                              }
                                              className={cx('task-card-avatar')}
                                            >
                                              <PersonAvatar person={person} />
                                            </span>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className={cx('card-meta-empty')}>-</span>
                                      )}
                                    </div>

                                    {/* Row 2: Due Date + Inline Overdue / Countdown */}
                                    <div className={cx('card-meta-row')}>
                                      <CalendarIcon
                                        size={14}
                                        strokeWidth={1.8}
                                        className={cx('card-meta-icon')}
                                      />
                                      <span
                                        className={cx(
                                          'card-meta-date-text',
                                          !dueLabel && 'card-meta-empty'
                                        )}
                                      >
                                        {dueLabel || '-'}
                                      </span>
                                      <TaskCountdownBadge task={task} variant="inline" />
                                    </div>

                                    {/* Row 3: Priority */}
                                    <div className={cx('card-meta-row')}>
                                      <Flag
                                        size={14}
                                        strokeWidth={2}
                                        className={cx(
                                          'card-priority-flag',
                                          priorityVal === 'high' && 'is-high',
                                          priorityVal === 'medium' && 'is-medium',
                                          priorityVal === 'low' && 'is-low'
                                        )}
                                        fill={
                                          priorityVal === 'high' ||
                                          priorityVal === 'medium' ||
                                          priorityVal === 'low'
                                            ? 'currentColor'
                                            : 'none'
                                        }
                                      />
                                      <span
                                        className={cx(
                                          'card-priority-text',
                                          priorityVal === 'high' && 'is-high',
                                          !priorityVal && 'card-meta-empty'
                                        )}
                                      >
                                        {priorityText}
                                      </span>
                                    </div>
                                  </div>

                                  {hasBackendExtras && (
                                    <div className={cx('card-backend-extras')}>
                                      {task.commentsList && task.commentsList.length > 0 && (
                                        <span className={cx('card-extra-chip')}>
                                          <SvgIcon
                                            name="message"
                                            className="meta-icon"
                                            width={11}
                                            height={11}
                                          />
                                          <span>{task.commentsList.length}</span>
                                        </span>
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
                                      {task.status === 'Done' &&
                                        task.approvalStatus === 'approved' && (
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
                                      {isProjectOwner && uniquePendingReviews > 0 && (
                                        <span className={cx('task-sprint-review-badge')}>
                                          {uniquePendingReviews} Awaiting Review
                                        </span>
                                      )}
                                    </div>
                                  )}
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
                        {boardFilteredTasks.map((task) => {
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
                                  {task.project} • {task.tag || 'Task'}
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
                                  <span>{task.due || 'Add date'}</span>
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
      )}

      {/* CALENDAR TAB */}
      {activeBoardTab === 'calendar' && (
        <section className={cx('calendar-view-card')} aria-label="Project Calendar">
          <div className={cx('files-toolbar')}>
            <div>
              <h2 className={cx('overview-section-title')}>Schedule & Deadlines</h2>
              <p className={cx('overview-description-text')}>
                Tasks grouped by due date across {displayProjectTitle}.
              </p>
            </div>
            {canCreateCard && (
              <button
                type="button"
                className="primary-button"
                onClick={() =>
                  setActiveModal({
                    type: 'createTask',
                    projectId: activeProject?.projectId,
                    defaultStatus: 'To do'
                  })
                }
              >
                + Add Task
              </button>
            )}
          </div>

          <div className={cx('calendar-grid')}>
            {calendarGroups.map(([dateLabel, dayTasks]) => (
              <div key={dateLabel} className={cx('calendar-day-box')}>
                <span className={cx('calendar-day-label')}>{dateLabel}</span>
                {dayTasks.map((task) => (
                  <div
                    key={String(task.id)}
                    className={cx('calendar-task-item')}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (task.backendPersistent) openTaskDetails(task.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && task.backendPersistent) {
                        openTaskDetails(task.id);
                      }
                    }}
                  >
                    <strong>{task.title}</strong>
                    <small>
                      {task.status} · {task.priority || 'medium'} priority
                    </small>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* FILES TAB */}
      {activeBoardTab === 'files' && (
        <section className={cx('files-view-card')} aria-label="Project Files">
          <div className={cx('files-toolbar')}>
            <div>
              <h2 className={cx('overview-section-title')}>Project Files</h2>
              <p className={cx('overview-description-text')}>
                Upload specifications, design assets, and reference documents to {displayProjectTitle}.
              </p>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload a File
            </button>
          </div>

          <div className={cx('files-list')}>
            {uploadedFiles.length === 0 ? (
              <div className={cx('file-row')}>
                <div className={cx('file-row-left')}>
                  <span className={cx('file-row-icon')}>
                    <FileText size={17} />
                  </span>
                  <div className={cx('file-row-meta')}>
                    <strong>No files uploaded yet</strong>
                    <small>Click &ldquo;Upload a File&rdquo; to attach documents to this project.</small>
                  </div>
                </div>
              </div>
            ) : (
              uploadedFiles.map((file) => (
                <div key={file.id} className={cx('file-row')}>
                  <div className={cx('file-row-left')}>
                    <span className={cx('file-row-icon')}>
                      <FileText size={17} />
                    </span>
                    <div className={cx('file-row-meta')}>
                      <strong>{file.name}</strong>
                      <small>
                        {file.size} · Uploaded by {file.uploadedBy} · {file.uploadedAt}
                      </small>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
};
