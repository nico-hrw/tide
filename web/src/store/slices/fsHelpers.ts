import type { DataItem, TaskItem } from './types';
import { apiFetch } from '@/lib/api';

export interface RawFileItem {
    id: string;
    type: string;
    title?: string;
    parent_id?: string | null;
    version?: number;
    metadata?: Record<string, unknown>;
    public_meta?: Record<string, unknown>;
    secured_meta?: string;
    access_keys?: Record<string, string>;
    visibility?: string;
    share_status?: string;
    [key: string]: unknown;
}

export interface DecryptedFileResult {
    item?: DataItem;
    type?: 'note' | 'event';
    metadata?: Record<string, unknown>;
    isCorrupted?: boolean;
    skipped?: boolean;
}

function initDeletedTaskIds(): Set<string> {
    if (typeof window === 'undefined') return new Set<string>();
    try {
        const stored = localStorage.getItem('tide_deleted_task_ids');
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
                return new Set<string>(parsed);
            }
        }
    } catch {
        // Fallback to empty Set
    }
    return new Set<string>();
}

export const deletedTaskIds = initDeletedTaskIds();

export function recordDeletedTaskId(id: string): void {
    deletedTaskIds.add(id);
    if (typeof window !== 'undefined') {
        try {
            localStorage.setItem('tide_deleted_task_ids', JSON.stringify([...deletedTaskIds]));
        } catch (e) {
            console.warn('Failed to save deleted task IDs to storage', e);
        }
    }
}

function loadFromStorage<T>(key: string): T[] {
    if (typeof window === 'undefined') return [];
    try {
        const cached = localStorage.getItem(key);
        return cached ? (JSON.parse(cached) as T[]) : [];
    } catch {
        return [];
    }
}

function saveToStorage<T>(key: string, data: T): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.warn(`Failed to save ${key} to offline cache`, e);
    }
}

export const loadCachedNotes = (): DataItem[] => loadFromStorage<DataItem>('tide_offline_notes');
export const saveNotesToOfflineCache = (n: DataItem[]): void => saveToStorage('tide_offline_notes', n);
export const loadCachedEvents = (): DataItem[] => loadFromStorage<DataItem>('tide_offline_events');
export const saveEventsToOfflineCache = (e: DataItem[]): void => saveToStorage('tide_offline_events', e);
export const loadCachedTasks = (): TaskItem[] => loadFromStorage<TaskItem>('tide_offline_tasks');
export const saveTasksToOfflineCache = (t: TaskItem[]): void => saveToStorage('tide_offline_tasks', t);
export const loadOpenFoldersFromCache = (): Set<string> => new Set(loadFromStorage<string>('tide_open_folders'));
export const saveOpenFoldersToCache = (ids: Set<string>): void => saveToStorage('tide_open_folders', Array.from(ids));

export async function parseSafeJson<T = unknown[]>(res: Response, fallback: T = [] as unknown as T): Promise<T> {
    try {
        const text = await res.text();
        return text ? (JSON.parse(text) as T) : fallback;
    } catch (e) {
        console.warn('[STATE-AUDIT] Failed to parse JSON, returning fallback', e);
        return fallback;
    }
}

