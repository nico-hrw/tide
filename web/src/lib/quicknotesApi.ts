import { apiFetch } from './api';

export interface QuicknoteData {
    slug: string;
    title: string;
    content: string;
    created_at: string;
    updated_at: string;
}

/**
 * Derives a deterministic AES-GCM 256-bit CryptoKey for a quicknote slug using Web Crypto API.
 */
export async function deriveQuicknoteKey(slug: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const hash = await crypto.subtle.digest('SHA-256', enc.encode(`tide-quicknote-${slug}`));
    return crypto.subtle.importKey(
        'raw',
        hash,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Fetches quicknote metadata and content by slug.
 */
export async function fetchQuicknote(slug: string): Promise<QuicknoteData> {
    const res = await apiFetch(`/api/v1/quicknotes/${encodeURIComponent(slug)}`, {
        method: 'GET',
    });

    if (!res.ok) {
        let errorMessage = `Failed to fetch quicknote (${res.status} ${res.statusText})`;
        try {
            const body = await res.text();
            if (body) {
                try {
                    const parsed = JSON.parse(body) as { error?: string; message?: string };
                    errorMessage = parsed.error || parsed.message || body;
                } catch {
                    errorMessage = body;
                }
            }
        } catch {
            // Keep fallback error message
        }
        throw new Error(errorMessage);
    }

    return (await res.json()) as QuicknoteData;
}

/**
 * Saves quicknote title and optional content by slug.
 */
export async function saveQuicknote(slug: string, title: string, content?: string): Promise<void> {
    const payload: { title: string; content?: string } = {
        title,
        content: content ?? '',
    };

    const res = await apiFetch(`/api/v1/quicknotes/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        let errorMessage = `Failed to save quicknote (${res.status} ${res.statusText})`;
        try {
            const body = await res.text();
            if (body) {
                try {
                    const parsed = JSON.parse(body) as { error?: string; message?: string };
                    errorMessage = parsed.error || parsed.message || body;
                } catch {
                    errorMessage = body;
                }
            }
        } catch {
            // Keep fallback error message
        }
        throw new Error(errorMessage);
    }
}
