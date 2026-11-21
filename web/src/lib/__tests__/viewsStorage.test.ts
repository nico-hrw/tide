import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

interface FakeFile { id: string; type: string; owner_id?: string; blob_path?: string | null; content_ciphertext?: string; access_keys?: unknown; metadata?: unknown }
const server = vi.hoisted(() => ({ files: [] as FakeFile[], calls: [] as string[], seq: 0 }));

vi.mock('../api', () => ({
  apiFetch: vi.fn(async (url: string, opts: RequestInit = {}) => {
    const method = (opts.method ?? 'GET').toUpperCase();
    server.calls.push(`${method} ${url}`);
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
    if (method === 'GET' && url.startsWith('/api/v1/files?')) {
      const type = new URL(url, 'http://x').searchParams.get('type');
      return json(server.files.filter((f) => f.type === type).map((f) => ({ ...f, content_ciphertext: undefined, blob_path: `blobs/${f.id}` })));
    }
    const dl = /^\/api\/v1\/files\/(\w+)\/download$/.exec(url);
    if (method === 'GET' && dl) {
      const f = server.files.find((x) => x.id === dl[1])!;
      return { ok: true, status: 200, text: async () => f.content_ciphertext ?? '' } as Response;
    }
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

import { createApiViewsStorage, VIEWS_FILE_TYPE, type SavedView } from '../viewsStorage';

const view = (id: string): SavedView => ({ id, name: `V${id}`, tagIds: ['t1'], untagged: false, viewMode: 'week' });

describe('createApiViewsStorage', () => {
  let keys: { privateKey: CryptoKey; publicKey: CryptoKey; userId: string };
  beforeAll(async () => {
    const kp = (await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt'])) as CryptoKeyPair;
    keys = { privateKey: kp.privateKey, publicKey: kp.publicKey, userId: 'u1' };
  });
  beforeEach(() => { server.files = []; server.calls = []; server.seq = 0; });

  it('loads [] when no file exists', async () => {
    expect(await createApiViewsStorage(() => keys).load()).toEqual([]);
  });

  it('creates a file of type views on first save, updates afterwards, round-trips encrypted', async () => {
    const s = createApiViewsStorage(() => keys);
    await s.save([view('1')]);
    await s.save([view('1'), view('2')]);
    expect(server.files).toHaveLength(1);
    expect(server.files[0].type).toBe(VIEWS_FILE_TYPE);
    expect(server.files[0].content_ciphertext).not.toContain('V1');
    expect(server.calls.filter((c) => c.startsWith('PUT '))).toHaveLength(1);
    expect(await createApiViewsStorage(() => keys).load()).toEqual([view('1'), view('2')]);
  });
});
