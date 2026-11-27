import { useMemo } from 'react';
import { useDataStore } from '@/store/useDataStore';
import { useNoteLinkStore } from '@/store/useNoteLinkStore';
import { isItemUnlocked, type ItemSecuritySettings } from '@/lib/pinSecurity';
import { buildNoteGraph, type GraphNoteInput, type LinkIndex, type NoteGraph } from '@/lib/noteLinks';
import type { DataItem } from '@/store/slices/types';

/**
 * Which notes may appear in the graph: real notes the signed-in user can see right now. Folders, anything marked
 * deleted, and notes locked by a PIN (until unlocked) stay out, so neither their titles nor their links show up.
 */
export function isGraphVisible(note: DataItem): boolean {
    if (note.type === 'folder' || !note.id) return false;
    if (note.deleted_at || note.is_deleted || note.trashed) return false;
    const security = (note.metadata?.security_settings ?? note.security_settings) as ItemSecuritySettings | undefined;
    return isItemUnlocked(note.id, security ?? null);
}

export function visibleGraphNotes(notes: readonly DataItem[]): GraphNoteInput[] {
    return notes.filter(isGraphVisible).map((n) => ({ id: n.id, title: n.title || 'Untitled' }));
}

export function graphFrom(notes: readonly DataItem[], index: LinkIndex): NoteGraph {
    return buildNoteGraph(visibleGraphNotes(notes), index);
}

/** The current graph, rebuilt when notes or links change. */
export function useNoteGraph(): NoteGraph {
    const notes = useDataStore((s) => s.notes);
    const links = useNoteLinkStore((s) => s.links);
    return useMemo(() => graphFrom(notes, links), [notes, links]);
}
