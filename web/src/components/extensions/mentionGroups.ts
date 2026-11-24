import { useDataStore } from '@/store/useDataStore';
import type { ContactItem } from '@/store/slices/types';

export type MentionGroupKey = 'person' | 'note' | 'event' | 'todo' | 'tag';
export type MentionFilter = 'all' | MentionGroupKey;

export const GROUP_ORDER: MentionGroupKey[] = ['person', 'note', 'event', 'todo', 'tag'];
const MAX_CONTACTS = 5;

export function groupKeyOf(item: { type?: string; is_task?: boolean }): MentionGroupKey {
    if (item.type === 'contact') return 'person';
    if (item.type === 'tag') return 'tag';
    if (item.is_task || item.type === 'task') return 'todo';
    if (item.type === 'event') return 'event';
    return 'note';
}

export interface ContactMentionItem {
    id: string;
    label: string;
    type: 'contact';
    username: string;
    avatar: Pick<ContactItem, 'avatar_seed' | 'avatar_salt' | 'avatar_style'>;
    shareable: boolean;
}

export function buildContactItems(contacts: ContactItem[], query: string): ContactMentionItem[] {
    const q = query.trim().toLowerCase().replace(/^@/, '');
    const matches = contacts.filter((c) => c.username.toLowerCase().includes(q));
    const prefix = matches.filter((c) => c.username.toLowerCase().startsWith(q));
    const rest = matches.filter((c) => !c.username.toLowerCase().startsWith(q));
    return [...prefix, ...rest].slice(0, MAX_CONTACTS).map((c) => ({
        id: c.id,
        label: c.username,
        type: 'contact' as const,
        username: c.username,
        avatar: { avatar_seed: c.avatar_seed, avatar_salt: c.avatar_salt, avatar_style: c.avatar_style },
        shareable: c.status === 'accepted' && !!c.public_key,
    }));
}

/** Contacts only for a plain non-empty query outside the quicknote menu, tag mode and ghost links. */
export function shouldOfferContacts(o: { query: string; isQuicknote: boolean; tagMode: boolean }): boolean {
    const q = o.query.trim();
    return !o.isQuicknote && !o.tagMode && q.length > 0 && !q.startsWith('!');
}

/** A chip whose group has no items falls back to 'all' so the menu never strands on an empty list. */
export function effectiveFilter(filter: MentionFilter, counts: Partial<Record<MentionGroupKey, number>>): MentionFilter {
    return filter !== 'all' && !counts[filter] ? 'all' : filter;
}

export function groupItems<T extends { type?: string; is_task?: boolean }>(
    items: T[],
    filter: MentionFilter,
    opts?: { tagsFirst?: boolean },
): Array<{ key: MentionGroupKey; items: T[] }> {
    const order = opts?.tagsFirst ? (['tag', ...GROUP_ORDER.filter((k) => k !== 'tag')] as MentionGroupKey[]) : GROUP_ORDER;
    return order
        .filter((key) => filter === 'all' || filter === key)
        .map((key) => ({ key, items: items.filter((i) => groupKeyOf(i) === key) }))
        .filter((g) => g.items.length > 0);
}

let contactsRequested = false;
/** Call on each menu open so a failed or stale load is retried. */
export function resetContactsRequest(): void {
    contactsRequested = false;
}
/** Fire-and-forget: load contacts when the list is empty; the flag resets if the load yielded nothing. */
export function ensureContactsLoaded(): ContactItem[] {
    const state = useDataStore.getState();
    const list = state.contacts || [];
    if (list.length === 0 && !contactsRequested && typeof state.fetchContacts === 'function') {
        contactsRequested = true;
        void state.fetchContacts().finally(() => {
            if ((useDataStore.getState().contacts || []).length === 0) contactsRequested = false;
        });
    }
    return list;
}
