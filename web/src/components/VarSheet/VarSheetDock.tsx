'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { getDefaultEngine } from '@/lib/varsheet';
import type { EvaluationResult, VarSheetEngine } from '@/lib/varsheet/types';
import { useVarSheetRunner, type VarSheetRow, type VarSheetTab } from './useVarSheetRunner';

export interface VarSheetDockProps {
    readonly noteId?: string | null;
    readonly engine?: VarSheetEngine;
    readonly isOpen?: boolean;
    readonly onClose?: () => void;
    readonly initialCodes?: readonly string[];
    readonly initialBindings?: ReadonlyMap<string, unknown>;
    readonly className?: string;
}

const MONO_FONT_FAMILY =
    "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

function formatResultLabel(result: EvaluationResult): string {
    if (result.kind === 'empty' || result.kind === 'error') return '';
    const text = result.displayText.trim();
    if (!text) return '';
    if (result.kind === 'func') {
        return text;
    }
    return text.startsWith('→') ? text : `→ ${text}`;
}

function isCursorOnFirstLine(el: HTMLTextAreaElement): boolean {
    const pos = el.selectionStart ?? 0;
    return !el.value.slice(0, pos).includes('\n');
}

function isCursorOnLastLine(el: HTMLTextAreaElement): boolean {
    const pos = el.selectionEnd ?? el.value.length;
    return !el.value.slice(pos).includes('\n');
}

interface ErrorBadgeProps {
    readonly code?: string;
    readonly message: string;
}

function ErrorBadge({ code, message }: ErrorBadgeProps) {
    const [hovered, setHovered] = useState(false);
    const [pinned, setPinned] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const open = hovered || pinned;

    useEffect(() => {
        if (!pinned) return;
        const onDocClick = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setPinned(false);
            }
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setPinned(false);
        };
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [pinned]);

    return (
        <div
            ref={wrapperRef}
            className="relative flex items-center shrink-0"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <button
                type="button"
                aria-label={`Fehler: ${message}`}
                aria-expanded={open}
                onClick={(e) => {
                    e.stopPropagation();
                    setPinned((prev) => !prev);
                }}
                className="w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none flex items-center justify-center hover:bg-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 transition-colors"
            >
                !
            </button>

            {open && (
                <div
                    role="tooltip"
                    className="absolute right-0 bottom-full mb-1.5 z-50 w-56 rounded-[10px] border border-t2-line bg-t2-surface px-2.5 py-2 text-[11px] leading-snug text-t2-ink shadow-float"
                >
                    {code && (
                        <div className="font-mono text-[10px] font-semibold text-red-500 mb-0.5">
                            {code}
                        </div>
                    )}
                    <div className="text-t2-ink-2 break-words">{message}</div>
                </div>
            )}
        </div>
    );
}

interface VarSheetRowItemProps {
    readonly row: VarSheetRow;
    readonly index: number;
    readonly totalRows: number;
    readonly isDragging: boolean;
    readonly isDropTarget: boolean;
    readonly registerTextarea: (id: string, el: HTMLTextAreaElement | null) => void;
    readonly onChangeCode: (id: string, code: string) => void;
    readonly onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>, row: VarSheetRow, index: number) => void;
    readonly onDragStart: (e: React.DragEvent<HTMLDivElement>, index: number) => void;
    readonly onDragOver: (e: React.DragEvent<HTMLDivElement>, index: number) => void;
    readonly onDrop: (e: React.DragEvent<HTMLDivElement>, index: number) => void;
    readonly onDragEnd: () => void;
}

