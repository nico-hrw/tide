// Full export of everything the user owns into one ZIP archive (see types.ts for the layout).
// Runs entirely in the browser on already-decryptable data; it never writes to the server.

import { apiFetch } from '@/lib/api';
import { decryptMetadata } from '@/lib/crypto';
import { useDataStore } from '@/store/useDataStore';
import * as Y from 'yjs';
import { createZip, type ZipEntry } from './zip';
import { eventsToIcs, folderPathOf, noteToMarkdown, safeName, todosToMarkdown } from './readable';
import { ContentMissingError, collectAssetRefs, readAsset, readContentText, readYDoc, unwrapFileDek } from './readFile';
import {
    VAULT_EXPORT_FORMAT,
    VAULT_EXPORT_VERSION,
    type VaultExportProgress,
    type VaultExportResult,
    type VaultFailure,
    type VaultFileRecord,
    type VaultManifest,
    type VaultSkipped,
} from './types';

interface RawFile {
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

const encoder = new TextEncoder();
const EXT: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif',
    'image/bmp': 'bmp', 'image/svg+xml': 'svg', 'application/pdf': 'pdf', 'video/mp4': 'mp4', 'audio/mpeg': 'mp3',
};
const SKIP_TYPES = new Set(['canvas-asset']);
/** Rebuilt by the app itself; exporting it would only add noise. */
const REBUILT_TYPES = new Set(['index']);
const WITH_YDOC = new Set(['note', 'canvas']);
const NO_BODY = new Set(['folder']);

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function listFiles(query: string): Promise<RawFile[]> {
    const res = await apiFetch(`/api/v1/files?${query}`);
    if (!res.ok) throw new Error(`Dateiliste nicht ladbar (HTTP ${res.status})`);
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as RawFile[]) : [];
}

async function runPool<T>(items: T[], size: number, work: (item: T, index: number) => Promise<void>): Promise<void> {
    let next = 0;
    await Promise.all(
        Array.from({ length: Math.min(size, items.length) }, async () => {
            while (next < items.length) {
                const i = next++;
                await work(items[i], i);
            }
        }),
    );
}

const json = (value: unknown): Uint8Array => encoder.encode(JSON.stringify(value, null, 2));

export async function exportVault(onProgress?: (p: VaultExportProgress) => void): Promise<VaultExportResult> {
    const store = useDataStore.getState();
    const { privateKey, myId } = store;
    if (!privateKey || !myId) throw new Error('Nicht angemeldet oder Schlüssel nicht geladen.');

    onProgress?.({ phase: 'listing', current: 0, total: 0 });
    const [all, events] = await Promise.all([listFiles('recursive=true'), listFiles('type=event&recursive=true')]);
    const byId = new Map<string, RawFile>();
    for (const f of [...all, ...events]) byId.set(f.id, f);
    const files = [...byId.values()];

    const skipped: VaultSkipped[] = [];
    const failures: VaultFailure[] = [];
    const entries: ZipEntry[] = [];
    const records: VaultFileRecord[] = [];
    const contentById = new Map<string, string>();
    const exportedAssets = new Set<string>();
    const ownedAssetIds: string[] = [];

    const owned: RawFile[] = [];
    for (const f of files) {
        if (f.owner_id && f.owner_id !== myId) {
            skipped.push({ id: f.id, type: f.type, title: String(f.metadata?.title ?? f.public_meta?.title ?? ''), reason: 'Gehört einer anderen Person (mit dir geteilt)' });
        } else if (SKIP_TYPES.has(f.type)) {
            ownedAssetIds.push(f.id);
        } else if (REBUILT_TYPES.has(f.type)) {
            skipped.push({ id: f.id, type: f.type, title: '', reason: 'Wird von der App automatisch neu aufgebaut' });
        } else {
            owned.push(f);
        }
    }

    let done = 0;
    await runPool(owned, 4, async (f) => {
        const metadata = f.metadata ?? {};
        const publicMeta = f.public_meta ?? {};
        const fail = (part: string, title: string, error: string) => failures.push({ id: f.id, type: f.type, title, part, error });

        let securedMeta: Record<string, unknown> | null = null;
        if (f.secured_meta) {
            const meta = await decryptMetadata(f.secured_meta, privateKey, 'export');
            if (meta.isLocked) fail('meta', String(metadata.title ?? ''), 'Metadaten nicht entschlüsselbar');
            else securedMeta = meta;
        }
        const title = String(securedMeta?.title ?? metadata.title ?? publicMeta.title ?? 'Ohne Titel');
        const record: VaultFileRecord = {
            id: f.id, type: f.type, title, parentId: f.parent_id ?? null, visibility: f.visibility ?? 'private',
            createdAt: f.created_at, updatedAt: f.updated_at, publicMeta, metadata, securedMeta, assets: [],
        };

        if (!NO_BODY.has(f.type) && f.access_keys) {
            try {
                const dek = await unwrapFileDek(f, myId, privateKey);
                try {
                    const text = await readContentText(f.id, dek);
                    contentById.set(f.id, text);
                    record.contentPath = `content/${f.id}.json`;
                    entries.push({ path: record.contentPath, data: encoder.encode(text) });
                } catch (e) {
                    // Events without a blob (e.g. the calendar entry of a dated todo) are complete without one.
                    if (!(e instanceof ContentMissingError && f.type === 'event')) fail('content', title, errText(e));
                }
                if (WITH_YDOC.has(f.type)) await exportYDoc(f.id, dek, record, entries, exportedAssets, (part, err) => fail(part, title, err));
            } catch (e) {
                fail('content', title, errText(e));
            }
        }
        records.push(record);
        onProgress?.({ phase: 'reading', current: ++done, total: owned.length });
    });

    for (const id of ownedAssetIds) {
        if (!exportedAssets.has(id)) skipped.push({ id, type: 'canvas-asset', title: '', reason: 'Bild wird von keiner Notiz mehr verwendet' });
    }

    onProgress?.({ phase: 'packing', current: 0, total: 0 });
    records.sort((a, b) => a.id.localeCompare(b.id));
    const byRecord = new Map(records.map((r) => [r.id, r]));
    addReadable(records, byRecord, contentById, entries);

    await store.loadAllMetadata();
    const tasks = useDataStore.getState().tasks;
    entries.push({ path: 'tasks.json', data: json(tasks) });
    entries.push({ path: 'lesbar/todos.md', data: encoder.encode(todosToMarkdown(tasks)) });

    const counts: Record<string, number> = {};
    for (const r of records) counts[r.type] = (counts[r.type] ?? 0) + 1;
    const manifest: VaultManifest = {
        format: VAULT_EXPORT_FORMAT, version: VAULT_EXPORT_VERSION, exportedAt: new Date().toISOString(), userId: myId,
        counts, assetCount: exportedAssets.size, taskCount: tasks.length, skipped, failures, containsPlaintext: true,
    };
    entries.unshift(
        { path: 'manifest.json', data: json(manifest) },
        { path: 'tree.json', data: json({ files: records }) },
        { path: 'LIESMICH.txt', data: encoder.encode(README) },
    );

    const blob = createZip(entries);
    onProgress?.({ phase: 'done', current: 1, total: 1 });
    return { blob, filename: `tide-export-${manifest.exportedAt.slice(0, 10)}.zip`, manifest };
}

