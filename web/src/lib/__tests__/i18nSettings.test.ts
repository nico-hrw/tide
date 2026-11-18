import { describe, expect, it } from 'vitest';
import { formatMessage, translations } from '../i18n';
import { SCOPE_DEFINITIONS } from '@/components/Settings/access/scopes';
import { EXTENSION_CATALOG } from '@/components/Settings/extensions/extensionCatalog';
import { NAV_GROUPS, ABOUT_PAGE } from '@/components/Settings/settingsPages';

const de = translations.de.settings as Record<string, string>;
const en = translations.en.settings as Record<string, string>;

describe('formatMessage', () => {
    it('ersetzt Platzhalter', () => {
        expect(formatMessage('vor {n} Tagen', { n: 3 })).toBe('vor 3 Tagen');
        expect(formatMessage('{a} und {b}', { a: 'x', b: 'y' })).toBe('x und y');
    });

    it('lässt unbekannte Platzhalter stehen und ohne Variablen unverändert', () => {
        expect(formatMessage('Hallo {name}', {})).toBe('Hallo {name}');
        expect(formatMessage('Hallo {name}')).toBe('Hallo {name}');
    });
});

describe('Einstellungs-Texte', () => {
    it('de und en haben dieselben Schlüssel', () => {
        expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
    });

    it('keine leeren Texte', () => {
        for (const [k, v] of Object.entries({ ...de, ...en })) expect(v, k).not.toBe('');
    });

    it('Platzhalter stimmen in beiden Sprachen überein', () => {
        const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
        for (const k of Object.keys(de)) expect(vars(en[k]), k).toBe(vars(de[k]));
    });

    it('jede Seite hat Navigationstitel und Einleitung', () => {
        const pages = [...NAV_GROUPS.flatMap((g) => g.pages), ABOUT_PAGE];
        for (const p of pages) {
            expect(de[`nav.${p}`], p).toBeTruthy();
            expect(de[`page.${p}.lead`], p).toBeTruthy();
        }
        for (const g of NAV_GROUPS) expect(de[`navGroup.${g.id}`], g.id).toBeTruthy();
    });

    it('jedes Recht hat Klartext-Name und Beschreibung', () => {
        for (const s of SCOPE_DEFINITIONS) {
            expect(de[`scope.${s.key}.label`], s.key).toBeTruthy();
            expect(de[`scope.${s.key}.desc`], s.key).toBeTruthy();
        }
    });

    it('jede Erweiterung hat Titel, Beschreibung und Deaktivierungs-Hinweis', () => {
        for (const e of EXTENSION_CATALOG) {
            expect(de[`ext.${e.id}.title`], e.id).toBeTruthy();
            expect(de[`ext.${e.id}.desc`], e.id).toBeTruthy();
            expect(de[`ext.${e.id}.off`], e.id).toBeTruthy();
            if (e.hasPage) expect(de[`ext.${e.id}.lead`], e.id).toBeTruthy();
        }
    });
});
