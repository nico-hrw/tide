import React, { useState, useMemo } from 'react';
import { format, isSameDay } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  Calendar as CalendarIcon, Clock, ChevronDown, MapPin, Coffee, Plus, CheckSquare,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDataStore } from '@/store/useDataStore';
import { paletteFor, type PaletteEntry } from './eventPalette';
import { AllDayTodoPills, TimedTodoRow, FreeGap, formatFree } from './AgendaParts';

const T = {
  bg: 'var(--background)', card: 'var(--sidebar-bg)', pri: 'var(--foreground)',
  sec: 'var(--muted-text)', mut: 'var(--text-subtle)', brd: 'var(--border-color)',
  hov: 'var(--hover-bg)', accent: '#3B82F6', danger: '#EF4444',
} as const;

export const PX_PER_MIN = 1.1;
export const MIN_EVENT_HEIGHT = 56;

export interface LaneItem<T> {
  event: T;
  desiredTop: number;
  height: number;
}

export function packLanes<T extends { id: string; start: string; end?: string }>(events: T[], clusterStart: Date): LaneItem<T>[][] {
  const sorted = [...events].sort((a, b) => {
    const aS = new Date(a.start).getTime(), bS = new Date(b.start).getTime();
    if (aS !== bS) return aS - bS;
    return ((b.end ? new Date(b.end).getTime() : bS + 3600000) - bS) - ((a.end ? new Date(a.end).getTime() : aS + 3600000) - aS);
  });
  const lanes: { items: LaneItem<T>[]; bottomPx: number }[] = [];
  for (const ev of sorted) {
    const s = new Date(ev.start), e = ev.end ? new Date(ev.end) : new Date(s.getTime() + 3600000);
    const top = Math.round(Math.max(0, (s.getTime() - clusterStart.getTime()) / 60000) * PX_PER_MIN);
    const h = Math.max(MIN_EVENT_HEIGHT, Math.round(Math.max(15, (e.getTime() - s.getTime()) / 60000) * PX_PER_MIN));
    const lane = lanes.find(l => l.bottomPx + 6 <= top);
    if (lane) { lane.items.push({ event: ev, desiredTop: top, height: h }); lane.bottomPx = top + h; }
    else { lanes.push({ items: [{ event: ev, desiredTop: top, height: h }], bottomPx: top + h }); }
  }
  return lanes.map(l => l.items);
}

function getEvInfo(ev: any, now: Date, isToday: boolean, nextUpcomingId: string | null) {
  const evStart = new Date(ev.start), evEnd = ev.end ? new Date(ev.end) : new Date(evStart.getTime() + 3600000);
  const durM = Math.max(15, Math.round((evEnd.getTime() - evStart.getTime()) / 60000));
  const durStr = durM >= 60 ? `${Math.floor(durM / 60)}h ${durM % 60 > 0 ? `${durM % 60}m` : ''}`.trim() : `${durM} Min.`;
  const isActive = isToday && (() => { try { return evStart <= now && evEnd > now; } catch { return false; } })();
  const isNext = isToday && !isActive && ev.id === nextUpcomingId;
  const remM = Math.max(1, Math.round((evEnd.getTime() - now.getTime()) / 60000));
  const remStr = remM >= 60 ? `${Math.floor(remM / 60)} Std. ${remM % 60 > 0 ? `${remM % 60} Min.` : ''}`.trim() : `${remM} Min.`;
  const startM = Math.max(1, Math.round((evStart.getTime() - now.getTime()) / 60000));
  const startStr = startM >= 60 ? `${Math.floor(startM / 60)} Std. ${startM % 60 > 0 ? `${startM % 60} Min.` : ''}`.trim() : `${startM} Min.`;
  return { evStart, evEnd, durM, durStr, isActive, isNext, remStr, startStr, color: ev.color || T.accent };
}