export async function decryptTasks(
    tasksList: Array<{ id: string; encrypted_vault?: string; [key: string]: unknown }>,
    privateKey: CryptoKey
): Promise<TaskItem[]> {
    const cryptoLib = await import('@/lib/crypto');
    const loadedTasks: TaskItem[] = [];

    for (const t of tasksList) {
        if (!t.encrypted_vault) continue;
        try {
            const meta = await cryptoLib.decryptMetadata(t.encrypted_vault, privateKey, `task-${t.id}`);
            if (!meta.isLocked) {
                loadedTasks.push({
                    id: t.id,
                    ...meta,
                    status: (meta.status as TaskItem['status']) || (meta.isCompleted ? 'completed' : 'todo'),
                    recurrence: meta.recurrence as TaskItem['recurrence'],
                    recurrence_rule: meta.recurrence_rule as string | undefined,
                    recurrence_end: meta.recurrence_end as string | undefined,
                    completed_dates: meta.completed_dates as string[] | undefined,
                    folder: meta.folder as string | undefined,
                    tags: Array.isArray(meta.tags) ? (meta.tags as string[]) : [],
                    showInCalendar: meta.showInCalendar !== undefined ? (meta.showInCalendar as boolean) : true,
                    createdAt: meta.createdAt as string | undefined,
                    completedAt: meta.completedAt as string | undefined,
                    updatedAt: meta.updatedAt as string | undefined,
                    isArchived: meta.isArchived as boolean | undefined,
                    parentId: (meta.parentId as string | null) ?? null,
                    order: (meta.order as number) ?? 0,
                    synced: true,
                } as unknown as TaskItem);
            } else {
                loadedTasks.push({ id: t.id, title: 'Locked Task (Decrypting...)', isCompleted: false, status: 'todo', isLocked: true, synced: true } as unknown as TaskItem);
            }
        } catch {
            loadedTasks.push({ id: t.id, title: 'Locked Task (Decrypting...)', isCompleted: false, status: 'todo', isLocked: true, synced: true } as unknown as TaskItem);
        }
    }
    return loadedTasks;
}

