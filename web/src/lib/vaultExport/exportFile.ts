// Reads one owned file for the vault export along the same paths the app uses to open it:
// plaintext (public / `unencrypted`), V1 (file key in RSA secured_meta) or V2 (DEK in access_keys).
// Every problem is logged with a cause; nothing that could be read is thrown away.

import * as Y from 'yjs';
import { markdownToTipTap } from '@/lib/bundleImportExport';
import type { ZipEntry } from './zip';
import { IssueLog, describeError } from './issues';
import {
    ContentMissingError,
    NotEnvelopeError,
    VaultReadError,
    collectAssetRefs,
    collectLegacyImageRefsFromDoc,
    diagnoseSecuredMeta,
    isPlaintextFile,
    parseAccessKeys,
    plaintextDocKey,
    readAsset,
    readContentText,
    readRawText,
    readSecuredMeta,
    readV1,
    readYDoc,
    unwrapFileDek,
    type LegacyImageRef,
    type V1Content,
} from './readFile';
import type { VaultFileRecord, VaultIssueKind } from './types';

export interface RawFile {
    id: string;
    type: string;
    owner_id?: string;
    parent_id?: string | null;
    version?: number;
    visibility?: string;
    created_at?: string;
    updated_at?: string;
    public_meta?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
    secured_meta?: string | null;
    access_keys?: unknown;
}

export interface ExportContext {
    privateKey: CryptoKey;
    myId: string;
    entries: ZipEntry[];
    issues: IssueLog;
    /** Text used for the readable copies (Markdown for plaintext notes, JSON otherwise). */
    readable: Map<string, string>;
    exportedAssets: Set<string>;
    /** Old image elements per note id, exported after all files are read. */
    legacyRefs: Map<string, LegacyImageRef[]>;
    /** Every file the server listed (also foreign ones), to explain image errors. */
    listed: Map<string, RawFile>;
}

/** An old `.canvas-img-*` file that turned out to be an image: handled as an asset, not as a note. */
export interface LegacyImageFile {
    file: RawFile;
}

