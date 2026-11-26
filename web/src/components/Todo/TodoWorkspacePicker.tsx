'use client';

import React from 'react';
import { TaskItem, useDataStore } from '@/store/useDataStore';
import { normalizeSafe, todoSafe } from '@/lib/todoSafes';

const label = (s: string) => (s === 'main' ? 'Standard' : s);

/**
 * Home workspace (select) plus the extra workspaces an item is also shown in (toggles).
 * Controlled: the caller persists `onChange`. Used by todos and calendar events.
 */
export const WorkspacePicker: React.FC<{
  safe: string;
  linkedSafes: string[];
  onChange: (next: { safe: string; linkedSafes: string[] }) => void;
}> = ({ safe, linkedSafes, onChange }) => {
  const available = useDataStore((s) => s.availableSafes);
  const home = normalizeSafe(safe || 'main');
  const all = Array.from(new Set([...(available ?? []), home].map(normalizeSafe)));
  const linked = linkedSafes.map(normalizeSafe).filter((s) => s !== home);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        aria-label="Workspace"
        value={home}
        onChange={(e) => onChange({ safe: e.target.value, linkedSafes: linked.filter((s) => s !== e.target.value) })}
        className="rounded-lg border border-t2-line bg-t2-surface px-2 py-1 text-[13px] text-t2-ink"
      >
        {all.map((s) => (
          <option key={s} value={s}>{label(s)}</option>
        ))}
      </select>
      {all.filter((s) => s !== home).map((s) => {
        const on = linked.includes(s);
        return (
          <button
            key={s}
            type="button"
            aria-pressed={on}
            onClick={() => onChange({ safe: home, linkedSafes: on ? linked.filter((x) => x !== s) : [...linked, s] })}
            className={`rounded-full border px-2.5 py-0.5 text-[12px] ${
              on ? 'border-t2-ink bg-t2-ink text-t2-bg' : 'border-t2-line text-t2-ink-2 hover:bg-t2-hover'
            }`}
          >
            {on ? '+ ' : ''}{label(s)}
          </button>
        );
      })}
    </div>
  );
};

/** Todo variant: persists through onUpdate. */
export const TodoWorkspacePicker: React.FC<{
  task: TaskItem;
  onUpdate: (id: string, patch: Partial<TaskItem>) => void;
}> = ({ task, onUpdate }) => (
  <WorkspacePicker
    safe={todoSafe(task)}
    linkedSafes={task.linkedSafes ?? []}
    onChange={(next) => onUpdate(task.id, next)}
  />
);

export default TodoWorkspacePicker;
