// web/src/components/Canvas/useCanvasImageUpload.ts
"use client";

import { useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { encryptAssetWithNewBEK } from '@/lib/assetCrypto';
import { useActiveNoteStore } from '@/store/activeNoteStore';
import * as Y from 'yjs';

export interface AssetKeyRecord {
    assetId: string;
    bekBase64: string;
    ivBase64: string;
    mimeType: string;
}

export interface UploadedImage {
    id: string;
    type: 'image';
    assetId: string;
    blobId?: string;
    width: number;
}

export function useCanvasImageUpload(
    noteId: string,
    ydocOrPublicKey?: Y.Doc | CryptoKey | null,
    ..._rest: unknown[]
) {
    void _rest;
    const upload = useCallback(async (
        file: File,
        onStart: (placeholderId: string) => void,
        onDone: (placeholderId: string, result: UploadedImage) => void,
        onError: (placeholderId: string) => void,
        customYdoc?: Y.Doc | null,
    ) => {
        const placeholderId = crypto.randomUUID();
        onStart(placeholderId);

        try {
            // 1. Encrypt image blob with BEK (Fix BUG-18 RSA crash & BUG-19 plaintext key leak)
            const { encryptedBlob, bekBase64, ivBase64, mimeType } = await encryptAssetWithNewBEK(file);
            const assetId = crypto.randomUUID();

            // 2. Upload ciphertext blob to POST /api/files/${noteId}/attachments (parent_file_id = noteId)
            let uploaded = false;
            try {
                const res = await apiFetch(`/api/files/${encodeURIComponent(noteId)}/attachments?parent_file_id=${encodeURIComponent(noteId)}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/octet-stream',
                        'X-Asset-ID': assetId,
                        'X-Mime-Type': mimeType,
                    },
                    body: encryptedBlob,
                });
                if (res.ok) uploaded = true;
            } catch {
                // Fallback to next variant
            }

            if (!uploaded) {
                try {
                    const res = await apiFetch(`/api/v1/files/${encodeURIComponent(noteId)}/attachments?parent_file_id=${encodeURIComponent(noteId)}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/octet-stream',
                            'X-Asset-ID': assetId,
                            'X-Mime-Type': mimeType,
                        },
                        body: encryptedBlob,
                    });
                    if (res.ok) uploaded = true;
                } catch {
                    // Fallback to next variant
                }
            }

            if (!uploaded) {
                // Fallback to creating a canvas-asset child file and uploading the blob
                const createRes = await apiFetch('/api/v1/files', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: assetId,
                        type: 'canvas-asset',
                        parent_id: noteId,
                        parent_file_id: noteId,
                        size: encryptedBlob.size,
                        public_meta: {},
                        secured_meta: '',
                        visibility: 'private',
                    }),
                });
                if (createRes.ok) {
                    const newFile = await createRes.json() as { id?: string };
                    const actualId = newFile.id || assetId;
                    await apiFetch(`/api/v1/files/${actualId}/upload?parent_file_id=${encodeURIComponent(noteId)}`, {
                        method: 'POST',
                        body: encryptedBlob,
                    });
                    uploaded = true;
                }
            }

            // 3. Resolve active Y.Doc and store record in ydoc.getMap('assets')
            const isYDoc = ydocOrPublicKey instanceof Y.Doc;
            const effectiveDoc = customYdoc ??
                (isYDoc ? ydocOrPublicKey : null) ??
                useActiveNoteStore.getState().activeYDoc;

            const record: AssetKeyRecord = {
                assetId,
                bekBase64,
                ivBase64,
                mimeType,
            };

            if (effectiveDoc) {
                const assetsMap = effectiveDoc.getMap<AssetKeyRecord>('assets');
                assetsMap.set(assetId, record);
            }

            // 4. Return result with only assetId (no plaintext key, no RSA key)
            const result: UploadedImage = {
                id: crypto.randomUUID(),
                type: 'image',
                assetId,
                blobId: assetId,
                width: 300,
            };

            onDone(placeholderId, result);
        } catch (err: unknown) {
            console.error('[Canvas] Image upload failed:', err);
            onError(placeholderId);
        }
    }, [noteId, ydocOrPublicKey]);

    return { upload };
}