async function exportYDoc(
    id: string,
    dek: CryptoKey,
    record: VaultFileRecord,
    entries: ZipEntry[],
    exportedAssets: Set<string>,
    fail: (part: string, error: string) => void,
): Promise<void> {
    let doc: Y.Doc | null = null;
    try {
        doc = await readYDoc(id, dek);
    } catch (e) {
        fail('ydoc', errText(e));
        return;
    }
    if (!doc) return;
    record.ydocPath = `ydoc/${id}.bin`;
    entries.push({ path: record.ydocPath, data: Y.encodeStateAsUpdate(doc) });
    for (const ref of collectAssetRefs(doc)) {
        try {
            const bytes = await readAsset(ref);
            const path = `assets/${ref.assetId}.${EXT[ref.mimeType.toLowerCase()] ?? 'bin'}`;
            entries.push({ path, data: bytes });
            record.assets.push({ assetId: ref.assetId, mimeType: ref.mimeType, path, byteLength: bytes.length });
            exportedAssets.add(ref.assetId);
        } catch (e) {
            fail('asset', `${ref.assetId}: ${errText(e)}`);
        }
    }
    doc.destroy();
}

function addReadable(records: VaultFileRecord[], byId: Map<string, VaultFileRecord>, contents: Map<string, string>, entries: ZipEntry[]): void {
    const used = new Set<string>();
    for (const r of records) {
        if (r.type !== 'note') continue;
        const text = contents.get(r.id);
        const md = text ? noteToMarkdown(r.title, text) : null;
        if (md === null) continue;
        let path = `lesbar/notizen/${folderPathOf(r, byId)}${safeName(r.title, 'Notiz')}`;
        if (used.has(path.toLowerCase())) path += ` (${r.id.slice(0, 8)})`;
        used.add(path.toLowerCase());
        entries.push({ path: `${path}.md`, data: encoder.encode(md) });
    }
    const evs = records.filter((r) => r.type === 'event').map((file) => ({ file, contentText: contents.get(file.id) }));
    entries.push({ path: 'lesbar/kalender.ics', data: encoder.encode(eventsToIcs(evs)) });
}

const README = `Tide-Vollexport (Format ${VAULT_EXPORT_FORMAT}, Version ${VAULT_EXPORT_VERSION})

ACHTUNG: Dieses Archiv enthaelt deine Daten UNVERSCHLUESSELT (Notizen, Termine, Todos, Bilder).
Bewahre es sicher auf und loesche es, wenn du es nicht mehr brauchst.

Inhalt
  manifest.json   Zaehlungen, uebersprungene und fehlgeschlagene Teile
  tree.json       alle Dateien mit alter ID, Elternordner und Metadaten (fuer den Import)
  tasks.json      alle Todos
  content/        entschluesselter Inhalt je Datei
  ydoc/           Live-Zustand der Notizen (Bilder, Stift, Canvas-Layout)
  assets/         die Originalbilder
  lesbar/         Notizen als Markdown, kalender.ics, todos.md (nur zum Lesen)
`;
