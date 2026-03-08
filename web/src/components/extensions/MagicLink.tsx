import { mergeAttributes, Node } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { EditorView } from '@tiptap/pm/view';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React from 'react';

const MagicLinkComponent = (props: any) => {
    const { targetId, targetType, title } = props.node.attrs;
    const { onLinkClick } = props.extension.options;

    return (
        <NodeViewWrapper as="span">
            <span
                className="inline-flex items-center text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 rounded cursor-pointer font-medium hover:bg-purple-200 dark:hover:bg-purple-800/50 transition-colors mx-1"
                onClick={(e) => {
                    e.preventDefault();
                    if (onLinkClick) {
                        onLinkClick({ id: targetId, type: targetType, title });
                    }
                }}
                contentEditable={false}
            >
                @{title}
            </span>
        </NodeViewWrapper>
    );
};

export const MagicLink = Node.create({
    name: 'magicLink',
    group: 'inline',
    inline: true,
    atom: true,

    addOptions() {
        return {
            onLinkClick: undefined, // (target: { id, type, title }) => void
        };
    },

    addAttributes() {
        return {
            targetId: {
                default: null,
            },
            targetType: {
                default: 'file',
            },
            title: {
                default: 'Untitled',
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'magic-link',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['magic-link', mergeAttributes(HTMLAttributes)];
    },

    addNodeView() {
        return ReactNodeViewRenderer(MagicLinkComponent);
    },
});
