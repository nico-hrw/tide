import type { Node as PmNode } from '@tiptap/pm/model';
import { collectDocDefinitions } from '@/components/extensions/variablesScope';
import type { Definition } from '@/lib/formula/scope';
import { STDLIB_ENTRIES } from '@/lib/formula/stdlib';
import type { RegistryEntry } from '@/lib/variableRegistry';
import { getVariableRegistry } from '@/lib/variableRegistryInstance';
import { useDataStore, type DataItem } from '@/store/useDataStore';

export interface VariableSuggestionItem {
    id: string;
    name: string;
    category: 'local' | 'global' | 'system';
    kind?: 'variable' | 'funktion' | 'konstante' | 'finanzen';
    signature?: string;
    expr?: string;
    description?: string;
    originNoteTitle?: string;
    originFolderPath?: string;
    isFunction: boolean;
}

const CATEGORY_ORDER: Record<VariableSuggestionItem['category'], number> = {
    local: 0,
    global: 1,
    system: 2,
};

function formatSignature(def: Pick<Definition, 'name' | 'params'>): string | undefined {
    if (!def.params) return undefined;
    return `${def.name}(${def.params.join(', ')})`;
}

function buildFolderPath(
    startParentId: unknown,
    notesById: Map<string, DataItem>,
): string | undefined {
    const segments: string[] = [];
    const visited = new Set<string>();
    let currentId = typeof startParentId === 'string' && startParentId ? startParentId : null;

    while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        const parent = notesById.get(currentId);
        if (!parent || parent.type !== 'folder' || Boolean(parent.isGroup)) {
            break;
        }
        segments.unshift(parent.title || 'Ordner');
        currentId = typeof parent.parent_id === 'string' && parent.parent_id ? parent.parent_id : null;
    }

    return segments.length > 0 ? segments.join(' > ') : undefined;
}

function resolveOrigin(
    sourceNoteId: string | null,
    notesById: Map<string, DataItem>,
): { originNoteTitle: string; originFolderPath?: string } {
    if (sourceNoteId === null) {
        return { originNoteTitle: 'Manuell', originFolderPath: 'Global' };
    }
    const note = notesById.get(sourceNoteId);
    const originNoteTitle = note?.title || 'Notiz';
    const originFolderPath = note ? buildFolderPath(note.parent_id, notesById) : undefined;
    return { originNoteTitle, originFolderPath };
}

function mapLocalItem(def: Definition, index: number): VariableSuggestionItem {
    const isFunction = Boolean(def.params && def.params.length > 0);
    return {
        id: `local:${index}:${def.name}`,
        name: def.name,
        category: 'local',
        kind: isFunction ? 'funktion' : 'variable',
        signature: formatSignature(def),
        expr: def.expr,
        isFunction,
    };
}

function mapGlobalItem(
    entry: RegistryEntry,
    index: number,
    notesById: Map<string, DataItem>,
): VariableSuggestionItem {
    const isFunction = Boolean(entry.params && entry.params.length > 0);
    const { originNoteTitle, originFolderPath } = resolveOrigin(entry.sourceNoteId, notesById);
    return {
        id: `global:${index}:${entry.sourceNoteId ?? 'manual'}:${entry.name}`,
        name: entry.name,
        category: 'global',
        kind: isFunction ? 'funktion' : 'variable',
        signature: formatSignature(entry),
        expr: entry.expr,
        originNoteTitle,
        originFolderPath,
        isFunction,
    };
}

function matchesQuery(item: VariableSuggestionItem, q: string): boolean {
    if (!q) return true;
    return (
        item.name.toLowerCase().includes(q) ||
        Boolean(item.signature?.toLowerCase().includes(q)) ||
        Boolean(item.description?.toLowerCase().includes(q)) ||
        Boolean(item.originNoteTitle?.toLowerCase().includes(q))
    );
}

/**
 * Collects, filters and sorts variable and function suggestions across local definitions,
 * global registry entries, and standard library functions/constants.
 */
export function getVariableSuggestions(
    doc: PmNode,
    query: string,
    currentNoteId?: string | null,
): VariableSuggestionItem[] {
    const items: VariableSuggestionItem[] = [];

    const localDefs = collectDocDefinitions(doc).local;
    localDefs.forEach((def, index) => {
        items.push(mapLocalItem(def, index));
    });

    const notes = useDataStore.getState().notes ?? [];
    const notesById = new Map<string, DataItem>();
    for (const note of notes) {
        notesById.set(note.id, note);
    }

    const globalEntries = getVariableRegistry().allEntries();
    globalEntries.forEach((entry, index) => {
        if (currentNoteId && entry.sourceNoteId === currentNoteId) return;
        items.push(mapGlobalItem(entry, index, notesById));
    });

    for (const entry of STDLIB_ENTRIES) {
        items.push({
            id: `system:${entry.name}`,
            name: entry.name,
            category: 'system',
            kind: entry.kind,
            signature: entry.signature,
            description: entry.description,
            isFunction: entry.kind !== 'konstante',
        });
    }

    const q = query.trim().toLowerCase().replace(/^@/, '');
    const filtered = items.filter((item) => matchesQuery(item, q));

    filtered.sort((a, b) => {
        if (q) {
            const aPrefix = a.name.toLowerCase().startsWith(q) ? 0 : 1;
            const bPrefix = b.name.toLowerCase().startsWith(q) ? 0 : 1;
            if (aPrefix !== bPrefix) return aPrefix - bPrefix;
        }
        return CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
    });

    return filtered;
}
