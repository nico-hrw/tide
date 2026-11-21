import type { CalendarEvent } from '@/components/Calendar/types';
import type { TaskItem } from '@/store/slices/types';
import { removeTagFromItems } from '@/lib/tags';

export interface DeleteTagDeps {
    events: CalendarEvent[];
    tasks: TaskItem[];
    saveEvent: (id: string, updates: { groupIds: string[]; parent_id: string | null }) => Promise<void>;
    saveTask: (id: string, updates: { tags: string[] }) => Promise<void>;
    pruneViews: (tagId: string) => Promise<void>;
    clearFilters: (tagId: string) => void;
    deleteFile: (tagId: string) => Promise<void>;
    /** Current user; items owned by someone else are never rewritten. */
    myId?: string;
    /** False for a tag shared into my account: only leave the share, never touch items. Defaults to true. */
    isOwner?: boolean;
}

/**
 * Entfernt ein Tag aus allen Terminen, Todos, gespeicherten Ansichten und Filtern und loescht dann die Tag-Datei.
 * Schlaegt ein Schritt fehl, bleibt die Tag-Datei erhalten (die Patches sind idempotent, ein erneuter Versuch ist moeglich).
 */
export async function deleteTagEverywhere(tagId: string, deps: DeleteTagDeps): Promise<{ ok: boolean }> {
    try {
        const { eventPatches, taskPatches } = deps.isOwner === false
            ? { eventPatches: [], taskPatches: [] }
            : removeTagFromItems(tagId, deps.events, deps.tasks, deps.myId);
        for (const p of eventPatches) await deps.saveEvent(p.id, { groupIds: p.groupIds, parent_id: p.parent_id });
        for (const p of taskPatches) await deps.saveTask(p.id, { tags: p.tags });
        await deps.pruneViews(tagId);
        deps.clearFilters(tagId);
        await deps.deleteFile(tagId);
        return { ok: true };
    } catch (err) {
        console.warn('Tag konnte nicht vollstaendig geloescht werden', err);
        return { ok: false };
    }
}
