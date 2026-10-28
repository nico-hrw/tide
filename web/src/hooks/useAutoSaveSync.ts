"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useDataStore } from "@/store/useDataStore";
import { Tab } from "@/components/Layout/TabList";
import { apiFetch } from "@/lib/api";
import * as cryptoLib from "@/lib/crypto";
import { idb } from "@/lib/idb";
import { addToSyncQueue } from "@/lib/syncQueue";
import {
    isDocEmpty,
    countWordsInTipTapJson,
    recordNoteStats,
    encryptContentV2,
    runClientBackupCascade,
    restoreFromBackupHistory,
    decryptNotePayload,
    resolveSaveDEK,
    uploadPublicFile,
} from "./autoSaveHelpers";

export interface UseAutoSaveSyncOptions {
    activeNoteId?: string | null;
    activeFileKey?: CryptoKey | null;
    setActiveFileKey?: (key: CryptoKey | null) => void;
    editorContent?: any;
    setEditorContent?: React.Dispatch<React.SetStateAction<any>>;
    canvasNoteData?: any;
    setCanvasNoteData?: React.Dispatch<React.SetStateAction<any>>;
    saveStatus?: "saved" | "unsaved" | "saving";
    setSaveStatus?: React.Dispatch<React.SetStateAction<"saved" | "unsaved" | "saving">>;
    fileName?: string;
    setFileName?: React.Dispatch<React.SetStateAction<string>>;
    isLoadingContent?: boolean;
    setIsLoadingContent?: React.Dispatch<React.SetStateAction<boolean>>;
    setEditorVersion?: React.Dispatch<React.SetStateAction<number>>;
    openTabs?: Tab[];
    setOpenTabs?: React.Dispatch<React.SetStateAction<Tab[]>>;
    switchTab?: (newId: string, type: string, forcedTitle?: string, fallbackData?: any, currentOverride?: any) => Promise<void> | void;
    privateKey?: CryptoKey | null;
    publicKey?: CryptoKey | null;
    myId?: string;
    files?: any[];
    events?: any[];
}

