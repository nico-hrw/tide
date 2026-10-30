// web/src/components/Canvas/CanvasNoteItem.tsx
"use client";

import { useRef, useState, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';
import { CanvasNoteItem as CanvasNoteItemType, CanvasTextItem, CanvasImageItem, isCanvasTextItem, isCanvasImageItem } from '@/types/canvasNote';
import { decryptAssetWithBEK } from '@/lib/assetCrypto';
import { apiFetch } from '@/lib/api';
import { useActiveNoteStore } from '@/store/activeNoteStore';
import { AssetKeyRecord } from './useCanvasImageUpload';
import type * as Y from 'yjs';

// ── Image Widget ──────────────────────────────────────────────────────────────

function ImageWidget({
    item,
    ydoc,
    imageBlobCache,
}: {
    item: CanvasImageItem;
    ydoc?: Y.Doc | null;
    imageBlobCache: React.MutableRefObject<Map<string, string>>;
}) {
    const assetId = item.assetId || item.blobId || '';
    const [src, setSrc] = useState<string | null>(() => (assetId ? imageBlobCache.current.get(assetId) || null : null));
    const [loading, setLoading] = useState(() => !Boolean(assetId && imageBlobCache.current.get(assetId)));
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!assetId || assetId === '__pending__') return;
        if (imageBlobCache.current.has(assetId)) return;

        let cancelled = false;

        const loadAndDecrypt = async () => {
            try {
                const doc = ydoc || useActiveNoteStore.getState().activeYDoc;
                let record: AssetKeyRecord | undefined;

                if (doc) {
                    record = doc.getMap<AssetKeyRecord>('assets').get(assetId);
                }

                if (!record?.bekBase64) {
                    // Observe assets map in case it arrives shortly via CRDT
                    if (doc) {
                        const assetsMap = doc.getMap<AssetKeyRecord>('assets');
                        const handler = () => {
                            const rec = assetsMap.get(assetId);
                            if (rec?.bekBase64 && !cancelled) {
                                assetsMap.unobserve(handler);
                                loadAndDecrypt();
                            }
                        };
                        assetsMap.observe(handler);
                    }
                    if (!cancelled) {
                        setError('Lade Asset-Schlüssel...');
                    }
                    return;
                }

                // Fetch ciphertext blob from /api/files/${assetId}/blob (with fallbacks)
                let res = await apiFetch(`/api/files/${encodeURIComponent(assetId)}/blob`);
                if (!res.ok) {
                    res = await apiFetch(`/api/v1/files/${encodeURIComponent(assetId)}/blob`);
                }
                if (!res.ok) {
                    res = await apiFetch(`/api/v1/files/${encodeURIComponent(assetId)}/download`);
                }
                if (!res.ok) {
                    const msg = `HTTP ${res.status} for asset ${assetId}`;
                    console.error('[CanvasNote] Image download failed:', msg);
                    if (!cancelled) { setError(msg); setLoading(false); }
                    return;
                }

                const ciphertextBuffer = await res.arrayBuffer();
                const decryptedBlob = await decryptAssetWithBEK(
                    ciphertextBuffer,
                    record.bekBase64,
                    record.ivBase64,
                    record.mimeType || 'image/png'
                );

                const url = URL.createObjectURL(decryptedBlob);
                imageBlobCache.current.set(assetId, url);
                if (!cancelled) {
                    setSrc(url);
                    setLoading(false);
                    setError(null);
                }
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Fehler beim Entschlüsseln';
                console.error('[CanvasNote] Decrypt image error:', e);
                if (!cancelled) {
                    setError(msg);
                    setLoading(false);
                }
            }
        };

        loadAndDecrypt();
        return () => { cancelled = true; };
    }, [assetId, ydoc, imageBlobCache]);

    if (loading) return (
        <div style={{ width: item.width, height: 120 }} className="flex items-center justify-center rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
            <div className="w-5 h-5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
        </div>
    );
    if (error || !src) return (
        <div style={{ width: item.width, height: 60 }} className="flex items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-400 text-xs px-2">
            <span>Bild konnte nicht geladen werden</span>
            {error && <span className="block text-[10px] opacity-50 ml-1">{error}</span>}
        </div>
    );
    return (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
            src={src}
            alt=""
            draggable={false}
            className="rounded-lg block select-none"
            style={{ width: item.width, maxWidth: 600, objectFit: 'contain' }}
        />
    );
}

