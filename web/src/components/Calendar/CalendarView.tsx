import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { ComponentProps } from "react";
import DayColumn from "@/components/Calendar/DayColumn";
import "@/app/calendar/calendar.css";
import { addDays, addMonths, addWeeks } from "date-fns";
import { ArrowRight } from "lucide-react";
import { useHighlight } from "@/components/HighlightContext";
import { useDataStore, useWeekStartsOn } from "@/store/useDataStore";
import { startOfCalendarWeek, weeksForViewMode } from "@/lib/calendarWeeks";
import { ScheduleModal } from './ScheduleModal';
import { CalendarImportModal } from './CalendarImportModal';
import { CalendarWeekTimeGrid } from './CalendarWeekTimeGrid';
import { CalendarToolbar } from './CalendarToolbar';
import DesktopMonthView from './DesktopMonthView';
import DesktopAgendaView from './DesktopAgendaView';
import DesktopDayView from './DesktopDayView';
import { CalendarProjectionLayer } from './CalendarProjectionLayer';
import { CalendarEventPopoverHost } from './CalendarEventPopoverHost';
import { useCalendarDragResize } from './useCalendarDragResize';
import { useCalendarScroll } from './useCalendarScroll';
import { useEventsByDay } from './useEventsByDay';
import { useWeekWindow, initialScrollTop } from './useWeekWindow';
import { useFixedWeekNavigation } from './useFixedWeekNavigation';
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
    const calendarScrollMode = useDataStore(s => s.calendarScrollMode);
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

    // Infinite week view renders a virtual window around `date`; fixed mode exactly the week of
    // `date`; the other views a fixed week list from `date`.
    const isFixedWeek = viewMode === 'week' && calendarScrollMode === 'fixed';
    const weekWindow = useWeekWindow({
        scrollContainerRef,
        date,
        onDateChange,
        weekStartsOn,
        enabled: viewMode === 'week' && !isFixedWeek,
    });
    const fixedWeeks = useMemo(() => {
        if (viewMode === 'month' || viewMode === 'continuous') {
            return weeksForViewMode(date, viewMode, weekStartsOn);
        }
        const current = startOfCalendarWeek(date, weekStartsOn);
        if (isFixedWeek) return [current];
        return [addWeeks(current, -1), current, addWeeks(current, 1)];
    }, [date, viewMode, weekStartsOn, isFixedWeek]);
    const weeks = viewMode === 'week' && !isFixedWeek ? weekWindow.weeks : fixedWeeks;
    const eventsRange = viewMode === 'week' && !isFixedWeek
        ? weekWindow.range
        : { start: fixedWeeks[0], end: addDays(fixedWeeks[fixedWeeks.length - 1], 7) };

    // Toolbar navigation: one day, one week or one month per step, depending on the view.
    const handleStep = (dir: 1 | -1) => {
        if (viewMode === 'month') onDateChange(addMonths(date, dir));
        else if (viewMode === 'day') onDateChange(addDays(date, dir));
        else onDateChange(addDays(date, 7 * dir));
    };

    // New event at 9:00 on the selected day, one hour long (same default as the continuous view).
    const handleCreateNow = onEventCreate
        ? () => {
            const start = new Date(date);
            start.setHours(9, 0, 0, 0);
            const end = new Date(start);
            end.setHours(10, 0, 0, 0);
            onEventCreate(start, end, false);
        }
        : undefined;

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

    // Fixed one-week mode: ←/→, wheel and touch swipes page weeks; never while an event is dragged.
    useFixedWeekNavigation({
        containerRef: scrollContainerRef,
        date,
        onDateChange,
        enabled: isFixedWeek,
        isDragging: !!(draggingId || resizingId || creationDrag),
    });

    // The infinite week view restores the vertical position itself (useWeekWindow); do it here for fixed mode.
    // A container that already existed before a runtime mode switch keeps its live vertical position.
    const seenContainerRef = useRef<HTMLDivElement | null>(null);
    useLayoutEffect(() => {
        const container = scrollContainerRef.current;
        const fresh = seenContainerRef.current !== container;
        seenContainerRef.current = container;
        if (!isFixedWeek || !container) return;
        container.scrollLeft = 0; // a position left over from the infinite mode would shift the clipped week
        if (fresh) container.scrollTop = initialScrollTop();
    }, [isFixedWeek, viewMode]);

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
        fixedWeek: isFixedWeek,
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
                <CalendarToolbar
                    date={date}
                    viewMode={viewMode}
                    onViewModeChange={handleViewModeChange}
                    themes={themes}
                    selectedGroupId={selectedGroupId}
                    onSelectGroup={setSelectedGroupId}
                    onImportClick={() => setIsImportModalOpen(true)}
                    onStep={handleStep}
                    onToday={() => onDateChange(new Date())}
                    onCreate={handleCreateNow}
                />

                {/* Main View Area */}
                {viewMode === 'week' && (
                    <div
                        ref={scrollContainerRef}
                        className={`flex-1 relative flex trackpad-scroll-free ${isFixedWeek ? 'overflow-y-auto overflow-x-hidden' : 'overflow-auto'}`}
                        style={{ touchAction: isFixedWeek ? 'pan-y' : 'pan-x pan-y', overscrollBehavior: 'none' }}
                    >
                        <CalendarWeekTimeGrid
                            weeks={weeks}
                            leftSpacerPx={isFixedWeek ? 0 : weekWindow.leftSpacerPx}
                            rightSpacerPx={isFixedWeek ? 0 : weekWindow.rightSpacerPx}
                            fluid={isFixedWeek}
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
            {todayButtonDir !== 'hidden' && viewMode === 'week' && !isFixedWeek && (
                <div
                    className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${todayButtonDir === 'left' ? 'left-[68px]' : 'right-4'}`}
                    style={{ zIndex: 490 }}
                >
                    <button
                        className="pointer-events-auto flex flex-col items-center gap-1 px-3 py-3 bg-t2-surface  border border-t2-line  rounded-2xl shadow-xl hover:bg-t2-sub  transition-all text-t2-ink  group"
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
