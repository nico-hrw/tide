import { apiFetch } from '@/lib/api';
import { decryptAssetWithBEK, encryptAssetWithNewBEK } from '@/lib/assetCrypto';
import { encryptMetadata } from '@/lib/crypto';
import { previewMimeOf } from '@/lib/fileKinds';
import type { DataItem } from '@/store/slices/types';

/**
 * Files as items of their own in the notes tree (type 'file'). Each file is encrypted with its own AES key (BEK),
 * the same way note images are. The BEK, IV and MIME type travel inside the item's RSA-encrypted `secured_meta`,
 * never in plain metadata, so the server only sees an encrypted blob and its size.
 *
 * Stage 1: owner only. Sharing comes later and will wrap the key for each recipient.
 */

export interface NoteFileSecured {
    title: string;
    bek: string;
    iv: string;
    mime: string;
}

export interface UploadFileOptions {
    publicKey: CryptoKey;
    parentId: string | null;
    safe: string;
}

/** Encrypts `file`, creates its item and uploads the ciphertext. Removes the item again if the upload fails. */
export async function uploadStoredFile(file: File, opts: UploadFileOptions): Promise<DataItem> {
    const mime = file.type || previewMimeOf(file.name);
    const { encryptedBlob, bekBase64, ivBase64 } = await encryptAssetWithNewBEK(file);
    // The RSA block holds ~400 bytes: long names are cut, the full name stays readable as the title.
    const title = file.name.slice(0, 200);
    const secured: NoteFileSecured = { title, bek: bekBase64, iv: ivBase64, mime };
    const securedMeta = await encryptMetadata(secured as unknown as Record<string, unknown>, opts.publicKey, 'file');

    const created = await apiFetch('/api/v1/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            type: 'file',
            parent_id: opts.parentId,
            size: encryptedBlob.size,
            public_meta: {},
            secured_meta: securedMeta,
            visibility: 'private',
        }),
    });
    if (!created.ok) throw new Error(`Datei anlegen fehlgeschlagen (HTTP ${created.status})`);
    const { id } = (await created.json()) as { id: string };

    const uploaded = await apiFetch(`/api/v1/files/${encodeURIComponent(id)}/upload`, {
        method: 'POST',
        body: encryptedBlob,
    });
    if (!uploaded.ok) {
        // Do not leave an item without content behind
        await apiFetch(`/api/v1/files/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => undefined);
        throw new Error(`Datei hochladen fehlgeschlagen (HTTP ${uploaded.status})`);
    }

    return {
        id,
        title,
        type: 'file',
        parent_id: opts.parentId,
        safe: opts.safe,
        size: file.size,
        bek: bekBase64,
        iv: ivBase64,
        mime,
    } as DataItem;
}

/** Downloads and decrypts a stored file. Throws when the item has no key yet (still locked or not loaded). */
export async function downloadStoredFile(item: DataItem): Promise<Blob> {
    const bek = typeof item.bek === 'string' ? item.bek : '';
    const iv = typeof item.iv === 'string' ? item.iv : '';
    const mime = typeof item.mime === 'string' ? item.mime : 'application/octet-stream';
    if (!bek || !iv) throw new Error('Datei ist noch nicht entschlüsselt.');

    const res = await apiFetch(`/api/v1/files/${encodeURIComponent(item.id)}/download`);
    if (!res.ok) throw new Error(`Datei laden fehlgeschlagen (HTTP ${res.status})`);
    return decryptAssetWithBEK(await res.arrayBuffer(), bek, iv, mime);
}
