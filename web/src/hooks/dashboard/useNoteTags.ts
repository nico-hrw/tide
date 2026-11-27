'use client';

import { apiFetch } from '@/lib/api';
import {
    decryptSecuredEnvelope,
    encryptSecuredEnvelope,
    stripSensitiveFileMetadata,
} from '@/lib/e2eePayload';
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
    secured_meta?: string;
    access_keys?: unknown;
    visibility?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

async function fetchRemote(noteId: string): Promise<{
    metadata: Record<string, unknown>;
    version: number | undefined;
    securedMeta: string | undefined;
    accessKeys: unknown;
    visibility: string | undefined;
}> {
    const res = await apiFetch(`/api/v1/files/${noteId}`);
    if (!res.ok) throw new Error('Could not read note metadata');
    const file = (await res.json()) as RemoteFile;
    const metadata = file.metadata == null ? {} : file.metadata;
    if (!isRecord(metadata)) throw new Error('Unexpected note metadata');
    return {
        metadata,
        version: typeof file.version === 'number' ? file.version : undefined,
        securedMeta: typeof file.secured_meta === 'string' ? file.secured_meta : undefined,
        accessKeys: file.access_keys,
        visibility: typeof file.visibility === 'string' ? file.visibility : undefined,
    };
}

/**
 * `version` doubles as the encryption format marker (v1 notes are version 1/0). A versioned PUT bumps it on the
 * server and would turn a legacy note into "v2" without re-encrypting it, so `version` is only sent for v2+ files.
 */
async function putMetadata(
    noteId: string,
    tagIds: string[]
): Promise<{ res: Response; versioned: boolean; encryptedMeta?: string; strippedMeta?: Record<string, unknown> }> {
    // Fresh server state, so keys written meanwhile (content key info, title, ...) are never dropped.
    const { metadata, version, securedMeta, accessKeys, visibility } = await fetchRemote(noteId);
    const versioned = version !== undefined && version >= 2;

    const store = useDataStore.getState();
    const note = store.notes.find((n) => n.id === noteId);
    const hasSecured = typeof securedMeta === 'string' && securedMeta.trim().length > 0;
    const isOpen = visibility === 'public' || (metadata.unencrypted === true && !hasSecured);

    const body: Record<string, unknown> = {};
    let encryptedMeta: string | undefined;
    let strippedMeta: Record<string, unknown> | undefined;

    if (!isOpen && store.publicKey && store.privateKey) {
        let existingSecured: Record<string, unknown> = {};
        if (hasSecured && securedMeta) {
            const dec = await decryptSecuredEnvelope(securedMeta, store.privateKey, {
                accessKeys,
                myId: store.myId,
            });
            if (!dec.isLocked) existingSecured = dec;
        }
        const mergedSecured: Record<string, unknown> = {
            ...existingSecured,
            ...(existingSecured.title !== undefined ? {} : note?.title ? { title: note.title } : {}),
            ...(existingSecured.safe !== undefined ? {} : note?.safe ? { safe: note.safe } : {}),
            ...(existingSecured.linkedSafes !== undefined
                ? {}
                : Array.isArray(note?.linkedSafes)
                ? { linkedSafes: note.linkedSafes }
                : {}),
            tagIds,
        };
        encryptedMeta = await encryptSecuredEnvelope(mergedSecured, store.publicKey);
        strippedMeta = stripSensitiveFileMetadata(metadata);
        body.secured_meta = encryptedMeta;
        body.metadata = strippedMeta;
    } else {
        body.metadata = { ...metadata, tagIds };
    }

    if (versioned) body.version = version;
    const tideWin = window as TideWindow;
    if (tideWin.__tideSaveTimestamp) tideWin.__tideSaveTimestamp();
    const res = await apiFetch(`/api/v1/files/${noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return { res, versioned, encryptedMeta, strippedMeta };
}

async function persist(
    noteId: string,
    tagIds: string[]
): Promise<{ version: number | undefined; encryptedMeta?: string; strippedMeta?: Record<string, unknown> }> {
    let attempt = await putMetadata(noteId, tagIds);
    if (attempt.res.status === 409 && attempt.versioned) {
        attempt = await putMetadata(noteId, tagIds);
    }
    if (!attempt.res.ok) throw new Error(`Failed to save note tags (${attempt.res.status})`);
    let version: number | undefined;
    if (attempt.versioned) {
        try {
            const data = (await attempt.res.json()) as { version?: unknown };
            version = typeof data?.version === 'number' ? data.version : undefined;
        } catch {
            version = undefined;
        }
    }
    return { version, encryptedMeta: attempt.encryptedMeta, strippedMeta: attempt.strippedMeta };
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
        const { version, encryptedMeta, strippedMeta } = await persist(noteId, tagIds);
        const patch: Record<string, unknown> = {};
        if (version !== undefined) patch.version = version;
        if (encryptedMeta !== undefined) patch.secured_meta = encryptedMeta;
        if (strippedMeta !== undefined) patch.metadata = strippedMeta;
        if (Object.keys(patch).length > 0) {
            useDataStore.getState().updateFileRaw(noteId, patch);
        }
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