export function reconcileTasksWithLocal(
    loadedTasks: TaskItem[],
    currentTasks: TaskItem[],
    deletedIds: Set<string> = deletedTaskIds
): TaskItem[] {
    const localMap = new Map(currentTasks.map(t => [t.id, t]));
    const reconciled: TaskItem[] = [];

    for (const bt of loadedTasks) {
        if (deletedIds.has(bt.id)) continue;
        const local = localMap.get(bt.id);
        if (!local) {
            reconciled.push({ ...bt, synced: true } as TaskItem);
            continue;
        }

        const localUpdatedAt = local.updatedAt;
        const btUpdatedAt = bt.updatedAt;
        const localTime = localUpdatedAt ? new Date(localUpdatedAt).getTime() : NaN;
        const btTime = btUpdatedAt ? new Date(btUpdatedAt).getTime() : NaN;

        const hasBothTimestamps = !isNaN(localTime) && !isNaN(btTime);
        const isLocalNewer = hasBothTimestamps ? localTime > btTime : !isNaN(localTime);

        // Ensure that if a task's isCompleted is true in local or remote,
        // the most recent update timestamp or completed state is preserved reliably.
        const resolvedCompleted = hasBothTimestamps
            ? (isLocalNewer ? (local.isCompleted ?? bt.isCompleted) : (bt.isCompleted ?? local.isCompleted))
            : Boolean(local.isCompleted || bt.isCompleted);

        const resolvedCompletedAt = resolvedCompleted
            ? (isLocalNewer
                ? (local.completedAt || bt.completedAt || localUpdatedAt || btUpdatedAt)
                : (bt.completedAt || local.completedAt || btUpdatedAt || localUpdatedAt))
            : undefined;

        const resolvedStatus: TaskItem['status'] = resolvedCompleted
            ? 'completed'
            : (isLocalNewer
                ? (local.status && local.status !== 'completed' ? local.status : bt.status && bt.status !== 'completed' ? bt.status : 'todo')
                : (bt.status && bt.status !== 'completed' ? bt.status : local.status && local.status !== 'completed' ? local.status : 'todo'));

        const resolvedUpdatedAt = (!isNaN(localTime) && !isNaN(btTime))
            ? (localTime >= btTime ? localUpdatedAt : btUpdatedAt)
            : (localUpdatedAt || btUpdatedAt);

        if (isLocalNewer) {
            reconciled.push({
                ...bt,
                ...local,
                title: local.title ?? bt.title,
                description: local.description !== undefined ? local.description : bt.description,
                color: local.color !== undefined ? local.color : bt.color,
                priority: local.priority !== undefined ? local.priority : bt.priority,
                folder: local.folder !== undefined ? local.folder : bt.folder,
                tags: local.tags !== undefined ? local.tags : bt.tags,
                dueDate: local.dueDate, // Never allow stale bt.dueDate to overwrite local edit or clear
                scheduledDate: local.scheduledDate !== undefined ? local.scheduledDate : bt.scheduledDate,
                recurrence: local.recurrence !== undefined ? local.recurrence : bt.recurrence,
                recurrence_rule: local.recurrence_rule !== undefined ? local.recurrence_rule : bt.recurrence_rule,
                recurrence_end: local.recurrence_end !== undefined ? local.recurrence_end : bt.recurrence_end,
                showInCalendar: local.showInCalendar !== undefined ? local.showInCalendar : bt.showInCalendar,
                status: resolvedStatus,
                isCompleted: resolvedCompleted,
                completedAt: resolvedCompletedAt,
                updatedAt: resolvedUpdatedAt,
                isArchived: local.isArchived !== undefined ? local.isArchived : bt.isArchived,
                parentId: local.parentId !== undefined ? local.parentId : bt.parentId,
                order: local.order !== undefined ? local.order : bt.order,
                completed_dates: local.completed_dates !== undefined ? local.completed_dates : bt.completed_dates,
                createdAt: local.createdAt || bt.createdAt,
                linkedNoteId: local.linkedNoteId !== undefined ? local.linkedNoteId : bt.linkedNoteId,
                synced: true,
            } as TaskItem);
        } else {
            reconciled.push({
                ...local,
                ...bt,
                title: bt.title ?? local.title,
                description: bt.description !== undefined ? bt.description : local.description,
                color: bt.color !== undefined ? bt.color : local.color,
                priority: bt.priority !== undefined ? bt.priority : local.priority,
                folder: bt.folder !== undefined ? bt.folder : local.folder,
                tags: (bt.tags !== undefined && bt.tags.length > 0) ? bt.tags : (local.tags ?? bt.tags),
                dueDate: bt.dueDate !== undefined ? bt.dueDate : local.dueDate,
                scheduledDate: bt.scheduledDate !== undefined ? bt.scheduledDate : local.scheduledDate,
                recurrence: bt.recurrence !== undefined ? bt.recurrence : local.recurrence,
                recurrence_rule: bt.recurrence_rule !== undefined ? bt.recurrence_rule : local.recurrence_rule,
                recurrence_end: bt.recurrence_end !== undefined ? bt.recurrence_end : local.recurrence_end,
                showInCalendar: bt.showInCalendar !== undefined ? bt.showInCalendar : (local.showInCalendar ?? true),
                status: resolvedStatus,
                isCompleted: resolvedCompleted,
                completedAt: resolvedCompletedAt,
                updatedAt: resolvedUpdatedAt,
                isArchived: bt.isArchived !== undefined ? bt.isArchived : local.isArchived,
                parentId: bt.parentId !== undefined ? bt.parentId : local.parentId,
                order: bt.order !== undefined ? bt.order : local.order,
                completed_dates: (local.completed_dates && (!bt.completed_dates || local.completed_dates.length > bt.completed_dates.length))
                    ? local.completed_dates
                    : (bt.completed_dates ?? local.completed_dates),
                createdAt: bt.createdAt || local.createdAt,
                linkedNoteId: bt.linkedNoteId !== undefined ? bt.linkedNoteId : local.linkedNoteId,
                synced: true,
            } as TaskItem);
        }
    }

    const backendIds = new Set(loadedTasks.map(t => t.id));
    const localOnly = currentTasks.filter(t => {
        if (backendIds.has(t.id) || deletedIds.has(t.id)) return false;
        // Fix zombie task resurrection bug:
        // When syncing with backend (loadedTasks), if a task exists in local cache but is NOT present in loadedTasks,
        // do NOT automatically treat it as a new "local-only" task if it already had a backend record or was previously synced.
        // Only keep genuinely unsynced local offline tasks (!t.synced or explicit offline draft marker).
        return (t as any).synced === false || (t as any).isOfflineDraft === true || (t as any).isDraft === true;
    });
    return localOnly.length > 0 ? [...reconciled, ...localOnly] : reconciled;
}

