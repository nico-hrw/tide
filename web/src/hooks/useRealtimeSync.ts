"use client";

import { useEffect } from 'react';
import { useDataStore } from '@/store/useDataStore';
import { getApiBase } from '@/lib/api';

interface UseRealtimeSyncOptions {
    myId: string | null;
    activeNoteId?: string | null;
    fileName?: string;
    isLoadingContent?: boolean;
    editorContent?: any;
}

export function useRealtimeSync({
    myId,
    activeNoteId,
    fileName,
    isLoadingContent,
    editorContent,
}: UseRealtimeSyncOptions) {
    // SSE Effect — robust reconnect with exponential backoff
    useEffect(() => {
        if (!myId) return;
        const token = sessionStorage.getItem("tide_session_token") || localStorage.getItem("tide_session_token");
        if (!token) return;

        // [FIX-4] Throttle: track when WE last saved so SSE-triggered fetchDirectory
        // doesn't immediately overwrite our optimistic updates while the EventPopover
        // debounce (800ms) or note autosave timer (1000ms) is still running.
        let lastOwnSaveTime = 0;
        const OWN_SAVE_COOLDOWN_MS = 3000;

        // Expose a setter so performSave and handleEventSave can stamp the time
        (window as any).__tideSaveTimestamp = () => { lastOwnSaveTime = Date.now(); };

        // [FIX-2] Exponential backoff reconnect so a proxy timeout (common with Nginx)
        // doesn't spam the server with rapid reconnections every 3s.
        let retryDelay = 2000; // start at 2s
        const MAX_RETRY = 30000; // cap at 30s
        let eventSource: EventSource | null = null;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let isClosed = false;

        const connect = () => {
            if (isClosed) return;
            const base = getApiBase();
            eventSource = new EventSource(`${base}/api/v1/events?user_id=${myId}&token=${token}`);

            eventSource.onopen = () => {
                retryDelay = 2000; // reset backoff on successful connect
            };

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (['file_created', 'file_updated', 'file_deleted', 'file_shared'].includes(data.type)) {
                        const msSinceOwnSave = Date.now() - lastOwnSaveTime;
                        if (data.type === 'file_updated' && msSinceOwnSave < OWN_SAVE_COOLDOWN_MS) {
                            console.log(`[SSE] Suppressing own file_updated refetch (${msSinceOwnSave}ms since last save)`);
                            setTimeout(() => {
                                // Use metadataCache (no forceRefresh) so optimistic updates survive
                                useDataStore.setState({ loadedDirectories: new Set() });
                                import('@/lib/searchIndex').then(({ clearSearchIndexCache }) => clearSearchIndexCache());
                                useDataStore.getState().fetchDirectory(null);
                            }, OWN_SAVE_COOLDOWN_MS - msSinceOwnSave);
                            return;
                        }
                        // No forceRefresh: the metadataCache protects in-flight optimistic updates
                        // from being overwritten by server data that hasn't caught up yet.
                        useDataStore.setState({ loadedDirectories: new Set() });
                        import('@/lib/searchIndex').then(({ clearSearchIndexCache }) => clearSearchIndexCache());

                        if (data.type === 'file_deleted' && data.file_id) {
                            useDataStore.setState(s => {
                                const toRemove = new Set<string>([data.file_id]);
                                let sizeBefore = 0;
                                do {
                                    sizeBefore = toRemove.size;
                                    s.notes.forEach(n => {
                                        if (n.parent_id && toRemove.has(n.parent_id)) {
                                            toRemove.add(n.id);
                                        }
                                    });
                                    s.events.forEach(e => {
                                        if (e.parent_id && toRemove.has(e.parent_id)) {
                                            toRemove.add(e.id);
                                        }
                                    });
                                } while (toRemove.size > sizeBefore);

                                return {
                                    notes: s.notes.filter(n => !toRemove.has(n.id)),
                                    events: s.events.filter(e => !toRemove.has(e.id))
                                };
                            });
                        }

                        const fetchPromise = useDataStore.getState().fetchDirectory(null) as Promise<void> | undefined;

                        // If a file update arrives and we have a note open, reload its content
                        // AFTER fetchDirectory finishes (so access_keys in store are fresh).
                        if (data.type === 'file_updated') {
                            const currentActiveId = useDataStore.getState().activeNoteId;
                            const fileIdMatch = data.file_id ? data.file_id === currentActiveId : !!currentActiveId;
                            if (fileIdMatch && currentActiveId) {
                                const dispatch = () => {
                                    const activeFile = [...useDataStore.getState().notes, ...useDataStore.getState().events].find((f: any) => f.id === currentActiveId) as any;
                                    if (!activeFile) return;
                                    // Never reload public files (unencrypted content, no DEK path)
                                    if (activeFile.visibility === 'public') return;
                                    // Never reload own non-shared notes — any file_updated is from our own save
                                    const ak = activeFile.access_keys;
                                    const akObj = ak ? (typeof ak === 'string' ? (() => { try { return JSON.parse(ak); } catch { return {}; } })() : ak) : {};
                                    const isSharedWithOthers = Object.keys(akObj).length > 1 || activeFile.share_status === 'shared';
                                    if (!isSharedWithOthers) return;
                                    window.dispatchEvent(new CustomEvent('tide:sse_reload', { detail: { fileId: currentActiveId } }));
                                };
                                if (fetchPromise?.then) { fetchPromise.then(dispatch); } else { dispatch(); }
                            }
                        }
                    }
                } catch (e) { console.error("SSE Parse Error", e); }
            };

            eventSource.onerror = () => {
                // Close the broken connection and schedule reconnect
                eventSource?.close();
                if (!isClosed) {
                    console.warn(`[SSE] Connection lost. Reconnecting in ${retryDelay / 1000}s…`);
                    retryTimer = setTimeout(() => {
                        retryDelay = Math.min(retryDelay * 2, MAX_RETRY);
                        connect();
                    }, retryDelay);
                }
            };
        };

        connect();

        return () => {
            isClosed = true;
            if (retryTimer) clearTimeout(retryTimer);
            eventSource?.close();
            delete (window as any).__tideSaveTimestamp;
        };
    }, [myId]);

    // SSE content-reload: when another client updates a file we have open, silently update content
    useEffect(() => {
        const handler = async (e: Event) => {
            const fileId = (e as CustomEvent).detail.fileId;
            if (fileId !== activeNoteId) return;

            // Since Collaboration handles syncing natively via Yjs and __yjs binary
            // applying `setContent` will completely overwrite the editor, causing massive duplication.
            // We just let the websocket or the next initial load handle it.
            console.log('[SSE] Ignored tide:sse_reload because Collaboration natively handles it for file:', fileId);
        };
        window.addEventListener('tide:sse_reload', handler as EventListener);
        return () => window.removeEventListener('tide:sse_reload', handler as EventListener);
    }, [activeNoteId, fileName, isLoadingContent, editorContent]);
}
