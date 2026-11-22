import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getAvatarSource,
  getSprintMembers,
  getSprintMemberUids,
  getUserInitials,
  useDashboard
} from '../../context/DashboardContext';
import { api, apiBaseUrl } from '../../services/api';
import type {
  MediaAttachment,
  Project,
  ProjectMember,
  ProjectSprint,
  TaskComment,
  TaskItem
} from '../../types/dashboard';
import { createCx } from '../../utils/cx';
import { FileTypeIcon, formatFileSize } from '../../utils/fileIcons';
import { TaskMediaEditor, TaskMediaPlayers } from '../TaskMediaEditor';
import styles from './ProjectProgressAside.module.css';

const cx = createCx(styles);

function getTaskDueDateKey(task?: Partial<TaskItem> | null): string {
  const raw = task?.due_date || task?.dueDate || task?.date || '';
  return typeof raw === 'string' ? raw.slice(0, 10) : '';
}

function getSprintDueDateKey(sprint?: Partial<ProjectSprint> | null): string {
  const raw = sprint?.due_date || sprint?.dueDate || '';
  return typeof raw === 'string' ? raw.slice(0, 10) : '';
}

function formatDateShort(value?: string | null): string {
  if (!value) return '—';
  const key = String(value).slice(0, 10);
  const parsed = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(parsed);
}

function formatTimestamp(value?: string | null): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(parsed);
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getSprintStatusInfo(sprint: ProjectSprint, sprintTasks: TaskItem[]) {
  const sub = String(
    sprint.submissionStatus || sprint.submission_status || ''
  ).toLowerCase();
  if (sub === 'approved' || sub === 'completed') {
    return { label: 'Completed', toneClass: cx('is-completed') };
  }
  if (sub === 'pending_review' || sub === 'submitted') {
    return { label: 'Pending Review', toneClass: cx('is-pending-review') };
  }
  if (sub === 'changes_requested') {
    return { label: 'Changes Requested', toneClass: cx('is-changes-requested') };
  }
  if (sprintTasks.some((t) => t.status === 'Blocked')) {
    return { label: 'Blocked', toneClass: 'is-blocked' };
  }
  if (
    sprintTasks.length > 0 &&
    sprintTasks.every((t) => t.status === 'Done')
  ) {
    return { label: 'Ready to Submit', toneClass: cx('is-completed') };
  }
  if (sprintTasks.some((t) => t.status === 'In progress')) {
    return { label: 'Active', toneClass: 'is-active' };
  }
  return { label: 'Upcoming', toneClass: 'is-upcoming' };
}

function getTaskStatusBadgeClass(status: string): string {
  if (status === 'Done') return 'is-done';
  if (status === 'In progress') return 'is-progress';
  if (status === 'Blocked') return 'is-blocked';
  if (status === 'Backlog') return 'is-backlog';
  return 'is-todo';
}

