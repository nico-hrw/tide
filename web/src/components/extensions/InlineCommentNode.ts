import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import CommentNodeView from './CommentNodeView';

export const InlineCommentNode = Node.create({
    name: 'inlineComment',
    group: 'inline',
    inline: true,
    content: 'inline*',
    isolating: true,
    defining: true,

    addAttributes() {
        return {
            color: {
                default: null,
            },
            isOpen: {
                default: false,
            },
        };
    },

    parseHTML() {
        return [
            { tag: 'span[data-type="inline-comment"]' },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'inline-comment' }), 0];
    },

    addNodeView() {
        return ReactNodeViewRenderer(CommentNodeView);
    },

    addKeyboardShortcuts() {
        return {
            'Enter': () => {
                if (!this.editor.isActive('inlineComment')) return false;
                // Break out of the comment and create a new paragraph below
                return this.editor.chain().insertContentAt(this.editor.state.selection.to, { type: 'paragraph' }).focus().run();
            },
            'Shift-Enter': () => {
                if (!this.editor.isActive('inlineComment')) return false;
                // Insert a hard break (newline) INSIDE the comment
                return this.editor.chain().setHardBreak().run();
            }
        };
    },
});
