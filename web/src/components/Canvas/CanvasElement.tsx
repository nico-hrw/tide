"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import { CanvasElement, ImageElement, TextWidgetElement, isImageElement, isTextWidget } from '@/types/canvas';
import * as cryptoLib from '@/lib/crypto';
import { apiFetch } from '@/lib/api';
import { X, GripVertical, Shuffle, MoveUp, MoveDown } from 'lucide-react';

interface CanvasElementProps {
    element: CanvasElement;
    isMobile: boolean;
    userId: string;
    privateKey: CryptoKey | null;
    onBind: (id: string, rect: DOMRect | null) => void;
    onRequestRebind: (id: string, rect: DOMRect | null) => void;
    onMove: (id: string, offsetX: number, offsetY: number) => void;
    onUpdate: (id: string, updates: Partial<CanvasElement>) => void;
    onRemove: (id: string) => void;
    imageBlobCache: React.MutableRefObject<Map<string, string>>;
    isBindingMode: boolean;
    isLinkingMode?: boolean;
    setHoveredElementId?: (id: string | null) => void;
    showAnchorLine: boolean;
}

// ─── SVG anchor line ──────────────────────────────────────────────────────────
// Start point: LEFT edge of anchor block + indent, so the line reads "this paragraph →"
// Element: left-center of image.
// We use ar.left (not ar.right) because paragraphs span the full container width,
// making ar.right ~920px off the visible text.

