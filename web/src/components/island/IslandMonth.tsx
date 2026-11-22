'use client';

import React from 'react';
import { addDays, endOfMonth, endOfWeek, isSameDay, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import { Plus } from 'lucide-react';
import { useWeekStartsOn } from '@/store/useDataStore';
import type { IslandModel } from './useIslandModel';
import { useIslandText } from './islandText';
import { paletteFor } from '@/components/Layout/mobile/eventPalette';

interface IslandMonthProps {
    model: IslandModel;
    /** Aktuell im Hauptkalender gewählter Tag (bestimmt den gezeigten Monat) */
    selectedDate?: Date;
    onSelectDate?: (d: Date) => void;
}

/** Ruhezustand: Monatsraster ohne Terminliste und ohne Punkte. Heute ist rot markiert, der gewählte Tag hat einen Ring. */
export default function IslandMonth({ model, selectedDate, onSelectDate }: IslandMonthProps) {
    const text = useIslandText();
    const weekStartsOn = useWeekStartsOn();
    const shown = selectedDate ?? model.now;

    const days = React.useMemo(() => {
        const first = startOfWeek(startOfMonth(shown), { weekStartsOn });
        const last = endOfWeek(endOfMonth(shown), { weekStartsOn });
        const out: Date[] = [];
        for (let d = first; d <= last; d = addDays(d, 1)) out.push(d);
        return out;
    }, [shown, weekStartsOn]);

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
            <div className="grid h-4 grid-cols-7 text-center text-[11px] font-semibold text-t2-ink-2">
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
                            className={`relative z-0 grid place-items-center text-[12px] ${
                                today ? 'font-bold text-white' : picked ? 'font-semibold text-t2-ink' : inMonth ? 'font-medium text-t2-ink' : 'text-t2-ink-3 opacity-60'
                            }`}
                        >
                            {today && <span className="absolute -z-10 h-6 w-6 rounded-full bg-t2-now shadow-sm" />}
                            {picked && <span className="absolute -z-10 h-6 w-6 rounded-full bg-t2-hover ring-[1.5px] ring-t2-ink-3" />}
                            {d.getDate()}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
