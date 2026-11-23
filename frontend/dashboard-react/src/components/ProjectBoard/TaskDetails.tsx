import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  ClipboardList,
  Clock,
  FileText,
  Flag,
  Kanban,
  List as ListIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserCircle2,
  UserPlus,
  Users,
  X
} from 'lucide-react';
import type {
  BoardCardItem,
  BoardColumnStatus,
  Project,
  ProjectMember,
  TaskAttachment,
  TaskComment,
  TaskItem,
  TaskStatus,
  TaskSubtask
} from '../../types/taskViewer';
import { PersonAvatar } from './PersonAvatar';
import styles from './TaskDetails.module.css';

type TaskViewerTab = 'overview' | 'list' | 'board' | 'calendar' | 'files';
type DueFilterKey = 'all' | 'march17' | 'overdue' | 'unscheduled';
type PriorityFilterKey = 'all' | 'high' | 'normal' | 'low';
type ToolbarDropdown = 'due' | 'assignee' | 'priority' | 'advance' | null;

export interface TaskDetailsProps {
  task: TaskItem | null;
  project?: Project | null;
  comments?: TaskComment[];
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  onClose?: () => void;
  onStatusChange?: (taskId: string | number, status: TaskStatus) => void;
  onToggleSubtask?: (taskId: string | number, subtaskId: string) => void;
  onAddSubtask?: (taskId: string | number, title: string) => void;
  onAddComment?: (taskId: string | number, text: string) => void;
  onUploadAttachment?: (taskId: string | number, files: TaskAttachment[]) => void;
  onRenameTask?: (taskId: string | number, nextTitle: string) => void;
}

const STATUS_OPTIONS: TaskStatus[] = ['To do', 'In progress', 'Done', 'Blocked', 'Backlog'];

const BOARD_COLUMNS: Array<{
  status: BoardColumnStatus;
  toneClass: string;
}> = [
  { status: 'Pending', toneClass: 'tone-pending' },
  { status: 'In Progress', toneClass: 'tone-in-progress' },
  { status: 'Completed', toneClass: 'tone-completed' },
  { status: 'Launched', toneClass: 'tone-launched' }
];

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    timeZone: 'UTC',
    dateStyle: 'medium'
  }).format(date);
}

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

