import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React, { useRef, useState } from 'react';

const SAFE_DATA_IMAGE_RE = /^data:image\/(png|jpeg|gif|webp|avif);base64,[A-Za-z0-9+/]+={0,2}$/i;
const SAFE_RELATIVE_IMAGE_RE = /^\/[^/\\]/;
const SAFE_DIMENSION_RE = /^\d+(\.\d+)?(px|%)?$/;

function sanitizeImageSrc(src: unknown): string | null {
    if (typeof src !== 'string') {
        return null;
    }
    const trimmed = src.trim();
    if (!trimmed || /[\u0000-\u001F\u007F]/.test(trimmed)) {
        return null;
    }
    if (SAFE_RELATIVE_IMAGE_RE.test(trimmed)) {
        return trimmed;
    }
    if (SAFE_DATA_IMAGE_RE.test(trimmed)) {
        return trimmed;
    }
    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            return trimmed;
        }
        if (parsed.protocol === 'blob:' && !/^blob:javascript:/i.test(trimmed)) {
            return trimmed;
        }
    } catch {
        return null;
    }
    return null;
}

function sanitizeDimension(value: unknown): string | number | null {
    if (typeof value === 'number') {
        return Number.isFinite(value) && value >= 0 ? value : null;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return SAFE_DIMENSION_RE.test(trimmed) ? trimmed : null;
    }
    return null;
}

function formatCssDimension(value: string | number | null): string {
    if (value === null) {
        return 'auto';
    }
    if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(value)) {
        return `${value}px`;
    }
    return value;
}

const ImageNodeView = ({ node, updateAttributes, selected }: any) => {
    const { src, alt, title, width, height } = node.attrs;
    const safeSrc = sanitizeImageSrc(src);
    const safeWidth = sanitizeDimension(width);
    const safeHeight = sanitizeDimension(height);
    const cssWidth = formatCssDimension(safeWidth);
    const cssHeight = formatCssDimension(safeHeight);
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
                width: cssWidth,
                maxWidth: '100%',
                boxSizing: 'border-box',
                lineHeight: 0
            }}
        >
            {safeSrc ? (
                <img
                    ref={imgRef}
                    src={safeSrc}
                    alt={alt}
                    title={title}
                    draggable="true"
                    style={{
                        width: cssWidth,
                        height: cssHeight,
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
            ) : (
                <span
                    className="inline-flex items-center px-3 py-2 text-xs opacity-70 border rounded"
                    style={{ lineHeight: 'normal' }}
                >
                    {alt || 'Unsafe image blocked'}
                </span>
            )}

            {/* Resize Handles - Only visible when selected */}
            {selected && safeSrc && (
                <>
                    <div
                        className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-10 bg-t2-accent rounded-full cursor-ew-resize opacity-100 transition-opacity z-20 flex items-center justify-center shadow-md select-none touch-none"
                        onPointerDown={(e) => handlePointerDown(e, 'right')}
                        style={{ touchAction: 'none' }}
                    >
                        <div className="w-0.5 h-5 bg-t2-surface rounded-full" />
                    </div>
                    <div
                        className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-10 bg-t2-accent rounded-full cursor-ew-resize opacity-100 transition-opacity z-20 flex items-center justify-center shadow-md select-none touch-none"
                        onPointerDown={(e) => handlePointerDown(e, 'left')}
                        style={{ touchAction: 'none' }}
                    >
                        <div className="w-0.5 h-5 bg-t2-surface rounded-full" />
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
            src: {
                default: null,
                parseHTML: element => sanitizeImageSrc(element.getAttribute('src')),
                renderHTML: attributes => {
                    const safeSrc = sanitizeImageSrc(attributes.src);
                    if (!safeSrc) return {};
                    return { src: safeSrc };
                },
            },
            width: {
                default: null,
                parseHTML: element => sanitizeDimension(element.getAttribute('width')),
                renderHTML: attributes => {
                    const safeWidth = sanitizeDimension(attributes.width);
                    if (safeWidth === null) return {};
                    return { width: safeWidth };
                },
            },
            height: {
                default: null,
                parseHTML: element => sanitizeDimension(element.getAttribute('height')),
                renderHTML: attributes => {
                    const safeHeight = sanitizeDimension(attributes.height);
                    if (safeHeight === null) return {};
                    return { height: safeHeight };
                },
            },
            style: {
                default: null,
                parseHTML: () => null,
                renderHTML: () => ({}),
            },
        };
    },

    addNodeView() {
        return ReactNodeViewRenderer(ImageNodeView);
    },
});
