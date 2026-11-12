'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Smile, BarChart3, TrendingUp, Calendar, Clock, Trash2, Plus, Flame, Check, X, Sparkles } from 'lucide-react';
import { useSurveyStore } from '@/store/useSurveyStore';
import type { MoodData, MoodType, SurveyResponseItem } from '@/types/surveys';

type TimeFilter = '7d' | '30d' | 'all';

interface MoodMeta {
    label: string;
    emoji: string;
    color: string;
    bgBadge: string;
    score: number;
}

const MOOD_MAP: Record<MoodType, MoodMeta> = {
    good: { label: 'Super', emoji: '😄', color: '#10b981', bgBadge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', score: 3 },
    okay: { label: 'Okay', emoji: '😐', color: '#f59e0b', bgBadge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', score: 2 },
    bad: { label: 'Schlecht', emoji: '😞', color: '#f43f5e', bgBadge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20', score: 1 },
};

function parseMoodData(item: SurveyResponseItem): MoodData {
    if (item.parsedData) return item.parsedData;
    if (typeof item.data === 'string') {
        try {
            return JSON.parse(item.data) as MoodData;
        } catch {
            return { mood: 'okay', score: 2, label: 'Okay' };
        }
    }
    return { mood: 'okay', score: 2, label: 'Okay' };
}

function calculateStreak(responses: SurveyResponseItem[]): number {
    if (responses.length === 0) return 0;
    const dateSet = new Set<string>();
    for (const r of responses) {
        const d = new Date(r.created_at);
        dateSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let check = new Date();
    let todayStr = fmt(check);
    if (!dateSet.has(todayStr)) {
        check.setDate(check.getDate() - 1);
        todayStr = fmt(check);
        if (!dateSet.has(todayStr)) return 0;
    }
    let streak = 0;
    while (dateSet.has(fmt(check))) {
        streak++;
        check.setDate(check.getDate() - 1);
    }
    return streak;
}

export default function SurveyAnalytics({ className = '' }: { className?: string }) {
    const { responses, fetchResponses, addMoodResponse, deleteResponse, setIsPopupOpen } = useSurveyStore();
    const [filter, setFilter] = useState<TimeFilter>('7d');
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [hovered, setHovered] = useState<{ x: number; y: number; label: string; date: string; time: string; note?: string } | null>(null);

    useEffect(() => {
        void fetchResponses();
    }, [fetchResponses]);

    const filtered = useMemo(() => {
        const now = Date.now();
        const limit = filter === '7d' ? 7 * 864e5 : filter === '30d' ? 30 * 864e5 : Infinity;
        return responses.filter((r) => !isNaN(new Date(r.created_at).getTime()) && now - new Date(r.created_at).getTime() <= limit);
    }, [responses, filter]);

    const latest = responses.length > 0 ? responses[0] : null;
    const latestMood = latest ? parseMoodData(latest) : null;
    const streak = useMemo(() => calculateStreak(responses), [responses]);

    const { counts, dominantMood, dominantPct } = useMemo(() => {
        const c: Record<MoodType, number> = { good: 0, okay: 0, bad: 0 };
        filtered.forEach((r) => { const m = parseMoodData(r); if (m.mood in c) c[m.mood]++; });
        let dom: MoodType = 'good';
        let max = -1;
        (['good', 'okay', 'bad'] as MoodType[]).forEach((k) => { if (c[k] > max) { max = c[k]; dom = k; } });
        return { counts: c, dominantMood: dom, dominantPct: filtered.length ? Math.round((max / filtered.length) * 100) : 0 };
    }, [filtered]);

    const slots = useMemo(() => {
        const defs = [
            { id: 'm', label: 'Morgens', range: '07:00 – 11:00', min: 7, max: 11, scores: [] as number[] },
            { id: 'n', label: 'Mittags', range: '11:00 – 15:00', min: 11, max: 15, scores: [] as number[] },
            { id: 'a', label: 'Nachmittags', range: '15:00 – 19:00', min: 15, max: 19, scores: [] as number[] },
            { id: 'e', label: 'Abends', range: '19:00 – 23:00', min: 19, max: 23, scores: [] as number[] },
        ];
        filtered.forEach((r) => {
            const h = new Date(r.created_at).getHours();
            const s = defs.find((d) => h >= d.min && h < d.max);
            if (s) s.scores.push(parseMoodData(r).score);
        });
        return defs.map((d) => {
            const avg = d.scores.length ? d.scores.reduce((a, b) => a + b, 0) / d.scores.length : 0;
            return { ...d, count: d.scores.length, avgStr: avg ? avg.toFixed(1) : '—', scoreNum: avg };
        });
    }, [filtered]);

    // Timeline SVG
    const svgW = 600, svgH = 150, padX = 40, padY = 20, plotW = svgW - padX * 2, plotH = svgH - padY * 2;
    const timeline = useMemo(() => {
        const sorted = [...filtered].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const n = sorted.length;
        return sorted.map((r, i) => {
            const d = new Date(r.created_at);
            const m = parseMoodData(r);
            const x = n === 1 ? padX + plotW / 2 : padX + (i / (n - 1)) * plotW;
            const y = padY + (3 - m.score) * (plotH / 2);
            return {
                x, y, mood: m.mood, label: MOOD_MAP[m.mood].label, note: m.note,
                date: d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
                time: d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
            };
        });
    }, [filtered, plotW, plotH]);

    const pathD = timeline.length ? timeline.reduce((acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`), '') : '';
    const areaD = timeline.length > 1 ? `${pathD} L ${timeline[timeline.length - 1].x} ${padY + plotH} L ${timeline[0].x} ${padY + plotH} Z` : '';

    // Donut SVG
    const circ = 2 * Math.PI * 34;
    const donut = useMemo(() => {
        let acc = 0;
        return (['good', 'okay', 'bad'] as MoodType[]).map((k) => {
            const pct = filtered.length ? counts[k] / filtered.length : 0;
            const len = pct * circ;
            const seg = { k, meta: MOOD_MAP[k], count: counts[k], pct: Math.round(pct * 100), da: `${len} ${circ - len}`, do: -acc };
            acc += len;
            return seg;
        });
    }, [filtered.length, counts, circ]);

    return (
        <div className={`space-y-6 text-gray-900 dark:text-gray-100 ${className}`}>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-gray-200 dark:border-gray-800">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <Sparkles className="w-6 h-6 text-blue-500" />
                        Stimmungs- & Umfrage-Analyse
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Visualisiere dein Wohlbefinden und erkenne Muster im Tages- und Wochenverlauf
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-800 p-1 border border-gray-200 dark:border-gray-700">
                        {(['7d', '30d', 'all'] as const).map((p) => (
                            <button
                                key={p}
                                type="button"
                                onClick={() => setFilter(p)}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${filter === p ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'}`}
                            >
                                {p === '7d' ? 'Letzte 7 Tage' : p === '30d' ? 'Letzte 30 Tage' : 'Alle'}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsPopupOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors"
                    >
                        <Plus className="w-4 h-4" /> Stimmung jetzt erfassen
                    </button>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
                    <div>
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Aktuelle Stimmung</div>
                        <div className="text-xl font-bold mt-1 flex items-center gap-2">
                            {latestMood ? <>{MOOD_MAP[latestMood.mood].emoji} {MOOD_MAP[latestMood.mood].label}</> : <span className="text-sm text-gray-400">Keine Daten</span>}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">{latest ? new Date(latest.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Noch kein Eintrag'}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"><Smile className="w-6 h-6" /></div>
                </div>

                <div className="p-4 rounded-xl bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
                    <div>
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Häufigste Stimmung</div>
                        <div className="text-xl font-bold mt-1 flex items-center gap-2">
                            {filtered.length ? <>{MOOD_MAP[dominantMood].emoji} {MOOD_MAP[dominantMood].label}</> : <span className="text-sm text-gray-400">—</span>}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">{filtered.length ? `${dominantPct}% aller Einträge` : 'Im Zeitraum'}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400"><TrendingUp className="w-6 h-6" /></div>
                </div>

                <div className="p-4 rounded-xl bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
                    <div>
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Check-in Streak</div>
                        <div className="text-2xl font-bold mt-1 flex items-center gap-1.5 text-amber-500">
                            <Flame className="w-5 h-5 fill-amber-500" /> {streak} {streak === 1 ? 'Tag' : 'Tage'}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">{streak > 0 ? 'Kontinuierlich erfasst' : 'Starte heute'}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"><Calendar className="w-6 h-6" /></div>
                </div>

                <div className="p-4 rounded-xl bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
                    <div>
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Gesamte Einträge</div>
                        <div className="text-2xl font-bold mt-1">{filtered.length}</div>
                        <div className="text-xs text-gray-400 mt-1">{filter === '7d' ? 'Letzte 7 Tage' : filter === '30d' ? 'Letzte 30 Tage' : 'Insgesamt'}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"><BarChart3 className="w-6 h-6" /></div>
                </div>
            </div>

            {/* Empty State */}
            {filtered.length === 0 ? (
                <div className="p-8 rounded-2xl bg-white dark:bg-gray-800/60 border border-dashed border-gray-300 dark:border-gray-700 text-center">
                    <div className="inline-flex p-4 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-500 mb-3"><Smile className="w-8 h-8" /></div>
                    <h3 className="text-lg font-semibold">Noch keine Stimmungs-Check-ins erfasst</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mt-1 mb-6">
                        Erfasse mit einem Klick deine aktuelle Stimmung, um Trends im Zeitverlauf zu analysieren.
                    </p>
                    <div className="flex items-center justify-center gap-3 flex-wrap">
                        {(['good', 'okay', 'bad'] as MoodType[]).map((m) => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => void addMoodResponse(m)}
                                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${MOOD_MAP[m].bgBadge}`}
                            >
                                <span className="text-lg">{MOOD_MAP[m].emoji}</span> {MOOD_MAP[m].label}
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <>
                    {/* Charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Timeline */}
                        <div className="lg:col-span-2 p-5 rounded-2xl bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 shadow-sm relative">
                            <div className="mb-4">
                                <h3 className="font-semibold text-base flex items-center gap-2"><TrendingUp className="w-4 h-4 text-blue-500" /> Stimmungsverlauf</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Verlauf im Zeitablauf (Super, Okay, Schlecht)</p>
                            </div>
                            <div className="relative w-full overflow-hidden">
                                <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-44 sm:h-52 overflow-visible select-none">
                                    <defs>
                                        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                                            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                                        </linearGradient>
                                    </defs>
                                    {[3, 2, 1].map((s) => {
                                        const y = padY + (3 - s) * (plotH / 2);
                                        return (
                                            <g key={s}>
                                                <line x1={padX} y1={y} x2={svgW - padX} y2={y} stroke="currentColor" strokeDasharray="4 4" className="text-gray-200 dark:text-gray-700/60" strokeWidth="1" />
                                                <text x={padX - 8} y={y + 4} textAnchor="end" className="fill-gray-400 dark:fill-gray-500 text-[10px]">
                                                    {s === 3 ? 'Super' : s === 2 ? 'Okay' : 'Schlecht'}
                                                </text>
                                            </g>
                                        );
                                    })}
                                    {areaD && <path d={areaD} fill="url(#chartGrad)" />}
                                    {pathD && <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
                                    {timeline.map((p, i) => (
                                        <circle
                                            key={i}
                                            cx={p.x}
                                            cy={p.y}
                                            r="5"
                                            fill={MOOD_MAP[p.mood].color}
                                            stroke="#ffffff"
                                            strokeWidth="2"
                                            className="cursor-pointer transition-transform hover:scale-150 drop-shadow-sm"
                                            onMouseEnter={() => setHovered(p)}
                                            onMouseLeave={() => setHovered(null)}
                                        />
                                    ))}
                                </svg>
                                {hovered && (
                                    <div
                                        className="absolute z-10 pointer-events-none transform -translate-x-1/2 -translate-y-full px-2.5 py-1.5 rounded-lg bg-gray-900 text-white text-xs shadow-lg mb-2"
                                        style={{ left: `${(hovered.x / svgW) * 100}%`, top: `${(hovered.y / svgH) * 100}%` }}
                                    >
                                        <div className="font-semibold flex items-center gap-1">
                                            <span>{hovered.label}</span>
                                            <span className="text-gray-400 font-normal">({hovered.date}, {hovered.time})</span>
                                        </div>
                                        {hovered.note && <div className="text-[11px] text-gray-300 mt-0.5 truncate max-w-[150px]">„{hovered.note}“</div>}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Distribution */}
                        <div className="p-5 rounded-2xl bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between">
                            <div>
                                <h3 className="font-semibold text-base flex items-center gap-2"><BarChart3 className="w-4 h-4 text-blue-500" /> Stimmungsverteilung</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Prozentualer Anteil je Kategorie</p>
                                <div className="flex items-center justify-center my-2">
                                    <div className="relative w-28 h-28">
                                        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                                            {donut.map((s) => (
                                                <circle key={s.k} cx="50" cy="50" r="34" fill="transparent" stroke={s.meta.color} strokeWidth="12" strokeDasharray={s.da} strokeDashoffset={s.do} />
                                            ))}
                                        </svg>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                            <span className="text-xl font-bold">{filtered.length}</span>
                                            <span className="text-[9px] text-gray-400 uppercase tracking-wider">Logs</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-2.5 mt-2">
                                {donut.map((s) => (
                                    <div key={s.k} className="space-y-1">
                                        <div className="flex items-center justify-between text-xs font-medium">
                                            <span className="flex items-center gap-1.5"><span>{s.meta.emoji}</span><span>{s.meta.label}</span></span>
                                            <span className="text-gray-500 dark:text-gray-400">{s.count} ({s.pct}%)</span>
                                        </div>
                                        <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${s.pct}%`, backgroundColor: s.meta.color }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Time of Day */}
                    <div className="p-5 rounded-2xl bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 shadow-sm">
                        <div className="mb-4">
                            <h3 className="font-semibold text-base flex items-center gap-2"><Clock className="w-4 h-4 text-blue-500" /> Tageszeiten-Muster</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Durchschnittlicher Score (1: Schlecht, 2: Okay, 3: Super)</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {slots.map((s) => {
                                const fill = s.scoreNum > 0 ? ((s.scoreNum - 1) / 2) * 100 : 0;
                                return (
                                    <div key={s.id} className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-200/70 dark:border-gray-800 flex flex-col justify-between">
                                        <div>
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium text-sm">{s.label}</span>
                                                <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{s.avgStr !== '—' ? `${s.avgStr} / 3.0` : '—'}</span>
                                            </div>
                                            <div className="text-[11px] text-gray-400 mt-0.5">{s.range}</div>
                                        </div>
                                        <div className="mt-3">
                                            <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                                <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${Math.max(fill, 5)}%` }} />
                                            </div>
                                            <div className="text-[10px] text-gray-400 mt-1.5 text-right">{s.count} {s.count === 1 ? 'Eintrag' : 'Einträge'}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* History */}
                    <div className="p-5 rounded-2xl bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 shadow-sm">
                        <h3 className="font-semibold text-base flex items-center gap-2 mb-4"><Calendar className="w-4 h-4 text-blue-500" /> Erfasste Einträge ({filtered.length})</h3>
                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                            {filtered.slice(0, 15).map((r) => {
                                const mood = parseMoodData(r);
                                const meta = MOOD_MAP[mood.mood];
                                const d = new Date(r.created_at);
                                const isDel = deleteConfirmId === r.id;
                                return (
                                    <div key={r.id} className="py-3 flex items-center justify-between gap-3 text-sm hover:bg-gray-50/50 dark:hover:bg-gray-900/30 px-2 rounded-lg transition-colors">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${meta.bgBadge}`}>
                                                <span>{meta.emoji}</span><span>{meta.label}</span>
                                            </span>
                                            <div className="truncate">
                                                <div className="font-medium text-xs sm:text-sm text-gray-800 dark:text-gray-200">
                                                    {d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}{' '}
                                                    <span className="text-gray-400 font-normal">{d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                                {mood.note && <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{mood.note}</p>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {isDel ? (
                                                <div className="inline-flex items-center gap-1.5 bg-rose-50 dark:bg-rose-950/60 p-1 rounded-lg border border-rose-200 dark:border-rose-900">
                                                    <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium px-1">Löschen?</span>
                                                    <button type="button" onClick={() => void deleteResponse(r.id)} className="p-1 rounded hover:bg-rose-200 dark:hover:bg-rose-800 text-rose-700 dark:text-rose-300" title="Bestätigen"><Check className="w-3.5 h-3.5" /></button>
                                                    <button type="button" onClick={() => setDeleteConfirmId(null)} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500" title="Abbrechen"><X className="w-3.5 h-3.5" /></button>
                                                </div>
                                            ) : (
                                                <button type="button" onClick={() => setDeleteConfirmId(r.id)} className="p-1.5 text-gray-400 hover:text-rose-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Eintrag löschen"><Trash2 className="w-4 h-4" /></button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
