"use client";

import React, { useEffect, useRef, useState } from 'react';
import { askConfirm } from '@/lib/feedback';
import { GraphScene } from '@/lib/graphScene';
import { useNoteGraph } from '@/lib/noteGraphSource';
import { useNoteLinkStore } from '@/store/useNoteLinkStore';
import { SettingsCard, SettingsRow } from '../ui/SettingsLayout';
import { useT } from '../useT';

const HEIGHT = 320;

/**
 * The note graph as a calm force layout: linked notes hang together, others drift apart. Hover a dot to see its
 * neighbours and title, drag to move. Only shows notes the user can see; the data never leaves this device.
 */
export function NoteGraphView() {
    const t = useT();
    const graph = useNoteGraph();
    const indexedCount = useNoteLinkStore((s) => Object.keys(s.indexed).length);
    const hostRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sceneRef = useRef<GraphScene | null>(null);
    const rafRef = useRef(0);
    const [width, setWidth] = useState(0);

    useEffect(() => { void useNoteLinkStore.getState().hydrate(); }, []);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const ro = new ResizeObserver(() => setWidth(Math.round(host.clientWidth)));
        ro.observe(host);
        setWidth(Math.round(host.clientWidth));
        return () => ro.disconnect();
    }, []);

    const run = () => {
        cancelAnimationFrame(rafRef.current);
        const tick = (now: number) => {
            const scene = sceneRef.current;
            if (scene && scene.frame(now)) rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || width < 80) return;
        const scene = new GraphScene(canvas, { width, height: HEIGHT, kind: 'full', maxNodes: 220 });
        scene.setGraph(graph);
        sceneRef.current = scene;
        run();
        return () => { cancelAnimationFrame(rafRef.current); sceneRef.current = null; };
    }, [graph, width]);

    const local = (e: React.PointerEvent): { x: number; y: number } => {
        const r = canvasRef.current!.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const dragging = useRef(false);

    const onDown = (e: React.PointerEvent) => {
        const scene = sceneRef.current;
        if (!scene) return;
        const p = local(e);
        const id = scene.pick(p.x, p.y);
        if (!id) return;
        dragging.current = true;
        scene.startDrag(id);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        run();
    };
    const onMove = (e: React.PointerEvent) => {
        const scene = sceneRef.current;
        if (!scene) return;
        const p = local(e);
        if (dragging.current) { scene.dragTo(p.x, p.y); run(); return; }
        scene.highlight(scene.pick(p.x, p.y));
        run();
    };
    const onUp = () => { dragging.current = false; sceneRef.current?.endDrag(); };
    const onLeave = () => { if (!dragging.current) { sceneRef.current?.highlight(null); run(); } };

    const linked = graph.edges.length;
    const clear = async () => {
        const ok = await askConfirm({ title: t('notes.graphClearTitle'), message: t('notes.graphClearMsg'), confirmLabel: t('notes.graphClearBtn'), tone: 'danger' });
        if (ok) useNoteLinkStore.getState().clear();
    };

    return (
        <SettingsCard>
            <div className="px-4 pt-4">
                <div ref={hostRef} className="relative w-full overflow-hidden rounded-xl bg-t2-sub" style={{ height: HEIGHT }}>
                    <canvas
                        ref={canvasRef}
                        role="img"
                        aria-label={t('notes.graphLabel')}
                        className="block cursor-grab touch-none text-t2-ink active:cursor-grabbing"
                        onPointerDown={onDown}
                        onPointerMove={onMove}
                        onPointerUp={onUp}
                        onPointerCancel={onUp}
                        onPointerLeave={onLeave}
                    />
                    {linked === 0 && (
                        <p className="pointer-events-none absolute inset-x-6 bottom-4 text-center text-[12.5px] text-t2-ink-3">{t('notes.graphEmpty')}</p>
                    )}
                </div>
                <p className="px-1 pb-3 pt-2 text-[12px] text-t2-ink-3">
                    {t('notes.graphCoverage', { indexed: Math.min(indexedCount, graph.nodes.length), total: graph.nodes.length })}
                </p>
            </div>
            <SettingsRow title={t('notes.graphClear')} description={t('notes.graphClearDesc')}>
                <button
                    type="button"
                    onClick={() => { void clear(); }}
                    className="rounded-lg bg-t2-sub px-3 py-1.5 text-[13px] font-medium text-t2-ink transition-colors hover:bg-t2-hover cursor-pointer"
                >
                    {t('notes.graphClearBtn')}
                </button>
            </SettingsRow>
        </SettingsCard>
    );
}

export default NoteGraphView;
