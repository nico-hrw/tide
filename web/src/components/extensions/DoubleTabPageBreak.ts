import { Extension } from '@tiptap/core';

/** Two quick Tab presses insert a page break (see PageBreakNode) and start a new block below it. */
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
                editor
                    .chain()
                    .focus()
                    .insertContent([{ type: 'pageBreak' }, { type: 'paragraph' }])
                    .run();
                return true;
            },
        };
    },
});
