'use client';

import React from 'react';
import { TaskItem, useDataStore } from '@/store/useDataStore';
import { normalizeSafe, todoSafe } from '@/lib/todoSafes';

const label = (s: string) => (s === 'main' ? 'Standard' : s);

/**
 * Home workspace of a todo (select) plus the extra workspaces it is also shown in (toggles).
 * Each change is one onUpdate call.
 */
export const TodoWorkspacePicker: React.FC<{
  task: TaskItem;
  onUpdate: (id: string, patch: Partial<TaskItem>) => void;
}> = ({ task, onUpdate }) => {
  const available = useDataStore((s) => s.availableSafes);
  const all = Array.from(new Set([...(available ?? []), todoSafe(task)].map(normalizeSafe)));
  const home = todoSafe(task);
  const linked = (task.linkedSafes ?? []).map(normalizeSafe).filter((s) => s !== home);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        aria-label="Workspace"
        value={home}
        onChange={(e) => onUpdate(task.id, { safe: e.target.value, linkedSafes: linked.filter((s) => s !== e.target.value) })}
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
            onClick={() => onUpdate(task.id, { linkedSafes: on ? linked.filter((x) => x !== s) : [...linked, s] })}
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

export default TodoWorkspacePicker;