export function useAutoSaveSync(options: UseAutoSaveSyncOptions = {}) {
    const [intKey, setIntKey] = useState<CryptoKey | null>(null);
    const [intEd, setIntEd] = useState<any>(null), [intCnv, setIntCnv] = useState<any>(null);
    const [intStat, setIntStat] = useState<"saved" | "unsaved" | "saving">("saved");
    const [intName, setIntName] = useState<string>(""), [intLoad, setIntLoad] = useState<boolean>(false);
    const [isOfflinePending, setIsOfflinePending] = useState<boolean>(false);

    const activeNoteId = options.activeNoteId ?? null;
    const activeFileKey = options.activeFileKey !== undefined ? options.activeFileKey : intKey;
    const setActiveFileKey = options.setActiveFileKey ?? setIntKey;
    const editorContent = options.editorContent !== undefined ? options.editorContent : intEd;
    const setEditorContent = options.setEditorContent ?? setIntEd;
    const canvasNoteData = options.canvasNoteData !== undefined ? options.canvasNoteData : intCnv;
    const setCanvasNoteData = options.setCanvasNoteData ?? setIntCnv;
    const saveStatus = options.saveStatus !== undefined ? options.saveStatus : intStat;
    const setSaveStatus = options.setSaveStatus ?? setIntStat;
    const fileName = options.fileName !== undefined ? options.fileName : intName;
    const setFileName = options.setFileName ?? setIntName;
    const isLoadingContent = options.isLoadingContent !== undefined ? options.isLoadingContent : intLoad;
    const setIsLoadingContent = options.setIsLoadingContent ?? setIntLoad;

    const userHasTypedRef = useRef(false), lastNoteWordCountsRef = useRef<Record<string, number>>({});
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const activeNoteIdRef = useRef<string | null>(activeNoteId), activeFileKeyRef = useRef<CryptoKey | null>(activeFileKey);
    const editorContentRef = useRef<any>(editorContent), canvasNoteDataRef = useRef<any>(canvasNoteData);
    const saveStatusRef = useRef<string>(saveStatus), fileNameRef = useRef<string>(fileName);
    const isSavingRef = useRef<Set<string>>(new Set()), initialContentRef = useRef<any>(null);
    const unsavedNotesRef = useRef<Set<string>>(new Set()), pendingRetriesRef = useRef<Set<string>>(new Set());
    const lastLoadIdRef = useRef<string | null>(null), prevNoteIdRef = useRef<string | null>(null);
    const performSaveRef = useRef<((content: any, fileId: string, fileKey: CryptoKey | null, visibility: string) => Promise<any>) | null>(null);

    useEffect(() => {
        const handleSynced = () => setIsOfflinePending(false);
        const handleOnline = () => setIsOfflinePending(false);
        if (typeof window !== 'undefined') {
            window.addEventListener('tide-synced', handleSynced);
            window.addEventListener('tide-online', handleOnline);
            return () => {
                window.removeEventListener('tide-synced', handleSynced);
                window.removeEventListener('tide-online', handleOnline);
            };
        }
    }, []);

    useEffect(() => {
        activeNoteIdRef.current = activeNoteId;
        activeFileKeyRef.current = activeFileKey;
        editorContentRef.current = editorContent;
        canvasNoteDataRef.current = canvasNoteData;
        saveStatusRef.current = saveStatus;
        fileNameRef.current = fileName;
    }, [activeNoteId, activeFileKey, editorContent, canvasNoteData, saveStatus, fileName]);

    const handleFileNotFound = useCallback((fileId: string) => {
        apiFetch('/api/v1/files/' + fileId, { method: 'DELETE' }).catch(() => {});
        useDataStore.getState().setNotes(useDataStore.getState().notes.filter((n: any) => n.id !== fileId));
        options.setOpenTabs?.(prev => prev.filter(t => t.id !== fileId));
        const fallback = options.openTabs?.find(t => t.id !== fileId);
        if (fallback && options.switchTab) options.switchTab(fallback.id, fallback.type, fallback.title);
    }, [options.openTabs, options.setOpenTabs, options.switchTab]);

    const handleEditorChange = useCallback((json: any, yjsUpdateBase64?: string) => {
        userHasTypedRef.current = true;
        const fullContent = yjsUpdateBase64 ? { ...json, __yjs: yjsUpdateBase64 } : json;
        setEditorContent(fullContent);
        setSaveStatus("unsaved");

        const id = activeNoteIdRef.current;
        if (id) {
            unsavedNotesRef.current.add(id);
            recordNoteStats(id, json, lastNoteWordCountsRef.current);
        }
        if (options.setEditorVersion) options.setEditorVersion(v => v + 1);
    }, [setEditorContent, setSaveStatus, options.setEditorVersion]);

    const triggerSave = useCallback(async (noteId: string, fileKey: CryptoKey | null, content: any) => {
        if (!noteId || !content || noteId === 'calendar' || noteId === 'messages' || noteId.startsWith('chat-')) return;

        if (isSavingRef.current.has(noteId)) {
            if (!pendingRetriesRef.current.has(noteId)) {
                pendingRetriesRef.current.add(noteId);
                const retryContent = editorContentRef.current;
                const retryKey = activeFileKeyRef.current;
                const waitAndRetry = async () => {
                    while (isSavingRef.current.has(noteId)) await new Promise(r => setTimeout(r, 200));
                    pendingRetriesRef.current.delete(noteId);
                    if (unsavedNotesRef.current.has(noteId)) {
                        // Prevent runaway zero-delay retry loops
                        await new Promise(r => setTimeout(r, 1000));
                        if (unsavedNotesRef.current.has(noteId) && !isSavingRef.current.has(noteId)) {
                            triggerSave(noteId, retryKey, editorContentRef.current || retryContent);
                        }
                    }
                };
                waitAndRetry();
            }
            return;
        }

        const allNotes = useDataStore.getState().notes;
        const allEvs = useDataStore.getState().events;
        const curFile = allNotes.find((f: any) => f.id === noteId) || allEvs.find((e: any) => e.id === noteId);
        if (!curFile) return;

        if (!content || (isDocEmpty(content) && !isDocEmpty(initialContentRef.current) && !userHasTypedRef.current)) return;

        const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
        if (contentStr === 'decrypting' || contentStr.includes('DECRYPTION ERROR') || contentStr.includes('V2 DECRYPTION ERROR')) return;

        const initialStr = typeof initialContentRef.current === 'string'
            ? initialContentRef.current : JSON.stringify(initialContentRef.current);
        if (contentStr === initialStr) {
            unsavedNotesRef.current.delete(noteId);
            if (noteId === activeNoteIdRef.current) setSaveStatus('saved');
            return;
        }

        if (!performSaveRef.current) return;

        isSavingRef.current.add(noteId);
        if (noteId === activeNoteIdRef.current) setSaveStatus('saving');

        try {
            await performSaveRef.current(content, noteId, fileKey, (curFile as any).visibility ?? 'private');

            const curStr = typeof editorContentRef.current === 'string'
                ? editorContentRef.current : JSON.stringify(editorContentRef.current);
            const savedStr = typeof content === 'string' ? content : JSON.stringify(content);

            if (curStr === savedStr) {
                initialContentRef.current = content;
                unsavedNotesRef.current.delete(noteId);
                if (noteId === activeNoteIdRef.current) setSaveStatus('saved');
                options.setOpenTabs?.(prev => prev.map(tab =>
                    tab.id === noteId ? { ...tab, _saveStatus: 'saved', content, _fileKey: fileKey } : tab
                ));
            } else {
                unsavedNotesRef.current.add(noteId);
                if (noteId === activeNoteIdRef.current) {
                    if (saveStatusRef.current !== 'unsaved') setSaveStatus('unsaved');
                } else {
                    options.setOpenTabs?.(prev => prev.map(tab => tab.id === noteId ? { ...tab, _saveStatus: 'unsaved' } : tab));
                }
            }
        } catch (e: any) {
            const isForbidden = String(e?.message || '').includes('403');
            const isOfflineOr5xx = /5\d{2}|fetch|network|offline|failed to fetch/i.test(String(e?.message || ''));

            if (isOfflineOr5xx) {
                try {
                    await addToSyncQueue({
                        url: `/api/v1/files/${noteId}`,
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        fileId: noteId,
                        description: `PUT /api/v1/files/${noteId}`
                    });
                } catch (_) {}

                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent("tide-offline", { detail: "Cloud nicht erreichbar – lokal gesichert" }));
                    window.dispatchEvent(new CustomEvent("tide-warning", { detail: "Cloud nicht erreichbar – lokal gesichert" }));
                }

                setIsOfflinePending(true);

                // Keep status marked as locally saved instead of treating data as lost
                initialContentRef.current = content;
                unsavedNotesRef.current.delete(noteId);
                if (noteId === activeNoteIdRef.current) setSaveStatus('saved');
                options.setOpenTabs?.(prev => prev.map(tab =>
                    tab.id === noteId ? { ...tab, _saveStatus: 'saved', content, _fileKey: fileKey } : tab
                ));
            } else {
                const targetStatus = isForbidden ? 'saved' : 'unsaved';
                if (isForbidden) unsavedNotesRef.current.delete(noteId);
                else unsavedNotesRef.current.add(noteId);

                if (noteId === activeNoteIdRef.current) setSaveStatus(targetStatus);
                options.setOpenTabs?.(prev => prev.map(tab => tab.id === noteId ? { ...tab, _saveStatus: targetStatus } : tab));
            }
        } finally {
            isSavingRef.current.delete(noteId);
        }
    }, [setSaveStatus, options.setOpenTabs]);

    const performSave = useCallback(async (content: any, fileId: string, fileKey: CryptoKey | null, visibility: string) => {
        if (!fileId || !content) return;
        if (isDocEmpty(content) && initialContentRef.current && !isDocEmpty(initialContentRef.current)) return;

        try {
            const contentString = typeof content === 'string' ? content : JSON.stringify(content);

            if (visibility === 'public') {
                try {
                    await idb.set(`api_cache_/api/v1/files/${fileId}/download`, contentString);
                } catch (_) {}
                await uploadPublicFile(fileId, contentString, fileNameRef.current, () => handleFileNotFound(fileId));
                return;
            }

            const freshState = useDataStore.getState();
            const freshPrivKey = options.privateKey || freshState.privateKey;
            const freshPubKey = options.publicKey || freshState.publicKey;
            const freshMyId = options.myId || freshState.myId;
            if (!freshPubKey || !freshPrivKey || !freshMyId) throw new Error('[V2-Save] RSA master keys not available');

            const allFiles = [...freshState.notes, ...freshState.events] as any[];
            const currentFile = allFiles.find(f => f.id === fileId);
            const currentVersion = typeof currentFile?.version === 'number' ? currentFile.version : 1;

            const { dek, accessKeysMap, generatedNewDek } = await resolveSaveDEK(
                currentFile, freshMyId, freshPrivKey, freshPubKey
            );

            const contentCiphertext = await encryptContentV2(contentString, dek);
            const fileRecord = allFiles.find(f => f.id === fileId);
            let title = fileRecord?.title || fileNameRef.current || 'Untitled';
            if (title.includes('(Corrupted)')) title = title.replace(' (Corrupted)', '').replace('(Corrupted)', '').trim() || 'Untitled';

            const isOwner = currentFile?.owner_id === freshMyId;
            let freshSecuredMeta: string | undefined;
            if (isOwner) {
                try {
                    freshSecuredMeta = await cryptoLib.encryptMetadata({ title }, freshPubKey);
                } catch (_) {}
            }

            if (typeof (window as any).__tideSaveTimestamp === 'function') (window as any).__tideSaveTimestamp();

            const createPutPayload = (v: number) => JSON.stringify({
                version: v,
                content_ciphertext: contentCiphertext,
                ...(isOwner && generatedNewDek ? { access_keys: accessKeysMap } : {}),
                metadata: { has_custom_password: false, title },
                ...(freshSecuredMeta ? { secured_meta: freshSecuredMeta } : {}),
            });

            // Enforce offline-first: persist encrypted content to local IndexedDB BEFORE sending cloud HTTP PUT
            try {
                await idb.set(`api_cache_/api/v1/files/${fileId}/download`, contentCiphertext);
                await idb.set(`file_ciphertext_${fileId}`, contentCiphertext);
            } catch (idbErr) {
                console.error('[V2-Save] Failed to persist encrypted content to IndexedDB:', idbErr);
            }

            let activeVersion = currentVersion;
            const putPayload = createPutPayload(activeVersion);

            let putRes: Response | null = null;
            let isOfflineOr5xx = false;

            try {
                putRes = await apiFetch(`/api/v1/files/${fileId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: putPayload
                });
            } catch (fetchErr: any) {
                console.warn(`[V2-Save] apiFetch threw error for ${fileId}:`, fetchErr);
                isOfflineOr5xx = true;
            }

            if (putRes) {
                if (putRes.status === 404) {
                    handleFileNotFound(fileId);
                    return;
                }
                if (putRes.status === 409) {
                    const errData = await putRes.json().catch(() => null);
                    const serverVersion = errData?.current_version;
                    if (typeof serverVersion === 'number') {
                        useDataStore.getState().updateFileRaw(fileId, { version: serverVersion });
                        activeVersion = serverVersion;
                        try {
                            putRes = await apiFetch(`/api/v1/files/${fileId}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: createPutPayload(activeVersion)
                            });
                        } catch (retryErr: any) {
                            console.warn(`[V2-Save] retry apiFetch threw error for ${fileId}:`, retryErr);
                            isOfflineOr5xx = true;
                        }
                    }
                    if (putRes && !putRes.ok && putRes.status < 500) {
                        throw new Error('[V2-Save] PUT conflict (409) - updated to latest version');
                    }
                }
                if (putRes.status >= 500) {
                    isOfflineOr5xx = true;
                }
            }

            if (isOfflineOr5xx) {
                // Ensure mutation is added to the offline sync queue
                try {
                    await addToSyncQueue({
                        url: `/api/v1/files/${fileId}`,
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: createPutPayload(activeVersion),
                        fileId,
                        description: `PUT /api/v1/files/${fileId}`
                    });
                } catch (queueErr) {
                    console.error('[V2-Save] Failed to enqueue offline mutation:', queueErr);
                }

                // Display/dispatch warning instead of resetting or treating data as lost
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent("tide-offline", { detail: "Cloud nicht erreichbar – lokal gesichert" }));
                    window.dispatchEvent(new CustomEvent("tide-warning", { detail: "Cloud nicht erreichbar – lokal gesichert" }));
                }

                setIsOfflinePending(true);

                // Update local store with locally saved version & access keys
                useDataStore.getState().updateFileRaw(fileId, {
                    title, version: activeVersion, access_keys: accessKeysMap, metadata: { has_custom_password: false, title }
                });

                runClientBackupCascade({
                    fileId, contentString, dek, accessKeysMap, currentFile, myId: freshMyId, privateKey: freshPrivKey
                });

                try { localStorage.removeItem(`tide_backup_${fileId}`); } catch (_) {}

                return { offline: true };
            }

            if (!putRes || !putRes.ok) throw new Error(`[V2-Save] PUT failed with status ${putRes?.status}`);

            const updatedFile = await putRes.json().catch(() => null);
            const isSyntheticOffline = Boolean(updatedFile?.offline || updatedFile?._offlineQueued);
            if (isSyntheticOffline) {
                setIsOfflinePending(true);
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent("tide-offline", { detail: "Cloud nicht erreichbar – lokal gesichert" }));
                    window.dispatchEvent(new CustomEvent("tide-warning", { detail: "Cloud nicht erreichbar – lokal gesichert" }));
                }
            } else {
                setIsOfflinePending(false);
            }

            const newVersion = updatedFile?.version ?? (activeVersion + 1);

            useDataStore.getState().updateFileRaw(fileId, {
                title, version: newVersion, access_keys: accessKeysMap, metadata: { has_custom_password: false, title }
            });

            runClientBackupCascade({
                fileId, contentString, dek, accessKeysMap, currentFile, myId: freshMyId, privateKey: freshPrivKey
            });

            try { localStorage.removeItem(`tide_backup_${fileId}`); } catch (_) {}
            return { offline: isSyntheticOffline };
        } catch (err) {
            console.error(`[V2-Save FAILED] ID: ${fileId}:`, err);
            throw err;
        }
    }, [options.privateKey, options.publicKey, options.myId, handleFileNotFound]);

    performSaveRef.current = performSave;

    useEffect(() => {
        const content = editorContent ?? canvasNoteData;
        if (saveStatus !== 'unsaved' || !content) return;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

        saveTimerRef.current = setTimeout(() => {
            const currentContent = editorContentRef.current ?? canvasNoteDataRef.current;
            const noteId = activeNoteIdRef.current;
            const fileKey = activeFileKeyRef.current;
            if (saveStatusRef.current !== 'unsaved') return;

            if (noteId) {
                const live = [...useDataStore.getState().notes, ...useDataStore.getState().events].find((f: any) => f.id === noteId) as any;
                const perm = live?.permission;
                if (perm === 'view' || (live?.share_status === 'shared' && perm && perm !== 'edit' && perm !== 'share')) {
                    setSaveStatus('saved');
                    return;
                }
            }
            triggerSave(noteId!, fileKey, currentContent);
        }, 1000);

        return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    }, [editorContent, canvasNoteData, saveStatus, triggerSave, setSaveStatus]);

    useEffect(() => {
        const prev = prevNoteIdRef.current;
        prevNoteIdRef.current = activeNoteId ?? null;
        if (!prev || prev === activeNoteId || saveStatusRef.current !== 'unsaved') return;

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        triggerSave(prev, activeFileKeyRef.current, editorContentRef.current ?? canvasNoteDataRef.current);
    }, [activeNoteId, triggerSave]);

    useEffect(() => {
        const flushUnsaved = () => {
            if (saveStatusRef.current === 'unsaved' && activeNoteIdRef.current) {
                triggerSave(activeNoteIdRef.current, activeFileKeyRef.current, editorContentRef.current ?? canvasNoteDataRef.current);
            }
        };
        const onVisChange = () => { if (document.visibilityState === 'hidden') flushUnsaved(); };
        window.addEventListener('visibilitychange', onVisChange);
        window.addEventListener('beforeunload', flushUnsaved);
        return () => {
            window.removeEventListener('visibilitychange', onVisChange);
            window.removeEventListener('beforeunload', flushUnsaved);
        };
    }, [triggerSave]);

    const loadNoteContent = useCallback(async (fileId: string, titleFn: string, passedFile?: any) => {
        const effPrivKey = options.privateKey || useDataStore.getState().privateKey;
        if (!effPrivKey) {
            setTimeout(() => {
                if (useDataStore.getState().privateKey) loadNoteContent(fileId, titleFn, passedFile);
            }, 300);
            return;
        }

        const effMyId = options.myId || useDataStore.getState().myId
            || (typeof window !== 'undefined' ? (localStorage.getItem("tide_user_id") || sessionStorage.getItem("tide_user_id") || "") : "");
        const loadId = crypto.randomUUID();
        lastLoadIdRef.current = loadId;
        setIsLoadingContent(true);
        setEditorContent(null);

        if (titleFn && !titleFn.includes('Locked')) setFileName(titleFn);
        setSaveStatus("saved");

        try {
            let recoveredBackup: any = null;
            try {
                const backupStr = localStorage.getItem(`tide_backup_${fileId}`);
                if (backupStr) {
                    const parsed = JSON.parse(backupStr);
                    if (!isDocEmpty(parsed)) {
                        recoveredBackup = parsed;
                        setEditorContent(recoveredBackup);
                        setSaveStatus("unsaved");
                    } else {
                        try { localStorage.removeItem(`tide_backup_${fileId}`); } catch (_) {}
                    }
                }
            } catch (_) {}

            const storeNotes = useDataStore.getState().notes;
            const storeEvs = useDataStore.getState().events;
            let target = passedFile
                || storeNotes.find((f: any) => f.id === fileId)
                || storeEvs.find((e: any) => e.id === fileId)
                || options.files?.find(f => f.id === fileId)
                || options.events?.find(e => e.id === fileId) as any;

            if (!target) {
                const res = await apiFetch(`/api/v1/files/${fileId}`);
                if (res.status === 404) {
                    handleFileNotFound(fileId);
                    throw new Error(`[loadNoteContent] File ${fileId} not found on server (404)`);
                }
                if (res.ok) target = await res.json().catch(() => null);
            }
            if (!target) throw new Error("File not found");

            const { contentText, fileKeyToUse, title } = await decryptNotePayload({
                target, fileId, effectivePrivKey: effPrivKey, effectiveMyId: effMyId, onNotFound: () => handleFileNotFound(fileId)
            });

            if (fileKeyToUse) setActiveFileKey(fileKeyToUse);

            if (title) {
                if (!title.includes('Locked Note')) {
                    setFileName(title);
                    useDataStore.getState().updateFileRaw(fileId, { title, isLocked: false });
                } else {
                    useDataStore.getState().updateFileRaw(fileId, { isLocked: false });
                }
            }

            if (lastLoadIdRef.current !== loadId) return;

            let parsedContent: any = null;
            let isContentEmpty = true;
            if (contentText) {
                try {
                    parsedContent = JSON.parse(contentText);
                    isContentEmpty = isDocEmpty(parsedContent);
                } catch {
                    parsedContent = contentText;
                    isContentEmpty = typeof contentText === 'string' ? contentText.trim().length === 0 : true;
                }
            }

            if ((parsedContent === null || parsedContent === undefined) && !recoveredBackup) {
                const restored = await restoreFromBackupHistory(fileId, effPrivKey, effMyId);
                if (restored && !isDocEmpty(restored)) {
                    parsedContent = restored;
                    isContentEmpty = false;
                    const cur = [...useDataStore.getState().notes, ...useDataStore.getState().events].find(f => f.id === fileId);
                    if (cur && fileKeyToUse) {
                        performSave(restored, fileId, fileKeyToUse, cur.visibility || 'private').catch(() => {});
                    }
                }
            }

            if (!isContentEmpty && parsedContent) {
                try { localStorage.removeItem(`tide_backup_${fileId}`); } catch (_) {}
                if (parsedContent?.version === 1 && Array.isArray(parsedContent?.items) && typeof parsedContent?.canvasWidth === 'number') {
                    setCanvasNoteData(parsedContent);
                    initialContentRef.current = parsedContent;
                    setEditorContent(null);
                } else {
                    setEditorContent(parsedContent);
                    initialContentRef.current = parsedContent;
                }
                userHasTypedRef.current = false;
            } else if (recoveredBackup && !isDocEmpty(recoveredBackup)) {
                setEditorContent(recoveredBackup);
                initialContentRef.current = recoveredBackup;
                userHasTypedRef.current = false;
            } else {
                const emptyDoc = { type: 'doc', content: [{ type: 'paragraph', attrs: { blockId: crypto.randomUUID() } }] };
                setEditorContent(emptyDoc);
                initialContentRef.current = emptyDoc;
                userHasTypedRef.current = false;
            }
        } catch (err: any) {
            if (err?.message?.includes('404')) {
                handleFileNotFound(fileId);
            } else if (lastLoadIdRef.current === loadId) {
                const fallbackDoc = {
                    type: 'doc',
                    content: [{ type: 'paragraph', attrs: { blockId: crypto.randomUUID() }, content: [{ type: 'text', text: '' }] }]
                };
                setEditorContent(fallbackDoc);
                initialContentRef.current = fallbackDoc;
                userHasTypedRef.current = false;
            }
        } finally {
            if (lastLoadIdRef.current === loadId) setIsLoadingContent(false);
        }
    }, [
        options.privateKey,
        options.myId,
        options.files,
        options.events,
        handleFileNotFound,
        setIsLoadingContent,
        setEditorContent,
        setFileName,
        setSaveStatus,
        setActiveFileKey,
        setCanvasNoteData,
        performSave,
    ]);

    return {
        saveStatus,
        setSaveStatus,
        isLoadingContent,
        setIsLoadingContent,
        activeFileKey,
        setActiveFileKey,
        editorContent,
        setEditorContent,
        canvasNoteData,
        setCanvasNoteData,
        fileName,
        setFileName,
        userHasTypedRef,
        initialContentRef,
        handleEditorChange,
        triggerSave,
        performSave,
        loadNoteContent,
        countWordsInTipTapJson,
        isOfflinePending,
    };
}
