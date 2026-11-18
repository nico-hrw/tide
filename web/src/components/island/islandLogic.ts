/**
 * Reine Logik der Smart Island: Zustandsauswahl, Vorauswahl der Erfassungsart,
 * Wochenzeile, Countdown. Kein React, keine Stores (vollständig testbar).
 */
import { addDays, format, isSameDay, startOfDay } from 'date-fns';
import { parseGermanDate } from '@/lib/dateParser';
import { extractTimeFromText } from '@/lib/timeParser';
import { startOfCalendarWeek, type WeekStart } from '@/lib/calendarWeeks';

export type IslandState = 'rest' | 'running' | 'next' | 'day' | 'capture' | 'notice';
export type IslandLayout = 'desktop' | 'mobile';
export type CaptureKind = 'event' | 'note' | 'todo';

export interface IslandEvent {
    id: string;
    title: string;
    description: string;
    color?: string;
    start: Date;
    end: Date;
    allDay: boolean;
    done: boolean;
}

/** Struktur eingehender Kalendereinträge (Store-Einträge sind generisch). */
export interface RawIslandEvent {
    id: string;
    title?: string;
    description?: string;
    color?: string;
    start: string;
    end?: string;
    allDay?: boolean;
    is_all_day?: boolean;
    is_task?: boolean;
    is_cancelled?: boolean;
    is_completed?: boolean;
    isCompleted?: boolean;
}

/** Wandelt Rohdaten in Island-Termine; Todos, abgesagte und ungültige Einträge entfallen. */
export function toIslandEvents(list: readonly RawIslandEvent[]): IslandEvent[] {
    const out: IslandEvent[] = [];
    for (const e of list) {
        if (!e.start || e.is_task || e.is_cancelled) continue;
        const start = new Date(e.start);
        if (isNaN(start.getTime())) continue;
        const endRaw = e.end ? new Date(e.end) : null;
        const end = endRaw && !isNaN(endRaw.getTime()) ? endRaw : new Date(start.getTime() + 3600000);
        out.push({
            id: e.id,
            title: e.title ?? '',
            description: e.description ?? '',
            color: e.color,
            start,
            end,
            allDay: !!(e.allDay || e.is_all_day),
            done: !!(e.is_completed || e.isCompleted),
        });
    }
    return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Der Termin, der gerade läuft (frühester Start gewinnt). Ganztägige und erledigte zählen nicht. */
export function findRunning(events: readonly IslandEvent[], now: Date): IslandEvent | null {
    const t = now.getTime();
    for (const e of events) {
        if (e.allDay || e.done) continue;
        if (e.start.getTime() <= t && e.end.getTime() > t) return e;
    }
    return null;
}

/** Nächster Termin, der heute noch beginnt. */
export function findNext(events: readonly IslandEvent[], now: Date): IslandEvent | null {
    const t = now.getTime();
    for (const e of events) {
        if (e.allDay || e.done) continue;
        if (e.start.getTime() > t && isSameDay(e.start, now)) return e;
    }
    return null;
}

/** Termine eines Kalendertags, ganztägige zuerst, dann nach Start. */
export function eventsOnDay(events: readonly IslandEvent[], day: Date): IslandEvent[] {
    const from = startOfDay(day).getTime();
    const to = addDays(startOfDay(day), 1).getTime();
    return events
        .filter((e) => e.start.getTime() < to && e.end.getTime() > from)
        .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.getTime() - b.start.getTime());
}

export const dayKey = (d: Date): string => format(d, 'yyyy-MM-dd');

export interface WeekDay {
    date: Date;
    key: string;
    isToday: boolean;
    hasEvents: boolean;
}

/** Sieben Tage der Woche, in der `now` liegt, mit markiertem Heute. */
export function buildWeekRow(
    now: Date,
    weekStartsOn: WeekStart,
    eventDayKeys: ReadonlySet<string>
): WeekDay[] {
    const first = startOfCalendarWeek(now, weekStartsOn);
    return Array.from({ length: 7 }, (_, i) => {
        const date = addDays(first, i);
        const key = dayKey(date);
        return { date, key, isToday: isSameDay(date, now), hasEvents: eventDayKeys.has(key) };
    });
}

export interface PickInput {
    layout: IslandLayout;
    captureOpen: boolean;
    hasNotice: boolean;
    /** Vom Nutzer per Tippen gewählte Ansicht (null = automatisch). */
    view: IslandState | null;
    hasRunning: boolean;
    hasNext: boolean;
}

/** Wählt den anzuzeigenden Zustand. Erfassung vor Benachrichtigung vor Nutzerwahl vor Automatik. */
export function pickIslandState(i: PickInput): IslandState {
    if (i.captureOpen) return 'capture';
    if (i.hasNotice) return 'notice';
    if (i.view) return i.view;
    if (i.layout === 'mobile') {
        if (i.hasRunning) return 'running';
        if (i.hasNext) return 'next';
    }
    return 'rest';
}

/**
 * Nächster Zustand beim Tippen. `null` bedeutet: zurück zur Automatik bzw. schließen.
 * Desktop: Ruhe -> Fokus (laufend/nächster) -> Tag -> Ruhe. Handy: Fokus -> Tag -> Monat -> schließen.
 */
