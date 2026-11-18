// Encrypted image assets for notes.
//
// One path for every image: the blob is encrypted with a fresh per-image key (BEK) and stored as a
// child file of the note (`parent_file_id`), which is what lets collaborators download it. The BEK
// and IV are returned to the caller and live inside the note's encrypted sidecar, so everyone who
// can read the note can also open its images. No key is ever wrapped for a single user.

import { apiFetch } from '@/lib/api';
import { decryptAssetWithBEK, encryptAssetWithNewBEK } from '@/lib/assetCrypto';

export interface StoredImageAsset {
    /** File id of the encrypted blob. */
    assetId: string;
    bekBase64: string;
    ivBase64: string;
    mimeType: string;
}

const RETRIES = 3;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs `step` up to RETRIES times with a growing pause; throws the last error. */
async function withRetry<T>(label: string, step: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < RETRIES; attempt++) {
        try {
            return await step();
        } catch (err) {
            lastError = err;
            await wait(400 * (attempt + 1));
        }
    }
    throw new Error(`${label}: ${lastError instanceof Error ? lastError.message : 'failed'}`);
}

async function expectOk(res: Response, what: string): Promise<Response> {
    if (!res.ok) throw new Error(`${what} (HTTP ${res.status})`);
    return res;
}

/** Encrypts and uploads an image for a note. Throws if the image could not be stored. */
export async function storeNoteImage(noteId: string, file: Blob): Promise<StoredImageAsset> {
    const { encryptedBlob, bekBase64, ivBase64, mimeType } = await encryptAssetWithNewBEK(file);
    const assetId = crypto.randomUUID();

    await withRetry('Bild anlegen', async () => {
        const res = await apiFetch('/api/v1/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: assetId,
                type: 'canvas-asset',
                parent_id: noteId,
                parent_file_id: noteId, // access for collaborators is derived from this link
                size: encryptedBlob.size,
                public_meta: {},
                secured_meta: '',
                visibility: 'private',
            }),
        });
        // A repeated attempt may find the record from the previous one.
        if (res.status !== 409) await expectOk(res, 'Bild anlegen');
    });

    await withRetry('Bild hochladen', async () => {
        const res = await apiFetch(`/api/v1/files/${assetId}/upload?parent_file_id=${encodeURIComponent(noteId)}`, {
            method: 'POST',
            body: encryptedBlob,
        });
        await expectOk(res, 'Bild hochladen');
    });

    return { assetId, bekBase64, ivBase64, mimeType };
}

const objectUrls = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

/** Downloads and decrypts an image asset; results are cached per asset, concurrent calls share one download. */
export function loadNoteImage(asset: StoredImageAsset): Promise<string> {
    const cached = objectUrls.get(asset.assetId);
    if (cached) return Promise.resolve(cached);
    const running = inflight.get(asset.assetId);
    if (running) return running;

    const job = withRetry('Bild laden', async () => {
        const res = await expectOk(await apiFetch(`/api/v1/files/${asset.assetId}/download`), 'Bild laden');
        const blob = await decryptAssetWithBEK(await res.arrayBuffer(), asset.bekBase64, asset.ivBase64, asset.mimeType);
        const url = URL.createObjectURL(blob);
        objectUrls.set(asset.assetId, url);
        return url;
    }).finally(() => inflight.delete(asset.assetId));

    inflight.set(asset.assetId, job);
    return job;
}
