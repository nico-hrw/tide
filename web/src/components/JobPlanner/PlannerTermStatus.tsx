"use client";

import React, { useMemo, useState, useEffect } from 'react';
import { Clock, Calendar, CheckCircle2 } from 'lucide-react';
import { DataItem } from '@/store/useDataStore';

interface PlannerTermStatusProps {
    events: DataItem[];
    categoryGroupIds: string[];
    onEventClick?: (event: DataItem) => void;
}

export default function PlannerTermStatus({
    events,
    categoryGroupIds,
    onEventClick,
}: PlannerTermStatusProps) {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 30000);
        return () => clearInterval(interval);
    }, []);

    // Filter today's events belonging to planner categories
    const { currentEvent, nextEvent } = useMemo(() => {
        const todayStr = now.toDateString();
        const todayEvents = events.filter(e => {
            if (!e.start || !e.end) return false;
            const matchesCategory = categoryGroupIds.length === 0 ||
                (e.parent_id && categoryGroupIds.includes(e.parent_id)) ||
                (e.tags && e.tags.some((t: string) => ['job', 'arbeit', 'uni', 'studium'].includes(t.toLowerCase())));
            if (!matchesCategory) return false;

            const s = new Date(e.start);
            return s.toDateString() === todayStr;
        }).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

        const current = todayEvents.find(e => {
            const s = new Date(e.start);
            const en = new Date(e.end);
            return now >= s && now <= en;
        });

        const next = todayEvents.find(e => {
            const s = new Date(e.start);
            return s > now;
        });

        return { currentEvent: current, nextEvent: next };
    }, [events, categoryGroupIds, now]);

    // Format remaining time for current event
    const currentEventBadge = useMemo(() => {
        if (!currentEvent) return null;
        const en = new Date(currentEvent.end);
        const minsLeft = Math.max(1, Math.round((en.getTime() - now.getTime()) / 60000));
        if (minsLeft > 60) {
            const hours = Math.floor(minsLeft / 60);
            const mins = minsLeft % 60;
            return `Ende in ${hours} Std ${mins} Min`;
        }
        return `Ende in ${minsLeft} Min`;
    }, [currentEvent, now]);

    // Format start time for next event
    const nextEventBadge = useMemo(() => {
        if (!nextEvent) return null;
        const s = new Date(nextEvent.start);
        const minsToStart = Math.max(1, Math.round((s.getTime() - now.getTime()) / 60000));
        const timeStr = `${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`;
        if (minsToStart < 60) {
            return `Start in ${minsToStart} Min (${timeStr})`;
        }
        return `Start ${timeStr}`;
    }, [nextEvent, now]);

    return (
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Aktueller Termin Card matching Figma */}
            <div
                onClick={() => currentEvent && onEventClick?.(currentEvent)}
                className={`bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-2xl p-4 flex flex-col justify-between shadow-2xs transition-all ${
                    currentEvent ? 'cursor-pointer hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-xs' : ''
                }`}
            >
                <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                        Aktueller Termin
                    </span>
                    {currentEvent ? (
                        <>
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white leading-tight truncate">
                                {currentEvent.title}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                                {currentEvent.description || 'Kein Raum angegeben'} · {new Date(currentEvent.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–{new Date(currentEvent.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </>
                    ) : (
                        <>
                            <h3 className="text-sm font-medium text-gray-400 dark:text-gray-500 leading-tight">
                                Kein aktiver Termin
                            </h3>
                            <p className="text-xs text-gray-400/80 dark:text-gray-600 mt-1">
                                Du hast gerade Freizeit oder Pause.
                            </p>
                        </>
                    )}
                </div>

                <div className="mt-3 flex items-center">
                    {currentEvent && currentEventBadge ? (
                        <div className="bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/40 px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1.5 shadow-2xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                            {currentEventBadge}
                        </div>
                    ) : (
                        <div className="bg-gray-100 dark:bg-white/5 text-gray-500 text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                            <CheckCircle2 size={12} className="text-emerald-500" />
                            <span>Bereit</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Nächster Termin Card matching Figma */}
            <div
                onClick={() => nextEvent && onEventClick?.(nextEvent)}
                className={`bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-2xl p-4 flex flex-col justify-between shadow-2xs transition-all ${
                    nextEvent ? 'cursor-pointer hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-xs' : ''
                }`}
            >
                <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                        Nächster Termin
                    </span>
                    {nextEvent ? (
                        <>
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white leading-tight truncate">
                                {nextEvent.title}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                                {nextEvent.description || 'Kein Raum angegeben'} · {new Date(nextEvent.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–{new Date(nextEvent.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </>
                    ) : (
                        <>
                            <h3 className="text-sm font-medium text-gray-400 dark:text-gray-500 leading-tight">
                                Kein weiterer Termin heute
                            </h3>
                            <p className="text-xs text-gray-400/80 dark:text-gray-600 mt-1">
                                Keine weiteren Termine mehr für den heutigen Tag geplant.
                            </p>
                        </>
                    )}
                </div>

                <div className="mt-3 flex items-center">
                    {nextEvent && nextEventBadge ? (
                        <div className="bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40 px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1.5 shadow-2xs">
                            <Clock size={12} />
                            {nextEventBadge}
                        </div>
                    ) : (
                        <div className="bg-gray-100 dark:bg-white/5 text-gray-500 text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                            <Calendar size={12} />
                            <span>Feierabend</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
