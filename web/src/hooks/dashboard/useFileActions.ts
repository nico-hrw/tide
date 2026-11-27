"use client";

import type React from "react";
import { notifyError, notifyUndo } from '@/lib/feedback';
import { apiFetch } from "@/lib/api";
import type { ItemSecuritySettings } from "@/lib/pinSecurity";
import type { Tab } from "@/components/Layout/TabList";
import { useDataStore, type DataItem } from "@/store/useDataStore";
import { getVariableRegistry } from "@/lib/variableRegistryInstance";
import {
    asRecord,
    buildEncryptedRenamePayload,
    downloadAndDecryptContent,
    fetchShareFallbackFile,
    hasV2AccessKeys,
    prepareVisibilityUpdate,
    resolveCurrentMetadata,
    shareV1WithContacts,
    updateVisibilityWithConflictRetry,
    type DeleteConfirmState,
    type DeleteErrorState,
    type EventActionItem,
    type FileActionItem,
    type FileSaveStatus,
    type NoteSecurityModalItem,
    type ShareModalFileState,
} from "./fileActionHelpers";

export type {
    DeleteConfirmState,
    DeleteErrorState,
    EventActionItem,
    FileActionItem,
    FileSaveStatus,
    NoteSecurityModalItem,
    ShareModalFileState,
};

export interface UseFileActionsOptions {
    files: FileActionItem[];
    events: EventActionItem[];
    activeTabId: string;
    myId: string;
    privateKey: CryptoKey | null;
    publicKey: CryptoKey | null;
    deleteConfirm: DeleteConfirmState | null;
    setDeleteConfirm: React.Dispatch<React.SetStateAction<DeleteConfirmState | null>>;
    setDeleteError: React.Dispatch<React.SetStateAction<DeleteErrorState | null>>;
    setEditingFileId: React.Dispatch<React.SetStateAction<string | null>>;
    setOpenTabs: React.Dispatch<React.SetStateAction<Tab[]>>;
    setFileName: React.Dispatch<React.SetStateAction<string>>;
    setSaveStatus: React.Dispatch<React.SetStateAction<FileSaveStatus>>;
    shareModalFile: ShareModalFileState | null;
    setShareModalFile: React.Dispatch<React.SetStateAction<ShareModalFileState | null>>;
    noteSecurityModalItem: NoteSecurityModalItem | null;
    handleTabClose: (e: React.MouseEvent | null, id: string) => void;
    fetchDirectory?: (parentId: string | null, forceRefresh?: boolean) => Promise<void>;
}

