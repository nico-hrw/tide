'use client';

import React, { useMemo, useState } from 'react';
import { useDataStore } from '@/store/useDataStore';
import type { TaskItem } from '@/store/slices/types';
import { getTaskPriority, PRIORITY_OPTIONS, type Priority } from './types';
import { TodoProgressRing, CheckMark } from './MobileTodoParts';
import { clampSubtaskDate, subtaskDateMax } from '@/lib/subtaskDate';

/** Vollansicht eines Todos am Handy: Eigenschaften bearbeitbar, großer Ring und alle Untertodos. */
export function MobileTodoDetail({ task, parent, onBack, onOpenSubtask }: {
  task: TaskItem;
  /** Eltern-Todo, wenn `task` ein Untertodo ist. */
  parent?: TaskItem;
  onBack: () => void;
  onOpenSubtask?: (id: string) => void;
}) {
  const tasks = useDataStore((s) => s.tasks) as TaskItem[];
  const toggleTask = useDataStore((s) => s.toggleTask);
  const addTask = useDataStore((s) => s.addTask);
  const updateTask = useDataStore((s) => s.updateTask);
  const deleteTask = useDataStore((s) => s.deleteTask);
  const [draft, setDraft] = useState('');
  const isSubtask = !!task.parentId;
  const maxDate = subtaskDateMax(task, parent)?.slice(0, 10);

  const children = useMemo(
    () => tasks.filter((t) => t.parentId === task.id),
    [tasks, task.id],
  );
  const done = children.filter((c) => c.isCompleted).length;
  const priority = getTaskPriority(task);

  const toggleAll = () => {
    if (!children.length) { void toggleTask(task.id); return; }
    const target = children.some((c) => !c.isCompleted);
    children.forEach((c) => { if (c.isCompleted !== !target) void toggleTask(c.id); });
  };

  const submit = async () => {
    const title = draft.trim();
    if (!title) return;
    setDraft('');
    await addTask({ title, parentId: task.id, isCompleted: false });
  };

  const remove = async () => {
    if (!window.confirm(`„${task.title}“ löschen?`)) return;
    await deleteTask(task.id);
    onBack();
  };

  const saveTitle = (value: string) => {
    const title = value.trim();
    if (!title || title === task.title) return;
    void updateTask(task.id, { title });
  };

  const saveDate = (value: string) => {
    const v = clampSubtaskDate(value, maxDate) || undefined;
    void updateTask(task.id, { dueDate: v, scheduledDate: v });
  };

  const saveDescription = (value: string) => {
    if (value === (task.description ?? '')) return;
    void updateTask(task.id, { description: value });
  };

  const savePriority = (value: string) => {
    void updateTask(task.id, { priority: value as Priority });
  };

  const saveFolder = (value: string) => {
    const folder = value.trim() || undefined;
    if (folder === (task.folder || undefined)) return;
    void updateTask(task.id, { folder });
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-t2-bg">
      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <button type="button" onClick={onBack} aria-label="Zurück" className="grid h-9 w-9 place-items-center rounded-full text-[22px] text-t2-ink-2">‹</button>
        <span className="flex-1" />
        <button type="button" onClick={remove} className="px-2 py-1.5 text-[14px] font-medium text-t2-late">Löschen</button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-10">
        {isSubtask && parent && (
          <div className="text-[12.5px] font-medium text-t2-ink-3">Untertodo von «{parent.title}»</div>
        )}
        <input
          key={`title-${task.id}-${task.title}`}
          defaultValue={task.title}
          onBlur={(e) => saveTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          aria-label="Titel"
          enterKeyHint="done"
          className={`mt-1 w-full bg-transparent text-[26px] font-bold leading-tight tracking-[-0.02em] text-t2-ink outline-none ${task.isCompleted ? 'line-through opacity-50' : ''}`}
        />

        <div className="mt-4 flex flex-col">
          <Fact label="Fällig">
            {/* The date is shown centred; a transparent native picker covers it, so a tap still opens the calendar. */}
            <span className="relative block w-full text-center text-t2-ink">
              {formatDueDe(task.dueDate || task.scheduledDate) || <span className="text-t2-ink-3">Kein Datum</span>}
              <input
                type="date"
                value={(task.dueDate || task.scheduledDate || '').slice(0, 10)}
                onChange={(e) => saveDate(e.target.value)}
                aria-label="Fälligkeitsdatum"
                max={maxDate}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </span>
          </Fact>
          <div className="flex items-center gap-3 border-b border-t2-line-soft py-3 text-[14.5px]">
            <span className="w-[90px] shrink-0 text-[13px] text-t2-ink-3">Schnell</span>
            <div className="flex flex-1 justify-end gap-5 text-[14px] font-medium text-t2-accent">
              <button type="button" onClick={() => saveDate(isoDayOf(new Date()))}>Heute</button>
              <button type="button" onClick={() => saveDate(isoDayOf(new Date(Date.now() + 86400000)))}>Morgen</button>
              <button type="button" onClick={() => saveDate(new Date().toISOString())}>Jetzt</button>
            </div>
          </div>
          <Fact label="Priorität">
            <select
              value={priority}
              onChange={(e) => savePriority(e.target.value)}
              aria-label="Priorität"
              className="w-full bg-transparent text-right text-t2-ink outline-none"
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Fact>
          <Fact label="Ordner">
            <input
              key={`folder-${task.id}-${task.folder ?? ''}`}
              defaultValue={task.folder || ''}
              placeholder="Kein Ordner"
              onBlur={(e) => saveFolder(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              aria-label="Ordner"
              enterKeyHint="done"
              className="w-full bg-transparent text-right text-t2-ink outline-none placeholder:text-t2-ink-3"
            />
          </Fact>
        </div>

        <textarea
          key={`desc-${task.id}-${task.description ?? ''}`}
          data-testid="todo-description"
          defaultValue={task.description ?? ''}
          onBlur={(e) => saveDescription(e.target.value)}
          placeholder="Beschreibung"
          aria-label="Beschreibung"
          rows={4}
          className="mt-4 w-full resize-y rounded-md border border-t2-line bg-transparent px-3 py-2 text-[15px] text-t2-ink outline-none placeholder:text-t2-ink-3"
        />

        <div className="mt-6 flex items-center gap-3">
          <button type="button" onClick={toggleAll} aria-label="Alle Untertodos umschalten">
            <TodoProgressRing segments={children.length ? children.map((c) => c.isCompleted) : [task.isCompleted]} size={44} />
          </button>
          <div className="text-[13px] font-semibold text-t2-ink-2">
            Untertodos · {done} von {children.length}
          </div>
        </div>

        <div className="mt-2">
          {children.map((c) => (
            <div
              key={c.id}
              className={`flex w-full items-center gap-3 border-b border-t2-line-soft py-3 text-left text-[15px] ${c.isCompleted ? 'text-t2-ink-3' : 'text-t2-ink'}`}
            >
              <button
                type="button"
                data-testid={`subtask-check-${c.id}`}
                aria-label={c.isCompleted ? 'Wieder öffnen' : 'Erledigen'}
                onClick={() => void toggleTask(c.id)}
              >
                <CheckMark checked={c.isCompleted} size={22} />
              </button>
              <button
                type="button"
                data-testid={`subtask-title-${c.id}`}
                onClick={() => onOpenSubtask?.(c.id)}
                className={`flex-1 text-left ${c.isCompleted ? 'line-through' : ''}`}
              >
                {c.title}
              </button>
            </div>
          ))}
          {!isSubtask && (
          <form
            className="flex items-center gap-3 py-3 text-[15px] text-t2-ink-3"
            onSubmit={(e) => { e.preventDefault(); void submit(); }}
          >
            <span className="grid h-[22px] w-[22px] place-items-center text-[20px] leading-none">+</span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Untertodo hinzufügen"
              className="flex-1 bg-transparent text-t2-ink outline-none placeholder:text-t2-ink-3"
              enterKeyHint="done"
            />
          </form>
          )}
        </div>
      </div>
    </div>
  );
}

/** Local calendar day as yyyy-MM-dd. */
const isoDayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Due date for display, e.g. 19.11.2026 (also accepts a full ISO timestamp). */
function formatDueDe(v?: string): string {
  if (!v) return '';
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-3 border-b border-t2-line-soft py-3 text-[14.5px]">
      <span className="w-[90px] shrink-0 text-[13px] text-t2-ink-3">{label}</span>
      <span className="flex-1 min-w-0">{children}</span>
    </label>
  );
}

export default MobileTodoDetail;
