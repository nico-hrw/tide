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
    /** Old canvas image (key wrapped for the owner's RSA key, `encryptedKey` on the element) read via the V1 path. */
    legacy?: boolean;
}

/** An image that could be decrypted but that no note references any more; kept in the archive, not imported. */
export interface VaultUnassignedAsset {
    assetId: string;
    mimeType: string;
    path: string;
    byteLength: number;
    /** File the asset hangs under on the server (usually the note it was uploaded into). */
    parentId: string | null;
    parentTitle: string;
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
    /** The encrypted `secured_meta` as stored, kept when it could not be decrypted (nothing is thrown away). */
    securedMetaRaw?: string;
    /** Decrypted file blob (editor JSON, event body ...) stored as UTF-8 text. */
    contentPath?: string;
    /** Content exactly as the server/decryption returned it when it is not editor JSON (Markdown, plain text). */
    rawContentPath?: string;
    /** `helper`: app-internal file (old canvas style sidecar); `helperFor` names the note it belongs to. */
    role?: 'helper';
    helperFor?: string;
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

/**
 * `loss`: something is really missing from the archive. `partial`: the item is in the archive, an extra detail
 * is missing or kept only in raw/encrypted form. `info`: nothing is missing, the entry explains a special case.
 */
export type VaultIssueSeverity = 'loss' | 'partial' | 'info';

export type VaultIssueKind =
    | 'content-unreadable'
    | 'no-access-key'
    | 'custom-password'
    | 'v1-unreadable'
    | 'ydoc-unreadable'
    | 'asset-missing'
    | 'asset-unreadable'
    | 'event-details-unreadable'
    | 'meta-unreadable'
    | 'raw-text'
    | 'plaintext-event'
    | 'plaintext-note'
    | 'helper-file'
    | 'legacy-format'
    | 'unassigned-asset'
    | 'orphan-asset';

export interface VaultFailure {
    id: string;
    type: string;
    title: string;
    /** What could not be read: content | ydoc | asset | meta */
    part: string;
    error: string;
    /** Set by exports since the issue report; older archives only have part/error. */
    kind?: VaultIssueKind;
    severity?: VaultIssueSeverity;
}

export interface VaultIssue extends VaultFailure {
    kind: VaultIssueKind;
    severity: VaultIssueSeverity;
}

/** One line of the report: all issues of one cause, counted per file type, with a few readable titles. */
export interface VaultIssueSummary {
    kind: VaultIssueKind;
    severity: VaultIssueSeverity;
    count: number;
    byType: Record<string, number>;
    examples: string[];
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
    /** Real gaps only (severity `loss`). Older archives list every problem here. */
    failures: VaultFailure[];
    /** In the archive, but an extra detail is missing or only kept raw (severity `partial`). */
    warnings?: VaultIssue[];
    /** Special cases without any loss (severity `info`). */
    notices?: VaultIssue[];
    /** All issues grouped by cause, worst first (also written as lesbar/PROBLEME.txt). */
    summary?: VaultIssueSummary[];
    /** Decryptable images that no note references any more. */
    unassignedAssets?: VaultUnassignedAsset[];
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
