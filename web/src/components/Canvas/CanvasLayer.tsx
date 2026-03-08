"use client";

import { useRef, useCallback, useState, useEffect, useMemo, type ReactNode } from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import CanvasElementComponent from './CanvasElement';
import { CanvasElement, ImageElement, TextWidgetElement } from '@/types/canvas';
import * as cryptoLib from '@/lib/crypto';

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
}

function isCircular(startId: string, targetId: string, elements: CanvasElement[]): boolean {
    let currentId = targetId;
    const visited = new Set<string>();

    while (currentId) {
        if (currentId === startId) return true;
        if (visited.has(currentId)) break; // Safety break
        visited.add(currentId);

        const el = elements.find(e => e.id === currentId);
        if (el?.anchorBlockId) {
            currentId = el.anchorBlockId;
        } else {
            break;
        }
    }
    return false;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAllDomBlockIds(): string[] {
    return Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]'))
        .map(n => n.getAttribute('data-block-id')!).filter(Boolean);
}

function extractImageFiles(dt: DataTransfer): File[] {
    return Array.from(dt.items ?? [])
        .map(i => i.getAsFile()).filter((f): f is File => !!f && f.type.startsWith('image/'));
}

/**
 * Compute offsets that preserve the element's visual position when binding to a new anchor.
 * NEW MODEL:
 *   offsetX = shell-relative horizontal (image always at same column, px from shell left)
 *   offsetY = anchor-relative vertical  (image tracks the paragraph up/down)
 */
function computeRelativeOffset(
    elementRect: DOMRect | null,
    anchorBlockId: string,
    shell: HTMLElement | null,
): { offsetX: number; offsetY: number } {
    if (!elementRect || !shell) {
        const fallbackLeft = shell ? shell.getBoundingClientRect().width + 24 : 700;
        return { offsetX: fallbackLeft, offsetY: 0 };
    }
    const anchorEl = document.querySelector<HTMLElement>(`[data-block-id="${anchorBlockId}"], [data-element-id="${anchorBlockId}"]`);
    const sr = shell.getBoundingClientRect();
    return {
        offsetX: Math.round(elementRect.left - sr.left),   // shell-relative column
        offsetY: anchorEl
            ? Math.round(elementRect.top - anchorEl.getBoundingClientRect().top)
            : 0,
    };
}

// ─── CanvasLayer ──────────────────────────────────────────────────────────────

