import { describe, expect, it } from 'vitest';
import { EXTENSION_CATALOG, EXTENSION_GROUP_ORDER, filterAndGroupExtensions, findExtension, matchesQuery } from '../extensionCatalog';

const TEXT: Record<string, string> = {
    todos: 'Todos & Tasks Aufgaben mit Fälligkeiten',
    job_planner: 'Job & Study Planner Stundenplan',
    summary: 'Daily Summary Tagesrückblick',
    surveys: 'Umfragen & Mood-Tracker',
    varsheet: 'VarSheet Rechnen mit Variablen',
    smart_island: 'Smart Island Seitenleiste',
    smart_date_detection: 'Smart Date Detection Datum',
    references: 'References Definitionen verlinken',
    mobile_connection: 'Mobile Connection Whisper Hub',
    mcp: 'Model Context Protocol KI-Agenten',
    file_support: 'Erweiterte Dateiformate DOCX Markdown',
    messenger: 'Messenger Wartung',
};
const textOf = (d: { id: string }) => TEXT[d.id];

describe('matchesQuery', () => {
    it('leere Anfrage trifft alles', () => {
        expect(matchesQuery('irgendwas', '')).toBe(true);
        expect(matchesQuery('irgendwas', '   ')).toBe(true);
    });

    it('ignoriert Groß- und Kleinschreibung', () => {
        expect(matchesQuery('Smart Island', 'ISLAND')).toBe(true);
    });

    it('verlangt alle Wörter, in beliebiger Reihenfolge', () => {
        expect(matchesQuery('Smart Date Detection', 'detection smart')).toBe(true);
        expect(matchesQuery('Smart Date Detection', 'smart island')).toBe(false);
    });
});

describe('filterAndGroupExtensions', () => {
    it('ohne Suche: alle Erweiterungen in Gruppenreihenfolge', () => {
        const groups = filterAndGroupExtensions(EXTENSION_CATALOG, '', textOf);
        expect(groups.map((g) => g.id)).toEqual([...EXTENSION_GROUP_ORDER]);
        expect(groups.flatMap((g) => g.items)).toHaveLength(EXTENSION_CATALOG.length);
    });

    it('filtert und blendet leere Gruppen aus', () => {
        const groups = filterAndGroupExtensions(EXTENSION_CATALOG, 'smart', textOf);
        expect(groups.map((g) => g.id)).toEqual(['smart']);
        expect(groups[0].items.map((i) => i.id)).toEqual(['smart_island', 'smart_date_detection']);
    });

    it('liefert bei keinem Treffer eine leere Liste', () => {
        expect(filterAndGroupExtensions(EXTENSION_CATALOG, 'gibtesnicht', textOf)).toEqual([]);
    });
});

describe('Katalog', () => {
    it('enthält jede bisherige Erweiterung genau einmal', () => {
        const ids = EXTENSION_CATALOG.map((e) => e.id).sort();
        expect(ids).toEqual(
            ['file_support', 'job_planner', 'mcp', 'messenger', 'mobile_connection', 'references', 'smart_date_detection', 'smart_island', 'summary', 'surveys', 'todos', 'varsheet'].sort(),
        );
    });

    it('Erweiterungen mit Optionen haben eine Unterseite', () => {
        const withPage = EXTENSION_CATALOG.filter((e) => e.hasPage).map((e) => e.id).sort();
        expect(withPage).toEqual(['job_planner', 'mcp', 'mobile_connection', 'references', 'smart_island', 'surveys']);
    });

    it('findExtension findet per Id', () => {
        expect(findExtension('mcp')?.group).toBe('connections');
        expect(findExtension('nope')).toBeUndefined();
    });

    it('Messenger ist als Wartung markiert', () => {
        expect(findExtension('messenger')?.maintenance).toBe(true);
    });
});
