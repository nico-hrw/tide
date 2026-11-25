// Imports a vault export archive into the signed-in account (typically a fresh one with a new key).
// Every file, tag, image and todo gets a new id; all references are rewritten through the id table.
// Order: folders and tags, notes/canvas (+ images + Yjs state), events, todos, then a verification pass.

import * as Y from 'yjs';
import { useDataStore, type TaskItem } from '@/store/useDataStore';
import { openVaultArchive, type VaultArchive } from './archive';
import { createAsset, createFile, createTodo, countTodoIds, listIds, replaceContent, writeSnapshot } from './importRemote';
import { rewriteJson, rewriteYDoc, type NewAssetRef, type RewriteContext } from './rewriteIds';
import type { VaultFileRecord } from './types';

export interface ImportOptions {
    /** Put everything that is not a tag or event into a new "Import" folder. */
    intoFolder: boolean;
    onProgress?: (p: ImportProgress) => void;
}

export interface ImportProgress {
    phase: 'checking' | 'folders' | 'notes' | 'events' | 'todos' | 'verifying' | 'done';
    current: number;
    total: number;
}

export interface ImportFailure {
    id: string;
    title: string;
    part: string;
    error: string;
}

export interface ImportReport {
    created: Record<string, number>;
    todos: number;
    images: number;
    /** Entries of the export that were not imported on purpose (settings, views ...). */
    notImported: Array<{ id: string; type: string; title: string; reason: string }>;
    /** Problems already known from the export itself. */
    exportFailures: number;
    failures: ImportFailure[];
    /** Items the server did not list after the import. */
    missing: string[];
    complete: boolean;
}

const IMPORTABLE = new Set(['folder', 'note', 'canvas', 'event']);
const STOP_AFTER_FAILURES = 5;
/** `unencrypted` must go too: the imported copy is always encrypted, and the app reads `unencrypted` files as plain text. */
const CRYPTO_FIELDS = ['has_custom_password', 'pwd_salt', 'unencrypted'];
const uuid = () => crypto.randomUUID();

interface Journal {
    ids: Record<string, string>;
    done: string[];
}

function journalKey(userId: string, exportedAt: string): string {
    return `tide_vault_import:${userId}:${exportedAt}`;
}

function loadJournal(key: string): Journal {
    try {
        const raw = JSON.parse(localStorage.getItem(key) ?? 'null') as Journal | null;
        if (raw && typeof raw.ids === 'object' && Array.isArray(raw.done)) return raw;
    } catch {
        /* start a new journal */
    }
    return { ids: {}, done: [] };
}

const isTag = (r: VaultFileRecord): boolean =>
    [r.metadata, r.publicMeta, r.securedMeta ?? {}].some((m) => (m as { isGroup?: unknown }).isGroup === true);

function stripCrypto(meta: Record<string, unknown>): Record<string, unknown> {
    const out = { ...meta };
    for (const k of CRYPTO_FIELDS) delete out[k];
    return out;
}

/** Parents before children; records whose parent is unknown or part of a cycle come last-resolved as roots. */
function parentFirst(records: VaultFileRecord[]): VaultFileRecord[] {
    const byId = new Map(records.map((r) => [r.id, r]));
    const out: VaultFileRecord[] = [];
    const state = new Map<string, 1 | 2>();
    const visit = (r: VaultFileRecord) => {
        if (state.get(r.id)) return;
        state.set(r.id, 1);
        const parent = r.parentId ? byId.get(r.parentId) : undefined;
        if (parent && state.get(parent.id) !== 1) visit(parent);
        state.set(r.id, 2);
        out.push(r);
    };
    records.forEach(visit);
    return out;
}

