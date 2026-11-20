"use client";

import React, { useEffect } from 'react';
import type { Editor } from '@tiptap/core';
import {
    ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine, ArrowDownToLine,
    PanelTop, Trash2,
} from 'lucide-react';
import type { TableMenuPosition } from './types';

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

export interface TableContextMenuProps {
    editor: Editor | null;
    position: TableMenuPosition | null;
    onClose?: () => void;
}

/** Right-click menu for tables: column, row and table actions side by side. Cell actions live in TableCellBar. */
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
    const ic = 14;
    const maxX = typeof window !== 'undefined' ? window.innerWidth - 480 : position.x;
    const maxY = typeof window !== 'undefined' ? window.innerHeight - 190 : position.y;

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
        </div>
    );
}

export default TableContextMenu;
