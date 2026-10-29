import React, { useState, useMemo } from 'react';
import { format, isSameDay } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  Calendar as CalendarIcon, Clock, ChevronDown, MapPin, PenLine, Trash2, Coffee, RotateCcw, Plus,
} from 'lucide-react';

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

function getCardStyle(isActive: boolean, isEven: boolean, theme: string, extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: isActive ? (theme === 'dark' ? '#09090b' : '#18181b') : isEven ? (theme === 'dark' ? 'rgba(255,255,255,0.05)' : '#f4f4f5') : (theme === 'dark' ? 'rgba(255,255,255,0.095)' : '#e4e4e7'),
    transform: isActive ? 'scale(1.025)' : 'scale(1)', zIndex: isActive ? 10 : 1, border: 'none',
    boxShadow: isActive ? (theme === 'dark' ? '0 10px 28px -4px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.15)' : '0 12px 28px -6px rgba(0,0,0,0.35)') : 'none',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease', ...extra,
  };
}

function EventActions({ ev, isActive, theme, onDeleteEvent, compact }: { ev: any; isActive: boolean; theme: string; onDeleteEvent?: (id: string) => void; compact?: boolean }) {
  return (
    <>
      {ev.location && (
        <div className={`flex items-center gap-1.5 text-xs font-medium ${compact ? 'mb-1.5' : 'mb-2'}`} style={{ color: isActive ? 'rgba(255,255,255,0.9)' : T.sec }}>
          <MapPin size={compact ? 12 : 13} className="shrink-0" /><span className="truncate">{ev.location}</span>
        </div>
      )}
      {ev.description && (
        <p className={`text-xs whitespace-pre-wrap leading-relaxed ${compact ? 'mb-2.5' : 'mb-3'}`} style={{ color: isActive ? 'rgba(255,255,255,0.85)' : T.sec }}>{ev.description}</p>
      )}
      <div className="flex items-center gap-1.5 pt-1">
        <button
          onClick={e => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('mobile_edit_event', { detail: { id: ev.id } })); }}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-semibold active:scale-95 transition-transform ${compact ? 'text-[11px]' : 'text-xs'}`}
          style={{ background: isActive ? 'rgba(255, 255, 255, 0.2)' : theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)', color: isActive ? '#ffffff' : T.pri }}
        >
          <PenLine size={compact ? 11 : 12} /> Bearbeiten
        </button>
        {onDeleteEvent && (
          <button
            onClick={e => { e.stopPropagation(); onDeleteEvent(ev.id); }}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-semibold active:scale-95 transition-transform ${compact ? 'text-[11px]' : 'text-xs'}`}
            style={{ background: 'rgba(239, 68, 68, 0.14)', color: '#ef4444' }}
          >
            <Trash2 size={compact ? 11 : 12} /> Löschen
          </button>
        )}
      </div>
    </>
  );
}

function StatusBadges({ isActive, isNext, remStr, evEnd, evStart, startStr, durStr, theme }: any) {
  if (isActive) {
    return (
      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0" style={{ background: 'rgba(16, 185, 129, 0.22)', color: '#34d399' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Noch {remStr} · bis {format(evEnd, 'HH:mm')} Uhr
        </span>
        <span className="text-[10px] font-medium opacity-75 ml-auto shrink-0" style={{ color: '#ffffff' }}>{durStr}</span>
      </div>
    );
  }
  if (isNext) {
    return (
      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0"
          style={{ background: 'linear-gradient(135deg, rgba(147, 51, 234, 0.18), rgba(168, 85, 247, 0.25))', color: theme === 'dark' ? '#d8b4fe' : '#7e22ce', border: '1px solid rgba(168, 85, 247, 0.3)' }}
        >
          <Clock size={11} /> Startet um {format(evStart, 'HH:mm')} Uhr (in {startStr})
        </span>
        <span className="text-[10px] font-medium opacity-75 ml-auto shrink-0" style={{ color: T.mut }}>{durStr}</span>
      </div>
    );
  }
  return null;
}

