import { describe, expect, it } from 'vitest';
import {
    SESSION_STATE_VERSION,
    isTabStale,
    parsePersistedSession,
    resolveRestoredActive,
    serializePersistedSession,
} from '../sessionState';

const cal = { id: 'calendar', title: 'Calendar', type: 'calendar' };
const note = { id: 'n1', title: 'Secret plan', type: 'file' };

describe('serializePersistedSession / parsePersistedSession', () => {
    it('round-trips ids, types, order, active tab and calendar view mode', () => {
        const raw = serializePersistedSession({
            tabs: [cal, note, { id: 'profile:u1', title: 'Ada', type: 'profile' }],
            activeTabId: 'n1',
            calendarViewMode: 'month',
        });
        const parsed = parsePersistedSession(raw);
        expect(parsed?.tabs.map((t) => [t.id, t.type])).toEqual([
            ['calendar', 'calendar'],
            ['n1', 'file'],
            ['profile:u1', 'profile'],
        ]);
        expect(parsed?.activeTabId).toBe('n1');
        expect(parsed?.calendarViewMode).toBe('month');
    });

    it('does not persist note titles or volatile fields', () => {
        const raw = serializePersistedSession({
            tabs: [{ ...note, content: { secret: 1 }, _fileKey: {} } as typeof note],
            activeTabId: 'n1',
        });
        expect(raw).not.toContain('Secret plan');
        expect(raw).not.toContain('secret');
        expect(raw).toContain(`"v":${SESSION_STATE_VERSION}`);
    });

    it('does not persist chat tabs (they need in-memory content)', () => {
        const raw = serializePersistedSession({
            tabs: [cal, { id: 'chat-1', title: 'Bob', type: 'chat' }],
            activeTabId: 'calendar',
        });
        expect(parsePersistedSession(raw)?.tabs.map((t) => t.id)).toEqual(['calendar']);
    });

    it('returns null for null, empty and corrupt JSON', () => {
        expect(parsePersistedSession(null)).toBeNull();
        expect(parsePersistedSession('')).toBeNull();
        expect(parsePersistedSession('{not json')).toBeNull();
        expect(parsePersistedSession('"str"')).toBeNull();
        expect(parsePersistedSession('[1,2]')).toBeNull();
    });

    it('ignores data of an unknown version', () => {
        const raw = JSON.stringify({ v: 999, tabs: [{ id: 'calendar', type: 'calendar' }], activeTabId: 'calendar' });
        expect(parsePersistedSession(raw)).toBeNull();
    });

    it('drops unknown tab types, malformed entries and duplicate ids', () => {
        const raw = JSON.stringify({
            v: SESSION_STATE_VERSION,
            tabs: [
                { id: 'calendar', type: 'calendar' },
                { id: 'x', type: 'hacker' },
                { id: 5, type: 'file' },
                null,
                { id: 'calendar', type: 'calendar' },
                { id: 'n2', type: 'file' },
            ],
            activeTabId: 'n2',
        });
        expect(parsePersistedSession(raw)?.tabs.map((t) => t.id)).toEqual(['calendar', 'n2']);
    });

    it('ignores an invalid calendar view mode', () => {
        const raw = JSON.stringify({ v: SESSION_STATE_VERSION, tabs: [{ id: 'calendar', type: 'calendar' }], calendarViewMode: 'bogus' });
        expect(parsePersistedSession(raw)?.calendarViewMode).toBeUndefined();
    });
});

describe('isTabStale', () => {
    it('keeps non-file tabs regardless of known files', () => {
        expect(isTabStale({ id: 'calendar', type: 'calendar' }, new Set())).toBe(false);
    });
    it('marks file tabs missing from the known files as stale', () => {
        expect(isTabStale({ id: 'gone', type: 'file' }, new Set(['n1']))).toBe(true);
        expect(isTabStale({ id: 'n1', type: 'file' }, new Set(['n1']))).toBe(false);
    });
    it('never marks anything stale while the files are not loaded (null)', () => {
        expect(isTabStale({ id: 'gone', type: 'file' }, null)).toBe(false);
    });
});

describe('resolveRestoredActive', () => {
    const tabs = [cal, note];

    it('keeps a valid active tab', () => {
        expect(resolveRestoredActive(tabs, 'n1')).toEqual({ tabs, activeTabId: 'n1' });
    });

    it('falls back to the first tab when the active tab is not in the list', () => {
        expect(resolveRestoredActive(tabs, 'missing').activeTabId).toBe('calendar');
        expect(resolveRestoredActive([note], null).activeTabId).toBe('n1');
    });

    it('opens the calendar on start but keeps the restored tabs', () => {
        const res = resolveRestoredActive([note, { id: 'profile:u1', title: 'A', type: 'profile' }], 'n1', {
            startOnCalendar: true,
        });
        expect(res.activeTabId).toBe('calendar');
        expect(res.tabs.map((t) => t.id)).toEqual(['calendar', 'n1', 'profile:u1']);
    });

    it('does not duplicate an existing calendar tab on start', () => {
        const res = resolveRestoredActive(tabs, 'n1', { startOnCalendar: true });
        expect(res.activeTabId).toBe('calendar');
        expect(res.tabs).toHaveLength(2);
    });

    it('returns an empty list untouched', () => {
        expect(resolveRestoredActive([], 'x')).toEqual({ tabs: [], activeTabId: '' });
    });
});
