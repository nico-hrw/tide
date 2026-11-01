import React, { useState } from "react";
import type { ComponentProps } from "react";
import type { MotionValue } from "framer-motion";
import { format, isSameDay } from "date-fns";
import DayColumn from "@/components/Calendar/DayColumn";
import { DragGhost } from "./DragGhost";
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
}: DesktopDayViewProps) {
    const [hoveredHour, setHoveredHour] = useState<number | null>(null);

    const dayKey = format(day, "yyyy-MM-dd");
    const dayEvents = eventsByDay.timedMap.get(dayKey) || [];
    const allDayEventsGroup = eventsByDay.allDayMap.get(dayKey) || [];

    return (
        <div className="flex-1 flex max-w-4xl mx-auto w-full min-h-full">
            {/* Time Column (Sticky Left) */}
            <div className="w-[60px] flex-shrink-0 sticky left-0 z-[400] bg-white dark:bg-slate-950 border-r border-gray-100/80 dark:border-slate-900/50 h-fit min-h-full pb-[40px]">
                <div className="h-[50px] border-b border-gray-100/80 dark:border-slate-900/50 sticky top-0 z-[410] bg-white dark:bg-slate-950" />
                {Array.from({ length: 24 }).map((_, i) => (
                    <div
                        key={i}
                        className="h-[60px] relative group border-b border-dashed border-gray-100/50 dark:border-slate-900/40"
                    >
                        <span className="absolute -top-3 right-3 text-[11px] font-semibold text-gray-400 dark:text-gray-500 z-[10]">
                            {i}:00
                        </span>
                    </div>
                ))}
            </div>

            {/* Single Day Column Wrapper */}
            <div className="flex-1 flex relative items-start pb-[40px]" ref={gridDaysRef}>
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
                    onEventClick={onDayEventClick}
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
                />

                {/* Drag Ghost within Day Column */}
                {dragState && draggingId && !isPreciseMode && (
                    <DragGhost dragState={dragState} draggingId={draggingId} events={events} cursorX={cursorX} cursorY={cursorY} />
                )}
            </div>
        </div>
    );
}
