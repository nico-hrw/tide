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
    <div className={`w-full flex items-center py-1 px-0.5 select-none ${className}`}>
      {/* Scrollable date strip */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        className="w-full flex items-center gap-1.5 overflow-x-auto no-scrollbar scrollbar-none py-1 scroll-smooth"
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
              className="shrink-0 rounded-xl bg-transparent hover:bg-gray-100/60 dark:hover:bg-white/5 border-none min-w-[38px] h-[52px] py-1 px-1 flex flex-col items-center justify-center gap-1 cursor-pointer transition-all"
              title={`${format(d, 'EEEE, d. MMMM yyyy', { locale: de })}${
                hasTasks ? ` (${dayStat?.count} Aufgaben)` : ''
              }`}
            >
              <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {weekday}
              </span>
              <span
                className={`w-7 h-7 flex items-center justify-center rounded-full text-xs transition-colors ${
                  isSelected
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : isDateToday
                    ? 'bg-red-500 text-white font-bold'
                    : 'text-gray-800 dark:text-gray-200 font-medium'
                }`}
              >
                {format(d, 'd')}
              </span>
              <span
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  !hasTasks
                    ? 'bg-transparent'
                    : dayStat?.hasOverdue
                    ? 'bg-rose-500'
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
