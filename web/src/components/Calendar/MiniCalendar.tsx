
import React, { useState } from 'react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isToday } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';

export default function MiniCalendar({ selectedDate, onSelect }: { selectedDate?: Date, onSelect?: (date: Date) => void }) {
    const [currentDateInternal, setCurrentDateInternal] = useState(new Date());

    const visibleCalendarRange = useDataStore(s => s.visibleCalendarRange);
    const activeNoteId = useDataStore(s => s.activeNoteId);
    const isInCalendar = activeNoteId === null;

    React.useEffect(() => {
        if (selectedDate && !isSameMonth(selectedDate, currentDateInternal)) {
            setCurrentDateInternal(selectedDate);
        }
    }, [selectedDate]);

    const displayDate = currentDateInternal;

    const nextMonth = () => setCurrentDateInternal(addMonths(displayDate, 1));
    const prevMonth = () => setCurrentDateInternal(subMonths(displayDate, 1));

    const monthStart = startOfMonth(displayDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const dateFormat = "d";
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    const weekDays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

    return (
        <div
            className="p-3 py-2 bg-transparent select-none cursor-pointer"
            onClick={() => onSelect?.(new Date())}
            title="Go to today"
        >
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-100">
                    {format(displayDate, "MMMM yyyy")}
                </span>
                <div className="flex gap-1">
                    <button
                        onClick={(e) => { e.stopPropagation(); prevMonth(); }}
                        className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors"
                    >
                        <ChevronLeft size={12} className="text-gray-500 dark:text-slate-400" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); nextMonth(); }}
                        className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors"
                    >
                        <ChevronRight size={12} className="text-gray-500 dark:text-slate-400" />
                    </button>
                </div>
            </div>

            {/* Subtle divider line */}
            <div className="h-px bg-black/[0.06] dark:bg-white/[0.08] mb-2" />

            <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
                {weekDays.map(day => (
                    <div key={day} className="text-[9px] font-semibold text-gray-800 dark:text-gray-100 uppercase tracking-[0.5px]">
                        {day}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5 text-center">
                {days.map((day) => {
                    const dayIso = format(day, "yyyy-MM-dd");
                    const isCurrentMonth = isSameMonth(day, monthStart);
                    const isDayToday = isToday(day);

                    const isVisibleInGrid = isInCalendar && visibleCalendarRange
                        ? (dayIso >= visibleCalendarRange.start && dayIso <= visibleCalendarRange.end)
                        : false;

                    let className = "text-[11px] w-6 h-6 flex items-center justify-center cursor-pointer transition-all relative";

                    if (!isCurrentMonth) {
                        className += " text-gray-400 dark:text-gray-500 font-medium rounded-full hover:bg-black/5 dark:hover:bg-white/10";
                    } else if (isDayToday) {
                        className += " bg-red-500 text-white font-bold rounded-full shadow-xs";
                    } else if (isVisibleInGrid) {
                        className += " bg-purple-500/10 dark:bg-purple-400/15 text-gray-800 dark:text-gray-100 font-medium rounded-md hover:bg-purple-500/20 dark:hover:bg-purple-400/25";
                    } else {
                        className += " text-gray-800 dark:text-gray-100 font-medium rounded-full hover:bg-black/5 dark:hover:bg-white/10";
                    }

                    return (
                        <div
                            key={day.toISOString()}
                            onClick={(e) => { e.stopPropagation(); onSelect?.(day); }}
                            className={className}
                        >
                            {format(day, dateFormat)}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
