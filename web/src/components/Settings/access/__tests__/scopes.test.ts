import { describe, expect, it } from 'vitest';
import { SCOPE_DEFINITIONS, describeScope, describeScopes, groupScopes, type ScopeLabeler } from '../scopes';

const LABELS: Record<string, string> = {
    'events:read': 'Termine lesen',
    'todos:read': 'Aufgaben lesen',
    'notes:read': 'Notizen lesen',
    'notes:write': 'Notizen ändern',
};

const labeler: ScopeLabeler = {
    known: (s) => LABELS[s],
    all: 'Voller Zugriff',
    safe: (n) => `nur Bereich „${n}“`,
    folder: (n) => `nur Ordner „${n}“`,
};

describe('describeScope', () => {
    it('übersetzt bekannte Rechte in Klartext', () => {
        expect(describeScope('events:read', labeler)).toBe('Termine lesen');
    });

    it('behandelt Wildcard, safe: und folder:', () => {
        expect(describeScope('*', labeler)).toBe('Voller Zugriff');
        expect(describeScope('safe:work', labeler)).toBe('nur Bereich „work“');
        expect(describeScope('folder:Uni', labeler)).toBe('nur Ordner „Uni“');
    });

    it('lässt unbekannte Rechte unverändert sichtbar', () => {
        expect(describeScope('future:scope', labeler)).toBe('future:scope');
    });
});

describe('describeScopes', () => {
    it('verbindet bis zu drei Rechte mit Mittelpunkt', () => {
        expect(describeScopes(['events:read', 'todos:read'], labeler)).toBe('Termine lesen · Aufgaben lesen');
    });

    it('kürzt ab dem vierten Recht mit Zähler', () => {
        const out = describeScopes(['events:read', 'todos:read', 'notes:read', 'notes:write', 'safe:work'], labeler);
        expect(out).toBe('Termine lesen · Aufgaben lesen · Notizen lesen · +2');
    });

    it('entfernt Doppelte und respektiert max', () => {
        expect(describeScopes(['events:read', 'events:read'], labeler)).toBe('Termine lesen');
        expect(describeScopes(['events:read', 'todos:read'], labeler, 1)).toBe('Termine lesen · +1');
    });

    it('liefert für eine leere Liste einen leeren Text', () => {
        expect(describeScopes([], labeler)).toBe('');
    });
});

describe('Rechte-Definitionen', () => {
    it('behalten die technischen Namen für das Backend', () => {
        expect(SCOPE_DEFINITIONS.map((d) => d.key)).toEqual([
            'events:read', 'events:write', 'notes:read', 'notes:write',
            'todos:read', 'todos:create', 'todos:edit', 'todos:delete', 'todos:write',
            'folders:read', 'folders:write', 'tags:read', 'tags:write',
            'workspaces:read', 'workspaces:write', 'settings:read', 'settings:write',
            'surveys:read', 'surveys:write', 'storage:expand', '*',
        ]);
        expect(SCOPE_DEFINITIONS.find((d) => d.key === 'events:write')?.implemented).toBe(true);
    });

    it('gruppiert in fester Reihenfolge ohne Rechte zu verlieren', () => {
        const groups = groupScopes();
        expect(groups.map((g) => g.id)).toEqual([
            'events', 'notes', 'todos', 'organization', 'settings', 'surveys', 'storage', 'full',
        ]);
        expect(groups.flatMap((g) => g.scopes)).toHaveLength(SCOPE_DEFINITIONS.length);
    });
});
