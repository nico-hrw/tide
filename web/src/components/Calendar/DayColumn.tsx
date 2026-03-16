import React, { useMemo } from "react";
import { format, isSameDay, getHours, getMinutes } from "date-fns";
import { useHighlight } from "@/components/HighlightContext";
import { motion, useTransform, MotionValue, useMotionValue } from "framer-motion";
import { CalendarEventItem } from './CalendarEventItem';
import { useDataStore } from "@/store/useDataStore";

interface CalendarEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    color?: string;
    effect?: string;
    description?: string;
    allDay?: boolean;
    is_task?: boolean;
    is_completed?: boolean;
    is_cancelled?: boolean; // NEW
    parent_id?: string | null;
}

interface DayColumnProps {
    day: Date;
    events: CalendarEvent[];
    isToday: boolean;
    currentTime?: Date;
    onEventClick?: (id: string, rect?: DOMRect) => void;
    onEventShare?: (e: React.MouseEvent, id: string) => void;
    onEventDelete?: (id: string) => void;
    onGridMouseDown?: (e: React.MouseEvent, day: Date) => void;
    onGridDoubleClick?: (e: React.MouseEvent, day: Date) => void;
    onEventMouseDown?: (e: React.MouseEvent, id: string, start: Date) => void;
    onResizeMouseDown?: (e: React.MouseEvent, id: string, start: string, end: string) => void;
    hoveredHour?: number | null;
    onHourHover?: (hour: number | null) => void;
    draggingId?: string | null;
    dragState?: any;
    creationDrag?: any;
    resizingId?: string | null;
    resizeDragState?: any;
    resizeHeightMV?: MotionValue<number>;
    creationEndYMV?: MotionValue<number>;
    onHeaderClick?: (day: Date) => void;
    onTaskToggle?: (id: string, currentIsCompleted: boolean) => void;
    onEventRename?: (id: string, title: string) => Promise<void>;
    dayIndexOffset?: number;
    snapInterval?: number;
    isMagnified?: boolean;
    onEventDrop: (eventId: string, startInitial: Date, endInitial: Date) => void;
    cursorX: MotionValue<number>;
    cursorY: MotionValue<number>;
    allEvents?: CalendarEvent[];
}