function todoPayload(t: TaskItem, id: string, ctx: RewriteContext): Record<string, unknown> {
    const task = rewriteJson(t, ctx);
    return {
        id,
        title: task.title,
        description: task.description ?? '',
        status: task.status ?? (task.isCompleted ? 'completed' : 'todo'),
        priority: task.priority ?? '',
        due_date: task.dueDate ?? '',
        scheduled_date: task.scheduledDate ?? '',
        tags: task.tags ?? [],
        color: task.color ?? '',
        is_completed: Boolean(task.isCompleted),
        folder: task.folder ?? '',
        linked_note_id: task.linkedNoteId ?? '',
        recurrence: task.recurrence ?? '',
        recurrence_rule: task.recurrence_rule ?? '',
        recurrence_end: task.recurrence_end ?? '',
        completed_dates: task.completed_dates ?? [],
        show_in_calendar: task.showInCalendar ?? true,
        is_archived: Boolean(task.isArchived),
        parent_id: task.parentId ?? '',
        order: task.order ?? 0,
    };
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function importVault(zipBytes: Uint8Array, options: ImportOptions): Promise<ImportReport> {
    const { privateKey, publicKey, myId } = useDataStore.getState();
    if (!privateKey || !publicKey || !myId) throw new Error('Nicht angemeldet oder Schlüssel nicht geladen.');
    const progress = (phase: ImportProgress['phase'], current = 0, total = 0) => options.onProgress?.({ phase, current, total });

    progress('checking');
    const archive = openVaultArchive(zipBytes);
    const jKey = journalKey(myId, archive.manifest.exportedAt);
    const journal = loadJournal(jKey);
    const done = new Set(journal.done);
    const save = () => localStorage.setItem(jKey, JSON.stringify({ ids: journal.ids, done: [...done] }));
    const newId = (oldId: string): string => (journal.ids[oldId] ??= uuid());

    const notImported: ImportReport['notImported'] = [];
    const records: VaultFileRecord[] = [];
    /** Old canvas style sidecars by the note they belong to: merged into that note instead of becoming notes. */
    const sidecars = new Map<string, VaultFileRecord>();
    for (const f of archive.files) {
        if (f.role === 'helper' && f.helperFor) {
            sidecars.set(f.helperFor, f);
            notImported.push({ id: f.id, type: f.type, title: f.title, reason: 'Alte Canvas-Stildatei: Striche und Bilder werden in ihre Notiz übernommen, wenn diese noch keine hat' });
        } else if (IMPORTABLE.has(f.type)) records.push(f);
        else notImported.push({ id: f.id, type: f.type, title: f.title, reason: 'Einstellungs- oder Hilfsdatei, wird nicht übernommen' });
    }

    // Allocate every new id up front so references can be rewritten regardless of creation order.
    const ctx: RewriteContext = { ids: new Map(), assets: new Map() };
    for (const r of records) {
        ctx.ids.set(r.id, newId(r.id));
        for (const a of r.assets) ctx.ids.set(a.assetId, newId(a.assetId));
    }
    for (const t of archive.tasks) ctx.ids.set(t.id, newId(t.id));
    const ownIds = new Set(records.map((r) => r.id));

    const report: ImportReport = {
        created: {}, todos: 0, images: 0, notImported, exportFailures: archive.manifest.failures.length,
        failures: [], missing: [], complete: false,
    };
    const expectedFiles = new Set<string>();
    let consecutive = 0;
    const guard = async (r: { id: string; title: string }, part: string, work: () => Promise<void>) => {
        try {
            await work();
            consecutive = 0;
        } catch (e) {
            report.failures.push({ id: r.id, title: r.title, part, error: errText(e) });
            if (++consecutive >= STOP_AFTER_FAILURES) throw new Error(`Import abgebrochen nach ${STOP_AFTER_FAILURES} Fehlern in Folge: ${errText(e)}`);
        }
    };

    try {
        // Wrapper folder
        let wrapperId: string | null = null;
        if (options.intoFolder) {
            wrapperId = newId('__wrapper__');
            const title = `Import ${archive.manifest.exportedAt.slice(0, 10)}`;
            if (!done.has('__wrapper__')) {
                await createFile({ id: wrapperId, type: 'folder', parentId: null, publicMeta: {}, metadata: { title }, securedMeta: { title, parent_id: null } }, publicKey, privateKey, myId);
                done.add('__wrapper__');
                save();
            }
            expectedFiles.add(wrapperId);
        }

        const parentOf = (r: VaultFileRecord): string | null => {
            if (r.parentId && ownIds.has(r.parentId)) return ctx.ids.get(r.parentId)!;
            return r.type === 'event' || isTag(r) ? null : wrapperId;
        };
        const meta = (r: VaultFileRecord) => ({
            publicMeta: rewriteJson(r.publicMeta, ctx),
            metadata: { ...stripCrypto(rewriteJson(r.metadata, ctx)), title: r.title },
            securedMeta: { ...rewriteJson(r.securedMeta ?? {}, ctx), title: r.title },
        });

        const step = async (list: VaultFileRecord[], phase: ImportProgress['phase'], work: (r: VaultFileRecord, parent: string | null) => Promise<void>) => {
            let n = 0;
            for (const r of list) {
                progress(phase, n++, list.length);
                expectedFiles.add(ctx.ids.get(r.id)!);
                if (done.has(r.id)) {
                    report.created[r.type] = (report.created[r.type] ?? 0) + 1;
                    continue;
                }
                await guard(r, 'datei', async () => {
                    await work(r, parentOf(r));
                    done.add(r.id);
                    save();
                    report.created[r.type] = (report.created[r.type] ?? 0) + 1;
                });
            }
        };

        const folders = parentFirst(records.filter((r) => r.type === 'folder'));
        await step(folders, 'folders', async (r, parent) => {
            const m = meta(r);
            if ('parent_id' in m.securedMeta) m.securedMeta.parent_id = parent;
            await createFile({ id: ctx.ids.get(r.id)!, type: 'folder', parentId: parent, ...m }, publicKey, privateKey, myId);
        });

        const notes = records.filter((r) => r.type === 'note' || r.type === 'canvas');
        await step(notes, 'notes', (r, parent) =>
            importNote(r, parent, archive, ctx, meta(r), report, { publicKey, privateKey, myId }, sidecars.get(r.id.toLowerCase())));

        const events = records.filter((r) => r.type === 'event');
        await step(events, 'events', async (r, parent) => {
            const body = r.contentPath ? archive.text(r.contentPath) : JSON.stringify({ title: r.title });
            await createFile({ id: ctx.ids.get(r.id)!, type: 'event', parentId: parent, content: body, ...meta(r) }, publicKey, privateKey, myId);
        });

        // Todos: parents first so parent_id always points at an existing todo.
        const taskById = new Map(archive.tasks.map((t) => [t.id, t]));
        const ordered: TaskItem[] = [];
        const seen = new Set<string>();
        const place = (t: TaskItem) => {
            if (seen.has(t.id)) return;
            seen.add(t.id);
            const p = t.parentId ? taskById.get(t.parentId) : undefined;
            if (p) place(p);
            ordered.push(t);
        };
        archive.tasks.forEach(place);
        let tn = 0;
        for (const t of ordered) {
            progress('todos', tn++, ordered.length);
            const key = `todo:${t.id}`;
            if (done.has(key)) {
                report.todos++;
                continue;
            }
            await guard({ id: t.id, title: t.title }, 'todo', async () => {
                const payload = todoPayload(t, ctx.ids.get(t.id)!, ctx);
                if (t.parentId && !taskById.has(t.parentId)) payload.parent_id = '';
                await createTodo(payload);
                done.add(key);
                save();
                report.todos++;
            });
        }

        // Verification: everything we believe exists must be listed by the server.
        progress('verifying');
        const [files, evs, todoIds] = await Promise.all([listIds('recursive=true'), listIds('type=event&recursive=true'), countTodoIds()]);
        const listed = new Set([...files, ...evs]);
        const failedIds = new Set(report.failures.map((f) => ctx.ids.get(f.id)));
        for (const id of expectedFiles) if (!listed.has(id) && !failedIds.has(id)) report.missing.push(id);
        if (archive.tasks.length <= 500) {
            for (const t of archive.tasks) {
                const id = ctx.ids.get(t.id)!;
                if (done.has(`todo:${t.id}`) && !todoIds.has(id)) report.missing.push(id);
            }
        }
    } finally {
        save();
    }

    report.complete = report.failures.length === 0 && report.missing.length === 0 && report.exportFailures === 0;
    if (report.failures.length === 0 && report.missing.length === 0) localStorage.removeItem(jKey);
    await useDataStore.getState().loadAllMetadata();
    progress('done');
    return report;
}

async function importNote(
    r: VaultFileRecord,
    parent: string | null,
    archive: VaultArchive,
    ctx: RewriteContext,
    m: { publicMeta: Record<string, unknown>; metadata: Record<string, unknown>; securedMeta: Record<string, unknown> },
    report: ImportReport,
    keys: { publicKey: CryptoKey; privateKey: CryptoKey; myId: string },
    sidecar?: VaultFileRecord,
): Promise<void> {
    if (!r.contentPath && !r.ydocPath) throw new Error('Weder Inhalt noch Notiz-Zustand im Export vorhanden');
    const id = ctx.ids.get(r.id)!;
    // Images are created after the file, but their new ids are already known to the content.
    const source = r.contentPath ? (JSON.parse(archive.text(r.contentPath)) as unknown) : null;
    const content = source
        ? JSON.stringify(rewriteJson(source, ctx))
        : JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', attrs: { blockId: uuid() } }] });
    const dek = await createFile({ id, type: r.type, parentId: parent, content, ...m }, keys.publicKey, keys.privateKey, keys.myId);
    if (!dek || !r.ydocPath) return;

    for (const a of r.assets) {
        const ref: NewAssetRef = await createAsset(ctx.ids.get(a.assetId)!, id, archive.bytes(a.path), a.mimeType);
        ctx.assets.set(a.assetId, ref);
        report.images++;
    }
    // Older documents may embed image keys in their content: rewrite again now that the new keys exist.
    if (source) {
        const again = JSON.stringify(rewriteJson(source, ctx));
        if (again !== content) await replaceContent(id, dek, again);
    }
    const doc = new Y.Doc();
    Y.applyUpdate(doc, archive.bytes(r.ydocPath));
    if (sidecar?.contentPath) mergeSidecar(doc, archive.text(sidecar.contentPath));
    rewriteYDoc(doc, ctx);
    await writeSnapshot(id, dek, Y.encodeStateAsUpdate(doc));
    doc.destroy();
}

/**
 * Same rule as the app's one-time migration in useStyleFile: when the note's overlay is still empty, the strokes
 * and elements of its old `.<noteId>_style` sidecar are copied into it (each as a Y.Map under its id).
 */
export function mergeSidecar(doc: Y.Doc, sidecarText: string): void {
    const overlay = doc.getMap<Y.Map<unknown>>('overlay');
    if (overlay.size > 0) return;
    let data: { strokes?: unknown; elements?: unknown };
    try {
        data = JSON.parse(sidecarText) as { strokes?: unknown; elements?: unknown };
    } catch {
        return;
    }
    const items = [...(Array.isArray(data.strokes) ? data.strokes : []), ...(Array.isArray(data.elements) ? data.elements : [])]
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');
    if (items.length === 0) return;
    doc.transact(() => {
        for (const item of items) {
            const map = new Y.Map<unknown>();
            for (const [k, v] of Object.entries(item)) map.set(k, v);
            overlay.set(typeof item.id === 'string' && item.id ? item.id : uuid(), map);
        }
    });
}
