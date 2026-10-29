'use client';

import React, { useRef, useEffect, useMemo } from 'react';
import { format, addDays, isToday, isSameDay, startOfDay, isBefore } from 'date-fns';
import { de } from 'date-fns/locale';
import { TaskItem } from '@/store/useDataStore';
import { parseDateSafe, isTaskArchived } from './types';

const WEEKDAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export interface TodoDateFilterStripProps {
  selectedDate: Date | null;
  onSelectDate: (d: Date | null) => void;
  tasks: TaskItem[];
  className?: string;
}

export const TodoDateFilterStrip: React.FC<TodoDateFilterStripProps> = ({
  selectedDate,
  onSelectDate,
  tasks,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLButtonElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // 21 days centered around today (-5 days in past to +15 days in future)
  const days = useMemo(() => {
    const today = startOfDay(new Date());
    return Array.from({ length: 21 }, (_, i) => addDays(today, i - 5));
  }, []);

  // Compute map of dates that have active tasks
  const daysWithTasks = useMemo(() => {
    const map = new Map<string, { count: number; hasOverdue: boolean }>();
    const today = startOfDay(new Date());

    for (const t of tasks) {
      if (t.isCompleted || isTaskArchived(t)) continue;
      const d = parseDateSafe(t.dueDate || t.scheduledDate);
      if (!d) continue;
      const key = format(d, 'yyyy-MM-dd');
      const isOverdue = isBefore(startOfDay(d), today);
      const existing = map.get(key) || { count: 0, hasOverdue: false };
      map.set(key, {
        count: existing.count + 1,
        hasOverdue: existing.hasOverdue || isOverdue,
      });
    }
    return map;
  }, [tasks]);

  // Center today (or selected date) on mount or selection
  useEffect(() => {
    const container = containerRef.current;
    const target = selectedDate ? selectedRef.current : todayRef.current;
    if (container && target) {
      const scrollPos =
        target.offsetLeft -
        container.offsetLeft -
        container.clientWidth / 2 +
        target.clientWidth / 2;
      container.scrollTo({
        left: Math.max(0, scrollPos),
        behavior: 'smooth',
      });
    }
  }, [selectedDate]);

  // Support horizontal mouse wheel scrolling
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0 && containerRef.current) {
      containerRef.current.scrollLeft += e.deltaY;
    }
  };

  return (
    <div className={`w-full flex items-center gap-1.5 py-1 px-0.5 select-none ${className}`}>
      {/* "Alle" Pill Button */}
      <button
        type="button"
        onClick={() => onSelectDate(null)}
        className={`shrink-0 h-[52px] px-3.5 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
          selectedDate === null
            ? 'bg-[#18181b] text-white dark:bg-white dark:text-[#09090b] font-bold shadow-xs'
            : 'bg-white dark:bg-[#1a1a1a] text-gray-600 dark:text-gray-400 border border-gray-200/80 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/5'
        }`}
        title="Alle Aufgaben anzeigen"
      >
        <span className="text-[10px] font-medium uppercase tracking-wider opacity-70">
          Filter
        </span>
        <span className="text-xs font-bold leading-tight">Alle</span>
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            selectedDate === null
              ? 'bg-blue-500 dark:bg-blue-600'
              : 'bg-transparent'
          }`}
        />
      </button>

      {/* Divider */}
      <div className="h-7 w-px bg-gray-200/80 dark:bg-white/10 shrink-0 mx-0.5" />

      {/* Scrollable date strip */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar scrollbar-none py-1 scroll-smooth"
      >
        {days.map((d) => {
          const dateKey = format(d, 'yyyy-MM-dd');
          const isSelected = selectedDate !== null && isSameDay(d, selectedDate);
          const isDateToday = isToday(d);
          const dayStat = daysWithTasks.get(dateKey);
          const hasTasks = Boolean(dayStat && dayStat.count > 0);
          const weekday = WEEKDAY_NAMES[d.getDay()];

          return (
            <button
              key={dateKey}
              ref={isSelected ? selectedRef : isDateToday ? todayRef : undefined}
              type="button"
              onClick={() => onSelectDate(isSelected ? null : d)}
              className={`shrink-0 min-w-[48px] h-[52px] px-2 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                isSelected
                  ? 'bg-blue-600 text-white dark:bg-blue-500 dark:text-white shadow-xs font-semibold'
                  : isDateToday
                  ? 'bg-blue-50/80 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-500/40 hover:bg-blue-100/60 dark:hover:bg-blue-900/40'
                  : 'bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300 border border-gray-200/80 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/5'
              }`}
              title={`${format(d, 'EEEE, d. MMMM yyyy', { locale: de })}${
                hasTasks ? ` (${dayStat?.count} Aufgaben)` : ''
              }`}
            >
              <span
                className={`text-[10px] font-medium uppercase tracking-wider ${
                  isSelected
                    ? 'text-white/80'
                    : isDateToday
                    ? 'text-blue-600 dark:text-blue-400 font-bold'
                    : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                {weekday}
              </span>
              <span
                className={`${
                  isDateToday
                    ? 'text-[11px] font-extrabold tracking-tight'
                    : 'text-sm font-bold'
                } leading-tight ${
                  isSelected
                    ? 'text-white'
                    : isDateToday
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-900 dark:text-white'
                }`}
              >
                {isDateToday ? 'heute' : format(d, 'd')}
              </span>
              <span
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  !hasTasks
                    ? 'bg-transparent'
                    : isSelected
                    ? 'bg-white'
                    : dayStat?.hasOverdue
                    ? 'bg-rose-500'
                    : isDateToday
                    ? 'bg-blue-600 dark:bg-blue-400'
                    : 'bg-blue-500'
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TodoDateFilterStrip;
