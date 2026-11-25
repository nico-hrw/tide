// Format of the full-vault export ("tide-vault-export", version 1).
//
// The archive is built so an importer never has to guess: every file keeps its old id, parent and raw
// metadata, and every cross-reference (parent, tag ids, linked notes, assets) can be rewritten through
// an old-id -> new-id table.

export const VAULT_EXPORT_FORMAT = 'tide-vault-export';
export const VAULT_EXPORT_VERSION = 1;

export interface VaultAssetRecord {
    assetId: string;
    mimeType: string;
    /** Path of the decrypted original inside the archive. */
    path: string;
    byteLength: number;
}

export interface VaultFileRecord {
    id: string;
    /** note | folder | event | canvas | ... (server file type) */
    type: string;
    title: string;
    parentId: string | null;
    visibility: string;
    createdAt?: string;
    updatedAt?: string;
    /** Plaintext metadata as stored by the server. */
    publicMeta: Record<string, unknown>;
    /** `metadata` object of the file (title, safe, tagIds, colour ...). */
    metadata: Record<string, unknown>;
    /** Decrypted `secured_meta`, or null when it was empty or unreadable. */
    securedMeta: Record<string, unknown> | null;
    /** Decrypted file blob (editor JSON, event body ...) stored as UTF-8 text. */
    contentPath?: string;
    /** Decrypted Yjs document state (images, overlay, canvas layout live here). */
    ydocPath?: string;
    assets: VaultAssetRecord[];
}

export interface VaultSkipped {
    id: string;
    type: string;
    title: string;
    reason: string;
}

export interface VaultFailure {
    id: string;
    type: string;
    title: string;
    /** What could not be read: content | ydoc | asset | meta */
    part: string;
    error: string;
}

export interface VaultManifest {
    format: typeof VAULT_EXPORT_FORMAT;
    version: typeof VAULT_EXPORT_VERSION;
    exportedAt: string;
    userId: string;
    /** Number of exported files per server file type. */
    counts: Record<string, number>;
    assetCount: number;
    taskCount: number;
    skipped: VaultSkipped[];
    failures: VaultFailure[];
    /** Plain text in the archive: the importer and the UI must say so. */
    containsPlaintext: true;
}

export interface VaultTree {
    files: VaultFileRecord[];
}

export interface VaultExportResult {
    blob: Blob;
    filename: string;
    manifest: VaultManifest;
}

export type VaultExportPhase = 'listing' | 'reading' | 'packing' | 'done';

export interface VaultExportProgress {
    phase: VaultExportPhase;
    current: number;
    total: number;
}
