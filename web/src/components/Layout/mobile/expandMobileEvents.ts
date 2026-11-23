import { isSameDay } from 'date-fns';
import type { CalendarEvent as BaseCalendarEvent } from '@/components/Calendar/types';
import { getEventGroupIds } from '@/lib/calendarUtils';

export interface EventOverride {
  is_cancelled?: boolean;
  start?: string;
  end?: string;
}

export interface CalendarEvent extends BaseCalendarEvent {
  recurrence_end?: string;
  overrides?: Record<string, EventOverride>;
  parent_event_id?: string;
  linkedTaskId?: string;
}

export interface AllDaySpan {
  event: CalendarEvent;
  sc: number;
  ec: number;
}

function parseAnchorDate(activeDate: Date | string): Date {
  if (activeDate instanceof Date) {
    return Number.isNaN(activeDate.getTime()) ? new Date() : activeDate;
  }
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(activeDate.trim());
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  const parsed = new Date(activeDate);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function advanceRecurrenceDate(current: Date, freq: string, interval: number): boolean {
  if (freq === 'daily') { current.setDate(current.getDate() + interval); return true; }
  if (freq === 'weekly') { current.setDate(current.getDate() + interval * 7); return true; }
  if (freq === 'monthly') { current.setMonth(current.getMonth() + interval); return true; }
  if (freq === 'yearly') { current.setFullYear(current.getFullYear() + interval); return true; }
  return false;
}

export function expandMobileEvents(
  events: CalendarEvent[],
  activeDate: Date | string,
  themes?: Array<{ id: string; effect?: string }>
): CalendarEvent[] {
  const anchor = parseAnchorDate(activeDate);
  const minDate = new Date(anchor.getFullYear(), anchor.getMonth() - 2, 1);
  const maxDate = new Date(anchor.getFullYear(), anchor.getMonth() + 3, 1);
  const expanded: CalendarEvent[] = [];

  // The event's pattern comes from its group (theme), as on the desktop calendar.
  const themeEffectFor = (evt: CalendarEvent): string | undefined => {
    const gid = getEventGroupIds(evt)[0];
    const t = gid ? themes?.find((x) => x.id === gid) : undefined;
    return t?.effect || evt.effect;
  };

  const processEvent = (evt: CalendarEvent, initialStart: Date) => {
    let start = initialStart;
    const duration = new Date(evt.end).getTime() - new Date(evt.start).getTime();
    const end = new Date(start.getTime() + duration);
    const timeKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;

    // Cancelled repetitions (exdates) are not shown.
    if (evt.exdates?.includes(timeKey)) return;

    const dayOverrides = evt.overrides?.[timeKey];
    if (dayOverrides) {
      if (dayOverrides.is_cancelled) return;
      if (dayOverrides.start) start = new Date(dayOverrides.start);
      if (dayOverrides.end) end.setTime(new Date(dayOverrides.end).getTime());
    }

    expanded.push({
      ...evt,
      effect: themeEffectFor(evt),
      id: start.getTime() === new Date(evt.start).getTime() ? evt.id : `${evt.id}_${start.getTime()}`,
      start: start.toISOString(),
      end: end.toISOString(),
    });
  };

  for (const e of events) {
    const start = new Date(e.start);
    if (Number.isNaN(start.getTime())) continue;

    const rrule =
      e.recurrence_rule ||
      `FREQ=${e.recurrence && e.recurrence !== 'none' ? e.recurrence.toUpperCase() : 'NONE'};INTERVAL=1`;

    const matchFreq = rrule.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY|NONE)/i);
    const freq = matchFreq ? matchFreq[1].toLowerCase() : 'none';
    const matchInterval = rrule.match(/INTERVAL=(\d+)/i);
    const interval = Math.max(1, matchInterval ? Number.parseInt(matchInterval[1], 10) : 1);

    if (freq === 'none') {
      processEvent(e, start);
      continue;
    }

    const current = new Date(start);
    const recEndOrig = e.recurrence_end
      ? new Date(e.recurrence_end)
      : new Date(maxDate.getTime() + 31536000000);

    if (Number.isNaN(recEndOrig.getTime())) {
      processEvent(e, start);
      continue;
    }

    const safeRecEnd = recEndOrig < maxDate ? recEndOrig : maxDate;
    while (current < minDate && current < safeRecEnd) {
      if (!advanceRecurrenceDate(current, freq, interval)) break;
    }

    let count = 0;
    while (current < maxDate && current <= safeRecEnd && count < 1000) {
      processEvent(
        { ...e, parent_event_id: current.getTime() === start.getTime() ? undefined : e.id },
        new Date(current)
      );
      if (!advanceRecurrenceDate(current, freq, interval)) break;
      count++;
    }
  }

  return expanded;
}

export function computeWeekAllDayRows(
  expandedEvents: CalendarEvent[],
  weekDays: Date[]
): { rows: Array<Array<{ event: CalendarEvent; sc: number; ec: number }>>; hasMore: boolean } {
  if (weekDays.length === 0) {
    return { rows: [], hasMore: false };
  }

  const lastCol = weekDays.length - 1;
  const wStart = new Date(weekDays[0]);
  wStart.setHours(0, 0, 0, 0);
  const wEnd = new Date(weekDays[lastCol]);
  wEnd.setHours(23, 59, 59, 999);

  const allDayEventsForWeek = expandedEvents.filter((e) => {
    if (!e.allDay || e.is_task || e.linkedTaskId) return false;
    const s = new Date(e.start);
    const en = e.end ? new Date(e.end) : s;
    if (Number.isNaN(s.getTime()) || Number.isNaN(en.getTime())) return false;
    return s <= wEnd && en >= wStart;
  });

  const packedRows: AllDaySpan[][] = [];
  for (const ev of allDayEventsForWeek) {
    const s = new Date(ev.start);
    const en = ev.end ? new Date(ev.end) : s;
    let sc = weekDays.findIndex((d) => isSameDay(d, s));
    let ec = weekDays.findIndex((d) => isSameDay(d, en));
    if (sc < 0) sc = 0;
    if (ec < 0) ec = lastCol;
    ec = Math.max(sc, Math.min(lastCol, ec));

    let placed = false;
    for (const row of packedRows) {
      if (!row.some((r) => sc <= r.ec && ec >= r.sc)) {
        row.push({ event: ev, sc, ec });
        placed = true;
        break;
      }
    }
    if (!placed) packedRows.push([{ event: ev, sc, ec }]);
  }

  return { rows: packedRows, hasMore: false };
}
