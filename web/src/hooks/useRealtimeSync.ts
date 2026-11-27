"use client";

import { getSearchIndexFileId } from "@/lib/searchIndex";
import { useEffect, useRef } from 'react';
import { useDataStore } from '@/store/useDataStore';
import { useActiveNoteStore } from '@/store/activeNoteStore';
import { useCollaboratorsStore } from '@/store/collaboratorsStore';
import { getApiBase, apiFetch } from '@/lib/api';
import { useIslandStore } from '@/store/useIslandStore';
import { useIslandSettingsStore } from '@/store/useIslandSettingsStore';
import { useSocialStore } from '@/store/useSocialStore';
import { decryptChatMessage, isE2EEMessage } from '@/lib/chatCrypto';
import { applyServerSettings, applyServerWorkspaces, type ServerSettings } from '../lib/settingsSync';

export const handledIslandMessageIds = new Set<string>();

interface UseRealtimeSyncOptions {
    myId: string | null;
    activeNoteId?: string | null;
    fileName?: string;
    isLoadingContent?: boolean;
    editorContent?: any;
    privateKey?: CryptoKey | null;
}

export function useRealtimeSync({
    myId,
    activeNoteId,
    fileName,
    isLoadingContent,
    editorContent,
    privateKey,
}: UseRealtimeSyncOptions) {
    const { push: islandPush } = useIslandStore();
    const privateKeyRef = useRef(privateKey);
    privateKeyRef.current = privateKey;

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
        (window as unknown as { __tideSaveTimestamp?: () => void }).__tideSaveTimestamp = () => { lastOwnSaveTime = Date.now(); };

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
            eventSource = new EventSource(`${base}/api/v1/events?user_id=${encodeURIComponent(myId)}`, { withCredentials: true });

            eventSource.onopen = () => {
                retryDelay = 2000; // reset backoff on successful connect
            };

            eventSource.onmessage = async (event) => {
                try {
                    const data = JSON.parse(event.data);

                    // Active collaborators pulse
                    if (data.type === 'NOTE_ACTIVITY_PULSE') {
                        const pulseFileId = data.file_id || data.fileId;
                        const activeUsers = data.active_users || data.activeUsers || [];
                        if (pulseFileId && Array.isArray(activeUsers)) {
                            useCollaboratorsStore.getState().setActiveUsersForNote(pulseFileId, activeUsers);
                        }
                        return;
                    }

                    // Global notification dispatch and decryption for incoming chat messages & shares
                    if (data.type === 'new_message' && data.message) {
                        const msg = data.message;
                        if (msg.sender_id && msg.sender_id !== myId) {
                            if (!msg.id || !handledIslandMessageIds.has(msg.id)) {
                                if (msg.id) {
                                    handledIslandMessageIds.add(msg.id);
                                }

                                let content = msg.content || '';
                                if (isE2EEMessage(content)) {
                                    const effectiveKey = privateKeyRef.current || (useDataStore.getState() as any).privateKey || null;
                                    content = await decryptChatMessage(content, myId, effectiveKey);
                                }

                                let shareData: any = null;
                                let isSystemMessage = false;
                                try {
                                    const parsed = JSON.parse(content);
                                    if (parsed && (parsed.type === 'file_share_request' || parsed.type === 'event_share')) {
                                        shareData = parsed;
                                    } else if (parsed?.type) {
                                        isSystemMessage = true;
                                    }
                                } catch {
                                    // Plain text chat message
                                }

                                if (!isSystemMessage) {
                                    const {
                                        messagePreviewMode,
                                        fileShareDisplay,
                                        showNoteSharedText,
                                        notificationDurationSeconds
                                    } = useIslandSettingsStore.getState();

                                    const contacts = useSocialStore.getState().contacts;
                                    const senderContact = contacts.find(c => c.partner.id === msg.sender_id);
                                    const resolvedSender = shareData?.sender_name || msg.sender_name || senderContact?.partner?.username || senderContact?.partner?.email;
                                    const senderName = resolvedSender || 'Jemand';

                                    if (!resolvedSender && msg.sender_id && contacts.length === 0) {
                                        useSocialStore.getState().fetchContacts().catch(() => {});
                                    }
                                    const durationMs = (notificationDurationSeconds || 6) * 1000;

                                    if (shareData) {
                                        const shareFileName = shareData.file_name || 'Neue Freigabe';
                                        const fileType = shareData.file_type || (shareData.type === 'event_share' ? 'event' : 'file');

                                        if (fileShareDisplay === 'card') {
                                            islandPush({
                                                type: 'interactive_card',
                                                payload: {
                                                    fileName: shareFileName,
                                                    fileType,
                                                    senderName,
                                                    noteSharedText: showNoteSharedText ? `${senderName || 'Jemand'} hat eine Notiz geteilt` : undefined,
                                                    duration: durationMs,
                                                    onAction: () => {
                                                        if (fileType === 'event' || shareData.type === 'event_share') {
                                                            window.dispatchEvent(new CustomEvent('tide:select-event', { detail: { id: shareData.file_id } }));
                                                        } else {
                                                            window.dispatchEvent(new CustomEvent('tide:select-note', { detail: { id: shareData.file_id, title: shareFileName } }));
                                                        }
                                                    }
                                                }
                                            });
                                        } else {
                                            islandPush({
                                                type: 'message',
                                                payload: {
                                                    senderName,
                                                    text: showNoteSharedText ? `${senderName || 'Jemand'} hat eine Notiz geteilt: ${shareFileName}` : `Datei geteilt: ${shareFileName}`,
                                                    duration: durationMs,
                                                }
                                            });
                                        }
                                    } else {
                                        let text = '';
                                        if (messagePreviewMode === 'full') {
                                            text = content;
                                        } else if (messagePreviewMode === 'preview') {
                                            text = content.length > 80 ? `${content.slice(0, 80)}...` : content;
                                        } else {
                                            // 'sender_only'
                                            text = 'Neue Nachricht empfangen';
                                        }

                                        islandPush({
                                            type: 'message',
                                            payload: {
                                                senderName,
                                                text,
                                                duration: durationMs,
                                            }
                                        });
                                    }
                                }
                            }
                        }
                    }

                    if (data.type === 'app_update') {
                        window.dispatchEvent(new CustomEvent('tide:app_update', { detail: data }));
                    }

                    if (data.type === 'user_status_changed' || data.type === 'presence_update') {
                        const payload = data.payload || data;
                        const userId = payload.user_id || payload.userId;
                        const status = payload.status;
                        if (userId && status) {
                            useSocialStore.getState().updatePartnerStatus(userId, status);
                        }
                    }

                    if (data.type === 'settings_updated') {
                        if (data.settings) {
                            applyServerSettings(data.settings as ServerSettings);
                        }
                        return;
                    }

                    if (data.type === 'workspaces_updated') {
                        if (Array.isArray(data.workspaces) && Array.isArray(data.active_workspaces)) {
                            applyServerWorkspaces(data.workspaces as string[], data.active_workspaces as string[]);
                        }
                        if (Number(data.files_updated) > 0 || Number(data.files_reassigned) > 0) {
                            useDataStore.setState({ loadedDirectories: new Set() });
                            void useDataStore.getState().fetchDirectory(null, true);
                        }
                        return;
                    }

                    if (data.type === 'todo_created' || data.type === 'todo_updated' || data.type === 'todo_deleted') {
                        useDataStore.setState({ loadedDirectories: new Set() });
                        void useDataStore.getState().fetchDirectory(null, true);
                        return;
                    }

                    if (['file_created', 'file_updated', 'file_deleted', 'file_shared', 'NOTE_WAL_APPENDED', 'NOTE_META_UPDATED'].includes(data.type)) {
                        const targetFileId = data.file_id || data.fileId || data.id;
                        const currentActiveId = useActiveNoteStore.getState().activeNoteId || useDataStore.getState().activeNoteId || activeNoteId || null;
                        const isExternalApi = data.source === 'external_api' || data.content_updated === true;

                        // The encrypted search index is rewritten after every file-list refresh; reacting to its own
                        // update would refresh the list again and loop forever.
                        if (targetFileId && targetFileId === getSearchIndexFileId()) return;

                        // BUG-12: When receiving SSE events for the currently active note:
                        // NEVER trigger reload_note, reloadFromRemote, or window reload!
                        // Drop or ignore reload because CRDT Y.Doc over WebSocket handles live sync,
                        // UNLESS the update came from the external API.
                        if (targetFileId && currentActiveId && targetFileId === currentActiveId) {
                            if (data.type === 'NOTE_WAL_APPENDED' || (data.type === 'file_updated' && !isExternalApi)) {
                                console.log(`[SSE] Ignored ${data.type} reload for active note ${targetFileId} (handled by CRDT Y.Doc)`);
                                return;
                            }
                        }

                        if (data.type === 'file_updated' && isExternalApi && targetFileId) {
                            window.dispatchEvent(new CustomEvent('tide:external_note_updated', { detail: { fileId: targetFileId } }));
                        }

                        const msSinceOwnSave = Date.now() - lastOwnSaveTime;
                        if (!isExternalApi && data.type === 'file_updated' && msSinceOwnSave < OWN_SAVE_COOLDOWN_MS) {
                            console.log(`[SSE] Suppressing own file_updated refetch (${msSinceOwnSave}ms since last save)`);
                            setTimeout(() => {
                                // Use metadataCache (no forceRefresh) so optimistic updates survive
                                useDataStore.setState({ loadedDirectories: new Set() });
                                import('@/lib/searchIndex').then(({ clearSearchIndexCache }) => clearSearchIndexCache());
                                useDataStore.getState().fetchDirectory(null);
                            }, OWN_SAVE_COOLDOWN_MS - msSinceOwnSave);
                            return;
                        }

                        // Optimistic metadata update without full reload
                        const shouldApplyMeta =
                            Boolean(targetFileId) &&
                            ((data.type === 'NOTE_META_UPDATED' && targetFileId !== currentActiveId) ||
                                (data.type === 'file_updated' && (targetFileId !== currentActiveId || isExternalApi)));

                        if (shouldApplyMeta) {
                            const rawMeta: Record<string, unknown> = {
                                ...((data.metadata as Record<string, unknown>) || (data.meta as Record<string, unknown>) || {})
                            };
                            if (data.title) rawMeta.title = data.title;
                            if (Object.keys(rawMeta).length > 0) {
                                useDataStore.getState().updateFile(targetFileId, rawMeta);
                                useDataStore.getState().updateSpecificMetadataCache(targetFileId, rawMeta);
                            }

                            if (data.secured_meta && targetFileId !== currentActiveId) {
                                const effectiveKey = privateKeyRef.current || useDataStore.getState().privateKey || null;
                                if (effectiveKey) {
                                    import('@/lib/e2eePayload').then(async ({ decryptSecuredEnvelope }) => {
                                        try {
                                            const currentState = useDataStore.getState();
                                            const meta = await decryptSecuredEnvelope(data.secured_meta, effectiveKey, {
                                                accessKeys: data.access_keys,
                                                myId: currentState.myId,
                                                cacheId: `sse-${targetFileId}`,
                                            });
                                            if (meta && !meta.isLocked) {
                                                useDataStore.getState().updateFile(targetFileId, {
                                                    ...meta,
                                                    secured_meta: data.secured_meta,
                                                });
                                                useDataStore.getState().updateSpecificMetadataCache(targetFileId, meta);
                                            }
                                        } catch (err) {
                                            console.warn('[SSE] Failed to decrypt secured_meta in background', err);
                                        }
                                    }).catch(() => {});
                                }
                            }
                        }

                        // No forceRefresh (unless external_api): the metadataCache protects in-flight optimistic updates
                        // from being overwritten by server data that hasn't caught up yet.
                        useDataStore.setState({ loadedDirectories: new Set() });
                        import('@/lib/searchIndex').then(({ clearSearchIndexCache }) => clearSearchIndexCache());

                        if (data.type === 'file_deleted' && (data.file_id || data.fileId)) {
                            const delId = data.file_id || data.fileId;
                            useDataStore.setState(s => {
                                const toRemove = new Set<string>([delId]);
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

                        void useDataStore.getState().fetchDirectory(null, data.type === 'file_updated' && isExternalApi);
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
            delete (window as unknown as { __tideSaveTimestamp?: () => void }).__tideSaveTimestamp;
        };
    }, [myId]);

    // Heartbeat Effect — ping presence every 45s
    useEffect(() => {
        if (!myId) return;
        const token = sessionStorage.getItem("tide_session_token") || localStorage.getItem("tide_session_token");
        if (!token) return;

        const sendHeartbeat = () => {
            apiFetch('/api/v1/user/heartbeat', {
                method: 'POST',
                body: JSON.stringify({ status: useSocialStore.getState().myStatus }),
            }).catch(() => {});
        };

        sendHeartbeat();
        const heartbeatInterval = setInterval(sendHeartbeat, 45000);

        return () => {
            clearInterval(heartbeatInterval);
        };
    }, [myId]);

    // Safety net for missed live updates (sleeping tab, dropped connection): refresh when the tab comes back and once a minute.
    useEffect(() => {
        if (!myId) return;
        let last = Date.now();
        const refresh = () => {
            if (document.visibilityState !== 'visible' || Date.now() - last < 10_000) return;
            last = Date.now();
            useDataStore.setState({ loadedDirectories: new Set() });
            void useDataStore.getState().fetchDirectory(null);
        };
        const interval = setInterval(refresh, 60_000);
        document.addEventListener('visibilitychange', refresh);
        window.addEventListener('focus', refresh);
        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', refresh);
            window.removeEventListener('focus', refresh);
        };
    }, [myId]);

    // SSE content-reload listener: dropped fallback reload to prevent BUG-12 state annihilation
    useEffect(() => {
        const handler = async (e: Event) => {
            const fileId = (e as CustomEvent)?.detail?.fileId;
            const currentActive = useActiveNoteStore.getState().activeNoteId || useDataStore.getState().activeNoteId || activeNoteId;
            if (fileId && fileId === currentActive) {
                // BUG-12: CRDT Y.Doc over WebSocket handles live sync natively. Never trigger reload_note!
                console.log('[SSE] Suppressing reload_note for active file (handled via CRDT Y.Doc):', fileId);
                return;
            }
        };
        window.addEventListener('tide:sse_reload', handler as EventListener);
        return () => window.removeEventListener('tide:sse_reload', handler as EventListener);
    }, [activeNoteId, fileName, isLoadingContent, editorContent]);
}
