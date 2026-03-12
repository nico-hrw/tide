import React from 'react';
import { motion, useTransform, MotionValue } from 'framer-motion';
import { format } from 'date-fns';

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
    const effectMap: Record<string, { bg: string; text: string; border: string }> = {
        'sky': { bg: 'var(--event-sky-bg)', text: 'var(--event-sky-text)', border: 'var(--event-sky-border)' },
        'green': { bg: 'var(--event-green-bg)', text: 'var(--event-green-text)', border: 'var(--event-green-border)' },
        'orange': { bg: 'var(--event-orange-bg)', text: 'var(--event-orange-text)', border: 'var(--event-orange-border)' },
        'none': { bg: 'var(--event-default-bg)', text: 'var(--event-default-text)', border: 'var(--event-default-border)' }
    };
    return effectMap[evt.effect || 'none'] || effectMap['none'];
};


interface DragGhostProps {
    draggingId: string | null;
    dragState: { initialWidth?: number } | null;
    events: CalendarEvent[];
    cursorX: MotionValue<number>;
    cursorY: MotionValue<number>;
}

export const DragGhost: React.FC<DragGhostProps> = ({
    draggingId,
    dragState,
    events,
    cursorX,
    cursorY,
}) => {
    // Hooks are now at the top level
    const event = events.find(e => e.id === draggingId);
    const durationMinutes = event ? (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000 : 60;

    const ghostX = useTransform(cursorX, v => v - (dragState?.initialWidth ? dragState.initialWidth / 2 : 100));
    const ghostY = useTransform(cursorY, v => v - (durationMinutes / 2));

    if (!draggingId || !dragState) {
        return null;
    }

    const theme = getEventTheme(event);

    return (
        <motion.div
            className="fixed top-0 left-0 pointer-events-none z-[200] rounded-xl shadow-2xl"
            style={{
                x: ghostX,
                y: ghostY,
                width: dragState.initialWidth,
                height: durationMinutes,
                display: 'block',
                backgroundColor: theme.bg,
                color: theme.text,
                borderLeft: `4px solid ${theme.border}`
            }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.1 }}
        >
            <div className="p-2 overflow-hidden">
                <p className="font-bold text-sm truncate">{event.title}</p>
                <p className="text-xs">{format(new Date(event.start), "HH:mm")}</p>
            </div>
        </motion.div>
    );
};
