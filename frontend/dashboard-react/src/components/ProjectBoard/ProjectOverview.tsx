import React, { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  UserPlus,
  X
} from 'lucide-react';
import type { Project, TaskItem } from '../../types/taskViewer';
import { PersonAvatar } from './PersonAvatar';
import styles from './ProjectOverview.module.css';

export interface ProjectOverviewProps {
  project: Project;
  allProjects?: Project[];
  tasks: TaskItem[];
  allTasks?: TaskItem[];
  onSelectProject?: (projectId: string) => void;
  onOpenProgressAside: (taskId: string | number) => void;
  onToggleTaskDone: (taskId: string | number) => void;
  onAddTask?: (projectId: string, title: string) => void;
}

const WEEKLY_BARS = [
  { day: 'Mon', val: 4.8 },
  { day: 'Tue', val: 6.0 },
  { day: 'Wed', val: 4.8 },
  { day: 'Thu', val: 7.0 },
  { day: 'Fri', val: 4.8 },
  { day: 'Sat', val: 3.1 },
  { day: 'Sun', val: 4.0 }
];

const MONTHLY_BARS = [
  { day: 'Mon', val: 6.2 },
  { day: 'Tue', val: 5.4 },
  { day: 'Wed', val: 7.4 },
  { day: 'Thu', val: 6.1 },
  { day: 'Fri', val: 5.9 },
  { day: 'Sat', val: 3.8 },
  { day: 'Sun', val: 4.5 }
];

