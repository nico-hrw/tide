'use client';

import React, { useState } from 'react';
import { Calendar, Flag, Folder, Link2, Plus, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';
import { TaskItem, useDataStore } from '@/store/useDataStore';
import { Priority, getTaskPriority, getPriorityColor, parseDateSafe } from './types';
import { TodoCheckbox, TodoPriorityIcon, T2_PRIORITY_LABEL } from './TodoCardParts';

export interface TodoDetailPaneProps {
  task: TaskItem;
  subtasks: TaskItem[];
  folders: string[];
  onUpdate: (id: string, patch: Partial<TaskItem>) => void;
  onToggleSubtask: (id: string) => void;
  onAddSubtask: (title: string, parent: TaskItem) => void | Promise<void>;
  onDelete: (id: string) => void;
}

const PRIORITIES: Priority[] = ['high', 'medium', 'low'];

const Row: React.FC<{ label: string; icon: React.ReactNode; children: React.ReactNode }> = ({ label, icon, children }) => (
  <div className="flex items-center gap-3 py-2 text-sm text-t2-ink">
    <span className="w-20 shrink-0 text-t2-ink-3 text-[13px]">{label}</span>
    <span className="text-t2-ink-3 shrink-0">{icon}</span>
    {children}
  </div>
);

export const TodoDetailPane: React.FC<TodoDetailPaneProps> = ({
  task, subtasks, folders, onUpdate, onToggleSubtask, onAddSubtask, onDelete,
}) => {
  const notes = useDataStore((s) => s.notes);
  const [title, setTitle] = useState(task.title);
  const [adding, setAdding] = useState(false);
  const [newSub, setNewSub] = useState('');

  const priority = getTaskPriority(task);
  const due = parseDateSafe(task.dueDate || task.scheduledDate);
  const doneCount = subtasks.filter((s) => s.isCompleted).length;
  const linkedNote = task.linkedNoteId ? notes.find((n) => n.id === task.linkedNoteId) : undefined;
  const folderOptions = task.folder && !folders.includes(task.folder) ? [task.folder, ...folders] : folders;

  const commitTitle = () => {
    const t = title.trim();
    if (!t) { setTitle(task.title); return; }
    if (t !== task.title) onUpdate(task.id, { title: t });
  };

  const submitSub = async () => {
    const t = newSub.trim();
    if (t) await onAddSubtask(t, task);
    setNewSub('');
    setAdding(false);
  };

  return (
    <div className="border-l border-t2-line px-[34px] py-1.5 overflow-auto flex flex-col gap-5 min-h-0">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="text-[13px] text-t2-ink-3">{task.folder || 'Ohne Ordner'}</div>
          <button
            type="button"
            onClick={() => onDelete(task.id)}
            aria-label="Todo löschen"
            className="p-1 rounded-md text-t2-ink-3 hover:text-t2-ink hover:bg-t2-hover cursor-pointer"
          >
            <Trash2 size={15} />
          </button>
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          aria-label="Titel"
          className="w-full bg-transparent outline-none text-[28px] leading-[1.15] font-bold tracking-tight text-t2-ink"
        />
      </div>

      <div>
        <Row label="Fällig" icon={<Calendar size={15} />}>
          <input
            type="date"
            value={due ? format(due, 'yyyy-MM-dd') : ''}
            onChange={(e) => onUpdate(task.id, { dueDate: e.target.value || undefined, scheduledDate: e.target.value || undefined })}
            aria-label="Fälligkeitsdatum"
            className="bg-transparent outline-none text-sm text-t2-ink cursor-pointer"
          />
        </Row>
        <Row label="Priorität" icon={<Flag size={15} />}>
          <div className="flex items-center gap-1">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onUpdate(task.id, { priority: p, color: getPriorityColor(p) })}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-sm cursor-pointer ${
                  priority === p ? 'bg-t2-hover font-medium' : 'text-t2-ink-3 hover:bg-t2-hover'
                }`}
              >
                <TodoPriorityIcon priority={p} size={14} />
                {T2_PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Ordner" icon={<Folder size={15} />}>
          <select
            value={task.folder || ''}
            onChange={(e) => onUpdate(task.id, { folder: e.target.value || undefined })}
            aria-label="Ordner"
            className="bg-transparent outline-none text-sm text-t2-ink cursor-pointer"
          >
            <option value="">Kein Ordner</option>
            {folderOptions.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </Row>
        <Row label="Notiz" icon={<Link2 size={15} />}>
          <span className={linkedNote ? 'text-t2-ink' : 'text-t2-ink-3'}>
            {linkedNote ? linkedNote.title || 'Unbenannt' : 'Keine verknüpft'}
          </span>
        </Row>
      </div>

      <div>
        <h3 className="text-[13px] font-semibold text-t2-ink-2 mb-1">
          Untertodos{subtasks.length > 0 && <span className="font-normal text-t2-ink-3"> · {doneCount} von {subtasks.length}</span>}
        </h3>
        {subtasks.map((s) => (
          <div key={s.id} className="group flex items-center gap-3 py-[9px] border-b border-t2-line-soft">
            <TodoCheckbox checked={s.isCompleted} label={`${s.title} abhaken`} onClick={() => onToggleSubtask(s.id)} />
            <span className={`flex-1 text-sm font-medium ${s.isCompleted ? 'line-through text-t2-ink-3 font-normal' : 'text-t2-ink'}`}>{s.title}</span>
            <button
              type="button"
              onClick={() => onDelete(s.id)}
              aria-label="Untertodo löschen"
              className="opacity-0 group-hover:opacity-100 p-0.5 text-t2-ink-3 hover:text-t2-ink cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        ))}
        {adding ? (
          <input
            autoFocus
            value={newSub}
            onChange={(e) => setNewSub(e.target.value)}
            onBlur={submitSub}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitSub();
              if (e.key === 'Escape') { setNewSub(''); setAdding(false); }
            }}
            placeholder="Untertodo"
            className="w-full bg-transparent outline-none py-[9px] text-sm text-t2-ink placeholder:text-t2-ink-3"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-3 py-[9px] text-sm text-t2-ink-3 hover:text-t2-ink cursor-pointer"
          >
            <Plus size={16} />Untertodo hinzufügen
          </button>
        )}
      </div>
    </div>
  );
};

export default TodoDetailPane;
