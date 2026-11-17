import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import {
  EMOJI_PATTERN,
  createAnimatedEmojiElement,
  getAnimatedEmojiEnabled,
  loadEmojiIndex,
  subscribeEmojiSettings,
} from '@/lib/animatedEmoji';

const pluginKey = new PluginKey('animatedEmoji');

/**
 * Ersetzt Emoji-Zeichen im Editor optisch durch das animierte Fluent-Bild.
 * Der Text bleibt im Dokument (Speichern und Suche unverändert), er wird nur
 * per Decoration ausgeblendet und vor dem Bild gezeigt.
 */
function buildDecorations(doc: PMNode): DecorationSet {
  if (!getAnimatedEmojiEnabled()) return DecorationSet.empty;
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const re = new RegExp(EMOJI_PATTERN, 'gu');
    let m: RegExpExecArray | null;
    while ((m = re.exec(node.text))) {
      const glyph = m[0];
      const from = pos + m.index;
      const to = from + glyph.length;
      decos.push(Decoration.widget(from, () => createAnimatedEmojiElement(glyph), {
        side: -1,
        key: `tide-emoji-${from}-${glyph}`,
      }));
      decos.push(Decoration.inline(from, to, { class: 'tide-emoji-src' }));
    }
  });
  return DecorationSet.create(doc, decos);
}

export const AnimatedEmoji = Extension.create({
  name: 'animatedEmoji',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pluginKey,
        state: {
          init: (_, { doc }) => buildDecorations(doc),
          apply: (tr, old) => (tr.docChanged || tr.getMeta(pluginKey) ? buildDecorations(tr.doc) : old),
        },
        props: {
          decorations(state) {
            return pluginKey.getState(state);
          },
        },
        view(view) {
          let alive = true;
          const refresh = () => {
            if (alive) view.dispatch(view.state.tr.setMeta(pluginKey, true));
          };
          // Sobald der Index geladen ist und bei jeder Änderung der Einstellung neu zeichnen.
          loadEmojiIndex().then(refresh);
          const unsubscribe = subscribeEmojiSettings(refresh);
          return {
            destroy() {
              alive = false;
              unsubscribe();
            },
          };
        },
      }),
    ];
  },
});

export default AnimatedEmoji;