export const TaskDetails: React.FC<TaskDetailsProps> = ({
  task,
  project,
  comments: propComments,
  loading = false,
  error = '',
  onRetry,
  onClose,
  onStatusChange,
  onToggleSubtask,
  onAddSubtask,
  onAddComment,
  onUploadAttachment,
  onRenameTask
}) => {
  const [activeTab, setActiveTab] = useState<TaskViewerTab>('overview');
  const [quickActionsExpanded, setQuickActionsExpanded] = useState<boolean>(true);
  const [automationOpen, setAutomationOpen] = useState<boolean>(false);
  const [showAllActivity, setShowAllActivity] = useState<boolean>(false);
  const [addingSubtask, setAddingSubtask] = useState<boolean>(false);
  const [subtaskDraft, setSubtaskDraft] = useState<string>('');
  const [commentDraft, setCommentDraft] = useState<string>('');
  const [editingTitle, setEditingTitle] = useState<boolean>(false);
  const [titleDraft, setTitleDraft] = useState<string>('');
  const [shareCopied, setShareCopied] = useState<boolean>(false);

  // Interactive Board / List / Calendar / Files state (seeded with mock data for now)
  const [boardItems, setBoardItems] = useState<BoardCardItem[]>([]);
  const [localFiles, setLocalFiles] = useState<TaskAttachment[]>([]);
  const [dueFilter, setDueFilter] = useState<DueFilterKey>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilterKey>('all');
  const [statusFilter, setStatusFilter] = useState<BoardColumnStatus | 'all'>('all');
  const [openToolbarDropdown, setOpenToolbarDropdown] = useState<ToolbarDropdown>(null);
  const [openCardMenuId, setOpenCardMenuId] = useState<string | null>(null);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<BoardColumnStatus | null>(null);
  const [creatingInColumn, setCreatingInColumn] = useState<BoardColumnStatus | null>(null);
  const [newCardTitle, setNewCardTitle] = useState<string>('');
  const [newCardPriority, setNewCardPriority] = useState<'normal' | 'high' | 'low'>('normal');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const automationRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setAddingSubtask(false);
    setSubtaskDraft('');
    setEditingTitle(false);
    setTitleDraft(task?.title || '');
    setBoardItems(task?.boardItems || []);
  }, [task?.id, task?.title, task?.boardItems]);

  useEffect(() => {
    const handleDocClick = (event: MouseEvent) => {
      if (automationRef.current && !automationRef.current.contains(event.target as Node)) {
        setAutomationOpen(false);
      }
      if (toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) {
        setOpenToolbarDropdown(null);
      }
      setOpenCardMenuId(null);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAutomationOpen(false);
        setOpenToolbarDropdown(null);
        setOpenCardMenuId(null);
        setEditingTitle(false);
        setCreatingInColumn(null);
      }
    };
    document.addEventListener('click', handleDocClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('click', handleDocClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, []);

  const assignees: ProjectMember[] = useMemo(() => {
    if (!task) return [];
    if (Array.isArray(task.assignees) && task.assignees.length > 0) {
      return task.assignees;
    }
    return project?.acceptedMembers || [];
  }, [task, project]);

  const ownerPerson: ProjectMember = useMemo(() => {
    if (task?.owner) return task.owner;
    if (project) {
      return {
        firebaseUid: project.creatorFirebaseUid || undefined,
        name: project.creatorName || 'Project Owner',
        email: project.creatorEmail,
        initials: project.creatorInitials,
        profileImage: project.creatorProfileImage,
        tone: project.creatorTone || 'indigo',
        role: 'Project Owner'
      };
    }
    return {
      name: 'Task Owner',
      initials: 'TO',
      tone: 'indigo',
      role: 'Task Owner'
    };
  }, [task?.owner, project]);

  const subtasks: TaskSubtask[] = Array.isArray(task?.subtasks) ? task.subtasks : [];
  const comments: TaskComment[] = propComments || task?.commentsList || [];

  const attachments: TaskAttachment[] = useMemo(() => {
    const fromTask = [
      ...(Array.isArray(task?.descriptionAttachments) ? task.descriptionAttachments : []),
      ...(Array.isArray(task?.taskSubmissionAttachments) ? task.taskSubmissionAttachments : [])
    ];
    const merged = [...localFiles];
    fromTask.forEach((att) => {
      if (!merged.some((m) => m.id === att.id)) {
        merged.push(att);
      }
    });
    return merged;
  }, [task, localFiles]);

  const activityItems = useMemo(() => {
    const base = Array.isArray(task?.activity)
      ? task.activity.map((item) => ({
          ...item,
          time: formatActivityTime(item.time)
        }))
      : [];
    comments.forEach((c, idx) => {
      base.push({
        id: `comment-act-${c.id || idx}`,
        text: `${c.authorName || c.author || 'Teammate'} commented: ${c.text || c.body || ''}`,
        time: formatActivityTime(c.createdAt || c.created_at || 'Today')
      });
    });
    if (base.length === 0 && task) {
      base.push({
        id: 'act-created',
        text: `${task.title} created`,
        time: formatActivityTime(task.updatedAt || task.createdAt || 'Today')
      });
    }
    return showAllActivity ? base : base.slice(0, 3);
  }, [task, comments, showAllActivity]);

  const summaryHeadline = useMemo(() => {
    if (!task) return 'This Task on track!';
    if (task.status === 'Done') return 'This Task is completed!';
    if (task.status === 'Blocked') return 'Needs attention on blocked task';
    return 'This Task on track!';
  }, [task]);

  const allKnownMembers = useMemo(() => {
    const map = new Map<string, ProjectMember>();
    assignees.forEach((m) => {
      const key = m.name || m.email || '';
      if (key && !map.has(key)) map.set(key, m);
    });
    return Array.from(map.values());
  }, [assignees]);

  const filteredBoardItems = useMemo(() => {
    return boardItems.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (priorityFilter !== 'all') {
        if ((item.priority || '') !== priorityFilter) return false;
      }
      if (dueFilter === 'march17' && !String(item.due || '').includes('March 17')) return false;
      if (dueFilter === 'overdue' && !item.overdue) return false;
      if (dueFilter === 'unscheduled' && Boolean(item.due)) return false;
      if (assigneeFilter !== 'all') {
        if (assigneeFilter === 'unassigned') {
          if (item.assignees.length > 0) return false;
        } else if (!item.assignees.some((a) => (a.name || '') === assigneeFilter)) {
          return false;
        }
      }
      return true;
    });
  }, [boardItems, statusFilter, priorityFilter, dueFilter, assigneeFilter]);

  const calendarGroups = useMemo(() => {
    const groups = new Map<string, BoardCardItem[]>();
    filteredBoardItems.forEach((item) => {
      const label = item.due ? item.due.split(' - ')[0] : 'Unscheduled';
      const list = groups.get(label) || [];
      list.push(item);
      groups.set(label, list);
    });
    return Array.from(groups.entries());
  }, [filteredBoardItems]);

  const activeAdvanceCount = statusFilter !== 'all' ? 1 : 0;
  const hasAnyFilter =
    dueFilter !== 'all' ||
    assigneeFilter !== 'all' ||
    priorityFilter !== 'all' ||
    statusFilter !== 'all';

  const dueFilterLabel =
    dueFilter === 'all'
      ? 'March 17 - 20'
      : dueFilter === 'march17'
        ? 'March 17'
        : dueFilter === 'overdue'
          ? 'Overdue'
          : 'No date';

  const priorityFilterLabel =
    priorityFilter === 'all'
      ? 'All'
      : priorityFilter === 'high'
        ? 'High'
        : priorityFilter === 'normal'
          ? 'Normal'
          : 'Low';

  const moveBoardCard = (cardId: string, nextStatus: BoardColumnStatus) => {
    setBoardItems((prev) =>
      prev.map((card) =>
        card.id === cardId
          ? {
              ...card,
              status: nextStatus,
              progress:
                nextStatus === 'Completed' || nextStatus === 'Launched'
                  ? 100
                  : nextStatus === 'In Progress'
                    ? card.progress || 45
                    : 0
            }
          : card
      )
    );
  };

  const deleteBoardCard = (cardId: string) => {
    setBoardItems((prev) => prev.filter((c) => c.id !== cardId));
  };

  const handleCreateBoardCard = (event: React.FormEvent) => {
    event.preventDefault();
    const title = newCardTitle.trim();
    if (!title || !creatingInColumn) return;
    const nextItem: BoardCardItem = {
      id: `b-${Date.now()}`,
      title,
      status: creatingInColumn,
      assignees: assignees.length ? [assignees[0]] : [],
      due: 'March 18 - 10:00AM',
      dueDateKey: '2026-03-18',
      priority: newCardPriority,
      progress: creatingInColumn === 'In Progress' ? 35 : 0
    };
    setBoardItems((prev) => [nextItem, ...prev]);
    setNewCardTitle('');
    setCreatingInColumn(null);
  };

  const handleSaveTitle = () => {
    const trimmed = titleDraft.trim();
    if (task && trimmed && trimmed !== task.title) {
      onRenameTask?.(task.id, trimmed);
    }
    setEditingTitle(false);
  };

  const handleAddSubtaskSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = subtaskDraft.trim();
    if (!task || !trimmed) return;
    onAddSubtask?.(task.id, trimmed);
    setSubtaskDraft('');
    setAddingSubtask(false);
  };

  const handleCommentSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = commentDraft.trim();
    if (!task || !trimmed) return;
    onAddComment?.(task.id, trimmed);
    setCommentDraft('');
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!task || !files || files.length === 0) return;
    const mapped: TaskAttachment[] = Array.from(files).map((file, idx) => {
      const kb = file.size / 1024;
      const size = kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(kb))} KB`;
      return {
        id: `att-${Date.now()}-${idx}`,
        name: file.name,
        size,
        uploadedBy: ownerPerson.name || 'Team Member',
        uploadedAt: 'Just now',
        kind: 'Uploaded File'
      };
    });
    setLocalFiles((prev) => [...mapped, ...prev]);
    onUploadAttachment?.(task.id, mapped);
    setActiveTab('files');
    event.target.value = '';
  };

  const renderColumnStatusIcon = (status: BoardColumnStatus) => {
    if (status === 'Pending') return <Circle size={12} strokeWidth={2.2} />;
    if (status === 'In Progress') return <Clock size={12} strokeWidth={2.2} />;
    return <CheckCircle2 size={12} strokeWidth={2.2} />;
  };

  const renderPriorityFlag = (priority?: 'high' | 'normal' | 'low' | '') => {
    if (!priority) {
      return (
        <>
          <Flag size={13} strokeWidth={1.8} className={styles['card-priority-flag']} />
          <span className={styles['card-meta-empty']}>-</span>
        </>
      );
    }
    const label =
      priority === 'high'
        ? 'High Priority'
        : priority === 'low'
          ? 'Low Priority'
          : 'Normal Priority';
    const flagClass =
      priority === 'high'
        ? styles['is-high']
        : priority === 'low'
          ? styles['is-low']
          : styles['is-normal'];

    return (
      <>
        <Flag
          size={13}
          strokeWidth={2}
          fill="currentColor"
          className={`${styles['card-priority-flag']} ${flagClass}`}
        />
        <span className={styles['card-priority-text']}>{label}</span>
      </>
    );
  };

  const renderBoardToolbar = () => (
    <div className={styles['board-toolbar']} ref={toolbarRef}>
      <div className={styles['board-toolbar-left']}>
        {/* Due Date Dropdown */}
        <div className={styles['toolbar-dropdown-wrap']}>
          <button
            type="button"
            className={`${styles['toolbar-filter-btn']} ${
              dueFilter !== 'all' ? styles['is-filtered'] : ''
            }`}
            onClick={(e) => {
              e.stopPropagation();
              setOpenToolbarDropdown((prev) => (prev === 'due' ? null : 'due'));
            }}
          >
            <span className={styles['toolbar-filter-key']}>Due Date</span>
            <span className={styles['toolbar-filter-val']}>{dueFilterLabel}</span>
            <ChevronDown size={13} strokeWidth={2} />
          </button>
          {openToolbarDropdown === 'due' && (
            <div className={styles['toolbar-popover']} role="menu">
              {(
                [
                  ['all', 'All (March 17 - 20)'],
                  ['march17', 'March 17'],
                  ['overdue', 'Overdue'],
                  ['unscheduled', 'No date']
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`${styles['filter-option-btn']} ${
                    dueFilter === key ? styles['is-active'] : ''
                  }`}
                  onClick={() => {
                    setDueFilter(key);
                    setOpenToolbarDropdown(null);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Assignee Dropdown */}
        <div className={styles['toolbar-dropdown-wrap']}>
          <button
            type="button"
            className={`${styles['toolbar-filter-btn']} ${
              assigneeFilter !== 'all' ? styles['is-filtered'] : ''
            }`}
            onClick={(e) => {
              e.stopPropagation();
              setOpenToolbarDropdown((prev) => (prev === 'assignee' ? null : 'assignee'));
            }}
          >
            <span className={styles['toolbar-filter-key']}>Assignee</span>
            <span className={styles['toolbar-filter-val']}>
              {assigneeFilter === 'all'
                ? 'All'
                : assigneeFilter === 'unassigned'
                  ? 'Unassigned'
                  : assigneeFilter}
            </span>
            <ChevronDown size={13} strokeWidth={2} />
          </button>
          {openToolbarDropdown === 'assignee' && (
            <div className={styles['toolbar-popover']} role="menu">
              <button
                type="button"
                className={`${styles['filter-option-btn']} ${
                  assigneeFilter === 'all' ? styles['is-active'] : ''
                }`}
                onClick={() => {
                  setAssigneeFilter('all');
                  setOpenToolbarDropdown(null);
                }}
              >
                All
              </button>
              <button
                type="button"
                className={`${styles['filter-option-btn']} ${
                  assigneeFilter === 'unassigned' ? styles['is-active'] : ''
                }`}
                onClick={() => {
                  setAssigneeFilter('unassigned');
                  setOpenToolbarDropdown(null);
                }}
              >
                Unassigned
              </button>
              {allKnownMembers.map((member) => (
                <button
                  key={member.name}
                  type="button"
                  className={`${styles['filter-option-btn']} ${
                    assigneeFilter === member.name ? styles['is-active'] : ''
                  }`}
                  onClick={() => {
                    setAssigneeFilter(member.name || 'all');
                    setOpenToolbarDropdown(null);
                  }}
                >
                  {member.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Priority Dropdown */}
        <div className={styles['toolbar-dropdown-wrap']}>
          <button
            type="button"
            className={`${styles['toolbar-filter-btn']} ${
              priorityFilter !== 'all' ? styles['is-filtered'] : ''
            }`}
            onClick={(e) => {
              e.stopPropagation();
              setOpenToolbarDropdown((prev) => (prev === 'priority' ? null : 'priority'));
            }}
          >
            <span className={styles['toolbar-filter-key']}>Priority</span>
            <span className={styles['toolbar-filter-val']}>{priorityFilterLabel}</span>
            <ChevronDown size={13} strokeWidth={2} />
          </button>
          {openToolbarDropdown === 'priority' && (
            <div className={styles['toolbar-popover']} role="menu">
              {(
                [
                  ['all', 'All'],
                  ['high', 'High Priority'],
                  ['normal', 'Normal Priority'],
                  ['low', 'Low Priority']
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`${styles['filter-option-btn']} ${
                    priorityFilter === key ? styles['is-active'] : ''
                  }`}
                  onClick={() => {
                    setPriorityFilter(key);
                    setOpenToolbarDropdown(null);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <span className={styles['toolbar-divider']} aria-hidden="true" />

        {/* Advance Filters */}
        <div className={styles['toolbar-dropdown-wrap']}>
          <button
            type="button"
            className={`${styles['toolbar-filter-btn']} ${
              activeAdvanceCount > 0 ? styles['is-filtered'] : ''
            }`}
            onClick={(e) => {
              e.stopPropagation();
              setOpenToolbarDropdown((prev) => (prev === 'advance' ? null : 'advance'));
            }}
          >
            <SlidersHorizontal size={13} strokeWidth={2} />
            <span>Advance Filters</span>
            {activeAdvanceCount > 0 && (
              <span className={styles['toolbar-filter-badge']}>{activeAdvanceCount}</span>
            )}
          </button>
          {openToolbarDropdown === 'advance' && (
            <div className={styles['toolbar-popover']} role="menu">
              <div className={styles['advance-popover-heading']}>Column Status</div>
              <button
                type="button"
                className={`${styles['filter-option-btn']} ${
                  statusFilter === 'all' ? styles['is-active'] : ''
                }`}
                onClick={() => {
                  setStatusFilter('all');
                  setOpenToolbarDropdown(null);
                }}
              >
                All Columns
              </button>
              {BOARD_COLUMNS.map((col) => (
                <button
                  key={col.status}
                  type="button"
                  className={`${styles['filter-option-btn']} ${
                    statusFilter === col.status ? styles['is-active'] : ''
                  }`}
                  onClick={() => {
                    setStatusFilter(col.status);
                    setOpenToolbarDropdown(null);
                  }}
                >
                  {col.status}
                </button>
              ))}
              {hasAnyFilter && (
                <button
                  type="button"
                  className={styles['advance-clear-btn']}
                  onClick={() => {
                    setDueFilter('all');
                    setAssigneeFilter('all');
                    setPriorityFilter('all');
                    setStatusFilter('all');
                    setOpenToolbarDropdown(null);
                  }}
                >
                  Reset Filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={styles['board-toolbar-right']}>
        <button
          type="button"
          className={styles['board-add-new-btn']}
          onClick={() => {
            setCreatingInColumn('Pending');
            if (activeTab === 'calendar' || activeTab === 'files') {
              setActiveTab('board');
            }
          }}
        >
          <Plus size={14} strokeWidth={2.4} />
          <span>Add New</span>
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className={styles['task-viewer-shell']} role="status" aria-label="Loading task details">
        <div className={styles['skeleton-wrap']}>
          <div className={styles['skeleton-bar']} style={{ width: '40%', height: 28 }} />
          <div className={styles['skeleton-bar']} style={{ width: '100%', height: 42 }} />
          <div className={styles['skeleton-bar']} style={{ width: '75%', height: 110 }} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles['task-viewer-shell']}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        aria-hidden="true"
        onChange={handleFileChange}
      />

      {error && (
        <div className={styles['state-banner']} role="alert">
          <span>{error}</span>
          {onRetry && (
            <button type="button" onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      )}

      {task && (
        <>
          {/* Header Row */}
          <header className={styles['task-header']}>
            <div className={styles['task-header-left']}>
              <span className={styles['task-brand-icon']} aria-hidden="true">
                <ClipboardList size={20} strokeWidth={2} />
              </span>

              {editingTitle ? (
                <input
                  type="text"
                  className={styles['task-title-input']}
                  value={titleDraft}
                  autoFocus
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={handleSaveTitle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle();
                    if (e.key === 'Escape') {
                      setTitleDraft(task.title);
                      setEditingTitle(false);
                    }
                  }}
                />
              ) : (
                <h1 className={styles['task-title']}>{task.title}</h1>
              )}

              <button
                type="button"
                className={styles['task-edit-btn']}
                aria-label="Edit task title"
                onClick={() => {
                  setTitleDraft(task.title);
                  setEditingTitle(true);
                }}
              >
                <Pencil size={14} strokeWidth={2} />
              </button>
            </div>

            <div className={styles['task-header-actions']}>
              <div className={styles['header-avatar-stack']} title="Assigned team">
                {assignees.slice(0, 4).map((person, idx) => (
                  <span
                    key={person.uid || person.firebaseUid || person.email || `${person.name}-${idx}`}
                    className={styles['header-avatar-item']}
                  >
                    <PersonAvatar person={person} />
                  </span>
                ))}
              </div>

              <span className={styles['header-divider']} aria-hidden="true" />

              <button
                type="button"
                className={styles['header-outline-btn']}
                onClick={() => {
                  setShareCopied(true);
                  window.setTimeout(() => setShareCopied(false), 1800);
                }}
              >
                {shareCopied ? 'Copied' : 'Share'}
              </button>

              <div className={styles['automation-wrap']} ref={automationRef}>
                <button
                  type="button"
                  className={styles['header-outline-btn']}
                  aria-expanded={automationOpen}
                  onClick={(event) => {
                    event.stopPropagation();
                    setAutomationOpen((prev) => !prev);
                  }}
                >
                  Automation
                </button>

                {automationOpen && (
                  <div className={styles['automation-popover']} role="menu">
                    <div className={styles['automation-popover-title']}>Quick Status</div>
                    {STATUS_OPTIONS.map((statusOption) => (
                      <button
                        key={statusOption}
                        type="button"
                        className={`${styles['automation-popover-item']} ${
                          task.status === statusOption ? styles['is-current'] : ''
                        }`}
                        onClick={() => {
                          onStatusChange?.(task.id, statusOption);
                          setAutomationOpen(false);
                        }}
                      >
                        <span>{statusOption}</span>
                        {task.status === statusOption && <Check size={13} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {onClose && (
                <button
                  type="button"
                  className={styles['header-close-btn']}
                  aria-label="Close task viewer"
                  onClick={onClose}
                >
                  <X size={16} strokeWidth={2} />
                </button>
              )}
            </div>
          </header>

          {/* Sub-header Tabs Bar */}
          <div className={styles['task-tabs-row']}>
            <nav className={styles['task-tabs-nav']} aria-label="Task sections">
              <button
                type="button"
                className={`${styles['task-tab-btn']} ${
                  activeTab === 'overview' ? styles['is-active'] : ''
                }`}
                onClick={() => setActiveTab('overview')}
              >
                <Clock size={14} strokeWidth={2} />
                <span>Overview</span>
              </button>
              <button
                type="button"
                className={`${styles['task-tab-btn']} ${
                  activeTab === 'list' ? styles['is-active'] : ''
                }`}
                onClick={() => setActiveTab('list')}
              >
                <ListIcon size={14} strokeWidth={2} />
                <span>List</span>
              </button>
              <button
                type="button"
                className={`${styles['task-tab-btn']} ${
                  activeTab === 'board' ? styles['is-active'] : ''
                }`}
                onClick={() => setActiveTab('board')}
              >
                <Kanban size={14} strokeWidth={2} />
                <span>Board</span>
              </button>
              <button
                type="button"
                className={`${styles['task-tab-btn']} ${
                  activeTab === 'calendar' ? styles['is-active'] : ''
                }`}
                onClick={() => setActiveTab('calendar')}
              >
                <CalendarIcon size={14} strokeWidth={2} />
                <span>Calendar</span>
              </button>
              <button
                type="button"
                className={`${styles['task-tab-btn']} ${
                  activeTab === 'files' ? styles['is-active'] : ''
                }`}
                onClick={() => setActiveTab('files')}
              >
                <FileText size={14} strokeWidth={2} />
                <span>Files</span>
              </button>
            </nav>

            <button
              type="button"
              className={`${styles['tabs-collapse-btn']} ${
                !quickActionsExpanded ? styles['is-collapsed'] : ''
              }`}
              aria-label={quickActionsExpanded ? 'Collapse quick actions' : 'Expand quick actions'}
              onClick={() => setQuickActionsExpanded((prev) => !prev)}
            >
              <ChevronUp size={15} strokeWidth={2} />
            </button>
          </div>

          {/* 3 Quick Action Cards Row (Overview tab) */}
          {quickActionsExpanded && activeTab === 'overview' && (
            <div className={styles['quick-actions-grid']}>
              <button
                type="button"
                className={styles['quick-action-card']}
                onClick={() => setAddingSubtask(true)}
              >
                <span className={styles['quick-action-icon-box']} aria-hidden="true">
                  <Box size={18} strokeWidth={1.9} />
                  <span className={styles['quick-action-plus-badge']}>+</span>
                </span>
                <span className={styles['quick-action-text']}>
                  <span className={styles['quick-action-title']}>Create Subtask</span>
                  <span className={styles['quick-action-subtitle']}>
                    Organize deliverable to this task
                  </span>
                </span>
              </button>

              <button
                type="button"
                className={styles['quick-action-card']}
                onClick={() => setAutomationOpen(true)}
              >
                <span className={styles['quick-action-icon-box']} aria-hidden="true">
                  <Users size={18} strokeWidth={1.9} />
                  <span className={styles['quick-action-plus-badge']}>+</span>
                </span>
                <span className={styles['quick-action-text']}>
                  <span className={styles['quick-action-title']}>Assign Team</span>
                  <span className={styles['quick-action-subtitle']}>
                    Organize assignees to this task
                  </span>
                </span>
              </button>

              <button
                type="button"
                className={styles['quick-action-card']}
                onClick={() => fileInputRef.current?.click()}
              >
                <span className={styles['quick-action-icon-box']} aria-hidden="true">
                  <Upload size={18} strokeWidth={1.9} />
                  <span className={styles['quick-action-plus-badge']}>+</span>
                </span>
                <span className={styles['quick-action-text']}>
                  <span className={styles['quick-action-title']}>Upload a File</span>
                  <span className={styles['quick-action-subtitle']}>
                    Upload file to this task
                  </span>
                </span>
              </button>
            </div>
          )}

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className={styles['overview-split-grid']}>
              <div className={styles['overview-left-col']}>
                <section aria-labelledby="task-desc-heading">
                  <h2 id="task-desc-heading" className={styles['section-title']}>
                    Task Descriptions
                  </h2>
                  <p className={styles['description-text']}>
                    {task.description ||
                      'Provides a clear overview of the task purpose, scope, objectives, and key deliverables so all stakeholders stay aligned.'}
                  </p>
                  {(project?.name || task.sprint || (task.tags && task.tags.length > 0)) && (
                    <div className={styles['description-meta-line']}>
                      {project?.name && <span>{project.name}</span>}
                      {task.sprint && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{task.sprint}</span>
                        </>
                      )}
                      {task.tags && task.tags.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{task.tags.join(' · ')}</span>
                        </>
                      )}
                    </div>
                  )}
                </section>

                <hr className={styles['section-divider']} />

                <section aria-labelledby="task-assignee-heading">
                  <h2 id="task-assignee-heading" className={styles['section-title']}>
                    Assignee
                  </h2>
                  <div className={styles['assignees-row']}>
                    {assignees.length > 0 ? (
                      assignees.map((member, idx) => (
                        <div
                          key={member.uid || member.firebaseUid || member.email || `${member.name}-${idx}`}
                          className={styles['assignee-item']}
                        >
                          <PersonAvatar person={member} />
                          <div className={styles['assignee-info']}>
                            <span className={styles['assignee-name']}>
                              {member.name || 'Team Member'}
                            </span>
                            {member.role ? (
                              <span className={styles['assignee-role']}>{member.role}</span>
                            ) : (
                              <button
                                type="button"
                                className={styles['add-role-btn']}
                                onClick={() => setAutomationOpen(true)}
                              >
                                + Add role
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className={styles['description-text']}>No assignees listed.</p>
                    )}
                  </div>
                </section>

                <hr className={styles['section-divider']} />

                <section aria-labelledby="task-subtasks-heading">
                  <h2 id="task-subtasks-heading" className={styles['section-title']}>
                    Subtasks &amp; Deliverables
                  </h2>

                  <div className={styles['tasks-table']}>
                    <div className={styles['tasks-head']}>
                      <span>Name</span>
                      <span>Assignee</span>
                      <span>Due Date</span>
                      <span aria-hidden="true" />
                    </div>

                    {subtasks.length === 0 && (
                      <div className={styles['tasks-row']}>
                        <div className={styles['task-name-cell']}>
                          <span className={styles['task-row-title']}>
                            No subtasks added yet
                          </span>
                        </div>
                        <div className={styles['task-assignee-cell']} />
                        <div className={styles['task-date-cell']} />
                        <div className={styles['task-more-cell']} />
                      </div>
                    )}

                    {subtasks.map((sub) => {
                      const subPeople = sub.assignees || [];
                      return (
                        <div key={sub.id} className={styles['tasks-row']}>
                          <div className={styles['task-name-cell']}>
                            <button
                              type="button"
                              className={`${styles['task-circle-btn']} ${
                                sub.done ? styles['is-done'] : ''
                              }`}
                              aria-label={
                                sub.done ? `Mark ${sub.title} incomplete` : `Mark ${sub.title} done`
                              }
                              onClick={() => onToggleSubtask?.(task.id, sub.id)}
                            >
                              {sub.done && <Check size={11} strokeWidth={2.5} />}
                            </button>
                            <span
                              className={`${styles['task-row-title']} ${
                                sub.done ? styles['is-done'] : ''
                              }`}
                            >
                              {sub.title}
                            </span>
                          </div>

                          <div className={styles['task-assignee-cell']}>
                            {subPeople.length > 0 ? (
                              <div className={styles['task-avatars-mini']}>
                                {subPeople.slice(0, 3).map((person, idx) => (
                                  <span
                                    key={person.uid || person.email || `${person.name}-${idx}`}
                                    className={styles['task-avatar-mini-item']}
                                  >
                                    <PersonAvatar person={person} />
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <button
                                type="button"
                                className={styles['task-placeholder-action']}
                                onClick={() => setAutomationOpen(true)}
                              >
                                <UserPlus size={13} strokeWidth={1.8} />
                                <span>Assign</span>
                              </button>
                            )}
                          </div>

                          <div className={styles['task-date-cell']}>
                            {sub.due ? (
                              <span>{sub.due}</span>
                            ) : (
                              <button
                                type="button"
                                className={styles['task-placeholder-action']}
                                onClick={() => setActiveTab('calendar')}
                              >
                                <CalendarIcon size={13} strokeWidth={1.8} />
                                <span>Add date</span>
                              </button>
                            )}
                          </div>

                          <div className={styles['task-more-cell']}>
                            <button
                              type="button"
                              className={styles['row-more-btn']}
                              aria-label={`More options for ${sub.title}`}
                              onClick={() => onToggleSubtask?.(task.id, sub.id)}
                            >
                              <MoreHorizontal size={14} strokeWidth={2} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {addingSubtask ? (
                    <form className={styles['inline-subtask-form']} onSubmit={handleAddSubtaskSubmit}>
                      <input
                        type="text"
                        className={styles['inline-subtask-input']}
                        placeholder="Enter subtask title..."
                        value={subtaskDraft}
                        autoFocus
                        onChange={(e) => setSubtaskDraft(e.target.value)}
                      />
                      <button type="submit" className={styles['inline-subtask-save']}>
                        Add
                      </button>
                      <button
                        type="button"
                        className={styles['inline-subtask-cancel']}
                        onClick={() => {
                          setAddingSubtask(false);
                          setSubtaskDraft('');
                        }}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className={styles['inline-add-link']}
                      onClick={() => setAddingSubtask(true)}
                    >
                      <Plus size={14} strokeWidth={2.2} />
                      <span>Add Subtask</span>
                    </button>
                  )}
                </section>
              </div>

              {/* Right Column */}
              <aside className={styles['overview-right-col']} aria-label="Task Summary">
                <h2 className={styles['section-title']}>Summary</h2>

                <div className={styles['summary-status-card']}>
                  <div className={styles['summary-top-bar']} aria-hidden="true" />
                  <div className={styles['summary-status-body']}>
                    <h3 className={styles['summary-status-title']}>{summaryHeadline}</h3>
                    <p className={styles['summary-status-copy']}>
                      This task focuses on delivering clear milestones within{' '}
                      {project?.name || 'the project'}.
                    </p>
                    <p className={styles['summary-status-note']}>
                      Carefully planned to achieve success.
                    </p>

                    <dl className={styles['summary-meta-grid']}>
                      <div className={styles['summary-meta-item']}>
                        <dt>Status</dt>
                        <dd>{task.status || '—'}</dd>
                      </div>
                      <div className={styles['summary-meta-item']}>
                        <dt>Priority</dt>
                        <dd style={{ textTransform: 'capitalize' }}>{task.priority || '—'}</dd>
                      </div>
                      <div className={styles['summary-meta-item']}>
                        <dt>Start Date</dt>
                        <dd>{formatDate(task.startDate || task.start_date)}</dd>
                      </div>
                      <div className={styles['summary-meta-item']}>
                        <dt>Due Date</dt>
                        <dd>{task.due || formatDate(task.due_date)}</dd>
                      </div>
                      <div className={styles['summary-meta-item']}>
                        <dt>Category</dt>
                        <dd>{task.category || task.tag || '—'}</dd>
                      </div>
                      <div className={styles['summary-meta-item']}>
                        <dt>Sprint</dt>
                        <dd>{task.sprint || '—'}</dd>
                      </div>
                    </dl>

                    <div className={styles['summary-owner-row']}>
                      <PersonAvatar person={ownerPerson} />
                      <div className={styles['summary-owner-meta']}>
                        <strong>{ownerPerson.name}</strong>
                        <span>{ownerPerson.role || 'Task Owner'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={styles['recent-activity-card']}>
                  <h3 className={styles['recent-activity-title']}>Recent Activity</h3>
                  <div className={styles['activity-timeline']}>
                    {activityItems.map((item) => (
                      <div key={item.id} className={styles['activity-item']}>
                        <span className={styles['activity-check-dot']} aria-hidden="true">
                          <Check size={11} strokeWidth={2.6} />
                        </span>
                        <span className={styles['activity-text']}>
                          <strong>{item.text}</strong>
                          <span className={styles['activity-time']}>· {item.time}</span>
                        </span>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className={styles['activity-view-all-btn']}
                    onClick={() => setShowAllActivity((prev) => !prev)}
                  >
                    {showAllActivity ? 'Show Less' : 'View All'}
                  </button>

                  {onAddComment && (
                    <form className={styles['comment-composer']} onSubmit={handleCommentSubmit}>
                      <input
                        type="text"
                        className={styles['comment-input']}
                        placeholder="Add a comment or update..."
                        value={commentDraft}
                        onChange={(e) => setCommentDraft(e.target.value)}
                      />
                      <button type="submit" className={styles['comment-submit']}>
                        Post
                      </button>
                    </form>
                  )}
                </div>
              </aside>
            </div>
          )}

          {/* LIST TAB */}
          {activeTab === 'list' && (
            <>
              {renderBoardToolbar()}
              {creatingInColumn && (
                <form
                  className={styles['inline-new-card']}
                  style={{ maxWidth: 420, marginBottom: 16 }}
                  onSubmit={handleCreateBoardCard}
                >
                  <input
                    type="text"
                    placeholder={`New task in ${creatingInColumn}...`}
                    value={newCardTitle}
                    autoFocus
                    onChange={(e) => setNewCardTitle(e.target.value)}
                  />
                  <div className={styles['inline-new-card-actions']}>
                    <select
                      value={newCardPriority}
                      onChange={(e) =>
                        setNewCardPriority(e.target.value as 'normal' | 'high' | 'low')
                      }
                    >
                      <option value="normal">Normal Priority</option>
                      <option value="high">High Priority</option>
                      <option value="low">Low Priority</option>
                    </select>
                    <button type="submit" className={styles['inline-subtask-save']}>
                      Add
                    </button>
                    <button
                      type="button"
                      className={styles['inline-subtask-cancel']}
                      onClick={() => setCreatingInColumn(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              <div className={styles['list-view-card']}>
                <table className={styles['list-table']}>
                  <thead>
                    <tr>
                      <th style={{ width: 42 }}>Done</th>
                      <th>Task Name</th>
                      <th>Status</th>
                      <th>Assignee</th>
                      <th>Due Date</th>
                      <th>Priority</th>
                      <th style={{ width: 48 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBoardItems.length === 0 ? (
                      <tr>
                        <td colSpan={7}>
                          <div className={styles['empty-board-notice']}>
                            No tasks match the active filters. Click &ldquo;Add New&rdquo; or reset filters.
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredBoardItems.map((item) => {
                        const isCompleted =
                          item.status === 'Completed' || item.status === 'Launched';
                        const colCfg = BOARD_COLUMNS.find((c) => c.status === item.status);

                        return (
                          <tr key={item.id}>
                            <td>
                              <button
                                type="button"
                                className={`${styles['task-circle-btn']} ${
                                  isCompleted ? styles['is-done'] : ''
                                }`}
                                aria-label={`Toggle ${item.title}`}
                                onClick={() =>
                                  moveBoardCard(item.id, isCompleted ? 'Pending' : 'Completed')
                                }
                              >
                                {isCompleted && <Check size={11} strokeWidth={2.5} />}
                              </button>
                            </td>
                            <td>
                              <span
                                className={`${styles['task-row-title']} ${
                                  isCompleted ? styles['is-done'] : ''
                                }`}
                              >
                                {item.title}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`${styles['col-status-pill']} ${
                                  styles[colCfg?.toneClass || 'tone-pending']
                                }`}
                              >
                                {renderColumnStatusIcon(item.status)}
                                <span>{item.status}</span>
                              </span>
                            </td>
                            <td>
                              {item.assignees.length > 0 ? (
                                <div className={styles['card-avatar-row']}>
                                  {item.assignees.slice(0, 3).map((person, idx) => (
                                    <span
                                      key={`${item.id}-${person.name}-${idx}`}
                                      className={styles['card-avatar-item']}
                                    >
                                      <PersonAvatar person={person} />
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className={styles['card-meta-empty']}>Unassigned</span>
                              )}
                            </td>
                            <td>
                              <span className={styles['card-date-text']}>
                                {item.due || '—'}
                              </span>
                              {item.overdue && (
                                <span className={styles['card-overdue-text']}> Overdue</span>
                              )}
                            </td>
                            <td>
                              <div className={styles['priority-inline']}>
                                {renderPriorityFlag(item.priority)}
                              </div>
                            </td>
                            <td>
                              <button
                                type="button"
                                className={styles['row-more-btn']}
                                aria-label={`Delete ${item.title}`}
                                onClick={() => deleteBoardCard(item.id)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* BOARD TAB (matches Board screenshot) */}
          {activeTab === 'board' && (
            <>
              {renderBoardToolbar()}

              <div className={styles['board-columns-grid']}>
                {BOARD_COLUMNS.map((col) => {
                  const colCards = filteredBoardItems.filter((c) => c.status === col.status);
                  const isDragOver = dragOverColumn === col.status;

                  return (
                    <div
                      key={col.status}
                      className={`${styles['board-column']} ${
                        isDragOver ? styles['is-drag-over'] : ''
                      }`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragOverColumn !== col.status) setDragOverColumn(col.status);
                      }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setDragOverColumn((prev) => (prev === col.status ? null : prev));
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverColumn(null);
                        const cardId = e.dataTransfer.getData('text/plain');
                        if (cardId) moveBoardCard(cardId, col.status);
                        setDraggingCardId(null);
                      }}
                    >
                      <div className={styles['board-column-header']}>
                        <span
                          className={`${styles['col-status-pill']} ${styles[col.toneClass]}`}
                        >
                          {renderColumnStatusIcon(col.status)}
                          <span>{col.status}</span>
                        </span>

                        <div className={styles['col-header-actions']}>
                          <button
                            type="button"
                            className={styles['col-icon-btn']}
                            aria-label={`${col.status} column options`}
                            onClick={() =>
                              setStatusFilter((prev) => (prev === col.status ? 'all' : col.status))
                            }
                          >
                            <MoreHorizontal size={15} strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            className={styles['col-icon-btn']}
                            aria-label={`Add task to ${col.status}`}
                            onClick={() => {
                              setCreatingInColumn(col.status);
                              setNewCardTitle('');
                            }}
                          >
                            <Plus size={15} strokeWidth={2} />
                          </button>
                        </div>
                      </div>

                      {creatingInColumn === col.status && (
                        <form className={styles['inline-new-card']} onSubmit={handleCreateBoardCard}>
                          <input
                            type="text"
                            placeholder={`Task title in ${col.status}...`}
                            value={newCardTitle}
                            autoFocus
                            onChange={(e) => setNewCardTitle(e.target.value)}
                          />
                          <div className={styles['inline-new-card-actions']}>
                            <select
                              value={newCardPriority}
                              onChange={(e) =>
                                setNewCardPriority(e.target.value as 'normal' | 'high' | 'low')
                              }
                            >
                              <option value="normal">Normal Priority</option>
                              <option value="high">High Priority</option>
                              <option value="low">Low Priority</option>
                            </select>
                            <button type="submit" className={styles['inline-subtask-save']}>
                              Add
                            </button>
                            <button
                              type="button"
                              className={styles['inline-subtask-cancel']}
                              onClick={() => setCreatingInColumn(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      )}

                      <div className={styles['board-card-list']}>
                        {colCards.map((card) => {
                          const showRing = card.status === 'In Progress';
                          const progress = card.progress ?? 40;
                          const circ = 2 * Math.PI * 7;
                          const dashOffset = circ * (1 - progress / 100);
                          const isMenuOpen = openCardMenuId === card.id;

                          return (
                            <article
                              key={card.id}
                              draggable
                              className={`${styles['board-card']} ${
                                draggingCardId === card.id ? styles['is-dragging'] : ''
                              }`}
                              onDragStart={(e) => {
                                e.dataTransfer.setData('text/plain', card.id);
                                e.dataTransfer.effectAllowed = 'move';
                                setDraggingCardId(card.id);
                              }}
                              onDragEnd={() => {
                                setDraggingCardId(null);
                                setDragOverColumn(null);
                              }}
                            >
                              <div className={styles['board-card-top']}>
                                <h4 className={styles['board-card-title']}>{card.title}</h4>
                                <div className={styles['board-card-right']}>
                                  {showRing && (
                                    <svg
                                      className={styles['board-progress-ring']}
                                      width="18"
                                      height="18"
                                      viewBox="0 0 18 18"
                                      aria-label={`Progress ${progress}%`}
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
                                        stroke="#5E3BEE"
                                        strokeWidth="2.2"
                                        strokeDasharray={circ}
                                        strokeDashoffset={dashOffset}
                                        strokeLinecap="round"
                                        transform="rotate(-90 9 9)"
                                      />
                                    </svg>
                                  )}

                                  <button
                                    type="button"
                                    className={styles['card-more-btn']}
                                    aria-label={`Actions for ${card.title}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenCardMenuId((prev) =>
                                        prev === card.id ? null : card.id
                                      );
                                    }}
                                  >
                                    <MoreHorizontal size={15} strokeWidth={2} />
                                  </button>

                                  {isMenuOpen && (
                                    <div
                                      className={styles['card-action-menu']}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {BOARD_COLUMNS.map((opt) => (
                                        <button
                                          key={opt.status}
                                          type="button"
                                          className={`${styles['card-action-option']} ${
                                            card.status === opt.status ? styles['is-current'] : ''
                                          }`}
                                          onClick={() => {
                                            moveBoardCard(card.id, opt.status);
                                            setOpenCardMenuId(null);
                                          }}
                                        >
                                          Move to {opt.status}
                                        </button>
                                      ))}
                                      <button
                                        type="button"
                                        className={`${styles['card-action-option']} ${styles['is-danger']}`}
                                        onClick={() => {
                                          deleteBoardCard(card.id);
                                          setOpenCardMenuId(null);
                                        }}
                                      >
                                        Remove card
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className={styles['card-dashed-divider']} />

                              <div className={styles['card-meta-list']}>
                                {/* Row 1: Assignees */}
                                <div className={styles['card-meta-row']}>
                                  <UserCircle2
                                    size={14}
                                    strokeWidth={1.8}
                                    className={styles['card-meta-icon']}
                                  />
                                  {card.assignees.length > 0 ? (
                                    <div className={styles['card-avatar-row']}>
                                      {card.assignees.slice(0, 4).map((person, idx) => (
                                        <span
                                          key={`${card.id}-${person.name}-${idx}`}
                                          className={styles['card-avatar-item']}
                                        >
                                          <PersonAvatar person={person} />
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className={styles['card-meta-empty']}>-</span>
                                  )}
                                </div>

                                {/* Row 2: Due Date */}
                                <div className={styles['card-meta-row']}>
                                  <CalendarIcon
                                    size={14}
                                    strokeWidth={1.8}
                                    className={styles['card-meta-icon']}
                                  />
                                  {card.due ? (
                                    <span className={styles['card-date-text']}>
                                      {card.due}
                                      {card.overdue && (
                                        <span className={styles['card-overdue-text']}>
                                          {' '}
                                          Overdue
                                        </span>
                                      )}
                                    </span>
                                  ) : (
                                    <span className={styles['card-meta-empty']}>-</span>
                                  )}
                                </div>

                                {/* Row 3: Priority */}
                                <div className={styles['card-meta-row']}>
                                  {renderPriorityFlag(card.priority)}
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* CALENDAR TAB */}
          {activeTab === 'calendar' && (
            <>
              {renderBoardToolbar()}
              {calendarGroups.length === 0 ? (
                <div className={styles['empty-board-notice']}>
                  No scheduled tasks match the active filters.
                </div>
              ) : (
                <div className={styles['calendar-grid']}>
                  {calendarGroups.map(([dateLabel, items]) => (
                    <div key={dateLabel} className={styles['calendar-day-box']}>
                      <div className={styles['calendar-day-header']}>
                        <span className={styles['calendar-day-label']}>{dateLabel}</span>
                        <span className={styles['calendar-day-count']}>{items.length}</span>
                      </div>

                      {items.map((item) => {
                        const colCfg = BOARD_COLUMNS.find((c) => c.status === item.status);
                        return (
                          <div key={item.id} className={styles['calendar-card']}>
                            <div className={styles['calendar-card-head']}>
                              <span
                                className={`${styles['col-status-pill']} ${
                                  styles[colCfg?.toneClass || 'tone-pending']
                                }`}
                              >
                                {renderColumnStatusIcon(item.status)}
                                <span>{item.status}</span>
                              </span>
                              {item.overdue && (
                                <span className={styles['card-overdue-text']}>Overdue</span>
                              )}
                            </div>
                            <strong className={styles['board-card-title']}>{item.title}</strong>
                            <div className={styles['calendar-card-foot']}>
                              {item.assignees.length > 0 ? (
                                <div className={styles['card-avatar-row']}>
                                  {item.assignees.slice(0, 3).map((person, idx) => (
                                    <span key={idx} className={styles['card-avatar-item']}>
                                      <PersonAvatar person={person} />
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className={styles['card-meta-empty']}>Unassigned</span>
                              )}
                              <div className={styles['priority-inline']}>
                                {renderPriorityFlag(item.priority)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* FILES TAB */}
          {activeTab === 'files' && (
            <section className={styles['tab-panel-card']} aria-label="Task Attachments">
              <div className={styles['tab-panel-header']}>
                <div>
                  <h2 className={styles['section-title']}>Files &amp; Deliverables</h2>
                  <p className={styles['description-text']}>
                    Specifications, design files, and deliverables attached to {task.title}.
                  </p>
                </div>
                <button
                  type="button"
                  className={styles['tab-panel-btn']}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={14} />
                  <span>Upload a File</span>
                </button>
              </div>

              <div className={styles['files-list']}>
                {attachments.length === 0 ? (
                  <div className={styles['file-row']}>
                    <div className={styles['file-row-left']}>
                      <span className={styles['file-row-icon']}>
                        <FileText size={17} />
                      </span>
                      <div className={styles['file-row-meta']}>
                        <strong>No files attached yet</strong>
                        <small>Click &ldquo;Upload a File&rdquo; to attach assets to this task.</small>
                      </div>
                    </div>
                  </div>
                ) : (
                  attachments.map((file) => (
                    <div key={file.id} className={styles['file-row']}>
                      <div className={styles['file-row-left']}>
                        <span className={styles['file-row-icon']}>
                          <FileText size={17} />
                        </span>
                        <div className={styles['file-row-meta']}>
                          <strong>{file.name}</strong>
                          <small>
                            {file.kind ? `${file.kind} · ` : ''}
                            {file.size} · Uploaded by {file.uploadedBy} · {file.uploadedAt}
                          </small>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={styles['row-more-btn']}
                        aria-label={`Remove ${file.name}`}
                        onClick={() =>
                          setLocalFiles((prev) => prev.filter((f) => f.id !== file.id))
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};
