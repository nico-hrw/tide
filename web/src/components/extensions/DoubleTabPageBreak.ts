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
                    return false; // first Tab keeps its normal meaning
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
