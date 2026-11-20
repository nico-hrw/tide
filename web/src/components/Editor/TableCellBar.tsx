"use client";

import React, { useCallback, useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { CellSelection } from '@tiptap/pm/tables';
import {
    AlignLeft, AlignCenter, AlignRight,
    AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
    Merge, Split, Sigma,
} from 'lucide-react';
import type { CellTextAlign, CellVerticalAlign } from '../extensions/TableCellAttrs';
import { insertSumFormula } from '../extensions/TableFormulas';
import { setCellAlign, canMerge, canSplit, mergeSelectedCells, splitSelectedCell } from './tableCommands';

interface BarState {
    left: number;
    top: number;
    h: CellTextAlign | null;
    v: CellVerticalAlign | null;
    merge: boolean;
    split: boolean;
}

function cellAttrs(editor: Editor) {
    const a = editor.getAttributes('tableCell');
    const b = editor.getAttributes('tableHeader');
    const attrs = a.textAlign !== undefined || a.verticalAlign !== undefined ? a : b;
    return {
        h: (attrs.textAlign ?? null) as CellTextAlign | null,
        v: (attrs.verticalAlign ?? null) as CellVerticalAlign | null,
    };
}

function computeState(editor: Editor): BarState | null {
    if (!editor.isEditable || !editor.isActive('table')) return null;
    const sel = editor.state.selection;
    if (!sel.empty && !(sel instanceof CellSelection)) return null; // text selection: the text bubble menu owns it
    const from = sel instanceof CellSelection ? sel.$anchorCell.pos + 1 : sel.from;
    const dom = editor.view.domAtPos(from).node;
    const el = (dom instanceof Element ? dom : dom.parentElement)?.closest('td,th');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const { h, v } = cellAttrs(editor);
    return {
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 340)),
        top: Math.max(8, rect.top - 46),
        h, v,
        merge: canMerge(editor),
        split: canSplit(editor),
    };
}

interface BtnProps { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }

function Btn({ label, active, disabled, onClick, children }: BtnProps) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            disabled={disabled}
            // mouseDown keeps the editor selection (a click would move focus first)
            onMouseDown={(e) => { e.preventDefault(); if (!disabled) onClick(); }}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:opacity-30 ${active ? 'bg-t2-hover text-t2-ink' : 'text-t2-ink-2 hover:bg-t2-hover'}`}
        >
            {children}
        </button>
    );
}

const Sep = () => <span className="mx-1 h-[18px] w-px bg-t2-line" />;

export function TableCellBar({ editor }: { editor: Editor | null }) {
    const [state, setState] = useState<BarState | null>(null);

    const update = useCallback(() => {
        if (!editor || editor.isDestroyed) return;
        setState(computeState(editor));
    }, [editor]);

    useEffect(() => {
        if (!editor) return;
        editor.on('selectionUpdate', update);
        editor.on('transaction', update);
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            editor.off('selectionUpdate', update);
            editor.off('transaction', update);
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [editor, update]);

    if (!editor || !state) return null;
    const ic = 15;
    return (
        <div
            className="fixed z-[900] flex items-center gap-0.5 rounded-xl border border-t2-line bg-t2-surface p-[3px] shadow-lg"
            style={{ left: state.left, top: state.top, fontFamily: 'var(--font-menu)' }}
            onMouseDown={(e) => e.preventDefault()}
        >
            <Btn label="Linksbündig" active={state.h === 'left'} onClick={() => setCellAlign(editor, 'left')}><AlignLeft size={ic} /></Btn>
            <Btn label="Zentriert" active={state.h === 'center'} onClick={() => setCellAlign(editor, 'center')}><AlignCenter size={ic} /></Btn>
            <Btn label="Rechtsbündig" active={state.h === 'right'} onClick={() => setCellAlign(editor, 'right')}><AlignRight size={ic} /></Btn>
            <Sep />
            <Btn label="Oben" active={state.v === 'top'} onClick={() => setCellAlign(editor, undefined, 'top')}><AlignVerticalJustifyStart size={ic} /></Btn>
            <Btn label="Mittig" active={state.v === 'middle'} onClick={() => setCellAlign(editor, undefined, 'middle')}><AlignVerticalJustifyCenter size={ic} /></Btn>
            <Btn label="Unten" active={state.v === 'bottom'} onClick={() => setCellAlign(editor, undefined, 'bottom')}><AlignVerticalJustifyEnd size={ic} /></Btn>
            <Sep />
            <Btn label="Zellen verbinden" disabled={!state.merge} onClick={() => mergeSelectedCells(editor)}><Merge size={ic} /></Btn>
            <Btn label="Zelle teilen" disabled={!state.split} onClick={() => splitSelectedCell(editor)}><Split size={ic} /></Btn>
            <Sep />
            <Btn label="Summe einfügen" onClick={() => insertSumFormula(editor.view)}><Sigma size={ic} /></Btn>
        </div>
    );
}

export default TableCellBar;
