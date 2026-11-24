'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import NoteIcon from '@/components/Icons/NoteIcon';
import { Calendar, FileText, SquareCheck } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { useIslandActionsStore } from '@/store/useIslandActionsStore';
import type { CaptureKind } from './islandLogic';
import { buildIslandSearchItems, nextSelection, searchIslandItems, type IslandSearchItem, type IslandSearchKind } from './islandSearch';
import type { IslandModel } from './useIslandModel';
import type { IslandText } from './islandText';
import { CardLabel, CloseButton } from './IslandViews';

const KINDS: { kind: CaptureKind; labelKey: string; Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }> }[] = [
    { kind: 'event', labelKey: 'kindEvent', Icon: Calendar },
    { kind: 'note', labelKey: 'kindNote', Icon: NoteIcon },
    { kind: 'todo', labelKey: 'kindTodo', Icon: SquareCheck },
];

const RESULT_ICON: Record<IslandSearchKind, typeof Calendar> = { event: Calendar, note: FileText, todo: SquareCheck };
const RESULT_TYPE: Record<IslandSearchKind, string> = { event: 'event', note: 'file', todo: 'task' };

function hintAndChips(model: IslandModel, text: IslandText): { hint: string; chips: string[] } {
    const { capture } = model;
    const { detection, kind, chosen, times } = capture;
    const empty = !capture.text.trim();
    if (empty) return { hint: '', chips: [] };
    const hint = chosen && kind !== detection.kind
        ? text.tr('hintChosen')
        : detection.reason === 'time'
          ? text.tr('hintTime', { v: text.time(times.start) })
          : detection.reason === 'date'
            ? text.tr('hintDate', { v: text.shortDay(times.start) })
            : detection.reason === 'todo'
              ? text.tr('hintTodo')
              : text.tr('hintNone');
    if (kind === 'event') {
        return { hint, chips: [text.shortDay(times.start), text.range(times.start, times.end)] };
    }
    if (kind === 'note') return { hint, chips: [text.tr('chipNewNote')] };
    return { hint, chips: [detection.date ? text.shortDay(detection.date) : text.tr('chipToday')] };
}