// ── Text Widget ───────────────────────────────────────────────────────────────

function TextWidget({
    item,
    isEditing,
    onUpdate,
    onStartEdit,
}: {
    item: CanvasTextItem;
    isEditing: boolean;
    onUpdate: (content: string) => void;
    onStartEdit: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isEditing && ref.current) {
            ref.current.focus();
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(ref.current);
            range.collapse(false);
            sel?.removeAllRanges();
            sel?.addRange(range);
        }
    }, [isEditing]);

    return (
        <div
            ref={ref}
            contentEditable={isEditing}
            suppressContentEditableWarning
            onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
            onBlur={(e) => {
                const text = e.currentTarget.innerText;
                onUpdate(text);
            }}
            onKeyDown={(e) => {
                if (e.key === 'Escape') {
                    (e.currentTarget as HTMLElement).blur();
                }
                e.stopPropagation();
            }}
            style={{
                minWidth: 80,
                width: item.width,
                fontSize: item.fontSize ?? 14,
                color: item.color ?? '#111',
                padding: '6px 10px',
                outline: 'none',
                borderRadius: 6,
                cursor: isEditing ? 'text' : 'default',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                userSelect: isEditing ? 'text' : 'none',
                lineHeight: 1.5,
                background: isEditing ? 'rgba(99,102,241,0.04)' : 'transparent',
                boxShadow: isEditing ? '0 0 0 1.5px rgba(99,102,241,0.4)' : undefined,
            }}
        >
            {item.content || (isEditing ? '' : <span style={{ color: '#aaa' }}>Text…</span>)}
        </div>
    );
}

// ── Main CanvasNoteItem ────────────────────────────────────────────────────────

export interface CanvasNoteItemProps {
    item: CanvasNoteItemType;
    zoom: number;
    privateKey?: CryptoKey | null;
    ydoc?: Y.Doc | null;
    imageBlobCache: React.MutableRefObject<Map<string, string>>;
    isEditingId: string | null;
    onStartEdit: (id: string) => void;
    onUpdate: (id: string, updates: Partial<CanvasNoteItemType>) => void;
    onRemove: (id: string) => void;
    onMoveEnd: (id: string, x: number, y: number) => void;
    onDrag?: (id: string, dx: number, dy: number) => void;
    onDragEnd?: () => void;
}

