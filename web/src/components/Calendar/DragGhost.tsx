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
    // Handle recurrence instances like 'eventId_1234567890'
    const event = events.find(e => e.id === draggingId || (draggingId && draggingId.startsWith(e.id + '_')));
    const durationMinutes = event ? (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000 : 60;

    const ghostX = useTransform(cursorX, v => v - (dragState?.initialWidth ? dragState.initialWidth / 2 : 100));
    const ghostY = useTransform(cursorY, v => v - (durationMinutes / 2));

    if (!draggingId || !dragState || !event) {
        return null;
    }

    const theme = getEventTheme(event);

    return (
        <motion.div
            className="fixed top-0 left-0 pointer-events-none z-[200] rounded-xl shadow-2xl overflow-hidden"
            style={{
                x: ghostX,
                y: ghostY,
                width: dragState.initialWidth,
                height: durationMinutes,
                display: 'block',
                backgroundColor: (event as any).color || theme.bg,
                color: theme.text,
                borderLeft: `4px solid ${theme.border}`
            }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.1 }}
        >
            {/* Effect Overlay */}
            {event.effect && (
                <div className={`absolute inset-0 pointer-events-none effect-${event.effect}`} style={{ mixBlendMode: 'overlay' }} />
            )}
            
            <div className="relative z-10 p-2 overflow-hidden flex flex-col h-full">
                <p className="font-bold text-[11px] truncate leading-tight">{event.title}</p>
                {(event as any).description && durationMinutes > 40 && (
                    <p className="text-[10px] opacity-80 truncate mt-0.5">{ (event as any).description }</p>
                )}
                <p className="text-[10px] font-bold mt-auto">{format(new Date(event.start), "HH:mm")}</p>
            </div>
        </motion.div>
    );
};
