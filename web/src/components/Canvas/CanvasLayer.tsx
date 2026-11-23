"use client";

import { useRef, useCallback, useState, useEffect, useMemo, type ReactNode } from 'react';
import { notifyError } from '@/lib/feedback';
import * as Y from 'yjs';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import CanvasElementComponent from './CanvasElement';
import { CanvasElement, ImageElement } from '@/types/canvas';
import { storeNoteImage } from '@/lib/noteImageAssets';
import { useActiveNoteStore } from '@/store/activeNoteStore';
import type { OverlayStroke } from './useStyleFile';

export interface CanvasLayerProps {
    children: ReactNode;
    elements: CanvasElement[];
    isLoaded: boolean;
    publicKey: CryptoKey | null;
    privateKey: CryptoKey | null;
    userId: string;
    noteId: string | null;
    onElementMove: (id: string, offsetX: number, offsetY: number) => Promise<void>;
    onElementAdd: (el: CanvasElement) => Promise<void>;
    onElementRemove: (id: string) => Promise<void>;
    deletedBlockIds?: string[];
    onSaveAll: (elements: CanvasElement[]) => Promise<void>;
    pendingBindBlockId?: string | null;
    onBindingComplete?: () => void;
    onUpdate: (id: string, updates: Partial<CanvasElement>) => Promise<void>;
    onInsertAnchor?: (x: number, y: number) => string | null;
    hoveredElementId: string | null;
    setHoveredElementId: (id: string | null) => void;
    isLinkingMode: boolean;
    activeLinkBlockId: string | null;
    onLinkingComplete: () => void;
    ydoc?: Y.Doc | null;
    yOverlay?: Y.Map<Y.Map<unknown>> | null;
    isDrawingMode?: boolean;
    activeDrawingTool?: 'pen' | 'marker' | 'eraser';
    strokeColor?: string;
    strokeSize?: number;
}

function pointsToSvgPath(points: Array<{ x: number; y: number }>, offsetX = 0, offsetY = 0): string {
    if (!points || points.length === 0) return '';
    const startX = points[0].x + offsetX;
    const startY = points[0].y + offsetY;
    if (points.length === 1) {
        return `M ${startX.toFixed(2)} ${startY.toFixed(2)} L ${(startX + 0.1).toFixed(2)} ${(startY + 0.1).toFixed(2)}`;
    }
    let d = `M ${startX.toFixed(2)} ${startY.toFixed(2)}`;
    for (let i = 1; i < points.length - 1; i++) {
        const curr = points[i];
        const next = points[i + 1];
        const midX = (curr.x + next.x) / 2 + offsetX;
        const midY = (curr.y + next.y) / 2 + offsetY;
        d += ` Q ${(curr.x + offsetX).toFixed(2)} ${(curr.y + offsetY).toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}`;
    }
    const last = points[points.length - 1];
    return `${d} L ${(last.x + offsetX).toFixed(2)} ${(last.y + offsetY).toFixed(2)}`;
}

function isCircular(startId: string, targetId: string, elements: CanvasElement[]): boolean {
    let currentId = targetId;
    const visited = new Set<string>();
    while (currentId) {
        if (currentId === startId) return true;
        if (visited.has(currentId)) break;
        visited.add(currentId);
        const el = elements.find(e => e.id === currentId);
        if (el?.anchorBlockId) currentId = el.anchorBlockId;
        else break;
    }
    return false;
}

function detectIPadOrTablet(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    const isIPadUA = /iPad/i.test(ua) || (Boolean(navigator.maxTouchPoints && navigator.maxTouchPoints > 1) && /Macintosh/i.test(ua));
    const isTouchTablet = Boolean(navigator.maxTouchPoints && navigator.maxTouchPoints > 0) && window.innerWidth >= 768 && !/iPhone|iPod/i.test(ua);
    return isIPadUA || isTouchTablet;
}

function getAllDomBlockIds(): string[] {
    return Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]')).map(n => n.getAttribute('data-block-id')!).filter(Boolean);
}

function extractImageFiles(dt: DataTransfer): File[] {
    return Array.from(dt.items ?? []).map(i => i.getAsFile()).filter((f): f is File => !!f && f.type.startsWith('image/'));
}

