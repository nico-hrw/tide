import { describe, it, expect } from 'vitest';
import { serializeTabsForStorage, sanitizeRestoredTabs, isCryptoKey, canReuseTabCache } from '../tabStorage';

describe('tab persistence', () => {
    const tab = { id: 'n1', title: 'Note', type: 'file', content: { type: 'doc' }, _fileKey: {}, _saveStatus: 'saved' };

    it('does not write cached content, keys or save state', () => {
        const stored = JSON.parse(serializeTabsForStorage([tab, { id: 'calendar', title: 'Calendar', type: 'calendar' }]));
        expect(stored[0]).toEqual({ id: 'n1', title: 'Note', type: 'file' });
        expect(stored[1]).toEqual({ id: 'calendar', title: 'Calendar', type: 'calendar' });
    });

    it('removes volatile fields written by older versions on restore', () => {
        const restored = sanitizeRestoredTabs([tab]);
        expect(restored[0]).toEqual({ id: 'n1', title: 'Note', type: 'file' });
    });

    it('does not mutate its input', () => {
        serializeTabsForStorage([tab]);
        sanitizeRestoredTabs([tab]);
        expect(tab.content).toEqual({ type: 'doc' });
    });

    it('treats the {} left by a JSON round trip as no key', () => {
        expect(isCryptoKey({})).toBe(false);
        expect(isCryptoKey(null)).toBe(false);
    });

    it('reuses cached content only together with a live key', async () => {
        const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        expect(canReuseTabCache({ content: { type: 'doc' }, _fileKey: key })).toBe(true);
        expect(canReuseTabCache({ content: { type: 'doc' }, _fileKey: {} })).toBe(false);
        expect(canReuseTabCache({ content: null, _fileKey: key })).toBe(false);
        expect(canReuseTabCache(undefined)).toBe(false);
    });
});
