// web/src/components/Canvas/useCanvasImageUpload.ts
"use client";

import { useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import * as cryptoLib from '@/lib/crypto';

export interface UploadedImage {
    id: string;
    type: 'image';
    blobId: string;
    encryptedKey: string;
    iv: string;
    mimeType: string;
    width: number;
}

export function useCanvasImageUpload(
    publicKey: CryptoKey | null,
    userId: string,
    imageBlobCache: React.MutableRefObject<Map<string, string>>,
) {
    const upload = useCallback(async (
        file: File,
        onStart: (placeholderId: string) => void,
        onDone: (placeholderId: string, result: UploadedImage) => void,
        onError: (placeholderId: string) => void,
    ) => {
        if (!publicKey || !userId) return;

        const placeholderId = crypto.randomUUID();
        onStart(placeholderId);

        try {
            const fileKey = await cryptoLib.generateFileKey();
            const fileKeyJwk = await window.crypto.subtle.exportKey('jwk', fileKey);
            const { iv, ciphertext } = await cryptoLib.encryptFile(file, fileKey);
            const encryptedMeta = await cryptoLib.encryptMetadata(
                { title: `.canvas-img-${placeholderId}`, fileKey: fileKeyJwk, iv },
                publicKey
            );

            const createRes = await apiFetch('/api/v1/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'canvas-asset',
                    size: ciphertext.size,
                    public_meta: {},
                    secured_meta: encryptedMeta,
                    visibility: 'private',
                }),
            });
            if (!createRes.ok) throw new Error('Failed to create image record');
            const newFile = await createRes.json() as { id: string };
            await apiFetch(`/api/v1/files/${newFile.id}/upload`, { method: 'POST', body: ciphertext });

            const result: UploadedImage = {
                id: crypto.randomUUID(),
                type: 'image',
                blobId: newFile.id,
                encryptedKey: encryptedMeta,
                iv,
                mimeType: file.type,
                width: 300,
            };
            onDone(placeholderId, result);
        } catch (err) {
            console.error('[Canvas] Image upload failed:', err);
            onError(placeholderId);
        }
    }, [publicKey, userId]);

    return { upload };
}
