'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Code, Globe, Lock, Plus, Search, X } from 'lucide-react';
import { buildScope } from '@/lib/formula/scope';
import { STDLIB_ENTRIES } from '@/lib/formula/stdlib';
import type { RegistryEntry } from '@/lib/variableRegistry';
import { getVariableRegistry } from '@/lib/variableRegistryInstance';
import { useDataStore } from '@/store/useDataStore';
import { ManualVarForm, StdlibView, VarRow } from './VariablesParts';

export interface VariablesModalProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenNote?: (noteId: string) => void;
}

type TabId = 'global' | 'functions' | 'stdlib';

function isFunctionEntry(entry: RegistryEntry): boolean {
    return Boolean(entry.params && entry.params.length > 0);
}

function matchesSearch(
    entry: RegistryEntry,
    query: string,
    noteTitles: Map<string, string>,
): boolean {
    if (!query) return true;
    const noteTitle = entry.sourceNoteId ? noteTitles.get(entry.sourceNoteId) ?? '' : '';
    const paramsText = entry.params ? entry.params.join(', ') : '';
    return (
        entry.name.toLowerCase().includes(query) ||
        entry.expr.toLowerCase().includes(query) ||
        paramsText.toLowerCase().includes(query) ||
        noteTitle.toLowerCase().includes(query)
    );
}

export function VariablesModal(props: VariablesModalProps) {
    if (!props.isOpen) return null;
    return <VariablesModalBody {...props} />;
}

export default VariablesModal;

