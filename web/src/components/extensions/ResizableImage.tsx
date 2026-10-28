import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React, { useRef, useState } from 'react';

const ImageNodeView = ({ node, updateAttributes, selected }: any) => {
    const { src, alt, title, width, height } = node.attrs;
    const [isResizing, setIsResizing] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, pos: string) => {
        e.preventDefault();
        e.stopPropagation();
        const target = e.currentTarget;
        const pointerId = e.pointerId;
        try {
            target.setPointerCapture(pointerId);
        } catch {
            // ignore if unsupported
        }

        const startX = e.clientX;
        const startWidth = imgRef.current?.offsetWidth || 0;

        const handlePointerMove = (pointerMoveEvent: PointerEvent) => {
            setIsResizing(true);
            const currentX = pointerMoveEvent.clientX;
            const delta = pos === 'right' ? currentX - startX : startX - currentX;
            const newWidth = Math.max(50, startWidth + delta);
            updateAttributes({ width: newWidth });
        };

        const handlePointerUp = () => {
            setIsResizing(false);
            try {
                if (target.hasPointerCapture(pointerId)) {
                    target.releasePointerCapture(pointerId);
                }
            } catch {
                // ignore
            }
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);
    };

    return (
        <NodeViewWrapper 
            as="span"
            className={`relative inline-block align-bottom max-w-full box-border ${selected ? 'ProseMirror-selectednode' : ''}`}
            draggable="true" 
            data-drag-handle="true"
            ref={containerRef}
            style={{
                width: width ? `${width}px` : 'auto',
                maxWidth: '100%',
                boxSizing: 'border-box',
                lineHeight: 0
            }}
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
                    boxSizing: 'border-box',
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
                        className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-10 bg-purple-500 rounded-full cursor-ew-resize opacity-100 transition-opacity z-20 flex items-center justify-center shadow-md select-none touch-none"
                        onPointerDown={(e) => handlePointerDown(e, 'right')}
                        style={{ touchAction: 'none' }}
                    >
                        <div className="w-0.5 h-5 bg-white/80 rounded-full" />
                    </div>
                    <div
                        className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-10 bg-purple-500 rounded-full cursor-ew-resize opacity-100 transition-opacity z-20 flex items-center justify-center shadow-md select-none touch-none"
                        onPointerDown={(e) => handlePointerDown(e, 'left')}
                        style={{ touchAction: 'none' }}
                    >
                        <div className="w-0.5 h-5 bg-white/80 rounded-full" />
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
