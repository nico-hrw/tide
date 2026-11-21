import { useMemo, useRef } from "react";
import { format, addDays, startOfDay } from "date-fns";
import { getEventGroupIds } from "../../lib/calendarUtils";
import type { CalendarEvent, CalendarViewProps } from "./types";

type DayCache = Map<string, { sig: string; events: CalendarEvent[] }>;

/**
 * Swaps each day's array for the previously returned one when its content is unchanged, so
 * memoised DayColumns skip re-rendering. The signature is the full serialised occurrence, which
 * covers every field the event element can render. Entries not present in `map` are dropped,
 * which keeps the cache bounded by the current range.
 */
function stabiliseDays(map: Map<string, CalendarEvent[]>, prefix: string, cache: DayCache, seen: Set<string>) {
    map.forEach((events, dayKey) => {
        const cacheKey = prefix + dayKey;
        const sig = events.map(e => JSON.stringify(e)).join('|');
        const hit = cache.get(cacheKey);
        seen.add(cacheKey);
        if (hit && hit.sig === sig) {
            map.set(dayKey, hit.events);
        } else {
            cache.set(cacheKey, { sig, events });
        }
    });
}

/** Expands recurrences and buckets events per day (timed vs all-day) within `range` (end exclusive). */
export function useEventsByDay(
    events: CalendarEvent[],
    range: { start: Date; end: Date },
    themes: CalendarViewProps["themes"],
) {
    const rangeStartTime = range.start.getTime();
    const rangeEndTime = range.end.getTime();
    const dayCacheRef = useRef<DayCache>(new Map());
    const eventsByDay = useMemo(() => {
        const timedMap = new Map<string, CalendarEvent[]>();
        const allDayMap = new Map<string, CalendarEvent[]>();

        if (!(rangeEndTime > rangeStartTime)) return { timedMap, allDayMap };
        const minDate = startOfDay(new Date(rangeStartTime));
        const maxDate = startOfDay(new Date(rangeEndTime));

        const processEvent = (e: CalendarEvent, occurrenceStart: Date) => {
            if (isNaN(occurrenceStart.getTime())) {
                console.warn(`[CALENDAR-DRV] Invalid occurrenceStart for event ${e.id}`);
                return;
            }
            const startNode = new Date(e.start);
            const endNodeOrig = new Date(e.end);

            if (isNaN(startNode.getTime()) || isNaN(endNodeOrig.getTime())) {
                console.warn(`[CALENDAR-DRV] Skipping event ${e.id} due to invalid dates:`, { start: e.start, end: e.end });
                return;
            }

            const duration = endNodeOrig.getTime() - startNode.getTime();
            const occurrenceEnd = new Date(occurrenceStart.getTime() + duration);

            if (isNaN(occurrenceEnd.getTime())) {
                console.warn(`[CALENDAR-DRV] Invalid occurrenceEnd for event ${e.id}`);
                return;
            }

            const occDateKey = format(occurrenceStart, "yyyy-MM-dd");

            // [TASK 2] Cancel Check: Option B - Mark as cancelled
            // [TASK 2] Cancel Check
            const isCancelled = (Array.isArray(e.exdates) && e.exdates.includes(occDateKey)) || !!e.is_cancelled;

            // Inherit effect from theme if present
            const primaryGroupId = getEventGroupIds(e)[0];
            let inheritedEffect = e.effect;
            if (primaryGroupId && themes) {
                const themeNode = themes.find(t => t.id === primaryGroupId);
                if (themeNode && themeNode.effect) {
                    inheritedEffect = themeNode.effect;
                }
            }

            // [TASK 2] Completion Check: Override if in completed_dates
            const isCompleted = e.completed_dates?.includes(occDateKey) || !!e.is_completed;

            const processedEvent = {
                ...e,
                start: occurrenceStart.toISOString(),
                end: occurrenceEnd.toISOString(),
                effect: inheritedEffect,
                is_cancelled: isCancelled,
                is_completed: isCompleted
            };

            if (e.allDay) {
                let current = startOfDay(occurrenceStart);
                const endNode = startOfDay(occurrenceEnd);
                while (current <= endNode) {
                    const key = format(current, "yyyy-MM-dd");
                    if (!allDayMap.has(key)) allDayMap.set(key, []);
                    allDayMap.get(key)!.push(processedEvent);
                    current = addDays(current, 1);
                }
            } else {
                let current = startOfDay(occurrenceStart);
                // Use strictly < for endNode so events ending at exactly midnight (00:00 of next day)
                // are NOT added to the following day's column.
                const endsAtExactMidnight = occurrenceEnd.getHours() === 0 && occurrenceEnd.getMinutes() === 0 && occurrenceEnd.getSeconds() === 0 && occurrenceEnd.getMilliseconds() === 0;
                const endNode = endsAtExactMidnight
                    ? startOfDay(addDays(occurrenceEnd, -1)) // cap at the day before midnight
                    : startOfDay(occurrenceEnd);
                let safety = 0;
                while (current <= endNode && safety < 100) {
                    const key = format(current, "yyyy-MM-dd");
                    if (!timedMap.has(key)) timedMap.set(key, []);
                    timedMap.get(key)!.push(processedEvent);
                    current = addDays(current, 1);
                    safety++;
                }
            }
        };

        events.forEach(e => {
            const start = new Date(e.start);
            if (isNaN(start.getTime())) {
                console.warn(`[CALENDAR-DRV] Base start date invalid for event ${e.id}:`, e.start);
                return;
            }

            const rule = (e as any).recurrence_rule;
            const rrule = rule || `FREQ=${(e.recurrence && e.recurrence !== 'none') ? e.recurrence.toUpperCase() : 'NONE'};INTERVAL=1`;

            let freq = 'none';
            let interval = 1;
            const matchFreq = rrule.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY|NONE)/i);
            if (matchFreq) freq = matchFreq[1].toLowerCase();
            const matchInterval = rrule.match(/INTERVAL=(\d+)/i);
            if (matchInterval) interval = parseInt(matchInterval[1], 10);
            interval = Math.max(1, interval);

            if (freq === 'none') {
                processEvent(e, start);
            } else {
                let current = new Date(start);
                const recEndOrig = (e as any).recurrence_end ? new Date((e as any).recurrence_end) : new Date(maxDate.getTime() + 31536000000);
                if (isNaN(recEndOrig.getTime())) {
                    processEvent(e, start); // Fallback to single occurrence
                    return;
                }
                const safeRecEnd = recEndOrig < maxDate ? recEndOrig : maxDate;

                while (current < minDate && current < safeRecEnd) {
                    if (freq === 'daily') current.setDate(current.getDate() + interval);
                    else if (freq === 'weekly') current.setDate(current.getDate() + (interval * 7));
                    else if (freq === 'monthly') current.setMonth(current.getMonth() + interval);
                    else if (freq === 'yearly') current.setFullYear(current.getFullYear() + interval);
                    else break;
                }

                let count = 0;
                while (current < maxDate && current <= safeRecEnd && count < 1000) {
                    processEvent({
                        ...e,
                        id: current.getTime() === start.getTime() ? e.id : `${e.id}_${current.getTime()}`,
                        parent_event_id: current.getTime() === start.getTime() ? undefined : e.id
                    } as any, new Date(current));
                    if (freq === 'daily') current.setDate(current.getDate() + interval);
                    else if (freq === 'weekly') current.setDate(current.getDate() + (interval * 7));
                    else if (freq === 'monthly') current.setMonth(current.getMonth() + interval);
                    else if (freq === 'yearly') current.setFullYear(current.getFullYear() + interval);
                    else break;
                    count++;
                }
            }
        });

        const cache = dayCacheRef.current;
        const seen = new Set<string>();
        stabiliseDays(timedMap, 't:', cache, seen);
        stabiliseDays(allDayMap, 'a:', cache, seen);
        cache.forEach((_, k) => { if (!seen.has(k)) cache.delete(k); });
        return { timedMap, allDayMap };
    }, [events, rangeStartTime, rangeEndTime]);
    return eventsByDay;
}
