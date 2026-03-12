import React, { useState, useEffect } from 'react';
import { motion, useTransform, MotionValue } from 'framer-motion';
import { format, getHours, getMinutes } from 'date-fns';
import { useHighlight } from '@/components/HighlightContext';
import { useLinkStore } from '@/store/useLinkStore';
import { useDataStore } from '@/store/useDataStore';

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
}

const getEventTheme = (evt: CalendarEvent) => {
    const effectMap: Record<string, { bg: string; text: string; border: string }> = {
        'sky': { bg: 'var(--event-sky-bg)', text: 'var(--event-sky-text)', border: 'var(--event-sky-border)' },
        'green': { bg: 'var(--event-green-bg)', text: 'var(--event-green-text)', border: 'var(--event-green-border)' },
        'orange': { bg: 'var(--event-orange-bg)', text: 'var(--event-orange-text)', border: 'var(--event-orange-border)' },
        'none': { bg: 'var(--event-default-bg)', text: 'var(--event-default-text)', border: 'var(--event-default-border)' }
    };
    return effectMap[evt.effect || 'none'] || effectMap['none'];
};


interface CalendarEventItemProps {
    event: CalendarEvent;
    layout: Map<string, { left: number; width: number }>;
    timedEvents: CalendarEvent[];
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
    event,
    layout,
    timedEvents,
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

    const start = new Date(event.start);
    const end = new Date(event.end);
    const startMinutes = getHours(start) * 60 + getMinutes(start);
    const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);

    const isDragging = draggingId === event.id;
    const isResizing = resizingId === event.id;
    const pos = layout.get(event.id) || { left: 0, width: 100 };
    const theme = getEventTheme(event);
    const zIndex = isDragging ? 50 : 10;

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
            backgroundColor: theme.bg,
            color: theme.text,
            zIndex: zIndex,
        };
    }

    const startMs = start.getTime();
    const endMs = end.getTime();

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
    if (isAdjacentTop && isAdjacentBottom) roundClass = 'rounded-t-sm rounded-b-sm';
    else if (isAdjacentTop) roundClass = 'rounded-b-xl rounded-t-sm';
    else if (isAdjacentBottom) roundClass = 'rounded-t-xl rounded-b-sm';

    const isHighlightedEvent = isHighlighted(event.id, 'event');

    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            style={{ ...style, borderLeft: `4px solid ${theme.border}` }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            key={event.id}
            draggable={!isResizing} // Disable dragging while resizing
            onDragStart={(e) => {
                if (isResizing) {
                    e.preventDefault();
                    return;
                }
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData("text/plain", event.id);
                
                // Calculate grab offset for precise drop calibration
                const rect = e.currentTarget.getBoundingClientRect();
                const offsetY = e.clientY - rect.top;
                e.dataTransfer.setData('application/offsetY', offsetY.toString());

                const target = e.currentTarget;
                // Wait until the next tick so the browser has time to snapshot the visible element for the ghost
                setTimeout(() => { if (target) target.style.opacity = '0'; }, 0);

                if (onEventMouseDown) onEventMouseDown(e as any, event.id, start);
            }}
            onDrag={(e) => {
                // Keep default behavior for native ghosting, prevent heavy re-renders
                e.stopPropagation();
            }}
            onDragEnd={(e) => {
                (e.currentTarget as HTMLElement).style.opacity = '';
            }}
            onMouseDown={(e) => {
                if (highlight.isSelectingLink || (e.target as HTMLElement).closest('.resize-handle')) return;
                e.stopPropagation();
                if (onEventMouseDown) onEventMouseDown(e, event.id, start);
            }}
            className={`event-item group absolute px-2 py-1.5 cursor-pointer overflow-hidden ${isDragging || isResizing ? 'shadow-none scale-[1.01] z-[100]' : 'shadow-none hover:z-[70] z-[60]'} ${isHighlightedEvent ? 'ring-2 ring-purple-500 z-[80]' : ''} ${event.is_completed ? 'opacity-50' : ''} ${(isDragging || isResizing) && isMagnified ? 'opacity-20' : ''} font-medium transition-colors ${roundClass}`}
            onClick={(e) => {
                e.stopPropagation();
                const pendingSource = useLinkStore.getState().pendingLinkSource;
                
                if (pendingSource) {
                    e.preventDefault();
                    e.stopPropagation();
                    const { insertMentionIntoNote } = useDataStore.getState();
                    insertMentionIntoNote(pendingSource, event.id, event.title);
                    useLinkStore.getState().setPendingLinkSource(null);
                    
                    if ((window as any).setActiveNoteId) {
                        (window as any).setActiveNoteId(pendingSource);
                    }
                    return;
                }

                if (highlight.isSelectingLink && highlight.onLinkSelect) {
                    highlight.onLinkSelect({ id: event.id, title: event.title, type: 'event', rect: e.currentTarget.getBoundingClientRect() });
                } else if (onEventClick) {
                    onEventClick(event.id, e.currentTarget.getBoundingClientRect());
                }
            }}
        >
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
            {/* Title rendering as plain text */}
            <div className="text-xs font-semibold leading-tight truncate pointer-events-none">{event.title || 'Untitled'}</div>
            
            {/* Conditional time rendering */}
            {(event as any).durationMinutes > 30 && (
                <div className="text-xs opacity-75 pointer-events-none">
                    {format(start, "HH:mm")}
                </div>
            )}
            
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
