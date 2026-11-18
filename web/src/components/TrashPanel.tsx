import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { useDataStore } from '../store/useDataStore';
import { Trash2, RotateCcw, FileText, Folder, AlertCircle, Calendar } from 'lucide-react';

interface TrashedFile {
    id: string;
    title: string;
    type: string;
    metadata: {
        deleted_at?: string;
        title?: string;
    };
}

export default function TrashPanel() {
    const [trashedItems, setTrashedItems] = useState<TrashedFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionId, setActionId] = useState<string | null>(null);
    const fetchDirectory = useDataStore(s => s.fetchDirectory);

    const loadTrash = async () => {
        setLoading(true);
        try {
            const res = await apiFetch('/api/v1/files?trashed=true');
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    // Try to parse metadata if it comes as string
                    const formatted = data.map((item: any) => {
                        let md = item.metadata || {};
                        if (typeof md === 'string') {
                            try { md = JSON.parse(md); } catch (_) { md = {}; }
                        }
                        return {
                            ...item,
                            metadata: md,
                            title: item.title || md.title || 'Untitled'
                        };
                    });
                    setTrashedItems(formatted);
                }
            }
        } catch (err) {
            console.error('Failed to load trash:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadTrash();
    }, []);

    const handleRestore = async (id: string) => {
        setActionId(id);
        try {
            const res = await apiFetch(`/api/v1/files/${id}/restore`, { method: 'POST' });
            if (res.ok) {
                setTrashedItems(prev => prev.filter(item => item.id !== id));
                await fetchDirectory(null, true); // Refresh main sidebar
            } else {
                alert('Wiederherstellung fehlgeschlagen');
            }
        } catch (err) {
            console.error('Error restoring file:', err);
        } finally {
            setActionId(null);
        }
    };

    const handlePermanentDelete = async (id: string, title: string) => {
        if (!confirm(`Möchtest du "${title}" wirklich endgültig unwiderruflich löschen?`)) return;
        setActionId(id);
        try {
            const res = await apiFetch(`/api/v1/files/${id}?permanent=true`, { method: 'DELETE' });
            if (res.ok) {
                setTrashedItems(prev => prev.filter(item => item.id !== id));
            } else {
                alert('Löschen fehlgeschlagen');
            }
        } catch (err) {
            console.error('Error deleting file:', err);
        } finally {
            setActionId(null);
        }
    };

    const handleEmptyTrash = async () => {
        if (trashedItems.length === 0) return;
        if (!confirm('Möchtest du den Papierkorb wirklich leeren? Alle Inhalte werden endgültig gelöscht.')) return;
        
        setLoading(true);
        try {
            for (const item of trashedItems) {
                await apiFetch(`/api/v1/files/${item.id}?permanent=true`, { method: 'DELETE' });
            }
            setTrashedItems([]);
        } catch (err) {
            console.error('Error emptying trash:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto py-12 px-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-t2-ink  flex items-center gap-3">
                        <Trash2 className="text-rose-500" />
                        Papierkorb
                    </h1>
                    <p className="text-sm text-t2-ink-2  mt-2 flex items-center gap-1.5">
                        <AlertCircle size={14} className="text-amber-500" />
                        Inhalte im Papierkorb werden nach einer Woche automatisch unwiderruflich gelöscht.
                    </p>
                </div>
                {trashedItems.length > 0 && (
                    <button
                        onClick={handleEmptyTrash}
                        disabled={loading}
                        className="px-4 py-2 text-sm font-semibold bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/30 rounded-lg transition-colors border border-rose-200/50 dark:border-rose-900/40 active:scale-[0.98] transition-transform disabled:opacity-50"
                    >
                        Papierkorb leeren
                    </button>
                )}
            </div>

            {loading && trashedItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-t2-ink-3">
                    <div className="w-8 h-8 border-2 border-t2-accent border-t-transparent rounded-full animate-spin mb-4" />
                    <span>Papierkorb wird geladen...</span>
                </div>
            ) : trashedItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-t2-ink-3 border-2 border-dashed border-t2-line  rounded-2xl bg-t2-sub ">
                    <Trash2 size={48} className="text-t2-ink-3  mb-4" />
                    <span className="font-semibold text-t2-ink  text-lg">Der Papierkorb ist leer</span>
                    <span className="text-sm text-t2-ink-3 mt-1">Gelöschte Notizen und Ordner landen hier</span>
                </div>
            ) : (
                <div className="bg-t2-surface  border border-t2-line  rounded-2xl overflow-hidden shadow-sm">
                    <div className="divide-y divide-t2-line-soft ">
                        {trashedItems.map(item => {
                            const deletedAt = item.metadata.deleted_at 
                                ? new Date(item.metadata.deleted_at).toLocaleString() 
                                : 'Unbekannt';
                            const isFolder = item.type === 'folder';

                            return (
                                <div key={item.id} className="flex items-center justify-between p-4 hover:bg-t2-sub  transition-colors">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className="text-t2-ink-3 shrink-0">
                                            {isFolder ? <Folder size={20} className="text-t2-accent" /> : <FileText size={20} />}
                                        </div>
                                        <div className="truncate pr-4">
                                            <p className="font-semibold text-t2-ink  truncate text-sm">
                                                {item.title}
                                            </p>
                                            <p className="text-xs text-t2-ink-3 mt-1 flex items-center gap-1">
                                                <Calendar size={12} />
                                                Gelöscht am: {deletedAt}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            onClick={() => handleRestore(item.id)}
                                            disabled={actionId !== null}
                                            title="Wiederherstellen"
                                            className="p-2 text-t2-ink-2 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            <RotateCcw size={16} />
                                        </button>
                                        <button
                                            onClick={() => handlePermanentDelete(item.id, item.title)}
                                            disabled={actionId !== null}
                                            title="Endgültig löschen"
                                            className="p-2 text-t2-ink-2 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
