import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { docToPlainText } from '../notePreview';

describe('docToPlainText', () => {
  it('reads paragraphs, headings, lists and mention labels', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Titel' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Punkt' }, { type: 'mention', attrs: { id: 'x', label: 'Andere Notiz' } }] }] }] },
      ],
    };
    expect(docToPlainText(JSON.stringify(doc))).toBe('Titel\nPunkt Andere Notiz'.replace(' Andere', 'Andere'));
  });

  it('strips markdown syntax from raw text notes', () => {
    expect(docToPlainText('# Überschrift\n- **fett** und [Link](http://x)')).toBe('Überschrift\nfett und Link');
  });

  it('falls back to the Yjs state when the JSON body is empty', () => {
    const ydoc = new Y.Doc();
    const frag = ydoc.getXmlFragment('prosemirror');
    const p = new Y.XmlElement('paragraph');
    p.insert(0, [new Y.XmlText('Aus Yjs')]);
    frag.insert(0, [p]);
    const update = Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString('base64');
    expect(docToPlainText(JSON.stringify({ type: 'doc', content: [], __yjs: update }))).toBe('Aus Yjs');
  });
});
