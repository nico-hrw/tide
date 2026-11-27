"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Loader2, Paperclip, X } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { notify, notifyError } from '@/lib/feedback';
import { downloadStoredFile, uploadStoredFile } from '@/lib/noteFiles';
import { formatBytes, formatLabel, previewKindOf, previewMimeOf, type PreviewKind } from '@/lib/fileKinds';
import type { DataItem } from '@/store/slices/types';

/** Opens the viewer for a stored file (detail: { id }). */
export const OPEN_FILE_EVENT = 'tide:open-file';
/** Opens the file picker; the new files go to the root or to `detail.parentId`. */
export const UPLOAD_FILE_EVENT = 'tide:upload-file';

const TEXT_PREVIEW_LIMIT = 1024 * 1024;

interface Preview {
    item: DataItem;
    kind: PreviewKind;
    url: string | null;
    text: string | null;
    error: string | null;
}

/**
 * Hosts the file picker and the viewer of stored files. Upload goes through the file picker; preview works for PDF,
 * images, Markdown / text and HTML (HTML in a sandboxed frame without scripts). Other files show a card with download.
 */
export default function FileViewer() {
    const [preview, setPreview] = useState<Preview | null>(null);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const pendingParent = useRef<string | null>(null);
    const urlRef = useRef<string | null>(null);

    // Object URLs are released when the viewer closes or shows another file
    const release = useCallback(() => {
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
    }, []);
    useEffect(() => release, [release]);

    useEffect(() => {
        const onUpload = (e: Event) => {
            pendingParent.current = (e as CustomEvent<{ parentId?: string | null }>).detail?.parentId ?? null;
            inputRef.current?.click();
        };
        const onOpen = (e: Event) => {
            const id = (e as CustomEvent<{ id?: string }>).detail?.id;
            if (!id) return;
            const item = useDataStore.getState().notes.find((n) => n.id === id);
            if (!item || item.type !== 'file') return;
            void open(item);
        };
        window.addEventListener(UPLOAD_FILE_EVENT, onUpload);
        window.addEventListener(OPEN_FILE_EVENT, onOpen);
        return () => {
            window.removeEventListener(UPLOAD_FILE_EVENT, onUpload);
            window.removeEventListener(OPEN_FILE_EVENT, onOpen);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const open = async (item: DataItem) => {
        release();
        const name = typeof item.title === 'string' ? item.title : 'Datei';
        const kind = previewKindOf(name);
        setPreview({ item, kind, url: null, text: null, error: null });
        setLoading(true);
        try {
            const blob = await downloadStoredFile(item);
            if (kind === 'none') {
                setPreview({ item, kind, url: null, text: null, error: null });
            } else if (kind === 'text') {
                const text = await blob.slice(0, TEXT_PREVIEW_LIMIT).text();
                setPreview({ item, kind, url: null, text, error: null });
            } else {
                // The preview type is ours, not the stored one: HTML needs to be typed as HTML for the frame.
                const typed = new Blob([blob], { type: previewMimeOf(name) });
                const url = URL.createObjectURL(typed);
                urlRef.current = url;
                setPreview({ item, kind, url, text: null, error: null });
            }
        } catch (err) {
            setPreview({ item, kind, url: null, text: null, error: err instanceof Error ? err.message : 'Datei konnte nicht geladen werden.' });
        } finally {
            setLoading(false);
        }
    };

    const close = useCallback(() => {
        release();
        setPreview(null);
    }, [release]);

    useEffect(() => {
        if (!preview) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [preview, close]);

    const onPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        const publicKey = useDataStore.getState().publicKey;
        if (!publicKey || files.length === 0) return;
        const state = useDataStore.getState();
        const safe = state.activeSafes && state.activeSafes.length === 1 ? state.activeSafes[0] : 'Standard';
        for (const file of files) {
            try {
                const item = await uploadStoredFile(file, { publicKey, parentId: pendingParent.current, safe });
                useDataStore.getState().appendFiles([item], []);
                notify(`„${file.name}“ gespeichert.`);
            } catch (err) {
                notifyError(err instanceof Error ? err.message : `„${file.name}“ konnte nicht gespeichert werden.`);
            }
        }
    };

    const download = async () => {
        if (!preview) return;
        try {
            const blob = await downloadStoredFile(preview.item);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = typeof preview.item.title === 'string' ? preview.item.title : 'Datei';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (err) {
            notifyError(err instanceof Error ? err.message : 'Download fehlgeschlagen.');
        }
    };

    return (
        <>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => void onPicked(e)} />
            {preview && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[400] flex items-center justify-center bg-[color-mix(in_srgb,var(--t2-ink)_30%,transparent)] p-4" onClick={close}>
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label={typeof preview.item.title === 'string' ? preview.item.title : 'Datei'}
                        onClick={(e) => e.stopPropagation()}
                        className="flex h-[88dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-t2-line bg-t2-surface shadow-2xl"
                    >
                        <div className="flex items-center gap-3 border-b border-t2-line-soft px-4 py-3">
                            <Paperclip size={15} className="shrink-0 text-t2-ink-3" aria-hidden="true" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[14px] font-semibold text-t2-ink">{typeof preview.item.title === 'string' ? preview.item.title : 'Datei'}</p>
                                <p className="text-[12px] text-t2-ink-3">
                                    {[formatLabel(typeof preview.item.title === 'string' ? preview.item.title : ''), formatBytes(Number(preview.item.size))].filter(Boolean).join(' · ')}
                                </p>
                            </div>
                            <button type="button" onClick={() => void download()} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-t2-sub px-3 text-[13px] font-medium text-t2-ink hover:bg-t2-hover cursor-pointer">
                                <Download size={14} aria-hidden="true" />
                                Herunterladen
                            </button>
                            <button type="button" onClick={close} aria-label="Schließen" className="grid h-8 w-8 place-items-center rounded-lg text-t2-ink-2 hover:bg-t2-hover cursor-pointer">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="relative min-h-0 flex-1 bg-t2-sub">
                            {loading && (
                                <div className="absolute inset-0 grid place-items-center text-t2-ink-3">
                                    <Loader2 size={22} className="animate-spin" aria-label="Lädt" />
                                </div>
                            )}
                            {preview.error && <p className="p-6 text-[13px] text-t2-late">{preview.error}</p>}
                            {!loading && !preview.error && <PreviewBody preview={preview} />}
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}

function PreviewBody({ preview }: { preview: Preview }) {
    const name = typeof preview.item.title === 'string' ? preview.item.title : 'Datei';
    if (preview.kind === 'pdf' && preview.url) {
        return <iframe title={name} src={preview.url} className="h-full w-full border-0 bg-t2-surface" />;
    }
    if (preview.kind === 'image' && preview.url) {
        return (
            <div className="grid h-full place-items-center overflow-auto p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview.url} alt={name} className="max-h-full max-w-full object-contain" />
            </div>
        );
    }
    if (preview.kind === 'text' && preview.text !== null) {
        return <pre className="h-full overflow-auto whitespace-pre-wrap break-words bg-t2-surface p-5 text-[13px] leading-relaxed text-t2-ink">{preview.text}</pre>;
    }
    if (preview.kind === 'html' && preview.url) {
        // sandbox without tokens: no scripts, no access to the app
        return <iframe title={name} src={preview.url} sandbox="" className="h-full w-full border-0 bg-t2-surface" />;
    }
    return (
        <div className="grid h-full place-items-center p-6 text-center">
            <div>
                <p className="text-[15px] font-semibold text-t2-ink">{formatLabel(name) || 'Datei'}</p>
                <p className="mt-1 text-[13px] text-t2-ink-3">Für diesen Dateityp gibt es noch keine Vorschau. Du kannst die Datei herunterladen.</p>
            </div>
        </div>
    );
}
