import React, { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from "react";
import DayColumn from "@/components/Calendar/DayColumn";
import "@/app/calendar/calendar.css";
import { format, addDays, subDays, startOfWeek, addWeeks, subWeeks, isSameDay, getMinutes, getHours, startOfDay } from "date-fns";
import { ChevronLeft, ChevronRight, ListPlus } from "lucide-react";
import { useHighlight } from "@/components/HighlightContext";
import { ScheduleModal } from './ScheduleModal';
import { useMotionValue, motion, useTransform } from 'framer-motion';
import { MagnifiedEventView } from './MagnifiedEventView';
import { DragGhost } from './DragGhost';

interface CalendarEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    description?: string;
    parent_id?: string | null;
    color?: string;
    effect?: string;
    allDay?: boolean;
    recurrence?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
    is_task?: boolean;
    is_completed?: boolean;
}

interface CalendarViewProps {
    events: CalendarEvent[];
    onEventCreate: (start: Date, end: Date) => Promise<void>;
    onEventUpdate: (id: string, start: Date, end: Date) => Promise<void>;
    onEventRename: (id: string, title: string) => Promise<void>;
    onEventDelete?: (id: string) => Promise<void>;
    onEventSave?: (id: string, updates: Partial<CalendarEvent> & { parent_id?: string | null; is_task?: boolean; is_completed?: boolean }) => void;
    onEventClick?: (id: string, rect?: DOMRect) => void;
    onEventShare?: (e: React.MouseEvent, id: string) => void;
    editingEventId?: string | null;
    date: Date; // Initial View Date
    onDateChange: (date: Date) => void;
    themes?: { id: string; title: string; effect?: string }[];
    enabledExtensions?: string[];
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
    enabledExtensions = []
}: CalendarViewProps) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [selectedThemes, setSelectedThemes] = useState<Set<string>>(new Set());
    const [isGroupsSidebarOpen, setIsGroupsSidebarOpen] = useState(false);
    const [isThemesOpen, setIsThemesOpen] = useState(false);

    // Feature Tracking
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

    // Filter events based on selected groups/themesHighlight();

    const [loadedWeeks, setLoadedWeeks] = useState<Date[]>([]);
    const [currentTime, setCurrentTime] = useState(new Date());
    const isPrependingRef = useRef(false);
    const { highlight } = useHighlight();

    // Unified drop logic is now handled in handleGlobalMouseUp


    // --- Hover State ---
    const [hoveredHour, setHoveredHour] = useState<number | null>(null);

    // --- DnD State ---
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dragState, setDragState] = useState<{ startY: number, startX: number, originalTop: number, currentTop: number, currentLeft: number, originalDayIndex: number, initialX: number, initialWidth: number, initialScrollTop: number } | null>(null);
    const pendingDragRef = useRef<{ id: string, startX: number, startY: number, startMinutes: number, initialX: number, initialWidth: number, initialScrollTop: number } | null>(null);

    const [creationDrag, setCreationDrag] = useState<{ startDay: Date, startY: number, currentY: number, startX: number, currentX: number } | null>(null);
    const [resizingId, setResizingId] = useState<string | null>(null);
    const [resizeDragState, setResizeDragState] = useState<{ startY: number, originalTop: number, originalHeight: number, currentHeight: number, initialScrollTop: number } | null>(null);
    const isDraggingRef = useRef(false);

    // --- Precise Mode State ---
    const [isPreciseMode, setIsPreciseMode] = useState(false);
    const isPreciseModeRef = useRef(false);

    // Bypassing React renders for 60FPS Projection layer transforms
    const cursorX = useMotionValue(0);
    const cursorY = useMotionValue(0);

    // ---- 60FPS Drag/Resize MotionValues (bypasses React renders entirely) ----
    // Drag overlay position & size
    const dragOverlayY = useMotionValue(0);
    const dragOverlayX = useMotionValue(0);
    const dragOverlayW = useMotionValue(0);
    const dragOverlayH = useMotionValue(0);
    // Resize visual height
    const resizeHeightMV = useMotionValue(0);
    // Creation preview ending Y (absolute screen coords → converted back in DayColumn)
    const creationEndYMV = useMotionValue(0);

    // Gearing & Friction State
    const physicalMouseRef = useRef({ x: 0, y: 0 });
    const gearedMouseRef = useRef({ x: 0, y: 0 });
    const preciseAnchorRef = useRef<{ physY: number, gearY: number, gearX: number } | null>(null);

    // Tracks the current event-edge minute in real time (e.g. end minute for resize)
    // so that the Loupe Y can be anchored to the rendered event edge position.
    const activeEventEdgeRef = useRef<number>(0);
    // Ref to the days-grid wrapper so we can getBoundingClientRect for screen-space calc.
    const gridDaysRef = useRef<HTMLDivElement>(null);

    const [dropBounds, setDropBounds] = useState<DOMRect | null>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '') || (document.activeElement as HTMLElement)?.isContentEditable) return;
            if (e.key === 'Alt' || e.key === 'Shift') {
                if (!isPreciseModeRef.current) {
                    setIsPreciseMode(true);
                    isPreciseModeRef.current = true;
                    // Latch anchor for gearing
                    preciseAnchorRef.current = {
                        physY: physicalMouseRef.current.y,
                        gearY: gearedMouseRef.current.y,
                        gearX: gearedMouseRef.current.x
                    };
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Alt' || e.key === 'Shift') {
                setIsPreciseMode(false);
                isPreciseModeRef.current = false;

                if (preciseAnchorRef.current) {
                    const diffX = physicalMouseRef.current.x - gearedMouseRef.current.x;
                    const diffY = physicalMouseRef.current.y - gearedMouseRef.current.y;

                    // Reconcile start drag coordinates so the physical cursor's new delta matches the old geared delta perfectly
                    setDragState(prev => prev ? { ...prev, startY: prev.startY + diffY, startX: prev.startX + diffX } : prev);
                    setCreationDrag(prev => prev ? { ...prev, startY: prev.startY + diffY, startX: prev.startX + diffX } : prev);
                    setResizeDragState(prev => prev ? { ...prev, startY: prev.startY + diffY } : prev);
                }

                preciseAnchorRef.current = null;
            }
        };

        const handleFocus = () => {
             // Reset precise mode on window focus to avoid stuck Loupe after Alt+Tab
            setIsPreciseMode(false);
            isPreciseModeRef.current = false;
            preciseAnchorRef.current = null;
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('focus', handleFocus);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('focus', handleFocus);
        };
    }, []);

    // --- Popover State ---
    const [activePopover, setActivePopover] = useState<{ id: string, rect: DOMRect } | null>(null);

    // Initialize with current, prev, and next week
    useEffect(() => {
        const currentStart = startOfWeek(date, { weekStartsOn: 1 });
        setLoadedWeeks([
            subWeeks(currentStart, 1),
            currentStart,
            addWeeks(currentStart, 1)
        ]);
        isPrependingRef.current = true; // Force initial scroll center
    }, [date]);

    // Auto-update current time
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000 * 5); // 5 mins is enough for a red line indicator
        return () => clearInterval(timer);
    }, []);

    // --- Event Popover Component (Isolated to prevent typing lag) ---
    const EventPopover = ({ event, rect, themes, onEventSave, onClose, enabledExtensions }: {
        event: CalendarEvent, rect: DOMRect, themes: any[], onEventSave: any, onClose: () => void, enabledExtensions: string[]
    }) => {
        const [title, setTitle] = useState(event.title);
        const [description, setDescription] = useState(event.description || '');
        const [isTask, setIsTask] = useState(!!event.is_task);
        const [isCompleted, setIsCompleted] = useState(!!event.is_completed);
        const theme = getEventTheme(event);

        useEffect(() => {
            setTitle(event.title);
            setDescription(event.description || '');
            setIsTask(!!event.is_task);
            setIsCompleted(!!event.is_completed);
        }, [event.id]);

        const handleTitleBlur = () => { if (title !== event.title) onEventSave(event.id, { title }); };
        const handleDescBlur = () => { if (description !== (event.description || '')) onEventSave(event.id, { description }); };

        const handleTaskToggle = (newIsTask: boolean) => {
            setIsTask(newIsTask);
            if (!newIsTask) {
                setIsCompleted(false);
                onEventSave(event.id, { is_task: false, is_completed: false });
            } else {
                onEventSave(event.id, { is_task: true });
            }
        };

        const handleCompleteToggle = (newIsCompleted: boolean) => {
            setIsCompleted(newIsCompleted);
            onEventSave(event.id, { is_completed: newIsCompleted });
        };

        let top = rect.top;
        let left = rect.right + 10;
        if (window.innerWidth - left < 350) left = rect.left - 360;
        if (top < 50) top = 50;

        return (
            <div
                id="active-event-popover"
                className="fixed z-[100] w-[340px] bg-white rounded-2xl shadow-2xl border border-gray-100 p-5 flex flex-col gap-3"
                style={{ top: `${top}px`, left: `${left}px` }}
            >
                {/* Header */}
                <div className="flex items-start justify-between">
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onBlur={handleTitleBlur}
                        className="text-lg font-semibold text-gray-900 leading-tight pr-4 bg-transparent border-none focus:ring-0 p-0 w-full outline-none"
                        placeholder="Event Title"
                    />
                    <button
                        onClick={onClose}
                        className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                {/* Theme Select */}
                <div className="flex items-center">
                    <select
                        value={event.parent_id || 'general-theme'}
                        onChange={(e) => {
                            const val = e.target.value === 'general-theme' ? null : e.target.value;
                            if (onEventSave) onEventSave(event.id, { parent_id: val });
                        }}
                        className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider outline-none cursor-pointer border appearance-none"
                        style={{ backgroundColor: theme.bg, color: theme.text, borderColor: theme.border }}
                    >
                        <option value="general-theme">No Theme</option>
                        {themes.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                    </select>
                </div>

                {/* Recurrence Select */}
                <div className="flex items-center gap-2 text-gray-600">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21 2 2 2h-6a1 1 0 0 0-1 1v6l2 2"></path><path d="M22 11.5A10 10 0 1 1 12 2"></path></svg>
                    <select
                        value={event.recurrence || 'none'}
                        onChange={(e) => {
                            if (onEventSave) onEventSave(event.id, { recurrence: e.target.value as any });
                        }}
                        className="text-sm font-medium bg-transparent border-none focus:ring-0 p-0 outline-none cursor-pointer text-gray-700"
                    >
                        <option value="none">Does not repeat</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                    </select>
                </div>

                {/* Task Toggle Row */}
                <div className="flex items-center justify-between px-0">
                    <div className="flex items-center gap-2 text-gray-600">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                        <span className="text-sm font-medium text-gray-700">Mark as Task</span>
                    </div>
                    <button
                        onClick={() => handleTaskToggle(!isTask)}
                        className={`relative w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none ${isTask ? 'bg-violet-500' : 'bg-gray-200'
                            }`}
                    >
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${isTask ? 'translate-x-4' : 'translate-x-0'
                            }`} />
                    </button>
                </div>

                {/* Complete Toggle Row (shown only when is_task) */}
                {isTask && (
                    <div className="flex items-center justify-between px-0">
                        <div className="flex items-center gap-2 text-gray-600">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isCompleted ? '#10b981' : 'currentColor'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle>{isCompleted && <polyline points="9 12 11 14 15 10"></polyline>}</svg>
                            <span className={`text-sm font-medium ${isCompleted ? 'text-emerald-500 line-through' : 'text-gray-700'}`}>Mark as Complete</span>
                        </div>
                        <button
                            onClick={() => handleCompleteToggle(!isCompleted)}
                            className={`relative w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none ${isCompleted ? 'bg-emerald-500' : 'bg-gray-200'
                                }`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${isCompleted ? 'translate-x-4' : 'translate-x-0'
                                }`} />
                        </button>
                    </div>
                )}

                {/* Time Row */}
                <div className="flex items-center gap-2 text-gray-600 mt-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    <span className="text-sm font-medium">
                        {format(new Date(event.start), "EEEE, dd. MMM")} • {format(new Date(event.start), "HH:mm")} - {format(new Date(event.end), "HH:mm")}
                    </span>
                </div>

                {/* Notes */}
                <div className="flex gap-2 text-gray-500 mt-2 bg-gray-50 p-3 rounded-xl border border-gray-100/50">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onBlur={handleDescBlur}
                        placeholder="Add description..."
                        className="text-sm leading-relaxed w-full bg-transparent border-none focus:ring-0 p-0 outline-none resize-none min-h-[40px] appearance-none"
                    />
                </div>
            </div>
        );
    };

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


    // Throttled scroll handler to persist state and trigger infinite loading
    const lastScrollCallRef = useRef(0);
    const onScroll = useCallback(() => {
        const now = Date.now();
        if (now - lastScrollCallRef.current < 100) return; // Throttle to 10fps for scroll metadata persistence
        lastScrollCallRef.current = now;

        const container = scrollContainerRef.current;
        if (!container) return;

        // Persist scroll position
        localStorage.setItem("tide_calendar_scroll_x", container.scrollLeft.toString());
        localStorage.setItem("tide_calendar_scroll_y", container.scrollTop.toString());


        const { scrollLeft, scrollWidth, clientWidth } = container;
        const threshold = 300;
        // console.log("Scroll Debug:", { scrollLeft, scrollWidth, clientWidth, threshold });

        if (scrollLeft < threshold) {
            setLoadedWeeks(prev => {
                const firstLoaded = prev[0];
                const newPrev = subWeeks(firstLoaded, 1);
                if (isSameDay(firstLoaded, newPrev)) return prev;
                isPrependingRef.current = true;
                return [newPrev, ...prev];
            });
        }

        if (scrollLeft + clientWidth > scrollWidth - threshold) {
            setLoadedWeeks(prev => {
                const lastLoaded = prev[prev.length - 1];
                const newNext = addWeeks(lastLoaded, 1);
                // Simple debounce check/limit could be added here
                return [...prev, newNext];
            });
        }
    }, []);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const scrollHandler = () => {
            onScroll();
            if (activePopover) {
                setActivePopover(null);
            }
        };

        container.addEventListener('scroll', scrollHandler);

        // Also capture window-level or document-level scrolling just in case trackpad causes body scroll
        const globalScrollHandler = (e: Event) => {
            if (activePopover && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
                setActivePopover(null);
            }
        };

        const globalMouseMoveHandler = (e: MouseEvent) => {
            if (activePopover) {
                const popoverEl = document.getElementById('active-event-popover');
                if (popoverEl) {
                    const rect = popoverEl.getBoundingClientRect();
                    const distanceX = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
                    const distanceY = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
                    const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);

                    // Include hover event block buffer
                    const blockRect = activePopover.rect;
                    const blockDistX = Math.max(blockRect.left - e.clientX, 0, e.clientX - blockRect.right);
                    const blockDistY = Math.max(blockRect.top - e.clientY, 0, e.clientY - blockRect.bottom);
                    const blockDistance = Math.sqrt(blockDistX * blockDistX + blockDistY * blockDistY);

                    if (Math.min(distance, blockDistance) > 150) { // 150px threshold
                        setActivePopover(null);
                    }
                }
            }
        };

        const globalClickHandler = (e: MouseEvent) => {
            if (activePopover) {
                const popoverEl = document.getElementById('active-event-popover');
                if (popoverEl && popoverEl.contains(e.target as Node)) {
                    return;
                }
                setActivePopover(null);
            }
        };

        window.addEventListener('scroll', globalScrollHandler, true);
        window.addEventListener('mousemove', globalMouseMoveHandler, true);
        window.addEventListener('mousedown', globalClickHandler, true);

        return () => {
            container.removeEventListener('scroll', scrollHandler);
            window.removeEventListener('scroll', globalScrollHandler, true);
            window.removeEventListener('mousemove', globalMouseMoveHandler, true);
            window.removeEventListener('mousedown', globalClickHandler, true);
        };
    }, [onScroll, activePopover]);

    // Custom 2D Scroll Handler (Bypasses Browser Axis Locking)
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) return; // Allow zooming

            // UNCONDITIONALLY prevent default to completely disable Chrome/Windows scroll rails 
            // the moment the gesture starts.
            e.preventDefault();

            // Directly apply the raw trackpad deltas for true 2D diagonal panning
            const scrollableX = container.scrollWidth > container.clientWidth;
            const scrollableY = container.scrollHeight > container.clientHeight;

            if (scrollableX || scrollableY) {
                // By preventing default, we stop the browser's native axis locking logic.
                // We then manually apply the deltas to create a true 2D scroll experience.
                container.scrollLeft += e.deltaX;
                container.scrollTop += e.deltaY;
            }
        };

        // passive: false is required to call preventDefault
        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, []);

    // Adjust Scroll Position for Prepending
    useLayoutEffect(() => {
        const container = scrollContainerRef.current;
        if (!container || loadedWeeks.length === 0) return;

        if (isPrependingRef.current) {
            // Wait for render? UseLayoutEffect fires after DOM mutations but before paint.
            // We need to ensure children are rendered. This might be tricky if state update is batched.

            if (loadedWeeks.length === 3) {
                // Center today's column instead of just scrolling to the week start
                const dayOfWeek = (date.getDay() + 6) % 7; // Mon=0, Tue=1 ... Sun=6
                const dayCols = container.querySelectorAll('[data-day-col]');
                if (dayCols.length >= 7 + dayOfWeek) {
                    // Column 7 = first day of middle week, 7+dayOfWeek = today
                    const todayCol = dayCols[7 + dayOfWeek] as HTMLElement;
                    if (todayCol) {
                        const targetLeft = todayCol.offsetLeft - container.offsetWidth / 2 + todayCol.offsetWidth / 2;
                        container.scrollLeft = Math.max(0, targetLeft);
                        isPrependingRef.current = false;
                        return;
                    }
                }
                // Fallback: scroll to start of middle week
                const weekWidth = container.scrollWidth / 3;
                container.scrollLeft = weekWidth;
                isPrependingRef.current = false;
            } else {
                // Prepend logic: find how much width was added
                // Count columns in DOM
                const dayCols = container.querySelectorAll('[data-day-col]');
                if (dayCols.length >= 7) {
                    let addedWidth = 0;
                    // We assume 7 days were added at the start
                    // We can measure the first 7 columns currently in DOM
                    for (let i = 0; i < 7; i++) {
                        const el = dayCols[i] as HTMLElement;
                        addedWidth += el.offsetWidth;
                    }
                    if (addedWidth > 0) {
                        container.scrollLeft += addedWidth;
                    }
                }
                isPrependingRef.current = false;
            }
        }
    }, [loadedWeeks]);

    // --- Global Mouse Handlers for DnD ---
    useEffect(() => {
        // ALWAYS attach listeners to ensure we catch mouseup even if state update lags.
        // We filter actions inside the handlers based on state.

        const handleMouseMove = (e: MouseEvent) => {
            physicalMouseRef.current = { x: e.clientX, y: e.clientY };

            if (isPreciseModeRef.current && preciseAnchorRef.current) {
                // In Precise Mode, X is completely locked. Y moves at 30% speed.
                const anchor = preciseAnchorRef.current;
                const rawDeltaY = e.clientY - anchor.physY;
                gearedMouseRef.current.x = anchor.gearX; // Lock X
                gearedMouseRef.current.y = anchor.gearY + (rawDeltaY * 0.3); // Gear Y
            } else {
                gearedMouseRef.current = { x: e.clientX, y: e.clientY };
            }

            const { x: gX, y: gY } = gearedMouseRef.current;

            // X uses gX (= axis-locked in Precise Mode → no lateral drift).
            // Y is derived from the event's ACTUAL screen-space edge, not the mouse position,
            // so the Loupe stays visually glued to the event boundary regardless of friction.
            cursorX.set(gX);
            if (isPreciseModeRef.current && gridDaysRef.current) {
                // getBoundingClientRect().top already incorporates scroll offset —
                // do NOT subtract scrollTop again or the Loupe will be placed far off screen.
                // The +50 accounts for the sticky 50px day-column header inside the grid.
                const gridRect = gridDaysRef.current.getBoundingClientRect();
                const eventEdgeScreenY = gridRect.top + 50 + activeEventEdgeRef.current;
                cursorY.set(eventEdgeScreenY);
            } else {
                cursorY.set(e.clientY);
            }

            // 1. Handle Pending Drag -> Real Drag Transition
            if (pendingDragRef.current) {
                const dx = gX - pendingDragRef.current.startX;
                const dy = gY - pendingDragRef.current.startY;

                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                    // Start dragging now!
                    setDragState({
                        startY: pendingDragRef.current.startY,
                        startX: pendingDragRef.current.startX,
                        originalTop: pendingDragRef.current.startMinutes,
                        currentTop: pendingDragRef.current.startMinutes,
                        currentLeft: 0,
                        originalDayIndex: 0,
                        initialX: pendingDragRef.current.initialX,
                        initialWidth: pendingDragRef.current.initialWidth,
                        initialScrollTop: pendingDragRef.current.initialScrollTop
                    });
                    pendingDragRef.current = null;
                    isDraggingRef.current = true;
                }
                return;
            }

            // 2. Existing Drag Logics
            if (draggingId && dragState) {
                const deltaY = gY - dragState.startY;
                const deltaX = gX - dragState.startX;

                if (!isDraggingRef.current && (Math.abs(deltaY) > 5 || Math.abs(deltaX) > 5)) {
                    isDraggingRef.current = true;
                    // Initialize motion values at drag start
                    dragOverlayY.set(dragState.originalTop);
                    dragOverlayX.set(dragState.initialX);
                }

                if (isDraggingRef.current) {
                    const scrollDelta = (scrollContainerRef.current?.scrollTop || 0) - dragState.initialScrollTop;
                    let newTop = dragState.originalTop + deltaY + scrollDelta;
                    if (newTop < 0) newTop = 0;
                    if (newTop > 1440 - 15) newTop = 1440 - 15;
                    // Keep Loupe anchored to event's top edge
                    activeEventEdgeRef.current = newTop;

                    // ✅ Drive overlay via MotionValue — bypasses React render
                    dragOverlayY.set(newTop);
                    dragOverlayX.set(dragState.initialX + deltaX);
                }
            } else if (creationDrag) {
                const deltaY = gY - creationDrag.startY;
                if (!isDraggingRef.current && Math.abs(deltaY) > 10) {
                    isDraggingRef.current = true;
                }
                // Keep Loupe anchored to the dragged edge of the new event
                const startMinsCreation = creationDrag.startDay.getHours() * 60 + creationDrag.startDay.getMinutes();
                const creationEndMin = startMinsCreation + Math.max(10, Math.abs(deltaY));
                activeEventEdgeRef.current = deltaY < 0 ? startMinsCreation + deltaY : creationEndMin;

                // ✅ Drive creation preview via MotionValue
                creationEndYMV.set(gY);
            } else if (resizingId && resizeDragState) {
                const deltaY = gY - resizeDragState.startY;
                if (!isDraggingRef.current && Math.abs(deltaY) > 10) {
                    isDraggingRef.current = true;
                }
                if (isDraggingRef.current) {
                    const scrollDelta = (scrollContainerRef.current?.scrollTop || 0) - resizeDragState.initialScrollTop;
                    let newHeight = resizeDragState.originalHeight + deltaY + scrollDelta;
                    let maxAllowedHeight = 1440 - resizeDragState.originalTop;
                    if (newHeight < 15) newHeight = 15;
                    if (newHeight > maxAllowedHeight) newHeight = maxAllowedHeight;
                    // Keep Loupe anchored to event's BOTTOM edge
                    activeEventEdgeRef.current = resizeDragState.originalTop + newHeight;

                    // Also update the state for the ruler
                    setResizeDragState(prev => prev ? { ...prev, currentHeight: newHeight } : prev);

                    // ✅ Drive resize via MotionValue
                    resizeHeightMV.set(newHeight);
                }
            }
        };

        const handleMouseUp = async (e: MouseEvent) => {
            // Clear pending drag if any (was just a click)
            if (pendingDragRef.current) {
                // If we haven't moved enough to drag, treat this as a CLICK.
                if (onEventClick) onEventClick(pendingDragRef.current.id);
                pendingDragRef.current = null;
                return;
            }

            if (isDraggingRef.current || draggingId || creationDrag || resizingId) {
                // Stash the target bounds BEFORE we clear state so the Projection Layer knows where to animate exit.
                if (draggingId) {
                    const el = document.getElementById(`event-${draggingId}`);
                    if (el) setDropBounds(el.getBoundingClientRect());
                } else if (resizingId) {
                    const el = document.getElementById(`event-${resizingId}`);
                    if (el) setDropBounds(el.getBoundingClientRect());
                }

                await handleGlobalMouseUp(e);
            } else {
                setDraggingId(null);
                setDragState(null);
                setCreationDrag(null);
                setResizingId(null);
                setResizeDragState(null);
                setDropBounds(null);
            }
            setTimeout(() => { isDraggingRef.current = false; }, 50);
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);

        const handleDragEnd = () => {
            if (isDraggingRef.current) {
                // This is a safety net in case mouseup doesn't fire (e.g., leaving window)
                setDraggingId(null);
                setDragState(null);
                setCreationDrag(null);
                setResizingId(null);
                setResizeDragState(null);
                setDropBounds(null);
                isDraggingRef.current = false;
                pendingDragRef.current = null;
            }
        };

        window.addEventListener("dragend", handleDragEnd);

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
            window.removeEventListener("dragend", handleDragEnd);
        };
    }, [draggingId, dragState, creationDrag, resizingId, resizeDragState, events]);

    const handleGlobalMouseUp = async (e: MouseEvent) => {
        if (creationDrag && onEventCreate) {
            const cDrag = creationDrag;
            setCreationDrag(null);

            const { x: gX, y: gY } = gearedMouseRef.current; // Use geared coords for drop target

            const deltaY = gY - cDrag.startY;
            const deltaX = gX - cDrag.startX;

            if (Math.abs(deltaY) < 10 && Math.abs(deltaX) < 10) {
                // Just a simple click, ignore!
                return;
            }

            const snapInterval = isPreciseModeRef.current ? 1 : 10;
            const deltaMins = Math.floor((gY - cDrag.startY) / snapInterval) * snapInterval;
            let targetTimeObj = new Date(cDrag.startDay.getTime() + deltaMins * 60000);

            let targetDayStr: string | null = null;
            const dayCols = document.querySelectorAll('[data-day-col]');
            dayCols.forEach((col) => {
                const rect = col.getBoundingClientRect();
                if (gX >= rect.left && gX <= rect.right) {
                    targetDayStr = col.getAttribute('data-day-col');
                }
            });

            if (targetDayStr) {
                const targetBaseDate = new Date(targetDayStr);
                targetTimeObj.setFullYear(targetBaseDate.getFullYear(), targetBaseDate.getMonth(), targetBaseDate.getDate());
            }

            // Clamp the target time to not exceed 24:00 of its OWN DAY.
            const targetBaseStart = startOfDay(targetTimeObj);
            const maxAllowedTime = targetBaseStart.getTime() + 24 * 60 * 60 * 1000;
            if (targetTimeObj.getTime() > maxAllowedTime) {
                targetTimeObj = new Date(maxAllowedTime);
            }

            let finalStart = new Date(Math.min(cDrag.startDay.getTime(), targetTimeObj.getTime()));
            let finalEnd = new Date(Math.max(cDrag.startDay.getTime(), targetTimeObj.getTime()));

            if (finalStart.getTime() === finalEnd.getTime()) {
                finalEnd = new Date(finalStart.getTime() + snapInterval * 60000);
            }

            // Cap final end to the end of its respective day, no dragging past midnight down forever unless horizontal spanning!
            // finalEnd is already clamped by targetTimeObj bounds above, but for safety:
            const maxClamp = startOfDay(finalEnd).getTime() + 24 * 60 * 60 * 1000;
            if (finalEnd.getTime() > maxClamp) finalEnd = new Date(maxClamp);

            await onEventCreate(finalStart, finalEnd);

        } else if (resizingId && resizeDragState && onEventUpdate) {
            const rId = resizingId;
            const rState = resizeDragState;

            const event = events.find(e => e.id === rId);
            if (event) {
                const { y: gY } = gearedMouseRef.current; // Use geared coords for drop target
                const deltaY = gY - rState.startY;
                const scrollDelta = (scrollContainerRef.current?.scrollTop || 0) - rState.initialScrollTop;
                const snapInterval = isPreciseModeRef.current ? 1 : 10;
                const minDuration = 10;
                const newHeight = Math.max(minDuration, rState.originalHeight + deltaY + scrollDelta);
                const snappedHeight = Math.max(minDuration, Math.round(newHeight / snapInterval) * snapInterval);

                const start = new Date(event.start);
                let end = new Date(start.getTime() + snappedHeight * 60000);

                // Ensure resize does not cross past the end of the day (24:00 constraint)
                const maxEnd = startOfDay(start).getTime() + 24 * 60 * 60 * 1000;
                if (end.getTime() > maxEnd) end = new Date(maxEnd);

                await onEventUpdate(rId, start, end);
            }
            setResizingId(null);
            setResizeDragState(null);
        }
    };

    const handleEventMouseDown = (e: React.MouseEvent, id: string, start: Date) => {
        if (e.button !== 0) return;
        e.stopPropagation(); // Prevent grid creation trigger

        const startMinutes = getHours(start) * 60 + getMinutes(start);

        const el = e.currentTarget as HTMLElement;
        const scrollContainer = scrollContainerRef.current;
        if (!scrollContainer || scrollContainer.children.length < 2) return;

        const containerRect = scrollContainer.children[1].getBoundingClientRect();
        const elRect = el.getBoundingClientRect();

        const initialX = elRect.left - containerRect.left;
        const initialWidth = elRect.width;

        // Start a PENDING drag using REF to avoid render lag
        pendingDragRef.current = {
            id,
            startX: gearedMouseRef.current.x, // Use geared coords for startX
            startY: gearedMouseRef.current.y, // Use geared coords for startY
            startMinutes,
            initialX,
            initialWidth,
            initialScrollTop: scrollContainer.scrollTop
        };
    };

    const handleGridMouseDown = (e: React.MouseEvent, day: Date) => {
        if (isDraggingRef.current) return;
        if (!onEventCreate) return;
        if (e.button !== 0) return;
        e.preventDefault();

        const gridEl = e.currentTarget as HTMLElement;
        const rect = gridEl.getBoundingClientRect();
        const clickY = gearedMouseRef.current.y - rect.top; // Use geared coords for clickY

        const snapInterval = isPreciseModeRef.current ? 1 : 10;
        const hour = Math.floor(clickY / 60);
        const minute = Math.floor((clickY % 60) / snapInterval) * snapInterval;

        const start = new Date(day);
        start.setHours(hour, minute, 0, 0);

        setCreationDrag({
            startDay: start,
            startY: gearedMouseRef.current.y, // Use geared coords for startY
            currentY: gearedMouseRef.current.y, // Use geared coords for currentY
            startX: gearedMouseRef.current.x, // Use geared coords for startX
            currentX: gearedMouseRef.current.x // Use geared coords for currentX
        });
        // Do NOT set isDraggingRef.current = true here. Wait for move.
    };

    const handleResizeMouseDown = (e: React.MouseEvent, id: string, eStart: string, eEnd: string) => {
        e.stopPropagation();
        e.preventDefault(); // Prevent text selection

        const scrollContainer = scrollContainerRef.current;
        if (!scrollContainer) return;

        const start = new Date(eStart);
        const end = new Date(eEnd);
        const startMinutes = start.getHours() * 60 + start.getMinutes();

        setResizingId(id);
        setResizeDragState({
            startY: gearedMouseRef.current.y,
            originalTop: startMinutes,
            originalHeight: (end.getTime() - start.getTime()) / 60000,
            currentHeight: (end.getTime() - start.getTime()) / 60000,
            initialScrollTop: scrollContainer.scrollTop
        });
        // Do NOT set isDraggingRef.current = true here. Wait for move.
    };

    useEffect(() => {

        // Scroll persistence handled in separate effect
    }, [loadedWeeks]);

    // Calculate Global Time Top
    const globalTimeTop = getHours(currentTime) * 60 + getMinutes(currentTime);

    const eventsByDay = useMemo(() => {
        const timedMap = new Map<string, CalendarEvent[]>();
        const allDayMap = new Map<string, CalendarEvent[]>();

        // Find min/max dates across all loaded weeks to bound recurrence generation
        if (loadedWeeks.length === 0) return { timedMap, allDayMap };
        const minDate = startOfDay(loadedWeeks[0]);
        const maxDate = startOfDay(addDays(loadedWeeks[loadedWeeks.length - 1], 7));

        const processEvent = (e: CalendarEvent, occurrenceStart: Date) => {
            const duration = new Date(e.end).getTime() - new Date(e.start).getTime();
            const occurrenceEnd = new Date(occurrenceStart.getTime() + duration);

            if (e.allDay) {
                let current = startOfDay(occurrenceStart);
                const endNode = startOfDay(occurrenceEnd);
                while (current <= endNode) {
                    const key = format(current, "yyyy-MM-dd");
                    if (!allDayMap.has(key)) allDayMap.set(key, []);
                    allDayMap.get(key)!.push({ ...e, start: occurrenceStart.toISOString(), end: occurrenceEnd.toISOString() });
                    current = addDays(current, 1);
                }
            } else {
                let current = startOfDay(occurrenceStart);
                const endNode = startOfDay(occurrenceEnd);
                let safety = 0;
                while (current <= endNode && safety < 100) {
                    const key = format(current, "yyyy-MM-dd");
                    if (!timedMap.has(key)) timedMap.set(key, []);
                    timedMap.get(key)!.push({ ...e, start: occurrenceStart.toISOString(), end: occurrenceEnd.toISOString() });
                    current = addDays(current, 1);
                    safety++;
                }
            }
        };

        events.forEach(e => {
            const start = new Date(e.start);
            const rec = e.recurrence || 'none';

            if (rec === 'none') {
                processEvent(e, start);
            } else {
                // Generate occurrences within the visible range
                let current = new Date(start);

                // Safety: don't generate too far back or forward if the event is very old/future
                // We start from the event's actual start and skip to the visible range
                while (current < minDate) {
                    if (rec === 'daily') current = addDays(current, 1);
                    else if (rec === 'weekly') current = addDays(current, 7);
                    else if (rec === 'monthly') {
                        current.setMonth(current.getMonth() + 1);
                    }
                    else if (rec === 'yearly') {
                        current.setFullYear(current.getFullYear() + 1);
                    }
                    else break;
                }

                // Generate occurrences while they are within maxDate
                let count = 0;
                while (current < maxDate && count < 1000) {
                    processEvent(e, new Date(current));
                    if (rec === 'daily') current = addDays(current, 1);
                    else if (rec === 'weekly') current = addDays(current, 7);
                    else if (rec === 'monthly') {
                        current = new Date(current);
                        current.setMonth(current.getMonth() + 1);
                    }
                    else if (rec === 'yearly') {
                        current = new Date(current);
                        current.setFullYear(current.getFullYear() + 1);
                    }
                    else break;
                    count++;
                }
            }
        });
        return { timedMap, allDayMap };
    }, [events, loadedWeeks]);

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
                style={{
                    maskImage: 'linear-gradient(to right, transparent, black 3%, black 97%, transparent), linear-gradient(to bottom, transparent, black 3%, black 97%, transparent)',
                    maskComposite: 'intersect',
                    WebkitMaskImage: 'linear-gradient(to right, transparent, black 3%, black 97%, transparent), linear-gradient(to bottom, transparent, black 3%, black 97%, transparent)',
                    WebkitMaskComposite: 'source-in'
                }}
            >
                {/* Toolbar */}
                < div className="flex items-center justify-between px-4 py-3 bg-transparent z-20" >
                    <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 capitalize">
                        {format(date, "MMMM yyyy")}
                    </h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                onDateChange(new Date());
                            }}
                            className="px-4 py-2 bg-white dark:bg-black border border-gray-200 dark:border-slate-800 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-900 transition-colors shadow-sm"
                        >
                            Today
                        </button>
                        <button
                            onClick={() => setIsScheduleModalOpen(true)}
                            className="hidden md:flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                            title="Bulk Schedule Events"
                        >
                            <ListPlus size={16} />
                            <span>Schedule</span>
                        </button>
                    </div>
                </div >

                {/* Main Scroll Area */}
                < div
                    ref={scrollContainerRef}
                    className="flex-1 relative flex trackpad-scroll-free"
                    style={{ touchAction: 'none', overscrollBehavior: 'none' }}
                >
                    {/* Time Column (Sticky Left) */}
                    < div className="w-[60px] flex-shrink-0 sticky left-0 z-[150] bg-white border-r border-gray-100 dark:border-slate-800/50 h-fit min-h-full" >
                        {/* Corner */}
                        < div className="h-[50px] border-b border-gray-100 dark:border-slate-800/50 sticky top-0 z-[160] bg-white" ></div >
                        {
                            Array.from({ length: 24 }).map((_, i) => (
                                <div key={i} className="h-[60px] relative group border-b border-dashed border-gray-100 dark:border-slate-800/50">
                                    <span className="absolute -top-3 right-3 text-[11px] font-semibold text-gray-400 z-[10]">{i}:00</span>
                                </div>
                            ))
                        }
                    </div >

                    {/* Days Wrapper with Relative positioning for the Time Line */}
                    <div className="flex relative items-start" ref={gridDaysRef}>

                        {/* Global Current Time Line - Now Inside the relative flex container */}
                        < div
                            className="absolute z-[155] pointer-events-none"
                            style={{ top: `${globalTimeTop + 50}px`, left: '-60px', width: 'calc(100% + 60px)' }}
                        >
                            <div className="h-[2px] bg-black w-full relative">
                                <div className="w-10 h-5 rounded-full bg-black text-white text-[10px] font-bold flex items-center justify-center absolute left-0 -top-2.5 shadow-sm">
                                    {format(currentTime, "HH:mm")}
                                </div>
                            </div>
                        </div>

                        {
                            loadedWeeks.map(weekStart => {
                                return Array.from({ length: 7 }).map((_, i) => {
                                    const day = addDays(weekStart, i);
                                    const dayKey = format(day, "yyyy-MM-dd");
                                    const dayEvents = eventsByDay.timedMap.get(dayKey) || [];
                                    const allDayEventsGroup = eventsByDay.allDayMap.get(dayKey) || [];

                                    return (
                                        <DayColumn
                                            key={day.toISOString()}
                                            day={day}
                                            events={[...dayEvents, ...allDayEventsGroup]}
                                            allEvents={events}
                                            isToday={isSameDay(day, new Date())}
                                            dayIndexOffset={Math.floor((day.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))}
                                            currentTime={currentTime}
                                            hoveredHour={hoveredHour}
                                            onHourHover={setHoveredHour}
                                            onEventClick={(id, rect) => {
                                                if (!isDraggingRef.current) {
                                                    const e = events.find(ev => ev.id === id);

                                                    // Intercept for magic link
                                                    if (highlight.isSelectingLink && highlight.onLinkSelect && e) {
                                                        highlight.onLinkSelect({
                                                            id: e.id,
                                                            title: e.title,
                                                            type: 'event',
                                                            rect: rect
                                                        });
                                                        return;
                                                    }

                                                    if (e?.allDay) {
                                                        // Handle all-day click: could be popover, could be external
                                                        if (rect) {
                                                            setActivePopover({ id, rect });
                                                        } else if (onEventClick) {
                                                            onEventClick(id); // fallback
                                                        }
                                                    } else {
                                                        if (rect) {
                                                            setActivePopover({ id, rect });
                                                        } else if (onEventClick) {
                                                            onEventClick(id); // fallback
                                                        }
                                                    }
                                                }
                                            }}
                                            onEventShare={onEventShare}
                                            onEventDelete={onEventDelete ? (id) => onEventDelete(id) : undefined}
                                            onGridMouseDown={handleGridMouseDown}
                                            onEventMouseDown={handleEventMouseDown}
                                            onResizeMouseDown={handleResizeMouseDown}
                                            // DnD States
                                            draggingId={draggingId}
                                            dragState={dragState}
                                            creationDrag={creationDrag}
                                            resizingId={resizingId}
                                            resizeDragState={resizeDragState}
                                            // Performance MotionValues
                                            resizeHeightMV={resizeHeightMV}
                                            creationEndYMV={creationEndYMV}
                                            onHeaderClick={(clickedDay) => {
                                                // Create all-day event
                                                const start = new Date(clickedDay);
                                                start.setHours(0, 0, 0, 0);
                                                const end = new Date(clickedDay);
                                                end.setHours(23, 59, 59, 999);

                                                // Ignore typings for now as the component signature may lack allDay boolean natively
                                                // @ts-ignore
                                                onEventCreate && onEventCreate(start, end, true);
                                            }}
                                            onTaskToggle={(id, currentIsCompleted) => {
                                                if (onEventSave) onEventSave(id, { is_completed: !currentIsCompleted });
                                            }}
                                            onEventRename={onEventRename}
                                            snapInterval={isPreciseModeRef.current ? 1 : 10}
                                            isMagnified={isPreciseMode}
                                            onEventDrop={async (eventId, start, end) => {
                                                if (onEventUpdate) {
                                                    await onEventUpdate(eventId, start, end);
                                                }
                                            }}
                                            cursorX={cursorX}
                                            cursorY={cursorY}
                                        />
                                    );
                                });
                            })
                        }

                        {/* Native D&D ghost is now used instead of DragGhost */}
                    </div >
                </div >

                {/* Global Floating Event Popover */}
                {
                    activePopover && (() => {
                        const event = events.find(e => e.id === activePopover.id);
                        if (!event) return null;
                        return <EventPopover event={event} rect={activePopover.rect} themes={themes} onEventSave={onEventSave} onClose={() => setActivePopover(null)} enabledExtensions={enabledExtensions} />;
                    })()
                }

                {/* Visual Projection Layer (Precise Mode) */}
                {isPreciseMode && (draggingId || creationDrag || resizingId) && (() => {
                    let eventObj: CalendarEvent | null = null;
                    let targetStartMins = 0;
                    let targetDuration = 0;
                    let activeMins = 0;
                    let actionType: 'move' | 'resize' | 'create' | null = null;

                    if (draggingId && dragState) {
                        eventObj = events.find(e => e.id === draggingId) || null;
                        if (eventObj) {
                            const snapInterval = 1;
                            targetStartMins = Math.round(dragState.currentTop / snapInterval) * snapInterval;
                            const oldStart = new Date(eventObj.start);
                            const oldEnd = new Date(eventObj.end);
                            targetDuration = Math.max(10, (oldEnd.getTime() - oldStart.getTime()) / 60000);
                            activeMins = targetStartMins; // Focus Top Edge
                            actionType = 'move';
                            activeEventEdgeRef.current = activeMins; // anchor Loupe at event top
                        }
                    } else if (creationDrag) {
                        eventObj = {
                            id: 'new-event-creation',
                            title: 'New Event',
                            start: new Date().toISOString(),
                            end: new Date().toISOString(),
                            effect: 'sky' // Default creation color
                        };
                        const snapInterval = 1;
                        const startMins = creationDrag.startDay.getHours() * 60 + creationDrag.startDay.getMinutes();
                        const deltaY = creationDrag.currentY - creationDrag.startY;
                        let snappoints = Math.floor(deltaY / snapInterval) * snapInterval;
                        if (deltaY < 0) snappoints = Math.ceil(deltaY / snapInterval) * snapInterval;

                        targetStartMins = deltaY < 0 ? startMins + snappoints : startMins;
                        targetDuration = Math.max(10, Math.abs(snappoints));
                        activeMins = deltaY < 0 ? targetStartMins : targetStartMins + targetDuration; // Focus Dragged Edge
                        actionType = 'create';
                        activeEventEdgeRef.current = activeMins;
                    } else if (resizingId && resizeDragState) {
                        eventObj = events.find(e => e.id === resizingId) || null;
                        if (eventObj) {
                            const snapInterval = 1;
                            targetStartMins = resizeDragState.originalTop;
                            targetDuration = Math.max(10, Math.round(resizeDragState.currentHeight / snapInterval) * snapInterval);
                            activeMins = targetStartMins + targetDuration; // Focus Bottom Edge
                            actionType = 'resize';
                            activeEventEdgeRef.current = activeMins; // anchor Loupe at event bottom
                        }
                    }

                    if (!eventObj) return null;

                    const theme = getEventTheme(eventObj);

                    return (
                        <MagnifiedEventView
                            isActive={isPreciseMode}
                            event={eventObj}
                            cursorX={cursorX}
                            cursorY={cursorY}
                            startMinutes={targetStartMins}
                            durationMinutes={targetDuration}
                            activeMinute={activeMins}
                            actionType={actionType}
                            theme={theme}
                            dropBounds={dropBounds}
                        />
                    );
                })()}

            </div >
            <ScheduleModal
                isOpen={isScheduleModalOpen}
                onClose={() => setIsScheduleModalOpen(false)}
                existingThemes={themes.map(t => ({ id: t.id, title: t.title, effect: t.effect }))}
                onApply={async (newEvents, appliedTheme) => {
                    if (onEventSave) {
                        try {
                            const defaultDateStr = format(date, "yyyy-MM-dd");
                            const promises = newEvents.map(ev => {
                                const newId = `temp-${Date.now()}-${Math.random()}`;
                                const targetDateStr = ev.dateOverride || defaultDateStr;

                                let start, end;

                                if (ev.allDay) {
                                    start = new Date(`${targetDateStr}T00:00:00`).toISOString();
                                    end = new Date(`${targetDateStr}T23:59:59`).toISOString();
                                } else {
                                    start = new Date(`${targetDateStr}T${ev.startTime}:00`).toISOString();
                                    end = new Date(`${targetDateStr}T${ev.endTime}:00`).toISOString();
                                }

                                const mappedEvent = {
                                    id: newId,
                                    title: ev.title || 'New Event',
                                    description: ev.description || '',
                                    start,
                                    end,
                                    allDay: ev.allDay,
                                    recurrence: ev.recurrence,
                                    parent_id: appliedTheme
                                };
                                return onEventSave(newId, mappedEvent);
                            });
                            await Promise.all(promises);
                        } catch (e) {
                            console.error("Error bulk saving schedule", e);
                        }
                    }
                }}
            />
        </React.Fragment>
    );
}
