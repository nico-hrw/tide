import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDataStore } from '@/store/useDataStore';
import { apiFetch } from '@/lib/api';
import { useT } from '../useT';

export interface ServerFile {
    id: string;
    parent_id?: string | null;
    type?: string;
    size?: number;
    updated_at?: string;
    metadata?: Record<string, unknown> | null;
    secured_meta?: string;
    access_keys?: Record<string, unknown> | null;
    [key: string]: unknown;
}

export interface AuditReport {
    scannedAt: Date;
    totalFiles: number;
    missingBlobFiles: ServerFile[];
    untitledEmptyFiles: ServerFile[];
    orphanedFiles: ServerFile[];
}

export type BlobStatus = 'ok' | '404' | 'checking' | 'error';
export type TypeFilter = 'all' | 'note' | 'canvas' | 'folder' | 'event';
export interface DebugFeedback {
    type: 'success' | 'error' | 'info';
    message: string;
}

const asRecord = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null);

/** Logik der Debug-Werkzeuge (Audit, Bereinigung, Rohdaten) ohne Darstellung. Requests unveraendert. */
export function useDebugTools() {
    const t = useT();
    const { notes, activeNoteId, loadedDirectories, metadataCache, fetchDirectory } = useDataStore();

    const [serverFiles, setServerFiles] = useState<ServerFile[] | null>(null);
    const [loadingFiles, setLoadingFiles] = useState(false);
    const [openTabsCount, setOpenTabsCount] = useState(1);
    const [scanning, setScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState<{ current: number; total: number } | null>(null);
    const [report, setReport] = useState<AuditReport | null>(null);
    const [blobStatus, setBlobStatus] = useState<Record<string, BlobStatus>>({});
    const [running, setRunning] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<DebugFeedback | null>(null);
    const [query, setQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

    const loadServerFiles = useCallback(async (showLoading = true) => {
        if (showLoading) setLoadingFiles(true);
        try {
            const res = await apiFetch('/api/v1/files?recursive=true');
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) setServerFiles(data);
            }
        } catch (e) {
            console.error('Failed to fetch server files list', e);
        } finally {
            if (showLoading) setLoadingFiles(false);
        }
    }, []);

    useEffect(() => {
        try {
            const stored = sessionStorage.getItem('tide_open_tabs');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) setOpenTabsCount(parsed.length);
            }
        } catch {
            setOpenTabsCount(1);
        }
        void loadServerFiles(false);
    }, [loadServerFiles]);

    const resolveTitle = useCallback(
        (file: ServerFile): string => {
            const bad = (s?: string) => !s || s === 'Untitled' || s.includes('Locked Note');
            const store = notes.find((n) => n.id === file.id);
            if (!bad(store?.title)) return store!.title;
            const cached = metadataCache[file.id];
            if (!bad(cached?.title)) return cached!.title;
            const metaTitle = asRecord(file.metadata)?.title;
            if (typeof metaTitle === 'string') return metaTitle;
            const publicTitle = asRecord(file.public_meta)?.title;
            if (typeof publicTitle === 'string') return publicTitle;
            return store?.title || cached?.title || (typeof file.title === 'string' ? file.title : 'Untitled');
        },
        [notes, metadataCache],
    );

    const removeFromState = (ids: Set<string>, patch: (r: AuditReport) => AuditReport) => {
        useDataStore.setState((s) => ({ notes: s.notes.filter((n) => !ids.has(n.id)) }));
        setServerFiles((prev) => (prev ? prev.filter((f) => !ids.has(f.id)) : null));
        setReport((r) => (r ? patch(r) : r));
    };

    const runAudit = async () => {
        setScanning(true);
        setFeedback(null);
        setScanProgress(null);
        try {
            const res = await apiFetch('/api/v1/files?recursive=true');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const files: ServerFile[] = await res.json();
            setServerFiles(files);

            const ids = new Set(files.map((f) => f.id));
            const missing: ServerFile[] = [];
            const untitledEmpty: ServerFile[] = [];
            const orphaned: ServerFile[] = [];

            for (const f of files) {
                if (f.parent_id && f.parent_id !== 'root' && f.parent_id.trim() !== '' && !ids.has(f.parent_id)) orphaned.push(f);
                if (f.type !== 'folder') {
                    const title = resolveTitle(f);
                    const untitled = !title || title.trim().toLowerCase() === 'untitled';
                    const empty =
                        f.size === 0 || f.size === undefined || f.size === null || f.size <= 2 ||
                        (f.metadata && typeof f.metadata === 'object' && Object.keys(f.metadata).length === 0 && !f.secured_meta);
                    if (untitled && empty) untitledEmpty.push(f);
                }
            }

            const checkable = files.filter((f) => f.type !== 'folder' && f.type !== 'event');
            setScanProgress({ current: 0, total: checkable.length });
            const status: Record<string, BlobStatus> = { ...blobStatus };
            const CONCURRENCY = 6;
            for (let i = 0; i < checkable.length; i += CONCURRENCY) {
                await Promise.all(
                    checkable.slice(i, i + CONCURRENCY).map(async (f) => {
                        try {
                            const dl = await apiFetch(`/api/v1/files/${f.id}/download`);
                            if (dl.status === 404) {
                                status[f.id] = '404';
                                missing.push(f);
                            } else {
                                status[f.id] = dl.ok ? 'ok' : 'error';
                            }
                        } catch {
                            status[f.id] = 'error';
                        }
                    }),
                );
                setScanProgress({ current: Math.min(i + CONCURRENCY, checkable.length), total: checkable.length });
                setBlobStatus({ ...status });
            }

            setReport({ scannedAt: new Date(), totalFiles: files.length, missingBlobFiles: missing, untitledEmptyFiles: untitledEmpty, orphanedFiles: orphaned });
            setFeedback({ type: 'info', message: t('debug.auditDone', { missing: missing.length, empty: untitledEmpty.length, orphaned: orphaned.length }) });
        } catch (e) {
            setFeedback({ type: 'error', message: e instanceof Error && e.message ? e.message : t('debug.auditFailed') });
        } finally {
            setScanning(false);
            setScanProgress(null);
        }
    };

    const testBlob = async (id: string) => {
        setBlobStatus((p) => ({ ...p, [id]: 'checking' }));
        try {
            const res = await apiFetch(`/api/v1/files/${id}/download`);
            setBlobStatus((p) => ({ ...p, [id]: res.status === 404 ? '404' : res.ok ? 'ok' : 'error' }));
        } catch {
            setBlobStatus((p) => ({ ...p, [id]: 'error' }));
        }
    };

    const deleteFile = async (id: string, title?: string) => {
        if (!window.confirm(t('debug.confirmDeleteOne', { name: title || id }))) return;
        try {
            const res = await apiFetch(`/api/v1/files/${id}?permanent=true`, { method: 'DELETE' });
            if (res.ok || res.status === 404) {
                removeFromState(new Set([id]), (r) => ({
                    ...r,
                    missingBlobFiles: r.missingBlobFiles.filter((f) => f.id !== id),
                    untitledEmptyFiles: r.untitledEmptyFiles.filter((f) => f.id !== id),
                    orphanedFiles: r.orphanedFiles.filter((f) => f.id !== id),
                }));
                setFeedback({ type: 'success', message: t('debug.deletedOne', { id }) });
            }
        } catch (e) {
            setFeedback({ type: 'error', message: t('debug.deleteFailed', { error: e instanceof Error ? e.message : String(e) }) });
        }
    };

    const deleteMany = async (kind: 'purge' | 'empty') => {
        const targets = (kind === 'purge' ? report?.missingBlobFiles : report?.untitledEmptyFiles) || [];
        if (!targets.length) {
            setFeedback({ type: 'info', message: t('debug.runAuditFirst') });
            return;
        }
        setRunning(kind);
        let count = 0;
        for (const file of targets) {
            try {
                const res = await apiFetch(`/api/v1/files/${file.id}?permanent=true`, { method: 'DELETE' });
                if (res.ok || res.status === 404) count++;
            } catch (err) {
                console.error(err);
            }
        }
        removeFromState(new Set(targets.map((f) => f.id)), (r) => (kind === 'purge' ? { ...r, missingBlobFiles: [] } : { ...r, untitledEmptyFiles: [] }));
        setRunning(null);
        setFeedback({ type: 'success', message: t(kind === 'purge' ? 'debug.purged' : 'debug.emptyDeleted', { n: count }) });
    };

    const deepResync = async () => {
        setRunning('resync');
        try {
            useDataStore.setState({ loadedDirectories: new Set(), metadataCache: {}, notes: [] });
            await fetchDirectory(null, true);
            setFeedback({ type: 'success', message: t('debug.resynced') });
            setTimeout(() => window.location.reload(), 800);
        } catch (e) {
            setRunning(null);
            setFeedback({ type: 'error', message: t('debug.resyncFailed', { error: e instanceof Error ? e.message : String(e) }) });
        }
    };

    const displayedFiles = useMemo(() => {
        const source: ServerFile[] =
            serverFiles || notes.map((n) => ({ id: n.id, title: n.title, type: n.type || 'note', parent_id: n.parent_id || null, size: n.size || 0, updated_at: n.updated_at }));
        const q = query.trim().toLowerCase();
        return source.filter((file) => {
            if (typeFilter !== 'all' && (file.type || 'note') !== typeFilter) return false;
            return !q || resolveTitle(file).toLowerCase().includes(q) || file.id.toLowerCase().includes(q);
        });
    }, [serverFiles, notes, query, typeFilter, resolveTitle]);

    return {
        notes, activeNoteId, loadedDirectories, serverFiles, loadingFiles, openTabsCount,
        scanning, scanProgress, report, blobStatus, running, feedback, setFeedback,
        query, setQuery, typeFilter, setTypeFilter, displayedFiles,
        resolveTitle, runAudit, testBlob, deleteFile, purgeGhosts: () => deleteMany('purge'), deleteEmpty: () => deleteMany('empty'), deepResync,
    };
}

export type DebugTools = ReturnType<typeof useDebugTools>;
