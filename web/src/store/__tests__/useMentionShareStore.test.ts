import { beforeEach, describe, expect, it } from 'vitest';
import { useDataStore } from '@/store/useDataStore';
import { clearMentionShares, mentionSharesKey, useMentionShareStore } from '@/store/useMentionShareStore';
import { clearAllSessionData } from '@/lib/api';

beforeEach(() => {
    localStorage.clear();
    useDataStore.setState({ myId: null });
    useMentionShareStore.setState({ userId: null, entries: {}, hint: null });
});

describe('mentionSharesKey', () => {
    it('is per user and null while the user is unknown', () => {
        expect(mentionSharesKey('u-a')).toBe('tide_mention_shares:u-a');
        expect(mentionSharesKey(null)).toBeNull();
        expect(mentionSharesKey('')).toBeNull();
    });
});

describe('useMentionShareStore per user', () => {
    it('reads and writes nothing while the user is unknown', () => {
        const s = useMentionShareStore.getState();
        s.record('f1', 'p1');
        expect(s.origin('f1', 'p1')).toBeUndefined();
        expect(localStorage.length).toBe(0);
    });

    it('persists under the user key and reloads when the user changes', () => {
        useDataStore.setState({ myId: 'alice' });
        useMentionShareStore.getState().record('f1', 'p1');
        expect(localStorage.getItem('tide_mention_shares:alice')).toContain('f1:p1');
        expect(localStorage.getItem('tide_mention_shares')).toBeNull();

        useDataStore.setState({ myId: 'bob' });
        expect(useMentionShareStore.getState().origin('f1', 'p1')).toBeUndefined();
        useMentionShareStore.getState().record('f2', 'p2');
        expect(localStorage.getItem('tide_mention_shares:alice')).not.toContain('f2');

        useDataStore.setState({ myId: 'alice' });
        expect(useMentionShareStore.getState().origin('f1', 'p1')).toBe('mention');
        expect(useMentionShareStore.getState().origin('f2', 'p2')).toBeUndefined();
    });

    it('clearMentionShares removes every user record and the memory copy', () => {
        useDataStore.setState({ myId: 'alice' });
        useMentionShareStore.getState().record('f1', 'p1');
        localStorage.setItem('tide_mention_shares:bob', '{"x:y":1}');
        localStorage.setItem('other', '1');
        clearMentionShares();
        expect(localStorage.getItem('tide_mention_shares:alice')).toBeNull();
        expect(localStorage.getItem('tide_mention_shares:bob')).toBeNull();
        expect(localStorage.getItem('other')).toBe('1');
        expect(useMentionShareStore.getState().origin('f1', 'p1')).toBeUndefined();
    });

    it('logout (clearAllSessionData) removes the records', async () => {
        localStorage.setItem('tide_mention_shares:alice', '{"f:p":1}');
        await clearAllSessionData();
        expect(localStorage.getItem('tide_mention_shares:alice')).toBeNull();
    });
});