export const EXT: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif',
    'image/bmp': 'bmp', 'image/svg+xml': 'svg', 'application/pdf': 'pdf', 'video/mp4': 'mp4', 'audio/mpeg': 'mp3',
};
const WITH_YDOC = new Set(['note', 'canvas']);
const NO_BODY = new Set(['folder']);
const STYLE_SIDECAR = /^\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_style$/i;
const LEGACY_IMAGE_TITLE = /^\.canvas-img-/;
const encoder = new TextEncoder();
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function parseJsonObject(text: string): Record<string, unknown> | null {
    const t = text.trim();
    if (!t.startsWith('{') && !t.startsWith('[')) return null;
    try {
        const v = JSON.parse(t) as unknown;
        return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

/** Stores the content; non-JSON text is kept raw and, for notes, converted like the app opens plaintext notes. */
function storeContent(record: VaultFileRecord, text: string, ctx: ExportContext, expectedPlain: boolean): void {
    const id = record.id;
    // Any JSON object stays as it is (editor documents, old canvas JSON, event bodies, sidecars).
    const json = parseJsonObject(text);
    const isNote = record.type === 'note' && record.role !== 'helper';
    if (json) {
        record.contentPath = `content/${id}.json`;
        ctx.entries.push({ path: record.contentPath, data: encoder.encode(text) });
        ctx.readable.set(id, text);
        return;
    }
    record.rawContentPath = `content/${id}.txt`;
    ctx.entries.push({ path: record.rawContentPath, data: encoder.encode(text) });
    if (isNote) {
        // Same conversion as parseUnencryptedNoteContent: the note keeps opening as an editor document.
        record.contentPath = `content/${id}.json`;
        ctx.entries.push({ path: record.contentPath, data: encoder.encode(JSON.stringify(markdownToTipTap(text))) });
        ctx.readable.set(id, `md:${text}`);
    }
    if (!expectedPlain) {
        const start = JSON.stringify(text.slice(0, 20));
        ctx.issues.add('raw-text', record, 'content', `Kein Editor-JSON (beginnt mit ${start}); als ${record.rawContentPath} aufbewahrt${isNote ? ' und als Text-Notiz umgewandelt' : ''}`);
    }
}

function stripV1Keys(meta: Record<string, unknown>): Record<string, unknown> {
    const rest = { ...meta };
    for (const k of ['fileKey', 'iv', 'isLocked']) delete rest[k];
    return rest;
}

/** Reads one file. An old image stored as a V1 file (`.canvas-img-*`) comes back as LegacyImageFile: the caller exports it as an image. */
export async function exportFile(f: RawFile, ctx: ExportContext): Promise<VaultFileRecord | LegacyImageFile> {
    const metadata = f.metadata ?? {};
    const publicMeta = f.public_meta ?? {};
    const plainTitle = str(metadata.title) || str(publicMeta.title);
    const record: VaultFileRecord = {
        id: f.id, type: f.type, title: plainTitle || 'Ohne Titel', parentId: f.parent_id ?? null, visibility: f.visibility ?? 'private',
        createdAt: f.created_at, updatedAt: f.updated_at, publicMeta, metadata, securedMeta: null, assets: [],
    };
    const sidecar = STYLE_SIDECAR.exec(plainTitle);
    if (sidecar) {
        record.role = 'helper';
        record.helperFor = sidecar[1].toLowerCase();
    }
    const log = (kind: VaultIssueKind, part: string, error: string) => ctx.issues.add(kind, record, part, error);
    const hasBody = !NO_BODY.has(f.type);
    const plaintext = isPlaintextFile(f);
    const isV1 = (f.version ?? 0) < 2 && !plaintext;

    // 1. Keys (and, for V1, the whole content: its secured_meta is the key).
    let dek: CryptoKey | null = null;
    let docKey: CryptoKey | null = null;
    let v1: V1Content | null = null;
    let keyError: unknown = null;
    if (hasBody && isV1) {
        try {
            v1 = await readV1(f, ctx.privateKey);
            docKey = v1.docKey;
        } catch (e) {
            keyError = e;
        }
    } else if (hasBody && plaintext) {
        docKey = await plaintextDocKey(f.id);
    } else if (hasBody && Object.keys(parseAccessKeys(f.access_keys)).length > 0) {
        try {
            dek = await unwrapFileDek(f, ctx.myId, ctx.privateKey);
            docKey = dek;
        } catch (e) {
            keyError = e;
        }
    }

    // 2. Encrypted metadata (V1 files: already read with the key).
    if (v1) {
        record.securedMeta = stripV1Keys(v1.meta);
    } else if (f.secured_meta && !(isV1 && hasBody)) {
        const meta = await readSecuredMeta(f.secured_meta, dek, ctx.privateKey);
        if (meta) record.securedMeta = meta;
        else {
            record.securedMetaRaw = f.secured_meta;
            log('meta-unreadable', 'meta', `Metadaten nicht entschlüsselbar: ${diagnoseSecuredMeta(f.secured_meta, ctx.privateKey)}`);
        }
    } else if (f.secured_meta && isV1 && keyError) {
        record.securedMetaRaw = f.secured_meta;
    }
    record.title = str(record.securedMeta?.title) || plainTitle || 'Ohne Titel';
    if (v1 && LEGACY_IMAGE_TITLE.test(record.title)) return { file: f };

    // 3. Content.
    if (hasBody) await readBody(f, record, ctx, { plaintext, v1, dek, keyError, log });

    // 4. Live document (images, drawing, canvas layout).
    if (WITH_YDOC.has(f.type) && docKey) await exportYDoc(record, docKey, ctx, log);
    return record;
}

interface BodyState {
    plaintext: boolean;
    v1: V1Content | null;
    dek: CryptoKey | null;
    keyError: unknown;
    log: (kind: VaultIssueKind, part: string, error: string) => void;
}

async function readBody(f: RawFile, record: VaultFileRecord, ctx: ExportContext, s: BodyState): Promise<void> {
    const isEvent = f.type === 'event';
    const hasDescription = str(f.metadata?.description).length > 0;
    if (s.plaintext) {
        try {
            storeContent(record, await readRawText(f.id), ctx, true);
        } catch (e) {
            if (!(e instanceof ContentMissingError)) s.log('content-unreadable', 'content', describeError(e));
            else if (!isEvent && record.role !== 'helper') s.log('content-unreadable', 'content', 'Kein Inhalt auf dem Server');
        }
        if (isEvent) s.log('plaintext-event', 'content', 'Als unverschlüsselt markiert; alle Felder stehen im Klartext');
        else if (record.role === 'helper') s.log('helper-file', 'content', `Alte Canvas-Stildatei der Notiz ${record.helperFor}; Striche/Bilder werden beim Import in diese Notiz übernommen, wenn sie dort fehlen`);
        else s.log('plaintext-note', 'content', 'Unverschlüsselte Notiz, Text unverändert exportiert');
        return;
    }
    if (s.v1) {
        storeContent(record, new TextDecoder().decode(s.v1.bytes), ctx, true);
        s.log('legacy-format', 'content', 'Altes V1-Format, mit dem V1-Dateischlüssel gelesen');
        return;
    }
    if (!s.dek) {
        const keyCount = Object.keys(parseAccessKeys(f.access_keys)).length;
        if (isEvent && keyCount === 0 && !s.keyError) {
            s.log('plaintext-event', 'content', 'Ohne verschlüsselten Detailblob angelegt (z. B. externe API); alle Felder im Klartext');
        } else if (isEvent) {
            s.log('event-details-unreadable', 'content', `${describeError(s.keyError)}; Klartext-Felder exportiert${hasDescription ? ' (inkl. Beschreibung)' : ''}`);
        } else if (s.keyError instanceof VaultReadError) {
            s.log(s.keyError.kind, 'content', s.keyError.message);
        } else {
            s.log(keyCount === 0 ? 'no-access-key' : 'content-unreadable', 'content', s.keyError ? describeError(s.keyError) : 'Kein Zugriffsschlüssel vorhanden');
        }
        return;
    }
    try {
        storeContent(record, await readContentText(f.id, s.dek), ctx, false);
    } catch (e) {
        if (e instanceof NotEnvelopeError) storeContent(record, e.raw, ctx, false);
        // Events without a blob (e.g. the calendar entry of a dated todo) are complete without one.
        else if (e instanceof ContentMissingError) {
            if (!isEvent) s.log('content-unreadable', 'content', 'Kein Inhalt auf dem Server');
        } else s.log(isEvent ? 'event-details-unreadable' : 'content-unreadable', 'content', describeError(e));
    }
}

function explainAssetError(assetId: string, e: unknown, ctx: ExportContext): { kind: VaultIssueKind; text: string } {
    const file = ctx.listed.get(assetId);
    const base = describeError(e);
    if (!file) return { kind: 'asset-missing', text: `Bild ${assetId}: Bilddatei existiert auf dem Server nicht mehr, die Notiz verweist ins Leere (${base})` };
    if (file.owner_id && file.owner_id !== ctx.myId) return { kind: 'asset-unreadable', text: `Bild ${assetId}: gehört einer anderen Person (${base})` };
    return { kind: 'asset-unreadable', text: `Bild ${assetId}: ${base}` };
}

async function exportYDoc(record: VaultFileRecord, key: CryptoKey, ctx: ExportContext, log: BodyState['log']): Promise<void> {
    let doc: Y.Doc | null = null;
    try {
        doc = await readYDoc(record.id, key);
    } catch (e) {
        log('ydoc-unreadable', 'ydoc', `Notiz-Zustand nicht entschlüsselbar: ${describeError(e)} (Datei ${record.id}, „${record.title}“)`);
        return;
    }
    if (!doc) return;
    record.ydocPath = `ydoc/${record.id}.bin`;
    ctx.entries.push({ path: record.ydocPath, data: Y.encodeStateAsUpdate(doc) });
    for (const ref of collectAssetRefs(doc)) {
        try {
            const bytes = await readAsset(ref);
            const path = `assets/${ref.assetId}.${EXT[ref.mimeType.toLowerCase()] ?? 'bin'}`;
            ctx.entries.push({ path, data: bytes });
            record.assets.push({ assetId: ref.assetId, mimeType: ref.mimeType, path, byteLength: bytes.length });
            ctx.exportedAssets.add(ref.assetId);
        } catch (e) {
            const { kind, text } = explainAssetError(ref.assetId, e, ctx);
            log(kind, 'asset', text);
        }
    }
    const legacy = collectLegacyImageRefsFromDoc(doc);
    if (legacy.length > 0) ctx.legacyRefs.set(record.id, [...(ctx.legacyRefs.get(record.id) ?? []), ...legacy]);
    doc.destroy();
}
