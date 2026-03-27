import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { useDataStore } from '@/store/useDataStore';

const TaskMentionNodeView = ({ node }: any) => {
    const { id, label } = node.attrs;

    // Read directly from the task store by UUID. The task record is ALWAYS kept
    // in the store (even when scheduled to the calendar), so this link never goes stale.
    const { task, toggleTask } = useDataStore((s) => ({
        task: s.tasks.find(t => t.id === id) || null,
        toggleTask: s.toggleTask,
    }));

    const isCompleted = task ? (task.isCompleted ?? false) : false;
    const title = task?.title || label || 'Unknown Task';

    // Toggle handler — always routes through the task store (source of truth)
    const captureAndToggle = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.nativeEvent?.stopImmediatePropagation?.();
        if (task) {
            toggleTask(id);
        }
    };

    return (
        // NodeViewWrapper: always render as a plain inline span
        <NodeViewWrapper
            as="span"
            className="task-mention-pill"
            data-task-id={id}
        >
            {/* Checkbox — fully captured at React synthetic + native level */}
            <span
                role="checkbox"
                aria-checked={isCompleted}
                tabIndex={-1}
                className="task-mention-checkbox"
                onMouseDownCapture={(e) => { e.preventDefault(); e.stopPropagation(); e.nativeEvent?.stopImmediatePropagation?.(); }}
                onClickCapture={captureAndToggle}
            >
                {isCompleted ? '☑' : '☐'}
            </span>
            <span className={isCompleted ? 'task-mention-label completed' : 'task-mention-label'}>
                {title}
            </span>
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
        return [{ tag: 'span[data-type="taskMention"]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'taskMention' })];
    },

    addNodeView() {
        return ReactNodeViewRenderer(TaskMentionNodeView);
    },
});
