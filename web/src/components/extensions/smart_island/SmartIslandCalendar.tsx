"use client";

import React, { useState, useEffect, useMemo } from 'react';
import {
  format,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  subDays,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
  startOfDay,
  endOfDay,
} from 'date-fns';
import { de } from 'date-fns/locale';
import { useDataStore } from '@/store/useDataStore';

export interface SmartIslandCalendarProps {
  selectedDate?: Date;
  onSelect: (date: Date) => void;
  onMonthChange?: (date: Date) => void;
  activeOrUpcomingEvent?: {
    title: string;
    start: Date;
    end: Date;
    isOngoing?: boolean;
  } | null;
  className?: string;
}

const WEEKDAYS = ['MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO'] as const;

/**
 * Calculates SVG path for the circular pie sector starting at 12 o'clock clockwise.
 */
function createPieSectorPath(cx: number, cy: number, r: number, fraction: number): string {
  const clamped = Math.max(0, Math.min(1, fraction));
  if (clamped <= 0.001) return '';
  if (clamped >= 0.999) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
  }
  const angle = clamped * 2 * Math.PI - Math.PI / 2;
  const x = cx + r * Math.cos(angle);
  const y = cy + r * Math.sin(angle);
  const largeArc = clamped > 0.5 ? 1 : 0;
  return `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${largeArc} 1 ${x.toFixed(3)} ${y.toFixed(3)} Z`;
}

/**
 * Determines corner rounding for seamless violet range ribbons.
 */
function getVioletCapClass(
  day: Date,
  rangeStart: Date,
  rangeEnd: Date,
  cellIndex: number
): string {
  const col = cellIndex % 7; // 0 = MO, 6 = SO
  const isRangeStart = isSameDay(day, rangeStart);
  const isRangeEnd = isSameDay(day, rangeEnd);

  const isRowStart = isRangeStart || col === 0;
  const isRowEnd = isRangeEnd || col === 6;

  if (isRowStart && isRowEnd) return 'rounded-[12px]';
  if (isRowStart) return 'rounded-l-[12px]';
  if (isRowEnd) return 'rounded-r-[12px]';
  return 'rounded-none';
}

function resolveActiveOrUpcomingEvent(
  storeEvents: unknown[] | undefined,
  nowMs: number,
  now: Date
): { title: string; start: Date; end: Date; isOngoing: boolean } | null {
  if (!storeEvents || storeEvents.length === 0) return null;

  // 1. Ongoing event check
  for (const ev of storeEvents) {
    const rawStart = (ev as Record<string, unknown>).start;
    const rawEnd = (ev as Record<string, unknown>).end;
    if (typeof rawStart !== 'string' && !(rawStart instanceof Date)) continue;
    if (typeof rawEnd !== 'string' && !(rawEnd instanceof Date)) continue;

    const s = new Date(rawStart);
    const e = new Date(rawEnd);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) continue;

    if (s.getTime() <= nowMs && e.getTime() > nowMs) {
      return {
        title: ((ev as Record<string, unknown>).title as string) || 'Termin',
        start: s,
        end: e,
        isOngoing: true,
      };
    }
  }

  // 2. Upcoming event today (within next 4 hours)
  let earliestUpcoming: { title: string; start: Date; end: Date; isOngoing: boolean } | null = null;
  const fourHoursMs = 4 * 60 * 60 * 1000;

  for (const ev of storeEvents) {
    const rawStart = (ev as Record<string, unknown>).start;
    const rawEnd = (ev as Record<string, unknown>).end;
    if (typeof rawStart !== 'string' && !(rawStart instanceof Date)) continue;
    if (typeof rawEnd !== 'string' && !(rawEnd instanceof Date)) continue;

    const s = new Date(rawStart);
    const e = new Date(rawEnd);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) continue;

    const diff = s.getTime() - nowMs;
    if (diff > 0 && diff <= fourHoursMs && isSameDay(s, now)) {
      if (!earliestUpcoming || s.getTime() < earliestUpcoming.start.getTime()) {
        earliestUpcoming = {
          title: ((ev as Record<string, unknown>).title as string) || 'Termin',
          start: s,
          end: e,
          isOngoing: false,
        };
      }
    }
  }

  return earliestUpcoming;
}

