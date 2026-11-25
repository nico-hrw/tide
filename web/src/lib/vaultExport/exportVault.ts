// Full export of everything the user owns into one ZIP archive (see types.ts for the layout).
// Runs entirely in the browser on already-decryptable data; it never writes to the server.
// Per-file reading lives in exportFile.ts, the problem report in issues.ts.

import { apiFetch } from '@/lib/api';
import { useDataStore } from '@/store/useDataStore';
import { createZip, type ZipEntry } from './zip';
import { eventsToIcs, folderPathOf, noteToMarkdown, safeName, todosToMarkdown } from './readable';
import { IssueLog, describeError, problemsText } from './issues';
import { EXT, exportFile, type ExportContext, type RawFile } from './exportFile';
import { VaultReadError, collectLegacyImageRefs, readLegacyImage, type LegacyImageRef } from './readFile';
import {
    VAULT_EXPORT_FORMAT,
    VAULT_EXPORT_VERSION,
    type VaultExportProgress,
    type VaultExportResult,
    type VaultFileRecord,
    type VaultManifest,
    type VaultSkipped,
    type VaultUnassignedAsset,
} from './types';

const encoder = new TextEncoder();
const ASSET_TYPES = new Set(['canvas-asset']);
/** Rebuilt by the app itself; exporting it would only add noise. */
const REBUILT_TYPES = new Set(['index']);

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
const assetPath = (id: string, mime: string) => `assets/${id}.${EXT[mime.toLowerCase()] ?? 'bin'}`;

export async function exportVault(onProgress?: (p: VaultExportProgress) => void): Promise<VaultExportResult> {
    const store = useDataStore.getState();
    const { privateKey, myId } = store;
    if (!privateKey || !myId) throw new Error('Nicht angemeldet oder Schlüssel nicht geladen.');

    onProgress?.({ phase: 'listing', current: 0, total: 0 });
    const [all, events] = await Promise.all([listFiles('recursive=true'), listFiles('type=event&recursive=true')]);
    const listed = new Map<string, RawFile>();
    for (const f of [...all, ...events]) listed.set(f.id, f);

    const skipped: VaultSkipped[] = [];
    const records: VaultFileRecord[] = [];
    const ctx: ExportContext = {
        privateKey, myId, entries: [], issues: new IssueLog(), readable: new Map(), exportedAssets: new Set(), legacyRefs: new Map(), listed,
    };
    /** Owned image files, by id; the ones a note references are exported with that note. */
    const assetFiles = new Map<string, RawFile>();

    const owned: RawFile[] = [];
    for (const f of listed.values()) {
        if (f.owner_id && f.owner_id !== myId) {
            skipped.push({ id: f.id, type: f.type, title: String(f.metadata?.title ?? f.public_meta?.title ?? ''), reason: 'Gehört einer anderen Person (mit dir geteilt)' });
        } else if (ASSET_TYPES.has(f.type)) {
            assetFiles.set(f.id, f);
        } else if (REBUILT_TYPES.has(f.type)) {
            skipped.push({ id: f.id, type: f.type, title: '', reason: 'Wird von der App automatisch neu aufgebaut' });
        } else {
            owned.push(f);
        }
    }

    let done = 0;
    await runPool(owned, 4, async (f) => {
        const result = await exportFile(f, ctx);
        if ('file' in result) assetFiles.set(result.file.id, result.file);
        else records.push(result);
        onProgress?.({ phase: 'reading', current: ++done, total: owned.length });
    });

    onProgress?.({ phase: 'packing', current: 0, total: 0 });
    records.sort((a, b) => a.id.localeCompare(b.id));
    const byRecord = new Map(records.map((r) => [r.id, r]));
    collectSidecarRefs(records, ctx);
    await exportLegacyImages(byRecord, assetFiles, ctx);
    const unassignedAssets = await exportUnassignedImages(assetFiles, listed, ctx);
    addReadable(records, byRecord, ctx);

    await store.loadAllMetadata();
    const tasks = useDataStore.getState().tasks;
    ctx.entries.push({ path: 'tasks.json', data: json(tasks) });
    ctx.entries.push({ path: 'lesbar/todos.md', data: encoder.encode(todosToMarkdown(tasks)) });

    const counts: Record<string, number> = {};
    for (const r of records) counts[r.type] = (counts[r.type] ?? 0) + 1;
    const assetCount = ctx.exportedAssets.size;
    const manifest: VaultManifest = {
        format: VAULT_EXPORT_FORMAT, version: VAULT_EXPORT_VERSION, exportedAt: new Date().toISOString(), userId: myId,
        counts, assetCount, taskCount: tasks.length, skipped,
        failures: ctx.issues.bySeverity('loss'), warnings: ctx.issues.bySeverity('partial'), notices: ctx.issues.bySeverity('info'),
        summary: ctx.issues.summary(), unassignedAssets, containsPlaintext: true,
    };
    ctx.entries.push({ path: 'lesbar/PROBLEME.txt', data: encoder.encode(problemsText(manifest)) });
    ctx.entries.unshift(
        { path: 'manifest.json', data: json(manifest) },
        { path: 'tree.json', data: json({ files: records }) },
        { path: 'LIESMICH.txt', data: encoder.encode(README) },
    );

    const blob = createZip(ctx.entries);
    onProgress?.({ phase: 'done', current: 1, total: 1 });
    return { blob, filename: `tide-export-${manifest.exportedAt.slice(0, 10)}.zip`, manifest };
}