function AnchorLine({ anchorBlockId, elementRef }: {
    anchorBlockId: string; elementRef: React.RefObject<HTMLDivElement | null>;
}) {
    const [pathData, setPathData] = useState<{ d: string; sx: number; sy: number } | null>(null);
    const [isHovered, setIsHovered] = useState(false);
    const rafRef = useRef<number | null>(null);

    const compute = useCallback(() => {
        // Query both inline anchors and full blocks
        const anchor = document.querySelector<HTMLElement>(`[data-anchor-id="${anchorBlockId}"], [data-block-id="${anchorBlockId}"]`);
        const el = elementRef.current;
        if (!anchor || !el) { setPathData(null); return; }

        let sx = 0;
        let sy = 0;

        // If it's an inline anchor node, just use its bounding box directly
        if (anchor.hasAttribute('data-anchor-id')) {
            const ar = anchor.getBoundingClientRect();
            sx = ar.right + 4;
            sy = ar.top + (ar.height / 2);
        } else {
            // It's a block paragraph. Extract bounding boxes using a Range.
            let foundRect = false;

            // Helper to find the last text node with visible content
            const getLastTextNode = (node: Node): Text | null => {
                if (node.nodeType === Node.TEXT_NODE && node.nodeValue && node.nodeValue.trim().length > 0) {
                    return node as Text;
                }
                for (let i = node.childNodes.length - 1; i >= 0; i--) {
                    const result = getLastTextNode(node.childNodes[i]);
                    if (result) return result;
                }
                return null;
            };

            const lastTextNode = getLastTextNode(anchor);

            if (lastTextNode) {
                try {
                    const range = document.createRange();
                    range.selectNodeContents(lastTextNode);
                    const rects = range.getClientRects();
                    if (rects.length > 0) {
                        const lastRect = rects[rects.length - 1];
                        sx = lastRect.right + 4; // Point exactly to the end of the last word
                        sy = lastRect.top + (lastRect.height / 2);
                        foundRect = true;
                    }
                } catch (e) {
                    // ignore errors
                }
            }

            if (!foundRect) {
                const ar = anchor.getBoundingClientRect();
                sx = ar.right + 4; // Fallback to right edge of block
                sy = ar.top + (ar.height / 2);
            }
        }

        const er = el.getBoundingClientRect();

        // ex/ey: element side (end)
        const ex = er.left;
        const ey = er.top + er.height / 2;

        const midX = (sx + ex) / 2;
        setPathData({ d: `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ey}, ${ex} ${ey}`, sx, sy });
    }, [anchorBlockId, elementRef]);

    useEffect(() => {
        const tick = () => { compute(); rafRef.current = requestAnimationFrame(tick); };
        rafRef.current = requestAnimationFrame(tick);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [compute]);

    if (!pathData) return null;
    return (
        <svg className="fixed inset-0 pointer-events-none"
            style={{ zIndex: 9998, width: '100vw', height: '100vh', top: 0, left: 0 }}>
            <defs>
                <linearGradient id="magicAnchorGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#818cf8" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0.2" />
                </linearGradient>
            </defs>

            {/* Invisible Hitbox for Hover */}
            <path
                d={pathData.d}
                className="pointer-events-auto cursor-pointer"
                fill="none"
                stroke="transparent"
                strokeWidth="24"
                strokeLinecap="round"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            />

            {/* Outer Glow Path */}
            <path d={pathData.d} fill="none" stroke="#818cf8" strokeWidth="3" strokeLinecap="round" opacity={isHovered ? 0.4 : 0.15} style={{ transition: 'opacity 0.2s' }} />
            {/* Main Decorative Path */}
            <path d={pathData.d} fill="none" stroke="url(#magicAnchorGradient)"
                strokeWidth="1.5" strokeLinecap="round" strokeDasharray="5 4" opacity={isHovered ? 1 : 0.7} style={{ transition: 'opacity 0.2s' }} />

            {/* Start Dot (Anchor side) - Appears only on hover */}
            <circle cx={pathData.sx} cy={pathData.sy} r="3" fill="#6366f1" opacity={isHovered ? 1 : 0} style={{ transition: 'opacity 0.2s, transform 0.2s', transformOrigin: `${pathData.sx}px ${pathData.sy}px`, transform: isHovered ? 'scale(1.2)' : 'scale(0.8)' }} />

            {/* Pulsing ring on hover */}
            {isHovered && (
                <circle cx={pathData.sx} cy={pathData.sy} r="4" fill="none" stroke="#818cf8" strokeWidth="1.5" className="animate-ping" style={{ transformOrigin: `${pathData.sx}px ${pathData.sy}px` }} />
            )}
        </svg>
    );
}

// ─── Context menu ─────────────────────────────────────────────────────────────

function ContextMenu({ x, y, onChangeAnchor, onMoveLayer, onRemove, onClose }: {
    x: number; y: number; onChangeAnchor: () => void;
    onMoveLayer: (dir: 'front' | 'back') => void;
    onRemove: () => void; onClose: () => void;
}) {
    const menuRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current?.contains(e.target as Node)) return;
            onClose();
        };
        const t = setTimeout(() => window.addEventListener('click', handler), 50);
        return () => { clearTimeout(t); window.removeEventListener('click', handler); };
    }, [onClose]);

    return (
        <div ref={menuRef} className="fixed z-[10000] rounded-xl overflow-hidden shadow-2xl border border-white/20"
            style={{ left: x, top: y, minWidth: 165, background: 'rgba(20,20,30,0.93)', backdropFilter: 'blur(14px)', pointerEvents: 'auto' }}>
            <button className="w-full text-left px-4 py-2.5 text-sm text-white/90 hover:bg-white/10 flex items-center gap-2 transition-colors cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onChangeAnchor(); onClose(); }}>
                <Shuffle size={13} className="text-[#6699cc]" /> Change anchor
            </button>
            <div className="h-px bg-white/10 mx-2" />
            <button className="w-full text-left px-4 py-2.5 text-sm text-white/90 hover:bg-white/10 flex items-center gap-2 transition-colors cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onMoveLayer('front'); onClose(); }}>
                <MoveUp size={13} className="text-green-400" /> Bring to front
            </button>
            <button className="w-full text-left px-4 py-2.5 text-sm text-white/90 hover:bg-white/10 flex items-center gap-2 transition-colors cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onMoveLayer('back'); onClose(); }}>
                <MoveDown size={13} className="text-amber-400" /> Send to back
            </button>
            <div className="h-px bg-white/10 mx-2" />
            <button className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-colors cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onRemove(); onClose(); }}>
                <X size={13} /> Remove
            </button>
        </div>
    );
}

// ─── Image widget ─────────────────────────────────────────────────────────────

