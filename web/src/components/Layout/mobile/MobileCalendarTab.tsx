"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, format, isSameDay, startOfWeek } from 'date-fns';
import { de } from 'date-fns/locale';
import type { WeekStart } from '@/lib/calendarWeeks';
import { useDataStore, useWeekStartsOn } from '@/store/useDataStore';
import MiniCalendar from '../../Calendar/MiniCalendar';
import MobileWeekGrid from '../MobileWeekGrid';
import { DbTimelineDay, MobileAgendaTimeline } from './MobileAgendaTimeline';
import { computeWeekAllDayRows, type CalendarEvent } from './expandMobileEvents';
import { T } from './mobileTheme';
import type { MobileCalViewMode } from './MobileTopHeader';
import { useMobileSwipeGestures } from './useMobileSwipeGestures';
import { CalendarTagPills } from '../../Calendar/CalendarTagPills';
import { CalendarViewsMenu } from '../../Calendar/CalendarViewsMenu';
import type { CalendarViewMode } from '../../Calendar/types';
import { QuickEditGrid } from './QuickEditGrid';
import type { NewEventMeta } from './MobileOverlaysAndModals';
import { confirmQuickEdit, quickEditContext, quickEditForDraft, quickEditForEvent, type QuickEditState } from './quickEditState';

export interface MobileCalendarTabProps {
  activeDate: Date;
  setActiveDate: React.Dispatch<React.SetStateAction<Date>>;
  calViewMode: MobileCalViewMode;
  expandedEvents: CalendarEvent[];
  theme?: string;
  now?: Date;
  weekStartsOn?: WeekStart;
  dayViewDays?: Date[];
  setDayViewDays?: React.Dispatch<React.SetStateAction<Date[]>>;
  onSelectEvent?: (event: CalendarEvent) => void;
  onEditEvent?: (event: CalendarEvent) => void;
  onNewEvent?: (date: Date, endDate?: Date, meta?: NewEventMeta) => void;
  onCreateEvent?: (date: Date) => void;
  onEventClick?: (id: string) => void;
  onEventUpdate?: (id: string, newStart: Date, newEnd: Date, meta?: { title?: string; color?: string; description?: string }) => void;
  onEventDelete?: (id: string) => void;
  onTaskComplete?: (id: string, completed: boolean) => void;
  onTodayClick?: () => void;
  /** Tags shown as filter pills above the calendar. */
  themes?: { id: string; title: string; color?: string }[];
  /** Lets the saved-views menu switch the calendar mode. */
  onCalViewModeChange?: (mode: MobileCalViewMode) => void;
  /** Lets the saved-views menu jump to the todo tab. */
  onOpenTodos?: () => void;
}

const toSavedMode = (m: MobileCalViewMode): CalendarViewMode => (m === 'agenda' ? 'continuous' : m);
const fromSavedMode = (m: CalendarViewMode): MobileCalViewMode => (m === 'continuous' ? 'agenda' : m);

function getDayTimelineEvents(expandedEvents: CalendarEvent[], date: Date) {
  const sameDay = (e: CalendarEvent) => {
    try { return isSameDay(new Date(e.start), date); } catch { return false; }
  };
  const allDayEvs = expandedEvents.filter((e) => e.allDay && sameDay(e));
  const dayEvs = expandedEvents
    .filter((e) => !e.allDay && sameDay(e))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return { allDayEvs, dayEvs };
}

/**
 * Mobile calendar tab view supporting day, agenda, week, and month modes
 * with horizontal swipe navigation in day and week views.
 */
