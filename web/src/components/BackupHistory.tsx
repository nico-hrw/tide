import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { useDataStore } from '../store/useDataStore';
import { decryptMetadata, decryptFile, base64ToArrayBuffer } from '../lib/crypto';
import { unwrapDEKData, importDEK } from '../lib/cryptoV2';
import { Clock, RotateCcw } from 'lucide-react';
import Editor from './Editor';

interface BackupSlot {
    id: string;
    file_id: string;
    slot_name: string;
    secured_meta?: string;
    access_keys?: any;
    version?: number;
    updated_at: string;
}

export default function BackupHistory({ fileId, onRestore, onCancel }: { fileId: string, onRestore: (content: any) => void, onCancel: () => void }) {
    const [slots, setSlots] = useState<BackupSlot[]>([]);
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
    const [decryptedText, setDecryptedText] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        apiFetch(`/api/v1/files/${fileId}/backups`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    // Accept slots with secured_meta (V1/V2) or access_keys (V2)
                    const validSlots = data.filter(s => !!s.secured_meta || !!s.access_keys);
                    setSlots(validSlots.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()));
                }
            })
            .catch(console.error);
    }, [fileId]);

    const handleSelect = async (slotName: string) => {
        setSelectedSlot(slotName);
        setLoading(true);
        setDecryptedText(null);
        try {
            const bRes = await apiFetch(`/api/v1/files/${fileId}/backups/${slotName}`);
            const backupData = await bRes.json();

            const { privateKey, myId } = useDataStore.getState();
            if (!privateKey) throw new Error("No private key");

            if (!backupData.encrypted_blob) {
                setDecryptedText("Noch kein Backup für diesen Zeitraum vorhanden.");
                setLoading(false);
                return;
            }

            // Decode the base64 blob
            const binaryString = atob(backupData.encrypted_blob);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

            const isV2 = (backupData.version ?? 1) >= 2 || !!backupData.access_keys;

            let text = "";

            if (isV2) {
                // V2: unwrap DEK from access_keys, then AES-GCM decrypt
                if (!myId) throw new Error("User ID not available");

                const accessKeys = typeof backupData.access_keys === 'string'
                    ? JSON.parse(backupData.access_keys)
                    : (backupData.access_keys || {});

                const myAccess = accessKeys?.[myId];
                if (!myAccess?.wrapped_key) throw new Error("Kein Zugriffsschlüssel für dieses Backup gefunden.");

                const rawDek = await unwrapDEKData(myAccess.wrapped_key, privateKey);
                const dek = await importDEK(rawDek);

                // The blob is a JSON string { data: base64, iv: base64 }
                const blobText = new TextDecoder().decode(bytes);
                const payload = JSON.parse(blobText);
                const ivBuf = base64ToArrayBuffer(payload.iv);
                const dataBuf = base64ToArrayBuffer(payload.data);

                const decrypted = await window.crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv: ivBuf },
                    dek,
                    dataBuf
                );
                text = new TextDecoder().decode(decrypted);
            } else {
                // V1: fileKey stored in RSA-encrypted secured_meta
                if (!backupData.secured_meta) throw new Error("Metadata fehlt im Backup.");

                const meta = await decryptMetadata(backupData.secured_meta, privateKey, `backup-${fileId}`);
                if (meta.isLocked) throw new Error("Backup-Metadaten konnten nicht entschlüsselt werden.");

                const fileKey = await window.crypto.subtle.importKey(
                    "jwk", meta.fileKey as JsonWebKey, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]
                );

                const blob = new Blob([bytes]);
                const decryptedBlob = await decryptFile(blob, meta.iv as string, fileKey, fileId);
                text = await decryptedBlob.text();
            }

            setDecryptedText(text);
        } catch (err) {
            console.error("Backup decryption error:", err);
            const msg = err instanceof Error ? err.message : String(err);
            setDecryptedText(`Fehler beim Entschlüsseln: ${msg}`);
        } finally {
            setLoading(false);
        }
    };

    const doRestore = () => {
        if (decryptedText) {
            try {
                const json = JSON.parse(decryptedText);
                onRestore(json);
            } catch (e) {
                onRestore(decryptedText);
            }
        }
    };

    const canRestore = decryptedText && !decryptedText.startsWith('Fehler') && !decryptedText.startsWith('Noch kein');

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col">
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h2 className="text-xl font-bold flex items-center gap-2"><Clock /> Versionsverlauf</h2>
                    <button onClick={onCancel} className="text-gray-500 hover:text-gray-700 font-bold p-2">X</button>
                </div>

                <div className="flex gap-4 h-full min-h-[400px]">
                    <div className="w-1/3 border-r pr-4">
                        <h3 className="font-semibold mb-2 text-sm text-gray-500 uppercase tracking-wider">Verfügbare Slots</h3>
                        {slots.length === 0 && <p className="text-sm text-gray-500">Keine Backups gefunden.</p>}
                        <div className="flex flex-col gap-2">
                            {slots.map(s => (
                                <button
                                    key={s.slot_name}
                                    onClick={() => handleSelect(s.slot_name)}
                                    className={`p-3 text-left rounded-lg border transition-all ${selectedSlot === s.slot_name ? 'bg-indigo-50 border-indigo-300 dark:bg-indigo-900/30 shadow-sm' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                                >
                                    <div className="font-bold flex justify-between">
                                        <span>{s.slot_name}</span>
                                        {(s.version ?? 1) >= 2 && <span className="text-xs text-indigo-400 font-normal">V2</span>}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">{new Date(s.updated_at).toLocaleString()}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="w-2/3 overflow-hidden flex flex-col">
                        <h3 className="font-semibold mb-2 text-sm text-gray-500 uppercase tracking-wider">Vorschau</h3>
                        {loading && <p className="text-gray-500 animate-pulse">Lade & Entschlüssele...</p>}
                        {!loading && decryptedText && (
                            <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 rounded-xl text-sm border border-gray-100 dark:border-gray-800">
                                {(() => {
                                    if (decryptedText.startsWith('Fehler') || decryptedText.startsWith('Noch kein')) {
                                        return <div className="p-4 text-amber-600 dark:text-amber-400">{decryptedText}</div>;
                                    }
                                    try {
                                        const parsed = JSON.parse(decryptedText);
                                        return <Editor initialContent={parsed} editable={false} />;
                                    } catch (e) {
                                        return <div className="p-4 whitespace-pre-wrap font-mono">{decryptedText}</div>;
                                    }
                                })()}
                            </div>
                        )}
                        {!loading && canRestore && (
                            <button
                                onClick={doRestore}
                                className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl flex justify-center items-center gap-2 transition-transform active:scale-95 shadow-md"
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
