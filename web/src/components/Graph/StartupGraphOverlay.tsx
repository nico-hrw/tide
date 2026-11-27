"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronsRight } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { useNoteLinkStore } from '@/store/useNoteLinkStore';
import { getPaletteCategories } from '@/lib/calendarColors';
import { graphFrom } from '@/lib/noteGraphSource';
import { visibleGraphNotes } from '@/lib/graphVisibility';
import { StartupGraph, type StartupNodeInput } from '@/lib/startupGraph';
import {
    ageInDays,
    MONTH_DAYS,
    noteCreatedMs,
    recentCounts,
    shouldPlayStartup,
    STARTUP_LAST_SHOWN_KEY,
    STARTUP_SESSION_KEY,
} from '@/lib/recentNotes';
import { useIslandText } from '@/components/island/islandText';

const MAX_DOTS = 260;
/** Waits for the note list to settle after the first notes arrive, so the counts are not half-loaded. */
const SETTLE_MS = 1800;

function readLastShown(): number | null {
    try {
        const raw = localStorage.getItem(STARTUP_LAST_SHOWN_KEY);
        const n = raw ? Number(raw) : NaN;
        return Number.isFinite(n) ? n : null;
    } catch {
        return null;
    }
}

/** Notes (as dots) with their age; all recent ones, the rest by number of links. Titles never leave this function. */
function buildStartupData(nowMs: number): { nodes: StartupNodeInput[]; edges: Array<{ a: string; b: string }>; month: number } {
    const data = useDataStore.getState();
    const graph = graphFrom(data.notes, useNoteLinkStore.getState().links);
    const created = new Map(data.notes.map((n) => [n.id, noteCreatedMs(n)]));
    const notes = graph.nodes.filter((n) => n.kind === 'note');
    const all: StartupNodeInput[] = notes.map((n) => {
        const ms = created.get(n.id) ?? null;
        return { id: n.id, degree: n.degree, ageDays: ms === null ? 9999 : ageInDays(ms, nowMs) };
    });
    const recent = all.filter((n) => n.ageDays < MONTH_DAYS);
    const rest = all.filter((n) => n.ageDays >= MONTH_DAYS).sort((a, b) => b.degree - a.degree).slice(0, Math.max(0, MAX_DOTS - recent.length));
    const nodes = [...rest, ...recent];
    const keep = new Set(nodes.map((n) => n.id));
    const edges = graph.edges.filter((e) => keep.has(e.a) && keep.has(e.b)).map((e) => ({ a: e.a, b: e.b }));
    return { nodes, edges, month: recent.length };
}

/**
 * Now and then at the start: a short animation of which notes were added in the last month and the last week.
 * Plays at most once per session and only after a few days without it; a big button (and Escape) skips it.
 */
