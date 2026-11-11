import React, { useState } from "react";
import type { ComponentProps } from "react";
import type { MotionValue } from "framer-motion";
import { format, isSameDay, differenceInMinutes } from "date-fns";
import { de } from "date-fns/locale";
import { Clock, Calendar as CalendarIcon, CheckSquare, Square, Trash2 } from "lucide-react";
import DayColumn from "@/components/Calendar/DayColumn";
import { DragGhost } from "./DragGhost";
import { getEventGroupIds } from "@/lib/calendarUtils";
import type { CalendarEvent, CalendarViewProps, CreationDrag, DragState, ResizeDragState } from "./types";

interface DesktopDayViewProps {
    day: Date;
    eventsByDay: { timedMap: Map<string, CalendarEvent[]>; allDayMap: Map<string, CalendarEvent[]> };
    events: CalendarEvent[];
    currentTime: Date;
    gridDaysRef: React.RefObject<HTMLDivElement | null>;
    isPreciseMode: boolean;
    onDayEventClick: ComponentProps<typeof DayColumn>["onEventClick"];
    onEventCreate: CalendarViewProps["onEventCreate"];
    onEventUpdate: CalendarViewProps["onEventUpdate"];
    onEventRename: CalendarViewProps["onEventRename"];
    onEventDelete: CalendarViewProps["onEventDelete"];
    onEventSave: CalendarViewProps["onEventSave"];
    onEventShare: CalendarViewProps["onEventShare"];
    onGridMouseDown: ComponentProps<typeof DayColumn>["onGridMouseDown"];
    onEventMouseDown: ComponentProps<typeof DayColumn>["onEventMouseDown"];
    onResizeMouseDown: ComponentProps<typeof DayColumn>["onResizeMouseDown"];
    draggingId: string | null;
    dragState: DragState | null;
    creationDrag: CreationDrag | null;
    resizingId: string | null;
    resizeDragState: ResizeDragState | null;
    resizeHeightMV: MotionValue<number>;
    creationEndYMV: MotionValue<number>;
    cursorX: MotionValue<number>;
    cursorY: MotionValue<number>;
    themes?: { id: string; title: string; effect?: string; color?: string }[];
}

