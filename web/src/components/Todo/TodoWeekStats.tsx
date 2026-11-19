'use client';

import React, { useMemo } from 'react';
import { addDays, startOfWeek } from 'date-fns';
import type { TaskItem } from '@/store/useDataStore';
import { getTaskCompletionTime } from './types';

const WEEKS = 4;

/**
 * Placeholder for the desktop detail pane while no todo is selected: how many todos were completed
 * this week, compared with the three weeks before (Monday to Sunday).
 */
export const TodoWeekStats: React.FC<{ tasks: TaskItem[] }> = ({ tasks }) => {
  const counts = useMemo(() => {
    const now = new Date();
    const thisMonday = startOfWeek(now, { weekStartsOn: 1 });
    const out: { label: string; count: number }[] = [];
    for (let i = 0; i < WEEKS; i++) {
      const start = addDays(thisMonday, -7 * i);
      const end = addDays(start, 7);
      const count = tasks.filter((t) => {
        if (!t.isCompleted) return false;
        const at = getTaskCompletionTime(t);
        return at !== null && at >= start.getTime() && at < end.getTime();
      }).length;
      out.push({ label: i === 0 ? 'Diese Woche' : i === 1 ? 'Letzte Woche' : `vor ${i} Wochen`, count });
    }
    return out;
  }, [tasks]);

  const current = counts[0].count;
  const previous = counts[1].count;
  const diff = current - previous;
  const avg = Math.round(counts.slice(1).reduce((s, c) => s + c.count, 0) / (WEEKS - 1));

  return (
    <div className="border-l border-t2-line pl-[34px] pr-2 py-1.5 flex flex-col gap-6">
      <div>
        <div className="text-[11.5px] font-semibold uppercase tracking-[.06em] text-t2-ink-3">Erledigt diese Woche</div>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="text-[40px] font-semibold leading-none text-t2-ink">{current}</span>
          <span className="text-sm text-t2-ink-2">
            {diff === 0 ? 'wie letzte Woche' : `${diff > 0 ? '+' : ''}${diff} gegenüber letzter Woche`}
          </span>
        </div>
      </div>

      <div className="flex flex-col">
        {counts.map((c, i) => (
          <div key={c.label} className="flex items-center justify-between py-2 border-b border-t2-line-soft">
            <span className={`text-sm ${i === 0 ? 'text-t2-ink font-medium' : 'text-t2-ink-2'}`}>{c.label}</span>
            <span className={`text-sm tabular-nums ${i === 0 ? 'text-t2-ink font-semibold' : 'text-t2-ink-2'}`}>{c.count}</span>
          </div>
        ))}
        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-t2-ink-2">Schnitt der letzten {WEEKS - 1} Wochen</span>
          <span className="text-sm tabular-nums text-t2-ink-2">{avg}</span>
        </div>
      </div>

      <p className="text-xs text-t2-ink-3">Wähle links ein Todo, um Details zu sehen.</p>
    </div>
  );
};

export default TodoWeekStats;
