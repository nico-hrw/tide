'use client';

import React, { useMemo, useState } from 'react';
import { useDataStore } from '@/store/useDataStore';
import type { TaskItem } from '@/store/slices/types';
import { parseDateSafe, getTaskPriority, PRIORITY_CONFIG } from './types';
import { TodoProgressRing, CheckMark } from './MobileTodoParts';

/** Vollansicht eines Todos am Handy: Fakten, großer Ring und alle Untertodos. */
export function MobileTodoDetail({ task, onBack }: { task: TaskItem; onBack: () => void }) {
  const tasks = useDataStore((s) => s.tasks) as TaskItem[];
  const toggleTask = useDataStore((s) => s.toggleTask);
  const addTask = useDataStore((s) => s.addTask);
  const deleteTask = useDataStore((s) => s.deleteTask);
  const [draft, setDraft] = useState('');

  const children = useMemo(
    () => tasks.filter((t) => t.parentId === task.id),
    [tasks, task.id],
  );
  const done = children.filter((c) => c.isCompleted).length;
  const due = parseDateSafe(task.dueDate || task.scheduledDate);
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

  return (
    <div className="flex flex-col h-full min-h-0 bg-t2-bg">
      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <button type="button" onClick={onBack} aria-label="Zurück" className="grid h-9 w-9 place-items-center rounded-full text-[22px] text-t2-ink-2">‹</button>
        <span className="flex-1" />
        <button type="button" onClick={remove} className="px-2 py-1.5 text-[14px] font-medium text-t2-late">Löschen</button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-10">
        <div className="text-[13px] text-t2-ink-3">{task.folder || 'Ohne Ordner'}</div>
        <h2 className={`mt-1 text-[26px] font-bold leading-tight tracking-[-0.02em] text-t2-ink ${task.isCompleted ? 'line-through opacity-50' : ''}`}>
          {task.title}
        </h2>

        <div className="mt-4 flex flex-col">
          <Fact label="Fällig" value={due ? due.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' }) : 'Kein Datum'} />
          <Fact label="Priorität" value={PRIORITY_CONFIG[priority].label} />
          <Fact label="Ordner" value={task.folder || '–'} />
        </div>

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
            <button
              key={c.id}
              type="button"
              onClick={() => void toggleTask(c.id)}
              className={`flex w-full items-center gap-3 border-b border-t2-line-soft py-3 text-left text-[15px] ${c.isCompleted ? 'text-t2-ink-3' : 'text-t2-ink'}`}
            >
              <CheckMark checked={c.isCompleted} size={22} />
              <span className={`flex-1 ${c.isCompleted ? 'line-through' : ''}`}>{c.title}</span>
            </button>
          ))}
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
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-t2-line-soft py-3 text-[14.5px]">
      <span className="w-[90px] shrink-0 text-[13px] text-t2-ink-3">{label}</span>
      <span className="flex-1 min-w-0 truncate text-t2-ink">{value}</span>
    </div>
  );
}

export default MobileTodoDetail;
