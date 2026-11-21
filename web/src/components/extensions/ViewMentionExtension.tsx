import React from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import { useDataStore } from '@/store/useDataStore';
import { selectTags } from '@/lib/tags';
import type { SavedView } from '@/lib/viewsStorage';
import { viewDotColors } from './viewSuggestion';

/** Looks up the saved view a mention points at; null when it was deleted. */
export function resolveViewMention(viewId: string, views: SavedView[]): SavedView | null {
    return views.find((v) => v.id === viewId) ?? null;
}

// ── Node View ──────────────────────────────────────────────────────────────────

export const ViewMentionNodeView: React.FC<NodeViewProps> = ({ node }) => {
    const { viewId } = node.attrs as { viewId: string };
    const views = useDataStore((s) => s.views);
    const notes = useDataStore((s) => s.notes);

    const view = resolveViewMention(viewId, views);
    const colors = view ? viewDotColors(view, selectTags(notes)) : [];

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!view) return;
        window.dispatchEvent(new CustomEvent('viewMention:click', { detail: { viewId } }));
    };

    return (
        <NodeViewWrapper style={{ display: 'inline' }}>
            <span
                data-view-chip=""
                data-missing={view ? undefined : 'true'}
                contentEditable={false}
                onClick={handleClick}
                title={view ? `Ansicht öffnen: ${view.name}` : 'Diese Ansicht wurde gelöscht'}
                className={`inline-flex items-center gap-1.5 align-middle select-none whitespace-nowrap rounded-md px-2 py-0.5 text-[0.88em] font-medium border ${
                    view
                        ? 'bg-t2-sub text-t2-ink border-t2-line cursor-pointer hover:bg-t2-hover'
                        : 'bg-transparent text-t2-ink-3 border-dashed border-t2-line cursor-default'
                }`}
                style={{ maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
                {colors.map((c, i) => (
                    <span key={i} className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c }} />
                ))}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {view ? view.name : 'Ansicht gelöscht'}
                </span>
            </span>
        </NodeViewWrapper>
    );
};

// ── Tiptap Extension ──────────────────────────────────────────────────────────

export const ViewMentionExtension = Node.create({
    name: 'viewMention',
    group: 'inline',
    inline: true,
    atom: true,
    draggable: false,

    addAttributes() {
        return {
            viewId: { default: null },
        };
    },

    parseHTML() {
        return [{ tag: 'span[data-view-mention]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-view-mention': '' }), 0];
    },

    addNodeView() {
        return ReactNodeViewRenderer(ViewMentionNodeView);
    },
});

export default ViewMentionExtension;