function computeRelativeOffset(elementRect: DOMRect | null, anchorBlockId: string, shell: HTMLElement | null): { offsetX: number; offsetY: number } {
    if (!elementRect || !shell) {
        const fallbackLeft = shell ? shell.getBoundingClientRect().width + 24 : 700;
        return { offsetX: fallbackLeft, offsetY: 0 };
    }
    const anchorEl = document.querySelector<HTMLElement>(`[data-block-id="${anchorBlockId}"], [data-element-id="${anchorBlockId}"], [data-anchor-id="${anchorBlockId}"]`);
    const sr = shell.getBoundingClientRect();
    if (!anchorEl) return { offsetX: Math.round(elementRect.left - sr.left), offsetY: 0 };
    const ar = anchorEl.getBoundingClientRect();
    const isAnchor = anchorEl.hasAttribute('data-anchor-id');
    return {
        offsetX: isAnchor ? Math.round(elementRect.left - ar.left) : Math.round(elementRect.left - sr.left),
        offsetY: Math.round(elementRect.top - ar.top),
    };
}

export default function CanvasLayer({
    children, elements, isLoaded: _isLoaded, privateKey, userId, noteId,
    onElementMove, onElementAdd, onElementRemove, deletedBlockIds, onSaveAll,
    pendingBindBlockId, onBindingComplete, onUpdate, onInsertAnchor,
    hoveredElementId: _hoveredElementId, setHoveredElementId, isLinkingMode, activeLinkBlockId, onLinkingComplete,
    ydoc: propYDoc, yOverlay: propYOverlay, isDrawingMode, activeDrawingTool, strokeColor, strokeSize,
}: CanvasLayerProps) {
    const isSmallScreen = useMediaQuery('(max-width: 768px)');
    const [isTablet, setIsTablet] = useState<boolean>(() => detectIPadOrTablet());

    useEffect(() => {
        const updateTablet = () => setIsTablet(detectIPadOrTablet());
        window.addEventListener('resize', updateTablet);
        window.addEventListener('orientationchange', updateTablet);
        return () => {
            window.removeEventListener('resize', updateTablet);
            window.removeEventListener('orientationchange', updateTablet);
        };
    }, []);

    const isMobile = isSmallScreen && !isTablet;
    const shellRef = useRef<HTMLDivElement>(null);
    const imageBlobCache = useRef(new Map<string, string>());
    const rebindTarget = useRef<{ id: string; rect: DOMRect | null } | null>(null);

    // ─── Yjs yOverlay Connection & Drawing Sync ───────────────────────────────
    const storeDoc = useActiveNoteStore(s => s.activeYDoc);
    const effectiveDoc = propYDoc || storeDoc;
    const effectiveYOverlay = propYOverlay || (effectiveDoc ? effectiveDoc.getMap<Y.Map<unknown>>('overlay') : null);

    // Local edits to the overlay (images, strokes) must trigger a save; see useAutoSaveSync.
    useEffect(() => {
        if (!effectiveYOverlay) return;
        const notify = (_events: unknown, transaction: Y.Transaction) => {
            if (transaction.local) window.dispatchEvent(new CustomEvent('tide:overlay-changed'));
        };
        effectiveYOverlay.observeDeep(notify);
        return () => effectiveYOverlay.unobserveDeep(notify);
    }, [effectiveYOverlay]);

    const [overlayStrokes, setOverlayStrokes] = useState<OverlayStroke[]>([]);
    const [currentDrawingStroke, setCurrentDrawingStroke] = useState<OverlayStroke | null>(null);
    const isDrawingRef = useRef(false);
    const activeDrawingStrokeRef = useRef<OverlayStroke | null>(null);
    const pendingDrawPointsRef = useRef<Array<{ x: number; y: number; p?: number }>>([]);
    const drawRafRef = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (drawRafRef.current !== null) {
                cancelAnimationFrame(drawRafRef.current);
                drawRafRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!effectiveYOverlay) {
            return;
        }

        const syncStrokes = () => {
            const list: OverlayStroke[] = [];
            effectiveYOverlay.forEach((val, key) => {
                const item = val instanceof Y.Map ? (val.toJSON() as Record<string, unknown>) : (val as Record<string, unknown>);
                if (item && Array.isArray(item.points)) {
                    list.push({
                        id: (typeof item.id === 'string' ? item.id : key),
                        tool: (typeof item.tool === 'string' ? item.tool : 'pen'),
                        color: (typeof item.color === 'string' ? item.color : '#111827'),
                        size: (typeof item.size === 'number' ? item.size : 3),
                        opacity: (typeof item.opacity === 'number' ? item.opacity : 1),
                        points: item.points as Array<{ x: number; y: number; p?: number }>,
                        ...item,
                    } as OverlayStroke);
                }
            });
            setOverlayStrokes(list);
        };

        effectiveYOverlay.observeDeep(syncStrokes);
        syncStrokes();

        return () => {
            effectiveYOverlay.unobserveDeep(syncStrokes);
        };
    }, [effectiveYOverlay]);

    useEffect(() => {
        const handleAddStroke = (e: Event) => {
            const stroke = (e as CustomEvent).detail as OverlayStroke;
            if (!stroke || !effectiveYOverlay || !effectiveDoc) return;
            const strokeMap = new Y.Map<unknown>();
            for (const [k, v] of Object.entries(stroke)) strokeMap.set(k, v);
            effectiveDoc.transact(() => {
                effectiveYOverlay.set(stroke.id || crypto.randomUUID(), strokeMap);
            });
        };

        const handleRemoveStroke = (e: Event) => {
            const detail = (e as CustomEvent).detail as { id?: string } | undefined;
            const id = detail?.id;
            if (!id || !effectiveYOverlay || !effectiveDoc) return;
            effectiveDoc.transact(() => {
                effectiveYOverlay.delete(id);
            });
        };

        const handleClearStrokes = () => {
            if (!effectiveYOverlay || !effectiveDoc) return;
            effectiveDoc.transact(() => {
                effectiveYOverlay.forEach((val, key) => {
                    const item = val instanceof Y.Map ? (val.toJSON() as Record<string, unknown>) : (val as Record<string, unknown>);
                    if (item && Array.isArray(item.points)) effectiveYOverlay.delete(key);
                });
            });
        };

        window.addEventListener('canvas:stroke-add', handleAddStroke);
        window.addEventListener('canvas:draw-stroke', handleAddStroke);
        window.addEventListener('canvas:stroke-remove', handleRemoveStroke);
        window.addEventListener('canvas:strokes-clear', handleClearStrokes);

        return () => {
            window.removeEventListener('canvas:stroke-add', handleAddStroke);
            window.removeEventListener('canvas:draw-stroke', handleAddStroke);
            window.removeEventListener('canvas:stroke-remove', handleRemoveStroke);
            window.removeEventListener('canvas:strokes-clear', handleClearStrokes);
        };
    }, [effectiveYOverlay, effectiveDoc]);

    const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDrawingMode || !effectiveYOverlay || !effectiveDoc) return;
        const shell = shellRef.current;
        if (!shell) return;
        const rect = shell.getBoundingClientRect();
        const x = Math.round(e.clientX - rect.left);
        const y = Math.round(e.clientY - rect.top);
        const p = e.pressure || 0.5;

        if (drawRafRef.current !== null) {
            cancelAnimationFrame(drawRafRef.current);
            drawRafRef.current = null;
        }
        pendingDrawPointsRef.current = [];
        isDrawingRef.current = true;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

        const newStroke: OverlayStroke = {
            id: crypto.randomUUID(),
            tool: activeDrawingTool || 'pen',
            color: strokeColor || '#111827',
            size: strokeSize || 3,
            opacity: activeDrawingTool === 'marker' ? 0.5 : 1,
            points: [{ x, y, p }],
        };
        activeDrawingStrokeRef.current = newStroke;
        setCurrentDrawingStroke(newStroke);
    }, [isDrawingMode, effectiveYOverlay, effectiveDoc, activeDrawingTool, strokeColor, strokeSize]);

    const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDrawingRef.current || !activeDrawingStrokeRef.current) return;
        const shell = shellRef.current;
        if (!shell) return;
        const rect = shell.getBoundingClientRect();
        const x = Math.round(e.clientX - rect.left);
        const y = Math.round(e.clientY - rect.top);
        const p = e.pressure || 0.5;

        pendingDrawPointsRef.current.push({ x, y, p });
        if (drawRafRef.current === null) {
            drawRafRef.current = requestAnimationFrame(() => {
                drawRafRef.current = null;
                const stroke = activeDrawingStrokeRef.current;
                const pending = pendingDrawPointsRef.current;
                if (!stroke || pending.length === 0) return;
                pendingDrawPointsRef.current = [];
                stroke.points.push(...pending);
                setCurrentDrawingStroke({ ...stroke });
            });
        }
    }, []);

    const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDrawingRef.current) return;
        isDrawingRef.current = false;
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);

        if (drawRafRef.current !== null) {
            cancelAnimationFrame(drawRafRef.current);
            drawRafRef.current = null;
        }

        const stroke = activeDrawingStrokeRef.current;
        if (stroke) {
            if (pendingDrawPointsRef.current.length > 0) {
                stroke.points.push(...pendingDrawPointsRef.current);
                pendingDrawPointsRef.current = [];
            }
            if (effectiveYOverlay && effectiveDoc) {
                const strokeMap = new Y.Map<unknown>();
                for (const [k, v] of Object.entries(stroke)) {
                    strokeMap.set(k, k === 'points' ? [...stroke.points] : v);
                }
                effectiveDoc.transact(() => {
                    effectiveYOverlay.set(stroke.id, strokeMap);
                });
            }
        }
        activeDrawingStrokeRef.current = null;
        setCurrentDrawingStroke(null);
    }, [effectiveYOverlay, effectiveDoc]);

    // ── Binding mode ──────────────────────────────────────────────────────────
    const isBindingMode = !!pendingBindBlockId;

    const handleBind = useCallback(async (clickedId: string, clickedRect: DOMRect | null) => {
        if (pendingBindBlockId === '__pending_rebind__' && rebindTarget.current) {
            if (rebindTarget.current.id === clickedId) return;
            if (isCircular(rebindTarget.current.id, clickedId, elements)) {
                notifyError("Circular dependency detected! An element cannot be anchored to its own descendants.");
                rebindTarget.current = null;
                onBindingComplete?.();
                return;
            }
            const targetId = rebindTarget.current.id;
            const targetRect = rebindTarget.current.rect;
            const cur = elements.find(e => e.id === targetId);
            if (!cur) return;
            const { offsetX, offsetY } = computeRelativeOffset(targetRect, clickedId, shellRef.current);
            await onSaveAll(elements.map(e => e.id === targetId ? { ...cur, anchorBlockId: clickedId, offsetX, offsetY } : e));
            rebindTarget.current = null;
            onBindingComplete?.();
            return;
        }

        if (!pendingBindBlockId || pendingBindBlockId === '__pending_rebind__') {
            if (isLinkingMode && activeLinkBlockId) {
                const { offsetX, offsetY } = computeRelativeOffset(clickedRect, activeLinkBlockId, shellRef.current);
                const cur = elements.find(e => e.id === clickedId);
                if (!cur) return;
                await onSaveAll(elements.map(e => e.id === clickedId ? { ...cur, anchorBlockId: activeLinkBlockId, offsetX, offsetY } : e));
                onLinkingComplete();
            }
            return;
        }
        const cur = elements.find(e => e.id === clickedId);
        if (!cur) return;
        const { offsetX, offsetY } = computeRelativeOffset(clickedRect, pendingBindBlockId, shellRef.current);
        await onSaveAll(elements.map(e => e.id === clickedId ? { ...cur, anchorBlockId: pendingBindBlockId, offsetX, offsetY } : e));
        rebindTarget.current = null;
        onBindingComplete?.();
    }, [pendingBindBlockId, elements, onSaveAll, onBindingComplete, isLinkingMode, activeLinkBlockId, onLinkingComplete]);

    useEffect(() => {
        if (!pendingBindBlockId || pendingBindBlockId === '__pending_rebind__' || !rebindTarget.current) return;
        const { id, rect } = rebindTarget.current;
        handleBind(id, rect);
    }, [pendingBindBlockId]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleRequestRebind = useCallback((elementId: string, elementRect: DOMRect | null) => {
        rebindTarget.current = { id: elementId, rect: elementRect };
        window.dispatchEvent(new CustomEvent('canvas:requestRebind', { detail: { elementId } }));
    }, []);

    // ── Deleted-anchor recovery ───────────────────────────────────────────────
    useEffect(() => {
        if (!deletedBlockIds?.length) return;
        const removedSet = new Set(deletedBlockIds);
        if (!elements.some(el => el.anchorBlockId && removedSet.has(el.anchorBlockId))) return;

        const survivingNodes = Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]'));
        const shell = shellRef.current;
        const sr = shell?.getBoundingClientRect();

        const repaired = elements.map(el => {
            if (!el.anchorBlockId || !removedSet.has(el.anchorBlockId)) return el;
            const elNode = document.querySelector<HTMLElement>(`[data-element-id="${el.id}"]`);
            const elRect = elNode?.getBoundingClientRect();

            if (survivingNodes.length > 0) {
                let closestBlock = survivingNodes[0];
                let minDistance = Infinity;
                if (elRect) {
                    for (const node of survivingNodes) {
                        const nr = node.getBoundingClientRect();
                        const dist = Math.abs(nr.top - elRect.top);
                        if (dist < minDistance) { minDistance = dist; closestBlock = node; }
                    }
                }
                const newAnchorId = closestBlock.getAttribute('data-block-id') || survivingNodes[0].getAttribute('data-block-id')!;
                const br = closestBlock.getBoundingClientRect();
                return {
                    ...el,
                    anchorBlockId: newAnchorId,
                    offsetX: elRect && sr ? Math.round(elRect.left - sr.left) : el.offsetX,
                    offsetY: elRect ? Math.round(elRect.top - br.top) : el.offsetY,
                };
            }
            return {
                ...el,
                anchorBlockId: '',
                offsetX: elRect && sr ? Math.round(elRect.left - sr.left) : el.offsetX,
                offsetY: elRect && sr ? Math.round(elRect.top - sr.top) : el.offsetY,
            };
        });

        onSaveAll(repaired);
    }, [deletedBlockIds]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Image upload ──────────────────────────────────────────────────────────
    // One path for every image (see lib/noteImageAssets): the image gets its own key, which is kept
    // in this note's encrypted sidecar. A failure is reported instead of silently dropping the image.
    const [uploadError, setUploadError] = useState<string | null>(null);

    const uploadImage = useCallback(async (file: File, mouseX?: number, mouseY?: number) => {
        if (!noteId) return; // no note open: nowhere to attach the image
        let initialAnchorId: string | null = null;
        let initialOffsetX = 24, initialOffsetY = 0;

        if (mouseX !== undefined && mouseY !== undefined) {
            const anchorId = onInsertAnchor?.(mouseX, mouseY);
            if (anchorId) {
                initialAnchorId = anchorId;
                initialOffsetX = 0;
            } else {
                const hit = document.elementFromPoint(mouseX, mouseY);
                const block = hit?.closest('[data-block-id]');
                if (block) {
                    initialAnchorId = block.getAttribute('data-block-id');
                    const br = block.getBoundingClientRect();
                    const sr = shellRef.current?.getBoundingClientRect();
                    if (sr) {
                        initialOffsetX = Math.round(mouseX - sr.left);
                        initialOffsetY = Math.round(mouseY - br.top);
                    }
                } else if (shellRef.current) {
                    const sr = shellRef.current.getBoundingClientRect();
                    initialOffsetX = Math.round(mouseX - sr.left);
                    initialOffsetY = Math.round(mouseY - sr.top);
                }
            }
        }

        const elementId = crypto.randomUUID();
        const placeholder: ImageElement = {
            id: elementId, type: 'image',
            anchorBlockId: initialAnchorId as string,
            offsetX: initialOffsetX, offsetY: initialOffsetY,
            blobId: '__pending__', encryptedKey: '', iv: '', mimeType: file.type,
        };
        setUploadError(null);
        await onElementAdd(placeholder);
        try {
            const stored = await storeNoteImage(noteId, file);
            await onElementRemove(elementId);
            await onElementAdd({
                id: crypto.randomUUID(), type: 'image',
                anchorBlockId: initialAnchorId as string,
                offsetX: initialOffsetX, offsetY: initialOffsetY,
                blobId: stored.assetId, encryptedKey: '', bek: stored.bekBase64, iv: stored.ivBase64,
                mimeType: stored.mimeType, width: 300,
            } as ImageElement);
        } catch (err) {
            console.error('[Canvas] Image upload failed:', err);
            await onElementRemove(elementId);
            setUploadError('Das Bild konnte nicht hochgeladen werden. Bitte versuche es noch einmal.');
        }
    }, [noteId, onElementAdd, onElementRemove, onInsertAnchor]);

    const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const images = extractImageFiles(e.dataTransfer);
        for (const f of images) await uploadImage(f, e.clientX, e.clientY);
    }, [uploadImage]);

    useEffect(() => {
        const handlePaste = async (e: ClipboardEvent) => {
            if (!e.clipboardData) return;
            const images: File[] = [];
            for (const item of Array.from(e.clipboardData.items)) {
                const f = item.getAsFile();
                if (f?.type.startsWith('image/')) images.push(f);
            }
            if (!images.length) return;
            e.preventDefault();
            for (const f of images) await uploadImage(f);
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [uploadImage]);

    useEffect(() => {
        if (!isBindingMode) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { rebindTarget.current = null; onBindingComplete?.(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isBindingMode, onBindingComplete]);

    const mobileElements = useMemo(() => {
        if (!isMobile) return elements;
        const blockIds = getAllDomBlockIds();
        return [...elements].sort((a, b) => {
            const ai = blockIds.indexOf(a.anchorBlockId), bi = blockIds.indexOf(b.anchorBlockId);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });
    }, [elements, isMobile]);

    const renderElements = isMobile ? mobileElements : elements;
    const bgElements = renderElements.filter(el => (el.zIndex ?? 0) < 0);
    const fgElements = renderElements.filter(el => (el.zIndex ?? 0) >= 0);

    return (
        <div ref={shellRef} className="canvas-shell relative w-full h-full min-h-[500px]"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
        >
            {/* Background Layer (Behind Editor) */}
            <div className="canvas-bg absolute inset-0 pointer-events-none z-0">
                {bgElements.map(el => (
                    <CanvasElementComponent
                        key={el.id}
                        element={el}
                        isMobile={isMobile}
                        userId={userId}
                        privateKey={privateKey}
                        imageBlobCache={imageBlobCache}
                        isBindingMode={isBindingMode}
                        isLinkingMode={isLinkingMode}
                        setHoveredElementId={setHoveredElementId}
                        onBind={handleBind}
                        onRequestRebind={handleRequestRebind}
                        onMove={onElementMove}
                        onUpdate={onUpdate}
                        onRemove={onElementRemove}
                        showAnchorLine={el.id === rebindTarget.current?.id}
                    />
                ))}
            </div>

            {/* Editor Layer */}
            <div className="relative z-10">
                {children}
            </div>

            {/* Drawing Layer (Above Editor) */}
            <div
                className={`canvas-draw absolute inset-0 z-20 ${
                    isDrawingMode ? 'pointer-events-auto' : 'pointer-events-none'
                }`}
                onPointerDown={isDrawingMode ? handlePointerDown : undefined}
                onPointerMove={isDrawingMode ? handlePointerMove : undefined}
                onPointerUp={isDrawingMode ? handlePointerUp : undefined}
                onPointerCancel={isDrawingMode ? handlePointerUp : undefined}
            >
                <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
                    {overlayStrokes.map(stroke => {
                        const pathData = pointsToSvgPath(stroke.points);
                        if (!pathData) return null;
                        return (
                            <path
                                key={stroke.id}
                                d={pathData}
                                fill="none"
                                stroke={stroke.color || '#111827'}
                                strokeWidth={stroke.size || 3}
                                strokeOpacity={stroke.opacity ?? 1}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={stroke.tool === 'marker' ? { mixBlendMode: 'multiply' } : undefined}
                            />
                        );
                    })}
                    {currentDrawingStroke && (
                        <path
                            d={pointsToSvgPath(currentDrawingStroke.points)}
                            fill="none"
                            stroke={currentDrawingStroke.color || '#111827'}
                            strokeWidth={currentDrawingStroke.size || 3}
                            strokeOpacity={currentDrawingStroke.opacity ?? 1}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={currentDrawingStroke.tool === 'marker' ? { mixBlendMode: 'multiply' } : undefined}
                        />
                    )}
                </svg>

                {fgElements.map(el => (
                    <CanvasElementComponent
                        key={el.id}
                        element={el}
                        isMobile={isMobile}
                        userId={userId}
                        privateKey={privateKey}
                        imageBlobCache={imageBlobCache}
                        isBindingMode={isBindingMode}
                        onBind={handleBind}
                        onRequestRebind={handleRequestRebind}
                        onMove={onElementMove}
                        onUpdate={onUpdate}
                        onRemove={onElementRemove}
                        showAnchorLine={el.id === pendingBindBlockId || (pendingBindBlockId === '__pending_rebind__' && rebindTarget.current?.id === el.id)}
                    />
                ))}
            </div>

            {uploadError && (
                <div role="alert" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 rounded-[12px] bg-t2-surface px-4 py-2.5 text-[13px] text-t2-ink shadow-[0_0_0_1px_var(--t2-line),0_8px_24px_rgba(0,0,0,0.12)]">
                    {uploadError}
                    <button type="button" onClick={() => setUploadError(null)} className="text-t2-ink-3 hover:text-t2-ink">Schließen</button>
                </div>
            )}
            {/* Binding mode toast */}
            {isBindingMode && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 rounded-full bg-t2-ink text-t2-bg text-sm shadow-xl pointer-events-none">
                    {rebindTarget.current ? 'Select text → Connect to change anchor · Esc to cancel' : 'Click an image to connect it · Esc to cancel'}
                </div>
            )}
        </div>
    );
}
