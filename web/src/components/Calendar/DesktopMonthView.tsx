import React, { useState } from "react";
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    isToday,
    isSameDay,
} from "date-fns";
import { Plus, CheckSquare, Square } from "lucide-react";
import { getHolidayForDate } from "@/lib/holidays";
import { getEventGroupIds } from "@/lib/calendarUtils";
import { useJobEventMatcher } from "@/hooks/useJobEventMatcher";
import { useDataStore, useWeekStartsOn } from "@/store/useDataStore";
import { MonthDayPanel, MonthEventInfo, eventColors } from "./MonthDayPanel";
import { rotateWeekdayLabels } from "@/lib/calendarWeeks";
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

export default function DesktopMonthView({
    currentDate,
    eventsByDay,
    onDayClick,
    onEventClick,
    onEventCreate,
    onTaskToggle,
    themes = [],
}: DesktopMonthViewProps) {
    const { isJob } = useJobEventMatcher();
    const weekStartsOn = useWeekStartsOn();
    const weekdays = rotateWeekdayLabels(WEEKDAYS, weekStartsOn);

    const isJobOrUniEvent = (e: CalendarEvent) => isJob(e);

    // Tablet: tapping a day slides the grid to the left and shows that day's events next to it.
    const tablet = useDataStore((st) => st.navigationMode === "folders");
    const [sel, setSel] = useState<{ day: Date; ev: CalendarEvent | null } | null>(null);
    const handleDay = (day: Date) => {
        if (!tablet) return onDayClick(day);
        // Second tap on the open day: the real day view
        if (sel && isSameDay(sel.day, day)) {
            setSel(null);
            return onDayClick(day);
        }
        setSel({ day, ev: null });
    };
    const dayEvents = (day: Date): CalendarEvent[] => {
        const key = format(day, "yyyy-MM-dd");
        return [...(eventsByDay.allDayMap.get(key) || []), ...(eventsByDay.timedMap.get(key) || [])].filter((e) => !isJobOrUniEvent(e));
    };

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn });
    const endDate = endOfWeek(monthEnd, { weekStartsOn });

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

    const panelOpen = tablet && sel !== null;

    return (
        <div className="flex-1 flex h-full min-h-0 select-none overflow-hidden bg-transparent">
        <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden bg-transparent transition-[flex-basis] duration-300">
        <div className="flex-1 min-h-0 flex flex-col p-3 sm:p-4">
            <div className="flex-1 flex flex-col rounded-2xl border-2 border-t2-line  overflow-hidden shadow-md bg-t2-hover ">
                {/* Weekday Header */}
                <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] border-b border-t2-line  bg-t2-surface  z-10 px-2">
                    {weekdays.map((wd, i) => (
                        <div
                            key={wd}
                            className={`py-2 text-center text-xs font-bold uppercase tracking-wider ${
                                (wd === "Sa" || wd === "So") ? "text-t2-ink-3 " : "text-t2-ink "
                            }`}
                        >
                            {wd}
                        </div>
                    ))}
                </div>

                {/* Month Day Grid */}
                <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] flex-1 auto-rows-[minmax(96px,1fr)] overflow-y-auto gap-1.5 p-2">
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
                                onClick={() => handleDay(day)}
                                className={`group relative flex flex-col min-w-0 overflow-hidden p-1.5 transition-colors cursor-pointer min-h-[96px] ${panelOpen && sel && isSameDay(sel.day, day) ? "ring-2 ring-black dark:ring-white " : ""}${
                                    isTod
                                        ? "rounded-xl bg-t2-sub  border-2 border-t2-accent  shadow-xs hover:border-t2-accent  z-[2]"
                                        : isCurMonth
                                        ? "rounded-xl bg-t2-surface  border border-t2-line  shadow-xs hover:border-t2-line "
                                        : "rounded-xl bg-t2-sub  border border-t2-line  text-t2-ink-3  hover:border-t2-line "
                                }`}
                            >
                                {/* Cell Header: Date Number + Holiday + Quick Add */}
                                <div className="flex items-center justify-between mb-1 min-h-[24px]">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span
                                            className={`inline-flex items-center justify-center text-xs font-bold transition-transform ${
                                                isTod
                                                    ? "w-6 h-6 rounded-full bg-t2-accent text-t2-accent-ink shadow-sm ring-2 ring-t2-accent"
                                                    : isCurMonth
                                                    ? "text-t2-ink  group-hover:scale-105"
                                                    : "text-t2-ink-3 "
                                            }`}
                                        >
                                            {format(day, "d")}
                                        </span>
                                        {isTod && (
                                            <span className="px-1.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-t2-accent text-t2-accent-ink shadow-xs">
                                                Heute
                                            </span>
                                        )}
                                        {holiday && (
                                            <span
                                                title={holiday.name}
                                                className="hidden xl:inline-block truncate text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1 py-0.5 rounded"
                                            >
                                                {holiday.name}
                                            </span>
                                        )}
                                    </div>

                                <button
                                    onClick={(e) => handleCreateOnDay(e, day)}
                                    title="Termin hinzufügen"
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-t2-hover  rounded-full transition-opacity text-t2-ink-2  hover:text-t2-ink "
                                >
                                    <Plus size={13} strokeWidth={2.5} />
                                </button>
                            </div>

                            {/* Event Pills */}
                            <div className="flex-1 min-h-0 flex flex-col gap-1 overflow-hidden">
                                {hasTasks && (
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDay(day);
                                        }}
                                        className={`flex shrink-0 items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] leading-tight font-medium truncate cursor-pointer transition-all border-l-2 bg-t2-hover  hover:bg-t2-stage  shadow-xs ${
                                            allCompleted
                                                ? "border-emerald-500 text-t2-ink-2 "
                                                : "border-t2-accent text-t2-ink "
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
                                            className="shrink-0 p-0.5 -m-0.5 rounded hover:bg-t2-stage  transition-colors flex items-center justify-center"
                                            title={allCompleted ? "Todos als unerledigt markieren" : "Alle Todos als erledigt markieren"}
                                        >
                                            {allCompleted ? (
                                                <CheckSquare size={11} className="text-emerald-500 dark:text-emerald-400 shrink-0" />
                                            ) : (
                                                <Square size={11} className="text-t2-accent  shrink-0" />
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
                                    const colors = eventColors(ev, themes);
                                    const isTimed = !ev.allDay;
                                    void matchedTheme;

                                    return (
                                        <div
                                            key={ev.id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (tablet) setSel({ day, ev });
                                                else onEventClick(ev, e.currentTarget.getBoundingClientRect());
                                            }}
                                            style={{ background: colors.bg, color: colors.ink }}
                                            className={`flex shrink-0 items-center gap-1 px-1.5 py-[3px] min-h-[20px] rounded-md text-[11px] leading-tight font-semibold truncate cursor-pointer transition-[filter] hover:brightness-[0.93] ${
                                                isCancelled ? "opacity-50 line-through" : ""
                                            } ${isCompleted ? "opacity-60" : ""}`}
                                            title={`${ev.title}${isTimed ? ` (${format(new Date(ev.start), "HH:mm")})` : ""}`}
                                        >
                                            {isTimed && (
                                                <span className="text-[11px] font-semibold opacity-75 shrink-0 tabular-nums">
                                                    {format(new Date(ev.start), "HH:mm")}
                                                </span>
                                            )}
                                            <span
                                                className={`truncate ${
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
                                            handleDay(day);
                                        }}
                                        className="shrink-0 text-[11px] font-bold text-t2-accent  hover:underline px-1 pt-0.5 cursor-pointer"
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
        {/* Details of the selected event: a few lines under the calendar */}
        <div
            className={`shrink-0 overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${panelOpen && sel?.ev ? "max-h-[260px] opacity-100" : "max-h-0 opacity-0"}`}
        >
            {sel?.ev && (
                <MonthEventInfo
                    event={sel.ev}
                    themes={themes}
                    onEdit={(rect) => onEventClick(sel.ev as CalendarEvent, rect)}
                    onClose={() => setSel((cur) => (cur ? { ...cur, ev: null } : cur))}
                />
            )}
        </div>
        </div>
        {/* Day list: slides in from the right while the calendar shrinks */}
        <div
            className={`shrink-0 overflow-hidden transition-[width,opacity,padding] duration-300 ease-out ${panelOpen ? "w-[360px] opacity-100 py-3 pr-3 sm:py-4 sm:pr-4" : "w-0 opacity-0"}`}
        >
            {sel && (
                <MonthDayPanel
                    day={sel.day}
                    events={dayEvents(sel.day)}
                    themes={themes}
                    selectedId={sel.ev?.id ?? null}
                    onSelect={(ev) => setSel({ day: sel.day, ev })}
                    onOpenDay={() => { const d = sel.day; setSel(null); onDayClick(d); }}
                    onClose={() => setSel(null)}
                />
            )}
        </div>
        </div>
    );
}