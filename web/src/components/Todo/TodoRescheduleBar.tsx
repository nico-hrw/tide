'use client';

import React, { useRef } from 'react';
import { format } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import type { TaskItem } from '@/store/useDataStore';
import { RESCHEDULE_OPTIONS, pickedDatePatch, reschedulePatch, type ReschedulePatch } from './reschedule';

export interface TodoRescheduleBarProps {
  task: TaskItem;
  /** Latest allowed date (a subtask's parent date); later options are disabled. */
  max?: string;
  /** Exactly one call per choice. */
  onReschedule: (id: string, patch: ReschedulePatch) => void;
  /** Called after a choice (e.g. to close the menu). */
  onDone?: () => void;
}

const PILL =
  'rounded-full px-2.5 py-1 text-[12px] font-semibold cursor-pointer transition-colors bg-t2-sub text-t2-ink hover:bg-t2-hover ' +
  'disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-t2-accent';

/** Quick reschedule buttons for an overdue todo: Jetzt, Heute, Morgen, Übermorgen, Nächste Woche, Datum wählen…, Ohne Datum. */
export const TodoRescheduleBar: React.FC<TodoRescheduleBarProps> = ({ task, max, onReschedule, onDone }) => {
  const pickerRef = useRef<HTMLInputElement>(null);

  const choose = (patch: ReschedulePatch | null) => {
    if (!patch) return;
    onReschedule(task.id, patch);
    onDone?.();
  };

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); }
  };

  const option = (o: (typeof RESCHEDULE_OPTIONS)[number]) => {
    const allowed = reschedulePatch(o.key, task, new Date(), max) !== null;
    return (
      <button
        key={o.key}
        type="button"
        disabled={!allowed}
        data-reschedule={o.key}
        title={!allowed ? 'Nicht später als das Eltern-Todo' : o.hint}
        // The patch is computed at click time, so "Jetzt" carries the minute of the click.
        onClick={() => choose(reschedulePatch(o.key, task, new Date(), max))}
        className={PILL}
      >
        {o.label}
      </button>
    );
  };

  return (
    <div
      role="group"
      aria-label="Überfälliges Todo verschieben"
      data-testid="todo-reschedule"
      className="flex flex-wrap items-center gap-1.5"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {RESCHEDULE_OPTIONS.filter((o) => o.key !== 'none').map(option)}
      <span className="relative inline-flex">
        <button type="button" data-reschedule="pick" onClick={openPicker} className={`${PILL} inline-flex items-center gap-1`}>
          <CalendarDays size={13} />Datum wählen…
        </button>
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-label="Datum wählen"
          min={format(new Date(), 'yyyy-MM-dd')}
          max={max ? max.slice(0, 10) : undefined}
          className="absolute inset-0 h-full w-full opacity-0 pointer-events-none"
          onChange={(e) => choose(pickedDatePatch(e.target.value, task, max))}
        />
      </span>
      {RESCHEDULE_OPTIONS.filter((o) => o.key === 'none').map(option)}
    </div>
  );
};

export default TodoRescheduleBar;
