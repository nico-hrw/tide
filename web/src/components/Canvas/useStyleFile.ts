"use client";

import { useState, useEffect, useCallback } from 'react';
import * as Y from 'yjs';
import { CanvasElement, StyleFile } from '@/types/canvas';
import { apiFetch } from '@/lib/api';
import { useActiveNoteStore } from '@/store/activeNoteStore';

export interface OverlayStroke {
    id: string;
    tool?: 'pen' | 'marker' | string;
    color?: string;
    size?: number;
    opacity?: number;
    points: Array<{ x: number; y: number; p?: number }>;
    [key: string]: unknown;
}

export interface UseStyleFileReturn {
    elements: CanvasElement[];
    strokes: OverlayStroke[];
    isLoaded: boolean;
    save: (elements: CanvasElement[]) => Promise<void>;
    updateElement: (id: string, patch: Partial<CanvasElement>) => Promise<void>;
    addElement: (el: CanvasElement) => Promise<void>;
    removeElement: (id: string) => Promise<void>;
    addStroke: (stroke: OverlayStroke) => void;
    updateStroke: (id: string, patch: Partial<OverlayStroke>) => void;
    removeStroke: (id: string) => void;
    setStrokes: (strokes: OverlayStroke[]) => void;
    yOverlay: Y.Map<Y.Map<unknown>> | null;
}

interface UseStyleFileProps {
    noteId: string | null;
    userId: string;
    privateKey?: CryptoKey | null;
    publicKey?: CryptoKey | null;
    ydoc?: Y.Doc | null;
}

// Sidecar lookup cache: used ONLY for finding legacy .${noteId}_style files to migrate & delete.
export const sidecarCache = new Map<string, string | null>(); // noteId → DB file UUID or null
const migratedNotes = new Set<string>();

export function clearSidecarCache(noteId?: string): void {
    if (noteId) {
        sidecarCache.delete(noteId);
        migratedNotes.delete(noteId);
    } else {
        sidecarCache.clear();
        migratedNotes.clear();
    }
}

async function findLegacySidecarFileId(noteId: string, userId: string): Promise<string | null> {
    if (sidecarCache.has(noteId)) return sidecarCache.get(noteId) ?? null;
    let foundId: string | null = null;
    try {
        const res = await apiFetch(`/api/v1/files?user_id=${userId}&recursive=true`);
        if (res.ok) {
            const results = await res.json().catch(() => []);
            const files = (Array.isArray(results) ? results : []) as Array<{ id: string; public_meta?: { title?: string } }>;
            const sidecarTitle = `.${noteId}_style`;
            const found = files.find(f => f.public_meta?.title === sidecarTitle);
            if (found) {
                foundId = found.id;
            }
        }
    } catch { /* ignore */ }
    sidecarCache.set(noteId, foundId);
    return foundId;
}

async function deleteLegacySidecar(fileId: string): Promise<void> {
    try {
        const res = await apiFetch(`/api/v1/files/${fileId}`, { method: 'DELETE' });
        if (!res.ok) {
            await apiFetch(`/api/files/${fileId}`, { method: 'DELETE' }).catch(() => {});
        }
    } catch { /* ignore */ }
}

