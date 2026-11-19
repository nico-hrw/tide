import { Extension } from '@tiptap/core';
import { Selection } from '@tiptap/pm/state';

/** Two quick Tab presses insert a page break (see PageBreakNode) and put the cursor below it. */
const DOUBLE_TAP_MS = 600;

export const DoubleTabPageBreak = Extension.create({
    name: 'doubleTabPageBreak',

    addKeyboardShortcuts() {
        let lastTab = 0;
        return {
            Tab: ({ editor }) => {
                const now = Date.now();
                if (now - lastTab > DOUBLE_TAP_MS) {
                    lastTab = now;
                    // Lists keep their own Tab (indent). Elsewhere a single Tab stays in the text
                    // instead of moving focus out of the note.
                    if (editor.isActive('bulletList') || editor.isActive('orderedList') || editor.isActive('taskList')) return false;
                    return true;
                }
                lastTab = 0;
                if (!editor.isEditable) return false;

                // The break goes after the current block (an empty block is replaced by it), so no
                // extra empty paragraph appears. Such a paragraph copies as two blank lines.
                const { state } = editor;
                const { $from } = state.selection;
                const pageBreak = state.schema.nodes.pageBreak;
                if (!pageBreak || !$from.parent.isTextblock) return false;

                const emptyBlock = $from.parent.content.size === 0;
                const from = emptyBlock ? $from.before() : $from.after();
                const to = $from.after();
                const tr = state.tr.replaceWith(from, to, pageBreak.create());
                const afterBreak = from + pageBreak.create().nodeSize;

                // Text must follow the break: add a paragraph only when no textblock comes next.
                const next = tr.doc.nodeAt(afterBreak);
                if (!next || !next.isTextblock) {
                    tr.insert(afterBreak, state.schema.nodes.paragraph.create());
                }
                tr.setSelection(Selection.near(tr.doc.resolve(afterBreak)));
                editor.view.dispatch(tr.scrollIntoView());
                return true;
            },
        };
    },
});
