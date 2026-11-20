import { Extension, InputRule } from '@tiptap/core';

/**
 * Typing "- [ ] " (or "- [x] ") starts a task list, as in Markdown. Without it the brackets stay as plain
 * text. The "[ ] " shortcut on its own already works through the task item extension.
 */
export const MarkdownTaskInput = Extension.create({
    name: 'markdownTaskInput',

    addInputRules() {
        const editor = this.editor;
        return [
            new InputRule({
                // "- [ ] " in one go, or "[ ] " after the bullet "- " has already made a list item.
                find: /^\s*(?:-\s)?\[[ xX]?\]\s$/,
                handler: ({ range }) => {
                    editor.chain().deleteRange(range).toggleTaskList().run();
                },
            }),
        ];
    },
});

export default MarkdownTaskInput;
