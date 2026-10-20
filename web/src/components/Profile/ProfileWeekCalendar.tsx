"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    Clock,
    Calendar as CalendarIcon,
    CalendarPlus,
    Check,
    X,
    Loader2,
} from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { getEventTheme, getEffectStyle } from '@/components/Calendar/CalendarEventItem';

export interface ProfileEventMeta {
    title?: string;
    start?: string;
    end?: string;
    date?: string;
    color?: string;
    description?: string;
    [key: string]: unknown;
}

export interface ProfileCalendarEvent {
    id?: string;
    title?: string;
    start?: string;
    end?: string;
    date?: string;
    color?: string;
    effect?: string;
    description?: string;
    public_meta?: ProfileEventMeta | string;
    [key: string]: unknown;
}

export interface ProfileWeekCalendarProps {
    events: ProfileCalendarEvent[];
    ownerName: string;
    onAdoptEvent: (event: ProfileCalendarEvent) => Promise<void> | void;
    isOwnProfile?: boolean;
}

interface NormalizedEvent {
    raw: ProfileCalendarEvent;
    id: string;
    title: string;
    startDate: Date;
    endDate: Date;
    color: string;
    effect?: string;
    description: string;
}

const GERMAN_WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const GERMAN_DAYS_FULL = [
    'Sonntag',
    'Montag',
    'Dienstag',
    'Mittwoch',
    'Donnerstag',
    'Freitag',
    'Samstag',
];
const GERMAN_MONTHS = [
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
];
const GERMAN_MONTHS_SHORT = [
    'Jan',
    'Feb',
    'Mär',
    'Apr',
    'Mai',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Okt',
    'Nov',
    'Dez',
];

const ROW_HEIGHT = 48; // px per hour slot

function getISOWeekNumber(d: Date): number {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function parseMeta(meta: unknown): ProfileEventMeta | undefined {
    if (!meta) return undefined;
    if (typeof meta === 'string') {
        try {
            return JSON.parse(meta) as ProfileEventMeta;
        } catch {
            return undefined;
        }
    }
    if (typeof meta === 'object') {
        return meta as ProfileEventMeta;
    }
    return undefined;
}

function parseToDate(val: unknown): Date | null {
    if (!val) return null;
    if (val instanceof Date) {
        return isNaN(val.getTime()) ? null : val;
    }
    if (typeof val === 'number') {
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
    }
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (!trimmed) return null;

        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            const parts = trimmed.split('-').map(Number);
            if (parts.length === 3) {
                return new Date(parts[0], parts[1] - 1, parts[2], 9, 0, 0);
            }
        }

        const parsed = new Date(trimmed);
        return isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
}

function parseEndDate(rawEnd: unknown, startDate: Date): Date {
    const parsed = parseToDate(rawEnd);
    if (parsed && parsed.getTime() > startDate.getTime()) {
        return parsed;
    }
    return new Date(startDate.getTime() + 60 * 60 * 1000);
}

function formatDateFullGerman(d: Date): string {
    const dayName = GERMAN_DAYS_FULL[d.getDay()];
    const day = d.getDate();
    const monthName = GERMAN_MONTHS[d.getMonth()];
    const year = d.getFullYear();
    return `${dayName}, ${day}. ${monthName} ${year}`;
}

