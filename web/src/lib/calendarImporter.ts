import type { ParsedIcsEvent } from '@/lib/icsParser';
import { apiFetch } from '@/lib/api';
import { useDataStore, type DataItem } from '@/store/useDataStore';
import { encryptFileV2 } from '@/lib/cryptoV2';
import * as cryptoLib from '@/lib/crypto';
import { buildSecuredEventMeta } from '@/lib/securedEventMeta';

export interface ImportProgress {
    current: number;
    total: number;
    successCount: number;
    failCount: number;
}

export interface ImportOptions {
    /** Ordered tag ids for an event: the first is the main tag, the rest are secondary tags. */
    tagIdsFor?: (event: ParsedIcsEvent) => string[];
    color?: string;
    onProgress?: (progress: ImportProgress) => void;
}

export interface ImportResult {
    total: number;
    imported: number;
    failed: number;
    errors: string[];
}

const CHUNK_SIZE = 5;

/**
 * Batch imports parsed calendar events into Tide's encrypted backend
 * and updates the Zustand store and offline cache.
 */
export async function importCalendarEvents(
    events: ParsedIcsEvent[],
    options?: ImportOptions
): Promise<ImportResult> {
    const total = events.length;
    if (total === 0) {
        return { total: 0, imported: 0, failed: 0, errors: [] };
    }

    const { publicKey, myId } = useDataStore.getState();
    if (!publicKey || !myId) {
        return {
            total,
            imported: 0,
            failed: total,
            errors: ['Kein Benutzer oder kryptografischer Schlüssel gefunden.'],
        };
    }

    const createdItems: DataItem[] = [];
    const errors: string[] = [];
    let processedCount = 0;

    const reportProgress = () => {
        options?.onProgress?.({
            current: processedCount,
            total,
            successCount: createdItems.length,
            failCount: errors.length,
        });
    };

    // Process events in concurrent chunks
    for (let i = 0; i < total; i += CHUNK_SIZE) {
        const chunk = events.slice(i, i + CHUNK_SIZE);

        await Promise.all(
            chunk.map(async (event) => {
                try {
                    const tagIds = [...new Set(options?.tagIdsFor?.(event) ?? [])];
                    const meta: Record<string, unknown> = {
                        title: event.title,
                        start: event.start,
                        end: event.end,
                        allDay: event.allDay,
                        description: event.description || '',
                        location: event.location || '',
                        groupIds: tagIds.length > 0 ? tagIds : undefined,
                        color: options?.color || undefined,
                        recurrence_rule: event.recurrenceRule || undefined,
                        recurrence_end: event.recurrenceEnd,
                        exdates: event.exdates,
                        is_cancelled: event.isCancelled || false,
                    };

                    // RSA-OAEP can only encrypt ~190 bytes, so secured_meta carries just the essentials.
                    // Full details live in `metadata` and the AES-encrypted content blob.
                    const securedMeta = await cryptoLib.encryptMetadata(buildSecuredEventMeta(event), publicKey);

                    const contentString = JSON.stringify({
                        title: event.title,
                        description: event.description || '',
                        location: event.location || '',
                    });

                    const v2Result = await encryptFileV2(contentString, publicKey);

                    const bodyPayload: Record<string, unknown> = {
                        type: 'event',
                        parent_id: tagIds[0] ?? null,
                        public_meta: {},
                        secured_meta: securedMeta,
                        version: 2,
                        metadata: {
                            ...v2Result.metadata,
                            ...meta,
                        },
                        access_keys: { [myId]: v2Result.encrypted_dek },
                        content_ciphertext: v2Result.content_ciphertext,
                    };

                    const res = await apiFetch('/api/v1/files', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(bodyPayload),
                    });

                    if (!res.ok) {
                        throw new Error(`Server returned ${res.status} ${res.statusText}`);
                    }

                    const newFile = (await res.json()) as { id: string; [key: string]: unknown };

                    const item: DataItem = {
                        ...newFile,
                        id: newFile.id,
                        title: event.title,
                        type: 'event',
                        parent_id: tagIds[0] ?? null,
                        ...meta,
                    };

                    createdItems.push(item);
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    errors.push(`Fehler beim Importieren von "${event.title}": ${msg}`);
                } finally {
                    processedCount += 1;
                    reportProgress();
                }
            })
        );
    }

    if (createdItems.length > 0) {
        const store = useDataStore.getState();
        const currentEvents = store.events || [];
        const mergedEvents = [...currentEvents, ...createdItems];
        store.setEvents(mergedEvents);
    }

    return {
        total,
        imported: createdItems.length,
        failed: total - createdItems.length,
        errors,
    };
}
