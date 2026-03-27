
"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import { format, addDays, startOfWeek, isSameDay, getMinutes, getHours, startOfDay } from "date-fns";
import { useHighlight } from '../HighlightContext';

interface CalendarEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    color?: string;
    effect?: string;
    description?: string;
    parent_id?: string | null;
    allDay?: boolean;
}

interface WeekViewProps {
    events: CalendarEvent[];
    onEventCreate?: (start: Date, end: Date) => Promise<void>;
    onEventUpdate?: (id: string, start: Date, end: Date) => Promise<void>;
    onEventRename?: (id: string, title: string) => Promise<void>;
    onEventDelete?: (id: string) => Promise<void>;
    onEventSave?: (id: string, updates: Partial<CalendarEvent> & { parent_id?: string | null }) => void;
    onEventClick?: (id: string) => void;
    onEventShare?: (e: React.MouseEvent, id: string) => void;
    onPrevWeek?: () => void;
    onNextWeek?: () => void;
    editingEventId: string | null;
    date: Date;
    themes?: { id: string; title: string; effect?: string }[];
}

// Layout helper for overlapping events
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


export default function WeekView({
    events,
    onEventUpdate,
    onEventCreate,
    onEventDelete,
    editingEventId,
    onEventRename,
    onEventClick,
    onEventShare,
    onPrevWeek,
    onNextWeek,
    date,
    onEventSave,
    themes = []
}: WeekViewProps) {
    // Date State
    const startOfCurrentWeek = startOfWeek(date, { weekStartsOn: 1 });
    const days = useMemo(() => {
        return Array.from({ length: 7 }).map((_, i) => addDays(startOfCurrentWeek, i));
    }, [startOfCurrentWeek]);

    const { highlight, isHighlighted } = useHighlight();

    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const lastNavTimeRef = useRef<number>(0);
    const today = new Date(); // Re-add today for usage in render

    // Prevent click event after dragging
    const isDraggingRef = useRef(false);
    const pendingDragRef = useRef<{ id: string, startX: number, startY: number, startMinutes: number, initialX: number, initialWidth: number } | null>(null);

    // Auto-scroll to current time on mount/date change
    useEffect(() => {
        if (scrollRef.current) {
            if (isSameDay(date, new Date())) {
                const now = new Date();
                const hour = now.getHours();
                // Scroll to 2 hours before now mean to center it roughly
                const scrollHour = Math.max(0, hour - 2);
                scrollRef.current.scrollTop = scrollHour * 60;
            } else {
                scrollRef.current.scrollTop = 8 * 60; // Default to 8 AM
            }
        }
    }, [date]);

    const [currentTime, setCurrentTime] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    const currentTimeTop = getHours(currentTime) * 60 + getMinutes(currentTime);

    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dragState, setDragState] = useState<{ startY: number, startX: number, originalTop: number, currentTop: number, currentLeft: number, originalDayIndex: number, initialX: number, initialWidth: number } | null>(null);
    const [creationDrag, setCreationDrag] = useState<{ startDay: Date, startY: number, currentY: number } | null>(null);
    const [resizingId, setResizingId] = useState<string | null>(null);
    const [resizeDragState, setResizeDragState] = useState<{ startY: number, originalHeight: number, currentHeight: number } | null>(null);

    // --- Popover State ---
    const [activePopover, setActivePopover] = useState<{ id: string, rect: DOMRect } | null>(null);
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (target instanceof Element && target.closest('.event-item')) {
                return;
            }
            if (popoverRef.current && !popoverRef.current.contains(target)) {
                setActivePopover(null);
            }
        };

        if (activePopover) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [activePopover]);

    useEffect(() => {
        if (!draggingId && !creationDrag && !resizingId && !pendingDragRef.current) return;

        const handleMouseMove = (e: MouseEvent) => {
            // 1. Handle Pending Drag -> Real Drag Transition
            if (pendingDragRef.current) {
                const deltaX = Math.abs(e.clientX - pendingDragRef.current.startX);
                const deltaY = Math.abs(e.clientY - pendingDragRef.current.startY);

                if (deltaX > 5 || deltaY > 5) {
                    setDraggingId(pendingDragRef.current.id);
                    setDragState({
                        startY: pendingDragRef.current.startY,
                        startX: pendingDragRef.current.startX,
                        originalTop: pendingDragRef.current.startMinutes,
                        currentTop: pendingDragRef.current.startMinutes,
                        currentLeft: 0,
                        originalDayIndex: 0, // This will be updated on mouse up
                        initialX: pendingDragRef.current.initialX,
                        initialWidth: pendingDragRef.current.initialWidth
                    });
                    pendingDragRef.current = null;
                    isDraggingRef.current = true;
                }
                return;
            }

            if (draggingId && dragState) {
                const deltaY = e.clientY - dragState.startY;
                const deltaX = e.clientX - dragState.startX;

                // Only mark as dragging if moved beyond threshold
                if (!isDraggingRef.current && (Math.abs(deltaY) > 10 || Math.abs(deltaX) > 10)) {
                    isDraggingRef.current = true;
                }

                if (isDraggingRef.current) {
                    setDragState({
                        ...dragState,
                        currentTop: dragState.originalTop + deltaY,
                        currentLeft: deltaX
                    });
                }
            } else if (creationDrag) {
                const deltaY = e.clientY - creationDrag.startY;
                if (!isDraggingRef.current && Math.abs(deltaY) > 10) {
                    isDraggingRef.current = true;
                }
                setCreationDrag({ ...creationDrag, currentY: e.clientY });
            } else if (resizingId && resizeDragState) {
                const deltaY = e.clientY - resizeDragState.startY;

                if (!isDraggingRef.current && Math.abs(deltaY) > 10) {
                    isDraggingRef.current = true;
                }

                if (isDraggingRef.current) {
                    setResizeDragState({
                        ...resizeDragState,
                        currentHeight: resizeDragState.originalHeight + deltaY
                    });
                }
            }
        };

        const handleMouseUp = async (e: MouseEvent) => {
            // Clear pending drag if any (was just a click)
            if (pendingDragRef.current) {
                if (onEventClick) onEventClick(pendingDragRef.current.id);
                pendingDragRef.current = null;
                // Reset isDraggingRef in case it was set by a tiny movement
                isDraggingRef.current = false;
                return;
            }

            if (isDraggingRef.current || draggingId || creationDrag || resizingId) {
                await handleGlobalMouseUp(e);
            } else {
                // If we were "dragging" but didn't meet threshold, just clear state
                setDraggingId(null);
                setDragState(null);
                setCreationDrag(null);
                setResizingId(null);
                setResizeDragState(null);
            }
            // Add a small delay for click handlers to fire before resetting
            setTimeout(() => { isDraggingRef.current = false; }, 50);
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [draggingId, dragState, creationDrag, resizingId, resizeDragState, events, onEventUpdate, onEventCreate, days]);

    const handleGlobalMouseUp = async (e: MouseEvent) => {
        if (draggingId && dragState && onEventUpdate) {
            const event = events.find(e => e.id === draggingId);
            if (event) {
                // Determine target day based on drop position x-coordinate
                // We need to find which day column the mouse is over
                const dayCols = document.querySelectorAll('[data-day-col]');
                let targetDayIndex = dragState.originalDayIndex;

                dayCols.forEach((col, index) => {
                    const rect = col.getBoundingClientRect();
                    if (e.clientX >= rect.left && e.clientX <= rect.right) {
                        targetDayIndex = index;
                    }
                });

                const targetDay = days[targetDayIndex];

                // Calculate time
                // We need to find the relative Y within that column.
                // Since columns are aligned, we can use the stored startY relative to the original column 
                // but adjusted by deltaY. 
                // Better approach: Get the rect of the target column and calculate Y relative to it.
                // If we didn't land on a column (e.g. sidebar), we might revert or snap to closest.

                // Let's assume we found a target day.
                // We need the top of the grid area for that day. 
                // Since all days are aligned, we can use the container top or any day col top.
                // The 'dragState.currentTop' was properly tracking Y-movement.
                // But 'currentTop' was in minutes? No, let's check how it was initialized. 
                // It was initialized as 'startMinutes'. But we added 'deltaY' (pixels) to it.
                // This mixes units (minutes vs pixels). 1 min = 1 px in our rendering (60px = 60 mins).
                // So adding pixels to minutes directly works IF the scale is 1px/min.

                const snappedTop = Math.round(dragState.currentTop / 15) * 15;
                const newHours = Math.floor(snappedTop / 60);
                const newMinutes = snappedTop % 60;

                if (newHours >= 0 && newHours < 24) {
                    const oldStart = new Date(event.start);
                    const oldEnd = new Date(event.end);
                    const duration = oldEnd.getTime() - oldStart.getTime();

                    const newStart = new Date(targetDay);
                    newStart.setHours(newHours, newMinutes, 0, 0);
                    const newEnd = new Date(newStart.getTime() + duration);

                    await onEventUpdate(draggingId, newStart, newEnd);
                }
            }
            setDraggingId(null);
            setDragState(null);
        } else if (creationDrag && onEventCreate) {
            const deltaPx = creationDrag.currentY - creationDrag.startY;
            let durationMins = Math.floor(deltaPx / 15) * 15;
            if (durationMins < 15) durationMins = 15;

            const start = new Date(creationDrag.startDay);
            const end = new Date(start.getTime() + durationMins * 60000);

            if (end <= start) end.setTime(start.getTime() + 15 * 60000);

            await onEventCreate(start, end);
            setCreationDrag(null);
        } else if (resizingId && resizeDragState && onEventUpdate) {
            const event = events.find(e => e.id === resizingId);
            if (event) {
                const deltaY = e.clientY - resizeDragState.startY;
                const newHeight = Math.max(15, resizeDragState.originalHeight + deltaY);
                const snappedHeight = Math.max(15, Math.round(newHeight / 15) * 15);
                const start = new Date(event.start);
                const end = new Date(start.getTime() + snappedHeight * 60000);
                await onEventUpdate(resizingId, start, end);
            }
            setResizingId(null);
            setResizeDragState(null);
        }
    };

    const handleEventMouseDown = (e: React.MouseEvent, id: string, start: Date) => {
        if (e.button !== 0) return;
        e.stopPropagation();

        const startMinutes = getHours(start) * 60 + getMinutes(start);

        const el = e.currentTarget as HTMLElement;
        const scrollContainer = scrollRef.current;
        if (!scrollContainer || !scrollContainer.firstElementChild) return;

        const elRect = el.getBoundingClientRect();
        const containerRect = scrollContainer.firstElementChild.getBoundingClientRect();

        const initialX = elRect.left - containerRect.left;
        const initialWidth = elRect.width;

        pendingDragRef.current = {
            id,
            startX: e.clientX,
            startY: e.clientY,
            startMinutes,
            initialX,
            initialWidth
        };
    };

    const handleGridMouseDown = (e: React.MouseEvent, day: Date) => {
        if (!onEventCreate) return;
        if (e.button !== 0) return; // Only left click
        e.preventDefault();
        // Don't stop propagation here to allow other interactions if needed, 
        // but for creation we usually want to consume it.

        const gridEl = e.currentTarget as HTMLElement;
        const rect = gridEl.getBoundingClientRect();
        const clickY = e.clientY - rect.top; // Relative to the day column top

        const hour = Math.floor(clickY / 60);
        const minute = Math.floor((clickY % 60) / 15) * 15;

        const start = new Date(day);
        start.setHours(hour, minute, 0, 0);

        setCreationDrag({
            startDay: start,
            startY: e.clientY,
            currentY: e.clientY
        });
    };

    // Simplified Scroll Handling - Let browser handle horizontal scroll
    // Removed custom onWheel handler to allow native touchpad/mouse wheel scrolling

    return (
        <div className="flex flex-col h-full select-none">
            <div className="flex h-full flex-col relative bg-white dark:bg-black" ref={containerRef}>
                {/* Header Placeholder (Sticky) */}
                <div className="flex border-b border-gray-100 dark:border-slate-800/50 bg-white dark:bg-black z-[70] sticky top-0 shadow-sm">
                    <div className="w-[60px] flex-shrink-0 border-r border-gray-100 dark:border-slate-800/50 bg-white dark:bg-black"></div>
                </div>

                <div
                    className="flex-1 overflow-auto relative"
                    ref={scrollRef}
                >
                    <div className="flex min-w-max relative">
                        {/* Time Column */}
                        <div className="w-[60px] flex-shrink-0 sticky left-0 z-[70] bg-white dark:bg-black border-r border-gray-100 dark:border-slate-800/50">
                            <div className="h-[50px] border-b border-gray-100 dark:border-slate-800/50 bg-white dark:bg-black sticky top-0 z-[70]"></div>
                            {Array.from({ length: 24 }).map((_, i) => (
                                <div key={i} className="h-[60px] border-b border-dashed border-gray-200 dark:border-slate-800/50 relative">
                                    <span className="absolute -top-3 right-2 text-xs font-medium text-gray-400">{i}:00</span>
                                </div>
                            ))}
                            <div className="h-[150px] w-full border-r border-gray-100 dark:border-slate-800/50 relative">
                                <div className="absolute top-2 right-2 text-[10px] font-medium text-gray-400">0:00</div>
                            </div>
                        </div>

                        {/* Current Time Line */}
                        <div
                            className="absolute left-[60px] right-0 h-[1px] bg-[#EF4444] z-[60] pointer-events-none"
                            style={{ top: `${currentTimeTop + 50}px` }}
                        >
                            <div className="w-1.5 h-1.5 rounded-full bg-[#EF4444] absolute -left-[3px] -top-[2px]"></div>
                        </div>

                        {/* Days */}
                        {days.map(day => {
                            const dayEvents = events.filter(e => {
                                const eStart = new Date(e.start);
                                const eEnd = new Date(e.end);

                                if (e.allDay) {
                                    const startD = startOfDay(eStart);
                                    const endD = startOfDay(eEnd);
                                    const checkD = startOfDay(day);
                                    return checkD >= startD && checkD <= endD;
                                }

                                return isSameDay(eStart, day);
                            });
                            const layout = arrangeEvents(dayEvents);
                            const isDayToday = isSameDay(day, today);

                            return (
                                <div
                                    key={day.toISOString()}
                                    data-day-col={day.toISOString()}
                                    className="w-[150px] md:w-[200px] flex-shrink-0 border-r border-gray-100 dark:border-slate-800/50 relative bg-transparent"
                                >
                                    {/* Day Header */}
                                    <div className={`
                                         h-[50px] border-b border-gray-100 dark:border-slate-800/50 
                                         sticky top-0 z-[70] 
                                         flex items-center justify-center gap-1.5
                                         ${isDayToday ? 'bg-rose-50 dark:bg-rose-950/20 ring-1 ring-inset ring-rose-500/20' : 'bg-[#F4F7F9] dark:bg-[#1A1A1A]'}
                                     `}>
                                        <div className={`
                                             text-base font-medium
                                             ${isDayToday ? 'text-rose-700 dark:text-rose-300' : 'text-gray-500 dark:text-gray-400'}
                                         `}>
                                            {format(day, "d")}
                                        </div>
                                        <span className={`text-sm font-medium ${isDayToday ? 'text-rose-400 dark:text-rose-500' : 'text-gray-400'}`}>-</span>
                                        <span className={`text-sm font-medium ${isDayToday ? 'text-rose-600 dark:text-rose-400' : 'text-gray-500'}`}>{format(day, "EEE")}</span>
                                    </div>

                                    {/* Grid Area */}
                                    <div className="relative" onMouseDown={(e) => handleGridMouseDown(e, day)}>
                                        {Array.from({ length: 24 }).map((_, i) => (
                                            <div key={i} className="h-[60px] border-b border-dashed border-gray-200 dark:border-slate-800/50"></div>
                                        ))}

                                        {/* Events */}
                                        {dayEvents.map(event => {
                                            const start = new Date(event.start);
                                            const end = new Date(event.end);
                                            const startMinutes = start.getHours() * 60 + start.getMinutes();
                                            const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);

                                            const isDragging = draggingId === event.id;
                                            if (isDragging) return null;

                                            const isResizing = resizingId === event.id;
                                            const pos = layout.get(event.id) || { left: 0, width: 100 };
                                            const theme = getEventTheme(event);
                                            const zIndex = isDragging ? 50 : 10;

                                            const currentDuration = isResizing && resizeDragState ? resizeDragState.currentHeight : durationMinutes;

                                            const style = isResizing && resizeDragState ? {
                                                top: `${startMinutes}px`,
                                                height: `${Math.max(resizeDragState.currentHeight, 15)}px`,
                                                left: `${pos.left}%`,
                                                width: `${pos.width}%`,
                                                backgroundColor: theme.bg,
                                                color: theme.text,
                                                zIndex: 100,
                                                pointerEvents: 'none' as const
                                            } : {
                                                top: `${startMinutes}px`,
                                                height: `${Math.max(durationMinutes, 15)}px`,
                                                left: `${pos.left}%`,
                                                width: `${pos.width}%`,
                                                backgroundColor: theme.bg,
                                                color: theme.text,
                                                zIndex: zIndex
                                            };

                                            const startMs = new Date(event.start).getTime();
                                            const endMs = new Date(event.end).getTime();

                                            const isAdjacentTop = dayEvents.some(other => {
                                                if (other.id === event.id) return false;
                                                const otherEndMs = new Date(other.end).getTime();
                                                const isTimeMatch = Math.abs(otherEndMs - startMs) < 60000; // within 1 minute

                                                const otherPos = layout.get(other.id) || { left: 0, width: 100 };
                                                const isHorizontalOverlap = Math.abs(otherPos.left - pos.left) < 5 && Math.abs(otherPos.width - pos.width) < 5;

                                                return isTimeMatch && isHorizontalOverlap;
                                            });

                                            const isAdjacentBottom = dayEvents.some(other => {
                                                if (other.id === event.id) return false;
                                                const otherStartMs = new Date(other.start).getTime();
                                                const isTimeMatch = Math.abs(otherStartMs - endMs) < 60000;

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
                                                <div
                                                    key={event.id}
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation();
                                                        handleEventMouseDown(e, event.id, start);
                                                    }}
                                                    onClick={(e) => {
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        setActivePopover({ id: event.id, rect });

                                                        if (onEventClick) onEventClick(event.id);
                                                    }}
                                                    className={`
                                                    event-item group
                                                    absolute px-2 py-1.5 cursor-pointer overflow-hidden
                                                    ${isResizing ? 'shadow-none scale-[1.01] z-[100]' : 'shadow-none hover:z-[70] z-[60]'}
                                                    font-medium transition-all ${roundClass}
                                                `}
                                                    style={{
                                                        ...style,
                                                        borderLeft: `4px solid ${theme.border}`
                                                    }}
                                                >
                                                    {/* Header Actions */}
                                                    {!isDragging && !isResizing && (
                                                        <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onMouseDown={(e) => e.stopPropagation()}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (onEventShare) {
                                                                        onEventShare(e, event.id);
                                                                    } else if (onEventClick) {
                                                                        const wrapper = (e.currentTarget as HTMLElement).closest('.event-item');
                                                                        if (wrapper) {
                                                                            setActivePopover({ id: event.id, rect: wrapper.getBoundingClientRect() });
                                                                        }
                                                                        onEventClick(event.id);
                                                                    }
                                                                }}
                                                                className="p-1 hover:bg-black/10 rounded-full text-[inherit]"
                                                                title="Share Event"
                                                            >
                                                                <div className="w-3 h-3 flex items-center justify-center">
                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
                                                                </div>
                                                            </button>
                                                            <button
                                                                onMouseDown={(e) => e.stopPropagation()}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (onEventDelete) onEventDelete(event.id);
                                                                }}
                                                                className="p-1 hover:bg-rose-500/20 rounded-full text-red-500"
                                                                title="Delete"
                                                            >
                                                                <div className="w-3 h-3 flex items-center justify-center">
                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                                                </div>
                                                            </button>
                                                        </div>
                                                    )}

                                                    <div className="font-medium text-sm truncate leading-tight pr-8">{event.title}</div>
                                                    {currentDuration > 30 && (
                                                        <div className="text-xs opacity-90 mt-0.5 font-medium truncate">
                                                            {format(start, "HH:mm")} - {format(new Date(start.getTime() + currentDuration * 60000), "HH:mm")}
                                                        </div>
                                                    )}

                                                    {/* Resize Handle */}
                                                    {!isDragging && (
                                                        <div
                                                            className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-white/20 transition-colors"
                                                            onMouseDown={(e) => {
                                                                e.stopPropagation();
                                                                if (e.button !== 0) return;
                                                                setResizingId(event.id);
                                                                setResizeDragState({
                                                                    startY: e.clientY,
                                                                    originalHeight: durationMinutes,
                                                                    currentHeight: durationMinutes
                                                                });
                                                            }}
                                                        />
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {/* Creation Preview */}
                                        {creationDrag && isSameDay(creationDrag.startDay, day) && (() => {
                                            const deltaY = creationDrag.currentY - creationDrag.startY;
                                            const startMins = creationDrag.startDay.getHours() * 60 + creationDrag.startDay.getMinutes();
                                            let snappoints = Math.floor(deltaY / 15) * 15;
                                            if (deltaY < 0) snappoints = Math.ceil(deltaY / 15) * 15;

                                            const top = deltaY < 0 ? Math.max(0, startMins + snappoints) : startMins;
                                            const height = Math.max(15, Math.abs(snappoints));

                                            return (
                                                <div
                                                    className="absolute left-1 right-1 rounded-lg bg-gray-500/30 border-2 border-dashed border-gray-500 z-50 backdrop-blur-sm pointer-events-none transition-all duration-75"
                                                    style={{ top: `${top}px`, height: `${height}px` }}
                                                >
                                                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 p-1">New Event</div>
                                                </div>
                                            );
                                        })()}
                                        {/* Spacer to allow scrolling past midnight */}
                                        <div className="h-[1px] w-full bg-gray-200 dark:bg-gray-800 mt-1"></div>
                                        <div className="h-[150px] w-full bg-gradient-to-b from-gray-50/50 to-transparent dark:from-gray-900/50 dark:to-transparent pointer-events-none border-r border-gray-100 dark:border-slate-800/50"></div>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Global Drag Layer */}
                        {draggingId && dragState && (() => {
                            const event = events.find(e => e.id === draggingId);
                            if (!event) return null;
                            const theme = getEventTheme(event);
                            const durationMinutes = (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000;

                            const draggedStart = new Date(event.start);
                            const currentHours = Math.floor(dragState.currentTop / 60);
                            const currentMins = Math.round(dragState.currentTop % 60);
                            draggedStart.setHours(currentHours, currentMins, 0, 0);
                            const draggedEnd = new Date(draggedStart.getTime() + durationMinutes * 60000);

                            return (
                                <div
                                    className="absolute px-2 py-1.5 cursor-pointer overflow-hidden outline transition-all outline-2 outline-indigo-500/50 shadow-2xl scale-[1.01] z-[1000] font-medium rounded-xl"
                                    style={{
                                        top: `${dragState.currentTop}px`,
                                        height: `${Math.max(durationMinutes, 15)}px`,
                                        left: `${dragState.initialX + dragState.currentLeft}px`,
                                        width: `${dragState.initialWidth}px`,
                                        backgroundColor: theme.bg,
                                        color: theme.text,
                                        borderLeft: `4px solid ${theme.border}`,
                                        pointerEvents: 'none',
                                    }}
                                >
                                    <div className="text-xs font-medium leading-tight select-none">
                                        {event.title || 'Untitled Event'}
                                    </div>
                                    <div className="text-[10px] font-medium opacity-80 select-none">
                                        {format(draggedStart, 'HH:mm')} - {format(draggedEnd, 'HH:mm')}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>

            {/* Global Floating Event Popover */}
            {activePopover && (() => {
                const event = events.find(e => e.id === activePopover.id);
                if (!event) return null;

                const theme = getEventTheme(event);

                // Calculate position to avoid edge clipping (basic logic)
                let top = activePopover.rect.top;
                let left = activePopover.rect.right + 10; // Pop out to the right

                // Very simple heuristic to stay on screen
                if (window.innerWidth - left < 350) {
                    left = activePopover.rect.left - 360; // Pop out to the left
                }

                if (top < 50) top = 50;

                return (
                    <div
                        ref={popoverRef}
                        className="fixed z-[100] w-[340px] bg-white rounded-2xl shadow-2xl border border-gray-100 p-5 flex flex-col gap-3"
                        style={{ top: `${top}px`, left: `${left}px` }}
                    >
                        {/* Header */}
                        <div className="flex items-start justify-between">
                            <input
                                value={event.title}
                                onChange={(e) => onEventSave && onEventSave(event.id, { title: e.target.value })}
                                className="text-lg font-semibold text-gray-900 leading-tight pr-4 bg-transparent border-none focus:ring-0 p-0 w-full outline-none"
                                placeholder="Event Title"
                            />
                            <button
                                onClick={() => setActivePopover(null)}
                                className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>

                        {/* Theme Select */}
                        <div className="flex items-center">
                            <select
                                value={event.parent_id || 'general-theme'}
                                onChange={(e) => {
                                    const val = e.target.value === 'general-theme' ? null : e.target.value;
                                    onEventSave && onEventSave(event.id, { parent_id: val });
                                }}
                                className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider outline-none cursor-pointer border appearance-none"
                                style={{ backgroundColor: theme.bg, color: theme.text, borderColor: theme.border }}
                            >
                                <option value="general-theme">No Theme</option>
                                {themes.map(t => (
                                    <option key={t.id} value={t.id}>{t.title}</option>
                                ))}
                            </select>
                        </div>

                        {/* Time Row */}
                        <div className="flex items-center gap-2 text-gray-600 mt-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            <span className="text-sm font-medium">
                                {format(new Date(event.start), "EEEE, dd. MMM")} • {format(new Date(event.start), "HH:mm")} - {format(new Date(event.end), "HH:mm")}
                            </span>
                        </div>

                        {/* Notes */}
                        <div className="flex gap-2 text-gray-500 mt-2 bg-gray-50 p-3 rounded-xl border border-gray-100/50">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            <textarea
                                value={event.description || ''}
                                onChange={(e) => onEventSave && onEventSave(event.id, { description: e.target.value })}
                                placeholder="Add description..."
                                className="text-sm leading-relaxed w-full bg-transparent border-none focus:ring-0 p-0 outline-none resize-none min-h-[40px] appearance-none"
                            />
                        </div>
                    </div>
                );
            })()}

            {/* Click-away Listener */}
            {activePopover && (
                <div
                    className="fixed inset-0 z-[90]"
                    onClick={() => setActivePopover(null)}
                />
            )}
        </div>
    );
}
