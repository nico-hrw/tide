
import React, { useState } from 'react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isSameDay, isToday } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';

export default function MiniCalendar({ selectedDate, onSelect }: { selectedDate?: Date, onSelect?: (date: Date) => void }) {
    const [currentDateInternal, setCurrentDateInternal] = useState(new Date());

    const activeDate = selectedDate || new Date();
    const visibleCalendarRange = useDataStore(s => s.visibleCalendarRange);

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
            className="p-3 py-2.5 bg-transparent select-none cursor-pointer"
            onClick={() => onSelect?.(new Date())}
            title="Go to today"
        >
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
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

            <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
                {weekDays.map(day => (
                    <div key={day} className="text-[9px] font-medium text-[var(--text-subtle)] uppercase tracking-[0.5px]">
                        {day}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5 text-center">
                {days.map((day, i) => {
                    const dayIso = format(day, "yyyy-MM-dd");
                    const isSelected = isSameDay(day, activeDate);
                    const isCurrentMonth = isSameMonth(day, monthStart);
                    const isDayToday = isToday(day);

                    const isVisibleInGrid = visibleCalendarRange
                        ? (dayIso >= visibleCalendarRange.start && dayIso <= visibleCalendarRange.end)
                        : false;

                    let className = "text-[11px] w-6 h-6 flex items-center justify-center rounded-full cursor-pointer transition-all relative";

                    if (!isCurrentMonth) {
                        className += " text-zinc-400 dark:text-zinc-500 font-medium";
                    } else if (isDayToday) {
                        className = "text-[11px] w-6 h-6 flex items-center justify-center rounded-full cursor-pointer transition-all bg-red-500 text-white font-bold shadow-xs";
                    } else if (isSelected) {
                        className = "text-[11px] w-6 h-6 flex items-center justify-center rounded-full cursor-pointer transition-all bg-purple-600 dark:bg-purple-500 text-white font-bold shadow-xs";
                    } else if (isVisibleInGrid) {
                        className += " bg-purple-500/10 dark:bg-purple-400/15 text-purple-700 dark:text-purple-300 font-semibold rounded-md";
                    } else {
                        className += " text-[var(--text-body)] dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10";
                    }

                    return (
                        <div
                            key={day.toISOString()}
                            onClick={(e) => { e.stopPropagation(); onSelect?.(day); }}
                            className={className}
                        >
                            {format(day, dateFormat)}
                            {isVisibleInGrid && !isDayToday && !isSelected && (
                                <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-3 h-0.5 rounded-full bg-indigo-500/60 dark:bg-indigo-400/60" />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
