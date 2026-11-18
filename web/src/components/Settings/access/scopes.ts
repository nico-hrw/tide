/**
 * Rechte (Scopes) fuer Personal-Access-Tokens.
 * Die technischen Namen bleiben unveraendert (Backend/Request), nur die Anzeige wird uebersetzt.
 */
export type ScopeGroupId = 'events' | 'notes' | 'todos' | 'storage';

export interface ScopeDefinition {
    key: string;
    group: ScopeGroupId;
    /** false = im Backend noch nicht voll umgesetzt ("in Vorbereitung") */
    implemented: boolean;
}

export const SCOPE_DEFINITIONS: readonly ScopeDefinition[] = [
    { key: 'events:read', group: 'events', implemented: true },
    { key: 'events:write', group: 'events', implemented: false },
    { key: 'notes:read', group: 'notes', implemented: false },
    { key: 'notes:write', group: 'notes', implemented: false },
    { key: 'todos:read', group: 'todos', implemented: true },
    { key: 'todos:create', group: 'todos', implemented: true },
    { key: 'todos:edit', group: 'todos', implemented: true },
    { key: 'todos:delete', group: 'todos', implemented: true },
    { key: 'todos:write', group: 'todos', implemented: true },
    { key: 'storage:expand', group: 'storage', implemented: true },
];

export const SCOPE_GROUP_ORDER: readonly ScopeGroupId[] = ['events', 'notes', 'todos', 'storage'];

export const DEFAULT_SCOPES: readonly string[] = ['events:read'];

export interface ScopeGroup {
    id: ScopeGroupId;
    scopes: ScopeDefinition[];
}

export function groupScopes(defs: readonly ScopeDefinition[] = SCOPE_DEFINITIONS): ScopeGroup[] {
    return SCOPE_GROUP_ORDER.map((id) => ({ id, scopes: defs.filter((d) => d.group === id) })).filter((g) => g.scopes.length > 0);
}

export interface ScopeLabeler {
    /** Klartext fuer ein bekanntes Recht, `undefined` wenn unbekannt */
    known: (scope: string) => string | undefined;
    all: string;
    safe: (name: string) => string;
    folder: (name: string) => string;
}

/** Einzelnes Recht in Klartext. Unbekannte Rechte bleiben unveraendert sichtbar. */
export function describeScope(scope: string, labeler: ScopeLabeler): string {
    if (scope === '*') return labeler.all;
    if (scope.startsWith('safe:')) return labeler.safe(scope.slice(5));
    if (scope.startsWith('folder:')) return labeler.folder(scope.slice(7));
    return labeler.known(scope) ?? scope;
}

/**
 * Rechte als eine Zeile: "Termine lesen · Aufgaben lesen · +2".
 * Doppelte werden entfernt, ab `max` wird gekuerzt.
 */
export function describeScopes(scopes: readonly string[], labeler: ScopeLabeler, max = 3): string {
    const labels = Array.from(new Set(scopes.map((s) => describeScope(s, labeler))));
    if (labels.length <= max) return labels.join(' · ');
    return `${labels.slice(0, max).join(' · ')} · +${labels.length - max}`;
}

/** Waehlbare Gueltigkeiten in Tagen; 0 = kein Ablauf (so erwartet es das Backend). */
export const EXPIRY_CHOICES: readonly number[] = [30, 60, 90, 365, 0];
export const DEFAULT_EXPIRY_DAYS = 90;
