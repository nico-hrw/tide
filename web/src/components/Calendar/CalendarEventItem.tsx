import React, { useState, useEffect } from 'react';
import { motion, useTransform, MotionValue } from 'framer-motion';
import { format, getHours, getMinutes, isSameDay } from 'date-fns';
import { useHighlight } from '@/components/HighlightContext';
import { useLinkStore } from '@/store/useLinkStore';
import { useDataStore } from '@/store/useDataStore';
import { Layers } from 'lucide-react';

// Assuming types and getEventTheme are available here, either imported or defined
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
    is_cancelled?: boolean;
    exdates?: string[];
    completed_dates?: string[];
}

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


interface CalendarEventItemProps {
    day?: Date;
    event: CalendarEvent;
    layout: Map<string, { left: number; width: number }>;
    timedEvents: CalendarEvent[];
    allEvents?: CalendarEvent[];
    isParent?: boolean;
    draggingId?: string | null;
    resizingId?: string | null;
    dayIndexOffset?: number;
    isMagnified?: boolean;
    resizeHeightMV?: MotionValue<number>;
    fallbackMV: MotionValue<number>;
    onEventClick?: (id: string, rect?: DOMRect) => void;
    onEventShare?: (e: React.MouseEvent, id: string) => void;
    onEventDelete?: (id: string) => void;
    onEventMouseDown?: (e: React.MouseEvent, id: string, start: Date) => void;
    onResizeMouseDown?: (e: React.MouseEvent, id: string, start: string, end: string) => void;
    onTaskToggle?: (id: string, currentIsCompleted: boolean) => void;
    onEventRename?: (id: string, title: string) => Promise<void>;
    cursorX: MotionValue<number>;
    cursorY: MotionValue<number>;
}

