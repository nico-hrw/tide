import React, { useMemo, useRef, useEffect } from "react";
import { format, isSameDay, getHours, getMinutes } from "date-fns";
import { useHighlight } from "@/components/HighlightContext";
import { motion, useTransform, MotionValue, useMotionValue } from "framer-motion";
import { CalendarEventItem } from './CalendarEventItem';
import { useDataStore } from "@/store/useDataStore";
import { extractTimeFromText } from "@/lib/timeParser";

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
    shading?: number;
    parent_id?: string | null;
}

interface DayColumnProps {
    day: Date;
    events: CalendarEvent[];
    isToday: boolean;
    currentTime?: Date;
    onEventClick?: (event: CalendarEvent, rect?: DOMRect) => void;
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
    onEventCreate?: (start: Date, end: Date, isAllDay?: boolean, extraMeta?: any) => Promise<string | null>;
    cursorX: MotionValue<number>;
    cursorY: MotionValue<number>;
    allEvents?: CalendarEvent[];
    readOnly?: boolean;
    hourHeight?: number;
}

// Layout helper for overlapping events within a single day
// "Background" events (group parents with children, or multi-day midpoints) are excluded
// from collision detection so they render full-width behind all other events.
const arrangeEvents = (timedEvents: CalendarEvent[], day: Date, allEvents: CalendarEvent[], overlapMode: 'overlap' | 'stack' = 'stack') => {
    const allEvts = allEvents || timedEvents;

    // Determine which event IDs are "parents" (have children pointing to them)
    const parentIds = new Set(allEvts.map(e => (e as any).parent_id).filter(Boolean));

    // Separate background events from normal events
    const bgEvents: CalendarEvent[] = [];
    const normalEvents: CalendarEvent[] = [];

    timedEvents.forEach(evt => {
        const start = new Date(evt.start);
        const end = new Date(evt.end);
        const isMultiDay = !isSameDay(start, end);
        const isMiddleDay = isMultiDay && !isSameDay(day, start) && !isSameDay(day, end);
        const isParentWithChildren = parentIds.has(evt.id);
        const isCancelled = !!evt.is_cancelled;

        if (isMiddleDay || isParentWithChildren) {
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

        if (overlapMode === 'overlap') {
            cluster.forEach(evt => {
                const lane = eventLanes.get(evt.id) || 0;
                layout.set(evt.id, {
                    left: lane * 15,
                    width: Math.max(50, 100 - (lane * 15))
                });
            });
        } else {
            const widthPercent = 100 / lanes.length;
            cluster.forEach(evt => {
                const lane = eventLanes.get(evt.id) || 0;
                layout.set(evt.id, {
                    left: lane * widthPercent,
                    width: widthPercent
                });
            });
        }
    });

    return layout;
};

const getEventTheme = (evt: CalendarEvent, palette: 'modern-dark' | 'soft-pastels' | 'classic-tide' = 'modern-dark') => {
    let col = evt.color?.toLowerCase() || '';
    
    const isPink = col === 'pink' || col.startsWith('#ec') || col.startsWith('#d9') || col.startsWith('#e8') || col.startsWith('#f4') || col.startsWith('#f0');
    const isRed = col === 'red' || col.startsWith('#ef') || col.startsWith('#f8') || col.startsWith('#ea') || col.startsWith('#eb');
    const isBlue = col === 'blue' || col.startsWith('#3b') || col.startsWith('#25') || col.startsWith('#1d') || col.startsWith('#63') || col.startsWith('#4f');
    const isGreen = col === 'green' || col.startsWith('#10') || col.startsWith('#22') || col.startsWith('#15');
    const isOrange = col === 'orange' || col.startsWith('#f5') || col.startsWith('#f9') || col.startsWith('#fb') || col.startsWith('#d9');

    if (palette === 'soft-pastels') {
        if (isPink || evt.effect === 'pink') return { bg: '#EDE9FE', text: '#1F2937', border: '#EDE9FE' };
        if (isBlue || evt.effect === 'sky') return { bg: '#E2E8F0', text: '#1F2937', border: '#E2E8F0' };
        if (isGreen || evt.effect === 'green') return { bg: '#D1FAE5', text: '#1F2937', border: '#D1FAE5' };
        if (isOrange || evt.effect === 'orange') return { bg: '#FEF3C7', text: '#1F2937', border: '#FEF3C7' };
        if (isRed || evt.effect === 'red') return { bg: '#FEE2E2', text: '#1F2937', border: '#FEE2E2' };
        return { bg: '#F1F5F9', text: '#1F2937', border: '#F1F5F9' };
    }

    if (palette === 'classic-tide') {
        if (isPink || evt.effect === 'pink') return { bg: '#6366F1', text: '#FFFFFF', border: '#6366F1' };
        if (isBlue || evt.effect === 'sky') return { bg: '#3B82F6', text: '#FFFFFF', border: '#3B82F6' };
        if (isGreen || evt.effect === 'green') return { bg: '#10B981', text: '#FFFFFF', border: '#10B981' };
        if (isOrange || evt.effect === 'orange') return { bg: '#F97316', text: '#FFFFFF', border: '#F97316' };
        if (isRed || evt.effect === 'red') return { bg: '#EF4444', text: '#FFFFFF', border: '#EF4444' };
        return { bg: '#475569', text: '#FFFFFF', border: '#475569' };
    }

    // Default: 'modern-dark' (rich colors with white text)
    if (isPink || evt.effect === 'pink') return { bg: '#7C3AED', text: '#FFFFFF', border: '#7C3AED' };
    if (isBlue || evt.effect === 'sky') return { bg: '#0284C7', text: '#FFFFFF', border: '#0284C7' };
    if (isGreen || evt.effect === 'green') return { bg: '#059669', text: '#FFFFFF', border: '#059669' };
    if (isOrange || evt.effect === 'orange') return { bg: '#D97706', text: '#FFFFFF', border: '#D97706' };
    if (isRed || evt.effect === 'red') return { bg: '#DC2626', text: '#FFFFFF', border: '#DC2626' };
    return { bg: '#64748B', text: '#FFFFFF', border: '#64748B' };
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
    onEventCreate,
    cursorX,
    cursorY,
    allEvents = [],
    readOnly = false,
    hourHeight = 60
}: DayColumnProps) => {
    const { highlight, isHighlighted } = useHighlight();

    const gearedMouseRef = useRef({ x: 0, y: 0 });
    const physicalMouseRef = useRef({ x: 0, y: 0 });
    const isPreciseModeRef = useRef(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '') || (document.activeElement as HTMLElement)?.isContentEditable) return;
            if (e.key === 'Alt' || e.key === 'Shift') {
                isPreciseModeRef.current = true;
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Alt' || e.key === 'Shift') {
                isPreciseModeRef.current = false;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

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

    const calendarOverlapMode = useDataStore(s => s.calendarOverlapMode || 'stack');
    const calendarColorPalette = useDataStore(s => s.calendarColorPalette || 'modern-dark');
    const layout = useMemo(() => arrangeEvents(timedEvents, day, allEvents, calendarOverlapMode), [timedEvents, day, allEvents, calendarOverlapMode]);
    const currentTimeTop = currentTime ? getHours(currentTime) * 60 + getMinutes(currentTime) + currentTime.getSeconds() / 60 : 0;

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
        const startMins = creationDrag.startDay.getHours() * 60 + creationDrag.startDay.getMinutes();
        let snappoints = Math.floor(deltaY / snapInterval) * snapInterval;
        if (deltaY < 0) snappoints = Math.ceil(deltaY / snapInterval) * snapInterval;
        // Clamp: if dragging forward, end can never exceed 1440 min (midnight)
        const rawHeight = Math.max(10, Math.abs(snappoints));
        const maxHeight = deltaY >= 0
            ? Math.min(rawHeight, 1440 - startMins) // forward drag: cap at midnight
            : Math.min(rawHeight, startMins);         // backward drag: cap at start-of-day
        return maxHeight + 'px';
    });

    // Live end-time label for the creation preview — driven by the same MotionValue as the ghost block
    const creationEndTimeLabel = useTransform(creationEndYMV || fallbackMV, (currentY: number) => {
        if (!creationDrag) return '';
        const deltaY = currentY - creationDrag.startY;
        let snapped = Math.floor(deltaY / snapInterval) * snapInterval;
        if (deltaY < 0) snapped = Math.ceil(deltaY / snapInterval) * snapInterval;
        const startMins = creationDrag.startDay.getHours() * 60 + creationDrag.startDay.getMinutes();
        const rawEnd = deltaY >= 0
            ? startMins + Math.max(snapInterval, snapped)
            : startMins + snapped - snapInterval;
        // Hard clamp: never show past 23:59 (1440) or before 00:00
        const clamped = Math.max(0, Math.min(1440, rawEnd));
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
            className={`w-[150px] md:w-[200px] flex-shrink-0 border-r border-gray-100/80 dark:border-slate-900/50 relative z-[10] bg-transparent`}
            onMouseMove={(e) => {
                physicalMouseRef.current = { x: e.clientX, y: e.clientY };
                gearedMouseRef.current = { x: e.clientX, y: e.clientY };
            }}
            onDragOver={(e) => {
                if (readOnly) return;
                e.preventDefault();
                e.stopPropagation();
            }}
        >
            <div
                className={`
                 h-[50px] border-b border-gray-100/80 dark:border-slate-900/50
                 sticky top-0 z-[2000]
                 flex items-center justify-center gap-2 cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors
                 bg-white dark:bg-slate-950
             `}
                onClick={() => {
                    if (readOnly) return;
                    useDataStore.getState().setActiveParentId(null);
                    if (onHeaderClick) onHeaderClick(day);
                }}
                onDrop={(e) => {
                    if (readOnly) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const eventId = e.dataTransfer.getData("text/plain");
                    if (!eventId) return;

                    const jsonPayload = e.dataTransfer.getData('application/json');
                    let isTaskDrop = false;
                    let draggedTask = null;
                    if (jsonPayload) {
                        try {
                            const data = JSON.parse(jsonPayload);
                            if (data.type === 'task') {
                                isTaskDrop = true;
                                draggedTask = useDataStore.getState().tasks.find(t => t.id === data.id);
                            }
                        } catch(err) {}
                    }

                    if (isTaskDrop && draggedTask) {
                        const baseDate = new Date(day);
                        const newStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 0, 0);
                        const newEnd = new Date(newStart.getTime() + 24 * 60 * 60000 - 1);
                        
                        // use onEventCreate passed from parent
                        if (onEventCreate) {
                            onEventCreate(newStart, newEnd, true, { title: draggedTask.title, is_task: true, linkedTaskId: draggedTask.id, description: draggedTask.description, color: draggedTask.color });
                        }
                        
                        useDataStore.getState().updateTask(draggedTask.id, { scheduledDate: newStart.toISOString() });
                        return;
                    }

                    const draggedEvent = allEvents.find(ev => ev.id === eventId || (eventId.includes('_') && eventId.split('_')[0] === ev.id));
                    if (!draggedEvent) {
                        // Quick Capture Fallback! If it's not an event ID, it might be plain text from the editor.
                        if (eventId && eventId.length > 0 && !eventId.match(/^[0-9a-f]{8}-[0-9a-f]{4}/i)) {
                            const { title } = extractTimeFromText(eventId); // time is ignored for all-day
                            const baseDate = new Date(day);
                            const newStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 0, 0);
                            const newEnd = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 23, 59, 59);
                            
                            if (onEventCreate) {
                                onEventCreate(newStart, newEnd, true, { title: title || 'New Event' });
                            }
                        }
                        return;
                    }

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
                {isToday ? (
                    <div className="px-3.5 py-1.5 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs font-bold flex items-center justify-center gap-1 shadow-sm select-none">
                        <span>{format(day, "d")}</span>
                        <span className="opacity-60 uppercase text-[9px] font-black">–</span>
                        <span className="opacity-80 uppercase text-[9px] tracking-wide font-black">{format(day, "EEE")}</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-1 select-none">
                        <span className="text-[20px] font-bold text-gray-800 dark:text-gray-200">
                            {format(day, "d")}
                        </span>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                            {format(day, "EEE")}
                        </span>
                    </div>
                )}
            </div>

            {/* Today column — subtle solid gray overlay */}
            {isToday && (
                <div
                    className="absolute inset-0 pointer-events-none z-[1] bg-gray-50/50 dark:bg-white/[0.015]"
                    style={{
                        top: '50px',
                    }}
                />
            )}

            {/* All-Day Events Area */}
            {allDayEvents.length > 0 && (
                <div className="sticky top-[50px] z-[65] w-full h-0 pointer-events-auto">
                    <div className="absolute top-0 left-0 right-0 w-[150px] md:w-[200px] bg-white/30 dark:bg-slate-900/40 backdrop-blur-2xl p-1 flex flex-col gap-1 border-b border-gray-200/60 dark:border-slate-800/60 rounded-b-xl">
                        {allDayEvents.map(event => {
                            const theme = getEventTheme(event, calendarColorPalette);
                            const isHighlightedEvent = isHighlighted(event.id, 'event');
                            return (
                                <div
                                    key={event.id}
                                    draggable={!readOnly}
                                    onDragStart={(e) => {
                                        if (readOnly) return;
                                        e.dataTransfer.setData("text/plain", event.id);
                                        e.dataTransfer.setData("tide/calendar-event", JSON.stringify(event));
                                        
                                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                        const clone = (e.currentTarget as HTMLElement).cloneNode(true) as HTMLElement;
                                        clone.style.width = `${rect.width}px`;
                                        clone.style.height = `${rect.height}px`;
                                        clone.style.position = 'absolute';
                                        clone.style.top = '-9999px';
                                        clone.style.zIndex = '999999';
                                        clone.style.opacity = '0.9';
                                        document.body.appendChild(clone);
                                        e.dataTransfer.setDragImage(clone, e.clientX - rect.left, e.clientY - rect.top);
                                        setTimeout(() => document.body.removeChild(clone), 0);
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (onEventClick) {
                                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                            onEventClick(event, rect);
                                        }
                                    }}
                                    className={`
                                    group flex items-center justify-between relative overflow-hidden
                                    w-full text-xs font-semibold px-2 py-1 rounded cursor-pointer transition-all
                                    ${isHighlightedEvent ? 'ring-2 ring-purple-500 ring-offset-1 dark:ring-offset-[#1A1A1A]' : 'opacity-90 hover:opacity-100'}
                                    ${event.is_cancelled ? 'opacity-40 line-through grayscale font-normal' : ''}
                                `}
                                    style={{ 
                                        backgroundColor: theme.bg, 
                                        color: theme.text, 
                                        border: `1px solid ${theme.border}` 
                                    }}
                                    title={event.title}
                                >
                                    {/* Shading Overlay Layer */}
                                    {event.shading && event.shading > 0 && (
                                        <div 
                                            className="absolute inset-0 pointer-events-none" 
                                            style={{ 
                                                backgroundColor: 
                                                    event.shading === 1 ? 'rgba(90, 90, 90, 0.2)' :
                                                    event.shading === 2 ? 'rgba(130, 130, 130, 0.4)' :
                                                    event.shading === 3 ? 'rgba(170, 170, 170, 0.6)' :
                                                    'rgba(210, 210, 210, 0.8)',
                                                mixBlendMode: 'saturation'
                                            }} 
                                        />
                                    )}
                                    <span className="truncate pr-1 relative z-10">{event.title}</span>
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
                className="relative h-[1440px] shrink-0 z-[10]" 
                onMouseDown={(e) => {
                    if (readOnly) return;
                    useDataStore.getState().setActiveParentId(null);
                    if (onGridMouseDown) onGridMouseDown(e, day);
                }}
                onDragOver={(e) => {
                    if (readOnly) return;
                    e.preventDefault();
                    e.stopPropagation();
                }}
                onDrop={(e) => {
                    if (readOnly) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const eventId = e.dataTransfer.getData("text/plain");
                    if (!eventId) return;

                    const jsonPayload = e.dataTransfer.getData('application/json');
                    let isTaskDrop = false;
                    let draggedTask = null;
                    if (jsonPayload) {
                        try {
                            const data = JSON.parse(jsonPayload);
                            if (data.type === 'task') {
                                isTaskDrop = true;
                                draggedTask = useDataStore.getState().tasks.find(t => t.id === data.id);
                            }
                        } catch(err) {}
                    }

                    const mouseX = gearedMouseRef.current.x;
                    const mouseY = gearedMouseRef.current.y;
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const relativeY = mouseY - rect.top;
                    
                    const snapIntervalMinutes = isPreciseModeRef.current ? 1 : 15;
                    const minuteHeight = hourHeight / 60;
                    
                    let newStartMinutes = Math.floor(relativeY / minuteHeight);
                    newStartMinutes = Math.floor(newStartMinutes / snapIntervalMinutes) * snapIntervalMinutes;

                    if (isTaskDrop && draggedTask) {
                        const baseDate = new Date(day);
                        const newStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), Math.floor(newStartMinutes / 60), newStartMinutes % 60);
                        const newEnd = new Date(newStart.getTime() + 60 * 60000); // 1 hour default
                        
                        if (onEventCreate) {
                            onEventCreate(newStart, newEnd, false, { title: draggedTask.title, is_task: true, linkedTaskId: draggedTask.id, description: draggedTask.description, color: draggedTask.color });
                        }
                        
                        useDataStore.getState().updateTask(draggedTask.id, { scheduledDate: newStart.toISOString() });
                        return;
                    }

                    // ARCHITECTURAL DIRECTION: Use allEvents prop to find the fresh object
                    const draggedEvent = allEvents.find(ev => ev.id === eventId || (eventId.includes('_') && eventId.split('_')[0] === ev.id));
                    if (!draggedEvent) {
                        // Quick Capture Fallback! If it's not an event ID, it might be plain text from the editor.
                        if (eventId && eventId.length > 0 && !eventId.match(/^[0-9a-f]{8}-[0-9a-f]{4}/i)) {
                            const { title, startMins, endMins } = extractTimeFromText(eventId);
                            const baseDate = new Date(day);
                            
                            let finalStartMins = startMins !== null ? startMins : newStartMinutes;
                            let finalEndMins = endMins !== null ? endMins : finalStartMins + 60;
                            
                            const newStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), Math.floor(finalStartMins / 60), finalStartMins % 60);
                            const newEnd = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), Math.floor(finalEndMins / 60), finalEndMins % 60);
                            
                            if (onEventCreate) {
                                onEventCreate(newStart, newEnd, false, { title: title || 'New Event' });
                            }
                            return;
                        }
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
                        className={`border-b border-dashed ${isToday ? 'border-indigo-200 dark:border-indigo-800' : 'border-gray-200 dark:border-slate-800'} ${hoveredHour === i ? 'bg-black/[0.01] dark:bg-white/[0.01]' : 'bg-transparent'}`}
                        style={{ height: 'var(--hour-height, 60px)' }}
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
                        className="absolute left-0 right-0 z-[60] pointer-events-none flex items-center"
                        style={{ top: `${currentTimeTop}px` }}
                    >
                        {/* Red indicator dot */}
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 z-50 shadow-sm relative -ml-[3px]" />
                        
                        {/* Minimal pulse line */}
                        <div className="absolute left-0 right-0 h-[1.5px] bg-red-500/80 z-40 opacity-70"></div>
                        
                        {/* Minimal Label */}
                        {currentEventInfo && (
                            <div className="absolute left-3 -top-[14px] text-[9px] font-semibold text-red-500 dark:text-red-400 bg-white dark:bg-slate-950 px-1 rounded shadow-sm">
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
