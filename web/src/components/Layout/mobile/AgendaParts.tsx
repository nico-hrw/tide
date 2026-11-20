'use client';

import React from 'react';
import { format } from 'date-fns';
import { Check } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { GAP_PX } from './timelineMath';

export const FREE_GAP_MIN = 15;
const TIME_COL = 58;
const RAIL_COL = 24;

/** "30 Min. frei" / "1 h 30 Min. frei"; null for gaps under 15 min. */
export function formatFree(mins: number): string | null {
  if (mins < FREE_GAP_MIN) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} Min. frei`;
  return `${h} h${m > 0 ? ` ${m} Min.` : ''} frei`;
}

interface TodoLike {
  id: string;
  title?: string;
  start: string;
  linkedTaskId?: string;
  is_completed?: boolean;
}

/** Completion state + toggle shared by pills and timed rows. */
function useTodoToggle(ev: TodoLike, onTaskComplete?: (id: string, completed: boolean) => void) {
  const task = useDataStore(s => (ev.linkedTaskId ? s.tasks?.find(t => t.id === ev.linkedTaskId) : undefined));
  const done = task ? !!task.isCompleted : !!ev.is_completed;
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !done;
    if (ev.linkedTaskId) {
      useDataStore.getState().toggleTask(ev.linkedTaskId);
      onTaskComplete?.(ev.id, next);
    } else if (onTaskComplete) {
      onTaskComplete(ev.id, next);
    } else {
      useDataStore.setState(s => ({ events: s.events.map(x => (x.id === ev.id ? { ...x, is_completed: next } : x)) }));
    }
  };
  return { done, toggle };
}

function Circle({ done, onClick }: { done: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={done ? 'Als unerledigt markieren' : 'Als erledigt markieren'}
      className="w-[19px] h-[19px] rounded-full shrink-0 flex items-center justify-center cursor-pointer active:scale-90 transition-transform"
      style={{
        border: '1.5px solid var(--t2-ink-3)',
        background: done ? 'var(--t2-ink-3)' : 'transparent',
        color: 'var(--t2-bg)',
      }}
    >
      {done && <Check size={11} strokeWidth={3.2} />}
    </button>
  );
}

const pillStyle: React.CSSProperties = {
  background: 'var(--t2-surface)',
  boxShadow: '0 0 0 1px var(--t2-line)',
  color: 'var(--t2-ink)',
};

/** All-day todos: small white pills on a faint diagonal dashed pattern, under the day header. */
export const AllDayTodoPills = React.memo(function AllDayTodoPills({
  todos, onTaskComplete,
}: { todos: TodoLike[]; onTaskComplete?: (id: string, completed: boolean) => void }) {
  if (todos.length === 0) return null;
  return (
    <div
      className="flex flex-wrap gap-1.5 rounded-xl p-2 mb-2.5"
      style={{ backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 7px, color-mix(in srgb, var(--t2-ink) 7%, transparent) 7px 8px)' }}
    >
      {todos.map(t => <PillItem key={t.id} ev={t} onTaskComplete={onTaskComplete} />)}
    </div>
  );
});

function PillItem({ ev, onTaskComplete }: { ev: TodoLike; onTaskComplete?: (id: string, completed: boolean) => void }) {
  const { done, toggle } = useTodoToggle(ev, onTaskComplete);
  return (
    <span className="inline-flex items-center gap-2 max-w-full pl-[7px] pr-3 py-1 rounded-full text-[13px]" style={pillStyle}>
      <Circle done={done} onClick={toggle} />
      <span className={`truncate ${done ? 'line-through opacity-50' : ''}`}>{ev.title}</span>
    </span>
  );
}

/** Todo with a time: own row in the timeline (time left, hollow dot in rail, pill blob without time). */
export const TimedTodoRow = React.memo(function TimedTodoRow({
  ev, onTaskComplete,
}: { ev: TodoLike; onTaskComplete?: (id: string, completed: boolean) => void }) {
  const { done, toggle } = useTodoToggle(ev, onTaskComplete);
  return (
    <div className="flex my-1">
      <div className="shrink-0 text-right pr-2 pt-[15px]" style={{ width: TIME_COL }}>
        <span className="text-[12px] font-bold leading-none" style={{ color: 'var(--t2-ink)' }}>{format(new Date(ev.start), 'HH:mm')}</span>
      </div>
      <div className="shrink-0 flex flex-col items-center pt-[19px]" style={{ width: RAIL_COL }}>
        <span className="w-[10px] h-[10px] rounded-full" style={{ border: '1.5px solid var(--t2-ink-3)', background: 'var(--t2-bg)' }} />
      </div>
      <div className="flex-1 min-w-0 py-[3px] pl-1.5">
        <div className="flex items-center gap-2.5 min-h-[46px] pl-3 pr-3.5 rounded-[10px] text-[14.5px] font-medium" style={pillStyle}>
          <Circle done={done} onClick={toggle} />
          <span className={`truncate ${done ? 'line-through opacity-50' : ''}`}>{ev.title}</span>
        </div>
      </div>
    </div>
  );
});

/**
 * Dashed rail line with muted "frei" text between two events. `height` animates softly; with
 * `segStart`/`segEnd` (ms) it is marked as a time segment (`data-seg="gap"`) and may hold the now-line.
 */
export const FreeGap = React.memo(function FreeGap({ label, height = GAP_PX, segStart, segEnd, children }: {
  label: string; height?: number; segStart?: number; segEnd?: number; children?: React.ReactNode;
}) {
  const seg = segStart !== undefined && segEnd !== undefined;
  return (
    <div
      className="relative flex items-stretch"
      data-seg={seg ? 'gap' : undefined} data-seg-start={seg ? String(segStart) : undefined} data-seg-end={seg ? String(segEnd) : undefined}
      style={{ color: 'var(--t2-ink-3)', fontSize: 12.5, height, transition: 'height 0.4s ease' }}
    >
      <div className="shrink-0" style={{ width: TIME_COL }} />
      <div
        className="shrink-0"
        style={{
          width: RAIL_COL,
          background: 'repeating-linear-gradient(to bottom, var(--t2-ink-3) 0 3px, transparent 3px 7px) center/1.5px 100% no-repeat',
          opacity: 0.55,
        }}
      />
      <span className="self-center pl-1.5">{label}</span>
      {children}
    </div>
  );
});

/** Gefüllte Icons ohne Hintergrund (Material-Stil), in der Farbe des Termins. */
export const EDIT_PATH = 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z';
export const DELETE_PATH = 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z';

export function FilledIcon({ d, size }: { d: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={d} />
    </svg>
  );
}
