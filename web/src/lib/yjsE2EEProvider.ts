// Yjs E2EE WebSocket Provider for Tide
// Connects to /api/ws/notes/${noteId}?yClientId=${ydoc.clientID} with AES-GCM encrypted framing.

import * as Y from 'yjs';
import {
    Awareness,
    applyAwarenessUpdate,
    encodeAwarenessUpdate,
    removeAwarenessStates,
} from 'y-protocols/awareness';
import {
    FRAME_TYPE_CRDT,
    FRAME_TYPE_AWARENESS,
    FRAME_TYPE_CONTROL,
    encryptWSFrame,
    decryptWSFrame,
    encryptSnapshot,
    decryptSnapshot,
} from './e2eeFraming';
import { base64ToArrayBuffer } from './crypto';
import { apiFetch, getApiBase } from './api';
import { activeNoteStore, NotePermission } from '@/store/activeNoteStore';

export interface YjsE2EEProviderOptions {
    keyEpoch?: number;
    token?: string;
    url?: string;
    awareness?: Awareness;
    onRoleChanged?: (permission: NotePermission) => void;
    onRevoked?: () => void;
    onKeyRotated?: (newKeyEpoch: number) => Promise<void> | void;
    onCompactRequest?: () => Promise<void> | void;
    onSynced?: (synced: boolean) => void;
    onStatus?: (status: { status: 'connecting' | 'connected' | 'disconnected' }) => void;
}

export class YjsE2EEProvider {
    public readonly noteId: string;
    public readonly ydoc: Y.Doc;
    public dek: CryptoKey;
    public keyEpoch: number;
    public readonly awareness: Awareness;
    public ws: WebSocket | null = null;
    public synced: boolean = false;
    public wsconnected: boolean = false;
    public connected: boolean = false;
    public token?: string;

    private destroyed: boolean = false;
    private options: YjsE2EEProviderOptions;
    private listeners: Map<string, Set<(...args: any[]) => void>> = new Map();
    private pendingUpdates: Uint8Array[] = [];
    private reconnectTimer: any = null;
    private reconnectAttempts: number = 0;
    private currentPathIndex: number = 0;
    private bootstrapPromise: Promise<void> | null = null;
    private hasConnectedBefore: boolean = false;
    private inboundQueue: any[] = [];
    private isProcessingInbound: boolean = false;
    private boundVisibilityChange: (() => void) | null = null;
    private boundWindowFocus: (() => void) | null = null;

    private boundYdocUpdate: (update: Uint8Array, origin: any) => void;
    private boundAwarenessUpdate: (changed: { added: number[]; updated: number[]; removed: number[] }, origin: any) => void;

    constructor(
        noteId: string,
        ydoc: Y.Doc,
        dek: CryptoKey,
        options: YjsE2EEProviderOptions = {}
    ) {
        this.noteId = noteId;
        this.ydoc = ydoc;
        this.dek = dek;
        this.keyEpoch = options.keyEpoch || activeNoteStore.getState().keyEpoch || 1;
        this.options = options;
        this.token = options.token ||
            (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('tide_session_token') || undefined : undefined) ||
            (typeof localStorage !== 'undefined' ? localStorage.getItem('tide_session_token') || undefined : undefined);
        this.awareness = options.awareness || new Awareness(ydoc);

        // Store active YDoc & DEK in activeNoteStore
        activeNoteStore.getState().setActiveYDoc(ydoc);
        if (dek instanceof CryptoKey) {
            activeNoteStore.getState().setActiveDEK(dek);
        }
        activeNoteStore.getState().setKeyEpoch(this.keyEpoch);

        // Listen for local ydoc updates and encrypt
        this.boundYdocUpdate = (update: Uint8Array, origin: any) => {
            if (origin === 'remote' || origin === 'server') return;
            void this.handleLocalDocUpdate(update);
        };
        this.ydoc.on('update', this.boundYdocUpdate);

        // Listen for local awareness updates and encrypt
        this.boundAwarenessUpdate = ({ added, updated, removed }, origin: any) => {
            if (origin === 'remote' || origin === 'server') return;
            const changed = added.concat(updated, removed);
            if (changed.length > 0) {
                void this.handleLocalAwarenessUpdate(changed);
            }
        };
        this.awareness.on('update', this.boundAwarenessUpdate);

        // Handle Safari Tab Suspension & Liveness
        if (typeof document !== 'undefined') {
            this.boundVisibilityChange = () => {
                if (document.visibilityState === 'visible') {
                    this.checkLivenessAndReconnect();
                }
            };
            document.addEventListener('visibilitychange', this.boundVisibilityChange);
        }
        if (typeof window !== 'undefined') {
            this.boundWindowFocus = () => {
                this.checkLivenessAndReconnect();
            };
            window.addEventListener('focus', this.boundWindowFocus);
        }

        // Start bootstrap & websocket connection
        this.bootstrapPromise = this.bootstrap();
        this.connect();
    }

