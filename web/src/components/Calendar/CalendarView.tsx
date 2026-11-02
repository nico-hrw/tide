import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import type { ComponentProps } from "react";
import DayColumn from "@/components/Calendar/DayColumn";
import "@/app/calendar/calendar.css";
import { format, startOfWeek, addWeeks, subWeeks, getMinutes, getHours, addDays, subDays, addMonths, subMonths, startOfMonth, isSameDay } from "date-fns";
import { de } from "date-fns/locale";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { SearchIndexEntry } from "@/lib/searchIndex";
import Fuse from "fuse.js";
import { useHighlight } from "@/components/HighlightContext";
import { ScheduleModal } from './ScheduleModal';
import { CalendarWeekTimeGrid } from './CalendarWeekTimeGrid';
import DesktopMonthView from './DesktopMonthView';
import DesktopAgendaView from './DesktopAgendaView';
import DesktopDayView from './DesktopDayView';
import { CalendarProjectionLayer } from './CalendarProjectionLayer';
import { CalendarEventPopoverHost } from './CalendarEventPopoverHost';
import { useCalendarDragResize } from './useCalendarDragResize';
import { useCalendarScroll } from './useCalendarScroll';
import { useEventsByDay } from './useEventsByDay';
import type { ActivePopover, CalendarViewProps, CalendarViewMode } from './types';

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
    viewMode: viewModeProp,
    onViewModeChange,
    themes = [],
    onScheduleApply,
    onCreateEventGroup,
    enabledExtensions = [],
    onOpenScheduleThemes,
}: CalendarViewProps) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [internalViewMode, setInternalViewMode] = useState<CalendarViewMode>(viewModeProp || 'week');
    const viewMode = viewModeProp ?? internalViewMode;

    const prevViewModeRef = useRef(viewMode);
    const hasInitializedScroll = useRef(false);

    const handleViewModeChange = (mode: CalendarViewMode) => {
        if (mode === 'week' && viewMode !== 'week') {
            hasInitializedScroll.current = false;
        }
        setInternalViewMode(mode);
        onViewModeChange?.(mode);
    };

    const handlePrev = () => {
        if (viewMode === 'day') {
            onDateChange(subDays(date, 1));
        } else if (viewMode === 'week') {
            onDateChange(subWeeks(date, 1));
        } else if (viewMode === 'month') {
            onDateChange(subMonths(date, 1));
        } else if (viewMode === 'continuous') {
            onDateChange(subWeeks(date, 1));
        }
    };

    const handleNext = () => {
        if (viewMode === 'day') {
            onDateChange(addDays(date, 1));
        } else if (viewMode === 'week') {
            onDateChange(addWeeks(date, 1));
        } else if (viewMode === 'month') {
            onDateChange(addMonths(date, 1));
        } else if (viewMode === 'continuous') {
            onDateChange(addWeeks(date, 1));
        }
    };

    const handleToday = () => {
        const today = new Date();
        onDateChange(today);
        if (viewMode === 'week') {
            handleScrollToToday();
        } else if (viewMode === 'day') {
            setTimeout(() => {
                if (scrollContainerRef.current) {
                    const nowMinutes = getHours(new Date()) * 60 + getMinutes(new Date());
                    const targetScrollY = Math.max(0, nowMinutes - 120);
                    scrollContainerRef.current.scrollTo({ top: targetScrollY, behavior: 'smooth' });
                }
            }, 60);
        }
    };

    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [isGroupsSidebarOpen, setIsGroupsSidebarOpen] = useState(false);

    // Feature Tracking
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    // Search bar anchor: 0=bottom-left, 1=bottom-center, 2=bottom-right, 3=top-center
    const [searchAnchor, setSearchAnchor] = useState(1);

    // Filter events based on selected groups/themesHighlight();

    const [loadedWeeks, setLoadedWeeks] = useState<Date[]>(() => {
        const currentStart = startOfWeek(date, { weekStartsOn: 1 });
        return [
            subWeeks(currentStart, 1),
            currentStart,
            addWeeks(currentStart, 1)
        ];
    });
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

    // Initialize with weeks appropriate for the active view mode
    useEffect(() => {
        const timer = setTimeout(() => {
            const currentStart = startOfWeek(date, { weekStartsOn: 1 });

            if (prevViewModeRef.current !== 'week' && viewMode === 'week') {
                hasInitializedScroll.current = false;
                setLoadedWeeks([
                    subWeeks(currentStart, 1),
                    currentStart,
                    addWeeks(currentStart, 1)
                ]);
                isPrependingRef.current = true;
                prevViewModeRef.current = viewMode;
                return;
            }
            prevViewModeRef.current = viewMode;

            if (viewMode === 'month') {
                const mStart = startOfWeek(startOfMonth(date), { weekStartsOn: 1 });
                const weeks: Date[] = [];
                for (let i = 0; i < 6; i++) {
                    weeks.push(addWeeks(mStart, i));
                }
                setLoadedWeeks(weeks);
                return;
            }

            if (viewMode === 'continuous') {
                const cStart = subWeeks(currentStart, 1);
                const weeks: Date[] = [];
                for (let i = 0; i < 8; i++) {
                    weeks.push(addWeeks(cStart, i));
                }
                setLoadedWeeks(weeks);
                return;
            }

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
        }, 0);
        return () => clearTimeout(timer);
    }, [date, viewMode, loadedWeeks]);

    // Initial scroll for day view
    useEffect(() => {
        if (viewMode === 'day') {
            const timer = setTimeout(() => {
                if (!scrollContainerRef.current) return;
                const container = scrollContainerRef.current;
                const isDateToday = isSameDay(date, new Date());
                let targetScrollY = 0;
                if (isDateToday) {
                    const nowMinutes = getHours(new Date()) * 60 + getMinutes(new Date());
                    targetScrollY = Math.max(0, nowMinutes - 120);
                } else {
                    const dayKey = format(date, "yyyy-MM-dd");
                    const dayTimedEvents = events.filter(e => {
                        if (e.allDay) return false;
                        try {
                            return format(new Date(e.start), "yyyy-MM-dd") === dayKey;
                        } catch {
                            return false;
                        }
                    });
                    if (dayTimedEvents.length > 0) {
                        let earliestMinutes = 24 * 60;
                        for (const ev of dayTimedEvents) {
                            try {
                                const s = new Date(ev.start);
                                const m = getHours(s) * 60 + getMinutes(s);
                                if (m < earliestMinutes) earliestMinutes = m;
                            } catch {}
                        }
                        targetScrollY = Math.max(0, earliestMinutes - 60);
                    } else {
                        targetScrollY = Math.max(0, 8 * 60 - 60);
                    }
                }
                container.scrollTop = targetScrollY;
            }, 60);
            return () => clearTimeout(timer);
        }
    }, [viewMode, date, events]);

    // Auto-update current time
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 15000); // 15 seconds to keep the pulse fresh
        return () => clearInterval(timer);
    }, []);

    // --- Initial Scroll ---
    useEffect(() => {
        if (viewMode === 'week' && loadedWeeks.length > 0 && !hasInitializedScroll.current && scrollContainerRef.current) {
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
    }, [loadedWeeks, viewMode]);

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

                // In Day View, event details are shown in DesktopDayView's dedicated fixed "Termindetails" card.
                // Do not open the floating popover over the day timeline.
                if (viewMode === 'day') {
                    setActivePopover(null);
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
                <div className="flex flex-col bg-transparent border-b border-gray-200/60 dark:border-white/10" style={{ position: 'relative', zIndex: 500 }}>
                    {/* Row 1 (Main Controls) */}
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                        {/* Left: Date navigation + Title */}
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-0.5 bg-gray-100/80 dark:bg-white/5 border border-gray-200/60 dark:border-white/10 rounded-lg p-0.5">
                                <button
                                    onClick={handlePrev}
                                    className="p-1 hover:bg-white dark:hover:bg-white/10 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-md transition-colors"
                                    title="Zurück"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <button
                                    onClick={handleNext}
                                    className="p-1 hover:bg-white dark:hover:bg-white/10 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-md transition-colors"
                                    title="Weiter"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                            <button
                                onClick={handleToday}
                                className="px-2.5 py-1 text-xs font-bold rounded-lg border border-gray-200/80 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200 transition-colors"
                                title="Zu heute springen"
                            >
                                Heute
                            </button>
                            <h2 className="text-base sm:text-lg md:text-xl font-extrabold text-[#1F2937] dark:text-[#E2E8F0] tracking-tight ml-1">
                                {viewMode === 'day' 
                                    ? format(date, "EEEE, d. MMMM yyyy", { locale: de }) 
                                    : format(date, "MMMM yyyy", { locale: de })}
                            </h2>
                        </div>

                        {/* Right: View Mode switcher pills */}
                        <div className="flex items-center gap-1 bg-gray-100/70 dark:bg-white/5 border border-gray-200/60 dark:border-white/10 p-1 rounded-xl">
                            {([
                                { id: 'day' as const, label: 'Tag' },
                                { id: 'week' as const, label: 'Woche' },
                                { id: 'month' as const, label: 'Monat' },
                                { id: 'continuous' as const, label: 'Fortlaufend' },
                            ]).map((mode) => {
                                const isActive = viewMode === mode.id;
                                return (
                                    <button
                                        key={mode.id}
                                        onClick={() => handleViewModeChange(mode.id)}
                                        className={`px-2.5 py-1 text-xs rounded-lg transition-all ${
                                            isActive
                                                ? "bg-black dark:bg-white text-white dark:text-black font-bold shadow-sm"
                                                : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 font-medium"
                                        }`}
                                    >
                                        {mode.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Row 2 (Categories & Themes) */}
                    <div className="flex items-center gap-1.5 px-4 py-2 border-t border-gray-200/40 dark:border-white/5 overflow-x-auto scrollbar-none">
                        <button 
                            type="button"
                            onClick={() => setSelectedGroupId(null)}
                            className={`px-3 py-1 text-xs font-bold rounded-full shadow-sm cursor-pointer hover:opacity-90 transition-all flex items-center gap-1 shrink-0 ${!selectedGroupId ? 'bg-black dark:bg-white text-white dark:text-black' : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300'}`}
                        >
                            {!selectedGroupId && (
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            )}
                            All
                        </button>
                        {themes.map(group => (
                            <button 
                                type="button"
                                key={group.id}
                                onClick={() => setSelectedGroupId(group.id)}
                                className={`px-3 py-1 text-xs font-semibold rounded-full cursor-pointer transition-all shrink-0 flex items-center gap-1.5 ${selectedGroupId === group.id ? 'bg-black dark:bg-white text-white dark:text-black font-bold shadow-sm' : 'bg-gray-100 hover:bg-gray-200 text-gray-600 dark:bg-white/10 dark:hover:bg-white/15 dark:text-gray-300'}`}
                            >
                                {group.color && (
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                                )}
                                {group.title}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main View Area */}
                {viewMode === 'week' && (
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
                    </div>
                )}

                {viewMode === 'day' && (
                    <div
                        ref={scrollContainerRef}
                        className="flex-1 relative flex overflow-y-auto overflow-x-hidden transition-all duration-300"
                        style={{ touchAction: 'pan-y' }}
                    >
                        <DesktopDayView
                            day={date}
                            eventsByDay={eventsByDay}
                            events={events}
                            currentTime={currentTime}
                            gridDaysRef={gridDaysRef}
                            isPreciseMode={isPreciseMode}
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
                            themes={themes}
                        />
                    </div>
                )}

                {viewMode === 'month' && (
                    <DesktopMonthView
                        currentDate={date}
                        eventsByDay={eventsByDay}
                        onDayClick={(clickedDay) => {
                            onDateChange(clickedDay);
                            handleViewModeChange('day');
                        }}
                        onEventClick={(clickedEvent, rect) => {
                            lastPopoverOpenTimeRef.current = Date.now();
                            setActivePopover({ id: clickedEvent.id, rect });
                        }}
                        onEventCreate={onEventCreate}
                        themes={themes}
                    />
                )}

                {viewMode === 'continuous' && (
                    <DesktopAgendaView
                        currentDate={date}
                        eventsByDay={eventsByDay}
                        onEventClick={(clickedEvent, rect) => {
                            lastPopoverOpenTimeRef.current = Date.now();
                            setActivePopover({ id: clickedEvent.id, rect });
                        }}
                        onEventCreate={onEventCreate}
                        onEventDelete={onEventDelete}
                        onTaskToggle={(id, currentIsCompleted) => {
                            if (onEventSave) onEventSave(id, { is_completed: !currentIsCompleted });
                        }}
                        themes={themes}
                    />
                )}

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



            {/* Directional Today Button — appears at edge when today is off-screen (week view only) */}
            {todayButtonDir !== 'hidden' && viewMode === 'week' && (
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
