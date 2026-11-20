"use client";

import React, { useEffect } from 'react';
import type { Editor } from '@tiptap/core';
import {
    ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine, ArrowDownToLine,
    PanelTop, Trash2,
} from 'lucide-react';
import type { TableMenuPosition } from './types';
import { setCellBackground, setColumnBackground, setRowBackground } from './tableCommands';

const BG_PALETTE: ReadonlyArray<{ label: string; value: string | null }> = [
    { label: 'Keine Farbe', value: null },
    { label: 'Grau', value: '#f4f5f8' },
    { label: 'Grün', value: '#ecfdf5' },
    { label: 'Blau', value: '#eff6ff' },
    { label: 'Gelb', value: '#fffbeb' },
    { label: 'Rot', value: '#fff1f2' },
];

interface ItemProps { icon: React.ReactNode; label: string; danger?: boolean; onClick: () => void }

function Item({ icon, label, danger, onClick }: ItemProps) {
    return (
        <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClick}
            className={`flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-2 py-[5px] text-left text-[11.5px] font-semibold transition-colors ${danger ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-t2-ink-2 hover:bg-t2-hover'}`}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="flex min-w-[130px] flex-col gap-0.5">
            <span className="px-1.5 pb-1 pt-0.5 text-[9.5px] font-medium uppercase tracking-[0.06em] text-t2-ink-3">{title}</span>
            {children}
        </div>
    );
}

function ColorRow({ label, active, onSelect }: { label: string; active?: string | null; onSelect: (color: string | null) => void }) {
    return (
        <div className="px-1.5 py-1">
            <div className="mb-1 text-[11px] font-semibold text-t2-ink-2">{label}</div>
            <div className="flex items-center gap-1">
                {BG_PALETTE.map((c) => {
                    const isActive = active !== undefined && (active ?? null) === c.value;
                    return (
                        <button
                            key={c.label}
                            type="button"
                            title={c.label}
                            aria-label={`${label}: ${c.label}`}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => onSelect(c.value)}
                            className={`h-4 w-4 rounded-full border transition-transform hover:scale-110 ${isActive ? 'border-t2-ink ring-1 ring-t2-ink/30' : 'border-t2-line'}`}
                            style={
                                c.value
                                    ? { backgroundColor: c.value }
                                    : { background: 'linear-gradient(to top right, transparent calc(50% - 0.75px), currentColor, transparent calc(50% + 0.75px))' }
                            }
                        />
                    );
                })}
            </div>
        </div>
    );
}

export interface TableContextMenuProps {
    editor: Editor | null;
    position: TableMenuPosition | null;
    onClose?: () => void;
}

/** Right-click menu for tables: column, row, table and color actions side by side. Cell alignment lives in TableCellBar. */
export function TableContextMenu({ editor, position, onClose }: TableContextMenuProps) {
    useEffect(() => {
        if (!position || !onClose) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [position, onClose]);

    if (!position || !editor) return null;

    const run = (fn: (c: ReturnType<Editor['chain']>) => { run: () => boolean }) => () => {
        fn(editor.chain().focus()).run();
        onClose?.();
    };
    const applyColor = (fn: (e: Editor, color: string | null) => boolean) => (color: string | null) => {
        fn(editor, color);
        onClose?.();
    };
    const cellBg = (editor.getAttributes('tableCell').backgroundColor ?? editor.getAttributes('tableHeader').backgroundColor ?? null) as string | null;
    const ic = 14;
    const maxX = typeof window !== 'undefined' ? window.innerWidth - 620 : position.x;
    const maxY = typeof window !== 'undefined' ? window.innerHeight - 210 : position.y;

    return (
        <div
            className="fixed z-[9999] flex gap-1.5 rounded-xl border border-t2-line bg-t2-surface p-1.5 shadow-2xl"
            style={{ top: Math.max(8, Math.min(position.y, maxY)), left: Math.max(8, Math.min(position.x, maxX)), fontFamily: 'var(--font-menu)' }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
        >
            <Group title="Spalte">
                <Item icon={<ArrowLeftToLine size={ic} />} label="Links einfügen" onClick={run((c) => c.addColumnBefore())} />
                <Item icon={<ArrowRightToLine size={ic} />} label="Rechts einfügen" onClick={run((c) => c.addColumnAfter())} />
                <Item icon={<Trash2 size={ic} />} label="Löschen" danger onClick={run((c) => c.deleteColumn())} />
            </Group>
            <span className="w-px bg-t2-line-soft" />
            <Group title="Zeile">
                <Item icon={<ArrowUpToLine size={ic} />} label="Oben einfügen" onClick={run((c) => c.addRowBefore())} />
                <Item icon={<ArrowDownToLine size={ic} />} label="Unten einfügen" onClick={run((c) => c.addRowAfter())} />
                <Item icon={<Trash2 size={ic} />} label="Löschen" danger onClick={run((c) => c.deleteRow())} />
            </Group>
            <span className="w-px bg-t2-line-soft" />
            <Group title="Tabelle">
                <Item icon={<PanelTop size={ic} />} label="Kopfzeile" onClick={run((c) => c.toggleHeaderRow())} />
                <Item icon={<Trash2 size={ic} />} label="Löschen" danger onClick={run((c) => c.deleteTable())} />
            </Group>
            <span className="w-px bg-t2-line-soft" />
            <Group title="Farbe">
                <ColorRow label="Zeilenfarbe" onSelect={applyColor(setRowBackground)} />
                <ColorRow label="Spaltenfarbe" onSelect={applyColor(setColumnBackground)} />
                <ColorRow label="Zellenfarbe" active={cellBg} onSelect={applyColor(setCellBackground)} />
            </Group>
        </div>
    );
}

export default TableContextMenu;