export const ProjectOverview: React.FC<ProjectOverviewProps> = ({
  project,
  allProjects,
  tasks,
  allTasks,
  onSelectProject,
  onOpenProgressAside,
  onToggleTaskDone,
  onAddTask
}) => {
  const [taskFilter, setTaskFilter] = useState<'all' | 'pending'>('all');
  const [timeframe, setTimeframe] = useState<'Weekly' | 'Monthly'>('Weekly');
  const [activityTab, setActivityTab] = useState<'all' | 'unread' | 'mentions'>('all');
  const [newTaskTitle, setNewTaskTitle] = useState<string>('');
  const [spotlightOffset, setSpotlightOffset] = useState<number>(0);
  const [dismissedActivityIds, setDismissedActivityIds] = useState<Record<string, boolean>>({});

  const projectPool = allProjects && allProjects.length > 0 ? allProjects : [project];
  const taskPool = allTasks && allTasks.length > 0 ? allTasks : tasks;

  const completedCount = tasks.filter((t) => t.status === 'Done').length;
  const inProgressCount = tasks.filter((t) => t.status === 'In progress').length;
  const todoCount = tasks.filter((t) => t.status === 'To do' || t.status === 'Backlog').length;

  const owner = {
    firebaseUid: project.creatorFirebaseUid,
    name: project.creatorName,
    email: project.creatorEmail,
    initials: project.creatorInitials,
    profileImage: project.creatorProfileImage,
    tone: project.creatorTone || 'indigo',
    role: 'Project Owner'
  };

  const visibleTasks = useMemo(() => {
    return tasks.filter((t) => (taskFilter === 'pending' ? t.status !== 'Done' : true));
  }, [tasks, taskFilter]);

  const spotlightProjects = useMemo(() => {
    const ordered = [
      project,
      ...projectPool.filter((p) => p.projectId !== project.projectId)
    ];
    if (ordered.length <= 2) return ordered;
    const start = spotlightOffset % ordered.length;
    return [ordered[start], ordered[(start + 1) % ordered.length]];
  }, [project, projectPool, spotlightOffset]);

  const activityItems = useMemo(() => {
    const today: Array<{
      id: string;
      title: string;
      time: string;
      detail: string;
      unread?: boolean;
    }> = [];
    const yesterday: Array<{
      id: string;
      title: string;
      time: string;
      detail: string;
      unread?: boolean;
    }> = [];

    tasks.forEach((t, idx) => {
      const id = `act-${t.id}`;
      if (dismissedActivityIds[id]) return;

      const timeText = t.updatedAt || (idx < 2 ? 'Today, 2:24pm' : 'Yesterday, 5:10pm');
      const entry = {
        id,
        title: t.title,
        time: timeText,
        detail: `${t.title} · ${timeText}`,
        unread: idx === 0 || t.status === 'In progress'
      };
      if (timeText.toLowerCase().includes('yesterday')) {
        yesterday.push(entry);
      } else {
        today.push(entry);
      }
    });

    const filterList = (list: typeof today) =>
      list.filter((item) => {
        if (activityTab === 'unread' && !item.unread) return false;
        if (
          activityTab === 'mentions' &&
          !item.title.toLowerCase().includes('solutions') &&
          !item.title.toLowerCase().includes('company')
        ) {
          return false;
        }
        return true;
      });

    return {
      today: filterList(today),
      yesterday: filterList(yesterday)
    };
  }, [tasks, activityTab, dismissedActivityIds]);

  const chartData = timeframe === 'Weekly' ? WEEKLY_BARS : MONTHLY_BARS;

  const handleQuickAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTaskTitle.trim();
    if (!trimmed) return;
    onAddTask?.(project.projectId, trimmed);
    setNewTaskTitle('');
  };

  return (
    <div className={styles['overview-canvas']}>
      <div className={styles['overview-layout']}>
        {/* LEFT MAIN COLUMN */}
        <div className={styles['main-col']}>
          {/* Header Row */}
          <header className={styles['top-header']}>
            <div className={styles['top-header-left']}>
              <span className={styles['hero-avatar-ring']}>
                <PersonAvatar person={owner} />
              </span>
              <div className="min-w-0">
                <h1 className={styles['header-title']}>{project.name}</h1>
                <p className={styles['header-subtitle']}>
                  Project Overview · Click any task in the sidebar for full task view
                </p>
              </div>
            </div>

            <button
              type="button"
              className={styles['primary-add-btn']}
              onClick={() => {
                const inputEl = document.getElementById('overview-add-task-input');
                inputEl?.focus();
              }}
            >
              <span className={styles['primary-add-plus']}>
                <Plus size={14} strokeWidth={2.5} />
              </span>
              <span>Add Task</span>
            </button>
          </header>

          {/* 4 KPI Cards */}
          <section className={styles['kpi-grid']} aria-label="Project Metrics">
            <div className={styles['kpi-card']}>
              <span className={styles['kpi-value']}>{tasks.length}</span>
              <span className={styles['kpi-label']}>Total tasks</span>
            </div>
            <div className={styles['kpi-card']}>
              <span className={styles['kpi-value']}>{todoCount}</span>
              <span className={styles['kpi-label']}>Pending tasks</span>
            </div>
            <div className={styles['kpi-card']}>
              <span className={styles['kpi-value']}>{inProgressCount}</span>
              <span className={styles['kpi-label']}>In progress tasks</span>
            </div>
            <div className={styles['kpi-card']}>
              <span className={styles['kpi-value']}>{completedCount}</span>
              <span className={styles['kpi-label']}>Complete tasks</span>
            </div>
          </section>

          {/* Project Overview Spotlight Cards */}
          <section aria-label="Project Overview Cards">
            <div className={styles['section-bar']} style={{ marginBottom: 12 }}>
              <h2 className={styles['section-heading']}>Project Overview</h2>
              <div className={styles['carousel-controls']}>
                <button
                  type="button"
                  className={styles['carousel-btn']}
                  aria-label="Previous project"
                  onClick={() =>
                    setSpotlightOffset((prev) =>
                      prev === 0 ? Math.max(0, projectPool.length - 1) : prev - 1
                    )
                  }
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  className={styles['carousel-btn']}
                  aria-label="Next project"
                  onClick={() => setSpotlightOffset((prev) => prev + 1)}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>

            <div className={styles['spotlight-grid']}>
              {spotlightProjects.map((cardProject) => {
                const cardTasks = taskPool.filter(
                  (t) => t.projectId === cardProject.projectId
                );
                const cardDone = cardTasks.filter((t) => t.status === 'Done').length;
                const pct =
                  cardTasks.length > 0 ? Math.round((cardDone / cardTasks.length) * 100) : 0;
                const radius = 36;
                const circumference = 2 * Math.PI * radius;
                const offset = circumference * (1 - pct / 100);
                const isSelected = cardProject.projectId === project.projectId;
                const activeSprint = cardProject.sprints?.[0]?.name || 'Active Sprint';

                return (
                  <div
                    key={cardProject.projectId}
                    className={`${styles['spotlight-card']} ${
                      isSelected ? styles['is-selected'] : ''
                    }`}
                    onClick={() => onSelectProject?.(cardProject.projectId)}
                    style={{ cursor: onSelectProject ? 'pointer' : 'default' }}
                  >
                    <div className={styles['spotlight-info']}>
                      <div className={styles['spotlight-kicker']}>{activeSprint}</div>
                      <h3 className={styles['spotlight-title']}>{cardProject.name}</h3>
                      <p className={styles['spotlight-desc']}>{cardProject.description}</p>
                      <span className={styles['team-label']}>Assignee</span>
                      <div className={styles['team-row']}>
                        <div className={styles['team-avatar-stack']}>
                          {cardProject.acceptedMembers.slice(0, 4).map((member, idx) => (
                            <span
                              key={member.uid || member.email || idx}
                              className={styles['team-avatar-item']}
                            >
                              <PersonAvatar person={member} />
                            </span>
                          ))}
                        </div>
                        <button
                          type="button"
                          className={styles['team-add-btn']}
                          title="Assign team member"
                          aria-label="Assign team member"
                          onClick={(e) => {
                            e.stopPropagation();
                            document.getElementById('overview-add-task-input')?.focus();
                          }}
                        >
                          <Plus size={13} strokeWidth={2.6} />
                        </button>
                      </div>
                    </div>

                    <div className={styles['ring-wrap']}>
                      <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true">
                        <circle
                          cx="44"
                          cy="44"
                          r={radius}
                          fill="none"
                          stroke="#E5E9F4"
                          strokeWidth="7"
                        />
                        <circle
                          className={styles['ring-progress-stroke']}
                          cx="44"
                          cy="44"
                          r={radius}
                          fill="none"
                          stroke="#6C5CE7"
                          strokeWidth="7"
                          strokeDasharray={circumference}
                          strokeDashoffset={offset}
                          strokeLinecap="round"
                          transform="rotate(-90 44 44)"
                        />
                      </svg>
                      <div className={styles['ring-center']}>
                        <span className={styles['ring-percent']}>{pct}%</span>
                        <span className={styles['ring-tasks']}>{cardTasks.length} Tasks</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Full Project Descriptions + Assignees Card */}
          <section
            className={styles['details-strip-card']}
            aria-label="Project Descriptions and Assignees"
          >
            <div className={styles['details-strip-split']}>
              <div>
                <h3 className={styles['details-block-title']}>Project Descriptions</h3>
                <p className={styles['details-block-copy']}>{project.description}</p>
              </div>
              <div className={styles['details-assignee-col']}>
                <h3 className={styles['details-block-title']}>Assignee</h3>
                <div className={styles['assignee-list-grid']}>
                  {project.acceptedMembers.map((member, idx) => (
                    <div
                      key={member.uid || member.email || idx}
                      className={styles['assignee-chip']}
                    >
                      <PersonAvatar person={member} />
                      <div className={styles['assignee-meta']}>
                        <strong>{member.name}</strong>
                        <span>{member.role || 'Contributor'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Bottom Split: Task Progress + Recent Tasks */}
          <div className={styles['bottom-split-grid']}>
            {/* Task Progress Card */}
            <section className={styles['panel-card']} aria-label="Task Progress">
              <div className={styles['panel-head']}>
                <h2 className={styles['section-heading']}>Task Progress</h2>
                <select
                  className={styles['select-pill']}
                  value={timeframe}
                  aria-label="Select progress timeframe"
                  onChange={(e) => setTimeframe(e.target.value as 'Weekly' | 'Monthly')}
                >
                  <option value="Weekly">Weekly</option>
                  <option value="Monthly">Monthly</option>
                </select>
              </div>

              <div className={styles['progress-metrics-row']}>
                <div className={styles['progress-metric']}>
                  <strong>{completedCount}</strong>
                  <span>Completed</span>
                </div>
                <div className={styles['progress-metric']}>
                  <strong>{inProgressCount}</strong>
                  <span>In Progress</span>
                </div>
                <div className={styles['progress-metric']}>
                  <strong>{todoCount}</strong>
                  <span>To Do</span>
                </div>
              </div>

              <div className={styles['chart-area']}>
                <div className={styles['chart-y-axis']} aria-hidden="true">
                  <span>8</span>
                  <span>6</span>
                  <span>4</span>
                  <span>2</span>
                  <span>0</span>
                </div>
                <div className={styles['chart-bars-wrap']}>
                  <div className={styles['chart-grid-lines']} aria-hidden="true">
                    <span className={styles['chart-grid-line']} />
                    <span className={styles['chart-grid-line']} />
                    <span className={styles['chart-grid-line']} />
                    <span className={styles['chart-grid-line']} />
                    <span className={styles['chart-grid-line']} />
                  </div>
                  {chartData.map((bar) => (
                    <div key={bar.day} className={styles['chart-bar-col']}>
                      <span className={styles['chart-tooltip']}>{bar.val}h</span>
                      <div
                        className={styles['chart-bar']}
                        style={{ height: `${Math.min(100, (bar.val / 8) * 100)}%` }}
                      />
                      <span className={styles['chart-day-label']}>{bar.day}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Recent Tasks Card */}
            <section className={styles['panel-card']} aria-label="Recent Tasks">
              <div className={styles['panel-head']}>
                <h2 className={styles['section-heading']}>Recent Tasks</h2>
                <div className={styles['mini-filter-group']}>
                  <button
                    type="button"
                    className={`${styles['mini-filter-btn']} ${
                      taskFilter === 'all' ? styles['is-active'] : ''
                    }`}
                    onClick={() => setTaskFilter('all')}
                  >
                    All ({tasks.length})
                  </button>
                  <button
                    type="button"
                    className={`${styles['mini-filter-btn']} ${
                      taskFilter === 'pending' ? styles['is-active'] : ''
                    }`}
                    onClick={() => setTaskFilter('pending')}
                  >
                    Pending
                  </button>
                </div>
              </div>

              <div className={styles['recent-tasks-list']}>
                {visibleTasks.map((task) => {
                  const isDone = task.status === 'Done';
                  const people = task.assignees || [];

                  return (
                    <div
                      key={String(task.id)}
                      className={styles['recent-task-tile']}
                      onClick={() => onOpenProgressAside(task.id)}
                    >
                      <div className={styles['recent-task-left']}>
                        <button
                          type="button"
                          className={`${styles['task-check-circle']} ${
                            isDone ? styles['is-done'] : ''
                          }`}
                          aria-label={`Toggle ${task.title}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleTaskDone(task.id);
                          }}
                        >
                          {isDone && <Check size={11} strokeWidth={2.6} />}
                        </button>
                        <div className={styles['recent-task-meta']}>
                          <span
                            className={`${styles['recent-task-name']} ${
                              isDone ? styles['is-done'] : ''
                            }`}
                          >
                            {task.title}
                          </span>
                          <div className={styles['recent-task-sub']}>
                            {task.due ? (
                              <span>{task.due}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <CalendarIcon size={11} />
                                <span>Add date</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className={styles['recent-task-right']}>
                        {people.length > 0 ? (
                          <div className={styles['mini-avatars-stack']}>
                            {people.slice(0, 3).map((person, idx) => (
                              <span key={person.uid || idx}>
                                <PersonAvatar person={person} />
                              </span>
                            ))}
                          </div>
                        ) : (
                          <button
                            type="button"
                            className={styles['assign-ghost-btn']}
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenProgressAside(task.id);
                            }}
                          >
                            <UserPlus size={12} />
                            <span>Assign</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <form className={styles['add-subtask-bar']} onSubmit={handleQuickAddSubmit}>
                <div className={styles['add-subtask-inner']}>
                  <input
                    id="overview-add-task-input"
                    type="text"
                    placeholder="Add new task"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                  />
                  <button type="submit" aria-label="Add new task">
                    <Plus size={15} strokeWidth={2.5} />
                  </button>
                </div>
              </form>
            </section>
          </div>
        </div>

        {/* RIGHT COLUMN: Recent Activity (No Search, No Summary Card) */}
        <aside className={styles['right-col']} aria-label="Recent Activity">
          <div>
            <h2 className={styles['section-heading']} style={{ marginBottom: 12 }}>
              Recent Activity
            </h2>

            <div className={styles['segmented-tabs']} role="tablist" aria-label="Activity filter">
              <button
                type="button"
                role="tab"
                aria-selected={activityTab === 'all'}
                className={`${styles['segmented-tab']} ${
                  activityTab === 'all' ? styles['is-active'] : ''
                }`}
                onClick={() => setActivityTab('all')}
              >
                All
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activityTab === 'unread'}
                className={`${styles['segmented-tab']} ${
                  activityTab === 'unread' ? styles['is-active'] : ''
                }`}
                onClick={() => setActivityTab('unread')}
              >
                Unread
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activityTab === 'mentions'}
                className={`${styles['segmented-tab']} ${
                  activityTab === 'mentions' ? styles['is-active'] : ''
                }`}
                onClick={() => setActivityTab('mentions')}
              >
                I was mentioned
              </button>
            </div>
          </div>

          {activityItems.today.length > 0 && (
            <div>
              <div className={styles['activity-group-label']}>Today</div>
              <div className={styles['activity-cards-stack']}>
                {activityItems.today.map((item) => (
                  <div key={item.id} className={styles['activity-card']}>
                    <span className={styles['activity-badge-icon']} aria-hidden="true">
                      <Check size={15} strokeWidth={2.5} />
                    </span>
                    <div className={styles['activity-card-body']}>
                      <div className={styles['activity-card-head']}>
                        <strong>{item.title}</strong>
                        <span>{item.time}</span>
                      </div>
                      <p className={styles['activity-card-text']}>{item.detail}</p>
                    </div>
                    <button
                      type="button"
                      className={styles['activity-dismiss-btn']}
                      aria-label={`Dismiss ${item.title} activity`}
                      onClick={() =>
                        setDismissedActivityIds((prev) => ({ ...prev, [item.id]: true }))
                      }
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activityItems.yesterday.length > 0 && (
            <div>
              <div className={styles['activity-group-label']}>Yesterday</div>
              <div className={styles['activity-cards-stack']}>
                {activityItems.yesterday.map((item) => (
                  <div key={item.id} className={styles['activity-card']}>
                    <span className={styles['activity-badge-icon']} aria-hidden="true">
                      <Check size={15} strokeWidth={2.5} />
                    </span>
                    <div className={styles['activity-card-body']}>
                      <div className={styles['activity-card-head']}>
                        <strong>{item.title}</strong>
                        <span>{item.time}</span>
                      </div>
                      <p className={styles['activity-card-text']}>{item.detail}</p>
                    </div>
                    <button
                      type="button"
                      className={styles['activity-dismiss-btn']}
                      aria-label={`Dismiss ${item.title} activity`}
                      onClick={() =>
                        setDismissedActivityIds((prev) => ({ ...prev, [item.id]: true }))
                      }
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
