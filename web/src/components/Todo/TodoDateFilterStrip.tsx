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
  const today = useMemo(() => startOfDay(new Date()), []);
  const [scrolledCenterDate, setScrolledCenterDate] = useState<Date>(today);
  const rafId = useRef<number | null>(null);
  const hasMountedRef = useRef(false);

  // Generous range around today; expands dynamically if selectedDate is outside
  const days = useMemo(() => {
    let startOffset = -30;
    let endOffset = 60;
    if (selectedDate) {
      const diff = Math.round((startOfDay(selectedDate).getTime() - today.getTime()) / 86400000);
      if (diff < startOffset) startOffset = diff - 14;
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

  // Dynamic cosine bell curve magnifier (matching MobileDateWheel.tsx)
  const updateMagnifier = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const children = container.children;
    const radius = 110; // lens influence radius in px

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

      if (dist < radius) {
        // Cosine bell curve: 1 at exact center, 0 at edge
        const curve = (Math.cos((dist / radius) * Math.PI) + 1) / 2;
        const scale = 0.72 + curve * 0.60; // 0.72 to 1.32 (largest zoom)
        const opacity = 0.35 + curve * 0.65; // 0.35 to 1.00
        child.style.transform = `scale(${scale.toFixed(3)})`;
        child.style.opacity = opacity.toFixed(3);
      } else {
        child.style.transform = 'scale(0.72)';
        child.style.opacity = '0.35';
      }
    }

    if (closestChild) {
      const dateStr = closestChild.getAttribute('data-date');
      if (dateStr) {
        const parts = dateStr.split('-').map(Number);
        const d = new Date(parts[0], parts[1] - 1, parts[2]);
        if (!isNaN(d.getTime())) {
          setScrolledCenterDate((prev) => (isSameDay(prev, d) ? prev : d));
        }
      }
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (rafId.current) cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(updateMagnifier);
  }, [updateMagnifier]);

  useEffect(() => {
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  // Center selected date or today smoothly
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const targetDate = selectedDate || today;
    const targetKey = format(targetDate, 'yyyy-MM-dd');

    const centerElement = (smooth: boolean) => {
      const target = container.querySelector(`[data-date="${targetKey}"]`) as HTMLElement;
      if (target) {
        const scrollPos =
          target.offsetLeft -
          container.clientWidth / 2 +
          target.clientWidth / 2;

        if (smooth) {
          container.scrollTo({
            left: Math.max(0, scrollPos),
            behavior: 'smooth',
          });
          setTimeout(updateMagnifier, 320);
        } else {
          container.scrollLeft = Math.max(0, scrollPos);
          requestAnimationFrame(updateMagnifier);
        }
      }
    };

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      const t = setTimeout(() => {
        centerElement(false);
      }, 50);
      return () => clearTimeout(t);
    } else {
      centerElement(true);
    }
  }, [selectedDate, today, updateMagnifier]);

  // Window resize re-centering / magnifier recalculation
  useEffect(() => {
    const onResize = () => {
      updateMagnifier();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [updateMagnifier]);

  // Support horizontal mouse wheel scrolling
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0 && containerRef.current) {
      containerRef.current.scrollLeft += e.deltaY;
    }
  };

  const handleDateClick = (d: Date) => {
    const isSelected = selectedDate !== null && isSameDay(d, selectedDate);
    const nextDate = isSelected ? null : d;
    onSelectDate(nextDate);

    const targetDate = nextDate || today;
    const targetKey = format(targetDate, 'yyyy-MM-dd');
    const container = containerRef.current;
    if (container) {
      const el = container.querySelector(`[data-date="${targetKey}"]`) as HTMLElement;
      if (el) {
        const targetScroll = el.offsetLeft - container.clientWidth / 2 + el.offsetWidth / 2;
        container.scrollTo({ left: Math.max(0, targetScroll), behavior: 'smooth' });
        setTimeout(updateMagnifier, 320);
      }
    }
  };

  const activeDate = selectedDate || scrolledCenterDate || today;
  const isDifferentFromToday = !isSameDay(activeDate, today);

  const handleJumpToToday = () => {
    if (selectedDate !== null) {
      onSelectDate(today);
    } else {
      const container = containerRef.current;
      if (container) {
        const target = container.querySelector(`[data-date="${format(today, 'yyyy-MM-dd')}"]`) as HTMLElement;
        if (target) {
          const scrollPos =
            target.offsetLeft -
            container.clientWidth / 2 +
            target.clientWidth / 2;
          container.scrollTo({
            left: Math.max(0, scrollPos),
            behavior: 'smooth',
          });
          setScrolledCenterDate(today);
          setTimeout(updateMagnifier, 320);
        }
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

      <div className="relative w-full">
        {/* Scrollable date strip */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          onWheel={handleWheel}
          className="w-full flex items-center gap-1 overflow-x-auto no-scrollbar scrollbar-none py-1 select-none"
          style={{
            WebkitOverflowScrolling: 'touch',
            paddingLeft: 'calc(50% - 22px)',
            paddingRight: 'calc(50% - 22px)',
          }}
        >
          {days.map((d) => {
            const dateKey = format(d, 'yyyy-MM-dd');
            const isSelected = selectedDate !== null && isSameDay(d, selectedDate);
            const isDateToday = isToday(d);
            const isActive = isSelected || (selectedDate === null && isSameDay(d, activeDate));
            const dayStat = daysWithTasks.get(dateKey);
            const hasTasks = Boolean(dayStat && dayStat.count > 0);
            const weekday = format(d, 'EEE', { locale: de });

            const diffDays = Math.abs(
              Math.round((startOfDay(d).getTime() - startOfDay(activeDate).getTime()) / 86400000)
            );
            const initialScale = diffDays === 0 ? 1.32 : diffDays === 1 ? 0.95 : diffDays === 2 ? 0.80 : 0.72;
            const initialOpacity = diffDays === 0 ? 1 : diffDays === 1 ? 0.75 : diffDays === 2 ? 0.50 : 0.35;

            return (
              <button
                key={dateKey}
                data-date={dateKey}
                type="button"
                onClick={() => handleDateClick(d)}
                className="w-[44px] h-[52px] flex flex-col items-center justify-center shrink-0 rounded-2xl bg-transparent border-0 cursor-pointer select-none transition-transform"
                style={{
                  transform: `scale(${initialScale})`,
                  opacity: initialOpacity,
                }}
                title={`${format(d, 'EEEE, d. MMMM yyyy', { locale: de })}${
                  hasTasks ? ` (${dayStat?.count} Aufgabe${dayStat?.count === 1 ? '' : 'n'})` : ''
                }`}
              >
                <span
                  className={`text-[10px] uppercase tracking-wider ${
                    isActive || isDateToday
                      ? 'text-black dark:text-white font-black'
                      : 'text-zinc-700 dark:text-zinc-300 font-bold'
                  }`}
                >
                  {weekday}
                </span>
                <span
                  className={`text-lg leading-none mt-0.5 ${
                    isActive || isDateToday
                      ? 'text-black dark:text-white font-black'
                      : 'text-zinc-700 dark:text-zinc-300 font-bold'
                  }`}
                >
                  {format(d, 'd')}
                </span>

                {/* Task dot underneath day number (transparent placeholder when no tasks so height is uniform) */}
                <span
                  className={`w-1.5 h-1.5 rounded-full mt-1 transition-colors ${
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

        {/* Small centered indicator triangle SVG underneath the active date */}
        <div className="flex justify-center pointer-events-none -mt-0.5 pb-0.5">
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path
              d="M4.15 0.85C4.55 0.25 5.45 0.25 5.85 0.85L9.15 5.2C9.6 5.8 9.15 6 8.35 6H1.65C0.85 6 0.4 5.8 0.85 5.2L4.15 0.85Z"
              className="fill-zinc-900 dark:fill-white"
            />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default TodoDateFilterStrip;
