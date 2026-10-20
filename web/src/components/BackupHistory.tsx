import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { useDataStore } from '../store/useDataStore';
import { decryptMetadata, decryptFile } from '../lib/crypto';
import { unwrapDEKData, importDEK } from '../lib/cryptoV2';
import { Clock, RotateCcw, Calendar, AlertCircle, X } from 'lucide-react';
import { diffWords, applyLinePatch, getPlainTextFromJSON } from '../lib/diff';

interface BackupSlot {
    id: string;
    file_id: string;
    slot_name: string;
    secured_meta?: string;
    access_keys?: Record<string, { wrapped_key?: string }> | string;
    version?: number;
    updated_at: string;
    encrypted_blob?: string;
}

interface BackupHistoryProps {
    fileId: string;
    currentContent: unknown;
    onRestore: (content: unknown) => void;
    onCancel: () => void;
}

export default function BackupHistory({ fileId, currentContent, onRestore, onCancel }: BackupHistoryProps) {
    const [slots, setSlots] = useState<Record<string, BackupSlot>>({});
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
    const [diffChanges, setDiffChanges] = useState<{ type: 'added' | 'removed' | 'equal', text: string }[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [restoredJson, setRestoredJson] = useState<Record<string, unknown> | null>(null);

    const orderedSlots = [
        "10 minutes",
        "30 minutes",
        "1 hour",
        "1 day",
        "2 days",
        "1 week"
    ];

    const getFriendlySlotName = (name: string) => {
        const n = name.trim();
        switch (n) {
            case "10 minutes": return "Vor 10 Minuten";
            case "30 minutes": return "Vor 30 Minuten";
            case "1 hour": return "Vor 1 Stunde";
            case "1 day": return "Vor 1 Tag";
            case "2 days": return "Vor 2 Tagen";
            case "1 week": return "Vor 1 Woche (Basis)";
            default: return n;
        }
    };

    // Lock body scroll while modal is open
    useEffect(() => {
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, []);

    // Close on Escape key press
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onCancel();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onCancel]);

    useEffect(() => {
        apiFetch(`/api/v1/files/${fileId}/backups`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    const slotMap: Record<string, BackupSlot> = {};
                    for (const s of data) {
                        const trimmed = s.slot_name.trim();
                        slotMap[trimmed] = { ...s, slot_name: trimmed };
                    }
                    setSlots(slotMap);
                }
            })
            .catch(console.error);
    }, [fileId]);

    /** Decrypts a backup blob (V1 or V2) and returns the plaintext string. */
    const decryptBackupBlob = async (backupData: BackupSlot & { encrypted_blob?: string }, privateKey: CryptoKey, myId: string): Promise<string> => {
        if (!backupData.encrypted_blob) throw new Error("Kein Blob vorhanden.");

        const binaryString = atob(backupData.encrypted_blob);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

        const isV2 = (backupData.version ?? 1) >= 2 || !!backupData.access_keys;

        if (isV2) {
            if (!myId) throw new Error("Benutzer-ID nicht verfügbar");
            const accessKeys = typeof backupData.access_keys === 'string'
                ? JSON.parse(backupData.access_keys) as Record<string, { wrapped_key?: string }>
                : (backupData.access_keys || {});
            const myAccess = accessKeys?.[myId];
            if (!myAccess?.wrapped_key) throw new Error("Kein Zugriffsschlüssel für dieses Backup.");

            const rawDek = await unwrapDEKData(myAccess.wrapped_key, privateKey);
            const dek = await importDEK(rawDek);

            const blobText = new TextDecoder().decode(bytes);
            const payload = JSON.parse(blobText);
            const ivBuf = new Uint8Array(atob(payload.iv).split("").map(c => c.charCodeAt(0)));
            const dataBuf = new Uint8Array(atob(payload.data).split("").map(c => c.charCodeAt(0)));

            const decrypted = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: ivBuf },
                dek,
                dataBuf
            );
            return new TextDecoder().decode(decrypted);
        } else {
            if (!backupData.secured_meta) throw new Error("Metadata fehlt im Backup.");
            const meta = await decryptMetadata(backupData.secured_meta, privateKey, `backup-${fileId}`);
            if (meta.isLocked) throw new Error("Backup-Metadaten konnten nicht entschlüsselt werden.");

            const fileKey = await window.crypto.subtle.importKey(
                "jwk", meta.fileKey as JsonWebKey, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]
            );
            const blob = new Blob([bytes]);
            const decryptedBlob = await decryptFile(blob, meta.iv as string, fileKey, fileId);
            return await decryptedBlob.text();
        }
    };

    const handleSelect = async (slotName: string) => {
        const slot = slots[slotName.trim()];
        if (!slot) return;

        setSelectedSlot(slotName);
        setLoading(true);
        setDiffChanges(null);
        setErrorMsg(null);
        setRestoredJson(null);

        try {
            const { privateKey, myId } = useDataStore.getState();
            if (!privateKey) throw new Error("Kein privater RSA-Schlüssel vorhanden.");
            if (!myId) throw new Error("Benutzer-ID nicht verfügbar.");

            // Fetch the selected slot's encrypted backup
            const bRes = await apiFetch(`/api/v1/files/${fileId}/backups/${encodeURIComponent(slot.slot_name)}`);
            const backupData = await bRes.json();

            if (!backupData.encrypted_blob) {
                setErrorMsg("Noch kein Backup für diesen Zeitraum vorhanden.");
                setLoading(false);
                return;
            }

            // Decrypt the backup blob
            const decryptedText = await decryptBackupBlob(backupData, privateKey, myId);

            // Determine if decrypted content is a delta patch or a full copy
            let backupJsonStr = decryptedText;
            try {
                const parsed = JSON.parse(decryptedText);
                if (Array.isArray(parsed)) {
                    // Delta patch — need a base to reconstruct
                    let baseText = "";
                    const baseSlot = slots["1 week"];
                    if (baseSlot) {
                        try {
                            const baseRes = await apiFetch(`/api/v1/files/${fileId}/backups/${encodeURIComponent(baseSlot.slot_name)}`);
                            if (baseRes.ok) {
                                const baseData = await baseRes.json();
                                if (baseData.encrypted_blob) {
                                    baseText = await decryptBackupBlob(baseData, privateKey, myId);
                                }
                            }
                        } catch (bErr) {
                            console.warn("Failed to load 1 week base backup:", bErr);
                        }
                    }
                    // Fallback to currentContent if "1 week" base is not yet created
                    if (!baseText && currentContent) {
                        baseText = typeof currentContent === 'string' ? currentContent : JSON.stringify(currentContent);
                    }
                    if (!baseText) {
                        setErrorMsg("Basis-Backup (1 Woche) fehlt und aktueller Inhalt nicht geladen — Delta kann nicht rekonstruiert werden.");
                        setLoading(false);
                        return;
                    }
                    backupJsonStr = applyLinePatch(baseText, parsed);
                }
                // else: it's a full JSON copy, use as-is
            } catch {
                // Not valid JSON — use raw text as fallback
            }

            let backupJsonObj: Record<string, unknown> | null = null;
            try {
                backupJsonObj = JSON.parse(backupJsonStr);
            } catch (e) {
                console.warn("Rekonstruierte Notiz ist kein gültiges JSON", e);
                setErrorMsg("Die rekonstruierte Version ist beschädigt und kann nicht wiederhergestellt werden.");
                setLoading(false);
                return;
            }

            // Safety: don't offer restore for empty documents
            if (!backupJsonObj || (typeof backupJsonObj === 'object' && Object.keys(backupJsonObj).length === 0)) {
                setErrorMsg("Der rekonstruierte Stand ist leer und kann nicht wiederhergestellt werden.");
                setLoading(false);
                return;
            }

            setRestoredJson(backupJsonObj);

            // Extract plain text for both notes and calculate diff
            const currentPlainText = getPlainTextFromJSON(currentContent || {});
            const backupPlainText = getPlainTextFromJSON(backupJsonObj);

            // Compute word diff (visual highlights)
            const diffs = diffWords(backupPlainText, currentPlainText);
            setDiffChanges(diffs);

        } catch (err) {
            console.error("Backup decryption error:", err);
            const msg = err instanceof Error ? err.message : String(err);
            setErrorMsg(`Fehler beim Laden/Entschlüsseln: ${msg}`);
        } finally {
            setLoading(false);
        }
    };

    const doRestore = () => {
        if (restoredJson) {
            onRestore(restoredJson);
        }
    };

    return (
        <div 
            className="fixed inset-0 z-[150] flex items-center justify-center bg-[#111827]/20 animate-fade-in p-4"
            onClick={onCancel}
        >
            <div 
                className="bg-white dark:bg-[#18181b] rounded-[24px] shadow-[0px_24px_64px_rgba(17,24,39,0.16)] border border-[#e5e7eb] dark:border-zinc-800 max-w-5xl w-full max-h-[85vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                
                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-[#e5e7eb] dark:border-zinc-800 bg-[#f9fafb]/50 dark:bg-zinc-900/50">
                    <h2 className="text-lg font-bold text-[#111827] dark:text-[#f4f4f5] flex items-center gap-2">
                        <Clock className="text-[#111827] dark:text-[#f4f4f5]" size={20} /> Versionsverlauf & Backups
                    </h2>
                    <button 
                        onClick={onCancel} 
                        aria-label="Schließen"
                        className="h-[44px] w-[44px] rounded-[12px] bg-[#f9fafb] hover:bg-[#f3f4f6] dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-[#e5e7eb] dark:border-zinc-700 flex items-center justify-center text-[#111827] dark:text-zinc-200 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex flex-1 overflow-hidden">
                    
                    {/* Left Pane: Timeline of Slots */}
                    <div className="w-1/3 border-r border-[#e5e7eb] dark:border-zinc-800 overflow-y-auto p-4 bg-[#f9fafb]/20 dark:bg-zinc-900/10">
                        <h3 className="text-xs font-semibold text-[#596170] dark:text-zinc-400 uppercase tracking-wider mb-4 px-1">
                            Speicherpunkte
                        </h3>
                        <div className="space-y-2">
                            {orderedSlots.map(slotName => {
                                const slot = slots[slotName.trim()];
                                const isActive = selectedSlot?.trim() === slotName.trim();
                                
                                return (
                                    <button
                                        key={slotName}
                                        disabled={!slot}
                                        onClick={() => handleSelect(slotName)}
                                        className={`w-full text-left p-3.5 rounded-xl border transition-all flex flex-col gap-1 ${
                                            !slot 
                                                ? 'bg-[#f9fafb]/50 dark:bg-zinc-900/20 border-[#e5e7eb] dark:border-zinc-800/40 opacity-40 cursor-not-allowed'
                                                : isActive
                                                    ? 'bg-[#f9fafb] dark:bg-zinc-800/60 border-[#111827] dark:border-white ring-1 ring-[#111827]/20 dark:ring-white/20 text-[#111827] dark:text-white shadow-sm'
                                                    : 'bg-white dark:bg-zinc-900 border-[#e5e7eb] hover:border-[#d1d5db] dark:border-zinc-800 dark:hover:border-zinc-700 hover:bg-[#f9fafb] dark:hover:bg-zinc-800/40 cursor-pointer'
                                        }`}
                                    >
                                        <div className="flex justify-between items-center w-full">
                                            <span className={`font-semibold text-sm ${isActive ? 'text-[#111827] dark:text-white' : 'text-[#111827] dark:text-zinc-100'}`}>
                                                {getFriendlySlotName(slotName)}
                                            </span>
                                            {slot && (
                                                <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-1.5 py-0.5 rounded font-mono uppercase">
                                                    {slotName.trim() === '1 week' ? 'Full' : 'Delta'}
                                                </span>
                                            )}
                                        </div>
                                        {slot ? (
                                            <span className="text-xs text-[#596170] dark:text-zinc-400 flex items-center gap-1.5 mt-0.5">
                                                <Calendar size={12} />
                                                {new Date(slot.updated_at).toLocaleString()}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-[#596170] dark:text-zinc-500 italic mt-0.5">Keine Version</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right Pane: Diff View */}
                    <div className="w-2/3 overflow-hidden flex flex-col p-6 bg-white dark:bg-[#18181b]">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-xs font-semibold text-[#596170] dark:text-zinc-400 uppercase tracking-wider">
                                Versionsvergleich (Abweichungen)
                            </h3>
                            {diffChanges && (
                                <div className="flex gap-3 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Ergänzungen</span>
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Löschungen</span>
                                </div>
                            )}
                        </div>

                        <div className="flex-1 overflow-auto bg-[#f9fafb] dark:bg-zinc-900/50 rounded-xl border border-[#e5e7eb] dark:border-zinc-800 p-4 font-normal text-sm leading-relaxed text-[#111827] dark:text-zinc-200">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center h-full text-zinc-400">
                                    <div className="w-6 h-6 border-2 border-[#111827] dark:border-white border-t-transparent rounded-full animate-spin mb-3" />
                                    <span>Speicherstand wird geladen und entschlüsselt...</span>
                                </div>
                            ) : errorMsg ? (
                                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 p-2">
                                    <AlertCircle size={18} />
                                    <span>{errorMsg}</span>
                                </div>
                            ) : diffChanges ? (
                                <div className="whitespace-pre-wrap font-sans">
                                    {diffChanges.map((change, idx) => {
                                        if (change.type === 'added') {
                                            return (
                                                <span key={idx} className="bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-400 font-medium px-0.5 rounded border-b border-emerald-200 dark:border-emerald-900/30">
                                                    {change.text}
                                                </span>
                                            );
                                        } else if (change.type === 'removed') {
                                            return (
                                                <span key={idx} className="bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-400 line-through px-0.5 rounded border-b border-rose-200 dark:border-rose-900/30">
                                                    {change.text}
                                                </span>
                                            );
                                        }
                                        return <span key={idx}>{change.text}</span>;
                                    })}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-zinc-400 dark:text-zinc-500 italic">
                                    Wähle einen Speicherpunkt auf der linken Seite aus, um die Änderungen zur aktuellen Notiz anzuzeigen.
                                </div>
                            )}
                        </div>

                        {/* Action Bar */}
                        {!loading && restoredJson && (
                            <button
                                onClick={doRestore}
                                className="mt-4 w-full bg-[#111827] hover:bg-[#2c2c2c] text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 h-[44px] px-5 rounded-[8px] font-semibold text-[14px] flex justify-center items-center gap-2 transition-all active:scale-[0.98]"
                            >
                                <RotateCcw size={18} /> Diesen Stand wiederherstellen
                            </button>
                        )}
                    </div>

                </div>

            </div>
        </div>
    );
}
