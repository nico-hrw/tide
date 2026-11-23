import React, { useEffect } from "react";
import { startOfDay } from "date-fns";
import { occurrenceTimestamp } from "@/lib/recurrence";
import type { CalendarEvent, CalendarViewProps } from "./types";
import { useCalendarDragState } from "./useCalendarDragState";
import { useCalendarTouch } from "./useCalendarTouch";

interface UseCalendarDragResizeParams {
    events: CalendarEvent[];
    onEventUpdate: CalendarViewProps["onEventUpdate"];
    onEventCreate: CalendarViewProps["onEventCreate"];
    onEventClick: CalendarViewProps["onEventClick"];
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
    hourHeight?: number;
}

/** Screen Y of minute 0 of the day grid (day columns start with a 50px sticky header), or null without a grid. */
export function gridOriginY(): number | null {
    if (typeof document === 'undefined') return null;
    const col = document.querySelector('[data-day-col]');
    return col ? col.getBoundingClientRect().top + 50 : null;
}

/**
 * New start minute and duration for a resize. The pointer is mapped to a time on the absolute grid (so the edge sits
 * where the pointer is and snaps to fixed times, e.g. :00/:10/:20, not to steps relative to the old value). Dragging the
 * bottom edge keeps the start, dragging the top edge keeps the end; both stay inside the day.
 * Without a grid (originY null) it falls back to the pointer delta since the gesture started.
 */
