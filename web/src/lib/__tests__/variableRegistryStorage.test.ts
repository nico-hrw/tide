import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

interface FakeFile { id: string; type: string; content_ciphertext?: string; access_keys?: unknown; metadata?: unknown }
const server = vi.hoisted(() => ({ files: [] as FakeFile[], calls: [] as string[], seq: 0 }));

vi.mock('../api', () => ({
  apiFetch: vi.fn(async (url: string, opts: RequestInit = {}) => {
    const method = (opts.method ?? 'GET').toUpperCase();
    server.calls.push(`${method} ${url}`);
    const json = (body: unknown) => ({ ok: true, json: async () => body }) as Response;
    if (method === 'GET' && url.startsWith('/api/v1/files?type=variables')) return json(server.files.filter((f) => f.type === 'variables'));
    if (method === 'POST' && url === '/api/v1/files') {
      const body = JSON.parse(String(opts.body));
      const f: FakeFile = { id: `f${++server.seq}`, type: body.type, access_keys: body.access_keys, metadata: body.metadata };
      server.files.push(f);
      return json({ id: f.id });
    }
    const up = /^\/api\/v1\/files\/(\w+)\/upload$/.exec(url);
    if (method === 'POST' && up) { server.files.find((f) => f.id === up[1])!.content_ciphertext = String(opts.body); return json({}); }
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
});
