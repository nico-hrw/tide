import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { setDocNote, setDocHydrated, whyNotSavable, getDocNote } from '../ydocRegistry';

describe('ydocRegistry', () => {
    it('allows saving an unknown doc (no provider involved)', () => {
        expect(whyNotSavable(new Y.Doc(), 'a')).toBeNull();
    });

    it('allows the doc of the same note', () => {
        const doc = new Y.Doc();
        setDocNote(doc, 'a');
        setDocHydrated(doc, true);
        expect(whyNotSavable(doc, 'a')).toBeNull();
        expect(getDocNote(doc)).toBe('a');
    });

    it('blocks the doc of another note', () => {
        const doc = new Y.Doc();
        setDocNote(doc, 'b');
        expect(whyNotSavable(doc, 'a')).toMatch(/belongs to note b/);
    });

    it('blocks a doc whose server state could not be loaded', () => {
        const doc = new Y.Doc();
        setDocNote(doc, 'a');
        setDocHydrated(doc, false);
        expect(whyNotSavable(doc, 'a')).toMatch(/could not be loaded/);
    });

    it('allows saving again once hydration succeeded', () => {
        const doc = new Y.Doc();
        setDocHydrated(doc, false);
        setDocHydrated(doc, true);
        expect(whyNotSavable(doc, 'a')).toBeNull();
    });
});
