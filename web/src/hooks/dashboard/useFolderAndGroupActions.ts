'use client';

import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import * as cryptoLib from '@/lib/crypto';
import { apiFetch } from '@/lib/api';
import { useDataStore, type DataItem } from '@/store/useDataStore';

export interface FolderFileItem {
    id: string;
    title: string;
    type: string;
    parent_id?: string | null;
    safe?: string;
    metadata?: Record<string, unknown> & { safe?: string; title?: string; color?: string };
}

export interface EventGroupUpdates {
    title?: string;
    effect?: string;
    color?: string;
}

export interface UseFolderAndGroupActionsOptions {
    privateKey: CryptoKey | null;
    publicKey: CryptoKey | null;
    files: FolderFileItem[];
    setEditingFileId: Dispatch<SetStateAction<string | null>>;
    setHiddenThemeIds: Dispatch<SetStateAction<string[]>>;
}

export interface UseFolderAndGroupActionsResult {
    handleCreateFolder: (parentId?: string | null, color?: string) => Promise<void>;
    handleCreateEventGroup: (forcedTitle?: string, forcedColor?: string, forcedEffect?: string) => Promise<string | undefined>;
    handleUpdateEventGroup: (id: string, updates: EventGroupUpdates) => Promise<void>;
    handleMoveFileToFolder: (fileId: string, targetFolderId: string | null) => Promise<void>;
    handleUpdateFolderColor: (folderId: string, color: string) => Promise<void>;
    handleCreateFolderCentral: (name: string, color?: string, parentId?: string | null) => Promise<void>;
    handleMoveFile: (fileId: string, newParentId: string | null) => Promise<void>;
    handleToggleThemeVisibility: (themeId: string) => void;
}

interface TideWindow extends Window {
    __tideSaveTimestamp?: () => void;
}

interface StoreFolderItem extends DataItem {
    effect?: string;
    color?: string;
    version?: number;
    isGroup?: boolean;
    parent_id?: string | null;
    name?: string;
    metadata?: Record<string, unknown>;
}

interface CreateFolderRecordResult {
    id: string;
    secured_meta?: string;
    folderColor: string;
    targetSafe: string;
}

/** Resolves target safe, encrypts metadata, and creates a folder record via API. */
async function createEncryptedFolderRecord(
    title: string,
    parentId: string | null | undefined,
    color: string | undefined,
    publicKey: CryptoKey,
    files: FolderFileItem[]
): Promise<CreateFolderRecordResult> {
    const folderColor = color || '#3b82f6';
    const currentActiveSafes = useDataStore.getState().activeSafes;
    const parentFile = parentId ? files.find((f) => f.id === parentId) : null;
    const defaultSafe = currentActiveSafes?.[0] || 'main';
    const targetSafe = parentFile
        ? parentFile.safe || (parentFile.metadata as { safe?: string } | undefined)?.safe || defaultSafe
        : defaultSafe;

    const meta = { title, parent_id: parentId, color: folderColor, safe: targetSafe };
    const securedMeta = await cryptoLib.encryptMetadata(meta, publicKey);

    const res = await apiFetch('/api/v1/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            type: 'folder',
            parent_id: parentId,
            public_meta: {},
            metadata: { title, color: folderColor, safe: targetSafe },
            secured_meta: securedMeta,
            visibility: 'private',
        }),
    });

    if (!res.ok) throw new Error('Failed to create folder');
    const newFolder = (await res.json()) as { id: string; secured_meta?: string };
    return { id: newFolder.id, secured_meta: newFolder.secured_meta, folderColor, targetSafe };
}

function refreshDirectoryCache(parentId: string | null | undefined): void {
    const targetParent = parentId || null;
    const pKey = targetParent === null ? 'root' : targetParent;
    const store = useDataStore.getState();
    store.loadedDirectories.delete(pKey);
    void store.fetchDirectory(targetParent);
}

function applyOptimisticEventGroupUpdate(id: string, updates: EventGroupUpdates, newVersion?: number): void {
    const versionPatch = newVersion !== undefined ? { version: newVersion } : {};
    useDataStore.setState((s) => ({
        notes: s.notes.map((f) =>
            f.id === id ? { ...f, ...updates, title: updates.title ?? f.title, ...versionPatch } : f
        ),
        metadataCache: {
            ...s.metadataCache,
            [id]: {
                ...((s.metadataCache[id] as Record<string, unknown>) || {}),
                ...updates,
                ...versionPatch,
                isGroup: true,
            },
        },
    }));
}

async function readResponseVersion(res: Response, field: 'version' | 'current_version'): Promise<number | undefined> {
    try {
        const data = (await res.json()) as Record<string, unknown>;
        const val = data?.[field];
        return typeof val === 'number' ? val : undefined;
    } catch {
        return undefined;
    }
}

