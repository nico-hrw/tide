import React, { useState, useEffect, useMemo, useRef } from "react";
import type { ComponentProps } from "react";
import DayColumn from "@/components/Calendar/DayColumn";
import "@/app/calendar/calendar.css";
import { format, addDays, addWeeks } from "date-fns";
import { de } from "date-fns/locale";
import { ArrowRight, Upload } from "lucide-react";
import { useHighlight } from "@/components/HighlightContext";
import { useWeekStartsOn } from "@/store/useDataStore";
import { startOfCalendarWeek, weeksForViewMode } from "@/lib/calendarWeeks";
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
import { useWeekWindow } from './useWeekWindow';
import type { CalendarViewProps, CalendarViewMode } from './types';

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
    enabledExtensions = [],
}: CalendarViewProps) {
    const weekStartsOn = useWeekStartsOn();
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [internalViewMode, setInternalViewMode] = useState<CalendarViewMode>(viewModeProp || 'week');
    const viewMode = viewModeProp ?? internalViewMode;

    const handleViewModeChange = (mode: CalendarViewMode) => {
        setInternalViewMode(mode);
        onViewModeChange?.(mode);
    };

    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());

    // Week view renders a virtual window around `date`; the other views a fixed week list from `date`.
    const weekWindow = useWeekWindow({
        scrollContainerRef,
        date,
        onDateChange,
        weekStartsOn,
        enabled: viewMode === 'week',
    });
    const fixedWeeks = useMemo(() => {
        if (viewMode === 'month' || viewMode === 'continuous') {
            return weeksForViewMode(date, viewMode, weekStartsOn);
        }
        const current = startOfCalendarWeek(date, weekStartsOn);
        return [addWeeks(current, -1), current, addWeeks(current, 1)];
    }, [date, viewMode, weekStartsOn]);
    const weeks = viewMode === 'week' ? weekWindow.weeks : fixedWeeks;
    const eventsRange = viewMode === 'week'
        ? weekWindow.range
        : { start: fixedWeeks[0], end: addDays(fixedWeeks[fixedWeeks.length - 1], 7) };

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

    // Auto-update current time
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 15000); // 15 seconds to keep the pulse fresh
        return () => clearInterval(timer);
    }, []);

    // --- Popover state, link navigation, scroll persistence, "Today" button ---
    const {
        todayButtonDir,
        todayAngle,
        handleScrollToToday,
        activePopover,
        setActivePopover,
        lastPopoverOpenTimeRef,
    } = useCalendarScroll({
        scrollContainerRef,
        date,
        onDateChange,
        viewMode,
        weeks,
        events,
        editingEventId,
    });

    const eventsByDay = useEventsByDay(events, eventsRange, selectedGroupId, themes);

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
                        {/* Left: Date Title */}
                        <div className="flex items-center gap-3">
                            <h2 className="text-base sm:text-lg md:text-xl font-extrabold text-[#1F2937] dark:text-[#E2E8F0] tracking-tight">
                                {viewMode === 'day' 
                                    ? format(date, "EEEE, d. MMMM yyyy", { locale: de }) 
                                    : format(date, "MMMM yyyy", { locale: de })}
                            </h2>
                        </div>

                        {/* Right: View Mode switcher pills & actions */}
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setIsImportModalOpen(true)}
                                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-xl bg-gray-100/70 dark:bg-white/5 border border-gray-200/60 dark:border-white/10 text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer"
                                title="Google Kalender (.ics) importieren"
                            >
                                <Upload size={13} />
                                <span>Import</span>
                            </button>

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
                            weeks={weekWindow.weeks}
                            leftSpacerPx={weekWindow.leftSpacerPx}
                            rightSpacerPx={weekWindow.rightSpacerPx}
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