export default function SmartIslandCalendar({
  selectedDate: propSelectedDate,
  onSelect,
  onMonthChange,
  activeOrUpcomingEvent,
  className,
}: SmartIslandCalendarProps) {
  const selectedDate = useMemo(() => propSelectedDate || new Date(), [propSelectedDate]);
  const [currentMonth, setCurrentMonth] = useState<Date>(() => startOfMonth(selectedDate));
  const [prevSelectedDate, setPrevSelectedDate] = useState<Date>(selectedDate);

  // Sync internal viewing month if selectedDate changes
  if (selectedDate !== prevSelectedDate) {
    setPrevSelectedDate(selectedDate);
    if (!isSameMonth(currentMonth, selectedDate)) {
      setCurrentMonth(startOfMonth(selectedDate));
    }
  }

  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  // Periodically refresh current time to update timer minutes and pie sector
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const visibleCalendarRange = useDataStore((s) => s.visibleCalendarRange);
  const storeEvents = useDataStore((s) => s.events);

  // Active / Upcoming event resolution (prop takes precedence, then store fallback)
  const resolvedEvent = useMemo(() => {
    if (activeOrUpcomingEvent !== undefined) {
      return activeOrUpcomingEvent;
    }
    const now = new Date(nowTick);
    return resolveActiveOrUpcomingEvent(storeEvents, nowTick, now);
  }, [activeOrUpcomingEvent, storeEvents, nowTick]);

  // Timer metrics (minutes remaining and 0..1 pie sector fraction)
  const timerInfo = useMemo(() => {
    if (!resolvedEvent) return null;

    const start = new Date(resolvedEvent.start);
    const end = new Date(resolvedEvent.end);
    const now = new Date(nowTick);
    const startMs = start.getTime();
    const endMs = end.getTime();
    const nowMs = now.getTime();

    if (isNaN(startMs) || isNaN(endMs)) return null;

    const isOngoing = resolvedEvent.isOngoing ?? (startMs <= nowMs && endMs > nowMs);

    if (isOngoing) {
      const totalMs = Math.max(60000, endMs - startMs);
      const remainingMs = Math.max(0, endMs - nowMs);
      const displayMinutes = Math.max(0, Math.ceil(remainingMs / 60000));
      const fraction = Math.min(1, Math.max(0, remainingMs / totalMs));
      return {
        displayMinutes,
        fraction,
      };
    } else if (startMs > nowMs) {
      const remainingMs = startMs - nowMs;
      const displayMinutes = Math.max(0, Math.ceil(remainingMs / 60000));
      const totalWait = Math.max(remainingMs, 60 * 60 * 1000);
      const fraction = Math.min(1, Math.max(0, remainingMs / totalWait));
      return {
        displayMinutes,
        fraction,
      };
    }

    return null;
  }, [resolvedEvent, nowTick]);

  const timerPath = useMemo(() => {
    if (!timerInfo) return '';
    return createPieSectorPath(8, 8, 7, timerInfo.fraction);
  }, [timerInfo]);

  // Violet window range bounds
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (visibleCalendarRange?.start && visibleCalendarRange?.end) {
      const s = new Date(visibleCalendarRange.start);
      const e = new Date(visibleCalendarRange.end);
      if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
        return {
          rangeStart: startOfDay(s),
          rangeEnd: endOfDay(e),
        };
      }
    }
    return {
      rangeStart: startOfWeek(selectedDate, { weekStartsOn: 1 }),
      rangeEnd: endOfWeek(selectedDate, { weekStartsOn: 1 }),
    };
  }, [visibleCalendarRange, selectedDate]);

  // Calendar 42-day grid calculation
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const firstDayOfWeek = monthStart.getDay();
    const startOffset = (firstDayOfWeek + 6) % 7; // Monday = 0
    const gridStartDate = subDays(monthStart, startOffset);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStartDate, i));
  }, [currentMonth]);

  const handlePrevMonth = () => {
    const prev = subMonths(currentMonth, 1);
    setCurrentMonth(prev);
    onMonthChange?.(prev);
  };

  const handleNextMonth = () => {
    const next = addMonths(currentMonth, 1);
    setCurrentMonth(next);
    onMonthChange?.(next);
  };

  const handleSelectDay = (day: Date) => {
    onSelect(day);
    if (!isSameMonth(day, currentMonth)) {
      const newMonth = startOfMonth(day);
      setCurrentMonth(newMonth);
      onMonthChange?.(newMonth);
    }
  };

  const monthTitle = format(currentMonth, 'MMMM yyyy', { locale: de }).toUpperCase();
  const today = useMemo(() => new Date(nowTick), [nowTick]);

  return (
    <article
      className={`w-full max-w-[340px] bg-[#18181b] rounded-[32px] pt-[22px] px-[20px] pb-[20px] shadow-[0_20px_40px_rgba(0,0,0,0.14)] select-none font-sans text-white ${
        className || ''
      }`}
      aria-label={`${monthTitle} Kalender-Widget`}
    >
      {/* Header Row */}
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-[10px] min-w-0">
          <h2 className="m-0 text-white font-bold text-[16px] tracking-[0.04em] uppercase leading-[1.1] whitespace-nowrap">
            {monthTitle}
          </h2>

          {timerInfo && (
            <div
              className="inline-flex items-center gap-[5px] bg-transparent border-0 p-0 shrink-0"
              aria-label="Verbleibende Terminzeit"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" className="block shrink-0" aria-hidden="true">
                <circle cx="8" cy="8" r="7" fill="#27272a" />
                {timerPath && <path d={timerPath} fill="#3b71f3" />}
              </svg>
              <span className="text-[#93c5fd] font-semibold text-[13px] leading-none tabular-nums">
                {timerInfo.displayMinutes} min
              </span>
            </div>
          )}
        </div>

        {/* Month Navigation */}
        <div className="flex items-center gap-[2px] shrink-0">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="w-[28px] h-[28px] inline-flex items-center justify-center border-0 bg-transparent text-[#a1a1aa] rounded-[8px] cursor-pointer p-0 hover:text-white hover:bg-white/[0.06] active:scale-[0.92] transition-all"
            aria-label="Vorheriger Monat"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            className="w-[28px] h-[28px] inline-flex items-center justify-center border-0 bg-transparent text-[#a1a1aa] rounded-[8px] cursor-pointer p-0 hover:text-white hover:bg-white/[0.06] active:scale-[0.92] transition-all"
            aria-label="Nächster Monat"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </header>

      {/* Divider */}
      <hr className="h-[1px] bg-[#27272a] mt-[12px] mb-[10px] border-0" />

      {/* Weekdays Grid */}
      <div className="grid grid-cols-7 text-center mb-1" aria-hidden="true">
        {WEEKDAYS.map((name) => (
          <span
            key={name}
            className="text-[#a1a1aa] text-[11px] font-semibold tracking-[0.03em] leading-[1.2]"
          >
            {name}
          </span>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-y-[4px] gap-x-0" role="grid" aria-label={monthTitle}>
        {calendarDays.map((day, cellIndex) => {
          const isSelected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, today);
          const isCurrentMonth = isSameMonth(day, currentMonth);

          const dayStart = startOfDay(day);
          const isInViolet =
            rangeStart && rangeEnd ? dayStart >= rangeStart && dayStart <= rangeEnd : false;

          const violetCapClass =
            isInViolet && rangeStart && rangeEnd
              ? getVioletCapClass(day, rangeStart, rangeEnd, cellIndex)
              : '';

          return (
            <button
              key={day.toISOString()}
              type="button"
              role="gridcell"
              aria-selected={isSelected ? true : undefined}
              aria-current={isToday ? 'date' : undefined}
              onClick={() => handleSelectDay(day)}
              className={`group relative h-[38px] w-full border-0 bg-transparent p-0 m-0 flex items-center justify-center cursor-pointer outline-none ${
                isInViolet ? `bg-[rgba(139,92,246,0.28)] ${violetCapClass}` : ''
              }`}
            >
              {isSelected || isToday ? (
                <span
                  className={`absolute inset-[2px] rounded-[10px] border-0 flex items-center justify-center text-[14px] font-bold leading-none z-[2] transition-transform duration-140 group-active:scale-[0.92] ${
                    isSelected
                      ? 'bg-[#3b71f3] text-white shadow-[0_2px_8px_rgba(59,113,243,0.45)]'
                      : 'bg-[#1d3b8b] text-[#7dd3fc]'
                  }`}
                >
                  {format(day, 'd')}
                </span>
              ) : (
                <span
                  className={`relative z-[2] text-[14px] leading-none pointer-events-none transition-all duration-120 group-hover:scale-[1.08] ${
                    isCurrentMonth ? 'text-white font-semibold' : 'text-[#63636e] font-medium'
                  }`}
                >
                  {format(day, 'd')}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </article>
  );
}
