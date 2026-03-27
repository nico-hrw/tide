import { Node, mergeAttributes, nodeInputRule } from '@tiptap/core';

/**
 * Anchor Extension
 * 
 * Supports inline anchoring with the syntax: §+Text+ID+§
 * The ID exists in the attributes but the user only sees the text.
 */
export const Anchor = Node.create({
    name: 'anchor',
    group: 'inline',
    inline: true,
    selectable: true,
    draggable: true,
    atom: true,

    addAttributes() {
        return {
            anchorId: {
                default: null,
                parseHTML: element => element.getAttribute('data-anchor-id'),
                renderHTML: attributes => {
                    if (!attributes.anchorId) return {};
                    return { 'data-anchor-id': attributes.anchorId, 'data-type': 'anchor' };
                },
            },
        };
    },

    parseHTML() {
        return [
            { tag: 'span[data-anchor-id]' },
            { tag: 'span[data-type="anchor"]' },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, {
            class: 'inline-anchor',
            style: 'width: 6px; height: 6px; border-radius: 50%; background: #6366f1; display: inline-block; margin: 0 4px; vertical-align: middle; opacity: 0.6;'
        })];
    },

    addInputRules() {
        return [
            nodeInputRule({
                find: /§\+([^§]+)\+([^§]+)§$/,
                type: this.type,
                getAttributes: match => {
                    const [, text, anchorId] = match;
                    return { anchorId };
                },
            }),
        ];
    },
});
