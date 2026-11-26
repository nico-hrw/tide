'use client';

import React from 'react';
import { Archive, Layers } from 'lucide-react';
import { TaskItem, useDataStore } from '@/store/useDataStore';
import { normalizeSafe, todoSafe } from '@/lib/todoSafes';

const label = (s: string) => (s === 'main' ? 'Standard' : s);

/**
 * Workspace of a todo or event: one icon. A click opens the list of workspaces; picking one saves it.
 * Linked workspaces are kept as they are (not editable here). Controlled: the caller persists `onChange`.
 */
export const WorkspacePicker: React.FC<{
  safe: string;
  linkedSafes: string[];
  onChange: (next: { safe: string; linkedSafes: string[] }) => void;
}> = ({ safe, linkedSafes, onChange }) => {
  const available = useDataStore((s) => s.availableSafes);
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const home = normalizeSafe(safe || 'main');
  const all = Array.from(new Set([...(available ?? []), home].map(normalizeSafe)));

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Workspace, aktuell ${label(home)}`}
        title={`Workspace: ${label(home)}`}
        className="flex h-7 w-7 items-center justify-center rounded-md text-t2-ink-3 hover:bg-t2-hover hover:text-t2-ink-2 cursor-pointer"
      >
        <Layers size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Workspace wählen"
          className="absolute left-0 top-full z-[600] mt-1 min-w-[12rem] rounded-xl border border-t2-line bg-t2-surface p-1 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.2)]"
        >
          {all.map((s) => (
            <button
              key={s}
              type="button"
              role="option"
              aria-selected={s === home}
              onClick={() => { onChange({ safe: s, linkedSafes }); setOpen(false); }}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] cursor-pointer ${
                s === home ? 'bg-t2-sub font-medium text-t2-ink' : 'text-t2-ink hover:bg-t2-hover'
              }`}
            >
              <Archive size={13} aria-hidden="true" className="shrink-0 text-t2-ink-3" />
              <span className="truncate">{label(s)}</span>
            </button>
          ))}
        </div>
      )}
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
