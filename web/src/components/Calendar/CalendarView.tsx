import React, { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from "react";
import DayColumn from "@/components/Calendar/DayColumn";
import "@/app/calendar/calendar.css";
import { format, addDays, subDays, startOfWeek, addWeeks, subWeeks, isSameDay, getMinutes, getHours, startOfDay } from "date-fns";
import { ChevronLeft, ChevronRight, ListPlus } from "lucide-react";
import { loadSearchIndex, SearchIndexEntry } from "@/lib/searchIndex";
import Fuse from "fuse.js";
import { Search } from "lucide-react";
import { useHighlight } from "@/components/HighlightContext";
import { ScheduleModal, ScheduleEventData } from './ScheduleModal';
import { useMotionValue, motion, useTransform } from 'framer-motion';
import { DragGhost } from './DragGhost';
import { MagnifiedEventView } from './MagnifiedEventView';
import { getEventsForDate } from "@/lib/calendarUtils";

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
    recurrence_rule?: string;
    exdates?: string[];
    completed_dates?: string[];
    is_task?: boolean;
    is_completed?: boolean;
    is_cancelled?: boolean;
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
    themes?: { id: string; title: string; effect?: string; color?: string }[];
    onScheduleApply?: (events: ScheduleEventData[], theme: string, options?: { color?: string, effect?: string }) => Promise<void>;
    onCreateEventGroup?: (title: string, color?: string, effect?: string) => Promise<string | undefined>;
    enabledExtensions?: string[];
}