export default function CanvasNoteItemComponent({
    item, zoom, ydoc, imageBlobCache,
    isEditingId, onStartEdit, onUpdate, onRemove, onMoveEnd,
    onDrag, onDragEnd,
}: CanvasNoteItemProps) {
    const elRef = useRef<HTMLDivElement>(null);
    const [hovered, setHovered] = useState(false);
    const isEditing = isEditingId === item.id;
    const dragState = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);
    const dragCleanupRef = useRef<(() => void) | null>(null);

    const onMouseDown = useCallback((e: React.MouseEvent) => {
        if (isEditing || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        dragState.current = { startX: e.clientX, startY: e.clientY, initX: item.x, initY: item.y };

        const onMv = (me: MouseEvent) => {
            if (!dragState.current || !elRef.current) return;
            const dx = (me.clientX - dragState.current.startX) / zoom;
            const dy = (me.clientY - dragState.current.startY) / zoom;
            elRef.current.style.transform = `translate(${dx}px, ${dy}px) rotate(${item.rotation ?? 0}deg)`;
            onDrag?.(item.id, dx, dy);
        };
        const onUp = (me: MouseEvent) => {
            if (!dragState.current) return;
            if (elRef.current) elRef.current.style.transform = '';
            const dx = (me.clientX - dragState.current.startX) / zoom;
            const dy = (me.clientY - dragState.current.startY) / zoom;
            onDragEnd?.();
            onMoveEnd(item.id, dragState.current.initX + dx, dragState.current.initY + dy);
            dragState.current = null;
            window.removeEventListener('mousemove', onMv);
            window.removeEventListener('mouseup', onUp);
            dragCleanupRef.current = null;
        };
        // Store cleanup for unmount
        dragCleanupRef.current = () => {
            window.removeEventListener('mousemove', onMv);
            window.removeEventListener('mouseup', onUp);
            dragState.current = null;
            if (elRef.current) elRef.current.style.transform = '';
        };
        window.addEventListener('mousemove', onMv);
        window.addEventListener('mouseup', onUp);
    }, [item.id, item.x, item.y, item.rotation, zoom, isEditing, onMoveEnd, onDrag, onDragEnd]);

    const resizeState = useRef<{ startX: number; initWidth: number } | null>(null);
    const resizeCleanupRef = useRef<(() => void) | null>(null);
    const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        resizeState.current = { startX: e.clientX, initWidth: item.width };
        const onMove = (me: MouseEvent) => {
            if (!resizeState.current) return;
            const dx = (me.clientX - resizeState.current.startX) / zoom;
            const newW = Math.max(80, resizeState.current.initWidth + dx);
            if (elRef.current) {
                const inner = elRef.current.querySelector('[data-resize-target]') as HTMLElement;
                if (inner) inner.style.width = `${newW}px`;
            }
        };
        const onUp = (me: MouseEvent) => {
            if (!resizeState.current) return;
            const dx = (me.clientX - resizeState.current.startX) / zoom;
            onUpdate(item.id, { width: Math.max(80, resizeState.current.initWidth + dx) } as Partial<CanvasNoteItemType>);
            resizeState.current = null;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            resizeCleanupRef.current = null;
        };
        // Store cleanup for unmount
        resizeCleanupRef.current = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            resizeState.current = null;
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [item.id, item.width, zoom, onUpdate]);

    useEffect(() => {
        return () => {
            dragCleanupRef.current?.();
            resizeCleanupRef.current?.();
        };
    }, []);

    const handleDelete = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();
        onRemove(item.id);

        if (isCanvasImageItem(item)) {
            const assetId = item.assetId || item.blobId;
            if (assetId && assetId !== '__pending__') {
                const doc = ydoc || useActiveNoteStore.getState().activeYDoc;
                if (doc) {
                    doc.getMap<AssetKeyRecord>('assets').delete(assetId);
                }
                try {
                    const delRes = await apiFetch(`/api/files/${encodeURIComponent(assetId)}`, { method: 'DELETE' });
                    if (!delRes.ok) {
                        await apiFetch(`/api/v1/files/${encodeURIComponent(assetId)}`, { method: 'DELETE' });
                    }
                } catch (err: unknown) {
                    console.error('[CanvasNoteItem] Error deleting asset blob:', err);
                }
            }
        }
    }, [item, onRemove, ydoc]);

    return (
        <div
            ref={elRef}
            className="canvas-note-item group absolute"
            style={{
                left: item.x,
                top: item.y,
                zIndex: item.zIndex,
                transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined,
                transformOrigin: 'center center',
                cursor: isEditing ? 'text' : 'grab',
            }}
            onMouseDown={onMouseDown}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* Delete button */}
            {hovered && !isEditing && (
                <button
                    className="absolute -top-6 right-0 p-0.5 bg-gray-900/80 rounded text-white/70 hover:text-red-400 z-10 transition-colors"
                    onMouseDown={handleDelete}
                    aria-label="Delete item"
                >
                    <X size={12} />
                </button>
            )}

            <div data-resize-target>
                {isCanvasTextItem(item) && (
                    <TextWidget
                        item={item}
                        isEditing={isEditing}
                        onUpdate={(content) => onUpdate(item.id, { content } as Partial<CanvasNoteItemType>)}
                        onStartEdit={() => onStartEdit(item.id)}
                    />
                )}
                {isCanvasImageItem(item) && (
                    <ImageWidget item={item} ydoc={ydoc} imageBlobCache={imageBlobCache} />
                )}
            </div>

            {/* Resize handle */}
            {hovered && !isEditing && (
                <div
                    className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                    onMouseDown={onResizeMouseDown}
                    style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(99,102,241,0.7) 50%)', borderRadius: '0 0 4px 0' }}
                />
            )}
        </div>
    );
}
