import React, { useRef, useEffect } from "react";
import {
    format,
    addDays,
    subDays,
    isToday,
    isTomorrow,
    isYesterday,
    differenceInMinutes,
} from "date-fns";
import { de } from "date-fns/locale";
import { Plus, CheckSquare, Square, Trash2 } from "lucide-react";
import { getHolidayForDate } from "@/lib/holidays";
import { getEventGroupIds } from "@/lib/calendarUtils";
import type { CalendarEvent } from "./types";

interface DesktopAgendaViewProps {
    currentDate: Date;
    eventsByDay: { timedMap: Map<string, CalendarEvent[]>; allDayMap: Map<string, CalendarEvent[]> };
    onEventClick: (event: CalendarEvent, rect: DOMRect) => void;
    onEventCreate?: (start: Date, end: Date, isAllDay?: boolean, extraMeta?: Record<string, unknown>) => Promise<string | null>;
    onEventDelete?: (id: string) => Promise<void>;
    onTaskToggle?: (id: string, currentIsCompleted: boolean) => void;
    themes?: { id: string; title: string; effect?: string; color?: string }[];
}

export default function DesktopAgendaView({
    currentDate,
    eventsByDay,
    onEventClick,
    onEventCreate,
    onEventDelete,
    onTaskToggle,
    themes = [],
}: DesktopAgendaViewProps) {
    const todayRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Render 42 days (6 weeks) starting from 3 days in the past
    const days = Array.from({ length: 42 }).map((_, i) => addDays(subDays(currentDate, 3), i));

    // Scroll smoothly to today on mount
    useEffect(() => {
        const timer = setTimeout(() => {
            if (todayRef.current && scrollContainerRef.current) {
                todayRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        }, 100);
        return () => clearTimeout(timer);
    }, [currentDate]);

    const handleCreateOnDay = (day: Date) => {
        if (!onEventCreate) return;
        const start = new Date(day);
        start.setHours(9, 0, 0, 0);
        const end = new Date(day);
        end.setHours(10, 0, 0, 0);
        onEventCreate(start, end, false);
    };

    return (
        <div
            ref={scrollContainerRef}
            className="flex-1 h-full overflow-y-auto px-6 py-6 max-w-4xl mx-auto w-full select-none"
        >
            <div className="flex flex-col gap-6">
                {days.map((day) => {
                    const dayKey = format(day, "yyyy-MM-dd");
                    const isTod = isToday(day);
                    const isTom = isTomorrow(day);
                    const isYest = isYesterday(day);
                    const holiday = getHolidayForDate(dayKey);

                    const timed = eventsByDay.timedMap.get(dayKey) || [];
                    const allDay = eventsByDay.allDayMap.get(dayKey) || [];
                    const allEventsForDay = [...allDay, ...timed];

                    // Header title logic
                    let dayLabel = format(day, "EEEE, d. MMMM yyyy", { locale: de });
                    if (isTod) {
                        dayLabel = `Heute • ${format(day, "EEEE, d. MMMM", { locale: de })}`;
                    } else if (isTom) {
                        dayLabel = `Morgen • ${format(day, "EEEE, d. MMMM", { locale: de })}`;
                    } else if (isYest) {
                        dayLabel = `Gestern • ${format(day, "EEEE, d. MMMM", { locale: de })}`;
                    }

                    return (
                        <div
                            key={day.toISOString()}
                            ref={isTod ? todayRef : undefined}
                            className="flex flex-col gap-2 scroll-mt-6"
                        >
                            {/* Day Header */}
                            <div className="flex items-center justify-between pb-1.5 border-b border-gray-200/80 dark:border-white/10">
                                <div className="flex items-center gap-2">
                                    {isTod && (
                                        <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse shrink-0" />
                                    )}
                                    <h3
                                        className={`text-sm font-bold tracking-tight ${
                                            isTod
                                                ? "text-blue-600 dark:text-blue-400 font-extrabold text-base"
                                                : "text-gray-900 dark:text-gray-100"
                                        }`}
                                    >
                                        {dayLabel}
                                    </h3>
                                    {holiday && (
                                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/30">
                                            {holiday.name}
                                        </span>
                                    )}
                                </div>

                                <button
                                    onClick={() => handleCreateOnDay(day)}
                                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                                    title="Termin erstellen"
                                >
                                    <Plus size={14} />
                                    <span>Termin</span>
                                </button>
                            </div>

                            {/* Events List */}
                            {allEventsForDay.length === 0 ? (
                                <div
                                    onClick={() => handleCreateOnDay(day)}
                                    className="py-3 px-4 rounded-xl border border-dashed border-gray-200 dark:border-white/10 text-xs text-gray-400 dark:text-gray-500 hover:border-gray-300 dark:hover:border-white/20 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer flex items-center justify-between"
                                >
                                    <span>Keine Termine</span>
                                    <Plus size={13} />
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {allEventsForDay.map((ev) => {
                                        const isCompleted = !!ev.is_completed;
                                        const isCancelled = !!ev.is_cancelled;
                                        const eventColor = ev.color || "#3b82f6";
                                        const isTimed = !ev.allDay;

                                        const startDate = new Date(ev.start);
                                        const endDate = new Date(ev.end);
                                        const durationMin = Math.max(15, differenceInMinutes(endDate, startDate));
                                        const durationStr =
                                            durationMin >= 60
                                                ? `${Math.floor(durationMin / 60)}h ${
                                                      durationMin % 60 > 0 ? `${durationMin % 60}m` : ""
                                                  }`.trim()
                                                : `${durationMin}m`;

                                        // Matching theme
                                        const groupIds = getEventGroupIds(ev);
                                        const matchedTheme = themes.find((t) => groupIds.includes(t.id));

                                        return (
                                            <div
                                                key={ev.id}
                                                onClick={(e) => {
                                                    onEventClick(ev, e.currentTarget.getBoundingClientRect());
                                                }}
                                                className={`group flex items-center justify-between p-3.5 rounded-xl bg-white dark:bg-white/[0.04] border border-gray-200/80 dark:border-white/10 hover:border-blue-500/40 dark:hover:border-blue-400/40 hover:shadow-sm transition-all cursor-pointer ${
                                                    isCancelled ? "opacity-50 line-through" : ""
                                                } ${isCompleted ? "opacity-60" : ""}`}
                                            >
                                                {/* Left: Color bar + Time + Title */}
                                                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                                    <div
                                                        style={{ backgroundColor: eventColor }}
                                                        className="w-1.5 h-10 rounded-full shrink-0"
                                                    />

                                                    {/* Time Box */}
                                                    <div className="w-24 shrink-0 flex flex-col">
                                                        {isTimed ? (
                                                            <>
                                                                <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                                                                    {format(startDate, "HH:mm")}
                                                                </span>
                                                                <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500">
                                                                    {format(endDate, "HH:mm")} ({durationStr})
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 w-fit">
                                                                Ganztägig
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Task checkbox if applicable */}
                                                    {ev.is_task && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onTaskToggle?.(ev.id, isCompleted);
                                                            }}
                                                            className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors shrink-0"
                                                        >
                                                            {isCompleted ? (
                                                                <CheckSquare size={16} className="text-green-500" />
                                                            ) : (
                                                                <Square size={16} />
                                                            )}
                                                        </button>
                                                    )}

                                                    {/* Title & Description */}
                                                    <div className="min-w-0 flex-1">
                                                        <h4
                                                            className={`text-sm font-semibold truncate text-gray-900 dark:text-gray-100 ${
                                                                isCompleted ? "line-through text-gray-400 dark:text-gray-500" : ""
                                                            }`}
                                                        >
                                                            {ev.title || "Ohne Titel"}
                                                        </h4>
                                                        {ev.description && (
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                                                {ev.description}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Right: Theme badge + Delete Action */}
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {matchedTheme && (
                                                        <span
                                                            style={{
                                                                borderColor: matchedTheme.color || "rgba(0,0,0,0.1)",
                                                            }}
                                                            className="px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-gray-50 dark:bg-white/5 text-gray-700 dark:text-gray-300"
                                                        >
                                                            {matchedTheme.title}
                                                        </span>
                                                    )}

                                                    {onEventDelete && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onEventDelete(ev.id);
                                                            }}
                                                            title="Termin löschen"
                                                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
