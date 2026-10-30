// web/src/components/Canvas/CanvasNoteEditor.tsx
"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { WebsocketProvider } from 'y-websocket';
import { CanvasNoteData, CanvasNoteItem, CanvasTextItem, CanvasImageItem, createEmptyCanvasNote } from '@/types/canvasNote';
import CanvasNoteItemComponent from './CanvasNoteItem';
import { useCanvasImageUpload } from './useCanvasImageUpload';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { useActiveNoteStore } from '@/store/activeNoteStore';
import { apiFetch } from '@/lib/api';

const CANVAS_W = 4000;
const CANVAS_H = 3000;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.0;
const GRID_SIZE = 24;

const USER_COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#3b82f6'];

interface CanvasPresence {
    x: number;
    y: number;
    selectedIds?: string[];
    dragDelta?: { id: string; dx: number; dy: number } | null;
}

interface PeerAwarenessState {
    user?: { name: string; color: string; id?: string };
    canvasPresence?: CanvasPresence;
}

interface RemotePeer {
    clientId: number;
    user: { name: string; color: string; id?: string };
    presence: CanvasPresence;
}

interface CanvasNoteEditorProps {
    noteId: string;
    initialData: CanvasNoteData | null;
    publicKey?: CryptoKey | null;
    privateKey?: CryptoKey | null;
    userId: string;
    onChange?: (data: CanvasNoteData) => void;
    ydoc?: Y.Doc | null;
    provider?: WebsocketProvider | { awareness: Awareness } | null;
}