const getEventTheme = (evt: CalendarEvent) => {
    // Basic effect map for legacy or fallback
    const effectMap: Record<string, { bg: string; text: string; border: string }> = {
        'sky': { bg: 'var(--event-sky-bg)', text: 'var(--event-sky-text)', border: 'var(--event-sky-border)' },
        'green': { bg: 'var(--event-green-bg)', text: 'var(--event-green-text)', border: 'var(--event-green-border)' },
        'orange': { bg: 'var(--event-orange-bg)', text: 'var(--event-orange-text)', border: 'var(--event-orange-border)' },
        'none': { bg: 'var(--event-default-bg)', text: 'var(--event-default-text)', border: 'var(--event-default-border)' }
    };

    // If we have an individual color, use it as bg
    if (evt.color) {
        return { bg: evt.color, text: '#ffffff', border: evt.color };
    }

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
    onScheduleApply,
    onCreateEventGroup,
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

    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<SearchIndexEntry[]>([]);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchIndexData, setSearchIndexData] = useState<SearchIndexEntry[] | null>(null);

    // Initial search index load wrapper
    const handleSearchClick = async () => {
        setIsSearchOpen(true);
        if (!searchIndexData) {
            try {
                // In a real app we need masterKey and userID from a store/context
                const store = require('@/store/useDataStore').useDataStore;
                const { privateKey, myId } = store.getState();
                if (privateKey && myId) {
                    const data = await loadSearchIndex(privateKey, myId);
                    setSearchIndexData(data);
                }
            } catch (e) {
                console.error(e);
            }
        }
    };

    useEffect(() => {
        if (!searchIndexData || !searchQuery) {
            setSearchResults([]);
            return;
        }
        const fuse = new Fuse(searchIndexData, {
            keys: ['title', 'description'],
            threshold: 0.3
        });
        const results = fuse.search(searchQuery).map(r => r.item);
        setSearchResults(results);
    }, [searchQuery, searchIndexData]);


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
    // Ref for the real-time snapped top of a being-dragged event (updated without React re-render)
    const dragCurrentTopRef = useRef<number>(0);
    // Ref to the days-grid wrapper so we can getBoundingClientRect for screen-space calc.
    const gridDaysRef = useRef<HTMLDivElement>(null);

    const [dropBounds, setDropBounds] = useState<DOMRect | null>(null);

    useEffect(() => {
        const handleScrollTo = (e: any) => {
            const { id, start } = e.detail;
            if (start) {
                const targetDate = new Date(start);
                onDateChange(targetDate);

                // After date change, scroll to event
                setTimeout(() => {
                    const el = document.getElementById(`event-${id}`);
                    const container = scrollContainerRef.current;
                    if (el && container) {
                        const eventTop = el.offsetTop;
                        container.scrollTop = Math.max(0, eventTop - 150);

                        // Also horizontal scroll
                        const dayCol = el.closest('[data-day-col]') as HTMLElement;
                        if (dayCol) {
                            const colLeft = dayCol.offsetLeft;
                            const colWidth = dayCol.offsetWidth;
                            const containerWidth = container.clientWidth;
                            const targetScrollX = colLeft - (containerWidth / 2) + (colWidth / 2) - 30;
                            container.scrollLeft = Math.max(0, targetScrollX);
                        }
                    }
                }, 400); // Increased delay for network/decryption
            }
        };
        window.addEventListener('calendar:scroll-to', handleScrollTo);
        return () => window.removeEventListener('calendar:scroll-to', handleScrollTo);
    }, [onDateChange]);

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
        const timer = setInterval(() => setCurrentTime(new Date()), 15000); // 15 seconds to keep the pulse fresh
        return () => clearInterval(timer);
    }, []);// --- Event Popover Component (Moved outside to prevent re-mounting on parent render) ---
    const EventPopover = ({ event, rect, themes, onEventSave, onEventDelete, onClose, enabledExtensions }: {
        event: CalendarEvent, rect: DOMRect, themes: any[], onEventSave: any, onEventDelete?: (id: string) => void, onClose: () => void, enabledExtensions: string[]
    }) => {
        // 1. ISOLATED LOCAL STATE
        // We only initialize once from props when the component mounts or the event ID changes.
        // This prevents "jumping back" during typing if the global store updates.
        const [title, setTitle] = useState(event.title);
        const [description, setDescription] = useState(event.description || '');
        const [isTask, setIsTask] = useState(!!event.is_task);
        const [isCompleted, setIsCompleted] = useState(!!event.is_completed);
        const [color, setColor] = useState(event.color || '#6366f1');
        const [showColorPicker, setShowColorPicker] = useState(false);

        // Initial recurrence values
        const getRRuleParts = (evt: any) => {
            const rule = evt.recurrence_rule || '';
            const match = String(rule || `FREQ=${(evt.recurrence && evt.recurrence !== 'none') ? evt.recurrence.toUpperCase() : 'NONE'};INTERVAL=1`).match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY|NONE)(?:;INTERVAL=(\d+))?/i);
            return {
                freq: match ? match[1].toLowerCase() : 'none',
                interval: match && match[2] ? parseInt(match[2], 10) : 1
            };
        };

        const initialRRule = getRRuleParts(event);
        const [freq, setFreq] = useState(initialRRule.freq);
        const [interval, setIntervalVal] = useState(initialRRule.interval);

        const occurrenceDateKey = format(new Date(event.start), "yyyy-MM-dd");
        const isThisOccCancelledOrig = event.exdates?.includes(occurrenceDateKey) || !!event.is_cancelled;
        const [isCancelled, setIsCancelled] = useState(isThisOccCancelledOrig);

        // Track original occurrence cancel state for comparison
        const isThisOccCancelledRef = useRef(isThisOccCancelledOrig);
        useEffect(() => {
            isThisOccCancelledRef.current = isThisOccCancelledOrig;
        }, [isThisOccCancelledOrig]);

        // 2. RESET ON ID CHANGE (Isolation)
        useEffect(() => {
            setTitle(event.title);
            setDescription(event.description || '');
            setIsTask(!!event.is_task);
            setIsCompleted(!!event.is_completed);
            setColor(event.color || '#6366f1');
            setIsCancelled(isThisOccCancelledOrig);
            const parts = getRRuleParts(event);
            setFreq(parts.freq);
            setIntervalVal(parts.interval);
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [event.id]);

        // 3. DEBOUNCED AUTO-SAVE
        const handleSave = useCallback((overrideUpdates?: any) => {
            const updates: any = { ...overrideUpdates };

            // Collect all current state values
            if (title !== event.title && updates.title === undefined) updates.title = title;
            if (description !== (event.description || '') && updates.description === undefined) updates.description = description;
            if (isTask !== !!event.is_task && updates.is_task === undefined) updates.is_task = isTask;
            if (isCompleted !== !!event.is_completed && updates.is_completed === undefined) updates.is_completed = isCompleted;
            if (isCancelled !== isThisOccCancelledRef.current && updates.is_cancelled === undefined) updates.is_cancelled = isCancelled;
            if (color !== event.color && updates.color === undefined) updates.color = color;

            const newRecurrenceRule = freq === 'none' ? 'NONE' : `FREQ=${freq.toUpperCase()};INTERVAL=${interval}`;
            const currentRecurrenceRule = (event as any).recurrence_rule || `FREQ=${(event.recurrence && event.recurrence !== 'none') ? event.recurrence.toUpperCase() : 'NONE'};INTERVAL=1`;
            if (newRecurrenceRule !== currentRecurrenceRule && updates.recurrence_rule === undefined) updates.recurrence_rule = newRecurrenceRule;

            if (Object.keys(updates).length > 0) {
                onEventSave(event.id, updates);
            }
        }, [event, title, description, isTask, isCompleted, isCancelled, color, freq, interval, onEventSave]);

        useEffect(() => {
            const timer = setTimeout(() => {
                handleSave();
            }, 800); // 800ms debounce for auto-save
            return () => clearTimeout(timer);
        }, [title, description, isTask, isCompleted, isCancelled, color, freq, interval, handleSave]);

        // Cleanup save on unmount/close
        useEffect(() => {
            return () => {
                handleSave();
            };
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);

        const handleTitleBlur = () => { handleSave(); };
        const handleDescBlur = () => { handleSave(); };

        const handleTaskToggle = (newIsTask: boolean) => {
            setIsTask(newIsTask);
            if (!newIsTask) setIsCompleted(false);
        };

        const updateRecurrence = (newFreq: string, newInterval: number) => {
            setFreq(newFreq);
            setIntervalVal(newInterval);
        };

        const handleCompleteToggle = (newIsCompleted: boolean) => {
            setIsCompleted(newIsCompleted);
        };

        const handleCancelToggle = (newIsCancelled: boolean) => {
            setIsCancelled(newIsCancelled);
        };

        const handleClose = () => {
            handleSave();
            onClose();
        };

        // Smart Positioning
        const width = 340;
        const height = isTask ? 440 : 400;
        let left = rect.right + 12;
        let top = rect.top;

        if (left + width > window.innerWidth) {
            left = rect.left - width - 12;
        }
        if (left < 10) left = 10;

        if (top + height > window.innerHeight) {
            top = window.innerHeight - height - 12;
        }
        if (top < 60) top = 60;

        return (
            <div
                id="active-event-popover"
                className="fixed z-[100] w-[340px] bg-white dark:bg-[#1C1C1C] rounded-3xl shadow-float border border-gray-100 dark:border-white/10 p-5 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200"
                style={{ top: `${top}px`, left: `${left}px` }}
            >
                {/* Header Row */}
                <div className="flex items-center gap-3">
                    <div
                        className="w-4 h-4 rounded-full shrink-0 cursor-pointer hover:scale-110 transition-transform shadow-sm"
                        style={{ backgroundColor: color }}
                        onClick={() => setShowColorPicker(!showColorPicker)}
                        title="Pick Individual Color"
                    />
                    <input
                        autoFocus
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onBlur={handleTitleBlur}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                e.currentTarget.blur();
                            }
                        }}
                        className="flex-1 text-base font-bold text-gray-900 dark:text-gray-100 bg-transparent border-none focus:ring-0 p-0 outline-none placeholder:text-gray-400"
                        placeholder="What's happening?"
                    />
                    <button onClick={handleClose} className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-all">
                        <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                {showColorPicker && (
                    <div className="bg-gray-50 dark:bg-black/20 p-3 rounded-2xl flex flex-wrap gap-2.5 animate-in slide-in-from-top-2 duration-200">
                        {[
                            '#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#64748b'
                        ].map(c => (
                            <button
                                key={c}
                                onClick={() => setColor(c)}
                                className={`w-6 h-6 rounded-full transition-all ${color === c ? 'ring-2 ring-violet-500 ring-offset-2 dark:ring-offset-[#1C1C1C] scale-110 shadow-sm' : 'hover:scale-110 shadow-xs'}`}
                                style={{ backgroundColor: c }}
                            />
                        ))}
                    </div>
                )}

                {/* Time & Date Info */}
                <div className="flex flex-col gap-0.5 bg-gray-50/50 dark:bg-white/5 rounded-xl p-3 border border-gray-100/50 dark:border-white/5 shadow-sm">
                    <div className="font-semibold text-sm flex items-center justify-between text-gray-800 dark:text-gray-200">
                        <span>{format(new Date(event.start), "MMM d, yyyy")}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-gray-200 dark:bg-white/10 px-2 py-0.5 rounded-full">
                            {event.allDay ? 'All Day' : (() => {
                                const m = Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000);
                                return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 > 0 ? m % 60 + 'm' : ''}` : `${m}m`;
                            })()}
                        </span>
                    </div>
                    {!event.allDay && (
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                            <span>{format(new Date(event.start), "h:mm a")}</span>
                            <span className="text-gray-300 dark:text-gray-600 px-0.5">→</span>
                            <span>{format(new Date(event.end), "h:mm a")}</span>
                        </div>
                    )}
                </div>

                {/* Settings Grid */}
                <div className="grid grid-cols-2 gap-3 pb-1">
                    {/* Theme/Effect */}
                    <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Theme</span>
                        <div className="relative group">
                            <select
                                value={event.parent_id || 'general-theme'}
                                onChange={(e) => {
                                    const val = e.target.value === 'general-theme' ? null : e.target.value;
                                    if (onEventSave) onEventSave(event.id, { parent_id: val });
                                }}
                                className="w-full bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 dark:text-gray-300 outline-none cursor-pointer appearance-none transition-all hover:bg-gray-100 dark:hover:bg-white/10"
                            >
                                <option value="general-theme">No Theme</option>
                                {themes.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 group-hover:text-gray-600 transition-colors">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                            </div>
                        </div>
                    </div>

                    {/* Recurrence */}
                    <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Repeat</span>
                        <div className="flex items-center bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 rounded-xl pr-2 transition-all hover:bg-gray-100 dark:hover:bg-white/10">
                            <select
                                value={freq}
                                onChange={(e) => updateRecurrence(e.target.value, interval)}
                                className="flex-1 bg-transparent border-none text-xs font-bold text-gray-700 dark:text-gray-300 outline-none cursor-pointer appearance-none px-3 py-2"
                            >
                                <option value="none">None</option>
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                                <option value="yearly">Yearly</option>
                            </select>
                            {freq !== 'none' && (
                                <input
                                    type="number"
                                    min="1"
                                    max="99"
                                    value={interval}
                                    onChange={(e) => {
                                        let val = parseInt(e.target.value, 10);
                                        if (isNaN(val) || val < 1) val = 1;
                                        updateRecurrence(freq, val);
                                    }}
                                    className="w-5 text-center bg-transparent border-none p-0 text-[10px] font-bold text-violet-500 font-mono outline-none"
                                />
                            )}
                        </div>
                    </div>
                </div>

                {/* Description */}
                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={handleDescBlur}
                    placeholder="Add notes..."
                    rows={2}
                    className="w-full bg-transparent border border-gray-100 dark:border-white/5 rounded-2xl p-3 text-xs leading-relaxed text-gray-600 dark:text-gray-400 focus:ring-1 focus:ring-violet-500/20 outline-none resize-none transition-all placeholder:text-gray-300 dark:placeholder:text-gray-700"
                />

                {/* Controls */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-50 dark:border-white/5">
                    <div className="flex items-center gap-1">
                        {/* Add any left-aligned controls here, e.g., Share button */}
                    </div>
                    <div>
                        <button
                            onClick={() => onEventDelete && onEventDelete(event.id)}
                            className="p-2 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-all"
                            title="Delete Event"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Old Controls section to be removed/refactored */}
                <div className="hidden flex-col gap-1 pt-1 border-t border-gray-50 dark:border-white/5">
                    {/* Task Toggle */}
                    {/* Task Toggle Row */}
                    <div
                        onClick={() => handleTaskToggle(!isTask)}
                        className="flex items-center justify-between py-1.5 px-0.5 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group/row"
                    >
                        <div className="flex items-center gap-2.5">
                            <div className={`p-1.5 rounded-lg transition-colors ${isTask ? 'bg-violet-100 text-violet-600 dark:bg-violet-500/10' : 'bg-gray-100 text-gray-400 dark:bg-white/5 group-hover/row:bg-gray-200'}`}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                            </div>
                            <span className="text-[13px] font-bold text-gray-700 dark:text-gray-300 tracking-tight">Convert to Task</span>
                        </div>
                        <div
                            className={`relative w-10 h-6 rounded-full transition-all duration-300 ${isTask ? 'bg-violet-500 shadow-sm shadow-violet-500/20' : 'bg-gray-200 dark:bg-white/10'}`}
                        >
                            <div className={`absolute top-1 left-1.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-300 ${isTask ? 'translate-x-3' : 'translate-x-0'}`} />
                        </div>
                    </div>

                    {isTask && (
                        <div
                            onClick={() => handleCompleteToggle(!isCompleted)}
                            className="flex items-center justify-between py-1.5 px-0.5 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group/row animate-in slide-in-from-bottom-2 duration-200"
                        >
                            <div className="flex items-center gap-2.5">
                                <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isCompleted ? 'bg-green-500' : 'bg-violet-400'}`} />
                                <span className="text-[13px] font-bold text-gray-700 dark:text-gray-300 tracking-tight">Task Completed</span>
                            </div>
                            <div
                                className={`relative w-10 h-6 rounded-full transition-all duration-300 ${isCompleted ? 'bg-green-500 shadow-sm shadow-green-500/20' : 'bg-gray-200 dark:bg-white/10'}`}
                            >
                                <div className={`absolute top-1 left-1.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-300 ${isCompleted ? 'translate-x-3' : 'translate-x-0'}`} />
                            </div>
                        </div>
                    )}

                    {/* Cancel Toggle */}
                    {/* Cancel Toggle Row */}
                    <div
                        onClick={() => handleCancelToggle(!isCancelled)}
                        className="flex items-center justify-between py-1.5 px-0.5 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group/row"
                    >
                        <div className="flex items-center gap-2.5">
                            <div className={`p-1.5 rounded-lg transition-colors ${isCancelled ? 'bg-gray-200 text-gray-600 dark:bg-white/20' : 'bg-gray-100 text-gray-400 dark:bg-white/5 group-hover/row:bg-gray-200'}`}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                            </div>
                            <span className="text-[13px] font-bold text-gray-700 dark:text-gray-300 tracking-tight">Cancel Event</span>
                        </div>
                        <div
                            className={`relative w-10 h-6 rounded-full transition-all duration-300 ${isCancelled ? 'bg-gray-500 shadow-sm shadow-gray-500/20' : 'bg-gray-200 dark:bg-white/10'}`}
                        >
                            <div className={`absolute top-1 left-1.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-300 ${isCancelled ? 'translate-x-3' : 'translate-x-0'}`} />
                        </div>
                    </div>
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
        window.addEventListener('mousedown', globalClickHandler);

        return () => {
            container.removeEventListener('scroll', scrollHandler);
            window.removeEventListener('scroll', globalScrollHandler, true);
            window.removeEventListener('mousemove', globalMouseMoveHandler, true);
            window.removeEventListener('mousedown', globalClickHandler);
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
                    setDraggingId(pendingDragRef.current.id);
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

                    const draggingEvent = events.find(e => e.id === draggingId || draggingId?.startsWith(e.id + "_"));
                    const durationMins = draggingEvent ? (new Date(draggingEvent.end).getTime() - new Date(draggingEvent.start).getTime()) / 60000 : 15;

                    let newTop = dragState.originalTop + deltaY + scrollDelta;
                    if (newTop < 0) newTop = 0;
                    if (newTop > 1440 - durationMins) newTop = 1440 - durationMins;

                    // Snap to interval so MagnifiedEventView sees the correct snapped minute
                    const snapInterval = isPreciseModeRef.current ? 1 : 10;
                    const snappedTop = Math.round(newTop / snapInterval) * snapInterval;

                    // Keep Loupe anchored to event's top (start) edge
                    activeEventEdgeRef.current = snappedTop;

                    // Persist the snapped position to both a ref AND React state:
                    // - ref: instantly available for the current render pass
                    // - setDragState: mirrors setResizeDragState pattern so MagnifiedEventView
                    //   re-renders with the correct activeMinute for the Loupe ruler
                    dragCurrentTopRef.current = snappedTop;
                    setDragState(prev => prev ? { ...prev, currentTop: snappedTop } : prev);

                    // ✅ Drive overlay via MotionValue — bypasses React render
                    dragOverlayY.set(newTop);
                    dragOverlayX.set(dragState.initialX + deltaX);
                }
            } else if (creationDrag) {
                const startMinsCreation = creationDrag.startDay.getHours() * 60 + creationDrag.startDay.getMinutes();
                const rawDeltaY = gY - creationDrag.startY;

                // Clamp deltaY so the drag can never produce an event that crosses midnight.
                // Since 1px = 1 minute on the grid, the max forward drag is (1440 - startMins) pixels.
                const maxForwardPx = 1440 - startMinsCreation;
                const maxBackwardPx = -startMinsCreation;
                const clampedDeltaY = Math.max(maxBackwardPx, Math.min(rawDeltaY, maxForwardPx));
                const clampedY = creationDrag.startY + clampedDeltaY;

                if (!isDraggingRef.current && Math.abs(clampedDeltaY) > 10) {
                    isDraggingRef.current = true;
                }
                // Keep Loupe anchored to the dragged edge of the new event
                const creationEndMin = startMinsCreation + Math.max(10, Math.abs(clampedDeltaY));
                activeEventEdgeRef.current = clampedDeltaY < 0 ? startMinsCreation + clampedDeltaY : Math.min(1440, creationEndMin);

                // ✅ Drive creation preview via MotionValue (clamped at midnight)
                creationEndYMV.set(clampedY);
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

            const { x: gX, y: gY } = gearedMouseRef.current;

            const deltaY = gY - cDrag.startY;
            const deltaX = gX - cDrag.startX;

            if (Math.abs(deltaY) < 10 && Math.abs(deltaX) < 10) {
                return;
            }

            const snapInterval = isPreciseModeRef.current ? 1 : 10;
            const startMins = cDrag.startDay.getHours() * 60 + cDrag.startDay.getMinutes();
            const rawDeltaMins = Math.floor((gY - cDrag.startY) / snapInterval) * snapInterval;

            // Clamp delta strictly within the start day.
            // maxForwardMins: how many minutes from startMins until midnight.
            // maxBackwardMins: how many minutes back to start-of-day (negative).
            const maxForwardMins = 1440 - startMins;
            const maxBackwardMins = -startMins;
            const clampedDeltaMins = Math.max(maxBackwardMins, Math.min(rawDeltaMins, maxForwardMins));

            // Compute start/end purely as minute counts from the START DAY's midnight.
            // This completely avoids the setFullYear re-anchoring bug where
            // (23:00 + 60min = 00:00 next day) got re-dated to 00:00 today → full inversion.
            const dayBase = startOfDay(cDrag.startDay);
            const endMins = startMins + clampedDeltaMins;

            let finalStartMs: number;
            let finalEndMs: number;

            if (clampedDeltaMins >= 0) {
                // Forward drag: start=startMins, end=endMins
                finalStartMs = dayBase.getTime() + startMins * 60000;
                finalEndMs = dayBase.getTime() + endMins * 60000;
            } else {
                // Backward drag: start=endMins (earlier), end=startMins (later)
                finalStartMs = dayBase.getTime() + endMins * 60000;
                finalEndMs = dayBase.getTime() + startMins * 60000;
            }

            // Ensure minimum duration
            if (finalEndMs === finalStartMs) {
                finalEndMs = finalStartMs + snapInterval * 60000;
            }

            // Hard midnight clamp
            const midnightMs = dayBase.getTime() + 24 * 60 * 60 * 1000;
            if (finalEndMs > midnightMs) finalEndMs = midnightMs;
            if (finalStartMs < dayBase.getTime()) finalStartMs = dayBase.getTime();

            await onEventCreate(new Date(finalStartMs), new Date(finalEndMs));

        } else if (draggingId && dragState && onEventUpdate) {
            // ✅ THIS WAS MISSING — handle the mouse-drag move completion
            const dId = draggingId;
            const dState = dragState;
            setDraggingId(null);
            setDragState(null);
            isDraggingRef.current = false; // Reset drag threshold for next drag

            const event = events.find(e => e.id === dId || (dId && dId.startsWith(e.id + '_')));
            if (event) {
                const snapInterval = isPreciseModeRef.current ? 1 : 10;
                const scrollDelta = (scrollContainerRef.current?.scrollTop || 0) - dState.initialScrollTop;
                const { x: gX, y: gY } = gearedMouseRef.current;
                const deltaY = gY - dState.startY + scrollDelta;
                const deltaX = gX - dState.startX;

                const durationMins = (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000;
                const minDuration = Math.max(10, durationMins);

                let newStartMins = dState.originalTop + deltaY;
                newStartMins = Math.round(newStartMins / snapInterval) * snapInterval;
                // MIDNIGHT SWAP FIX: clamp so start can never exceed end boundary
                newStartMins = Math.max(0, Math.min(newStartMins, 1440 - minDuration));

                // Determine target day from mouse X
                let targetBaseDate: Date | null = null;
                const dayCols = document.querySelectorAll('[data-day-col]');
                dayCols.forEach((col) => {
                    const rect = col.getBoundingClientRect();
                    if (gX >= rect.left && gX <= rect.right) {
                        const dayStr = col.getAttribute('data-day-col');
                        if (dayStr) targetBaseDate = new Date(dayStr);
                    }
                });

                const originalStart = new Date(event.start);
                const base = targetBaseDate || startOfDay(originalStart);

                const newStart = new Date(base.getFullYear(), base.getMonth(), base.getDate(),
                    Math.floor(newStartMins / 60), newStartMins % 60, 0, 0);
                const newEnd = new Date(newStart.getTime() + durationMins * 60000);

                // Final midnight clamp
                const maxEnd = startOfDay(newEnd).getTime() + 24 * 60 * 60 * 1000;
                const safeEnd = newEnd.getTime() > maxEnd ? new Date(maxEnd) : newEnd;
                const safeStart = new Date(safeEnd.getTime() - durationMins * 60000);

                await onEventUpdate(dId, safeStart, safeEnd);
            }

        } else if (resizingId && resizeDragState && onEventUpdate) {
            const rId = resizingId;
            const rState = resizeDragState;

            const event = events.find(e => e.id === rId || (rId && rId.startsWith(e.id + '_')));
            if (event) {
                const scrollDelta = (scrollContainerRef.current?.scrollTop || 0) - rState.initialScrollTop;
                const snapInterval = isPreciseModeRef.current ? 1 : 10;
                const minDuration = 10;
                const newHeight = Math.max(minDuration, rState.currentHeight + scrollDelta);
                const snappedHeight = Math.max(minDuration, Math.round(newHeight / snapInterval) * snapInterval);

                const start = new Date(event.start);
                // MIDNIGHT SWAP FIX: ensure end can never exceed midnight
                const maxEndMs = startOfDay(start).getTime() + 24 * 60 * 60 * 1000;
                const rawEnd = new Date(start.getTime() + snappedHeight * 60000);
                const end = rawEnd.getTime() > maxEndMs ? new Date(maxEndMs) : rawEnd;

                await onEventUpdate(rId, start, end);
            }
            setResizingId(null);
            setResizeDragState(null);
            isDraggingRef.current = false; // Reset for next interaction
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

        if (loadedWeeks.length === 0) return { timedMap, allDayMap };
        const minDate = startOfDay(loadedWeeks[0]);
        const maxDate = startOfDay(addDays(loadedWeeks[loadedWeeks.length - 1], 7));

        const processEvent = (e: CalendarEvent, occurrenceStart: Date) => {
            if (isNaN(occurrenceStart.getTime())) {
                console.warn(`[CALENDAR-DRV] Invalid occurrenceStart for event ${e.id}`);
                return;
            }
            const startNode = new Date(e.start);
            const endNodeOrig = new Date(e.end);
            
            if (isNaN(startNode.getTime()) || isNaN(endNodeOrig.getTime())) {
                console.warn(`[CALENDAR-DRV] Skipping event ${e.id} due to invalid dates:`, { start: e.start, end: e.end });
                return;
            }

            const duration = endNodeOrig.getTime() - startNode.getTime();
            const occurrenceEnd = new Date(occurrenceStart.getTime() + duration);

            if (isNaN(occurrenceEnd.getTime())) {
                console.warn(`[CALENDAR-DRV] Invalid occurrenceEnd for event ${e.id}`);
                return;
            }

            const occDateKey = format(occurrenceStart, "yyyy-MM-dd");

            // [TASK 2] Cancel Check: Option B - Mark as cancelled
            // [TASK 2] Cancel Check
            const isCancelled = (Array.isArray(e.exdates) && e.exdates.includes(occDateKey)) || !!e.is_cancelled;

            // Inherit effect from theme if present
            let inheritedEffect = e.effect;
            if (e.parent_id) {
                const themeNode = themes.find(t => t.id === e.parent_id);
                if (themeNode && themeNode.effect) {
                    inheritedEffect = themeNode.effect;
                }
            }

            // [TASK 2] Completion Check: Override if in completed_dates
            const isCompleted = e.completed_dates?.includes(occDateKey) || !!e.is_completed;

            const processedEvent = {
                ...e,
                start: occurrenceStart.toISOString(),
                end: occurrenceEnd.toISOString(),
                effect: inheritedEffect,
                is_cancelled: isCancelled,
                is_completed: isCompleted
            };

            if (e.allDay) {
                let current = startOfDay(occurrenceStart);
                const endNode = startOfDay(occurrenceEnd);
                while (current <= endNode) {
                    const key = format(current, "yyyy-MM-dd");
                    if (!allDayMap.has(key)) allDayMap.set(key, []);
                    allDayMap.get(key)!.push(processedEvent);
                    current = addDays(current, 1);
                }
            } else {
                let current = startOfDay(occurrenceStart);
                // Use strictly < for endNode so events ending at exactly midnight (00:00 of next day)
                // are NOT added to the following day's column.
                const endsAtExactMidnight = occurrenceEnd.getHours() === 0 && occurrenceEnd.getMinutes() === 0 && occurrenceEnd.getSeconds() === 0 && occurrenceEnd.getMilliseconds() === 0;
                const endNode = endsAtExactMidnight
                    ? startOfDay(addDays(occurrenceEnd, -1)) // cap at the day before midnight
                    : startOfDay(occurrenceEnd);
                let safety = 0;
                while (current <= endNode && safety < 100) {
                    const key = format(current, "yyyy-MM-dd");
                    if (!timedMap.has(key)) timedMap.set(key, []);
                    timedMap.get(key)!.push(processedEvent);
                    current = addDays(current, 1);
                    safety++;
                }
            }
        };

        events.forEach(e => {
            const start = new Date(e.start);
            if (isNaN(start.getTime())) {
                console.warn(`[CALENDAR-DRV] Base start date invalid for event ${e.id}:`, e.start);
                return;
            }

            const rule = (e as any).recurrence_rule;
            const rrule = rule || `FREQ=${(e.recurrence && e.recurrence !== 'none') ? e.recurrence.toUpperCase() : 'NONE'};INTERVAL=1`;

            let freq = 'none';
            let interval = 1;
            const matchFreq = rrule.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY|NONE)/i);
            if (matchFreq) freq = matchFreq[1].toLowerCase();
            const matchInterval = rrule.match(/INTERVAL=(\d+)/i);
            if (matchInterval) interval = parseInt(matchInterval[1], 10);
            interval = Math.max(1, interval);

            if (freq === 'none') {
                processEvent(e, start);
            } else {
                let current = new Date(start);
                const recEndOrig = (e as any).recurrence_end ? new Date((e as any).recurrence_end) : new Date(maxDate.getTime() + 31536000000);
                if (isNaN(recEndOrig.getTime())) {
                     processEvent(e, start); // Fallback to single occurrence
                     return;
                }
                const safeRecEnd = recEndOrig < maxDate ? recEndOrig : maxDate;

                while (current < minDate && current < safeRecEnd) {
                    if (freq === 'daily') current.setDate(current.getDate() + interval);
                    else if (freq === 'weekly') current.setDate(current.getDate() + (interval * 7));
                    else if (freq === 'monthly') current.setMonth(current.getMonth() + interval);
                    else if (freq === 'yearly') current.setFullYear(current.getFullYear() + interval);
                    else break;
                }

                let count = 0;
                while (current < maxDate && current <= safeRecEnd && count < 1000) {
                    processEvent({
                        ...e,
                        id: current.getTime() === start.getTime() ? e.id : `${e.id}_${current.getTime()}`,
                        parent_event_id: current.getTime() === start.getTime() ? undefined : e.id
                    } as any, new Date(current));
                    if (freq === 'daily') current.setDate(current.getDate() + interval);
                    else if (freq === 'weekly') current.setDate(current.getDate() + (interval * 7));
                    else if (freq === 'monthly') current.setMonth(current.getMonth() + interval);
                    else if (freq === 'yearly') current.setFullYear(current.getFullYear() + interval);
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
                {/* Toolbar — position:relative + zIndex:500 creates a stacking context above
                    all sticky calendar elements (time col z-[160], day headers z-[150]). */}
                <div className="flex items-center justify-between px-4 py-3 bg-transparent" style={{ position: 'relative', zIndex: 500 }}>
                    <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 capitalize">
                        {format(date, "MMMM yyyy")}
                    </h2>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <div className="flex items-center bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 px-3 overflow-hidden">
                                <Search size={14} className="text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search..."
                                    onClick={handleSearchClick}
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="px-2 py-2 w-32 md:w-48 bg-transparent text-sm font-medium outline-none text-gray-700 dark:text-gray-200"
                                />
                            </div>
                            {isSearchOpen && searchResults.length > 0 && (
                                // [FIX-2] zIndex:9999 inline — floats above all sticky elements
                                // regardless of the surrounding stacking context.
                                <div className="absolute top-full mt-2 w-full bg-white dark:bg-black rounded-lg shadow-lg border border-gray-100 dark:border-white/10 p-2 max-h-60 overflow-auto" style={{ zIndex: 9999 }}>
                                    {searchResults.map(res => (
                                        <div
                                            key={res.id}
                                            className="p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-md cursor-pointer text-sm"
                                            onClick={() => {
                                                setIsSearchOpen(false);
                                                window.dispatchEvent(new CustomEvent('calendar:scroll-to', { detail: { id: res.id, start: res.date } }));
                                            }}
                                        >
                                            <div className="font-bold text-gray-800 dark:text-gray-200">{res.title}</div>
                                            <div className="text-[10px] text-gray-500">{new Date(res.date).toLocaleDateString()}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
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
                <div
                    ref={scrollContainerRef}
                    className="flex-1 relative flex trackpad-scroll-free"
                    style={{ touchAction: 'none', overscrollBehavior: 'none' }}
                >
                    {/* Time Column (Sticky Left) */}
                    <div className="w-[60px] flex-shrink-0 sticky left-0 z-[150] bg-white dark:bg-[#0F172A] border-r border-gray-100 dark:border-slate-800/50 h-fit min-h-full pb-[150px]">
                        {/* Corner */}
                        <div className="h-[50px] border-b border-gray-100 dark:border-slate-800/50 sticky top-0 z-[160] bg-white dark:bg-[#0F172A]"></div>
                        {
                            Array.from({ length: 24 }).map((_, i) => (
                                <div key={i} className="h-[60px] relative group border-b border-dashed border-gray-100 dark:border-slate-800/50">
                                    <span className="absolute -top-3 right-3 text-[11px] font-semibold text-gray-400 dark:text-gray-500 z-[10]">{i}:00</span>
                                </div>
                            ))
                        }
                    </div>

                    {/* Days Wrapper with Relative positioning for the Time Line */}
                    <div className="flex relative items-start pb-[150px]" ref={gridDaysRef}>

                        {/* Global Current Time Line - Now Inside the relative flex container */}
                        <div
                            className="absolute z-[155] pointer-events-none"
                            style={{ top: `${globalTimeTop + 50}px`, left: '-60px', width: 'calc(100% + 60px)' }}
                        >
                            <div className="h-[2px] bg-red-500/80 dark:bg-red-400/80 w-full relative">
                                <div className="w-10 h-5 rounded-full bg-red-500 dark:bg-red-400 text-white dark:text-slate-900 text-[10px] font-bold flex items-center justify-center absolute left-0 -top-2.5 shadow-sm">
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
                                            onEventClick={(clickedEvent, rect) => {
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
                                                            setActivePopover({ id, rect });
                                                        } else if (onEventClick) {
                                                            onEventClick(id);
                                                        }
                                                    } else {
                                                        if (rect) {
                                                            setActivePopover({ id, rect });
                                                        } else if (onEventClick) {
                                                            onEventClick(id);
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
                                            onEventDrop={async (eventId: string, start: Date, end: Date) => {
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

                        {/* Custom-drag ghost - 60fps via MotionValues, no React re-renders */}
                        {draggingId && dragState && (
                            <DragGhost
                                draggingId={draggingId}
                                dragState={dragState}
                                events={events}
                                cursorX={cursorX}
                                cursorY={cursorY}
                            />
                        )}
                    </div >
                </div >

                {/* Visual Projection Layer (Precise Mode) */}
                {isPreciseMode && (draggingId || creationDrag || resizingId) && (() => {
                    let eventObj: CalendarEvent | null = null;
                    let targetStartMins = 0;
                    let targetDuration = 0;
                    let activeMins = 0;
                    let actionType: 'move' | 'resize' | 'create' | null = null;

                    if (draggingId && dragState) {
                        eventObj = events.find(e => e.id === draggingId || (draggingId && draggingId.startsWith(e.id + "_"))) || null;
                        if (eventObj) {
                            // Use real-time snapped position from the ref (updated every mousemove without re-render)
                            targetStartMins = dragCurrentTopRef.current;
                            const oldEnd = new Date(eventObj.end);
                            const oldStart = new Date(eventObj.start);
                            targetDuration = Math.max(10, (oldEnd.getTime() - oldStart.getTime()) / 60000);
                            activeMins = targetStartMins; // Loupe focuses on TOP (start) edge when moving
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
                        eventObj = events.find(e => e.id === resizingId || (resizingId && resizingId.startsWith(e.id + "_"))) || null;
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

            {/* Global Floating Event Popover */}
            {
                activePopover && (() => {
                    const event = events.find(e => e.id === activePopover.id || activePopover.id.startsWith(e.id + '_'));
                    if (!event) return null;
                    return (
                        <EventPopover
                            event={event}
                            rect={activePopover.rect}
                            themes={themes}
                            onEventSave={onEventSave}
                            onEventDelete={onEventDelete}
                            onClose={() => setActivePopover(null)}
                            enabledExtensions={enabledExtensions}
                        />
                    );
                })()}

            {isScheduleModalOpen && (
                <ScheduleModal
                    isOpen={isScheduleModalOpen}
                    onClose={() => setIsScheduleModalOpen(false)}
                    onApply={onScheduleApply || (async () => { })}
                    existingThemes={themes}
                />
            )}

        </React.Fragment>
    );
}