export function computeResize(
    rState: {
        startY: number; originalTop: number; originalHeight: number; initialScrollTop: number;
        edge?: 'start' | 'end'; grabOffsetMins?: number;
    },
    mouseY: number,
    scrollTop: number,
    snapInterval: number,
    hourHeight: number,
    originY: number | null = null,
): { startMin: number; duration: number } {
    const minH = hourHeight / 60;
    const minDuration = Math.max(10, snapInterval);
    const endMin0 = rState.originalTop + rState.originalHeight;
    const edge0 = rState.edge === 'start' ? rState.originalTop : endMin0;
    const edgeRaw = originY !== null
        ? (mouseY - originY) / minH - (rState.grabOffsetMins ?? 0)
        : edge0 + (mouseY - rState.startY + (scrollTop - rState.initialScrollTop)) / minH;
    const snapped = Math.round(edgeRaw / snapInterval) * snapInterval;
    if (rState.edge === 'start') {
        const startMin = Math.max(0, Math.min(snapped, endMin0 - minDuration));
        return { startMin, duration: endMin0 - startMin };
    }
    const endMin = Math.max(rState.originalTop + minDuration, Math.min(snapped, 1440));
    return { startMin: rState.originalTop, duration: endMin - rState.originalTop };
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
    hourHeight = 48,
}: UseCalendarDragResizeParams) {
    const s = useCalendarDragState({ events, onEventUpdate, onEventCreate, scrollContainerRef });
    const pxPerMin = hourHeight / 60;
    // Last snapped values the user saw: the drop uses exactly these, so it lands where the preview showed it.
    const ghostBaseRef = React.useRef({ top: 0, left: 0 });
    const creationDeltaMinsRef = React.useRef(0);
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
        resizeTopMV,
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

            // The loupe follows the real mouse; in precise mode the branches below pin it to the edge being edited.
            cursorX.set(gX);
            if (!isPreciseModeRef.current) cursorY.set(e.clientY);

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
                    const p = pendingDragRef.current;
                    ghostBaseRef.current = { top: p.startY - (p.grabOffsetY ?? 0), left: p.startX - (p.grabOffsetX ?? 0) };
                    dragOverlayY.set(ghostBaseRef.current.top);
                    dragOverlayX.set(ghostBaseRef.current.left);
                    dragCurrentTopRef.current = p.startMinutes;
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
                }

                if (isDraggingRef.current) {
                    const scrollPx = (scrollContainerRef.current?.scrollTop || 0) - dragState.initialScrollTop;

                    const draggingEvent = events.find(e => e.id === draggingId || draggingId?.startsWith(e.id + "_"));
                    const durationMins = draggingEvent ? (new Date(draggingEvent.end).getTime() - new Date(draggingEvent.start).getTime()) / 60000 : 15;

                    // Mouse movement (px) -> minutes, then snap: the ghost and the drop both use this value
                    let rawMins = dragState.originalTop + (deltaY + scrollPx) / pxPerMin;
                    rawMins = Math.max(0, Math.min(rawMins, 1440 - durationMins));
                    const snapInterval = isPreciseModeRef.current ? 1 : 10;
                    const snappedTop = Math.round(rawMins / snapInterval) * snapInterval;

                    activeEventEdgeRef.current = snappedTop;
                    // React state only changes when the snapped minute does (not on every pixel of mouse movement)
                    if (snappedTop !== dragCurrentTopRef.current) {
                        dragCurrentTopRef.current = snappedTop;
                        setDragState(prev => prev ? { ...prev, currentTop: snappedTop } : prev);
                    }

                    // The ghost sits on the snapped minute and on the day column under the pointer
                    const ghostTop = ghostBaseRef.current.top + (snappedTop - dragState.originalTop) * pxPerMin - scrollPx;
                    let ghostLeft = gX - (dragState.grabOffsetX ?? 0);
                    document.querySelectorAll('[data-day-col]').forEach((col) => {
                        const r = col.getBoundingClientRect();
                        if (gX >= r.left && gX <= r.right) ghostLeft = r.left + 3;
                    });
                    dragOverlayY.set(ghostTop);
                    dragOverlayX.set(ghostLeft);
                    if (isPreciseModeRef.current) cursorY.set(ghostTop);

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
                // Since hourHeight / 60 is pixels per minute on the grid:
                const minuteHeight = hourHeight / 60;
                const maxForwardPx = (1440 - startMinsCreation) * minuteHeight;
                const maxBackwardPx = -startMinsCreation * minuteHeight;
                const clampedDeltaY = Math.max(maxBackwardPx, Math.min(rawDeltaY, maxForwardPx));

                if (!isDraggingRef.current && Math.abs(clampedDeltaY) > 10) {
                    isDraggingRef.current = true;
                }
                // Snapped like the drop; preview and result use this same value
                const snapInterval = isPreciseModeRef.current ? 1 : 10;
                const maxFwdMins = 1440 - startMinsCreation;
                const snappedDelta = Math.max(-startMinsCreation, Math.min(Math.round(clampedDeltaY / minuteHeight / snapInterval) * snapInterval, maxFwdMins));
                creationDeltaMinsRef.current = snappedDelta;
                const snappedY = creationDrag.startY + snappedDelta * minuteHeight;
                activeEventEdgeRef.current = snappedDelta < 0 ? startMinsCreation + snappedDelta : startMinsCreation + Math.max(snapInterval, snappedDelta);

                if (snappedY !== creationDrag.currentY) {
                    setCreationDrag(prev => prev ? { ...prev, currentY: snappedY, currentX: gX } : prev);
                }
                creationEndYMV.set(snappedY);
                if (isPreciseModeRef.current) cursorY.set(snappedY);
            } else if (resizingId && resizeDragState) {
                const deltaY = gY - resizeDragState.startY;
                if (!isDraggingRef.current && Math.abs(deltaY) > 3) {
                    isDraggingRef.current = true;
                }
                if (isDraggingRef.current) {
                    const snapInterval = isPreciseModeRef.current ? 1 : 10;
                    const originY = gridOriginY();
                    const { startMin, duration } = computeResize(resizeDragState, gY, scrollContainerRef.current?.scrollTop || 0,
                        snapInterval, hourHeight, originY);
                    // The loupe is anchored to the edge that is being dragged (top edge: start, bottom edge: end)
                    const edgeMin = resizeDragState.edge === 'start' ? startMin : startMin + duration;
                    activeEventEdgeRef.current = edgeMin;

                    // React state only changes when the snapped value does
                    if (duration !== resizeDragState.currentHeight || startMin !== resizeDragState.currentTop) {
                        setResizeDragState(prev => prev ? { ...prev, currentHeight: duration, currentTop: startMin } : prev);
                    }
                    resizeHeightMV.set(duration);
                    resizeTopMV.set(startMin);
                    // Edge on screen, so the loupe sits on the real edge
                    if (isPreciseModeRef.current && originY !== null) cursorY.set(originY + edgeMin * pxPerMin);
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
            // The snapped value from the last mouse move: exactly what the preview showed
            const clampedDeltaMins = creationDeltaMinsRef.current;

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
                await commitEventDrop(dId, dState, gX, gY, isDraggingRef.current ? dragCurrentTopRef.current : undefined);
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
                const snapInterval = isPreciseModeRef.current ? 1 : 10;
                const { startMin, duration } = computeResize(rState, gearedMouseRef.current.y,
                    scrollContainerRef.current?.scrollTop || 0, snapInterval, hourHeight, gridOriginY());

                // A repetition keeps ITS start (encoded in the id); `event` is the series master with the first start.
                const occTs = occurrenceTimestamp(rId);
                const baseStart = new Date(occTs !== null ? occTs : event.start);
                // Top edge: new start on the same day, the end stays. Bottom edge: the start stays exactly as it is.
                const start = rState.edge === 'start'
                    ? new Date(baseStart.getFullYear(), baseStart.getMonth(), baseStart.getDate(), Math.floor(startMin / 60), startMin % 60, 0, 0)
                    : baseStart;
                // MIDNIGHT SWAP FIX: ensure end can never exceed midnight
                const maxEndMs = startOfDay(start).getTime() + 24 * 60 * 60 * 1000;
                const rawEnd = new Date(start.getTime() + duration * 60000);
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
