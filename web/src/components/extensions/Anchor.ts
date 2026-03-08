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
    content: 'text*',
    inline: true,
    selectable: true,
    draggable: true,

    addAttributes() {
        return {
            anchorId: {
                default: null,
                parseHTML: element => element.getAttribute('data-anchor-id'),
                renderHTML: attributes => {
                    if (!attributes.anchorId) return {};
                    return { 'data-anchor-id': attributes.anchorId };
                },
            },
        };
    },

    parseHTML() {
        return [
            { tag: 'span[data-anchor-id]' },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, {
            class: 'inline-anchor',
            style: 'background: rgba(99, 102, 241, 0.1); border: 1px dashed rgba(99, 102, 241, 0.4); border-radius: 4px; padding: 1px 4px; font-weight: 500; color: #6366f1; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; vertical-align: middle; line-height: 1; margin: 0 2px;'
        }), 0];
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
