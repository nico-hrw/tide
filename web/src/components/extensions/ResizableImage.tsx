import ImageResize from 'tiptap-extension-resize-image';

export const ResizableImage = ImageResize.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            src: { default: null },
            alt: { default: null },
            title: { default: null },
            width: { default: null },
            height: { default: null },
            style: { default: 'max-width: 100%; height: auto;' },
        };
    },
});