export function useStyleFile({ noteId, userId, ydoc: propYDoc }: UseStyleFileProps): UseStyleFileReturn {
    const storeYDoc = useActiveNoteStore(s => s.activeYDoc);
    const [fallbackDoc] = useState(() => new Y.Doc());
    const ydoc = propYDoc || storeYDoc || fallbackDoc;
    const yOverlay = ydoc.getMap<Y.Map<unknown>>('overlay');

    const [elements, setElements] = useState<CanvasElement[]>([]);
    const [strokes, setStrokesState] = useState<OverlayStroke[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    // ── Yjs yOverlay Connection & Legacy Migration ─────────────────────────────
    useEffect(() => {
        if (!noteId || !userId) {
            return;
        }

        const syncFromYOverlay = () => {
            const nextElements: CanvasElement[] = [];
            const nextStrokes: OverlayStroke[] = [];

            yOverlay.forEach((val, key) => {
                const item = val instanceof Y.Map ? (val.toJSON() as Record<string, unknown>) : (val as Record<string, unknown>);
                if (!item) return;
                if (Array.isArray(item.points)) {
                    nextStrokes.push({
                        id: (typeof item.id === 'string' ? item.id : key),
                        tool: (typeof item.tool === 'string' ? item.tool : 'pen'),
                        color: (typeof item.color === 'string' ? item.color : '#111827'),
                        size: (typeof item.size === 'number' ? item.size : 3),
                        opacity: (typeof item.opacity === 'number' ? item.opacity : 1),
                        points: item.points as Array<{ x: number; y: number; p?: number }>,
                        ...item,
                    } as OverlayStroke);
                } else if (item.type === 'image' || item.type === 'text-widget' || item.anchorBlockId !== undefined) {
                    nextElements.push({ id: (typeof item.id === 'string' ? item.id : key), ...item } as unknown as CanvasElement);
                }
            });

            setElements(nextElements);
            setStrokesState(nextStrokes);
            setIsLoaded(true);
        };

        yOverlay.observeDeep(syncFromYOverlay);
        syncFromYOverlay();

        // One-time migration: If yOverlay.size === 0, check if legacy .${noteId}_style exists
        if (yOverlay.size === 0 && !migratedNotes.has(noteId)) {
            migratedNotes.add(noteId);
            findLegacySidecarFileId(noteId, userId).then(async (legacyId) => {
                if (!legacyId) {
                    setIsLoaded(true);
                    return;
                }
                try {
                    const res = await apiFetch(`/api/v1/files/${legacyId}/download`);
                    if (res.ok) {
                        const text = await res.text();
                        try {
                            const data = JSON.parse(text) as Partial<StyleFile> & { strokes?: OverlayStroke[] };
                            const legStrokes = Array.isArray(data.strokes) ? data.strokes : [];
                            const legElements = Array.isArray(data.elements) ? data.elements : [];

                            if (legStrokes.length > 0 || legElements.length > 0) {
                                ydoc.transact(() => {
                                    for (const s of legStrokes) {
                                        if (!s) continue;
                                        const sId = s.id || crypto.randomUUID();
                                        const sMap = new Y.Map<unknown>();
                                        for (const [k, v] of Object.entries(s)) sMap.set(k, v);
                                        yOverlay.set(sId, sMap);
                                    }
                                    for (const el of legElements) {
                                        if (!el) continue;
                                        const elId = el.id || crypto.randomUUID();
                                        const elMap = new Y.Map<unknown>();
                                        for (const [k, v] of Object.entries(el)) elMap.set(k, v);
                                        yOverlay.set(elId, elMap);
                                    }
                                });
                            }
                        } catch (parseErr) {
                            console.error('[Overlay Migration] Parse error:', parseErr);
                        }
                        await deleteLegacySidecar(legacyId);
                        sidecarCache.delete(noteId);
                    }
                } catch (fetchErr) {
                    console.error('[Overlay Migration] Legacy download error:', fetchErr);
                }
            });
        }

        return () => {
            yOverlay.unobserveDeep(syncFromYOverlay);
        };
    }, [noteId, userId, ydoc, yOverlay]);

    // ── Element Operations (via yOverlay) ──────────────────────────────────────
    const save = useCallback(async (newElements: CanvasElement[]) => {
        ydoc.transact(() => {
            for (const el of newElements) {
                let elMap = yOverlay.get(el.id);
                if (!elMap || !(elMap instanceof Y.Map)) {
                    elMap = new Y.Map<unknown>();
                    yOverlay.set(el.id, elMap);
                }
                for (const [k, v] of Object.entries(el)) {
                    elMap.set(k, v);
                }
            }
        });
    }, [ydoc, yOverlay]);

    const updateElement = useCallback(async (id: string, patch: Partial<CanvasElement>) => {
        const elMap = yOverlay.get(id);
        if (elMap && elMap instanceof Y.Map) {
            ydoc.transact(() => {
                for (const [k, v] of Object.entries(patch)) {
                    elMap.set(k, v);
                }
            });
        }
    }, [ydoc, yOverlay]);

    const addElement = useCallback(async (el: CanvasElement) => {
        const elMap = new Y.Map<unknown>();
        for (const [k, v] of Object.entries(el)) {
            elMap.set(k, v);
        }
        ydoc.transact(() => {
            yOverlay.set(el.id, elMap);
        });
    }, [ydoc, yOverlay]);

    const removeElement = useCallback(async (id: string) => {
        ydoc.transact(() => {
            yOverlay.delete(id);
        });
    }, [ydoc, yOverlay]);

    // ── Stroke Operations (via yOverlay) ───────────────────────────────────────
    const addStroke = useCallback((stroke: OverlayStroke) => {
        const strokeId = stroke.id || crypto.randomUUID();
        const strokeMap = new Y.Map<unknown>();
        for (const [k, v] of Object.entries(stroke)) {
            strokeMap.set(k, v);
        }
        ydoc.transact(() => {
            yOverlay.set(strokeId, strokeMap);
        });
    }, [ydoc, yOverlay]);

    const updateStroke = useCallback((id: string, patch: Partial<OverlayStroke>) => {
        const strokeMap = yOverlay.get(id);
        if (strokeMap && strokeMap instanceof Y.Map) {
            ydoc.transact(() => {
                for (const [k, v] of Object.entries(patch)) {
                    strokeMap.set(k, v);
                }
            });
        }
    }, [ydoc, yOverlay]);

    const removeStroke = useCallback((id: string) => {
        ydoc.transact(() => {
            yOverlay.delete(id);
        });
    }, [ydoc, yOverlay]);

    const setStrokes = useCallback((newStrokes: OverlayStroke[]) => {
        ydoc.transact(() => {
            yOverlay.forEach((val, key) => {
                const item = val instanceof Y.Map ? (val.toJSON() as Record<string, unknown>) : (val as Record<string, unknown>);
                if (item && Array.isArray(item.points)) {
                    yOverlay.delete(key);
                }
            });
            for (const stroke of newStrokes) {
                const strokeId = stroke.id || crypto.randomUUID();
                const strokeMap = new Y.Map<unknown>();
                for (const [k, v] of Object.entries(stroke)) {
                    strokeMap.set(k, v);
                }
                yOverlay.set(strokeId, strokeMap);
            }
        });
    }, [ydoc, yOverlay]);

    return {
        elements,
        strokes,
        isLoaded,
        save,
        updateElement,
        addElement,
        removeElement,
        addStroke,
        updateStroke,
        removeStroke,
        setStrokes,
        yOverlay,
    };
}
