"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Check, Calendar as CalendarIcon, MessageSquare, Bell, TrendingUp, Sparkles, Loader2, FileText, ExternalLink, Calendar, Plus, Clock, Link2, GripVertical, FileEdit, AlarmClock, X, CheckCircle2, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import MiniCalendar from '../../Calendar/MiniCalendar';
import { useIslandStore, IslandView } from './useIslandStore';
import { useDataStore } from '@/store/useDataStore';
import { format, isSameDay } from 'date-fns';
import { de } from 'date-fns/locale';
import WeekStrip from './WeekStrip';
import DailySummaryView from './DailySummaryView';
import { searchHolidays } from '@/lib/holidays';

// ─── Boot Sequence Views ──────────────────────────────────────────────────────

function WelcomeView({ payload }: { payload?: Record<string, any> }) {
    const { setDailySummaryMode } = useIslandStore();
    const storeEvents = useDataStore(s => s.events) || [];
    
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Guten Morgen' : hour < 17 ? 'Guten Tag' : hour < 22 ? 'Guten Abend' : 'Gute Nacht';
    const name = payload?.userName ? `, ${payload.userName}` : '';
    
    // Get next 1-2 events today
    const upcomingEvents = useMemo(() => {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const now = new Date();
        return storeEvents
            .filter((e: any) => {
                try {
                    const start = new Date(e.start);
                    return e.start.startsWith(todayStr) && start >= now;
                } catch { return false; }
            })
            .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
            .slice(0, 2);
    }, [storeEvents]);

    return (
        <div className="flex flex-col gap-4 select-none text-zinc-100 w-full">
            {/* Greeting row */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[1rem] bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center shadow-md flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                    </svg>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                        {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </div>
                    <div className="text-[17px] font-black text-white leading-tight tracking-tight">
                        {greeting}{name}.
                    </div>
                </div>
            </div>

            {/* Weekstrip Calendar */}
            <WeekStrip />

            {/* Next Events */}
            <div className="flex flex-col gap-2">
                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Nächste Termine</div>
                {upcomingEvents.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                        {upcomingEvents.map((ev, i) => (
                            <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/5 text-xs text-zinc-200">
                                <span className="font-bold truncate max-w-[12rem]">{ev.title}</span>
                                <span className="text-zinc-400 font-semibold">{format(new Date(ev.start), 'HH:mm')} Uhr</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-[12px] text-zinc-400 font-medium">Keine anstehenden Termine für heute.</p>
                )}
            </div>
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
                <div className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                    <CalendarIcon size={11} /> Today's Schedule
                </div>
                <div className="flex-1 h-px bg-gray-100 dark:bg-white/10" />
                <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">{format(now, 'MMM d')}</span>
            </div>

            {/* Event Cards with Vertical connecting line */}
            <div className="relative flex flex-col gap-3 mt-1.5 pl-2">
                {/* The vertical line spanning the timeline */}
                <div className="absolute top-2 bottom-2 left-[11px] w-[2px] bg-gray-100 dark:bg-white/10 rounded-full" />

                {events.map((ev, i) => {
                    const start = new Date(ev.start);
                    const isPast = start < now;
                    const isNow = !isPast && (start.getTime() - now.getTime()) < 30 * 60 * 1000;

                    return (
                        <div key={i} className="relative z-10 flex items-start gap-3">
                            {/* Dot on the timeline */}
                            <div className="mt-2.5 relative flex items-center justify-center shrink-0">
                                <div className={`w-[6px] h-[6px] rounded-full z-10 ring-4 ring-white dark:ring-[#1E293B] ${isPast ? 'bg-gray-300 dark:bg-gray-600' : isNow ? 'bg-indigo-500 animate-pulse' : 'bg-indigo-300 dark:bg-indigo-600'}`} />
                            </div>

                            <div
                                className={`
                                    flex-1 relative flex flex-col gap-0.5 p-3 rounded-2xl border transition-all
                                    ${isPast
                                        ? 'bg-gray-50 dark:bg-white/5 border-gray-100 dark:border-white/5'
                                        : isNow
                                            ? 'bg-indigo-500 border-indigo-400 shadow-md shadow-indigo-200 dark:shadow-indigo-900/50'
                                            : 'bg-white dark:bg-white/10 border-gray-200 dark:border-white/10 shadow-sm'
                                    }
                                `}
                            >
                                {isNow && (
                                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                        <span className="text-[9px] text-white/80 font-bold uppercase tracking-wider">Now</span>
                                    </div>
                                )}
                                <div className={`text-[10px] font-bold uppercase tracking-wider ${isPast ? 'text-gray-400 dark:text-gray-600' : isNow ? 'text-indigo-100' : 'text-indigo-500 dark:text-indigo-400'}`}>
                                    {format(start, 'HH:mm')}
                                </div>
                                <div className={`text-[13px] font-black leading-tight ${isPast ? 'text-gray-400 dark:text-gray-600 line-through' : isNow ? 'text-white' : 'text-gray-800 dark:text-gray-100'}`}>
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
            <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Next Up</div>
            <div className="flex flex-col gap-1 p-3 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 rounded-2xl border border-violet-100 dark:border-violet-800/50">
                <div className="text-sm font-black text-gray-900 dark:text-gray-100 leading-tight truncate">{event.title}</div>
                <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                        <span className="text-[10px] text-violet-600 dark:text-violet-400 font-bold">{timeLabel}</span>
                    </div>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">{format(start, 'HH:mm')}</span>
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
                    <div className="text-[14px] font-black text-gray-900 dark:text-gray-100 leading-tight">
                        {senderName}
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 font-medium mb-1">New message</div>
                    {payload?.text && (
                        <div className="text-[14px] text-gray-800 dark:text-gray-300 leading-snug break-words whitespace-pre-wrap font-medium">
                            {payload.text}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const UploadProgressView = ({ payload }: { payload: any }) => (
    <div className="flex flex-col items-center justify-center gap-4 py-8 px-4 w-full">
        <div className="relative flex items-center justify-center">
            {/* Pulsing ring */}
            <div className="absolute inset-0 rounded-full bg-indigo-200 animate-ping opacity-75" style={{ animationDuration: '2s' }} />
            <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-300">
                <Loader2 size={28} className="text-white animate-spin" />
            </div>
        </div>
        <div className="text-center mt-2">
            <div className="text-[18px] font-black text-gray-900 dark:text-gray-100 leading-tight tracking-wide">
                Sending...
            </div>
            <div className="text-[13px] text-gray-500 dark:text-gray-400 truncate max-w-[200px] mt-1 font-medium">
                {payload?.fileName || 'Data packet'}
            </div>
        </div>
    </div>
);

const InteractiveCardView = ({ payload }: { payload: any }) => {
    const isEvent = payload?.fileType === 'event';
    return (
        <div className="flex flex-col gap-3 px-3 py-2 w-full">
            <div className="flex items-center gap-2 mb-1">
                <div className={`w-2.5 h-2.5 rounded-full ${isEvent ? 'bg-amber-500 animate-pulse' : 'bg-blue-500 animate-pulse'}`} />
                <div className="text-[12px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
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
                className="w-full py-2.5 mt-1 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98] bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-black dark:hover:bg-gray-100"
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
        <div className="flex flex-col gap-3 px-3 py-2 w-full">
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${event.is_cancelled ? 'bg-gray-300 dark:bg-gray-600' : isPast ? 'bg-gray-400 dark:bg-gray-500' : isNow ? 'bg-indigo-500 animate-pulse' : 'bg-blue-500'}`} />
                    <div className="text-[12px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {event.is_cancelled ? 'Cancelled' : isPast ? 'Past Event' : isNow ? 'Current Event' : 'Upcoming Event'}
                    </div>
                </div>
            </div>

            <div className={`p-4 rounded-2xl border ${isPast ? 'bg-gray-50 dark:bg-white/5 border-gray-100 dark:border-white/5' : isNow ? 'bg-indigo-500 border-indigo-400 text-white shadow-md shadow-indigo-200 dark:shadow-indigo-900/50' : 'bg-white dark:bg-white/10 border-gray-200 dark:border-white/10 shadow-sm'}`}>
                <div className={`text-[18px] font-black leading-tight mb-2 ${event.is_cancelled || isPast ? 'text-gray-400 dark:text-gray-600 line-through' : isNow ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
                    {event.title || 'Untitled Event'}
                </div>
                <div className="flex flex-col gap-1">
                    <div className={`text-[13px] font-semibold flex items-center gap-1.5 ${isPast ? 'text-gray-400 dark:text-gray-600' : isNow ? 'text-indigo-100' : 'text-indigo-600 dark:text-indigo-400'}`}>
                        <Calendar size={14} />
                        {format(start, 'HH:mm')} - {format(end, 'HH:mm')}
                    </div>
                    <div className={`text-[12px] font-medium flex items-center gap-1.5 ${isPast ? 'text-gray-400 dark:text-gray-600' : isNow ? 'text-indigo-200' : 'text-gray-500 dark:text-gray-400'}`}>
                        {timeLabel}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Reminder View (10 min before event) ───────────────────────────────────

const URL_REGEX = /https?:\/\/[^\s)"'>]+/gi;

const ReminderView = ({ payload }: { payload: any }) => {
    const event = payload?.event;
    if (!event) return null;

    const start = new Date(event.start);
    const now = new Date();
    const minsUntil = Math.max(0, Math.round((start.getTime() - now.getTime()) / 60000));
    const description: string = event.description || '';

    // Extract links from description
    const links = description.match(URL_REGEX) || [];

    // Build description with clickable links
    const renderDescription = () => {
        if (!description) return null;
        const parts: React.ReactNode[] = [];
        let lastIdx = 0;
        const matches = [...description.matchAll(URL_REGEX)];
        for (const m of matches) {
            const idx = m.index!;
            if (idx > lastIdx) parts.push(description.slice(lastIdx, idx));
            parts.push(
                <a
                    key={idx}
                    href={m[0]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5 font-medium"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Link2 size={10} className="shrink-0" />
                    {m[0].replace(/^https?:\/\//, '').slice(0, 30)}{m[0].length > 30 + 8 ? '…' : ''}
                </a>
            );
            lastIdx = idx + m[0].length;
        }
        if (lastIdx < description.length) parts.push(description.slice(lastIdx));
        return parts;
    };

    return (
        <div className="flex flex-col gap-3 px-4 py-3 w-full select-none">
            {/* Header */}
            <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
                    <AlarmClock size={16} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">Gleich geht's los</div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                        {minsUntil <= 1 ? 'Jetzt' : `In ${minsUntil} Minuten`} · {format(start, 'HH:mm')}
                    </div>
                </div>
            </div>

            {/* Event title */}
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40">
                <div className="text-[14px] font-black text-gray-900 dark:text-gray-100 leading-tight">
                    {event.title || 'Termin'}
                </div>
                {description && (
                    <div className="text-[12px] text-gray-600 dark:text-gray-300 leading-relaxed mt-1.5 break-words whitespace-pre-wrap">
                        {renderDescription()}
                    </div>
                )}
            </div>

            {/* Quick links row if any */}
            {links.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {links.slice(0, 3).map((url, i) => (
                        <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800/40 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ExternalLink size={10} />
                            {(() => { try { return new URL(url).hostname.replace('www.', ''); } catch { return 'Link'; } })()}
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
};

// ─── Text Collector View (Sammelbecken) ─────────────────────────────────────

import { parseGermanDate } from '@/lib/dateParser';

const TextCollectorView = ({ payload }: { payload: any }) => {
    const [liveText, setLiveText] = useState<string>(payload?.text || '');
    const onCreateNote = payload?.onCreateNote;
    const onCreateEvent = payload?.onCreateEvent;
    const onDismiss = payload?.onDismiss;

    const storeNotes = useDataStore(s => s.notes) || [];
    const storeEvents = useDataStore(s => s.events) || [];

    // Inline event suggestion state
    const [eventDismissed, setEventDismissed] = useState(false);
    const [eventEditing, setEventEditing] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editDate, setEditDate] = useState<Date | null>(null);
    const [editStart, setEditStart] = useState<Date | null>(null);
    const [editEnd, setEditEnd] = useState<Date | null>(null);
    const titleInputRef = useRef<HTMLInputElement>(null);

    // Listen for real-time text updates from the passive keyboard listener
    useEffect(() => {
        const handler = (e: Event) => {
            const text = (e as CustomEvent).detail?.text;
            if (typeof text === 'string') {
                setLiveText(text);
                setEventDismissed(false); // Reset dismiss state on new input
            }
        };
        window.addEventListener('tide:collector-update', handler);
        return () => window.removeEventListener('tide:collector-update', handler);
    }, []);

    // Also sync if payload.text changes
    useEffect(() => {
        if (payload?.text) {
            setLiveText(payload.text);
            setEventDismissed(false);
        }
    }, [payload?.text]);

    const displayText = liveText || '';

    // Run date detection on the live text
    const parseResult = useMemo(() => {
        if (displayText.trim().length < 4) return null;
        const results = parseGermanDate(displayText, new Date());
        return results.length > 0 ? results[0] : null;
    }, [displayText]);

    // Sync edit fields when parse result changes
    useEffect(() => {
        if (parseResult && !eventDismissed) {
            setEditTitle(parseResult.titleHint || 'Neuer Termin');
            setEditDate(parseResult.proposedDate);
            setEditStart(parseResult.proposedStart);
            setEditEnd(parseResult.proposedEnd);
        }
    }, [parseResult, eventDismissed]);

    const showEventSuggestion = parseResult && !eventDismissed;

    const handleAcceptEvent = () => {
        if (onCreateEvent && editStart && editEnd) {
            onCreateEvent({
                title: editTitle || 'Neuer Termin',
                start: editStart,
                end: editEnd,
            });
        }
    };

    const calendarHolidayPackage = useDataStore(s => s.calendarHolidayPackage) || 'DE';
    const calendarHolidaysEnabled = useDataStore(s => s.calendarHolidaysEnabled) ?? true;
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Compute search items: parsed date, matching holidays, notes, events
    const searchItems = useMemo(() => {
        if (!displayText.trim()) return [];
        const query = displayText.toLowerCase().trim();
        const items: Array<{ id: string; type: 'date' | 'holiday' | 'note' | 'event'; label: string; sublabel?: string; date?: Date; note?: any; event?: any }> = [];

        // 1. Check if query parses to a date (e.g. "1.6.", "Dienstag", "21. Juli")
        const parsedResults = parseGermanDate(displayText, new Date());
        if (parsedResults.length > 0 && parsedResults[0].proposedDate) {
            const d = parsedResults[0].proposedDate;
            items.push({
                id: `date-${d.toISOString()}`,
                type: 'date',
                label: format(d, 'EEEE, d. MMMM yyyy', { locale: de }),
                sublabel: 'Datum aufrufen',
                date: d
            });
        }

        // 2. Check public holidays
        if (calendarHolidaysEnabled) {
            const hResults = searchHolidays(query, new Date().getFullYear(), calendarHolidayPackage);
            hResults.slice(0, 2).forEach(h => {
                const hDate = new Date(h.date);
                items.push({
                    id: `holiday-${h.date}-${h.name}`,
                    type: 'holiday',
                    label: h.name,
                    sublabel: format(hDate, 'dd.MM.yyyy'),
                    date: hDate
                });
            });
        }

        // 3. Notes
        storeNotes
            .filter((n: any) => n.title && n.title.toLowerCase().includes(query) && !n.title.startsWith('.'))
            .slice(0, 3)
            .forEach((n: any) => {
                items.push({
                    id: `note-${n.id}`,
                    type: 'note',
                    label: n.title || 'Neue Notiz',
                    note: n
                });
            });

        // 4. Events
        storeEvents
            .filter((e: any) => e.title && e.title.toLowerCase().includes(query))
            .slice(0, 3)
            .forEach((e: any) => {
                items.push({
                    id: `event-${e.id}`,
                    type: 'event',
                    label: e.title,
                    sublabel: e.start ? `${format(new Date(e.start), 'dd. MMM HH:mm')} Uhr` : undefined,
                    event: e
                });
            });

        return items;
    }, [displayText, storeNotes, storeEvents, calendarHolidaysEnabled, calendarHolidayPackage]);

    useEffect(() => {
        setSelectedIndex(0);
    }, [searchItems.length, displayText]);

    const handleSelectDate = (date: Date) => {
        window.dispatchEvent(new CustomEvent('tide:select-event', { detail: { start: date.toISOString() } }));
        if (onDismiss) onDismiss();
    };

    const handleSelectNote = (note: any) => {
        window.dispatchEvent(new CustomEvent('tide:select-note', { detail: { id: note.id, title: note.title } }));
        if (onDismiss) onDismiss();
    };

    const handleSelectEvent = (event: any) => {
        window.dispatchEvent(new CustomEvent('tide:select-event', { detail: { id: event.id, start: event.start } }));
        if (onDismiss) onDismiss();
    };

    const handleSelectItem = (item: any) => {
        if (item.type === 'date' || item.type === 'holiday') {
            if (item.date) handleSelectDate(item.date);
        } else if (item.type === 'note') {
            handleSelectNote(item.note);
        } else if (item.type === 'event') {
            handleSelectEvent(item.event);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (searchItems.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev + 1) % searchItems.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev - 1 + searchItems.length) % searchItems.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (searchItems[selectedIndex]) {
                handleSelectItem(searchItems[selectedIndex]);
            }
        }
    };

    return (
        <div className="flex flex-col gap-3 px-3 py-3 w-full select-none text-zinc-100">
            {/* Search Input Box */}
            <div className="flex items-center gap-2 p-2 rounded-xl bg-white/5 border border-white/10 shadow-inner">
                <Search size={14} className="text-zinc-400 ml-1 flex-shrink-0" />
                <input
                    type="text"
                    value={liveText}
                    onChange={(e) => {
                        setLiveText(e.target.value);
                        setEventDismissed(false);
                        window.dispatchEvent(new CustomEvent('tide:collector-update', { detail: { text: e.target.value } }));
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Suchen oder tippen..."
                    className="flex-1 bg-transparent text-xs font-bold outline-none text-zinc-100 placeholder:text-zinc-500"
                    autoFocus
                />
                <button
                    onClick={() => onCreateNote && onCreateNote(liveText)}
                    className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-all active:scale-95 flex-shrink-0"
                    title="Notiz erstellen"
                >
                    <FileEdit size={13} />
                </button>
            </div>

            {/* Event Suggestion Card (Expanded box if date parsed) */}
            {showEventSuggestion && editStart && editEnd && editDate && (
                <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <CalendarIcon size={12} className="text-indigo-400" />
                            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Termin erkannt</span>
                        </div>
                        <button 
                            onClick={() => setEventDismissed(true)} 
                            className="text-zinc-500 hover:text-zinc-300 text-xs font-bold"
                        >
                            ✕
                        </button>
                    </div>

                    {eventEditing ? (
                        <input
                            ref={titleInputRef}
                            autoFocus
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') setEventEditing(false);
                                if (e.key === 'Escape') setEventEditing(false);
                            }}
                            className="w-full px-2 py-0.5 text-xs font-bold bg-white/5 border border-indigo-500/30 rounded-lg text-zinc-100 outline-none"
                        />
                    ) : (
                        <div 
                            onClick={() => setEventEditing(true)}
                            className="text-xs font-bold text-zinc-100 hover:underline cursor-pointer truncate"
                        >
                            {editTitle}
                        </div>
                    )}

                    <div className="flex flex-wrap gap-1 mt-0.5">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-500/15 text-[9px] font-bold text-indigo-300 border border-indigo-500/10">
                            <Calendar size={9} />
                            {format(editDate, 'EEE dd. MMM', { locale: de })}
                        </span>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-500/15 text-[9px] font-bold text-indigo-300 border border-indigo-500/10">
                            <Clock size={9} />
                            {format(editStart, 'HH:mm')} – {format(editEnd, 'HH:mm')}
                        </span>
                    </div>

                    <button
                        onClick={handleAcceptEvent}
                        className="w-full py-1.5 mt-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1 active:scale-95"
                    >
                        <Check size={11} strokeWidth={3} /> Termin erstellen
                    </button>
                </div>
            )}

            {/* Search Results */}
            <AnimatePresence>
                {displayText.trim().length > 0 && searchItems.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, height: 0, scale: 0.96 }}
                        animate={{ opacity: 1, height: 'auto', scale: 1 }}
                        exit={{ opacity: 0, height: 0, scale: 0.96 }}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                        className="flex flex-col gap-1.5 p-2 rounded-xl bg-zinc-900/60 border border-white/10 max-h-48 overflow-y-auto"
                    >
                        {searchItems.map((item, idx) => {
                            const isSelected = idx === selectedIndex;
                            return (
                                <div
                                    key={item.id}
                                    onClick={() => handleSelectItem(item)}
                                    className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer transition-all ${isSelected ? 'bg-indigo-600/40 border border-indigo-400/40' : 'hover:bg-white/10 border border-transparent'}`}
                                >
                                    {item.type === 'date' && <Calendar size={12} className="text-blue-400 flex-shrink-0" />}
                                    {item.type === 'holiday' && <Sparkles size={12} className="text-amber-400 flex-shrink-0" />}
                                    {item.type === 'note' && <FileText size={12} className="text-emerald-400 flex-shrink-0" />}
                                    {item.type === 'event' && <CalendarIcon size={12} className="text-indigo-400 flex-shrink-0" />}
                                    <div className="flex flex-col min-w-0 flex-1">
                                        <span className="text-xs font-semibold text-zinc-200 truncate">{item.label}</span>
                                        {item.sublabel && (
                                            <span className="text-[9.5px] text-zinc-400">{item.sublabel}</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Weekstrip Calendar below */}
            <div className="pt-2 border-t border-white/5 mt-1">
                <WeekStrip />
            </div>
        </div>
    );
};

// ─── In-Meeting Progress Bar (shown below idle calendar) ──────────────────

function InMeetingBar({ events }: { events: Array<{ title: string; start: string; end: string; description?: string; is_all_day?: boolean }> }) {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 15_000);
        return () => clearInterval(interval);
    }, []);

    const activeEvent = useMemo(() => {
        return events.find(e => {
            try {
                // Skip all-day events (flagged or duration >= 23h)
                if ((e as any).is_all_day) return false;
                const s = new Date(e.start);
                const en = new Date(e.end);
                const durationHrs = (en.getTime() - s.getTime()) / (1000 * 60 * 60);
                if (durationHrs >= 23) return false;
                return s <= now && en > now;
            } catch { return false; }
        });
    }, [events, now]);

    if (!activeEvent) return null;

    const start = new Date(activeEvent.start);
    const end = new Date(activeEvent.end);
    const total = end.getTime() - start.getTime();
    const elapsed = now.getTime() - start.getTime();
    const progress = Math.min(1, Math.max(0, elapsed / total));

    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="mt-1.5 px-3 pb-1"
        >
            <div className="w-full h-[2px] rounded-full bg-gray-200/60 dark:bg-white/5 overflow-hidden">
                <motion.div
                    className="h-full rounded-full bg-blue-400/60 dark:bg-blue-500/50"
                    initial={{ width: `${progress * 100}%` }}
                    animate={{ width: `${progress * 100}%` }}
                    transition={{ duration: 0.5, ease: 'easeInOut' }}
                />
            </div>
        </motion.div>
    );
}

// Decentralized Registry Map
import EventSuggestionView from './EventSuggestionView';

const registeredPlugins: Record<string, React.FC<{ payload: any }>> = {
    'welcome': WelcomeView,
    'morning': WelcomeView,
    'timeline': TimelineView,
    'next_event': NextEventView,
    'message': MessageView,
    'upload_progress': UploadProgressView,
    'interactive_card': InteractiveCardView,
    'event_preview': EventPreviewView,
    'event_suggestion': EventSuggestionView,
    'reminder': ReminderView,
    'text_collector': TextCollectorView,
};

export default function SmartIsland({ selectedDate, onSelect, userName }: SmartIslandProps) {
    const { state, setDailySummaryMode } = useIslandStore();
    const storeEvents = useDataStore(s => s.events);

    // Build today's events for InMeetingBar (exclude all-day events)
    const todayEvents = useMemo(() => {
        const today = new Date();
        return (storeEvents || []).filter((e: any) => {
            try { return isSameDay(new Date(e.start), today); } catch { return false; }
        }).map((e: any) => ({ title: e.title, start: e.start, end: e.end, description: e.description, is_all_day: e.is_all_day }));
    }, [storeEvents]);

    const isCentered = !!state.dailySummaryMode;

    const sizeClass = isCentered
        ? 'p-6 rounded-[2.5rem] w-[22rem] sm:w-[26rem]'
        : state.current?.type === 'timeline'
            ? 'p-4 rounded-[2rem] w-full'
            : state.current?.type === 'interactive_card'
                ? 'p-4 rounded-[1.75rem] w-full'
                : state.current?.type === 'event_suggestion'
                    ? 'rounded-[1.5rem] w-full'
                    : state.current?.type === 'reminder'
                        ? 'rounded-[1.75rem] w-full'
                        : state.current?.type === 'text_collector'
                            ? 'rounded-[1.75rem] w-full sm:w-[24rem]'
                            : state.current?.type === 'welcome' || state.current?.type === 'morning' || state.current?.type === 'event_preview'
                                ? 'p-4 rounded-[1.75rem] w-full'
                                : state.current?.type === 'message'
                                    ? 'p-3 rounded-[1.5rem] w-full'
                                    : 'p-2 rounded-[1.75rem] w-full';

    const positionClass = isCentered
        ? 'fixed top-[20vh] left-[calc(50%-11rem)] sm:left-[calc(50%-13rem)] z-[9999]'
        : 'relative';

    const islandShell = (
        <motion.div
            layoutId="smart-island-shell"
            transition={{
                type: "spring",
                stiffness: 250,
                damping: 30,
                mass: 0.9
            }}
            className={`liquidGlass-wrapper dark text-gray-800 dark:text-gray-100 ${positionClass} ${sizeClass}`}
        >
            {/* Layer 1: Distortion blur */}
            <div className="liquidGlass-effect" />
            {/* Layer 2: Tint */}
            <div className="liquidGlass-tint" />
            {/* Layer 2.5: Ambient yellow-white glow */}
            <div className="liquidGlass-glow" />
            {/* Layer 3: Inner shine */}
            <div className="liquidGlass-shine" />
            {/* Layer 4: Content */}
            <div className="liquidGlass-text w-full">
                <AnimatePresence mode="wait" initial={false}>
                    {isCentered ? (
                        <motion.div
                            key={`summary-${state.dailySummaryMode}`}
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            transition={{
                                opacity: { delay: 0.1, duration: 0.15 },
                                scale: { type: "spring", stiffness: 300, damping: 30 },
                                default: { type: "spring", stiffness: 300, damping: 30 }
                            }}
                            layout="position"
                        >
                            <DailySummaryView 
                                mode={state.dailySummaryMode!} 
                                userName={userName}
                                onClose={() => setDailySummaryMode(null)} 
                            />
                        </motion.div>
                    ) : !state.current ? (
                        <motion.div
                            key="default-calendar"
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            transition={{
                                opacity: { delay: 0.1, duration: 0.15 },
                                default: { type: "spring", stiffness: 300, damping: 30 }
                            }}
                            layout="position"
                        >
                            <MiniCalendar
                                selectedDate={selectedDate}
                                onSelect={(date) => {
                                    onSelect?.(date);
                                }}
                            />
                            {/* In-Meeting progress bar below calendar */}
                            <InMeetingBar events={todayEvents} />
                        </motion.div>
                    ) : (
                        <motion.div
                            key={state.current.id}
                            initial={{ opacity: 0, y: 15, filter: 'blur(8px)' }}
                            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                            exit={{ opacity: 0, y: -15, filter: 'blur(8px)' }}
                            transition={{
                                opacity: { delay: 0.1, duration: 0.15 },
                                y: { type: "spring", stiffness: 300, damping: 30 },
                                filter: { delay: 0.1, duration: 0.15 },
                                default: { type: "spring", stiffness: 300, damping: 30 }
                            }}
                            layout="position"
                        >
                            {(() => {
                                const ViewComponent = registeredPlugins[state.current.type];
                                if (!ViewComponent) return null;
                                
                                const payload = { ...state.current.payload };
                                if (state.current.type === 'morning') payload.userName = userName;
                                
                                return <ViewComponent payload={payload} />;
                            })()}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );

    if (isCentered && typeof window !== 'undefined') {
        return createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
                <AnimatePresence>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-md z-[9998] pointer-events-auto"
                        onClick={() => setDailySummaryMode(null)}
                    />
                </AnimatePresence>
                <div className="pointer-events-auto relative">
                    {islandShell}
                </div>
            </div>,
            document.body
        );
    }

    return (
        <div className="select-none relative z-[100]">
            {islandShell}
        </div>
    );
}


