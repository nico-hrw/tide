// End-to-end round trip against an in-memory fake of the file API: account A is seeded and exported,
// the archive is imported into account B (different key pair), and B's data is exported and compared.

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { useDataStore, type TaskItem } from '@/store/useDataStore';
import type { VaultFileRecord } from '../types';

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
      if (m[2] === 'download') return f.blob === undefined ? json({}, 404) : new Response(f.blob as BodyInit);
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

  it('exports and re-imports old formats: V1 notes, plaintext notes, style sidecars, old images, API events', async () => {
    const { encryptFile, encryptMetadata, generateFileKey } = await import('@/lib/crypto');
    const { derivePublicNoteDEK } = await import('@/lib/cryptoV2');
    const L = (c: string) => `${c.repeat(8)}-${c.repeat(4)}-4${c.repeat(3)}-8${c.repeat(3)}-${c.repeat(12)}`;
    const KONZEPT = L('b'), SIDENOTE = L('c'), SIDECAR = L('d'), OLDIMG = L('e'), OLDIMG2 = L('f');
    const CANVASIMG = '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b', V1NOTE = '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c';
    const PATCH = '0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d', YOGA = '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e';
    const EMPTYKEY = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f', OLDFOLDER = '01010101-0101-4101-8101-010101010101';
    const MISSING = '02020202-0202-4202-8202-020202020202';
    await seedA();
    const { publicKey, privateKey } = A;

    /** V1 file: AES file key + IV RSA-encrypted in secured_meta (the old upload path). */
    const v1 = async (title: string, bytes: Uint8Array) => {
      const key = await generateFileKey();
      const { iv, ciphertext } = await encryptFile(new Blob([bytes as BlobPart]), key);
      const meta = await encryptMetadata({ title, fileKey: await crypto.subtle.exportKey('jwk', key), iv }, publicKey);
      return { iv, meta, blob: await ciphertext.arrayBuffer() };
    };
    const base = { owner_id: 'A', visibility: 'private', public_meta: {} };
    const img1 = await v1(`.canvas-img-el1`, PNG);
    files.set(OLDIMG, { ...base, id: OLDIMG, type: 'canvas-asset', parent_id: KONZEPT, metadata: {}, secured_meta: img1.meta, blob: img1.blob });
    const img2 = await v1(`.canvas-img-el2`, JPG);
    files.set(OLDIMG2, { ...base, id: OLDIMG2, type: 'canvas-asset', parent_id: SIDENOTE, metadata: {}, secured_meta: img2.meta, blob: img2.blob });
    const img3 = await v1('.canvas-img-el3', PNG);
    files.set(CANVASIMG, { ...base, id: CANVASIMG, type: 'note', parent_id: KONZEPT, version: 1, metadata: {}, secured_meta: img3.meta, blob: img3.blob });
    const oldNote = await v1('Alt', new TextEncoder().encode(JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'aus V1' }] }] })));
    files.set(V1NOTE, { ...base, id: V1NOTE, type: 'note', parent_id: null, version: 1, metadata: {}, secured_meta: oldNote.meta, blob: oldNote.blob });

    // Note with an old image element (key on the element) and a reference to an image file that no longer exists.
    const kDek = await createFile({ id: KONZEPT, type: 'note', parentId: null, publicMeta: {}, metadata: { title: 'Konzept' }, securedMeta: { title: 'Konzept' }, content: '{"type":"doc","content":[]}' }, publicKey, privateKey, 'A');
    const kd = new Y.Doc();
    const legacyEl = new Y.Map<unknown>();
    for (const [k, v] of Object.entries({ id: 'el1', type: 'image', blobId: OLDIMG, encryptedKey: img1.meta, iv: img1.iv, mimeType: 'image/png', anchorBlockId: 'b1' })) legacyEl.set(k, v);
    kd.getMap<Y.Map<unknown>>('overlay').set('el1', legacyEl);
    kd.getMap('assets').set(MISSING, { assetId: MISSING, bekBase64: 'AAAA', ivBase64: 'AAAA', mimeType: 'image/png' });
    await writeSnapshot(KONZEPT, kDek!, Y.encodeStateAsUpdate(kd));

    // Note whose drawing still lives in its old public style sidecar (plain JSON, as useStyleFile wrote it).
    const sDek = await createFile({ id: SIDENOTE, type: 'note', parentId: null, publicMeta: {}, metadata: { title: 'Zeichnung' }, securedMeta: { title: 'Zeichnung' }, content: '{"type":"doc","content":[]}' }, publicKey, privateKey, 'A');
    await writeSnapshot(SIDENOTE, sDek!, Y.encodeStateAsUpdate(new Y.Doc()));
    const sidecar = { version: 1, noteId: SIDENOTE, strokes: [{ id: 's1', points: [{ x: 1, y: 2 }] }], elements: [{ id: 'el2', type: 'image', blobId: OLDIMG2, encryptedKey: img2.meta, iv: img2.iv, mimeType: 'image/jpeg' }] };
    files.set(SIDECAR, { ...base, id: SIDECAR, type: 'note', parent_id: null, visibility: 'public', public_meta: { title: `.${SIDENOTE}_style` }, metadata: {}, secured_meta: '', blob: JSON.stringify(sidecar) });

    // Note written by the external API: plain Markdown although an access key exists; live doc under the public key.
    await createFile({ id: PATCH, type: 'note', parentId: null, publicMeta: {}, metadata: { title: 'Patch 12.11.26-16:21' }, securedMeta: { title: 'Patch' }, content: 'x' }, publicKey, privateKey, 'A');
    Object.assign(files.get(PATCH)!, { metadata: { ...files.get(PATCH)!.metadata, unencrypted: true, author: 'external_api' }, secured_meta: '', blob: '- Punkt eins\n- Punkt zwei' });
    const pd = new Y.Doc();
    pd.getMap('overlay').set('s9', { id: 's9', points: [] });
    await writeSnapshot(PATCH, await derivePublicNoteDEK(PATCH), Y.encodeStateAsUpdate(pd));

    // Event from the external API: no access keys, no blob, everything in plain metadata.
    files.set(YOGA, {
      ...base, id: YOGA, type: 'event', parent_id: TAG, version: 2, secured_meta: '', access_keys: {},
      metadata: { unencrypted: true, author: 'external_api', title: 'Yoga', start: '2026-05-01T08:00:00.000Z', end: '2026-05-01T09:00:00.000Z', recurrence_rule: 'FREQ=WEEKLY', exdates: ['2026-05-08'], removed_dates: ['2026-05-15'], groupIds: [TAG] },
    });
    // Event saved without a session user id: its key sits under "".
    await createFile({ id: EMPTYKEY, type: 'event', parentId: null, publicMeta: {}, metadata: { title: 'Zahnarzt', start: '2026-06-01T08:00:00.000Z' }, securedMeta: { title: 'Zahnarzt' }, content: JSON.stringify({ title: 'Zahnarzt', description: 'Kontrolle' }) }, publicKey, privateKey, 'A');
    const ek = files.get(EMPTYKEY)!;
    ek.access_keys = { '': (ek.access_keys as Record<string, unknown>).A };
    // Folder whose secured_meta was encrypted for another key.
    files.set(OLDFOLDER, { ...base, id: OLDFOLDER, type: 'folder', parent_id: null, metadata: { title: 'Mai-Ordner' }, secured_meta: await encryptMetadata({ title: 'Mai-Ordner' }, B.publicKey) });

    login('A', A, tasksA());
    const { manifest, blob } = await exportVault();
    const z = await zipOf(blob);
    const tree = treeOf(z) as unknown as VaultFileRecord[];
    const rec = (id: string) => tree.find((f) => f.id === id)!;

    expect(manifest.failures.map((f) => f.kind)).toEqual(['asset-missing']);
    expect(manifest.failures[0]).toMatchObject({ id: KONZEPT, title: 'Konzept' });
    expect(manifest.failures[0].error).toContain('existiert auf dem Server nicht mehr');
    expect(manifest.warnings?.map((w) => w.kind)).toEqual(['meta-unreadable']);
    expect(rec(OLDFOLDER).securedMetaRaw).toBeTruthy();
    expect(rec(OLDFOLDER).title).toBe('Mai-Ordner');
    const notices = new Set(manifest.notices?.map((n) => n.kind));
    for (const k of ['plaintext-note', 'helper-file', 'legacy-format', 'plaintext-event', 'unassigned-asset']) expect(notices).toContain(k);
    expect(manifest.summary?.find((s) => s.kind === 'plaintext-event')).toMatchObject({ count: 1, byType: { event: 1 } });

    expect(rec(KONZEPT).assets).toEqual([expect.objectContaining({ assetId: OLDIMG, legacy: true })]);
    expect(rec(SIDENOTE).assets).toEqual([expect.objectContaining({ assetId: OLDIMG2, legacy: true })]);
    expect(rec(SIDECAR).role).toBe('helper');
    expect(tree.some((f) => f.id === CANVASIMG)).toBe(false);
    expect(manifest.unassignedAssets).toEqual([expect.objectContaining({ assetId: CANVASIMG, parentId: KONZEPT, parentTitle: 'Konzept', mimeType: 'image/png' })]);
    expect([...z.get(`assets/${CANVASIMG}.png`)!]).toEqual([...PNG]);
    expect(new TextDecoder().decode(z.get(`content/${PATCH}.txt`))).toBe('- Punkt eins\n- Punkt zwei');
    expect(z.has(`ydoc/${PATCH}.bin`)).toBe(true);
    expect(new TextDecoder().decode(z.get(`content/${V1NOTE}.json`))).toContain('aus V1');
    expect(new TextDecoder().decode(z.get(`content/${EMPTYKEY}.json`))).toContain('Kontrolle');
    expect(new TextDecoder().decode(z.get('lesbar/PROBLEME.txt'))).toContain('ECHTE VERLUSTE');
    const ics = new TextDecoder().decode(z.get('lesbar/kalender.ics'));
    expect(ics).toContain('SUMMARY:Yoga');
    expect(ics).toContain('RRULE:FREQ=WEEKLY');
    expect(ics).toContain('EXDATE:2026051');
    expect(ics).toContain('CATEGORIES:Uni');
    expect(ics).toMatch(/RECURRENCE-ID:20260508T\d{6}Z/);

    login('B', B);
    const report = await importVault(new Uint8Array(await blob.arrayBuffer()), { intoFolder: false });
    expect(report.failures).toEqual([]);
    expect(report.exportFailures).toBe(1);
    expect(report.created.note).toBe(5); // Tokyo, Konzept, Zeichnung, Alt, Patch (the sidecar is merged, not created)
    expect(report.images).toBe(4);
    const mine = [...files.values()].filter((f) => f.owner_id === 'B');
    const byTitle = (t: string) => mine.find((f) => f.metadata?.title === t)!;

    const zeichnung = byTitle('Zeichnung');
    const zdoc = (await readYDoc(zeichnung.id, await unwrapFileDek(zeichnung, 'B', B.privateKey)))!;
    const overlay = zdoc.getMap<Y.Map<unknown>>('overlay');
    expect(overlay.has('s1')).toBe(true);
    const el2 = overlay.get('el2')!;
    expect(el2.get('encryptedKey')).toBe('');
    const ref2 = { assetId: el2.get('blobId') as string, bekBase64: el2.get('bek') as string, ivBase64: el2.get('iv') as string, mimeType: 'image/jpeg' };
    expect([...(await readAsset(ref2))]).toEqual([...JPG]);

    const konzept = byTitle('Konzept');
    const kdoc = (await readYDoc(konzept.id, await unwrapFileDek(konzept, 'B', B.privateKey)))!;
    const el1 = kdoc.getMap<Y.Map<unknown>>('overlay').get('el1')!;
    expect([...(await readAsset({ assetId: el1.get('blobId') as string, bekBase64: el1.get('bek') as string, ivBase64: el1.get('iv') as string, mimeType: 'image/png' }))]).toEqual([...PNG]);

    const patch = byTitle('Patch 12.11.26-16:21');
    expect(patch.metadata.unencrypted).toBeUndefined();
    expect(await readContentText(patch.id, await unwrapFileDek(patch, 'B', B.privateKey))).toContain('Punkt eins');
    const yoga = byTitle('Yoga');
    expect(yoga.metadata).toMatchObject({ recurrence_rule: 'FREQ=WEEKLY', exdates: ['2026-05-08'], removed_dates: ['2026-05-15'] });
    expect(yoga.metadata.unencrypted).toBeUndefined();
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
