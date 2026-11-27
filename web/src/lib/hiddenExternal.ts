import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useDataStore } from '@/store/useDataStore';
import { normalizeSafe } from '@/lib/todoSafes';

/**
 * Per-workspace "hide" state for items that only show up through another workspace
 * (related notes, linked events/todos). Purely a view preference: nothing is deleted or
 * unlinked. Persisted in localStorage, keyed by kind + active workspaces.
 */
export type HiddenKind = 'related-note' | 'event' | 'todo';
export const RELATED_FOLDER_ID = '__related_folder__';

const EVT = 'tide:hidden-external';
const EMPTY: readonly string[] = [];
const cache = new Map<string, { raw: string | null; list: readonly string[] }>();

const storageKey = (kind: HiddenKind, safes: readonly string[]) =>
    `tide.hidden.${kind}.${[...safes].map(normalizeSafe).sort().join('|') || 'all'}`;

function read(key: string): readonly string[] {
    if (typeof window === 'undefined') return EMPTY;
    let raw: string | null = null;
    try { raw = window.localStorage.getItem(key); } catch { return EMPTY; }
    const hit = cache.get(key);
    if (hit && hit.raw === raw) return hit.list;
    let list: readonly string[] = EMPTY;
    try {
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) list = parsed.filter((x): x is string => typeof x === 'string');
    } catch { /* ignore corrupt value */ }
    cache.set(key, { raw, list });
    return list;
}

function write(key: string, list: readonly string[]) {
    try { window.localStorage.setItem(key, JSON.stringify(list)); } catch { /* ignore quota */ }
    window.dispatchEvent(new Event(EVT));
}

function subscribe(cb: () => void) {
    window.addEventListener(EVT, cb);
    window.addEventListener('storage', cb);
    return () => { window.removeEventListener(EVT, cb); window.removeEventListener('storage', cb); };
}

export function useHiddenExternal(kind: HiddenKind) {
    const activeSafes = useDataStore((s) => s.activeSafes);
    const key = useMemo(() => storageKey(kind, activeSafes ?? []), [kind, activeSafes]);
    const list = useSyncExternalStore(subscribe, () => read(key), () => EMPTY);
    const hiddenIds = useMemo(() => new Set(list), [list]);
    const hide = useCallback((id: string) => { const cur = read(key); if (!cur.includes(id)) write(key, [...cur, id]); }, [key]);
    const unhide = useCallback((id: string) => write(key, read(key).filter((x) => x !== id)), [key]);
    const unhideAll = useCallback(() => write(key, []), [key]);
    return { hiddenIds, hide, unhide, unhideAll };
}
