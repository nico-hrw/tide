import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    clearNoteBindings, getNoteBindings, notifySheetChanged, onSheetChanged,
    publishNoteBindings, subscribeNoteBindings,
} from '../noteBindings';

afterEach(() => { clearNoteBindings('n1'); clearNoteBindings('n2'); });

describe('note bindings', () => {
    it('stores and returns the published symbols per note', () => {
        publishNoteBindings('n1', new Map([['x', 3]]));
        publishNoteBindings('n2', new Map([['y', 4]]));
        expect(getNoteBindings('n1')?.get('x')).toBe(3);
        expect(getNoteBindings('n2')?.get('y')).toBe(4);
        expect(getNoteBindings('n3')).toBeUndefined();
    });

    it('notifies listeners only when the symbols really change', () => {
        const cb = vi.fn();
        const off = subscribeNoteBindings(cb);
        publishNoteBindings('n1', new Map([['x', 3]]));
        publishNoteBindings('n1', new Map([['x', 3]]));
        expect(cb).toHaveBeenCalledTimes(1);
        publishNoteBindings('n1', new Map([['x', 4]]));
        expect(cb).toHaveBeenCalledTimes(2);
        off();
        publishNoteBindings('n1', new Map([['x', 5]]));
        expect(cb).toHaveBeenCalledTimes(2);
    });

    it('clearing removes the symbols and notifies once; clearing nothing is silent', () => {
        publishNoteBindings('n1', new Map([['x', 3]]));
        const cb = vi.fn();
        const off = subscribeNoteBindings(cb);
        clearNoteBindings('n1');
        expect(getNoteBindings('n1')).toBeUndefined();
        expect(cb).toHaveBeenCalledTimes(1);
        clearNoteBindings('n1');
        expect(cb).toHaveBeenCalledTimes(1);
        off();
    });

    it('treats an empty map like clearing', () => {
        publishNoteBindings('n1', new Map([['x', 3]]));
        publishNoteBindings('n1', new Map());
        expect(getNoteBindings('n1')).toBeUndefined();
    });

    it('sheet-saved events reach their listeners until unsubscribed', () => {
        const cb = vi.fn();
        const off = onSheetChanged(cb);
        notifySheetChanged('n1');
        expect(cb).toHaveBeenCalledWith('n1');
        off();
        notifySheetChanged('n1');
        expect(cb).toHaveBeenCalledTimes(1);
    });
});
