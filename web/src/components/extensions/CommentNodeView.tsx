import React, { useState, useMemo, useEffect } from 'react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e'];

const SOFT_COLORS = [
    'rgba(239, 68, 68, 0.1)',   // Red
    'rgba(59, 130, 246, 0.1)',  // Blue
    'rgba(34, 197, 94, 0.1)',   // Green
    'rgba(234, 179, 8, 0.1)',   // Yellow
    'rgba(168, 85, 247, 0.1)',  // Purple
    'rgba(236, 72, 153, 0.1)',  // Pink
];

const CommentNodeView = (props: any) => {
    const [isOpen, setIsOpen] = useState(props.node.attrs.isOpen || false);
    const [randomColor] = useState(() => COLORS[Math.floor(Math.random() * COLORS.length)]);

    useEffect(() => {
        setIsOpen(props.node.attrs.isOpen);
    }, [props.node.attrs.isOpen]);

    const toggleOpen = () => {
        const next = !isOpen;
        setIsOpen(next);
        props.updateAttributes({ isOpen: next });
    };

    return (
        <NodeViewWrapper className="inline-comment relative group" as="span" style={{ display: "inline" }}>
            {/* The Asterisk Button */}
            <span contentEditable={false} onClick={() => setIsOpen(!isOpen)} style={{ color: randomColor }} className="cursor-pointer font-bold px-1 select-none">*</span>
            
            {/* The Content Area */}
            {isOpen && (
                <span className="block mt-1 mb-2 pl-3 border-l-2 border-dashed text-sm italic" style={{ borderColor: randomColor, color: '#555' }}>
                    <NodeViewContent 
                        className="inline-block min-w-[50px] min-h-[1.5em] outline-none cursor-text" 
                    />
                </span>
            )}
        </NodeViewWrapper>
    );
};

export default CommentNodeView;
