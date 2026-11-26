'use client';

import React, { useMemo } from 'react';
import { addDays, startOfWeek } from 'date-fns';
import type { TaskItem } from '@/store/useDataStore';
import { getTaskCompletionTime } from './types';

const WEEKS = 4;

/**
 * Placeholder for the desktop detail pane while no todo is selected: how many todos were completed
 * this week so far, compared with the same point in the three weeks before (Monday to Sunday).
 */
export const TodoWeekStats: React.FC<{ tasks: TaskItem[] }> = ({ tasks }) => {
  const counts = useMemo(() => {
    const now = new Date();
    const thisMonday = startOfWeek(now, { weekStartsOn: 1 });
    // Compare like with like: how far into the week we are, applied to every earlier week.
    const elapsed = now.getTime() - thisMonday.getTime();
    const out: { label: string; sofar: number; total: number }[] = [];
    for (let i = 0; i < WEEKS; i++) {
      const start = addDays(thisMonday, -7 * i);
      const end = addDays(start, 7);
      const cut = start.getTime() + elapsed;
      let sofar = 0;
      let total = 0;
      for (const t of tasks) {
        if (!t.isCompleted) continue;
        const at = getTaskCompletionTime(t);
        if (at === null || at < start.getTime() || at >= end.getTime()) continue;
        total++;
        if (at <= cut) sofar++;
      }
      out.push({ label: i === 0 ? 'Diese Woche' : i === 1 ? 'Letzte Woche' : `vor ${i} Wochen`, sofar, total });
    }
    return out;
  }, [tasks]);

  const current = counts[0].sofar;
  const lastSoFar = counts[1].sofar;
  const diff = current - lastSoFar;
  const avg = Math.round(counts.slice(1).reduce((s, c) => s + c.sofar, 0) / (WEEKS - 1));
  // Never show a negative delta: when behind, state last week's pace instead.
  const comparison = diff > 0
    ? `+${diff} gegenüber gleichem Zeitpunkt letzte Woche`
    : diff === 0
      ? 'genauso viele wie zu diesem Zeitpunkt letzte Woche'
      : `Letzte Woche waren es zu diesem Zeitpunkt ${lastSoFar}`;

  return (
    <div className="border-l border-t2-line pl-[34px] pr-2 py-1.5 flex flex-col gap-6">
      <div>
        <div className="text-[11.5px] font-semibold uppercase tracking-[.06em] text-t2-ink-3">Erledigt diese Woche</div>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="text-[40px] font-semibold leading-none text-t2-ink">{current}</span>
          <span className="text-sm text-t2-ink-2">{comparison}</span>
        </div>
      </div>

      <div className="flex flex-col">
        <div className="flex items-center justify-between pb-1 text-[11px] text-t2-ink-3">
          <span>Bis zum selben Zeitpunkt der Woche</span>
          <span>ganze Woche</span>
        </div>
        {counts.map((c, i) => (
          <div key={c.label} className="flex items-center justify-between py-2 border-b border-t2-line-soft">
            <span className={`text-sm ${i === 0 ? 'text-t2-ink font-medium' : 'text-t2-ink-2'}`}>{c.label}</span>
            <span className="flex items-baseline gap-4">
              <span className={`text-sm tabular-nums ${i === 0 ? 'text-t2-ink font-semibold' : 'text-t2-ink-2'}`}>{c.sofar}</span>
              <span className="w-8 text-right text-xs tabular-nums text-t2-ink-3">{i === 0 ? '' : c.total}</span>
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-t2-ink-2">Schnitt der letzten {WEEKS - 1} Wochen (bis jetzt)</span>
          <span className="text-sm tabular-nums text-t2-ink-2">{avg}</span>
        </div>
      </div>

      <p className="text-xs text-t2-ink-3">Wähle links ein Todo, um Details zu sehen.</p>
    </div>
  );
};

export default TodoWeekStats;
