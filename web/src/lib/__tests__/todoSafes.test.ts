import { describe, expect, it } from 'vitest';
import { isFromOtherWorkspace, itemVisibleInSafesOrFilter, todoIsExternal, todoSafe, todoVisibleInSafes } from '@/lib/todoSafes';

describe('todo workspaces', () => {
    it('defaults to main and maps the legacy name', () => {
        expect(todoSafe({})).toBe('main');
        expect(todoSafe({ safe: 'Standard' })).toBe('main');
        expect(todoSafe({ safe: 'Studium' })).toBe('Studium');
    });

    it('shows everything when no workspace is active', () => {
        expect(todoVisibleInSafes({ safe: 'Studium' }, [])).toBe(true);
    });

    it('shows a todo of an active workspace and not of an inactive one', () => {
        expect(todoVisibleInSafes({ safe: 'Studium' }, ['Studium'])).toBe(true);
        expect(todoVisibleInSafes({ safe: 'Privat' }, ['Studium'])).toBe(false);
    });

    it('shows a todo linked into an active workspace and marks it external', () => {
        const t = { safe: 'Privat', linkedSafes: ['Studium'] };
        expect(todoVisibleInSafes(t, ['Studium'])).toBe(true);
        expect(todoIsExternal(t, ['Studium'])).toBe(true);
        expect(todoIsExternal({ safe: 'Studium' }, ['Studium'])).toBe(false);
    });

    it('matches main through the legacy name in the active list', () => {
        expect(todoVisibleInSafes({}, ['Standard'])).toBe(true);
    });

    it('detects items from other workspaces', () => {
        expect(isFromOtherWorkspace({ safe: 'main' }, ['Studium'])).toBe(true);
        expect(isFromOtherWorkspace({ safe: 'Studium' }, ['Studium'])).toBe(false);
        expect(isFromOtherWorkspace({ safe: 'main' }, [])).toBe(false);
    });

    it('shows external items when a selected tag filter matches them', () => {
        const fromMain = { safe: 'main', linkedSafes: [] };
        expect(itemVisibleInSafesOrFilter(fromMain, ['tag-a'], ['Studium'], [])).toBe(false);
        expect(itemVisibleInSafesOrFilter(fromMain, ['tag-a'], ['Studium'], ['tag-b'])).toBe(false);
        expect(itemVisibleInSafesOrFilter(fromMain, ['tag-a'], ['Studium'], ['tag-a'])).toBe(true);
        expect(itemVisibleInSafesOrFilter({ safe: 'Studium' }, [], ['Studium'], ['tag-a'])).toBe(true);
    });
});
