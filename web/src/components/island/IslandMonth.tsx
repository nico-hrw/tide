'use client';

import React, { useMemo } from 'react';
import { addDays, endOfMonth, endOfWeek, isSameDay, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import { Plus } from 'lucide-react';
import { useCalendarEvents, useWeekStartsOn } from '@/store/useDataStore';
import { getEventsForDate, type CalendarEvent } from '@/lib/calendarUtils';
import { dayKey } from './islandLogic';
import type { IslandModel } from './useIslandModel';
import { useIslandText } from './islandText';
import { paletteFor } from '@/components/Layout/mobile/eventPalette';

interface IslandMonthProps {
    model: IslandModel;
    /** Aktuell im Hauptkalender gewählter Tag (bestimmt den gezeigten Monat) */
    selectedDate?: Date;
    onSelectDate?: (d: Date) => void;
}

/** Ruhezustand: Monatsraster ohne Terminliste. Heute ist rot markiert, Tage mit Terminen haben einen Punkt. */
export default function IslandMonth({ model, selectedDate, onSelectDate }: IslandMonthProps) {
    const text = useIslandText();
    const weekStartsOn = useWeekStartsOn();
    const { events } = useCalendarEvents();
    const shown = selectedDate ?? model.now;

    const days = useMemo(() => {
        const first = startOfWeek(startOfMonth(shown), { weekStartsOn });
        const last = endOfWeek(endOfMonth(shown), { weekStartsOn });
        const out: Date[] = [];
        for (let d = first; d <= last; d = addDays(d, 1)) out.push(d);
        return out;
    }, [shown, weekStartsOn]);

    const withEvents = useMemo(() => {
        const raw = events as unknown as CalendarEvent[];
        const set = new Set<string>();
        for (const d of days) if (getEventsForDate(d, raw).length > 0) set.add(dayKey(d));
        return set;
    }, [days, events]);

    const heads = days.slice(0, 7);

    return (
        <div className="flex h-full flex-col px-3 pb-2.5 pt-3">
            <div className="mb-1 flex h-[22px] items-center justify-between">
                <b className="text-[14px] font-[650] capitalize tracking-[-0.01em]">{text.monthName(shown)}</b>
                <span className="ml-auto mr-1.5 flex items-center gap-1.5 text-[11px] font-medium text-t2-ink-2">
                    {model.running && (
                        <>
                            <span className="h-[6px] w-[6px] rounded-full" style={{ background: paletteFor(model.running.event.color).bg }} />
                            {model.running.countdown.minutes} {text.tr('minUnit')}
                        </>
                    )}
                </span>
                <button
                    type="button"
                    aria-label={text.tr('quickCapture')}
                    onClick={(e) => { e.stopPropagation(); model.openCapture(); }}
                    className="-mr-1 grid h-[22px] w-[22px] place-items-center rounded-full text-t2-ink-2 hover:bg-t2-hover hover:text-t2-ink"
                >
                    <Plus size={16} strokeWidth={1.8} />
                </button>
            </div>
            <div className="grid h-4 grid-cols-7 text-center text-[10px] font-semibold text-t2-ink-3">
                {heads.map((d) => (
                    <span key={d.getDay()}>{text.weekdayShort(d).charAt(0)}</span>
                ))}
            </div>
            <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 text-center">
                {days.map((d) => {
                    const today = isSameDay(d, model.now);
                    const inMonth = isSameMonth(d, shown);
                    const picked = !today && !!selectedDate && isSameDay(d, selectedDate);
                    return (
                        <button
                            key={d.toISOString()}
                            type="button"
                            tabIndex={-1}
                            onClick={(e) => { e.stopPropagation(); onSelectDate?.(d); }}
                            className={`relative z-0 grid place-items-center text-[11.5px] ${
                                today ? 'font-bold text-t2-bg' : inMonth ? 'text-t2-ink-2' : 'text-t2-ink-3 opacity-50'
                            }`}
                        >
                            {today && <span className="absolute -z-10 h-5 w-5 rounded-full bg-t2-now" />}
                            {picked && <span className="absolute -z-10 h-5 w-5 rounded-full bg-t2-hover" />}
                            {d.getDate()}
                            {!today && withEvents.has(dayKey(d)) && (
                                <span className="absolute bottom-px h-[3px] w-[3px] rounded-full bg-current opacity-50" />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
