import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { rewriteJson, rewriteString, rewriteYDoc, type RewriteContext } from '../rewriteIds';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const IMG_OLD = '33333333-3333-4333-8333-333333333333';
const IMG_NEW = '44444444-4444-4444-8444-444444444444';
const NOTE_NEW = '55555555-5555-4555-8555-555555555555';

const ctx = (): RewriteContext => ({
  ids: new Map([[A, NOTE_NEW], [IMG_OLD, IMG_NEW]]),
  assets: new Map([[IMG_OLD, { assetId: IMG_NEW, bekBase64: 'NEWBEK', ivBase64: 'NEWIV', mimeType: 'image/png' }]]),
});

describe('rewriteIds', () => {
  it('replaces known ids inside strings and leaves unknown ones', () => {
    expect(rewriteString(`tide://note/${A} und ${B}`, ctx().ids)).toBe(`tide://note/${NOTE_NEW} und ${B}`);
  });

  it('rewrites JSON deeply, incl. keys, and swaps asset keys', () => {
    const out = rewriteJson(
      { link: `tide://note/${A}`, list: [A, 'x'], [IMG_OLD]: { assetId: IMG_OLD, bekBase64: 'OLD', ivBase64: 'OLDIV', mimeType: 'image/png' } },
      ctx(),
    );
    expect(out.link).toBe(`tide://note/${NOTE_NEW}`);
    expect(out.list).toEqual([NOTE_NEW, 'x']);
    expect(out[IMG_NEW as keyof typeof out]).toEqual({ assetId: IMG_NEW, bekBase64: 'NEWBEK', ivBase64: 'NEWIV', mimeType: 'image/png' });
  });

  it('does not mutate its input', () => {
    const input = { a: A };
    rewriteJson(input, ctx());
    expect(input.a).toBe(A);
  });

  it('rewrites a Yjs document: assets map key and record, canvas element, editor attrs', () => {
    const doc = new Y.Doc();
    doc.getMap('assets').set(IMG_OLD, { assetId: IMG_OLD, bekBase64: 'OLD', ivBase64: 'OLDIV', mimeType: 'image/png' });
    const el = new Y.Map<unknown>();
    el.set('blobId', IMG_OLD);
    el.set('bek', 'OLD');
    el.set('iv', 'OLDIV');
    el.set('offsetX', 12);
    const canvas = doc.getMap<Y.Map<unknown>>('canvas');
    canvas.set('el1', el);
    const frag = doc.getXmlFragment('prosemirror');
    const image = new Y.XmlElement('image');
    image.setAttribute('assetId', IMG_OLD);
    image.setAttribute('href', `tide://note/${A}`);
    frag.insert(0, [image]);

    // survive an encode/decode round trip like the real import does
    const copy = new Y.Doc();
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
    rewriteYDoc(copy, ctx());

    const assets = copy.getMap('assets').toJSON();
    expect(assets[IMG_OLD]).toBeUndefined();
    expect(assets[IMG_NEW]).toEqual({ assetId: IMG_NEW, bekBase64: 'NEWBEK', ivBase64: 'NEWIV', mimeType: 'image/png' });
    const canvasEl = copy.getMap<Y.Map<unknown>>('canvas').get('el1')!;
    expect(canvasEl.toJSON()).toEqual({ blobId: IMG_NEW, bek: 'NEWBEK', iv: 'NEWIV', offsetX: 12 });
    const node = copy.getXmlFragment('prosemirror').get(0) as Y.XmlElement;
    expect(node.getAttribute('assetId')).toBe(IMG_NEW);
    expect(node.getAttribute('href')).toBe(`tide://note/${NOTE_NEW}`);
  });
});
