// Human-readable companions in the archive (read-only; the importer uses tree.json, not these):
// notes as Markdown in their folder structure, events as one .ics file, todos as Markdown.

import type { TaskItem } from '@/store/useDataStore';
import { tipTapToMarkdown } from '@/lib/bundleImportExport';
import type { VaultFileRecord } from './types';

const UNSAFE = /[\\/:*?"<>|\u0000-\u001f]/g;

export function safeName(title: string, fallback: string): string {
    const clean = title.replace(UNSAFE, '_').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
    return (clean || fallback).slice(0, 80);
}

/** Folder path (with trailing slash, "" for root) of a file, built from its parent chain. */
export function folderPathOf(file: VaultFileRecord, byId: Map<string, VaultFileRecord>): string {
    const names: string[] = [];
    const seen = new Set<string>([file.id]);
    let parent = file.parentId ? byId.get(file.parentId) : undefined;
    while (parent && !seen.has(parent.id)) {
        seen.add(parent.id);
        if (parent.type === 'folder') names.unshift(safeName(parent.title, 'Ordner'));
        parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    return names.length ? `${names.join('/')}/` : '';
}

/** Markdown for a note's editor JSON; null when the content is not an editor document. */
export function noteToMarkdown(title: string, contentText: string): string | null {
    try {
        const doc = JSON.parse(contentText) as unknown;
        if (!doc || typeof doc !== 'object' || (doc as { type?: string }).type !== 'doc') return null;
        return tipTapToMarkdown(doc, title);
    } catch {
        return null;
    }
}

function icsEscape(text: string): string {
    return text.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

/** Folds a content line at 75 octets as RFC 5545 requires. */
function fold(line: string): string {
    const bytes = new TextEncoder().encode(line);
    if (bytes.length <= 75) return line;
    const out: string[] = [];
    let current = '';
    let size = 0;
    for (const ch of line) {
        const n = new TextEncoder().encode(ch).length;
        if (size + n > (out.length === 0 ? 75 : 74)) {
            out.push(current);
            current = '';
            size = 0;
        }
        current += ch;
        size += n;
    }
    out.push(current);
    return out.join('\r\n ');
}

const p2 = (n: number) => String(n).padStart(2, '0');
const dateValue = (d: Date) => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
const utcValue = (d: Date) =>
    `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`;

function icsDate(iso: string, allDay: boolean): string | null {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return allDay ? `;VALUE=DATE:${dateValue(d)}` : `:${utcValue(d)}`;
}

/** All-day DTEND is exclusive in iCalendar: the day after the last day, never before start + 1 day. */
function allDayEnd(startIso: string, endIso: string): string | null {
    const s = new Date(startIso);
    const e = new Date(endIso || startIso);
    if (Number.isNaN(s.getTime())) return null;
    const last = Number.isNaN(e.getTime()) || e < s ? s : e;
    const next = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
    return `;VALUE=DATE:${dateValue(next)}`;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : []);
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})/;

/** Start of the occurrence on the given local day key (yyyy-MM-dd), at the series' local start time. */
function occurrenceAt(start: Date, key: string): Date | null {
    const m = DAY_KEY.exec(key);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), start.getHours(), start.getMinutes(), start.getSeconds());
}

/** UNTIL from the app's separate `recurrence_end` when the rule has no end of its own. */
function ruleWithEnd(rule: string, recurrenceEnd: string, allDay: boolean): string {
    if (!rule || /(^|;)(UNTIL|COUNT)=/i.test(rule) || !recurrenceEnd) return rule;
    const m = DAY_KEY.exec(recurrenceEnd);
    const end = recurrenceEnd.length <= 10 && m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59) : new Date(recurrenceEnd);
    if (Number.isNaN(end.getTime())) return rule;
    return `${rule};UNTIL=${allDay ? dateValue(end) : utcValue(end)}`;
}

/** Merged view of an event record: plaintext meta, metadata, secured meta and decrypted body. */
export function eventFields(file: VaultFileRecord, contentText?: string): Record<string, unknown> {
    let body: Record<string, unknown> = {};
    if (contentText) {
        try {
            const parsed = JSON.parse(contentText) as unknown;
            if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
        } catch {
            /* body stays empty */
        }
    }
    // Plain `metadata` is the full, current record (secured_meta holds a possibly shortened title, the blob may be
    // older than an update through the external API); the blob only fills fields that are missing or empty.
    const merged: Record<string, unknown> = { ...(file.securedMeta ?? {}), ...file.publicMeta, ...file.metadata };
    for (const [k, v] of Object.entries(body)) {
        if (merged[k] === undefined || merged[k] === null || merged[k] === '') merged[k] = v;
    }
    return merged;
}

