import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { getVariableSuggestions } from '../variableSuggestions';
import { VariableRegistry, type RegistryEntry } from '@/lib/variableRegistry';
import { useDataStore, type DataItem } from '@/store/useDataStore';

const testSchema = new Schema({
    nodes: {
        doc: { content: 'block+' },
        paragraph: { group: 'block', content: 'text*' },
        variablesBlock: {
            group: 'block',
            attrs: {
                code: { default: '' },
                snapshot: { default: null },
            },
        },
        text: { group: 'inline' },
    },
});

function makeDoc(blocks: string[] = []) {
    const nodes = blocks.map((code) => testSchema.nodes.variablesBlock.create({ code }));
    if (nodes.length === 0) {
        nodes.push(testSchema.nodes.paragraph.create());
    }
    return testSchema.nodes.doc.create(null, nodes);
}

describe('getVariableSuggestions', () => {
    let originalNotes: DataItem[];
    let mockEntries: RegistryEntry[];

    beforeEach(() => {
        originalNotes = useDataStore.getState().notes;
        useDataStore.setState({ notes: [] });
        mockEntries = [];
        vi.spyOn(VariableRegistry.prototype, 'allEntries').mockImplementation(() => mockEntries);
    });

    afterEach(() => {
        useDataStore.setState({ notes: originalNotes });
        vi.restoreAllMocks();
    });

    it('returns local variables and functions from doc with category local', () => {
        const doc = makeDoc([
            'mwst = 19 %\nnetto(brutto, satz) = brutto / (1 + satz)',
        ]);

        const suggestions = getVariableSuggestions(doc, '');
        const locals = suggestions.filter((item) => item.category === 'local');

        expect(locals).toEqual([
            {
                id: 'local:0:mwst',
                name: 'mwst',
                category: 'local',
                kind: 'variable',
                signature: undefined,
                expr: '19 %',
                isFunction: false,
            },
            {
                id: 'local:1:netto',
                name: 'netto',
                category: 'local',
                kind: 'funktion',
                signature: 'netto(brutto, satz)',
                expr: 'brutto / (1 + satz)',
                isFunction: true,
            },
        ]);
    });

    it('returns global variables from registry with category global and resolves origin note title and folder path', () => {
        const notes: DataItem[] = [
            { id: 'folder-root', title: 'Finanzen', type: 'folder', parent_id: null },
            { id: 'folder-sub', title: 'Kredite', type: 'folder', parent_id: 'folder-root' },
            { id: 'note-1', title: 'Baufinanzierung', type: 'note', parent_id: 'folder-sub' },
        ];
        useDataStore.setState({ notes });

        const entries: RegistryEntry[] = [
            { name: 'zins', expr: '3,9 %', global: true, sourceNoteId: 'note-1' },
            {
                name: 'rate',
                params: ['b', 'n'],
                expr: 'RMZ(zins / 12, n, -b)',
                global: true,
                sourceNoteId: null,
            },
        ];
        mockEntries = entries;

        const doc = makeDoc();
        const globals = getVariableSuggestions(doc, '').filter((item) => item.category === 'global');

        expect(globals).toEqual([
            {
                id: 'global:0:note-1:zins',
                name: 'zins',
                category: 'global',
                kind: 'variable',
                signature: undefined,
                expr: '3,9 %',
                originNoteTitle: 'Baufinanzierung',
                originFolderPath: 'Finanzen > Kredite',
                isFunction: false,
            },
            {
                id: 'global:1:manual:rate',
                name: 'rate',
                category: 'global',
                kind: 'funktion',
                signature: 'rate(b, n)',
                expr: 'RMZ(zins / 12, n, -b)',
                originNoteTitle: 'Manuell',
                originFolderPath: 'Global',
                isFunction: true,
            },
        ]);
    });

    it('returns system functions and constants from stdlib with category system', () => {
        const doc = makeDoc();
        const systems = getVariableSuggestions(doc, '').filter((item) => item.category === 'system');

        const piItem = systems.find((item) => item.name === 'pi');
        const summeItem = systems.find((item) => item.name === 'SUMME');
        const rmzItem = systems.find((item) => item.name === 'RMZ');

        expect(piItem).toEqual({
            id: 'system:pi',
            name: 'pi',
            category: 'system',
            kind: 'konstante',
            signature: 'pi',
            description: 'Kreiszahl 3,14159…',
            isFunction: false,
        });
        expect(summeItem).toEqual({
            id: 'system:SUMME',
            name: 'SUMME',
            category: 'system',
            kind: 'funktion',
            signature: 'SUMME(Zellen…)',
            description: 'Summe von Zahlen, Zellen oder Bereichen',
            isFunction: true,
        });
        expect(rmzItem).toEqual({
            id: 'system:RMZ',
            name: 'RMZ',
            category: 'system',
            kind: 'finanzen',
            signature: 'RMZ(zins; laufzeit; barwert)',
            description: 'Rate pro Periode (Zins je Periode)',
            isFunction: true,
        });
    });

    it('filters by query and returns SUMME as first system match', () => {
        const doc = makeDoc(['meine_summe = 42']);

        const results = getVariableSuggestions(doc, 'SUMME');
        const systemMatches = results.filter((item) => item.category === 'system');

        expect(systemMatches.length).toBeGreaterThan(0);
        expect(systemMatches[0]?.name).toBe('SUMME');
        expect(results[0]?.name).toBe('SUMME');
    });

    it('strips leading @ from query and matches zins', () => {
        const entries: RegistryEntry[] = [
            { name: 'zins', expr: '3,9 %', global: true, sourceNoteId: null },
            { name: 'steuer', expr: '19 %', global: true, sourceNoteId: null },
        ];
        mockEntries = entries;

        const doc = makeDoc();
        const results = getVariableSuggestions(doc, '@zins');

        expect(results.map((item) => item.name)).toContain('zins');
        expect(results[0]?.name).toBe('zins');
        expect(results.map((item) => item.name)).not.toContain('steuer');
    });

    it('skips globals belonging to the current note', () => {
        useDataStore.setState({
            notes: [
                { id: 'note-current', title: 'Aktuelle Notiz', type: 'note', parent_id: null },
                { id: 'note-other', title: 'Andere Notiz', type: 'note', parent_id: null },
            ],
        });
        const entries: RegistryEntry[] = [
            { name: 'eigen_global', expr: '10', global: true, sourceNoteId: 'note-current' },
            { name: 'fremd_global', expr: '20', global: true, sourceNoteId: 'note-other' },
            { name: 'manuell_global', expr: '30', global: true, sourceNoteId: null },
        ];
        mockEntries = entries;

        const doc = makeDoc();
        const globalNames = getVariableSuggestions(doc, '', 'note-current')
            .filter((item) => item.category === 'global')
            .map((item) => item.name);

        expect(globalNames).toEqual(['fremd_global', 'manuell_global']);
    });
});
