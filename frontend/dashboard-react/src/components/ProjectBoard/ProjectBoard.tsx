import React, { useMemo } from 'react';
import { getSprintMembers, useDashboard } from '../../context/DashboardContext';
import type { Project, ProjectMember, TaskItem } from '../../types/dashboard';
import { ProjectOverview } from './ProjectOverview';

type OverviewTask = TaskItem & { assignees: ProjectMember[] };

function getOverviewTask(task: TaskItem, project: Project): OverviewTask {
  const sprint = project.sprints.find((item) => item.name === task.sprint);
  return {
    ...task,
    assignees: sprint ? getSprintMembers(project, sprint) : []
  };
}

export const ProjectBoard: React.FC = () => {
  const {
    activeProject,
    projects,
    accessibleTasks,
    switchView,
    openTaskDetails,
    moveTaskStatus,
    setActiveModal
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
      onSelectProject={(projectId) => {
        const selected = projects.find((item) => item.projectId === projectId);
        if (selected) switchView(selected.name);
      }}
      onOpenProgressAside={openTaskDetails}
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