function VariablesModalBody({ onClose, onOpenNote }: VariablesModalProps) {
    const registry = getVariableRegistry();
    const notes = useDataStore((s) => s.notes);

    const [activeTab, setActiveTab] = useState<TabId>('global');
    const [search, setSearch] = useState('');
    const [entries, setEntries] = useState<RegistryEntry[]>(() => registry.allEntries());
    const [showNewForm, setShowNewForm] = useState(false);
    const [editingEntry, setEditingEntry] = useState<RegistryEntry | null>(null);

    useEffect(() => {
        const update = () => setEntries(registry.allEntries());
        update();
        const unsub = registry.subscribe(update);
        void registry.ensureLoaded();
        return unsub;
    }, [registry]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const noteTitles = useMemo(() => {
        const map = new Map<string, string>();
        for (const note of notes) {
            map.set(note.id, note.title || 'Unbenannte Notiz');
        }
        return map;
    }, [notes]);

    const scope = useMemo(() => {
        void entries;
        return buildScope({ local: [], global: () => registry.definitions(), snapshot: [] });
    }, [registry, entries]);

    const globalEntries = useMemo(
        () => entries.filter((e) => !isFunctionEntry(e)),
        [entries],
    );
    const functionEntries = useMemo(
        () => entries.filter((e) => isFunctionEntry(e)),
        [entries],
    );

    const query = search.trim().toLowerCase();
    const visibleEntries = useMemo(() => {
        const base = activeTab === 'functions' ? functionEntries : globalEntries;
        return base.filter((entry) => matchesSearch(entry, query, noteTitles));
    }, [activeTab, functionEntries, globalEntries, noteTitles, query]);

    const noteEntries = useMemo(
        () => visibleEntries.filter((e) => e.sourceNoteId !== null),
        [visibleEntries],
    );
    const manualEntries = useMemo(
        () => visibleEntries.filter((e) => e.sourceNoteId === null),
        [visibleEntries],
    );

    const handleTabChange = (tab: TabId) => {
        setActiveTab(tab);
        setShowNewForm(false);
        setEditingEntry(null);
    };

    const handleSaveManual = async (name: string, expr: string, params?: string[]) => {
        if (editingEntry && editingEntry.name !== name) {
            await registry.removeManual(editingEntry.name);
        }
        await registry.setManual({
            name,
            expr,
            params,
            global: true,
        });
        setShowNewForm(false);
        setEditingEntry(null);
    };

    const handleDeleteManual = (entry: RegistryEntry) => {
        if (editingEntry && editingEntry.name === entry.name) {
            setEditingEntry(null);
        }
        void registry.removeManual(entry.name);
    };

    const renderEntryRow = (entry: RegistryEntry) => {
        const noteId = entry.sourceNoteId;
        const isManual = noteId === null;
        const sourceNoteTitle = noteId
            ? noteTitles.get(noteId) ?? 'Unbekannte Notiz'
            : null;
        const entryKey = `${noteId ?? 'manual'}:${entry.name}`;

        return (
            <VarRow
                key={entryKey}
                name={entry.name}
                expr={entry.expr}
                params={entry.params}
                evaluated={isFunctionEntry(entry) ? undefined : scope.variable(entry.name)}
                sourceNoteTitle={sourceNoteTitle}
                isManual={isManual}
                onOpenNote={noteId && onOpenNote ? () => onOpenNote(noteId) : undefined}
                onEdit={
                    isManual
                        ? () => {
                              setShowNewForm(false);
                              setEditingEntry(entry);
                          }
                        : undefined
                }
                onDelete={isManual ? () => handleDeleteManual(entry) : undefined}
            />
        );
    };

    const tabs: ReadonlyArray<{
        id: TabId;
        label: string;
        icon: React.ReactNode;
        count: number;
    }> = [
        {
            id: 'global',
            label: 'Meine globalen',
            icon: <Globe className="h-4 w-4 shrink-0" />,
            count: globalEntries.length,
        },
        {
            id: 'functions',
            label: 'Funktionen',
            icon: <Code className="h-4 w-4 shrink-0" />,
            count: functionEntries.length,
        },
        {
            id: 'stdlib',
            label: 'Standard (Tide)',
            icon: <Lock className="h-4 w-4 shrink-0" />,
            count: STDLIB_ENTRIES.length,
        },
    ];

    const isFormOpen = showNewForm || editingEntry !== null;
    const addButtonLabel = activeTab === 'functions' ? 'Neue Funktion' : 'Neue Variable';

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center sm:p-6">
            <div
                onClick={onClose}
                className="absolute inset-0"
                style={{ backgroundColor: 'color-mix(in srgb, var(--t2-ink) 20%, transparent)' }}
            />

            <div
                role="dialog"
                aria-modal="true"
                aria-label="Variablen"
                onClick={(e) => e.stopPropagation()}
                className="relative flex h-full w-full max-w-[1060px] flex-col overflow-hidden bg-t2-bg text-[14px] leading-[1.45] text-t2-ink shadow-modal ring-1 ring-t2-line sm:h-[min(760px,92vh)] sm:flex-row sm:rounded-modal"
            >
                <aside className="flex shrink-0 flex-col gap-1 border-b border-t2-line bg-t2-sub p-3 sm:w-[240px] sm:border-b-0 sm:border-r">
                    <div className="flex items-center justify-between px-2 pb-2 pt-1">
                        <h1 className="text-[17px] font-semibold tracking-[-0.02em] text-t2-ink">
                            Variablen
                        </h1>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Schließen"
                            className="rounded-ui p-1.5 text-t2-ink-2 transition-colors hover:bg-t2-hover hover:text-t2-ink sm:hidden"
                        >
                            <X className="h-[18px] w-[18px]" />
                        </button>
                    </div>

                    <nav aria-label="Variablen-Kategorien" className="flex flex-col gap-1">
                        {tabs.map((tab) => {
                            const active = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => handleTabChange(tab.id)}
                                    aria-current={active ? 'page' : undefined}
                                    className={`flex w-full items-center gap-2.5 rounded-ui px-2.5 py-2 text-left text-[13.5px] transition-colors ${
                                        active
                                            ? 'bg-t2-hover font-semibold text-t2-ink'
                                            : 'text-t2-ink-2 hover:bg-t2-hover hover:text-t2-ink'
                                    }`}
                                >
                                    {tab.icon}
                                    <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                                    <span className="shrink-0 rounded-full border border-t2-line bg-t2-surface px-1.5 py-0.5 text-[11px] tabular-nums text-t2-ink-3">
                                        {tab.count}
                                    </span>
                                </button>
                            );
                        })}
                    </nav>
                </aside>

                <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Schließen"
                        className="absolute right-4 top-4 z-10 hidden h-9 w-9 items-center justify-center rounded-ui text-t2-ink-2 transition-colors hover:bg-t2-hover hover:text-t2-ink sm:flex"
                    >
                        <X className="h-[18px] w-[18px]" />
                    </button>

                    <div className="border-b border-t2-line-soft px-5 py-3.5 sm:pr-16">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <div className="relative min-w-[200px] flex-1">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t2-ink-3" />
                                <input
                                    type="search"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Suchen…"
                                    aria-label="Variablen durchsuchen"
                                    className="w-full rounded-lg border border-t2-line bg-t2-surface py-1.5 pl-9 pr-3 text-[13px] text-t2-ink placeholder:text-t2-ink-3 focus:border-t2-accent focus:outline-none"
                                />
                            </div>

                            {activeTab !== 'stdlib' && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditingEntry(null);
                                        setShowNewForm((prev) => !prev);
                                    }}
                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-t2-accent px-3 py-1.5 text-xs font-medium text-t2-accent-ink transition-opacity hover:opacity-90"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    {addButtonLabel}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                        {activeTab === 'stdlib' ? (
                            <StdlibView searchQuery={search} />
                        ) : (
                            <div className="space-y-5">
                                {isFormOpen && (
                                    <ManualVarForm
                                        key={
                                            editingEntry
                                                ? `edit-${editingEntry.name}`
                                                : `new-${activeTab}`
                                        }
                                        initial={
                                            editingEntry
                                                ? {
                                                      name: editingEntry.name,
                                                      expr: editingEntry.expr,
                                                      params: editingEntry.params,
                                                  }
                                                : undefined
                                        }
                                        onSave={handleSaveManual}
                                        onCancel={() => {
                                            setShowNewForm(false);
                                            setEditingEntry(null);
                                        }}
                                    />
                                )}

                                {visibleEntries.length === 0 ? (
                                    <p className="py-10 text-center text-xs text-t2-ink-3">
                                        {query
                                            ? 'Keine passenden Einträge gefunden.'
                                            : activeTab === 'functions'
                                              ? 'Noch keine globalen Funktionen vorhanden.'
                                              : 'Noch keine globalen Variablen vorhanden.'}
                                    </p>
                                ) : (
                                    <>
                                        {noteEntries.length > 0 && (
                                            <section className="space-y-2">
                                                <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-t2-ink-3">
                                                    Aus Notizen
                                                </h2>
                                                <div className="space-y-1.5">
                                                    {noteEntries.map(renderEntryRow)}
                                                </div>
                                            </section>
                                        )}

                                        {manualEntries.length > 0 && (
                                            <section className="space-y-2">
                                                <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-t2-ink-3">
                                                    Ohne Notiz
                                                </h2>
                                                <div className="space-y-1.5">
                                                    {manualEntries.map(renderEntryRow)}
                                                </div>
                                            </section>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
