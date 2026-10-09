"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { useDataStore, DataItem } from '@/store/useDataStore';
import { useJobPlannerStore } from '@/store/useJobPlannerStore';
import { getEventTheme, getEffectStyle } from '@/components/Calendar/CalendarEventItem';

interface PlannerWeekCalendarProps {
    events: DataItem[];
    categoryGroupIds: string[];
    onEventClick?: (event: DataItem) => void;
    onCreateEvent?: (date: Date, hour: number) => void;
}

const GERMAN_WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function getISOWeekNumber(d: Date): number {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export default function PlannerWeekCalendar({
    events,
    categoryGroupIds,
    onEventClick,
    onCreateEvent,
}: PlannerWeekCalendarProps) {
    const { calendarColorPalette, notes } = useDataStore();
    const showWeekends = useJobPlannerStore((s) => s.showWeekends);

    const [currentDate, setCurrentDate] = useState(() => new Date());
    const [currentTime, setCurrentTime] = useState(() => new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 30000);
        return () => clearInterval(timer);
    }, []);

    // Compute Monday of current week
    const monday = useMemo(() => {
        const d = new Date(currentDate);
        const day = d.getDay() === 0 ? 7 : d.getDay();
        d.setDate(d.getDate() - day + 1);
        d.setHours(0, 0, 0, 0);
        return d;
    }, [currentDate]);

    // Week days (5 or 7 days)
    const weekDays = useMemo(() => {
        const count = showWeekends ? 7 : 5;
        const days: Date[] = [];
        for (let i = 0; i < count; i++) {
            const day = new Date(monday);
            day.setDate(monday.getDate() + i);
            days.push(day);
        }
        return days;
    }, [monday, showWeekends]);

    const weekNumber = useMemo(() => getISOWeekNumber(monday), [monday]);

    // End of week
    const weekEnd = useMemo(() => {
        const lastDay = weekDays[weekDays.length - 1];
        const end = new Date(lastDay);
        end.setHours(23, 59, 59, 999);
        return end;
    }, [weekDays]);

    // Filter events for this week belonging to the category
    const weekEvents = useMemo(() => {
        return events.filter(e => {
            if (!e.start || !e.end) return false;
            // Parent matching
            const matchesCategory = categoryGroupIds.length === 0 ||
                (e.parent_id && categoryGroupIds.includes(e.parent_id)) ||
                (e.tags && e.tags.some((t: string) => ['job', 'arbeit', 'uni', 'studium'].includes(t.toLowerCase())));
            if (!matchesCategory) return false;

            const evStart = new Date(e.start);
            const evEnd = new Date(e.end);
            return evEnd >= monday && evStart <= weekEnd;
        });
    }, [events, categoryGroupIds, monday, weekEnd]);

    // Dynamic hour bounds: default 7 to 20, expand +- 1h if events fall outside
    const { minHour, maxHour, hoursList } = useMemo(() => {
        let minH = 7;
        let maxH = 20;

        weekEvents.forEach(e => {
            const s = new Date(e.start);
            const en = new Date(e.end);
            const sHour = s.getHours() + s.getMinutes() / 60;
            const eHour = en.getHours() + en.getMinutes() / 60;

            if (sHour < 7) {
                const proposedMin = Math.max(0, Math.floor(sHour) - 1);
                if (proposedMin < minH) minH = proposedMin;
            }
            if (eHour > 20) {
                const proposedMax = Math.min(24, Math.ceil(eHour) + 1);
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

    // Navigate weeks
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

    // Formatted current time string e.g. "Fr, 09.10. · 08:48"
    const formattedDateTime = useMemo(() => {
        const weekday = GERMAN_WEEKDAYS[currentTime.getDay() === 0 ? 6 : currentTime.getDay() - 1];
        const dayStr = String(currentTime.getDate()).padStart(2, '0');
        const monthStr = String(currentTime.getMonth() + 1).padStart(2, '0');
        const hoursStr = String(currentTime.getHours()).padStart(2, '0');
        const minsStr = String(currentTime.getMinutes()).padStart(2, '0');
        return `${weekday}, ${dayStr}.${monthStr}. · ${hoursStr}:${minsStr}`;
    }, [currentTime]);

    const currentHourDecimal = currentTime.getHours() + currentTime.getMinutes() / 60;
    const isCurrentTimeInRange = currentHourDecimal >= minHour && currentHourDecimal <= maxHour;
    const currentTimeTopPercent = ((currentHourDecimal - minHour) / totalHours) * 100;

    return (
        <div className="w-full bg-white dark:bg-[#1a1a1a] border border-gray-200/80 dark:border-white/10 rounded-2xl shadow-xs overflow-hidden flex flex-col transition-all">
            {/* Clean, uncluttered Calendar Header */}
            <div className="flex flex-wrap items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-white/5 gap-3 bg-white dark:bg-[#1a1a1a]">
                <div className="flex items-center gap-3">
                    <span className="bg-gray-100 dark:bg-white/10 px-2.5 py-1 rounded-lg text-[11px] font-bold text-gray-700 dark:text-gray-300 font-mono">
                        KW {weekNumber}
                    </span>

                    {/* Navigation Controls */}
                    <div className="flex items-center gap-1 bg-gray-50 dark:bg-white/5 p-0.5 rounded-xl border border-gray-100 dark:border-white/5">
                        <button
                            onClick={prevWeek}
                            className="p-1 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/10 transition-colors cursor-pointer"
                            title="Vorherige Woche"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <button
                            onClick={goToToday}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-white/10 transition-colors cursor-pointer"
                        >
                            Heute
                        </button>
                        <button
                            onClick={nextWeek}
                            className="p-1 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/10 transition-colors cursor-pointer"
                            title="Nächste Woche"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    <span className="text-xs text-gray-400 dark:text-gray-500 font-mono hidden sm:inline">
                        {String(minHour).padStart(2, '0')}:00 – {String(maxHour).padStart(2, '0')}:00 Uhr
                    </span>
                </div>

                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 font-mono">
                    {formattedDateTime}
                </div>
            </div>

            {/* Calendar Body */}
            <div className="w-full overflow-x-auto">
                <div className="min-w-[620px] flex flex-col">
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
                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-bold ${
                                        isToday 
                                            ? 'bg-blue-600 text-white shadow-2xs' 
                                            : 'text-gray-700 dark:text-gray-300'
                                    }`}>
                                        <span>{dayName}</span>
                                        <span className="opacity-70 font-normal">·</span>
                                        <span>{dayNum}</span>
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Hour Rows & Grid */}
                    <div className="relative flex min-h-[460px] select-none">
                        {/* Time labels column */}
                        <div className="w-16 shrink-0 flex flex-col justify-between py-2 border-r border-gray-100 dark:border-white/5">
                            {hoursList.map((hour) => (
                                <div key={hour} className="h-10 text-right pr-3 -mt-2">
                                    <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 font-mono">
                                        {String(hour).padStart(2, '0')}:00
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Day columns & events */}
                        <div className="flex-1 relative flex">
                            {/* Horizontal grid lines */}
                            <div className="absolute inset-0 flex flex-col pointer-events-none">
                                {hoursList.map((hour) => (
                                    <div
                                        key={hour}
                                        className="h-10 border-b border-gray-100 dark:border-white/5 w-full"
                                    />
                                ))}
                            </div>

                            {/* Columns */}
                            {weekDays.map((dayDate, dayIdx) => {
                                const isToday = dayDate.toDateString() === currentTime.toDateString();
                                const dayStart = new Date(dayDate);
                                dayStart.setHours(0, 0, 0, 0);
                                const dayEnd = new Date(dayDate);
                                dayEnd.setHours(23, 59, 59, 999);

                                // Filter events for this specific day
                                const dayEvents = weekEvents.filter(e => {
                                    const s = new Date(e.start);
                                    const en = new Date(e.end);
                                    return en >= dayStart && s <= dayEnd;
                                });

                                return (
                                    <div
                                        key={dayIdx}
                                        onClick={(e) => {
                                            if (onCreateEvent && e.target === e.currentTarget) {
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                const clickY = e.clientY - rect.top;
                                                const percent = clickY / rect.height;
                                                const clickedHour = Math.floor(minHour + percent * totalHours);
                                                onCreateEvent(dayDate, clickedHour);
                                            }
                                        }}
                                        className={`flex-1 relative border-r border-gray-100 dark:border-white/5 hover:bg-gray-50/40 dark:hover:bg-white/[0.01] transition-colors cursor-pointer ${
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

                                        {/* Render day's events with real Tide calendar event theme colors */}
                                        {dayEvents.map((ev, evIdx) => {
                                            const s = new Date(ev.start);
                                            const en = new Date(ev.end);
                                            const sHour = Math.max(minHour, s.getHours() + s.getMinutes() / 60);
                                            const eHour = Math.min(maxHour, en.getHours() + en.getMinutes() / 60);
                                            const duration = Math.max(0.5, eHour - sHour);

                                            const topPercent = ((sHour - minHour) / totalHours) * 100;
                                            const heightPercent = (duration / totalHours) * 100;

                                            // Resolve color and theme exactly like Tide's main calendar
                                            const parentFolder = notes.find((n: DataItem) => n.id === ev.parent_id);
                                            const color = ev.color || parentFolder?.color;
                                            const effect = ev.effect || parentFolder?.effect;
                                            const theme = getEventTheme({ 
                                                id: ev.id,
                                                title: ev.title,
                                                color, 
                                                effect 
                                            } as Parameters<typeof getEventTheme>[0], calendarColorPalette);
                                            const effectStyle = getEffectStyle(effect);

                                            const sTimeStr = `${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`;
                                            const eTimeStr = `${String(en.getHours()).padStart(2, '0')}:${String(en.getMinutes()).padStart(2, '0')}`;

                                            return (
                                                <div
                                                    key={ev.id || evIdx}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onEventClick?.(ev);
                                                    }}
                                                    style={{
                                                        top: `${topPercent}%`,
                                                        height: `${Math.max(4, heightPercent)}%`,
                                                        backgroundColor: theme.bg,
                                                        color: theme.text,
                                                        borderColor: theme.border,
                                                        ...effectStyle,
                                                    }}
                                                    className="absolute left-1 right-1 z-10 p-2 rounded-lg border flex flex-col justify-between overflow-hidden shadow-xs cursor-pointer hover:brightness-105 hover:shadow-md transition-all"
                                                    title={`${ev.title || 'Termin'} (${sTimeStr}–${eTimeStr})`}
                                                >
                                                    <div className="min-w-0">
                                                        <p className="font-semibold text-xs leading-tight truncate">
                                                            {ev.title || 'Termin'}
                                                        </p>
                                                        {ev.description && (
                                                            <p className="text-[10px] opacity-85 truncate mt-0.5 font-medium">
                                                                {ev.description}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1 text-[9px] font-mono font-medium opacity-85 mt-0.5">
                                                        <Clock size={9} />
                                                        <span>{sTimeStr}–{eTimeStr}</span>
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
        </div>
    );
}
