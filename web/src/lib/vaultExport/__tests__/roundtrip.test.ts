// End-to-end round trip against an in-memory fake of the file API: account A is seeded and exported,
// the archive is imported into account B (different key pair), and B's data is exported and compared.

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { useDataStore, type TaskItem } from '@/store/useDataStore';

interface FakeFile {
  id: string; type: string; owner_id: string; parent_id: string | null; version?: number; visibility: string;
  public_meta: Record<string, unknown>; metadata: Record<string, unknown>; secured_meta: string; access_keys?: unknown;
  blob?: string | ArrayBuffer; snapshot?: { snapshot_iv: string; snapshot_ciphertext: string; key_epoch: number };
}
const files = new Map<string, FakeFile>();
const todos = new Map<string, Record<string, unknown> & { owner: string }>();
let user = 'A';
let failUploadsFor: string | null = null;

const json = (body: unknown, status = 200) => Response.json(body, { status });
const view = (f: FakeFile) => ({ ...f, blob: undefined, snapshot: undefined });

vi.mock('@/lib/api', () => ({
  apiFetch: async (url: string, init?: { method?: string; body?: BodyInit | null }) => {
    const method = init?.method ?? 'GET';
    const [path, query = ''] = url.split('?');
    const q = new URLSearchParams(query);
    const body = init?.body;
    const text = async () => (typeof body === 'string' ? body : body instanceof Blob ? await body.text() : '');
    if (path === '/api/v1/files' && method === 'GET') {
      const mine = [...files.values()].filter((f) => f.owner_id === user && (q.get('type') ? f.type === q.get('type') : true));
      return json(mine.map(view));
    }
    if (path === '/api/v1/files' && method === 'POST') {
      const req = JSON.parse(await text()) as FakeFile & { parent_file_id?: string };
      if (files.has(req.id)) return json({}, 409);
      const parent = req.parent_id ? files.get(req.parent_id) : null;
      if (req.parent_id && (!parent || parent.owner_id !== user)) return json({}, 403);
      files.set(req.id, { ...req, owner_id: user, visibility: 'private', parent_id: req.parent_id ?? null });
      return json({ id: req.id }, 201);
    }
    if (path === '/api/v1/todos' && method === 'POST') {
      const req = JSON.parse(await text()) as { id: string };
      if (todos.has(req.id)) return json({}, 409);
      todos.set(req.id, { ...req, owner: user });
      return json({ id: req.id }, 201);
    }
    if (path === '/api/v1/todos') return json([...todos.values()].filter((t) => t.owner === user));
    const m = path.match(/^\/api\/v1\/files\/([^/]+)\/(upload|download|crdt-state|compact)$/);
    if (m) {
      const f = files.get(m[1]);
      if (!f || f.owner_id !== user) return json({}, 404);
      if (m[2] === 'upload') {
        if (failUploadsFor === f.id) return json({}, 500);
        f.blob = typeof body === 'string' ? body : await (body as Blob).arrayBuffer();
        return json({}, 200);
      }
      if (m[2] === 'download') return new Response(f.blob as BodyInit);
      if (m[2] === 'crdt-state') return json(f.snapshot ? { ...f.snapshot, wal: [] } : { wal: [] });
      const c = JSON.parse(await text()) as { keyEpoch: number; ivBase64: string; ciphertextBase64: string };
      f.snapshot = { snapshot_iv: c.ivBase64, snapshot_ciphertext: c.ciphertextBase64, key_epoch: c.keyEpoch };
      return new Response(null, { status: 204 });
    }
    return json({}, 404);
  },
}));

const { createFile, createAsset, writeSnapshot } = await import('../importRemote');
const { exportVault } = await import('../exportVault');
const { importVault } = await import('../importVault');
const { readZip } = await import('../zip');
const { unwrapFileDek, readYDoc, readContentText, readAsset, collectAssetRefs } = await import('../readFile');

const U = (n: number) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const FOLDER = U(1), TAG = U(2), NOTE = U(3), EVENT = U(4), CANVAS = U(5), IMG1 = U(6), IMG2 = U(7), TODO1 = U(8), TODO2 = U(9);
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const JPG = new Uint8Array([255, 216, 255, 224, 9, 9, 9]);