function ImageWidget({ element, userId, privateKey, imageBlobCache }: {
    element: ImageElement; userId: string; privateKey: CryptoKey | null;
    imageBlobCache: React.MutableRefObject<Map<string, string>>;
}) {
    const [src, setSrc] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (element.blobId === '__pending__') { setLoading(true); setSrc(null); setError(false); return; }
        const cached = imageBlobCache.current.get(element.blobId);
        if (cached) { setSrc(cached); setLoading(false); return; }
        if (!privateKey) return;
        let cancelled = false;
        (async () => {
            try {
                const meta = await cryptoLib.decryptMetadata(element.encryptedKey, privateKey);
                const fileKey = await window.crypto.subtle.importKey('jwk', meta.fileKey as JsonWebKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
                const res = await apiFetch(`/api/v1/files/${element.blobId}/download`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const dec = await cryptoLib.decryptFile(await res.blob(), meta.iv as string, fileKey);
                const url = URL.createObjectURL(new Blob([await dec.arrayBuffer()], { type: element.mimeType }));
                imageBlobCache.current.set(element.blobId, url);
                if (!cancelled) { setSrc(url); setLoading(false); }
            } catch (e) { console.error('[Canvas] decrypt:', e); if (!cancelled) { setError(true); setLoading(false); } }
        })();
        return () => { cancelled = true; };
    }, [element.blobId, element.encryptedKey, element.mimeType, userId, privateKey, imageBlobCache]);

    if (loading) return (
        <div style={{ width: element.width ?? 200, height: 120 }}
            className="flex items-center justify-center rounded-xl bg-white/5 border border-white/10">
            <div className="w-5 h-5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
        </div>
    );
    if (error || !src) return (
        <div style={{ width: element.width ?? 200, height: 80 }}
            className="flex items-center justify-center rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-2">
            Failed to load
        </div>
    );
    return <img src={src} alt="" draggable={false} className="rounded-lg block select-none"
        style={{ width: element.width ?? 'auto', maxWidth: 380, maxHeight: 400, objectFit: 'contain' }} />;
}

// ─── Text widget ──────────────────────────────────────────────────────────────

// ─── Text widget ──────────────────────────────────────────────────────────────