export default function CanvasLayer({
    children, elements, isLoaded, publicKey, privateKey, userId, noteId,
    onElementMove, onElementAdd, onElementRemove, deletedBlockIds, onSaveAll,
    pendingBindBlockId, onBindingComplete, onUpdate, onInsertAnchor,
    hoveredElementId, setHoveredElementId, isLinkingMode, activeLinkBlockId, onLinkingComplete,
}: CanvasLayerProps) {
    const isMobile = useMediaQuery('(max-width: 768px)');
    const shellRef = useRef<HTMLDivElement>(null);
    const imageBlobCache = useRef(new Map<string, string>());
    const [activeElementId] = useState<string | null>(null);

    // When user right-clicks "Change anchor", we store (elementId, currentRect) here.
    // As soon as pendingBindBlockId becomes a real block ID, we auto-bind this element.
    const rebindTarget = useRef<{ id: string; rect: DOMRect | null } | null>(null);

    // ── Binding mode ──────────────────────────────────────────────────────────
    const isBindingMode = !!pendingBindBlockId;

    const handleBind = useCallback(async (clickedId: string, clickedRect: DOMRect | null) => {
        // CASE A: We are looking for an anchor (pending) and user clicked an element to BE the anchor
        if (pendingBindBlockId === '__pending_rebind__' && rebindTarget.current) {
            // But usually the user clicks a block. If they clicked an image item, 
            // the CanvasElement onClick calls this. 
            // We interpret "clicked image B while rebindTarget is A" as "anchor A to B".
            if (rebindTarget.current.id === clickedId) return; // avoid self-anchor
            if (isCircular(rebindTarget.current.id, clickedId, elements)) {
                alert("Circular dependency detected! An element cannot be anchored to its own descendants.");
                rebindTarget.current = null;
                onBindingComplete?.();
                return;
            }

            const targetId = rebindTarget.current.id;
            const targetRect = rebindTarget.current.rect;
            const cur = elements.find(e => e.id === targetId);
            if (!cur) return;

            const { offsetX, offsetY } = computeRelativeOffset(targetRect, clickedId, shellRef.current);
            const updated = { ...cur, anchorBlockId: clickedId, offsetX, offsetY };
            await onSaveAll(elements.map(e => e.id === targetId ? updated : e));
            rebindTarget.current = null;
            onBindingComplete?.();
            return;
        }

        // Normal binding to a text block (handled via window events mostly)
        if (!pendingBindBlockId || pendingBindBlockId === '__pending_rebind__') {
            // CASE C: Linking Mode (Pin click -> Image click)
            if (isLinkingMode && activeLinkBlockId) {
                const { offsetX, offsetY } = computeRelativeOffset(clickedRect, activeLinkBlockId, shellRef.current);
                const cur = elements.find(e => e.id === clickedId);
                if (!cur) return;
                const updated = { ...cur, anchorBlockId: activeLinkBlockId, offsetX, offsetY };
                await onSaveAll(elements.map(e => e.id === clickedId ? updated : e));
                onLinkingComplete();
                return;
            }
            return;
        }
        const cur = elements.find(e => e.id === clickedId);
        if (!cur) return;
        const { offsetX, offsetY } = computeRelativeOffset(clickedRect, pendingBindBlockId, shellRef.current);
        const updated = { ...cur, anchorBlockId: pendingBindBlockId, offsetX, offsetY };
        await onSaveAll(elements.map(e => e.id === clickedId ? updated : e));
        rebindTarget.current = null;
        onBindingComplete?.();
    }, [pendingBindBlockId, elements, onSaveAll, onBindingComplete, isLinkingMode, activeLinkBlockId, onLinkingComplete]);

    // Auto-bind via right-click flow:
    // When pendingBindBlockId changes to a real block ID while rebindTarget is set, bind immediately.
    useEffect(() => {
        if (!pendingBindBlockId || pendingBindBlockId === '__pending_rebind__') return;
        if (!rebindTarget.current) return;
        const { id, rect } = rebindTarget.current;
        handleBind(id, rect);
    }, [pendingBindBlockId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Right-click "Change anchor": store this element as the target and activate binding toast
    const handleRequestRebind = useCallback((elementId: string, elementRect: DOMRect | null) => {
        rebindTarget.current = { id: elementId, rect: elementRect };
        // Tell page.tsx to enter binding mode (sets pendingBindBlockId = '__pending_rebind__')
        window.dispatchEvent(new CustomEvent('canvas:requestRebind', { detail: { elementId } }));
    }, []);

    // ── Deleted-anchor recovery ───────────────────────────────────────────────
    useEffect(() => {
        if (!deletedBlockIds?.length) return;
        const removedSet = new Set(deletedBlockIds);
        const hasOrphans = elements.some(el => el.anchorBlockId && removedSet.has(el.anchorBlockId));
        if (!hasOrphans) return;
        const surviving = getAllDomBlockIds();
        const fallback = surviving[0] ?? null;
        const repaired = elements.map(el =>
            el.anchorBlockId && removedSet.has(el.anchorBlockId)
                ? { ...el, anchorBlockId: fallback, offsetY: 0 } : el
        );
        onSaveAll(repaired);
    }, [deletedBlockIds]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Image upload ──────────────────────────────────────────────────────────
    const uploadImage = useCallback(async (file: File, mouseX?: number, mouseY?: number) => {
        if (!publicKey || !userId) return;

        let initialAnchorId: string | null = null;
        let initialOffsetX = 24;
        let initialOffsetY = 0;

        // Try to find the nearest block or insert a precise anchor
        if (mouseX !== undefined && mouseY !== undefined) {
            // Priority: Precise Anchor
            const anchorId = onInsertAnchor?.(mouseX, mouseY);
            if (anchorId) {
                initialAnchorId = anchorId;
                initialOffsetX = 0; // Relative to anchor (centered/sticky)
                initialOffsetY = 0;
            } else {
                // Fallback: Block anchoring
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
        await onElementAdd(placeholder);
        try {
            const fileKey = await cryptoLib.generateFileKey();
            const fileKeyJwk = await window.crypto.subtle.exportKey('jwk', fileKey);
            const { iv, ciphertext } = await cryptoLib.encryptFile(file, fileKey);
            const encryptedMeta = await cryptoLib.encryptMetadata({ title: `.canvas-img-${elementId}`, fileKey: fileKeyJwk, iv }, publicKey);
            const createRes = await fetch('/api/v1/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-User-ID': userId },
                body: JSON.stringify({ type: 'note', size: ciphertext.size, public_meta: {}, secured_meta: encryptedMeta, visibility: 'private' }),
            });
            if (!createRes.ok) throw new Error('Failed to create image record');
            const newFile = await createRes.json() as { id: string };
            await fetch(`/api/v1/files/${newFile.id}/upload`, { method: 'POST', headers: { 'X-User-ID': userId }, body: ciphertext });
            await onElementRemove(elementId);
            await onElementAdd({
                id: crypto.randomUUID(), type: 'image',
                anchorBlockId: initialAnchorId as string,
                offsetX: initialOffsetX, offsetY: initialOffsetY,
                blobId: newFile.id, encryptedKey: encryptedMeta, iv, mimeType: file.type, width: 300,
            } as ImageElement);
        } catch (err) {
            console.error('[Canvas] Image upload failed:', err);
            await onElementRemove(elementId);
        }
    }, [publicKey, userId, onElementAdd, onElementRemove]);

    // ── Drop & Paste ──────────────────────────────────────────────────────────
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

    // ── Esc to cancel binding ─────────────────────────────────────────────────
    useEffect(() => {
        if (!isBindingMode) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { rebindTarget.current = null; onBindingComplete?.(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isBindingMode, onBindingComplete]);

    // ── Mobile sort ───────────────────────────────────────────────────────────
    const mobileElements = useMemo(() => {
        if (!isMobile) return elements;
        const blockIds = getAllDomBlockIds();
        return [...elements].sort((a, b) => {
            const ai = blockIds.indexOf(a.anchorBlockId), bi = blockIds.indexOf(b.anchorBlockId);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });
    }, [elements, isMobile]);

    // ─── Render ───────────────────────────────────────────────────────────────
    const renderElements = isMobile ? mobileElements : elements;
    const bgElements = renderElements.filter(el => (el.zIndex ?? 0) < 0);
    const fgElements = renderElements.filter(el => (el.zIndex ?? 0) >= 0);

    return (
        <div ref={shellRef} className="canvas-shell relative w-full h-full min-h-[500px]">
            {/* Background Layer (Behind Editor) */}
            <div className="canvas-bg absolute inset-0 pointer-events-none z-0 overflow-hidden">
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
            <div className="canvas-draw absolute inset-0 pointer-events-none z-20 overflow-hidden">
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

            {/* Binding mode toast */}
            {isBindingMode && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 rounded-full bg-[#000080]/90 text-white text-sm shadow-xl pointer-events-none backdrop-blur-sm">
                    {rebindTarget.current ? 'Select text → Connect to change anchor · Esc to cancel' : 'Click an image to connect it · Esc to cancel'}
                </div>
            )}
        </div>
    );
}