function getCardStyle(pal: PaletteEntry, isActive: boolean, extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: pal.bg, color: pal.ink, border: 'none',
    boxShadow: isActive ? '0 8px 22px -8px rgba(0,0,0,0.35)' : 'none',
    transition: 'box-shadow 0.2s ease', ...extra,
  };
}

/** Gefüllte Icons ohne Hintergrund (Material-Stil), in der Farbe des Termins. */
const EDIT_PATH = 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z';
const DELETE_PATH = 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z';

function FilledIcon({ d, size }: { d: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function EventActions({ ev, isActive, ink, theme, onDeleteEvent, onEditEvent, compact }: { ev: any; isActive: boolean; ink?: string; theme: string; onDeleteEvent?: (id: string) => void; onEditEvent?: (ev: any) => void; compact?: boolean }) {
  return (
    <>
      {ev.location && (
        <div className={`flex items-center gap-1.5 text-xs font-medium ${compact ? 'mb-1.5' : 'mb-2'}`} style={{ color: ink ?? T.sec }}>
          <MapPin size={compact ? 12 : 13} className="shrink-0" /><span className="truncate">{ev.location}</span>
        </div>
      )}
      {ev.description && (
        <p className={`text-xs whitespace-pre-wrap leading-relaxed ${compact ? 'mb-2.5' : 'mb-3'}`} style={{ color: ink ?? T.sec }}>{ev.description}</p>
      )}
      <div className="flex items-center gap-5 pt-1">
        <button
          type="button"
          aria-label="Bearbeiten"
          onClick={e => {
            e.stopPropagation();
            if (onEditEvent) {
              onEditEvent(ev);
            } else {
              window.dispatchEvent(new CustomEvent('mobile_edit_event', { detail: { id: ev.id } }));
            }
          }}
          className="p-1 active:scale-90 transition-transform"
          style={{ color: ink ?? T.pri }}
        >
          <FilledIcon d={EDIT_PATH} size={compact ? 20 : 22} />
        </button>
        {onDeleteEvent && (
          <button
            type="button"
            aria-label="Löschen"
            onClick={e => { e.stopPropagation(); onDeleteEvent(ev.id); }}
            className="p-1 active:scale-90 transition-transform"
            style={{ color: '#ef4444' }}
          >
            <FilledIcon d={DELETE_PATH} size={compact ? 20 : 22} />
          </button>
        )}
      </div>
    </>
  );
}

function StatusBadges({ isActive, remStr, durStr, ink }: { isActive: boolean; remStr: string; durStr: string; ink: string }) {
  if (!isActive) return null;
  return (
    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-md flex items-center gap-1.5 shrink-0" style={{ background: 'rgba(128,128,128,0.25)', color: ink }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: ink }} />
        Noch {remStr}
      </span>
      <span className="text-[10px] font-medium opacity-75 ml-auto shrink-0">{durStr}</span>
    </div>
  );
}

function TimelineEventItem({
  ev, now, isToday, isEven, nextUpcomingId, theme, isExpanded, onToggleExpand, onDeleteEvent, onEditEvent, onTaskComplete, isParallel = false, style,
}: {
  ev: any; now: Date; isToday: boolean; isEven: boolean; nextUpcomingId: string | null; theme: string;
  isExpanded: boolean; onToggleExpand: () => void; onDeleteEvent?: (id: string) => void; onEditEvent?: (ev: any) => void; onTaskComplete?: (id: string, completed: boolean) => void; isParallel?: boolean; style?: React.CSSProperties;
}) {
  const info = getEvInfo(ev, now, isToday, nextUpcomingId);
  // Der laufende Termin ist invertiert: Hintergrund in der Textfarbe, Text in der Hintergrundfarbe.
  const basePal = paletteFor(ev.color);
  const pal = info.isActive ? { bg: basePal.ink, ink: basePal.bg } : basePal;
  const pHeight = Math.max(54, Math.min(180, 44 + info.durM * 0.6));

  const isTask = !!(ev.is_task || ev.linkedTaskId);
  const tasks = useDataStore(state => state.tasks);
  const linkedTask = ev.linkedTaskId ? tasks?.find(t => t.id === ev.linkedTaskId) : undefined;
  const isCompleted = linkedTask ? !!linkedTask.isCompleted : !!ev.is_completed;

  const handleToggleTask = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextCompleted = !isCompleted;
    if (ev.linkedTaskId) {
      useDataStore.getState().toggleTask(ev.linkedTaskId);
      onTaskComplete?.(ev.id, nextCompleted);
    } else if (onTaskComplete) {
      onTaskComplete(ev.id, nextCompleted);
    } else {
      useDataStore.setState(s => ({
        events: s.events.map(e =>
          e.id === ev.id ? { ...e, is_completed: nextCompleted } : e
        )
      }));
    }
  };

  if (isParallel) {
    return (
      <div id={`ev-${ev.id}`} className="w-full flex flex-col text-left rounded-[14px] transition-all relative overflow-hidden" style={getCardStyle(pal, info.isActive, style)}>
        <button onClick={onToggleExpand} className="w-full flex flex-col text-left p-3 cursor-pointer" style={{ border: 'none', background: 'transparent' }}>
          <div className="flex items-center justify-between gap-1 mb-1.5 w-full">
            <span className="text-[11px] font-bold" style={{ color: pal.ink }}>
              {format(info.evStart, 'HH:mm')} – {format(info.evEnd, 'HH:mm')}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-medium shrink-0 px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(128,128,128,0.22)', color: pal.ink }}>{info.durStr}</span>
              <ChevronDown size={12} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', color: pal.ink, transition: 'transform 0.2s ease' }} />
            </div>
          </div>
          <div className="flex items-start gap-1.5 min-w-0 w-full mb-1">
            {isTask ? (
              <button
                type="button"
                onClick={handleToggleTask}
                className={`w-3.5 h-3.5 mt-0.5 rounded-[4px] border border-current shrink-0 flex items-center justify-center cursor-pointer transition-all active:scale-90 z-20 ${isCompleted ? 'opacity-40' : 'opacity-100'}`}
                style={{ borderColor: pal.ink, color: pal.ink }}
                title={isCompleted ? "Als unerledigt markieren" : "Als erledigt markieren"}
              >
                {isCompleted && (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                )}
              </button>
            ) : (
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 ${info.isActive ? 'animate-pulse' : ''}`} style={{ background: pal.ink }} />
            )}
            <span className={`text-xs sm:text-sm font-bold line-clamp-2 flex-1 leading-snug ${isCompleted ? 'line-through opacity-60' : ''}`} style={{ color: pal.ink }}>{ev.title}</span>
          </div>
          <StatusBadges isActive={info.isActive} remStr={info.remStr} durStr={info.durStr} ink={pal.ink} />
          {!isExpanded && ev.description && (
            <p className="text-[11px] mt-0.5 line-clamp-1 leading-relaxed" style={{ color: pal.ink }}>{ev.description}</p>
          )}
        </button>
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: 'rgba(128, 128, 128, 0.25)' }}>
                <EventActions ev={ev} isActive={info.isActive} ink={pal.ink} theme={theme} onDeleteEvent={onDeleteEvent} onEditEvent={onEditEvent} compact />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div id={`ev-${ev.id}`} className="w-full rounded-xl my-1 relative transition-all overflow-hidden" style={getCardStyle(pal, info.isActive, { minHeight: pHeight, ...style })}>
      <button onClick={onToggleExpand} className="w-full flex text-left p-0 transition-all cursor-pointer items-stretch" style={{ border: 'none', background: 'transparent', minHeight: isExpanded ? undefined : pHeight }}>
        <div className="w-[58px] shrink-0 flex flex-col items-end pr-2 pt-3.5">
          <span className={`font-bold leading-none ${info.isActive ? 'text-[13px]' : 'text-[12px]'}`} style={{ color: pal.ink }}>{format(info.evStart, 'HH:mm')}</span>
          <span className="text-[10px] font-medium mt-1" style={{ color: pal.ink }}>{format(info.evEnd, 'HH:mm')}</span>
        </div>
        <div className="w-[24px] shrink-0 flex flex-col items-center pt-3.5 pb-2.5 self-stretch">
          <div className={`w-3 h-3 rounded-full shrink-0 ${info.isActive ? 'animate-pulse' : ''}`} style={{ background: pal.ink }} />
          <div className="w-[2px] flex-1 mt-1.5 mb-1 rounded-full" style={{ minHeight: Math.max(16, pHeight - 48), background: pal.ink, opacity: 0.25 }} />
        </div>
        <div className="flex-1 py-3 pr-3 min-w-0 flex flex-col justify-start">
          <div className="flex items-center justify-between gap-1.5 w-full">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {isTask && (
                <button
                  type="button"
                  onClick={handleToggleTask}
                  className={`w-3.5 h-3.5 rounded-[4px] border border-current shrink-0 flex items-center justify-center cursor-pointer transition-all active:scale-90 z-20 ${isCompleted ? 'opacity-40' : 'opacity-100'}`}
                  style={{ borderColor: pal.ink, color: pal.ink }}
                  title={isCompleted ? "Als unerledigt markieren" : "Als erledigt markieren"}
                >
                  {isCompleted && (
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  )}
                </button>
              )}
              <span className={`font-bold truncate flex-1 min-w-0 ${info.isActive ? 'text-sm' : 'text-[13px]'} ${isCompleted ? 'line-through opacity-60' : ''}`} style={{ color: pal.ink }}>{ev.title}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-1">
              {!info.isActive && !info.isNext && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(128,128,128,0.22)', color: pal.ink }}>{info.durStr}</span>
              )}
              <ChevronDown size={14} className="transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', color: pal.ink }} />
            </div>
          </div>
          <StatusBadges isActive={info.isActive} remStr={info.remStr} durStr={info.durStr} ink={pal.ink} />
          {!isExpanded && ev.description && (
            <p className="text-xs mt-1.5 line-clamp-1 leading-relaxed" style={{ color: pal.ink }}>{ev.description}</p>
          )}
        </div>
      </button>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3.5 pt-2 border-t ml-[82px] mr-3" style={{ borderColor: 'rgba(128, 128, 128, 0.25)' }}>
              <EventActions ev={ev} isActive={info.isActive} ink={pal.ink} theme={theme} onDeleteEvent={onDeleteEvent} onEditEvent={onEditEvent} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export interface DbTimelineDayProps {
  day: Date; dayEvs: any[]; allDayEvs: any[]; isToday: boolean; now: Date;
  theme: string; onSelectEvent?: (ev: any) => void; onNewEvent?: (date: Date) => void; onDeleteEvent?: (id: string) => void;
  onEditEvent?: (ev: any) => void; onTaskComplete?: (id: string, completed: boolean) => void;
}

export const DbTimelineDay = React.memo(function DbTimelineDay({
  day, dayEvs, allDayEvs, isToday, now, theme, onNewEvent, onDeleteEvent, onEditEvent, onTaskComplete,
}: DbTimelineDayProps) {
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const tasks = useDataStore(state => state.tasks);

  const regularAllDay = useMemo(() => allDayEvs.filter(e => !e.is_task && !e.linkedTaskId), [allDayEvs]);
  const allDayTodos = useMemo(() => allDayEvs.filter(e => e.is_task || e.linkedTaskId), [allDayEvs]);

  type TimelineEventItemType = DbTimelineDayProps['allDayEvs'][number];

  const sortedAllDayTodos = useMemo(() => {
    // Only top-level todos appear in the calendar. Subtodos are never shown on their own;
    // they belong to their parent and appear when the parent is expanded.
    return allDayTodos.filter(e => {
      const task = e.linkedTaskId ? tasks?.find(t => t.id === e.linkedTaskId) : undefined;
      return !(task?.parentId || e.parent_id);
    });
  }, [allDayTodos, tasks]);

  const isTodoEv = (e: { is_task?: boolean; linkedTaskId?: string }) => !!(e.is_task || e.linkedTaskId);
  const realEvs = useMemo(() => dayEvs.filter(e => !isTodoEv(e)), [dayEvs]);
  const timedTodos = useMemo(() => dayEvs.filter(isTodoEv), [dayEvs]);

  const nextUpcomingId = useMemo(() => {
    if (!isToday) return null;
    const upcoming = realEvs
      .filter(e => { try { return new Date(e.start) > now; } catch { return false; } })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    return upcoming.length > 0 ? upcoming[0].id : null;
  }, [realEvs, isToday, now]);

  const clusters = useMemo(() => {
    const list: { events: any[]; clusterStart: Date; clusterEnd: Date }[] = [];
    for (const ev of realEvs) {
      const s = new Date(ev.start), e = ev.end ? new Date(ev.end) : new Date(s.getTime() + 3600000);
      const last = list[list.length - 1];
      if (last && s.getTime() < last.clusterEnd.getTime() - 60000) {
        last.events.push(ev);
        if (e.getTime() > last.clusterEnd.getTime()) last.clusterEnd = e;
      } else { list.push({ events: [ev], clusterStart: s, clusterEnd: e }); }
    }
    return list;
  }, [realEvs]);

  if (dayEvs.length === 0 && allDayEvs.length === 0) {
    return (
      <div className="py-8 flex flex-col items-center justify-center text-center">
        <p className="text-xs font-medium mb-3" style={{ color: T.mut }}>Keine Termine an diesem Tag</p>
        {onNewEvent && (
          <button onClick={() => onNewEvent(day)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold active:scale-95 transition-transform" style={{ background: `${T.accent}14`, color: T.accent }}>
            <Plus size={13} /> Termin anlegen
          </button>
        )}
      </div>
    );
  }

  // A timed todo sits right before the first event cluster that starts after it (or at the end).
  const todoSlot = (start: string) => {
    const ts = new Date(start).getTime();
    const i = clusters.findIndex(c => c.clusterStart.getTime() > ts);
    return i === -1 ? clusters.length : i;
  };

  let eventCounter = 0;

  return (
    <div className="flex flex-col py-1">
      {allDayEvs.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-2.5 w-full">
          <AllDayTodoPills todos={sortedAllDayTodos} onTaskComplete={onTaskComplete} />
          {/* Regular all-day events */}
          {regularAllDay.map(ev => {
            const isExp = expandedEventId === ev.id;
            return (
              <div key={`allday-${ev.id}`} className="w-full rounded-xl overflow-hidden transition-all" style={{ background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : '#f4f4f5', border: 'none' }}>
                <button onClick={() => setExpandedEventId(p => p === ev.id ? null : ev.id)} className="w-full flex items-center justify-between text-left px-3.5 py-2.5 active:scale-[0.99] transition-transform cursor-pointer" style={{ border: 'none', background: 'transparent' }}>
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ev.color || T.accent }} />
                    <span className="text-xs sm:text-sm font-bold truncate" style={{ color: T.pri }}>{ev.title}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md" style={{ background: `${ev.color || T.accent}18`, color: ev.color || T.accent }}>Ganztag</span>
                    <ChevronDown size={14} style={{ color: T.mut, transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
                  </div>
                </button>
                {isExp && (
                  <div className="px-3.5 pb-3 pt-1 border-t" style={{ borderColor: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
                    <EventActions ev={ev} isActive={false} theme={theme} onDeleteEvent={onDeleteEvent} onEditEvent={onEditEvent} />
                  </div>
                )}
              </div>
            );
          })}

        </div>
      )}

      {clusters.map((cluster, cIdx) => {
        const gapLabel = cIdx === 0 ? null : formatFree(Math.round((cluster.clusterStart.getTime() - clusters[cIdx - 1].clusterEnd.getTime()) / 60_000));
        const pauseEl = gapLabel ? <FreeGap label={gapLabel} /> : null;
        const todosBefore = timedTodos.filter(t => todoSlot(t.start) === cIdx);
        const todoEls = todosBefore.map(t => <TimedTodoRow key={`tt-${t.id}`} ev={t} onTaskComplete={onTaskComplete} />);

        if (cluster.events.length === 1) {
          const ev = cluster.events[0];
          return (
            <React.Fragment key={ev.id}>
              {todoEls}
              {pauseEl}
              <TimelineEventItem
                ev={ev} now={now} isToday={isToday} isEven={(eventCounter++) % 2 === 0} nextUpcomingId={nextUpcomingId}
                theme={theme} isExpanded={expandedEventId === ev.id} onToggleExpand={() => setExpandedEventId(p => p === ev.id ? null : ev.id)}
                onDeleteEvent={onDeleteEvent} onEditEvent={onEditEvent} onTaskComplete={onTaskComplete}
              />
            </React.Fragment>
          );
        }

        // Überlappende Termine liegen übereinander, jeder Ebene um ein Stück nach rechts versetzt.
        // Nicht nebeneinander und nicht über die volle Breite.
        const lanes = packLanes(cluster.events, cluster.clusterStart);
        const placed = lanes.flatMap((laneItems, laneIdx) => laneItems.map((item) => ({ ...item, laneIdx })));
        const clusterH = placed.reduce((m, it) => Math.max(m, it.desiredTop + it.height), 0);
        const laneCount = lanes.length;
        const OFFSET = 14;
        return (
          <React.Fragment key={`cluster-${cluster.clusterStart.toISOString()}-${cIdx}`}>
            {todoEls}
            {pauseEl}
            <div className="relative w-full my-1" style={{ height: clusterH }}>
              {placed.map(({ event: ev, desiredTop, height, laneIdx }) => (
                <TimelineEventItem
                  key={ev.id} ev={ev} now={now} isToday={isToday} isEven={(eventCounter++) % 2 === 0} nextUpcomingId={nextUpcomingId}
                  theme={theme} isExpanded={expandedEventId === ev.id} onToggleExpand={() => setExpandedEventId(p => p === ev.id ? null : ev.id)}
                  onDeleteEvent={onDeleteEvent} onEditEvent={onEditEvent} onTaskComplete={onTaskComplete} isParallel
                  style={{
                    position: 'absolute',
                    top: desiredTop,
                    left: laneIdx * OFFSET,
                    width: `calc(100% - ${laneCount * OFFSET + 8}px)`,
                    minHeight: height,
                    zIndex: laneIdx + 1,
                  }}
                />
              ))}
            </div>
          </React.Fragment>
        );
      })}
      {timedTodos
        .filter(t => todoSlot(t.start) === clusters.length)
        .map(t => <TimedTodoRow key={`tt-${t.id}`} ev={t} onTaskComplete={onTaskComplete} />)}
    </div>
  );
});

export type DayItem =
  | { kind: 'day'; date: Date; events: any[]; allDayEvents: any[]; isToday: boolean }
  | { kind: 'empty-range'; startDate: Date; endDate: Date; count: number };

export function getGroupedDayViewItems(dayViewDays: Date[], events: any[], now: Date): DayItem[] {
  const items: DayItem[] = [];
  let emptyRun: Date[] = [];
  const flush = () => {
    if (!emptyRun.length) return;
    if (emptyRun.length === 1) items.push({ kind: 'day', date: emptyRun[0], events: [], allDayEvents: [], isToday: false });
    else items.push({ kind: 'empty-range', startDate: emptyRun[0], endDate: emptyRun[emptyRun.length - 1], count: emptyRun.length });
    emptyRun = [];
  };
  for (const day of dayViewDays) {
    const isToday = isSameDay(day, now);
    const same = (e: { start: string }) => { try { return isSameDay(new Date(e.start), day); } catch { return false; } };
    const allDayEvs = events.filter(e => e.allDay && same(e));
    const dEvs = events.filter(e => !e.allDay && same(e)).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    if (day.getDate() === 1 && emptyRun.length > 0) flush();
    if (isToday || allDayEvs.length > 0 || dEvs.length > 0) {
      flush();
      items.push({ kind: 'day', date: day, events: dEvs, allDayEvents: allDayEvs, isToday });
    } else emptyRun.push(day);
  }
  flush();
  return items;
}

export interface MobileAgendaTimelineProps {
  dayViewDays: Date[]; events: any[]; now: Date; theme: string;
  onNewEvent?: (date: Date) => void; onDeleteEvent?: (id: string) => void; onSelectEvent?: (ev: any) => void;
  onEditEvent?: (ev: any) => void; onTaskComplete?: (id: string, completed: boolean) => void;
  dayViewSentinelRef?: React.RefObject<HTMLDivElement | null>;
  onSelectDate?: (date: Date) => void;
  onTodayClick?: () => void;
}

export const MobileAgendaTimeline = React.memo(function MobileAgendaTimeline({
  dayViewDays, events, now, theme, onNewEvent, onDeleteEvent, onEditEvent, onTaskComplete, dayViewSentinelRef,
}: MobileAgendaTimelineProps) {
  const groupedDayViewItems = useMemo(() => getGroupedDayViewItems(dayViewDays, events, now), [dayViewDays, events, now]);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      <div className="flex-1 overflow-y-auto pb-4 px-4 pt-2">
        {groupedDayViewItems.map((item) => (
          <React.Fragment key={item.kind === 'day' ? item.date.toISOString() : `empty-${item.startDate.toISOString()}-${item.endDate.toISOString()}`}>
            {item.kind === 'empty-range' ? (
              <div className="my-3 px-3.5 py-2.5 rounded-lg flex items-center justify-between text-xs" style={{ background: theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', color: T.mut }}>
                <div className="flex items-center gap-2 min-w-0">
                  <CalendarIcon size={13} style={{ opacity: 0.6, flexShrink: 0 }} />
                  <span className="truncate">{format(item.startDate, 'EEE d. MMM', { locale: de })} – {format(item.endDate, 'EEE d. MMM', { locale: de })}</span>
                  <span className="font-semibold shrink-0" style={{ color: T.sec }}>· {item.count} Tage frei</span>
                </div>
              </div>
            ) : (
              <div id={`day-${format(item.date, 'yyyy-MM-dd')}`} className="mb-4">
                <div className="flex items-center gap-3 py-2.5">
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: item.isToday ? T.pri : T.sec, fontWeight: item.isToday ? 800 : 700 }}>
                    {format(item.date, 'EEEE d. MMMM', { locale: de })}
                  </span>
                  <div className="flex-1 h-px" style={{ background: T.brd }} />
                </div>
                <DbTimelineDay day={item.date} dayEvs={item.events} allDayEvs={item.allDayEvents} isToday={item.isToday} now={now} theme={theme} onNewEvent={onNewEvent} onDeleteEvent={onDeleteEvent} onEditEvent={onEditEvent} onTaskComplete={onTaskComplete} />
              </div>
            )}
          </React.Fragment>
        ))}
        {dayViewSentinelRef && <div ref={dayViewSentinelRef} style={{ height: 1 }} />}
      </div>

    </div>
  );
});

export default MobileAgendaTimeline;
