import React from "react";
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    isToday,
} from "date-fns";
import { Plus, CheckSquare } from "lucide-react";
import { getHolidayForDate } from "@/lib/holidays";
import { getEventGroupIds } from "@/lib/calendarUtils";
import type { CalendarEvent } from "./types";

interface DesktopMonthViewProps {
    currentDate: Date;
    eventsByDay: { timedMap: Map<string, CalendarEvent[]>; allDayMap: Map<string, CalendarEvent[]> };
    onDayClick: (date: Date) => void;
    onEventClick: (event: CalendarEvent, rect: DOMRect) => void;
    onEventCreate?: (start: Date, end: Date, isAllDay?: boolean, extraMeta?: Record<string, unknown>) => Promise<string | null>;
    themes?: { id: string; title: string; effect?: string; color?: string }[];
}

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export default function DesktopMonthView({
    currentDate,
    eventsByDay,
    onDayClick,
    onEventClick,
    onEventCreate,
    themes = [],
}: DesktopMonthViewProps) {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const days = eachDayOfInterval({ start: startDate, end: endDate });

    const handleCreateOnDay = (e: React.MouseEvent, day: Date) => {
        e.stopPropagation();
        if (!onEventCreate) return;
        const start = new Date(day);
        start.setHours(9, 0, 0, 0);
        const end = new Date(day);
        end.setHours(10, 0, 0, 0);
        onEventCreate(start, end, false);
    };

    return (
        <div className="flex-1 flex flex-col h-full select-none overflow-hidden bg-transparent">
            {/* Weekday Header */}
            <div className="grid grid-cols-7 border-b border-gray-200/80 dark:border-white/10 bg-white/40 dark:bg-slate-950/40 backdrop-blur-sm z-10">
                {WEEKDAYS.map((wd, i) => (
                    <div
                        key={wd}
                        className={`py-2 text-center text-xs font-bold uppercase tracking-wider ${
                            i >= 5 ? "text-gray-400 dark:text-gray-500" : "text-gray-600 dark:text-gray-400"
                        }`}
                    >
                        {wd}
                    </div>
                ))}
            </div>

            {/* Month Day Grid */}
            <div className="grid grid-cols-7 flex-1 auto-rows-fr overflow-y-auto divide-x divide-y divide-gray-150 dark:divide-white/10 border-b border-gray-200/80 dark:border-white/10">
                {days.map((day) => {
                    const dayKey = format(day, "yyyy-MM-dd");
                    const isCurMonth = isSameMonth(day, currentDate);
                    const isTod = isToday(day);
                    const holiday = getHolidayForDate(dayKey);

                    const timed = eventsByDay.timedMap.get(dayKey) || [];
                    const allDay = eventsByDay.allDayMap.get(dayKey) || [];
                    const allEventsForDay = [...allDay, ...timed];

                    const visibleEvents = allEventsForDay.slice(0, 3);
                    const hiddenCount = allEventsForDay.length - visibleEvents.length;

                    return (
                        <div
                            key={day.toISOString()}
                            onClick={() => onDayClick(day)}
                            className={`group relative flex flex-col p-1.5 transition-colors cursor-pointer min-h-[96px] ${
                                isCurMonth
                                    ? "bg-white/60 dark:bg-slate-900/40 hover:bg-gray-50/90 dark:hover:bg-white/[0.04]"
                                    : "bg-gray-50/50 dark:bg-black/20 text-gray-400 dark:text-gray-600 hover:bg-gray-100/50 dark:hover:bg-white/[0.02]"
                            }`}
                        >
                            {/* Cell Header: Date Number + Holiday + Quick Add */}
                            <div className="flex items-center justify-between mb-1 min-h-[24px]">
                                <div className="flex items-center gap-1 min-w-0">
                                    <span
                                        className={`inline-flex items-center justify-center text-xs font-bold transition-transform ${
                                            isTod
                                                ? "w-6 h-6 rounded-full bg-blue-600 text-white shadow-sm"
                                                : isCurMonth
                                                ? "text-gray-800 dark:text-gray-200 group-hover:scale-105"
                                                : "text-gray-400 dark:text-gray-500"
                                        }`}
                                    >
                                        {format(day, "d")}
                                    </span>
                                    {holiday && (
                                        <span
                                            title={holiday.name}
                                            className="hidden sm:inline-block truncate text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1 py-0.5 rounded"
                                        >
                                            {holiday.name}
                                        </span>
                                    )}
                                </div>

                                <button
                                    onClick={(e) => handleCreateOnDay(e, day)}
                                    title="Termin hinzufügen"
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-opacity text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
                                >
                                    <Plus size={13} strokeWidth={2.5} />
                                </button>
                            </div>

                            {/* Event Pills */}
                            <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                                {visibleEvents.map((ev) => {
                                    const isCompleted = !!ev.is_completed;
                                    const isCancelled = !!ev.is_cancelled;
                                    const groupIds = getEventGroupIds(ev);
                                    const matchedTheme = themes.find((t) => groupIds.includes(t.id));
                                    const eventColor = ev.color || matchedTheme?.color || "#3b82f6";
                                    const isTimed = !ev.allDay;

                                    return (
                                        <div
                                            key={ev.id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEventClick(ev, e.currentTarget.getBoundingClientRect());
                                            }}
                                            style={{
                                                borderLeftColor: eventColor,
                                            }}
                                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] leading-tight font-medium truncate cursor-pointer transition-all border-l-2 bg-gray-100/80 dark:bg-white/10 hover:brightness-95 dark:hover:brightness-110 shadow-xs ${
                                                isCancelled ? "opacity-50 line-through" : ""
                                            } ${isCompleted ? "opacity-60" : ""}`}
                                            title={`${ev.title}${isTimed ? ` (${format(new Date(ev.start), "HH:mm")})` : ""}`}
                                        >
                                            {ev.is_task && (
                                                <CheckSquare
                                                    size={11}
                                                    className={`shrink-0 ${
                                                        isCompleted ? "text-green-500" : "text-gray-400"
                                                    }`}
                                                />
                                            )}
                                            {isTimed && (
                                                <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 shrink-0">
                                                    {format(new Date(ev.start), "HH:mm")}
                                                </span>
                                            )}
                                            <span
                                                className={`truncate text-gray-800 dark:text-gray-200 ${
                                                    isCompleted ? "line-through" : ""
                                                }`}
                                            >
                                                {ev.title || "Ohne Titel"}
                                            </span>
                                        </div>
                                    );
                                })}

                                {hiddenCount > 0 && (
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDayClick(day);
                                        }}
                                        className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline px-1 pt-0.5 cursor-pointer"
                                    >
                                        +{hiddenCount} weitere
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
