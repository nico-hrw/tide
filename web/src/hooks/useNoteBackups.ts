"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import type { JSONContent } from "@tiptap/core";
import { apiFetch } from "@/lib/api";
import { decryptMetadata, decryptFile } from "@/lib/crypto";
import { unwrapDEKData, importDEK } from "@/lib/cryptoV2";
import { diffWords, applyLinePatch, getPlainTextFromJSON, type DiffChange, type LinePatchOp } from "@/lib/diff";

export interface NoteBackupPoint {
    id: string;
    slotName: string;
    label: string;
    updatedAt: string;
    formattedDate: string;
    formattedTime: string;
    isCurrent: boolean;
    timestamp?: string;
}

export interface UseNoteBackupsOptions {
    fileId: string | null;
    privateKey: CryptoKey | null;
    myId: string | null;
    currentContent: JSONContent | Record<string, unknown> | null;
    enabled: boolean;
}

export interface UseNoteBackupsResult {
    points: NoteBackupPoint[];
    activeIndex: number;
    setActiveIndex: (index: number) => void;
    selectedPoint: NoteBackupPoint | null;
    selectedContent: JSONContent | Record<string, unknown> | null;
    diffChanges: DiffChange[];
    isLoading: boolean;
    error: string | null;
}

interface ServerBackupSlot {
    id?: string;
    file_id?: string;
    slot_name?: string;
    secured_meta?: string;
    access_keys?: Record<string, { wrapped_key?: string }> | string;
    version?: number;
    updated_at?: string;
    encrypted_blob?: string;
}

interface CacheEntry { json: JSONContent | Record<string, unknown>; plainText: string; rawText: string; }

const FIXED_SLOTS = ["10 minutes", "30 minutes", "1 hour", "1 day", "2 days", "1 week"];
const SLOT_LABELS: Record<string, string> = {
    "10 minutes": "Vor 10 Min", "30 minutes": "Vor 30 Min", "1 hour": "Vor 1 Std",
    "1 day": "Vor 1 Tag", "2 days": "Vor 2 Tagen", "1 week": "Vor 1 Woche",
};

/** Decrypts an encrypted backup blob (V1 or V2) into a plaintext string. */
async function decryptBackupBlob(data: ServerBackupSlot, privKey: CryptoKey, userId: string, fileId: string): Promise<string> {
    if (!data.encrypted_blob) throw new Error("Kein Blob vorhanden.");
    const bin = atob(data.encrypted_blob);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    if ((data.version ?? 1) >= 2 || !!data.access_keys) {
        if (!userId) throw new Error("Benutzer-ID nicht verfügbar");
        const accessKeys = typeof data.access_keys === "string" ? JSON.parse(data.access_keys) : (data.access_keys || {});
        const myAccess = accessKeys?.[userId];
        if (!myAccess?.wrapped_key) throw new Error("Kein Zugriffsschlüssel für dieses Backup.");
        const dek = await importDEK(await unwrapDEKData(myAccess.wrapped_key, privKey));
        const payload = JSON.parse(new TextDecoder().decode(bytes));
        const ivBuf = new Uint8Array(atob(payload.iv).split("").map((c: string) => c.charCodeAt(0)));
        const dataBuf = new Uint8Array(atob(payload.data).split("").map((c: string) => c.charCodeAt(0)));
        return new TextDecoder().decode(await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBuf }, dek, dataBuf));
    } else {
        if (!data.secured_meta) throw new Error("Metadata fehlt im Backup.");
        const meta = await decryptMetadata(data.secured_meta, privKey, `backup-${fileId}`);
        if (meta.isLocked) throw new Error("Backup-Metadaten konnten nicht entschlüsselt werden.");
        const fileKey = await window.crypto.subtle.importKey("jwk", meta.fileKey as JsonWebKey, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
        const decBlob = await decryptFile(new Blob([bytes]), meta.iv as string, fileKey, fileId);
        return await decBlob.text();
    }
}