// Layout helper for overlapping events within a single day
// "Background" events (group parents with children, or multi-day midpoints) are excluded
// from collision detection so they render full-width behind all other events.
const arrangeEvents = (events: CalendarEvent[], day: Date, allDayEvents?: CalendarEvent[]) => {
    const allEvts = allDayEvents || events;

    // Determine which event IDs are "parents" (have children pointing to them)
    const parentIds = new Set(allEvts.map(e => (e as any).parent_id).filter(Boolean));

    // Separate background events from normal events
    const bgEvents: CalendarEvent[] = [];
    const normalEvents: CalendarEvent[] = [];

    events.forEach(evt => {
        const start = new Date(evt.start);
        const end = new Date(evt.end);
        const isMultiDay = !isSameDay(start, end);
        const isMiddleDay = isMultiDay && !isSameDay(day, start) && !isSameDay(day, end);
        const isParentWithChildren = parentIds.has(evt.id);
        const isCancelled = !!evt.is_cancelled;

        if (isMiddleDay || isParentWithChildren || isCancelled) {
            bgEvents.push(evt);
        } else {
            normalEvents.push(evt);
        }
    });

    const sorted = [...normalEvents].sort((a, b) => {
        if (a.start === b.start) {
            return new Date(b.end).getTime() - new Date(a.end).getTime();
        }
        return new Date(a.start).getTime() - new Date(b.start).getTime();
    });

    const clusters: CalendarEvent[][] = [];
    let currentCluster: CalendarEvent[] = [];
    let clusterEnd = 0;

    sorted.forEach(evt => {
        const start = new Date(evt.start).getTime();
        const end = new Date(evt.end).getTime();

        if (currentCluster.length === 0) {
            currentCluster.push(evt);
            clusterEnd = end;
        } else {
            if (start < clusterEnd) {
                currentCluster.push(evt);
                clusterEnd = Math.max(clusterEnd, end);
            } else {
                clusters.push(currentCluster);
                currentCluster = [evt];
                clusterEnd = end;
            }
        }
    });
    if (currentCluster.length > 0) clusters.push(currentCluster);

    const layout = new Map<string, { left: number, width: number }>();

    // Background events: full width, rendered behind everything
    bgEvents.forEach(evt => {
        layout.set(evt.id, { left: 0, width: 100 });
    });

    clusters.forEach(cluster => {
        const lanes: number[] = [];
        const eventLanes = new Map<string, number>();

        cluster.forEach(evt => {
            const start = new Date(evt.start).getTime();
            const end = new Date(evt.end).getTime();

            let placed = false;
            for (let i = 0; i < lanes.length; i++) {
                if (lanes[i] <= start) {
                    lanes[i] = end;
                    eventLanes.set(evt.id, i);
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                lanes.push(end);
                eventLanes.set(evt.id, lanes.length - 1);
            }
        });

        const widthPercent = 100 / lanes.length;
        cluster.forEach(evt => {
            const lane = eventLanes.get(evt.id) || 0;
            layout.set(evt.id, {
                left: lane * widthPercent,
                width: widthPercent
            });
        });
    });

    return layout;
};

const getEventTheme = (evt: CalendarEvent) => {
    // If we have an individual color, use it as bg
    if (evt.color) {
        return { bg: evt.color, text: '#ffffff', border: evt.color };
    }

    const effectMap: Record<string, { bg: string; text: string; border: string }> = {
        'sky': { bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc' },
        'green': { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
        'orange': { bg: '#ffedd5', text: '#c2410c', border: '#fdba74' },
        'none': { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' }
    };
    return effectMap[evt.effect || 'none'] || effectMap['none'];
};

const DayColumnBase: React.FC<DayColumnProps> = ({
    day,
    events,
    isToday,
    currentTime,
    onEventClick,
    onEventShare,
    onEventDelete,
    onGridMouseDown,
    onGridDoubleClick,
    onEventMouseDown,
    onResizeMouseDown,
    hoveredHour,
    onHourHover,
    draggingId,
    dragState,
    creationDrag,
    resizingId,
    resizeDragState,
    resizeHeightMV,
    creationEndYMV,
    onHeaderClick,
    onTaskToggle,
    onEventRename,
    dayIndexOffset,
    snapInterval = 10,
    isMagnified = false,
    onEventDrop,
    cursorX,
    cursorY,
    allEvents = [],
}) => {
    const { highlight, isHighlighted } = useHighlight();

    const activeParentId = useDataStore(state => state.activeParentId);

    const visibleEvents = useMemo(() => {
        const isEvent = (id: string) => allEvents.some(ev => ev.id === id);
        return events.filter(e => {
            if (!e.parent_id) return true;
            if (e.parent_id === activeParentId || e.id === activeParentId) return true;
            // Hide ONLY if it's a child of another EVENT. If its parent_id is a theme/group, we show it!
            if (isEvent(e.parent_id)) return false; 
            return true;
        });
    }, [events, activeParentId, allEvents]);

    // Separate all-day events from timed events
    const allDayEvents = useMemo(() => visibleEvents.filter(e => e.allDay), [visibleEvents]);
    const timedEvents = useMemo(() => visibleEvents.filter(e => !e.allDay), [visibleEvents]);

    const layout = useMemo(() => arrangeEvents(timedEvents, day, allEvents), [timedEvents, day, allEvents]);
    const currentTimeTop = currentTime ? getHours(currentTime) * 60 + getMinutes(currentTime) : 0;

    const now = currentTime || new Date();
    let currentEventInfo: string | null = null;
    let nextEventInfo: string | null = null;

    if (isToday) {
        const sortedTodayEvents = [...timedEvents].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
        const activeEvent = sortedTodayEvents.find(e => new Date(e.start) <= now && new Date(e.end) >= now);
        const upcomingEvent = sortedTodayEvents.find(e => new Date(e.start) > now);

        if (activeEvent) {
            const diff = Math.floor((new Date(activeEvent.end).getTime() - now.getTime()) / 60000);
            currentEventInfo = diff >= 60 ? `${Math.floor(diff/60)}h ${diff%60}m` : `${diff}m`;
        }
        if (upcomingEvent) {
            const diff = Math.floor((new Date(upcomingEvent.start).getTime() - now.getTime()) / 60000);
            nextEventInfo = diff >= 60 ? `in ${Math.floor(diff/60)}h ${diff%60}m` : `in ${diff}m`;
        }
    }

    // ---- 60FPS Visual transforms (bypasses React) ----
    // We use a dummy MV if props are missing to satisfy the 'useTransform' requirement (never null)
    const fallbackMV = useMotionValue(0);

    const creationPreviewTop = useTransform(creationEndYMV || fallbackMV, (currentY: number) => {
        if (!creationDrag) return "0px";
        const deltaY = currentY - creationDrag.startY;
        const startMins = creationDrag.startDay.getHours() * 60 + creationDrag.startDay.getMinutes();
        let snappoints = Math.floor(deltaY / snapInterval) * snapInterval;
        if (deltaY < 0) snappoints = Math.ceil(deltaY / snapInterval) * snapInterval;
        return (deltaY < 0 ? Math.max(0, startMins + snappoints) : startMins) + 'px';
    });

    const creationPreviewHeight = useTransform(creationEndYMV || fallbackMV, (currentY: number) => {
        if (!creationDrag) return "0px";
        const deltaY = currentY - creationDrag.startY;
        let snappoints = Math.floor(deltaY / snapInterval) * snapInterval;
        if (deltaY < 0) snappoints = Math.ceil(deltaY / snapInterval) * snapInterval;
        return Math.max(10, Math.abs(snappoints)) + 'px';
    });

    // Live end-time label for the creation preview — driven by the same MotionValue as the ghost block
    const creationEndTimeLabel = useTransform(creationEndYMV || fallbackMV, (currentY: number) => {
        if (!creationDrag) return '';
        const deltaY = currentY - creationDrag.startY;
        let snapped = Math.floor(deltaY / snapInterval) * snapInterval;
        if (deltaY < 0) snapped = Math.ceil(deltaY / snapInterval) * snapInterval;
        const startMins = creationDrag.startDay.getHours() * 60 + creationDrag.startDay.getMinutes();
        const endMins = deltaY >= 0
            ? startMins + Math.max(snapInterval, snapped)
            : startMins + snapped - snapInterval;
        const clamped = Math.max(0, Math.min(1440, endMins));
        const h = Math.floor(clamped / 60);
        const m = clamped % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    });

    const creationStartTimeStr = useMemo(() => {
        if (!creationDrag) return '';
        const h = creationDrag.startDay.getHours();
        const m = creationDrag.startDay.getMinutes();
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }, [creationDrag?.startDay.getTime()]);

    return (
        <div
            data-day-col={format(day, "yyyy-MM-dd")}
            className={`w-[150px] md:w-[200px] flex-shrink-0 border-r border-dashed border-gray-200 dark:border-slate-800/50 relative ${isToday ? 'bg-indigo-50/40 dark:bg-indigo-900/20' : 'bg-transparent'}`}
            onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
            }}
        >
            <div
                className={`
                 h-[50px] border-b border-gray-100 dark:border-slate-800/50
                 sticky top-0 z-[70] 
                 flex flex-col items-center justify-center gap-0.5 cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors
                 ${isToday ? 'bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-inset ring-indigo-500/20' : 'bg-[#F4F7F9] dark:bg-[#1A1A1A]'}
             `}
                onClick={() => {
                    useDataStore.getState().setActiveParentId(null);
                    if (onHeaderClick) onHeaderClick(day);
                }}
                onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const eventId = e.dataTransfer.getData("text/plain");
                    if (!eventId) return;

                    const draggedEvent = allEvents.find(ev => ev.id === eventId || (eventId.includes('_') && eventId.split('_')[0] === ev.id));
                    if (!draggedEvent) return;

                    const startOrig = new Date(draggedEvent.start);
                    const endOrig = new Date(draggedEvent.end);
                    const durationMs = endOrig.getTime() - startOrig.getTime();

                    const baseDate = new Date(day);
                    const newStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), startOrig.getHours(), startOrig.getMinutes());
                    const newEnd = new Date(newStart.getTime() + durationMs);

                    onEventDrop(draggedEvent.id, newStart, newEnd);
                }}
                title="Click to add all-day event"
            >
                <div className={`
                     text-base font-bold leading-tight
                     ${isToday ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-gray-100'}
                 `}>
                    {format(day, "d")}
                </div>
                <span className={`text-[10px] uppercase tracking-wider font-semibold ${isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500'}`}>{format(day, "EEEE")}</span>
            </div>

            {/* All-Day Events Area */}
            {allDayEvents.length > 0 && (
                <div className="sticky top-[50px] z-[65] w-full h-0 pointer-events-auto">
                    <div className="absolute top-0 left-0 right-0 w-[150px] md:w-[200px] bg-[#F4F7F9]/95 dark:bg-[#1A1A1A]/95 p-1 flex flex-col gap-1 backdrop-blur-sm border-b border-dashed border-gray-200 dark:border-slate-800/50">
                        {allDayEvents.map(event => {
                            const theme = getEventTheme(event);
                            const isHighlightedEvent = isHighlighted(event.id, 'event');
                            return (
                                <div
                                    key={event.id}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData("text/plain", event.id);
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (onEventClick) {
                                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                            onEventClick(event.id, rect);
                                        }
                                    }}
                                    className={`
                                    group flex items-center justify-between
                                    w-full text-xs font-semibold px-2 py-1 rounded cursor-pointer transition-all
                                    ${isHighlightedEvent ? 'ring-2 ring-purple-500 ring-offset-1 dark:ring-offset-[#1A1A1A]' : 'opacity-90 hover:opacity-100'}
                                    ${event.is_cancelled ? 'opacity-40 line-through grayscale' : ''}
                                `}
                                    style={{ backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}` }}
                                    title={event.title}
                                >
                                    <span className="truncate pr-1">{event.title}</span>
                                    {onEventDelete && (
                                        <button
                                            onMouseDown={(e) => e.stopPropagation()}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEventDelete(event.id);
                                            }}
                                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded-full bg-rose-500/20 hover:bg-rose-500/40 text-rose-500 dark:text-rose-400 shrink-0 transition-opacity"
                                            title="Delete"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div 
                className="relative h-[1440px] shrink-0" 
                onMouseDown={(e) => {
                    useDataStore.getState().setActiveParentId(null);
                    if (onGridMouseDown) onGridMouseDown(e, day);
                }}
                onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const eventId = e.dataTransfer.getData("text/plain");
                    if (!eventId) return;

                    // ARCHITECTURAL DIRECTION: Use allEvents prop to find the fresh object
                    const draggedEvent = allEvents.find(ev => ev.id === eventId || (eventId.includes('_') && eventId.split('_')[0] === ev.id));
                    if (!draggedEvent) {
                        console.error("[DragDrop] Dropped event not found in allEvents:", eventId);
                        return;
                    }

                    // SAFE DURATION CALCULATION
                    const startOrig = new Date(draggedEvent.start);
                    const endOrig = new Date(draggedEvent.end);
                    if (isNaN(startOrig.getTime()) || isNaN(endOrig.getTime())) {
                        console.error("[DragDrop] Dropped event has invalid start/end times:", draggedEvent);
                        return;
                    }
                    const durationMinutes = (endOrig.getTime() - startOrig.getTime()) / 60000;
                    if (isNaN(durationMinutes) || durationMinutes < 0) {
                        console.error("[DragDrop] Invalid duration calculated:", { durationMinutes, start: draggedEvent.start, end: draggedEvent.end });
                        return;
                    }

                    const rect = e.currentTarget.getBoundingClientRect();
                    const offsetY = parseInt(e.dataTransfer.getData('application/offsetY') || '0', 10);
                    const y = Math.max(0, e.clientY - rect.top - offsetY);
                    
                    // Assuming 1px = 1 minute as per existing logic (60px per hour)
                    let newStartMinutes = Math.round(y);

                    // Snap to the set interval (e.g., 10 mins)
                    newStartMinutes = Math.round(newStartMinutes / snapInterval) * snapInterval;

                    // Clamp to within the day
                    newStartMinutes = Math.max(0, Math.min(newStartMinutes, 1440 - durationMinutes));

                    const baseDate = new Date(day);
                    if (isNaN(baseDate.getTime())) {
                        console.error("[DragDrop] Column date is invalid:", day);
                        return;
                    }

                    const newStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), Math.floor(newStartMinutes / 60), newStartMinutes % 60);
                    const newEnd = new Date(newStart.getTime() + durationMinutes * 60000);

                    if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) {
                        console.error("[DragDrop] Math resulted in NaN", { newStartMinutes });
                        return;
                    }

                    onEventDrop(draggedEvent.id, newStart, newEnd);
                }}
            >
                {/* Current Time Line */}
                {/* Current Time Line - REMOVED (Moved to Global) */}


                {Array.from({ length: 24 }).map((_, i) => (
                    <div
                        key={i}
                        className={`h-[60px] border-b border-dashed border-gray-100 dark:border-slate-800/50 ${hoveredHour === i ? 'bg-black/[0.01] dark:bg-white/[0.01]' : 'bg-transparent'}`}
                        onMouseEnter={() => onHourHover && onHourHover(i)}
                        onMouseLeave={() => onHourHover && onHourHover(null)}
                    ></div>
                ))}

                {/* Events */}
                {timedEvents.map(event => {
                    // Use the FULL allEvents list (which includes hidden children) to determine if parent
                    const isParent = allEvents.some(e => (e as any).parent_id === event.id);
                    return (
                    <CalendarEventItem
                        key={event.id}
                        day={day}
                        event={event}
                        layout={layout}
                        timedEvents={timedEvents}
                        allEvents={allEvents}
                        isParent={isParent}
                        draggingId={draggingId}
                        resizingId={resizingId}
                        dayIndexOffset={dayIndexOffset}
                        isMagnified={isMagnified}
                        resizeHeightMV={resizeHeightMV}
                        fallbackMV={fallbackMV}
                        onEventClick={onEventClick}
                        onEventShare={onEventShare}
                        onEventDelete={onEventDelete}
                        onEventMouseDown={onEventMouseDown}
                        onResizeMouseDown={onResizeMouseDown}
                        onTaskToggle={onTaskToggle}
                        onEventRename={onEventRename}
                        cursorX={cursorX}
                        cursorY={cursorY}
                    />
                    );
                })}

                {/* Creation Preview */}
                {creationDrag && isSameDay(creationDrag.startDay, day) && (
                    <motion.div
                        className={`absolute left-1 right-1 rounded-lg bg-gray-500/30 border-2 border-dashed border-gray-500 z-50 backdrop-blur-sm pointer-events-none ${isMagnified ? 'opacity-20' : ''}`}
                        style={{ top: creationPreviewTop, height: creationPreviewHeight }}
                    >
                        <div className="flex flex-col gap-0 p-1.5">
                            <div className="text-[10px] font-bold text-gray-700 dark:text-gray-200 leading-tight">New Event</div>
                            <div className="flex items-center gap-0.5 mt-0.5">
                                <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-300 tabular-nums">{creationStartTimeStr}</span>
                                <span className="text-[9px] text-gray-400 mx-0.5">–</span>
                                <motion.span className="text-[10px] font-semibold text-gray-600 dark:text-gray-300 tabular-nums">{creationEndTimeLabel}</motion.span>
                            </div>
                        </div>
                    </motion.div>
                )}

                {isToday && (
                    <div 
                        className="absolute left-0 right-0 z-[60] pointer-events-none flex flex-col items-start"
                        style={{ top: `${currentTimeTop}px` }}
                    >
                        {/* Minimal pulse line */}
                        <div className="absolute left-0 right-0 h-[2px] bg-red-500 z-40 opacity-40 animate-pulse"></div>
                        
                        {/* Minimal Label */}
                        {currentEventInfo && (
                            <div className="absolute left-1 -top-[16px] text-[10px] font-medium text-gray-500 dark:text-gray-400">
                                {currentEventInfo} left
                            </div>
                        )}
                    </div>
                )}

                {/* Minimal Next Event Label positioned at its own start time */}
                {isToday && nextEventInfo && (() => {
                    const upcomingEvent = [...timedEvents].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()).find(e => new Date(e.start) > now);
                    if (!upcomingEvent) return null;
                    const nextTimeTop = getHours(new Date(upcomingEvent.start)) * 60 + getMinutes(new Date(upcomingEvent.start));
                    return (
                        <div 
                            className="absolute left-1 z-[60] pointer-events-none text-[10px] font-medium text-gray-400 dark:text-gray-500"
                            style={{ top: `${nextTimeTop - 16}px` }}
                        >
                            {nextEventInfo}
                        </div>
                    );
                })()}

            </div>

            {/* End of Day visual boundary */}
            <div className="h-[1px] w-[1440px] relative shrink-0 bg-gray-200 dark:bg-gray-800 hidden"></div>
        </div>
    );
};

export default React.memo(DayColumnBase);
