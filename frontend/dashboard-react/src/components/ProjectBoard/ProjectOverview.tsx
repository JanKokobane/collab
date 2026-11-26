import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { AnimatedAnalyticsGraphic } from './AnimatedAnalyticsGraphic';
import { PersonAvatar } from './PersonAvatar';
import styles from './ProjectOverview.module.css';

export interface ProjectOverviewProps {
  project: Project;
  allProjects?: Project[];
  tasks: TaskItem[];
  allTasks?: TaskItem[];
  sprintsLoading?: boolean;
  sprintsLoadError?: string;
  onRetrySprints?: () => void;
  canViewTaskMetrics: boolean;
  onSelectProject?: (projectId: string) => void;
  onOpenProgressAside: (taskId: string | number) => void;
  onToggleTaskDone: (taskId: string | number) => void;
  onCreateSprint?: (projectId: string) => void;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const AnimatedMetric: React.FC<{ value: number }> = ({ value }) => {
  const [displayedValue, setDisplayedValue] = useState(0);
  const displayedValueRef = useRef(0);

  useEffect(() => {
    const startValue = displayedValueRef.current;
    const startTime = performance.now();
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500;
    let frameId = 0;

    const update = (now: number) => {
      const progress = duration === 0 ? 1 : Math.min((now - startTime) / duration, 1);
      const easedProgress = 1 - (1 - progress) ** 3;
      const nextValue = Math.round(startValue + (value - startValue) * easedProgress);
      displayedValueRef.current = nextValue;
      setDisplayedValue(nextValue);
      if (progress < 1) frameId = requestAnimationFrame(update);
    };

    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [value]);

  return <span className={styles['kpi-value']}>{displayedValue}</span>;
};

function formatActivityTime(raw?: string | null): string {
  if (!raw) return 'Recently';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return String(raw);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(parsed);
}

export const ProjectOverview: React.FC<ProjectOverviewProps> = ({
  project,
  allProjects,
  tasks,
  canViewTaskMetrics,
  sprintsLoading = false,
  sprintsLoadError = '',
  onRetrySprints,
  onOpenProgressAside,
  onToggleTaskDone,
  onCreateSprint
}) => {
  const [taskFilter, setTaskFilter] = useState<'all' | 'pending'>('all');
  const [timeframe, setTimeframe] = useState<'Weekly' | 'Monthly'>('Weekly');
  const [activityTab, setActivityTab] = useState<'all' | 'unread' | 'mentions'>('all');
  const [spotlightOffset, setSpotlightOffset] = useState<number>(0);
  const [dismissedActivityIds, setDismissedActivityIds] = useState<Record<string, boolean>>({});

  const projectPool = allProjects && allProjects.length > 0 ? allProjects : [project];
  const completedCount = tasks.filter((t) => t.status === 'Done').length;
  const inProgressCount = tasks.filter((t) => t.status === 'In progress').length;
  const todoCount = tasks.filter((t) => t.status === 'To do' || t.status === 'Backlog').length;
  const todayKey = new Date().toISOString().slice(0, 10);
  const dueSoonLimit = new Date(`${todayKey}T00:00:00Z`);
  dueSoonLimit.setUTCDate(dueSoonLimit.getUTCDate() + 7);
  const dueSoonLimitKey = dueSoonLimit.toISOString().slice(0, 10);
  const overdueCount = tasks.filter((task) => {
    const dueDate = (task.date || task.due_date || '').slice(0, 10);
    return dueDate && dueDate < todayKey && task.status !== 'Done';
  }).length;
  const dueSoonCount = tasks.filter((task) => {
    const dueDate = (task.date || task.due_date || '').slice(0, 10);
    return dueDate && dueDate >= todayKey && dueDate <= dueSoonLimitKey && task.status !== 'Done';
  }).length;
  const visibleTasks = useMemo(() => {
    return tasks.filter((t) => (taskFilter === 'pending' ? t.status !== 'Done' : true));
  }, [tasks, taskFilter]);

  const spotlightProjects = useMemo(() => {
    const ordered = [
      project,
      ...projectPool.filter((p) => p.projectId !== project.projectId)
    ];
    if (ordered.length <= 1) return ordered;
    const start = spotlightOffset % ordered.length;
    return [ordered[start], ordered[(start + 1) % ordered.length]];
  }, [project, projectPool, spotlightOffset]);
  const detailsProject = spotlightProjects[0] || project;
  const showPreviousProject = () =>
    setSpotlightOffset((prev) =>
      prev === 0 ? Math.max(0, projectPool.length - 1) : prev - 1
    );
  const showNextProject = () => setSpotlightOffset((prev) => prev + 1);

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

    const nowDateKey = new Date().toISOString().slice(0, 10);

    tasks.forEach((t, idx) => {
      const id = `act-${t.id}`;
      if (dismissedActivityIds[id]) return;

      const rawTime = t.updatedAt || t.createdAt;
      const timeText = formatActivityTime(rawTime);
      const isToday = rawTime ? String(rawTime).slice(0, 10) === nowDateKey : idx < 2;
      const entry = {
        id,
        title: t.title,
        time: timeText,
        detail: `${t.status || 'To do'}${t.sprint ? ` · ${t.sprint}` : ''}`,
        unread: t.status === 'In progress' || t.status === 'Blocked'
      };
      if (isToday) {
        today.push(entry);
      } else {
        yesterday.push(entry);
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

  const chartData = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    tasks.forEach((t, index) => {
      const raw = t.updatedAt || t.createdAt || t.due_date || t.date;
      let dayIdx = index % 7;
      if (raw) {
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) {
          const jsDay = parsed.getDay();
          dayIdx = jsDay === 0 ? 6 : jsDay - 1;
        }
      }
      counts[dayIdx] += t.status === 'Done' ? 2 : t.status === 'In progress' ? 1.5 : 1;
    });
    const multiplier = timeframe === 'Monthly' ? 1.25 : 1;
    return DAY_LABELS.map((day, idx) => ({
      day,
      val: Number(Math.min(8, counts[idx] * multiplier).toFixed(1))
    }));
  }, [tasks, timeframe]);

  return (
    <div className={styles['overview-canvas']}>
      <div className={styles['overview-layout']}>
        {/* LEFT MAIN COLUMN */}
        <div className={styles['main-col']}>
          {/* Task metric cards */}
          <div className={styles['metrics-section']}>
            {onCreateSprint && (
              <div className={styles['metrics-actions']}>
                <button
                  type="button"
                  className={styles['create-task-button']}
                  onClick={() => onCreateSprint?.(project.projectId)}
                >
                  <Plus size={14} strokeWidth={2.5} />
                  Create Sprint
                </button>
              </div>
            )}
            {canViewTaskMetrics && (
              <section className={styles['kpi-grid']} aria-label="Project Metrics">
                <div className={styles['kpi-card']}>
                  <div className={styles['kpi-count-row']}>
                    <AnimatedMetric value={tasks.length} />
                    <AnimatedAnalyticsGraphic />
                  </div>
                  <span className={styles['kpi-label']}>Total tasks</span>
                </div>
                <div className={styles['kpi-card']}>
                  <div className={styles['kpi-count-row']}>
                    <AnimatedMetric value={todoCount} />
                    <AnimatedAnalyticsGraphic variant="pending" />
                  </div>
                  <span className={styles['kpi-label']}>Pending tasks</span>
                </div>
                <div className={styles['kpi-card']}>
                  <div className={styles['kpi-count-row']}>
                    <AnimatedMetric value={inProgressCount} />
                    <AnimatedAnalyticsGraphic variant="in-progress" />
                  </div>
                  <span className={styles['kpi-label']}>In progress</span>
                </div>
                <div className={styles['kpi-card']}>
                  <div className={styles['kpi-count-row']}>
                    <AnimatedMetric value={completedCount} />
                    <AnimatedAnalyticsGraphic variant="complete" />
                  </div>
                  <span className={styles['kpi-label']}>Complete tasks</span>
                </div>
                <div className={styles['kpi-card']}>
                  <div className={styles['kpi-count-row']}>
                    <AnimatedMetric value={overdueCount} />
                    <AnimatedAnalyticsGraphic variant="overdue" />
                  </div>
                  <span className={styles['kpi-label']}>Overdue tasks</span>
                </div>
                <div className={styles['kpi-card']}>
                  <div className={styles['kpi-count-row']}>
                    <AnimatedMetric value={dueSoonCount} />
                    <AnimatedAnalyticsGraphic variant="due-soon" />
                  </div>
                  <span className={styles['kpi-label']}>Due soon</span>
                </div>
              </section>
            )}
          </div>

          {/* Full Project Descriptions + Assignees Card */}
          <section
            className={`${styles['details-strip-card']} ${styles['details-strip-overview']}`}
            aria-label="Project Descriptions and Assignees"
          >
            <div className={styles['details-strip-split']}>
              <div>
                <h3 className={styles['details-block-title']}>Project Descriptions</h3>
                <p className={styles['details-block-copy']}>
                  {project.description || 'No project description provided yet.'}
                </p>
              </div>
              <div className={styles['details-assignee-col']}>
                <div className={styles['details-project-overview']}>
                  <div className={`${styles['section-bar']} ${styles['details-overview-controls']}`}>
                    <div className={styles['carousel-controls']}>
                      <button
                        type="button"
                        className={styles['carousel-btn']}
                        aria-label="Previous project"
                        onClick={showPreviousProject}
                      >
                        <ChevronLeft size={15} />
                      </button>
                      <button
                        type="button"
                        className={styles['carousel-btn']}
                        aria-label="Next project"
                        onClick={showNextProject}
                      >
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  </div>
                  <div className={styles['details-overview-content']}>
                    <div className={styles['spotlight-info']}>
                      <span className={styles['spotlight-kicker']}>
                        {detailsProject.sprints?.[0]?.name || 'Active Sprint'}
                      </span>
                      <h3 className={styles['spotlight-title']}>{detailsProject.name}</h3>
                      <p className={styles['spotlight-desc']}>
                        {detailsProject.description || 'No project description provided yet.'}
                      </p>
                      <span className={styles['team-label']}>Assignee</span>
                      <div className={styles['team-row']}>
                        <div className={styles['team-avatar-stack']}>
                          {detailsProject.acceptedMembers.slice(0, 4).map((member, idx) => (
                            <span
                              key={member.uid || member.email || idx}
                              className={styles['team-avatar-item']}
                            >
                              <PersonAvatar person={member} size={24} />
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className={`${styles['panel-card']} ${styles['project-sprints']}`} id="project-sprints">
            <div className={styles['panel-head']}>
              <div>
                <h2 className={styles['section-heading']}>Project Sprints</h2>
                <span className={styles['project-sprints-count']}>
                  {project.sprints.length} planned
                </span>
              </div>
            </div>
            {sprintsLoading ? (
              <div className={styles['empty-state-box']} role="status">
                Loading project sprints…
              </div>
            ) : sprintsLoadError ? (
              <div className={styles['sprints-error']} role="alert">
                <span>{sprintsLoadError}</span>
                {onRetrySprints && (
                  <button type="button" onClick={onRetrySprints}>
                    Retry
                  </button>
                )}
              </div>
            ) : project.sprints.length === 0 ? (
              <div className={styles['empty-state-box']}>No sprints in this project yet.</div>
            ) : (
              <div className={styles['project-sprints-list']}>
                {project.sprints.map((sprint) => {
                  const startDate = sprint.startDate || sprint.start_date;
                  const dueDate =
                    sprint.dueDate || sprint.due_date || sprint.endDate || sprint.end_date;

                  return (
                    <article
                      className={styles['project-sprint-card']}
                      key={sprint.id || sprint.sprintId || sprint.name}
                    >
                      <div className={styles['project-sprint-card-heading']}>
                        <h3>{sprint.name}</h3>
                        <span>{sprint.status || 'Upcoming'}</span>
                      </div>
                      {sprint.description && (
                        <p className={styles['project-sprint-description']}>
                          {sprint.description}
                        </p>
                      )}
                      {(startDate || dueDate) && (
                        <p className={styles['project-sprint-dates']}>
                          {startDate ? `Starts ${String(startDate).slice(0, 10)}` : ''}
                          {startDate && dueDate ? ' · ' : ''}
                          {dueDate ? `Due ${String(dueDate).slice(0, 10)}` : ''}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Bottom Split: Task Progress + Recent  Tasks */}
          <div className={styles['bottom-split-grid']}>
            {/* Task Progress Card */}
            {canViewTaskMetrics && (
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
            )}

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
                {visibleTasks.length === 0 ? (
                  <div className={styles['empty-state-box']}>
                    {taskFilter === 'pending'
                      ? 'All tasks in this project are completed.'
                      : 'No tasks in this project yet.'}
                  </div>
                ) : (
                  visibleTasks.map((task) => {
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
                              {task.due && task.due !== '—' ? (
                                <span>{task.due}</span>
                              ) : (
                                <span className={styles['add-date-inline']}>
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
                                <span key={person.uid || person.firebaseUid || idx}>
                                  <PersonAvatar person={person} size={24} />
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
                              <span>Open</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

            </section>

            <aside
              className={`${styles['panel-card']} ${styles['right-col']}`}
              aria-label="Recent Activity"
            >
              <div>
                <h2 className={styles['section-heading']} style={{ marginBottom: 12 }}>
                  Recent Activity
                </h2>

                <div
                  className={styles['segmented-tabs']}
                  role="tablist"
                  aria-label="Activity filter"
                >
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

              {activityItems.today.length === 0 && activityItems.yesterday.length === 0 && (
                <div className={styles['empty-state-box']}>
                  No recent activity to display for this filter.
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
};