/**
 * VEVENTs of one event; empty when it has no usable start. Recurrence: RRULE (with `recurrence_end` as UNTIL),
 * `removed_dates` as EXDATE (the occurrence does not exist), cancelled occurrences (`exdates`) as overrides with
 * STATUS:CANCELLED. Tags (`groupIds`, else `parent_id`) become CATEGORIES.
 */
function eventToIcs(file: VaultFileRecord, contentText: string | undefined, stamp: string, tagTitle?: (id: string) => string | undefined): string[] {
    const f = eventFields(file, contentText);
    const allDay = f.allDay === true || f.all_day === true;
    const startIso = str(f.start);
    const start = icsDate(startIso, allDay);
    if (!start) return [];
    const end = allDay ? allDayEnd(startIso, str(f.end)) : icsDate(str(f.end) || startIso, false);
    const uid = `UID:${file.id}@tide-export`;
    const summary = `SUMMARY:${icsEscape(str(f.title) || file.title)}`;
    const lines = ['BEGIN:VEVENT', uid, `DTSTAMP:${stamp}`, `DTSTART${start}`];
    if (end) lines.push(`DTEND${end}`);
    lines.push(summary);
    if (str(f.description)) lines.push(`DESCRIPTION:${icsEscape(str(f.description))}`);
    if (str(f.location)) lines.push(`LOCATION:${icsEscape(str(f.location))}`);
    const tagIds = strList(f.groupIds).length > 0 ? strList(f.groupIds) : file.parentId ? [file.parentId] : [];
    const tags = tagIds.map((id) => tagTitle?.(id)).filter((t): t is string => !!t);
    if (tags.length > 0) lines.push(`CATEGORIES:${tags.map(icsEscape).join(',')}`);
    if (str(f.color)) lines.push(`X-TIDE-COLOR:${icsEscape(str(f.color))}`);
    const rule = ruleWithEnd(str(f.recurrence_rule).replace(/^RRULE:/i, ''), str(f.recurrence_end), allDay);
    const startDate = new Date(startIso);
    const occ = (key: string): string | null => {
        const d = occurrenceAt(startDate, key);
        return d ? (allDay ? `;VALUE=DATE:${dateValue(d)}` : `:${utcValue(d)}`) : null;
    };
    if (rule) {
        lines.push(`RRULE:${rule}`);
        for (const key of strList(f.removed_dates)) {
            const v = occ(key);
            if (v) lines.push(`EXDATE${v}`);
        }
    }
    if (f.is_cancelled === true) lines.push('STATUS:CANCELLED');
    lines.push('END:VEVENT');
    if (rule) {
        const duration = new Date(str(f.end) || startIso).getTime() - startDate.getTime();
        for (const key of strList(f.exdates)) {
            const at = occurrenceAt(startDate, key);
            if (!at || strList(f.removed_dates).includes(key)) continue;
            const v = occ(key)!;
            const endAt = allDay ? new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1) : new Date(at.getTime() + Math.max(0, duration || 0));
            lines.push('BEGIN:VEVENT', uid, `DTSTAMP:${stamp}`, `RECURRENCE-ID${v}`, `DTSTART${v}`,
                `DTEND${allDay ? `;VALUE=DATE:${dateValue(endAt)}` : `:${utcValue(endAt)}`}`, summary, 'STATUS:CANCELLED', 'END:VEVENT');
        }
    }
    return lines;
}

export function eventsToIcs(
    items: Array<{ file: VaultFileRecord; contentText?: string }>,
    now = new Date(),
    tagTitle?: (id: string) => string | undefined,
): string {
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tide//Vault Export//DE', 'CALSCALE:GREGORIAN'];
    for (const { file, contentText } of items) lines.push(...eventToIcs(file, contentText, stamp, tagTitle));
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
}

export function todosToMarkdown(tasks: TaskItem[]): string {
    const roots = tasks.filter((t) => !t.parentId);
    const kids = (id: string) => tasks.filter((t) => t.parentId === id);
    const line = (t: TaskItem, depth: number): string[] => {
        const date = t.dueDate || t.scheduledDate;
        const meta = [date ? `fällig ${date.slice(0, 10)}` : '', t.priority ? `Priorität ${t.priority}` : ''].filter(Boolean).join(', ');
        const head = `${'  '.repeat(depth)}- [${t.isCompleted ? 'x' : ' '}] ${t.title}${meta ? ` (${meta})` : ''}`;
        const desc = t.description ? [`${'  '.repeat(depth + 1)}${t.description.replace(/\n/g, ' ')}`] : [];
        return [head, ...desc, ...kids(t.id).flatMap((k) => line(k, depth + 1))];
    };
    return `# Todos\n\n${roots.flatMap((t) => line(t, 0)).join('\n')}\n`;
}