export function mergeMetadataCache(
    existingCache: Record<string, unknown>,
    incomingCache: Record<string, unknown>
): Record<string, unknown> {
    const merged = { ...existingCache };
    for (const [key, val] of Object.entries(incomingCache)) {
        const current = merged[key] as Record<string, unknown> | undefined;
        if (current && typeof current === 'object') {
            const finalVal = { ...(val as Record<string, unknown>) };
            if (
                (finalVal.title === 'Untitled' || finalVal.title === 'Locked Note (Decrypting...)') &&
                typeof current.title === 'string' &&
                current.title !== 'Untitled' &&
                !current.title.includes('Locked Note')
            ) {
                finalVal.title = current.title;
                finalVal.isLocked = current.isLocked || false;
            }
            if ((current.effect || current.color) && !finalVal.effect) {
                finalVal.effect = current.effect;
                finalVal.color = current.color;
            }
            merged[key] = finalVal;
        } else {
            merged[key] = val;
        }
    }
    return merged;
}

export async function decryptAndNormalizeFileItem(
    file: RawFileItem,
    privateKey: CryptoKey | null,
    context: {
        existingItems?: DataItem[];
        cachedMetadata?: Record<string, unknown>;
        forceRefresh?: boolean;
        cachePrefix?: string;
    }
): Promise<DecryptedFileResult> {
    if (file.type === 'index' || file.type === 'canvas-asset') {
        return { skipped: true };
    }

    const { existingItems = [], cachedMetadata, forceRefresh = false, cachePrefix = 'lazy' } = context;

    if (!forceRefresh && cachedMetadata && cachedMetadata[file.id]) {
        const cached = cachedMetadata[file.id] as Record<string, unknown>;
        const isStale = Boolean(cached.isLocked || cached.title === 'Locked Note (Decrypting...)');
        if (!isStale) {
            const normalizedCached: DataItem = {
                ...file,
                ...cached,
                title: (typeof cached.title === 'string' && cached.title) || (typeof file.title === 'string' && file.title) || 'Untitled',
                isGroup: (cached.isGroup as boolean | undefined) || ((file.public_meta as Record<string, unknown> | undefined)?.isGroup as boolean | undefined) || undefined,
                parent_id: (file.parent_id as string | null) || null,
                color: (typeof cached.color === 'string' && cached.color) || (typeof file.metadata?.color === 'string' ? file.metadata.color : undefined) || (file.color as string | undefined),
            };
            return {
                item: normalizedCached,
                type: file.type === 'event' ? 'event' : 'note',
            };
        }
    }

    const hasNoMetadata = !file.metadata || (typeof file.metadata === 'object' && Object.keys(file.metadata).length === 0);
    const isGCalEvent = file.type === 'event' && Boolean((file.public_meta as Record<string, unknown> | undefined)?.gcal_id);

    if (
        !isGCalEvent &&
        (!file.secured_meta || file.secured_meta.trim() === '') &&
        hasNoMetadata &&
        (!file.access_keys || Object.keys(file.access_keys).length === 0) &&
        file.visibility !== 'public' &&
        file.type !== 'folder'
    ) {
        console.warn(`[STATE-AUDIT] Auto-deleting ghost/corrupted file ${file.id} from database...`);
        apiFetch(`/api/v1/files/${file.id}`, { method: 'DELETE' }).catch(err => {
            console.error(`[STATE-AUDIT] Failed to auto-delete ghost file ${file.id}`, err);
        });
        return { isCorrupted: true, skipped: true };
    }

    let metaData: Record<string, unknown> = { title: 'Untitled' };

    if (isGCalEvent) {
        const pm = (file.public_meta as Record<string, unknown>) || {};
        metaData = {
            title: pm.title || 'Untitled Event',
            start: pm.start,
            end: pm.end,
            allDay: pm.allDay,
            gcal_id: pm.gcal_id,
            gcal_origin: true,
            color: pm.color,
            gcal_calendar_id: pm.gcal_calendar_id,
        };
    } else {
        if (file.metadata && typeof file.metadata.title === 'string') metaData.title = file.metadata.title;
        if (file.metadata && typeof file.metadata.color === 'string') metaData.color = file.metadata.color;

        const existing = existingItems.find(x => x.id === file.id);
        if (existing && typeof existing.title === 'string' && !existing.title.includes('Locked Note') && existing.title !== 'Untitled') {
            metaData.title = existing.title;
        }

        if (file.visibility === 'public') {
            if (file.public_meta && typeof file.public_meta.title === 'string') metaData.title = file.public_meta.title;
        } else if ((file.version ?? 0) >= 2 && file.metadata) {
            metaData = { ...file.metadata, title: file.metadata.title || 'Untitled', isLocked: false };
            if (file.secured_meta && privateKey) {
                const cryptoLib = await import('@/lib/crypto');
                const meta = await cryptoLib.decryptMetadata(file.secured_meta, privateKey, `${cachePrefix}-${file.id}`);
                if (!meta.isLocked) {
                    metaData = { ...metaData, ...meta, title: meta.title || metaData.title || 'Untitled', isLocked: false };
                    if (file.metadata && typeof file.metadata.color === 'string') {
                        metaData.color = file.metadata.color;
                    }
                } else if (metaData.title && typeof metaData.title === 'string' && !metaData.title.includes('Locked Note')) {
                    metaData.isLocked = true;
                } else if (file.type !== 'folder') {
                    metaData.title = 'Locked Note (Decrypting...)';
                    metaData.isLocked = true;
                }
            }
        } else if (file.secured_meta && privateKey) {
            const cryptoLib = await import('@/lib/crypto');
            const meta = await cryptoLib.decryptMetadata(file.secured_meta, privateKey, `${cachePrefix}-${file.id}`);
            if (!meta.isLocked) {
                metaData = { ...meta, title: meta.title || 'Untitled', isLocked: false };
                if (file.metadata && typeof file.metadata.color === 'string') {
                    metaData.color = file.metadata.color;
                }
            } else if (metaData.title && typeof metaData.title === 'string' && !metaData.title.includes('Locked Note') && metaData.title !== 'Untitled') {
                metaData.isLocked = true;
            } else {
                metaData = { title: file.type === 'folder' ? 'Untitled' : 'Locked Note (Decrypting...)', isLocked: true };
                console.warn(`[CRYPTO-AUDIT] Failed to decrypt legacy metadata for ${file.id} (${file.type})`);
            }
        }

        if (file.metadata && typeof file.metadata.color === 'string' && (!metaData.color || typeof metaData.color !== 'string')) {
            metaData.color = file.metadata.color;
        }
    }

    const savedCacheEntry: Record<string, unknown> = { ...metaData, parent_id: file.parent_id || null };
    const normalizedItem: DataItem = {
        ...file,
        ...metaData,
        title: (typeof metaData.title === 'string' && metaData.title) || (typeof file.title === 'string' && file.title) || 'Untitled',
        isGroup: (metaData.isGroup as boolean | undefined) || ((file.public_meta as Record<string, unknown> | undefined)?.isGroup as boolean | undefined) || undefined,
        parent_id: (file.parent_id as string | null) || null,
        color: (typeof metaData.color === 'string' && metaData.color) || (typeof file.metadata?.color === 'string' ? file.metadata.color : undefined) || (file.color as string | undefined),
    };

    if (file.type === 'event') {
        const isValidDate = (d: unknown) => typeof d === 'string' && d !== '' && !isNaN(new Date(d).getTime());
        return {
            item: {
                ...normalizedItem,
                start: isValidDate(metaData.start) ? (metaData.start as string) : new Date().toISOString(),
                end: isValidDate(metaData.end) ? (metaData.end as string) : new Date().toISOString(),
            },
            type: 'event',
            metadata: savedCacheEntry,
        };
    }

    return {
        item: normalizedItem,
        type: 'note',
        metadata: savedCacheEntry,
    };
}
