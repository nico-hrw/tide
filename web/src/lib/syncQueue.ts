import { idb } from './idb';

export interface QueueItem {
    id: string;
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: any;
    timestamp: number;
    description?: string;
    fileId?: string;
    retryCount?: number;
}

const SYNC_QUEUE_KEY = 'tide_offline_sync_queue';
let isFlushing = false;
let listenersInitialized = false;

export async function getSyncQueue(): Promise<QueueItem[]> {
    try {
        const queue = await idb.get<QueueItem[]>(SYNC_QUEUE_KEY);
        return Array.isArray(queue) ? queue : [];
    } catch (e) {
        console.error('[SyncQueue] Failed to get sync queue', e);
        return [];
    }
}

export async function addToSyncQueue(item: Omit<QueueItem, 'id' | 'timestamp'>): Promise<QueueItem> {
    const fullItem: QueueItem = {
        ...item,
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sync_${Date.now()}_${Math.random()}`,
        timestamp: Date.now(),
        retryCount: 0
    };

    try {
        const queue = await getSyncQueue();
        
        // If an update for the exact same fileId and URL already exists in the queue, replace it to avoid duplicate writes
        let nextQueue: QueueItem[];
        if (fullItem.fileId && (fullItem.method === 'PUT' || fullItem.method === 'POST')) {
            const filtered = queue.filter(q => !(q.fileId === fullItem.fileId && q.url === fullItem.url));
            nextQueue = [...filtered, fullItem];
        } else {
            nextQueue = [...queue, fullItem];
        }

        await idb.set(SYNC_QUEUE_KEY, nextQueue);
        notifyQueueChanged(nextQueue.length);
        console.log(`[SyncQueue] Added item to queue (${nextQueue.length} pending):`, fullItem.url);
        return fullItem;
    } catch (e) {
        console.error('[SyncQueue] Failed to add item to sync queue', e);
        return fullItem;
    }
}

export async function removeFromSyncQueue(id: string): Promise<void> {
    try {
        const queue = await getSyncQueue();
        const nextQueue = queue.filter(item => item.id !== id);
        await idb.set(SYNC_QUEUE_KEY, nextQueue);
        notifyQueueChanged(nextQueue.length);
    } catch (e) {
        console.error('[SyncQueue] Failed to remove item from sync queue', e);
    }
}

export async function clearSyncQueue(): Promise<void> {
    try {
        await idb.del(SYNC_QUEUE_KEY);
        notifyQueueChanged(0);
    } catch (e) {
        console.error('[SyncQueue] Failed to clear sync queue', e);
    }
}

function notifyQueueChanged(pendingCount: number) {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tide-sync-queue-updated', { 
            detail: { pendingCount } 
        }));
    }
}

export async function flushSyncQueue(): Promise<{ success: number; failed: number }> {
    if (isFlushing) {
        return { success: 0, failed: 0 };
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return { success: 0, failed: 0 };
    }

    isFlushing = true;
    let success = 0;
    let failed = 0;

    try {
        const queue = await getSyncQueue();
        if (queue.length === 0) {
            isFlushing = false;
            return { success: 0, failed: 0 };
        }

        console.log(`[SyncQueue] Starting flush for ${queue.length} pending items...`);
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('tide-syncing', { detail: { count: queue.length } }));
        }

        // Dynamically import apiFetch to prevent circular import issues
        const { apiFetch } = await import('./api');

        const remainingQueue: QueueItem[] = [];

        for (const item of queue) {
            try {
                // Ensure auth token header is up to date
                const token = typeof window !== 'undefined' ? localStorage.getItem("tide_session_token") : null;
                const headers: Record<string, string> = {
                    ...(item.headers || {}),
                    ...(token ? { "Authorization": `Bearer ${token}` } : {})
                };

                let bodyPayload: any = item.body;
                if (bodyPayload && typeof bodyPayload === 'object' && !(bodyPayload instanceof Blob) && !(bodyPayload instanceof FormData)) {
                    bodyPayload = JSON.stringify(bodyPayload);
                }

                const res = await apiFetch(item.url, {
                    method: item.method,
                    headers,
                    body: bodyPayload,
                    // Bypasses offline auto-enqueueing in apiFetch so it doesn't re-enqueue itself
                    ...({ _isSyncReplay: true } as any)
                });

                if (res.ok) {
                    success++;
                    console.log(`[SyncQueue] Successfully synced ${item.method} ${item.url}`);
                } else if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
                    // Client errors (4xx except timeouts) will never succeed on retry; discard them
                    console.warn(`[SyncQueue] Dropping unrecoverable failed item (${res.status}): ${item.url}`);
                    failed++;
                } else {
                    // Server error (5xx) or rate limit: keep in queue for next retry
                    failed++;
                    remainingQueue.push({
                        ...item,
                        retryCount: (item.retryCount || 0) + 1
                    });
                }
            } catch (err) {
                console.error(`[SyncQueue] Network error executing queued item ${item.url}:`, err);
                failed++;
                remainingQueue.push({
                    ...item,
                    retryCount: (item.retryCount || 0) + 1
                });
                // If network connection died mid-flush, stop further attempts for now
                break;
            }
        }

        await idb.set(SYNC_QUEUE_KEY, remainingQueue);
        notifyQueueChanged(remainingQueue.length);

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('tide-synced', { 
                detail: { success, remaining: remainingQueue.length } 
            }));
        }

        console.log(`[SyncQueue] Flush complete. Synced: ${success}, Remaining: ${remainingQueue.length}`);
    } catch (e) {
        console.error('[SyncQueue] Unexpected error during flushSyncQueue', e);
    } finally {
        isFlushing = false;
    }

    return { success, failed };
}

export function initSyncQueueListener() {
    if (listenersInitialized || typeof window === 'undefined') return;
    listenersInitialized = true;

    // Listen to browser network online event
    window.addEventListener('online', () => {
        console.log('[SyncQueue] Browser online event detected. Flushing queue...');
        window.dispatchEvent(new CustomEvent('tide-online'));
        setTimeout(() => {
            flushSyncQueue();
        }, 1500); // Short delay to let sockets stabilize
    });

    window.addEventListener('offline', () => {
        console.log('[SyncQueue] Browser offline event detected.');
        window.dispatchEvent(new CustomEvent('tide-offline', { detail: 'Network offline' }));
    });

    // Check queue count immediately on init
    getSyncQueue().then(queue => {
        notifyQueueChanged(queue.length);
        if (queue.length > 0 && navigator.onLine) {
            flushSyncQueue();
        }
    });

    // Periodic heartbeat every 60s when queue is not empty
    setInterval(async () => {
        if (navigator.onLine) {
            const queue = await getSyncQueue();
            if (queue.length > 0) {
                flushSyncQueue();
            }
        }
    }, 60000);
}
