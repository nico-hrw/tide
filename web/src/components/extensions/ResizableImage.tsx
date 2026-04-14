import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React, { useRef, useState } from 'react';

const ImageNodeView = ({ node, updateAttributes, selected }: any) => {
    const { src, alt, title, width, height } = node.attrs;
    const [isResizing, setIsResizing] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = (e: React.MouseEvent, pos: string) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startWidth = imgRef.current?.offsetWidth || 0;

        const handleMouseMove = (mouseMoveEvent: MouseEvent) => {
            setIsResizing(true);
            const currentX = mouseMoveEvent.clientX;
            const delta = pos === 'right' ? currentX - startX : startX - currentX;
            const newWidth = Math.max(50, startWidth + delta);
            updateAttributes({ width: newWidth });
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    return (
        <NodeViewWrapper 
            as="span"
            className={`relative inline-block align-bottom ${selected ? 'ProseMirror-selectednode' : ''}`}
            draggable="true" 
            data-drag-handle="true"
            ref={containerRef}
            style={{ width: width ? `${width}px` : 'auto', maxWidth: '100%', lineHeight: 0 }}
        >
            <img
                ref={imgRef}
                src={src}
                alt={alt}
                title={title}
                draggable="true"
                style={{
                    width: width ? `${width}px` : 'auto',
                    height: height ? `${height}px` : 'auto',
                    maxWidth: '100%',
                    objectFit: 'contain',
                    outline: selected && !isResizing ? '3px solid #a855f7' : 'none',
                    outlineOffset: '2px', // Use outline for cleaner selection box without layout shifting
                    borderRadius: '4px',
                    cursor: isResizing ? 'ew-resize' : 'grab',
                    display: 'block'
                }}
            />

            {/* Resize Handles - Only visible when selected */}
            {selected && (
                <>
                    <div
                        className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-8 bg-purple-500 rounded-full cursor-ew-resize opacity-0 hover:opacity-100 transition-opacity z-20 flex items-center justify-center shadow-sm"
                        onMouseDown={(e) => handleMouseDown(e, 'right')}
                        style={{ opacity: isResizing ? 1 : undefined }}
                    >
                        <div className="w-0.5 h-4 bg-white/60 rounded-full" />
                    </div>
                    <div
                        className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-8 bg-purple-500 rounded-full cursor-ew-resize opacity-0 hover:opacity-100 transition-opacity z-20 flex items-center justify-center shadow-sm"
                        onMouseDown={(e) => handleMouseDown(e, 'left')}
                        style={{ opacity: isResizing ? 1 : undefined }}
                    >
                        <div className="w-0.5 h-4 bg-white/60 rounded-full" />
                    </div>
                </>
            )}
        </NodeViewWrapper>
    );
};

export const ResizableImage = Image.extend({
    name: 'image',

    addAttributes() {
        return {
            ...this.parent?.(),
            width: {
                default: null,
                parseHTML: element => element.getAttribute('width'),
                renderHTML: attributes => {
                    if (!attributes.width) return {};
                    return { width: attributes.width };
                },
            },
            height: {
                default: null,
                parseHTML: element => element.getAttribute('height'),
                renderHTML: attributes => {
                    if (!attributes.height) return {};
                    return { height: attributes.height };
                },
            },
            style: {
                default: null,
            }
        };
    },

    addNodeView() {
        return ReactNodeViewRenderer(ImageNodeView);
    },
});