/** Old canvas style sidecars may hold image elements of their note; those images belong to that note. */
function collectSidecarRefs(records: VaultFileRecord[], ctx: ExportContext): void {
    for (const r of records) {
        if (r.role !== 'helper' || !r.helperFor) continue;
        const text = ctx.readable.get(r.id);
        if (!text || text.startsWith('md:')) continue;
        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch {
            continue;
        }
        const refs = collectLegacyImageRefs(parsed);
        if (refs.length > 0) ctx.legacyRefs.set(r.helperFor, [...(ctx.legacyRefs.get(r.helperFor) ?? []), ...refs]);
    }
}

/** Old images referenced by a note (element with `encryptedKey`): read via the legacy path and attached to that note. */
async function exportLegacyImages(byRecord: Map<string, VaultFileRecord>, assetFiles: Map<string, RawFile>, ctx: ExportContext): Promise<void> {
    for (const [noteId, refs] of ctx.legacyRefs) {
        const note = byRecord.get(noteId);
        if (!note) continue;
        for (const ref of refs as LegacyImageRef[]) {
            if (ctx.exportedAssets.has(ref.blobId)) continue;
            const file = assetFiles.get(ref.blobId) ?? ctx.listed.get(ref.blobId) ?? { id: ref.blobId, type: 'canvas-asset' };
            try {
                const { bytes, mimeType } = await readLegacyImage(file, ctx.privateKey, ref);
                const path = assetPath(ref.blobId, mimeType);
                ctx.entries.push({ path, data: bytes });
                note.assets.push({ assetId: ref.blobId, mimeType, path, byteLength: bytes.length, legacy: true });
                ctx.exportedAssets.add(ref.blobId);
            } catch (e) {
                const missing = !ctx.listed.has(ref.blobId) || (e instanceof VaultReadError && e.kind === 'asset-missing');
                ctx.issues.add(missing ? 'asset-missing' : 'asset-unreadable', note, 'asset', `Altes Bild ${ref.blobId}: ${describeError(e)}`);
            }
        }
    }
}

/** Images no note points to: exported when their own key is readable (old images), otherwise reported. */
async function exportUnassignedImages(assetFiles: Map<string, RawFile>, listed: Map<string, RawFile>, ctx: ExportContext): Promise<VaultUnassignedAsset[]> {
    const out: VaultUnassignedAsset[] = [];
    for (const f of assetFiles.values()) {
        if (ctx.exportedAssets.has(f.id)) continue;
        const parent = f.parent_id ? listed.get(f.parent_id) : undefined;
        const parentTitle = String(parent?.metadata?.title ?? parent?.public_meta?.title ?? '');
        const item = { id: f.id, type: 'canvas-asset', title: parentTitle ? `Bild in „${parentTitle}“` : `Bild ${f.id}` };
        try {
            const { bytes, mimeType } = await readLegacyImage(f, ctx.privateKey);
            const path = assetPath(f.id, mimeType);
            ctx.entries.push({ path, data: bytes });
            out.push({ assetId: f.id, mimeType, path, byteLength: bytes.length, parentId: f.parent_id ?? null, parentTitle });
            ctx.exportedAssets.add(f.id);
            ctx.issues.add('unassigned-asset', item, 'asset', `Keine Notiz verweist darauf; exportiert als ${path} (nicht zugeordnet)`);
        } catch (e) {
            const kind = e instanceof VaultReadError && e.kind !== 'orphan-asset' ? 'asset-unreadable' : 'orphan-asset';
            ctx.issues.add(kind, item, 'asset', describeError(e));
        }
    }
    return out;
}

function addReadable(records: VaultFileRecord[], byId: Map<string, VaultFileRecord>, ctx: ExportContext): void {
    const used = new Set<string>();
    for (const r of records) {
        if (r.type !== 'note' || r.role === 'helper') continue;
        const text = ctx.readable.get(r.id);
        const md = !text ? null : text.startsWith('md:') ? `# ${r.title}\n\n${text.slice(3)}` : noteToMarkdown(r.title, text);
        if (md === null) continue;
        let path = `lesbar/notizen/${folderPathOf(r, byId)}${safeName(r.title, 'Notiz')}`;
        if (used.has(path.toLowerCase())) path += ` (${r.id.slice(0, 8)})`;
        used.add(path.toLowerCase());
        ctx.entries.push({ path: `${path}.md`, data: encoder.encode(md) });
    }
    const tagTitle = (id: string) => byId.get(id)?.title;
    const evs = records.filter((r) => r.type === 'event').map((file) => ({ file, contentText: ctx.readable.get(file.id) }));
    ctx.entries.push({ path: 'lesbar/kalender.ics', data: encoder.encode(eventsToIcs(evs, new Date(), tagTitle)) });
}

const README = `Tide-Vollexport (Format ${VAULT_EXPORT_FORMAT}, Version ${VAULT_EXPORT_VERSION})

ACHTUNG: Dieses Archiv enthaelt deine Daten UNVERSCHLUESSELT (Notizen, Termine, Todos, Bilder).
Bewahre es sicher auf und loesche es, wenn du es nicht mehr brauchst.

Inhalt
  manifest.json   Zaehlungen; failures = echte Luecken, warnings = Zusatzdetail fehlt, notices = Hinweise ohne Verlust
  tree.json       alle Dateien mit alter ID, Elternordner und Metadaten (fuer den Import)
  tasks.json      alle Todos
  content/        entschluesselter Inhalt je Datei (.json; .txt = Inhalt im Original, wenn er kein JSON ist)
  ydoc/           Live-Zustand der Notizen (Bilder, Stift, Canvas-Layout)
  assets/         die Originalbilder (auch nicht zugeordnete, siehe manifest.unassignedAssets)
  lesbar/         Notizen als Markdown, kalender.ics, todos.md, PROBLEME.txt (was fehlt, was sicher drin ist)
`;
