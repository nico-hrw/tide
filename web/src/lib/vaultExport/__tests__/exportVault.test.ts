import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { encryptFileV2 } from '@/lib/cryptoV2';
import { encryptMetadata } from '@/lib/crypto';
import { encryptSnapshot } from '@/lib/e2eeFraming';
import { encryptAssetWithNewBEK } from '@/lib/assetCrypto';
import { useDataStore } from '@/store/useDataStore';
import { unwrapFileDek } from '../readFile';
import { readZip } from '../zip';

const routes = new Map<string, () => Response>();
vi.mock('@/lib/api', () => ({
  apiFetch: async (url: string) => {
    const route = routes.get(url);
    return route ? route() : new Response('not found', { status: 404 });
  },
}));

const { exportVault } = await import('../exportVault');

const ME = 'me';
const text = (b: Uint8Array) => new TextDecoder().decode(b);
const asFile = (entries: ReturnType<typeof readZip>) => (path: string) => entries.find((e) => e.path === path);

let publicKey: CryptoKey;
let privateKey: CryptoKey;
const imageBytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);

async function encryptedNote(id: string, title: string, doc: unknown, ydoc?: Y.Doc) {
  const v2 = await encryptFileV2(JSON.stringify(doc), publicKey);
  const file = {
    id, type: 'note', owner_id: ME, parent_id: 'folder1', version: 2, visibility: 'private',
    public_meta: {}, metadata: { ...v2.metadata, title }, access_keys: { [ME]: v2.encrypted_dek },
    secured_meta: await encryptMetadata({ title }, publicKey),
  };
  routes.set(`/api/v1/files/${id}/download`, () => new Response(v2.content_ciphertext));
  if (ydoc) {
    const dek = await unwrapFileDek(file, ME, privateKey);
    const snap = await encryptSnapshot(id, 1, dek, Y.encodeStateAsUpdate(ydoc));
    routes.set(`/api/v1/files/${id}/crdt-state`, () =>
      Response.json({ snapshot_iv: snap.ivBase64, snapshot_ciphertext: snap.ciphertextBase64, key_epoch: 1, wal: [] }));
  }
  return file;
}

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt'],
  );
  publicKey = pair.publicKey;
  privateKey = pair.privateKey;
});

beforeEach(() => {
  routes.clear();
  useDataStore.setState({
    privateKey, publicKey, myId: ME, loadAllMetadata: async () => {},
    tasks: [{ id: 't1', title: 'Koffer packen', isCompleted: false }],
  } as never);
});

