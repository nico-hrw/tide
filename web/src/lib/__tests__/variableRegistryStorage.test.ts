import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

interface FakeFile {
  id: string;
  type: string;
  owner_id?: string;
  blob_path?: string | null;
  content_ciphertext?: string;
  inline_ciphertext?: boolean;
  access_keys?: unknown;
  metadata?: unknown;
}
const server = vi.hoisted(() => ({ files: [] as FakeFile[], calls: [] as string[], seq: 0 }));

vi.mock('../api', () => ({
  apiFetch: vi.fn(async (url: string, opts: RequestInit = {}) => {
    const method = (opts.method ?? 'GET').toUpperCase();
    server.calls.push(`${method} ${url}`);
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
    if (method === 'GET' && url.startsWith('/api/v1/files?')) {
      return json(
        server.files
          .filter((f) => f.type === 'variables')
          .map((f) => ({
            id: f.id,
            type: f.type,
            owner_id: f.owner_id,
            access_keys: f.access_keys,
            metadata: f.metadata,
            blob_path: f.blob_path !== undefined ? f.blob_path : (f.content_ciphertext ? `blobs/${f.id}` : null),
            ...(f.inline_ciphertext ? { content_ciphertext: f.content_ciphertext } : {}),
          }))
      );
    }
    if (method === 'GET' && url.includes('/download')) {
      const dl = /^\/api\/v1\/files\/(\w+)\/download$/.exec(url);
      const file = dl ? server.files.find((f) => f.id === dl[1]) : undefined;
      if (!file || !file.content_ciphertext) {
        return { ok: false, status: 404, text: async () => '' } as Response;
      }
      return { ok: true, status: 200, text: async () => file.content_ciphertext ?? '' } as Response;
    }
    if (method === 'POST' && url === '/api/v1/files') {
      const body = JSON.parse(String(opts.body));
      const f: FakeFile = { id: `f${++server.seq}`, type: body.type, access_keys: body.access_keys, metadata: body.metadata };
      server.files.push(f);
      return json({ id: f.id });
    }
    const up = /^\/api\/v1\/files\/(\w+)\/upload$/.exec(url);
    if (method === 'POST' && up) {
      const file = server.files.find((f) => f.id === up[1])!;
      file.content_ciphertext = String(opts.body);
      file.blob_path = `blobs/${file.id}`;
      return json({});
    }
    const put = /^\/api\/v1\/files\/(\w+)$/.exec(url);
    if (method === 'PUT' && put) { Object.assign(server.files.find((f) => f.id === put[1])!, JSON.parse(String(opts.body))); return json({}); }
    throw new Error(`unexpected ${method} ${url}`);
  }),
}));

import { createApiRegistryStorage, REGISTRY_FILE_TYPE } from '../variableRegistryStorage';
import type { RegistryEntry } from '../variableRegistry';

const entry = (name: string, noteId: string | null): RegistryEntry => ({ name, expr: '1', global: true, sourceNoteId: noteId });

