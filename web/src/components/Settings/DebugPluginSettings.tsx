import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useDataStore } from '@/store/useDataStore';
import { apiFetch } from '@/lib/api';
import {
    Wrench, Trash2, RefreshCw, AlertTriangle, CheckCircle2,
    Search, FileText, Eye, Copy, Check, Loader2, Database,
    Layers, X, FolderGit2, ShieldAlert
} from 'lucide-react';

interface ServerFile {
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

interface AuditReport {
    scannedAt: Date;
    totalFiles: number;
    missingBlobFiles: ServerFile[];
    untitledEmptyFiles: ServerFile[];
    orphanedFiles: ServerFile[];
}

export default function DebugPluginSettings() {
    const { notes, activeNoteId, loadedDirectories, metadataCache, fetchDirectory, language } = useDataStore();
    const isDe = language === 'de';

    const [serverFiles, setServerFiles] = useState<ServerFile[] | null>(null);
    const [isLoadingServerFiles, setIsLoadingServerFiles] = useState(false);
    const [openTabsCount, setOpenTabsCount] = useState<number>(1);

    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState<{ current: number; total: number } | null>(null);
    const [auditReport, setAuditReport] = useState<AuditReport | null>(null);
    const [blobStatusMap, setBlobStatusMap] = useState<Record<string, 'ok' | '404' | 'checking' | 'error'>>({});

    const [isActionRunning, setIsActionRunning] = useState<string | null>(null);
    const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'note' | 'canvas' | 'folder' | 'event'>('all');
    const [jsonModalFile, setJsonModalFile] = useState<ServerFile | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            try {
                const stored = sessionStorage.getItem('tide_open_tabs');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (Array.isArray(parsed)) setOpenTabsCount(parsed.length);
                }
            } catch { setOpenTabsCount(1); }
        }
        loadServerFilesList(false);
    }, []);

    const loadServerFilesList = async (showLoading = true) => {
        if (showLoading) setIsLoadingServerFiles(true);
        try {
            const res = await apiFetch('/api/v1/files?recursive=true');
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) setServerFiles(data);
            }
        } catch (e) {
            console.error('Failed to fetch server files list', e);
        } finally {
            if (showLoading) setIsLoadingServerFiles(false);
        }
    };

    const resolveFileTitle = useCallback((file: ServerFile): string => {
        const storeMatch = notes.find(n => n.id === file.id);
        if (storeMatch?.title && storeMatch.title !== 'Untitled' && !storeMatch.title.includes('Locked Note')) {
            return storeMatch.title;
        }
        const cached = metadataCache[file.id];
        if (cached?.title && cached.title !== 'Untitled' && !cached.title.includes('Locked Note')) {
            return cached.title;
        }
        if (file.metadata && typeof file.metadata === 'object' && 'title' in file.metadata && typeof (file.metadata as Record<string, unknown>).title === 'string') {
            return (file.metadata as Record<string, unknown>).title as string;
        }
        if (file.public_meta && typeof file.public_meta === 'object' && 'title' in file.public_meta && typeof (file.public_meta as Record<string, unknown>).title === 'string') {
            return (file.public_meta as Record<string, unknown>).title as string;
        }
        return storeMatch?.title || cached?.title || (typeof file.title === 'string' ? file.title : 'Untitled');
    }, [notes, metadataCache]);

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1500);
    };

    const runAuditScan = async () => {
        setIsScanning(true);
        setActionFeedback(null);
        setScanProgress(null);
        try {
            const res = await apiFetch('/api/v1/files?recursive=true');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const files: ServerFile[] = await res.json();
            setServerFiles(files);

            const allFileIds = new Set(files.map(f => f.id));
            const missingBlobs: ServerFile[] = [];
            const untitledEmpty: ServerFile[] = [];
            const orphaned: ServerFile[] = [];

            for (const f of files) {
                if (f.parent_id && f.parent_id !== 'root' && f.parent_id.trim() !== '' && !allFileIds.has(f.parent_id)) {
                    orphaned.push(f);
                }
                if (f.type !== 'folder') {
                    const title = resolveFileTitle(f);
                    const isUntitled = !title || title.trim().toLowerCase() === 'untitled';
                    const isEmpty = (f.size === 0 || f.size === undefined || f.size === null || f.size <= 2) ||
                        (f.metadata && typeof f.metadata === 'object' && Object.keys(f.metadata).length === 0 && !f.secured_meta);
                    if (isUntitled && isEmpty) untitledEmpty.push(f);
                }
            }

            const nonFolderFiles = files.filter(f => f.type !== 'folder' && f.type !== 'event');
            setScanProgress({ current: 0, total: nonFolderFiles.length });
            const updatedStatus: Record<string, 'ok' | '404' | 'checking' | 'error'> = { ...blobStatusMap };
            const CONCURRENCY = 6;

            for (let i = 0; i < nonFolderFiles.length; i += CONCURRENCY) {
                const batch = nonFolderFiles.slice(i, i + CONCURRENCY);
                await Promise.all(batch.map(async (f) => {
                    try {
                        const dlRes = await apiFetch(`/api/v1/files/${f.id}/download`);
                        if (dlRes.status === 404) {
                            updatedStatus[f.id] = '404';
                            missingBlobs.push(f);
                        } else if (dlRes.ok) {
                            updatedStatus[f.id] = 'ok';
                        } else {
                            updatedStatus[f.id] = 'error';
                        }
                    } catch { updatedStatus[f.id] = 'error'; }
                }));
                setScanProgress({ current: Math.min(i + CONCURRENCY, nonFolderFiles.length), total: nonFolderFiles.length });
                setBlobStatusMap({ ...updatedStatus });
            }

            setAuditReport({ scannedAt: new Date(), totalFiles: files.length, missingBlobFiles: missingBlobs, untitledEmptyFiles: untitledEmpty, orphanedFiles: orphaned });
            setActionFeedback({
                type: 'info',
                message: isDe
                    ? `Audit abgeschlossen: ${missingBlobs.length} 404-Blobs, ${untitledEmpty.length} leere Entwürfe, ${orphaned.length} verwaiste Dateien.`
                    : `Audit complete: ${missingBlobs.length} 404 blobs, ${untitledEmpty.length} empty drafts, ${orphaned.length} orphaned files.`
            });
        } catch (e: unknown) {
            const err = e instanceof Error ? e : new Error(String(e));
            setActionFeedback({ type: 'error', message: err.message || 'Dateisystem-Audit fehlgeschlagen' });
        } finally {
            setIsScanning(false);
            setScanProgress(null);
        }
    };

    const testSingleBlob = async (id: string) => {
        setBlobStatusMap(prev => ({ ...prev, [id]: 'checking' }));
        try {
            const res = await apiFetch(`/api/v1/files/${id}/download`);
            setBlobStatusMap(prev => ({ ...prev, [id]: res.status === 404 ? '404' : (res.ok ? 'ok' : 'error') }));
        } catch {
            setBlobStatusMap(prev => ({ ...prev, [id]: 'error' }));
        }
    };

    const deleteSingleFile = async (id: string, title?: string) => {
        if (!window.confirm(isDe ? `Notiz "${title || id}" endgültig löschen?` : `Permanently delete note "${title || id}"?`)) return;
        try {
            const res = await apiFetch(`/api/v1/files/${id}?permanent=true`, { method: 'DELETE' });
            if (res.ok || res.status === 404) {
                useDataStore.setState(s => ({ notes: s.notes.filter(n => n.id !== id) }));
                setServerFiles(prev => prev ? prev.filter(f => f.id !== id) : null);
                if (auditReport) {
                    setAuditReport({
                        ...auditReport,
                        missingBlobFiles: auditReport.missingBlobFiles.filter(f => f.id !== id),
                        untitledEmptyFiles: auditReport.untitledEmptyFiles.filter(f => f.id !== id),
                        orphanedFiles: auditReport.orphanedFiles.filter(f => f.id !== id)
                    });
                }
                setActionFeedback({ type: 'success', message: isDe ? `Notiz ${id} dauerhaft gelöscht.` : `Note ${id} deleted.` });
            }
        } catch (e: unknown) {
            const err = e instanceof Error ? e : new Error(String(e));
            setActionFeedback({ type: 'error', message: `Löschen fehlgeschlagen: ${err.message}` });
        }
    };

    const purgeGhostNotes = async () => {
        const targets = auditReport?.missingBlobFiles || [];
        if (!targets.length) {
            setActionFeedback({ type: 'info', message: isDe ? 'Keine Geister-Notizen gefunden. Bitte zuerst Audit ausführen.' : 'No ghost notes found. Run audit first.' });
            return;
        }
        if (!window.confirm(isDe ? `${targets.length} Geister-Notizen (404 / Missing Blob) endgültig löschen?` : `Permanently delete ${targets.length} ghost notes?`)) return;

        setIsActionRunning('purge');
        let count = 0;
        const targetIds = new Set(targets.map(t => t.id));
        for (const file of targets) {
            try {
                const res = await apiFetch(`/api/v1/files/${file.id}?permanent=true`, { method: 'DELETE' });
                if (res.ok || res.status === 404) count++;
            } catch (err) { console.error(err); }
        }
        useDataStore.setState(s => ({ notes: s.notes.filter(n => !targetIds.has(n.id)) }));
        setServerFiles(prev => prev ? prev.filter(f => !targetIds.has(f.id)) : null);
        if (auditReport) setAuditReport({ ...auditReport, missingBlobFiles: [] });
        setIsActionRunning(null);
        setActionFeedback({ type: 'success', message: isDe ? `🧹 ${count} Geister-Notizen bereinigt!` : `🧹 Purged ${count} ghost notes!` });
    };

    const deleteEmptyUntitledNotes = async () => {
        const targets = auditReport?.untitledEmptyFiles || [];
        if (!targets.length) {
            setActionFeedback({ type: 'info', message: isDe ? 'Keine leeren Untitled-Notizen gefunden. Bitte zuerst Audit ausführen.' : 'No empty notes found. Run audit first.' });
            return;
        }
        if (!window.confirm(isDe ? `${targets.length} leere 'Untitled' Notizen löschen?` : `Permanently delete ${targets.length} empty 'Untitled' notes?`)) return;

        setIsActionRunning('empty');
        let count = 0;
        const targetIds = new Set(targets.map(t => t.id));
        for (const file of targets) {
            try {
                const res = await apiFetch(`/api/v1/files/${file.id}?permanent=true`, { method: 'DELETE' });
                if (res.ok || res.status === 404) count++;
            } catch (err) { console.error(err); }
        }
        useDataStore.setState(s => ({ notes: s.notes.filter(n => !targetIds.has(n.id)) }));
        setServerFiles(prev => prev ? prev.filter(f => !targetIds.has(f.id)) : null);
        if (auditReport) setAuditReport({ ...auditReport, untitledEmptyFiles: [] });
        setIsActionRunning(null);
        setActionFeedback({ type: 'success', message: isDe ? `🗑️ ${count} leere Notizen gelöscht!` : `🗑️ Deleted ${count} empty notes!` });
    };

    const handleDeepResync = async () => {
        if (!window.confirm(isDe ? 'Tiefer Resync: Cache leeren, Notizen neu synchronisieren und Seite neu laden?' : 'Deep Resync: Clear cache and reload app?')) return;
        setIsActionRunning('resync');
        try {
            useDataStore.setState({ loadedDirectories: new Set(), metadataCache: {}, notes: [] });
            await fetchDirectory(null, true);
            setActionFeedback({ type: 'success', message: isDe ? 'Resync abgeschlossen. Lade neu...' : 'Resync completed. Reloading...' });
            setTimeout(() => window.location.reload(), 800);
        } catch (e: unknown) {
            const err = e instanceof Error ? e : new Error(String(e));
            setIsActionRunning(null);
            setActionFeedback({ type: 'error', message: `Resync fehlgeschlagen: ${err.message}` });
        }
    };

    const displayedFiles = useMemo(() => {
        const source = serverFiles || notes.map(n => ({ id: n.id, title: n.title, type: n.type || 'note', parent_id: n.parent_id || null, size: n.size || 0, updated_at: n.updated_at }));
        return source.filter(file => {
            if (typeFilter !== 'all' && (file.type || 'note') !== typeFilter) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                return resolveFileTitle(file).toLowerCase().includes(q) || file.id.toLowerCase().includes(q);
            }
            return true;
        });
    }, [serverFiles, notes, searchQuery, typeFilter, resolveFileTitle]);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div>
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-blue-500" />
                    {isDe ? 'Debug & Diagnose Werkzeuge' : 'Debug & Diagnostic Tools'}
                </h3>
                <p className="text-xs text-gray-500">
                    {isDe ? 'Dateisystem-Diagnose, Blob-Integritätsprüfung und Bereinigungstools.' : 'Filesystem diagnostics, blob integrity verification, and cleanup tools.'}
                </p>
            </div>

            {/* 1. State Overview Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                        <Database className="w-3.5 h-3.5 text-blue-500" />
                        <span>{isDe ? 'Notizen (Mem / Srv)' : 'Notes (Mem / Srv)'}</span>
                    </div>
                    <div className="text-xl font-black text-gray-900 dark:text-white">
                        {notes.length} <span className="text-xs font-normal text-gray-400">/ {serverFiles !== null ? serverFiles.length : (isLoadingServerFiles ? '...' : '—')}</span>
                    </div>
                    <span className="text-[10px] text-gray-400 mt-0.5 block truncate">{isDe ? 'Lokal vs. SQLite' : 'Local vs. SQLite'}</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                        <FileText className="w-3.5 h-3.5 text-emerald-500" />
                        <span>{isDe ? 'Aktive Notiz' : 'Active Note'}</span>
                    </div>
                    <div className="text-xs font-mono font-bold text-gray-900 dark:text-white truncate flex items-center gap-1">
                        {activeNoteId ? (
                            <>
                                <span className="truncate">{activeNoteId.slice(0, 8)}...</span>
                                <button onClick={() => handleCopy(activeNoteId, 'active_note')} className="p-1 hover:bg-gray-200 dark:hover:bg-white/10 rounded transition-colors" title="ID kopieren">
                                    {copiedId === 'active_note' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-gray-400" />}
                                </button>
                            </>
                        ) : <span className="text-gray-400 italic font-sans">{isDe ? 'Keine' : 'None'}</span>}
                    </div>
                    <span className="text-[10px] text-gray-400 mt-0.5 block truncate">{isDe ? 'Editor-Fokus' : 'Active selection'}</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                        <Layers className="w-3.5 h-3.5 text-indigo-500" />
                        <span>{isDe ? 'Offene Tabs' : 'Open Tabs'}</span>
                    </div>
                    <div className="text-xl font-black text-gray-900 dark:text-white">{openTabsCount}</div>
                    <span className="text-[10px] text-gray-400 mt-0.5 block truncate">{isDe ? 'Arbeitsbereiche' : 'Workspaces'}</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                        <FolderGit2 className="w-3.5 h-3.5 text-amber-500" />
                        <span>{isDe ? 'Verzeichnisse' : 'Loaded Dirs'}</span>
                    </div>
                    <div className="text-xl font-black text-gray-900 dark:text-white">{loadedDirectories.size}</div>
                    <span className="text-[10px] text-gray-400 mt-0.5 block truncate" title={Array.from(loadedDirectories).join(', ')}>
                        {Array.from(loadedDirectories).slice(0, 2).join(', ') || 'root'}
                    </span>
                </div>
            </div>

            {/* 2. Diagnostic / Audit Scanner */}
            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            {isDe ? 'Dateisystem Scanner & Audit' : 'Filesystem Scanner & Audit'}
                        </h4>
                        <p className="text-xs text-gray-500 mt-0.5">
                            {isDe ? 'Prüft SQLite-Einträge gegen den BlobStore auf 404s, leere Entwürfe und verwaiste Links.' : 'Validates SQLite records for 404s, empty drafts, and orphaned parent links.'}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={runAuditScan}
                        disabled={isScanning}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-blue-500/20 disabled:opacity-50 shrink-0"
                    >
                        {isScanning ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>{scanProgress ? `${scanProgress.current}/${scanProgress.total}` : (isDe ? 'Scanne...' : 'Scanning...')}</span>
                            </>
                        ) : (
                            <>
                                <Search className="w-3.5 h-3.5" />
                                <span>{isDe ? 'Dateisystem scannen / Audit durchführen' : 'Scan Filesystem / Run Audit'}</span>
                            </>
                        )}
                    </button>
                </div>

                {auditReport && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-gray-100 dark:border-white/5">
                        <div className={`p-3 rounded-xl border flex items-center justify-between ${auditReport.missingBlobFiles.length > 0 ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 text-rose-700 dark:text-rose-400' : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 text-emerald-700 dark:text-emerald-400'}`}>
                            <div className="flex items-center gap-2">
                                {auditReport.missingBlobFiles.length > 0 ? <AlertTriangle className="w-4 h-4 text-rose-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                <span className="text-xs font-bold">{isDe ? '404 / Fehlende Blobs' : '404 / Missing Blobs'}</span>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-white/60 dark:bg-black/30">{auditReport.missingBlobFiles.length}</span>
                        </div>

                        <div className={`p-3 rounded-xl border flex items-center justify-between ${auditReport.untitledEmptyFiles.length > 0 ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 text-amber-700 dark:text-amber-400' : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 text-emerald-700 dark:text-emerald-400'}`}>
                            <div className="flex items-center gap-2">
                                {auditReport.untitledEmptyFiles.length > 0 ? <AlertTriangle className="w-4 h-4 text-amber-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                <span className="text-xs font-bold">{isDe ? 'Leere Untitled Notizen' : 'Empty Untitled Notes'}</span>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-white/60 dark:bg-black/30">{auditReport.untitledEmptyFiles.length}</span>
                        </div>

                        <div className={`p-3 rounded-xl border flex items-center justify-between ${auditReport.orphanedFiles.length > 0 ? 'bg-violet-50 dark:bg-violet-950/20 border-violet-200 text-violet-700 dark:text-violet-400' : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 text-emerald-700 dark:text-emerald-400'}`}>
                            <div className="flex items-center gap-2">
                                {auditReport.orphanedFiles.length > 0 ? <AlertTriangle className="w-4 h-4 text-violet-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                <span className="text-xs font-bold">{isDe ? 'Verwaiste Dateien' : 'Orphaned Files'}</span>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-white/60 dark:bg-black/30">{auditReport.orphanedFiles.length}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* 3. Batch Action Tools */}
            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 space-y-3">
                <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-500" />
                    {isDe ? 'Batch-Aktionen & Reparatur' : 'Batch Actions & Repair'}
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <button
                        type="button"
                        onClick={purgeGhostNotes}
                        disabled={isActionRunning !== null || !auditReport?.missingBlobFiles.length}
                        className="flex flex-col items-start p-3 rounded-xl border border-rose-200/60 dark:border-rose-900/30 bg-rose-50/50 dark:bg-rose-950/10 hover:bg-rose-100/60 transition-all disabled:opacity-40"
                    >
                        <div className="flex items-center gap-2 text-xs font-bold text-rose-600 dark:text-rose-400 mb-1">
                            {isActionRunning === 'purge' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            <span>{isDe ? '🧹 Geister-Notizen bereinigen' : '🧹 Purge Ghost Notes'}</span>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            {isDe ? `Löscht ${auditReport?.missingBlobFiles.length || 0} Notizen mit 404-Fehlern dauerhaft.` : `Deletes ${auditReport?.missingBlobFiles.length || 0} missing blob records.`}
                        </p>
                    </button>

                    <button
                        type="button"
                        onClick={deleteEmptyUntitledNotes}
                        disabled={isActionRunning !== null || !auditReport?.untitledEmptyFiles.length}
                        className="flex flex-col items-start p-3 rounded-xl border border-amber-200/60 dark:border-amber-900/30 bg-amber-50/50 dark:bg-amber-950/10 hover:bg-amber-100/60 transition-all disabled:opacity-40"
                    >
                        <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400 mb-1">
                            {isActionRunning === 'empty' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            <span>{isDe ? "🗑️ Leere 'Untitled' Notizen löschen" : "🗑️ Delete Empty Untitled Notes"}</span>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            {isDe ? `Entfernt ${auditReport?.untitledEmptyFiles.length || 0} unbenannte, leere Entwürfe.` : `Removes ${auditReport?.untitledEmptyFiles.length || 0} untitled empty drafts.`}
                        </p>
                    </button>

                    <button
                        type="button"
                        onClick={handleDeepResync}
                        disabled={isActionRunning !== null}
                        className="flex flex-col items-start p-3 rounded-xl border border-blue-200/60 dark:border-blue-900/30 bg-blue-50/50 dark:bg-blue-950/10 hover:bg-blue-100/60 transition-all disabled:opacity-40"
                    >
                        <div className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400 mb-1">
                            {isActionRunning === 'resync' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            <span>{isDe ? '🔄 Tiefer Resync' : '🔄 Deep Resync'}</span>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            {isDe ? 'Leert Verzeichnis-Cache, holt Notizen neu und lädt die App neu.' : 'Clears directory cache, refetches and reloads app.'}
                        </p>
                    </button>
                </div>

                {actionFeedback && (
                    <div className={`p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between ${
                        actionFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 border border-emerald-200' :
                        actionFeedback.type === 'error' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 border border-rose-200' :
                        'bg-blue-50 text-blue-700 dark:bg-blue-950/30 border border-blue-200'
                    }`}>
                        <span>{actionFeedback.message}</span>
                        <button onClick={() => setActionFeedback(null)} className="p-1 hover:opacity-75"><X className="w-3.5 h-3.5" /></button>
                    </div>
                )}
            </div>

            {/* 4. Raw Note Explorer Table */}
            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-500" />
                            {isDe ? 'Raw Notizen-Explorer' : 'Raw Note Explorer'}
                            <span className="text-xs font-mono font-normal text-gray-400">({displayedFiles.length})</span>
                        </h4>
                        <p className="text-xs text-gray-500 mt-0.5">
                            {isDe ? 'Direkte Inspektion aller SQLite-Dateieinträge, Blob-Download-Tests und Rohdaten.' : 'Inspection of SQLite file entries, blob download verification, and raw payloads.'}
                        </p>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <div className="relative flex-1 sm:w-56">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder={isDe ? 'Titel oder ID filtern...' : 'Filter title or ID...'}
                                className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-xl text-xs text-gray-900 dark:text-white outline-none focus:border-blue-500 transition-colors"
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </div>

                        <select
                            value={typeFilter}
                            onChange={e => setTypeFilter(e.target.value as 'all' | 'note' | 'canvas' | 'folder' | 'event')}
                            className="px-2.5 py-1.5 bg-white dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 outline-none focus:border-blue-500"
                        >
                            <option value="all">Alle Typen</option>
                            <option value="note">Notes</option>
                            <option value="canvas">Canvas</option>
                            <option value="folder">Folders</option>
                            <option value="event">Events</option>
                        </select>
                    </div>
                </div>

                <div className="border border-gray-200/80 dark:border-white/10 rounded-xl overflow-hidden bg-white dark:bg-black/40">
                    <div className="max-h-80 overflow-y-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead className="sticky top-0 bg-gray-50 dark:bg-zinc-900 border-b border-gray-200 dark:border-white/10 z-10 text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider text-[10px]">
                                <tr>
                                    <th className="py-2.5 px-3">Titel</th>
                                    <th className="py-2.5 px-3">ID</th>
                                    <th className="py-2.5 px-3">Typ</th>
                                    <th className="py-2.5 px-3">Parent ID</th>
                                    <th className="py-2.5 px-3">Aktualisiert</th>
                                    <th className="py-2.5 px-3 text-right">Blob / Aktionen</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-white/5 font-sans">
                                {displayedFiles.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="py-6 text-center text-gray-400 italic">
                                            {isDe ? 'Keine Notizen entsprechen dem Filter.' : 'No notes match the current filter.'}
                                        </td>
                                    </tr>
                                ) : (
                                    displayedFiles.map((file) => {
                                        const resolvedTitle = resolveFileTitle(file);
                                        const blobStatus = blobStatusMap[file.id];
                                        const isFolder = file.type === 'folder';

                                        return (
                                            <tr key={file.id} className={`hover:bg-gray-50/80 dark:hover:bg-white/[0.02] transition-colors ${file.id === activeNoteId ? 'bg-blue-50/40 dark:bg-blue-900/10' : ''}`}>
                                                <td className="py-2 px-3 font-semibold text-gray-900 dark:text-white max-w-[140px] truncate" title={resolvedTitle}>
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="truncate">{resolvedTitle}</span>
                                                        {file.id === activeNoteId && <span className="px-1.5 py-0.2 rounded bg-blue-500 text-white text-[9px] font-bold">Aktiv</span>}
                                                    </div>
                                                </td>

                                                <td className="py-2 px-3 font-mono text-[11px] text-gray-500 dark:text-gray-400">
                                                    <div className="flex items-center gap-1">
                                                        <span>{file.id.slice(0, 8)}...</span>
                                                        <button onClick={() => handleCopy(file.id, `id_${file.id}`)} className="p-0.5 hover:bg-gray-200 dark:hover:bg-white/10 rounded" title="ID kopieren">
                                                            {copiedId === `id_${file.id}` ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-gray-400" />}
                                                        </button>
                                                    </div>
                                                </td>

                                                <td className="py-2 px-3">
                                                    <span className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                                                        file.type === 'canvas' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' :
                                                        file.type === 'folder' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                                                        file.type === 'event' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                                                        'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300'
                                                    }`}>
                                                        {file.type || 'note'}
                                                    </span>
                                                </td>

                                                <td className="py-2 px-3 font-mono text-[11px] text-gray-400 truncate max-w-[80px]" title={file.parent_id || 'root'}>
                                                    {file.parent_id ? `${file.parent_id.slice(0, 6)}...` : 'root'}
                                                </td>

                                                <td className="py-2 px-3 text-[11px] text-gray-400 whitespace-nowrap">
                                                    {file.updated_at ? new Date(file.updated_at).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                                                </td>

                                                <td className="py-2 px-3 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        {!isFolder && (
                                                            blobStatus === 'ok' ? (
                                                                <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px] font-bold">200 OK</span>
                                                            ) : blobStatus === '404' ? (
                                                                <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 text-[10px] font-bold animate-pulse">404 Err</span>
                                                            ) : blobStatus === 'checking' ? (
                                                                <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
                                                            ) : null
                                                        )}

                                                        {!isFolder && (
                                                            <button
                                                                onClick={() => testSingleBlob(file.id)}
                                                                disabled={blobStatus === 'checking'}
                                                                className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded text-gray-500 hover:text-blue-600 transition-colors"
                                                                title="Test Download (Blob prüfen)"
                                                            >
                                                                <RefreshCw className={`w-3.5 h-3.5 ${blobStatus === 'checking' ? 'animate-spin' : ''}`} />
                                                            </button>
                                                        )}

                                                        <button
                                                            onClick={() => setJsonModalFile(file)}
                                                            className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                                                            title="Raw JSON anzeigen"
                                                        >
                                                            <Eye className="w-3.5 h-3.5" />
                                                        </button>

                                                        <button
                                                            onClick={() => deleteSingleFile(file.id, resolvedTitle)}
                                                            className="p-1 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded text-gray-400 hover:text-rose-600 transition-colors"
                                                            title="Dauerhaft löschen (permanent=true)"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* 5. Raw JSON Inspector Modal */}
            {jsonModalFile && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
                    <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        <div className="p-4 border-b border-gray-100 dark:border-white/10 flex items-center justify-between bg-gray-50 dark:bg-white/[0.02]">
                            <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-blue-500" />
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                                    Raw Payload: <span className="font-mono text-xs text-blue-600 dark:text-blue-400">{jsonModalFile.id}</span>
                                </h3>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleCopy(JSON.stringify(jsonModalFile, null, 2), 'modal_json')}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                                >
                                    {copiedId === 'modal_json' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                    <span>{copiedId === 'modal_json' ? (isDe ? 'Kopiert!' : 'Copied!') : (isDe ? 'Kopieren' : 'Copy')}</span>
                                </button>
                                <button onClick={() => setJsonModalFile(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg text-gray-400 hover:text-white">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="p-4 overflow-y-auto flex-1 font-mono text-[11px] leading-relaxed bg-zinc-950 text-emerald-400 select-all">
                            <pre className="whitespace-pre-wrap break-all">{JSON.stringify(jsonModalFile, null, 2)}</pre>
                        </div>

                        <div className="p-3 border-t border-gray-100 dark:border-white/10 flex items-center justify-between text-[11px] text-gray-400 bg-gray-50 dark:bg-white/[0.02]">
                            <span>Size: {jsonModalFile.size || 0} Bytes | Type: {jsonModalFile.type || 'note'}</span>
                            <button
                                onClick={() => setJsonModalFile(null)}
                                className="px-4 py-1.5 bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 text-gray-800 dark:text-white font-bold rounded-lg text-xs transition-colors"
                            >
                                Schließen
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