function TextWidget({ element, onUpdate }: { element: TextWidgetElement; onUpdate: (id: string, updates: Partial<TextWidgetElement>) => void }) {
    const [isEditing, setIsEditing] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    const handleBlur = () => {
        setIsEditing(false);
        const newContent = contentRef.current?.innerText || '';
        if (newContent !== element.content) {
            onUpdate(element.id, { content: newContent });
        }
    };

    const colorMode = element.colorMode || 'inverse';
    
    const textStyle: React.CSSProperties = {
        maxWidth: 320,
        backgroundColor: 'transparent',
        padding: '8px 12px',
        fontSize: '14px',
        lineHeight: '1.6',
        outline: 'none',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: isEditing ? 'text' : 'default',
        borderRadius: '8px',
        boxSizing: 'border-box',
    };

    if (colorMode === 'inverse') {
        textStyle.color = 'white';
        textStyle.mixBlendMode = 'difference';
    } else if (colorMode === 'white') {
        textStyle.color = '#ffffff';
    } else {
        textStyle.color = '#000000';
    }

    return (
        <div className="relative group/text">
            {/* Color Controls Toolbar - shows on hover when not editing */}
            {!isEditing && (
                <div className="absolute -bottom-10 left-0 hidden group-hover/text:flex items-center gap-1.5 p-1 rounded-lg bg-gray-900/90 border border-white/10 backdrop-blur-md z-[1001] shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
                    <button 
                        onClick={() => onUpdate(element.id, { colorMode: 'black' })}
                        className={`w-6 h-6 rounded-md border border-white/20 transition-all hover:scale-110 ${colorMode === 'black' ? 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-gray-900' : ''}`}
                        style={{ background: '#000' }}
                        title="Black"
                    />
                    <button 
                        onClick={() => onUpdate(element.id, { colorMode: 'white' })}
                        className={`w-6 h-6 rounded-md border border-white/20 transition-all hover:scale-110 ${colorMode === 'white' ? 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-gray-900' : ''}`}
                        style={{ background: '#fff' }}
                        title="White"
                    />
                    <button 
                        onClick={() => onUpdate(element.id, { colorMode: 'inverse' })}
                        className={`w-6 h-6 rounded-md border border-white/20 transition-all hover:scale-110 flex items-center justify-center overflow-hidden group/inv ${colorMode === 'inverse' ? 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-gray-900' : ''}`}
                        title="Smart Inverse"
                    >
                        <div className="w-full h-full flex flex-col">
                            <div className="flex-1 bg-white" />
                            <div className="flex-1 bg-black" />
                        </div>
                    </button>
                </div>
            )}

            <div
                ref={contentRef}
                contentEditable
                suppressContentEditableWarning
                onFocus={() => setIsEditing(true)}
                onBlur={handleBlur}
                style={textStyle}
                className={`transition-all duration-200 ${isEditing ? 'ring-1 ring-indigo-500/50 bg-indigo-500/[0.02]' : 'hover:ring-1 hover:ring-white/10'}`}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.currentTarget.blur();
                    }
                    // Prevent common editor shortcuts from bubbling if we want it minimal
                    if (e.ctrlKey && (e.key === 'b' || e.key === 'i')) {
                        e.preventDefault();
                    }
                }}
            >
                {element.content}
            </div>
        </div>
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CanvasElementComponent({
    element, isMobile, userId, privateKey,
    onBind, onRequestRebind, onMove, onUpdate, onRemove,
    imageBlobCache, isBindingMode, isLinkingMode, setHoveredElementId, showAnchorLine,
}: CanvasElementProps) {
    const elRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const [hovered, setHovered] = useState(false);
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
    const dragState = useRef<{ startX: number; startY: number; initOX: number; initOY: number } | null>(null);
    const rafRef = useRef<number | null>(null);

    const isUnbound = !element.anchorBlockId || element.anchorBlockId === '__root__';

    // ── RAF position loop ──────────────────────────────────────────────────────
    // POSITIONING MODEL:
    //   offsetX = shell-relative horizontal (how many px from the shell's left edge)
    //   offsetY = anchor-relative vertical  (how many px below the anchor block's top)
    //
    // This way, the image ALWAYS stays at the same horizontal column, but moves
    // vertically whenever the anchor block moves (text added/removed above it).
    const computePosition = useCallback(() => {
        if (isMobile) { setPos({ top: 0, left: 0 }); return; }

        if (isUnbound) {
            const shell = elRef.current?.closest<HTMLElement>('.canvas-shell');
            if (!shell) return;
            setPos({ top: element.offsetY || 40, left: element.offsetX || shell.getBoundingClientRect().width + 24 });
            return;
        }

        const anchor = document.querySelector<HTMLElement>(`[data-block-id="${element.anchorBlockId}"], [data-element-id="${element.anchorBlockId}"], [data-anchor-id="${element.anchorBlockId}"]`);
        const shell = elRef.current?.closest<HTMLElement>('.canvas-shell');
        if (!anchor || !shell) return;

        const ar = anchor.getBoundingClientRect();
        const sr = shell.getBoundingClientRect();

        const isAnchor = anchor.hasAttribute('data-anchor-id');

        let left, top;
        if (isAnchor) {
            // Anchor-relative: stick to the exact word position
            left = ar.left - sr.left + element.offsetX;
            top = ar.top - sr.top + element.offsetY;
        } else {
            // Block-relative: stick to the column (shell-relative X), track paragraph Y
            left = element.offsetX;
            top = ar.top - sr.top + element.offsetY;
        }

        // CRITICAL: If we are currently dragging, don't let the RAF loop
        // snap the element back to its stored properties.
        if (dragState.current) return;

        setPos(prev => (prev?.top === top && prev?.left === left) ? prev : { top, left });
    }, [element.anchorBlockId, element.offsetX, element.offsetY, isMobile, isUnbound]);

    useEffect(() => {
        const tick = () => { computePosition(); rafRef.current = requestAnimationFrame(tick); };
        rafRef.current = requestAnimationFrame(tick);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [computePosition]);

    // ── Drag ─────────────────────────────────────────────────────────────────
    const onMouseDown = useCallback((e: React.MouseEvent) => {
        if (isMobile || isBindingMode || e.button !== 0) return;
        e.preventDefault();
        dragState.current = { startX: e.clientX, startY: e.clientY, initOX: element.offsetX, initOY: element.offsetY };

        const onMv = (me: MouseEvent) => {
            if (!dragState.current) return;
            const anchor = isUnbound ? null : document.querySelector<HTMLElement>(`[data-block-id="${element.anchorBlockId}"], [data-element-id="${element.anchorBlockId}"], [data-anchor-id="${element.anchorBlockId}"]`);
            const shell = elRef.current?.closest<HTMLElement>('.canvas-shell');
            if (!shell) return;
            const sr = shell.getBoundingClientRect();
            const dx = me.clientX - dragState.current.startX;
            const dy = me.clientY - dragState.current.startY;
            if (anchor) {
                const ar = anchor.getBoundingClientRect();
                const isAnchorNode = anchor.hasAttribute('data-anchor-id');

                let curLeft, curTop;
                if (isAnchorNode) {
                    curLeft = ar.left - sr.left + dragState.current.initOX + dx;
                    curTop = ar.top - sr.top + dragState.current.initOY + dy;
                } else {
                    curLeft = dragState.current.initOX + dx;
                    curTop = ar.top - sr.top + dragState.current.initOY + dy;
                }
                setPos({ top: curTop, left: curLeft });
            } else {
                setPos({ top: dragState.current.initOY + dy, left: dragState.current.initOX + dx });
            }
        };
        const onUp = (me: MouseEvent) => {
            if (!dragState.current) return;
            onMove(element.id,
                dragState.current.initOX + (me.clientX - dragState.current.startX),
                dragState.current.initOY + (me.clientY - dragState.current.startY));
            dragState.current = null;
            window.removeEventListener('mousemove', onMv);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMv);
        window.addEventListener('mouseup', onUp);
    }, [element.id, element.anchorBlockId, element.offsetX, element.offsetY, isMobile, isBindingMode, isUnbound, onMove]);

    const onContextMenu = useCallback((e: React.MouseEvent) => {
        if (isMobile) return;
        e.preventDefault(); e.stopPropagation();
        setCtxMenu({ x: e.clientX, y: e.clientY });
    }, [isMobile]);

    const desktopStyle: React.CSSProperties = pos !== null
        ? {
            position: 'absolute',
            top: pos.top,
            left: pos.left,
            pointerEvents: 'auto',
            cursor: (isBindingMode || isLinkingMode) ? 'crosshair' : 'grab',
            userSelect: 'none',
            zIndex: element.zIndex ?? 1
        }
        : { position: 'absolute', top: 0, left: 0, pointerEvents: 'none', opacity: 0 };
    const mobileStyle: React.CSSProperties = { display: 'block', position: 'static', width: '100%', margin: '8px 0', pointerEvents: 'auto' };
    const bindingStyle: React.CSSProperties = isBindingMode
        ? { outline: '2px solid #000080', outlineOffset: 3, animation: 'canvasPulse 1.2s ease-in-out infinite', borderRadius: 8 }
        : {};

    const showLine = !isMobile && !isUnbound && (showAnchorLine || hovered) && !!element.anchorBlockId;

    return (
        <>
            {showLine && <AnchorLine anchorBlockId={element.anchorBlockId} elementRef={elRef} />}
            {ctxMenu && (
                <ContextMenu x={ctxMenu.x} y={ctxMenu.y}
                    onChangeAnchor={() => { const rect = elRef.current?.getBoundingClientRect() ?? null; onRequestRebind(element.id, rect); }}
                    onMoveLayer={(dir) => {
                        const currentZ = element.zIndex ?? 1;
                        onUpdate(element.id, { zIndex: dir === 'front' ? currentZ + 1 : Math.max(0, currentZ - 1) });
                    }}
                    onRemove={() => onRemove(element.id)}
                    onClose={() => setCtxMenu(null)} />
            )}
            <div ref={elRef} className="canvas-element group"
                data-element-id={element.id}
                style={{ ...(isMobile ? mobileStyle : desktopStyle), ...bindingStyle }}
                onMouseDown={!isMobile && !isBindingMode && !isLinkingMode ? onMouseDown : undefined}
                onMouseEnter={() => {
                    setHovered(true);
                    setHoveredElementId?.(element.id);
                }}
                onMouseLeave={() => {
                    setHovered(false);
                    setHoveredElementId?.(null);
                }}
                onContextMenu={onContextMenu}
                onClick={(isBindingMode || isLinkingMode) ? (e) => {
                    e.stopPropagation();
                    onBind(element.id, elRef.current?.getBoundingClientRect() ?? null);
                } : undefined}
            >
                {!isMobile && pos !== null && !isBindingMode && (
                    <div className="absolute -top-7 left-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity
            bg-gray-900/80 backdrop-blur-sm rounded-lg px-1.5 py-0.5 border border-white/10 z-10 whitespace-nowrap">
                        <GripVertical size={12} className="text-gray-400" />
                        <span className="text-xs text-gray-400 select-none">{isImageElement(element) ? 'Image' : 'Text'}</span>
                        {isUnbound && <span className="text-xs text-amber-400 ml-1">· unbound</span>}
                        <button className="ml-1 text-gray-400 hover:text-red-400 transition-colors"
                            onMouseDown={(e) => { e.stopPropagation(); onRemove(element.id); }}>
                            <X size={12} />
                        </button>
                    </div>
                )}
                {isImageElement(element) && <ImageWidget element={element} userId={userId} privateKey={privateKey} imageBlobCache={imageBlobCache} />}
                {isTextWidget(element) && <TextWidget element={element} onUpdate={onUpdate} />}
            </div>
        </>
    );
}
