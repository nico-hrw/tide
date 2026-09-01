import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { useDataStore } from '../store/useDataStore';
import { decryptMetadata, decryptFile } from '../lib/crypto';
import { unwrapDEKData, importDEK } from '../lib/cryptoV2';
import { Clock, RotateCcw, Calendar, Check, AlertCircle } from 'lucide-react';
import { diffWords, applyLinePatch, getPlainTextFromJSON } from '../lib/diff';

interface BackupSlot {
    id: string;
    file_id: string;
    slot_name: string;
    secured_meta?: string;
    access_keys?: any;
    version?: number;
    updated_at: string;
    encrypted_blob?: string;
}

interface BackupHistoryProps {
    fileId: string;
    currentContent: any;
    onRestore: (content: any) => void;
    onCancel: () => void;
}

export default function BackupHistory({ fileId, currentContent, onRestore, onCancel }: BackupHistoryProps) {
    const [slots, setSlots] = useState<Record<string, BackupSlot>>({});
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
    const [diffChanges, setDiffChanges] = useState<{ type: 'added' | 'removed' | 'equal', text: string }[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [restoredJson, setRestoredJson] = useState<any>(null);

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

    useEffect(() => {
        apiFetch(`/api/v1/files/${fileId}/backups`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    const slotMap: Record<string, BackupSlot> = {};
                    for (const s of data) {
                        slotMap[s.slot_name.trim()] = s;
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
                ? JSON.parse(backupData.access_keys)
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
            const bRes = await apiFetch(`/api/v1/files/${fileId}/backups/${slot.slot_name}`);
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
                    // Delta patch — need the "1 week" base to reconstruct
                    const baseSlot = slots["1 week"];
                    if (!baseSlot) {
                        setErrorMsg("Basis-Backup (1 Woche) fehlt — Delta kann nicht rekonstruiert werden.");
                        setLoading(false);
                        return;
                    }
                    const baseRes = await apiFetch(`/api/v1/files/${fileId}/backups/${baseSlot.slot_name}`);
                    const baseData = await baseRes.json();
                    if (!baseData.encrypted_blob) {
                        setErrorMsg("Basis-Backup (1 Woche) ist leer — Delta kann nicht rekonstruiert werden.");
                        setLoading(false);
                        return;
                    }
                    const baseText = await decryptBackupBlob(baseData, privateKey, myId);
                    backupJsonStr = applyLinePatch(baseText, parsed);
                }
                // else: it's a full JSON copy, use as-is
            } catch (_) {
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
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-gray-200 dark:border-slate-800">
                
                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <Clock className="text-violet-500" size={20} /> Versionsverlauf & Backups
                    </h2>
                    <button 
                        onClick={onCancel} 
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className="flex flex-1 overflow-hidden">
                    
                    {/* Left Pane: Timeline of Slots */}
                    <div className="w-1/3 border-r border-gray-100 dark:border-slate-800 overflow-y-auto p-4 bg-gray-50/20 dark:bg-slate-900/10">
                        <h3 className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-4 px-1">
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
                                                ? 'bg-gray-50/50 dark:bg-slate-900/20 border-gray-100 dark:border-slate-800/40 opacity-40 cursor-not-allowed'
                                                : isActive
                                                    ? 'bg-violet-50/70 border-violet-300 dark:bg-violet-950/20 dark:border-violet-800 shadow-sm ring-1 ring-violet-200 dark:ring-violet-900/50'
                                                    : 'bg-white dark:bg-slate-900 border-gray-200 hover:border-gray-300 dark:border-slate-800 dark:hover:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800/40 cursor-pointer'
                                        }`}
                                    >
                                        <div className="flex justify-between items-center w-full">
                                            <span className={`font-semibold text-sm ${isActive ? 'text-violet-600 dark:text-violet-400' : 'text-gray-900 dark:text-gray-100'}`}>
                                                {getFriendlySlotName(slotName)}
                                            </span>
                                            {slot && <span className="text-[10px] bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 px-1.5 py-0.5 rounded font-mono uppercase">{slotName.trim() === '1 week' ? 'Full' : 'Delta'}</span>}
                                        </div>
                                        {slot ? (
                                            <span className="text-xs text-gray-400 dark:text-slate-500 flex items-center gap-1.5 mt-0.5">
                                                <Calendar size={12} />
                                                {new Date(slot.updated_at).toLocaleString()}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-gray-400 dark:text-slate-500 italic mt-0.5">Keine Version</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right Pane: Diff View */}
                    <div className="w-2/3 overflow-hidden flex flex-col p-6 bg-white dark:bg-slate-900">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                                Versionsvergleich (Abweichungen)
                            </h3>
                            {diffChanges && (
                                <div className="flex gap-3 text-[11px] font-medium">
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Ergänzungen</span>
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Löschungen</span>
                                </div>
                            )}
                        </div>

                        <div className="flex-1 overflow-auto bg-gray-50 dark:bg-slate-900/50 rounded-xl border border-gray-100 dark:border-slate-850 p-4 font-normal text-sm leading-relaxed text-gray-700 dark:text-slate-300">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                    <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mb-3" />
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
                                <div className="flex flex-col items-center justify-center h-full text-gray-400 italic">
                                    Wähle einen Speicherpunkt auf der linken Seite aus, um die Änderungen zur aktuellen Notiz anzuzeigen.
                                </div>
                            )}
                        </div>

                        {/* Action Bar */}
                        {!loading && restoredJson && (
                            <button
                                onClick={doRestore}
                                className="mt-4 w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3 rounded-xl flex justify-center items-center gap-2 transition-transform active:scale-[0.98] shadow-lg shadow-violet-500/10 active:shadow-sm"
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