function TimelineEventItem({
  ev, now, isToday, isEven, nextUpcomingId, theme, isExpanded, onToggleExpand, onDeleteEvent, isParallel = false, style,
}: {
  ev: any; now: Date; isToday: boolean; isEven: boolean; nextUpcomingId: string | null; theme: string;
  isExpanded: boolean; onToggleExpand: () => void; onDeleteEvent?: (id: string) => void; isParallel?: boolean; style?: React.CSSProperties;
}) {
  const info = getEvInfo(ev, now, isToday, nextUpcomingId);
  const pHeight = Math.max(54, Math.min(180, 44 + info.durM * 0.6));

  if (isParallel) {
    return (
      <div id={`ev-${ev.id}`} className="w-full flex flex-col text-left rounded-[14px] transition-all relative overflow-hidden" style={getCardStyle(info.isActive, isEven, theme, style)}>
        <button onClick={onToggleExpand} className="w-full flex flex-col text-left p-3 cursor-pointer" style={{ border: 'none', background: 'transparent' }}>
          <div className="flex items-center justify-between gap-1 mb-1.5 w-full">
            <span className="text-[11px] font-bold" style={{ color: info.isActive ? '#ffffff' : T.pri }}>
              {format(info.evStart, 'HH:mm')} – {format(info.evEnd, 'HH:mm')}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-medium shrink-0 px-1.5 py-0.5 rounded-md" style={{ background: info.isActive ? 'rgba(255, 255, 255, 0.18)' : theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', color: info.isActive ? '#ffffff' : T.mut }}>{info.durStr}</span>
              <ChevronDown size={12} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', color: info.isActive ? '#ffffff' : T.mut, transition: 'transform 0.2s ease' }} />
            </div>
          </div>
          <div className="flex items-start gap-1.5 min-w-0 w-full mb-1">
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 ${info.isActive ? 'animate-pulse' : ''}`} style={{ background: info.color }} />
            <span className="text-xs sm:text-sm font-bold line-clamp-2 flex-1 leading-snug" style={{ color: info.isActive ? '#ffffff' : T.pri }}>{ev.title}</span>
          </div>
          <StatusBadges {...info} theme={theme} />
          {!isExpanded && ev.description && (
            <p className="text-[11px] mt-0.5 line-clamp-1 leading-relaxed" style={{ color: info.isActive ? 'rgba(255,255,255,0.85)' : T.sec }}>{ev.description}</p>
          )}
        </button>
        {isExpanded && (
          <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: info.isActive ? 'rgba(255, 255, 255, 0.15)' : theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)' }}>
            <EventActions ev={ev} isActive={info.isActive} theme={theme} onDeleteEvent={onDeleteEvent} compact />
          </div>
        )}
      </div>
    );
  }

  return (
    <div id={`ev-${ev.id}`} className="w-full rounded-xl my-1 relative transition-all overflow-hidden" style={getCardStyle(info.isActive, isEven, theme, { minHeight: pHeight, ...style })}>
      <button onClick={onToggleExpand} className="w-full flex text-left p-0 transition-all cursor-pointer items-stretch" style={{ border: 'none', background: 'transparent', minHeight: isExpanded ? undefined : pHeight }}>
        <div className="w-[58px] shrink-0 flex flex-col items-end pr-2 pt-3.5">
          <span className={`font-bold leading-none ${info.isActive ? 'text-[13px]' : 'text-[12px]'}`} style={{ color: info.isActive ? '#ffffff' : T.pri }}>{format(info.evStart, 'HH:mm')}</span>
          <span className="text-[10px] font-medium mt-1" style={{ color: info.isActive ? 'rgba(255,255,255,0.75)' : T.mut }}>{format(info.evEnd, 'HH:mm')}</span>
        </div>
        <div className="w-[24px] shrink-0 flex flex-col items-center pt-3.5 pb-2.5 self-stretch">
          <div className={`w-3 h-3 rounded-full shrink-0 ${info.isActive ? 'animate-pulse' : ''}`} style={{ background: info.color }} />
          <div className="w-[2px] flex-1 mt-1.5 mb-1 rounded-full" style={{ minHeight: Math.max(16, pHeight - 48), background: info.isActive ? '#ffffff' : theme === 'dark' ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)' }} />
        </div>
        <div className="flex-1 py-3 pr-3 min-w-0 flex flex-col justify-start">
          <div className="flex items-center justify-between gap-1.5 w-full">
            <span className={`font-bold truncate flex-1 min-w-0 ${info.isActive ? 'text-sm' : 'text-[13px]'}`} style={{ color: info.isActive ? '#ffffff' : T.pri }}>{ev.title}</span>
            <div className="flex items-center gap-1.5 shrink-0 ml-1">
              {!info.isActive && !info.isNext && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md" style={{ background: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', color: T.mut }}>{info.durStr}</span>
              )}
              <ChevronDown size={14} className="transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', color: info.isActive ? '#ffffff' : T.mut }} />
            </div>
          </div>
          <StatusBadges {...info} theme={theme} />
          {!isExpanded && ev.description && (
            <p className="text-xs mt-1.5 line-clamp-1 leading-relaxed" style={{ color: info.isActive ? 'rgba(255,255,255,0.85)' : T.sec }}>{ev.description}</p>
          )}
        </div>
      </button>
      {isExpanded && (
        <div className="px-4 pb-3.5 pt-2 border-t ml-[82px] mr-3" style={{ borderColor: info.isActive ? 'rgba(255, 255, 255, 0.15)' : theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)' }}>
          <EventActions ev={ev} isActive={info.isActive} theme={theme} onDeleteEvent={onDeleteEvent} />
        </div>
      )}
    </div>
  );
}

export interface DbTimelineDayProps {
  day: Date; dayEvs: any[]; allDayEvs: any[]; isToday: boolean; now: Date;
  theme: string; onSelectEvent?: (ev: any) => void; onNewEvent?: (date: Date) => void; onDeleteEvent?: (id: string) => void;
}

export const DbTimelineDay = React.memo(function DbTimelineDay({
  day, dayEvs, allDayEvs, isToday, now, theme, onNewEvent, onDeleteEvent,
}: DbTimelineDayProps) {
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const nextUpcomingId = useMemo(() => {
    if (!isToday) return null;
    const upcoming = dayEvs
      .filter(e => { try { return new Date(e.start) > now; } catch { return false; } })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    return upcoming.length > 0 ? upcoming[0].id : null;
  }, [dayEvs, isToday, now]);

  const clusters = useMemo(() => {
    const list: { events: any[]; clusterStart: Date; clusterEnd: Date }[] = [];
    for (const ev of dayEvs) {
      const s = new Date(ev.start), e = ev.end ? new Date(ev.end) : new Date(s.getTime() + 3600000);
      const last = list[list.length - 1];
      if (last && s.getTime() < last.clusterEnd.getTime() - 60000) {
        last.events.push(ev);
        if (e.getTime() > last.clusterEnd.getTime()) last.clusterEnd = e;
      } else { list.push({ events: [ev], clusterStart: s, clusterEnd: e }); }
    }
    return list;
  }, [dayEvs]);

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

  let eventCounter = 0;

  return (
    <div className="flex flex-col py-1">
      {allDayEvs.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-2.5 w-full">
          {allDayEvs.map(ev => {
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
                    <EventActions ev={ev} isActive={false} theme={theme} onDeleteEvent={onDeleteEvent} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {clusters.map((cluster, cIdx) => {
        const pauseEl = (() => {
          if (cIdx === 0) return null;
          const gapMins = Math.round((cluster.clusterStart.getTime() - clusters[cIdx - 1].clusterEnd.getTime()) / 60_000);
          if (gapMins <= 0) return null;
          const gapStr = gapMins >= 60 ? `${Math.floor(gapMins / 60)} Std. ${gapMins % 60 > 0 ? `${gapMins % 60} Min.` : ''}`.trim() : `${gapMins} Min.`;
          const gapH = Math.min(64, Math.max(30, Math.round(22 + Math.sqrt(gapMins) * 3.2)));
          return (
            <div className="w-full flex items-center my-1.5" style={{ minHeight: gapH }}>
              <div className="w-[58px] shrink-0" />
              <div className="w-[24px] shrink-0 flex items-center justify-center">
                <div className="w-0 border-l-[1.5px] border-dashed" style={{ height: Math.max(16, gapH - 12), borderColor: theme === 'dark' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)' }} />
              </div>
              <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl my-0.5 border border-dashed" style={{ background: theme === 'dark' ? 'rgba(255, 255, 255, 0.025)' : 'rgba(0, 0, 0, 0.02)', borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.08)' }}>
                <Coffee size={13} style={{ color: T.mut, flexShrink: 0 }} />
                <span className="text-[11px] font-semibold truncate" style={{ color: T.sec }}>Pause · {gapStr}</span>
                <span className="text-[10px] ml-auto shrink-0 font-medium" style={{ color: T.mut }}>bis {format(cluster.clusterStart, 'HH:mm')}</span>
              </div>
            </div>
          );
        })();

        if (cluster.events.length === 1) {
          const ev = cluster.events[0];
          return (
            <React.Fragment key={ev.id}>
              {pauseEl}
              <TimelineEventItem
                ev={ev} now={now} isToday={isToday} isEven={(eventCounter++) % 2 === 0} nextUpcomingId={nextUpcomingId}
                theme={theme} isExpanded={expandedEventId === ev.id} onToggleExpand={() => setExpandedEventId(p => p === ev.id ? null : ev.id)}
                onDeleteEvent={onDeleteEvent}
              />
            </React.Fragment>
          );
        }

        const lanes = packLanes(cluster.events, cluster.clusterStart);
        return (
          <React.Fragment key={`cluster-${cluster.clusterStart.toISOString()}-${cIdx}`}>
            {pauseEl}
            <div className="w-full flex gap-2 my-1 items-start overflow-x-auto no-scrollbar">
              {lanes.map((laneItems, laneIdx) => {
                let laneCursor = 0;
                return (
                  <div key={laneIdx} className={`flex-1 ${lanes.length > 2 ? 'min-w-[140px]' : 'min-w-0'} flex flex-col`}>
                    {laneItems.map(({ event: ev, desiredTop, height }) => {
                      const marginTop = Math.max(0, desiredTop - laneCursor);
                      laneCursor = desiredTop + height + 6;
                      return (
                        <TimelineEventItem
                          key={ev.id} ev={ev} now={now} isToday={isToday} isEven={(eventCounter++) % 2 === 0} nextUpcomingId={nextUpcomingId}
                          theme={theme} isExpanded={expandedEventId === ev.id} onToggleExpand={() => setExpandedEventId(p => p === ev.id ? null : ev.id)}
                          onDeleteEvent={onDeleteEvent} isParallel style={{ marginTop, minHeight: height }}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </React.Fragment>
        );
      })}
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
  dayViewSentinelRef?: React.RefObject<HTMLDivElement | null>;
}

export const MobileAgendaTimeline = React.memo(function MobileAgendaTimeline({
  dayViewDays, events, now, theme, onNewEvent, onDeleteEvent, dayViewSentinelRef,
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
                  {item.isToday && (
                    <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full shrink-0 text-white shadow-sm" style={{ background: 'linear-gradient(135deg, #4c1d95 0%, #7e22ce 50%, #9333ea 100%)', boxShadow: '0 2px 8px rgba(126, 34, 206, 0.35)' }}>Heute</span>
                  )}
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: item.isToday ? (theme === 'dark' ? '#d8b4fe' : '#7e22ce') : T.sec, fontWeight: item.isToday ? 900 : 700, textShadow: item.isToday ? (theme === 'dark' ? '0 0 10px rgba(168, 85, 247, 0.4)' : 'none') : 'none' }}>
                    {format(item.date, 'EEEE d. MMMM', { locale: de })}
                  </span>
                  <div className="flex-1 h-px" style={{ background: item.isToday ? 'linear-gradient(90deg, rgba(168, 85, 247, 0.5), transparent)' : T.brd }} />
                </div>
                <DbTimelineDay day={item.date} dayEvs={item.events} allDayEvs={item.allDayEvents} isToday={item.isToday} now={now} theme={theme} onNewEvent={onNewEvent} onDeleteEvent={onDeleteEvent} />
              </div>
            )}
          </React.Fragment>
        ))}
        {dayViewSentinelRef && <div ref={dayViewSentinelRef} style={{ height: 1 }} />}
      </div>

      <button
        onClick={() => { const el = document.getElementById(`day-${format(now, 'yyyy-MM-dd')}`); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
        className="absolute bottom-4 right-4 z-30 flex items-center gap-1.5 px-3.5 py-2 rounded-full shadow-lg active:scale-95 transition-all text-white"
        style={{
          background: 'linear-gradient(135deg, #4c1d95 0%, #7e22ce 50%, #9333ea 100%)',
          boxShadow: '0 4px 14px -2px rgba(126, 34, 206, 0.5), inset 0 1px 1px 0 rgba(255, 255, 255, 0.35)',
          border: '1px solid rgba(216, 180, 254, 0.35)',
        }}
        title="Zum heutigen Tag springen"
      >
        <RotateCcw size={13} />
        <span className="text-xs font-bold">Heute</span>
      </button>
    </div>
  );
});

export default MobileAgendaTimeline;