export default function CanvasNoteEditor({
    noteId, initialData, userId, onChange, ydoc: propYdoc, provider: propProvider,
}: CanvasNoteEditorProps) {
    // ── Y.Doc & Provider Initialization ─────────────────────────────────────────
    const storeYDoc = useActiveNoteStore((state) => state.activeYDoc);
    const setActiveYDoc = useActiveNoteStore((state) => state.setActiveYDoc);

    const [internalDoc] = useState(() => new Y.Doc());
    const effectiveDoc = propYdoc || storeYDoc || internalDoc;

    useEffect(() => {
        if (!storeYDoc && effectiveDoc) {
            setActiveYDoc(effectiveDoc);
        }
    }, [storeYDoc, effectiveDoc, setActiveYDoc]);

    const [internalProvider, setInternalProvider] = useState<WebsocketProvider | null>(null);
    const effectiveProvider = propProvider || internalProvider;

    useEffect(() => {
        if (propProvider) return;
        if (typeof window === 'undefined' || !noteId) return;

        let ws: WebsocketProvider | null = null;
        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
            let wsHost = window.location.host;
            if (apiUrl) {
                try { wsHost = new URL(apiUrl).host; } catch {}
            }
            const token = sessionStorage.getItem('tide_session_token') || localStorage.getItem('tide_session_token') || '';
            const wsUrl = `${protocol}//${wsHost}/api/v1/files/${encodeURIComponent(noteId)}`;
            ws = new WebsocketProvider(wsUrl, 'ws', effectiveDoc, {
                params: { user_id: userId, token },
            });
            const createdWs = ws;
            queueMicrotask(() => {
                setInternalProvider(createdWs);
            });
            return () => {
                createdWs.destroy();
            };
        } catch (err) {
            console.warn('[CanvasNoteEditor] WebSocket connection fallback to local awareness:', err);
        }
    }, [propProvider, noteId, userId, effectiveDoc]);

    // Local fallback awareness if no provider exists
    const [fallbackAwareness] = useState(() => new Awareness(effectiveDoc));
    const awareness: Awareness = effectiveProvider?.awareness || fallbackAwareness;

    // Set local awareness user
    useEffect(() => {
        if (!awareness) return;
        const hash = Array.from(userId || 'user').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const color = USER_COLORS[hash % USER_COLORS.length];

        awareness.setLocalStateField('user', {
            name: userId || 'User',
            color,
            id: userId,
        });
    }, [awareness, userId]);

    // ── CRDT Canvas Map Binding (BUG-14) ──────────────────────────────────────
    const [items, setItems] = useState<CanvasNoteItem[]>(() => (initialData ?? createEmptyCanvasNote(noteId)).items);
    const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);

    // One-time migration: If yCanvas is empty but initialData has items
    useEffect(() => {
        if (!effectiveDoc) return;
        const yCanvas = effectiveDoc.getMap<Y.Map<unknown>>('canvas');
        if (yCanvas.size === 0 && initialData?.items && initialData.items.length > 0) {
            effectiveDoc.transact(() => {
                for (const item of initialData.items) {
                    const inner = new Y.Map<unknown>();
                    inner.set('id', item.id);
                    inner.set('type', item.type);
                    inner.set('x', item.x);
                    inner.set('y', item.y);
                    inner.set('width', item.width);
                    if (item.height !== undefined) inner.set('height', item.height);
                    inner.set('rotation', item.rotation ?? 0);
                    inner.set('zIndex', item.zIndex ?? 1);
                    if (item.color !== undefined) inner.set('color', item.color);
                    if (item.strokeWidth !== undefined) inner.set('strokeWidth', item.strokeWidth);

                    if (item.type === 'image') {
                        const img = item as CanvasImageItem;
                        const assetId = img.assetId || img.blobId || '';
                        inner.set('assetId', assetId);
                    } else if (item.type === 'text') {
                        const txt = item as CanvasTextItem;
                        const yText = new Y.Text();
                        if (txt.content) yText.insert(0, txt.content);
                        inner.set('text', yText);
                        if (txt.fontSize) inner.set('fontSize', txt.fontSize);
                    }
                    yCanvas.set(item.id, inner);
                }
            });
        }
    }, [effectiveDoc, initialData]);

    // Reactive observeDeep on yCanvas
    useEffect(() => {
        if (!effectiveDoc) return;
        const yCanvas = effectiveDoc.getMap<Y.Map<unknown>>('canvas');

        const syncItems = () => {
            const next: CanvasNoteItem[] = [];
            yCanvas.forEach((innerMap) => {
                if (innerMap && typeof innerMap.get === 'function') {
                    const id = (innerMap.get('id') as string) || '';
                    const type = (innerMap.get('type') as 'text' | 'image') || 'text';
                    const x = (innerMap.get('x') as number) ?? 0;
                    const y = (innerMap.get('y') as number) ?? 0;
                    const width = (innerMap.get('width') as number) ?? 200;
                    const height = innerMap.get('height') as number | undefined;
                    const zIndex = (innerMap.get('zIndex') as number) ?? 1;
                    const rotation = (innerMap.get('rotation') as number) ?? 0;
                    const color = innerMap.get('color') as string | undefined;
                    const strokeWidth = innerMap.get('strokeWidth') as number | undefined;
                    const assetId = (innerMap.get('assetId') as string) || (innerMap.get('blobId') as string) || '';

                    const textVal = innerMap.get('text');
                    const content = textVal instanceof Y.Text
                        ? textVal.toString()
                        : (typeof textVal === 'string' ? textVal : ((innerMap.get('content') as string) || ''));

                    if (type === 'image') {
                        next.push({
                            id,
                            type: 'image',
                            x,
                            y,
                            width,
                            height,
                            zIndex,
                            rotation,
                            assetId,
                            blobId: assetId,
                            mimeType: (innerMap.get('mimeType') as string) || 'image/png',
                        });
                    } else {
                        next.push({
                            id,
                            type: 'text',
                            x,
                            y,
                            width,
                            height,
                            zIndex,
                            rotation,
                            color,
                            strokeWidth,
                            content,
                            fontSize: innerMap.get('fontSize') as number | undefined,
                        });
                    }
                }
            });
            setItems(next);
        };

        yCanvas.observeDeep(syncItems);
        syncItems();

        return () => {
            yCanvas.unobserveDeep(syncItems);
        };
    }, [effectiveDoc]);

    // Listen to remote awareness cursors & drag deltas
    useEffect(() => {
        if (!awareness) return;
        const handleAwarenessChange = () => {
            const states = awareness.getStates();
            const peers: RemotePeer[] = [];
            states.forEach((rawState: unknown, cid: number) => {
                if (cid === awareness.clientID) return;
                const state = rawState as PeerAwarenessState | undefined;
                if (state?.canvasPresence) {
                    peers.push({
                        clientId: cid,
                        user: state.user || { name: 'Collaborator', color: '#6366f1' },
                        presence: state.canvasPresence,
                    });
                }
            });
            setRemotePeers(peers);
        };

        awareness.on('change', handleAwarenessChange);
        handleAwarenessChange();
        return () => {
            awareness.off('change', handleAwarenessChange);
        };
    }, [awareness]);

    // ── Editor State ──────────────────────────────────────────────────────────
    const [zoom, setZoom] = useState(0.5);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isEditingId, setIsEditingId] = useState<string | null>(null);
    const imageBlobCache = useRef(new Map<string, string>());

    useEffect(() => {
        const cache = imageBlobCache.current;
        return () => {
            cache.forEach(url => URL.revokeObjectURL(url));
        };
    }, []);

    const viewportRef = useRef<HTMLDivElement>(null);
    const worldRef = useRef<HTMLDivElement>(null);
    const isPanning = useRef(false);
    const panStart = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });

    const lastPointerPos = useRef({ x: 0, y: 0 });
    const activeDragDeltaRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
    const rafRef = useRef<number | null>(null);

    // Broadcast pointer movement and active drag delta at 60 FPS
    const broadcastPresence = useCallback((x: number, y: number, dragDelta?: { id: string; dx: number; dy: number } | null) => {
        if (!awareness) return;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            const selectedIds = isEditingId ? [isEditingId] : (dragDelta ? [dragDelta.id] : []);
            awareness.setLocalStateField('canvasPresence', {
                x,
                y,
                selectedIds,
                dragDelta: dragDelta !== undefined ? dragDelta : activeDragDeltaRef.current,
            });
        });
    }, [awareness, isEditingId]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const vr = viewport.getBoundingClientRect();
        const canvasX = (e.clientX - vr.left - pan.x) / zoom;
        const canvasY = (e.clientY - vr.top - pan.y) / zoom;
        lastPointerPos.current = { x: canvasX, y: canvasY };

        broadcastPresence(canvasX, canvasY);
    }, [pan, zoom, broadcastPresence]);

    const handleItemDrag = useCallback((id: string, dx: number, dy: number) => {
        activeDragDeltaRef.current = { id, dx, dy };
        broadcastPresence(lastPointerPos.current.x, lastPointerPos.current.y, { id, dx, dy });
    }, [broadcastPresence]);

    const handleItemDragEnd = useCallback(() => {
        activeDragDeltaRef.current = null;
        broadcastPresence(lastPointerPos.current.x, lastPointerPos.current.y, null);
    }, [broadcastPresence]);

    // Propagate changes up
    useEffect(() => {
        onChange?.({ version: 1 as const, noteId, canvasWidth: CANVAS_W, canvasHeight: CANVAS_H, items });
    }, [items, noteId, onChange]);

    // ── Image upload with BEK ─────────────────────────────────────────────────
    const { upload } = useCanvasImageUpload(noteId, effectiveDoc);

    const handleImageDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.items ?? [])
            .map(i => i.getAsFile())
            .filter((f): f is File => !!f && f.type.startsWith('image/'));
        if (!files.length) return;

        const viewport = viewportRef.current;
        if (!viewport || !effectiveDoc) return;
        const vr = viewport.getBoundingClientRect();
        const canvasX = (e.clientX - vr.left - pan.x) / zoom;
        const canvasY = (e.clientY - vr.top - pan.y) / zoom;

        for (const file of files) {
            await upload(
                file,
                (pid) => {
                    const yCanvas = effectiveDoc.getMap<Y.Map<unknown>>('canvas');
                    effectiveDoc.transact(() => {
                        const inner = new Y.Map<unknown>();
                        inner.set('id', pid);
                        inner.set('type', 'image');
                        inner.set('x', canvasX);
                        inner.set('y', canvasY);
                        inner.set('width', 300);
                        inner.set('zIndex', 1);
                        inner.set('assetId', '__pending__');
                        yCanvas.set(pid, inner);
                    });
                },
                (pid, result) => {
                    const yCanvas = effectiveDoc.getMap<Y.Map<unknown>>('canvas');
                    effectiveDoc.transact(() => {
                        yCanvas.delete(pid);
                        const inner = new Y.Map<unknown>();
                        inner.set('id', result.id);
                        inner.set('type', 'image');
                        inner.set('x', canvasX);
                        inner.set('y', canvasY);
                        inner.set('width', result.width || 300);
                        inner.set('zIndex', 1);
                        inner.set('assetId', result.assetId);
                        yCanvas.set(result.id, inner);
                    });
                },
                (pid) => {
                    const yCanvas = effectiveDoc.getMap<Y.Map<unknown>>('canvas');
                    effectiveDoc.transact(() => {
                        yCanvas.delete(pid);
                    });
                },
                effectiveDoc,
            );
        }
    }, [upload, pan, zoom, effectiveDoc]);

    useEffect(() => {
        const handlePaste = async (e: ClipboardEvent) => {
            if (!e.clipboardData || !effectiveDoc) return;
            const files: File[] = [];
            for (const item of Array.from(e.clipboardData.items)) {
                const f = item.getAsFile();
                if (f?.type.startsWith('image/')) files.push(f);
            }
            if (!files.length) return;
            e.preventDefault();
            const cx = CANVAS_W / 2;
            const cy = CANVAS_H / 2;
            for (const file of files) {
                await upload(
                    file,
                    (pid) => {
                        const yCanvas = effectiveDoc.getMap<Y.Map<unknown>>('canvas');
                        effectiveDoc.transact(() => {
                            const inner = new Y.Map<unknown>();
                            inner.set('id', pid);
                            inner.set('type', 'image');
                            inner.set('x', cx);
                            inner.set('y', cy);
                            inner.set('width', 300);
                            inner.set('zIndex', 1);
                            inner.set('assetId', '__pending__');
                            yCanvas.set(pid, inner);
                        });
                    },
                    (pid, result) => {
                        const yCanvas = effectiveDoc.getMap<Y.Map<unknown>>('canvas');
                        effectiveDoc.transact(() => {
                            yCanvas.delete(pid);
                            const inner = new Y.Map<unknown>();
                            inner.set('id', result.id);
                            inner.set('type', 'image');
                            inner.set('x', cx);
                            inner.set('y', cy);
                            inner.set('width', result.width || 300);
                            inner.set('zIndex', 1);
                            inner.set('assetId', result.assetId);
                            yCanvas.set(result.id, inner);
                        });
                    },
                    (pid) => {
                        const yCanvas = effectiveDoc.getMap<Y.Map<unknown>>('canvas');
                        effectiveDoc.transact(() => {
                            yCanvas.delete(pid);
                        });
                    },
                    effectiveDoc,
                );
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [upload, effectiveDoc]);

    // ── Click on empty canvas → new text box ─────────────────────────────────
    const handleCanvasClick = useCallback((e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('.canvas-note-item')) return;
        if (e.target !== worldRef.current) return;
        setIsEditingId(null);
        const viewport = viewportRef.current;
        if (!viewport || !effectiveDoc) return;
        const vr = viewport.getBoundingClientRect();
        const x = (e.clientX - vr.left - pan.x) / zoom;
        const y = (e.clientY - vr.top - pan.y) / zoom;
        const newId = crypto.randomUUID();

        const yCanvas = effectiveDoc.getMap<Y.Map<unknown>>('canvas');
        effectiveDoc.transact(() => {
            const inner = new Y.Map<unknown>();
            inner.set('id', newId);
            inner.set('type', 'text');
            inner.set('x', x);
            inner.set('y', y);
            inner.set('width', 200);
            inner.set('zIndex', 1);
            const yText = new Y.Text();
            inner.set('text', yText);
            yCanvas.set(newId, inner);
        });
        setIsEditingId(newId);
    }, [pan, zoom, effectiveDoc]);

    // ── Zoom via wheel ────────────────────────────────────────────────────────
    const handleWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();
        const viewport = viewportRef.current;
        if (!viewport) return;
        const vr = viewport.getBoundingClientRect();
        const mouseX = e.clientX - vr.left;
        const mouseY = e.clientY - vr.top;

        const delta = -e.deltaY * 0.001;
        setZoom(prev => {
            const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta * prev));
            setPan(p => ({
                x: mouseX - (mouseX - p.x) * (next / prev),
                y: mouseY - (mouseY - p.y) * (next / prev),
            }));
            return next;
        });
    }, []);

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        viewport.addEventListener('wheel', handleWheel, { passive: false });
        return () => viewport.removeEventListener('wheel', handleWheel);
    }, [handleWheel]);

    // ── Pan via middle mouse ──────────────────────────────────────────────────
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button === 1) {
            isPanning.current = true;
            panStart.current = { mouseX: e.clientX, mouseY: e.clientY, panX: pan.x, panY: pan.y };
            e.preventDefault();
        }
    }, [pan]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!isPanning.current) return;
            const dx = e.clientX - panStart.current.mouseX;
            const dy = e.clientY - panStart.current.mouseY;
            setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
        };
        const onUp = () => { isPanning.current = false; };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    }, []);

    // ── Item operations ───────────────────────────────────────────────────────
    const handleUpdate = useCallback((id: string, updates: Partial<CanvasNoteItem>) => {
        if (!effectiveDoc) return;
        const yCanvas = effectiveDoc.getMap<Y.Map<unknown>>('canvas');
        const inner = yCanvas.get(id);
        if (inner) {
            effectiveDoc.transact(() => {
                Object.entries(updates).forEach(([k, v]) => {
                    if (k === 'content' || k === 'text') {
                        const existingText = inner.get('text');
                        const yText = existingText instanceof Y.Text ? existingText : new Y.Text();
                        if (existingText !== yText) {
                            inner.set('text', yText);
                        }
                        if (yText.toString() !== v) {
                            yText.delete(0, yText.length);
                            yText.insert(0, (v as string) || '');
                        }
                    } else {
                        inner.set(k, v);
                    }
                });
            });
        }
    }, [effectiveDoc]);

    const handleRemove = useCallback((id: string) => {
        if (!effectiveDoc) return;
        const yCanvas = effectiveDoc.getMap<Y.Map<unknown>>('canvas');
        const inner = yCanvas.get(id);
        if (inner) {
            const type = inner.get('type') as string;
            const assetId = (inner.get('assetId') as string) || (inner.get('blobId') as string);
            if (type === 'image' && assetId && assetId !== '__pending__') {
                const assetsMap = effectiveDoc.getMap('assets');
                assetsMap.delete(assetId);
                apiFetch(`/api/files/${encodeURIComponent(assetId)}`, { method: 'DELETE' }).catch(() => {
                    apiFetch(`/api/v1/files/${encodeURIComponent(assetId)}`, { method: 'DELETE' }).catch(() => {});
                });
            }
            effectiveDoc.transact(() => {
                yCanvas.delete(id);
            });
        }
        if (isEditingId === id) setIsEditingId(null);
    }, [effectiveDoc, isEditingId]);

    const handleMoveEnd = useCallback((id: string, x: number, y: number) => {
        if (!effectiveDoc) return;
        const yCanvas = effectiveDoc.getMap<Y.Map<unknown>>('canvas');
        const inner = yCanvas.get(id);
        if (inner) {
            effectiveDoc.transact(() => {
                inner.set('x', x);
                inner.set('y', y);
            });
        }
    }, [effectiveDoc]);

    const zoomBy = useCallback((delta: number) => {
        const vp = viewportRef.current;
        if (!vp) { setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta))); return; }
        const { width, height } = vp.getBoundingClientRect();
        const cx = width / 2, cy = height / 2;
        setZoom(prev => {
            const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta));
            setPan(p => ({
                x: cx - (cx - p.x) * (next / prev),
                y: cy - (cy - p.y) * (next / prev),
            }));
            return next;
        });
    }, []);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div
            ref={viewportRef}
            className="relative w-full h-full overflow-hidden bg-[var(--bg-page,#f8f8f8)] select-none"
            onDrop={handleImageDrop}
            onDragOver={(e) => e.preventDefault()}
            onMouseDown={handleMouseDown}
            onPointerMove={handlePointerMove}
        >
            {/* Canvas world */}
            <div
                ref={worldRef}
                className="absolute"
                style={{
                    width: CANVAS_W,
                    height: CANVAS_H,
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: '0 0',
                    backgroundImage: `radial-gradient(circle, #d1d5db 1px, transparent 1px)`,
                    backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
                }}
                onClick={handleCanvasClick}
            >
                {/* Render Canvas Items with Ephemeral Remote Drag Deltas */}
                {items.map(item => {
                    const remoteDrag = remotePeers.find(p => p.presence.dragDelta?.id === item.id)?.presence.dragDelta;
                    const effectiveItem = remoteDrag ? { ...item, x: item.x + remoteDrag.dx, y: item.y + remoteDrag.dy } : item;

                    return (
                        <CanvasNoteItemComponent
                            key={item.id}
                            item={effectiveItem}
                            zoom={zoom}
                            ydoc={effectiveDoc}
                            imageBlobCache={imageBlobCache}
                            isEditingId={isEditingId}
                            onStartEdit={setIsEditingId}
                            onUpdate={handleUpdate}
                            onRemove={handleRemove}
                            onMoveEnd={handleMoveEnd}
                            onDrag={handleItemDrag}
                            onDragEnd={handleItemDragEnd}
                        />
                    );
                })}

                {/* Remote Selection Highlights */}
                {remotePeers.map((peer) => {
                    const selected = peer.presence.selectedIds || [];
                    return selected.map((selId) => {
                        const item = items.find(i => i.id === selId);
                        if (!item) return null;
                        const dd = peer.presence.dragDelta?.id === selId ? peer.presence.dragDelta : null;
                        const selX = item.x + (dd ? dd.dx : 0);
                        const selY = item.y + (dd ? dd.dy : 0);
                        return (
                            <div
                                key={`sel-${peer.clientId}-${selId}`}
                                className="pointer-events-none absolute border-2 rounded transition-all"
                                style={{
                                    left: selX - 3,
                                    top: selY - 3,
                                    width: item.width + 6,
                                    height: (item.height || 60) + 6,
                                    borderColor: peer.user.color || '#6366f1',
                                    zIndex: 35,
                                }}
                            />
                        );
                    });
                })}

                {/* Remote Awareness Cursors */}
                {remotePeers.map((peer) => {
                    const { x, y } = peer.presence;
                    if (typeof x !== 'number' || typeof y !== 'number') return null;
                    return (
                        <div
                            key={peer.clientId}
                            className="pointer-events-none absolute z-50 transition-transform duration-75 ease-out"
                            style={{
                                transform: `translate(${x}px, ${y}px)`,
                                left: 0,
                                top: 0,
                            }}
                        >
                            <svg
                                className="w-4 h-4 drop-shadow"
                                viewBox="0 0 24 24"
                                fill={peer.user.color || '#6366f1'}
                                stroke="white"
                                strokeWidth="1.5"
                            >
                                <path d="M5.653 4.316a.8.8 0 0 0-1.127.884l2.58 13.54a.8.8 0 0 0 1.455.158l3.32-5.753 5.753 3.32a.8.8 0 0 0 1.096-.294l1.24-2.148a.8.8 0 0 0-.294-1.096l-5.753-3.32 3.32-5.753a.8.8 0 0 0-.884-1.127L5.653 4.316z" />
                            </svg>
                            <div
                                className="text-[10px] font-medium text-white px-1.5 py-0.5 rounded shadow whitespace-nowrap mt-0.5"
                                style={{ backgroundColor: peer.user.color || '#6366f1' }}
                            >
                                {peer.user.name || 'User'}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Zoom controls */}
            <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-white/90 dark:bg-gray-900/90 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 shadow-sm z-10">
                <button onClick={() => zoomBy(-0.1)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors" aria-label="Zoom out">
                    <ZoomOut size={14} className="text-gray-500 dark:text-slate-400" />
                </button>
                <span className="text-xs text-gray-500 dark:text-slate-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => zoomBy(0.1)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors" aria-label="Zoom in">
                    <ZoomIn size={14} className="text-gray-500 dark:text-slate-400" />
                </button>
            </div>
        </div>
    );
}
