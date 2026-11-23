import React from 'react';
import { createPortal } from 'react-dom';
import { motion, useSpring, MotionValue } from 'framer-motion';
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

/** Pixels per minute of the time grid (48px per hour). */
const PX_PER_MIN = 48 / 60;

interface DragGhostProps {
    draggingId: string | null;
    dragState: { initialWidth?: number; currentTop?: number } | null;
    grabOffsetY?: number;
    events: CalendarEvent[];
    /** Screen position of the ghost's top-left corner. The drag logic already snaps it to the time grid and to the day column. */
    cursorX: MotionValue<number>;
    cursorY: MotionValue<number>;
}

/**
 * The moving silhouette of an event: it sits on the slot the event will snap to (day column, 10-minute grid) in the
 * event's own colour and eases from slot to slot. The original card is hidden while dragging.
 */
export const DragGhost: React.FC<DragGhostProps> = ({ draggingId, dragState, events, cursorX, cursorY }) => {
    // Handle recurrence instances like 'eventId_1234567890'
    const event = events.find(e => e.id === draggingId || (draggingId && draggingId.startsWith(e.id + '_')));
    const durationMinutes = event ? (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000 : 60;
    const heightPx = Math.max(22, durationMinutes * PX_PER_MIN - 4);

    // A short, stiff spring: the silhouette clicks into the next slot instead of floating after the pointer.
    const springCfg = { stiffness: 900, damping: 48, mass: 0.5 };
    const x = useSpring(cursorX, springCfg);
    const y = useSpring(cursorY, springCfg);

    if (!draggingId || !dragState || !event) {
        return null;
    }

    const theme = getEventTheme(event);
    // Live time at the snapped drop position, so the label always matches where the event will land
    const startMin = dragState.currentTop ?? (new Date(event.start).getHours() * 60 + new Date(event.start).getMinutes());
    const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
    const timeLabel = `${hhmm(startMin)} – ${hhmm(startMin + durationMinutes)}`;

    return typeof document !== 'undefined' ? createPortal(
        <motion.div
            className="fixed top-0 left-0 pointer-events-none z-[9999] rounded-xl overflow-hidden"
            style={{
                x,
                y,
                width: dragState.initialWidth,
                height: heightPx,
                backgroundColor: theme.bg,
                color: theme.text,
                // Event colour with a darker inner outline and a soft shadow: easy to see, no foreign (blue/black) accent.
                boxShadow: 'inset 0 0 0 2px color-mix(in srgb, currentColor 40%, transparent), 0 10px 26px rgba(0,0,0,0.28)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.92 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
        >
            {event.effect && (
                <div className={`absolute inset-0 pointer-events-none effect-${event.effect}`} style={{ mixBlendMode: 'overlay' }} />
            )}
            <div className="relative z-10 px-3 py-1.5 overflow-hidden flex flex-col h-full">
                <p className="font-bold text-[11px] truncate leading-[16px]">{event.title}</p>
                <p className="text-[11px] font-bold mt-auto tabular-nums">{timeLabel}</p>
            </div>
        </motion.div>,
        document.body
    ) : null;
};
