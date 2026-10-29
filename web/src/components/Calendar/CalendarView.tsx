import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import type { ComponentProps } from "react";
import DayColumn from "@/components/Calendar/DayColumn";
import "@/app/calendar/calendar.css";
import { format, startOfWeek, addWeeks, subWeeks, getMinutes, getHours } from "date-fns";
import { ArrowRight } from "lucide-react";
import { SearchIndexEntry } from "@/lib/searchIndex";
import Fuse from "fuse.js";
import { useHighlight } from "@/components/HighlightContext";
import { ScheduleModal } from './ScheduleModal';
import { CalendarWeekTimeGrid } from './CalendarWeekTimeGrid';
import { CalendarProjectionLayer } from './CalendarProjectionLayer';
import { CalendarEventPopoverHost } from './CalendarEventPopoverHost';
import { useCalendarDragResize } from './useCalendarDragResize';
import { useCalendarScroll } from './useCalendarScroll';
import { useEventsByDay } from './useEventsByDay';
import type { ActivePopover, CalendarViewProps } from './types';

export default function CalendarView({
    events,
    onEventCreate,
    onEventUpdate,
    onEventRename,
    onEventDelete,
    onEventSave,
    onEventClick,
    onEventShare,
    editingEventId = null,
    date,
    onDateChange,
    themes = [],
    onScheduleApply,
    onCreateEventGroup,
    enabledExtensions = [],
    onOpenScheduleThemes,
}: CalendarViewProps) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [isGroupsSidebarOpen, setIsGroupsSidebarOpen] = useState(false);

    // Feature Tracking
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    // Search bar anchor: 0=bottom-left, 1=bottom-center, 2=bottom-right, 3=top-center
    const [searchAnchor, setSearchAnchor] = useState(1);

    // Filter events based on selected groups/themesHighlight();

    const [loadedWeeks, setLoadedWeeks] = useState<Date[]>([]);
    const [currentTime, setCurrentTime] = useState(new Date());

    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<SearchIndexEntry[]>([]);
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    const handleSearchClick = () => {
        setIsSearchOpen(true);
    };

    useEffect(() => {
        if (!searchQuery) {
            setSearchResults([]);
            return;
        }
        const fuse = new Fuse(events, {
            keys: ['title', 'description'],
            threshold: 0.4,
            ignoreLocation: true
        });
        const results = fuse.search(searchQuery).map(r => ({
            id: r.item.id,
            title: r.item.title,
            date: r.item.start,
            type: 'event' as const
        }));
        setSearchResults(results);
    }, [searchQuery, events]);


    const lastPopoverOpenTimeRef = useRef(0);
    const isPrependingRef = useRef(false);
    const { highlight, startLinkSelection, cancelLinkSelection } = useHighlight();

    useEffect(() => {
        (window as any).startLinkSelection = startLinkSelection;
        (window as any).cancelLinkSelection = cancelLinkSelection;
        return () => {
            delete (window as any).startLinkSelection;
            delete (window as any).cancelLinkSelection;
        };
    }, [startLinkSelection, cancelLinkSelection]);

    // --- Drag / resize / creation / touch gestures ---
    const {
        draggingId,
        dragState,
        creationDrag,
        resizingId,
        resizeDragState,
        resizeHeightMV,
        creationEndYMV,
        cursorX,
        cursorY,
        isPreciseMode,
        isPreciseModeRef,
        dropBounds,
        dragCurrentTopRef,
        activeEventEdgeRef,
        gridDaysRef,
        isDraggingRef,
        handleGridMouseDown,
        handleEventMouseDown,
        handleResizeMouseDown,
    } = useCalendarDragResize({ events, onEventUpdate, onEventCreate, onEventClick, scrollContainerRef });

    const [isSpeedTraveling, setIsSpeedTraveling] = useState(false);

    useEffect(() => {
        const handleScrollTo = (e: any) => {
            const { id, start } = e.detail;
            if (start) {
                const targetDate = new Date(start);
                onDateChange(targetDate);
                setIsSpeedTraveling(true);

                // After date change, scroll smoothly to event or date column
                setTimeout(() => {
                    const container = scrollContainerRef.current;
                    const todayIso = format(targetDate, "yyyy-MM-dd");
                    const dayCol = (id ? document.getElementById(`event-${id}`)?.closest('[data-day-col]') : container?.querySelector(`[data-day-col="${todayIso}"]`)) as HTMLElement | null;
                    const el = id ? document.getElementById(`event-${id}`) : null;

                    if (container) {
                        const targetTop = el ? Math.max(0, el.offsetTop - 150) : 400;
                        let targetLeft = container.scrollLeft;

                        if (dayCol) {
                            const colLeft = dayCol.offsetLeft;
                            const colWidth = dayCol.offsetWidth;
                            const containerWidth = container.clientWidth;
                            targetLeft = Math.max(0, colLeft - (containerWidth / 2) + (colWidth / 2) - 30);
                        }

                        container.scrollTo({
                            left: targetLeft,
                            top: targetTop,
                            behavior: 'smooth'
                        });
                    }

                    setTimeout(() => setIsSpeedTraveling(false), 500);
                }, 150);
            }
        };
        window.addEventListener('calendar:scroll-to', handleScrollTo);
        return () => window.removeEventListener('calendar:scroll-to', handleScrollTo);
    }, [onDateChange]);

    // --- Popover State ---
    const [activePopover, setActivePopover] = useState<ActivePopover | null>(null);

    useEffect(() => {
        if (activePopover) {
            lastPopoverOpenTimeRef.current = Date.now();
        }
    }, [activePopover]);

    // Initialize with current, prev, and next week
    useEffect(() => {
        const currentStart = startOfWeek(date, { weekStartsOn: 1 });
        // Only reset if the new date is outside our currently loaded range
        if (loadedWeeks.length > 0) {
            const firstWeek = loadedWeeks[0];
            const lastWeek = loadedWeeks[loadedWeeks.length - 1];
            if (currentStart >= firstWeek && currentStart <= lastWeek) {
                return; // Date is already in view, no need to reset
            }
        }
        
        setLoadedWeeks([
            subWeeks(currentStart, 1),
            currentStart,
            addWeeks(currentStart, 1)
        ]);
        isPrependingRef.current = true; // Force initial scroll center
    }, [date, loadedWeeks]);

    // Auto-update current time
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 15000); // 15 seconds to keep the pulse fresh
        return () => clearInterval(timer);
    }, []);

    // --- Initial Scroll ---
    const hasInitializedScroll = useRef(false);

    useEffect(() => {
        if (loadedWeeks.length > 0 && !hasInitializedScroll.current && scrollContainerRef.current) {
            const container = scrollContainerRef.current;

            // Always default to scrolling to current day and time to keep UX snappy
            const nowMinutes = getHours(new Date()) * 60 + getMinutes(new Date());
            const targetScrollY = Math.max(0, nowMinutes - 120);
            container.scrollTop = targetScrollY;

            // Horizontal scroll to today
            setTimeout(() => {
                if (!container) return;
                const todayIso = format(new Date(), "yyyy-MM-dd");
                const todayCol = container.querySelector(`[data-day-col="${todayIso}"]`) as HTMLElement;
                if (todayCol) {
                    const containerWidth = container.clientWidth;
                    const colLeft = todayCol.offsetLeft;
                    const colWidth = todayCol.offsetWidth;
                    const targetScrollX = colLeft - (containerWidth / 2) + (colWidth / 2) - 30;
                    container.scrollLeft = Math.max(0, targetScrollX);
                }
            }, 50);

            hasInitializedScroll.current = true;
        }
    }, [loadedWeeks]);

    // --- Magic Link Navigation Support ---
    useLayoutEffect(() => {
        if (typeof window !== 'undefined' && window.innerWidth < 768) return;
        if (editingEventId && scrollContainerRef.current) {
            const container = scrollContainerRef.current;
            // Wait for DOM to settle
            const timer = setTimeout(() => {
                const element = container.querySelector(`#event-${editingEventId}`) as HTMLElement;
                if (element) {
                    // Scroll horizontally
                    const dayCol = element.closest('[data-day-col]') as HTMLElement;
                    if (dayCol) {
                        const colLeft = dayCol.offsetLeft;
                        const colWidth = dayCol.offsetWidth;
                        const containerWidth = container.clientWidth;
                        const targetScrollX = colLeft - (containerWidth / 2) + (colWidth / 2) - 30;
                        container.scrollLeft = Math.max(0, targetScrollX);
                    }

                    // Scroll vertically
                    const eventTop = element.offsetTop;
                    container.scrollTop = Math.max(0, eventTop - 150);

                    // Open Popover
                    const rect = element.getBoundingClientRect();
                    setActivePopover({ id: editingEventId, rect });
                }
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [editingEventId]);

    const { todayButtonDir, todayAngle, handleScrollToToday } = useCalendarScroll({
        scrollContainerRef,
        date,
        onDateChange,
        loadedWeeks,
        setLoadedWeeks,
        isPrependingRef,
        activePopover,
        setActivePopover,
        lastPopoverOpenTimeRef,
    });

    const eventsByDay = useEventsByDay(events, loadedWeeks, selectedGroupId, themes);

    const handleDayEventClick: ComponentProps<typeof DayColumn>['onEventClick'] = (clickedEvent, rect) => {
            if (!isDraggingRef.current) {
                // clickedEvent is the full CalendarEvent object from CalendarEventItem
                const id = typeof clickedEvent === 'string' ? clickedEvent : (clickedEvent as any).id;
                const e = events.find(ev => ev.id === id || (id && typeof id === 'string' && id.startsWith(ev.id + "_")));

                // Intercept for magic link
                if (highlight.isSelectingLink && highlight.onLinkSelect && e) {
                    highlight.onLinkSelect({
                        id: e.id,
                        title: e.title,
                        type: 'event',
                        start: e.start,
                        rect: rect
                    });
                    return;
                }

                if (e?.allDay) {
                    if (rect) {
                        lastPopoverOpenTimeRef.current = Date.now();
                        setActivePopover(prev => prev?.id === id ? null : { id, rect });
                    } else if (onEventClick) {
                        onEventClick(id);
                    }
                } else {
                    if (rect) {
                        lastPopoverOpenTimeRef.current = Date.now();
                        setActivePopover(prev => prev?.id === id ? null : { id, rect });
                    } else if (onEventClick) {
                        onEventClick(id);
                    }
                }
            }
    };

    return (
        <React.Fragment>
            {/* Force global cursor hide during precise drag */}
            {isPreciseMode && (draggingId || resizingId || creationDrag) && (
                <style>{`
                    * { cursor: none !important; }
                `}</style>
            )}

            <div
                className="h-full flex flex-col bg-transparent select-none relative z-0"
                style={{}}
            >
                {/* Toolbar — position:relative + zIndex:500 creates a stacking context above
                    all sticky calendar elements (time col z-[160], day headers z-[150]). */}
                <div className="flex items-center justify-between px-4 py-3 bg-transparent" style={{ position: 'relative', zIndex: 500 }}>
                    <div className="flex items-center gap-6">
                        <h2 className="text-xl font-extrabold text-[#1F2937] dark:text-[#E2E8F0] tracking-tight">
                            {format(date, "MMMM yyyy")}
                        </h2>
                        <div className="hidden sm:flex items-center gap-1.5">
                            <span 
                                onClick={() => setSelectedGroupId(null)}
                                className={`px-3 py-1 text-xs font-bold rounded-full shadow-sm cursor-pointer hover:opacity-90 transition-all flex items-center gap-1 ${!selectedGroupId ? 'bg-black dark:bg-white text-white dark:text-black' : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300'}`}
                            >
                                {!selectedGroupId && (
                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                )}
                                All
                            </span>
                            {themes.map(group => (
                                <span 
                                    key={group.id}
                                    onClick={() => setSelectedGroupId(group.id)}
                                    className={`px-3 py-1 text-xs font-semibold rounded-full cursor-pointer transition-all ${selectedGroupId === group.id ? 'bg-black dark:bg-white text-white dark:text-black font-bold shadow-sm' : 'bg-gray-100 hover:bg-gray-200 text-gray-600 dark:bg-white/10 dark:hover:bg-white/15 dark:text-gray-300'}`}
                                >
                                    {group.title}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Main Scroll Area */}
                <div
                    ref={scrollContainerRef}
                    className={`flex-1 relative flex trackpad-scroll-free transition-all duration-300 ${isSpeedTraveling ? 'blur-[1.5px] brightness-105' : ''}`}
                    style={{ touchAction: 'pan-x pan-y', overscrollBehavior: 'none' }}
                >
                    <CalendarWeekTimeGrid
                        loadedWeeks={loadedWeeks}
                        eventsByDay={eventsByDay}
                        events={events}
                        currentTime={currentTime}
                        gridDaysRef={gridDaysRef}
                        isPreciseMode={isPreciseMode}
                        isPreciseModeRef={isPreciseModeRef}
                        onDayEventClick={handleDayEventClick}
                        onEventCreate={onEventCreate}
                        onEventUpdate={onEventUpdate}
                        onEventRename={onEventRename}
                        onEventDelete={onEventDelete}
                        onEventSave={onEventSave}
                        onEventShare={onEventShare}
                        onGridMouseDown={handleGridMouseDown}
                        onEventMouseDown={handleEventMouseDown}
                        onResizeMouseDown={handleResizeMouseDown}
                        draggingId={draggingId}
                        dragState={dragState}
                        creationDrag={creationDrag}
                        resizingId={resizingId}
                        resizeDragState={resizeDragState}
                        resizeHeightMV={resizeHeightMV}
                        creationEndYMV={creationEndYMV}
                        cursorX={cursorX}
                        cursorY={cursorY}
                    />
                </div >

                {/* Visual Projection Layer (Precise Mode) */}
                {isPreciseMode && (draggingId || creationDrag || resizingId) && (
                    <CalendarProjectionLayer
                        isPreciseMode={isPreciseMode}
                        draggingId={draggingId}
                        dragState={dragState}
                        creationDrag={creationDrag}
                        resizingId={resizingId}
                        resizeDragState={resizeDragState}
                        events={events}
                        dragCurrentTopRef={dragCurrentTopRef}
                        activeEventEdgeRef={activeEventEdgeRef}
                        cursorX={cursorX}
                        cursorY={cursorY}
                        dropBounds={dropBounds}
                    />
                )}

            </div >

            {/* Global Floating Event Popover */}
            {activePopover && (
                <CalendarEventPopoverHost
                    activePopover={activePopover}
                    events={events}
                    themes={themes}
                    onEventSave={onEventSave}
                    onEventDelete={onEventDelete}
                    onClose={() => setActivePopover(null)}
                    enabledExtensions={enabledExtensions}
                />
            )}

            {isScheduleModalOpen && (
                <ScheduleModal
                    isOpen={isScheduleModalOpen}
                    onClose={() => setIsScheduleModalOpen(false)}
                    onApply={onScheduleApply || (async () => { })}
                    existingThemes={themes}
                />
            )}



            {/* Directional Today Button — appears at edge when today is off-screen */}
            {todayButtonDir !== 'hidden' && (
                <div
                    className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${todayButtonDir === 'left' ? 'left-[68px]' : 'right-4'}`}
                    style={{ zIndex: 490 }}
                >
                    <button
                        className="pointer-events-auto flex flex-col items-center gap-1 px-3 py-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-2xl shadow-xl hover:bg-gray-50 dark:hover:bg-slate-800 transition-all text-gray-800 dark:text-gray-200 group"
                        onClick={handleScrollToToday}
                        title="Zu heute"
                    >
                        <ArrowRight
                            size={20}
                            strokeWidth={2.5}
                            style={{ transform: `rotate(${todayAngle}deg)` }}
                            className="transition-transform duration-150 text-indigo-600 dark:text-indigo-400 group-hover:scale-110"
                        />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Today</span>
                    </button>
                </div>
            )}

        </React.Fragment>
    );
}
