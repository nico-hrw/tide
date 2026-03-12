import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, MotionValue, useTransform, useVelocity, useSpring } from 'framer-motion';

interface CalendarEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    color?: string;
    effect?: string;
}

interface MagnifiedEventViewProps {
    isActive: boolean;
    event: CalendarEvent | null;
    cursorY: MotionValue<number>;
    cursorX: MotionValue<number>;
    durationMinutes: number;
    startMinutes: number;
    activeMinute: number;
    actionType: 'move' | 'resize' | 'create' | null;
    theme: { bg: string; text: string; border: string };
    dropBounds?: DOMRect | null;
}

const PIXELS_PER_MINUTE = 6;

const Ruler = ({ activeMinute, cursorY }: { activeMinute: number, cursorY: MotionValue<number> }) => {
    // Generate lines around the active minute
    const lines = [];

    // Smooth scroll offset to counter the snapping of activeMinute
    const yOffset = useTransform(cursorY, (y) => -(y % PIXELS_PER_MINUTE));

    // We only need enough lines to cover the 224px height scaled by 1.3 (so roughly 291px height internal). 
    // 291 / 6 = 48 minutes visible. ±30 mins is plenty.
    for (let m = activeMinute - 30; m <= activeMinute + 30; m++) {
        if (m < 0 || m > 1440) continue;

        const h = Math.floor(m / 60);
        const mins = m % 60;
        const isCurrent = m === activeMinute;
        const isFive = mins % 5 === 0;

        // activeMinute maps perfectly to center of Loupe (y = 65)
        const yPos = 65 + (m - activeMinute) * PIXELS_PER_MINUTE;

        lines.push(
            <div key={m} className="absolute left-7 right-0 flex items-center gap-2" style={{ top: yPos - 10, height: 20 }}>
                <span className={`text-[12px] w-9 text-right font-bold tracking-tighter ${isCurrent ? 'opacity-100 text-blue-600 dark:text-blue-400 text-[13px] drop-shadow-sm' : isFive ? 'opacity-90 text-gray-800 dark:text-gray-200' : 'opacity-40 text-gray-600'
                    }`}>
                    {isCurrent || isFive ? `${h.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}` : ''}
                </span>

                <div className={`h-[2px] rounded-full bg-gray-400 dark:bg-gray-500 ${isCurrent ? 'w-6 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]' : mins % 15 === 0 ? 'w-4' : isFive ? 'w-2' : 'w-1 opacity-50'}`}></div>

                {isCurrent && (
                    <div className="absolute left-10 right-[-300px] h-[1.5px] pointer-events-none z-0" style={{ background: 'rgba(59,130,246,0.9)', boxShadow: '0 0 8px rgba(59,130,246,0.6)' }}></div>
                )}
            </div>
        );
    }

    return (
        <motion.div style={{ y: yOffset, width: 88, flexShrink: 0, height: '100%', borderRight: '1px solid rgba(0,0,0,0.08)', position: 'relative', overflow: 'hidden', background: 'rgba(255,255,255,0.97)', pointerEvents: 'none' }}>
            {lines}
        </motion.div>
    );
};

export const MagnifiedEventView = ({
    isActive,
    event,
    cursorY,
    cursorX,
    durationMinutes,
    startMinutes,
    activeMinute,
    actionType,
    theme,
    dropBounds
}: MagnifiedEventViewProps) => {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    // Center the 340x130 Loupe exactly on the cursor
    const xBase = useTransform(cursorX, x => x - 170);
    const yBase = useTransform(cursorY, y => y - 65);

    // Elastic Rubber-Banding
    const yVelocity = useVelocity(cursorY);
    const rawScaleY = useTransform(yVelocity, [-1000, 0, 1000], [0.9, 1.0, 1.1]);
    const springScaleY = useSpring(rawScaleY, { stiffness: 400, damping: 30 });

    // Determine transform origin based on action (where is it anchored?)
    // If dragging top edge (not supported yet, but conceptually): origin is bottom
    // If resizing bottom edge: origin is top
    // If moving block: origin is center
    const originY = actionType === 'resize' ? '0%' : '50%';

    if (!mounted || !event) return null;

    return createPortal(
        <AnimatePresence>
            {isActive && (
                <motion.div
                    initial={{
                        opacity: 0,
                        scale: 0.8,
                    }}
                    animate={{
                        opacity: 1,
                        scale: 1,
                    }}
                    style={{
                        position: 'fixed',
                        left: 0,
                        top: 0,
                        x: xBase,
                        y: yBase,
                        width: 340,
                        height: 130,
                        borderRadius: '40px',
                        boxShadow: '0 8px 48px rgba(0,0,0,0.22), 0 2px 12px rgba(0,0,0,0.12), inset 0 0 0 1px rgba(255,255,255,0.5)'
                    }}
                    exit={{
                        opacity: 0,
                        scale: 1,
                        x: dropBounds ? dropBounds.left : xBase.get(),
                        y: dropBounds ? dropBounds.top : yBase.get(),
                        width: dropBounds ? dropBounds.width : 340,
                        height: dropBounds ? dropBounds.height : 130,
                        transition: { duration: 0.3, type: "spring", bounce: 0 }
                    }}
                    className="z-[999] pointer-events-none overflow-hidden border border-white/60 bg-white/15 dark:bg-black/15 backdrop-blur-3xl backdrop-saturate-200 will-change-transform"
                >
                    {/* The Scale Distortion Mask */}
                    <div className="absolute inset-0 flex pointer-events-none" style={{ transform: 'scale(1.15)', transformOrigin: 'center center' }}>
                        <Ruler activeMinute={activeMinute} cursorY={cursorY} />

                        {/* Event Space with Rubber Banding */}
                        <motion.div
                            className="flex-1 relative h-full bg-grid-slate-100 dark:bg-grid-slate-900/[0.04]"
                            style={{
                                scaleY: springScaleY,
                                transformOrigin: `50% ${originY}`
                            }}
                        >
                            <div
                                className="absolute left-2 right-4 rounded-xl pl-3 pr-2 py-2 flex flex-col shadow-xl overflow-hidden border border-white/60 dark:border-white/20"
                                style={{
                                    top: 65 + (startMinutes - activeMinute) * PIXELS_PER_MINUTE,
                                    height: Math.max(30, durationMinutes * PIXELS_PER_MINUTE), // min 30px height visually
                                    backgroundColor: theme.bg,
                                    color: theme.text,
                                    borderLeft: `6px solid ${theme.border}`,
                                }}
                            >
                                <div className="text-[15px] font-black tracking-tight leading-tight w-full" style={{ wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                    {event.title || 'Untitled Event'}
                                </div>
                                <div className="text-[13px] font-bold opacity-90 mt-0.5 truncate drop-shadow-sm">
                                    {Math.floor(startMinutes / 60).toString().padStart(2, '0')}:{Math.floor(startMinutes % 60).toString().padStart(2, '0')}
                                    {' - '}
                                    {Math.floor((startMinutes + durationMinutes) / 60).toString().padStart(2, '0')}:{Math.floor((startMinutes + durationMinutes) % 60).toString().padStart(2, '0')}
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
};
