"use client";

import React from 'react';
import {
    Table as TableIcon,
    ArrowUpToLine,
    ArrowDownToLine,
    ArrowLeftToLine,
    ArrowRightToLine,
    Trash2
} from 'lucide-react';
import { TableMenuPosition } from './types';

export interface TableActionItemProps {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    isDanger?: boolean;
}

export const TableActionItem: React.FC<TableActionItemProps> = ({ icon, label, onClick, isDanger = false }) => (
    <button
        onClick={() => { onClick(); }}
        className={`flex items-center gap-2 px-3 py-2 text-xs font-medium w-full text-left rounded-lg transition-colors ${isDanger ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
    >
        {icon}
        <span>{label}</span>
    </button>
);

export interface TableContextMenuProps {
    editor: any;
    position: TableMenuPosition | null;
}

export const TableContextMenu: React.FC<TableContextMenuProps> = ({ editor, position }) => {
    if (!position || !editor) return null;

    return (
        <div
            className="fixed z-[9999] bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden p-1 flex flex-col min-w-[160px]"
            style={{
                top: Math.max(8, Math.min(position.y, typeof window !== 'undefined' ? window.innerHeight - 300 : position.y)),
                left: Math.max(8, Math.min(position.x, typeof window !== 'undefined' ? window.innerWidth - 180 : position.x)),
            }}
            onClick={(e) => e.stopPropagation()}
        >
            <TableActionItem
                icon={<ArrowLeftToLine size={14} />}
                label="Add Column Before"
                onClick={() => editor.chain().focus().addColumnBefore().run()}
            />
            <TableActionItem
                icon={<ArrowRightToLine size={14} />}
                label="Add Column After"
                onClick={() => editor.chain().focus().addColumnAfter().run()}
            />
            <TableActionItem
                icon={<Trash2 size={14} className="rotate-90" />}
                label="Delete Column"
                onClick={() => editor.chain().focus().deleteColumn().run()}
                isDanger
            />
            <div className="h-px bg-gray-100 dark:bg-gray-700 my-1 mx-1" />
            <TableActionItem
                icon={<ArrowUpToLine size={14} />}
                label="Add Row Before"
                onClick={() => editor.chain().focus().addRowBefore().run()}
            />
            <TableActionItem
                icon={<ArrowDownToLine size={14} />}
                label="Add Row After"
                onClick={() => editor.chain().focus().addRowAfter().run()}
            />
            <TableActionItem
                icon={<Trash2 size={14} />}
                label="Delete Row"
                onClick={() => editor.chain().focus().deleteRow().run()}
                isDanger
            />
            <div className="h-px bg-gray-100 dark:bg-gray-700 my-1 mx-1" />
            <TableActionItem
                icon={<TableIcon size={14} />}
                label="Delete Table"
                onClick={() => editor.chain().focus().deleteTable().run()}
                isDanger
            />
        </div>
    );
};

export default TableContextMenu;
