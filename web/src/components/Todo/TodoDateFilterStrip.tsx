'use client';

import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { format, addDays, isToday, isSameDay, startOfDay, isBefore, isAfter } from 'date-fns';
import { de } from 'date-fns/locale';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { TaskItem } from '@/store/useDataStore';
import { parseDateSafe, isTaskArchived } from './types';

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

  const today = useMemo(() => startOfDay(new Date()), []);
  const [scrolledCenterDate, setScrolledCenterDate] = useState<Date>(today);

  // Generous range around today; expands dynamically if selectedDate is outside
  const days = useMemo(() => {
    let startOffset = -14;
    let endOffset = 45;
    if (selectedDate) {
      const diff = Math.round((startOfDay(selectedDate).getTime() - today.getTime()) / 86400000);
      if (diff < startOffset) startOffset = diff - 7;
      if (diff > endOffset) endOffset = diff + 14;
    }
    const count = endOffset - startOffset + 1;
    return Array.from({ length: count }, (_, i) => addDays(today, startOffset + i));
  }, [selectedDate, today]);

  // Compute map of dates that have active tasks
  const daysWithTasks = useMemo(() => {
    const map = new Map<string, { count: number; hasOverdue: boolean }>();

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
  }, [tasks, today]);

  // Center selected date or today smoothly
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

  // Track live visible month as user scrolls
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const children = container.children;

    let closestChild: HTMLElement | null = null;
    let minDistance = Infinity;

    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement;
      const dateStr = child.getAttribute('data-date');
      if (!dateStr) continue;
      const cr = child.getBoundingClientRect();
      const childCenter = cr.left + cr.width / 2;
      const dist = Math.abs(childCenter - centerX);

      if (dist < minDistance) {
        minDistance = dist;
        closestChild = child;
      }
    }

    if (closestChild) {
      const dateStr = closestChild.getAttribute('data-date');
      if (dateStr) {
        const parts = dateStr.split('-').map(Number);
        const d = new Date(parts[0], parts[1] - 1, parts[2]);
        if (!isNaN(d.getTime())) {
          setScrolledCenterDate(d);
        }
      }
    }
  }, []);

  // Support horizontal mouse wheel scrolling
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0 && containerRef.current) {
      containerRef.current.scrollLeft += e.deltaY;
    }
  };

  const activeDate = selectedDate || scrolledCenterDate || today;
  const isDifferentFromToday = !isSameDay(activeDate, today);

  const handleJumpToToday = () => {
    if (selectedDate !== null) {
      onSelectDate(today);
    } else {
      const container = containerRef.current;
      const target = todayRef.current;
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
        setScrolledCenterDate(today);
      }
    }
  };

  return (
    <div className={`w-full flex flex-col py-1 px-0.5 select-none ${className}`}>
      {/* Header: Live Month/Year indicator & Quick-jump return to today */}
      <div className="flex items-center justify-between px-2 pb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-black tracking-wider uppercase text-zinc-900 dark:text-white">
            {format(activeDate, 'MMMM yyyy', { locale: de })}
          </span>
          {selectedDate && (
            <button
              type="button"
              onClick={() => onSelectDate(null)}
              className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer"
            >
              Alle anzeigen
            </button>
          )}
        </div>

        {isDifferentFromToday && (
          <button
            type="button"
            onClick={handleJumpToToday}
            className="h-6 px-2 flex items-center gap-1 rounded-lg text-[10px] font-bold tracking-tight bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-gray-700 dark:text-gray-300 border border-gray-200/80 dark:border-white/10 transition-transform active:scale-95 cursor-pointer shrink-0"
            title={isAfter(today, activeDate) ? 'Vor zu Heute' : 'Zurück zu Heute'}
          >
            <span>Heute</span>
            {isAfter(today, activeDate) ? (
              <ArrowRight size={12} className="shrink-0" />
            ) : (
              <ArrowLeft size={12} className="shrink-0" />
            )}
          </button>
        )}
      </div>

      {/* Scrollable date strip */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        onWheel={handleWheel}
        className="w-full flex items-center gap-1.5 overflow-x-auto no-scrollbar scrollbar-none py-1 scroll-smooth"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {days.map((d) => {
          const dateKey = format(d, 'yyyy-MM-dd');
          const isSelected = selectedDate !== null && isSameDay(d, selectedDate);
          const isDateToday = isToday(d);
          const dayStat = daysWithTasks.get(dateKey);
          const hasTasks = Boolean(dayStat && dayStat.count > 0);
          const weekday = format(d, 'EEE', { locale: de });

          return (
            <div
              key={dateKey}
              data-date={dateKey}
              className="flex flex-col items-center shrink-0"
            >
              <button
                ref={isSelected ? selectedRef : isDateToday ? todayRef : undefined}
                type="button"
                onClick={() => onSelectDate(isSelected ? null : d)}
                className={`w-[44px] h-[52px] rounded-2xl flex flex-col items-center justify-center transition-all cursor-pointer select-none active:scale-95 ${
                  isSelected
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 shadow-sm font-black'
                    : isDateToday
                    ? 'bg-blue-50/80 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100/60 dark:hover:bg-blue-900/40 border border-blue-500/20 dark:border-blue-500/30'
                    : 'bg-transparent hover:bg-gray-100 dark:hover:bg-white/5 text-gray-700 dark:text-gray-300'
                }`}
                title={`${format(d, 'EEEE, d. MMMM yyyy', { locale: de })}${
                  hasTasks ? ` (${dayStat?.count} Aufgabe${dayStat?.count === 1 ? '' : 'n'})` : ''
                }`}
              >
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    isSelected
                      ? 'text-white/80 dark:text-zinc-950/70'
                      : isDateToday
                      ? 'text-blue-600 dark:text-blue-400 font-extrabold'
                      : 'text-gray-400 dark:text-gray-500'
                  }`}
                >
                  {weekday}
                </span>
                <span
                  className={`text-lg font-black leading-none mt-0.5 ${
                    isSelected
                      ? 'text-white dark:text-zinc-950'
                      : isDateToday
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-900 dark:text-gray-100'
                  }`}
                >
                  {format(d, 'd')}
                </span>

                {/* Subtle dot or badge underneath the day number for days with tasks */}
                <span
                  className={`w-1.5 h-1.5 rounded-full mt-1 transition-colors ${
                    !hasTasks
                      ? 'bg-transparent'
                      : isSelected
                      ? 'bg-white dark:bg-zinc-950'
                      : dayStat?.hasOverdue
                      ? 'bg-rose-500'
                      : 'bg-blue-500'
                  }`}
                />
              </button>

              {/* Subtle indicator triangle SVG underneath the active/selected pill */}
              <div className="h-1.5 flex items-center justify-center -mt-0.5 pointer-events-none">
                {isSelected ? (
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                    <path
                      d="M4.15 0.85C4.55 0.25 5.45 0.25 5.85 0.85L9.15 5.2C9.6 5.8 9.15 6 8.35 6H1.65C0.85 6 0.4 5.8 0.85 5.2L4.15 0.85Z"
                      className="fill-zinc-900 dark:fill-white"
                    />
                  </svg>
                ) : (
                  <div className="w-2.5 h-1.5" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TodoDateFilterStrip;
