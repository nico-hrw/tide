import React from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import { useDataStore } from '@/store/useDataStore';
import { selectTags } from '@/lib/tags';
import type { SavedView } from '@/lib/viewsStorage';
import { viewDotColors } from './viewSuggestion';
import { CheckSquare } from 'lucide-react';
import type { ViewMentionTarget } from '@/hooks/dashboard/viewMentionClick';

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

    const open = (target: ViewMentionTarget) => (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!view) return;
        window.dispatchEvent(new CustomEvent('viewMention:click', { detail: { viewId, target } }));
    };

    const partBase = 'inline-flex items-center gap-1.5 bg-transparent border-0 p-0 font-[inherit] text-inherit focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2';
    const partState = view ? 'cursor-pointer' : 'cursor-default';

    return (
        <NodeViewWrapper style={{ display: 'inline' }}>
            <span
                data-view-chip=""
                data-missing={view ? undefined : 'true'}
                contentEditable={false}
                className={`inline-flex items-center gap-1.5 align-middle select-none whitespace-nowrap rounded-md px-2 py-0.5 text-[0.88em] font-medium border ${
                    view
                        ? 'bg-t2-sub text-t2-ink border-t2-line'
                        : 'bg-transparent text-t2-ink-3 border-dashed border-t2-line'
                }`}
                style={{ maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
                <button
                    type="button"
                    data-view-open="calendar"
                    aria-disabled={view ? undefined : true}
                    aria-label={view ? `Kalender öffnen: ${view.name}` : 'Ansicht gelöscht'}
                    title={view ? `Kalender öffnen: ${view.name}` : 'Diese Ansicht wurde gelöscht'}
                    onClick={open('calendar')}
                    className={`${partBase} ${partState} min-w-0 ${view ? 'hover:opacity-80' : ''}`}
                >
                    {colors.map((c, i) => (
                        <span key={i} className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c }} />
                    ))}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {view ? view.name : 'Ansicht gelöscht'}
                    </span>
                </button>
                <span aria-hidden="true" className="self-stretch w-px bg-t2-line shrink-0" />
                <button
                    type="button"
                    data-view-open="todos"
                    aria-disabled={view ? undefined : true}
                    aria-label={view ? `Todos öffnen: ${view.name}` : 'Todos öffnen (Ansicht gelöscht)'}
                    title={view ? `Todos öffnen: ${view.name}` : 'Diese Ansicht wurde gelöscht'}
                    onClick={open('todos')}
                    className={`${partBase} ${partState} shrink-0 text-[11px] ${view ? 'text-t2-ink-2 hover:text-t2-ink' : ''}`}
                >
                    <CheckSquare size={11} aria-hidden="true" />
                    <span>Todos</span>
                </button>
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
