'use client';

import React from 'react';
import { X } from 'lucide-react';
import { TaskItem } from '@/store/useDataStore';
import { TodoCheckbox } from './TodoCardParts';

export interface SubtaskRowProps {
  task: TaskItem;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

/** Subtask line in the desktop detail pane: the title opens the subtask, checkbox and X act in place. */
export const SubtaskRow: React.FC<SubtaskRowProps> = ({ task, onOpen, onToggle, onDelete }) => (
  <div className="group flex items-center gap-3 py-[9px] border-b border-t2-line-soft">
    <TodoCheckbox checked={task.isCompleted} label={`${task.title} abhaken`} onClick={() => onToggle(task.id)} />
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      className={`flex-1 text-left text-sm font-medium cursor-pointer ${task.isCompleted ? 'line-through text-t2-ink-3 font-normal' : 'text-t2-ink'}`}
    >
      {task.title}
    </button>
    <button
      type="button"
      onClick={() => onDelete(task.id)}
      aria-label="Untertodo löschen"
      className="opacity-0 group-hover:opacity-100 p-0.5 text-t2-ink-3 hover:text-t2-ink cursor-pointer"
    >
      <X size={14} />
    </button>
  </div>
);

export default SubtaskRow;
