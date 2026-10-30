import React from 'react';
import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useDataStore } from '@/store/useDataStore';
import { formatEventTime } from '../Editor/editorUtils';

const TaskMentionNodeView: React.FC<NodeViewProps> = ({ node }) => {
    const id = (node.attrs.id as string) || '';
    const label = (node.attrs.label as string) || '';

    // Support reactivity: read the task live from the store so toggling updates immediately
    const task = useDataStore((s) => s.tasks.find((t) => t.id === id));

    const isCompleted = task?.isCompleted ?? false;
    const title = task?.title || label || 'Aufgabe';
    const priority = task?.priority;

    const accentColor =
        task?.color ||
        (priority === 'high'
            ? '#ef4444'
            : priority === 'medium'
            ? '#f59e0b'
            : '#3b82f6');

    const rawDate = task?.dueDate || task?.scheduledDate;
    const formattedDate = rawDate ? formatEventTime(rawDate) : '';

    const handleCheckboxClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.nativeEvent?.stopImmediatePropagation?.();
        if (id) {
            useDataStore.getState().toggleTask(id);
        }
    };

    const handleCheckboxMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.nativeEvent?.stopImmediatePropagation?.();
    };

    const handleContainerClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(
            new CustomEvent('editor:mention-click', {
                detail: { id, title, type: 'task' },
            })
        );
    };

    const styleObj: React.CSSProperties = {
        cursor: 'pointer',
        fontSize: 'inherit',
        display: 'inline-flex',
        alignItems: 'center',
        verticalAlign: 'middle',
        borderLeftWidth: '3px',
        borderLeftColor: accentColor,
        backgroundColor: 'var(--card, var(--surface-card, transparent))',
        borderColor: 'var(--border, var(--surface-card-border, var(--border-color, currentColor)))',
        color: 'var(--foreground, inherit)',
    };

    return (
        <NodeViewWrapper
            as="span"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 my-0.5 rounded-md leading-snug align-middle border shadow-2xs transition-all cursor-pointer select-none bg-[var(--card)] text-[var(--foreground)] border-[var(--border)]"
            data-type="taskMention"
            data-task-id={id}
            style={styleObj}
            onClick={handleContainerClick}
        >
            {/* Interactive Checkbox */}
            <button
                type="button"
                role="checkbox"
                aria-checked={isCompleted}
                tabIndex={-1}
                className={`w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center shrink-0 cursor-pointer transition-all hover:scale-110 ${
                    isCompleted ? 'bg-current/15 opacity-60' : 'opacity-80 hover:opacity-100'
                }`}
                style={{ borderColor: accentColor, color: accentColor }}
                onMouseDownCapture={handleCheckboxMouseDown}
                onClickCapture={handleCheckboxClick}
            >
                {isCompleted && (
                    <svg
                        width="9"
                        height="9"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                )}
            </button>

            {/* Task Title */}
            <span
                className={
                    isCompleted
                        ? 'font-medium text-xs truncate max-w-[160px] line-through opacity-60'
                        : 'font-medium text-xs truncate max-w-[160px]'
                }
            >
                {title}
            </span>

            {/* Date divider & chip */}
            {formattedDate && (
                <span className="text-[11px] opacity-75 truncate border-l pl-1.5 border-current/20">
                    {formattedDate}
                </span>
            )}
        </NodeViewWrapper>
    );
};

export const TaskMentionExtension = Node.create({
    name: 'taskMention',
    group: 'inline',
    inline: true,
    selectable: true,
    atom: true,

    addAttributes() {
        return {
            id: { default: null },
            label: { default: null },
        };
    },

    parseHTML() {
        return [
            { tag: 'span[data-type="taskMention"]' },
            { tag: 'span.task-mention-pill' },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'taskMention' })];
    },

    addNodeView() {
        return ReactNodeViewRenderer(TaskMentionNodeView);
    },
});
