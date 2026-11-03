import type { DataStoreSlice, SafesSlice } from './types';
import { apiFetch } from '@/lib/api';
import { saveNotesToOfflineCache } from './createNotesSlice';

export const DEFAULT_SAFES = ['Standard', 'Archiv'];
export const DEFAULT_ACTIVE_SAFES = ['Standard'];

export function loadCachedSafes(): string[] {
    if (typeof window === 'undefined') return DEFAULT_SAFES;
    try {
        const stored = localStorage.getItem('tide_safes');
        if (!stored) return DEFAULT_SAFES;
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
            const list = parsed.filter(
                (s): s is string => typeof s === 'string' && s.trim().length > 0
            );
            return list.includes('Standard') ? list : ['Standard', ...list];
        }
        return DEFAULT_SAFES;
    } catch {
        return DEFAULT_SAFES;
    }
}

export function loadCachedActiveSafes(): string[] {
    if (typeof window === 'undefined') return DEFAULT_ACTIVE_SAFES;
    try {
        const stored = localStorage.getItem('tide_active_safes');
        if (!stored) return DEFAULT_ACTIVE_SAFES;
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
            const list = parsed.filter(
                (s): s is string => typeof s === 'string' && s.trim().length > 0
            );
            return list.length > 0 ? list : DEFAULT_ACTIVE_SAFES;
        }
        return DEFAULT_ACTIVE_SAFES;
    } catch {
        return DEFAULT_ACTIVE_SAFES;
    }
}

export const createSafesSlice: DataStoreSlice<SafesSlice> = (set, get) => ({
    availableSafes: loadCachedSafes(),
    activeSafes: loadCachedActiveSafes(),

    setActiveSafes: (safes: string[]) => {
        const valid = safes.filter((s) => s && s.trim().length > 0);
        const resolved = valid.length > 0 ? valid : ['Standard'];
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem('tide_active_safes', JSON.stringify(resolved));
            } catch (e) {
                console.warn('Failed to save active safes to storage', e);
            }
        }
        set({ activeSafes: resolved });
    },

    toggleSafe: (safe: string) => {
        const trimmed = safe.trim();
        if (!trimmed) return;
        const current = get().activeSafes;
        let next: string[];
        if (current.includes(trimmed)) {
            if (current.length > 1) {
                next = current.filter((s) => s !== trimmed);
            } else {
                next = current;
            }
        } else {
            next = [...current, trimmed];
        }
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem('tide_active_safes', JSON.stringify(next));
            } catch (e) {
                console.warn('Failed to save active safes to storage', e);
            }
        }
        set({ activeSafes: next });
    },

    createSafe: (name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const current = get().availableSafes;
        if (current.includes(trimmed)) return;
        const next = [...current, trimmed];
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem('tide_safes', JSON.stringify(next));
            } catch (e) {
                console.warn('Failed to save available safes to storage', e);
            }
        }
        set({ availableSafes: next });
    },

    deleteSafe: (name: string) => {
        if (name === 'Standard') return; // Protect Standard safe
        const state = get();
        const nextAvailable = state.availableSafes.filter((s) => s !== name);
        let nextActive = state.activeSafes.filter((s) => s !== name);
        if (nextActive.length === 0) {
            nextActive = ['Standard'];
        }
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem('tide_safes', JSON.stringify(nextAvailable));
                localStorage.setItem('tide_active_safes', JSON.stringify(nextActive));
            } catch (e) {
                console.warn('Failed to save safes to storage', e);
            }
        }

        // Reassign all notes in this safe to 'Standard'
        const updatedNotes = state.notes.map((n) => {
            if ((n.safe || n.metadata?.safe) === name) {
                const nextMeta = { ...(n.metadata || {}), safe: 'Standard' };
                return { ...n, safe: 'Standard', metadata: nextMeta };
            }
            return n;
        });

        saveNotesToOfflineCache(updatedNotes);
        set({
            availableSafes: nextAvailable,
            activeSafes: nextActive,
            notes: updatedNotes,
        });
    },

    setNoteSafe: async (noteId: string, safeName: string) => {
        const state = get();
        const currentNote = state.notes.find((n) => n.id === noteId);

        // Optimistically update note in store and offline cache
        const updatedNotes = state.notes.map((n) => {
            if (n.id === noteId) {
                const nextMeta = { ...(n.metadata || {}), safe: safeName };
                return { ...n, safe: safeName, metadata: nextMeta };
            }
            return n;
        });
        saveNotesToOfflineCache(updatedNotes);

        const existingCache = state.metadataCache[noteId] || {};
        const updatedMetaCache = {
            ...state.metadataCache,
            [noteId]: {
                ...(typeof existingCache === 'object' ? existingCache : {}),
                safe: safeName,
            },
        };

        set({ notes: updatedNotes, metadataCache: updatedMetaCache });

        // Persist to backend if note exists
        try {
            const currentMeta = (currentNote?.metadata as Record<string, unknown>) || {};
            const newMetadata = { ...currentMeta, safe: safeName };
            await apiFetch(`/api/v1/files/${noteId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ metadata: newMetadata }),
            });
        } catch (err) {
            console.warn('[SAFES] Failed to persist note safe to backend', err);
        }
    },
});