const keyPair = () => crypto.subtle.generateKey(
  { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
let A: CryptoKeyPair, B: CryptoKeyPair;
const login = (who: string, pair: CryptoKeyPair, tasks: TaskItem[] = []) => {
  user = who;
  useDataStore.setState({ privateKey: pair.privateKey, publicKey: pair.publicKey, myId: who, tasks, loadAllMetadata: async () => {} } as never);
};

async function seedA() {
  user = 'A';
  const { publicKey, privateKey } = A;
  await createFile({ id: FOLDER, type: 'folder', parentId: null, publicMeta: {}, metadata: { title: 'Reise' }, securedMeta: { title: 'Reise' } }, publicKey, privateKey, 'A');
  await createFile({ id: TAG, type: 'folder', parentId: null, publicMeta: { isGroup: true }, metadata: { title: 'Uni', isGroup: true, color: '#3b82f6' }, securedMeta: { title: 'Uni', isGroup: true } }, publicKey, privateKey, 'A');

  const noteDoc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Tokyo', marks: [{ type: 'link', attrs: { href: `tide://event/${EVENT}` } }] }] }] };
  const noteDek = await createFile({ id: NOTE, type: 'note', parentId: FOLDER, publicMeta: {}, metadata: { title: 'Tokyo', tagIds: [TAG] }, securedMeta: { title: 'Tokyo' }, content: JSON.stringify(noteDoc) }, publicKey, privateKey, 'A');
  const ref = await createAsset(IMG1, NOTE, PNG, 'image/png');
  const nd = new Y.Doc();
  nd.getMap('assets').set(IMG1, ref);
  const img = new Y.XmlElement('image');
  img.setAttribute('assetId', IMG1);
  nd.getXmlFragment('prosemirror').insert(0, [img]);
  await writeSnapshot(NOTE, noteDek!, Y.encodeStateAsUpdate(nd));

  const canvasDek = await createFile({ id: CANVAS, type: 'canvas', parentId: FOLDER, publicMeta: {}, metadata: { title: 'Skizze' }, securedMeta: { title: 'Skizze' }, content: '{"version":1,"items":[]}' }, publicKey, privateKey, 'A');
  const ref2 = await createAsset(IMG2, CANVAS, JPG, 'image/jpeg');
  const cd = new Y.Doc();
  const el = new Y.Map<unknown>();
  el.set('blobId', IMG2); el.set('bek', ref2.bekBase64); el.set('iv', ref2.ivBase64); el.set('mimeType', 'image/jpeg');
  cd.getMap<Y.Map<unknown>>('canvas').set('el1', el);
  await writeSnapshot(CANVAS, canvasDek!, Y.encodeStateAsUpdate(cd));

  await createFile({
    id: EVENT, type: 'event', parentId: TAG, publicMeta: {},
    metadata: { title: 'Flug', start: '2026-05-01T08:00:00.000Z', end: '2026-05-01T10:00:00.000Z', groupIds: [TAG], recurrence_rule: 'FREQ=WEEKLY' },
    securedMeta: { title: 'Flug' }, content: JSON.stringify({ title: 'Flug', description: 'Gate 4' }),
  }, publicKey, privateKey, 'A');
}

const tasksA = (): TaskItem[] => [
  { id: TODO1, title: 'Koffer', isCompleted: false, linkedNoteId: NOTE, tags: [TAG], dueDate: '2026-04-30' } as TaskItem,
  { id: TODO2, title: 'Pass', isCompleted: true, parentId: TODO1 } as TaskItem,
];

beforeAll(async () => {
  [A, B] = await Promise.all([keyPair(), keyPair()]);
});
beforeEach(() => {
  files.clear(); todos.clear(); failUploadsFor = null; localStorage.clear();
});

const zipOf = async (blob: Blob) => new Map(readZip(new Uint8Array(await blob.arrayBuffer())).map((e) => [e.path, e.data]));
const treeOf = (z: Map<string, Uint8Array>) => (JSON.parse(new TextDecoder().decode(z.get('tree.json'))) as { files: Array<{ id: string; type: string; title: string; parentId: string | null; metadata: Record<string, unknown> }> }).files;

describe('vault export -> import round trip', () => {
  it('moves notes, images, canvas, tags, events and todos into a new account with a new key', async () => {
    await seedA();
    login('A', A, tasksA());
    const exported = await exportVault();
    expect(exported.manifest.failures).toEqual([]);
    expect(exported.manifest.assetCount).toBe(2);
    const zipBytes = new Uint8Array(await exported.blob.arrayBuffer());

    login('B', B);
    const report = await importVault(zipBytes, { intoFolder: true });
    expect(report.failures).toEqual([]);
    expect(report.missing).toEqual([]);
    expect(report.complete).toBe(true);
    expect(report.created).toMatchObject({ folder: 2, note: 1, canvas: 1, event: 1 });
    expect(report.images).toBe(2);
    expect(report.todos).toBe(2);

    // B can read everything with its own key; A's ids are gone from B's data.
    const mine = [...files.values()].filter((f) => f.owner_id === 'B');
    const byTitle = (t: string) => mine.find((f) => f.metadata?.title === t)!;
    const tag = byTitle('Uni'), folder = byTitle('Reise'), note = byTitle('Tokyo'), event = byTitle('Flug'), canvas = byTitle('Skizze');
    expect(mine.some((f) => [FOLDER, TAG, NOTE, EVENT, CANVAS, IMG1, IMG2].includes(f.id))).toBe(false);
    expect(tag.parent_id).toBeNull();
    expect(event.parent_id).toBe(tag.id);
    expect(event.metadata.groupIds).toEqual([tag.id]);
    expect(note.metadata.tagIds).toEqual([tag.id]);
    const wrapper = mine.find((f) => String(f.metadata?.title).startsWith('Import '))!;
    expect(folder.parent_id).toBe(wrapper.id);
    expect(note.parent_id).toBe(folder.id);
    expect(tag.public_meta).toEqual({ isGroup: true });

    const dek = await unwrapFileDek(note, 'B', B.privateKey);
    const content = JSON.parse(await readContentText(note.id, dek)) as { content: Array<{ content: Array<{ marks: Array<{ attrs: { href: string } }> }> }> };
    expect(content.content[0].content[0].marks[0].attrs.href).toBe(`tide://event/${event.id}`);

    const doc = (await readYDoc(note.id, dek))!;
    const [ref] = collectAssetRefs(doc);
    expect(ref.assetId).not.toBe(IMG1);
    expect([...(await readAsset(ref))]).toEqual([...PNG]);
    expect(files.get(ref.assetId)?.parent_id).toBe(note.id);
    const node = doc.getXmlFragment('prosemirror').get(0) as Y.XmlElement;
    expect(node.getAttribute('assetId')).toBe(ref.assetId);

    const cdek = await unwrapFileDek(canvas, 'B', B.privateKey);
    const [cref] = collectAssetRefs((await readYDoc(canvas.id, cdek))!);
    expect([...(await readAsset(cref))]).toEqual([...JPG]);

    const importedTodos = [...todos.values()].filter((t) => t.owner === 'B');
    const parent = importedTodos.find((t) => t.title === 'Koffer')!;
    const child = importedTodos.find((t) => t.title === 'Pass')!;
    expect(child.parent_id).toBe(parent.id);
    expect(parent.linked_note_id).toBe(note.id);
    expect(parent.tags).toEqual([tag.id]);
    expect(child.is_completed).toBe(true);

    // exporting B again yields the same content as A's export
    login('B', B, importedTodos.map((t) => ({ id: t.id as string, title: t.title as string, isCompleted: Boolean(t.is_completed) } as TaskItem)));
    const again = await exportVault();
    expect(again.manifest.failures).toEqual([]);
    expect(again.manifest.assetCount).toBe(2);
    const a = await zipOf(exported.blob);
    const b = await zipOf(again.blob);
    const titles = (z: Map<string, Uint8Array>) => treeOf(z).filter((f) => f.type !== 'folder' || f.title !== 'Import').map((f) => f.title).sort();
    expect(titles(b).filter((t) => !t.startsWith('Import '))).toEqual(titles(a));
  });

  it('refuses a damaged or foreign archive before writing anything', async () => {
    login('B', B);
    await expect(importVault(new Uint8Array([1, 2, 3]), { intoFolder: false })).rejects.toThrow();
    expect(files.size).toBe(0);
  });

  it('reports a failed file, resumes from the journal and does not duplicate', async () => {
    await seedA();
    login('A', A, tasksA());
    const exported = await exportVault();
    const zipBytes = new Uint8Array(await exported.blob.arrayBuffer());

    // pin the new id of the note through the journal so the fake server can fail exactly that upload
    const pinned = U(7).replace(/7/g, 'a');
    localStorage.setItem(`tide_vault_import:B:${exported.manifest.exportedAt}`, JSON.stringify({ ids: { [NOTE]: pinned }, done: [] }));
    failUploadsFor = pinned;

    login('B', B);
    const first = await importVault(zipBytes, { intoFolder: false });
    expect(first.complete).toBe(false);
    expect(first.failures.map((f) => f.title)).toContain('Tokyo');
    expect(first.created.note ?? 0).toBe(0);
    const afterFirst = files.size;

    failUploadsFor = null;
    const second = await importVault(zipBytes, { intoFolder: false });
    expect(second.failures).toEqual([]);
    expect(second.complete).toBe(true);
    expect(second.created.note).toBe(1);
    // only the previously failed note (+ its image) was added; nothing else was duplicated
    expect([...files.values()].filter((f) => f.owner_id === 'B' && f.metadata?.title === 'Reise')).toHaveLength(1);
    expect(files.size).toBe(afterFirst + 1);
    expect([...todos.values()].filter((t) => t.owner === 'B')).toHaveLength(2);
  });
});
