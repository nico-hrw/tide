import { describe, expect, it } from 'vitest';
import { todoIsExternal, todoSafe, todoVisibleInSafes } from '@/lib/todoSafes';

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
});
