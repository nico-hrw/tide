import type { DataStoreSlice, SafesSlice } from './types';
import { apiFetch } from '@/lib/api';
import {
    decryptSecuredEnvelope,
    encryptSecuredEnvelope,
    isExplicitlyUnencryptedFile,
    stripSensitiveFileMetadata,
} from '@/lib/e2eePayload';
import { syncCreateWorkspace, syncDeleteWorkspace, syncActiveWorkspaces } from '../../lib/settingsSync';
import { saveNotesToOfflineCache } from './createNotesSlice';

export const DEFAULT_SAFES = ['main', 'Archiv'];
export const DEFAULT_ACTIVE_SAFES = ['main'];

export function loadCachedSafes(): string[] {
    if (typeof window === 'undefined') return DEFAULT_SAFES;
    try {
        const stored = localStorage.getItem('tide_safes');
        if (!stored) return DEFAULT_SAFES;
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
            const list = parsed
                .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
                .map((s) => (s === 'Standard' ? 'main' : s));
            const unique = Array.from(new Set(list));
            const result = unique.includes('main') ? unique : ['main', ...unique];
            if (JSON.stringify(result) !== stored) {
                try {
                    localStorage.setItem('tide_safes', JSON.stringify(result));
                } catch (_) {}
            }
            return result;
        }
        return DEFAULT_SAFES;
    } catch {
        return DEFAULT_SAFES;
    }
}

const DEFAULT_SAFE_KEY = 'tide_default_safe';
const SAFE_ICONS_KEY = 'tide_safe_icons';

function loadSafeIcons(): Record<string, string> {
    if (typeof window === 'undefined') return {};
    try {
        const raw = localStorage.getItem(SAFE_ICONS_KEY);
        if (!raw) return {};
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === 'string' && v.trim()) out[k === 'Standard' ? 'main' : k] = v.trim();
        }
        return out;
    } catch {
        return {};
    }
}

function loadDefaultSafe(): string | null {
    if (typeof window === 'undefined') return null;
    try {
        const v = localStorage.getItem(DEFAULT_SAFE_KEY);
        return v && v.trim() ? v : null;
    } catch {
        return null;
    }
}

export function loadCachedActiveSafes(): string[] {
    if (typeof window === 'undefined') return DEFAULT_ACTIVE_SAFES;
    try {
        const stored = localStorage.getItem('tide_active_safes');
        if (!stored) return DEFAULT_ACTIVE_SAFES;
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
            const list = parsed
                .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
                .map((s) => (s === 'Standard' ? 'main' : s));
            const unique = Array.from(new Set(list));
            const result = unique.length > 0 ? unique : DEFAULT_ACTIVE_SAFES;
            if (JSON.stringify(result) !== stored) {
                try {
                    localStorage.setItem('tide_active_safes', JSON.stringify(result));
                } catch (_) {}
            }
            return result;
        }
        return DEFAULT_ACTIVE_SAFES;
    } catch {
        return DEFAULT_ACTIVE_SAFES;
    }
}

