import React from "react";
import type { MotionValue } from "framer-motion";
import { MagnifiedEventView } from "./MagnifiedEventView";
import type { CalendarEvent, CreationDrag, DragState, ResizeDragState } from "./types";

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

interface CalendarProjectionLayerProps {
    isPreciseMode: boolean;
    draggingId: string | null;
    dragState: DragState | null;
    creationDrag: CreationDrag | null;
    resizingId: string | null;
    resizeDragState: ResizeDragState | null;
    events: CalendarEvent[];
    dragCurrentTopRef: React.MutableRefObject<number>;
    activeEventEdgeRef: React.MutableRefObject<number>;
    cursorX: MotionValue<number>;
    cursorY: MotionValue<number>;
    dropBounds: DOMRect | null;
}

/** Visual Projection Layer (Precise Mode loupe). */
export function CalendarProjectionLayer({
    isPreciseMode,
    draggingId,
    dragState,
    creationDrag,
    resizingId,
    resizeDragState,
    events,
    dragCurrentTopRef,
    activeEventEdgeRef,
    cursorX,
    cursorY,
    dropBounds,
}: CalendarProjectionLayerProps) {
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
}
