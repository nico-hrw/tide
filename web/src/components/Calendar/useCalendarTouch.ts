import React, { useEffect } from "react";
import type { CalendarDragState } from "./useCalendarDragState";

/**
 * Touch pan / swipe navigation (with momentum) and long-press event drag
 * for touchscreens (e.g. iPad).
 */
export function useCalendarTouch(
    scrollContainerRef: React.RefObject<HTMLDivElement | null>,
    s: CalendarDragState,
) {
    const {
        eventsRef,
        touchDragStateRef,
        isDraggingRef,
        setDraggingId,
        setDragState,
        dragCurrentTopRef,
        dragOverlayY,
        dragOverlayX,
        cursorX,
        cursorY,
        gearedMouseRef,
        activeEventEdgeRef,
        isPreciseModeRef,
        commitEventDrop,
    } = s;

    // Touch Pan / Swipe Navigation for Touchscreens (e.g. iPad)
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        let isSwiping = false;
        let isTouchDragging = false;
        let startTouchX = 0;
        let startTouchY = 0;
        let lastTouchX = 0;
        let lastTouchY = 0;
        let touchStartTime = 0;
        let lastTouchTime = 0;
        let velocityX = 0;
        let velocityY = 0;
        let animFrameId: number | null = null;
        let didMove = false;
        let longPressTimer: NodeJS.Timeout | null = null;
        let touchedEventEl: HTMLElement | null = null;

        const stopMomentum = () => {
            if (animFrameId !== null) {
                cancelAnimationFrame(animFrameId);
                animFrameId = null;
            }
        };

        const handleTouchStart = (e: TouchEvent) => {
            stopMomentum();

            if (e.touches.length !== 1) {
                isSwiping = false;
                isTouchDragging = false;
                touchedEventEl = null;
                return;
            }

            const target = e.target as Element | null;
            // .event-item is deliberately excluded here so swiping works across events.
            // Buttons, inputs, and popovers/modals remain excluded.
            if (
                target?.closest(
                    'button, input, textarea, [role="button"], [role="dialog"], #active-event-popover, .popover, .modal'
                )
            ) {
                isSwiping = false;
                isTouchDragging = false;
                touchedEventEl = null;
                return;
            }

            const touch = e.touches[0];
            startTouchX = touch.clientX;
            startTouchY = touch.clientY;
            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;
            touchStartTime = performance.now();
            lastTouchTime = touchStartTime;
            velocityX = 0;
            velocityY = 0;
            didMove = false;
            isTouchDragging = false;

            const eventEl = target?.closest('.event-item') as HTMLElement | null;
            touchedEventEl = eventEl;

            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }

            if (eventEl) {
                // If touch started on an event, wait for swipe threshold or long-press hold
                isSwiping = false;
                longPressTimer = setTimeout(() => {
                    // Touch held still (> 500ms) without moving -> initiate event drag!
                    if (!didMove && touchedEventEl) {
                        try {
                            navigator.vibrate?.(40);
                        } catch {
                            // ignore if vibration not supported
                        }

                        const eventId = touchedEventEl.getAttribute('data-event-id') || touchedEventEl.id.replace(/^event-/, '');
                        if (!eventId) return;

                        const event = eventsRef.current.find(ev => ev.id === eventId || (eventId && eventId.startsWith(ev.id + '_')));

                        let startMinutes = 0;
                        const startAttr = touchedEventEl.getAttribute('data-event-start');
                        if (startAttr) {
                            const sDate = new Date(startAttr);
                            if (!isNaN(sDate.getTime())) {
                                startMinutes = sDate.getHours() * 60 + sDate.getMinutes();
                            }
                        } else if (event) {
                            let sDate = new Date(event.start);
                            if (eventId.includes('_')) {
                                const lastUnderscore = eventId.lastIndexOf('_');
                                const ts = parseInt(eventId.substring(lastUnderscore + 1), 10);
                                if (!isNaN(ts)) sDate = new Date(ts);
                            }
                            startMinutes = sDate.getHours() * 60 + sDate.getMinutes();
                        }

                        const containerRect = container.children.length > 1
                            ? container.children[1].getBoundingClientRect()
                            : container.getBoundingClientRect();
                        const elRect = touchedEventEl.getBoundingClientRect();

                        const initialX = elRect.left - containerRect.left;
                        const initialWidth = elRect.width;
                        const grabOffsetY = lastTouchY - elRect.top;
                        const grabOffsetX = lastTouchX - elRect.left;

                        const newDragState = {
                            startY: lastTouchY,
                            startX: lastTouchX,
                            originalTop: startMinutes,
                            currentTop: startMinutes,
                            currentLeft: 0,
                            originalDayIndex: 0,
                            initialX,
                            initialWidth,
                            initialScrollTop: container.scrollTop,
                            grabOffsetY,
                            grabOffsetX,
                        };

                        isTouchDragging = true;
                        isDraggingRef.current = true;
                        touchDragStateRef.current = {
                            id: eventId,
                            state: newDragState,
                        };
                        setDraggingId(eventId);
                        setDragState(newDragState);

                        dragCurrentTopRef.current = startMinutes;
                        dragOverlayY.set(startMinutes);
                        dragOverlayX.set(initialX);
                        cursorX.set(lastTouchX);
                        cursorY.set(lastTouchY);
                        gearedMouseRef.current = { x: lastTouchX, y: lastTouchY };
                    }
                }, 500);
            } else {
                isSwiping = true;
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches.length !== 1) return;

            const touch = e.touches[0];
            const now = performance.now();

            if (isTouchDragging && touchDragStateRef.current) {
                e.preventDefault();
                didMove = true;
                const { id: dId, state: dState } = touchDragStateRef.current;

                cursorX.set(touch.clientX);
                cursorY.set(touch.clientY);
                gearedMouseRef.current = { x: touch.clientX, y: touch.clientY };

                const deltaY = touch.clientY - dState.startY;
                const deltaX = touch.clientX - dState.startX;
                const scrollDelta = (container.scrollTop || 0) - dState.initialScrollTop;

                const draggingEvent = eventsRef.current.find(ev => ev.id === dId || (dId && dId.startsWith(ev.id + "_")));
                const durationMins = draggingEvent ? (new Date(draggingEvent.end).getTime() - new Date(draggingEvent.start).getTime()) / 60000 : 15;

                let newTop = dState.originalTop + deltaY + scrollDelta;
                if (newTop < 0) newTop = 0;
                if (newTop > 1440 - durationMins) newTop = 1440 - durationMins;

                const snapInterval = isPreciseModeRef.current ? 1 : 10;
                const snappedTop = Math.round(newTop / snapInterval) * snapInterval;

                activeEventEdgeRef.current = snappedTop;
                dragCurrentTopRef.current = snappedTop;
                setDragState(prev => prev ? { ...prev, currentTop: snappedTop } : prev);

                dragOverlayY.set(newTop);
                dragOverlayX.set(dState.initialX + deltaX);

                window.dispatchEvent(new CustomEvent('tide:event-drag-move', {
                    detail: { x: touch.clientX, y: touch.clientY, eventId: dId },
                }));

                // Auto-scroll near container edges
                const cRect = container.getBoundingClientRect();
                if (touch.clientY < cRect.top + 60) {
                    container.scrollTop -= 8;
                } else if (touch.clientY > cRect.bottom - 60) {
                    container.scrollTop += 8;
                }
                if (touch.clientX < cRect.left + 80) {
                    container.scrollLeft -= 8;
                } else if (touch.clientX > cRect.right - 80) {
                    container.scrollLeft += 8;
                }

                lastTouchX = touch.clientX;
                lastTouchY = touch.clientY;
                lastTouchTime = now;
                return;
            }

            if (!isSwiping) {
                const totalDist = Math.hypot(touch.clientX - startTouchX, touch.clientY - startTouchY);
                if (totalDist > 8) {
                    isSwiping = true;
                    didMove = true;
                    if (longPressTimer) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }
                } else {
                    return;
                }
            } else {
                const totalDist = Math.hypot(touch.clientX - startTouchX, touch.clientY - startTouchY);
                if (totalDist > 8) {
                    didMove = true;
                }
            }

            const dt = now - lastTouchTime;
            const dx = lastTouchX - touch.clientX;
            const dy = lastTouchY - touch.clientY;

            // Prevent default browser gesture (overscroll / history swipe / synthetic click)
            e.preventDefault();

            container.scrollLeft += dx;
            container.scrollTop += dy;

            if (dt > 0) {
                const instVx = dx / dt;
                const instVy = dy / dt;
                velocityX = 0.8 * instVx + 0.2 * velocityX;
                velocityY = 0.8 * instVy + 0.2 * velocityY;
            }

            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;
            lastTouchTime = now;
        };

        const handleTouchEnd = async () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }

            if (isTouchDragging && touchDragStateRef.current) {
                const { id: dId, state: dState } = touchDragStateRef.current;
                isTouchDragging = false;
                touchDragStateRef.current = null;
                setDraggingId(null);
                setDragState(null);

                const suppressClick = (clickEvent: MouseEvent) => {
                    clickEvent.stopPropagation();
                    clickEvent.preventDefault();
                };
                window.addEventListener('click', suppressClick, { capture: true, once: true });
                setTimeout(() => {
                    window.removeEventListener('click', suppressClick, { capture: true });
                    isDraggingRef.current = false;
                }, 300);

                // Sidebar drop check
                let droppedOnNote = false;
                const draggingEvent = eventsRef.current.find(ev => ev.id === dId || (dId && dId.startsWith(ev.id + '_')));
                const detail: any = {
                    x: lastTouchX,
                    y: lastTouchY,
                    eventId: dId,
                    title: draggingEvent?.title,
                    start: draggingEvent?.start,
                    end: draggingEvent?.end,
                    color: (draggingEvent as any)?.color,
                    consumed: false,
                };
                window.dispatchEvent(new CustomEvent('tide:event-drag-drop', { detail }));
                droppedOnNote = !!detail.consumed;

                if (!droppedOnNote) {
                    await commitEventDrop(dId, dState, lastTouchX, lastTouchY);
                }
                touchedEventEl = null;
                return;
            }

            if (didMove) {
                // Suppress synthetic click after a swiping/scroll gesture across events
                const suppressClick = (clickEvent: MouseEvent) => {
                    clickEvent.stopPropagation();
                    clickEvent.preventDefault();
                };
                window.addEventListener('click', suppressClick, { capture: true, once: true });
                setTimeout(() => {
                    window.removeEventListener('click', suppressClick, { capture: true });
                }, 300);
            }

            const wasSwiping = isSwiping;
            isSwiping = false;
            touchedEventEl = null;

            if (!wasSwiping) return;

            const timeSinceLastMove = performance.now() - lastTouchTime;
            if (timeSinceLastMove > 100) {
                velocityX = 0;
                velocityY = 0;
            }

            const speed = Math.hypot(velocityX, velocityY);
            if (speed > 0.1) {
                let currentVx = velocityX;
                let currentVy = velocityY;
                let lastTime = performance.now();

                const step = (now: number) => {
                    const elapsed = Math.min(now - lastTime, 32);
                    lastTime = now;

                    const friction = Math.pow(0.95, elapsed / 16.67);
                    currentVx *= friction;
                    currentVy *= friction;

                    container.scrollLeft += currentVx * elapsed;
                    container.scrollTop += currentVy * elapsed;

                    if (Math.hypot(currentVx, currentVy) > 0.05) {
                        animFrameId = requestAnimationFrame(step);
                    } else {
                        animFrameId = null;
                    }
                };

                animFrameId = requestAnimationFrame(step);
            }
        };

        const handleTouchCancel = () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
            if (isTouchDragging) {
                isTouchDragging = false;
                touchDragStateRef.current = null;
                setDraggingId(null);
                setDragState(null);
                isDraggingRef.current = false;
            }
            isSwiping = false;
            touchedEventEl = null;
            velocityX = 0;
            velocityY = 0;
            stopMomentum();
        };

        container.addEventListener('touchstart', handleTouchStart, { passive: true });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd, { passive: true });
        container.addEventListener('touchcancel', handleTouchCancel, { passive: true });

        return () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
            }
            stopMomentum();
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            container.removeEventListener('touchend', handleTouchEnd);
            container.removeEventListener('touchcancel', handleTouchCancel);
        };
    }, [commitEventDrop]);
}
