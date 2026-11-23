import React from 'react';
import { createPortal } from 'react-dom';
import { motion, useSpring, useTransform, MotionValue } from 'framer-motion';
import { resolveCategory } from '@/lib/calendarColors';

interface CalendarEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    effect?: string;
}

/** Same colours as the calendar cards (a category key such as "studium" is not a CSS colour on its own). */
const getEventTheme = (evt: CalendarEvent) => {
    const cat = resolveCategory((evt as { color?: string }).color);
    return { bg: cat.bg, text: cat.ink };
};

const fmtMinutes = (m: number) => {
    const c = Math.max(0, Math.min(1440, Math.round(m)));
    return `${String(Math.floor(c / 60) % 24).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`;
};

interface DragGhostProps {
    draggingId: string | null;
    dragState: { initialWidth?: number; grabOffsetY?: number; grabOffsetX?: number; currentTop?: number } | null;
    grabOffsetY?: number;
    events: CalendarEvent[];
    cursorX: MotionValue<number>;
    cursorY: MotionValue<number>;
    /** Pixels per hour of the grid (the cards use the same value). */
    hourHeight?: number;
}

/** Day column under an x position (nearest one if the pointer is outside every column). */
function columnAt(x: number): DOMRect | null {
    const cols = Array.from(document.querySelectorAll('[data-day-col]'));
    let best: DOMRect | null = null;
    let bestDist = Infinity;
    for (const col of cols) {
        const r = col.getBoundingClientRect();
        if (r.width === 0) continue;
        const dist = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
        if (dist < bestDist) { best = r; bestDist = dist; }
    }
    return best;
}

/**
 * The moving silhouette of an event. It is NOT glued to the pointer: it sits on the slot the event will snap to
 * (day column under the pointer, time snapped to the 10-minute grid), in the event's own colour, and eases from slot
 * to slot. The original card is hidden while dragging, so only this silhouette is visible.
 */
export const DragGhost: React.FC<DragGhostProps> = ({
    draggingId,
    dragState,
    events,
    cursorX,
    cursorY,
    grabOffsetY,
    hourHeight = 48,
}) => {
    // Handle recurrence instances like 'eventId_1234567890'
    const event = events.find(e => e.id === draggingId || (draggingId && draggingId.startsWith(e.id + '_')));
    const durationMinutes = event ? (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000 : 60;
    const minH = hourHeight / 60;
    const grabY = grabOffsetY ?? dragState?.grabOffsetY ?? 0;

    // Slot the event snaps to: same maths as the drop (pointer minus grab offset -> minute, snapped, kept inside the day).
    const slotTopMin = useTransform(cursorY, (cy) => {
        const col = columnAt(cursorX.get());
        if (!col) return 0;
        const raw = (cy - grabY - (col.top + 50) - 2) / minH;
        const snapped = Math.round(raw / 10) * 10;
        return Math.max(0, Math.min(snapped, 1440 - Math.max(10, durationMinutes)));
    });
    const slotY = useTransform(slotTopMin, (m) => {
        const col = columnAt(cursorX.get());
        return (col ? col.top + 50 : 0) + m * minH + 2;
    });
    const slotX = useTransform(cursorX, (cx) => (columnAt(cx)?.left ?? 0) + 3);
    const slotW = useTransform(cursorX, (cx) => Math.max(40, (columnAt(cx)?.width ?? (dragState?.initialWidth ?? 120)) - 6));

    // A short, stiff spring: the silhouette clicks into the next slot instead of floating after the pointer.
    const springCfg = { stiffness: 900, damping: 48, mass: 0.5 };
    const x = useSpring(slotX, springCfg);
    const y = useSpring(slotY, springCfg);
    const width = useSpring(slotW, springCfg);
    const label = useTransform(slotTopMin, (m) => `${fmtMinutes(m)} – ${fmtMinutes(m + durationMinutes)}`);

    if (!draggingId || !dragState || !event) {
        return null;
    }

    const theme = getEventTheme(event);
    const heightPx = Math.max(22, durationMinutes * minH - 4);

    return typeof document !== 'undefined' ? createPortal(
        <motion.div
            className="fixed top-0 left-0 pointer-events-none z-[9999] rounded-xl overflow-hidden"
            style={{
                x,
                y,
                width,
                height: heightPx,
                backgroundColor: theme.bg,
                color: theme.text,
                // Event colour with a darker inner outline and a soft shadow: easy to see, no foreign (blue) accent.
                boxShadow: 'inset 0 0 0 2px color-mix(in srgb, currentColor 40%, transparent), 0 10px 26px rgba(0,0,0,0.28)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.9 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
        >
            {event.effect && (
                <div className={`absolute inset-0 pointer-events-none effect-${event.effect}`} style={{ mixBlendMode: 'overlay' }} />
            )}
            <div className="relative z-10 px-3 py-1.5 overflow-hidden flex flex-col h-full">
                <p className="font-bold text-[11px] truncate leading-[16px]">{event.title}</p>
                <motion.p className="text-[11px] font-bold mt-auto tabular-nums">{label}</motion.p>
            </div>
        </motion.div>,
        document.body
    ) : null;
};