function formatTimeGerman(d: Date): string {
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

function layoutDayEvents(events: NormalizedEvent[]): Map<string, { left: number; width: number }> {
    const result = new Map<string, { left: number; width: number }>();
    if (events.length === 0) return result;

    const sorted = [...events].sort((a, b) => {
        const diff = a.startDate.getTime() - b.startDate.getTime();
        if (diff !== 0) return diff;
        return (
            b.endDate.getTime() -
            b.startDate.getTime() -
            (a.endDate.getTime() - a.startDate.getTime())
        );
    });

    const clusters: NormalizedEvent[][] = [];
    let currentCluster: NormalizedEvent[] = [];
    let clusterEnd = 0;

    for (const ev of sorted) {
        const start = ev.startDate.getTime();
        const end = ev.endDate.getTime();

        if (currentCluster.length === 0) {
            currentCluster.push(ev);
            clusterEnd = end;
        } else if (start < clusterEnd) {
            currentCluster.push(ev);
            if (end > clusterEnd) clusterEnd = end;
        } else {
            clusters.push(currentCluster);
            currentCluster = [ev];
            clusterEnd = end;
        }
    }
    if (currentCluster.length > 0) {
        clusters.push(currentCluster);
    }

    for (const cluster of clusters) {
        const colEnds: number[] = [];
        const assignments: { evId: string; col: number }[] = [];

        for (const ev of cluster) {
            const start = ev.startDate.getTime();
            let assignedCol = -1;
            for (let i = 0; i < colEnds.length; i++) {
                if (colEnds[i] <= start) {
                    assignedCol = i;
                    colEnds[i] = ev.endDate.getTime();
                    break;
                }
            }
            if (assignedCol === -1) {
                colEnds.push(ev.endDate.getTime());
                assignedCol = colEnds.length - 1;
            }
            assignments.push({ evId: ev.id, col: assignedCol });
        }

        const numCols = Math.max(1, colEnds.length);
        const colWidth = 100 / numCols;

        for (const { evId, col } of assignments) {
            result.set(evId, {
                left: col * colWidth,
                width: colWidth,
            });
        }
    }

    return result;
}

export default function ProfileWeekCalendar({
    events,
    ownerName,
    onAdoptEvent,
    isOwnProfile = false,
}: ProfileWeekCalendarProps) {
    const calendarColorPalette = useDataStore((s) => s.calendarColorPalette);

    const [currentDate, setCurrentDate] = useState(() => new Date());
    const [currentTime, setCurrentTime] = useState(() => new Date());
    const [selectedEvent, setSelectedEvent] = useState<NormalizedEvent | null>(null);
    const [isAdopting, setIsAdopting] = useState(false);
    const [adoptedIds, setAdoptedIds] = useState<Set<string>>(() => new Set());
    const [adoptError, setAdoptError] = useState<string | null>(null);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 30000);
        return () => clearInterval(timer);
    }, []);

    // Close modal on Escape
    useEffect(() => {
        if (!selectedEvent) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setSelectedEvent(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedEvent]);

    // Monday of current week
    const monday = useMemo(() => {
        const d = new Date(currentDate);
        const day = d.getDay() === 0 ? 7 : d.getDay();
        d.setDate(d.getDate() - day + 1);
        d.setHours(0, 0, 0, 0);
        return d;
    }, [currentDate]);

    // 7 days of the week (Monday to Sunday)
    const weekDays = useMemo(() => {
        const days: Date[] = [];
        for (let i = 0; i < 7; i++) {
            const day = new Date(monday);
            day.setDate(monday.getDate() + i);
            days.push(day);
        }
        return days;
    }, [monday]);

    const weekNumber = useMemo(() => getISOWeekNumber(monday), [monday]);

    const weekEnd = useMemo(() => {
        const lastDay = weekDays[6];
        const end = new Date(lastDay);
        end.setHours(23, 59, 59, 999);
        return end;
    }, [weekDays]);

    // Format Month & Year for Header
    const monthYearTitle = useMemo(() => {
        const firstDay = weekDays[0];
        const lastDay = weekDays[6];
        if (firstDay.getMonth() === lastDay.getMonth()) {
            return `${GERMAN_MONTHS[firstDay.getMonth()]} ${firstDay.getFullYear()}`;
        }
        if (firstDay.getFullYear() === lastDay.getFullYear()) {
            return `${GERMAN_MONTHS_SHORT[firstDay.getMonth()]} – ${GERMAN_MONTHS_SHORT[lastDay.getMonth()]} ${firstDay.getFullYear()}`;
        }
        return `${GERMAN_MONTHS_SHORT[firstDay.getMonth()]} ${firstDay.getFullYear()} – ${GERMAN_MONTHS_SHORT[lastDay.getMonth()]} ${lastDay.getFullYear()}`;
    }, [weekDays]);

    // Normalize events
    const normalizedEvents = useMemo(() => {
        const list: NormalizedEvent[] = [];
        if (!Array.isArray(events)) return list;

        events.forEach((ev: ProfileCalendarEvent, index: number) => {
            if (!ev) return;
            const meta = parseMeta(ev.public_meta);
            const title = (ev.title || meta?.title || 'Termin').trim();
            const description = (ev.description || meta?.description || '').trim();
            const color = (ev.color || meta?.color || '#3b82f6').trim();
            const effect = ev.effect || (typeof meta?.effect === 'string' ? meta.effect : undefined);

            const rawStart = ev.start || meta?.start || ev.date || meta?.date;
            const startDate = parseToDate(rawStart);
            if (!startDate) return;

            const rawEnd = ev.end || meta?.end;
            const endDate = parseEndDate(rawEnd, startDate);

            const id = String(ev.id || `profile-ev-${index}-${startDate.getTime()}`);

            list.push({
                raw: ev,
                id,
                title,
                startDate,
                endDate,
                color,
                effect,
                description,
            });
        });

        return list;
    }, [events]);

    // Filter events for current week
    const weekEvents = useMemo(() => {
        return normalizedEvents.filter((e) => e.endDate >= monday && e.startDate <= weekEnd);
    }, [normalizedEvents, monday, weekEnd]);

    // Dynamic hour calculation: default 08:00 – 20:00, expanding if needed
    const { minHour, maxHour, hoursList } = useMemo(() => {
        let minH = 8;
        let maxH = 20;

        weekEvents.forEach((e) => {
            const sHour = e.startDate.getHours() + e.startDate.getMinutes() / 60;
            const eHour = e.endDate.getHours() + e.endDate.getMinutes() / 60;

            if (sHour < minH) {
                const proposedMin = Math.max(0, Math.floor(sHour));
                if (proposedMin < minH) minH = proposedMin;
            }
            if (eHour > maxH) {
                const proposedMax = Math.min(24, Math.ceil(eHour));
                if (proposedMax > maxH) maxH = proposedMax;
            }
        });

        const list: number[] = [];
        for (let h = minH; h <= maxH; h++) {
            list.push(h);
        }
        return { minHour: minH, maxHour: maxH, hoursList: list };
    }, [weekEvents]);

    const totalHours = Math.max(1, maxHour - minHour);

    // Week navigation
    const prevWeek = () => {
        const d = new Date(currentDate);
        d.setDate(d.getDate() - 7);
        setCurrentDate(d);
    };

    const nextWeek = () => {
        const d = new Date(currentDate);
        d.setDate(d.getDate() + 7);
        setCurrentDate(d);
    };

    const goToToday = () => {
        setCurrentDate(new Date());
    };

    // Current time indicator calculations
    const currentHourDecimal = currentTime.getHours() + currentTime.getMinutes() / 60;
    const isCurrentTimeInRange = currentHourDecimal >= minHour && currentHourDecimal <= maxHour;
    const currentTimeTopPercent = ((currentHourDecimal - minHour) / totalHours) * 100;

    // Helper for event theme
    const getProfileEventTheme = useCallback(
        (color: string, effect?: string) => {
            try {
                const theme = getEventTheme(
                    {
                        id: 'preview',
                        title: '',
                        start: '',
                        end: '',
                        color,
                        effect,
                    },
                    calendarColorPalette || 'modern-dark'
                );

                if (theme.bg === '#64748B' && color && color.startsWith('#')) {
                    return {
                        bg: color,
                        text: '#FFFFFF',
                        border: color,
                    };
                }
                return theme;
            } catch {
                return {
                    bg: color || '#3b82f6',
                    text: '#FFFFFF',
                    border: color || '#3b82f6',
                };
            }
        },
        [calendarColorPalette]
    );

    // Handle adopting event
    const handleAdoptCurrentEvent = async () => {
        if (!selectedEvent || isAdopting) return;
        setAdoptError(null);
        setIsAdopting(true);
        try {
            await onAdoptEvent(selectedEvent.raw);
            setAdoptedIds((prev) => {
                const next = new Set(prev);
                next.add(selectedEvent.id);
                return next;
            });
        } catch (err: unknown) {
            console.error('Error adopting event:', err);
            setAdoptError(
                err instanceof Error ? err.message : 'Fehler beim Übernehmen des Termins.'
            );
        } finally {
            setIsAdopting(false);
        }
    };

    const isSelectedEventAdopted = selectedEvent ? adoptedIds.has(selectedEvent.id) : false;

    return (
        <div className="w-full bg-white dark:bg-[#1a1a1a] border border-gray-200/80 dark:border-white/10 rounded-2xl shadow-xs overflow-hidden flex flex-col transition-all">
            {/* Calendar Header */}
            <div className="flex flex-wrap items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-white/5 gap-3 bg-white dark:bg-[#1a1a1a]">
                <div className="flex items-center gap-3">
                    <span className="bg-gray-100 dark:bg-white/10 px-2.5 py-1 rounded-lg text-[11px] font-bold text-gray-700 dark:text-gray-300 font-mono">
                        KW {weekNumber}
                    </span>

                    {/* Navigation Controls */}
                    <div className="flex items-center gap-1 bg-gray-50 dark:bg-white/5 p-0.5 rounded-xl border border-gray-100 dark:border-white/5">
                        <button
                            type="button"
                            onClick={prevWeek}
                            className="p-1 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/10 transition-colors cursor-pointer"
                            title="Vorherige Woche"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <button
                            type="button"
                            onClick={goToToday}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-white/10 transition-colors cursor-pointer"
                        >
                            Heute
                        </button>
                        <button
                            type="button"
                            onClick={nextWeek}
                            className="p-1 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/10 transition-colors cursor-pointer"
                            title="Nächste Woche"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                        {monthYearTitle}
                    </span>

                    <span className="text-xs text-gray-400 dark:text-gray-500 font-mono hidden sm:inline">
                        {String(minHour).padStart(2, '0')}:00 – {String(maxHour).padStart(2, '0')}:00 Uhr
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                        {weekEvents.length > 0
                            ? `${weekEvents.length} Termin${weekEvents.length === 1 ? '' : 'e'}`
                            : 'Keine Termine diese Woche'}
                    </span>
                    {ownerName && (
                        <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800/40">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            <span>{ownerName}</span>
                        </span>
                    )}
                </div>
            </div>

            {/* Calendar Body */}
            <div className="w-full overflow-x-auto">
                <div className="min-w-[640px] flex flex-col">
                    {/* Day Column Headers */}
                    <div className="flex border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/[0.02]">
                        <div className="w-16 shrink-0 py-2.5 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                            Zeit
                        </div>
                        {weekDays.map((d, index) => {
                            const isToday = d.toDateString() === currentTime.toDateString();
                            const dayName = GERMAN_WEEKDAYS[d.getDay() === 0 ? 6 : d.getDay() - 1];
                            const dayNum = String(d.getDate()).padStart(2, '0');
                            return (
                                <div
                                    key={index}
                                    className={`flex-1 py-2 text-center border-l border-gray-100 dark:border-white/5 ${
                                        isToday ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''
                                    }`}
                                >
                                    <span
                                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-bold ${
                                            isToday
                                                ? 'bg-blue-600 text-white shadow-2xs'
                                                : 'text-gray-700 dark:text-gray-300'
                                        }`}
                                    >
                                        <span>{dayName}</span>
                                        <span className="opacity-70 font-normal">·</span>
                                        <span>{dayNum}</span>
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Hour Rows & Grid */}
                    <div
                        className="relative flex select-none"
                        style={{ height: `${totalHours * ROW_HEIGHT}px` }}
                    >
                        {/* Time labels column */}
                        <div className="w-16 shrink-0 relative border-r border-gray-100 dark:border-white/5">
                            {hoursList.map((hour) => {
                                const offsetPx = (hour - minHour) * ROW_HEIGHT;
                                return (
                                    <div
                                        key={hour}
                                        className="absolute right-3 -translate-y-1/2 pointer-events-none"
                                        style={{ top: `${offsetPx}px` }}
                                    >
                                        <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 font-mono">
                                            {String(hour).padStart(2, '0')}:00
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Day columns & events */}
                        <div className="flex-1 relative flex">
                            {/* Horizontal grid lines */}
                            <div className="absolute inset-0 flex flex-col pointer-events-none">
                                {Array.from({ length: totalHours }).map((_, idx) => (
                                    <div
                                        key={idx}
                                        style={{ height: `${ROW_HEIGHT}px` }}
                                        className="border-b border-gray-100 dark:border-white/5 w-full"
                                    />
                                ))}
                            </div>

                            {/* 7 Columns */}
                            {weekDays.map((dayDate, dayIdx) => {
                                const isToday = dayDate.toDateString() === currentTime.toDateString();
                                const dayStart = new Date(dayDate);
                                dayStart.setHours(0, 0, 0, 0);
                                const dayEnd = new Date(dayDate);
                                dayEnd.setHours(23, 59, 59, 999);

                                const dayEvents = weekEvents.filter((e) => {
                                    return e.endDate >= dayStart && e.startDate <= dayEnd;
                                });

                                const dayLayout = layoutDayEvents(dayEvents);

                                return (
                                    <div
                                        key={dayIdx}
                                        className={`flex-1 relative border-r border-gray-100 dark:border-white/5 transition-colors ${
                                            isToday ? 'bg-blue-50/15 dark:bg-blue-900/5' : ''
                                        }`}
                                    >
                                        {/* Current time indicator line on today's column */}
                                        {isToday && isCurrentTimeInRange && (
                                            <div
                                                className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
                                                style={{ top: `${currentTimeTopPercent}%` }}
                                            >
                                                <div className="w-2.5 h-2.5 rounded-full bg-rose-500 -ml-1.5 shadow-sm" />
                                                <div className="h-[2px] w-full bg-rose-500 shadow-sm" />
                                            </div>
                                        )}

                                        {/* Day's events */}
                                        {dayEvents.map((ev) => {
                                            const s = ev.startDate;
                                            const en = ev.endDate;
                                            const sHour = Math.max(
                                                minHour,
                                                s.getHours() + s.getMinutes() / 60
                                            );
                                            const eHour = Math.min(
                                                maxHour,
                                                en.getHours() + en.getMinutes() / 60
                                            );
                                            const duration = Math.max(0.4, eHour - sHour);

                                            const topPercent =
                                                ((sHour - minHour) / totalHours) * 100;
                                            const heightPercent = (duration / totalHours) * 100;

                                            const layoutInfo = dayLayout.get(ev.id);
                                            const colLeft = layoutInfo?.left ?? 0;
                                            const colWidth = layoutInfo?.width ?? 100;

                                            const theme = getProfileEventTheme(ev.color, ev.effect);
                                            const effectStyle = getEffectStyle(ev.effect);

                                            const sTimeStr = formatTimeGerman(s);
                                            const eTimeStr = formatTimeGerman(en);
                                            const isShort = duration < 0.75;

                                            return (
                                                <div
                                                    key={ev.id}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedEvent(ev);
                                                        setAdoptError(null);
                                                    }}
                                                    style={{
                                                        top: `${topPercent}%`,
                                                        height: `${Math.max(3.5, heightPercent)}%`,
                                                        left: `calc(${colLeft}% + 2px)`,
                                                        width: `calc(${colWidth}% - 4px)`,
                                                        backgroundColor: theme.bg,
                                                        color: theme.text,
                                                        borderColor: theme.border,
                                                        ...effectStyle,
                                                    }}
                                                    className="absolute z-10 p-2 rounded-lg border flex flex-col justify-between overflow-hidden shadow-xs cursor-pointer hover:brightness-105 hover:shadow-md transition-all group select-none"
                                                    title={`${ev.title} (${sTimeStr}–${eTimeStr})`}
                                                >
                                                    <div className="min-w-0">
                                                        <p className="font-semibold text-xs leading-tight truncate">
                                                            {ev.title}
                                                        </p>
                                                        {!isShort && ev.description && (
                                                            <p className="text-[10px] opacity-85 truncate mt-0.5 font-medium">
                                                                {ev.description}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1 text-[9px] font-mono font-medium opacity-85 mt-auto pt-0.5">
                                                        <Clock size={9} className="shrink-0" />
                                                        <span className="truncate">
                                                            {sTimeStr}–{eTimeStr}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Event Detail Modal */}
            {selectedEvent && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
                    onClick={() => setSelectedEvent(null)}
                >
                    <div
                        className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl max-w-md w-full p-6 relative overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col gap-4 text-gray-900 dark:text-white"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Color accent pill & Close button */}
                        <div className="flex items-center justify-between">
                            <div
                                className="w-10 h-1.5 rounded-full"
                                style={{ backgroundColor: selectedEvent.color }}
                            />
                            <button
                                type="button"
                                onClick={() => setSelectedEvent(null)}
                                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                                title="Schließen"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Title & Owner attribution */}
                        <div>
                            <h3 className="text-xl font-bold leading-tight break-words">
                                {selectedEvent.title}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mt-1">
                                <CalendarIcon size={13} className="text-blue-500 shrink-0" />
                                <span>
                                    {ownerName
                                        ? `Öffentlicher Termin von ${ownerName}`
                                        : 'Öffentlicher Termin'}
                                </span>
                            </p>
                        </div>

                        {/* Date and Time info card */}
                        <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/5 flex flex-col gap-2.5 text-xs text-gray-700 dark:text-gray-300">
                            <div className="flex items-center gap-2">
                                <CalendarIcon size={15} className="text-blue-500 shrink-0" />
                                <span className="font-semibold">
                                    {formatDateFullGerman(selectedEvent.startDate)}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Clock size={15} className="text-blue-500 shrink-0" />
                                <span className="font-mono">
                                    {formatTimeGerman(selectedEvent.startDate)} –{' '}
                                    {formatTimeGerman(selectedEvent.endDate)} Uhr
                                </span>
                            </div>
                        </div>

                        {/* Description */}
                        {selectedEvent.description && (
                            <div className="flex flex-col gap-1.5">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                                    Beschreibung
                                </span>
                                <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/5 text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed max-h-44 overflow-y-auto">
                                    {selectedEvent.description}
                                </div>
                            </div>
                        )}

                        {/* Error display */}
                        {adoptError && (
                            <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/30 rounded-xl p-3">
                                {adoptError}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="pt-2">
                            {!isOwnProfile ? (
                                <button
                                    type="button"
                                    onClick={handleAdoptCurrentEvent}
                                    disabled={isAdopting || isSelectedEventAdopted}
                                    className={`w-full py-3 px-4 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm ${
                                        isSelectedEventAdopted
                                            ? 'bg-emerald-600 text-white cursor-default'
                                            : 'bg-blue-600 hover:bg-blue-700 text-white hover:shadow-md active:scale-[0.99]'
                                    } disabled:opacity-85`}
                                >
                                    {isAdopting ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            <span>Wird übernommen...</span>
                                        </>
                                    ) : isSelectedEventAdopted ? (
                                        <>
                                            <Check size={16} className="stroke-[2.5]" />
                                            <span>Übernommen ✓</span>
                                        </>
                                    ) : (
                                        <>
                                            <CalendarPlus size={16} />
                                            <span>In meinen Kalender übernehmen</span>
                                        </>
                                    )}
                                </button>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    <p className="text-xs text-center text-gray-400">
                                        Dies ist dein eigener Termin.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedEvent(null)}
                                        className="w-full py-2.5 px-4 rounded-xl font-medium text-sm bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/15 text-gray-700 dark:text-gray-200 transition-colors cursor-pointer"
                                    >
                                        Schließen
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
