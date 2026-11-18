'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { useDataStore } from '@/store/useDataStore';
import { useIslandActionsStore } from '@/store/useIslandActionsStore';
import { detectCapture, noteTitleOf, resolveCaptureTimes, type CaptureDetection, type CaptureKind } from './islandLogic';

/** Ergebnis einer Erfassung, wird als ruhige Bestätigungs-Karte gezeigt. */
export interface CaptureResult {
    kind: CaptureKind;
    title: string;
    when: Date | null;
}

/** Vorschlag aus der Datumserkennung im Editor (Termin mit festen Zeiten). */
export interface CaptureSuggestion {
    start: Date;
    end: Date;
    onAccept: (final: { title: string; start: Date; end: Date }) => void;
    onDismiss: () => void;
}

export interface IslandCapture {
    open: boolean;
    text: string;
    setText: (t: string) => void;
    detection: CaptureDetection;
    kind: CaptureKind;
    /** true, sobald der Nutzer die Art selbst gewählt hat */
    chosen: boolean;
    /** Kommt aus der Datumserkennung im Editor (Fokus darf nicht gestohlen werden) */
    fromSuggestion: boolean;
    setKind: (k: CaptureKind) => void;
    /** Start/Ende des Termins, der angelegt würde */
    times: { start: Date; end: Date };
    start: (text?: string, suggestion?: CaptureSuggestion | null) => void;
    cancel: () => void;
    confirm: () => Promise<CaptureResult | null>;
    edit: () => void;
}

export function useIslandCapture(now: Date, onFinish: () => void): IslandCapture {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    const [override, setOverride] = useState<CaptureKind | null>(null);
    const suggestionRef = useRef<CaptureSuggestion | null>(null);

    const detection = useMemo(() => detectCapture(text, now), [text, now]);
    const kind = override ?? (suggestionRef.current ? 'event' : detection.kind);
    const times = useMemo(() => {
        const s = suggestionRef.current;
        return s ? { start: s.start, end: s.end } : resolveCaptureTimes(detection, now);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [detection, now, open]);

    const reset = useCallback(() => {
        setOpen(false);
        setText('');
        setOverride(null);
        suggestionRef.current = null;
    }, []);

    const start = useCallback((initial = '', suggestion: CaptureSuggestion | null = null) => {
        suggestionRef.current = suggestion;
        setText(initial);
        setOverride(null);
        setOpen(true);
    }, []);

    const cancel = useCallback(() => {
        suggestionRef.current?.onDismiss();
        reset();
        onFinish();
    }, [reset, onFinish]);

    const titleFor = useCallback(
        (k: CaptureKind): string => {
            if (k === 'event') return (suggestionRef.current ? text.trim() : detection.title).trim() || text.trim();
            return k === 'note' ? noteTitleOf(text) : text.trim();
        },
        [text, detection.title]
    );

    const confirm = useCallback(async (): Promise<CaptureResult | null> => {
        const body = text.trim();
        if (!body) return null;
        const title = titleFor(kind);
        const data = useDataStore.getState();
        let result: CaptureResult;

        if (kind === 'event') {
            const { start: s, end: e } = times;
            const sug = suggestionRef.current;
            if (sug) {
                sug.onAccept({ title, start: s, end: e });
            } else {
                const create = useIslandActionsStore.getState().createEvent;
                const id = create ? await create(s, e, title) : null;
                if (!id) return null;
            }
            result = { kind, title, when: s };
        } else if (kind === 'note') {
            await data.createNote(title, {
                type: 'doc',
                content: body.split('\n').map((line) => ({
                    type: 'paragraph',
                    attrs: { blockId: crypto.randomUUID() },
                    content: line ? [{ type: 'text', text: line }] : undefined,
                })),
            });
            void data.fetchDirectory(null, true);
            result = { kind, title, when: null };
        } else {
            const day = detection.date ?? now;
            await data.addTask({ title, isCompleted: false, dueDate: format(day, 'yyyy-MM-dd') });
            result = { kind, title, when: day };
        }
        suggestionRef.current = null;
        reset();
        return result;
    }, [text, kind, times, detection.date, now, titleFor, reset]);

    const edit = useCallback(() => {
        const edit = useIslandActionsStore.getState().editEvent;
        edit?.(times.start, times.end, titleFor('event'));
        suggestionRef.current?.onDismiss();
        reset();
        onFinish();
    }, [times, titleFor, reset, onFinish]);

    return {
        open,
        text,
        setText,
        detection,
        kind,
        chosen: override !== null,
        fromSuggestion: suggestionRef.current !== null,
        setKind: setOverride,
        times,
        start,
        cancel,
        confirm,
        edit,
    };
}
