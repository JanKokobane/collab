import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getSprintMembers,
  normalizeTaskRecord,
  useDashboard
} from '../../context/DashboardContext';
import { api } from '../../services/api';
import type { Project, ProjectMember, TaskItem } from '../../types/dashboard';
import type {
  BoardCardItem,
  BoardColumnStatus,
  TaskAttachment,
  TaskComment,
  TaskItem as ViewerTaskItem,
  TaskSubtask
} from '../../types/taskViewer';
import { ProjectOverview } from './ProjectOverview';
import { TaskDetails } from './TaskDetails';

type OverviewTask = TaskItem & { assignees: ProjectMember[] };

function getOverviewTask(task: TaskItem, project: Project): OverviewTask {
  const sprint = project.sprints.find((item) => item.name === task.sprint);
  const sprintMembers = sprint ? getSprintMembers(project, sprint) : [];
  return {
    ...task,
    assignees: sprintMembers.length > 0 ? sprintMembers : task.sprintMembers || []
  };
}

function toBoardStatus(status?: string): BoardColumnStatus {
  if (status === 'Done') return 'Completed';
  if (status === 'In progress') return 'In Progress';
  return 'Pending';
}

function toBoardPriority(priority?: string): 'high' | 'normal' | 'low' {
  const normalized = String(priority || '').toLowerCase();
  if (normalized === 'high') return 'high';
  if (normalized === 'low') return 'low';
  return 'normal';
}

function normalizeTaskComment(raw: Record<string, unknown>, idx: number): TaskComment {
  const id = String(raw.comment_id || raw.id || `comment-${idx}`);
  const authorName = String(
    raw.author_name || raw.authorName || raw.author || raw.author_email || 'Teammate'
  );
  const text = String(raw.body ?? raw.text ?? '');
  const createdAt = String(raw.created_at || raw.createdAt || '');
  return {
    id,
    commentId: raw.comment_id ? String(raw.comment_id) : id,
    author: authorName,
    authorName,
    author_name: authorName,
    authorEmail: raw.author_email ? String(raw.author_email) : undefined,
    authorUid: raw.author_firebase_uid ? String(raw.author_firebase_uid) : undefined,
    authorProfileImage: raw.author_profile_image ? String(raw.author_profile_image) : undefined,
    text,
    body: text,
    createdAt,
    created_at: createdAt,
    attachments: Array.isArray(raw.attachments) ? (raw.attachments as TaskComment['attachments']) : []
  };
}

