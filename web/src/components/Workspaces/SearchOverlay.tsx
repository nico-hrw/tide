'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, FileText, Calendar, CheckSquare, X, Loader2 } from 'lucide-react';
import Fuse from 'fuse.js';
import { loadSearchIndex, SearchIndexEntry } from '@/lib/searchIndex';
import { useDataStore } from '@/store/useDataStore';
import { DT } from '@/lib/designTokens';

export interface SearchOverlayProps {
    isOpen: boolean;
    onClose: () => void;
    onOpen?: () => void;
    onSelectResult: (target: { id: string; type: string; title: string }) => void;
    privateKey: CryptoKey | null;
    publicKey: CryptoKey | null;
    myId: string;
}

interface SearchItem {
    id: string;
    title: string;
    type: string;
    date?: string;
}

export const SearchOverlay: React.FC<SearchOverlayProps> = ({
    isOpen,
    onClose,
    onOpen,
    onSelectResult,
    privateKey,
    publicKey: _publicKey,
    myId,
}) => {
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [indexEntries, setIndexEntries] = useState<SearchIndexEntry[]>([]);
    const [loadingIndex, setLoadingIndex] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const { notes, events, tasks, theme } = useDataStore((s) => ({
        notes: s.notes,
        events: s.events,
        tasks: s.tasks,
        theme: s.theme,
    }));
    const isDark = theme === 'dark';

    // Global shortcut: Cmd+K / Ctrl+K
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                if (isOpen) onClose();
                else onOpen?.();
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [isOpen, onClose, onOpen]);

    // Handle modal lifecycle & body scroll lock
    useEffect(() => {
        if (!isOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        setQuery('');
        setSelectedIndex(0);
        const timer = setTimeout(() => inputRef.current?.focus(), 50);
        return () => {
            document.body.style.overflow = prev;
            clearTimeout(timer);
        };
    }, [isOpen]);

    // Eager index load
    useEffect(() => {
        if (!isOpen || !privateKey || !myId) return;
        let active = true;
        setLoadingIndex(true);
        loadSearchIndex(privateKey, myId)
            .then((entries) => { if (active && entries) setIndexEntries(entries); })
            .catch((err) => console.error('[SearchOverlay] Index load error:', err))
            .finally(() => { if (active) setLoadingIndex(false); });
        return () => { active = false; };
    }, [isOpen, privateKey, myId]);

    // Aggregate items across eager search index and local data store
    const allItems = useMemo<SearchItem[]>(() => {
        const map = new Map<string, SearchItem>();
        for (const item of indexEntries) {
            if (item?.id) map.set(item.id, { id: item.id, title: item.title || 'Untitled', type: item.type || 'note', date: item.date });
        }
        for (const n of notes || []) {
            if (n?.id) map.set(n.id, { id: n.id, title: n.title || 'Untitled Note', type: n.type || 'note', date: (n as any).date });
        }
        for (const ev of events || []) {
            if (ev?.id) map.set(ev.id, { id: ev.id, title: ev.title || 'Untitled Event', type: 'event', date: (ev as any).start });
        }
        for (const t of tasks || []) {
            if (t?.id) map.set(t.id, { id: t.id, title: t.title || 'Untitled Task', type: 'task', date: t.dueDate });
        }
        return Array.from(map.values());
    }, [indexEntries, notes, events, tasks]);

    const fuse = useMemo(() => new Fuse(allItems, { keys: ['title', 'type'], threshold: 0.35, ignoreLocation: true }), [allItems]);
    const results = useMemo(() => {
        const trimmed = query.trim();
        return trimmed ? fuse.search(trimmed).map((r) => r.item).slice(0, 20) : allItems.slice(0, 10);
    }, [query, allItems, fuse]);

    useEffect(() => { setSelectedIndex(0); }, [query]);

    const handleSelect = (item: SearchItem) => {
        onSelectResult({ id: item.id, type: item.type, title: item.title });
        onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex((p) => (results.length > 0 ? (p + 1) % results.length : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex((p) => (results.length > 0 ? (p - 1 + results.length) % results.length : 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (results[selectedIndex]) handleSelect(results[selectedIndex]);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        }
    };

    const getItemIcon = (type: string) => {
        if (type === 'event') return <Calendar className="w-4 h-4 text-emerald-500 shrink-0" />;
        if (type === 'task') return <CheckSquare className="w-4 h-4 text-amber-500 shrink-0" />;
        return <FileText className="w-4 h-4 text-blue-500 shrink-0" />;
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[1000] flex items-start justify-center pt-[12vh] px-4">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: -8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: -8 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className="relative w-full max-w-xl overflow-hidden rounded-2xl shadow-2xl border flex flex-col"
                        style={{ backgroundColor: DT.cardBg(isDark), borderColor: DT.borderColor, color: DT.primaryText(isDark) }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: DT.borderColor }}>
                            <Search className="w-5 h-5 shrink-0" style={{ color: DT.mutedText(isDark) }} />
                            <input
                                ref={inputRef}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Search files, events, tasks... (Cmd+K)"
                                className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-gray-400"
                                style={{ color: DT.primaryText(isDark) }}
                            />
                            {loadingIndex && <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />}
                            {query ? (
                                <button onClick={() => setQuery('')} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors">
                                    <X className="w-4 h-4" style={{ color: DT.mutedText(isDark) }} />
                                </button>
                            ) : (
                                <kbd className="px-2 py-0.5 text-xs font-mono rounded border text-gray-500 dark:text-gray-400" style={{ borderColor: DT.borderColor }}>
                                    ESC
                                </kbd>
                            )}
                        </div>

                        <div className="max-h-[360px] overflow-y-auto p-2">
                            {results.length === 0 ? (
                                <div className="py-8 text-center text-sm" style={{ color: DT.mutedText(isDark) }}>
                                    {query ? `No results for "${query}"` : 'No items found'}
                                </div>
                            ) : (
                                results.map((item, idx) => {
                                    const isSelected = idx === selectedIndex;
                                    return (
                                        <button
                                            key={`${item.type}-${item.id}`}
                                            type="button"
                                            onClick={() => handleSelect(item)}
                                            onMouseEnter={() => setSelectedIndex(idx)}
                                            className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                                                isSelected
                                                    ? 'bg-blue-500/10 dark:bg-blue-400/15 text-blue-600 dark:text-blue-400'
                                                    : 'hover:bg-gray-100 dark:hover:bg-zinc-800/60'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                {getItemIcon(item.type)}
                                                <span className="truncate font-medium">{item.title}</span>
                                            </div>
                                            <span
                                                className="text-[11px] uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0"
                                                style={{ borderColor: DT.borderColor, color: DT.mutedText(isDark) }}
                                            >
                                                {item.type}
                                            </span>
                                        </button>
                                    );
                                })
                            )}
                        </div>

                        <div
                            className="flex items-center justify-between px-4 py-2 text-xs border-t"
                            style={{
                                borderColor: DT.borderColor,
                                color: DT.mutedText(isDark),
                                backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                            }}
                        >
                            <span>Navigate with ↑↓</span>
                            <span>Select with ↵</span>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default SearchOverlay;
