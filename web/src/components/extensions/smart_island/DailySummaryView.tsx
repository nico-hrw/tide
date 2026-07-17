"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { Sparkles, FileText, CheckCircle2, Clock, Edit2, LogOut, Check } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { format } from 'date-fns';

interface DailySummaryViewProps {
    mode: 'morning' | 'evening';
    userName?: string;
    onClose: () => void;
}

export default function DailySummaryView({ mode, userName, onClose }: DailySummaryViewProps) {
    const storeEvents = useDataStore(s => s.events) || [];
    const storeTasks = useDataStore(s => s.tasks) || [];

    const [stats, setStats] = useState({
        editedNotesCount: 0,
        wordsWritten: 0,
        activeMinutes: 0,
        completedTasks: 0
    });

    useEffect(() => {
        // Load stats from localStorage safely
        try {
            const editedStr = localStorage.getItem('tide_stats_edited_notes');
            const editedNotes = editedStr ? JSON.parse(editedStr) : [];
            const words = parseInt(localStorage.getItem('tide_stats_words_written') || '0', 10);
            const activeMins = parseInt(localStorage.getItem('tide_stats_active_minutes') || '0', 10);
            
            // Count tasks completed today via localStorage
            const completedCount = parseInt(localStorage.getItem('tide_stats_completed_tasks') || '0', 10);

            setStats({
                editedNotesCount: Array.isArray(editedNotes) ? editedNotes.length : 0,
                wordsWritten: words,
                activeMinutes: activeMins,
                completedTasks: completedCount
            });
        } catch (e) {
            console.error("Failed to load summary stats", e);
        }
    }, [storeTasks]);

    // Calculate today's schedule briefing for morning summary
    const todayBriefing = useMemo(() => {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const todayEvents = storeEvents.filter(e => {
            try {
                return e.start.startsWith(todayStr);
            } catch { return false; }
        });
        const openTasks = storeTasks.filter(t => !t.isCompleted);
        return {
            eventsCount: todayEvents.length,
            tasksCount: openTasks.length,
            events: todayEvents.slice(0, 2)
        };
    }, [storeEvents, storeTasks]);

    // Calculate a productivity score for the evening summary
    const productivityScore = useMemo(() => {
        // Simple formula: active minutes * 2 + edited notes * 10 + words * 0.1 + completed tasks * 15
        const score = (stats.activeMinutes * 1.5) + (stats.editedNotesCount * 12) + (stats.wordsWritten * 0.08) + (stats.completedTasks * 15);
        return Math.min(100, Math.round(score));
    }, [stats]);

    const handleFinishDay = () => {
        // Reset stats for the new day
        try {
            // Save today's stats as "yesterday" before resetting
            localStorage.setItem('tide_stats_yesterday', JSON.stringify({
                date: format(new Date(), 'yyyy-MM-dd'),
                ...stats
            }));

            localStorage.setItem('tide_stats_edited_notes', JSON.stringify([]));
            localStorage.setItem('tide_stats_words_written', '0');
            localStorage.setItem('tide_stats_active_minutes', '0');
            localStorage.setItem('tide_stats_completed_tasks', '0');
        } catch (err) {
            console.error(err);
        }
        onClose();
    };

    if (mode === 'morning') {
        return (
            <div className="flex flex-col gap-6 py-4 px-2 w-[22rem] sm:w-[26rem] select-none text-zinc-100">
                {/* Header */}
                <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-red-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                        <Sparkles size={22} className="text-white" />
                    </div>
                    <div>
                        <h2 className="text-[20px] font-black tracking-tight leading-tight">
                            Guten Morgen{userName ? `, ${userName}` : ''}!
                        </h2>
                        <p className="text-[12px] text-zinc-400 font-semibold mt-0.5 uppercase tracking-wider">
                            Bereit für einen produktiven Tag?
                        </p>
                    </div>
                </div>

                {/* Today's schedule */}
                <div className="flex flex-col gap-3.5 p-4 rounded-3xl bg-zinc-900/50 border border-white/5">
                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                        Dein Briefing für Heute
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col p-3 rounded-2xl bg-zinc-950/40 border border-white/5">
                            <span className="text-[22px] font-black text-amber-400">
                                {todayBriefing.eventsCount}
                            </span>
                            <span className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider">
                                Termine heute
                            </span>
                        </div>
                        <div className="flex flex-col p-3 rounded-2xl bg-zinc-950/40 border border-white/5">
                            <span className="text-[22px] font-black text-violet-400">
                                {todayBriefing.tasksCount}
                            </span>
                            <span className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider">
                                Offene Aufgaben
                            </span>
                        </div>
                    </div>

                    {todayBriefing.events.length > 0 && (
                        <div className="flex flex-col gap-2 mt-2">
                            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Erste Termine</div>
                            {todayBriefing.events.map((ev, i) => (
                                <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-950/60 border border-white/5 text-xs">
                                    <span className="font-bold text-zinc-200 truncate max-w-[12rem]">{ev.title}</span>
                                    <span className="text-zinc-400 font-medium">
                                        {format(new Date(ev.start), 'HH:mm')} Uhr
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer button */}
                <button
                    onClick={onClose}
                    className="w-full py-3.5 rounded-2xl bg-white text-zinc-950 font-black text-sm tracking-wide shadow-xl shadow-white/5 hover:bg-zinc-100 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                    <Check size={16} strokeWidth={3} /> Tag starten
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 py-4 px-2 w-[22rem] sm:w-[26rem] select-none text-zinc-100">
            {/* Header */}
            <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
                    <CheckCircle2 size={22} className="text-white" />
                </div>
                <div>
                    <h2 className="text-[20px] font-black tracking-tight leading-tight">
                        Schönen Feierabend{userName ? `, ${userName}` : ''}!
                    </h2>
                    <p className="text-[12px] text-zinc-400 font-semibold mt-0.5 uppercase tracking-wider">
                        Dein Tag in Zahlen
                    </p>
                </div>
            </div>

            {/* Circular Progress & Productivity Score */}
            <div className="flex items-center gap-6 p-4 rounded-3xl bg-zinc-900/50 border border-white/5">
                <div className="relative w-20 h-20 shrink-0">
                    {/* SVG Circle */}
                    <svg className="w-full h-full transform -rotate-90">
                        <circle cx="40" cy="40" r="34" className="stroke-zinc-800" strokeWidth="6" fill="transparent" />
                        <circle 
                            cx="40" 
                            cy="40" 
                            r="34" 
                            className="stroke-purple-500 transition-all duration-1000 ease-out" 
                            strokeWidth="6" 
                            fill="transparent" 
                            strokeDasharray={213.6} 
                            strokeDashoffset={213.6 - (213.6 * productivityScore) / 100}
                            strokeLinecap="round"
                        />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-[16px] font-black leading-none">{productivityScore}%</span>
                        <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-wider mt-0.5">Score</span>
                    </div>
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                        Produktivitäts-Index
                    </h3>
                    <p className="text-xs text-zinc-400 leading-relaxed mt-1 font-medium">
                        {productivityScore >= 80 
                            ? 'Herausragender Tag! Du warst heute extrem fokussiert und produktiv.' 
                            : productivityScore >= 50 
                            ? 'Gute Arbeit heute! Du hast wichtige Aufgaben erledigt.' 
                            : 'Ein ruhigerer Tag. Perfekt, um neue Kräfte zu sammeln.'}
                    </p>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3.5">
                <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-zinc-900/40 border border-white/5">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
                        <Clock size={16} />
                    </div>
                    <div>
                        <div className="text-base font-black leading-none text-zinc-100">{stats.activeMinutes}m</div>
                        <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mt-0.5">Fokus-Zeit</div>
                    </div>
                </div>
                <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-zinc-900/40 border border-white/5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                        <FileText size={16} />
                    </div>
                    <div>
                        <div className="text-base font-black leading-none text-zinc-100">{stats.editedNotesCount}</div>
                        <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mt-0.5">Notizen</div>
                    </div>
                </div>
                <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-zinc-900/40 border border-white/5">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                        <Edit2 size={16} />
                    </div>
                    <div>
                        <div className="text-base font-black leading-none text-zinc-100">{stats.wordsWritten}</div>
                        <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mt-0.5">Worte</div>
                    </div>
                </div>
                <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-zinc-900/40 border border-white/5">
                    <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 flex items-center justify-center">
                        <CheckCircle2 size={16} />
                    </div>
                    <div>
                        <div className="text-base font-black leading-none text-zinc-100">{stats.completedTasks}</div>
                        <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mt-0.5">Aufgaben</div>
                    </div>
                </div>
            </div>

            {/* Footer button */}
            <button
                onClick={handleFinishDay}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-red-500 to-orange-500 text-white font-black text-sm tracking-wide shadow-xl shadow-red-500/15 hover:opacity-95 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
                <LogOut size={16} /> Feierabend machen & zurücksetzen
            </button>
        </div>
    );
}
