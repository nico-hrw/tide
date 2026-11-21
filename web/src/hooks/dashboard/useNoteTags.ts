'use client';

import { apiFetch } from '@/lib/api';
import { isForeignOwned } from '@/lib/tags';
import { useDataStore } from '@/store/useDataStore';

export interface SetNoteTagsOptions {
    strict?: boolean;
}

interface TideWindow extends Window {
    __tideSaveTimestamp?: () => void;
}

interface RemoteFile {
    version?: number;
    metadata?: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

async function fetchRemote(noteId: string): Promise<{ metadata: Record<string, unknown>; version: number | undefined }> {
    const res = await apiFetch(`/api/v1/files/${noteId}`);
    if (!res.ok) throw new Error('Could not read note metadata');
    const file = (await res.json()) as RemoteFile;
    const metadata = file.metadata == null ? {} : file.metadata;
    if (!isRecord(metadata)) throw new Error('Unexpected note metadata');
    return { metadata, version: typeof file.version === 'number' ? file.version : undefined };
}

/**
 * `version` doubles as the encryption format marker (v1 notes are version 1/0). A versioned PUT bumps it on the
 * server and would turn a legacy note into "v2" without re-encrypting it, so `version` is only sent for v2+ files.
 */
async function putMetadata(noteId: string, tagIds: string[]): Promise<{ res: Response; versioned: boolean }> {
    // Fresh server state, so keys written meanwhile (content key info, title, ...) are never dropped.
    const { metadata, version } = await fetchRemote(noteId);
    const body: Record<string, unknown> = { metadata: { ...metadata, tagIds } };
    const versioned = version !== undefined && version >= 2;
    if (versioned) body.version = version;
    const tideWin = window as TideWindow;
    if (tideWin.__tideSaveTimestamp) tideWin.__tideSaveTimestamp();
    const res = await apiFetch(`/api/v1/files/${noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return { res, versioned };
}

async function persist(noteId: string, tagIds: string[]): Promise<number | undefined> {
    let { res, versioned } = await putMetadata(noteId, tagIds);
    if (res.status === 409 && versioned) ({ res, versioned } = await putMetadata(noteId, tagIds));
    if (!res.ok) throw new Error(`Failed to save note tags (${res.status})`);
    if (!versioned) return undefined;
    try {
        const data = (await res.json()) as { version?: unknown };
        return typeof data?.version === 'number' ? data.version : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Sets the tag ids of a note. Only `metadata.tagIds` changes (legacy free-form `tags` stays untouched): the current server metadata is merged,
 * content and secured_meta are never sent. Only the owner may change tags.
 */
export async function setNoteTags(noteId: string, ids: string[], options?: SetNoteTagsOptions): Promise<void> {
    const strict = options?.strict === true;
    const fail = (message: string, cause?: unknown): void => {
        const err = cause instanceof Error ? cause : new Error(message);
        if (strict) throw err;
        console.error(message, cause);
    };

    const store = useDataStore.getState();
    const note = store.notes.find((n) => n.id === noteId);
    if (!note) return fail('Note not found for tag update');
    if (!store.myId && (note as { owner_id?: string }).owner_id) {
        if (strict) throw new Error('User not ready, cannot change note tags');
        console.warn('[setNoteTags] user not ready, skipped');
        return;
    }
    if (isForeignOwned(note as { owner_id?: string }, store.myId ?? undefined)) {
        if (strict) throw new Error('Only the owner can change note tags');
        return;
    }

    const tagIds = [...new Set(ids)];
    const prevTagIds = note.tagIds;
    const prevMetadata = note.metadata;
    const baseMeta = isRecord(prevMetadata) ? prevMetadata : {};
    store.updateFileRaw(noteId, { tagIds, metadata: { ...baseMeta, tagIds } });

    try {
        const version = await persist(noteId, tagIds);
        if (version !== undefined) useDataStore.getState().updateFileRaw(noteId, { version });
    } catch (e) {
        if (strict) {
            useDataStore.getState().updateFileRaw(noteId, { tagIds: prevTagIds, metadata: prevMetadata });
            throw e;
        }
        console.error('Failed to save note tags', e);
    }
}

export function useNoteTags(): { setNoteTags: typeof setNoteTags } {
    // Module-level function: identity is stable across renders.
    return { setNoteTags };
}
