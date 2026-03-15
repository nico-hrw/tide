import Image from '@tiptap/extension-image';
import { mergeAttributes } from '@tiptap/core';

export const ResizableImage = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            src: { default: null },
            alt: { default: null },
            title: { default: null },
            width: { default: null },
            height: { default: null },
        };
    },

    parseHTML() {
        return [{ tag: 'div[data-type="image-anchor"]' }, { tag: 'img[src]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, {
            'data-type': 'image-anchor',
            style: 'height: 0; width: 0; overflow: hidden; position: relative;',
        })];
    },
});
