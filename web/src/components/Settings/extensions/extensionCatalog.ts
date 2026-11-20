/**
 * Katalog der Erweiterungen (reine Daten). Texte stehen im i18n unter
 * `ext.<id>.title`, `ext.<id>.desc` und `ext.<id>.off` (Folgen beim Deaktivieren).
 * Die Ids entsprechen den gespeicherten `enabledExtensions`.
 */
export type ExtensionGroupId = 'productivity' | 'smart' | 'connections' | 'maintenance';

export interface ExtensionDef {
    id: string;
    group: ExtensionGroupId;
    /** Hat Optionen auf einer eigenen Unterseite */
    hasPage: boolean;
    /** Voruebergehend nicht verfuegbar */
    maintenance?: boolean;
}

export const EXTENSION_CATALOG: readonly ExtensionDef[] = [
    { id: 'todos', group: 'productivity', hasPage: false },
    { id: 'job_planner', group: 'productivity', hasPage: true },
    { id: 'summary', group: 'productivity', hasPage: false },
    { id: 'surveys', group: 'productivity', hasPage: true },
    { id: 'varsheet', group: 'productivity', hasPage: false },
    { id: 'smart_island', group: 'smart', hasPage: true },
    { id: 'smart_date_detection', group: 'smart', hasPage: false },
    { id: 'references', group: 'smart', hasPage: true },
    { id: 'mobile_connection', group: 'connections', hasPage: true },
    { id: 'mcp', group: 'connections', hasPage: true },
    { id: 'file_support', group: 'connections', hasPage: false },
    { id: 'messenger', group: 'maintenance', hasPage: false, maintenance: true },
];

export const EXTENSION_GROUP_ORDER: readonly ExtensionGroupId[] = ['productivity', 'smart', 'connections', 'maintenance'];

export function findExtension(id: string): ExtensionDef | undefined {
    return EXTENSION_CATALOG.find((e) => e.id === id);
}

export interface ExtensionGroupResult<T extends ExtensionDef = ExtensionDef> {
    id: ExtensionGroupId;
    items: T[];
}

/** Suchtreffer: alle Woerter der Anfrage muessen im Text vorkommen (ohne Gross-/Kleinschreibung). */
export function matchesQuery(haystack: string | null | undefined, query: string): boolean {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return true;
    const text = (haystack ?? '').toLowerCase();
    return words.every((w) => text.includes(w));
}

/** Filtert nach Suchtext und gruppiert; leere Gruppen entfallen. */
export function filterAndGroupExtensions<T extends ExtensionDef>(
    defs: readonly T[],
    query: string,
    textOf: (def: T) => string,
): ExtensionGroupResult<T>[] {
    return EXTENSION_GROUP_ORDER.map((id) => ({
        id,
        items: defs.filter((d) => d.group === id && matchesQuery(textOf(d), query)),
    })).filter((g) => g.items.length > 0);
}
