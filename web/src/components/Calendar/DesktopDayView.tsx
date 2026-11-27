import React, { useState } from "react";
import type { ComponentProps } from "react";
import type { MotionValue } from "framer-motion";
import { format, isSameDay, differenceInMinutes, startOfDay } from "date-fns";
import { de } from "date-fns/locale";
import DayColumn from "@/components/Calendar/DayColumn";
import { DragGhost } from "./DragGhost";
import CalendarDetailPanel from "./CalendarDetailPanel";
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
    resizeTopMV: MotionValue<number>;
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
    resizeTopMV,
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

    // Details nur bei ausdrücklicher Auswahl; ohne Auswahl zeigt die Spalte Kennzahlen.
    const selectedEvent =
        (selectedEventId
            ? allEventsForDay.find(
                  (e) => e.id === selectedEventId || (typeof selectedEventId === "string" && selectedEventId.startsWith(e.id + "_"))
              )
            : null) || null;
    const selectedGroupIds = selectedEvent ? getEventGroupIds(selectedEvent) : [];
    const selectedTheme = themes.find((t) => selectedGroupIds.includes(t.id));

    const plannedEvents = dayEvents.filter((e) => !e.is_cancelled && !e.is_task);
    const totalScheduledMinutes = plannedEvents.reduce(
        (sum, e) => sum + Math.max(0, differenceInMinutes(new Date(e.end), new Date(e.start))),
        0
    );
    const totalHoursStr =
        totalScheduledMinutes >= 60
            ? `${Math.floor(totalScheduledMinutes / 60)} h${totalScheduledMinutes % 60 ? ` ${totalScheduledMinutes % 60} Min` : ""}`
            : `${totalScheduledMinutes} Min`;
    const openTasks = allEventsForDay.filter((e) => e.is_task && !e.is_completed).length;

    const idleMessage = !isTodayDay
        ? `${plannedEvents.length} ${plannedEvents.length === 1 ? "Termin" : "Termine"} eingetragen.`
        : currentEvent
          ? `Noch ${Math.max(1, differenceInMinutes(new Date(currentEvent.end), currentTime))} Minuten bei „${currentEvent.title || "Termin"}“.`
          : upcomingEvent
            ? `Als Nächstes: ${upcomingEvent.title || "Termin"} um ${format(new Date(upcomingEvent.start), "HH:mm")}.`
            : "Für heute ist nichts mehr geplant.";
    const idleStats = [
        { value: String(plannedEvents.length), label: "Termine" },
        { value: plannedEvents.length ? totalHoursStr : "–", label: "Geplant" },
        { value: String(openTasks), label: "Todos offen" },
    ];

    // Start- und Endlinie des ausgewählten Termins (Zeitleiste links, 50 px Kopfzeile, 48 px pro Stunde)
    const dayStartMs = startOfDay(day).getTime();
    const lineY = (d: Date) => 50 + Math.min(1440, Math.max(0, (d.getTime() - dayStartMs) / 60000)) * (48 / 60);
    const selectedLines =
        selectedEvent && !selectedEvent.allDay ? [new Date(selectedEvent.start), new Date(selectedEvent.end)] : [];

    const handleEventClick: ComponentProps<typeof DayColumn>["onEventClick"] = (clickedEvent, rect) => {
        const id = typeof clickedEvent === "string" ? clickedEvent : (clickedEvent as CalendarEvent)?.id;
        if (id) {
            setSelectedEventState({ dayKey, id });
        }
        onDayEventClick?.(clickedEvent, rect);
    };

    return (
        // self-start: the parent scroller is a flex row that would stretch this to the visible height,
        // which makes the sticky detail panel scroll away with it instead of staying in view.
        <div className="flex-1 flex self-start max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-10 w-full gap-10 min-h-full py-4">
            {/* Left / Center Column (24h timeline grid and DayColumn) */}
            <div className="flex-1 md:flex-none md:w-[520px] min-w-[300px] md:min-w-0 flex relative min-h-full">
                {selectedLines.map((t, i) => (
                    <div
                        key={i}
                        className="absolute left-0 right-0 z-[420] border-t-[1.5px] border-t2-ink pointer-events-none"
                        style={{ top: lineY(t) }}
                    >
                        <span className="absolute left-1 -top-2.5 rounded-[5px] bg-t2-ink px-1.5 text-[11px] font-bold leading-[18px] text-t2-bg">
                            {format(t, "HH:mm")}
                        </span>
                    </div>
                ))}
                {/* Time Column (Sticky Left) */}
                <div className="w-[60px] flex-shrink-0 sticky left-0 z-[400] bg-t2-bg border-r border-t2-line-soft  h-fit min-h-full pb-[40px]">
                    <div className="h-[50px] border-b border-t2-line-soft  sticky top-0 z-[410] bg-t2-bg" />
                    {Array.from({ length: 24 }).map((_, i) => (
                        <div
                            key={i}
                            className="h-[48px] relative group border-b border-dashed border-t2-line-soft "
                        >
                            <span className="absolute -top-3 right-3 text-[11px] font-semibold text-t2-ink-3  z-[10]">
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
                        fluid
                        currentTime={currentTime}
                        hoveredHour={hoveredHour}
                        onHourHover={setHoveredHour}
                        selectedEventId={selectedEventId}
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
                        resizeTopMV={resizeTopMV}
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

            {/* Rechte Spalte: immer offen (Kennzahlen oder Termindetails) */}
            <div className="hidden md:flex flex-1 min-w-0 sticky top-4 self-start max-h-[calc(100vh-210px)]">
                <CalendarDetailPanel
                    idleTitle={isTodayDay ? "Heute" : format(day, "EEEE", { locale: de })}
                    idleMessage={idleMessage}
                    stats={idleStats}
                    event={selectedEvent}
                    themeTitle={selectedTheme?.title}
                    themes={themes}
                    onClose={() => setSelectedEventState(null)}
                    onUpdate={selectedEvent && onEventSave ? (updates) => onEventSave(selectedEvent.id, updates) : undefined}
                    onEdit={
                        selectedEvent
                            ? () =>
                                  onDayEventClick?.(
                                      selectedEvent,
                                      document.getElementById(`event-${selectedEvent.id}`)?.getBoundingClientRect() ?? new DOMRect()
                                  )
                            : undefined
                    }
                    onDelete={selectedEvent && onEventDelete ? () => onEventDelete(selectedEvent.id) : undefined}
                    onToggleDone={
                        selectedEvent && selectedEvent.is_task && onEventSave
                            ? () => onEventSave(selectedEvent.id, { is_completed: !selectedEvent.is_completed })
                            : undefined
                    }
                />
            </div>
        </div>
    );
}
