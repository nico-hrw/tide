'use client';

import React from 'react';
import { TaskItem, useDataStore } from '@/store/useDataStore';
import { normalizeSafe, todoSafe } from '@/lib/todoSafes';

const label = (s: string) => (s === 'main' ? 'Standard' : s);

/**
 * Workspace of a todo or event as one dropdown. Linked workspaces are kept as they are (not editable here).
 * Controlled: the caller persists `onChange`.
 */
export const WorkspacePicker: React.FC<{
  safe: string;
  linkedSafes: string[];
  onChange: (next: { safe: string; linkedSafes: string[] }) => void;
}> = ({ safe, linkedSafes, onChange }) => {
  const available = useDataStore((s) => s.availableSafes);
  const home = normalizeSafe(safe || 'main');
  const all = Array.from(new Set([...(available ?? []), home].map(normalizeSafe)));

  return (
    <select
      aria-label="Workspace"
      value={home}
      onChange={(e) => onChange({ safe: e.target.value, linkedSafes })}
      className="w-full rounded-lg border border-t2-line bg-t2-surface px-2 py-1.5 text-[13px] text-t2-ink"
    >
      {all.map((s) => (
        <option key={s} value={s}>{label(s)}</option>
      ))}
    </select>
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
