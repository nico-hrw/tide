import { Mark, mergeAttributes } from '@tiptap/core';

export interface HighlightOptions {
    multicolor: boolean,
    HTMLAttributes: Record<string, any>,
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        highlight: {
            setHighlight: (attributes?: { color: string }) => ReturnType,
            toggleHighlight: (attributes?: { color: string }) => ReturnType,
            unsetHighlight: () => ReturnType,
        }
    }
}

const SAFE_HIGHLIGHT_COLOR_RE =
    /^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla)\([0-9.,%\s/]+\)|var\(--[a-zA-Z0-9_-]+\)|[a-zA-Z]{3,20})$/;

function sanitizeHighlightColor(color: unknown): string | null {
    if (typeof color !== 'string') {
        return null;
    }
    const trimmed = color.trim();
    return SAFE_HIGHLIGHT_COLOR_RE.test(trimmed) ? trimmed : null;
}

export const Highlight = Mark.create<HighlightOptions>({
    name: 'highlight',

    addOptions() {
        return {
            multicolor: false,
            HTMLAttributes: {},
        }
    },

    addAttributes() {
        if (!this.options.multicolor) {
            return {}
        }

        return {
            color: {
                default: null,
                parseHTML: element =>
                    sanitizeHighlightColor(element.getAttribute('data-color') || element.style.backgroundColor),
                renderHTML: attributes => {
                    const color = sanitizeHighlightColor(attributes.color);
                    if (!color) {
                        return {}
                    }

                    return {
                        'data-color': color,
                        style: `background-color: ${color}; color: inherit`,
                    }
                },
            },
        }
    },

    parseHTML() {
        return [
            {
                tag: 'mark',
            },
        ]
    },

    renderHTML({ HTMLAttributes }) {
        return ['mark', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
    },

    addCommands() {
        return {
            setHighlight: attributes => ({ commands }) => {
                return commands.setMark(this.name, attributes)
            },
            toggleHighlight: attributes => ({ commands }) => {
                return commands.toggleMark(this.name, attributes)
            },
            unsetHighlight: () => ({ commands }) => {
                return commands.unsetMark(this.name)
            },
        }
    },
})