/** Schnell-Erfassung: Text, drei Arten (Termin/Notiz/Todo) mit Tooltip, Anlegen oder Bearbeiten. */
export default function IslandCapture({ model, text }: { model: IslandModel; text: IslandText }) {
    const { capture } = model;
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const { hint, chips } = hintAndChips(model, text);
    const canCreate = capture.text.trim().length > 0;

    // Typing anywhere: search notes, events and todos first; creating is the last row
    const notes = useDataStore((s) => s.notes);
    const events = useDataStore((s) => s.events);
    const tasks = useDataStore((s) => s.tasks);
    const searching = capture.searchFirst && canCreate;
    const items = useMemo(
        () => (capture.searchFirst ? buildIslandSearchItems({ notes, events, tasks }) : []),
        [capture.searchFirst, notes, events, tasks]
    );
    const results = useMemo(() => (searching ? searchIslandItems(items, capture.text) : []), [searching, items, capture.text]);
    // The highlighted row belongs to the text it was chosen for: typing resets it to the first result
    const [picked, setPicked] = useState({ text: '', idx: 0 });
    const sel = picked.text === capture.text ? picked.idx : 0;
    const setSel = (idx: number) => setPicked({ text: capture.text, idx });
    const createRowActive = sel >= results.length;

    const openResult = (r: IslandSearchItem) => {
        useIslandActionsStore.getState().openItem?.({ id: r.id, type: RESULT_TYPE[r.kind], title: r.title });
        model.close();
    };

    const skipFocus = capture.fromSuggestion;
    useEffect(() => {
        if (skipFocus) return;
        const id = requestAnimationFrame(() => {
            const el = inputRef.current;
            if (!el) return;
            el.focus();
            // Text typed before the field existed (type-anywhere capture) is already in it: continue after it
            el.setSelectionRange(el.value.length, el.value.length);
        });
        return () => cancelAnimationFrame(id);
    }, [skipFocus]);

    return (
        <div className="px-4 pb-4 pt-3.5" onClick={(e) => e.stopPropagation()}>
            <CardLabel right={<CloseButton label={text.tr('close')} onClick={model.close} />}>
                {text.tr('quickCapture')}
            </CardLabel>
            <textarea
                ref={inputRef}
                value={capture.text}
                rows={2}
                onChange={(e) => capture.setText(e.target.value)}
                onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return;
                    if (searching && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                        e.preventDefault();
                        setSel(nextSelection(sel, results.length, e.key === 'ArrowDown' ? 1 : -1));
                    } else if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        const open = searching && !createRowActive && !(e.metaKey || e.ctrlKey);
                        if (open) openResult(results[sel]);
                        else if (canCreate) void capture.confirm();
                    }
                }}
                placeholder={text.tr('capturePlaceholder')}
                aria-label={text.tr('quickCapture')}
                className="mt-2.5 block w-full resize-none rounded-xl bg-t2-sub px-3 py-2.5 text-[13.5px] leading-[1.35] text-t2-ink shadow-[inset_0_0_0_1px_var(--t2-line)] outline-none placeholder:text-t2-ink-3 hover:shadow-[inset_0_0_0_1px_var(--t2-ink-3)] focus:shadow-[inset_0_0_0_1px_var(--t2-ink-3)]"
            />
            {searching && (
                <div className="mt-2.5" role="listbox" aria-label={text.tr('searchResults')}>
                    {results.length === 0 && <div className="px-1 pb-1 text-[12px] text-t2-ink-3">{text.tr('searchNone')}</div>}
                    {results.map((r, i) => {
                        const Icon = RESULT_ICON[r.kind];
                        return (
                            <button
                                key={`${r.kind}-${r.id}`}
                                type="button"
                                role="option"
                                aria-selected={i === sel}
                                onMouseEnter={() => setSel(i)}
                                onClick={() => openResult(r)}
                                className={`flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left text-[13px] text-t2-ink ${i === sel ? 'bg-t2-hover' : ''}`}
                            >
                                <Icon size={14} strokeWidth={1.8} className="shrink-0 text-t2-ink-3" />
                                <span className="min-w-0 flex-1 truncate">{r.title || text.tr(r.kind === 'event' ? 'kindEvent' : r.kind === 'note' ? 'kindNote' : 'kindTodo')}</span>
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        role="option"
                        aria-selected={createRowActive}
                        onMouseEnter={() => setSel(results.length)}
                        onClick={() => void capture.confirm()}
                        className={`mt-0.5 flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left text-[12.5px] text-t2-ink-2 ${createRowActive ? 'bg-t2-hover' : ''}`}
                    >
                        <span className="min-w-0 flex-1 truncate">{text.tr('createRow', { title: capture.text.trim() })}</span>
                    </button>
                </div>
            )}
            <div className="mt-2.5 flex gap-1.5" role="radiogroup" aria-label={text.tr('captureWhat')}>
                {KINDS.map(({ kind, labelKey, Icon }) => {
                    const active = capture.kind === kind;
                    return (
                        <button
                            key={kind}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            aria-label={text.tr(labelKey)}
                            onClick={() => capture.setKind(kind)}
                            className={`group relative flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-[10px] px-2 text-[12.5px] font-semibold ${
                                active
                                    ? 'bg-t2-accent text-t2-accent-ink'
                                    : 'text-t2-ink-2 shadow-[inset_0_0_0_1px_var(--t2-line)] hover:bg-t2-hover hover:text-t2-ink'
                            }`}
                        >
                            <Icon size={16} strokeWidth={1.8} />
                            {active && text.tr(labelKey)}
                            {!active && (
                                <span className="pointer-events-none absolute bottom-[calc(100%+7px)] left-1/2 -translate-x-1/2 translate-y-[3px] whitespace-nowrap rounded-[7px] bg-t2-ink px-2 py-[3px] text-[11.5px] font-medium text-t2-bg opacity-0 transition-[opacity,transform] duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 motion-reduce:transition-none">
                                    {text.tr(labelKey)}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
            <div className="mt-2.5 min-h-[58px] text-[12px] text-t2-ink-3">
                <span>{hint}</span>
                <div className="mt-1.5 flex flex-wrap gap-[5px]">
                    {chips.map((c) => (
                        <span key={c} className="rounded-full bg-t2-sub px-2 py-0.5 text-[12px] text-t2-ink-2 shadow-[inset_0_0_0_1px_var(--t2-line)]">
                            {c}
                        </span>
                    ))}
                </div>
            </div>
            <div className="flex gap-1.5">
                <button
                    type="button"
                    disabled={!canCreate}
                    onClick={() => void capture.confirm()}
                    className="flex-1 whitespace-nowrap rounded-[10px] bg-t2-accent px-2.5 py-2 text-[13px] font-semibold text-t2-accent-ink hover:opacity-90 disabled:opacity-40"
                >
                    {text.tr('create')}
                </button>
                {capture.kind === 'event' && (
                    <button
                        type="button"
                        disabled={!canCreate}
                        onClick={capture.edit}
                        className="flex-1 whitespace-nowrap rounded-[10px] px-2.5 py-2 text-[13px] font-semibold text-t2-ink shadow-[inset_0_0_0_1px_var(--t2-line)] hover:bg-t2-hover disabled:opacity-40"
                    >
                        {text.tr('edit')}
                    </button>
                )}
            </div>
        </div>
    );
}
