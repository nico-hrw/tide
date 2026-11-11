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
import { Plus, CheckSquare, Square } from "lucide-react";
import { getHolidayForDate } from "@/lib/holidays";
import { getEventGroupIds } from "@/lib/calendarUtils";
import { useJobPlannerStore } from "@/store/useJobPlannerStore";
import type { CalendarEvent } from "./types";

interface DesktopMonthViewProps {
    currentDate: Date;
    eventsByDay: { timedMap: Map<string, CalendarEvent[]>; allDayMap: Map<string, CalendarEvent[]> };
    onDayClick: (date: Date) => void;
    onEventClick: (event: CalendarEvent, rect: DOMRect) => void;
    onEventCreate?: (start: Date, end: Date, isAllDay?: boolean, extraMeta?: Record<string, unknown>) => Promise<string | null>;
    onTaskToggle?: (id: string, isCompleted: boolean) => void;
    themes?: { id: string; title: string; effect?: string; color?: string }[];
}

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const JOB_TAGS = ["job", "arbeit", "uni", "studium"];

export default function DesktopMonthView({
    currentDate,
    eventsByDay,
    onDayClick,
    onEventClick,
    onEventCreate,
    onTaskToggle,
    themes = [],
}: DesktopMonthViewProps) {
    const jobPluginGroupId = useJobPlannerStore((state) => state.pluginGroupId);

    const isJobOrUniEvent = (e: CalendarEvent) => {
        if (jobPluginGroupId && (e.parent_id === jobPluginGroupId || e.groupIds?.includes(jobPluginGroupId))) {
            return true;
        }
        if (e.tags && e.tags.some((t) => JOB_TAGS.includes(t.toLowerCase()))) {
            return true;
        }
        return false;
    };

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
        <div className="flex-1 flex flex-col h-full select-none overflow-hidden bg-transparent p-3 sm:p-4">
            <div className="flex-1 flex flex-col rounded-2xl border-2 border-gray-300 dark:border-slate-700 overflow-hidden shadow-md bg-gray-100/90 dark:bg-slate-950">
                {/* Weekday Header */}
                <div className="grid grid-cols-7 border-b border-gray-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 z-10 px-2">
                    {WEEKDAYS.map((wd, i) => (
                        <div
                            key={wd}
                            className={`py-2 text-center text-xs font-bold uppercase tracking-wider ${
                                i >= 5 ? "text-gray-400 dark:text-gray-500" : "text-gray-700 dark:text-gray-300"
                            }`}
                        >
                            {wd}
                        </div>
                    ))}
                </div>

                {/* Month Day Grid */}
                <div className="grid grid-cols-7 flex-1 auto-rows-fr overflow-y-auto gap-1.5 p-2">
                    {days.map((day) => {
                        const dayKey = format(day, "yyyy-MM-dd");
                        const isCurMonth = isSameMonth(day, currentDate);
                        const isTod = isToday(day);
                        const holiday = getHolidayForDate(dayKey);

                        const timed = (eventsByDay.timedMap.get(dayKey) || []).filter((e) => !isJobOrUniEvent(e));
                        const allDay = (eventsByDay.allDayMap.get(dayKey) || []).filter((e) => !isJobOrUniEvent(e));
                        const allEventsForDay = [...allDay, ...timed];

                        const tasks = allEventsForDay.filter((e) => e.is_task);
                        const regularEvents = allEventsForDay.filter((e) => !e.is_task);
                        const hasTasks = tasks.length > 0;
                        const allCompleted = hasTasks && tasks.every((t) => t.is_completed);

                        const maxRegular = hasTasks ? 2 : 3;
                        const visibleRegularEvents = regularEvents.slice(0, maxRegular);
                        const hiddenCount = regularEvents.length - visibleRegularEvents.length;

                        return (
                            <div
                                key={day.toISOString()}
                                onClick={() => onDayClick(day)}
                                className={`group relative flex flex-col p-1.5 transition-colors cursor-pointer min-h-[96px] ${
                                    isTod
                                        ? "rounded-xl bg-blue-50/90 dark:bg-blue-950/40 border-2 border-blue-500/80 dark:border-blue-400 shadow-xs hover:border-blue-600 dark:hover:border-blue-300 z-[2]"
                                        : isCurMonth
                                        ? "rounded-xl bg-white dark:bg-slate-900 border border-gray-200/90 dark:border-slate-800 shadow-xs hover:border-gray-300 dark:hover:border-slate-700"
                                        : "rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200/60 dark:border-slate-900 text-gray-400 dark:text-gray-600 hover:border-gray-300 dark:hover:border-slate-800"
                                }`}
                            >
                                {/* Cell Header: Date Number + Holiday + Quick Add */}
                                <div className="flex items-center justify-between mb-1 min-h-[24px]">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span
                                            className={`inline-flex items-center justify-center text-xs font-bold transition-transform ${
                                                isTod
                                                    ? "w-6 h-6 rounded-full bg-blue-600 text-white shadow-sm ring-2 ring-blue-400/40"
                                                    : isCurMonth
                                                    ? "text-gray-800 dark:text-gray-200 group-hover:scale-105"
                                                    : "text-gray-400 dark:text-gray-500"
                                            }`}
                                        >
                                            {format(day, "d")}
                                        </span>
                                        {isTod && (
                                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-600 text-white shadow-xs">
                                                Heute
                                            </span>
                                        )}
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
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-opacity text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
                                >
                                    <Plus size={13} strokeWidth={2.5} />
                                </button>
                            </div>

                            {/* Event Pills */}
                            <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                                {hasTasks && (
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDayClick(day);
                                        }}
                                        className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] leading-tight font-medium truncate cursor-pointer transition-all border-l-2 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 shadow-xs ${
                                            allCompleted
                                                ? "border-emerald-500 text-gray-500 dark:text-gray-400"
                                                : "border-blue-500 text-gray-800 dark:text-gray-200"
                                        }`}
                                        title={`Todos: ${tasks.length}`}
                                    >
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (onTaskToggle) {
                                                    tasks.forEach((t) => onTaskToggle(t.id, !allCompleted));
                                                }
                                            }}
                                            className="shrink-0 p-0.5 -m-0.5 rounded hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors flex items-center justify-center"
                                            title={allCompleted ? "Todos als unerledigt markieren" : "Alle Todos als erledigt markieren"}
                                        >
                                            {allCompleted ? (
                                                <CheckSquare size={11} className="text-emerald-500 dark:text-emerald-400 shrink-0" />
                                            ) : (
                                                <Square size={11} className="text-blue-500 dark:text-blue-400 shrink-0" />
                                            )}
                                        </button>
                                        <span
                                            className={`truncate ${
                                                allCompleted ? "line-through opacity-60" : ""
                                            }`}
                                        >
                                            Todos: {tasks.length}
                                        </span>
                                    </div>
                                )}

                                {visibleRegularEvents.map((ev) => {
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
                                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] leading-tight font-medium truncate cursor-pointer transition-all border-l-2 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 shadow-xs ${
                                                isCancelled ? "opacity-50 line-through" : ""
                                            } ${isCompleted ? "opacity-60" : ""}`}
                                            title={`${ev.title}${isTimed ? ` (${format(new Date(ev.start), "HH:mm")})` : ""}`}
                                        >
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
        </div>
    );
}