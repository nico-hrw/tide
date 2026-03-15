"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { StyleFile, CanvasElement, createEmptyStyleFile } from '@/types/canvas';
import { apiFetch } from '@/lib/api';

export interface UseStyleFileReturn {
    elements: CanvasElement[];
    isLoaded: boolean;
    save: (elements: CanvasElement[]) => Promise<void>;
    updateElement: (id: string, patch: Partial<CanvasElement>) => Promise<void>;
    addElement: (el: CanvasElement) => Promise<void>;
    removeElement: (id: string) => Promise<void>;
}

interface UseStyleFileProps {
    noteId: string | null;
    userId: string;
    privateKey: CryptoKey | null;
    publicKey: CryptoKey | null;
}

// The sidecar is a regular 'note' file in the DB with a dot-prefix title.
// Its title pattern is ".{noteId}_style" stored in public_meta.title.
// We look up its real UUID once, then cache it for subsequent uploads.
const SIDECAR_ID_CACHE = new Map<string, string>(); // noteId → DB file UUID

async function findSidecarFileId(noteId: string, userId: string): Promise<string | null> {
    if (SIDECAR_ID_CACHE.has(noteId)) return SIDECAR_ID_CACHE.get(noteId)!;
    try {
        const res = await apiFetch(`/api/v1/files?user_id=${userId}&recursive=true`);
        if (!res.ok) return null;
        const results = await res.json().catch(() => []);
        const files = (Array.isArray(results) ? results : []) as Array<{ id: string; public_meta?: { title?: string } }>;
        const sidecarTitle = `.${noteId}_style`;
        const found = files.find(f => f.public_meta?.title === sidecarTitle);
        if (found) { SIDECAR_ID_CACHE.set(noteId, found.id); return found.id; }
    } catch { /* ignore */ }
    return null;
}

async function createSidecarFileRecord(noteId: string, userId: string, size: number): Promise<string | null> {
    try {
        const res = await apiFetch('/api/v1/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'note',
                size,
                public_meta: { title: `.${noteId}_style` },
                secured_meta: '',
                visibility: 'public',
            }),
        });
        if (!res.ok) return null;
        const file = await res.json().catch(() => null) as { id: string } | null;
        if (!file || !file.id) return null;
        SIDECAR_ID_CACHE.set(noteId, file.id);
        return file.id;
    } catch { return null; }
}

export function useStyleFile({ noteId, userId }: UseStyleFileProps): UseStyleFileReturn {
    const [styleFile, setStyleFile] = useState<StyleFile | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const styleFileRef = useRef<StyleFile | null>(null);
    styleFileRef.current = styleFile;

    // ── Load ──────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!noteId || !userId) { setStyleFile(null); setIsLoaded(false); return; }
        let cancelled = false;

        async function load() {
            setIsLoaded(false);
            const fileId = await findSidecarFileId(noteId!, userId);

            if (!fileId) {
                // No sidecar yet – start fresh
                if (!cancelled) { setStyleFile(createEmptyStyleFile(noteId!)); setIsLoaded(true); }
                return;
            }

            try {
                const res = await apiFetch(`/api/v1/files/${fileId}/download`);
                if (!res.ok) {
                    if (!cancelled) { setStyleFile(createEmptyStyleFile(noteId!)); setIsLoaded(true); }
                    return;
                }
                const text = await res.text();
                if (!cancelled) {
                    try { setStyleFile(JSON.parse(text) as StyleFile); }
                    catch { setStyleFile(createEmptyStyleFile(noteId!)); }
                    setIsLoaded(true);
                }
            } catch {
                if (!cancelled) { setStyleFile(createEmptyStyleFile(noteId!)); setIsLoaded(true); }
            }
        }
        load();
        return () => { cancelled = true; };
    }, [noteId, userId]);

    // ── Persist ───────────────────────────────────────────────────────────────
    const persist = useCallback(async (next: StyleFile) => {
        if (!userId || !next.noteId) return;
        const blob = new Blob([JSON.stringify(next)], { type: 'application/json' });

        // Get or create the real DB file ID for this sidecar
        let fileId = await findSidecarFileId(next.noteId, userId);
        if (!fileId) {
            fileId = await createSidecarFileRecord(next.noteId, userId, blob.size);
        }
        if (!fileId) { console.error('[Sidecar] Failed to get/create sidecar record'); return; }

        await apiFetch(`/api/v1/files/${fileId}/upload`, {
            method: 'POST',
            body: blob,
        });
    }, [userId]);

    // ── Public API ────────────────────────────────────────────────────────────
    const save = useCallback(async (elements: CanvasElement[]) => {
        if (!noteId) return;
        const next: StyleFile = { version: 1, noteId, elements };
        setStyleFile(next);
        await persist(next);
    }, [noteId, persist]);

    const updateElement = useCallback(async (id: string, patch: Partial<CanvasElement>) => {
        const cur = styleFileRef.current; if (!cur) return;
        const next = { ...cur, elements: cur.elements.map(el => el.id === id ? { ...el, ...patch } as CanvasElement : el) };
        setStyleFile(next); await persist(next);
    }, [persist]);

    const addElement = useCallback(async (el: CanvasElement) => {
        const cur = styleFileRef.current; if (!cur) return;
        const next = { ...cur, elements: [...cur.elements, el] };
        setStyleFile(next); await persist(next);
    }, [persist]);

    const removeElement = useCallback(async (id: string) => {
        const cur = styleFileRef.current; if (!cur) return;
        const next = { ...cur, elements: cur.elements.filter(el => el.id !== id) };
        setStyleFile(next); await persist(next);
    }, [persist]);

    return { elements: styleFile?.elements ?? [], isLoaded, save, updateElement, addElement, removeElement };
}