    public on(event: string, fn: (...args: any[]) => void): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(fn);
    }

    public off(event: string, fn: (...args: any[]) => void): void {
        this.listeners.get(event)?.delete(fn);
    }

    public emit(event: string, ...args: any[]): void {
        const fns = this.listeners.get(event);
        if (fns) {
            for (const fn of fns) {
                try {
                    fn(...args);
                } catch (e) {
                    console.error(`[YjsE2EEProvider] Error in event listener '${event}':`, e);
                }
            }
        }
    }

    /**
     * Bootstrap CRDT state from server REST snapshot + WAL
     */
    public async bootstrap(): Promise<void> {
        if (this.destroyed) return;
        if (this.bootstrapPromise) {
            return this.bootstrapPromise;
        }

        this.bootstrapPromise = (async () => {
            try {
                let res: Response;
                if (this.noteId.startsWith('quicknote:')) {
                    const slug = this.noteId.replace('quicknote:', '');
                    const quicknoteUrl = `/api/v1/quicknotes/${encodeURIComponent(slug)}/crdt-state`;
                    if (this.token) {
                        res = await apiFetch(quicknoteUrl);
                    } else {
                        const base = getApiBase();
                        let cleanEndpoint = quicknoteUrl.startsWith('/') ? quicknoteUrl : `/${quicknoteUrl}`;
                        if (base.endsWith('/api') && cleanEndpoint.startsWith('/api/')) {
                            cleanEndpoint = cleanEndpoint.slice(4);
                        }
                        const fullUrl = `${base}${cleanEndpoint}`;
                        res = await fetch(fullUrl, {
                            method: 'GET',
                            headers: { 'Content-Type': 'application/json' },
                        });
                    }
                } else {
                    res = await apiFetch(`/api/files/${encodeURIComponent(this.noteId)}/crdt-state`);
                    if (!res.ok) {
                        res = await apiFetch(`/api/v1/files/${encodeURIComponent(this.noteId)}/crdt-state`);
                    }
                }

                if (!res.ok) {
                    console.warn(`[YjsE2EEProvider] CRDT bootstrap fetch returned HTTP ${res.status}`);
                    this.markSynced(true);
                    return;
                }

                if (this.destroyed) return;

                const data = await res.json().catch(() => ({}));
                const snapIv = data?.snapshot_iv || data?.snapshotIv || data?.snapshotIV || data?.snapshot?.iv || data?.snapshot?.IV;
                const snapCiphertext = data?.snapshot_ciphertext || data?.snapshotCiphertext || data?.snapshot?.ciphertext || data?.snapshot?.Ciphertext;
                const keyEpoch = data?.key_epoch || data?.keyEpoch || data?.snapshot?.key_epoch || data?.snapshot?.keyEpoch || this.keyEpoch || 1;
                const snapshotSeqId = data?.snapshot_seq_id || data?.snapshotSeqId || data?.snapshot?.seq_id || data?.snapshot?.seqId || 0;
                const wal = Array.isArray(data?.wal) ? data.wal : (Array.isArray(data?.WAL) ? data.WAL : []);

                this.keyEpoch = keyEpoch;
                activeNoteStore.getState().setKeyEpoch(keyEpoch);

                // 1. Decrypt snapshot if present
                if (snapIv && snapCiphertext && !this.destroyed) {
                    try {
                        const plaintextSnapshot = await decryptSnapshot(
                            this.noteId,
                            keyEpoch,
                            snapIv,
                            snapCiphertext,
                            this.dek
                        );
                        if (!this.destroyed) {
                            Y.applyUpdate(this.ydoc, plaintextSnapshot, 'remote');
                        }
                    } catch (snapErr) {
                        console.error('[YjsE2EEProvider] Failed to decrypt snapshot:', snapErr);
                    }
                }

                // 2. Decrypt WAL entries using decryptWSFrame
                let maxSeqId = snapshotSeqId;
                for (const entry of wal) {
                    if (this.destroyed) break;
                    try {
                        const entryEpoch = entry.key_epoch || entry.keyEpoch || keyEpoch;
                        const ivStr = entry.iv || entry.IV;
                        const cipherStr = entry.ciphertext || entry.Ciphertext;
                        const seqId = entry.seq_id || entry.seqId || 0;

                        if (ivStr && cipherStr) {
                            const ivBytes = base64ToArrayBuffer(ivStr);
                            const cipherBytes = base64ToArrayBuffer(cipherStr);

                            // Reconstruct binary WS frame: msgType(1B) || keyEpoch(4B) || IV(12B) || ciphertext
                            const frame = new Uint8Array(1 + 4 + ivBytes.byteLength + cipherBytes.byteLength);
                            const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
                            view.setUint8(0, FRAME_TYPE_CRDT);
                            view.setUint32(1, entryEpoch, false);
                            frame.set(new Uint8Array(ivBytes), 5);
                            frame.set(new Uint8Array(cipherBytes), 17);

                            const { plaintext } = await decryptWSFrame(this.noteId, frame, this.dek);
                            if (!this.destroyed) {
                                Y.applyUpdate(this.ydoc, plaintext, 'remote');
                            }
                        }

                        if (seqId > maxSeqId) maxSeqId = seqId;
                    } catch (walErr) {
                        console.warn('[YjsE2EEProvider] Skipping unreadable WAL entry (key mismatch):', walErr);
                    }
                }

                if (!this.destroyed) {
                    activeNoteStore.getState().setLastCompactedSeqId(maxSeqId);
                    this.markSynced(true);
                }
            } catch (err) {
                console.error('[YjsE2EEProvider] Bootstrap failed:', err);
                if (!this.destroyed) {
                    this.markSynced(true);
                }
            } finally {
                this.bootstrapPromise = null;
            }
        })();

        return this.bootstrapPromise;
    }

    private markSynced(synced: boolean): void {
        this.synced = synced;
        this.emit('sync', synced);
        this.options.onSynced?.(synced);
    }

    private resolveWsEndpoint(): string {
        if (this.options.url) {
            return this.options.url;
        }

        const token = this.token || this.options.token ||
            (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('tide_session_token') : null) ||
            (typeof localStorage !== 'undefined' ? localStorage.getItem('tide_session_token') : null) ||
            '';

        const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
        let protocol: 'ws:' | 'wss:' = isHttps ? 'wss:' : 'ws:';
        let wsHost = 'localhost:8080';

        const envWsUrl = process.env.NEXT_PUBLIC_WS_URL;
        const envApiUrl = process.env.NEXT_PUBLIC_API_URL;

        if (envWsUrl) {
            try {
                const u = new URL(envWsUrl.includes('://') ? envWsUrl : `ws://${envWsUrl}`);
                wsHost = u.host;
                if (u.protocol === 'wss:' || isHttps) {
                    protocol = 'wss:';
                } else if (u.protocol === 'ws:') {
                    protocol = 'ws:';
                }
            } catch {
                wsHost = envWsUrl.replace(/^[a-zA-Z]+:\/\//, '').replace(/\/.*$/, '');
            }
        } else if (envApiUrl) {
            try {
                const u = new URL(envApiUrl.includes('://') ? envApiUrl : `http://${envApiUrl}`);
                wsHost = u.host;
                if (u.protocol === 'https:' || isHttps) {
                    protocol = 'wss:';
                } else {
                    protocol = 'ws:';
                }
            } catch {
                wsHost = envApiUrl.replace(/^[a-zA-Z]+:\/\//, '').replace(/\/.*$/, '');
            }
        } else if (typeof window !== 'undefined') {
            const hostname = window.location.hostname;
            if (hostname === 'localhost' || hostname === '127.0.0.1') {
                wsHost = `${hostname}:8080`;
            } else if (hostname === 'go-tide.app' || hostname.endsWith('.go-tide.app')) {
                wsHost = window.location.host;
            } else {
                wsHost = `${hostname}:8080`;
            }
        }

        // Remote client support (e.g. iPad or phone connecting to host machine via LAN IP)
        if (typeof window !== 'undefined') {
            const clientHostname = window.location.hostname;
            if (clientHostname && clientHostname !== 'localhost' && clientHostname !== '127.0.0.1') {
                wsHost = wsHost.replace(/^(localhost|127\.0\.0\.1)(:\d+)?/, (_, __, port) => {
                    return `${clientHostname}${port || ':8080'}`;
                });
            }
        }

        if (this.noteId.startsWith('quicknote:')) {
            const slug = this.noteId.replace('quicknote:', '');
            return `${protocol}//${wsHost}/api/ws/quicknotes/${encodeURIComponent(slug)}?yClientId=${encodeURIComponent(this.ydoc.clientID)}${this.token ? '&token=' + encodeURIComponent(this.token) : ''}`;
        }

        const encodedNoteId = encodeURIComponent(this.noteId);
        const pathTemplates = [
            `/api/ws/notes/${encodedNoteId}`,
            `/api/files/${encodedNoteId}/ws`,
            `/api/v1/files/${encodedNoteId}/ws`,
        ];

        const basePath = pathTemplates[this.currentPathIndex % pathTemplates.length];
        const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
        return `${protocol}//${wsHost}${basePath}?yClientId=${encodeURIComponent(String(this.ydoc.clientID))}${tokenParam}`;
    }

    public connect(): void {
        this.connectWebSocket();
    }

    public checkLivenessAndReconnect(): void {
        if (this.destroyed) return;
        if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
            this.connect();
        } else if (this.ws.readyState === WebSocket.OPEN) {
            void this.bootstrap();
        }
    }

    private connectWebSocket(): void {
        if (this.destroyed) return;

        const isDev = process.env.NODE_ENV !== 'production' ||
            (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));

        const wsEndpoint = this.resolveWsEndpoint();

        if (isDev) {
            console.log(`[YjsE2EEProvider] Connecting (attempt ${this.reconnectAttempts + 1}, path index ${this.currentPathIndex}):`, wsEndpoint);
        }

        try {
            if (this.ws) {
                try {
                    this.ws.onopen = null;
                    this.ws.onmessage = null;
                    this.ws.onerror = null;
                    this.ws.onclose = null;
                    this.ws.close();
                } catch {}
                this.ws = null;
            }

            this.ws = new WebSocket(wsEndpoint);
            this.ws.binaryType = 'arraybuffer';

            this.ws.onopen = async () => {
                if (this.destroyed) return;
                this.connected = true;
                this.wsconnected = true;
                const isReconnect = this.hasConnectedBefore;
                this.hasConnectedBefore = true;
                this.reconnectAttempts = 0;
                (window as Window & { __tideWsConnected?: boolean }).__tideWsConnected = true;

                if (isDev) {
                    console.log('[YjsE2EEProvider] WebSocket connected successfully:', wsEndpoint);
                }

                this.emit('status', { status: 'connected' });
                this.options.onStatus?.({ status: 'connected' });

                // Catch up on any updates committed while disconnected or Safari was backgrounded
                if (isReconnect) {
                    void this.bootstrap();
                }

                // Flush pending local updates
                while (this.pendingUpdates.length > 0) {
                    const update = this.pendingUpdates.shift();
                    if (update && this.ws?.readyState === WebSocket.OPEN) {
                        this.ws.send(update);
                    }
                }

                // Send initial awareness state
                try {
                    if (this.dek instanceof CryptoKey) {
                        const awarenessUpdate = encodeAwarenessUpdate(this.awareness, [this.ydoc.clientID]);
                        const frame = await encryptWSFrame(
                            this.noteId,
                            FRAME_TYPE_AWARENESS,
                            this.keyEpoch,
                            this.dek,
                            awarenessUpdate
                        );
                        if (this.ws?.readyState === WebSocket.OPEN) {
                            this.ws.send(frame);
                        }
                    }
                } catch (awErr) {
                    console.error('[YjsE2EEProvider] Failed to send initial awareness:', awErr);
                }
            };

            this.ws.onmessage = (event: MessageEvent) => {
                if (this.destroyed) return;
                this.enqueueInboundMessage(event.data);
            };

            this.ws.onerror = (err) => {
                if (isDev) {
                    console.warn('[YjsE2EEProvider] WebSocket error on endpoint:', wsEndpoint, err);
                } else {
                    console.warn('[YjsE2EEProvider] WebSocket error:', err);
                }
            };

            this.ws.onclose = (event: CloseEvent) => {
                if (this.destroyed) return;
                const wasConnected = this.connected;
                this.connected = false;
                this.wsconnected = false;
                (window as Window & { __tideWsConnected?: boolean }).__tideWsConnected = false;
                this.emit('status', { status: 'disconnected' });
                this.options.onStatus?.({ status: 'disconnected' });

                // If connection failed before opening (e.g. 404, refused, bad gateway) or dropped, cycle to next fallback path
                if (!wasConnected || this.reconnectAttempts > 0) {
                    this.currentPathIndex = (this.currentPathIndex + 1) % 3;
                }

                // Exponential backoff reconnect
                const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000);
                this.reconnectAttempts++;

                if (isDev) {
                    console.log(`[YjsE2EEProvider] WebSocket closed (code: ${event.code}, reason: "${event.reason || 'none'}"). Reconnecting in ${delay}ms... (next path index: ${this.currentPathIndex})`);
                }

                this.reconnectTimer = setTimeout(() => {
                    if (!this.destroyed) this.connectWebSocket();
                }, delay);
            };
        } catch (err) {
            console.error('[YjsE2EEProvider] Failed to instantiate WebSocket:', err);
            this.currentPathIndex = (this.currentPathIndex + 1) % 3;
            const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000);
            this.reconnectAttempts++;
            this.reconnectTimer = setTimeout(() => {
                if (!this.destroyed) this.connectWebSocket();
            }, delay);
        }
    }

    private enqueueInboundMessage(data: any): void {
        if (this.destroyed) return;
        this.inboundQueue.push(data);
        void this.processInboundQueue();
    }

    private async processInboundQueue(): Promise<void> {
        if (this.isProcessingInbound) return;
        this.isProcessingInbound = true;
        try {
            while (this.inboundQueue.length > 0 && !this.destroyed) {
                const data = this.inboundQueue.shift();
                try {
                    await this.handleInboundMessage(data);
                } catch (err) {
                    console.error('[YjsE2EEProvider] Error in inbound message processing:', err);
                }
            }
        } finally {
            this.isProcessingInbound = false;
            if (this.inboundQueue.length > 0 && !this.destroyed) {
                void this.processInboundQueue();
            }
        }
    }

    private async handleInboundMessage(data: any): Promise<void> {
        let rawBuffer: ArrayBuffer;
        if (data instanceof ArrayBuffer) {
            rawBuffer = data;
        } else if (data instanceof Blob) {
            rawBuffer = await data.arrayBuffer();
        } else {
            return;
        }

        const frame = new Uint8Array(rawBuffer);
        if (frame.length === 0) return;
        const msgType = frame[0];

        try {
            switch (msgType) {
                case FRAME_TYPE_CRDT: { // 0x01
                    try {
                        const { plaintext } = await decryptWSFrame(this.noteId, frame, this.dek);
                        Y.applyUpdate(this.ydoc, plaintext, 'remote');
                    } catch (err) {
                        console.warn('[YjsE2EEProvider] Failed to decrypt inbound CRDT frame (stale packet or key mismatch):', err);
                    }
                    break;
                }
                case FRAME_TYPE_AWARENESS: { // 0x02
                    try {
                        const { plaintext } = await decryptWSFrame(this.noteId, frame, this.dek);
                        applyAwarenessUpdate(this.awareness, plaintext, 'remote');
                    } catch (err) {
                        console.warn('[YjsE2EEProvider] Failed to decrypt inbound awareness frame (stale packet or key mismatch):', err);
                    }
                    break;
                }
                case FRAME_TYPE_CONTROL: { // 0x03
                    const jsonStr = new TextDecoder().decode(frame.slice(1));
                    const msg = JSON.parse(jsonStr);
                    await this.handleControlMessage(msg);
                    break;
                }
                default:
                    console.warn(`[YjsE2EEProvider] Unknown frame type: 0x${msgType.toString(16)}`);
            }
        } catch (err) {
            console.warn('[YjsE2EEProvider] Inbound frame decryption/handling failed:', err);
        }
    }

    private async handleControlMessage(msg: any): Promise<void> {
        const action = msg?.action;
        switch (action) {
            case 'PEER_LEFT': {
                if (typeof msg.yClientId === 'number') {
                    // 0ms instant ghost cursor removal
                    removeAwarenessStates(this.awareness, [msg.yClientId], 'server');
                }
                break;
            }
            case 'ROLE_CHANGED': {
                const newPerm = msg.permission as NotePermission;
                if (newPerm) {
                    activeNoteStore.getState().setLivePermission(newPerm);
                    this.emit('role_changed', newPerm);
                    this.options.onRoleChanged?.(newPerm);
                }
                break;
            }
            case 'REVOKED': {
                activeNoteStore.getState().setLivePermission('view');
                this.emit('revoked');
                this.options.onRevoked?.();
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('tide:access-revoked', { detail: { noteId: this.noteId } }));
                }
                break;
            }
            case 'KEY_ROTATED': {
                const newEpoch = typeof msg.keyEpoch === 'number' ? msg.keyEpoch : this.keyEpoch + 1;
                this.keyEpoch = newEpoch;
                activeNoteStore.getState().setKeyEpoch(newEpoch);
                this.emit('key_rotated', newEpoch);
                if (this.options.onKeyRotated) {
                    await this.options.onKeyRotated(newEpoch);
                }
                break;
            }
            case 'COMPACT_REQUEST': {
                this.emit('compact_request');
                if (this.options.onCompactRequest) {
                    await this.options.onCompactRequest();
                } else {
                    await this.compact();
                }
                break;
            }
            default:
                console.log('[YjsE2EEProvider] Received control message:', msg);
        }
    }

    private async handleLocalDocUpdate(update: Uint8Array): Promise<void> {
        if (!this.dek || !(this.dek instanceof CryptoKey)) {
            return;
        }

        // Enforce view role: non-view clients only
        const perm = activeNoteStore.getState().permission;
        if (perm === 'view') {
            return;
        }

        try {
            const frame = await encryptWSFrame(
                this.noteId,
                FRAME_TYPE_CRDT,
                this.keyEpoch,
                this.dek,
                update
            );

            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send(frame);
            } else {
                this.pendingUpdates.push(frame);
            }
        } catch (err) {
            console.error('[YjsE2EEProvider] Failed to encrypt/send local doc update:', err);
        }
    }

    private async handleLocalAwarenessUpdate(changedClients: number[]): Promise<void> {
        if (!this.dek || !(this.dek instanceof CryptoKey)) {
            return; // Skip awareness encryption until real CryptoKey is set
        }

        try {
            const update = encodeAwarenessUpdate(this.awareness, changedClients);
            const frame = await encryptWSFrame(
                this.noteId,
                FRAME_TYPE_AWARENESS,
                this.keyEpoch,
                this.dek,
                update
            );

            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send(frame);
            }
        } catch (err) {
            console.error('[YjsE2EEProvider] Failed to encrypt/send awareness update:', err);
        }
    }

    /**
     * Performs WAL compaction by snapshotting current ydoc state and sending to /api/files/${noteId}/compact or /api/v1/quicknotes/${slug}/compact
     */
    public async compact(): Promise<void> {
        const perm = activeNoteStore.getState().permission;
        if (perm === 'view') return;
        if (!this.dek || !(this.dek instanceof CryptoKey)) return;

        try {
            const yjsState = Y.encodeStateAsUpdate(this.ydoc);
            const { ivBase64, ciphertextBase64 } = await encryptSnapshot(
                this.noteId,
                this.keyEpoch,
                this.dek,
                yjsState
            );
            const upToSeqId = activeNoteStore.getState().lastCompactedSeqId;

            if (this.noteId.startsWith('quicknote:')) {
                const slug = this.noteId.replace('quicknote:', '');
                const compactUrl = `/api/v1/quicknotes/${encodeURIComponent(slug)}/compact`;
                const payload = JSON.stringify({
                    upToSeqId,
                    keyEpoch: this.keyEpoch,
                    ivBase64,
                    ciphertextBase64,
                });
                if (this.token) {
                    await apiFetch(compactUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: payload,
                    });
                } else {
                    const base = getApiBase();
                    let cleanEndpoint = compactUrl.startsWith('/') ? compactUrl : `/${compactUrl}`;
                    if (base.endsWith('/api') && cleanEndpoint.startsWith('/api/')) {
                        cleanEndpoint = cleanEndpoint.slice(4);
                    }
                    const fullUrl = `${base}${cleanEndpoint}`;
                    await fetch(fullUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: payload,
                    });
                }
                return;
            }

            const res = await apiFetch(`/api/files/${encodeURIComponent(this.noteId)}/compact`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    upToSeqId,
                    keyEpoch: this.keyEpoch,
                    ivBase64,
                    ciphertextBase64,
                }),
            });
            if (!res.ok) {
                await apiFetch(`/api/v1/files/${encodeURIComponent(this.noteId)}/compact`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        upToSeqId,
                        keyEpoch: this.keyEpoch,
                        ivBase64,
                        ciphertextBase64,
                    }),
                });
            }
        } catch (err) {
            console.error('[YjsE2EEProvider] Compaction failed:', err);
        }
    }

    public sendSnapshotCompact(): Promise<void> {
        return this.compact();
    }

    public updateDEK(newDek: CryptoKey, newKeyEpoch?: number): void {
        if (!newDek || !(newDek instanceof CryptoKey)) {
            return;
        }
        this.dek = newDek;
        if (newKeyEpoch !== undefined) {
            this.keyEpoch = newKeyEpoch;
            activeNoteStore.getState().setKeyEpoch(newKeyEpoch);
        }
        activeNoteStore.getState().setActiveDEK(newDek);
    }

    public destroy(): void {
        this.destroyed = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.ydoc.off('update', this.boundYdocUpdate);
        this.awareness.off('update', this.boundAwarenessUpdate);

        if (typeof document !== 'undefined' && this.boundVisibilityChange) {
            document.removeEventListener('visibilitychange', this.boundVisibilityChange);
            this.boundVisibilityChange = null;
        }
        if (typeof window !== 'undefined' && this.boundWindowFocus) {
            window.removeEventListener('focus', this.boundWindowFocus);
            this.boundWindowFocus = null;
        }

        if (this.ws) {
            this.ws.onmessage = null;
            this.ws.onerror = null;
            if (this.ws.readyState === WebSocket.CONNECTING) {
                const socket = this.ws;
                socket.onopen = () => {
                    try { socket.close(); } catch {}
                };
                socket.onclose = null;
            } else {
                this.ws.onclose = null;
                try { this.ws.close(); } catch {}
            }
            this.ws = null;
        }

        this.awareness.destroy();
        this.listeners.clear();
        this.pendingUpdates = [];
        this.inboundQueue = [];
        this.isProcessingInbound = false;
        this.bootstrapPromise = null;
        this.connected = false;
        this.wsconnected = false;
    }
}