const CalendarEventItemBase: React.FC<CalendarEventItemProps> = ({
    day,
    event,
    layout,
    timedEvents,
    allEvents,
    isParent,
    draggingId,
    resizingId,
    dayIndexOffset,
    isMagnified,
    resizeHeightMV,
    fallbackMV,
    onEventClick,
    onEventShare,
    onEventDelete,
    onEventMouseDown,
    onResizeMouseDown,
    onTaskToggle,
    onEventRename,
    cursorX,
    cursorY,
}) => {
    const { highlight, isHighlighted } = useHighlight();
    const activeParentId = useDataStore(state => state.activeParentId);
    const setActiveParentId = useDataStore(state => state.setActiveParentId);

    const start = new Date(event.start);
    const end = new Date(event.end);

    // Feature 3: Multi-Day Logic
    const isMultiDay = !isSameDay(start, end);
    const currentDay = day || start;

    const isStartDay = isSameDay(currentDay, start);
    const isEndDay = isSameDay(currentDay, end);
    const isMiddleDay = isMultiDay && !isStartDay && !isEndDay;

    let startMinutes = 0;
    let durationMinutes = 0;
    let maskImage = 'none';

    if (isMultiDay) {
        if (isStartDay) {
            startMinutes = getHours(start) * 60 + getMinutes(start);
            durationMinutes = 1440 - startMinutes;
            maskImage = 'linear-gradient(to bottom, black 80%, transparent)';
        } else if (isEndDay) {
            startMinutes = 0;
            durationMinutes = getHours(end) * 60 + getMinutes(end);
            maskImage = 'linear-gradient(to bottom, transparent, black 20%)';
        } else {
            startMinutes = 0;
            durationMinutes = 1440;
        }
    } else {
        startMinutes = getHours(start) * 60 + getMinutes(start);
        durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
    }

    const startMs = start.getTime();
    const endMs = end.getTime();

    const hasOverlappingChildren = timedEvents.some(other => {
        if (other.id === event.id || (other as any).parent_id === event.id) return false;
        const otherStartMs = new Date(other.start).getTime();
        const otherEndMs = new Date(other.end).getTime();
        return otherStartMs >= startMs && otherEndMs <= endMs;
    });

    const isDragging = draggingId === event.id;
    const isResizing = resizingId === event.id;
    const pos = layout.get(event.id) || { left: 0, width: 100 };
    const theme = getEventTheme(event);
    // isParent is passed from DayColumn using the full allEvents list (not filtered timedEvents)
    const hasChildren = isParent ?? timedEvents.some(e => (e as any).parent_id === event.id);
    const isActiveParent = hasChildren && activeParentId === event.id;
    const isCancelled = !!event.is_cancelled;
    const zIndex = isActiveParent || isCancelled ? 0 : (isDragging ? 50 : 10);

    const [localTitle, setLocalTitle] = useState(event.title);

    useEffect(() => {
        setLocalTitle(event.title);
    }, [event.title, event.id]);

    const handleTitleBlur = () => {
        if (localTitle !== event.title && onEventRename) {
            onEventRename(event.id, localTitle);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLElement).blur();
        }
    };

    // This hook is now at the top level of the component.
    const liveTimeTransform = useTransform(resizeHeightMV || fallbackMV, (h) => {
        const maxDuration = 1440 - startMinutes;
        const clampedDuration = Math.min(Math.max(15, h), maxDuration);
        const newEndMinutes = startMinutes + clampedDuration;
        const hEnd = Math.floor(newEndMinutes / 60);
        const mEnd = Math.floor(newEndMinutes % 60);
        return `${hEnd.toString().padStart(2, '0')}:${mEnd.toString().padStart(2, '0')}`;
    });

    let style: any;
    if (isDragging) {
        style = {
            top: `${startMinutes}px`,
            height: `${Math.max(durationMinutes, 15)}px`,
            left: `${pos.left}%`,
            width: `${pos.width}%`,
            backgroundColor: theme.bg,
            color: theme.text,
            opacity: 0,
            zIndex: 10,
            pointerEvents: 'none',
        };
    } else if (isResizing) {
        style = {
            top: `${startMinutes}px`,
            height: resizeHeightMV,
            left: `${pos.left}%`,
            width: `${pos.width}%`,
            backgroundColor: theme.bg,
            color: theme.text,
            zIndex: 100,
            pointerEvents: 'none',
        };
    } else {
        style = {
            top: `${startMinutes}px`,
            height: `${Math.max(durationMinutes, 15)}px`,
            left: `${pos.left}%`,
            width: `${pos.width}%`,
            backgroundColor: isActiveParent ? 'transparent' : (event.color || theme.bg),
            boxShadow: isActiveParent ? `inset 0 0 20px 2px ${theme.border}` : 'none',
            color: theme.text,
            zIndex: zIndex,
            maskImage: maskImage !== 'none' ? maskImage : undefined,
            WebkitMaskImage: maskImage !== 'none' ? maskImage : undefined,
        };
        if (isCancelled) {
            style.backgroundColor = '#94a3b8'; // gray-400
            style.color = '#475569'; // gray-600
            style.opacity = 0.4;
            style.textDecoration = 'line-through';
        }
    }

    // Effect Pattern Class
    const effectClass = event.effect ? `effect-${event.effect}` : '';

    const isAdjacentTop = timedEvents.some(other => {
        if (other.id === event.id) return false;
        const otherEndMs = new Date(other.end).getTime();
        return Math.abs(otherEndMs - startMs) < 60000 && Math.abs((layout.get(other.id)?.left || 0) - pos.left) < 5;
    });

    const isAdjacentBottom = timedEvents.some(other => {
        if (other.id === event.id) return false;
        const otherStartMs = new Date(other.start).getTime();
        return Math.abs(otherStartMs - endMs) < 60000 && Math.abs((layout.get(other.id)?.left || 0) - pos.left) < 5;
    });

    let roundClass = 'rounded-xl';

    // Override corners if multi-day
    if (isMultiDay) {
        if (isStartDay) roundClass = 'rounded-t-xl rounded-b-none';
        else if (isEndDay) roundClass = 'rounded-b-xl rounded-t-none';
        else roundClass = 'rounded-none';
    } else {
        if (isAdjacentTop && isAdjacentBottom) roundClass = 'rounded-sm';
        else if (isAdjacentTop) roundClass = 'rounded-b-xl rounded-t-sm';
        else if (isAdjacentBottom) roundClass = 'rounded-t-xl rounded-b-sm';
    }

    const isHighlightedEvent = isHighlighted(event.id, 'event');

    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            style={{ ...style, borderLeft: `4px solid ${theme.border}` }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            key={event.id}
            draggable={false}
            onMouseDown={(e) => {
                if (highlight.isSelectingLink || (e.target as HTMLElement).closest('.resize-handle')) return;
                e.stopPropagation();
                // Activate the custom drag system so Shift+Lens and 60fps overlay work
                if (onEventMouseDown) {
                    onEventMouseDown(e, event.id, start);
                }
            }}
            onMouseDownCapture={(e) => {
                const { pendingLinkSource, isLinkingMode, setPendingLinkSource, setIsLinkingMode } = useLinkStore.getState();
                if (isLinkingMode || pendingLinkSource) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (pendingLinkSource) {
                        const { insertMentionIntoNote } = useDataStore.getState();
                        insertMentionIntoNote(pendingLinkSource, event.id, event.title);
                        if ((window as any).setActiveNoteId) {
                            (window as any).setActiveNoteId(pendingLinkSource);
                        }
                    }
                    setPendingLinkSource(null);
                    setIsLinkingMode(false);
                }
            }}
            className={`event-item group absolute px-2 py-1.5 cursor-pointer overflow-hidden ${isDragging || isResizing ? 'shadow-none scale-[1.01] z-[100]' : 'shadow-none hover:z-[70] z-[60]'} ${isHighlightedEvent ? 'ring-2 ring-purple-500 z-[80]' : ''} ${event.is_completed ? 'opacity-50' : ''} ${isCancelled ? 'opacity-40 grayscale pointer-events-auto' : ''} ${(isDragging || isResizing) && isMagnified ? 'opacity-20' : ''} font-medium transition-all ${roundClass} ${isActiveParent ? 'opacity-20 backdrop-blur-sm pointer-events-none' : ''} ${isMiddleDay ? 'z-0 pointer-events-none opacity-30' : ''}`}
            onClick={(e) => {
                e.stopPropagation();

                if (highlight.isSelectingLink && highlight.onLinkSelect) {
                    highlight.onLinkSelect({ id: event.id, title: event.title, type: 'event', start: event.start, rect: e.currentTarget.getBoundingClientRect() });
                } else {
                    if (activeParentId === event.id) {
                        setActiveParentId(null);
                    } else if (hasChildren) {
                        // Only enter parent-reveal mode if this event has children
                        setActiveParentId(event.id);
                    }
                    if (onEventClick) {
                        onEventClick(event.id, e.currentTarget.getBoundingClientRect());
                    }
                }
            }}
        >
            {/* Effect Overlay Layer */}
            {!isActiveParent && effectClass && (
                <div className={`absolute inset-0 pointer-events-none ${effectClass}`} style={{ mixBlendMode: 'overlay' }} />
            )}

            {isMiddleDay && (
                <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.05) 10px, rgba(0,0,0,0.05) 11px)' }} />
            )}

            {hasOverlappingChildren && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        useDataStore.getState().groupOverlappingEvents(event.id);
                    }}
                    title="Make Group"
                    className="absolute top-1 right-6 opacity-0 group-hover:opacity-100 z-50 p-1 text-gray-500 hover:text-indigo-600 transition-colors"
                >
                    <Layers size={14} />
                </button>
            )}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onEventDelete?.(event.id);
                }}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 z-50 p-1 text-gray-400 hover:text-red-500 transition-colors"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            {/* ... contents of the event item ... */}
            <div className="relative z-10 flex flex-col h-full overflow-hidden">
                <div className="flex items-start gap-1.5 min-w-0">
                    {event.is_task && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onTaskToggle?.(event.id, !!event.is_completed);
                            }}
                            className={`mt-[2px] w-3 h-3 rounded-[3px] border border-current flex-shrink-0 flex items-center justify-center cursor-pointer transition-all hover:scale-110 z-[80] ${event.is_completed ? 'opacity-40' : 'opacity-100'}`}
                            style={{ 
                                borderColor: theme.text,
                                color: theme.text 
                            }}
                        >
                            {event.is_completed && (
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            )}
                        </button>
                    )}
                    <div className={`text-[11px] font-bold leading-tight truncate pointer-events-none ${isCancelled || event.is_completed ? 'line-through opacity-60' : ''}`}>
                        {event.title || 'Untitled'}
                    </div>
                </div>

                {/* Description - shown if there's space and text exists */}
                {event.description && durationMinutes > 40 && (
                    <div className="text-[10px] opacity-80 leading-tight mt-0.5 overflow-hidden line-clamp-2 pointer-events-none font-medium">
                        {event.description?.split(';').map((part, index, array) => (
                            <React.Fragment key={index}>
                                {part}
                                {index < array.length - 1 && <br />}
                            </React.Fragment>
                        ))}
                    </div>
                )}

                {/* Conditional time rendering */}
                {durationMinutes > 30 && (
                    <div className="text-[10px] opacity-70 pointer-events-none mt-auto pb-0.5">
                        {format(start, "HH:mm")} - {format(end, "HH:mm")}
                    </div>
                )}
            </div>

            {/* Resize Handle */}
            {!isDragging && (
                <div
                    className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize z-[70] hover:bg-white/30 resize-handle"
                    onMouseDown={(e) => {
                        e.stopPropagation(); // CRITICAL: Prevents parent drag logic
                        if (onResizeMouseDown) onResizeMouseDown(e, event.id, event.start, event.end);
                    }}
                />
            )}
        </motion.div>
    );
};

export const CalendarEventItem = React.memo(CalendarEventItemBase);