export const MobileCalendarTab: React.FC<MobileCalendarTabProps> = ({
  activeDate,
  setActiveDate,
  calViewMode,
  onCalViewModeChange,
  onOpenTodos,
  expandedEvents,
  theme: themeProp,
  now: nowProp,
  weekStartsOn: weekStartsOnProp,
  dayViewDays: dayViewDaysProp,
  setDayViewDays: setDayViewDaysProp,
  onSelectEvent,
  onEditEvent,
  onNewEvent,
  onCreateEvent,
  onEventClick,
  onEventUpdate,
  onEventDelete,
  onTaskComplete,
  onTodayClick,
  themes,
}) => {
  const storeTheme = useDataStore((s) => s.theme);
  const storeWeekStartsOn = useWeekStartsOn();
  const theme = themeProp ?? storeTheme;
  const weekStartsOn = weekStartsOnProp ?? storeWeekStartsOn;

  const [internalNow, setInternalNow] = useState(() => new Date());
  useEffect(() => {
    if (nowProp !== undefined) return;
    const id = setInterval(() => setInternalNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [nowProp]);
  const now = nowProp ?? internalNow;

  const {
    swipeDx,
    swipeElRef,
    snapping,
    eventDragActive,
    onEventDragChange,
    onSwipeStart,
    onSwipeMove,
    onSwipeEnd,
  } = useMobileSwipeGestures({ calViewMode, setActiveDate });

  const weekStart = useMemo(() => startOfWeek(activeDate, { weekStartsOn }), [activeDate, weekStartsOn]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  const weekStartMs = weekStart.getTime();

  const { rows: allDayRows } = useMemo(
    () => computeWeekAllDayRows(expandedEvents, weekDays),
    [expandedEvents, weekDays],
  );

  const [internalDayViewDays, setInternalDayViewDays] = useState<Date[]>(() =>
    Array.from({ length: 30 }, (_, i) => addDays(weekStart, i)),
  );
  const dayViewDays = dayViewDaysProp ?? internalDayViewDays;
  const setDayViewDays = setDayViewDaysProp ?? setInternalDayViewDays;
  const dayViewSentinelRef = useRef<HTMLDivElement>(null);

  // Reset day-view list when the calendar week changes
  useEffect(() => {
    const ws = new Date(weekStartMs);
    setDayViewDays(Array.from({ length: 30 }, (_, i) => addDays(ws, i)));
  }, [weekStartMs, setDayViewDays]);

  // Infinite scroll sentinel for agenda view
  useEffect(() => {
    if (calViewMode !== 'agenda') return;
    const el = dayViewSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setDayViewDays((prev) => {
            const last = prev[prev.length - 1];
            if (!last) return prev;
            return [...prev, ...Array.from({ length: 14 }, (_, i) => addDays(last, i + 1))];
          });
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [calViewMode, setDayViewDays]);

  const { allDayEvs, dayEvs } = useMemo(
    () => getDayTimelineEvents(expandedEvents, activeDate),
    [expandedEvents, activeDate],
  );

  const handleCreateEvent = useCallback(
    (date: Date) => {
      if (onCreateEvent) onCreateEvent(date);
      else onNewEvent?.(date);
    },
    [onCreateEvent, onNewEvent],
  );

  // Quick edit grid (day view only): hold a card = edit, double tap = draft.
  const [quickEdit, setQuickEdit] = useState<QuickEditState>(null);
  const quickEditCtx = useMemo(
    () => (quickEdit ? quickEditContext(dayEvs, quickEdit.target.id) : []),
    [quickEdit, dayEvs],
  );
  const handleQuickEdit = useCallback((ev: CalendarEvent) => setQuickEdit(quickEditForEvent(ev)), []);
  const handleDraftAt = useCallback((start: Date, end: Date) => setQuickEdit(quickEditForDraft(start, end)), []);
  const handleQuickEditConfirm = useCallback(
    (start: Date, end: Date) => {
      if (!quickEdit) return;
      const out = confirmQuickEdit(quickEdit, start, end);
      setQuickEdit(null);
      if (out.kind === 'update') onEventUpdate?.(out.id, out.start, out.end);
      else if (out.kind === 'draft') onEditEvent?.(out.event);
    },
    [quickEdit, onEventUpdate, onEditEvent],
  );
  const handleQuickEditCancel = useCallback(() => setQuickEdit(null), []);

  const handleTodayClick = useCallback(() => {
    if (onTodayClick) {
      onTodayClick();
      return;
    }
    const today = new Date();
    setActiveDate(today);
    setDayViewDays((prev) => {
      if (prev.some((d) => isSameDay(d, today))) return prev;
      const ws = startOfWeek(today, { weekStartsOn });
      return Array.from({ length: 30 }, (_, i) => addDays(ws, i));
    });
  }, [onTodayClick, setActiveDate, setDayViewDays, weekStartsOn]);

  // Touches in the grid portal bubble up here; no day change while the grid is open.
  const swipeOn = (calViewMode === 'week' || calViewMode === 'day') && !quickEdit;
  const swipeTransform =
    snapping === 'left' ? 'translateX(-100%)' : snapping === 'right' ? 'translateX(100%)' : `translateX(${swipeDx * 0.4}px)`;
  const swipeTransition = snapping
    ? 'transform 0.24s cubic-bezier(0.4,0,0.2,1)'
    : swipeDx === 0 && !eventDragActive
      ? 'transform 0.18s ease-out'
      : 'none';

  return (
    <div
      className="flex flex-col"
      style={{ flex: 1, overflow: 'hidden', paddingBottom: 'calc(76px + env(safe-area-inset-bottom))' }}
      onTouchStart={swipeOn ? onSwipeStart : undefined}
      onTouchMove={swipeOn ? onSwipeMove : undefined}
      onTouchEnd={swipeOn ? onSwipeEnd : undefined}
    >
      {themes && themes.length > 0 && (
        // Horizontal scrolling of the pill row must not be read as a calendar swipe.
        <div
          className="flex shrink-0 items-center gap-2 px-3 py-1.5"
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          {onCalViewModeChange && (
            <CalendarViewsMenu
              tags={themes}
              viewMode={toSavedMode(calViewMode)}
              onViewModeChange={(m) => onCalViewModeChange(fromSavedMode(m))}
              onOpenTodos={onOpenTodos}
            />
          )}
          <CalendarTagPills tags={themes} className="min-w-0 flex-1" />
        </div>
      )}
      {calViewMode === 'week' ? (
        <div
          ref={swipeElRef}
          style={{ transform: swipeTransform, transition: swipeTransition, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
          <div
            className="flex shrink-0"
            style={{ borderBottom: allDayRows.length > 0 ? 'none' : `1px solid ${T.brd}`, paddingLeft: 38 }}
            onWheel={(e) => {
              e.stopPropagation();
              if (e.deltaY > 0 || e.deltaX > 0) setActiveDate((d) => addDays(d, 7));
              else if (e.deltaY < 0 || e.deltaX < 0) setActiveDate((d) => addDays(d, -7));
            }}
          >
            {weekDays.map((d) => {
              const isToday = isSameDay(d, now);
              const isSel = isSameDay(d, activeDate);
              return (
                <button
                  key={d.toISOString()}
                  className="flex-1 flex flex-col items-center py-1"
                  style={{ background: isToday ? 'rgba(59,130,246,0.04)' : 'transparent', border: 'none', cursor: 'pointer' }}
                  onClick={() => setActiveDate(d)}
                >
                  <span className="text-[9px] font-bold uppercase" style={{ color: isToday ? T.accent : T.mut }}>
                    {format(d, 'eeeee', { locale: de })}
                  </span>
                  <span
                    className="text-xs w-7 h-7 flex items-center justify-center rounded-full"
                    style={{
                      background: isToday ? T.danger : isSel ? `${T.accent}20` : 'transparent',
                      color: isToday ? '#fff' : isSel ? T.accent : T.pri,
                      fontWeight: isSel || isToday ? 700 : 500,
                    }}
                  >
                    {format(d, 'd')}
                  </span>
                  <div className="w-1 h-1 rounded-full" style={{ background: isToday ? T.danger : 'transparent', marginTop: 1 }} />
                </button>
              );
            })}
          </div>

          {allDayRows.length > 0 && (
            <div className="shrink-0" style={{ paddingLeft: 38, borderBottom: `1px solid ${T.brd}`, height: allDayRows.length * 20 + 4 }}>
              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                {allDayRows.flatMap((row, ri) =>
                  row.map(({ event, sc, ec }) => (
                    <button
                      key={event.id}
                      onClick={() => {
                        const ev = expandedEvents.find((e) => e.id === event.id);
                        if (ev) onSelectEvent?.(ev);
                      }}
                      style={{
                        position: 'absolute', top: ri * 20 + 2, left: `${(sc / 7) * 100}%`,
                        width: `calc(${((ec - sc + 1) / 7) * 100}% - 2px)`, height: 18, borderRadius: 3,
                        background: `${event.color || T.accent}DD`, overflow: 'hidden', padding: '0 4px',
                        display: 'flex', alignItems: 'center', border: 'none', cursor: 'pointer',
                      }}
                    >
                      <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {event.title}
                      </span>
                    </button>
                  )),
                )}
              </div>
            </div>
          )}

          <MobileWeekGrid
            key={weekStartStr}
            weekDays={weekDays}
            events={expandedEvents}
            now={now}
            onEventTap={(id) => {
              const ev = expandedEvents.find((e) => e.id === id);
              if (ev) onSelectEvent?.(ev);
              onEventClick?.(id);
            }}
            onNewEvent={(start) => onNewEvent?.(start)}
            onEventUpdate={onEventUpdate}
            onWeekShift={(dir) => setActiveDate((d) => addDays(d, dir * 7))}
            onEventDragChange={onEventDragChange}
          />
        </div>
      ) : calViewMode === 'month' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flexShrink: 0 }}>
            <MiniCalendar
              selectedDate={activeDate}
              events={expandedEvents}
              onSelect={setActiveDate}
              onMonthChange={setActiveDate}
              hideVisibleRangeHighlight={true}
            />
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <div className="flex items-center py-2.5">
              <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: T.pri }}>
                {format(activeDate, 'EEEE d. MMM', { locale: de }).toUpperCase()}
              </span>
            </div>
            <div className="h-px mb-3" style={{ background: T.brd }} />
            <DbTimelineDay
              day={activeDate}
              dayEvs={dayEvs}
              allDayEvs={allDayEvs}
              isToday={isSameDay(activeDate, now)}
              now={now}
              theme={theme}
              onNewEvent={handleCreateEvent}
              onDeleteEvent={onEventDelete}
              onEditEvent={onEditEvent}
              onTaskComplete={onTaskComplete}
            />
          </div>
        </div>
      ) : calViewMode === 'day' ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="flex-1 overflow-y-auto pb-4 px-4 pt-2">
            <DbTimelineDay
              day={activeDate}
              dayEvs={dayEvs}
              allDayEvs={allDayEvs}
              isToday={isSameDay(activeDate, now)}
              now={now}
              theme={theme}
              onNewEvent={handleCreateEvent}
              onDeleteEvent={onEventDelete}
              onEditEvent={onEditEvent}
              onTaskComplete={onTaskComplete}
              proportional
              onQuickEdit={handleQuickEdit}
              onDraftAt={handleDraftAt}
            />
          </div>
          {/* Sibling of the list, not inside it: the list's click-block must not swallow the grid's taps. */}
          {quickEdit && (
            <QuickEditGrid
              day={activeDate}
              context={quickEditCtx}
              target={quickEdit.target}
              mode={quickEdit.mode}
              onConfirm={handleQuickEditConfirm}
              onCancel={handleQuickEditCancel}
            />
          )}
        </div>
      ) : (
        <MobileAgendaTimeline
          dayViewDays={dayViewDays}
          events={expandedEvents}
          now={now}
          theme={theme}
          onSelectDate={setActiveDate}
          onTodayClick={handleTodayClick}
          onNewEvent={handleCreateEvent}
          onDeleteEvent={onEventDelete}
          onEditEvent={onEditEvent}
          onTaskComplete={onTaskComplete}
          dayViewSentinelRef={dayViewSentinelRef}
        />
      )}
    </div>
  );
};

export default MobileCalendarTab;
