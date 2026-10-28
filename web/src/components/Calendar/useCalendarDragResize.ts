import React, { useEffect } from "react";
import { startOfDay } from "date-fns";
import type { CalendarEvent, CalendarViewProps } from "./types";
import { useCalendarDragState } from "./useCalendarDragState";
import { useCalendarTouch } from "./useCalendarTouch";

interface UseCalendarDragResizeParams {
    events: CalendarEvent[];
    onEventUpdate: CalendarViewProps["onEventUpdate"];
    onEventCreate: CalendarViewProps["onEventCreate"];
    onEventClick: CalendarViewProps["onEventClick"];
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Global mouse drag / resize / creation gesture physics (>3px threshold,
 * precise-mode gearing, midnight clamp, sidebar drop events) on top of
 * the shared drag state and touch gestures.
 */
export function useCalendarDragResize({
    events,
    onEventUpdate,
    onEventCreate,
    onEventClick,
    scrollContainerRef,
}: UseCalendarDragResizeParams) {
    const s = useCalendarDragState({ events, onEventUpdate, onEventCreate, scrollContainerRef });
    useCalendarTouch(scrollContainerRef, s);

    const {
        physicalMouseRef,
        isPreciseModeRef,
        preciseAnchorRef,
        gearedMouseRef,
        cursorX,
        cursorY,
        gridDaysRef,
        activeEventEdgeRef,
        pendingDragRef,
        draggingId,
        setDraggingId,
        dragState,
        setDragState,
        isDraggingRef,
        dragOverlayY,
        dragOverlayX,
        dragCurrentTopRef,
        creationDrag,
        setCreationDrag,
        resizingId,
        setResizingId,
        resizeDragState,
        setResizeDragState,
        creationEndYMV,
        resizeHeightMV,
        setDropBounds,
        commitEventDrop,
    } = s;

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
                        initialScrollTop: pendingDragRef.current.initialScrollTop,
                        grabOffsetY: pendingDragRef.current.grabOffsetY,
                        grabOffsetX: pendingDragRef.current.grabOffsetX
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

                    // Notify the sidebar so it can highlight & open a note tile
                    // when the cursor is over it (the calendar's mouse-based drag
                    // does NOT use HTML5 DnD, so onDragOver in the sidebar can't
                    // observe this drag).
                    window.dispatchEvent(new CustomEvent('tide:event-drag-move', {
                        detail: { x: e.clientX, y: e.clientY, eventId: draggingId },
                    }));
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

                // Update creationDrag so the MagnifiedEventView reads live delta
                setCreationDrag(prev => prev ? { ...prev, currentY: clampedY, currentX: gX } : prev);

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

            // ── Sidebar drop interception ────────────────────────────────────
            // If a sidebar note consumes this drop, skip the calendar time-update
            // path completely so the original event stays in place and the
            // Phase-2 ghost (drop-into-note) takes over.
            let droppedOnNote = false;
            if (draggingId) {
                const draggingEvent = events.find(ev => ev.id === draggingId || (draggingId && draggingId.startsWith(ev.id + '_')));
                const detail: any = {
                    x: e.clientX,
                    y: e.clientY,
                    eventId: draggingId,
                    title: draggingEvent?.title,
                    start: draggingEvent?.start,
                    end: draggingEvent?.end,
                    color: (draggingEvent as any)?.color,
                    consumed: false,
                };
                window.dispatchEvent(new CustomEvent('tide:event-drag-drop', { detail }));
                droppedOnNote = !!detail.consumed;
            }

            if (droppedOnNote) {
                // Sidebar took the drop. Reset our drag state without committing
                // a time/date change to the event.
                setDraggingId(null);
                setDragState(null);
                setCreationDrag(null);
                setResizingId(null);
                setResizeDragState(null);
                setDropBounds(null);
                isDraggingRef.current = false;
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

            await onEventCreate(new Date(finalStartMs), new Date(finalEndMs), false);

        } else if (draggingId && dragState) {
            const dId = draggingId;
            const dState = dragState;
            const { x: gX, y: gY } = gearedMouseRef.current;

            try {
                await commitEventDrop(dId, dState, gX, gY);
            } finally {
                setDraggingId(null);
                setDragState(null);
                isDraggingRef.current = false; // Reset drag threshold for next drag
            }

        } else if (resizingId && resizeDragState) {
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

    return s;
}
