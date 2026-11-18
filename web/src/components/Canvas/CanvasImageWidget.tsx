"use client";

import { useEffect, useState, useCallback } from 'react';
import { RotateCw } from 'lucide-react';
import type { ImageElement } from '@/types/canvas';
import * as cryptoLib from '@/lib/crypto';
import { apiFetch } from '@/lib/api';
import { loadNoteImage } from '@/lib/noteImageAssets';

interface CanvasImageWidgetProps {
    element: ImageElement;
    privateKey: CryptoKey | null;
    /** Shared by the whole layer; keeps decrypted object URLs for the legacy path. */
    imageBlobCache: React.MutableRefObject<Map<string, string>>;
}

type LoadState = { status: 'loading' } | { status: 'ready'; src: string } | { status: 'error'; message: string };

/** Legacy images: the file key is wrapped for the owner's private key, so only the owner can open them. */
async function loadLegacyImage(element: ImageElement, privateKey: CryptoKey): Promise<string> {
    const meta = await cryptoLib.decryptMetadata(element.encryptedKey, privateKey);
    if (!meta || !meta.fileKey) throw new Error('Schlüssel fehlt');
    const fileKey = await window.crypto.subtle.importKey(
        'jwk', meta.fileKey as JsonWebKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'],
    );
    const res = await apiFetch(`/api/v1/files/${element.blobId}/download`);
    if (!res.ok) throw new Error(`Bild nicht erreichbar (HTTP ${res.status})`);
    const dec = await cryptoLib.decryptFile(await res.blob(), element.iv, fileKey);
    return URL.createObjectURL(new Blob([await dec.arrayBuffer()], { type: element.mimeType }));
}

/**
 * An encrypted note image. New images carry their own key and open for everyone who can read the
 * note; legacy images open for the owner only. A failed load always ends in a visible message with
 * a retry button, never in an endless spinner.
 */
export function CanvasImageWidget({ element, privateKey, imageBlobCache }: CanvasImageWidgetProps) {
    const [state, setState] = useState<LoadState>({ status: 'loading' });
    const [attempt, setAttempt] = useState(0);
    const retry = useCallback(() => {
        setState({ status: 'loading' });
        setAttempt((n) => n + 1);
    }, []);

    useEffect(() => {
        if (element.blobId === '__pending__') return; // still uploading: the spinner stays

        const usesOwnKey = !!element.bek;
        // A legacy image waits for the vault; this effect runs again as soon as the key arrives.
        if (!usesOwnKey && !privateKey) return;

        let cancelled = false;
        (async () => {
            try {
                const cached = imageBlobCache.current.get(element.blobId);
                const src = cached
                    ?? (usesOwnKey
                        ? await loadNoteImage({ assetId: element.blobId, bekBase64: element.bek as string, ivBase64: element.iv, mimeType: element.mimeType })
                        : await loadLegacyImage(element, privateKey as CryptoKey));
                imageBlobCache.current.set(element.blobId, src);
                if (!cancelled) setState({ status: 'ready', src });
            } catch (e) {
                console.error('[Canvas] image load failed:', e);
                if (!cancelled) setState({ status: 'error', message: e instanceof Error ? e.message : 'Laden fehlgeschlagen' });
            }
        })();
        return () => { cancelled = true; };
    }, [element, privateKey, imageBlobCache, attempt]);

    const width = element.width ?? 200;

    if (state.status === 'loading') {
        return (
            <div style={{ width, height: 120 }} className="flex items-center justify-center rounded-[10px] bg-t2-sub ring-1 ring-t2-line">
                <div className="w-5 h-5 rounded-full border-2 border-t2-ink-3 border-t-transparent animate-spin" />
            </div>
        );
    }
    if (state.status === 'error') {
        return (
            <div style={{ width, minHeight: 84 }} className="flex flex-col items-center justify-center gap-1.5 rounded-[10px] bg-t2-sub ring-1 ring-t2-line p-3 text-center">
                <span className="text-[12.5px] text-t2-ink-2">Bild konnte nicht geladen werden</span>
                <span className="text-[11px] text-t2-ink-3 max-w-full truncate">{state.message}</span>
                <button
                    type="button"
                    onClick={retry}
                    className="mt-0.5 flex items-center gap-1 rounded-[8px] bg-t2-surface px-2.5 py-1 text-[12px] text-t2-ink ring-1 ring-t2-line hover:bg-t2-hover"
                >
                    <RotateCw size={12} /> Erneut versuchen
                </button>
            </div>
        );
    }
    return (
        <img
            src={state.src}
            alt=""
            draggable={false}
            className="rounded-[10px] block select-none"
            style={{ width: element.width ?? 'auto', maxWidth: 600, maxHeight: 600, objectFit: 'contain' }}
        />
    );
}
