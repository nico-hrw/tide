import { describe, expect, it } from 'vitest';
import { createZip, crc32, readZip } from '../zip';

const enc = new TextEncoder();

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
  });

  it('round-trips entries incl. UTF-8 names and binary data', async () => {
    const bin = new Uint8Array([0, 1, 2, 255, 254]);
    const blob = createZip([
      { path: 'a/ü Ö.txt', data: enc.encode('hallo') },
      { path: 'b.bin', data: bin },
      { path: 'empty', data: new Uint8Array(0) },
    ]);
    const back = readZip(new Uint8Array(await blob.arrayBuffer()));
    expect(back.map((e) => e.path)).toEqual(['a/ü Ö.txt', 'b.bin', 'empty']);
    expect(new TextDecoder().decode(back[0].data)).toBe('hallo');
    expect([...back[1].data]).toEqual([...bin]);
    expect(back[2].data.length).toBe(0);
  });

  it('rejects duplicate and escaping paths', () => {
    const d = new Uint8Array(1);
    expect(() => createZip([{ path: 'x', data: d }, { path: 'x', data: d }])).toThrow(/Doppelter/);
    expect(() => createZip([{ path: '../x', data: d }])).toThrow(/Ungültiger/);
  });

  it('detects a corrupted entry', async () => {
    const bytes = new Uint8Array(await createZip([{ path: 'x', data: enc.encode('abcdef') }]).arrayBuffer());
    bytes[30 + 1 + 2] ^= 0xff; // flip a data byte
    expect(() => readZip(bytes)).toThrow(/Prüfsumme/);
  });
});
