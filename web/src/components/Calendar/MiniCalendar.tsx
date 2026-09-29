
import React, { useState, useRef } from 'react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isToday, isSameDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';

export interface MiniCalendarProps {
    selectedDate?: Date;
    onSelect?: (date: Date) => void;
    onMonthChange?: (date: Date) => void;
    events?: Array<{ start: string; color?: string; allDay?: boolean }>;
}

export default function MiniCalendar({ selectedDate, onSelect, onMonthChange, events }: MiniCalendarProps) {
    const [currentDateInternal, setCurrentDateInternal] = useState(new Date());
    const touchStartX = useRef<number | null>(null);
    const touchGridX = useRef<number | null>(null);
    const touchGridY = useRef<number | null>(null);

    const visibleCalendarRange = useDataStore(s => s.visibleCalendarRange);
    const activeNoteId = useDataStore(s => s.activeNoteId);
    const isInCalendar = activeNoteId === null;

    React.useEffect(() => {
        if (selectedDate && !isSameMonth(selectedDate, currentDateInternal)) {
            setCurrentDateInternal(selectedDate);
        }
    }, [selectedDate]);

    const displayDate = currentDateInternal;

    const nextMonth = () => {
        const next = addMonths(displayDate, 1);
        setCurrentDateInternal(next);
        onMonthChange?.(next);
    };
    const prevMonth = () => {
        const prev = subMonths(displayDate, 1);
        setCurrentDateInternal(prev);
        onMonthChange?.(prev);
    };

    const monthStart = startOfMonth(displayDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const dateFormat = "d";
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    const weekDays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

    return (
        <div
            className="p-3 py-2 bg-transparent select-none cursor-pointer"
            onClick={() => onSelect?.(new Date())}
            title="Zu Heute"
        >
            <div
                className="flex items-center justify-between mb-1.5 select-none"
                onWheel={(e) => {
                    e.stopPropagation();
                    if (e.deltaY > 0 || e.deltaX > 0) nextMonth();
                    else if (e.deltaY < 0 || e.deltaX < 0) prevMonth();
                }}
                onTouchStart={(e) => {
                    touchStartX.current = e.touches[0].clientX;
                }}
                onTouchEnd={(e) => {
                    if (touchStartX.current === null) return;
                    const dx = e.changedTouches[0].clientX - touchStartX.current;
                    touchStartX.current = null;
                    if (dx < -30) nextMonth();
                    else if (dx > 30) prevMonth();
                }}
            >
                <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 cursor-ew-resize py-0.5" title="Wischen oder Scrollen zum Wechseln">
                    {format(displayDate, "MMMM yyyy", { locale: de })}
                </span>
                <div className="flex gap-1">
                    <button
                        onClick={(e) => { e.stopPropagation(); prevMonth(); }}
                        className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors"
                        title="Vorheriger Monat"
                    >
                        <ChevronLeft size={12} className="text-gray-500 dark:text-slate-400" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); nextMonth(); }}
                        className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors"
                        title="Nächster Monat"
                    >
                        <ChevronRight size={12} className="text-gray-500 dark:text-slate-400" />
                    </button>
                </div>
            </div>

            {/* Subtle divider line */}
            <div className="h-px bg-black/[0.06] dark:bg-white/[0.08] mb-2" />

            <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
                {weekDays.map(day => (
                    <div key={day} className="text-[9px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-[0.5px]">
                        {day}
                    </div>
                ))}
            </div>

            <div
                className="grid grid-cols-7 gap-0.5 text-center"
                onTouchStart={(e) => {
                    touchGridX.current = e.touches[0].clientX;
                    touchGridY.current = e.touches[0].clientY;
                }}
                onTouchEnd={(e) => {
                    if (touchGridX.current === null || touchGridY.current === null) return;
                    const dx = e.changedTouches[0].clientX - touchGridX.current;
                    const dy = Math.abs(e.changedTouches[0].clientY - touchGridY.current);
                    touchGridX.current = null;
                    touchGridY.current = null;
                    if (Math.abs(dx) > 35 && dy < 35) {
                        if (dx < 0) nextMonth();
                        else prevMonth();
                    }
                }}
            >
                {days.map((day) => {
                    const dayIso = format(day, "yyyy-MM-dd");
                    const isCurrentMonth = isSameMonth(day, monthStart);
                    const isDayToday = isToday(day);
                    const isSelectedDay = selectedDate ? isSameDay(day, selectedDate) : false;

                    const dayEvents = (events || []).filter(e => {
                        try { return e.start.startsWith(dayIso); } catch { return false; }
                    });
                    const hasEvents = dayEvents.length > 0;

                    const isVisibleInGrid = isInCalendar && visibleCalendarRange
                        ? (dayIso >= visibleCalendarRange.start && dayIso <= visibleCalendarRange.end)
                        : false;

                    let className = "text-[11px] w-7 h-7 flex flex-col items-center justify-center cursor-pointer transition-all relative mx-auto";

                    if (!isCurrentMonth) {
                        className += " text-neutral-400 dark:text-neutral-500 font-medium rounded-full hover:bg-black/5 dark:hover:bg-white/10";
                    } else if (isDayToday) {
                        className += " bg-blue-600 text-white font-bold rounded-full shadow-xs";
                    } else if (isSelectedDay) {
                        className += " bg-blue-500/20 text-blue-600 dark:text-blue-400 font-bold rounded-full ring-1.5 ring-blue-500/50";
                    } else if (isVisibleInGrid) {
                        className += " bg-purple-500/15 dark:bg-purple-400/20 text-neutral-800 dark:text-neutral-100 font-medium rounded-md hover:bg-purple-500/25 dark:hover:bg-purple-400/30";
                    } else {
                        className += " text-neutral-800 dark:text-neutral-200 font-medium rounded-full hover:bg-black/5 dark:hover:bg-white/10";
                    }

                    return (
                        <div
                            key={day.toISOString()}
                            onClick={(e) => { e.stopPropagation(); onSelect?.(day); }}
                            className={className}
                        >
                            <span className={hasEvents ? "leading-none -mt-0.5" : "leading-none"}>
                                {format(day, dateFormat)}
                            </span>
                            {hasEvents && (
                                <div className="flex items-center justify-center gap-0.5 mt-0.5">
                                    {dayEvents.slice(0, 3).map((ev, i) => (
                                        <span
                                            key={i}
                                            className="w-1 h-1 rounded-full shrink-0"
                                            style={{
                                                background: isDayToday
                                                    ? '#ffffff'
                                                    : (ev.color || '#3B82F6')
                                            }}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
