'use client';

import React, { useState } from 'react';
import { Calendar, Flag, Layers, Link2, Plus, Tag, Trash2 } from 'lucide-react';
import { TodoWorkspacePicker } from './TodoWorkspacePicker';
import { format } from 'date-fns';
import { TaskItem, useDataStore } from '@/store/useDataStore';
import { Priority, getTaskPriority, getPriorityColor, parseDateSafe } from './types';
import { TodoPriorityIcon, T2_PRIORITY_LABEL } from './TodoCardParts';
import { SubtaskRow } from './SubtaskRow';
import TagPicker from '@/components/Tags/TagPicker';
import { useTagCreate } from '@/components/Tags/useTagCreate';
import { useTagRegistry } from './useTodoTags';
import { clampSubtaskDate, subtaskDateMax } from '@/lib/subtaskDate';
import { TodoRescheduleBar } from './TodoRescheduleBar';
import { isOverdueOpen } from './reschedule';

export interface TodoDetailPaneProps {
  task: TaskItem;
  /** Parent todo when `task` is a subtask. */
  parent?: TaskItem;
  subtasks: TaskItem[];
  onUpdate: (id: string, patch: Partial<TaskItem>) => void;
  onToggleSubtask: (id: string) => void;
  onAddSubtask: (title: string, parent: TaskItem) => void | Promise<void>;
  onDelete: (id: string) => void;
  /** Opens another todo (a subtask or the parent) in this pane. */
  onOpenTask: (id: string) => void;
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
  task, parent, subtasks, onUpdate, onToggleSubtask, onAddSubtask, onDelete, onOpenTask,
}) => {
  const notes = useDataStore((s) => s.notes);
  const [title, setTitle] = useState(task.title);
  const [adding, setAdding] = useState(false);
  const [newSub, setNewSub] = useState('');
  const [description, setDescription] = useState(task.description ?? '');

  const priority = getTaskPriority(task);
  const due = parseDateSafe(task.dueDate || task.scheduledDate);
  const doneCount = subtasks.filter((s) => s.isCompleted).length;
  const linkedNote = task.linkedNoteId ? notes.find((n) => n.id === task.linkedNoteId) : undefined;
  const { tags: allTags } = useTagRegistry();
  const createTag = useTagCreate();

  const maxDate = subtaskDateMax(task, parent);
  // Quick reschedule only for open todos dated before today; each choice is one onUpdate call.
  const overdue = isOverdueOpen(task);

  const commitDescription = () => {
    if (description !== (task.description ?? '')) onUpdate(task.id, { description });
  };

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
          {parent ? (
            <div className="text-[13px] text-t2-ink-3">
              Untertodo von{' '}
              <button type="button" onClick={() => onOpenTask(parent.id)} className="text-t2-ink-2 hover:text-t2-ink underline cursor-pointer">
                «{parent.title}»
              </button>
            </div>
          ) : (
            <div />
          )}
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
            max={maxDate ? maxDate.slice(0, 10) : undefined}
            onChange={(e) => {
              const v = clampSubtaskDate(e.target.value, maxDate?.slice(0, 10)) || undefined;
              onUpdate(task.id, { dueDate: v, scheduledDate: v });
            }}
            aria-label="Fälligkeitsdatum"
            className="bg-transparent outline-none text-sm text-t2-ink cursor-pointer"
          />
          {overdue && (
            <span className="rounded-full bg-t2-late px-2 py-0.5 text-[11px] font-bold text-white">Überfällig</span>
          )}
        </Row>
        {overdue && (
          <div className="pl-[calc(5rem+12px+15px+12px)] pb-2">
            <TodoRescheduleBar task={task} max={maxDate} onReschedule={onUpdate} />
          </div>
        )}
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
        {!parent && (
          <Row label="Workspace" icon={<Layers size={15} />}>
            <TodoWorkspacePicker task={task} onUpdate={onUpdate} />
          </Row>
        )}
        <Row label="Tags" icon={<Tag size={15} />}>
          <TagPicker
            tags={allTags}
            value={task.tags ?? []}
            onChange={(tags) => onUpdate(task.id, { tags })}
            onCreate={createTag}
            compact
          />
        </Row>
        <Row label="Notiz" icon={<Link2 size={15} />}>
          <span className={linkedNote ? 'text-t2-ink' : 'text-t2-ink-3'}>
            {linkedNote ? linkedNote.title || 'Unbenannt' : 'Keine verknüpft'}
          </span>
        </Row>
      </div>

      <textarea
        data-testid="todo-description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={commitDescription}
        placeholder="Beschreibung"
        aria-label="Beschreibung"
        rows={4}
        className="w-full resize-y bg-transparent outline-none text-sm text-t2-ink placeholder:text-t2-ink-3 border border-t2-line rounded-md px-3 py-2"
      />

      {!parent && (
      <div>
        <h3 className="text-[13px] font-semibold text-t2-ink-2 mb-1">
          Untertodos{subtasks.length > 0 && <span className="font-normal text-t2-ink-3"> · {doneCount} von {subtasks.length}</span>}
        </h3>
        {subtasks.map((s) => (
          <SubtaskRow key={s.id} task={s} onOpen={onOpenTask} onToggle={onToggleSubtask} onDelete={onDelete} />
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
      )}
    </div>
  );
};

export default TodoDetailPane;