export function useNoteBackups(fileId: string | null, privateKey: CryptoKey | null, myId: string | null, currentContent: JSONContent | Record<string, unknown> | null, enabled: boolean): UseNoteBackupsResult;
export function useNoteBackups(options: UseNoteBackupsOptions): UseNoteBackupsResult;
export function useNoteBackups(
    arg1: string | null | UseNoteBackupsOptions,
    arg2?: CryptoKey | null,
    arg3?: string | null,
    arg4?: JSONContent | Record<string, unknown> | null,
    arg5?: boolean
): UseNoteBackupsResult {
    const opts = typeof arg1 === "object" && arg1 !== null && ("fileId" in arg1 || "enabled" in arg1)
        ? arg1
        : { fileId: arg1, privateKey: arg2 ?? null, myId: arg3 ?? null, currentContent: arg4 ?? null, enabled: !!arg5 };
    const { fileId, privateKey, myId, currentContent, enabled } = opts;

    const [serverSlots, setServerSlots] = useState<ServerBackupSlot[]>([]);
    const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);
    const [slotError, setSlotError] = useState<string | null>(null);

    const [activeIndex, setActiveIndex] = useState<number>(0);
    const [backupContent, setBackupContent] = useState<JSONContent | Record<string, unknown> | null>(null);
    const [backupPlainText, setBackupPlainText] = useState<string | null>(null);
    const [isLoadingContent, setIsLoadingContent] = useState<boolean>(false);
    const [contentError, setContentError] = useState<string | null>(null);

    const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
    const currentContentRef = useRef(currentContent);
    currentContentRef.current = currentContent;

    useEffect(() => {
        cacheRef.current.clear(); setActiveIndex(0); setServerSlots([]);
        setBackupContent(null); setBackupPlainText(null); setSlotError(null); setContentError(null);
    }, [fileId]);

    useEffect(() => {
        if (!enabled || !fileId) {
            setServerSlots([]);
            setIsLoadingSlots(false);
            setSlotError(null);
            return;
        }
        let isMounted = true;
        setIsLoadingSlots(true);
        setSlotError(null);

        apiFetch(`/api/v1/files/${fileId}/backups`)
            .then(res => { if (!res.ok) throw new Error(`Fehler ${res.status}`); return res.json(); })
            .then(data => {
                if (!isMounted) return;
                setServerSlots(Array.isArray(data) ? data : []);
                setIsLoadingSlots(false);
            })
            .catch(err => {
                if (!isMounted) return;
                setSlotError(`Backups konnten nicht abgerufen werden: ${err instanceof Error ? err.message : String(err)}`);
                setIsLoadingSlots(false);
            });

        return () => { isMounted = false; };
    }, [enabled, fileId]);

    const points: NoteBackupPoint[] = useMemo(() => {
        const now = new Date().toISOString();
        const currentPoint: NoteBackupPoint = {
            id: "current", slotName: "current", label: "Jetzt", updatedAt: now,
            formattedDate: "Heute", formattedTime: "Aktuell", isCurrent: true, timestamp: now,
        };
        if (!enabled || !fileId || serverSlots.length === 0) return [currentPoint];

        const seen = new Set<string>();
        const valid = serverSlots.filter(s => {
            const trimmed = s.slot_name?.trim();
            if (!trimmed || !FIXED_SLOTS.includes(trimmed) || seen.has(trimmed)) return false;
            seen.add(trimmed);
            return true;
        });

        valid.sort((a, b) => {
            const tA = new Date(a.updated_at || "").getTime();
            const tB = new Date(b.updated_at || "").getTime();
            return !isNaN(tA) && !isNaN(tB) && tA !== tB ? tB - tA : FIXED_SLOTS.indexOf(a.slot_name!.trim()) - FIXED_SLOTS.indexOf(b.slot_name!.trim());
        });

        const history: NoteBackupPoint[] = valid.map(s => {
            const slotName = s.slot_name!.trim();
            const d = new Date(s.updated_at || "");
            const ok = !isNaN(d.getTime());
            return {
                id: s.id || slotName, slotName, label: SLOT_LABELS[slotName] || slotName, updatedAt: s.updated_at || "",
                formattedDate: ok ? d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "",
                formattedTime: ok ? d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "",
                isCurrent: false, timestamp: s.updated_at || "",
            };
        });

        return [currentPoint, ...history];
    }, [enabled, fileId, serverSlots]);

    useEffect(() => {
        if (activeIndex >= points.length) setActiveIndex(0);
    }, [points.length, activeIndex]);

    const selectedPoint: NoteBackupPoint | null = points[activeIndex] ?? null;

    useEffect(() => {
        if (activeIndex === 0 || !selectedPoint || selectedPoint.isCurrent) {
            setBackupContent(null); setBackupPlainText(null); setContentError(null); setIsLoadingContent(false);
            return;
        }
        if (!fileId || !enabled) return;

        const slotName = selectedPoint.slotName;
        const cached = cacheRef.current.get(slotName);
        if (cached) {
            setBackupContent(cached.json); setBackupPlainText(cached.plainText); setContentError(null); setIsLoadingContent(false);
            return;
        }

        let isMounted = true;
        setIsLoadingContent(true);
        setContentError(null);

        (async () => {
            try {
                if (!privateKey) throw new Error("Kein privater RSA-Schlüssel vorhanden.");
                if (!myId) throw new Error("Benutzer-ID nicht verfügbar.");

                const res = await apiFetch(`/api/v1/files/${fileId}/backups/${encodeURIComponent(slotName)}`);
                if (!res.ok) throw new Error(`Backup konnte nicht geladen werden (${res.status})`);
                const backupData = (await res.json()) as ServerBackupSlot;
                if (!backupData.encrypted_blob) throw new Error("Noch kein Backup für diesen Zeitraum vorhanden.");

                const decryptedText = await decryptBackupBlob(backupData, privateKey, myId, fileId);
                let backupJsonStr = decryptedText;

                try {
                    const parsed = JSON.parse(decryptedText);
                    if (Array.isArray(parsed)) {
                        let baseText = cacheRef.current.get("1 week")?.rawText || "";
                        if (!baseText) {
                            try {
                                const baseRes = await apiFetch(`/api/v1/files/${fileId}/backups/${encodeURIComponent("1 week")}`);
                                if (baseRes.ok) {
                                    const baseData = (await baseRes.json()) as ServerBackupSlot;
                                    if (baseData.encrypted_blob) {
                                        baseText = await decryptBackupBlob(baseData, privateKey, myId, fileId);
                                        try {
                                            const baseJson = JSON.parse(baseText);
                                            cacheRef.current.set("1 week", { json: baseJson, plainText: getPlainTextFromJSON(baseJson), rawText: baseText });
                                        } catch { /* ignore */ }
                                    }
                                }
                            } catch { /* base fetch error handled by fallback */ }
                        }
                        if (!baseText && currentContentRef.current) {
                            baseText = typeof (currentContentRef.current as unknown) === "string" ? (currentContentRef.current as unknown as string) : JSON.stringify(currentContentRef.current);
                        }
                        if (!baseText) throw new Error("Basis-Backup (1 Woche) fehlt und aktueller Inhalt nicht geladen — Delta kann nicht rekonstruiert werden.");
                        backupJsonStr = applyLinePatch(baseText, parsed as LinePatchOp[]);
                    }
                } catch (parseErr) {
                    if (parseErr instanceof Error && parseErr.message.includes("Basis-Backup")) throw parseErr;
                }

                let backupJsonObj: JSONContent | Record<string, unknown> | null = null;
                try {
                    backupJsonObj = JSON.parse(backupJsonStr) as JSONContent | Record<string, unknown>;
                } catch {
                    throw new Error("Die rekonstruierte Version ist kein gültiges JSON.");
                }
                if (!backupJsonObj || (typeof backupJsonObj === "object" && Object.keys(backupJsonObj).length === 0)) {
                    throw new Error("Der rekonstruierte Stand ist leer und kann nicht geladen werden.");
                }

                const plainText = getPlainTextFromJSON(backupJsonObj);
                cacheRef.current.set(slotName, { json: backupJsonObj, plainText, rawText: decryptedText });

                if (isMounted) {
                    setBackupContent(backupJsonObj);
                    setBackupPlainText(plainText);
                    setIsLoadingContent(false);
                }
            } catch (err) {
                if (isMounted) {
                    setContentError(`Fehler beim Laden/Entschlüsseln: ${err instanceof Error ? err.message : String(err)}`);
                    setIsLoadingContent(false);
                }
            }
        })();

        return () => { isMounted = false; };
    }, [activeIndex, selectedPoint, fileId, enabled, privateKey, myId]);

    const currentPlainText = useMemo(() => getPlainTextFromJSON(currentContent), [currentContent]);
    const selectedContent: JSONContent | Record<string, unknown> | null = activeIndex === 0 ? (currentContent ?? null) : backupContent;

    const diffChanges: DiffChange[] = useMemo(() => {
        if (activeIndex === 0) return [{ type: "equal" as const, text: currentPlainText }];
        if (backupPlainText !== null) return diffWords(backupPlainText, currentPlainText);
        return [];
    }, [activeIndex, backupPlainText, currentPlainText]);

    return {
        points, activeIndex, setActiveIndex, selectedPoint, selectedContent, diffChanges,
        isLoading: isLoadingSlots || (activeIndex > 0 && isLoadingContent),
        error: contentError || slotError,
    };
}
