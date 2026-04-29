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
            top: `calc(var(--hour-height, 60px) / 60 * ${startMinutes})`,
            height: `calc(var(--hour-height, 60px) / 60 * ${Math.max(durationMinutes, 15)})`,
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
            top: `calc(var(--hour-height, 60px) / 60 * ${startMinutes})`,
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
            top: `calc(var(--hour-height, 60px) / 60 * ${startMinutes})`,
            height: `calc(var(--hour-height, 60px) / 60 * ${Math.max(durationMinutes, 15)})`,
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
    const R = '7px'; // Normal radius
    const adjR = '4px'; // Attached radius (1/3 of normal)

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

    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            style={{ ...style, ...borderRadiusStyle, borderLeft: `4px solid ${theme.border}` }}
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
            className={`event-item group absolute px-2 py-1.5 cursor-pointer overflow-hidden ${isDragging || isResizing ? 'shadow-none scale-[1.01] z-[100]' : 'shadow-none hover:z-[70] z-[60]'} ${isHighlightedEvent ? 'ring-2 ring-purple-500 z-[80]' : ''} ${isCompleted ? 'opacity-50' : ''} ${isCancelled ? 'opacity-40 grayscale pointer-events-auto' : ''} ${(isDragging || isResizing) && isMagnified ? 'opacity-20' : ''} font-medium transition-all ${isActiveParent ? 'opacity-20 backdrop-blur-sm pointer-events-none' : ''} ${isMiddleDay ? 'z-0 pointer-events-none opacity-30' : ''}`}
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
            {/* Effect Overlay Layer */}
            {!isActiveParent && effectClass && (
                <div className={`absolute inset-0 pointer-events-none ${effectClass}`} style={{ mixBlendMode: 'overlay' }} />
            )}

            {/* Shading Overlay Layer */}
            {!isActiveParent && event.shading && event.shading > 0 && (
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
                    className="absolute top-1 right-[2.2rem] opacity-0 group-hover:opacity-100 z-50 p-1 text-gray-500 hover:text-indigo-600 transition-colors"
                >
                    <Layers size={14} />
                </button>
            )}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    if (onEventShare) onEventShare(e, event.id);
                }}
                title="Share Event"
                className="absolute top-1 right-5 opacity-0 group-hover:opacity-100 z-50 p-1 text-gray-400 hover:text-blue-500 transition-colors"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
            </button>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onEventDelete?.(event.id);
                }}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 z-50 p-1 text-gray-400 hover:text-red-500 transition-colors"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
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
            {/* ... contents of the event item ... */}
            <div className="relative z-10 flex flex-col h-full overflow-hidden">
                <div className="flex items-start gap-1.5 min-w-0">
                    {event.is_task && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                const linkedTaskId = (event as any).linkedTaskId;
                                if (linkedTaskId) {
                                    // Route through task store so all taskMention nodes update instantly
                                    useDataStore.getState().toggleTask(linkedTaskId);
                                } else {
                                    // Legacy event-only task (no linked task record)
                                    onTaskToggle?.(event.id, isCompleted);
                                }
                            }}
                            className={`mt-[2px] w-3 h-3 rounded-[3px] border border-current flex-shrink-0 flex items-center justify-center cursor-pointer transition-all hover:scale-110 z-[80] ${isCompleted ? 'opacity-40' : 'opacity-100'}`}
                            style={{
                                borderColor: theme.text,
                                color: theme.text
                            }}
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
                <div className={`text-[11px] font-bold leading-tight truncate pointer-events-none ${isCancelled || isCompleted ? 'line-through opacity-60' : ''}`}>
                        {event.title || 'Untitled'}
                    </div>
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
