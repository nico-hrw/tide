import React from 'react';
import { createPortal } from 'react-dom';
import { motion, MotionValue } from 'framer-motion';

// Assuming CalendarEvent and getEventTheme are defined or imported here
// For simplicity, defining them directly.

interface CalendarEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    effect?: string;
}

const getEventTheme = (evt: CalendarEvent) => {
    // If we have an individual color, use it as bg
    if ((evt as any).color) {
        return { bg: (evt as any).color, text: '#ffffff', border: (evt as any).color };
    }

    const effectMap: Record<string, { bg: string; text: string; border: string }> = {
        'sky': { bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc' },
        'green': { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
        'orange': { bg: '#ffedd5', text: '#c2410c', border: '#fdba74' },
        'none': { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' }
    };
    return effectMap[evt.effect || 'none'] || effectMap['none'];
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

export const DragGhost: React.FC<DragGhostProps> = ({
    draggingId,
    dragState,
    events,
    cursorX,
    cursorY,
    grabOffsetY,
}) => {
    // Handle recurrence instances like 'eventId_1234567890'
    const event = events.find(e => e.id === draggingId || (draggingId && draggingId.startsWith(e.id + '_')));
    const durationMinutes = event ? (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000 : 60;

    const heightPx = Math.max(22, durationMinutes * PX_PER_MIN - 4);

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
            className="fixed top-0 left-0 pointer-events-none z-[9999] rounded-xl shadow-2xl overflow-hidden"
            style={{
                x: cursorX,
                y: cursorY,
                width: dragState.initialWidth,
                height: heightPx,
                display: 'block',
                backgroundColor: (event as any).color || theme.bg,
                color: theme.text,
                borderLeft: `4px solid ${theme.border}`
            }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 0.85, scale: 1.0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
        >
            {/* Effect Overlay */}
            {event.effect && (
                <div className={`absolute inset-0 pointer-events-none effect-${event.effect}`} style={{ mixBlendMode: 'overlay' }} />
            )}
            
            <div className="relative z-10 p-2 overflow-hidden flex flex-col h-full">
                <p className="font-bold text-[11px] truncate leading-tight">{event.title}</p>
                {(event as any).description && durationMinutes > 40 && (
                    <p className="text-[11px] opacity-80 truncate mt-0.5">{ (event as any).description }</p>
                )}
                <p className="text-[11px] font-bold mt-auto tabular-nums">{timeLabel}</p>
            </div>
        </motion.div>,
        document.body
    ) : null;
};
