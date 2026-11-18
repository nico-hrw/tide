import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { addDays, format, getHours, getMinutes, isSameDay } from "date-fns";
import { useDataStore } from "@/store/useDataStore";
import { scrollLeftForColumn } from "@/lib/calendarWeeks";
import { eventTargetDate } from "./eventTargetDate";
import type { ActivePopover, CalendarEvent, CalendarViewMode } from "./types";

interface UseCalendarScrollParams {
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
    date: Date;
    onDateChange: (date: Date) => void;
    viewMode: CalendarViewMode;
    /** Week starts currently rendered (week view: the virtual window). */
    weeks: Date[];
    events: CalendarEvent[];
    editingEventId: string | null;
    /** Fixed one-week mode (a single rendered week). */
    fixedWeek?: boolean;
}

interface ScrollToDetail {
    id?: string;
    start?: string;
}

/**
 * Scroll glue around the calendar container: vertical scroll persistence,
 * popover state + dismissal on scroll/move/click, link navigation
 * (`calendar:scroll-to`, `editingEventId`), the day-view initial scroll, the
 * store's visible range and the directional "Today" button. Horizontal week
 * positioning lives in `useWeekWindow`.
 */
export function useCalendarScroll({
    scrollContainerRef,
    date,
    onDateChange,
    viewMode,
    weeks,
    events,
    editingEventId,
    fixedWeek = false,
}: UseCalendarScrollParams) {
    const [todayButtonDir, setTodayButtonDir] = useState<'hidden' | 'left' | 'right'>('hidden');
    const [todayAngle, setTodayAngle] = useState<number>(0);
    const [activePopover, setActivePopover] = useState<ActivePopover | null>(null);
    const lastPopoverOpenTimeRef = useRef(0);

    useEffect(() => {
        if (activePopover) {
            lastPopoverOpenTimeRef.current = Date.now();
        }
    }, [activePopover]);

    // Track today column visibility & direction angle to current time
    // Throttled via requestAnimationFrame to avoid forced layout reflows and state churn on every scroll tick
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        let rafId: number | null = null;

        const check = () => {
            rafId = null;
            const now = new Date();
            const todayIso = format(now, "yyyy-MM-dd");
            const todayCol = container.querySelector(`[data-day-col="${todayIso}"]`) as HTMLElement | null;
            if (!todayCol) {
                // Today is outside the rendered week window: point straight towards it.
                let farDir: 'hidden' | 'left' | 'right' = 'hidden';
                if (weeks.length > 0) {
                    if (now < weeks[0]) farDir = 'left';
                    else if (now >= addDays(weeks[weeks.length - 1], 7)) farDir = 'right';
                }
                setTodayButtonDir(prev => prev !== farDir ? farDir : prev);
                const farAngle = farDir === 'left' ? 180 : 0;
                setTodayAngle(prev => prev !== farAngle ? farAngle : prev);
                return;
            }
            const colRect = todayCol.getBoundingClientRect();
            const cRect = container.getBoundingClientRect();

            let newDir: 'hidden' | 'left' | 'right' = 'hidden';
            if (colRect.right < cRect.left + 80) newDir = 'left';
            else if (colRect.left > cRect.right - 80) newDir = 'right';

            setTodayButtonDir(prev => prev !== newDir ? newDir : prev);

            const nowMinutes = now.getHours() * 60 + now.getMinutes();
            const todayYInContainer = 50 + nowMinutes;

            const todayTargetX = colRect.left + (colRect.width / 2);
            const todayTargetY = cRect.top + (todayYInContainer - container.scrollTop);

            const buttonX = newDir === 'left' ? cRect.left + 90 : cRect.right - 40;
            const buttonY = cRect.top + (cRect.height / 2);

            const dx = todayTargetX - buttonX;
            const dy = todayTargetY - buttonY;
            const angle = Math.round(Math.atan2(dy, dx) * (180 / Math.PI));
            setTodayAngle(prev => prev !== angle ? angle : prev);
        };

        const onScrollCheck = () => {
            if (rafId === null) {
                rafId = requestAnimationFrame(check);
            }
        };

        container.addEventListener('scroll', onScrollCheck, { passive: true });
        const t = setTimeout(check, 300);
        return () => {
            container.removeEventListener('scroll', onScrollCheck);
            if (rafId !== null) cancelAnimationFrame(rafId);
            clearTimeout(t);
        };
    }, [weeks, viewMode, scrollContainerRef]);

    // Horizontal centering on today is done by useWeekWindow once `date` changes; the vertical
    // scroll starts afterwards so the horizontal re-positioning does not abort it.
    const handleScrollToToday = useCallback(() => {
        const now = new Date();
        onDateChange(now);
        setTimeout(() => {
            const container = scrollContainerRef.current;
            if (!container) return;
            const nowMinutes = now.getHours() * 60 + now.getMinutes();
            const targetScrollY = Math.max(0, nowMinutes - 120);
            container.scrollTo({ top: targetScrollY, behavior: 'smooth' });
        }, 150);
    }, [onDateChange, scrollContainerRef]);

    // Link navigation: set the date (the week window scrolls), then scroll vertically to the event.
    useEffect(() => {
        const handleScrollTo = (e: Event) => {
            const { id, start } = (e as CustomEvent<ScrollToDetail>).detail ?? {};
            if (!start) return;
            onDateChange(new Date(start));
            setTimeout(() => {
                const container = scrollContainerRef.current;
                if (!container) return;
                const el = id ? document.getElementById(`event-${id}`) : null;
                const targetTop = el ? Math.max(0, el.offsetTop - 150) : 400;
                container.scrollTo({ top: targetTop, behavior: 'smooth' });
            }, 150);
        };
        window.addEventListener('calendar:scroll-to', handleScrollTo);
        return () => window.removeEventListener('calendar:scroll-to', handleScrollTo);
    }, [onDateChange, scrollContainerRef]);

    // --- Magic Link Navigation Support ---
    // Fixed one-week mode only renders one week: an event outside it is navigated to first, and
    // the effect re-runs when the week changed so the element can be found and its popover opened.
    const fixedWeekKey = fixedWeek ? (weeks[0]?.getTime() ?? 0) : null;
    const linkNavRef = useRef<{ id: string | null; navigated: boolean; opened: boolean }>({ id: null, navigated: false, opened: false });
    const latestLink = useRef({ events, onDateChange });
    useEffect(() => { latestLink.current = { events, onDateChange }; });
    useLayoutEffect(() => {
        if (typeof window !== 'undefined' && window.innerWidth < 768) return;
        if (linkNavRef.current.id !== editingEventId) {
            linkNavRef.current = { id: editingEventId, navigated: false, opened: false };
        }
        if (editingEventId && scrollContainerRef.current) {
            const container = scrollContainerRef.current;
            // Wait for DOM to settle
            const timer = setTimeout(() => {
                const element = container.querySelector(`#event-${editingEventId}`) as HTMLElement;
                const link = linkNavRef.current;
                if (!element && fixedWeekKey !== null && !link.navigated) {
                    link.navigated = true;
                    const target = eventTargetDate(editingEventId, latestLink.current.events);
                    if (target) latestLink.current.onDateChange(target);
                }
                if (element && !(fixedWeekKey !== null && link.opened)) {
                    link.opened = true;
                    // Only move the view when the event is not on screen yet. Clicking a visible event
                    // must not re-centre the whole calendar; that is for links that point elsewhere.
                    const cr = container.getBoundingClientRect();
                    const er = element.getBoundingClientRect();
                    const onScreen = er.top >= cr.top && er.bottom <= cr.bottom && er.left >= cr.left && er.right <= cr.right;
                    if (!onScreen) {
                        // Scroll horizontally, centring the day like useWeekWindow does (incl. the
                        // time gutter), so the settled viewport centre stays on the event's day.
                        const dayCol = element.closest('[data-day-col]') as HTMLElement;
                        if (dayCol) {
                            const targetScrollX = scrollLeftForColumn({
                                columnOffsetLeft: dayCol.offsetLeft,
                                columnWidth: dayCol.offsetWidth,
                                viewportWidth: container.clientWidth,
                            });
                            container.scrollLeft = Math.max(0, targetScrollX);
                        }

                        // Scroll vertically
                        const eventTop = element.offsetTop;
                        container.scrollTop = Math.max(0, eventTop - 150);
                    }

                    // Open Popover
                    const rect = element.getBoundingClientRect();
                    setActivePopover({ id: editingEventId, rect });
                }
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [editingEventId, scrollContainerRef, fixedWeekKey]);

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
    }, [viewMode, date, events, scrollContainerRef]);

    // Update the visible date range in the global store
    const updateVisibleRange = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const dayCols = container.querySelectorAll('[data-day-col]');
        const leftEdge = container.scrollLeft;
        const rightEdge = container.scrollLeft + container.clientWidth;
        const visibleDayStrs: string[] = [];

        dayCols.forEach((el) => {
            const htmlEl = el as HTMLElement;
            const colLeft = htmlEl.offsetLeft;
            const colRight = htmlEl.offsetLeft + htmlEl.offsetWidth;
            if (colRight >= leftEdge && colLeft <= rightEdge) {
                const dayStr = htmlEl.getAttribute('data-day-col');
                if (dayStr) visibleDayStrs.push(dayStr);
            }
        });

        if (visibleDayStrs.length > 0) {
            const startIso = visibleDayStrs[0];
            const endIso = visibleDayStrs[visibleDayStrs.length - 1];
            useDataStore.getState().setVisibleCalendarRange({ start: startIso, end: endIso });
        }
    }, [scrollContainerRef]);

    // Initial and layout effect to ensure visibleCalendarRange is set on mount / date change
    useEffect(() => {
        updateVisibleRange();
        const t1 = setTimeout(updateVisibleRange, 100);
        const t2 = setTimeout(updateVisibleRange, 300);
        const t3 = setTimeout(updateVisibleRange, 600);

        window.addEventListener('resize', updateVisibleRange);
        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
            window.removeEventListener('resize', updateVisibleRange);
        };
    }, [weeks, viewMode, updateVisibleRange]);

    // Debounced storage helper: persists the vertical scroll position 300ms after scrolling
    // stops to avoid blocking UI thread / scroll frames with synchronous disk I/O.
    // The horizontal position is derived from `date` and is no longer persisted.
    const saveScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const debouncedSaveScroll = useCallback((scrollY: number) => {
        if (saveScrollTimeoutRef.current) {
            clearTimeout(saveScrollTimeoutRef.current);
        }
        saveScrollTimeoutRef.current = setTimeout(() => {
            try {
                localStorage.setItem("tide_calendar_scroll_y", scrollY.toString());
            } catch {
                // Ignore quota or private-browsing errors
            }
        }, 300);
    }, []);

    // Cleanup debounced storage on unmount
    useEffect(() => {
        return () => {
            if (saveScrollTimeoutRef.current) {
                clearTimeout(saveScrollTimeoutRef.current);
            }
        };
    }, []);

    // Throttled scroll handler: persist vertical position and refresh the visible range
    const lastScrollCallRef = useRef(0);
    const onScroll = useCallback(() => {
        const now = Date.now();
        if (now - lastScrollCallRef.current < 100) return; // Throttle to 10fps for scroll metadata persistence
        lastScrollCallRef.current = now;

        const container = scrollContainerRef.current;
        if (!container) return;

        // Persist scroll position debounced so disk writes never block active scroll frames
        debouncedSaveScroll(container.scrollTop);
        updateVisibleRange();
    }, [scrollContainerRef, debouncedSaveScroll, updateVisibleRange]);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const scrollHandler = () => {
            onScroll();
            if (activePopover) {
                if (Date.now() - lastPopoverOpenTimeRef.current < 450) {
                    return;
                }
                setActivePopover(null);
            }
        };

        container.addEventListener('scroll', scrollHandler, { passive: true });

        // Also capture window-level or document-level scrolling just in case trackpad causes body scroll
        const globalScrollHandler = (e: Event) => {
            if (activePopover) {
                if (Date.now() - lastPopoverOpenTimeRef.current < 450) {
                    return;
                }
                // Ignore scroll events originating from within the popover itself (e.g. long title inputs scrolling horizontally)
                const popoverEl = document.getElementById('active-event-popover');
                if (popoverEl && popoverEl.contains(e.target as Node)) {
                    return;
                }
                setActivePopover(null);
            }
        };

        const globalMouseMoveHandler = (e: MouseEvent) => {
            if (activePopover) {
                if (Date.now() - lastPopoverOpenTimeRef.current < 450) {
                    return;
                }

                // If event originates from a touch device (coarse pointer) or has touch-like characteristics, do not dismiss on mousemove hover
                if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) {
                    return;
                }

                // Also ignore tiny movement / jitter from synthetic touch moves
                if (Math.abs(e.movementX) < 2 && Math.abs(e.movementY) < 2 && (e as any).sourceCapabilities?.firesTouchEvents) {
                    return;
                }

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
                if (Date.now() - lastPopoverOpenTimeRef.current < 450) {
                    return;
                }
                const popoverEl = document.getElementById('active-event-popover');
                if (popoverEl && popoverEl.contains(e.target as Node)) {
                    return;
                }
                setActivePopover(null);
            }
        };

        const globalTouchHandler = (e: TouchEvent) => {
            if (activePopover) {
                if (Date.now() - lastPopoverOpenTimeRef.current < 450) {
                    return;
                }
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
        window.addEventListener('touchend', globalTouchHandler);

        return () => {
            container.removeEventListener('scroll', scrollHandler);
            window.removeEventListener('scroll', globalScrollHandler, true);
            window.removeEventListener('mousemove', globalMouseMoveHandler, true);
            window.removeEventListener('mousedown', globalClickHandler);
            window.removeEventListener('touchend', globalTouchHandler);
        };
    }, [onScroll, activePopover, viewMode, scrollContainerRef]);

    // Native browser 2D & momentum scrolling:
    // Wheel hijacking with preventDefault has been removed to preserve OS momentum,
    // trackpad inertia, and compositor-driven smooth scrolling.

    return {
        todayButtonDir,
        todayAngle,
        handleScrollToToday,
        activePopover,
        setActivePopover,
        lastPopoverOpenTimeRef,
    };
}
