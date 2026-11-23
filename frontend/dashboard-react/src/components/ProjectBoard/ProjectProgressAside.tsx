import React from 'react';
import { X } from 'lucide-react';
import type { TaskItem } from '../../types/taskViewer';

export interface ProjectProgressAsideProps {
  task: TaskItem | null;
  onClose: () => void;
}

export const ProjectProgressAside: React.FC<ProjectProgressAsideProps> = ({ task, onClose }) => {
  if (!task) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/30"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        className="w-full max-w-[420px] h-full bg-white border-l border-zinc-200 shadow-xl p-6 flex flex-col gap-5 overflow-y-auto"
        role="dialog"
        aria-label="ProjectProgressAside"
      >
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-zinc-200">
          <div>
            <span className="text-[11.5px] font-semibold text-blue-600">
              ProjectProgressAside · {task.project}
            </span>
            <h2 className="text-[18px] font-bold text-zinc-900 mt-1">{task.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close progress aside"
            className="w-8 h-8 rounded-lg border border-zinc-200 flex items-center justify-center text-zinc-500 hover:bg-zinc-100 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 text-[13px] text-zinc-600">
          <div className="flex justify-between py-2 border-b border-zinc-100">
            <span className="font-medium text-zinc-500">Status</span>
            <span className="font-semibold text-zinc-900">{task.status}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-zinc-100">
            <span className="font-medium text-zinc-500">Progress</span>
            <span className="font-semibold text-zinc-900 tabular-nums">{task.progress ?? 0}%</span>
          </div>
          <div className="flex justify-between py-2 border-b border-zinc-100">
            <span className="font-medium text-zinc-500">Due Date</span>
            <span className="font-semibold text-zinc-900 tabular-nums">
              {task.due || 'Unscheduled'}
            </span>
          </div>
          <p className="leading-relaxed pt-1">{task.description}</p>
        </div>
      </aside>
    </div>
  );
};