export function nextIslandState(
    current: IslandState,
    o: { layout: IslandLayout; hasRunning: boolean; hasNext: boolean }
): IslandState | null {
    switch (current) {
        case 'rest':
            if (o.layout === 'mobile') return null;
            return o.hasRunning ? 'running' : o.hasNext ? 'next' : 'day';
        case 'running':
        case 'next':
            return 'day';
        case 'day':
            return o.layout === 'mobile' ? 'rest' : null;
        default:
            return null;
    }
}

export interface Countdown {
    /** "9:05" (Min:Sek) oder "1:39" (Std:Min) */
    text: string;
    unit: 'min' | 'hrs';
    /** Aufgerundete Minuten (für das kompakte Handy-Quadrat) */
    minutes: number;
}

const two = (n: number) => String(n).padStart(2, '0');

export function formatCountdown(ms: number): Countdown {
    const safe = Math.max(0, ms);
    const totalSec = Math.floor(safe / 1000);
    const minutes = Math.max(1, Math.ceil(safe / 60000));
    if (totalSec >= 3600) {
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        return { text: `${h}:${two(m)}`, unit: 'hrs', minutes };
    }
    return { text: `${Math.floor(totalSec / 60)}:${two(totalSec % 60)}`, unit: 'min', minutes };
}

/** Anteil (0..1) des Termins, der bereits vergangen ist. */
export function progressOf(e: Pick<IslandEvent, 'start' | 'end'>, now: Date): number {
    const total = e.end.getTime() - e.start.getTime();
    if (total <= 0) return 1;
    return Math.min(1, Math.max(0, (now.getTime() - e.start.getTime()) / total));
}

// ── Schnell-Erfassung ─────────────────────────────────────────────────────────

export interface CaptureDetection {
    kind: CaptureKind;
    reason: 'time' | 'date' | 'todo' | 'none';
    title: string;
    /** Erkannter Tag (nur bei Termin/Todo mit Datum) */
    date: Date | null;
    startMins: number | null;
    endMins: number | null;
}

/** Nur eindeutige Uhrzeiten ("14:30", "14.30", "14 Uhr", "2pm"); lose Zahlen ("2 Brote") zählen nicht. */
const EXPLICIT_TIME = /\b(?:[01]?\d|2[0-3])[:.][0-5]\d\b|\b(?:[01]?\d|2[0-3])\s*(?:uhr|am|pm)\b/i;

const TODO_CUES =
    /\b(?:todo|to-do|aufgabe|task|kaufen|einkaufen|besorgen|erledigen|anrufen|abgeben|bezahlen|buchen|bestellen|schicken|senden|zurückrufen|nachfragen|vorbereiten|putzen|abholen|überweisen|buy|call|send|finish|pay|order)\b/i;

export function detectCapture(text: string, now: Date = new Date()): CaptureDetection {
    const trimmed = text.trim();
    const base = { title: trimmed, date: null as Date | null, startMins: null as number | null, endMins: null as number | null };
    if (!trimmed) return { kind: 'note', reason: 'none', ...base };

    const parsed = parseGermanDate(trimmed, now)[0];
    const timeHit = EXPLICIT_TIME.test(trimmed) ? extractTimeFromText(trimmed) : null;

    if (parsed || timeHit) {
        // Titel: der Text ohne die erkannte Datums-/Zeit-Passage (der Titelvorschlag des Parsers ist zu knapp)
        const stripped = parsed
            ? `${trimmed.slice(0, parsed.span[0])} ${trimmed.slice(parsed.span[1])}`.replace(/\s+/g, ' ').trim()
            : '';
        let title = stripped || parsed?.titleHint || timeHit?.title || trimmed;
        const startMins = parsed
            ? parsed.proposedStart.getHours() * 60 + parsed.proposedStart.getMinutes()
            : timeHit?.startMins ?? null;
        const endMins = parsed
            ? parsed.proposedEnd.getHours() * 60 + parsed.proposedEnd.getMinutes()
            : timeHit?.endMins ?? null;
        if (!title.trim()) title = trimmed;
        const hasTime = !!timeHit || (parsed?.allTokens.length ?? 0) > 1;
        return {
            kind: 'event',
            reason: hasTime ? 'time' : 'date',
            title,
            date: parsed ? startOfDay(parsed.proposedDate) : startOfDay(now),
            startMins,
            endMins,
        };
    }
    if (TODO_CUES.test(trimmed)) return { kind: 'todo', reason: 'todo', ...base };
    return { kind: 'note', reason: 'none', ...base };
}

/** Beginn und Ende (Datum + Minuten) für den Termin, der aus einer Erfassung entsteht. */
export function resolveCaptureTimes(d: CaptureDetection, now: Date): { start: Date; end: Date } {
    const day = d.date ?? startOfDay(now);
    let startMins = d.startMins;
    let endMins = d.endMins;
    if (startMins === null) {
        // Ohne Uhrzeit: nächste volle Stunde (heute) bzw. 09:00 (anderer Tag)
        startMins = isSameDay(day, now) ? Math.min(23, now.getHours() + 1) * 60 : 9 * 60;
    }
    if (endMins === null || endMins <= startMins) endMins = Math.min(startMins + 60, 24 * 60 - 1);
    const at = (mins: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(mins / 60), mins % 60);
    return { start: at(startMins), end: at(endMins) };
}

/** Titel einer Notiz: erste Zeile, auf 80 Zeichen gekürzt. */
export function noteTitleOf(text: string): string {
    const first = text.trim().split('\n')[0] ?? '';
    return first.length > 80 ? `${first.slice(0, 79)}…` : first;
}
