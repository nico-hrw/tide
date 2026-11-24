import type { ContactItem, ContactsSlice, DataStoreSlice } from './types';
import { apiFetch } from '@/lib/api';

interface RawContactRecord {
    id?: string;
    username?: string;
    email?: string;
    avatar_seed?: string;
    avatar_salt?: string;
    avatar_style?: string;
    status?: string;
    contact_row_id?: string;
    public_key?: string;
    partner?: {
        id?: string;
        username?: string;
        email?: string;
        avatar_seed?: string;
        avatar_salt?: string;
        avatar_style?: string;
        status?: string;
        public_key?: string;
    };
}

export function normalizeContact(item: RawContactRecord): ContactItem {
    if (item.partner) {
        return {
            id: item.partner.id || item.contact_row_id || '',
            username: item.partner.username || '',
            email: item.partner.email,
            avatar_seed: item.partner.avatar_seed,
            avatar_salt: item.partner.avatar_salt,
            avatar_style: item.partner.avatar_style,
            status: item.status || item.partner.status,
            public_key: item.partner.public_key || item.public_key,
        };
    }
    return {
        id: item.id || '',
        username: item.username || '',
        email: item.email,
        avatar_seed: item.avatar_seed,
        avatar_salt: item.avatar_salt,
        avatar_style: item.avatar_style,
        status: item.status,
        public_key: item.public_key,
    };
}

export const createContactsSlice: DataStoreSlice<ContactsSlice> = (set) => ({
    contacts: [],
    contactsList: [],

    setContacts: (contacts: ContactItem[]) =>
        set({ contacts, contactsList: contacts }),

    setContactsList: (contacts: ContactItem[]) =>
        set({ contacts, contactsList: contacts }),

    fetchContacts: async () => {
        try {
            const res = await apiFetch('/api/v1/contacts');
            if (!res.ok) return;

            const data = (await res.json().catch(() => null)) as unknown;
            if (Array.isArray(data)) {
                const normalized: ContactItem[] = data
                    .filter(
                        (item): item is RawContactRecord =>
                            typeof item === 'object' && item !== null
                    )
                    .map(normalizeContact);

                set({
                    contacts: normalized,
                    contactsList: normalized,
                });
            }
        } catch (error) {
            console.error('[ContactsSlice] Failed to fetch contacts:', error);
        }
    },
});
