import { create } from 'zustand';
import { apiFetch } from '@/lib/api';

export interface SocialContact {
    contact_row_id: string;
    status: string;
    partner: {
        id: string;
        username: string;
        email: string;
        public_key: string;
        avatar_seed: string;
        avatar_salt: string;
        avatar_style: string;
    };
}

export interface ContactRequest {
    id: string;
    user_id: string;
    username: string;
    avatar_seed: string;
    avatar_salt?: string;
    avatar_style: string;
    created_at: string;
}

interface SocialState {
    contacts: SocialContact[];
    pendingRequests: ContactRequest[];
    sentRequests: Record<string, boolean>; // track locally sent requests
    isFetching: boolean;

    fetchContacts: () => Promise<void>;
    fetchPendingRequests: () => Promise<void>;
    sendRequest: (targetUserId: string) => Promise<boolean>;
    acceptRequest: (requestId: string) => Promise<boolean>;
    declineRequest: (requestId: string) => Promise<boolean>;
    removeContact: (contactUserId: string) => Promise<boolean>;

    // Derived
    requestCount: () => number;
    isContact: (userId: string) => boolean;
    hasSentRequest: (userId: string) => boolean;
}

export const useSocialStore = create<SocialState>((set, get) => ({
    contacts: [],
    pendingRequests: [],
    sentRequests: {},
    isFetching: false,

    requestCount: () => get().pendingRequests.length,

    isContact: (userId: string) =>
        get().contacts.some(c => c.partner.id === userId),

    hasSentRequest: (userId: string) => !!get().sentRequests[userId],

    fetchContacts: async () => {
        try {
            const res = await apiFetch('/api/v1/contacts');
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    set({ contacts: data });
                }
            }
        } catch (e) {
            console.error('[SocialStore] fetchContacts failed', e);
        }
    },

    fetchPendingRequests: async () => {
        try {
            console.log('[SocialStore] Fetching pending requests...');
            const res = await apiFetch('/api/v1/contacts/requests');
            if (res.ok) {
                const data = await res.json();
                console.log('[SocialStore] Pending requests data:', data);
                if (Array.isArray(data)) {
                    set({ pendingRequests: data });
                }
            } else {
                console.error('[SocialStore] Failed to fetch requests. Status:', res.status);
            }
        } catch (e) {
            console.error('[SocialStore] fetchPendingRequests failed', e);
        }
    },

    sendRequest: async (targetUserId: string) => {
        try {
            const res = await apiFetch(`/api/v1/contacts/${targetUserId}`, { method: 'POST' });
            if (res.ok) {
                set(s => ({ sentRequests: { ...s.sentRequests, [targetUserId]: true } }));
                return true;
            }
            return false;
        } catch (e) {
            console.error('[SocialStore] sendRequest failed', e);
            return false;
        }
    },

    acceptRequest: async (requestId: string) => {
        try {
            const res = await apiFetch(`/api/v1/contacts/accept/${requestId}`, { method: 'POST' });
            if (res.ok) {
                set(s => ({
                    pendingRequests: s.pendingRequests.filter(r => r.id !== requestId)
                }));
                // Refresh contacts list after accepting
                await get().fetchContacts();
                return true;
            }
            return false;
        } catch (e) {
            console.error('[SocialStore] acceptRequest failed', e);
            return false;
        }
    },

    declineRequest: async (requestId: string) => {
        try {
            const res = await apiFetch(`/api/v1/contacts/decline/${requestId}`, { method: 'POST' });
            if (res.ok) {
                set(s => ({
                    pendingRequests: s.pendingRequests.filter(r => r.id !== requestId)
                }));
                return true;
            }
            return false;
        } catch (e) {
            console.error('[SocialStore] declineRequest failed', e);
            return false;
        }
    },

    removeContact: async (contactUserId: string) => {
        const contact = get().contacts.find(c => c.partner.id === contactUserId);
        if (!contact) return false;
        try {
            const res = await apiFetch(`/api/v1/contacts/${contact.contact_row_id}`, { method: 'DELETE' });
            if (res.ok) {
                set(s => ({
                    contacts: s.contacts.filter(c => c.partner.id !== contactUserId)
                }));
                return true;
            }
            return false;
        } catch (e) {
            console.error('[SocialStore] removeContact failed', e);
            return false;
        }
    },
}));
