'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDataStore, useCalendarEvents, useWeekStartsOn } from '@/store/useDataStore';
import { useIslandSettingsStore } from '@/store/useIslandSettingsStore';
import { useIslandStore, type IslandView } from '@/components/extensions/smart_island/useIslandStore';
import { getEventsForDate, type CalendarEvent } from '@/lib/calendarUtils';
import {
    buildWeekRow,
    dayKey,
    eventsOnDay,
    findNext,
    findRunning,
    formatCountdown,
    nextIslandState,
    pickIslandState,
    progressOf,
    toIslandEvents,
    type Countdown,
    type CaptureKind,
    type IslandEvent,
    type IslandLayout,
    type IslandState,
    type RawIslandEvent,
    type WeekDay,
} from './islandLogic';
import { useIslandCapture, type CaptureResult, type CaptureSuggestion, type IslandCapture } from './useIslandCapture';
import type { EventSuggestionPayload } from './islandTypes';

/** Inhalt einer Benachrichtigung (aus der Island-Warteschlange oder einer Bestätigung). */
export interface IslandNotice {
    id: string;
    kind: 'message' | 'file' | 'reminder' | 'confirm';
    /** Überschrift (Absender, Dateiname, Terminname, ...) */
    title: string;
    body: string;
    /** Farbe des Termins bei Erinnerungen */
    color?: string;
    onAction?: () => void;
    /** Nur bei Bestätigungen: was angelegt wurde und für wann */
    resultKind?: CaptureKind;
    when?: Date | null;
    /** Zusatz-Label, z. B. "Beginnt gleich" */
    labelKey?: 'noticeNew' | 'noticeSoon' | 'noticeShared';
}

export interface IslandModel {
    layout: IslandLayout;
    state: IslandState;
    /** Desktop: Karte statt Quadrat; Handy: Karte statt Quadrat (per Tippen geöffnet) */
    expanded: boolean;
    now: Date;
    running: { event: IslandEvent; countdown: Countdown; progress: number } | null;
    next: { event: IslandEvent; countdown: Countdown } | null;
    /** Termin danach (für "danach X um Y" im laufenden Zustand) */
    following: IslandEvent | null;
    week: WeekDay[];
    agenda: IslandEvent[];
    notice: IslandNotice | null;
    /** Benachrichtigung ist da, soll aber nicht automatisch aufgehen (Einstellung) */
    noticeCollapsed: boolean;
    capture: IslandCapture;
    tap: () => void;
    close: () => void;
    openCapture: () => void;
    dismissNotice: () => void;
}

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function noticeFromView(view: IslandView | null): IslandNotice | null {
    if (!view) return null;
    const p = asRecord(view.payload);
    switch (view.type) {
        case 'message':
            return { id: view.id, kind: 'message', title: str(p.senderName), body: str(p.text), labelKey: 'noticeNew' };
        case 'interactive_card':
            return {
                id: view.id,
                kind: 'file',
                title: str(p.fileName),
                body: str(p.noteSharedText) || str(p.senderName),
                onAction: typeof p.onAction === 'function' ? (p.onAction as () => void) : undefined,
                labelKey: 'noticeShared',
            };
        case 'reminder': {
            const ev = asRecord(p.event);
            const start = new Date(str(ev.start));
            const time = isNaN(start.getTime()) ? '' : start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return {
                id: view.id,
                kind: 'reminder',
                title: str(ev.title),
                body: [time, str(ev.description)].filter(Boolean).join(' · '),
                color: str(ev.color) || undefined,
                labelKey: 'noticeSoon',
            };
        }
        default:
            return null;
    }
}

