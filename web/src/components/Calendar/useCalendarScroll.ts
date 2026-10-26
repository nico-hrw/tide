import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { format, addWeeks, subWeeks, isSameDay } from "date-fns";
import { useDataStore } from "@/store/useDataStore";
import type { ActivePopover } from "./types";

interface UseCalendarScrollParams {
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
    date: Date;
    onDateChange: (date: Date) => void;
    loadedWeeks: Date[];
    setLoadedWeeks: React.Dispatch<React.SetStateAction<Date[]>>;
    isPrependingRef: React.MutableRefObject<boolean>;
    activePopover: ActivePopover | null;
    setActivePopover: React.Dispatch<React.SetStateAction<ActivePopover | null>>;
    lastPopoverOpenTimeRef: React.MutableRefObject<number>;
}

/**
 * Infinite horizontal scroll, scroll persistence, popover dismissal on
 * scroll/move/click, 2D wheel panning, prepend scroll compensation and the
 * directional "Today" button tracking.
 */
export function useCalendarScroll({
    scrollContainerRef,
    date,
    onDateChange,
    loadedWeeks,
    setLoadedWeeks,
    isPrependingRef,
    activePopover,
    setActivePopover,
    lastPopoverOpenTimeRef,
}: UseCalendarScrollParams) {
    const [todayButtonDir, setTodayButtonDir] = useState<'hidden' | 'left' | 'right'>('hidden');
    const [todayAngle, setTodayAngle] = useState<number>(0);

    // Track today column visibility & direction angle to current time
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const check = () => {
            const todayIso = format(new Date(), "yyyy-MM-dd");
            const todayCol = container.querySelector(`[data-day-col="${todayIso}"]`) as HTMLElement | null;
            if (!todayCol) { setTodayButtonDir('hidden'); return; }
            const colRect = todayCol.getBoundingClientRect();
            const cRect = container.getBoundingClientRect();
            if (colRect.right < cRect.left + 80) setTodayButtonDir('left');
            else if (colRect.left > cRect.right - 80) setTodayButtonDir('right');
            else setTodayButtonDir('hidden');

            const now = new Date();
            const nowMinutes = now.getHours() * 60 + now.getMinutes();
            const todayYInContainer = 50 + nowMinutes;

            const todayTargetX = colRect.left + (colRect.width / 2);
            const todayTargetY = cRect.top + (todayYInContainer - container.scrollTop);

            const buttonX = colRect.right < cRect.left + 80 ? cRect.left + 90 : cRect.right - 40;
            const buttonY = cRect.top + (cRect.height / 2);

            const dx = todayTargetX - buttonX;
            const dy = todayTargetY - buttonY;
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            setTodayAngle(angle);
        };
        container.addEventListener('scroll', check, { passive: true });
        const t = setTimeout(check, 300);
        return () => { container.removeEventListener('scroll', check); clearTimeout(t); };
    }, [loadedWeeks]);

    const handleScrollToToday = useCallback(() => {
        const now = new Date();
        onDateChange(now);
        const container = scrollContainerRef.current;
        if (!container) return;
        const todayIso = format(now, "yyyy-MM-dd");
        const todayCol = container.querySelector(`[data-day-col="${todayIso}"]`) as HTMLElement | null;
        
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const targetScrollY = Math.max(0, nowMinutes - 120);
        container.scrollTo({ top: targetScrollY, behavior: 'smooth' });

        if (todayCol) {
            const containerWidth = container.clientWidth;
            const colLeft = todayCol.offsetLeft;
            const colWidth = todayCol.offsetWidth;
            const targetScrollX = Math.max(0, colLeft - (containerWidth / 2) + (colWidth / 2));
            container.scrollTo({ left: targetScrollX, behavior: 'smooth' });
        }
    }, [onDateChange]);

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

        // Determine which week/day is in the center and update the month
        // Each week has 7 days. Total weeks = loadedWeeks.length.
        // We can find the current index of the week based on scroll percentage.
        // Or simply query the DOM for the center day column:
        const centerScrollX = container.scrollLeft + (container.clientWidth / 2);
        let closestDayCol: HTMLElement | null = null;
        let minDistance = Infinity;

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
            const colCenter = htmlEl.offsetLeft + (htmlEl.offsetWidth / 2);
            const dist = Math.abs(colCenter - centerScrollX);
            if (dist < minDistance) {
                minDistance = dist;
                closestDayCol = htmlEl;
            }
        });

        if (visibleDayStrs.length > 0) {
            const startIso = visibleDayStrs[0];
            const endIso = visibleDayStrs[visibleDayStrs.length - 1];
            useDataStore.getState().setVisibleCalendarRange({ start: startIso, end: endIso });
        }

        if (closestDayCol) {
            const dayStr = (closestDayCol as HTMLElement).getAttribute('data-day-col');
            if (dayStr) {
                const currentCenterDate = new Date(dayStr);
                if (!isSameDay(currentCenterDate, date)) {
                    onDateChange(currentCenterDate);
                }
            }
        }
    }, [onDateChange, date]);

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

        container.addEventListener('scroll', scrollHandler);

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

    return { todayButtonDir, todayAngle, handleScrollToToday };
}