function VarSheetRowItem({
    row,
    index,
    isDragging,
    isDropTarget,
    registerTextarea,
    onChangeCode,
    onKeyDown,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
}: VarSheetRowItemProps) {
    const localRef = useRef<HTMLTextAreaElement | null>(null);
    const [dragLockedByTextarea, setDragLockedByTextarea] = useState(false);

    const setRefs = useCallback(
        (el: HTMLTextAreaElement | null) => {
            localRef.current = el;
            registerTextarea(row.id, el);
        },
        [registerTextarea, row.id],
    );

    useLayoutEffect(() => {
        const el = localRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.max(22, el.scrollHeight)}px`;
    }, [row.code]);

    const resultText = formatResultLabel(row.result);
    const isError = row.result.kind === 'error';
    const errorMessage = row.result.errorMessage || row.result.displayText || 'Fehler';

    return (
        <div
            data-varsheet-row={row.id}
            draggable={!dragLockedByTextarea}
            onDragStart={(e) => onDragStart(e, index)}
            onDragOver={(e) => onDragOver(e, index)}
            onDrop={(e) => onDrop(e, index)}
            onDragEnd={onDragEnd}
            onClick={() => localRef.current?.focus()}
            className={[
                'group relative flex items-start gap-2 rounded-[8px] px-2.5 py-1.5 transition-colors cursor-grab active:cursor-grabbing',
                'hover:bg-t2-hover/60',
                isDragging ? 'opacity-45' : '',
                isDropTarget ? 'ring-1 ring-t2-accent/50 bg-t2-hover/80' : '',
            ].join(' ')}
        >
            <span
                className="select-none pt-[2px] w-4 text-right font-mono text-[11px] leading-[18px] text-t2-ink-3 shrink-0"
                title="Zeile ziehen zum Sortieren"
            >
                {index + 1}
            </span>

            <textarea
                ref={setRefs}
                rows={1}
                value={row.code}
                draggable={false}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                placeholder={index === 0 ? 'x = 1200' : ''}
                onChange={(e) => onChangeCode(row.id, e.target.value)}
                onKeyDown={(e) => onKeyDown(e, row, index)}
                onMouseDown={() => setDragLockedByTextarea(true)}
                onMouseUp={() => setDragLockedByTextarea(false)}
                onMouseLeave={() => setDragLockedByTextarea(false)}
                onDragStart={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                style={{ fontFamily: MONO_FONT_FAMILY }}
                className="flex-1 min-w-0 resize-none overflow-hidden bg-transparent text-[12.5px] leading-[18px] text-t2-ink placeholder:text-t2-ink-3/50 focus:outline-none cursor-text py-[2px]"
            />

            <div className="flex items-center justify-end shrink-0 pt-[2px] min-h-[22px] max-w-[44%]">
                {isError ? (
                    <ErrorBadge code={row.result.errorCode} message={errorMessage} />
                ) : resultText ? (
                    <span
                        title={resultText}
                        style={{ fontFamily: MONO_FONT_FAMILY }}
                        className="truncate text-right text-[12px] leading-[18px] text-t2-ink-2 select-all"
                    >
                        {resultText}
                    </span>
                ) : null}
            </div>
        </div>
    );
}

interface VarSheetTabStripProps {
    readonly tabs: readonly VarSheetTab[];
    readonly activeTabId: string;
    readonly onSelectTab: (tabId: string) => void;
    readonly onCreateTab: () => void;
    readonly onRenameTab: (tabId: string, newName: string) => void;
    readonly onDeleteTab: (tabId: string) => void;
}

function VarSheetTabStrip({ tabs, activeTabId, onSelectTab, onCreateTab, onRenameTab, onDeleteTab }: VarSheetTabStripProps) {
    const [editingTabId, setEditingTabId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const inputRef = useRef<HTMLInputElement | null>(null);
    const skipBlurSaveRef = useRef(false);

    useEffect(() => {
        if (!editingTabId) return;
        inputRef.current?.focus();
        inputRef.current?.select();
    }, [editingTabId]);

    const startRename = (tab: VarSheetTab) => {
        skipBlurSaveRef.current = false;
        setEditingTabId(tab.id);
        setEditingName(tab.name);
    };
    const commitRename = (tabId: string) => {
        if (skipBlurSaveRef.current) { skipBlurSaveRef.current = false; return; }
        const trimmed = editingName.trim();
        if (trimmed) onRenameTab(tabId, trimmed);
        setEditingTabId(null);
    };
    const cancelRename = () => { skipBlurSaveRef.current = true; setEditingTabId(null); };

    return (
        <div role="tablist" aria-label="VarSheet Tabs" className="border-b border-t2-line-soft bg-t2-sub/30 px-3 py-1.5 flex items-center gap-1 overflow-x-auto text-xs">
            {tabs.map((tab) => {
                const isActive = tab.id === activeTabId;
                const isEditing = tab.id === editingTabId;
                return (
                    <div
                        key={tab.id}
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => { if (!isEditing) onSelectTab(tab.id); }}
                        onDoubleClick={(e) => { e.stopPropagation(); startRename(tab); }}
                        className={[
                            'group flex items-center gap-1 shrink-0 rounded-md px-2 py-0.5 transition-colors cursor-pointer select-none',
                            isActive ? 'bg-t2-surface text-t2-ink border border-t2-line shadow-xs font-medium' : 'text-t2-ink-2 hover:text-t2-ink hover:bg-t2-hover/60 border border-transparent',
                        ].join(' ')}
                    >
                        {isEditing ? (
                            <input
                                ref={inputRef}
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onDoubleClick={(e) => e.stopPropagation()}
                                onBlur={() => commitRename(tab.id)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') { e.preventDefault(); commitRename(tab.id); }
                                    else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
                                }}
                                aria-label="Tab umbenennen"
                                className="bg-t2-sub px-1 py-0.5 rounded text-xs outline-none border border-t2-accent w-20 text-t2-ink"
                            />
                        ) : (
                            <>
                                <span className="max-w-[110px] truncate">{tab.name}</span>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); onDeleteTab(tab.id); }}
                                    aria-label={`Tab ${tab.name} schließen`}
                                    title={tabs.length === 1 ? 'Tab zurücksetzen' : 'Tab schließen'}
                                    className={['rounded p-0.5 text-t2-ink-3 hover:text-t2-ink hover:bg-t2-hover transition-opacity', isActive ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-70 hover:!opacity-100'].join(' ')}
                                >
                                    <X size={12} />
                                </button>
                            </>
                        )}
                    </div>
                );
            })}
            <button
                type="button"
                onClick={() => { setEditingTabId(null); onCreateTab(); }}
                aria-label="Neuen Tab erstellen"
                title="Neuer Tab"
                className="shrink-0 flex items-center justify-center w-5 h-5 rounded-md text-t2-ink-2 hover:text-t2-ink hover:bg-t2-hover/60 transition-colors"
            >
                <Plus size={13} />
            </button>
        </div>
    );
}

/**
 * Floating VarSheet calculation side-panel with reactive top-down evaluation and drag reordering.
 */
export function VarSheetDock({ noteId, engine, isOpen = true, onClose, initialCodes, initialBindings, className = '' }: VarSheetDockProps) {
    const activeEngine = engine ?? getDefaultEngine();
    const {
        tabs, activeTabId, rows, variableCount, isEvaluating,
        selectTab, createTab, renameTab, deleteTab, updateRow, insertRowAfter, deleteRow, moveRow,
    } = useVarSheetRunner({ noteId, engine: activeEngine, initialCodes, initialBindings });

    const textareaMapRef = useRef<Map<string, HTMLTextAreaElement>>(new Map());
    const pendingFocusIdRef = useRef<string | null>(null);
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dropIndex, setDropIndex] = useState<number | null>(null);

    const registerTextarea = useCallback((id: string, el: HTMLTextAreaElement | null) => {
        if (el) {
            textareaMapRef.current.set(id, el);
        } else {
            textareaMapRef.current.delete(id);
        }
    }, []);

    const focusRowById = useCallback((id: string, caretToEnd = false) => {
        const el = textareaMapRef.current.get(id);
        if (!el) return;
        el.focus();
        if (caretToEnd) {
            const len = el.value.length;
            el.setSelectionRange(len, len);
        }
    }, []);

    useEffect(() => {
        const targetId = pendingFocusIdRef.current;
        if (!targetId) return;
        if (textareaMapRef.current.has(targetId)) {
            pendingFocusIdRef.current = null;
            focusRowById(targetId, true);
        }
    }, [rows, focusRowById]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>, row: VarSheetRow, index: number) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                pendingFocusIdRef.current = insertRowAfter(row.id);
                return;
            }
            if (e.key === 'ArrowUp' && isCursorOnFirstLine(e.currentTarget)) {
                if (index > 0) { e.preventDefault(); focusRowById(rows[index - 1].id, true); }
                return;
            }
            if (e.key === 'ArrowDown' && isCursorOnLastLine(e.currentTarget)) {
                if (index < rows.length - 1) { e.preventDefault(); focusRowById(rows[index + 1].id, false); }
                return;
            }
            if (e.key === 'Backspace' && row.code === '' && rows.length > 1) {
                e.preventDefault();
                const focusTarget = index > 0 ? rows[index - 1].id : rows[index + 1]?.id;
                if (focusTarget) pendingFocusIdRef.current = focusTarget;
                deleteRow(row.id);
            }
        },
        [deleteRow, focusRowById, insertRowAfter, rows],
    );

    const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, index: number) => {
        if (e.target instanceof HTMLTextAreaElement) { e.preventDefault(); return; }
        setDragIndex(index);
        setDropIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, index: number) => {
        if (dragIndex === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dropIndex !== index) setDropIndex(index);
    }, [dragIndex, dropIndex]);

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>, targetIndex: number) => {
        e.preventDefault();
        if (dragIndex !== null && dragIndex !== targetIndex) moveRow(dragIndex, targetIndex);
        setDragIndex(null);
        setDropIndex(null);
    }, [dragIndex, moveRow]);

    const handleDragEnd = useCallback(() => { setDragIndex(null); setDropIndex(null); }, []);

    if (!isOpen) return null;

    const lineLabel = rows.length === 1 ? '1 Zeile' : `${rows.length} Zeilen`;
    const varLabel = variableCount === 1 ? '1 Variable' : `${variableCount} Variablen`;

    return (
        <aside
            aria-label="VarSheet"
            className={[
                'flex flex-col w-[340px] max-w-full max-h-[75vh] rounded-[14px] border border-t2-line bg-t2-surface shadow-float overflow-hidden',
                className,
            ].join(' ')}
        >
            <header className="flex items-center justify-between px-4 py-2.5 border-b border-t2-line-soft">
                <div className="flex items-center gap-2">
                    <span
                        className="text-[12.5px] font-semibold tracking-tight"
                        style={{ color: 'var(--t2-ink, #27272a)' }}
                    >
                        VarSheet
                    </span>
                    {isEvaluating && (
                        <span
                            aria-label="Berechnet"
                            className="h-1.5 w-1.5 rounded-full bg-t2-accent animate-pulse"
                        />
                    )}
                </div>

                {onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="VarSheet schließen"
                        className="w-6 h-6 rounded-[6px] flex items-center justify-center text-[12px] text-t2-ink-2 hover:text-t2-ink hover:bg-t2-hover transition-colors"
                    >
                        ✕
                    </button>
                )}
            </header>

            <VarSheetTabStrip
                tabs={tabs}
                activeTabId={activeTabId}
                onSelectTab={selectTab}
                onCreateTab={() => { createTab(); }}
                onRenameTab={renameTab}
                onDeleteTab={deleteTab}
            />

            <div className="flex-1 overflow-y-auto px-2 py-2.5 space-y-0.5">
                {rows.map((row, index) => (
                    <VarSheetRowItem
                        key={row.id}
                        row={row}
                        index={index}
                        totalRows={rows.length}
                        isDragging={dragIndex === index}
                        isDropTarget={dropIndex === index && dragIndex !== null && dragIndex !== index}
                        registerTextarea={registerTextarea}
                        onChangeCode={updateRow}
                        onKeyDown={handleKeyDown}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onDragEnd={handleDragEnd}
                    />
                ))}
            </div>

            <footer className="flex items-center justify-between px-4 py-2 border-t border-t2-line-soft text-[11px] text-t2-ink-3 select-none">
                <span>
                    {lineLabel} · {varLabel}
                </span>
                <span className="font-mono text-[10px] opacity-75">Shift+↵ Block</span>
            </footer>
        </aside>
    );
}
