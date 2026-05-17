// web/src/components/Canvas/CanvasNoteEditor.tsx
"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import { CanvasNoteData, CanvasNoteItem, CanvasTextItem, CanvasImageItem, createEmptyCanvasNote } from '@/types/canvasNote';
import CanvasNoteItemComponent from './CanvasNoteItem';
import { useCanvasImageUpload } from './useCanvasImageUpload';
import { ZoomIn, ZoomOut } from 'lucide-react';

const CANVAS_W = 4000;
const CANVAS_H = 3000;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.0;
const GRID_SIZE = 24;

interface CanvasNoteEditorProps {
    noteId: string;
    initialData: CanvasNoteData | null;
    publicKey: CryptoKey | null;
    privateKey: CryptoKey | null;
    userId: string;
    onChange: (data: CanvasNoteData) => void;
}

export default function CanvasNoteEditor({
    noteId, initialData, publicKey, privateKey, userId, onChange,
}: CanvasNoteEditorProps) {
    const data = initialData ?? createEmptyCanvasNote(noteId);

    const [items, setItems] = useState<CanvasNoteItem[]>(data.items);
    const [zoom, setZoom] = useState(0.5);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isEditingId, setIsEditingId] = useState<string | null>(null);
    const imageBlobCache = useRef(new Map<string, string>());
    const viewportRef = useRef<HTMLDivElement>(null);
    const worldRef = useRef<HTMLDivElement>(null);
    const isPanning = useRef(false);
    const panStart = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });

    // Propagate changes up
    useEffect(() => {
        onChange({ ...data, items });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items]);

    // ── Image upload ──────────────────────────────────────────────────────────
    const { upload } = useCanvasImageUpload(publicKey, userId, imageBlobCache);

    const handleImageDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.items ?? [])
            .map(i => i.getAsFile())
            .filter((f): f is File => !!f && f.type.startsWith('image/'));
        if (!files.length) return;

        const viewport = viewportRef.current;
        if (!viewport) return;
        const vr = viewport.getBoundingClientRect();
        const canvasX = (e.clientX - vr.left - pan.x) / zoom;
        const canvasY = (e.clientY - vr.top - pan.y) / zoom;

        for (const file of files) {
            await upload(
                file,
                (pid) => setItems(prev => [...prev, {
                    id: pid, type: 'image', x: canvasX, y: canvasY,
                    width: 300, zIndex: 1,
                    blobId: '__pending__', encryptedKey: '', iv: '', mimeType: file.type,
                } as CanvasImageItem]),
                (pid, result) => setItems(prev => prev.map(it =>
                    it.id === pid ? { ...result, x: canvasX, y: canvasY, zIndex: 1 } as CanvasImageItem : it
                )),
                (pid) => setItems(prev => prev.filter(it => it.id !== pid)),
            );
        }
    }, [upload, pan, zoom]);

    useEffect(() => {
        const handlePaste = async (e: ClipboardEvent) => {
            if (!e.clipboardData) return;
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
                    (pid) => setItems(prev => [...prev, {
                        id: pid, type: 'image', x: cx, y: cy,
                        width: 300, zIndex: 1,
                        blobId: '__pending__', encryptedKey: '', iv: '', mimeType: file.type,
                    } as CanvasImageItem]),
                    (pid, result) => setItems(prev => prev.map(it =>
                        it.id === pid ? { ...result, x: cx, y: cy, zIndex: 1 } as CanvasImageItem : it
                    )),
                    (pid) => setItems(prev => prev.filter(it => it.id !== pid)),
                );
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [upload]);

    // ── Click on empty canvas → new text box ─────────────────────────────────
    const handleCanvasClick = useCallback((e: React.MouseEvent) => {
        if (e.target !== worldRef.current) return;
        if (isEditingId) { setIsEditingId(null); return; }
        const viewport = viewportRef.current;
        if (!viewport) return;
        const vr = viewport.getBoundingClientRect();
        const x = (e.clientX - vr.left - pan.x) / zoom;
        const y = (e.clientY - vr.top - pan.y) / zoom;
        const newId = crypto.randomUUID();
        const newItem: CanvasTextItem = {
            id: newId, type: 'text', x, y,
            width: 200, zIndex: 1, content: '',
        };
        setItems(prev => [...prev, newItem]);
        setIsEditingId(newId);
    }, [isEditingId, pan, zoom]);

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
        setItems(prev => prev.map(it => it.id === id ? { ...it, ...updates } as CanvasNoteItem : it));
    }, []);

    const handleRemove = useCallback((id: string) => {
        setItems(prev => prev.filter(it => it.id !== id));
        if (isEditingId === id) setIsEditingId(null);
    }, [isEditingId]);

    const handleMoveEnd = useCallback((id: string, x: number, y: number) => {
        setItems(prev => prev.map(it => it.id === id ? { ...it, x, y } : it));
    }, []);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div
            ref={viewportRef}
            className="relative w-full h-full overflow-hidden bg-[var(--bg-page,#f8f8f8)] select-none"
            onDrop={handleImageDrop}
            onDragOver={(e) => e.preventDefault()}
            onMouseDown={handleMouseDown}
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
                {items.map(item => (
                    <CanvasNoteItemComponent
                        key={item.id}
                        item={item}
                        zoom={zoom}
                        privateKey={privateKey}
                        imageBlobCache={imageBlobCache}
                        isEditingId={isEditingId}
                        onStartEdit={setIsEditingId}
                        onUpdate={handleUpdate}
                        onRemove={handleRemove}
                        onMoveEnd={handleMoveEnd}
                    />
                ))}
            </div>

            {/* Zoom controls */}
            <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-white/90 dark:bg-gray-900/90 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 shadow-sm z-10">
                <button onClick={() => setZoom(z => Math.max(MIN_ZOOM, z - 0.1))} className="p-1 hover:bg-gray-100 rounded transition-colors">
                    <ZoomOut size={14} className="text-gray-500" />
                </button>
                <span className="text-xs text-gray-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => Math.min(MAX_ZOOM, z + 0.1))} className="p-1 hover:bg-gray-100 rounded transition-colors">
                    <ZoomIn size={14} className="text-gray-500" />
                </button>
            </div>
        </div>
    );
}
