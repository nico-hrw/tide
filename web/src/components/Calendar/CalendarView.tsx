import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import type { ComponentProps } from "react";
import DayColumn from "@/components/Calendar/DayColumn";
import "@/app/calendar/calendar.css";
import { format, startOfWeek, addWeeks, subWeeks, getMinutes, getHours, addDays, subDays, addMonths, subMonths, startOfMonth, isSameDay, getISOWeek } from "date-fns";
import { de } from "date-fns/locale";
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Plus, Upload } from "lucide-react";
import { SearchIndexEntry } from "@/lib/searchIndex";
import Fuse from "fuse.js";
import { useHighlight } from "@/components/HighlightContext";
import { useDataStore } from "@/store/useDataStore";
import { ScheduleModal } from './ScheduleModal';
import { CalendarImportModal } from './CalendarImportModal';
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

const VIEW_LABELS: Record<CalendarViewMode, string> = {
    day: 'Tag',
    week: 'Woche',
    month: 'Monat',
    continuous: 'Fortlaufend',
};

const VIEW_OPTIONS: { id: CalendarViewMode; label: string }[] = [
    { id: 'day', label: 'Tag' },
    { id: 'week', label: 'Woche' },
    { id: 'month', label: 'Monat' },
    { id: 'continuous', label: 'Fortlaufend' },
];

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

    const stepDate = (dir: 1 | -1) => {
        if (viewMode === 'month') return dir > 0 ? addMonths(date, 1) : subMonths(date, 1);
        if (viewMode === 'day') return addDays(date, dir);
        return addDays(date, 7 * dir);
    };

    // Termin ab 9:00 am gewählten Tag, 1 Stunde (wie in der Fortlaufend-Ansicht)
    const handleCreateNow = () => {
        if (!onEventCreate) return;
        const start = new Date(date);
        start.setHours(9, 0, 0, 0);
        const end = new Date(start);
        end.setHours(10, 0, 0, 0);
        onEventCreate(start, end, false);
    };

    const handleViewModeChange = (mode: CalendarViewMode) => {
        if (mode === 'week' && viewMode !== 'week') {
            hasInitializedScroll.current = false;
        }
        setInternalViewMode(mode);
        onViewModeChange?.(mode);
    };

    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [isGroupsSidebarOpen, setIsGroupsSidebarOpen] = useState(false);

    // Feature Tracking
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [viewMenuOpen, setViewMenuOpen] = useState(false);
    // Search bar anchor: 0=bottom-left, 1=bottom-center, 2=bottom-right, 3=top-center
    const [searchAnchor, setSearchAnchor] = useState(1);

    // Filter events based on selected groups/themesHighlight();

    // Week view: 'single' shows exactly one week, 'infinite' loads weeks while scrolling.
    const weekScroll = useDataStore((s) => s.calendarWeekScroll);
    const singleWeek = viewMode === 'week' && weekScroll === 'single';
    // Set when the visible date comes from scrolling, so the loaded window is left alone.
    const scrollDrivenDateRef = useRef(false);
    // Day (yyyy-MM-dd) to center horizontally once its column is rendered.
    const centerRequestRef = useRef<string | null>(format(date, "yyyy-MM-dd"));

    const [loadedWeeks, setLoadedWeeks] = useState<Date[]>(() => {
        const currentStart = startOfWeek(date, { weekStartsOn: 1 });
        if (singleWeek) return [currentStart];
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

    useEffect(() => {
        const handleScrollTo = (e: any) => {
            const { id, start } = e.detail;
            if (start) {
                const targetDate = new Date(start);
                onDateChange(targetDate);

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

    // Initialize with weeks appropriate for the active view mode.
    // Layout effect, so a window change and its centering land before the next paint.
    useLayoutEffect(() => {
        const sync = () => {
            const currentStart = startOfWeek(date, { weekStartsOn: 1 });

            if (prevViewModeRef.current !== 'week' && viewMode === 'week') {
                hasInitializedScroll.current = false;
                centerRequestRef.current = format(date, "yyyy-MM-dd");
                setLoadedWeeks(singleWeek ? [currentStart] : [
                    subWeeks(currentStart, 1),
                    currentStart,
                    addWeeks(currentStart, 1)
                ]);
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

            // Week view. The visible date is the single source of truth:
            // - one week: always just the week of `date`
            // - infinite: a date that came from scrolling is already in the window, so keep it;
            //   any other jump re-centers, loading a new window only if it is out of range
            if (singleWeek) {
                centerRequestRef.current = format(date, "yyyy-MM-dd");
                setLoadedWeeks([currentStart]);
                return;
            }
            if (scrollDrivenDateRef.current) {
                scrollDrivenDateRef.current = false;
                return;
            }
            centerRequestRef.current = format(date, "yyyy-MM-dd");
            setLoadedWeeks((prev) => {
                const firstWeek = prev[0];
                const lastWeek = prev[prev.length - 1];
                if (firstWeek && lastWeek && currentStart >= firstWeek && currentStart <= lastWeek) {
                    return prev;
                }
                return [subWeeks(currentStart, 1), currentStart, addWeeks(currentStart, 1)];
            });
        };
        sync();
    }, [date, viewMode, singleWeek]);

    // Center the requested day column once it is rendered. Replaces the old
    // timer-based horizontal scrolling, which raced with the week window updates.
    useLayoutEffect(() => {
        const container = scrollContainerRef.current;
        const iso = centerRequestRef.current;
        if (!container || !iso || viewMode !== 'week') return;
        const col = container.querySelector(`[data-day-col="${iso}"]`) as HTMLElement | null;
        if (!col) return; // not rendered yet, keep the request
        centerRequestRef.current = null;
        container.scrollLeft = Math.max(0, col.offsetLeft - container.clientWidth / 2 + col.offsetWidth / 2 - 30);
    }, [loadedWeeks, viewMode, date]);

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

            // Horizontal centering happens in the layout effect below (centerRequestRef).
            hasInitializedScroll.current = true;
        }
    }, [loadedWeeks, viewMode, date]);

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
        singleWeek,
        scrollDrivenDateRef,
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
                {/* Kopfzeile nach Tide-2-Mockup: Titel mit KW, Navigation, Ansichtsmenü, Termin */}
                {/* (Helfer für Navigation und Ansichtsmenü) */}
                {/* Toolbar — position:relative + zIndex:500 creates a stacking context above
                    all sticky calendar elements (time col z-[160], day headers z-[150]). */}
                <div className="flex flex-col bg-transparent border-b border-gray-200/60 dark:border-white/10" style={{ position: 'relative', zIndex: 500 }}>
                    {/* Row 1: Titel mit Kalenderwoche, Navigation, Ansichtsmenü und Termin-Button */}
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold tracking-tight text-t2-ink sm:text-xl">
                                {viewMode === 'day'
                                    ? format(date, "EEEE, d. MMMM yyyy", { locale: de })
                                    : format(date, "MMMM yyyy", { locale: de })}
                            </h2>
                            <span className="text-[13px] text-t2-ink-3">KW {getISOWeek(date)}</span>
                            <div className="ml-2 flex items-center">
                                <button type="button" onClick={() => onDateChange(stepDate(-1))} aria-label="Zurück" className="rounded-[8px] p-1.5 text-t2-ink-2 transition-colors hover:bg-t2-hover">
                                    <ChevronLeft size={16} />
                                </button>
                                <button type="button" onClick={() => onDateChange(new Date())} className="rounded-[8px] px-2.5 py-1 text-[13px] text-t2-ink-2 transition-colors hover:bg-t2-hover">
                                    Heute
                                </button>
                                <button type="button" onClick={() => onDateChange(stepDate(1))} aria-label="Weiter" className="rounded-[8px] p-1.5 text-t2-ink-2 transition-colors hover:bg-t2-hover">
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setViewMenuOpen((open) => !open)}
                                    className="flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[13.5px] text-t2-ink-2 transition-colors hover:bg-t2-hover"
                                    aria-haspopup="menu"
                                    aria-expanded={viewMenuOpen}
                                >
                                    {VIEW_LABELS[viewMode]}
                                    <ChevronDown size={14} />
                                </button>
                                {viewMenuOpen && (
                                    <div role="menu" className="absolute right-0 top-full z-[600] mt-1 flex w-44 flex-col gap-0.5 rounded-[12px] bg-t2-surface p-1.5 shadow-[0_0_0_1px_var(--t2-line)]">
                                        {VIEW_OPTIONS.map((opt) => (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                role="menuitem"
                                                onClick={() => {
                                                    handleViewModeChange(opt.id);
                                                    setViewMenuOpen(false);
                                                }}
                                                className={`flex items-center justify-between rounded-[8px] px-2.5 py-1.5 text-left text-[13.5px] transition-colors hover:bg-t2-hover ${
                                                    viewMode === opt.id ? "font-semibold text-t2-ink" : "text-t2-ink-2"
                                                }`}
                                            >
                                                {opt.label}
                                                {viewMode === opt.id && <span className="text-t2-ink-3">✓</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={() => setIsImportModalOpen(true)}
                                className="rounded-[10px] p-1.5 text-t2-ink-3 transition-colors hover:bg-t2-hover hover:text-t2-ink-2"
                                title="Google Kalender (.ics) importieren"
                                aria-label="Importieren"
                            >
                                <Upload size={15} />
                            </button>

                            <button
                                type="button"
                                onClick={handleCreateNow}
                                disabled={!onEventCreate}
                                className="flex items-center gap-1.5 rounded-[10px] bg-t2-ink px-3.5 py-1.5 text-[13.5px] font-semibold text-t2-bg transition-opacity hover:opacity-90 disabled:opacity-40"
                            >
                                <Plus size={14} />
                                Termin
                            </button>
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
                        className="flex-1 relative flex overflow-auto trackpad-scroll-free"
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
                        className="flex-1 relative flex overflow-y-auto overflow-x-hidden"
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

            {isImportModalOpen && (
                <CalendarImportModal
                    isOpen={isImportModalOpen}
                    onClose={() => setIsImportModalOpen(false)}
                    themes={themes}
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
