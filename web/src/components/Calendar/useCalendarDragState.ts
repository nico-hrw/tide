import React, { useState, useEffect, useRef, useCallback } from "react";
import { useMotionValue } from "framer-motion";
import { getHours, getMinutes, startOfDay } from "date-fns";
import type {
    CalendarEvent,
    CalendarViewProps,
    CreationDrag,
    DragState,
    PendingDrag,
    ResizeDragState,
    TouchDragState,
} from "./types";

interface UseCalendarDragStateParams {
    events: CalendarEvent[];
    onEventUpdate: CalendarViewProps["onEventUpdate"];
    onEventCreate: CalendarViewProps["onEventCreate"];
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Owns all drag / resize / creation state, refs and 60FPS MotionValues,
 * plus the mouse-down entry points that start a gesture.
 */
export function useCalendarDragState({
    events,
    onEventUpdate,
    onEventCreate,
    scrollContainerRef,
}: UseCalendarDragStateParams) {
    // --- DnD State ---
    const eventsRef = useRef(events);
    eventsRef.current = events;
    const onEventUpdateRef = useRef(onEventUpdate);
    onEventUpdateRef.current = onEventUpdate;
    const touchDragStateRef = useRef<TouchDragState | null>(null);

    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dragState, setDragState] = useState<DragState | null>(null);
    const pendingDragRef = useRef<PendingDrag | null>(null);

    const [creationDrag, setCreationDrag] = useState<CreationDrag | null>(null);
    const [resizingId, setResizingId] = useState<string | null>(null);
    const [resizeDragState, setResizeDragState] = useState<ResizeDragState | null>(null);
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

    const commitEventDrop = useCallback(async (
        dId: string,
        dState: { originalTop: number, startY: number, startX: number, initialScrollTop: number },
        clientX: number,
        clientY: number
    ) => {
        const updateFn = onEventUpdateRef.current;
        if (!updateFn) return;

        const event = eventsRef.current.find(e => e.id === dId || (dId && dId.startsWith(e.id + '_')));
        if (event) {
            const snapInterval = isPreciseModeRef.current ? 1 : 10;
            const scrollDelta = (scrollContainerRef.current?.scrollTop || 0) - dState.initialScrollTop;
            const deltaY = clientY - dState.startY + scrollDelta;

            const durationMins = (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000;
            const minDuration = Math.max(10, durationMins);

            let newStartMins = dState.originalTop + deltaY;
            newStartMins = Math.round(newStartMins / snapInterval) * snapInterval;
            // MIDNIGHT SWAP FIX: clamp so start can never exceed end boundary
            newStartMins = Math.max(0, Math.min(newStartMins, 1440 - minDuration));

            // Determine target day from mouse / touch X
            let targetBaseDate: Date | null = null;
            const dayCols = document.querySelectorAll('[data-day-col]');
            dayCols.forEach((col) => {
                const rect = col.getBoundingClientRect();
                if (clientX >= rect.left && clientX <= rect.right) {
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

            await updateFn(dId, safeStart, safeEnd);
        }
    }, []);

    const handleEventMouseDown = (e: React.MouseEvent, id: string, start: Date) => {
        if (e.button !== 0) return;
        e.stopPropagation(); // Prevent grid creation trigger

        const startMinutes = getHours(start) * 60 + getMinutes(start);

        const el = (e.currentTarget as HTMLElement).closest('[data-event-id]') || (e.currentTarget as HTMLElement);
        const scrollContainer = scrollContainerRef.current;
        if (!scrollContainer || scrollContainer.children.length < 2) return;

        const containerRect = scrollContainer.children[1].getBoundingClientRect();
        const elRect = el.getBoundingClientRect();

        const initialX = elRect.left - containerRect.left;
        const initialWidth = elRect.width;
        const grabOffsetY = e.clientY - elRect.top;
        const grabOffsetX = e.clientX - elRect.left;

        // Start a PENDING drag using REF to avoid render lag
        pendingDragRef.current = {
            id,
            startX: gearedMouseRef.current.x, // Use geared coords for startX
            startY: gearedMouseRef.current.y, // Use geared coords for startY
            startMinutes,
            initialX,
            initialWidth,
            initialScrollTop: scrollContainer.scrollTop,
            grabOffsetY,
            grabOffsetX,
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
        // Initialize the MotionValue at the click point so the preview starts at 0-delta.
        // Without this, the MV retains its value from a previous drag → huge initial preview.
        creationEndYMV.set(gearedMouseRef.current.y);
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

    return {
        eventsRef,
        onEventUpdateRef,
        touchDragStateRef,
        draggingId,
        setDraggingId,
        dragState,
        setDragState,
        pendingDragRef,
        creationDrag,
        setCreationDrag,
        resizingId,
        setResizingId,
        resizeDragState,
        setResizeDragState,
        isDraggingRef,
        isPreciseMode,
        isPreciseModeRef,
        cursorX,
        cursorY,
        dragOverlayY,
        dragOverlayX,
        dragOverlayW,
        dragOverlayH,
        resizeHeightMV,
        creationEndYMV,
        physicalMouseRef,
        gearedMouseRef,
        preciseAnchorRef,
        activeEventEdgeRef,
        dragCurrentTopRef,
        gridDaysRef,
        dropBounds,
        setDropBounds,
        commitEventDrop,
        handleEventMouseDown,
        handleGridMouseDown,
        handleResizeMouseDown,
    };
}

export type CalendarDragState = ReturnType<typeof useCalendarDragState>;