export const ProjectProgressAside: React.FC = () => {
  const {
    asideTaskId,
    closeTaskDetails,
    projects,
    accessibleTasks,
    setTasks,
    loadProjectsFromAPI,
    loadAllProjectTasks,
    firebaseUser,
    currentUser,
    setActiveModal,
    showDashboardConfirmation,
    showDashboardToast,
    addAuditLog
  } = useDashboard();

  const selectedTask = useMemo(
    () =>
      asideTaskId !== null
        ? accessibleTasks.find(
            (t) =>
              String(t.id) === String(asideTaskId) ||
              String(t.taskId || '') === String(asideTaskId)
          ) || null
        : null,
    [accessibleTasks, asideTaskId]
  );

  const project: Project | null = useMemo(() => {
    if (!selectedTask) return null;
    return (
      projects.find(
        (p) =>
          (selectedTask.projectId && p.projectId === selectedTask.projectId) ||
          p.name === selectedTask.project
      ) || null
    );
  }, [projects, selectedTask]);

  const currentUid = firebaseUser?.uid || currentUser?.uid || '';
  const isOwner = Boolean(
    project?.creatorFirebaseUid && currentUid && project.creatorFirebaseUid === currentUid
  );

  const [freshTaskMeta, setFreshTaskMeta] = useState<Partial<TaskItem> | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [unreadComments, setUnreadComments] = useState(0);
  const [commentText, setCommentText] = useState('');
  const [commentAttachments, setCommentAttachments] = useState<MediaAttachment[]>([]);
  const [postingComment, setPostingComment] = useState(false);
  const [savingDeps, setSavingDeps] = useState(false);

  const [expandedSprintNames, setExpandedSprintNames] = useState<Set<string>>(new Set());
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const [sprintFeedbackMap, setSprintFeedbackMap] = useState<Record<string, string>>({});
  const [taskReviewNoteMap, setTaskReviewNoteMap] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [animateCharts, setAnimateCharts] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<MediaAttachment | null>(null);

  const printIframeRef = useRef<HTMLIFrameElement>(null);

  const projectTasks = useMemo(() => {
    if (!project) return [];
    return accessibleTasks.filter(
      (t) => t.projectId === project.projectId || t.project === project.name
    );
  }, [accessibleTasks, project]);

  const effectiveTask = useMemo<TaskItem | null>(() => {
    if (!selectedTask) return null;
    return freshTaskMeta ? { ...selectedTask, ...freshTaskMeta } : selectedTask;
  }, [selectedTask, freshTaskMeta]);

  const taskIdStr = effectiveTask ? String(effectiveTask.taskId || effectiveTask.id) : '';
  const commentsStorageKey = `collab-task-comments-read:${currentUid || 'anon'}:${taskIdStr}`;

  // Trigger chart animation on open
  useEffect(() => {
    if (asideTaskId === null) {
      setAnimateCharts(false);
      setCommentsExpanded(false);
      setPreviewMedia(null);
      return;
    }
    const t = window.setTimeout(() => setAnimateCharts(true), 60);
    return () => window.clearTimeout(t);
  }, [asideTaskId]);

  // Escape to close
  useEffect(() => {
    if (asideTaskId === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewMedia) {
          setPreviewMedia(null);
        } else {
          closeTaskDetails();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [asideTaskId, closeTaskDetails, previewMedia]);

  // Load metadata and comments
  const fetchTaskMetadataAndComments = useCallback(async () => {
    if (!project?.projectId || !taskIdStr) return;
    try {
      const [metaRes, commentsRes] = await Promise.allSettled([
        api.get(
          `/projects/${encodeURIComponent(project.projectId)}/tasks/${encodeURIComponent(taskIdStr)}?metadataOnly=true`
        ),
        api.get(
          `/projects/${encodeURIComponent(project.projectId)}/tasks/${encodeURIComponent(taskIdStr)}/comments`
        )
      ]);
      if (metaRes.status === 'fulfilled' && metaRes.value?.data?.task) {
        setFreshTaskMeta(metaRes.value.data.task);
      }
      if (commentsRes.status === 'fulfilled') {
        const list: TaskComment[] = Array.isArray(commentsRes.value?.data?.comments)
          ? commentsRes.value.data.comments
          : [];
        setComments(list);
        const lastReadIso = localStorage.getItem(commentsStorageKey) || '';
        const unread = list.filter((c) => {
          const created = String(c.createdAt || c.created_at || '');
          const authorUid = String(c.authorUid || c.author_firebase_uid || '');
          if (authorUid && authorUid === currentUid) return false;
          return !lastReadIso || created > lastReadIso;
        }).length;
        setUnreadComments(commentsExpanded ? 0 : unread);
      }
    } catch {
      // ignore background error
    }
  }, [commentsExpanded, commentsStorageKey, currentUid, project?.projectId, taskIdStr]);

  useEffect(() => {
    setFreshTaskMeta(null);
    setComments([]);
    if (!project?.projectId || !taskIdStr) return;
    fetchTaskMetadataAndComments();
  }, [fetchTaskMetadataAndComments, project?.projectId, taskIdStr]);

  // Poll comments every 30s while panel open & comments drawer collapsed
  useEffect(() => {
    if (asideTaskId === null || commentsExpanded || !project?.projectId || !taskIdStr) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchTaskMetadataAndComments();
      }
    }, 30000);
    return () => window.clearInterval(timer);
  }, [asideTaskId, commentsExpanded, fetchTaskMetadataAndComments, project?.projectId, taskIdStr]);

  const handleToggleComments = () => {
    const next = !commentsExpanded;
    setCommentsExpanded(next);
    if (next) {
      setUnreadComments(0);
      localStorage.setItem(commentsStorageKey, new Date().toISOString());
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project?.projectId || !taskIdStr) return;
    const text = commentText.trim();
    if (!text && !commentAttachments.length) {
      showDashboardToast('Enter a comment or attach media first.', 'error');
      return;
    }
    setPostingComment(true);
    try {
      const res = await api.post(
        `/projects/${encodeURIComponent(project.projectId)}/tasks/${encodeURIComponent(taskIdStr)}/comments`,
        {
          text,
          attachments: commentAttachments
        }
      );
      const saved = res?.data?.comment;
      if (saved) {
        setComments((prev) => [...prev, saved]);
      } else {
        await fetchTaskMetadataAndComments();
      }
      setCommentText('');
      setCommentAttachments([]);
      localStorage.setItem(commentsStorageKey, new Date().toISOString());
      setUnreadComments(0);
    } catch (err: any) {
      showDashboardToast(err?.message || 'Unable to post comment.', 'error');
    } finally {
      setPostingComment(false);
    }
  };

  const handleToggleDependency = async (predId: string, checked: boolean) => {
    if (!project?.projectId || !taskIdStr || !effectiveTask) return;
    const existingIds: string[] = Array.isArray(effectiveTask.predecessorTaskIds)
      ? effectiveTask.predecessorTaskIds.map(String)
      : [];
    const nextIds = checked
      ? [...new Set([...existingIds, predId])]
      : existingIds.filter((id) => id !== predId);

    setSavingDeps(true);
    try {
      await api.put(
        `/projects/${encodeURIComponent(project.projectId)}/tasks/${encodeURIComponent(taskIdStr)}/dependencies`,
        { predecessorTaskIds: nextIds }
      );
      setFreshTaskMeta((prev) => ({ ...(prev || {}), predecessorTaskIds: nextIds }));
      setTasks((prev) =>
        prev.map((t) =>
          String(t.taskId || t.id) === taskIdStr ? { ...t, predecessorTaskIds: nextIds } : t
        )
      );
      showDashboardToast('Task dependencies updated.', 'success');
    } catch (err: any) {
      showDashboardToast(err?.message || 'Unable to update dependencies.', 'error');
    } finally {
      setSavingDeps(false);
    }
  };

  const handleCompleteTask = async (task: TaskItem) => {
    if (!project?.projectId) return;
    const tid = String(task.taskId || task.id);
    const subStatus = String(
      task.taskSubmissionStatus || task.submission_status || ''
    ).toLowerCase();
    if (subStatus !== 'completed') {
      showDashboardToast(
        'Deliverable must be submitted and approved as completed before marking Done.',
        'error'
      );
      return;
    }
    setBusyKey(`complete:${tid}`);
    try {
      await api.patch(
        `/projects/${encodeURIComponent(project.projectId)}/tasks/${encodeURIComponent(tid)}/status`,
        { status: 'Done' }
      );
      await loadAllProjectTasks();
      if (tid === taskIdStr) {
        setFreshTaskMeta((prev) => ({ ...(prev || {}), status: 'Done', done: true }));
      }
      addAuditLog('Task completed', `Marked "${task.title}" as Done.`, 'checkCircle');
      showDashboardToast(`"${task.title}" marked as Done.`, 'success');
    } catch (err: any) {
      showDashboardToast(err?.message || 'Unable to update task status.', 'error');
    } finally {
      setBusyKey(null);
    }
  };

  const handleReviewTaskSubmission = async (
    task: TaskItem,
    decision: 'accept' | 'request_changes'
  ) => {
    if (!project?.projectId) return;
    const tid = String(task.taskId || task.id);
    const comment = (taskReviewNoteMap[tid] || '').trim();
    if (decision === 'request_changes' && !comment) {
      showDashboardToast('Please include feedback when requesting changes.', 'error');
      return;
    }
    setBusyKey(`task-review:${tid}`);
    try {
      await api.post(
        `/projects/${encodeURIComponent(project.projectId)}/tasks/${encodeURIComponent(tid)}/review-submission`,
        { decision, comment }
      );
      await loadAllProjectTasks();
      setTaskReviewNoteMap((prev) => ({ ...prev, [tid]: '' }));
      showDashboardToast(
        decision === 'accept' ? 'Submission approved.' : 'Revision feedback sent.',
        'success'
      );
    } catch (err: any) {
      showDashboardToast(err?.message || 'Unable to review task submission.', 'error');
    } finally {
      setBusyKey(null);
    }
  };

  const handleDownloadTaskAttachment = async (task: TaskItem, index: number, fileName: string) => {
    if (!project?.projectId) return;
    const tid = String(task.taskId || task.id);
    try {
      const token = await firebaseUser?.getIdToken();
      const url = `${apiBaseUrl}/projects/${encodeURIComponent(project.projectId)}/tasks/${encodeURIComponent(tid)}/submission-attachments/${index}`;
      const resp = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!resp.ok) throw new Error('Unable to download attachment.');
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fileName || `attachment-${index + 1}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    } catch (err: any) {
      showDashboardToast(err?.message || 'Download failed.', 'error');
    }
  };

  const handleSubmitSprint = async (sprint: ProjectSprint) => {
    if (!project?.projectId) return;
    setBusyKey(`sprint-submit:${sprint.name}`);
    try {
      await api.post(
        `/projects/${encodeURIComponent(project.projectId)}/sprints/${encodeURIComponent(sprint.name)}/submit`,
        { note: sprintFeedbackMap[sprint.name] || '' }
      );
      await loadProjectsFromAPI({ silent: true });
      setSprintFeedbackMap((prev) => ({ ...prev, [sprint.name]: '' }));
      showDashboardToast(`"${sprint.name}" submitted for review.`, 'success');
    } catch (err: any) {
      showDashboardToast(err?.message || 'Unable to submit sprint.', 'error');
    } finally {
      setBusyKey(null);
    }
  };

  const handleReviewSprint = async (
    sprint: ProjectSprint,
    decision: 'approve' | 'request_changes'
  ) => {
    if (!project?.projectId) return;
    const feedback = (sprintFeedbackMap[sprint.name] || '').trim();
    if (decision === 'request_changes' && !feedback) {
      showDashboardToast('Enter feedback before requesting sprint changes.', 'error');
      return;
    }
    setBusyKey(`sprint-review:${sprint.name}`);
    try {
      await api.post(
        `/projects/${encodeURIComponent(project.projectId)}/sprints/${encodeURIComponent(sprint.name)}/review`,
        { decision, feedback }
      );
      await loadProjectsFromAPI({ silent: true });
      setSprintFeedbackMap((prev) => ({ ...prev, [sprint.name]: '' }));
      showDashboardToast(
        decision === 'approve' ? 'Sprint approved.' : 'Sprint changes requested.',
        'success'
      );
    } catch (err: any) {
      showDashboardToast(err?.message || 'Unable to submit sprint review.', 'error');
    } finally {
      setBusyKey(null);
    }
  };

  const handleRemoveSprint = async (sprint: ProjectSprint) => {
    if (!project?.projectId) return;
    const confirmed = await showDashboardConfirmation({
      eyebrow: 'Sprint Schedule',
      title: `Remove ${sprint.name}?`,
      message:
        'Removing this sprint will renumber remaining sprints and cannot be undone.',
      confirmLabel: 'Remove Sprint',
      destructive: true
    });
    if (!confirmed) return;
    setBusyKey(`sprint-remove:${sprint.name}`);
    try {
      const remaining = (project.sprints || [])
        .filter((s) => s.name !== sprint.name)
        .map((s, idx) => {
          const stripped = String(s.name || '').replace(/^Sprint\s+\d+\s*:\s*/i, '');
          return {
            ...s,
            name: `Sprint ${idx + 1}: ${stripped || s.name}`
          };
        });
      await api.put(`/projects/${encodeURIComponent(project.projectId)}`, {
        sprints: remaining
      });
      await loadProjectsFromAPI({ silent: true });
      await loadAllProjectTasks();
      showDashboardToast('Sprint removed.', 'success');
    } catch (err: any) {
      showDashboardToast(err?.message || 'Unable to remove sprint.', 'error');
    } finally {
      setBusyKey(null);
    }
  };

  // Analytics derivations
  const analytics = useMemo(() => {
    const totalTasks = projectTasks.length;
    const counts = {
      todo: projectTasks.filter((t) => t.status === 'To do').length,
      progress: projectTasks.filter((t) => t.status === 'In progress').length,
      blocked: projectTasks.filter((t) => t.status === 'Blocked').length,
      done: projectTasks.filter((t) => t.status === 'Done').length,
      backlog: projectTasks.filter((t) => t.status === 'Backlog').length
    };
    const completionPct = totalTasks ? Math.round((counts.done / totalTasks) * 100) : 0;

    const sprints = project?.sprints || [];
    const sprintStats = sprints.map((sp) => {
      const sTasks = projectTasks.filter((t) => t.sprint === sp.name);
      const sDone = sTasks.filter((t) => t.status === 'Done').length;
      const sPct = sTasks.length ? Math.round((sDone / sTasks.length) * 100) : 0;
      return {
        sprint: sp,
        tasks: sTasks,
        doneCount: sDone,
        pct: sPct,
        statusInfo: getSprintStatusInfo(sp, sTasks)
      };
    });

    const sprintStatusCounts = {
      completed: sprintStats.filter(
        (s) =>
          String(
            s.sprint.submissionStatus || s.sprint.submission_status || ''
          ).toLowerCase() === 'approved' ||
          String(
            s.sprint.submissionStatus || s.sprint.submission_status || ''
          ).toLowerCase() === 'completed'
      ).length,
      review: sprintStats.filter((s) =>
        ['pending_review', 'submitted'].includes(
          String(s.sprint.submissionStatus || s.sprint.submission_status || '').toLowerCase()
        )
      ).length,
      active: sprintStats.filter((s) => s.statusInfo.label === 'Active').length,
      blocked: sprintStats.filter((s) => s.statusInfo.label === 'Blocked').length,
      upcoming: sprintStats.filter((s) => s.statusInfo.label === 'Upcoming').length
    };

    const recommendation =
      counts.blocked > 0
        ? {
            tone: 'is-attention',
            text: `${counts.blocked} blocked task${counts.blocked === 1 ? '' : 's'} detected. Resolve blockers or review dependencies before closing the sprint.`
          }
        : completionPct >= 80 && totalTasks > 0
          ? {
              tone: 'is-positive',
              text: `${completionPct}% of project deliverables are completed. Team velocity is on track for milestone sign-off.`
            }
          : {
              tone: 'is-planned',
              text:
                totalTasks > 0
                  ? `${counts.progress} active and ${counts.todo} queued tasks remaining across ${sprints.length} sprint(s).`
                  : 'Add tasks to this project board to track burndown and delivery velocity.'
            };

    return {
      totalTasks,
      counts,
      completionPct,
      sprintStats,
      sprintStatusCounts,
      recommendation
    };
  }, [project?.sprints, projectTasks]);

  const handlePrintReport = () => {
    if (!project || !printIframeRef.current) return;
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(project.name)} — Project Progress Report</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; color: #18181b; padding: 32px; line-height: 1.5; }
    h1 { margin: 0 0 6px; font-size: 22px; }
    .meta { color: #52525b; font-size: 13px; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .box { border: 1px solid #e4e4e7; border-radius: 8px; padding: 12px; }
    .box small { display: block; color: #71717a; font-size: 11px; }
    .box strong { font-size: 18px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
    th, td { border: 1px solid #e4e4e7; padding: 8px 10px; text-align: left; }
    th { background: #f8fafc; }
  </style>
</head>
<body>
  <h1>${escapeHtml(project.name)} — Progress Report</h1>
  <div class="meta">${escapeHtml(project.projectType)} • Timeline: ${escapeHtml(project.timeSpan || 'Ongoing')} • Generated ${escapeHtml(new Date().toLocaleDateString())}</div>
  <div class="grid">
    <div class="box"><small>Completion</small><strong>${analytics.completionPct}%</strong></div>
    <div class="box"><small>Total Tasks</small><strong>${analytics.totalTasks}</strong></div>
    <div class="box"><small>Completed</small><strong>${analytics.counts.done}</strong></div>
    <div class="box"><small>Blocked</small><strong>${analytics.counts.blocked}</strong></div>
  </div>
  <h2>Tasks Breakdown</h2>
  <table>
    <thead><tr><th>Task</th><th>Status</th><th>Priority</th><th>Sprint</th><th>Due</th></tr></thead>
    <tbody>
      ${projectTasks
        .map(
          (t) =>
            `<tr><td>${escapeHtml(t.title)}</td><td>${escapeHtml(t.status)}</td><td>${escapeHtml(t.priority || 'medium')}</td><td>${escapeHtml(t.sprint || '—')}</td><td>${escapeHtml(formatDateShort(getTaskDueDateKey(t)))}</td></tr>`
        )
        .join('')}
    </tbody>
  </table>
</body>
</html>`;
    const frame = printIframeRef.current;
    frame.srcdoc = html;
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        showDashboardToast('Unable to trigger print dialog.', 'error');
      }
    };
  };

  const teamRoster: ProjectMember[] = useMemo(() => {
    if (!project) return [];
    const map = new Map<string, ProjectMember>();
    if (project.creatorEmail || project.creatorName) {
      map.set(project.creatorFirebaseUid || project.creatorEmail || 'owner', {
        firebaseUid: project.creatorFirebaseUid || undefined,
        name: project.creatorName || 'Project Owner',
        email: project.creatorEmail || '',
        initials: project.creatorInitials || getUserInitials(project.creatorName),
        profileImage: project.creatorProfileImage || '',
        tone: project.creatorTone || 'teal',
        role: 'Owner'
      });
    }
    (project.acceptedMembers || []).forEach((m) => {
      const key = m.firebaseUid || m.email || m.name || '';
      if (key && !map.has(key)) map.set(key, m);
    });
    return [...map.values()];
  }, [project]);

  if (asideTaskId === null || !effectiveTask || !project) return null;

  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const taskSegments = [
    { key: 'done', label: 'Done', count: analytics.counts.done, cls: 'is-done' },
    { key: 'progress', label: 'In progress', count: analytics.counts.progress, cls: 'is-progress' },
    { key: 'blocked', label: 'Blocked', count: analytics.counts.blocked, cls: 'is-blocked' },
    { key: 'todo', label: 'To do', count: analytics.counts.todo + analytics.counts.backlog, cls: 'is-todo' }
  ];

  let taskDashOffset = 0;
  const sprintList = project.sprints || [];
  const allSprintsExpanded =
    sprintList.length > 0 && sprintList.every((s) => expandedSprintNames.has(s.name));

  const predecessorIds = new Set(
    (effectiveTask.predecessorTaskIds || []).map((id) => String(id))
  );
  const availableDependencies = projectTasks.filter(
    (t) => String(t.taskId || t.id) !== taskIdStr
  );

  return (
    <div
      className={cx('project-progress-aside-backdrop')}
      role="dialog"
      aria-modal="true"
      aria-label={`${project.name} overview`}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeTaskDetails();
      }}
    >
      <aside className={cx('project-progress-aside', 'is-overview')}>
        <header className={cx('project-progress-aside-header')}>
          <div className={cx('project-progress-aside-brand')}>
            <a
              className={cx('project-progress-aside-logo')}
              href="#close-overview"
              onClick={(e) => {
                e.preventDefault();
                closeTaskDetails();
              }}
            >
              <img src="/images/logo.png" alt="Collab" />
            </a>
            <div className={cx('project-progress-aside-header-copy')}>
              <span className={cx('project-progress-aside-eyebrow')}>PROJECT OVERVIEW</span>
              <h2>{project.name}</h2>
              <p>{project.projectType || 'General Collaboration'}</p>
            </div>
          </div>

          <div className={cx('project-progress-aside-header-actions')}>
            {isOwner && (
              <button
                type="button"
                className={cx('project-progress-aside-action')}
                onClick={() => {
                  closeTaskDetails();
                  setActiveModal({ type: 'editProject', projectId: project.projectId });
                }}
              >
                Edit Project
              </button>
            )}
            <button
              type="button"
              className={cx('project-progress-aside-close')}
              aria-label="Close project overview"
              onClick={closeTaskDetails}
            >
              ×
            </button>
          </div>
        </header>

        <div className={cx('project-progress-aside-content')}>
          {/* Hero Card: Summary Metrics & Focused Task */}
          <section className={cx('project-progress-aside-hero')}>
            <div className={cx('project-progress-aside-summary')}>
              <div className={cx('project-progress-aside-metric')}>
                <small>Focused Deliverable</small>
                <strong>{effectiveTask.title}</strong>
              </div>
              <div className={cx('project-progress-aside-metric')}>
                <small>Completion Rate</small>
                <strong>
                  {analytics.completionPct}% ({analytics.counts.done}/{analytics.totalTasks})
                </strong>
              </div>
              <div className={cx('project-progress-aside-metric')}>
                <small>Timeline</small>
                <strong>{project.timeSpan || 'Ongoing'}</strong>
              </div>
              <div className={cx('project-progress-aside-metric')}>
                <small>Sprints</small>
                <strong>{sprintList.length} planned</strong>
              </div>
            </div>

            {project.description && (
              <p className={cx('project-progress-aside-description')}>{project.description}</p>
            )}

            <div className={cx('project-progress-aside-focus')}>
              <div>
                <strong>Focused Task Status: {effectiveTask.status}</strong>
                <span>
                  {effectiveTask.sprint ? `${effectiveTask.sprint} • ` : ''}
                  Due {formatDateShort(getTaskDueDateKey(effectiveTask))}
                </span>
              </div>
              <div className={cx('project-progress-analysis-actions')}>
                {effectiveTask.status !== 'Done' && (
                  <button
                    type="button"
                    className={cx('project-progress-aside-complete')}
                    disabled={
                      busyKey === `complete:${taskIdStr}` ||
                      String(
                        effectiveTask.taskSubmissionStatus || effectiveTask.submission_status || ''
                      ).toLowerCase() !== 'completed'
                    }
                    title={
                      String(
                        effectiveTask.taskSubmissionStatus || effectiveTask.submission_status || ''
                      ).toLowerCase() !== 'completed'
                        ? 'Task deliverable must be approved as completed before closing'
                        : 'Mark task Done'
                    }
                    onClick={() => handleCompleteTask(effectiveTask)}
                  >
                    ✓ Mark Done
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Production Analysis */}
          <section className={cx('project-progress-aside-analysis')}>
            <div className={cx('project-progress-aside-section-heading')}>
              <div className={cx('project-progress-aside-heading-group')}>
                <span className={cx('project-progress-aside-heading-icon')} aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M3 3v18h18" />
                    <path d="M18 17V9" />
                    <path d="M13 17V5" />
                    <path d="M8 17v-3" />
                  </svg>
                </span>
                <div className={cx('project-progress-analysis-heading-copy')}>
                  <h3>Production Analytics</h3>
                  <small>Real-time velocity, task status breakdown, and sprint progress</small>
                </div>
              </div>
              <div className={cx('project-progress-analysis-actions')}>
                <button
                  type="button"
                  className={cx('project-progress-report-download')}
                  onClick={handlePrintReport}
                >
                  Download Report
                </button>
              </div>
            </div>

            <div className={cx('project-progress-analysis-charts')}>
              {/* Donut Card */}
              <div className={cx('project-progress-chart')}>
                <div className={cx('project-progress-chart-title')}>
                  <h4>Task Status Distribution</h4>
                  <small>{analytics.totalTasks} total deliverables</small>
                </div>
                {analytics.totalTasks === 0 ? (
                  <div className={cx('project-progress-chart-empty')}>No tasks to chart yet.</div>
                ) : (
                  <div className={cx('project-progress-donut-layout')}>
                    <div className={cx('project-progress-donut')}>
                      <svg viewBox="0 0 120 120" aria-hidden="true">
                        <circle
                          cx="60"
                          cy="60"
                          r={radius}
                          className={cx('project-progress-donut-track')}
                        />
                        {taskSegments.map((seg) => {
                          if (seg.count <= 0) return null;
                          const dash = (seg.count / analytics.totalTasks) * circumference;
                          const offset = -taskDashOffset;
                          taskDashOffset += dash;
                          return (
                            <circle
                              key={seg.key}
                              cx="60"
                              cy="60"
                              r={radius}
                              className={cx(
                                'project-progress-donut-segment',
                                seg.cls,
                                animateCharts && 'is-animated'
                              )}
                              strokeDasharray={`${dash} ${circumference - dash}`}
                              strokeDashoffset={offset}
                              transform="rotate(-90 60 60)"
                            />
                          );
                        })}
                      </svg>
                      <div className={cx('project-progress-donut-center')}>
                        <strong>{analytics.completionPct}%</strong>
                        <small>Done</small>
                      </div>
                    </div>
                    <div className={cx('project-progress-donut-legend')}>
                      {taskSegments.map((seg) => (
                        <div key={seg.key} className={cx('project-progress-donut-legend-item')}>
                          <span className={cx('project-progress-legend-dot', seg.cls)} />
                          <span>{seg.label}</span>
                          <strong>{seg.count}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sprint Velocity Bar Card */}
              <div className={cx('project-progress-chart')}>
                <div className={cx('project-progress-chart-title')}>
                  <h4>Sprint Delivery Progress</h4>
                  <small>{sprintList.length} sprint cycles tracked</small>
                </div>
                {sprintList.length === 0 ? (
                  <div className={cx('project-progress-chart-empty')}>
                    Create sprints to visualize cycle progress.
                  </div>
                ) : (
                  <>
                    <div className={cx('project-progress-column-graph')}>
                      <div className={cx('project-progress-column-axis')}>
                        <span>100%</span>
                        <span>75%</span>
                        <span>50%</span>
                        <span>25%</span>
                        <span>0%</span>
                      </div>
                      <div
                        className={cx('project-progress-column-plot')}
                        style={{ ['--column-count' as any]: Math.max(1, analytics.sprintStats.length) }}
                      >
                        {analytics.sprintStats.map((item) => (
                          <div key={item.sprint.name} className={cx('project-progress-column-group')}>
                            <div className={cx('project-progress-column-bars', 'is-paired')}>
                              <div
                                className={cx('project-progress-column-bar', 'is-planned')}
                                style={{ height: '100%' }}
                              >
                                <span
                                  className={cx(
                                    'project-progress-column-fill',
                                    animateCharts && 'is-animated'
                                  )}
                                  style={{ height: item.tasks.length ? '100%' : '12%' }}
                                />
                                <span className={cx('project-progress-column-value')}>
                                  {item.tasks.length}
                                </span>
                              </div>
                              <div
                                className={cx(
                                  'project-progress-column-bar',
                                  'is-done',
                                  item.pct === 0 && 'is-zero'
                                )}
                                style={{ height: '100%' }}
                              >
                                <span
                                  className={cx(
                                    'project-progress-column-fill',
                                    animateCharts && 'is-animated'
                                  )}
                                  style={{ height: `${Math.max(4, item.pct)}%` }}
                                />
                                <span className={cx('project-progress-column-value')}>
                                  {item.pct}%
                                </span>
                              </div>
                            </div>
                            <span
                              className={cx('project-progress-column-label')}
                              title={item.sprint.name}
                            >
                              {item.sprint.name}
                            </span>
                            <span className={cx('project-progress-column-status')}>
                              {item.doneCount}/{item.tasks.length}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className={cx('project-progress-column-legend')}>
                      <span>Planned Tasks</span>
                      <span className="is-done">Completion %</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className={cx('project-progress-analysis-recommendation', analytics.recommendation.tone)}>
              {analytics.recommendation.text}
            </div>
          </section>

          {/* Dependencies */}
          <section className={cx('project-progress-aside-section', 'is-dependencies')}>
            <div className={cx('project-progress-aside-section-heading')}>
              <div className={cx('project-progress-aside-heading-group')}>
                <span className={cx('project-progress-aside-heading-icon')} aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <circle cx="6" cy="6" r="3" />
                    <circle cx="18" cy="18" r="3" />
                    <path d="M8.6 8.6L15.4 15.4" />
                  </svg>
                </span>
                <h3>Task Dependencies</h3>
              </div>
              <span className={cx('project-progress-aside-count')}>{predecessorIds.size}</span>
            </div>

            <div className={cx('project-dependency-graph')}>
              <div className={cx('project-dependency-list')}>
                <div className={cx('project-dependency-row')}>
                  <div className={cx('project-dependency-node')}>
                    <span className={cx('project-dependency-node-label')}>Target Task</span>
                    <strong>{effectiveTask.title}</strong>
                  </div>
                  <span className={cx('project-dependency-arrow')}>←</span>
                  <div className={cx('project-dependency-target')}>
                    <small>
                      {predecessorIds.size
                        ? `${predecessorIds.size} prerequisite(s) required first`
                        : 'No prerequisites selected'}
                    </small>
                  </div>
                </div>
              </div>

              {availableDependencies.length > 0 ? (
                <div className={cx('project-dependency-select')}>
                  {availableDependencies.map((candidate) => {
                    const candId = String(candidate.taskId || candidate.id);
                    const checked = predecessorIds.has(candId);
                    return (
                      <label key={candId} className={cx('checkbox-label')}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={savingDeps}
                          onChange={(e) => handleToggleDependency(candId, e.target.checked)}
                        />
                        <span>
                          {candidate.title} ({candidate.status})
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className={cx('project-progress-aside-empty')}>
                  Add another task to this project to configure dependencies.
                </p>
              )}
            </div>
          </section>

          {/* Comments Drawer */}
          <section className={cx('project-progress-aside-section', 'is-comments')}>
            <button
              type="button"
              className={cx('project-comments-toggle')}
              aria-expanded={commentsExpanded}
              onClick={handleToggleComments}
            >
              <span className={cx('project-comments-toggle-title')}>
                💬 Task Discussion &amp; Media
                {unreadComments > 0 && (
                  <span className={cx('project-comments-count-badge')}>{unreadComments} new</span>
                )}
              </span>
              <span className={cx('project-comments-toggle-right')}>
                <span className={cx('project-comments-toggle-hint')}>
                  {comments.length} comment{comments.length === 1 ? '' : 's'}
                </span>
                <span className={cx('project-comments-chevron')}>{commentsExpanded ? '▴' : '▾'}</span>
              </span>
            </button>

            {commentsExpanded && (
              <div className={cx('project-comments-drawer')}>
                <div className={cx('task-comment-list')}>
                  {comments.length === 0 ? (
                    <p className={cx('project-comments-empty')}>
                      No comments yet. Start a discussion with your team.
                    </p>
                  ) : (
                    comments.map((comment, idx) => {
                      const authorName =
                        comment.authorName || comment.author_name || 'Teammate';
                      const avatarImg =
                        comment.authorProfileImage || comment.author_profile_image || '';
                      const atts = Array.isArray(comment.attachments) ? comment.attachments : [];
                      return (
                        <div
                          key={comment.id || comment.comment_id || idx}
                          className={cx('project-comment-item')}
                        >
                          <div className={cx('project-comment-avatar')}>
                            {avatarImg ? (
                              <img src={avatarImg} alt={authorName} />
                            ) : (
                              <span>{getUserInitials(authorName)}</span>
                            )}
                          </div>
                          <div className={cx('project-comment-content')}>
                            <div className={cx('project-comment-header')}>
                              <strong>{authorName}</strong>
                              <time>
                                {formatTimestamp(comment.createdAt || comment.created_at)}
                              </time>
                            </div>
                            {(comment.text || comment.body) && (
                              <p className={cx('task-comment-body')}>
                                {comment.text || comment.body}
                              </p>
                            )}
                            {atts.length > 0 && (
                              <>
                                <TaskMediaPlayers attachments={atts} />
                                {atts.map((att: MediaAttachment, aIdx: number) => {
                                  const src = String(
                                    att.dataUrl || att.data_url || att.url || att.data || ''
                                  );
                                  const mime = String(
                                    att.mimeType || att.mime_type || att.type || ''
                                  );
                                  if (
                                    src &&
                                    (mime.startsWith('image/') || mime.startsWith('video/'))
                                  ) {
                                    return (
                                      <button
                                        key={aIdx}
                                        type="button"
                                        className={cx('project-comment-media-expand')}
                                        onClick={() => setPreviewMedia(att)}
                                      >
                                        ⤢ Preview {att.fileName || att.name || 'media'}
                                      </button>
                                    );
                                  }
                                  return null;
                                })}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <form className={cx('task-comment-form')} onSubmit={handlePostComment}>
                  <div className={cx('collab-textarea-wrap')}>
                    <textarea
                      className={cx('collab-textarea')}
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Write a comment or attach screen recording / files…"
                      rows={2}
                    />
                    <div className={cx('collab-action-bar')}>
                      <div className={cx('collab-comment-media')}>
                        <TaskMediaEditor
                          attachments={commentAttachments}
                          onChange={setCommentAttachments}
                          label="Attach"
                        />
                      </div>
                      <button
                        type="submit"
                        className={cx('collab-post-btn')}
                        disabled={postingComment}
                      >
                        {postingComment ? 'Posting…' : 'Post Comment'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </section>

          {/* Sprints Delivery Sheet */}
          <section className={cx('project-progress-aside-section', 'is-sprints')}>
            <div className={cx('project-progress-aside-section-heading')}>
              <div className={cx('project-progress-aside-heading-group')}>
                <span className={cx('project-progress-aside-heading-icon')} aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </span>
                <h3>Project Sprints</h3>
              </div>
              <div className={cx('project-progress-analysis-actions')}>
                {sprintList.length > 0 && (
                  <button
                    type="button"
                    className={cx('project-sprint-sheet-bulk-toggle')}
                    onClick={() => {
                      if (allSprintsExpanded) {
                        setExpandedSprintNames(new Set());
                      } else {
                        setExpandedSprintNames(new Set(sprintList.map((s) => s.name)));
                      }
                    }}
                  >
                    {allSprintsExpanded ? 'Collapse all' : 'Expand all'}
                  </button>
                )}
              </div>
            </div>

            {sprintList.length === 0 ? (
              <p className={cx('project-progress-aside-empty')}>No sprints configured yet.</p>
            ) : (
              <div className={cx('project-sprint-sheet-wrap')}>
                <table className={cx('project-sprint-sheet')}>
                  <thead>
                    <tr>
                      <th className={cx('is-index')}>#</th>
                      <th className={cx('is-sprint')}>Sprint</th>
                      <th className={cx('is-status')}>Status</th>
                      <th className={cx('is-members')}>Members</th>
                      <th className={cx('is-schedule')}>Due Date</th>
                      <th className={cx('is-actions')}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.sprintStats.map((stat, idx) => {
                      const sp = stat.sprint;
                      const expanded = expandedSprintNames.has(sp.name);
                      const assignedMembers = getSprintMembers(project, sp);
                      const isAssignedMember =
                        currentUid && getSprintMemberUids(sp).includes(currentUid);
                      const subStatus = String(
                        sp.submissionStatus || sp.submission_status || ''
                      ).toLowerCase();
                      const canSubmitSprint =
                        isAssignedMember &&
                        subStatus !== 'approved' &&
                        subStatus !== 'completed' &&
                        subStatus !== 'pending_review';
                      const canReviewSprint = isOwner && subStatus === 'pending_review';

                      return (
                        <React.Fragment key={sp.name}>
                          <tr
                            className={cx(
                              'project-sprint-sheet-row',
                              expanded && 'is-expanded'
                            )}
                          >
                            <td className={cx('project-sprint-sheet-cell', 'is-index')}>
                              <span className={cx('project-sprint-sheet-index')}>
                                {String(idx + 1).padStart(2, '0')}
                              </span>
                            </td>
                            <td className={cx('project-sprint-sheet-cell')}>
                              <button
                                type="button"
                                className={cx('project-sprint-sheet-title-btn')}
                                onClick={() => {
                                  setExpandedSprintNames((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(sp.name)) next.delete(sp.name);
                                    else next.add(sp.name);
                                    return next;
                                  });
                                }}
                              >
                                <span className={cx('project-sprint-sheet-name')}>{sp.name}</span>
                                <span className={cx('project-sprint-sheet-brief')}>
                                  {sp.description || `${stat.tasks.length} task(s) • ${stat.pct}% done`}
                                </span>
                              </button>
                            </td>
                            <td className={cx('project-sprint-sheet-cell')}>
                              <span
                                className={cx(
                                  'project-sprint-status',
                                  stat.statusInfo.toneClass
                                )}
                              >
                                {stat.statusInfo.label}
                              </span>
                            </td>
                            <td className={cx('project-sprint-sheet-cell')}>
                              {assignedMembers.length > 0 ? (
                                <div className={cx('project-sprint-sheet-lead')}>
                                  {assignedMembers.map((m, mIdx) => {
                                    const mAvatar = getAvatarSource(m);
                                    return (
                                      <span
                                        key={m.firebaseUid || mIdx}
                                        className={cx('project-sprint-sheet-member')}
                                      >
                                        <span
                                          className={cx(
                                            'avatar',
                                            'project-sprint-lead-avatar',
                                            `${m.tone || 'teal'}-bg`
                                          )}
                                        >
                                          {mAvatar ? (
                                            <img src={mAvatar} alt={m.name} />
                                          ) : (
                                            m.initials || getUserInitials(m.name)
                                          )}
                                        </span>
                                        <span className={cx('project-sprint-sheet-lead-name')}>
                                          {m.name}
                                        </span>
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className={cx('project-sprint-sheet-muted')}>Unassigned</span>
                              )}
                            </td>
                            <td className={cx('project-sprint-sheet-cell')}>
                              <span className={cx('project-sprint-sheet-date')}>
                                {formatDateShort(getSprintDueDateKey(sp))}
                              </span>
                            </td>
                            <td className={cx('project-sprint-sheet-cell', 'is-actions')}>
                              <button
                                type="button"
                                className={cx(
                                  'project-sprint-sheet-toggle',
                                  (canSubmitSprint || canReviewSprint) && 'has-pending-action'
                                )}
                                onClick={() => {
                                  setExpandedSprintNames((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(sp.name)) next.delete(sp.name);
                                    else next.add(sp.name);
                                    return next;
                                  });
                                }}
                              >
                                <span className={cx('project-sprint-card-toggle-label')}>
                                  {expanded ? 'Hide' : 'View'}
                                </span>
                                <span className={cx('project-sprint-card-toggle-icon')}>▾</span>
                              </button>
                            </td>
                          </tr>

                          <tr
                            className={cx('project-sprint-sheet-detail-row')}
                            hidden={!expanded}
                          >
                            <td colSpan={6} className={cx('project-sprint-sheet-detail-cell')}>
                              <div className={cx('project-sprint-sheet-details')}>
                                <div
                                  className={cx(
                                    'project-sprint-sheet-detail-grid',
                                    !canSubmitSprint && !canReviewSprint && 'is-single-pane'
                                  )}
                                >
                                  <div className={cx('project-sprint-sheet-detail-pane')}>
                                    {sp.description && (
                                      <div className={cx('project-sprint-sheet-block')}>
                                        <p className={cx('project-sprint-card-description')}>
                                          {sp.description}
                                        </p>
                                      </div>
                                    )}
                                    <div className={cx('project-sprint-sheet-block')}>
                                      <div className={cx('project-sprint-card-progress')}>
                                        <div className={cx('project-sprint-card-track')}>
                                          <span
                                            className={cx('project-sprint-card-fill')}
                                            style={{ width: `${stat.pct}%` }}
                                          />
                                        </div>
                                        <span className={cx('project-sprint-card-percent')}>
                                          {stat.pct}%
                                        </span>
                                      </div>
                                      <div className={cx('project-sprint-sheet-task-list')}>
                                        {stat.tasks.length === 0 ? (
                                          <p className={cx('project-sprint-sheet-empty-note')}>
                                            No tasks assigned to this sprint.
                                          </p>
                                        ) : (
                                          stat.tasks.map((st) => (
                                            <div
                                              key={st.id}
                                              className={cx('project-sprint-sheet-task-item')}
                                            >
                                              <span
                                                className={cx('project-sprint-sheet-task-title')}
                                              >
                                                {st.title}
                                              </span>
                                              <span className={cx('project-sprint-sheet-task-due')}>
                                                {st.status} • {formatDateShort(getTaskDueDateKey(st))}
                                              </span>
                                            </div>
                                          ))
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {(canSubmitSprint || canReviewSprint) && (
                                    <div className={cx('project-sprint-sheet-action-card')}>
                                      <div className={cx('project-sprint-review-form')}>
                                        <textarea
                                          rows={2}
                                          value={sprintFeedbackMap[sp.name] || ''}
                                          onChange={(e) =>
                                            setSprintFeedbackMap((prev) => ({
                                              ...prev,
                                              [sp.name]: e.target.value
                                            }))
                                          }
                                          placeholder={
                                            canReviewSprint
                                              ? 'Add review notes or feedback…'
                                              : 'Optional handoff summary for sprint review…'
                                          }
                                        />
                                        <div className={cx('project-progress-analysis-actions')}>
                                          {canSubmitSprint && (
                                            <button
                                              type="button"
                                              className="primary-button gold"
                                              disabled={busyKey === `sprint-submit:${sp.name}`}
                                              onClick={() => handleSubmitSprint(sp)}
                                            >
                                              {busyKey === `sprint-submit:${sp.name}`
                                                ? 'Submitting…'
                                                : 'Submit Sprint'}
                                            </button>
                                          )}
                                          {canReviewSprint && (
                                            <>
                                              <button
                                                type="button"
                                                className="primary-button gold"
                                                disabled={busyKey === `sprint-review:${sp.name}`}
                                                onClick={() => handleReviewSprint(sp, 'approve')}
                                              >
                                                Approve Sprint
                                              </button>
                                              <button
                                                type="button"
                                                className="outline-button"
                                                disabled={busyKey === `sprint-review:${sp.name}`}
                                                onClick={() =>
                                                  handleReviewSprint(sp, 'request_changes')
                                                }
                                              >
                                                Request Changes
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {isOwner && (
                                  <div className={cx('project-sprint-sheet-detail-footer')}>
                                    <button
                                      type="button"
                                      className={cx('project-sprint-sheet-remove-btn')}
                                      disabled={busyKey === `sprint-remove:${sp.name}`}
                                      onClick={() => handleRemoveSprint(sp)}
                                    >
                                      Remove Sprint
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Team Members */}
          <section className={cx('project-progress-aside-section', 'is-members')}>
            <div className={cx('project-progress-aside-section-heading')}>
              <div className={cx('project-progress-aside-heading-group')}>
                <span className={cx('project-progress-aside-heading-icon')} aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </span>
                <h3>Team Members</h3>
              </div>
              <span className={cx('project-progress-aside-count')}>{teamRoster.length}</span>
            </div>

            <div className={cx('project-progress-aside-members')}>
              {teamRoster.map((member, mIdx) => {
                const avatarUrl = getAvatarSource(member);
                const memberName = member.name || member.email || 'Member';
                return (
                  <div
                    key={member.firebaseUid || member.email || mIdx}
                    className={cx('project-progress-aside-member', mIdx === 0 && 'is-owner')}
                  >
                    <span
                      className={cx(
                        'avatar',
                        'project-progress-aside-avatar',
                        `${member.tone || 'teal'}-bg`
                      )}
                    >
                      {avatarUrl ? (
                        <img src={avatarUrl} alt={memberName} />
                      ) : (
                        member.initials || getUserInitials(memberName)
                      )}
                    </span>
                    <div className={cx('project-progress-aside-member-details')}>
                      <strong>{memberName}</strong>
                      <small>{member.role || member.email}</small>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Project Tasks Accordion */}
          <section className={cx('project-progress-aside-section', 'is-tasks')}>
            <div className={cx('project-progress-aside-section-heading')}>
              <div className={cx('project-progress-aside-heading-group')}>
                <span className={cx('project-progress-aside-heading-icon')} aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <polyline points="9 11 12 14 22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                </span>
                <h3>Project Tasks</h3>
              </div>
              <span className={cx('project-progress-aside-count')}>{projectTasks.length}</span>
            </div>

            {projectTasks.length === 0 ? (
              <p className={cx('project-progress-aside-empty')}>No tasks on this board yet.</p>
            ) : (
              <div className={cx('project-progress-aside-tasks')}>
                {projectTasks.map((t) => {
                  const tid = String(t.taskId || t.id);
                  const expanded = expandedTaskIds.has(tid) || tid === taskIdStr;
                  const subStatus = String(
                    t.taskSubmissionStatus || t.submission_status || ''
                  ).toLowerCase();
                  const subAttachments = Array.isArray(t.submissionAttachments)
                    ? t.submissionAttachments
                    : [];

                  return (
                    <div
                      key={tid}
                      className={cx(
                        'project-progress-aside-task',
                        expanded && 'is-expanded',
                        tid === taskIdStr && 'is-selected'
                      )}
                    >
                      <button
                        type="button"
                        className={cx('project-progress-aside-task-toggle')}
                        aria-expanded={expanded}
                        onClick={() => {
                          setExpandedTaskIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(tid)) next.delete(tid);
                            else next.add(tid);
                            return next;
                          });
                        }}
                      >
                        <div className={cx('project-progress-aside-task-summary')}>
                          <strong>{t.title}</strong>
                          <span>
                            {t.sprint || 'No sprint'} • Due {formatDateShort(getTaskDueDateKey(t))}
                          </span>
                        </div>
                        <span
                          className={cx(
                            'project-progress-aside-task-status',
                            getTaskStatusBadgeClass(t.status)
                          )}
                        >
                          {t.status}
                        </span>
                      </button>

                      {expanded && (
                        <div className={cx('project-progress-aside-task-details')}>
                          {t.description && (
                            <p className={cx('project-progress-aside-task-description')}>
                              {t.description}
                            </p>
                          )}

                          {Array.isArray(t.descriptionAttachments) &&
                            t.descriptionAttachments.length > 0 && (
                              <TaskMediaPlayers attachments={t.descriptionAttachments} />
                            )}

                          {subAttachments.length > 0 && (
                            <div className="project-task-sprint-submission">
                              <div className="project-task-sprint-submission-title">
                                Submitted Attachments
                              </div>
                              <div className="project-task-sprint-submission-links">
                                {subAttachments.map((att, aIdx) => (
                                  <button
                                    key={aIdx}
                                    type="button"
                                    className="project-task-sprint-submission-link"
                                    onClick={() =>
                                      handleDownloadTaskAttachment(
                                        t,
                                        aIdx,
                                        att.fileName || att.name || `submission-${aIdx + 1}`
                                      )
                                    }
                                  >
                                    <FileTypeIcon
                                      fileName={att.fileName || att.name}
                                      mimeType={att.mimeType}
                                      size={14}
                                    />
                                    <span>{att.fileName || att.name || 'Download file'}</span>
                                    {att.size ? <small>({formatFileSize(att.size)})</small> : null}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {isOwner && subStatus === 'pending_review' && (
                            <div className="project-task-sprint-review-form">
                              <textarea
                                rows={2}
                                value={taskReviewNoteMap[tid] || ''}
                                onChange={(e) =>
                                  setTaskReviewNoteMap((prev) => ({
                                    ...prev,
                                    [tid]: e.target.value
                                  }))
                                }
                                placeholder="Review comment or revision request…"
                              />
                              <div className={cx('project-progress-analysis-actions')}>
                                <button
                                  type="button"
                                  className="primary-button gold"
                                  disabled={busyKey === `task-review:${tid}`}
                                  onClick={() => handleReviewTaskSubmission(t, 'accept')}
                                >
                                  Approve Deliverable
                                </button>
                                <button
                                  type="button"
                                  className="outline-button"
                                  disabled={busyKey === `task-review:${tid}`}
                                  onClick={() => handleReviewTaskSubmission(t, 'request_changes')}
                                >
                                  Request Changes
                                </button>
                              </div>
                            </div>
                          )}

                          {t.status !== 'Done' && (
                            <div>
                              <button
                                type="button"
                                className={cx('project-progress-aside-complete')}
                                disabled={
                                  busyKey === `complete:${tid}` || subStatus !== 'completed'
                                }
                                onClick={() => handleCompleteTask(t)}
                              >
                                ✓ Mark Task Done
                              </button>
                              {subStatus !== 'completed' && (
                                <span className="project-task-status-lock">
                                  Requires approved submission before marking Done.
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <iframe
          ref={printIframeRef}
          title="Project Report Print Frame"
          style={{ position: 'fixed', width: 0, height: 0, border: 0, visibility: 'hidden' }}
        />
      </aside>

      {previewMedia && (
        <div
          className={cx('project-comment-media-preview-backdrop')}
          onClick={() => setPreviewMedia(null)}
        >
          <div
            className={cx('project-comment-media-preview')}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={cx('project-comment-media-preview-close')}
              aria-label="Close media preview"
              onClick={() => setPreviewMedia(null)}
            >
              ×
            </button>
            {String(previewMedia.mimeType || previewMedia.mime_type || '').startsWith('video/') ? (
              <video
                className={cx('project-comment-media-preview-video')}
                src={String(
                  previewMedia.dataUrl || previewMedia.data_url || previewMedia.url || previewMedia.data || ''
                )}
                controls
                autoPlay
              />
            ) : (
              <img
                className={cx('project-comment-media-preview-image')}
                src={String(
                  previewMedia.dataUrl || previewMedia.data_url || previewMedia.url || previewMedia.data || ''
                )}
                alt={previewMedia.fileName || previewMedia.name || 'Preview'}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
