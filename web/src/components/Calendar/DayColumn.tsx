import React, { useMemo } from "react";
import { format, isSameDay, getHours, getMinutes } from "date-fns";
import { useHighlight } from "@/components/HighlightContext";
import { motion, useTransform, MotionValue, useMotionValue } from "framer-motion";

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
    dayIndexOffset?: number;
    snapInterval?: number;
    isMagnified?: boolean;
}

// Layout helper for overlapping events within a single day
const arrangeEvents = (events: CalendarEvent[]) => {
    const sorted = [...events].sort((a, b) => {
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
    const effectMap: Record<string, { bg: string; text: string; border: string }> = {
        'sky': { bg: 'var(--event-sky-bg)', text: 'var(--event-sky-text)', border: 'var(--event-sky-border)' },
        'green': { bg: 'var(--event-green-bg)', text: 'var(--event-green-text)', border: 'var(--event-green-border)' },
        'orange': { bg: 'var(--event-orange-bg)', text: 'var(--event-orange-text)', border: 'var(--event-orange-border)' },
        'none': { bg: 'var(--event-default-bg)', text: 'var(--event-default-text)', border: 'var(--event-default-border)' }
    };
    return effectMap[evt.effect || 'none'] || effectMap['none'];
};

export default function DayColumn({
    day,
    events,
    isToday,
    currentTime,
    onEventClick,
    onEventShare,
    onEventDelete,
    onEventMouseDown,
    onGridMouseDown,
    onGridDoubleClick,
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
    dayIndexOffset,
    snapInterval = 10,
    isMagnified = false
}: DayColumnProps) {
    const { highlight, isHighlighted } = useHighlight();

    // Separate all-day events from timed events
    const allDayEvents = useMemo(() => events.filter(e => e.allDay), [events]);
    const timedEvents = useMemo(() => events.filter(e => !e.allDay), [events]);

    const layout = useMemo(() => arrangeEvents(timedEvents), [timedEvents]);
    const currentTimeTop = currentTime ? getHours(currentTime) * 60 + getMinutes(currentTime) : 0;

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

    return (
        <div
            data-day-col={format(day, "yyyy-MM-dd")}
            className={`w-[150px] md:w-[200px] flex-shrink-0 border-r border-dashed border-gray-200 dark:border-slate-800/50 relative ${isToday ? 'bg-indigo-50/40 dark:bg-indigo-900/20' : 'bg-transparent'}`}
        >
            {/* Day Header */}
            <div
                className={`
                 h-[50px] border-b border-gray-100 dark:border-slate-800/50
                 sticky top-0 z-[70] 
                 flex flex-col items-center justify-center gap-0.5 cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors
                 ${isToday ? 'bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-inset ring-indigo-500/20' : 'bg-[#F4F7F9] dark:bg-[#1A1A1A]'}
             `}
                onClick={() => onHeaderClick && onHeaderClick(day)}
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

            {/* Grid Area */}
            <div className="relative" onMouseDown={(e) => onGridMouseDown && onGridMouseDown(e, day)}>
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
                    const start = new Date(event.start);
                    const end = new Date(event.end);
                    const startMinutes = start.getHours() * 60 + start.getMinutes();
                    const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);

                    const isDragging = draggingId === event.id;
                    const isResizing = resizingId === event.id;
                    const pos = layout.get(event.id) || { left: 0, width: 100 };
                    const theme = getEventTheme(event);
                    const zIndex = isDragging ? 50 : 10;

                    let style: any;
                    if (isDragging) {
                        style = {
                            top: `${startMinutes}px`,
                            height: `${Math.max(durationMinutes, 15)}px`,
                            left: `${pos.left}%`,
                            width: `${pos.width}%`,
                            backgroundColor: theme.bg,
                            color: theme.text,
                            opacity: 0.3,
                            zIndex: 10,
                            pointerEvents: 'none'
                        };
                    } else if (isResizing) {
                        style = {
                            top: `${startMinutes}px`,
                            height: resizeHeightMV || `${Math.max(durationMinutes, 15)}px`,
                            left: `${pos.left}%`,
                            width: `${pos.width}%`,
                            backgroundColor: theme.bg,
                            color: theme.text,
                            zIndex: 100,
                            pointerEvents: 'none'
                        };
                    } else {
                        style = {
                            top: `${startMinutes}px`,
                            height: `${Math.max(durationMinutes, 15)}px`,
                            left: `${pos.left}%`,
                            width: `${pos.width}%`,
                            backgroundColor: theme.bg,
                            color: theme.text,
                            zIndex: zIndex
                        };
                    }

                    const startMs = start.getTime();
                    const endMs = end.getTime();

                    const isAdjacentTop = timedEvents.some(other => {
                        if (other.id === event.id) return false;
                        const otherEndMs = new Date(other.end).getTime();
                        const isTimeMatch = Math.abs(otherEndMs - startMs) < 60000; // within 1 minute

                        const otherPos = layout.get(other.id) || { left: 0, width: 100 };
                        // Events must be in strictly the same column to naturally snap
                        const isHorizontalOverlap = Math.abs(otherPos.left - pos.left) < 5 && Math.abs(otherPos.width - pos.width) < 5;

                        return isTimeMatch && isHorizontalOverlap;
                    });

                    const isAdjacentBottom = timedEvents.some(other => {
                        if (other.id === event.id) return false;
                        const otherStartMs = new Date(other.start).getTime();
                        const isTimeMatch = Math.abs(otherStartMs - endMs) < 60000; // within 1 minute

                        const otherPos = layout.get(other.id) || { left: 0, width: 100 };
                        const isHorizontalOverlap = Math.abs(otherPos.left - pos.left) < 5 && Math.abs(otherPos.width - pos.width) < 5;

                        return isTimeMatch && isHorizontalOverlap;
                    });

                    let roundClass = 'rounded-xl';
                    if (isAdjacentTop && isAdjacentBottom) {
                        roundClass = 'rounded-t-sm rounded-b-sm';
                    } else if (isAdjacentTop) {
                        roundClass = 'rounded-b-xl rounded-t-sm';
                    } else if (isAdjacentBottom) {
                        roundClass = 'rounded-t-xl rounded-b-sm';
                    }

                    const isHighlightedEvent = isHighlighted(event.id, 'event');

                    return (
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            style={{
                                ...style,
                                borderLeft: `4px solid ${theme.border}`
                            }}
                            transition={{
                                delay: Math.abs(dayIndexOffset || 0) * 0.15 + 0.1,
                                type: "spring", stiffness: 400, damping: 30
                            }}
                            key={event.id}
                            onMouseDown={(e) => {
                                // Skip drag setup during magic link selection — let onClick handle it cleanly
                                if (highlight.isSelectingLink) return;
                                e.stopPropagation(); // Stop grid creation
                                if (onEventMouseDown) onEventMouseDown(e, event.id, start);
                            }}
                            className={`
                                event-item group
                                absolute px-2 py-1.5 cursor-pointer overflow-hidden
                                ${isDragging || isResizing ? 'shadow-none scale-[1.01] z-[100]' : 'shadow-none hover:z-[70] z-[60]'}
                                ${isHighlightedEvent ? 'ring-2 ring-purple-500 z-[80]' : ''}
                                ${event.is_completed ? 'opacity-50' : ''}
                                ${(isDragging || isResizing) && isMagnified ? 'opacity-20' : ''}
                                font-medium transition-all ${roundClass}
                            `}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (highlight.isSelectingLink && highlight.onLinkSelect) {
                                    highlight.onLinkSelect({ id: event.id, title: event.title, type: 'event', rect: e.currentTarget.getBoundingClientRect() });
                                } else if (onEventClick) {
                                    onEventClick(event.id, e.currentTarget.getBoundingClientRect());
                                }
                            }}
                        >

                            {/* Header Actions */}
                            {!isDragging && !isResizing && (
                                <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-[70]">
                                    {/* Share Button */}
                                    <button
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onEventShare ? onEventShare(e, event.id) : onEventClick?.(event.id);
                                        }}
                                        className="p-1 hover:bg-black/10 rounded-full text-[inherit]"
                                        title="Share Event"
                                    >
                                        <div className="w-3 h-3 flex items-center justify-center">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
                                        </div>
                                    </button>

                                    {/* Delete Button */}
                                    {onEventDelete && (
                                        <button
                                            onMouseDown={(e) => e.stopPropagation()}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEventDelete(event.id);
                                            }}
                                            className="p-1 hover:bg-rose-500/20 rounded-full text-red-500"
                                            title="Delete Event"
                                        >
                                            <div className="w-3 h-3 flex items-center justify-center">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                                            </div>
                                        </button>
                                    )}
                                </div>
                            )}

                            <div className={`relative z-10 font-bold text-sm ${pos.width < 70 ? 'truncate' : ''} leading-tight pr-4 ${event.is_completed ? 'line-through opacity-70' : ''}`}>{event.title}</div>
                            {pos.width >= 70 && (
                                <div className="relative z-10 text-xs opacity-90 mt-0.5 font-medium truncate">
                                    {format(start, "HH:mm")} - {format(end, "HH:mm")}
                                </div>
                            )}
                            {durationMinutes >= 60 && event.description && (
                                <div className="relative z-10 text-[10px] opacity-80 mt-1 line-clamp-2 leading-tight">
                                    {event.description.replace(/\[([^\]]+)\]\(tide:\/\/[^/]+\/[^)]+\)/g, "🔗 $1")}
                                </div>
                            )}

                            {/* Task Checkbox — 1-click toggle, no popover */}
                            {event.is_task && !isDragging && !isResizing && (
                                <button
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (onTaskToggle) onTaskToggle(event.id, !!event.is_completed);
                                    }}
                                    className="absolute bottom-1.5 left-2 z-[75] transition-transform hover:scale-110"
                                    title={event.is_completed ? 'Mark as incomplete' : 'Mark as complete'}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={event.is_completed ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={event.is_completed ? 'text-emerald-500' : 'text-white/80'}>
                                        <circle cx="12" cy="12" r="10" />
                                        {event.is_completed && <polyline points="9 12 11 14 15 10" stroke="white" strokeWidth="2.5" />}
                                    </svg>
                                </button>
                            )}

                            {/* Resize Handle */}
                            {!isDragging && !isResizing && (
                                <div
                                    className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize z-[70] hover:bg-white/30"
                                    onMouseDown={(e) => {
                                        e.stopPropagation();
                                        if (onResizeMouseDown) onResizeMouseDown(e, event.id, event.start, event.end);
                                    }}
                                />
                            )}
                        </motion.div>
                    );
                })}

                {/* Creation Preview */}
                {creationDrag && isSameDay(creationDrag.startDay, day) && (
                    <motion.div
                        className={`absolute left-1 right-1 rounded-lg bg-gray-500/30 border-2 border-dashed border-gray-500 z-50 backdrop-blur-sm pointer-events-none transition-all duration-75 ${isMagnified ? 'opacity-20' : ''}`}
                        style={{ top: creationPreviewTop, height: creationPreviewHeight }}
                    >
                        <div className="text-xs font-bold text-gray-700 dark:text-gray-300 p-1">New Event</div>
                    </motion.div>
                )}
                {/* End of Day visual boundary */}
                <div className="h-[1px] w-full bg-gray-200 dark:bg-gray-800"></div>

                {/* Spacer to allow scrolling past midnight without hiding content behind dock */}
                <div className="h-[150px] w-full bg-gradient-to-b from-gray-50/50 to-transparent dark:from-gray-900/50 dark:to-transparent pointer-events-none border-r border-dashed border-gray-100 dark:border-slate-800/50"></div>
            </div>
        </div>
    );
}
