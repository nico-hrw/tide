import React, { useState } from "react";
import type { ComponentProps } from "react";
import type { MotionValue } from "framer-motion";
import { format, addDays, isSameDay } from "date-fns";
import DayColumn from "@/components/Calendar/DayColumn";
import { DragGhost } from "./DragGhost";
import type { CalendarEvent, CalendarViewProps, CreationDrag, DragState, ResizeDragState } from "./types";

interface CalendarWeekTimeGridProps {
    loadedWeeks: Date[];
    eventsByDay: { timedMap: Map<string, CalendarEvent[]>; allDayMap: Map<string, CalendarEvent[]> };
    events: CalendarEvent[];
    currentTime: Date;
    gridDaysRef: React.RefObject<HTMLDivElement | null>;
    isPreciseMode: boolean;
    isPreciseModeRef: React.MutableRefObject<boolean>;
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

/** Sticky time column + day columns (all weeks) + custom drag ghost. */
export function CalendarWeekTimeGrid({
    loadedWeeks,
    eventsByDay,
    events,
    currentTime,
    gridDaysRef,
    isPreciseMode,
    isPreciseModeRef,
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
}: CalendarWeekTimeGridProps) {
    // --- Hover State ---
    const [hoveredHour, setHoveredHour] = useState<number | null>(null);

    return (
        <>
                {/* Time Column (Sticky Left) */}
                <div className="w-[60px] flex-shrink-0 sticky left-0 z-[400] bg-white dark:bg-slate-950 border-r border-gray-100/80 dark:border-slate-900/50 h-fit min-h-full pb-[40px]">
                    {/* Corner */}
                    <div className="h-[50px] border-b border-gray-100/80 dark:border-slate-900/50 sticky top-0 z-[410] bg-white dark:bg-slate-950"></div>
                    {
                        Array.from({ length: 24 }).map((_, i) => (
                            <div key={i} className="h-[60px] relative group border-b border-dashed border-gray-100/50 dark:border-slate-900/40">
                                <span className="absolute -top-3 right-3 text-[11px] font-semibold text-gray-400 dark:text-gray-500 z-[10]">{i}:00</span>
                            </div>
                        ))
                    }
                </div>

                {/* Days Wrapper with Relative positioning for the Time Line */}
                <div className="flex relative items-start pb-[40px]" ref={gridDaysRef}>



                {
                    loadedWeeks.map(weekStart => {
                        return Array.from({ length: 7 }).map((_, i) => {
                            const day = addDays(weekStart, i);
                            const dayKey = format(day, "yyyy-MM-dd");
                            const dayEvents = eventsByDay.timedMap.get(dayKey) || [];
                            const allDayEventsGroup = eventsByDay.allDayMap.get(dayKey) || [];

                            return (
                                <DayColumn
                                    key={day.toISOString()}
                                    day={day}
                                    events={[...dayEvents, ...allDayEventsGroup]}
                                    allEvents={events}
                                    isToday={isSameDay(day, new Date())}
                                    dayIndexOffset={Math.floor((day.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))}
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
                                    // DnD States
                                    draggingId={draggingId}
                                    dragState={dragState}
                                    creationDrag={creationDrag}
                                    resizingId={resizingId}
                                    resizeDragState={resizeDragState}
                                    // Performance MotionValues
                                    resizeHeightMV={resizeHeightMV}
                                    creationEndYMV={creationEndYMV}
                                    onHeaderClick={(clickedDay) => {
                                        // Create all-day event
                                        const start = new Date(clickedDay);
                                        start.setHours(0, 0, 0, 0);
                                        const end = new Date(clickedDay);
                                        end.setHours(23, 59, 59, 999);

                                        if (onEventCreate) {
                                            onEventCreate(start, end, true, { title: 'New All-Day Event', allDay: true });
                                        }
                                    }}
                                    onTaskToggle={(id, currentIsCompleted) => {
                                        if (onEventSave) onEventSave(id, { is_completed: !currentIsCompleted });
                                    }}
                                    onEventRename={onEventRename}
                                    snapInterval={isPreciseModeRef.current ? 1 : 10}
                                    isMagnified={isPreciseMode}
                                    onEventDrop={async (eventId: string, start: Date, end: Date) => {
                                        if (onEventUpdate) {
                                            await onEventUpdate(eventId, start, end);
                                        }
                                    }}
                                    cursorX={cursorX}
                                    cursorY={cursorY}
                                    />
                            );
                        });
                    })
                }

                    {/* Custom-drag ghost - 60fps via MotionValues, no React re-renders */}
                    {draggingId && dragState && (
                        <DragGhost
                            draggingId={draggingId}
                            dragState={dragState}
                            events={events}
                            cursorX={cursorX}
                            cursorY={cursorY}
                            grabOffsetY={dragState.grabOffsetY}
                        />
                    )}

                    {/* End-of-calendar hatching strip — explicitly at 24:00 (50px header + 24×60px) */}
                    <div
                        className="absolute left-0 right-0 pointer-events-none"
                        style={{
                            top: '1490px',
                            height: '40px',
                            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,0.04) 5px, rgba(0,0,0,0.04) 10px)',
                            borderTop: '1px solid rgba(0,0,0,0.08)',
                        }}
                    />
                </div >
        </>
    );
}