export function useFileActions({
    files,
    events,
    activeTabId,
    myId,
    privateKey,
    publicKey,
    deleteConfirm,
    setDeleteConfirm,
    setDeleteError,
    setEditingFileId,
    setOpenTabs,
    setFileName,
    setSaveStatus,
    shareModalFile,
    setShareModalFile,
    noteSecurityModalItem,
    handleTabClose,
    fetchDirectory,
}: UseFileActionsOptions) {
    const handleDeleteNote = async (e: React.MouseEvent, fileId: string) => {
        e.stopPropagation();
        const freshNotes = useDataStore.getState().notes;
        const target = freshNotes.find((f) => f.id === fileId);
        const isShared = Boolean(target && target.share_status && target.share_status !== "owner");
        const isFolder = target?.type === "folder";

        // Own notes go at once with an undo toast (like events); shared notes and folders still ask first.
        if (!isShared && !isFolder) {
            await runDeleteNote(fileId, false);
            return;
        }
        setDeleteConfirm({ isOpen: true, fileId, isShared, isFolder });
    };

    const executeDeleteNote = async () => {
        if (!deleteConfirm) return;
        const { fileId, isShared } = deleteConfirm;
        setDeleteConfirm(null);
        await runDeleteNote(fileId, isShared);
    };

    /** Deletes a note on the server and removes it from the list. Own notes can be taken back from the trash for a few seconds. */
    const runDeleteNote = async (fileId: string, isShared: boolean) => {
        const freshNotes = useDataStore.getState().notes;
        const target = freshNotes.find((f) => f.id === fileId);

        try {
            const res = await apiFetch(`/api/v1/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
            if (!res.ok && res.status !== 404) throw new Error("Backend failed to delete note");

            useDataStore.getState().setNotes(freshNotes.filter((f) => f.id !== fileId));
            void getVariableRegistry().removeNote(fileId);
            handleTabClose(null, fileId);
            if (target && !isShared) {
                notifyUndo("Notiz gelöscht", async () => {
                    const back = await apiFetch(`/api/v1/files/${encodeURIComponent(fileId)}/restore`, { method: "POST" });
                    if (!back.ok) { notifyError("Wiederherstellen fehlgeschlagen"); return; }
                    useDataStore.getState().setNotes([...useDataStore.getState().notes, target]);
                });
            }
        } catch (err) {
            console.error("Delete failed:", err);
            const isCorrupt = Boolean(
                !target ||
                    target.isLocked ||
                    (target.title &&
                        (target.title.includes("Corrupted") ||
                            target.title.includes("Locked") ||
                            target.title.includes("Decrypting")))
            );
            if (isCorrupt) {
                setDeleteError({
                    fileId,
                    title: "Fehler beim Löschen",
                    message:
                        "Das Löschen auf dem Server ist fehlgeschlagen. Möchtest du diese fehlerhafte Notiz trotzdem erzwingend aus deiner Liste entfernen?",
                    isCorrupt: true,
                });
                return;
            }
            setDeleteError({
                fileId,
                title: "Fehler",
                message: isShared
                    ? "Die Notiz konnte nicht verlassen werden."
                    : "Die Notiz konnte nicht gelöscht werden.",
                isCorrupt: false,
            });
            setDeleteConfirm(null);
        }
    };

    const handleRenameNote = (e: React.MouseEvent, fileId: string, _currentTitle: string) => {
        e.stopPropagation();
        setEditingFileId(fileId);
    };

    const submitRename = async (fileId: string, newTitle: string, force = false) => {
        setEditingFileId(null);

        const store = useDataStore.getState();
        const storeNotes = store.notes;
        const storeEvents = store.events;
        const target = storeNotes.find((f) => f.id === fileId) || storeEvents.find((e) => e.id === fileId);
        if (!target) return;

        const cachedMeta = asRecord(store.metadataCache[fileId]);
        const targetMeta = asRecord(target.metadata);
        const targetPublicMeta = asRecord(target.public_meta);
        const lastSavedTitle = targetMeta.title ?? targetPublicMeta.title ?? cachedMeta.title;
        if (!force && target.title === newTitle && (lastSavedTitle === undefined || lastSavedTitle === newTitle)) {
            return;
        }

        store.setUpdatingMetadata(fileId, true);
        store.updateSpecificMetadataCache(fileId, { title: newTitle });
        store.setNotes(
            storeNotes.map((f) =>
                f.id === fileId ? { ...f, title: newTitle, metadata: { ...asRecord(f.metadata), title: newTitle } } : f
            )
        );
        store.setEvents(storeEvents.map((e) => (e.id === fileId ? { ...e, title: newTitle } : e)));
        setOpenTabs((prev) => prev.map((t) => (t.id === fileId ? { ...t, title: newTitle } : t)));
        if (activeTabId === fileId) {
            setFileName(newTitle);
            setSaveStatus("saving");
        }

        try {
            const isPublic = "visibility" in target && target.visibility === "public";

            if (isPublic) {
                await apiFetch(`/api/v1/files/${encodeURIComponent(fileId)}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ public_meta: { title: newTitle } }),
                });
            } else {
                if (!publicKey || !privateKey) {
                    useDataStore.getState().setUpdatingMetadata(fileId, false);
                    if (activeTabId === fileId) setSaveStatus("unsaved");
                    return;
                }

                const payload = await buildEncryptedRenamePayload(target, fileId, newTitle, publicKey, privateKey);
                const res = await apiFetch(`/api/v1/files/${encodeURIComponent(fileId)}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) {
                    const errText = await res.text();
                    throw new Error(`Failed to update title: ${res.status} ${errText}`);
                }
            }

            if (activeTabId === fileId) setSaveStatus("saved");
        } catch (err) {
            console.error("Rename failed", err);
            if (activeTabId === fileId) setSaveStatus("unsaved");
        } finally {
            const latestStore = useDataStore.getState();
            latestStore.setUpdatingMetadata(fileId, false);
            latestStore.loadedDirectories.clear();
            latestStore.fetchDirectory(null);
        }
    };

    const handleToggleVisibility = async (e: React.MouseEvent, fileId: string, newVisibility: string) => {
        if (e) e.stopPropagation();
        if (!privateKey || !publicKey) {
            notifyError("Keys not available");
            return;
        }

        const file = files.find((f) => f.id === fileId);
        if (!file) return;
        const prevVisibility = file.visibility || "private";
        const isFolder = file.type === "folder";

        useDataStore
            .getState()
            .setNotes(
                useDataStore.getState().notes.map((f) => (f.id === fileId ? { ...f, visibility: newVisibility } : f))
            );

        try {
            const currentMeta = await resolveCurrentMetadata(file, prevVisibility, privateKey);
            const contentBlob = isFolder
                ? null
                : await downloadAndDecryptContent(file, fileId, prevVisibility, myId, privateKey, currentMeta);

            const { uploadBlob, updatePayload, nextMeta } = await prepareVisibilityUpdate(
                file,
                newVisibility,
                contentBlob,
                currentMeta,
                myId,
                publicKey
            );

            if (uploadBlob) {
                await apiFetch(`/api/v1/files/${encodeURIComponent(fileId)}/upload`, { method: "POST", body: uploadBlob });
            }

            await updateVisibilityWithConflictRetry(fileId, updatePayload);

            if (newVisibility === "contacts") {
                const isV2 = (typeof file.version === "number" && file.version >= 2) || hasV2AccessKeys(file.access_keys);
                if (!isV2) {
                    await shareV1WithContacts(fileId, nextMeta);
                }
            }

            (fetchDirectory ?? useDataStore.getState().fetchDirectory)(null);
        } catch (err) {
            console.error("Visibility toggle failed:", err);
            notifyError("Failed to change visibility");
            useDataStore
                .getState()
                .setNotes(
                    useDataStore.getState().notes.map((f) => (f.id === fileId ? { ...f, visibility: prevVisibility } : f))
                );
        }
    };

    const handleShare = async (e: React.MouseEvent, fileId: string) => {
        e.stopPropagation();
        const baseId = fileId.includes("_") ? fileId.split("_")[0] : fileId;
        const liveStore = useDataStore.getState();

        let file: DataItem | FileActionItem | undefined =
            liveStore.notes.find((f) => f.id === baseId) || liveStore.events.find((ev) => ev.id === baseId);

        if (!file) {
            file = await fetchShareFallbackFile(baseId);
        }

        if (!file) {
            console.error("File/Event not found for sharing:", fileId, "(base:", baseId, ")");
            notifyError("Termin konnte nicht zum Teilen gefunden werden.");
            return;
        }

        const currentMyId = myId || liveStore.myId;
        const isOwner = !file.owner_id || file.owner_id === currentMyId || file.share_status === "owner";
        const canReshare = Boolean(file.can_reshare);

        if (!isOwner && !canReshare) {
            notifyError("Du hast keine Berechtigung, diese Notiz weiterzuleiten.");
            return;
        }

        let callerPermission: "owner" | "view" | "edit" | "share" = "owner";
        if (!isOwner) {
            const rawPerm = file.share_permission || file.permission;
            callerPermission = rawPerm === "edit" || rawPerm === "share" || rawPerm === "view" ? rawPerm : "view";
        }

        setShareModalFile({ id: baseId, title: file.title, type: file.type, callerPermission });
    };

    const performShare = async (
        recipientId: string,
        recipientEmail: string,
        recipientPubKeySpki: string,
        permission: "view" | "edit" | "share" = "view",
        dependencyFileIds: string[] = [],
        canReshare: boolean = false
    ) => {
        if (!shareModalFile || !privateKey || !publicKey) return;

        const shareLib = await import("@/lib/shareLogic");

        if (shareModalFile.type === "folder") {
            await shareLib.performFolderShare(
                shareModalFile.id,
                shareModalFile.title,
                myId,
                privateKey,
                publicKey,
                recipientId,
                recipientEmail,
                recipientPubKeySpki,
                permission
            );
        } else {
            await shareLib.performMessengerShare(
                shareModalFile,
                myId,
                privateKey,
                publicKey,
                events,
                recipientId,
                recipientEmail,
                recipientPubKeySpki,
                permission,
                dependencyFileIds,
                canReshare
            );
        }

        useDataStore.getState().fetchDirectory(null);
    };

    const handleSaveNoteSecuritySettings = async (settings: ItemSecuritySettings | null) => {
        if (!noteSecurityModalItem) return;
        const itemId = noteSecurityModalItem.id;
        const target = files.find((f) => f.id === itemId);
        const currentMeta = asRecord(target?.metadata);
        const updatedMeta: Record<string, unknown> = settings
            ? {
                  ...currentMeta,
                  has_custom_password: true,
                  pwd_salt: settings.pwd_salt,
                  pin_hash: settings.pin_hash,
                  security_settings: settings,
              }
            : {
                  ...currentMeta,
                  has_custom_password: false,
                  pwd_salt: undefined,
                  pin_hash: undefined,
                  security_settings: null,
              };

        const res = await apiFetch(`/api/v1/files/${encodeURIComponent(itemId)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ metadata: updatedMeta }),
        });
        if (!res.ok) {
            throw new Error("Fehler beim Speichern der Sicherheitseinstellungen.");
        }
        useDataStore.getState().updateFileRaw(itemId, { metadata: updatedMeta });
    };

    return {
        handleDeleteNote,
        executeDeleteNote,
        handleRenameNote,
        submitRename,
        handleToggleVisibility,
        handleShare,
        performShare,
        handleSaveNoteSecuritySettings,
    };
}
