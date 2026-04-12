import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { useDataStore } from '../store/useDataStore';
import { decryptMetadata, decryptFile } from '../lib/crypto';
import { Clock, RotateCcw } from 'lucide-react';
import Editor from './Editor';

interface BackupSlot {
    id: string;
    file_id: string;
    slot_name: string;
    secured_meta?: string; // Base64 encoded secured_meta
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
                if(Array.isArray(data)) {
                    // Filter out legacy backups that don't have secured_meta
                    const validSlots = data.filter(s => !!s.secured_meta);
                    setSlots(validSlots.sort((a,b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()));
                }
            })
            .catch(console.error);
    }, [fileId]);

    const handleSelect = async (slotName: string) => {
        setSelectedSlot(slotName);
        setLoading(true);
        try {
            const bRes = await apiFetch(`/api/v1/files/${fileId}/backups/${slotName}`);
            const backupData = await bRes.json();
            
            const { privateKey } = useDataStore.getState();
            if(!privateKey) throw new Error("No private key");

            if (!backupData.secured_meta) {
                throw new Error("Missing metadata in backup");
            }

            // Decrypt metadata from the BACKUP to get the CORRECT fileKey and IV for this blob
            const meta = await decryptMetadata(backupData.secured_meta, privateKey, `backup-${fileId}`);
            
            // Import file key
            const fileKey = await window.crypto.subtle.importKey(
                "jwk", meta.fileKey as JsonWebKey, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]
            );

            // Fetch the backup blob
            if (!backupData.encrypted_blob) {
                setDecryptedText("Noch kein Backup für diesen Zeitraum vorhanden.");
                setLoading(false);
                return;
            }

            // In Go, EncryptedBlob is []byte, so json encode makes it base64 string
            const binaryString = atob(backupData.encrypted_blob);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const blob = new Blob([bytes]);

            // Decrypt file blob
            const decryptedBlob = await decryptFile(blob, meta.iv as string, fileKey, fileId);

            const text = await decryptedBlob.text();
            setDecryptedText(text);
        } catch (err) {
            console.error("Backup dec err", err);
            setDecryptedText("Error decrypting backup");
        } finally {
            setLoading(false);
        }
    };

    const doRestore = () => {
        if(decryptedText) {
            try {
                const json = JSON.parse(decryptedText);
                onRestore(json);
            } catch(e) {
                // If it is raw string
                onRestore(decryptedText);
            }
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col">
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h2 className="text-xl font-bold flex items-center gap-2"><Clock /> Versionsverlauf / Backups</h2>
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
                                        <span>Slot: {s.slot_name}</span>
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
                            <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 rounded-xl text-sm border border-gray-100 dark:border-gray-800 pointer-events-none">
                                {(() => {
                                    try {
                                        const parsed = JSON.parse(decryptedText);
                                        return <Editor initialContent={parsed} editable={false} />;
                                    } catch (e) {
                                        return <div className="p-4 whitespace-pre-wrap font-mono">{decryptedText}</div>;
                                    }
                                })()}
                            </div>
                        )}
                        {!loading && decryptedText && (
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
