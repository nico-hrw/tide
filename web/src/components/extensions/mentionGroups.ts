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

export function groupItems<T extends { type?: string; is_task?: boolean }>(
    items: T[],
    filter: MentionFilter,
): Array<{ key: MentionGroupKey; items: T[] }> {
    return GROUP_ORDER
        .filter((key) => filter === 'all' || filter === key)
        .map((key) => ({ key, items: items.filter((i) => groupKeyOf(i) === key) }))
        .filter((g) => g.items.length > 0);
}

let contactsRequested = false;
/** Fire-and-forget: load contacts once when the menu is first used and the list is empty. */
export function ensureContactsLoaded(): ContactItem[] {
    const state = useDataStore.getState();
    const list = state.contacts || [];
    if (list.length === 0 && !contactsRequested && typeof state.fetchContacts === 'function') {
        contactsRequested = true;
        void state.fetchContacts();
    }
    return list;
}