describe('createApiRegistryStorage', () => {
  let keys: { privateKey: CryptoKey; publicKey: CryptoKey; userId: string };
  let other: { privateKey: CryptoKey; publicKey: CryptoKey; userId: string };

  beforeAll(async () => {
    const gen = async (userId: string) => {
      const kp = (await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt'])) as CryptoKeyPair;
      return { privateKey: kp.privateKey, publicKey: kp.publicKey, userId };
    };
    keys = await gen('u1');
    other = await gen('u2');
  });

  beforeEach(() => { server.files = []; server.calls = []; server.seq = 0; });

  it('returns an empty registry when no file exists yet', async () => {
    const s = createApiRegistryStorage(() => keys);
    expect(await s.load()).toEqual([]);
  });

  it('creates the file on first save and updates it afterwards; content is encrypted', async () => {
    const s = createApiRegistryStorage(() => keys);
    await s.save([entry('zins', 'n1')]);
    expect(server.files).toHaveLength(1);
    expect(server.files[0].type).toBe(REGISTRY_FILE_TYPE);
    expect(server.files[0].content_ciphertext).not.toContain('zins');
    await s.save([entry('zins', 'n1'), entry('kurs', null)]);
    expect(server.files).toHaveLength(1);
    expect(server.calls.filter((c) => c.startsWith('PUT '))).toHaveLength(1);
    expect(await createApiRegistryStorage(() => keys).load()).toEqual([entry('zins', 'n1'), entry('kurs', null)]);
  });

  it('drops malformed entries when loading', async () => {
    const s = createApiRegistryStorage(() => keys);
    await s.save([entry('ok', 'n1'), { name: '', expr: '1', global: true, sourceNoteId: 'n1' }, { name: 'x', expr: 5 } as unknown as RegistryEntry]);
    expect((await s.load()).map((e) => e.name)).toEqual(['ok']);
  });

  it('throws when the keys are not available yet', async () => {
    await expect(createApiRegistryStorage(() => null).load()).rejects.toThrow();
  });

  it('throws instead of returning an empty list when decryption fails (so nothing gets overwritten)', async () => {
    await createApiRegistryStorage(() => keys).save([entry('zins', 'n1')]);
    await expect(createApiRegistryStorage(() => other).load()).rejects.toThrow();
  });

  it('serialises concurrent first saves into a single file', async () => {
    const s = createApiRegistryStorage(() => keys);
    await Promise.all([s.save([entry('a', 'n1')]), s.save([entry('a', 'n1'), entry('b', 'n1')])]);
    expect(server.files).toHaveLength(1);
  });

  it('picks the user own file when foreign owner_id files are also returned', async () => {
    await createApiRegistryStorage(() => other).save([entry('foreign', 'n9')]);
    server.files[0].owner_id = other.userId;

    await createApiRegistryStorage(() => keys).save([entry('mine', 'n1')]);
    server.files[1].owner_id = keys.userId;

    expect(await createApiRegistryStorage(() => keys).load()).toEqual([entry('mine', 'n1')]);
  });

  it('ignores foreign-only files on load without decrypting or overwriting them, and creates a new owned file on save', async () => {
    await createApiRegistryStorage(() => other).save([entry('foreign', 'n9')]);
    server.files[0].owner_id = other.userId;
    const foreignCipher = server.files[0].content_ciphertext;

    const s = createApiRegistryStorage(() => keys);
    expect(await s.load()).toEqual([]);

    await s.save([entry('mine', 'n1')]);
    expect(server.files).toHaveLength(2);
    expect(server.calls.filter((c) => c.startsWith('PUT '))).toHaveLength(0);
    expect(server.files[0].content_ciphertext).toBe(foreignCipher);
    expect(Object.keys(server.files[1].access_keys as Record<string, unknown>)).toEqual([keys.userId]);
    expect(await createApiRegistryStorage(() => keys).load()).toEqual([entry('mine', 'n1')]);
    expect(await createApiRegistryStorage(() => other).load()).toEqual([entry('foreign', 'n9')]);
  });

  it('downloads ciphertext from /api/v1/files/:id/download when omitted from metadata list', async () => {
    await createApiRegistryStorage(() => keys).save([entry('rate', 'n1')]);
    server.calls = [];

    expect(await createApiRegistryStorage(() => keys).load()).toEqual([entry('rate', 'n1')]);
    expect(server.calls).toContain(`GET /api/v1/files/${server.files[0].id}/download`);
  });

  it('uses content_ciphertext directly without downloading when present in metadata (backwards compatibility)', async () => {
    await createApiRegistryStorage(() => keys).save([entry('inlineVar', 'n2')]);
    server.files[0].inline_ciphertext = true;
    server.calls = [];

    expect(await createApiRegistryStorage(() => keys).load()).toEqual([entry('inlineVar', 'n2')]);
    expect(server.calls.some((c) => c.includes('/download'))).toBe(false);
  });

  it('returns an empty list when download returns 404 and blob_path is missing', async () => {
    server.files.push({ id: 'f_empty', type: REGISTRY_FILE_TYPE, owner_id: keys.userId, blob_path: null });
    expect(await createApiRegistryStorage(() => keys).load()).toEqual([]);
  });

  it('applies queued saves in order (last save wins)', async () => {
    const s = createApiRegistryStorage(() => keys);
    await Promise.all([s.save([entry('a', 'n1')]), s.save([entry('b', 'n1')]), s.save([entry('c', 'n1')])]);
    expect(server.files).toHaveLength(1);
    expect(await createApiRegistryStorage(() => keys).load()).toEqual([entry('c', 'n1')]);
  });

  it('a failed save does not block later saves', async () => {
    let locked = true;
    const s = createApiRegistryStorage(() => (locked ? null : keys));
    await expect(s.save([entry('a', 'n1')])).rejects.toThrow();
    locked = false;
    await s.save([entry('b', 'n1')]);
    expect(await createApiRegistryStorage(() => keys).load()).toEqual([entry('b', 'n1')]);
  });
});
