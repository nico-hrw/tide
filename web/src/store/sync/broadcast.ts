export type SyncChannelName = 'tide_state_sync';

export interface SyncMessage<T = unknown> {
    type: string;
    payload?: T;
    senderId?: string;
    timestamp: number;
}

export type SyncCallback<T = unknown> = (message: SyncMessage<T>) => void;

const CHANNEL_NAME: SyncChannelName = 'tide_state_sync';

let channelInstance: BroadcastChannel | null = null;

const tabInstanceId: string = (() => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 10);
})();

function getBroadcastChannel(): BroadcastChannel | null {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
        return null;
    }
    if (!channelInstance) {
        try {
            channelInstance = new BroadcastChannel(CHANNEL_NAME);
        } catch {
            return null;
        }
    }
    return channelInstance;
}

/**
 * Broadcasts a state change or sync event to other open tabs.
 * In SSR or environments without BroadcastChannel support, this is a safe no-op.
 */
export function broadcastSync<T = unknown>(type: string, payload?: T): void {
    const channel = getBroadcastChannel();
    if (!channel) return;

    try {
        const message: SyncMessage<T> = {
            type,
            payload,
            senderId: tabInstanceId,
            timestamp: Date.now(),
        };
        channel.postMessage(message);
    } catch {
        // Broadcast failed silently or payload could not be structured-cloned
    }
}

/**
 * Subscribes to sync messages broadcast by other tabs.
 * Automatically filters out messages originating from this same tab/instance.
 * Returns an unsubscribe cleanup function.
 */
export function subscribeToSync<T = unknown>(callback: SyncCallback<T>): () => void {
    const channel = getBroadcastChannel();
    if (!channel) {
        return () => {};
    }

    const handler = (event: MessageEvent<SyncMessage<T>>) => {
        try {
            const data = event.data;
            if (!data || typeof data !== 'object') return;
            if (data.senderId === tabInstanceId) return;
            callback(data);
        } catch (err) {
            console.error('[broadcastSync] Error processing incoming sync message:', err);
        }
    };

    channel.addEventListener('message', handler as EventListener);
    return () => {
        channel.removeEventListener('message', handler as EventListener);
    };
}

/**
 * Returns the current tab's unique instance ID for sync identification.
 */
export function getSyncClientId(): string {
    return tabInstanceId;
}

/**
 * Explicitly closes the broadcast channel (useful for tests or hot reloading).
 */
export function closeSyncChannel(): void {
    if (channelInstance) {
        try {
            channelInstance.close();
        } catch {
            // Ignore error on close
        }
        channelInstance = null;
    }
}
