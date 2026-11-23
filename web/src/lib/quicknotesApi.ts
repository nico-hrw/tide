import { apiFetch } from './api';

export type QuicknoteAccessMode = 'open' | 'approval_required';
export type QuicknoteAccessGateStatus = 'auth_required' | 'none' | 'pending' | 'denied';

export interface QuicknoteData {
    slug: string;
    title: string;
    content: string;
    created_at: string;
    updated_at: string;
    owner_id?: string;
    access_mode?: QuicknoteAccessMode;
    is_owner?: boolean;
    access_status?: string;
}

export interface QuicknoteAccessRequest {
    slug: string;
    user_id: string;
    username: string;
    status: string;
    created_at: string;
    updated_at: string;
}

export class QuicknoteAccessError extends Error {
    accessStatus: QuicknoteAccessGateStatus;
    noteTitle: string;
    slug: string;

    constructor(
        accessStatus: QuicknoteAccessGateStatus,
        noteTitle: string,
        slug: string,
        message?: string
    ) {
        super(message || 'Access approval required');
        this.name = 'QuicknoteAccessError';
        this.accessStatus = accessStatus;
        this.noteTitle = noteTitle;
        this.slug = slug;
    }
}

export interface QuicknoteTreeNode {
    slug: string;
    parent_slug?: string;
    title: string;
    depth: number;
}

export interface QuicknoteAttachment {
    id: string;
    slug: string;
    name: string;
    mime_type: string;
    size: number;
    created_at: string;
}

export interface KnownQuicknote {
    slug: string;
    title: string;
    parent_slug?: string;
    updatedAt: number;
}

const KNOWN_QUICKNOTES_KEY = 'tide_known_quicknotes';

export function getKnownQuicknotes(): KnownQuicknote[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(KNOWN_QUICKNOTES_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function saveKnownQuicknote(note: { slug: string; title: string; parent_slug?: string }): void {
    if (typeof window === 'undefined' || !note.slug) return;
    try {
        const existing = getKnownQuicknotes();
        const filtered = existing.filter(n => n.slug !== note.slug);
        filtered.push({
            slug: note.slug,
            title: note.title || note.slug,
            parent_slug: note.parent_slug,
            updatedAt: Date.now(),
        });
        localStorage.setItem(KNOWN_QUICKNOTES_KEY, JSON.stringify(filtered));
    } catch {}
}

export function saveKnownQuicknotes(notes: Array<{ slug: string; title: string; parent_slug?: string }>): void {
    if (typeof window === 'undefined') return;
    try {
        const existingMap = new Map(getKnownQuicknotes().map(n => [n.slug, n]));
        for (const n of notes) {
            if (!n.slug) continue;
            existingMap.set(n.slug, {
                slug: n.slug,
                title: n.title || n.slug,
                parent_slug: n.parent_slug,
                updatedAt: Date.now(),
            });
        }
        localStorage.setItem(KNOWN_QUICKNOTES_KEY, JSON.stringify(Array.from(existingMap.values())));
    } catch {}
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

async function parseQuicknoteApiError(res: Response, fallback: string): Promise<string> {
    try {
        const body = await res.text();
        if (body) {
            try {
                const parsed = JSON.parse(body) as { error?: string; message?: string };
                return parsed.error || parsed.message || body;
            } catch {
                return body;
            }
        }
    } catch {
        // Keep fallback error message
    }
    return fallback;
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
                    const parsed = JSON.parse(body) as {
                        error?: string;
                        message?: string;
                        access_mode?: string;
                        access_status?: string;
                        slug?: string;
                        title?: string;
                    };
                    if (res.status === 403 && parsed.error === 'access_approval_required') {
                        const rawStatus = parsed.access_status;
                        const accessStatus: QuicknoteAccessGateStatus =
                            rawStatus === 'auth_required' ||
                            rawStatus === 'none' ||
                            rawStatus === 'pending' ||
                            rawStatus === 'denied'
                                ? rawStatus
                                : 'none';
                        throw new QuicknoteAccessError(
                            accessStatus,
                            parsed.title || slug,
                            parsed.slug || slug,
                            parsed.message || parsed.error
                        );
                    }
                    errorMessage = parsed.error || parsed.message || body;
                } catch (err) {
                    if (err instanceof QuicknoteAccessError) {
                        throw err;
                    }
                    errorMessage = body;
                }
            }
        } catch (err) {
            if (err instanceof QuicknoteAccessError) {
                throw err;
            }
            // Keep fallback error message
        }
        throw new Error(errorMessage);
    }

    return (await res.json()) as QuicknoteData;
}

/**
 * Saves quicknote title and optional content by slug.
 */
