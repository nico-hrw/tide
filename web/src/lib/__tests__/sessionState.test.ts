import { describe, expect, it } from 'vitest';
import {
    SESSION_STATE_KEY,
    SESSION_STATE_VERSION,
    isFileListComplete,
    sessionStateKey,
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

describe('sessionStateKey', () => {
    it('scopes the key per user and refuses an unknown user', () => {
        expect(sessionStateKey('u1')).toBe(`${SESSION_STATE_KEY}:u1`);
        expect(sessionStateKey('u1')).not.toBe(sessionStateKey('u2'));
        expect(sessionStateKey('')).toBeNull();
        expect(sessionStateKey(null)).toBeNull();
    });

    it('a record stored for another user is not read under this users key', () => {
        const store = new Map<string, string>();
        store.set(sessionStateKey('u1') as string, serializePersistedSession({ tabs: [cal, note], activeTabId: 'n1' }));
        expect(parsePersistedSession(store.get(sessionStateKey('u2') as string) ?? null)).toBeNull();
        expect(parsePersistedSession(store.get(sessionStateKey('u1') as string) ?? null)?.tabs).toHaveLength(2);
    });
});

describe('isFileListComplete (stale pruning gate)', () => {
    it('is false until the root directory is loaded', () => {
        expect(isFileListComplete([], new Set())).toBe(false);
    });
    it('is true when root and every known folder are loaded', () => {
        const notes = [{ id: 'f1', type: 'folder' }, { id: 'n1', type: 'file' }];
        expect(isFileListComplete(notes, new Set(['root', 'f1']))).toBe(true);
    });
    it('is false while a known folder has not been loaded', () => {
        const notes = [{ id: 'f1', type: 'folder' }];
        expect(isFileListComplete(notes, new Set(['root']))).toBe(false);
    });
    it('not loaded -> nothing pruned; loaded + missing id -> pruned', () => {
        const tab = { id: 'gone', type: 'file' };
        const incomplete = isFileListComplete([], new Set());
        expect(isTabStale(tab, incomplete ? new Set<string>() : null)).toBe(false);
        const complete = isFileListComplete([], new Set(['root']));
        expect(isTabStale(tab, complete ? new Set<string>() : null)).toBe(true);
    });
});
