import { parseEventMentions } from '@/lib/eventMentions';
import { isOwnedEvent } from '@/lib/calendarShare';
import { notifyError } from '@/lib/feedback';
import { formatMessage, getTranslation } from '@/lib/i18n';
import { revokeMentionShare, shareViaMention, type MentionShareResult } from '@/lib/mentionShare';
import { useDataStore } from '@/store/useDataStore';
import { useMentionShareStore } from '@/store/useMentionShareStore';

/**
 * Sharing an event (or task event) because its description @-mentions a contact. Same flow and
 * toast as note mentions (mentionShare.ts); the file is the base event, never an occurrence.
 * Sharing only ever starts from an explicit menu pick, never from loading, syncing or pasting.
 */
export type EventMentionBlock = 'not-allowed' | 'private' | 'not-shareable' | 'no-key';

type StoreEvent = { id: string; title?: string; owner_id?: string; share_status?: string; private?: boolean };

const baseIdOf = (eventId: string) => eventId.split('_')[0];

function storeEvent(baseId: string): StoreEvent | undefined {
    return (useDataStore.getState().events as unknown as StoreEvent[]).find((e) => e.id === baseId);
}

/** An existing event the signed-in user owns (the server lets only owners list and revoke shares). */
export function canMentionInEvent(eventId: string): boolean {
    const e = storeEvent(baseIdOf(eventId));
    return !!e && isOwnedEvent(e, useDataStore.getState().myId);
}

/**
 * Checks before a mention token is inserted. A failed check shows the hint and the caller inserts
 * nothing. `isPrivate` is the live flag of an open editor (the store may lag behind it).
 */
export function precheckEventMention(o: { eventId: string; contactId: string; isPrivate?: boolean }): { ok: true } | { ok: false; reason: EventMentionBlock } {
    const baseId = baseIdOf(o.eventId);
    const state = useDataStore.getState();
    const event = storeEvent(baseId);
    const contact = (state.contacts || []).find((c) => c.id === o.contactId);
    let reason: EventMentionBlock | null = null;
    if (!event || !isOwnedEvent(event, state.myId)) reason = 'not-allowed';
    else if (o.isPrivate === true || event.private === true) reason = 'private';
    else if (!contact || contact.status !== 'accepted') reason = 'not-shareable';
    else if (!contact.public_key) reason = 'no-key';
    if (!reason) return { ok: true };
    useMentionShareStore.getState().showHint({
        fileId: baseId, fileTitle: event?.title || '', contactId: o.contactId,
        name: contact?.username || '', status: 'blocked', reason, permission: 'view',
    });
    return { ok: false, reason };
}

/** Shares the event with the picked contact ("view") and shows the hint (none when they already had access). */
export async function shareEventViaMention(o: { eventId: string; contactId: string; label: string; isPrivate?: boolean }): Promise<MentionShareResult> {
    const check = precheckEventMention(o);
    if (!check.ok) return { status: 'blocked', reason: check.reason };
    const baseId = baseIdOf(o.eventId);
    const event = storeEvent(baseId);
    const c = (useDataStore.getState().contacts || []).find((x) => x.id === o.contactId);
    const title = event?.title || '';
    const res = await shareViaMention({
        file: { id: baseId, title, type: 'event' },
        contact: { id: o.contactId, email: c?.email, public_key: c?.public_key, shareable: true },
        callerCanShare: true,
    });
    if (res.status !== 'already') {
        useMentionShareStore.getState().showHint({
            fileId: baseId, fileTitle: title, contactId: o.contactId, name: o.label,
            status: res.status, reason: res.reason, permission: 'view',
        });
    }
    return res;
}

/** "Rückgängig": revoke, then forget the entry so removing the token asks nothing. */
export async function undoEventMentionShare(eventId: string, contactId: string): Promise<boolean> {
    const baseId = baseIdOf(eventId);
    try {
        await revokeMentionShare(baseId, contactId);
    } catch {
        const lang = useDataStore.getState().language === 'en' ? 'en' : 'de';
        notifyError(formatMessage(getTranslation(lang, 'settings', 'mention.revokeFailed')));
        return false;
    }
    useMentionShareStore.getState().clear(baseId, contactId);
    return true;
}

/**
 * Picks of one editing session (a sheet that saves only on "Speichern"). The share happens at the
 * pick; discarding the edit must not leave it behind without a trace in the saved description.
 */
export interface MentionSession { picks: Set<string>; discarded: boolean; saved: string }

export function createMentionSession(): MentionSession {
    return { picks: new Set(), discarded: false, saved: '' };
}

async function revokeIfOurs(s: MentionSession, eventId: string, contactId: string): Promise<void> {
    if (parseEventMentions(s.saved).some((m) => m.id === contactId)) return;
    // Only shares this app made from a mention; never one that existed before or came from elsewhere.
    if (useMentionShareStore.getState().origin(baseIdOf(eventId), contactId) !== 'mention') return;
    await undoEventMentionShare(eventId, contactId);
}

/** Call once a pick created a share (status 'shared'). Revokes right away when the edit was already discarded. */
export function recordSessionPick(s: MentionSession, eventId: string, contactId: string): void {
    s.picks.add(contactId);
    if (s.discarded) void revokeIfOurs(s, eventId, contactId);
}

/** The edit was thrown away: revoke the session's shares whose token is not in the saved description. */
export async function discardMentionSession(s: MentionSession, eventId: string, savedDescription: string): Promise<void> {
    s.discarded = true;
    s.saved = savedDescription;
    for (const id of [...s.picks]) await revokeIfOurs(s, eventId, id);
    s.picks.clear();
}
