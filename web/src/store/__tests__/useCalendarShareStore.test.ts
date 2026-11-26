import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDataStore } from '@/store/useDataStore';
import {
    CALENDAR_SHARES_FILE_TYPE,
    setCalendarShareStorageFactory,
    useCalendarShareStore,
    type CalendarShareStorage,
} from '../useCalendarShareStore';
import type { CalendarShareRules } from '@/lib/calendarShare';

const anna = { groupId: 'g1', recipients: [{ userId: 'anna', permission: 'view' as const }], autoShareNew: true };

function memoryStorage(initial: CalendarShareRules, opts: { failLoad?: boolean } = {}) {
    let stored = initial;
    const storage: CalendarShareStorage = {
        load: vi.fn(async () => {
            if (opts.failLoad) throw new Error('offline');
            return stored;
        }),
        save: vi.fn(async (rules: CalendarShareRules) => { stored = rules; }),
    };
    return { storage, read: () => stored };
}

beforeEach(() => {
    useDataStore.setState({ myId: 'me' } as never);
    useCalendarShareStore.setState({ userId: null, rules: {}, status: 'idle' });
});

describe('useCalendarShareStore', () => {
    it('uses its own encrypted file type', () => {
        expect(CALENDAR_SHARES_FILE_TYPE).toBe('calendar_shares');
    });

    it('loads the rules of the signed-in user', async () => {
        const mem = memoryStorage({ g1: anna });
        const factory = vi.fn(() => mem.storage);
        setCalendarShareStorageFactory(factory);
        await expect(useCalendarShareStore.getState().load()).resolves.toBe(true);
        expect(factory).toHaveBeenCalledWith('me');
        expect(useCalendarShareStore.getState().rules).toEqual({ g1: anna });
        expect(useCalendarShareStore.getState().ruleFor('g1')).toEqual(anna);
    });

    it('does nothing while no user is known', async () => {
        const factory = vi.fn(() => memoryStorage({}).storage);
        setCalendarShareStorageFactory(factory);
        useDataStore.setState({ myId: null } as never);
        await expect(useCalendarShareStore.getState().load()).resolves.toBe(false);
        await expect(useCalendarShareStore.getState().saveRule(anna)).rejects.toThrow();
        expect(factory).not.toHaveBeenCalled();
    });

    it('saving loads first and merges into the stored rules', async () => {
        const other = { ...anna, groupId: 'g2' };
        const mem = memoryStorage({ g2: other });
        setCalendarShareStorageFactory(() => mem.storage);
        await useCalendarShareStore.getState().saveRule(anna);
        expect(mem.read()).toEqual({ g1: anna, g2: other });
        expect(useCalendarShareStore.getState().rules).toEqual({ g1: anna, g2: other });
    });

    it('never overwrites a file it could not read', async () => {
        const mem = memoryStorage({ g2: anna }, { failLoad: true });
        setCalendarShareStorageFactory(() => mem.storage);
        await expect(useCalendarShareStore.getState().saveRule(anna)).rejects.toThrow();
        expect(mem.storage.save).not.toHaveBeenCalled();
        expect(useCalendarShareStore.getState().status).toBe('error');
    });

    it('a rule without recipients deletes the group entry', async () => {
        const mem = memoryStorage({ g1: anna });
        setCalendarShareStorageFactory(() => mem.storage);
        await useCalendarShareStore.getState().saveRule({ ...anna, recipients: [] });
        expect(mem.read()).toEqual({});
    });

    it('drops the rules of the previous user on an account switch', async () => {
        const stores: Record<string, ReturnType<typeof memoryStorage>> = {
            me: memoryStorage({ g1: anna }),
            bob: memoryStorage({}),
        };
        setCalendarShareStorageFactory((userId) => stores[userId].storage);
        await useCalendarShareStore.getState().load();
        expect(useCalendarShareStore.getState().rules).toEqual({ g1: anna });
        useDataStore.setState({ myId: 'bob' } as never);
        expect(useCalendarShareStore.getState().ruleFor('g1')).toBeUndefined();
        await useCalendarShareStore.getState().load();
        expect(useCalendarShareStore.getState().rules).toEqual({});
        expect(useCalendarShareStore.getState().userId).toBe('bob');
    });

    it('saving always re-reads the stored rules first (another device may have written)', async () => {
        const mem = memoryStorage({});
        setCalendarShareStorageFactory(() => mem.storage);
        await useCalendarShareStore.getState().load();
        const other = { ...anna, groupId: 'g2' };
        await mem.storage.save({ g2: other }); // written elsewhere after our load
        await useCalendarShareStore.getState().saveRule(anna);
        expect(mem.read()).toEqual({ g1: anna, g2: other });
    });

    it('freshRules reloads a cached copy older than the max age', async () => {
        const mem = memoryStorage({ g1: anna });
        setCalendarShareStorageFactory(() => mem.storage);
        await useCalendarShareStore.getState().load();
        await mem.storage.save({});
        expect(await useCalendarShareStore.getState().freshRules(60_000)).toEqual({ g1: anna });
        expect(await useCalendarShareStore.getState().freshRules(0)).toEqual({});
    });

    it('removeRule drops a deleted group from the stored file', async () => {
        const mem = memoryStorage({ g1: anna, g2: { ...anna, groupId: 'g2' } });
        setCalendarShareStorageFactory(() => mem.storage);
        await useCalendarShareStore.getState().removeRule('g1');
        expect(Object.keys(mem.read())).toEqual(['g2']);
    });

    it('a removal saved before the sync survives a close/crash and later saves without pendingRevoke', async () => {
        const mem = memoryStorage({ g1: { ...anna, recipients: [...anna.recipients, { userId: 'bob', permission: 'view' as const }] } });
        setCalendarShareStorageFactory(() => mem.storage);
        await useCalendarShareStore.getState().saveRule({ ...anna, pendingRevoke: ['bob'] });
        // dialog closed here, no sync ran; a later save (e.g. toggling auto-share) does not mention pendingRevoke
        await useCalendarShareStore.getState().saveRule({ ...anna, autoShareNew: false });
        expect(mem.read().g1?.pendingRevoke).toEqual(['bob']);
    });
});
