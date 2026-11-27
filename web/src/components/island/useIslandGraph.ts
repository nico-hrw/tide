'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDataStore } from '@/store/useDataStore';
import { useNoteLinkStore } from '@/store/useNoteLinkStore';
import { getPaletteCategories } from '@/lib/calendarColors';
import { onGraphEvent, type GraphEventDetail } from '@/lib/graphEvents';
import { GraphScene } from '@/lib/graphScene';
import { graphFrom } from '@/lib/noteGraphSource';
import { neighbourhood, type NoteGraph } from '@/lib/noteLinks';
import { retype } from '@/lib/typewriter';

const HOLD_MS = 3000;
const SETTLE_DELAY_MS = 150;

interface UseIslandGraphOptions {
    /** Title shown when the graph is not (the month name) */
    restTitle: string;
    /** Title shown while the graph is (the word "Links") */
    graphTitle: string;
    /** Only the resting island (month grid) may switch to the graph */
    enabled: boolean;
}

export interface IslandGraphView {
    /** Graph is showing (or fading in/out) instead of the month grid */
    on: boolean;
    title: string;
    noteCount: number;
    /** Callback refs for the box that sizes the canvas and for the canvas itself */
    bindHost: (el: HTMLDivElement | null) => void;
    bindCanvas: (el: HTMLCanvasElement | null) => void;
}

function pickTint(): string {
    const palette = getPaletteCategories(useDataStore.getState().calendarColorPalette);
    return palette[Math.floor(Math.random() * palette.length)]?.hex ?? '#5C6E6C';
}

/** The surroundings of the note the event is about, with the new note / new link taken out so it can animate in. */
function sceneFor(event: GraphEventDetail, graph: NoteGraph): { scene: NoteGraph; apply: (s: GraphScene, now: number, tint: string) => void } | null {
    if (graph.nodes.length === 0) return null;
    if (event.kind === 'note') {
        const created = graph.nodes.find((n) => n.id === event.id);
        if (!created) return null;
        const others: NoteGraph = { nodes: graph.nodes.filter((n) => n.id !== event.id), edges: graph.edges.filter((e) => e.a !== event.id && e.b !== event.id) };
        const mostLinked = [...others.nodes].sort((a, b) => b.degree - a.degree)[0]?.id;
        const centerId = event.contextId && others.nodes.some((n) => n.id === event.contextId) ? event.contextId : mostLinked;
        const scene = centerId ? neighbourhood(others, centerId) : others;
        return { scene, apply: (s, now, tint) => s.spawnNote({ id: created.id, title: created.title }, tint, now) };
    }
    const a = graph.nodes.find((n) => n.id === event.a);
    const b = graph.nodes.find((n) => n.id === event.b);
    if (!a || !b) return null;
    const near = neighbourhood(graph, a.id);
    const ids = new Set(near.nodes.map((n) => n.id));
    ids.add(b.id);
    const key = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);
    const target = key(a.id, b.id);
    const nodes = graph.nodes.filter((n) => ids.has(n.id)).map((n) => (n.id === a.id || n.id === b.id ? { ...n, degree: Math.max(0, n.degree - 1) } : n));
    // The new link is taken out of the picture; it is drawn when the animation runs. A link both ways already had its line.
    const edges = graph.edges.filter((e) => ids.has(e.a) && ids.has(e.b) && !(key(e.a, e.b) === target && e.weight === 1));
    return { scene: { nodes, edges }, apply: (s, now, tint) => { s.linkNotes(a.id, b.id, tint, now); } };
}

/**
 * The island's little graph moment: on a new note or a new link the month grid fades into the surroundings of that
 * note, the title is retyped to "Links", the new dot or line appears, and after a few seconds everything goes back.
 * Events that arrive meanwhile are dropped except the latest one, which runs afterwards.
 */
export function useIslandGraph({ restTitle, graphTitle, enabled }: UseIslandGraphOptions): IslandGraphView {
    const [on, setOn] = useState(false);
    const [typed, setTyped] = useState<string | null>(null);
    const [noteCount, setNoteCount] = useState(0);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const hostRef = useRef<HTMLDivElement | null>(null);

    const sceneRef = useRef<GraphScene | null>(null);
    const rafRef = useRef(0);
    const busyRef = useRef(false);
    const pendingRef = useRef<GraphEventDetail | null>(null);
    const runRef = useRef<(event: GraphEventDetail) => void>(() => {});
    const stopTypingRef = useRef<(() => void) | null>(null);
    const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
    const restTitleRef = useRef(restTitle);
    const graphTitleRef = useRef(graphTitle);
    useEffect(() => { restTitleRef.current = restTitle; graphTitleRef.current = graphTitle; });
    const bindHost = useCallback((el: HTMLDivElement | null) => { hostRef.current = el; }, []);
    const bindCanvas = useCallback((el: HTMLCanvasElement | null) => { canvasRef.current = el; }, []);

    const later = useCallback((ms: number, fn: () => void) => { timersRef.current.push(setTimeout(fn, ms)); }, []);

    const loop = useCallback(() => {
        cancelAnimationFrame(rafRef.current);
        const tick = (now: number) => {
            const scene = sceneRef.current;
            if (!scene) return;
            const more = scene.frame(now);
            if (more || busyRef.current) rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
    }, []);

    const finish = useCallback(() => {
        setOn(false);
        stopTypingRef.current = retype(graphTitleRef.current, restTitleRef.current, setTyped, () => {
            setTyped(null);
            busyRef.current = false;
            const next = pendingRef.current;
            pendingRef.current = null;
            if (next) runRef.current(next);
        });
    }, []);

    const run = useCallback((event: GraphEventDetail) => {
        const canvas = canvasRef.current;
        const host = hostRef.current;
        if (!canvas || !host) return;
        const data = useDataStore.getState();
        const graph = graphFrom(data.notes, useNoteLinkStore.getState().links, data.events, data.tasks);
        const plan = sceneFor(event, graph);
        if (!plan) return;
        busyRef.current = true;
        const w = Math.max(120, host.clientWidth);
        const h = Math.max(120, host.clientHeight);
        const scene = new GraphScene(canvas, { width: w, height: h, kind: 'island', maxNodes: 40 });
        scene.setGraph(plan.scene);
        sceneRef.current = scene;
        setNoteCount(graph.nodes.length);
        setOn(true);
        loop();
        stopTypingRef.current = retype(restTitleRef.current, graphTitleRef.current, setTyped, () => {
            plan.apply(scene, performance.now(), pickTint());
            loop();
            later(HOLD_MS, finish);
        });
    }, [finish, later, loop]);

    useEffect(() => { runRef.current = run; }, [run]);

    useEffect(() => {
        if (!enabled) return;
        return onGraphEvent((event) => {
            if (busyRef.current) { pendingRef.current = event; return; }
            // The new note may not be in the store yet when the event arrives
            void useNoteLinkStore.getState().hydrate().then(() => later(SETTLE_DELAY_MS, () => runRef.current(event)));
        });
    }, [enabled, later]);

    useEffect(() => () => {
        cancelAnimationFrame(rafRef.current);
        stopTypingRef.current?.();
        timersRef.current.forEach(clearTimeout);
        timersRef.current = [];
        busyRef.current = false;
    }, []);

    return { on, title: typed ?? restTitle, noteCount, bindHost, bindCanvas };
}
