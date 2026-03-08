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
                parseHTML: element => element.getAttribute('data-color') || element.style.backgroundColor,
                renderHTML: attributes => {
                    if (!attributes.color) {
                        return {}
                    }

                    return {
                        'data-color': attributes.color,
                        style: `background-color: ${attributes.color}; color: inherit`,
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
