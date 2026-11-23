import { Extension } from '@tiptap/core';

export interface FontSizeOptions {
    types: string[];
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        fontSize: {
            /**
             * Set the font size
             */
            setFontSize: (size: string) => ReturnType;
            /**
             * Unset the font size
             */
            unsetFontSize: () => ReturnType;
        }
    }
}

const SAFE_FONT_SIZE_RE = /^\d+(\.\d+)?(px|em|rem|pt|%)$/;

function sanitizeFontSize(fontSize: unknown): string | null {
    if (typeof fontSize !== 'string') {
        return null;
    }
    const trimmed = fontSize.trim();
    return SAFE_FONT_SIZE_RE.test(trimmed) ? trimmed : null;
}

export const FontSize = Extension.create<FontSizeOptions>({
    name: 'fontSize',

    addOptions() {
        return {
            types: ['textStyle'],
        };
    },

    addGlobalAttributes() {
        return [
            {
                types: this.options.types,
                attributes: {
                    fontSize: {
                        default: null,
                        parseHTML: element =>
                            sanitizeFontSize(element.style.fontSize?.replace(/['"]+/g, '')),
                        renderHTML: attributes => {
                            const fontSize = sanitizeFontSize(attributes.fontSize);
                            if (!fontSize) {
                                return {};
                            }

                            return {
                                style: `font-size: ${fontSize}`,
                            };
                        },
                    },
                },
            },
        ];
    },

    addCommands() {
        return {
            setFontSize: fontSize => ({ chain }) => {
                return chain()
                    .setMark('textStyle', { fontSize })
                    .run();
            },
            unsetFontSize: () => ({ chain }) => {
                return chain()
                    .setMark('textStyle', { fontSize: null })
                    .removeEmptyTextStyle()
                    .run();
            },
        };
    },
});