export default function DesktopDayView({
    day,
    eventsByDay,
    events,
    currentTime,
    gridDaysRef,
    isPreciseMode,
    onDayEventClick,
    onEventCreate,
    onEventUpdate,
    onEventRename,
    onEventDelete,
    onEventSave,
    onEventShare,
    onGridMouseDown,
    onEventMouseDown,
    onResizeMouseDown,
    draggingId,
    dragState,
    creationDrag,
    resizingId,
    resizeDragState,
    resizeHeightMV,
    creationEndYMV,
    cursorX,
    cursorY,
    themes = [],
}: DesktopDayViewProps) {
    const [hoveredHour, setHoveredHour] = useState<number | null>(null);
    const [selectedEventState, setSelectedEventState] = useState<{ dayKey: string; id: string } | null>(null);

    const dayKey = format(day, "yyyy-MM-dd");
    const selectedEventId = selectedEventState?.dayKey === dayKey ? selectedEventState.id : null;
    const dayEvents = eventsByDay.timedMap.get(dayKey) || [];
    const allDayEventsGroup = eventsByDay.allDayMap.get(dayKey) || [];
    const allEventsForDay = [...dayEvents, ...allDayEventsGroup];

    const isTodayDay = isSameDay(day, currentTime);

    // Timed events sorted chronologically
    const timedSorted = [...dayEvents]
        .filter((e) => !e.is_cancelled)
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    let currentEvent: CalendarEvent | null = null;
    let upcomingEvent: CalendarEvent | null = null;

    if (isTodayDay) {
        const nowMs = currentTime.getTime();
        for (const ev of timedSorted) {
            const startMs = new Date(ev.start).getTime();
            const endMs = new Date(ev.end).getTime();
            if (nowMs >= startMs && nowMs < endMs) {
                currentEvent = ev;
                break;
            } else if (startMs > nowMs && !upcomingEvent) {
                upcomingEvent = ev;
            }
        }
    }

    // Active event for details card: user selected > current > upcoming > first event of day
    const activeEvent =
        (selectedEventId
            ? allEventsForDay.find(
                  (e) => e.id === selectedEventId || (typeof selectedEventId === "string" && selectedEventId.startsWith(e.id + "_"))
              )
            : null) ||
        currentEvent ||
        upcomingEvent ||
        allEventsForDay[0] ||
        null;

    const activeGroupIds = activeEvent ? getEventGroupIds(activeEvent) : [];
    const activeTheme = themes.find((t) => activeGroupIds.includes(t.id));

    // Live status calculations for active event & day
    const nowMs = currentTime.getTime();
    const activeStartMs = activeEvent ? new Date(activeEvent.start).getTime() : 0;
    const activeEndMs = activeEvent ? new Date(activeEvent.end).getTime() : 0;
    const isActiveRunning = isTodayDay && !!activeEvent && !activeEvent.allDay && nowMs >= activeStartMs && nowMs < activeEndMs;
    const isActiveUpcoming = isTodayDay && !!activeEvent && !activeEvent.allDay && activeStartMs > nowMs;
    const activeRemainingMins = activeEvent ? Math.max(1, differenceInMinutes(new Date(activeEvent.end), currentTime)) : 0;
    const activeStartsInMins = activeEvent ? Math.max(1, differenceInMinutes(new Date(activeEvent.start), currentTime)) : 0;

    // Target event for the top Live Status widget: activeEvent (if live/upcoming) > currentEvent > upcomingEvent
    const liveTargetEvent = (isActiveRunning || isActiveUpcoming) ? activeEvent : (currentEvent || upcomingEvent);
    const isLiveRunning = liveTargetEvent && isTodayDay && !liveTargetEvent.allDay && nowMs >= new Date(liveTargetEvent.start).getTime() && nowMs < new Date(liveTargetEvent.end).getTime();
    const isLiveUpcoming = liveTargetEvent && isTodayDay && !liveTargetEvent.allDay && new Date(liveTargetEvent.start).getTime() > nowMs;
    const liveRemainingMins = liveTargetEvent ? Math.max(1, differenceInMinutes(new Date(liveTargetEvent.end), currentTime)) : 0;
    const liveStartsInMins = liveTargetEvent ? Math.max(1, differenceInMinutes(new Date(liveTargetEvent.start), currentTime)) : 0;

    // Summary calculations
    const totalScheduledMinutes = dayEvents
        .filter((e) => !e.is_cancelled)
        .reduce((sum, e) => sum + Math.max(0, differenceInMinutes(new Date(e.end), new Date(e.start))), 0);
    const schedHours = Math.floor(totalScheduledMinutes / 60);
    const schedMins = totalScheduledMinutes % 60;
    const totalHoursStr =
        schedHours > 0
            ? schedMins > 0
                ? `${schedHours}h ${schedMins}m`
                : `${schedHours}h`
            : `${schedMins}m`;

    const tasksForDay = allEventsForDay.filter((e) => e.is_task);
    const completedTasksCount = tasksForDay.filter((e) => e.is_completed).length;

    const handleEventClick: ComponentProps<typeof DayColumn>["onEventClick"] = (clickedEvent, rect) => {
        const id = typeof clickedEvent === "string" ? clickedEvent : (clickedEvent as CalendarEvent)?.id;
        if (id) {
            setSelectedEventState({ dayKey, id });
        }
        onDayEventClick?.(clickedEvent, rect);
    };

    return (
        <div className="flex-1 flex max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 w-full gap-6 min-h-full py-4">
            {/* Left / Center Column (24h timeline grid and DayColumn) */}
            <div className="flex-1 min-w-[300px] md:min-w-0 flex relative min-h-full">
                {/* Time Column (Sticky Left) */}
                <div className="w-[60px] flex-shrink-0 sticky left-0 z-[400] bg-white dark:bg-slate-950 border-r border-gray-100/80 dark:border-slate-900/50 h-fit min-h-full pb-[40px]">
                    <div className="h-[50px] border-b border-gray-100/80 dark:border-slate-900/50 sticky top-0 z-[410] bg-white dark:bg-slate-950" />
                    {Array.from({ length: 24 }).map((_, i) => (
                        <div
                            key={i}
                            className="h-[48px] relative group border-b border-dashed border-gray-100/50 dark:border-slate-900/40"
                        >
                            <span className="absolute -top-3 right-3 text-[11px] font-semibold text-gray-400 dark:text-gray-500 z-[10]">
                                {i}:00
                            </span>
                        </div>
                    ))}
                </div>

                {/* Single Day Column Wrapper */}
                <div className="flex-1 flex relative items-start pb-[40px]" ref={gridDaysRef} style={{ '--hour-height': '48px' } as React.CSSProperties}>
                    <DayColumn
                        key={day.toISOString()}
                        day={day}
                        events={[...dayEvents, ...allDayEventsGroup]}
                        allEvents={events}
                        isToday={isSameDay(day, new Date())}
                        dayIndexOffset={0}
                        currentTime={currentTime}
                        hoveredHour={hoveredHour}
                        onHourHover={setHoveredHour}
                        onEventClick={handleEventClick}
                        onEventCreate={onEventCreate}
                        onEventShare={onEventShare}
                        onEventDelete={onEventDelete ? (id) => onEventDelete(id) : undefined}
                        onGridMouseDown={onGridMouseDown}
                        onEventMouseDown={onEventMouseDown}
                        onResizeMouseDown={onResizeMouseDown}
                        draggingId={draggingId}
                        dragState={dragState}
                        creationDrag={creationDrag}
                        resizingId={resizingId}
                        resizeDragState={resizeDragState}
                        resizeHeightMV={resizeHeightMV}
                        creationEndYMV={creationEndYMV}
                        onHeaderClick={(clickedDay) => {
                            const start = new Date(clickedDay);
                            start.setHours(0, 0, 0, 0);
                            const end = new Date(clickedDay);
                            end.setHours(23, 59, 59, 999);
                            if (onEventCreate) {
                                onEventCreate(start, end, true, { title: "New All-Day Event", allDay: true });
                            }
                        }}
                        onTaskToggle={(id, currentIsCompleted) => {
                            if (onEventSave) onEventSave(id, { is_completed: !currentIsCompleted });
                        }}
                        onEventRename={onEventRename}
                        snapInterval={isPreciseMode ? 1 : 10}
                        isMagnified={isPreciseMode}
                        onEventDrop={async (eventId: string, start: Date, end: Date) => {
                            if (onEventUpdate) {
                                await onEventUpdate(eventId, start, end);
                            }
                        }}
                        cursorX={cursorX}
                        cursorY={cursorY}
                        hourHeight={48}
                    />

                    {/* Drag Ghost within Day Column */}
                    {dragState && draggingId && !isPreciseMode && (
                        <DragGhost dragState={dragState} draggingId={draggingId} events={events} cursorX={cursorX} cursorY={cursorY} />
                    )}
                </div>
            </div>

            {/* Right Column (Sidebar) */}
            <div className="hidden md:flex w-80 xl:w-96 flex-col shrink-0 rounded-2xl bg-white/70 dark:bg-white/[0.04] border border-gray-200/80 dark:border-white/10 p-4 gap-4 sticky top-4 self-start max-h-[calc(100vh-210px)] overflow-y-auto">
                {/* 1. Live Status Header */}
                <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-gray-50/80 dark:bg-white/[0.03] border border-gray-200/60 dark:border-white/5">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold tracking-wider text-gray-500 dark:text-gray-400 uppercase flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                            Live Status
                        </span>
                        {isLiveRunning ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                                NOCH {liveRemainingMins} MIN
                            </span>
                        ) : isLiveUpcoming ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/40">
                                STARTET IN {liveStartsInMins} MIN
                            </span>
                        ) : null}
                    </div>

                    {isTodayDay ? (
                        liveTargetEvent ? (
                            <div>
                                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                                    {liveTargetEvent.title || (isLiveRunning ? "Aktueller Termin" : "Nächster Termin")}
                                </h4>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    {format(new Date(liveTargetEvent.start), "HH:mm")} – {format(new Date(liveTargetEvent.end), "HH:mm")}
                                </p>
                            </div>
                        ) : (
                            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 py-1">
                                Keine weiteren Termine heute
                            </div>
                        )
                    ) : (
                        <div>
                            <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                                {format(day, "EEEE, d. MMMM", { locale: de })}
                            </h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {allEventsForDay.length} {allEventsForDay.length === 1 ? "Termin" : "Termine"} eingetragen
                            </p>
                        </div>
                    )}
                </div>

                {/* 2. Event Details Card */}
                <div className="flex flex-col gap-3 p-4 rounded-xl bg-white dark:bg-white/[0.03] border border-gray-200/80 dark:border-white/10 shadow-sm">
                    <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-white/5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-bold tracking-wider text-gray-400 dark:text-gray-500 uppercase">
                                Termindetails
                            </span>
                            {isActiveRunning && (
                                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                                    NOCH {activeRemainingMins} MIN
                                </span>
                            )}
                            {isActiveUpcoming && (
                                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/40">
                                    STARTET IN {activeStartsInMins} MIN
                                </span>
                            )}
                        </div>
                        {activeTheme && (
                            <span
                                style={{
                                    borderColor: activeTheme.color || "rgba(0,0,0,0.1)",
                                }}
                                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-gray-50 dark:bg-white/5 text-gray-700 dark:text-gray-300"
                            >
                                {activeTheme.color && (
                                    <span
                                        className="w-1.5 h-1.5 rounded-full shrink-0"
                                        style={{ backgroundColor: activeTheme.color }}
                                    />
                                )}
                                {activeTheme.title}
                            </span>
                        )}
                    </div>

                    {activeEvent ? (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-start gap-3">
                                <div
                                    style={{ backgroundColor: activeEvent.color || "#3b82f6" }}
                                    className="w-1.5 self-stretch rounded-full shrink-0 min-h-[40px]"
                                />
                                <div className="min-w-0 flex-1">
                                    <h3 className={`text-base font-bold text-gray-900 dark:text-gray-100 ${activeEvent.is_completed ? "line-through text-gray-400 dark:text-gray-500" : ""}`}>
                                        {activeEvent.title || "Ohne Titel"}
                                    </h3>
                                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1.5">
                                        <Clock size={13} className="shrink-0" />
                                        {activeEvent.allDay ? (
                                            <span>Ganztägig</span>
                                        ) : (
                                            <span>
                                                {format(new Date(activeEvent.start), "HH:mm")} – {format(new Date(activeEvent.end), "HH:mm")}{" "}
                                                <span className="text-gray-400 dark:text-gray-500">
                                                    ({(() => {
                                                        const m = Math.max(15, differenceInMinutes(new Date(activeEvent.end), new Date(activeEvent.start)));
                                                        return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 > 0 ? `${m % 60}m` : ""}`.trim() : `${m}m`;
                                                    })()})
                                                </span>
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {activeEvent.description && (
                                <div className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50/70 dark:bg-white/[0.02] p-2.5 rounded-lg border border-gray-100 dark:border-white/5 whitespace-pre-wrap leading-relaxed">
                                    {activeEvent.description}
                                </div>
                            )}

                            {activeEvent.tags && activeEvent.tags.filter((t) => t.trim() !== "").length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                    {activeEvent.tags.filter((t) => t.trim() !== "").map((tag, idx) => (
                                        <span
                                            key={idx}
                                            className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 border border-gray-200/60 dark:border-white/5"
                                        >
                                            #{tag}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {activeEvent.is_task && (
                                <div className="flex items-center justify-between pt-1 text-xs">
                                    <span className="text-gray-500 dark:text-gray-400 font-medium">Aufgabe:</span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (onEventSave) {
                                                onEventSave(activeEvent.id, { is_completed: !activeEvent.is_completed });
                                            }
                                        }}
                                        className="inline-flex items-center gap-1.5 font-semibold text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                    >
                                        {activeEvent.is_completed ? (
                                            <>
                                                <CheckSquare size={15} className="text-green-500" />
                                                <span className="text-green-600 dark:text-green-400">Erledigt</span>
                                            </>
                                        ) : (
                                            <>
                                                <Square size={15} />
                                                <span>Offen</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}

                            {onEventDelete && (
                                <div className="pt-1 flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => onEventDelete(activeEvent.id)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                                    >
                                        <Trash2 size={13} />
                                        Termin löschen
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="py-6 px-3 text-center text-xs text-gray-400 dark:text-gray-500 border border-dashed border-gray-200 dark:border-white/10 rounded-xl">
                            Wähle einen Termin aus, um die Details zu sehen
                        </div>
                    )}
                </div>

                {/* 3. Day Summary Stats */}
                <div className="flex flex-col gap-2.5 p-3.5 rounded-xl bg-gray-50/80 dark:bg-white/[0.03] border border-gray-200/60 dark:border-white/5">
                    <span className="text-[11px] font-bold tracking-wider text-gray-500 dark:text-gray-400 uppercase">
                        Tagesübersicht
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                        <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-white dark:bg-white/5 border border-gray-200/60 dark:border-white/5 text-center">
                            <Clock size={16} className="text-blue-500 mb-1" />
                            <span className="text-xs font-bold text-gray-900 dark:text-gray-100">
                                {totalHoursStr}
                            </span>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
                                Geplant
                            </span>
                        </div>

                        <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-white dark:bg-white/5 border border-gray-200/60 dark:border-white/5 text-center">
                            <CheckSquare size={16} className="text-emerald-500 mb-1" />
                            <span className="text-xs font-bold text-gray-900 dark:text-gray-100">
                                {tasksForDay.length > 0 ? `${completedTasksCount}/${tasksForDay.length}` : "0"}
                            </span>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
                                Aufgaben
                            </span>
                        </div>

                        <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-white dark:bg-white/5 border border-gray-200/60 dark:border-white/5 text-center">
                            <CalendarIcon size={16} className="text-indigo-500 mb-1" />
                            <span className="text-xs font-bold text-gray-900 dark:text-gray-100">
                                {allEventsForDay.length}
                            </span>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
                                Termine
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
