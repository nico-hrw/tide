
import React, { useState } from 'react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isSameDay, isToday } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function MiniCalendar({ selectedDate, onSelect }: { selectedDate?: Date, onSelect?: (date: Date) => void }) {
    const [currentDateInternal, setCurrentDateInternal] = useState(new Date());

    const activeDate = selectedDate || new Date();

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
            className="p-5 bg-transparent select-none cursor-pointer"
            onClick={() => onSelect?.(new Date())}
            title="Go to today"
        >
            <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {format(displayDate, "MMMM yyyy")}
                </span>
                <div className="flex gap-1">
                    <button
                        onClick={(e) => { e.stopPropagation(); prevMonth(); }}
                        className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors"
                    >
                        <ChevronLeft size={14} className="text-gray-500 dark:text-slate-400" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); nextMonth(); }}
                        className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors"
                    >
                        <ChevronRight size={14} className="text-gray-500 dark:text-slate-400" />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center mb-2">
                {weekDays.map(day => (
                    <div key={day} className="text-[10px] font-medium text-[var(--text-subtle)] uppercase tracking-[0.5px]">
                        {day}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
                {days.map((day, i) => {
                    const isSelected = isSameDay(day, activeDate);
                    const isCurrentMonth = isSameMonth(day, monthStart);
                    const isDayToday = isToday(day);

                    let className = "text-xs w-7 h-7 flex items-center justify-center rounded-full cursor-pointer transition-all";

                    if (!isCurrentMonth) {
                        className += " text-gray-300 dark:text-gray-700";
                    } else {
                        className += " text-[var(--text-body)] dark:text-gray-200";
                    }

                    if (isDayToday) {
                        className = "text-xs w-7 h-7 flex items-center justify-center rounded-full cursor-pointer transition-all bg-[var(--today-accent)] text-white font-semibold";
                    } else if (isSelected) {
                        className += " bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold shadow-sm";
                    } else {
                        className += " hover:bg-black/5 dark:hover:bg-white/10";
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