export default function StartupGraphOverlay() {
    const enabled = useDataStore((s) => s.graphAnimation);
    const noteCount = useDataStore((s) => s.notes.length);
    const text = useIslandText();
    const [playing, setPlaying] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const [counts, setCounts] = useState({ month: 0, week: 0, phase: 'all' as 'all' | 'month' | 'week' });
    const decided = useRef(false);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const rafRef = useRef(0);

    // Decide once per page load, shortly after the first notes arrived.
    useEffect(() => {
        if (decided.current || noteCount === 0) return;
        const timer = setTimeout(() => {
            if (decided.current) return;
            decided.current = true;
            const nowMs = Date.now();
            const data = useDataStore.getState();
            const visible = new Set(visibleGraphNotes(data.notes).map((n) => n.id));
            const created = data.notes.filter((n) => visible.has(n.id)).map(noteCreatedMs);
            const ok = shouldPlayStartup({
                enabled,
                reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
                alreadyThisSession: sessionStorage.getItem(STARTUP_SESSION_KEY) === '1',
                lastShown: readLastShown(),
                nowMs,
                monthCount: recentCounts(created, nowMs).month,
            });
            if (!ok || document.visibilityState !== 'visible') return;
            // Counted as shown from the start: skipping it must not bring it back on the next start.
            try {
                sessionStorage.setItem(STARTUP_SESSION_KEY, '1');
                localStorage.setItem(STARTUP_LAST_SHOWN_KEY, String(nowMs));
            } catch { /* private mode: it just may come again */ }
            void useNoteLinkStore.getState().hydrate().finally(() => setPlaying(true));
        }, SETTLE_MS);
        return () => clearTimeout(timer);
    }, [noteCount, enabled]);

    const finish = useCallback(() => {
        cancelAnimationFrame(rafRef.current);
        setLeaving(true);
        setTimeout(() => { setPlaying(false); setLeaving(false); }, 320);
    }, []);

    useEffect(() => {
        if (!playing) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const nowMs = Date.now();
        const { nodes, edges } = buildStartupData(nowMs);
        if (nodes.length === 0) { setPlaying(false); return; }
        const palette = getPaletteCategories(useDataStore.getState().calendarColorPalette);
        const width = window.innerWidth;
        const height = window.innerHeight;
        const scene = new StartupGraph(canvas, {
            width, height, nodes, edges,
            monthColor: palette[1]?.hex ?? '#A6B7A8',
            weekColor: palette[2]?.hex ?? '#D2A96A',
        });
        const start = performance.now();
        let last = { month: -1, week: -1, phase: 'all' as 'all' | 'month' | 'week' };
        const tick = (now: number) => {
            const t = now - start;
            scene.draw(t);
            const s = scene.stateAt(t);
            if (s.month !== last.month || s.week !== last.week || s.phase !== last.phase) { last = s; setCounts(s); }
            if (t >= scene.durationMs) { finish(); return; }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') finish(); };
        window.addEventListener('keydown', onKey);
        return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('keydown', onKey); };
    }, [playing, finish]);

    if (!playing || typeof document === 'undefined') return null;

    const phaseText = counts.phase === 'all' ? text.tr('startupAll') : counts.phase === 'month' ? text.tr('startupMonthPhase') : text.tr('startupWeekPhase');
    const palette = getPaletteCategories(useDataStore.getState().calendarColorPalette);

    return createPortal(
        <div
            role="dialog"
            aria-label={text.tr('startupTitle')}
            className={`fixed inset-0 z-[300] bg-t2-bg text-t2-ink transition-opacity duration-300 ${leaving ? 'opacity-0' : 'opacity-100 animate-in fade-in duration-500'}`}
        >
            <canvas ref={canvasRef} className="absolute inset-0 block text-t2-ink" aria-hidden="true" />
            <div className="pointer-events-none absolute left-6 top-6">
                <p className="text-[17px] font-medium">{text.tr('startupTitle')}</p>
                <p className="mt-0.5 text-[13px] text-t2-ink-3">{phaseText}</p>
            </div>
            <div className="pointer-events-none absolute bottom-7 left-6 flex flex-col gap-1.5 text-[14px] text-t2-ink-2">
                <p className={`flex items-center gap-2 transition-opacity duration-500 ${counts.phase === 'all' ? 'opacity-0' : 'opacity-100'}`}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: palette[1]?.hex ?? '#A6B7A8' }} />
                    {text.tr('startupMonthLabel')} <b className="font-medium text-t2-ink">{text.tr('startupNew', { n: counts.month })}</b>
                </p>
                <p className={`flex items-center gap-2 transition-opacity duration-500 ${counts.phase === 'week' ? 'opacity-100' : 'opacity-0'}`}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: palette[2]?.hex ?? '#D2A96A' }} />
                    {text.tr('startupWeekLabel')} <b className="font-medium text-t2-ink">{text.tr('startupNew', { n: counts.week })}</b>
                </p>
            </div>
            <button
                type="button"
                onClick={finish}
                className="absolute right-6 inline-flex h-14 items-center gap-2 rounded-full bg-t2-ink px-8 text-[17px] font-semibold text-t2-bg shadow-lg transition-opacity hover:opacity-90 cursor-pointer"
                style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
            >
                {text.tr('startupSkip')}
                <ChevronsRight size={20} aria-hidden="true" />
            </button>
        </div>,
        document.body,
    );
}
