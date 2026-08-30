import React, { useState, useEffect } from 'react';
import { motion, useTransform, MotionValue } from 'framer-motion';
import { format, getHours, getMinutes, isSameDay } from 'date-fns';
import { useHighlight } from '@/components/HighlightContext';
import { useLinkStore } from '@/store/useLinkStore';
import { useDataStore } from '@/store/useDataStore';
import { Layers, Globe, Lock } from 'lucide-react';

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
    shading?: number; // 0-4 for gray-layers
    linkedTaskId?: string;
    tags?: string[];
    is_public?: boolean;
}

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
    onEventClick?: (event: CalendarEvent, rect?: DOMRect) => void;
    onEventShare?: (e: React.MouseEvent, id: string) => void;
    onEventDelete?: (id: string) => void;
    onEventMouseDown?: (e: React.MouseEvent, id: string, start: Date) => void;
    onResizeMouseDown?: (e: React.MouseEvent, id: string, start: string, end: string) => void;
    onTaskToggle?: (id: string, currentIsCompleted: boolean) => void;
    onEventRename?: (id: string, title: string) => Promise<void>;
    cursorX: MotionValue<number>;
    cursorY: MotionValue<number>;
}

// Returns a style object for the given theme effect.
// Applied directly on the event div so it works inside Framer Motion compositing layers.
const getEffectStyle = (effect: string | undefined): React.CSSProperties | undefined => {
    if (!effect || effect === 'none' || effect === 'dimmed') return undefined;
    
    if (effect === 'stripes') return {
        backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.25) 0, rgba(255,255,255,0.25) 8px, transparent 8px, transparent 20px)'
    };
    if (effect === 'waves') return {
        backgroundImage: 'radial-gradient(circle at 100% 50%, transparent 20%, rgba(255,255,255,0.25) 21%, rgba(255,255,255,0.25) 34%, transparent 35%), radial-gradient(circle at 0% 50%, transparent 20%, rgba(255,255,255,0.25) 21%, rgba(255,255,255,0.25) 34%, transparent 35%)',
        backgroundSize: '30px 40px',
        backgroundPosition: '0 0, 0 20px'
    };
    if (effect === 'dots') return {
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.4) 3px, transparent 4px), radial-gradient(circle, rgba(255,255,255,0.3) 4px, transparent 5px), radial-gradient(circle, rgba(255,255,255,0.2) 5px, transparent 6px), radial-gradient(circle, rgba(255,255,255,0.25) 3px, transparent 4px)',
        backgroundSize: '40px 40px',
        backgroundPosition: '10px 10px, 25px 25px, 5px 30px, 30px 5px'
    };
    if (effect === 'chess') return {
        backgroundImage: 'linear-gradient(45deg, rgba(0,0,0,0.13) 25%, transparent 25%, transparent 75%, rgba(0,0,0,0.13) 75%, rgba(0,0,0,0.13)), linear-gradient(45deg, rgba(0,0,0,0.13) 25%, transparent 25%, transparent 75%, rgba(0,0,0,0.13) 75%, rgba(0,0,0,0.13))',
        backgroundSize: '20px 20px',
        backgroundPosition: '0 0, 10px 10px'
    };
    if (effect === 'diamonds') return {
        backgroundImage: 'linear-gradient(45deg, rgba(0,0,0,0.13) 25%, transparent 25%), linear-gradient(-45deg, rgba(0,0,0,0.13) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(0,0,0,0.13) 75%), linear-gradient(-45deg, transparent 75%, rgba(0,0,0,0.13) 75%)',
        backgroundSize: '100% 100%',
        backgroundPosition: 'center'
    };
    if (effect === 'gradient') return {
        backgroundImage: 'linear-gradient(120deg, rgba(255,255,255,0.3) 0%, transparent 100%)'
    };
    if (effect === 'bars') return {
        backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.2) 0, rgba(255,255,255,0.2) 10px, transparent 10px, transparent 20px)'
    };
    
    return undefined;
};

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

    // If the event has a linkedTaskId, read completion state from the task store (source of truth)
    // so all taskMention nodes in notes update instantly via the same Zustand selector.
    const linkedTaskIsCompleted = useDataStore(state => {
        if (!(event as any).linkedTaskId) return undefined;
        return state.tasks.find(t => t.id === (event as any).linkedTaskId)?.isCompleted;
    });
    const isCompleted = linkedTaskIsCompleted !== undefined ? linkedTaskIsCompleted : !!event.is_completed;

    const start = new Date(event.start);
    const end = new Date(event.end);

    // Feature 3: Multi-Day Logic
    // Events ending exactly at 00:00:00 of the following day are NOT truly multi-day —
    // they simply extend to midnight and should only render on their start day.
    const endsAtExactMidnight = end.getHours() === 0 && end.getMinutes() === 0 && end.getSeconds() === 0 && end.getMilliseconds() === 0;
    const isMultiDay = !isSameDay(start, end) && !endsAtExactMidnight;
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
    const calendarColorPalette = useDataStore(s => s.calendarColorPalette || 'modern-dark');
    const theme = getEventTheme(event, calendarColorPalette);
    // isParent is passed from DayColumn using the full allEvents list (not filtered timedEvents)
    const hasChildren = isParent ?? timedEvents.some(e => (e as any).parent_id === event.id);
    const isActiveParent = hasChildren && activeParentId === event.id;
    const isCancelled = !!event.is_cancelled;
    const zIndex = isActiveParent || isCancelled ? 0 : (isDragging ? 50 : 10 + startMinutes);

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

    // Compute the effect properties
    const effectStyle = !isCancelled ? getEffectStyle(event.effect) : undefined;

    const isTimePoint = durationMinutes === 0;
    const isShortEvent = !isTimePoint && durationMinutes < 40;
    const minRenderedMinutes = isTimePoint ? 0 : Math.max(durationMinutes, 5);

    let style: any;
    if (isDragging) {
        style = {
            top: `calc(var(--hour-height, 60px) / 60 * ${startMinutes} + 2px)`,
            height: isTimePoint ? '6px' : `calc(var(--hour-height, 60px) / 60 * ${minRenderedMinutes} - 4px)`,
            minHeight: isTimePoint ? '6px' : '22px',
            left: `calc(${pos.left}% + 3px)`,
            width: `calc(${pos.width}% - 6px)`,
            backgroundColor: theme.bg,
            color: theme.text,
            opacity: 0,
            zIndex: 10,
            pointerEvents: 'none',
        };
    } else if (isResizing) {
        style = {
            top: `calc(var(--hour-height, 60px) / 60 * ${startMinutes} + 2px)`,
            height: resizeHeightMV,
            minHeight: isTimePoint ? '6px' : '22px',
            left: `calc(${pos.left}% + 3px)`,
            width: `calc(${pos.width}% - 6px)`,
            backgroundColor: theme.bg,
            color: theme.text,
            zIndex: 100,
            pointerEvents: 'none',
        };
    } else {
        const baseColor = isActiveParent ? 'transparent' : (event.color || theme.bg);
        style = {
            top: `calc(var(--hour-height, 60px) / 60 * ${startMinutes} + 2px)`,
            height: isTimePoint ? '6px' : `calc(var(--hour-height, 60px) / 60 * ${minRenderedMinutes} - 4px)`,
            minHeight: isTimePoint ? '6px' : '22px',
            left: `calc(${pos.left}% + 3px)`,
            width: `calc(${pos.width}% - 6px)`,
            backgroundColor: baseColor,
            // Layer pattern on top of solid background-color (CSS bg-image renders above bg-color).
            // For the live-event state the pattern is prepended to the gradient.
            ...(effectStyle || {}),
            boxShadow: isActiveParent 
                ? `inset 0 0 20px 2px ${theme.border}` 
                : '0 4px 16px -2px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.03)',
            color: theme.text,
            zIndex: zIndex,
            maskImage: maskImage !== 'none' ? maskImage : undefined,
            WebkitMaskImage: maskImage !== 'none' ? maskImage : undefined,
            // Dimmed effect: slightly reduce opacity of the whole block
            ...(event.effect === 'dimmed' ? { opacity: 0.55 } : {}),
        };
        if (isCancelled) {
            style.backgroundColor = '#94a3b8'; // gray-400
            style.color = '#475569'; // gray-600
            style.opacity = 0.4;
            style.textDecoration = 'line-through';
            style.backgroundImage = undefined;
        }
    }

    const isAdjacentTop = timedEvents.some(other => {
        if (other.id === event.id) return false;
        const otherEndMs = new Date(other.end).getTime();
        const otherPos = layout.get(other.id) || { left: 0, width: 100 };
        const timeDiff = Math.abs(otherEndMs - startMs);
        const leftDiff = Math.abs(otherPos.left - pos.left);
        const widthDiff = Math.abs(otherPos.width - pos.width);
        return timeDiff < 61000 && leftDiff < 3 && widthDiff < 3;
    });

    const isAdjacentBottom = timedEvents.some(other => {
        if (other.id === event.id) return false;
        const otherStartMs = new Date(other.start).getTime();
        const otherPos = layout.get(other.id) || { left: 0, width: 100 };
        const timeDiff = Math.abs(otherStartMs - endMs);
        const leftDiff = Math.abs(otherPos.left - pos.left);
        const widthDiff = Math.abs(otherPos.width - pos.width);
        return timeDiff < 61000 && leftDiff < 3 && widthDiff < 3;
    });

    // Base Radius
    const R = '8px'; // Normal radius
    const adjR = '4px'; // Attached radius (1/2 of normal)

    const borderRadiusStyle = {
        borderTopLeftRadius: isAdjacentTop ? adjR : R,
        borderTopRightRadius: isAdjacentTop ? adjR : R,
        borderBottomLeftRadius: isAdjacentBottom ? adjR : R,
        borderBottomRightRadius: isAdjacentBottom ? adjR : R,
    };

    if (isMultiDay) {
        if (isStartDay) {
            borderRadiusStyle.borderBottomLeftRadius = adjR;
            borderRadiusStyle.borderBottomRightRadius = adjR;
        } else if (isEndDay) {
            borderRadiusStyle.borderTopLeftRadius = adjR;
            borderRadiusStyle.borderTopRightRadius = adjR;
        } else {
            borderRadiusStyle.borderTopLeftRadius = adjR;
            borderRadiusStyle.borderTopRightRadius = adjR;
            borderRadiusStyle.borderBottomLeftRadius = adjR;
            borderRadiusStyle.borderBottomRightRadius = adjR;
        }
    }

    const isHighlightedEvent = isHighlighted(event.id, 'event');

    // Detect currently-running event (today, started, not yet ended)
    const now = new Date();
    const isLive = !event.allDay && !isCancelled && day
        ? isSameDay(day, now) && start <= now && end >= now
        : false;

    const isImportant = (event as any).is_important;
    const shouldGlow = isLive || isImportant;

    const glowColor = theme.border !== 'transparent' ? theme.border : '#6366f1';

    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            style={{
                ...style, ...borderRadiusStyle,
                borderLeft: 'none',
                ...(shouldGlow ? {
                    boxShadow: `0 0 0 2px ${glowColor}, 0 4px 20px ${glowColor}60`,
                    zIndex: 90,
                } : {}),
            }}
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
            className={`event-item group absolute ${isTimePoint ? 'px-1.5 py-0 overflow-visible rounded-sm' : isShortEvent ? 'px-2.5 py-0 overflow-hidden' : durationMinutes < 45 ? 'px-3 py-1.5 overflow-hidden' : 'px-3.5 py-3 overflow-hidden'} cursor-pointer ${isDragging || isResizing ? 'shadow-none scale-[1.01] z-[100]' : 'shadow-none hover:z-[70] z-[60]'} ${isHighlightedEvent ? 'ring-2 ring-purple-500 z-[80]' : ''} ${isCompleted ? 'opacity-50' : ''} ${isCancelled ? 'opacity-40 grayscale pointer-events-auto' : ''} ${(isDragging || isResizing) && isMagnified ? 'opacity-20' : ''} font-medium transition-all ${isActiveParent ? 'opacity-20 backdrop-blur-sm pointer-events-none' : ''} ${isMiddleDay ? 'z-0 pointer-events-none opacity-30' : ''}`}
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
                        onEventClick(event, e.currentTarget.getBoundingClientRect());
                    }
                }
            }}
        >
            {/* Premium Live Indicator Dot */}
            {isLive && (
                <div className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: glowColor }}></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: glowColor }}></span>
                </div>
            )}

            {/* Effect patterns are now applied via backgroundImage inline style on the
                 outer motion.div — the old overlay-div + mix-blend-mode approach did not
                 work inside Framer Motion compositing layers. */}

            {/* Shading Overlay Layer */}
            {!isActiveParent && typeof event.shading === 'number' && event.shading > 0 ? (
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
            ) : null}

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
                    className={`absolute ${isShortEvent ? 'top-0.5 right-[2.2rem]' : 'top-1 right-[2.2rem]'} opacity-0 group-hover:opacity-100 z-50 p-1 text-gray-500 hover:text-indigo-600 transition-colors`}
                >
                    <Layers size={isShortEvent ? 12 : 14} />
                </button>
            )}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    if (onEventShare) onEventShare(e, event.id);
                }}
                title="Share Event"
                className={`absolute ${isShortEvent ? 'top-0.5 right-5' : 'top-1 right-5'} opacity-0 group-hover:opacity-100 z-50 p-0.5 text-gray-400 hover:text-blue-500 transition-colors`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width={isShortEvent ? 11 : 13} height={isShortEvent ? 11 : 13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
            </button>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onEventDelete?.(event.id);
                }}
                className={`absolute ${isShortEvent ? 'top-0.5 right-1' : 'top-1 right-1'} opacity-0 group-hover:opacity-100 z-50 p-0.5 text-gray-400 hover:text-red-500 transition-colors`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width={isShortEvent ? 12 : 14} height={isShortEvent ? 12 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            {/* Drag-to-note handle — appears on hover, initiates native HTML5 drag */}
            {!isDragging && !isResizing && (
                <div
                    title="Drag to note to create a link"
                    draggable
                    onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.effectAllowed = 'copy';
                        e.dataTransfer.setData('tide/calendar-event', JSON.stringify({
                            id: event.id,
                            title: event.title,
                            start: event.start,
                            end: event.end,
                            color: event.color || null,
                            description: event.description || '',
                        }));
                        // Drag image: a small pill preview
                        const ghost = document.createElement('div');
                        ghost.style.cssText = `
                            position: fixed; top: -200px; left: 0;
                            padding: 4px 10px; border-radius: 6px;
                            background: ${event.color || '#6366f1'};
                            color: white; font-size: 12px; font-weight: 600;
                            max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                        `;
                        ghost.textContent = event.title || 'Event';
                        document.body.appendChild(ghost);
                        e.dataTransfer.setDragImage(ghost, 0, 14);
                        setTimeout(() => document.body.removeChild(ghost), 0);
                    }}
                    className="absolute top-1 left-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 z-[75] p-0.5 cursor-grab active:cursor-grabbing text-white transition-opacity"
                    onMouseDown={e => e.stopPropagation()} // don't trigger internal DnD
                >
                    <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" opacity="0.85">
                        <circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/>
                        <circle cx="3" cy="6" r="1.2"/><circle cx="7" cy="6" r="1.2"/>
                        <circle cx="3" cy="10" r="1.2"/><circle cx="7" cy="10" r="1.2"/>
                    </svg>
                </div>
            )}
            {/* Time-point (0-min) display: thick bar with title floating centered on it */}
            {isTimePoint ? (
                <div className="absolute inset-0 flex items-center overflow-visible pointer-events-none" style={{ zIndex: 10 }}>
                    <span
                        className={`text-[10px] font-black leading-none whitespace-nowrap pl-1 ${isCancelled || isCompleted ? 'line-through opacity-60' : ''}`}
                        style={{ color: theme.text }}
                    >
                        {format(start, "HH:mm")} {event.title || 'Untitled'}
                    </span>
                </div>
            ) : isShortEvent ? (
                /* Short event (< 40 min): Single-row compact layout with clear title & inline time */
                <div className="relative z-10 flex items-center h-full w-full overflow-hidden gap-1.5 min-w-0">
                    {event.is_task && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                const linkedTaskId = event.linkedTaskId;
                                if (linkedTaskId) {
                                    useDataStore.getState().toggleTask(linkedTaskId);
                                } else {
                                    onTaskToggle?.(event.id, isCompleted);
                                }
                            }}
                            className={`w-3 h-3 rounded-[3px] border border-current flex-shrink-0 flex items-center justify-center cursor-pointer transition-all hover:scale-110 z-[80] ${isCompleted ? 'opacity-40' : 'opacity-100'}`}
                            style={{ borderColor: theme.text, color: theme.text }}
                        >
                            {isCompleted && (
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            )}
                        </button>
                    )}
                    {event.is_public && (
                        <div className="opacity-60 flex-shrink-0" title="Public Event">
                            <Globe size={10} />
                        </div>
                    )}
                    <span className={`text-[11px] font-bold leading-none truncate shrink min-w-0 pointer-events-none ${isCancelled || isCompleted ? 'line-through opacity-60' : ''}`}>
                        {event.title || 'Untitled'}
                    </span>
                    <span className="text-[10px] opacity-75 font-semibold shrink-0 whitespace-nowrap ml-auto pointer-events-none group-hover:opacity-0 transition-opacity">
                        {format(start, "HH:mm")}
                        {durationMinutes >= 20 ? ` - ${format(end, "HH:mm")}` : ''}
                    </span>
                </div>
            ) : (
            /* Normal event contents */
            <div className="relative z-10 flex flex-col h-full overflow-hidden">
                <div className="flex items-start gap-1.5 min-w-0">
                    {event.is_task && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                const linkedTaskId = (event as any).linkedTaskId;
                                if (linkedTaskId) {
                                    useDataStore.getState().toggleTask(linkedTaskId);
                                } else {
                                    onTaskToggle?.(event.id, isCompleted);
                                }
                            }}
                            className={`mt-[2px] w-3 h-3 rounded-[3px] border border-current flex-shrink-0 flex items-center justify-center cursor-pointer transition-all hover:scale-110 z-[80] ${isCompleted ? 'opacity-40' : 'opacity-100'}`}
                            style={{ borderColor: theme.text, color: theme.text }}
                        >
                            {isCompleted && (
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            )}
                        </button>
                    )}
                    {event.is_public && (
                        <div className="mt-[2px] opacity-60 flex-shrink-0" title="Public Event">
                            <Globe size={11} />
                        </div>
                    )}
                    <div className={`text-[11px] font-bold leading-tight break-words pointer-events-none ${isCancelled || isCompleted ? 'line-through opacity-60' : ''}`}>
                        {event.title || 'Untitled'}
                    </div>
                    {!isDragging && !isResizing && (
                        <span className="text-[10px] opacity-30 font-bold ml-auto select-none pointer-events-none group-hover:opacity-75 transition-opacity">···</span>
                    )}
                </div>

                {/* Sub-titles (Tags) - Feature Requirement */}
                {event.tags && event.tags.length > 0 && durationMinutes > 40 && (
                    <div className="flex flex-wrap gap-1 mt-1 mb-1 relative z-[90]">
                        {event.tags.filter(t => t.trim() !== '').map((tag, idx) => (
                            <div 
                                key={idx} 
                                className="px-2 py-0.5 rounded-full text-[9px] font-black text-white shadow-md border"
                                style={{ 
                                    backgroundColor: event.color || theme.text,
                                    borderColor: 'rgba(255,255,255,0.1)',
                                    backgroundImage: 'linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.15))',
                                    textShadow: '0 1px 2px rgba(0,0,0,0.2)'
                                }}
                            >
                                {tag}
                            </div>
                        ))}
                    </div>
                )}

                {/* Description - shown if there's space and text exists */}
                {event.description && durationMinutes > 60 && (
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
                    <div className="text-[10px] opacity-75 pointer-events-none mt-auto pb-0.5 flex justify-end">
                        <span className="font-semibold">
                            {format(start, "HH:mm")} - {format(end, "HH:mm")}
                        </span>
                    </div>
                )}
            </div>
            )} {/* end isTimePoint conditional */}

            {/* Resize Handle */}
            {!isDragging && durationMinutes >= 15 && (
                <div
                    className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize z-[70] hover:bg-white/20 resize-handle"
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
