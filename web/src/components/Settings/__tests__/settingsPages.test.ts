import { describe, expect, it } from 'vitest';
import { ABOUT_PAGE, DEFAULT_PAGE, NAV_GROUPS, resolvePage } from '../settingsPages';

describe('Navigationsstruktur', () => {
    it('gruppiert wie gefordert', () => {
        expect(NAV_GROUPS.map((g) => [g.id, [...g.pages]])).toEqual([
            ['personal', ['account', 'appearance']],
            ['workspace', ['workspaces', 'calendar', 'notes', 'todos']],
            ['advanced', ['extensions', 'access']],
        ]);
    });

    it('Konto ist die erste Seite, Über Tide steht abgesetzt', () => {
        expect(NAV_GROUPS[0].pages[0]).toBe('account');
        expect(DEFAULT_PAGE).toBe('account');
        expect(ABOUT_PAGE).toBe('about');
        expect(NAV_GROUPS.flatMap((g) => g.pages)).not.toContain('about');
    });
});

describe('resolvePage', () => {
    it('lässt gültige Seiten durch', () => {
        expect(resolvePage('calendar')).toBe('calendar');
        expect(resolvePage('todos')).toBe('todos');
    });

    it('bildet alte Tab-Ids ab: Info und Debug landen auf Über Tide', () => {
        expect(resolvePage('info')).toBe('about');
        expect(resolvePage('debug')).toBe('about');
    });

    it('fällt bei leer oder unbekannt auf Konto zurück', () => {
        expect(resolvePage(undefined)).toBe('account');
        expect(resolvePage(null)).toBe('account');
        expect(resolvePage('unbekannt')).toBe('account');
    });
});