export function useIslandModel(layout: IslandLayout): IslandModel {
    const { events: storeEvents } = useCalendarEvents();
    const weekStartsOn = useWeekStartsOn();
    const expandOnNotification = useIslandSettingsStore((s) => s.expandOnNotification);
    const smartIslandState = useDataStore((s) => s.smartIslandState);
    const setSmartIsland = useDataStore((s) => s.setSmartIsland);
    const { state: queue, dismiss } = useIslandStore();

    const [now, setNow] = useState<Date>(() => new Date());
    const [view, setView] = useState<IslandState | null>(null);
    const [open, setOpen] = useState(false);
    const [confirmNotice, setConfirmNotice] = useState<IslandNotice | null>(null);

    // ── Tag, Woche, Termine ──────────────────────────────────────────────
    const todayKey = dayKey(now);
    const raw = storeEvents as unknown as CalendarEvent[];
    const { today, weekKeys } = useMemo(() => {
        const base = new Date();
        const all = toIslandEvents(getEventsForDate(base, raw) as unknown as RawIslandEvent[]);
        const keys = new Set<string>();
        const first = buildWeekRow(base, weekStartsOn, keys);
        for (const d of first) {
            if (getEventsForDate(d.date, raw).length > 0) keys.add(d.key);
        }
        return { today: eventsOnDay(all, base), weekKeys: keys };
        // todayKey ändert sich nur um Mitternacht
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [raw, weekStartsOn, todayKey]);

    const runningEvent = useMemo(() => findRunning(today, now), [today, now]);
    const nextEvent = useMemo(() => findNext(today, now), [today, now]);
    const week = useMemo(() => buildWeekRow(now, weekStartsOn, weekKeys), [now, weekStartsOn, weekKeys]);

    const following = useMemo(() => {
        if (!runningEvent) return null;
        return today.find((e) => !e.allDay && !e.done && e.start.getTime() >= runningEvent.end.getTime()) ?? null;
    }, [today, runningEvent]);

    // ── Benachrichtigung ────────────────────────────────────────────────
    const queueNotice = useMemo(() => noticeFromView(queue.current), [queue.current]); // eslint-disable-line react-hooks/exhaustive-deps
    const notice = confirmNotice ?? queueNotice;

    // ── Erfassung ───────────────────────────────────────────────────────
    const finishRef = useRef<() => void>(() => undefined);
    const capture = useIslandCapture(now, useCallback(() => finishRef.current(), []));
    const captureStart = capture.start;

    const resetView = useCallback(() => {
        setView(null);
        setOpen(false);
    }, []);
    finishRef.current = resetView;

    // Markierter Text im Editor ("Smart Island"-Knopf) öffnet die Erfassung
    useEffect(() => {
        if (!smartIslandState?.show) return;
        captureStart(smartIslandState.text ?? '', null, !!smartIslandState.searchFirst);
        setOpen(true);
        setSmartIsland(null);
    }, [smartIslandState, setSmartIsland, captureStart]);

    // Termin-Vorschlag aus der Datumserkennung im Editor
    const suggestionId = useRef<string | null>(null);
    useEffect(() => {
        const cur = queue.current;
        if (cur?.type !== 'event_suggestion' || suggestionId.current === cur.id) return;
        suggestionId.current = cur.id;
        const pl = cur.payload as unknown as EventSuggestionPayload;
        const sug: CaptureSuggestion = {
            start: pl.parseResult.proposedStart,
            end: pl.parseResult.proposedEnd,
            onAccept: (final) => {
                pl.onAccept(final);
                dismiss();
            },
            onDismiss: () => {
                pl.onDismiss();
                dismiss();
            },
        };
        captureStart(pl.parseResult.titleHint || '', sug);
        setOpen(true);
    }, [queue.current, captureStart, dismiss]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Zustand ────────────────────────────────────────────────────────
    const state = pickIslandState({
        layout,
        captureOpen: capture.open,
        hasNotice: !!notice,
        view,
        hasRunning: !!runningEvent,
        hasNext: !!nextEvent,
    });

    const noticeCollapsed = state === 'notice' && !expandOnNotification && !open && notice?.kind !== 'confirm';
    const expanded =
        state === 'capture' || (state === 'notice' ? !noticeCollapsed : layout === 'desktop' ? state !== 'rest' : open);

    // Uhr: Sekundentakt nur, solange ein Countdown sichtbar ist
    const needsSeconds = expanded && (state === 'running' || state === 'next');
    useEffect(() => {
        setNow(new Date());
        const t = setInterval(() => setNow(new Date()), needsSeconds ? 1000 : 15000);
        return () => clearInterval(t);
    }, [needsSeconds]);

    const dismissNotice = useCallback(() => {
        if (confirmNotice) setConfirmNotice(null);
        else if (queueNotice) dismiss();
    }, [confirmNotice, queueNotice, dismiss]);

    // Bestätigungs-Karte nach dem Anlegen verschwindet von selbst
    useEffect(() => {
        if (!confirmNotice) return;
        const t = setTimeout(() => setConfirmNotice(null), 4500);
        return () => clearTimeout(t);
    }, [confirmNotice]);

    const close = useCallback(() => {
        if (capture.open) capture.cancel();
        dismissNotice();
        resetView();
    }, [capture, dismissNotice, resetView]);

    const tap = useCallback(() => {
        if (state === 'capture') return;
        if (state === 'notice') {
            if (noticeCollapsed || !notice) {
                setOpen(true);
                return;
            }
            dismissNotice();
            resetView();
            return;
        }
        if (layout === 'mobile' && !open) {
            setOpen(true);
            return;
        }
        const next = nextIslandState(state, { layout, hasRunning: !!runningEvent, hasNext: !!nextEvent });
        if (next === null) resetView();
        else setView(next);
    }, [state, layout, open, notice, noticeCollapsed, runningEvent, nextEvent, dismissNotice, resetView]);

    const openCapture = useCallback(() => {
        capture.start('');
        setOpen(true);
    }, [capture]);

    // Bestätigung: "Anlegen" liefert ein Ergebnis, das als Karte gezeigt wird
    const confirmCapture = capture.confirm;
    const wrappedCapture = useMemo<IslandCapture>(
        () => ({
            ...capture,
            confirm: async (): Promise<CaptureResult | null> => {
                const r = await confirmCapture();
                if (r) {
                    setConfirmNotice(noticeFromResult(r));
                    setOpen(true);
                }
                return r;
            },
        }),
        [capture, confirmCapture]
    );

    return {
        layout,
        state,
        expanded,
        now,
        running: runningEvent
            ? { event: runningEvent, countdown: formatCountdown(runningEvent.end.getTime() - now.getTime()), progress: progressOf(runningEvent, now) }
            : null,
        next: nextEvent ? { event: nextEvent, countdown: formatCountdown(nextEvent.start.getTime() - now.getTime()) } : null,
        following,
        week,
        agenda: today,
        notice,
        noticeCollapsed,
        capture: wrappedCapture,
        tap,
        close,
        openCapture,
        dismissNotice,
    };
}

function noticeFromResult(r: CaptureResult): IslandNotice {
    return {
        id: `confirm_${Date.now()}`,
        kind: 'confirm',
        title: r.title,
        body: '',
        resultKind: r.kind,
        when: r.when,
        labelKey: 'noticeNew',
    };
}
