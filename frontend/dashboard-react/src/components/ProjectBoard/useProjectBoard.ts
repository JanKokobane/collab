import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  getAvatarSource,
  getSprintMembers,
  getSprintMemberUids,
  getUserInitials,
  useDashboard
} from '../../context/DashboardContext';
import type { Project, ProjectMember, TaskItem, TaskStatus } from '../../types/dashboard';
import { toLocalDateKey } from '../../utils/dateUtils';
import {
  DUE_DATE_FILTER_OPTIONS,
  FILTER_OPTIONS,
  PRIORITY_FILTER_OPTIONS,
  getTaskDueDateKey,
  getTaskDeadline,
  type BoardViewTab,
  type DueDateFilterKey,
  type LocalProjectFile,
  type PriorityFilterKey
} from './projectBoardConfig';

export type BoardToolbarDropdown = 'dueDate' | 'assignee' | 'priority' | 'advance' | null;

export function useProjectBoard() {
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

  const [activeBoardTab, setActiveBoardTab] = useState<BoardViewTab>('overview');
  const [quickActionsExpanded, setQuickActionsExpanded] = useState<boolean>(true);
  const [boardSummaryExpanded, setBoardSummaryExpanded] = useState<boolean>(false);
  const [automationMenuOpen, setAutomationMenuOpen] = useState<boolean>(false);
  const [autoAssignOnCreate, setAutoAssignOnCreate] = useState<boolean>(true);
  const [notifyOverdue, setNotifyOverdue] = useState<boolean>(true);
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const [customTitleMap, setCustomTitleMap] = useState<Record<string, string>>({});
  const [draftTitle, setDraftTitle] = useState<string>('');
  const [uploadedFiles, setUploadedFiles] = useState<LocalProjectFile[]>([]);
  const [showAllActivity, setShowAllActivity] = useState<boolean>(false);

  const [dueDateFilter, setDueDateFilter] = useState<DueDateFilterKey>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilterKey>('all');
  const [openToolbarDropdown, setOpenToolbarDropdown] = useState<BoardToolbarDropdown>(null);
  const [openColumnMenuStatus, setOpenColumnMenuStatus] = useState<TaskStatus | null>(null);

  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [openStatusMenuTaskId, setOpenStatusMenuTaskId] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null);
  const [updatingTaskIds, setUpdatingTaskIds] = useState<Record<string, boolean>>({});
  const filterWrapRef = useRef<HTMLDivElement | null>(null);
  const boardToolbarRef = useRef<HTMLDivElement | null>(null);
  const automationWrapRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const prevDisplayModeRef = useRef(activeDisplayMode);

  const currentUid = firebaseUser?.uid || currentUser?.uid || '';

  useEffect(() => {
    if (prevDisplayModeRef.current !== activeDisplayMode) {
      prevDisplayModeRef.current = activeDisplayMode;
      setActiveBoardTab(activeDisplayMode === 'list' ? 'list' : 'board');
    }
  }, [activeDisplayMode]);

  useEffect(() => {
    const handleDocClick = (event: MouseEvent) => {
      if (filterWrapRef.current && !filterWrapRef.current.contains(event.target as Node)) {
        setFilterMenuOpen(false);
      }
      if (boardToolbarRef.current && !boardToolbarRef.current.contains(event.target as Node)) {
        setOpenToolbarDropdown(null);
      }
      if (automationWrapRef.current && !automationWrapRef.current.contains(event.target as Node)) {
        setAutomationMenuOpen(false);
      }
      setOpenStatusMenuTaskId(null);
      setOpenColumnMenuStatus(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFilterMenuOpen(false);
        setOpenToolbarDropdown(null);
        setAutomationMenuOpen(false);
        setOpenStatusMenuTaskId(null);
        setOpenColumnMenuStatus(null);
        setIsEditingTitle(false);
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
      list = list.filter((t) => t.sprint === activeSprintFilter);
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
      const key = getTaskDueDateKey(t);
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
            tone: proj.creatorTone || 'teal',
            role: 'Project Owner'
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

  const getTaskVisiblePeople = (task: TaskItem): Array<ProjectMember & { uid: string }> => {
    const project = task.backendPersistent
      ? projects.find((item) => item.projectId === task.projectId)
      : undefined;
    const visiblePeople: Array<ProjectMember & { uid: string }> = [];
    const seenPeople = new Set<string>();
    const addVisiblePerson = (person?: ProjectMember | null) => {
      if (!person) return;
      const uid = String(person.uid || person.firebaseUid || person.firebase_uid || '').trim();
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

    if (Array.isArray(task.assigneeUids)) {
      if (task.assigneeUids.length > 0) {
        const uidSet = new Set(task.assigneeUids);
        teamMembersForStats.forEach((member) => {
          const uid = member.uid || member.firebaseUid || member.firebase_uid || '';
          if (uid && uidSet.has(uid)) {
            addVisiblePerson(member);
          }
        });
      }
    } else if (task.backendPersistent && project) {
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
    return visiblePeople;
  };

  const boardFilteredTasks = useMemo(() => {
    const todayKey = toLocalDateKey();
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndKey = toLocalDateKey(weekEnd);

    return filteredTasks.filter((task) => {
      if (priorityFilter !== 'all') {
        const p = (task.priority || 'medium').toLowerCase();
        if (p !== priorityFilter) return false;
      }

      if (dueDateFilter !== 'all') {
        const dueDateKey = getTaskDueDateKey(task);
        const deadline = getTaskDeadline(dueDateKey);
        const isDone = task.status === 'Done';
        const isOverdue = Boolean(
          deadline && !isDone && (dueDateKey < todayKey || deadline.getTime() - Date.now() <= 0)
        );

        if (dueDateFilter === 'unscheduled' && (dueDateKey || task.due)) return false;
        if (dueDateFilter === 'today' && dueDateKey !== todayKey) return false;
        if (
          dueDateFilter === 'week' &&
          (!dueDateKey || dueDateKey < todayKey || dueDateKey > weekEndKey)
        ) {
          return false;
        }
        if (dueDateFilter === 'overdue' && !isOverdue) return false;
      }

      if (assigneeFilter !== 'all') {
        const people = getTaskVisiblePeople(task);
        if (assigneeFilter === 'unassigned') {
          if (people.length > 0) return false;
        } else {
          const matchesAssignee = people.some(
            (p) => (p.uid || p.firebaseUid || p.email || p.name) === assigneeFilter
          );
          if (!matchesAssignee) return false;
        }
      }

      return true;
    });
  }, [filteredTasks, priorityFilter, dueDateFilter, assigneeFilter, teamMembersForStats, projects]);

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

  const activeDueDateLabel =
    DUE_DATE_FILTER_OPTIONS.find((item) => item.key === dueDateFilter)?.label || 'All';

  const activePriorityLabel =
    PRIORITY_FILTER_OPTIONS.find((item) => item.key === priorityFilter)?.label || 'All';

  const activeAssigneeLabel = useMemo(() => {
    if (assigneeFilter === 'all') return 'All';
    if (assigneeFilter === 'unassigned') return 'Unassigned';
    const match = teamMembersForStats.find(
      (m) => (m.uid || m.firebaseUid || m.email || m.name) === assigneeFilter
    );
    return match?.name || 'All';
  }, [assigneeFilter, teamMembersForStats]);

  const activeAdvanceFilterCount =
    (activeFilter !== 'all' ? 1 : 0) + (activeSprintFilter && activeSprintFilter !== 'all' ? 1 : 0);

  const hasAnyToolbarFilter =
    activeAdvanceFilterCount > 0 ||
    dueDateFilter !== 'all' ||
    assigneeFilter !== 'all' ||
    priorityFilter !== 'all';

  const clearAllBoardFilters = () => {
    setActiveFilter('all');
    setActiveSprintFilter('all');
    setDueDateFilter('all');
    setAssigneeFilter('all');
    setPriorityFilter('all');
  };

  const projectTasksAll = useMemo(
    () => (activeProject ? tasks.filter((t) => t.project === activeProject.name) : []),
    [tasks, activeProject]
  );

  const teamMemberCount = Number(activeProject?.teamMemberCount) || 0;
  const projectSprints = Array.isArray(activeProject?.sprints) ? activeProject.sprints : [];

  const canCreateCard = activeView === 'Workspace' || isCurrentUserProjectCreator;

  const projectTitleKey = activeProject?.projectId || activeView;
  const rawProjectTitle = activeProject?.name || activeView || 'Design Project';
  const displayProjectTitle = customTitleMap[projectTitleKey] || rawProjectTitle;

  const projectOwnerPerson = useMemo<ProjectMember>(() => {
    if (activeProject) {
      return {
        firebaseUid: activeProject.creatorFirebaseUid ?? undefined,
        name: activeProject.creatorName || currentUser?.name || 'Project Owner',
        email: activeProject.creatorEmail || currentUser?.email,
        initials: activeProject.creatorInitials || getUserInitials(activeProject.creatorName),
        profileImage: activeProject.creatorProfileImage,
        tone: activeProject.creatorTone || 'teal',
        role: 'Project Owner'
      };
    }
    return {
      firebaseUid: currentUid,
      name: currentUser?.name || 'Project Owner',
      email: currentUser?.email,
      initials: getUserInitials(currentUser?.name || 'Project Owner'),
      tone: 'teal',
      role: 'Project Owner'
    };
  }, [activeProject, currentUser, currentUid]);

  const recentActivityItems = useMemo(() => {
    const items: Array<{ id: string; text: string; time: string }> = [];
    statsTasks.forEach((task) => {
      if (task.status === 'Done') {
        items.push({
          id: `act-done-${task.id}`,
          text: `${task.title} completed`,
          time: task.updatedAt || 'Today, 2:24pm'
        });
      } else if (task.commentsList && task.commentsList.length > 0) {
        const latest = task.commentsList[task.commentsList.length - 1];
        items.push({
          id: `act-comment-${task.id}`,
          text: `${task.title} updated by ${latest.author}`,
          time: latest.createdAt || 'Today, 2:24pm'
        });
      } else if (task.status === 'In progress') {
        items.push({
          id: `act-prog-${task.id}`,
          text: `${task.title} moved to In progress`,
          time: task.updatedAt || 'Today, 2:24pm'
        });
      }
    });
    if (items.length === 0) {
      items.push({
        id: 'act-init',
        text: `${displayProjectTitle} workspace initialized`,
        time: 'Today'
      });
    }
    return showAllActivity ? items : items.slice(0, 3);
  }, [statsTasks, displayProjectTitle, showAllActivity]);

  const calendarGroups = useMemo(() => {
    const groups = new Map<string, TaskItem[]>();
    filteredTasks.forEach((task) => {
      const label = task.due || task.due_date || 'Unscheduled';
      const existing = groups.get(label) || [];
      existing.push(task);
      groups.set(label, existing);
    });
    return Array.from(groups.entries());
  }, [filteredTasks]);

  const blockedCount = useMemo(
    () => statsTasks.filter((t) => t.status === 'Blocked').length,
    [statsTasks]
  );

  const summaryStatusHeadline =
    blockedCount > 0 && blockedCount >= statsTasks.length / 2
      ? 'Needs attention on blocked tasks'
      : 'This Project on track!';

  const handleTabSelect = (tab: BoardViewTab) => {
    setActiveBoardTab(tab);
    if (tab === 'list') {
      setActiveDisplayMode('list');
    } else if (tab === 'board') {
      setActiveDisplayMode('board');
    }
  };

  const handleFilePicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const nextFiles: LocalProjectFile[] = Array.from(files).map((file, idx) => {
      const kb = file.size / 1024;
      const size = kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(kb))} KB`;
      return {
        id: `local-file-${Date.now()}-${idx}`,
        name: file.name,
        size,
        uploadedBy: currentUser?.name || 'Team Member',
        uploadedAt: 'Just now'
      };
    });
    setUploadedFiles((prev) => [...nextFiles, ...prev]);
    setActiveBoardTab('files');
    showDashboardToast(
      nextFiles.length === 1
        ? `Uploaded "${nextFiles[0].name}"`
        : `Uploaded ${nextFiles.length} files`,
      'success'
    );
    event.target.value = '';
  };

  return {
    activeView,
    activeProject,
    projects,
    tasks,
    activeFilter,
    setActiveFilter,
    activeSprintFilter,
    setActiveSprintFilter,
    activeDisplayMode,
    setActiveDisplayMode,
    isCurrentUserProjectCreator,
    openTaskDetails,
    asideTaskId,
    setActiveModal,
    openMessageContext,
    showDashboardToast,
    activeBoardTab,
    quickActionsExpanded,
    setQuickActionsExpanded,
    boardSummaryExpanded,
    setBoardSummaryExpanded,
    automationMenuOpen,
    setAutomationMenuOpen,
    autoAssignOnCreate,
    setAutoAssignOnCreate,
    notifyOverdue,
    setNotifyOverdue,
    isEditingTitle,
    setIsEditingTitle,
    customTitleMap,
    setCustomTitleMap,
    draftTitle,
    setDraftTitle,
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
    filterMenuOpen,
    setFilterMenuOpen,
    openStatusMenuTaskId,
    setOpenStatusMenuTaskId,
    draggingTaskId,
    setDraggingTaskId,
    dragOverCol,
    setDragOverCol,
    updatingTaskIds,
    filterWrapRef,
    boardToolbarRef,
    automationWrapRef,
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
    activeFilterLabel,
    activeDueDateLabel,
    activeAssigneeLabel,
    activePriorityLabel,
    activeAdvanceFilterCount,
    hasAnyToolbarFilter,
    clearAllBoardFilters,
    projectTasksAll,
    teamMemberCount,
    projectSprints,
    canCreateCard,
    projectTitleKey,
    displayProjectTitle,
    projectOwnerPerson,
    getTaskVisiblePeople,
    recentActivityItems,
    calendarGroups,
    summaryStatusHeadline,
    handleTabSelect,
    handleFilePicked
  };
}