export async function saveQuicknote(
    slug: string,
    title: string,
    content?: string,
    parentSlug?: string
): Promise<void> {
    const payload: { title: string; content?: string; parent_slug?: string } = {
        title,
        content: content ?? '',
        parent_slug: parentSlug,
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

export async function fetchQuicknoteTree(slug: string): Promise<QuicknoteTreeNode[]> {
    try {
        const res = await apiFetch(`/api/v1/quicknotes/${encodeURIComponent(slug)}/tree`);
        if (!res.ok) return [];
        const data = (await res.json()) as { tree?: QuicknoteTreeNode[] };
        return data.tree || [];
    } catch {
        return [];
    }
}

export async function fetchQuicknoteFiles(slug: string): Promise<QuicknoteAttachment[]> {
    try {
        const res = await apiFetch(`/api/v1/quicknotes/${encodeURIComponent(slug)}/files`);
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? (data as QuicknoteAttachment[]) : [];
    } catch {
        return [];
    }
}

export class StorageLimitError extends Error {
    limit: number;
    current: number;
    constructor(message: string, limit: number, current: number) {
        super(message);
        this.name = 'StorageLimitError';
        this.limit = limit;
        this.current = current;
    }
}

export async function uploadQuicknoteFile(slug: string, file: File, token?: string): Promise<QuicknoteAttachment> {
    const formData = new FormData();
    formData.append('file', file);
    if (token) {
        formData.append('token', token);
    }

    const headers: Record<string, string> = {};
    if (token) {
        headers['X-Access-Token'] = token;
    }

    const res = await apiFetch(`/api/v1/quicknotes/${encodeURIComponent(slug)}/files`, {
        method: 'POST',
        body: formData,
        headers,
    });

    if (!res.ok) {
        if (res.status === 413) {
            throw new Error('Datei überschreitet das Upload-Limit (HTTP 413).');
        }

        let errBody: { error?: string; message?: string; limit?: number; current?: number } | null = null;
        let rawText = '';
        try {
            const clone = res.clone();
            try {
                errBody = (await clone.json()) as { error?: string; message?: string; limit?: number; current?: number };
            } catch {
                rawText = (await res.text()).trim();
            }
        } catch {}

        if (res.status === 403 && errBody?.error === 'storage_limit_exceeded') {
            throw new StorageLimitError(
                errBody.message || 'Speicherlimit von 250MB pro Notiz überschritten.',
                errBody.limit || 262144000,
                errBody.current || 0
            );
        }

        const parsedMsg = errBody?.message || errBody?.error || rawText;
        throw new Error(parsedMsg || `Upload failed with status ${res.status}`);
    }

    return (await res.json()) as QuicknoteAttachment;
}

export function getQuicknoteFileDownloadUrl(slug: string, fileId: string): string {
    return `/api/v1/quicknotes/${encodeURIComponent(slug)}/files/${encodeURIComponent(fileId)}`;
}

export async function deleteQuicknoteFile(slug: string, fileId: string): Promise<boolean> {
    try {
        const res = await apiFetch(`/api/v1/quicknotes/${encodeURIComponent(slug)}/files/${encodeURIComponent(fileId)}`, {
            method: 'DELETE',
        });
        return res.ok;
    } catch {
        return false;
    }
}

export async function setQuicknoteAccessMode(
    slug: string,
    accessMode: QuicknoteAccessMode
): Promise<QuicknoteData> {
    const res = await apiFetch(`/api/v1/quicknotes/${encodeURIComponent(slug)}/access`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ access_mode: accessMode }),
    });

    if (!res.ok) {
        const fallback = `Failed to update access mode (${res.status} ${res.statusText})`;
        throw new Error(await parseQuicknoteApiError(res, fallback));
    }

    return (await res.json()) as QuicknoteData;
}

export async function requestQuicknoteAccess(slug: string): Promise<{ status: string }> {
    const res = await apiFetch(`/api/v1/quicknotes/${encodeURIComponent(slug)}/access-requests`, {
        method: 'POST',
    });

    if (!res.ok) {
        const fallback = `Failed to request access (${res.status} ${res.statusText})`;
        throw new Error(await parseQuicknoteApiError(res, fallback));
    }

    return (await res.json()) as { status: string };
}

export async function fetchQuicknoteAccessRequests(slug: string): Promise<QuicknoteAccessRequest[]> {
    const res = await apiFetch(`/api/v1/quicknotes/${encodeURIComponent(slug)}/access-requests`, {
        method: 'GET',
    });

    if (!res.ok) {
        const fallback = `Failed to fetch access requests (${res.status} ${res.statusText})`;
        throw new Error(await parseQuicknoteApiError(res, fallback));
    }

    const data = await res.json();
    return Array.isArray(data) ? (data as QuicknoteAccessRequest[]) : [];
}

export async function resolveQuicknoteAccessRequest(
    slug: string,
    userId: string,
    action: 'approve' | 'deny'
): Promise<void> {
    const res = await apiFetch(
        `/api/v1/quicknotes/${encodeURIComponent(slug)}/access-requests/${encodeURIComponent(userId)}/${action}`,
        {
            method: 'POST',
        }
    );

    if (!res.ok) {
        const fallback = `Failed to ${action} access request (${res.status} ${res.statusText})`;
        throw new Error(await parseQuicknoteApiError(res, fallback));
    }
}