describe('exportVault', () => {
  it('exports notes with images from the Yjs doc, events, folders and todos, and reports gaps', async () => {
    const asset = await encryptAssetWithNewBEK(new Blob([imageBytes], { type: 'image/png' }));
    routes.set('/api/v1/files/asset1/download', () => new Response(asset.encryptedBlob));
    const ydoc = new Y.Doc();
    ydoc.getMap('assets').set('asset1', { assetId: 'asset1', bekBase64: asset.bekBase64, ivBase64: asset.ivBase64, mimeType: 'image/png' });

    const editor = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Tag 1 in Tokyo' }] }] };
    const note = await encryptedNote('note1', 'Tokyo', editor, ydoc);
    const broken = { ...(await encryptedNote('note2', 'Kaputt', editor)), access_keys: { [ME]: { wrapped_key: 'AAAA' } } };

    const evBody = { title: 'Flug', description: 'Gate 4', location: 'HND' };
    const evV2 = await encryptFileV2(JSON.stringify(evBody), publicKey);
    routes.set('/api/v1/files/ev1/download', () => new Response(evV2.content_ciphertext));
    const event = {
      id: 'ev1', type: 'event', owner_id: ME, parent_id: null, version: 2, visibility: 'private', public_meta: {},
      metadata: { ...evV2.metadata, title: 'Flug', start: '2026-05-01T08:00:00.000Z', end: '2026-05-01T10:00:00.000Z' },
      access_keys: { [ME]: evV2.encrypted_dek }, secured_meta: await encryptMetadata({ title: 'Flug' }, publicKey),
    };
    const folder = { id: 'folder1', type: 'folder', owner_id: ME, parent_id: null, version: 2, visibility: 'private', public_meta: {}, metadata: { title: 'Japan' }, secured_meta: '' };
    const foreign = { id: 'other1', type: 'note', owner_id: 'someone', parent_id: null, metadata: { title: 'Fremd' } };
    const orphan = { id: 'orphan1', type: 'canvas-asset', owner_id: ME, parent_id: 'note1' };

    routes.set('/api/v1/files?recursive=true', () => Response.json([folder, note, broken, foreign, orphan]));
    routes.set('/api/v1/files?type=event&recursive=true', () => Response.json([event]));

    const { blob, filename, manifest } = await exportVault();
    const zip = asFile(readZip(new Uint8Array(await blob.arrayBuffer())));

    expect(filename).toMatch(/^tide-export-\d{4}-\d{2}-\d{2}\.zip$/);
    expect(manifest.counts).toEqual({ folder: 1, note: 2, event: 1 });
    expect(manifest.assetCount).toBe(1);
    expect(manifest.taskCount).toBe(1);
    expect(manifest.containsPlaintext).toBe(true);

    // note content, ydoc state and the decrypted original image
    expect(JSON.parse(text(zip('content/note1.json')!.data))).toEqual(editor);
    const restored = new Y.Doc();
    Y.applyUpdate(restored, zip('ydoc/note1.bin')!.data);
    expect(restored.getMap('assets').get('asset1')).toMatchObject({ assetId: 'asset1' });
    expect([...zip('assets/asset1.png')!.data]).toEqual([...imageBytes]);

    // tree keeps old ids, parents and decrypted titles
    const tree = JSON.parse(text(zip('tree.json')!.data)) as { files: Array<{ id: string; title: string; parentId: string | null; assets: unknown[] }> };
    expect(tree.files.find((f) => f.id === 'note1')).toMatchObject({ title: 'Tokyo', parentId: 'folder1' });
    expect(tree.files.find((f) => f.id === 'note1')!.assets).toHaveLength(1);

    // readable parts
    expect(text(zip('lesbar/notizen/Japan/Tokyo.md')!.data)).toContain('Tag 1 in Tokyo');
    const ics = text(zip('lesbar/kalender.ics')!.data);
    expect(ics).toContain('SUMMARY:Flug');
    expect(ics).toContain('LOCATION:HND');
    expect(text(zip('lesbar/todos.md')!.data)).toContain('Koffer packen');
    expect(zip('tasks.json')).toBeDefined();

    // gaps are reported, never silent
    expect(manifest.failures.some((f) => f.id === 'note2' && f.part === 'content')).toBe(true);
    expect(manifest.skipped.map((s) => s.id)).toEqual(['other1']);
    // an image no note references and whose key lives nowhere else: reported as a notice, not as a loss
    expect(manifest.notices?.find((n) => n.id === 'orphan1')).toMatchObject({ kind: 'orphan-asset', severity: 'info' });
    expect(manifest.summary?.[0]).toMatchObject({ severity: 'loss' });
  });

  it('records a note whose CRDT state cannot be decrypted instead of dropping it silently', async () => {
    const note = await encryptedNote('note3', 'Halb', { type: 'doc', content: [] });
    routes.set('/api/v1/files/note3/crdt-state', () => Response.json({ snapshot_iv: 'AAAAAAAAAAAAAAAA', snapshot_ciphertext: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', key_epoch: 1, wal: [] }));
    routes.set('/api/v1/files?recursive=true', () => Response.json([note]));
    routes.set('/api/v1/files?type=event&recursive=true', () => Response.json([]));

    const { manifest } = await exportVault();
    expect(manifest.counts.note).toBe(1);
    expect(manifest.failures.map((f) => f.part)).toContain('ydoc');
    const ydocFailure = manifest.failures.find((f) => f.part === 'ydoc')!;
    expect(ydocFailure.kind).toBe('ydoc-unreadable');
    expect(ydocFailure.error).toMatch(/Notiz-Zustand nicht entschlüsselbar: \S+/);
    expect(ydocFailure.error).toContain('note3');
  });

  it('keeps a blob that is not an encrypted envelope as raw text and converts it for notes', async () => {
    const note = await encryptedNote('note4', 'Liste', { type: 'doc', content: [] });
    routes.set('/api/v1/files/note4/download', () => new Response('- eins\n- zwei'));
    routes.set('/api/v1/files?recursive=true', () => Response.json([note]));
    routes.set('/api/v1/files?type=event&recursive=true', () => Response.json([]));
    const { blob, manifest } = await exportVault();
    const zip = asFile(readZip(new Uint8Array(await blob.arrayBuffer())));
    expect(text(zip('content/note4.txt')!.data)).toBe('- eins\n- zwei');
    expect(text(zip('content/note4.json')!.data)).toContain('eins');
    expect(manifest.failures).toEqual([]);
    expect(manifest.warnings?.map((w) => w.kind)).toEqual(['raw-text']);
    expect(manifest.warnings?.[0].error).toContain('"- eins');
  });

  it('reports an event whose key belongs to another account as missing details, not as a loss', async () => {
    const other = await crypto.subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt'],
    );
    const v2 = await encryptFileV2(JSON.stringify({ title: 'Kurs' }), other.publicKey);
    const event = {
      id: 'ev2', type: 'event', owner_id: ME, parent_id: null, version: 2, visibility: 'private', public_meta: {},
      metadata: { title: 'Kurs', start: '2026-05-01T00:00:00.000Z', end: '2026-05-01T00:00:00.000Z', allDay: true, description: 'Raum 3' },
      access_keys: { someoneElse: v2.encrypted_dek }, secured_meta: await encryptMetadata({ title: 'Kurs' }, publicKey),
    };
    routes.set('/api/v1/files/ev2/download', () => new Response(v2.content_ciphertext));
    routes.set('/api/v1/files?recursive=true', () => Response.json([]));
    routes.set('/api/v1/files?type=event&recursive=true', () => Response.json([event]));
    const { blob, manifest } = await exportVault();
    expect(manifest.failures).toEqual([]);
    expect(manifest.warnings).toEqual([expect.objectContaining({ id: 'ev2', kind: 'event-details-unreadable', severity: 'partial' })]);
    expect(manifest.warnings?.[0].error).toContain('inkl. Beschreibung');
    const ics = text(asFile(readZip(new Uint8Array(await blob.arrayBuffer())))('lesbar/kalender.ics')!.data);
    expect(ics).toContain('DESCRIPTION:Raum 3');
    expect(ics).toMatch(/DTEND;VALUE=DATE:2026050[12]/);
  });

  it('treats a missing blob as normal for events (todo calendar entries) and skips the rebuilt index', async () => {
    const todoEvent = {
      id: 'ev-todo', type: 'event', owner_id: ME, parent_id: null, version: 2, visibility: 'private', public_meta: {},
      metadata: { has_custom_password: false, title: 'Koffer', is_task: true, linkedTaskId: 't1', start: '2026-05-01T00:00:00.000Z' },
      access_keys: { [ME]: (await encryptFileV2('{}', publicKey)).encrypted_dek }, secured_meta: await encryptMetadata({ title: 'Koffer' }, publicKey),
    };
    const index = { id: 'idx1', type: 'index', owner_id: ME, parent_id: null, version: 2, metadata: {}, secured_meta: '' };
    routes.set('/api/v1/files?recursive=true', () => Response.json([index]));
    routes.set('/api/v1/files?type=event&recursive=true', () => Response.json([todoEvent]));
    // no download route -> 404, like the real server for a blob-less event

    const { manifest } = await exportVault();
    expect(manifest.counts).toEqual({ event: 1 });
    expect(manifest.failures).toEqual([]);
    expect(manifest.skipped.map((x) => x.id)).toEqual(['idx1']);
  });

  it('still reports a note whose blob is missing', async () => {
    const note = await encryptedNote('note9', 'Leer', { type: 'doc', content: [] });
    routes.delete('/api/v1/files/note9/download');
    routes.set('/api/v1/files?recursive=true', () => Response.json([note]));
    routes.set('/api/v1/files?type=event&recursive=true', () => Response.json([]));
    const { manifest } = await exportVault();
    expect(manifest.failures.map((f) => f.part)).toContain('content');
  });

  it('refuses to run without a key', async () => {
    useDataStore.setState({ privateKey: null } as never);
    await expect(exportVault()).rejects.toThrow(/Schlüssel/);
  });
});