/** Provides folder, file-move, and event-group (theme) handlers for the dashboard. */
export function useFolderAndGroupActions({
    privateKey,
    publicKey,
    files,
    setEditingFileId,
    setHiddenThemeIds,
}: UseFolderAndGroupActionsOptions): UseFolderAndGroupActionsResult {
    const handleCreateFolder = useCallback(async (parentId: string | null = null, color: string = '#3b82f6') => {
        if (!privateKey || !publicKey) return;
        try {
            const created = await createEncryptedFolderRecord('New Folder', parentId, color, publicKey, files);
            if (parentId) {
                useDataStore.getState().toggleFolder(parentId, true);
            }
            refreshDirectoryCache(parentId);
            setEditingFileId(created.id);
        } catch (e) {
            console.error(e);
            alert('Failed to create folder');
        }
    }, [privateKey, publicKey, files, setEditingFileId]);

    const handleCreateEventGroup = useCallback(async (forcedTitle?: string, forcedColor?: string, forcedEffect?: string) => {
        const storeState = useDataStore.getState();
        const privKey = privateKey || storeState.privateKey;
        const pubKey = publicKey || storeState.publicKey;
        if (!privKey || !pubKey) return undefined;

        const title = forcedTitle || 'New Group';
        const effect = forcedEffect || 'none';
        const color = forcedColor || undefined;

        try {
            const meta = { title, isGroup: true, effect, color };
            const securedMeta = await cryptoLib.encryptMetadata(meta, pubKey);

            const res = await apiFetch('/api/v1/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'folder',
                    parent_id: null,
                    public_meta: { isGroup: true },
                    secured_meta: securedMeta,
                    metadata: { title, isGroup: true, effect, color },
                    version: 2,
                    visibility: 'private',
                }),
            });

            if (!res.ok) throw new Error('Failed to create event group');
            const newFolder = (await res.json()) as { id: string };

            const optimisticGroup: DataItem = {
                id: newFolder.id, title, type: 'folder', isGroup: true,
                effect, color, parent_id: null, secured_meta: securedMeta, visibility: 'private',
            };
            useDataStore.setState((s) => ({ notes: [...s.notes, optimisticGroup] }));
            return newFolder.id;
        } catch (e) {
            console.error(e);
            alert('Failed to create event group');
            return undefined;
        }
    }, [privateKey, publicKey]);

    const handleUpdateEventGroup = useCallback(async (id: string, updates: EventGroupUpdates) => {
        const storeState = useDataStore.getState();
        const privKey = privateKey || storeState.privateKey;
        const pubKey = publicKey || storeState.publicKey;
        if (!privKey || !pubKey) return;

        try {
            // Optimistic local update for both notes and metadataCache before reading merged values
            applyOptimisticEventGroupUpdate(id, updates);

            const group = useDataStore.getState().notes.find((f) => f.id === id) as StoreFolderItem | undefined;
            if (!group) return;

            const meta: Record<string, unknown> = {
                title: group.title ?? 'New Group',
                isGroup: true,
                effect: group.effect ?? 'none',
                color: group.color,
            };
            const encryptedMeta = await cryptoLib.encryptMetadata(meta, pubKey);

            // Stamp save timestamp BEFORE the API call so SSE cooldown suppresses immediate refetch
            const tideWin = window as TideWindow;
            if (tideWin.__tideSaveTimestamp) tideWin.__tideSaveTimestamp();

            const putPayload: Record<string, unknown> = {
                secured_meta: encryptedMeta,
                public_meta: { isGroup: true },
                metadata: { title: meta.title, isGroup: true, effect: meta.effect, color: meta.color },
            };
            if (typeof group.version === 'number') {
                putPayload.version = group.version;
            }

            // public_meta preserves isGroup in plaintext; metadata stores theme fallback if RSA fails
            const res = await apiFetch(`/api/v1/files/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(putPayload),
            });

            let newVersion: number | undefined;
            if (res.status === 409) {
                try {
                    const conflictVersion = await readResponseVersion(res, 'current_version');
                    if (conflictVersion !== undefined) {
                        newVersion = conflictVersion;
                        putPayload.version = conflictVersion;
                        const retryRes = await apiFetch(`/api/v1/files/${id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(putPayload),
                        });
                        if (retryRes.ok) {
                            newVersion = (await readResponseVersion(retryRes, 'version')) ?? newVersion;
                        }
                    }
                } catch (conflictErr) {
                    console.error('Conflict resolution failed for group', conflictErr);
                }
            } else if (res.ok) {
                newVersion = await readResponseVersion(res, 'version');
            }

            // Re-apply optimistic update after API success to survive any concurrent refetch
            applyOptimisticEventGroupUpdate(id, updates, newVersion);
        } catch (e) {
            console.error('Failed to update group', e);
        }
    }, [privateKey, publicKey]);

    const handleMoveFileToFolder = useCallback(async (fileId: string, targetFolderId: string | null) => {
        try {
            await apiFetch(`/api/v1/files/${fileId}`, {
                method: 'PATCH',
                body: JSON.stringify({ parent_id: targetFolderId }),
            });
            useDataStore.getState().updateFile(fileId, { parent_id: targetFolderId });
            const s = useDataStore.getState();
            s.loadedDirectories.clear();
            void s.fetchDirectory(targetFolderId);
        } catch (err) {
            console.error('Failed to move file', err);
        }
    }, []);

    const handleUpdateFolderColor = useCallback(async (folderId: string, color: string) => {
        try {
            useDataStore.getState().updateFile(folderId, { color });
            const allFiles = useDataStore.getState().notes as StoreFolderItem[];
            const existingFile = allFiles.find((f) => f.id === folderId);
            const currentMetadata =
                existingFile?.metadata && typeof existingFile.metadata === 'object' ? existingFile.metadata : {};
            const updatedMetadata = { ...currentMetadata, color };

            let securedMeta: string | undefined;
            if (publicKey && existingFile) {
                const existingTitle = existingFile.title || existingFile.name || 'Folder';
                const meta = { title: existingTitle, parent_id: existingFile.parent_id, color };
                try {
                    securedMeta = await cryptoLib.encryptMetadata(meta, publicKey);
                } catch (e) {
                    console.warn('Failed to encrypt metadata for folder color update', e);
                }
            }

            await apiFetch(`/api/v1/files/${folderId}`, {
                method: 'PATCH',
                body: JSON.stringify({ metadata: updatedMetadata, ...(securedMeta ? { secured_meta: securedMeta } : {}) }),
            });
            useDataStore.getState().updateSpecificMetadataCache(folderId, { color });
        } catch (err) {
            console.error('Failed to update folder color', err);
        }
    }, [publicKey]);

    const handleCreateFolderCentral = useCallback(async (name: string, color?: string, parentId?: string | null) => {
        if (!privateKey || !publicKey) return;
        try {
            const created = await createEncryptedFolderRecord(name, parentId, color, publicKey, files);
            const decFolder: DataItem = {
                id: created.id, title: name, type: 'folder', size: 0,
                updated_at: new Date().toISOString(), secured_meta: created.secured_meta,
                share_status: 'owner', visibility: 'private', parent_id: parentId,
                color: created.folderColor, safe: created.targetSafe,
                metadata: { title: name, color: created.folderColor, safe: created.targetSafe },
            };

            useDataStore.setState((s) => ({
                notes: [...s.notes, decFolder],
                metadataCache: {
                    ...s.metadataCache,
                    [created.id]: { title: name, color: created.folderColor, parent_id: parentId, safe: created.targetSafe },
                },
            }));

            refreshDirectoryCache(parentId);
        } catch (e) {
            console.error('Failed to create folder', e);
        }
    }, [privateKey, publicKey, files]);

    const handleMoveFile = useCallback(async (fileId: string, newParentId: string | null) => {
        try {
            const currentFiles = useDataStore.getState().notes as StoreFolderItem[];
            const targetFile = currentFiles.find((f) => f.id === fileId);
            const oldParentId = targetFile?.parent_id || null;

            await apiFetch(`/api/v1/files/${fileId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ parent_id: newParentId || '' }),
            });

            useDataStore.getState().setNotes(
                currentFiles.map((f) => (f.id === fileId ? { ...f, parent_id: newParentId } : f))
            );

            const oldKey = oldParentId === null ? 'root' : oldParentId;
            const newKey = newParentId === null ? 'root' : newParentId;
            const state = useDataStore.getState();

            const newLoaded = new Set(state.loadedDirectories);
            newLoaded.delete(oldKey);
            newLoaded.delete(newKey);
            useDataStore.setState({ loadedDirectories: newLoaded });

            void state.fetchDirectory(oldParentId);
            if (oldParentId !== newParentId) {
                void state.fetchDirectory(newParentId);
            }
        } catch (e) {
            console.error('Move failed', e);
            alert('Failed to move item');
        }
    }, []);

    const handleToggleThemeVisibility = useCallback((themeId: string) => {
        setHiddenThemeIds((prev) => (prev.includes(themeId) ? prev.filter((id) => id !== themeId) : [...prev, themeId]));
    }, [setHiddenThemeIds]);

    return {
        handleCreateFolder,
        handleCreateEventGroup,
        handleUpdateEventGroup,
        handleMoveFileToFolder,
        handleUpdateFolderColor,
        handleCreateFolderCentral,
        handleMoveFile,
        handleToggleThemeVisibility,
    };
}