export const ProjectBoard: React.FC = () => {
  const {
    activeProject,
    isCurrentUserProjectCreator,
    projects,
    accessibleTasks,
    switchView,
    selectedTaskViewId,
    openFullTaskView,
    openTaskDetails,
    moveTaskStatus,
    setActiveModal,
    setTasks,
    showDashboardToast
  } = useDashboard();

  const project = activeProject;

  const tasks = useMemo(() => {
    if (!project) return [];
    return accessibleTasks
      .filter(
        (task) =>
          task.projectId === project.projectId ||
          task.project_id === project.projectId ||
          task.project === project.name
      )
      .map((task) => getOverviewTask(task, project));
  }, [accessibleTasks, project]);

  const allTasks = useMemo(
    () =>
      accessibleTasks.map((task) => {
        const taskProject = projects.find(
          (item) =>
            item.projectId === task.projectId ||
            item.projectId === task.project_id ||
            item.name === task.project
        );
        return taskProject ? getOverviewTask(task, taskProject) : { ...task, assignees: [] };
      }),
    [accessibleTasks, projects]
  );

  const selectedTaskBase = useMemo(() => {
    if (selectedTaskViewId === null) return null;
    const target = String(selectedTaskViewId);
    return (
      tasks.find(
        (t) =>
          String(t.id) === target ||
          String(t.taskId || '') === target ||
          String(t.task_id || '') === target
      ) ||
      allTasks.find(
        (t) =>
          String(t.id) === target ||
          String(t.taskId || '') === target ||
          String(t.task_id || '') === target
      ) ||
      null
    );
  }, [selectedTaskViewId, tasks, allTasks]);

  const selectedTaskProject = useMemo(() => {
    if (!selectedTaskBase) return project || null;
    return (
      projects.find(
        (item) =>
          item.projectId === selectedTaskBase.projectId ||
          item.projectId === selectedTaskBase.project_id ||
          item.name === selectedTaskBase.project
      ) ||
      project ||
      null
    );
  }, [selectedTaskBase, projects, project]);

  const [fetchedTask, setFetchedTask] = useState<OverviewTask | null>(null);
  const [taskComments, setTaskComments] = useState<TaskComment[]>([]);
  const [taskLoading, setTaskLoading] = useState<boolean>(false);
  const [taskError, setTaskError] = useState<string>('');
  const [retryCounter, setRetryCounter] = useState<number>(0);
  const [subtasksByTask, setSubtasksByTask] = useState<Record<string, TaskSubtask[]>>({});

  useEffect(() => {
    if (selectedTaskViewId === null || !selectedTaskProject?.projectId) {
      setFetchedTask(null);
      setTaskComments([]);
      setTaskLoading(false);
      setTaskError('');
      return;
    }

    const projectId = selectedTaskProject.projectId;
    const taskId = String(
      selectedTaskBase?.taskId || selectedTaskBase?.task_id || selectedTaskViewId
    );
    let cancelled = false;

    setTaskLoading(!selectedTaskBase);
    setTaskError('');

    Promise.all([
      api.get(
        `/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}?metadataOnly=true`
      ),
      api.get(
        `/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/comments`
      )
    ])
      .then(([taskRes, commentsRes]) => {
        if (cancelled) return;
        const rawTask = taskRes?.data?.task;
        if (rawTask) {
          const normalized = normalizeTaskRecord(rawTask, selectedTaskProject);
          setFetchedTask(getOverviewTask(normalized, selectedTaskProject));
        }
        const rawComments = Array.isArray(commentsRes?.data?.comments)
          ? commentsRes.data.comments
          : [];
        setTaskComments(rawComments.map(normalizeTaskComment));
        setTaskError('');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : 'Unable to load task details right now.';
        setTaskError(message);
      })
      .finally(() => {
        if (!cancelled) setTaskLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTaskViewId, selectedTaskProject, selectedTaskBase?.taskId, selectedTaskBase?.task_id, retryCounter]);

  const activeViewerTask: ViewerTaskItem | null = useMemo(() => {
    const source = fetchedTask || selectedTaskBase;
    if (!source) return null;

    const projectTasks = selectedTaskProject
      ? allTasks.filter(
          (item) =>
            item.projectId === selectedTaskProject.projectId ||
            item.project_id === selectedTaskProject.projectId ||
            item.project === selectedTaskProject.name
        )
      : tasks;

    const todayKey = new Date().toISOString().slice(0, 10);
    const boardItems: BoardCardItem[] = projectTasks.map((item) => {
      const dueDateKey = item.date || item.due_date || undefined;
      return {
        id: String(item.taskId || item.id),
        title: item.title,
        status: toBoardStatus(item.status),
        assignees: item.assignees || [],
        due: item.due && item.due !== '—' ? item.due : undefined,
        dueDateKey: dueDateKey || undefined,
        priority: toBoardPriority(item.priority),
        progress: item.progress,
        overdue: Boolean(dueDateKey && dueDateKey < todayKey && item.status !== 'Done')
      };
    });

    const key = String(source.taskId || source.id);
    return {
      ...source,
      subtasks: subtasksByTask[key] || [],
      boardItems
    };
  }, [fetchedTask, selectedTaskBase, selectedTaskProject, allTasks, tasks, subtasksByTask]);

  const handleAddComment = useCallback(
    async (taskId: string | number, text: string) => {
      if (!selectedTaskProject?.projectId) return;
      const tid = String(selectedTaskBase?.taskId || selectedTaskBase?.task_id || taskId);
      try {
        const res = await api.post(
          `/projects/${encodeURIComponent(selectedTaskProject.projectId)}/tasks/${encodeURIComponent(tid)}/comments`,
          { text, attachments: [] }
        );
        const created = res?.data?.comment;
        if (created) {
          setTaskComments((prev) => [...prev, normalizeTaskComment(created, prev.length)]);
          setTasks((prev) =>
            prev.map((item) =>
              String(item.id) === String(taskId) || String(item.taskId || '') === tid
                ? { ...item, comments: (item.comments || 0) + 1 }
                : item
            )
          );
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unable to post comment.';
        showDashboardToast(message, 'error');
      }
    },
    [selectedTaskProject, selectedTaskBase, setTasks, showDashboardToast]
  );

  const handleAddSubtask = useCallback(
    (taskId: string | number, title: string) => {
      const key = String(selectedTaskBase?.taskId || taskId);
      setSubtasksByTask((prev) => {
        const existing = prev[key] || [];
        return {
          ...prev,
          [key]: [
            ...existing,
            {
              id: `sub-${Date.now()}`,
              title,
              done: false
            }
          ]
        };
      });
    },
    [selectedTaskBase]
  );

  const handleToggleSubtask = useCallback(
    (taskId: string | number, subtaskId: string) => {
      const key = String(selectedTaskBase?.taskId || taskId);
      setSubtasksByTask((prev) => {
        const existing = prev[key] || [];
        return {
          ...prev,
          [key]: existing.map((sub) =>
            sub.id === subtaskId ? { ...sub, done: !sub.done } : sub
          )
        };
      });
    },
    [selectedTaskBase]
  );

  const handleUploadAttachment = useCallback(
    (_taskId: string | number, uploaded: TaskAttachment[]) => {
      if (uploaded.length > 0) {
        showDashboardToast(
          `${uploaded.length} file${uploaded.length === 1 ? '' : 's'} attached to this task view.`,
          'success'
        );
      }
    },
    [showDashboardToast]
  );

  if (selectedTaskViewId !== null) {
    return (
      <TaskDetails
        task={activeViewerTask}
        project={selectedTaskProject}
        comments={taskComments}
        loading={taskLoading}
        error={taskError}
        onRetry={() => setRetryCounter((n) => n + 1)}
        isProjectOwner={isCurrentUserProjectCreator}
        onOpenAnalysis={() => {
          if (activeViewerTask) openTaskDetails(activeViewerTask.id);
        }}
        onAddTask={() => {
          if (!project) return;
          setActiveModal({
            type: 'createTask',
            projectId: project.projectId
          });
        }}
        onAddComment={(tid, text) => {
          void handleAddComment(tid, text);
        }}
        onAddSubtask={handleAddSubtask}
        onToggleSubtask={handleToggleSubtask}
        onUploadAttachment={handleUploadAttachment}
      />
    );
  }

  if (!project) {
    return (
      <div role="status" style={{ padding: 24 }}>
        No project is available to display.
      </div>
    );
  }

  return (
    <ProjectOverview
      project={project}
      allProjects={projects}
      tasks={tasks}
      allTasks={allTasks}
      canViewTaskMetrics={isCurrentUserProjectCreator}
      onSelectProject={(projectId) => {
        const selected = projects.find((item) => item.projectId === projectId);
        if (selected) switchView(selected.name);
      }}
      onOpenProgressAside={(taskId) => openFullTaskView(taskId, project.name)}
      onToggleTaskDone={(taskId) => {
        const task = tasks.find((item) => String(item.id) === String(taskId));
        if (task) {
          void moveTaskStatus(taskId, task.status === 'Done' ? 'To do' : 'Done');
        }
      }}
      onAddTask={(projectId, title) =>
        setActiveModal({
          type: 'createTask',
          projectId,
          prefill: { title }
        })
      }
    />
  );
};
