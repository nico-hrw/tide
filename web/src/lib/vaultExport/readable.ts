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

function icsDate(iso: string, allDay: boolean): string | null {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const p = (n: number, w = 2) => String(n).padStart(w, '0');
    if (allDay) return `;VALUE=DATE:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
    return `:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

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
    return { ...file.publicMeta, ...file.metadata, ...(file.securedMeta ?? {}), ...body };
}

/** One VEVENT; null when the event has no usable start. */
function eventToIcs(file: VaultFileRecord, contentText: string | undefined, stamp: string): string[] | null {
    const f = eventFields(file, contentText);
    const allDay = f.allDay === true;
    const start = icsDate(str(f.start), allDay);
    if (!start) return null;
    const end = icsDate(str(f.end) || str(f.start), allDay);
    const lines = ['BEGIN:VEVENT', `UID:${file.id}@tide-export`, `DTSTAMP:${stamp}`, `DTSTART${start}`];
    if (end) lines.push(`DTEND${end}`);
    lines.push(`SUMMARY:${icsEscape(str(f.title) || file.title)}`);
    if (str(f.description)) lines.push(`DESCRIPTION:${icsEscape(str(f.description))}`);
    if (str(f.location)) lines.push(`LOCATION:${icsEscape(str(f.location))}`);
    const rule = str(f.recurrence_rule).replace(/^RRULE:/i, '');
    if (rule) lines.push(`RRULE:${rule}`);
    if (f.is_cancelled === true) lines.push('STATUS:CANCELLED');
    lines.push('END:VEVENT');
    return lines;
}

export function eventsToIcs(items: Array<{ file: VaultFileRecord; contentText?: string }>, now = new Date()): string {
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tide//Vault Export//DE', 'CALSCALE:GREGORIAN'];
    for (const { file, contentText } of items) {
        const ev = eventToIcs(file, contentText, stamp);
        if (ev) lines.push(...ev);
    }
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