export const createSafesSlice: DataStoreSlice<SafesSlice> = (set, get) => ({
    availableSafes: loadCachedSafes(),
    activeSafes: loadCachedActiveSafes(),
    safeIcons: loadSafeIcons(),
    setSafeIcon: (safe, icon) => {
        const key = safe === 'Standard' ? 'main' : safe.trim();
        if (!key) return;
        const next = { ...get().safeIcons };
        const trimmed = icon?.trim() ?? '';
        if (trimmed) next[key] = trimmed;
        else delete next[key];
        try {
            if (typeof window !== 'undefined') localStorage.setItem(SAFE_ICONS_KEY, JSON.stringify(next));
        } catch { /* private mode */ }
        set({ safeIcons: next });
    },
    defaultSafe: loadDefaultSafe(),
    setDefaultSafe: (name) => {
        const next = name && name.trim() ? (name === 'Standard' ? 'main' : name.trim()) : null;
        try {
            if (next) localStorage.setItem(DEFAULT_SAFE_KEY, next);
            else localStorage.removeItem(DEFAULT_SAFE_KEY);
        } catch { /* private mode */ }
        set({ defaultSafe: next });
    },

    setActiveSafes: (safes: string[]) => {
        const valid = safes
            .filter((s) => s && s.trim().length > 0)
            .map((s) => (s === 'Standard' ? 'main' : s));
        const resolved = valid.length > 0 ? Array.from(new Set(valid)) : ['main'];
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem('tide_active_safes', JSON.stringify(resolved));
            } catch (e) {
                console.warn('Failed to save active safes to storage', e);
            }
        }
        set({ activeSafes: resolved });
        syncActiveWorkspaces(resolved);
    },

    toggleSafe: (safe: string) => {
        const trimmed = safe.trim();
        if (!trimmed) return;
        const normalized = trimmed === 'Standard' ? 'main' : trimmed;
        const current = get().activeSafes;
        let next: string[];
        if (current.includes(normalized)) {
            if (current.length > 1) {
                next = current.filter((s) => s !== normalized);
            } else {
                next = current;
            }
        } else {
            next = [...current, normalized];
        }
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem('tide_active_safes', JSON.stringify(next));
            } catch (e) {
                console.warn('Failed to save active safes to storage', e);
            }
        }
        set({ activeSafes: next });
        syncActiveWorkspaces(next);
    },

    createSafe: (name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const normalized = trimmed === 'Standard' ? 'main' : trimmed;
        const current = get().availableSafes;
        if (current.includes(normalized)) return;
        const next = [...current, normalized];
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem('tide_safes', JSON.stringify(next));
            } catch (e) {
                console.warn('Failed to save available safes to storage', e);
            }
        }
        set({ availableSafes: next });
        syncCreateWorkspace(normalized);
    },

    deleteSafe: (name: string) => {
        const trimmed = name.trim();
        const normalized = trimmed === 'Standard' ? 'main' : trimmed;
        if (!normalized || normalized === 'main') return; // Protect default safe
        const state = get();
        const nextAvailable = state.availableSafes.filter((s) => s !== normalized);
        let nextActive = state.activeSafes.filter((s) => s !== normalized);
        if (nextActive.length === 0) {
            nextActive = ['main'];
        }
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem('tide_safes', JSON.stringify(nextAvailable));
                localStorage.setItem('tide_active_safes', JSON.stringify(nextActive));
            } catch (e) {
                console.warn('Failed to save safes to storage', e);
            }
        }

        // Reassign all notes in this safe to 'main'
        const updatedNotes = state.notes.map((n) => {
            if ((n.safe || n.metadata?.safe) === normalized) {
                const nextMeta = { ...(n.metadata || {}), safe: 'main' };
                return { ...n, safe: 'main', metadata: nextMeta };
            }
            return n;
        });

        saveNotesToOfflineCache(updatedNotes);
        set({
            availableSafes: nextAvailable,
            activeSafes: nextActive,
            notes: updatedNotes,
        });
        syncDeleteWorkspace(normalized);
    },

    setNoteSafe: async (noteId: string, safeName: string) => {
        const normalized = safeName === 'Standard' ? 'main' : safeName;
        const state = get();
        const currentNote = state.notes.find((n) => n.id === noteId);

        // Optimistically update note in store and offline cache
        const updatedNotes = state.notes.map((n) => {
            if (n.id === noteId) {
                const nextMeta = { ...(n.metadata || {}), safe: normalized };
                return { ...n, safe: normalized, metadata: nextMeta };
            }
            return n;
        });
        saveNotesToOfflineCache(updatedNotes);

        const existingCache = state.metadataCache[noteId] || {};
        const updatedMetaCache = {
            ...state.metadataCache,
            [noteId]: {
                ...(typeof existingCache === 'object' ? existingCache : {}),
                safe: normalized,
            },
        };

        set({ notes: updatedNotes, metadataCache: updatedMetaCache });

        // Persist to backend if note exists
        try {
            const currentMeta = (currentNote?.metadata as Record<string, unknown>) || {};
            const authState = get() as { publicKey?: CryptoKey | null; privateKey?: CryptoKey | null; myId?: string | null };
            const isOpenNote = currentNote?.visibility === 'public' || isExplicitlyUnencryptedFile(currentNote);

            if (!isOpenNote && currentNote && authState.publicKey && authState.privateKey) {
                let decryptedBase: Record<string, unknown> = {};
                if (typeof currentNote.secured_meta === 'string' && currentNote.secured_meta.trim().length > 0) {
                    const dec = await decryptSecuredEnvelope(currentNote.secured_meta, authState.privateKey, {
                        accessKeys: currentNote.access_keys,
                        myId: authState.myId,
                    });
                    if (!dec.isLocked) decryptedBase = dec;
                }
                const payloadToEncrypt: Record<string, unknown> = {
                    ...decryptedBase,
                    ...(decryptedBase.title !== undefined ? {} : currentNote.title ? { title: currentNote.title } : {}),
                    ...(Array.isArray(currentNote.linkedSafes) && decryptedBase.linkedSafes === undefined
                        ? { linkedSafes: currentNote.linkedSafes }
                        : {}),
                    ...(Array.isArray(currentNote.tagIds) && decryptedBase.tagIds === undefined
                        ? { tagIds: currentNote.tagIds }
                        : {}),
                    safe: normalized,
                };
                const securedMeta = await encryptSecuredEnvelope(payloadToEncrypt, authState.publicKey);
                const strippedMetadata = stripSensitiveFileMetadata(currentMeta);
                await apiFetch(`/api/v1/files/${noteId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ secured_meta: securedMeta, metadata: strippedMetadata }),
                });
                set((s) => ({
                    notes: s.notes.map((n) =>
                        n.id === noteId ? { ...n, secured_meta: securedMeta, metadata: strippedMetadata } : n
                    ),
                }));
            } else {
                const newMetadata = { ...currentMeta, safe: normalized };
                await apiFetch(`/api/v1/files/${noteId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ metadata: newMetadata }),
                });
            }
        } catch (err) {
            console.warn('[SAFES] Failed to persist note safe to backend', err);
        }
    },

    linkNoteToSafe: async (noteId: string, targetSafe: string) => {
        const normTarget = (targetSafe === 'Standard' ? 'main' : targetSafe).trim();
        if (!normTarget || !noteId) return;
        const state = get();
        const currentNote = state.notes.find((n) => n.id === noteId);
        if (!currentNote) return;

        const rawLinked: string[] = Array.isArray(currentNote.linkedSafes)
            ? currentNote.linkedSafes
            : Array.isArray(currentNote.metadata?.linkedSafes)
            ? currentNote.metadata.linkedSafes
            : [];
        const normalizedLinked = rawLinked.map((s) => (s === 'Standard' ? 'main' : s));

        if (normalizedLinked.includes(normTarget)) return;

        const nextLinked = [...normalizedLinked, normTarget];

        const updatedNotes = state.notes.map((n) => {
            if (n.id === noteId) {
                const nextMeta = { ...(n.metadata || {}), linkedSafes: nextLinked };
                return { ...n, linkedSafes: nextLinked, metadata: nextMeta };
            }
            return n;
        });
        saveNotesToOfflineCache(updatedNotes);

        const existingCache = state.metadataCache[noteId] || {};
        const updatedMetaCache = {
            ...state.metadataCache,
            [noteId]: {
                ...(typeof existingCache === 'object' ? existingCache : {}),
                linkedSafes: nextLinked,
            },
        };

        set({ notes: updatedNotes, metadataCache: updatedMetaCache });

        try {
            const currentMeta = (currentNote?.metadata as Record<string, unknown>) || {};
            const authState = get() as { publicKey?: CryptoKey | null; privateKey?: CryptoKey | null; myId?: string | null };
            const isOpenNote = currentNote?.visibility === 'public' || isExplicitlyUnencryptedFile(currentNote);

            if (!isOpenNote && authState.publicKey && authState.privateKey) {
                let decryptedBase: Record<string, unknown> = {};
                if (typeof currentNote.secured_meta === 'string' && currentNote.secured_meta.trim().length > 0) {
                    const dec = await decryptSecuredEnvelope(currentNote.secured_meta, authState.privateKey, {
                        accessKeys: currentNote.access_keys,
                        myId: authState.myId,
                    });
                    if (!dec.isLocked) decryptedBase = dec;
                }
                const payloadToEncrypt: Record<string, unknown> = {
                    ...decryptedBase,
                    ...(decryptedBase.title !== undefined ? {} : currentNote.title ? { title: currentNote.title } : {}),
                    ...(currentNote.safe && decryptedBase.safe === undefined ? { safe: currentNote.safe } : {}),
                    ...(Array.isArray(currentNote.tagIds) && decryptedBase.tagIds === undefined
                        ? { tagIds: currentNote.tagIds }
                        : {}),
                    linkedSafes: nextLinked,
                };
                const securedMeta = await encryptSecuredEnvelope(payloadToEncrypt, authState.publicKey);
                const strippedMetadata = stripSensitiveFileMetadata(currentMeta);
                await apiFetch(`/api/v1/files/${noteId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ secured_meta: securedMeta, metadata: strippedMetadata }),
                });
                set((s) => ({
                    notes: s.notes.map((n) =>
                        n.id === noteId ? { ...n, secured_meta: securedMeta, metadata: strippedMetadata } : n
                    ),
                }));
            } else {
                const newMetadata = { ...currentMeta, linkedSafes: nextLinked };
                await apiFetch(`/api/v1/files/${noteId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ metadata: newMetadata }),
                });
            }
        } catch (err) {
            console.warn('[SAFES] Failed to persist linkedSafes to backend', err);
        }
    },
});
