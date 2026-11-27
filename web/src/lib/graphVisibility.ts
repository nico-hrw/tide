import { isItemUnlocked, type ItemSecuritySettings } from '@/lib/pinSecurity';
import type { GraphNoteInput } from '@/lib/noteLinks';
import type { DataItem } from '@/store/slices/types';

/**
 * What may appear in the graph. Notes: real notes (and canvases) the signed-in user can see right now; folders,
 * attachments, anything deleted, and notes locked by a PIN (until unlocked) stay out, so neither their titles nor
 * their links show up. Events and todos are only candidates: buildNoteGraph shows them when a note is linked to them.
 */
const NOTE_TYPES = new Set(['note', 'canvas']);

function isDeleted(item: DataItem): boolean {
    return Boolean(item.deleted_at || item.is_deleted || item.trashed);
}

export function isGraphVisible(note: DataItem): boolean {
    if (!note.id || !NOTE_TYPES.has(note.type) || note.isGroup || note.role === 'helper') return false;
    if (isDeleted(note)) return false;
    const security = (note.metadata?.security_settings ?? note.security_settings) as ItemSecuritySettings | undefined;
    return isItemUnlocked(note.id, security ?? null);
}

export function isVisibleEvent(event: DataItem): boolean {
    if (!event.id || event.isGroup || isDeleted(event)) return false;
    const security = (event.metadata?.security_settings ?? event.security_settings) as ItemSecuritySettings | undefined;
    return isItemUnlocked(event.id, security ?? null);
}

/** Ids of everything a link may point to (notes, events, todos the user can see); used when links are recorded. */
export function linkableIds(notes: readonly DataItem[], events: readonly DataItem[]): { noteIds: Set<string>; allIds: Set<string> } {
    const noteIds = new Set(notes.filter(isGraphVisible).map((n) => n.id));
    const allIds = new Set(noteIds);
    for (const e of events) if (isVisibleEvent(e)) allIds.add(e.id);
    return { noteIds, allIds };
}

export function visibleGraphNotes(notes: readonly DataItem[]): GraphNoteInput[] {
    return notes.filter(isGraphVisible).map((n) => ({ id: n.id, title: n.title || 'Untitled', kind: 'note' as const }));
}
