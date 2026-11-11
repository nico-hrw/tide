"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import {
    Search,
    Calendar,
    FileText,
    Calendar as CalendarIcon,
    Sparkles,
    Plus,
    CornerDownLeft,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDataStore } from '@/store/useDataStore';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { parseGermanDate } from '@/lib/dateParser';
import { searchHolidays } from '@/lib/holidays';
import DT from '@/lib/designTokens';

export interface EditorInlineSearchProps {
    editor: Editor | null;
}

export interface SearchItem {
    id: string;
    type: 'date' | 'create-event' | 'holiday' | 'note' | 'event';
    label: string;
    sublabel?: string;
    date?: Date;
    note?: any;
    event?: any;
    title?: string;
    start?: Date;
    end?: Date;
}

export function EditorInlineSearch({ editor }: EditorInlineSearchProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);

    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const notes = useDataStore((s) => s.notes) || [];
    const events = useDataStore((s) => s.events) || [];
    const calendarHolidayPackage = useDataStore((s) => s.calendarHolidayPackage) || 'DE';
    const calendarHolidaysEnabled = useDataStore((s) => s.calendarHolidaysEnabled) ?? true;

    const handleClose = useCallback(() => {
        setIsOpen(false);
        setPosition(null);
        setQuery('');
        setSelectedIndex(0);
        if (editor && !editor.isDestroyed) {
            try {
                editor.commands.focus();
            } catch (_) {}
        }
    }, [editor]);

    // Listen for custom trigger from useTipTapConfig
    useEffect(() => {
        const handleOpen = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail && typeof detail.x === 'number' && typeof detail.y === 'number') {
                setPosition({ x: detail.x, y: detail.y });
                setIsOpen(true);
                setQuery('');
                setSelectedIndex(0);
            }
        };

        const handleForceClose = () => {
            handleClose();
        };

        window.addEventListener('tide:editor-inline-search-open', handleOpen);
        window.addEventListener('tide:editor-inline-search-close', handleForceClose);
        return () => {
            window.removeEventListener('tide:editor-inline-search-open', handleOpen);
            window.removeEventListener('tide:editor-inline-search-close', handleForceClose);
        };
    }, [handleClose]);

    // Auto-focus input when opened
    useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => {
                inputRef.current?.focus();
            }, 30);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    // Dismiss on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handleMouseDown = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                handleClose();
            }
        };
        window.addEventListener('mousedown', handleMouseDown);
        return () => window.removeEventListener('mousedown', handleMouseDown);
    }, [isOpen, handleClose]);

    // Global Esc key listener
    useEffect(() => {
        if (!isOpen) return;
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                handleClose();
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown, true);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
    }, [isOpen, handleClose]);

    // Compute search items matching SmartIsland functionality
    const searchItems = useMemo<SearchItem[]>(() => {
        const trimmed = query.trim();
        const items: SearchItem[] = [];

        // 1. German date parsing (e.g. "morgen", "15. Mai", "Freitag 14 Uhr")
        if (trimmed.length >= 2) {
            try {
                const parsedResults = parseGermanDate(trimmed, new Date());
                if (parsedResults.length > 0 && parsedResults[0].proposedDate) {
                    const res = parsedResults[0];
                    const d = res.proposedDate;
                    items.push({
                        id: `date-${d.toISOString()}`,
                        type: 'date',
                        label: format(d, 'EEEE, d. MMMM yyyy', { locale: de }),
                        sublabel: 'Datum aufrufen',
                        date: d,
                    });

                    const titleHint = res.titleHint || trimmed;
                    const startTime = res.proposedStart || d;
                    const endTime = res.proposedEnd || new Date(startTime.getTime() + 60 * 60 * 1000);
                    items.push({
                        id: `create-event-${d.toISOString()}`,
                        type: 'create-event',
                        label: `Termin "${titleHint}" erstellen`,
                        sublabel: `${format(startTime, 'HH:mm')} Uhr (${format(d, 'dd.MM.yyyy')})`,
                        date: d,
                        title: titleHint,
                        start: startTime,
                        end: endTime,
                    });
                }
            } catch (_) {}
        }

        // 2. Public holidays
        if (calendarHolidaysEnabled && trimmed.length >= 2) {
            try {
                const hResults = searchHolidays(trimmed, new Date().getFullYear(), calendarHolidayPackage);
                hResults.slice(0, 2).forEach((h) => {
                    const hDate = new Date(h.date);
                    items.push({
                        id: `holiday-${h.date}-${h.name}`,
                        type: 'holiday',
                        label: h.name,
                        sublabel: `Feiertag · ${format(hDate, 'dd.MM.yyyy')}`,
                        date: hDate,
                    });
                });
            } catch (_) {}
        }

        const lowerQ = trimmed.toLowerCase();

        // 3. Notes
        if (trimmed.length > 0) {
            notes
                .filter((n: any) => n.title && n.title.toLowerCase().includes(lowerQ) && !n.title.startsWith('.'))
                .slice(0, 4)
                .forEach((n: any) => {
                    items.push({
                        id: `note-${n.id}`,
                        type: 'note',
                        label: n.title || 'Neue Notiz',
                        sublabel: 'Notiz',
                        note: n,
                    });
                });
        } else {
            // When query is empty, show top 3 recent notes
            notes
                .filter((n: any) => n.title && !n.title.startsWith('.'))
                .slice(0, 3)
                .forEach((n: any) => {
                    items.push({
                        id: `note-recent-${n.id}`,
                        type: 'note',
                        label: n.title || 'Neue Notiz',
                        sublabel: 'Kürzlich aufgerufen',
                        note: n,
                    });
                });
        }

        // 4. Events
        if (trimmed.length > 0) {
            events
                .filter((e: any) => e.title && e.title.toLowerCase().includes(lowerQ))
                .slice(0, 4)
                .forEach((e: any) => {
                    const startVal = e.start_time || e.start;
                    let timeSublabel = 'Termin';
                    if (startVal) {
                        try {
                            timeSublabel = `Termin · ${format(new Date(startVal), 'dd. MMM HH:mm', { locale: de })} Uhr`;
                        } catch (_) {}
                    }
                    items.push({
                        id: `event-${e.id}`,
                        type: 'event',
                        label: e.title,
                        sublabel: timeSublabel,
                        event: e,
                    });
                });
        }

        return items;
    }, [query, notes, events, calendarHolidaysEnabled, calendarHolidayPackage]);

    useEffect(() => {
        setSelectedIndex(0);
    }, [searchItems.length, query]);

    const handleSelectItem = useCallback(
        (item: SearchItem) => {
            if (item.type === 'date' && item.date) {
                window.dispatchEvent(
                    new CustomEvent('tide:select-event', { detail: { start: item.date.toISOString() } })
                );
            } else if (item.type === 'create-event' && item.start && item.end) {
                window.dispatchEvent(
                    new CustomEvent('tide:collector-create-event', {
                        detail: {
                            title: item.title || 'Neuer Termin',
                            start: item.start,
                            end: item.end,
                        },
                    })
                );
                window.dispatchEvent(
                    new CustomEvent('tide:select-event', { detail: { start: item.start.toISOString() } })
                );
            } else if (item.type === 'holiday' && item.date) {
                window.dispatchEvent(
                    new CustomEvent('tide:select-event', { detail: { start: item.date.toISOString() } })
                );
            } else if (item.type === 'note' && item.note) {
                window.dispatchEvent(
                    new CustomEvent('tide:select-note', {
                        detail: { id: item.note.id, title: item.note.title },
                    })
                );
                useDataStore.getState().setActiveNoteId(item.note.id);
            } else if (item.type === 'event' && item.event) {
                const startVal = item.event.start_time || item.event.start;
                window.dispatchEvent(
                    new CustomEvent('tide:select-event', {
                        detail: {
                            id: item.event.id,
                            start: startVal,
                            start_time: item.event.start_time || startVal,
                        },
                    })
                );
            }
            handleClose();
        },
        [handleClose]
    );

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            handleClose();
            return;
        }

        if (e.key === 'Backspace' && query === '') {
            e.preventDefault();
            handleClose();
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (searchItems.length > 0) {
                setSelectedIndex((prev) => (prev + 1) % searchItems.length);
            }
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (searchItems.length > 0) {
                setSelectedIndex((prev) => (prev - 1 + searchItems.length) % searchItems.length);
            }
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            if (searchItems.length > 0 && searchItems[selectedIndex]) {
                handleSelectItem(searchItems[selectedIndex]);
            } else if (query.trim() && editor && !editor.isDestroyed) {
                editor.commands.insertContent(query);
                handleClose();
            }
            return;
        }
    };

    const POPUP_WIDTH = 460;
    const computedPosition = useMemo(() => {
        if (!position || typeof window === 'undefined') return { top: 0, left: 0 };
        const left = Math.max(16, Math.min(position.x, window.innerWidth - POPUP_WIDTH - 16));
        const spaceBelow = window.innerHeight - position.y;
        let top = position.y + 8;
        if (spaceBelow < 300 && position.y > 320) {
            top = position.y - 310;
        }
        return { top, left };
    }, [position]);

    if (typeof document === 'undefined' || !isOpen || !position) return null;

    return createPortal(
        <AnimatePresence>
            <motion.div
                ref={containerRef}
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                style={{
                    position: 'fixed',
                    top: computedPosition.top,
                    left: computedPosition.left,
                    width: POPUP_WIDTH,
                    zIndex: 9999,
                    borderRadius: DT.radiusLg,
                }}
                className="bg-white/95 dark:bg-[#18181b]/95 backdrop-blur-xl border border-gray-200 dark:border-white/10 shadow-2xl p-2.5 flex flex-col gap-2 text-gray-900 dark:text-zinc-100 select-none"
            >
                {/* Search Input */}
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 shadow-inner">
                    <Search size={14} className="text-gray-400 dark:text-zinc-400 flex-shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Suchen oder eingeben..."
                        className="bg-transparent text-xs font-medium text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500 outline-none w-full"
                    />
                    {query.trim().length > 0 && (
                        <CornerDownLeft size={12} className="text-gray-400 dark:text-zinc-500 flex-shrink-0" />
                    )}
                </div>

                {/* Results list */}
                {searchItems.length > 0 ? (
                    <div className="flex flex-col gap-1 max-h-56 overflow-y-auto pr-0.5">
                        {searchItems.map((item, idx) => {
                            const isSelected = idx === selectedIndex;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => handleSelectItem(item)}
                                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors text-left w-full ${
                                        isSelected
                                            ? 'bg-indigo-50 dark:bg-indigo-600/35 border border-indigo-200 dark:border-indigo-400/40 text-indigo-900 dark:text-white'
                                            : 'hover:bg-gray-100 dark:hover:bg-white/5 text-gray-700 dark:text-zinc-300 border border-transparent'
                                    }`}
                                >
                                    {item.type === 'date' && (
                                        <Calendar size={13} className="text-blue-500 dark:text-blue-400 flex-shrink-0" />
                                    )}
                                    {item.type === 'create-event' && (
                                        <Plus size={13} className="text-gray-500 dark:text-zinc-400 flex-shrink-0" />
                                    )}
                                    {item.type === 'holiday' && (
                                        <Sparkles size={13} className="text-amber-500 dark:text-amber-400 flex-shrink-0" />
                                    )}
                                    {item.type === 'note' && (
                                        <FileText size={13} className="text-gray-500 dark:text-zinc-400 flex-shrink-0" />
                                    )}
                                    {item.type === 'event' && (
                                        <CalendarIcon size={13} className="text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
                                    )}
                                    <div className="flex flex-col min-w-0 flex-1">
                                        <span className="text-xs font-semibold truncate leading-tight">
                                            {item.label}
                                        </span>
                                        {item.sublabel && (
                                            <span className="text-[10px] text-gray-500 dark:text-zinc-400 truncate leading-tight mt-0.5">
                                                {item.sublabel}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="py-3 px-2 text-center text-xs text-gray-400 dark:text-zinc-500">
                        Keine Ergebnisse gefunden.
                    </div>
                )}

                {/* Footer hints */}
                <div className="flex items-center justify-between px-1.5 pt-1 border-t border-gray-100 dark:border-white/5 text-[10px] text-gray-400 dark:text-zinc-400">
                    <span>↑↓ navigieren</span>
                    <span>↵ auswählen</span>
                    <span>esc schließen</span>
                </div>
            </motion.div>
        </AnimatePresence>,
        document.body
    );
}

export default EditorInlineSearch;
