"use client";

import { Check, Calendar as CalendarIcon, MessageSquare, Bell, TrendingUp, Sparkles, Loader2, FileText, ExternalLink, Calendar, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import MiniCalendar from '../../Calendar/MiniCalendar';
import { useIslandStore, IslandView } from './useIslandStore';
import { format, isSameDay } from 'date-fns';

// ─── Boot Sequence Views ──────────────────────────────────────────────────────

function WelcomeView({ payload }: { payload?: Record<string, any> }) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const name = payload?.userName ? `, ${payload.userName}` : '';
    const eventCount: number = payload?.eventCount ?? 0;
    const taskCount: number = payload?.taskCount ?? 0;

    const buildSummary = () => {
        const parts: string[] = [];
        if (eventCount > 0) parts.push(`${eventCount} event${eventCount !== 1 ? 's' : ''}`);
        if (taskCount > 0) parts.push(`${taskCount} task${taskCount !== 1 ? 's' : ''}`);
        if (parts.length === 0) return "Your schedule is clear. Enjoy your day.";
        return `You have ${parts.join(' and ')} today. Let's get to work.`;
    };

    return (
        <div className="flex flex-col gap-3 select-none">
            {/* Greeting row */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[1rem] bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center shadow-md flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                    </svg>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
                    <div className="text-[17px] font-black text-gray-900 leading-tight tracking-tight">
                        {greeting}{name}.
                    </div>
                </div>
            </div>

            {/* Summary line */}
            <div className="pl-1">
                <p className="text-[13px] text-gray-500 leading-snug font-medium">
                    {buildSummary()}
                </p>
            </div>

            {/* Quick stats row */}
            {(eventCount > 0 || taskCount > 0) && (
                <div className="flex gap-2">
                    {eventCount > 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 rounded-xl border border-indigo-100">
                            <CalendarIcon size={12} className="text-indigo-500" />
                            <span className="text-[12px] text-indigo-700 font-bold">{eventCount} event{eventCount !== 1 ? 's' : ''}</span>
                        </div>
                    )}
                    {taskCount > 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 rounded-xl border border-violet-100">
                            <Check size={12} className="text-violet-500" />
                            <span className="text-[12px] text-violet-700 font-bold">{taskCount} task{taskCount !== 1 ? 's' : ''}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function TimelineView({ payload }: { payload?: Record<string, any> }) {
    const events: Array<{ title: string; start: string }> = payload?.events ?? [];
    const now = new Date();

    if (events.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-2 py-4 text-gray-400 select-none">
                <CalendarIcon size={22} className="opacity-40" />
                <span className="text-xs font-semibold">Nothing on your schedule today</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2 select-none">
            {/* Header */}
            <div className="flex items-center gap-2 mb-1">
                <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-1.5">
                    <CalendarIcon size={11} /> Today's Schedule
                </div>
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-[10px] text-gray-400 font-medium">{format(now, 'MMM d')}</span>
            </div>

            {/* Event Cards with Vertical connecting line */}
            <div className="relative flex flex-col gap-3 mt-1.5 pl-2">
                {/* The vertical line spanning the timeline */}
                <div className="absolute top-2 bottom-2 left-[11px] w-[2px] bg-gray-100 rounded-full" />

                {events.map((ev, i) => {
                    const start = new Date(ev.start);
                    const isPast = start < now;
                    const isNow = !isPast && (start.getTime() - now.getTime()) < 30 * 60 * 1000;

                    return (
                        <div key={i} className="relative z-10 flex items-start gap-3">
                            {/* Dot on the timeline */}
                            <div className="mt-2.5 relative flex items-center justify-center shrink-0">
                                <div className={`w-[6px] h-[6px] rounded-full z-10 ring-4 ring-white ${isPast ? 'bg-gray-300' : isNow ? 'bg-indigo-500 animate-pulse' : 'bg-indigo-300'}`} />
                            </div>

                            <div
                                className={`
                                    flex-1 relative flex flex-col gap-0.5 p-3 rounded-2xl border transition-all
                                    ${isPast
                                        ? 'bg-gray-50 border-gray-100'
                                        : isNow
                                            ? 'bg-indigo-500 border-indigo-400 shadow-md shadow-indigo-200'
                                            : 'bg-white border-gray-200 shadow-sm'
                                    }
                                `}
                            >
                                {isNow && (
                                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                        <span className="text-[9px] text-white/80 font-bold uppercase tracking-wider">Now</span>
                                    </div>
                                )}
                                <div className={`text-[10px] font-bold uppercase tracking-wider ${isPast ? 'text-gray-400' : isNow ? 'text-indigo-100' : 'text-indigo-500'}`}>
                                    {format(start, 'HH:mm')}
                                </div>
                                <div className={`text-[13px] font-black leading-tight ${isPast ? 'text-gray-400 line-through' : isNow ? 'text-white' : 'text-gray-800'}`}>
                                    {ev.title}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function NextEventView({ payload }: { payload?: Record<string, any> }) {
    const event = payload?.event;
    if (!event) {
        return (
            <div className="flex flex-col items-center justify-center gap-2 py-2 text-gray-400 select-none">
                <span className="text-xs font-medium">No upcoming events</span>
            </div>
        );
    }

    const start = new Date(event.start);
    const now = new Date();
    const diffMs = start.getTime() - now.getTime();
    const diffMins = Math.round(diffMs / 60000);
    const timeLabel =
        diffMins < 1 ? 'Starting now' :
            diffMins < 60 ? `In ${diffMins} min` :
                `In ${Math.round(diffMins / 60)}h`;

    return (
        <div className="flex flex-col gap-2.5 select-none">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Next Up</div>
            <div className="flex flex-col gap-1 p-3 bg-gradient-to-br from-violet-50 to-purple-50 rounded-2xl border border-violet-100">
                <div className="text-sm font-black text-gray-900 leading-tight truncate">{event.title}</div>
                <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                        <span className="text-[10px] text-violet-600 font-bold">{timeLabel}</span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-medium">{format(start, 'HH:mm')}</span>
                </div>
            </div>
        </div>
    );
}

// ─── Message View ─────────────────────────────────────────────────────────────

const MessageView = ({ payload }: { payload: any }) => {
    const senderName =
        payload?.senderName ||
        payload?.sender?.name ||
        payload?.author?.name ||
        payload?.user_name ||
        payload?.username ||
        'Unknown User';

    return (
        <div className="flex flex-col gap-1.5 px-1">
            <div className="flex items-start gap-2.5 pt-1">
                <div className="w-9 h-9 mt-0.5 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                    <span className="text-white text-sm font-black">{senderName.charAt(0).toUpperCase()}</span>
                </div>
                <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-black text-gray-900 leading-tight">
                        {senderName}
                    </div>
                    <div className="text-[11px] text-gray-500 font-medium mb-1">New message</div>
                    {payload?.text && (
                        <div className="text-[14px] text-gray-800 leading-snug break-words whitespace-pre-wrap font-medium">
                            {payload.text}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const UploadProgressView = ({ payload }: { payload: any }) => (
    <div className="flex flex-col items-center justify-center gap-4 py-8 px-4 w-[16rem]">
        <div className="relative flex items-center justify-center">
            {/* Pulsing ring */}
            <div className="absolute inset-0 rounded-full bg-indigo-200 animate-ping opacity-75" style={{ animationDuration: '2s' }} />
            <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-300">
                <Loader2 size={28} className="text-white animate-spin" />
            </div>
        </div>
        <div className="text-center mt-2">
            <div className="text-[18px] font-black text-gray-900 leading-tight tracking-wide">
                Sending...
            </div>
            <div className="text-[13px] text-gray-500 truncate max-w-[200px] mt-1 font-medium">
                {payload?.fileName || 'Data packet'}
            </div>
        </div>
    </div>
);

const InteractiveCardView = ({ payload }: { payload: any }) => {
    const isEvent = payload?.fileType === 'event';
    return (
        <div className="flex flex-col gap-3 px-3 py-2 w-[18rem]">
            <div className="flex items-center gap-2 mb-1">
                <div className={`w-2.5 h-2.5 rounded-full ${isEvent ? 'bg-amber-500 animate-pulse' : 'bg-blue-500 animate-pulse'}`} />
                <div className="text-[12px] font-bold uppercase tracking-wider text-gray-500">
                    {isEvent ? 'Event Received' : 'File Received'}
                </div>
            </div>

            <div className={`p-4 rounded-2xl border ${isEvent ? 'bg-amber-500 border-amber-400 text-white shadow-md shadow-amber-200' : 'bg-indigo-500 border-indigo-400 text-white shadow-md shadow-indigo-200'}`}>
                <div className="text-[18px] font-black leading-tight mb-2 text-white">
                    {payload?.fileName || 'Untitled'}
                </div>
                <div className="flex flex-col gap-1">
                    <div className={`text-[13px] font-semibold flex items-center gap-1.5 ${isEvent ? 'text-amber-100' : 'text-indigo-100'}`}>
                        {isEvent ? <CalendarIcon size={14} /> : <FileText size={14} />}
                        Shared by {payload?.senderName || 'Contact'}
                    </div>
                </div>
            </div>

            <button
                onClick={(e) => {
                    e.stopPropagation();
                    if (payload?.onAction) payload.onAction();
                }}
                className="w-full py-2.5 mt-1 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98] bg-gray-900 hover:bg-black text-white"
            >
                {isEvent ? (
                    <>
                        <Plus size={16} /> Add to Calendar
                    </>
                ) : (
                    <>
                        <ExternalLink size={16} /> Open File
                    </>
                )}
            </button>
        </div>
    );
};

// ─── Smart Island ─────────────────────────────────────────────────────────────

interface SmartIslandProps {
    selectedDate?: Date;
    onSelect?: (date: Date) => void;
    userName?: string;
}

const EventPreviewView = ({ payload }: { payload: any }) => {
    const event = payload?.event;
    if (!event) return null;

    const start = new Date(event.start);
    const end = new Date(event.end);
    const now = new Date();

    const diffStartMs = start.getTime() - now.getTime();
    const diffEndMs = end.getTime() - now.getTime();
    const durationMins = Math.round((end.getTime() - start.getTime()) / 60000);

    const isPast = end < now;
    const isNow = start <= now && end >= now;

    let timeLabel = '';
    if (isNow) {
        const remainingMins = Math.round(diffEndMs / 60000);
        timeLabel = `Ends in ${remainingMins} min (${durationMins}m total)`;
    } else if (isPast) {
        const agoMins = Math.round(Math.abs(diffEndMs) / 60000);
        if (agoMins < 60) timeLabel = `Ended ${agoMins} min ago`;
        else if (agoMins < 1440) timeLabel = `Ended ${Math.round(agoMins / 60)}h ago`;
        else timeLabel = `Ended ${Math.round(agoMins / 1440)}d ago`;
    } else {
        const inMins = Math.round(diffStartMs / 60000);
        if (inMins < 60) timeLabel = `Starts in ${inMins} min (${durationMins}m total)`;
        else if (inMins < 1440) timeLabel = `Starts in ${Math.round(inMins / 60)}h (${durationMins}m total)`;
        else timeLabel = `Starts in ${Math.round(inMins / 1440)}d`;
    }

    return (
        <div className="flex flex-col gap-3 px-3 py-2 w-[18rem]">
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${isPast ? 'bg-gray-400' : isNow ? 'bg-indigo-500 animate-pulse' : 'bg-blue-500'}`} />
                    <div className="text-[12px] font-bold uppercase tracking-wider text-gray-500">
                        {isPast ? 'Past Event' : isNow ? 'Current Event' : 'Upcoming Event'}
                    </div>
                </div>
            </div>

            <div className={`p-4 rounded-2xl border ${isPast ? 'bg-gray-50 border-gray-100' : isNow ? 'bg-indigo-500 border-indigo-400 text-white shadow-md shadow-indigo-200' : 'bg-white border-gray-200 shadow-sm'}`}>
                <div className={`text-[18px] font-black leading-tight mb-2 ${isPast ? 'text-gray-400 line-through' : isNow ? 'text-white' : 'text-gray-900'}`}>
                    {event.title || 'Untitled Event'}
                </div>
                <div className="flex flex-col gap-1">
                    <div className={`text-[13px] font-semibold flex items-center gap-1.5 ${isPast ? 'text-gray-400' : isNow ? 'text-indigo-100' : 'text-indigo-600'}`}>
                        <Calendar size={14} />
                        {format(start, 'HH:mm')} - {format(end, 'HH:mm')}
                    </div>
                    <div className={`text-[12px] font-medium flex items-center gap-1.5 ${isPast ? 'text-gray-400' : isNow ? 'text-indigo-200' : 'text-gray-500'}`}>
                        {timeLabel}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default function SmartIsland({ selectedDate, onSelect, userName }: SmartIslandProps) {
    const { state, toggleDevMode } = useIslandStore();

    const sizeClass = state.current?.type === 'timeline'
        ? 'p-5 rounded-[2.5rem] w-[20rem]'
        : state.current?.type === 'interactive_card'
            ? 'p-5 rounded-[2rem] w-[22rem]'
            : state.current?.type === 'welcome' || state.current?.type === 'morning' || state.current?.type === 'event_preview'
                ? 'p-5 rounded-[2rem] w-[20rem]'
                : state.current?.type === 'message'
                    ? 'p-4 rounded-[1.75rem] w-[18rem]'
                    : 'p-4 rounded-[1.75rem] w-[17.5rem]';

    return (
        <div className="select-none relative z-[100]">
            {/* Dev Mode Toggle */}
            <button
                onClick={(e) => { e.stopPropagation(); toggleDevMode(); }}
                className={`absolute -top-3 -right-3 z-50 w-6 h-6 rounded-full flex items-center justify-center transition-all ${state.devMode ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/50' : 'bg-gray-200/50 text-gray-400 hover:bg-gray-200'}`}
                title="Toggle Infinite Queue (Dev Mode)"
            >
                <TrendingUp size={12} />
            </button>

            {/* The Morphing Liquid Glass Shell */}
            <motion.div
                layout
                initial={false}
                transition={{
                    type: "spring",
                    stiffness: 250,
                    damping: 30,
                    mass: 0.9
                }}
                className={`liquidGlass-wrapper text-gray-800 ${sizeClass}`}
            >
                {/* Layer 1: Distortion blur */}
                <div className="liquidGlass-effect" />
                {/* Layer 2: Tint */}
                <div className="liquidGlass-tint" />
                {/* Layer 3: Inner shine */}
                <div className="liquidGlass-shine" />
                {/* Layer 4: Content */}
                <div className="liquidGlass-text w-full">
                    <AnimatePresence mode="popLayout" initial={false}>
                        {!state.current ? (
                            <motion.div
                                key="default-calendar"
                                initial={{ opacity: 0, scale: 0.96 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.96 }}
                                transition={{ duration: 0.2 }}
                                layout="position"
                            >
                                <MiniCalendar
                                    selectedDate={selectedDate}
                                    onSelect={(date) => {
                                        onSelect?.(date);
                                    }}
                                />
                            </motion.div>
                        ) : (
                            <motion.div
                                key={state.current.id}
                                initial={{ opacity: 0, y: 15, filter: 'blur(8px)' }}
                                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                exit={{ opacity: 0, y: -15, filter: 'blur(8px)' }}
                                transition={{
                                    type: "spring",
                                    stiffness: 300,
                                    damping: 30
                                }}
                                layout="position"
                            >
                                {state.current.type === 'welcome' && <WelcomeView payload={state.current.payload} />}
                                {state.current.type === 'morning' && <WelcomeView payload={{ ...(state.current.payload ?? {}), userName }} />}
                                {state.current.type === 'timeline' && <TimelineView payload={state.current.payload} />}
                                {state.current.type === 'next_event' && <NextEventView payload={state.current.payload} />}
                                {state.current.type === 'message' && <MessageView payload={state.current.payload} />}
                                {state.current?.type === 'upload_progress' && <UploadProgressView payload={state.current.payload} />}
                                {state.current?.type === 'event_preview' && <EventPreviewView payload={state.current.payload} />}
                                {state.current?.type === 'interactive_card' && <InteractiveCardView payload={state.current.payload} />}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
}
