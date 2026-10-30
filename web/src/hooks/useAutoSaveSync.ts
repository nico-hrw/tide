"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import * as Y from "yjs";
import { useDataStore } from "@/store/useDataStore";
import { useActiveNoteStore } from "@/store/activeNoteStore";
import { Tab } from "@/components/Layout/TabList";
import { apiFetch } from "@/lib/api";
import * as cryptoLib from "@/lib/crypto";
import { encryptSnapshot } from "@/lib/e2eeFraming";
import {
    isDocEmpty,
    countWordsInTipTapJson,
    recordNoteStats,
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
    ydoc?: Y.Doc | null;
}

const IDLE_COMPACTION_MS = 15000; // 15 seconds idle inactivity trigger

export function useAutoSaveSync(options: UseAutoSaveSyncOptions = {}) {
    const [intKey, setIntKey] = useState<CryptoKey | null>(null);
    const [intEd, setIntEd] = useState<any>(null);
    const [intCnv, setIntCnv] = useState<any>(null);
    const [intStat, setIntStat] = useState<"saved" | "unsaved" | "saving">("saved");
    const [intName, setIntName] = useState<string>("");
    const [intLoad, setIntLoad] = useState<boolean>(false);
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

    const userHasTypedRef = useRef(false);
    const lastNoteWordCountsRef = useRef<Record<string, number>>({});
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const activeNoteIdRef = useRef<string | null>(activeNoteId);
    const activeFileKeyRef = useRef<CryptoKey | null>(activeFileKey);
    const editorContentRef = useRef<any>(editorContent);
    const canvasNoteDataRef = useRef<any>(canvasNoteData);
    const saveStatusRef = useRef<string>(saveStatus);
    const fileNameRef = useRef<string>(fileName);
    const isCompactingRef = useRef<Set<string>>(new Set());
    const initialContentRef = useRef<any>(null);
    const unsavedNotesRef = useRef<Set<string>>(new Set());
    const lastLoadIdRef = useRef<string | null>(null);
    const prevNoteIdRef = useRef<string | null>(null);
    const lastSavedMetaRef = useRef<Record<string, { title?: string; icon?: string; tags?: string[] }>>({});

    useEffect(() => {
        const handleSynced = () => setIsOfflinePending(false);
        const handleOnline = () => setIsOfflinePending(false);
        if (typeof window !== "undefined") {
            window.addEventListener("tide-synced", handleSynced);
            window.addEventListener("tide-online", handleOnline);
            return () => {
                window.removeEventListener("tide-synced", handleSynced);
                window.removeEventListener("tide-online", handleOnline);
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

    useEffect(() => {
        if (activeFileKey instanceof CryptoKey) {
            useActiveNoteStore.getState().setActiveDEK(activeFileKey);
        } else if (activeFileKey === null) {
            useActiveNoteStore.getState().setActiveDEK(null);
        }
    }, [activeFileKey]);

    const handleFileNotFound = useCallback((fileId: string) => {
        apiFetch("/api/v1/files/" + fileId, { method: "DELETE" }).catch(() => {});
        useDataStore.getState().setNotes(useDataStore.getState().notes.filter((n: any) => n.id !== fileId));
        options.setOpenTabs?.(prev => prev.filter(t => t.id !== fileId));
        const fallback = options.openTabs?.find(t => t.id !== fileId);
        if (fallback && options.switchTab) options.switchTab(fallback.id, fallback.type, fallback.title);
    }, [options.openTabs, options.setOpenTabs, options.switchTab]);

    /**
     * Checkpoint Compaction Manager (BUG-11)
     * Triggers snapshot compaction for users with write permission:
     * 1) Server COMPACT_REQUEST control frame / event.
     * 2) 15 seconds of idle inactivity after local edits.
     * 3) Component unmount or visibilityState === 'hidden'.
     */
    const triggerCompaction = useCallback(async (targetNoteId?: string, explicitSeqId?: number) => {
        const noteId = targetNoteId || activeNoteIdRef.current;
        if (!noteId || noteId === "calendar" || noteId === "messages" || noteId.startsWith("chat-") || noteId.startsWith("profile:")) {
            return;
        }

        if (isCompactingRef.current.has(noteId)) {
            return;
        }

        // Verify write permission
        const freshState = useDataStore.getState();
        const curFile = [...freshState.notes, ...freshState.events].find((f: any) => f.id === noteId) as any;
        const myUserId = options.myId || freshState.myId;
        const storePerm = useActiveNoteStore.getState().permission;
        const filePerm = curFile?.permission;
        const isOwner = curFile?.owner_id === myUserId || storePerm === "owner";
        const hasWritePerm = isOwner || storePerm === "edit" || storePerm === "share" || filePerm === "edit" || filePerm === "share";

        if (!hasWritePerm) {
            console.log(`[Compaction] User lacks write permission on ${noteId}, skipping compaction`);
            return;
        }

        // Handle public files through standard public upload
        if (curFile?.visibility === "public") {
            const content = editorContentRef.current ?? canvasNoteDataRef.current;
            if (content) {
                const contentStr = typeof content === "string" ? content : JSON.stringify(content);
                const isTargetActive = noteId === activeNoteIdRef.current;
                const pubTitle = (isTargetActive && fileNameRef.current) ? fileNameRef.current : (curFile?.title || "Untitled");
                await uploadPublicFile(noteId, contentStr, pubTitle, () => handleFileNotFound(noteId));
            }
            return;
        }

        isCompactingRef.current.add(noteId);
        if (noteId === activeNoteIdRef.current) {
            setSaveStatus("saving");
        }

        try {
            // Get active collaborative Y.Doc
            const ydoc = options.ydoc || useActiveNoteStore.getState().activeYDoc || (window as any).__tideActiveYDoc;
            if (!ydoc) {
                console.warn(`[Compaction] No active Y.Doc found for ${noteId}, skipping snapshot`);
                if (noteId === activeNoteIdRef.current) setSaveStatus("saved");
                return;
            }

            // Encode Yjs state vector snapshot
            const stateBytes = Y.encodeStateAsUpdate(ydoc);

            // Resolve DEK
            let activeDEK = activeFileKeyRef.current || options.activeFileKey || null;
            if (!activeDEK) {
                const freshPrivKey = options.privateKey || freshState.privateKey;
                const freshPubKey = options.publicKey || freshState.publicKey;
                if (freshPrivKey && freshPubKey && myUserId && curFile) {
                    try {
                        const resolved = await resolveSaveDEK(curFile, myUserId, freshPrivKey, freshPubKey);
                        if (resolved?.dek) {
                            activeDEK = resolved.dek;
                            setActiveFileKey(activeDEK);
                            if (activeDEK instanceof CryptoKey) {
                                useActiveNoteStore.getState().setActiveDEK(activeDEK);
                            }
                        }
                    } catch (e) {
                        console.warn("[Compaction] Failed to resolve DEK:", e);
                    }
                }
            }

            if (!activeDEK || !(activeDEK instanceof CryptoKey)) {
                return; // Skip compaction until real CryptoKey is loaded
            }

            const keyEpoch = useActiveNoteStore.getState().keyEpoch || 1;

            // Encrypt snapshot with AEAD
            const { ivBase64, ciphertextBase64 } = await encryptSnapshot(noteId, keyEpoch, activeDEK, stateBytes);

            // Determine target WAL seqId to prune
            let upToSeqId = explicitSeqId ?? useActiveNoteStore.getState().lastCompactedSeqId ?? 0;
            if (explicitSeqId === undefined) {
                try {
                    let stateRes = await apiFetch(`/api/v1/files/${noteId}/crdt-state`);
                    if (stateRes.status === 404) {
                        stateRes = await apiFetch(`/api/files/${noteId}/crdt-state`);
                    }
                    if (stateRes.ok) {
                        const stateData = await stateRes.json().catch(() => null);
                        const wal = stateData?.wal;
                        if (Array.isArray(wal) && wal.length > 0) {
                            const maxSeq = wal[wal.length - 1]?.seqId;
                            if (typeof maxSeq === "number" && maxSeq > upToSeqId) {
                                upToSeqId = maxSeq;
                            }
                        } else if (typeof stateData?.snapshotSeqId === "number" && stateData.snapshotSeqId > upToSeqId) {
                            upToSeqId = stateData.snapshotSeqId;
                        }
                    }
                } catch (_) {}
            }

            // Call POST /api/files/${noteId}/compact with { upToSeqId, keyEpoch, ivBase64, ciphertextBase64 }
            const compactPayload = {
                upToSeqId,
                keyEpoch,
                ivBase64,
                ciphertextBase64,
            };

            let compactRes = await apiFetch(`/api/v1/files/${noteId}/compact`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(compactPayload),
            });
            if (compactRes.status === 404) {
                compactRes = await apiFetch(`/api/files/${noteId}/compact`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(compactPayload),
                });
            }

            if (!compactRes.ok && compactRes.status !== 204) {
                throw new Error(`[Compaction] Failed with status ${compactRes.status}`);
            }

            // Update lastCompactedSeqId in store
            useActiveNoteStore.getState().setLastCompactedSeqId(upToSeqId);
            unsavedNotesRef.current.delete(noteId);
            if (noteId === activeNoteIdRef.current) {
                setSaveStatus("saved");
            }

            // Persist updated secured_meta if title/icon/tags changed
            const lastMeta = lastSavedMetaRef.current[noteId];
            const isTargetActive = noteId === activeNoteIdRef.current;
            const currentTitle = (isTargetActive && fileNameRef.current) ? fileNameRef.current : (curFile?.title || "Untitled");
            const currentIcon = curFile?.icon || curFile?.metadata?.icon;
            const currentTags = curFile?.tags || curFile?.metadata?.tags;

            const metaChanged = !lastMeta ||
                lastMeta.title !== currentTitle ||
                lastMeta.icon !== currentIcon ||
                JSON.stringify(lastMeta.tags) !== JSON.stringify(currentTags);

            if (metaChanged) {
                const freshPubKey = options.publicKey || freshState.publicKey;
                if (freshPubKey) {
                    try {
                        const metaObj: Record<string, unknown> = { title: currentTitle };
                        if (currentIcon !== undefined) metaObj.icon = currentIcon;
                        if (currentTags !== undefined) metaObj.tags = currentTags;

                        const freshSecuredMeta = await cryptoLib.encryptMetadata(metaObj, freshPubKey, `meta-${noteId}`);
                        const metaUpdatePayload = {
                            secured_meta: freshSecuredMeta,
                            metadata: {
                                title: currentTitle,
                                ...(currentIcon !== undefined ? { icon: currentIcon } : {}),
                                ...(currentTags !== undefined ? { tags: currentTags } : {}),
                            },
                        };

                        let metaRes = await apiFetch(`/api/v1/files/${noteId}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(metaUpdatePayload),
                        });
                        if (metaRes.status === 404) {
                            metaRes = await apiFetch(`/api/files/${noteId}`, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(metaUpdatePayload),
                            });
                        }

                        if (metaRes.ok) {
                            lastSavedMetaRef.current[noteId] = {
                                title: currentTitle,
                                icon: currentIcon,
                                tags: currentTags,
                            };
                            useDataStore.getState().updateFileRaw(noteId, {
                                title: currentTitle,
                                secured_meta: freshSecuredMeta,
                                metadata: { title: currentTitle },
                            });
                        }
                    } catch (mErr) {
                        console.warn("[Compaction] Error updating secured_meta:", mErr);
                    }
                }
            }
        } catch (err) {
            console.error(`[Compaction FAILED] noteId: ${noteId}:`, err);
            if (noteId === activeNoteIdRef.current) {
                setSaveStatus("unsaved");
            }
        } finally {
            isCompactingRef.current.delete(noteId);
        }
    }, [options.myId, options.privateKey, options.publicKey, options.activeFileKey, options.ydoc, setSaveStatus, setActiveFileKey, handleFileNotFound]);

    const handleEditorChange = useCallback((json: any, yjsUpdateBase64?: string) => {
        userHasTypedRef.current = true;
        const fullContent = yjsUpdateBase64 ? { ...json, __yjs: yjsUpdateBase64 } : json;
        setEditorContent(fullContent);
        setSaveStatus("unsaved");

        const id = activeNoteIdRef.current;
        if (id) {
            unsavedNotesRef.current.add(id);
            recordNoteStats(id, json, lastNoteWordCountsRef.current);

            // Schedule 15s idle inactivity trigger
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            idleTimerRef.current = setTimeout(() => {
                triggerCompaction(id);
            }, IDLE_COMPACTION_MS);
        }
        if (options.setEditorVersion) options.setEditorVersion(v => v + 1);
    }, [setEditorContent, setSaveStatus, options.setEditorVersion, triggerCompaction]);

    // Backward-compatible triggerSave maps to checkpoint compaction
    const triggerSave = useCallback(async (noteId: string, fileKey?: CryptoKey | null, _content?: any) => {
        if (!noteId || noteId === "calendar" || noteId === "messages" || noteId.startsWith("chat-")) return;
        if (fileKey && fileKey !== activeFileKeyRef.current) {
            setActiveFileKey(fileKey);
            activeFileKeyRef.current = fileKey;
            if (fileKey instanceof CryptoKey) {
                useActiveNoteStore.getState().setActiveDEK(fileKey);
            }
        }
        await triggerCompaction(noteId);
    }, [triggerCompaction, setActiveFileKey]);

    // Deprecated legacy performSave kept as safe delegate to prevent caller errors
    const performSave = useCallback(async (_content: any, fileId: string, fileKey?: CryptoKey | null, visibility?: string) => {
        if (!fileId) return;
        if (visibility === "public") {
            const contentString = typeof _content === "string" ? _content : JSON.stringify(_content);
            const isTargetActive = fileId === activeNoteIdRef.current;
            const targetTitle = (isTargetActive && fileNameRef.current) ? fileNameRef.current : (useDataStore.getState().notes.find((n: any) => n.id === fileId)?.title || "Untitled");
            await uploadPublicFile(fileId, contentString, targetTitle, () => handleFileNotFound(fileId));
            return;
        }
        await triggerSave(fileId, fileKey);
    }, [triggerSave, handleFileNotFound]);

    // Checkpoint Compaction triggers:
    // 1) Server COMPACT_REQUEST control frame / event
    // 2) Component unmount or visibilityState === 'hidden'
    useEffect(() => {
        const handleServerCompact = (e: Event) => {
            const detail = (e as CustomEvent)?.detail;
            const targetId = detail?.noteId || detail?.fileId || detail?.fileID || activeNoteIdRef.current;
            const seqId = detail?.upToSeqId || detail?.seqId;
            if (targetId) {
                triggerCompaction(targetId, seqId);
            }
        };

        const handleVisChange = () => {
            if (document.visibilityState === "hidden" && activeNoteIdRef.current) {
                if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
                triggerCompaction(activeNoteIdRef.current);
            }
        };

        const handleBeforeUnload = () => {
            if (activeNoteIdRef.current) {
                if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
                triggerCompaction(activeNoteIdRef.current);
            }
        };

        window.addEventListener("tide:compact_request", handleServerCompact);
        window.addEventListener("COMPACT_REQUEST", handleServerCompact);
        window.addEventListener("visibilitychange", handleVisChange);
        window.addEventListener("beforeunload", handleBeforeUnload);

        return () => {
            window.removeEventListener("tide:compact_request", handleServerCompact);
            window.removeEventListener("COMPACT_REQUEST", handleServerCompact);
            window.removeEventListener("visibilitychange", handleVisChange);
            window.removeEventListener("beforeunload", handleBeforeUnload);
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            // On unmount:
            if (activeNoteIdRef.current && unsavedNotesRef.current.has(activeNoteIdRef.current)) {
                triggerCompaction(activeNoteIdRef.current);
            }
            useActiveNoteStore.getState().setActiveDEK(null);
        };
    }, [triggerCompaction]);

    // Note switch compaction
    useEffect(() => {
        const prev = prevNoteIdRef.current;
        prevNoteIdRef.current = activeNoteId ?? null;
        if (prev !== activeNoteId) {
            useActiveNoteStore.getState().setActiveDEK(null);
            if (!prev || !unsavedNotesRef.current.has(prev)) return;

            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            triggerCompaction(prev);
        }
    }, [activeNoteId, triggerCompaction]);

    const loadNoteContent = useCallback(async (fileId: string, titleFn: string, passedFile?: any) => {
        const effPrivKey = options.privateKey || useDataStore.getState().privateKey;
        if (!effPrivKey) {
            setTimeout(() => {
                if (useDataStore.getState().privateKey) loadNoteContent(fileId, titleFn, passedFile);
            }, 300);
            return;
        }

        const effMyId = options.myId || useDataStore.getState().myId
            || (typeof window !== "undefined" ? (localStorage.getItem("tide_user_id") || sessionStorage.getItem("tide_user_id") || "") : "");
        const loadId = crypto.randomUUID();
        lastLoadIdRef.current = loadId;
        setIsLoadingContent(true);
        setEditorContent(null);

        if (titleFn && !titleFn.includes("Locked")) setFileName(titleFn);
        setSaveStatus("saved");

        try {
            const storeNotes = useDataStore.getState().notes;
            const storeEvs = useDataStore.getState().events;
            let target = passedFile
                || storeNotes.find((f: any) => f.id === fileId)
                || storeEvs.find((e: any) => e.id === fileId)
                || options.files?.find(f => f.id === fileId)
                || options.events?.find(e => e.id === fileId) as any;

            if (!target) {
                let res = await apiFetch(`/api/v1/files/${fileId}`);
                if (res.status === 404) {
                    res = await apiFetch(`/api/files/${fileId}`);
                }
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

            if (fileKeyToUse) {
                setActiveFileKey(fileKeyToUse);
                if (fileKeyToUse instanceof CryptoKey) {
                    useActiveNoteStore.getState().setActiveDEK(fileKeyToUse);
                }
            }

            if (title) {
                if (!title.includes("Locked Note")) {
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
                    isContentEmpty = typeof contentText === "string" ? contentText.trim().length === 0 : true;
                }
            }

            if (!isContentEmpty && parsedContent) {
                try { localStorage.removeItem(`tide_backup_${fileId}`); } catch (_) {}
                if (parsedContent?.version === 1 && Array.isArray(parsedContent?.items) && typeof parsedContent?.canvasWidth === "number") {
                    setCanvasNoteData(parsedContent);
                    initialContentRef.current = parsedContent;
                    setEditorContent(null);
                } else {
                    setEditorContent(parsedContent);
                    initialContentRef.current = parsedContent;
                }
                userHasTypedRef.current = false;
            } else {
                const emptyDoc = { type: "doc", content: [{ type: "paragraph", attrs: { blockId: crypto.randomUUID() } }] };
                setEditorContent(emptyDoc);
                initialContentRef.current = emptyDoc;
                userHasTypedRef.current = false;
            }
        } catch (err: any) {
            if (err?.message?.includes("404")) {
                handleFileNotFound(fileId);
            } else if (lastLoadIdRef.current === loadId) {
                const fallbackDoc = {
                    type: "doc",
                    content: [{ type: "paragraph", attrs: { blockId: crypto.randomUUID() }, content: [{ type: "text", text: "" }] }]
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
        triggerCompaction,
    };
}
