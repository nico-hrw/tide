import { performMessengerShare } from '@/lib/shareLogic';
import { apiFetch } from '@/lib/api';
import { encryptChatMessage } from '@/lib/chatCrypto';
import { fetchShareUserIds, revokeMentionShare } from '@/lib/mentionShare';
import { getEventGroupIds } from '@/lib/calendarUtils';
import { notify, notifyError } from '@/lib/feedback';
import { formatMessage, getTranslation, type SettingsKey } from '@/lib/i18n';
import { useDataStore } from '@/store/useDataStore';
import { useCalendarShareStore } from '@/store/useCalendarShareStore';
import {
    applyGroupShares, isOwnedEvent, mergeRulesForEvent, planGroupShares, shareNewEvent,
    type ApplyResult, type CalendarSharePermission, type CalendarShareRule, type PlanEvent, type PlannedShare,
} from './calendarShare';

/**
 * Network side of calendar sharing. Same share path as @-mentions (Task 4): performMessengerShare with
 * the contact's public key from the contact list, owner-only, and a share only counts as done when
 * the call succeeded or the server lists the person afterwards.
 */

type StoreEvent = { id: string; title?: string; private?: boolean; owner_id?: string; share_status?: string; groupIds?: string[]; parent_id?: string | null };

function tr(key: SettingsKey, vars?: Record<string, string | number>): string {
    const lang = useDataStore.getState().language === 'en' ? 'en' : 'de';
    return formatMessage(getTranslation(lang, 'settings', key), vars);
}

const baseIdOf = (id: string): string => id.split('_')[0];

function storeEvent(eventId: string): StoreEvent | undefined {
    return (useDataStore.getState().events as unknown as StoreEvent[]).find((e) => e.id === eventId);
}

function toPlanEvent(e: StoreEvent, myId: string | null): PlanEvent {
    return { id: e.id, groupIds: getEventGroupIds(e), private: e.private === true, owned: isOwnedEvent(e, myId) };
}

/** shareOne for the planner: shares one own event with one accepted contact. Throws when it did not land. */
export async function shareEventWithContact(eventId: string, userId: string, permission: CalendarSharePermission): Promise<void> {
    const s = useDataStore.getState();
    if (!s.privateKey || !s.publicKey || !s.myId) throw new Error('no-keys');
    const event = storeEvent(eventId);
    if (!event) throw new Error('event-missing');
    if (!isOwnedEvent(event, s.myId)) throw new Error('not-owner');
    const contact = (s.contacts || []).find((c) => c.id === userId);
    if (!contact || contact.status !== 'accepted' || !contact.public_key) throw new Error('not-shareable');
    try {
        await performMessengerShare(
            { id: eventId, title: event.title || '', type: 'event' }, s.myId, s.privateKey, s.publicKey,
            s.events || [], userId, contact.email || '', contact.public_key, permission, [], false,
            { notify: false }, // no chat card per event: bulk syncs send one summary, auto-share only toasts
        );
    } catch (err) {
        // The share may have landed before the chat notice failed: then it is shared.
        if ((await fetchShareUserIds(eventId))?.includes(userId)) return;
        throw err;
    }
}

/** Events of the group with their current share lists (fetched lazily, a few at a time). */
export async function loadGroupEvents(groupId: string, onProgress?: (done: number, total: number) => void): Promise<PlanEvent[]> {
    const myId = useDataStore.getState().myId;
    const events = (useDataStore.getState().events as unknown as StoreEvent[])
        .filter((e) => getEventGroupIds(e).includes(groupId))
        .map((e) => toPlanEvent(e, myId));
    const toCheck = events.filter((e) => e.owned);
    let done = 0;
    let next = 0;
    const worker = async () => {
        while (next < toCheck.length) {
            const e = toCheck[next++];
            const ids = await fetchShareUserIds(e.id);
            if (ids) e.sharedWith = ids; // unreadable stays unchecked, never "not shared"
            onProgress?.(++done, toCheck.length);
        }
    };
    onProgress?.(0, toCheck.length);
    await Promise.all([worker(), worker(), worker(), worker()]);
    return events;
}

export type GroupSyncResult = ApplyResult & {
    total: number;
    events: PlanEvent[];
    /** People whose access could not be removed everywhere (kept in the rules file and retried). */
    pendingRevoke: string[];
    /** The pending list could not be written back. */
    persistFailed: boolean;
};

const enc = encodeURIComponent;

/** One encrypted chat message per person after a bulk share ("Kalender „Arbeit“ mit dir geteilt · 14 Termine"). Best effort. */
async function sendCalendarSummary(userId: string, groupTitle: string, count: number): Promise<void> {
    try {
        const s = useDataStore.getState();
        const contact = (s.contacts || []).find((c) => c.id === userId);
        if (!s.myId || !s.publicKey || !contact?.public_key) return;
        const text = tr(count === 1 ? 'calShare.summaryOne' : 'calShare.summaryMany', { name: groupTitle, count });
        const content = await encryptChatMessage(text, s.myId, s.publicKey, userId, contact.public_key);
        const res = await apiFetch('/api/v1/messages', {
            method: 'POST',
            offline: 'never',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipient_id: userId, recipient_email: contact.email || '', content }),
        });
        if (!res.ok) console.warn('[calendar-shares] summary message failed', res.status);
    } catch (e) {
        console.warn('[calendar-shares] summary message failed', e);
    }
}

/** DELETE that treats "no such share" (404) as done: removing is idempotent. */
async function revokeIdempotent(eventId: string, userId: string): Promise<void> {
    const res = await apiFetch(`/api/v1/files/${enc(eventId)}/shares/${enc(userId)}`, { method: 'DELETE', offline: 'never' });
    if (!res.ok && res.status !== 404) throw new Error(`Revoke failed: ${res.status}`);
}

/** PATCH that treats "no such share" (404) as done. */
async function patchIdempotent(eventId: string, userId: string, permission: CalendarSharePermission): Promise<void> {
    const res = await apiFetch(`/api/v1/files/${enc(eventId)}/shares/${enc(userId)}`, {
        method: 'PATCH',
        offline: 'never',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission }),
    });
    if (!res.ok && res.status !== 404) throw new Error(`Permission update failed: ${res.status}`);
}

/**
 * Brings the shares of a group in line with its rule: revokes removed people (from the dialog and the
 * rule's `pendingRevoke`) on every own event of the group, private ones too, and also on events whose
 * share list could not be read (fail closed). Changes the right of people whose right was changed, then
 * shares what is missing. People not removed everywhere stay in `pendingRevoke` in the rules file.
 * Safe to run again ("Erneut versuchen"): it starts from the server's lists.
 */
export async function syncGroupShares(args: {
    rule: CalendarShareRule;
    removed: string[];
    permissionChanged: string[];
    /**
     * 'full' (default, only after the user confirmed): revoke, change rights, share missing events, send summaries.
     * 'revoke-only' (retrying unfinished removals without a confirm): only the revokes and the pending merge.
     */
    mode?: 'full' | 'revoke-only';
    /** Calendar name for the one summary chat message per person who got new events. */
    groupTitle?: string;
    onProgress?: (p: { phase: 'check' | 'apply'; done: number; total: number }) => void;
}): Promise<GroupSyncResult> {
    const { rule, onProgress } = args;
    const full = args.mode !== 'revoke-only';
    const permissionChanged = full ? args.permissionChanged : [];
    const keep = new Set(rule.recipients.map((r) => r.userId));
    const removed = [...new Set([...args.removed, ...(rule.pendingRevoke ?? [])])].filter((u) => !keep.has(u));
    const events = await loadGroupEvents(rule.groupId, (done, total) => onProgress?.({ phase: 'check', done, total }));
    const byId = new Map(events.map((e) => [e.id, e]));
    const own = events.filter((e) => e.owned);
    // Unknown list (undefined) = might have it: try anyway.
    const mayHave = (e: PlanEvent, u: string) => !e.sharedWith || e.sharedWith.includes(u);
    const revokes: PlannedShare[] = own.flatMap((e) =>
        removed.filter((u) => mayHave(e, u)).map((u) => ({ eventId: e.id, userId: u, permission: 'view' as const })));
    const patches: PlannedShare[] = own.flatMap((e) =>
        rule.recipients.filter((r) => permissionChanged.includes(r.userId) && mayHave(e, r.userId))
            .map((r) => ({ eventId: e.id, userId: r.userId, permission: r.permission })));
    // Sharing only on events whose list was read: an unreadable list is "unchecked", never "nobody has it".
    const shares = full ? planGroupShares({ events: events.filter((e) => e.sharedWith), rule }) : [];
    const total = revokes.length + patches.length + shares.length;

    let offset = 0;
    const report = (p: ApplyResult) => onProgress?.({ phase: 'apply', done: offset + p.done + p.failed, total });
    const run = async (plan: PlannedShare[], step: (p: PlannedShare) => Promise<void>): Promise<ApplyResult> => {
        const res = await applyGroupShares(plan, (eventId, userId, permission) => step({ eventId, userId, permission }), report);
        offset += plan.length;
        return res;
    };
    const stillPending = new Set<string>();
    const sharedCount = new Map<string, number>();
    const r1 = await run(revokes, async (p) => {
        try {
            await revokeIdempotent(p.eventId, p.userId);
        } catch (err) {
            stillPending.add(p.userId);
            throw err;
        }
        const e = byId.get(p.eventId);
        if (e?.sharedWith) e.sharedWith = e.sharedWith.filter((u) => u !== p.userId);
    });
    const r2 = await run(patches, (p) => patchIdempotent(p.eventId, p.userId, p.permission));
    const r3 = await run(shares, async (p) => {
        await shareEventWithContact(p.eventId, p.userId, p.permission);
        sharedCount.set(p.userId, (sharedCount.get(p.userId) ?? 0) + 1);
        const e = byId.get(p.eventId);
        if (e?.sharedWith && !e.sharedWith.includes(p.userId)) e.sharedWith = [...e.sharedWith, p.userId];
    });

    if (full) for (const [userId, count] of sharedCount) await sendCalendarSummary(userId, args.groupTitle ?? '', count);

    const pendingRevoke = [...stillPending];
    // Merge into the stored list (re-read inside updateRule): drop only people fully revoked in THIS run,
    // keep failures and any entry this run did not handle (e.g. added by another device meanwhile).
    const finished = new Set(removed.filter((u) => !stillPending.has(u)));
    let persistFailed = false;
    if (removed.length > 0) {
        try {
            await useCalendarShareStore.getState().updateRule(rule.groupId, (current) => {
                if (!current) return undefined; // calendar (and rule) deleted meanwhile: never recreate it
                const merged = [...new Set([...(current.pendingRevoke ?? []), ...pendingRevoke])].filter((u) => !finished.has(u));
                return { ...current, pendingRevoke: merged }; // explicit list ([] clears); re-added recipients are dropped by upsert
            });
        } catch {
            persistFailed = true;
        }
    }
    return { done: r1.done + r2.done + r3.done, failed: r1.failed + r2.failed + r3.failed, total, events, pendingRevoke, persistFailed };
}

const runningSyncs = new Map<string, Promise<GroupSyncResult>>();

/** The sync running for this calendar, if any (also when the dialog was closed and reopened). */
export function groupSyncInFlight(groupId: string): Promise<GroupSyncResult> | undefined {
    return runningSyncs.get(groupId);
}

/** Runs syncGroupShares unless one already runs for the same calendar (then rejects with 'sync-running'). */
export function startGroupSync(args: Parameters<typeof syncGroupShares>[0]): Promise<GroupSyncResult> {
    const groupId = args.rule.groupId;
    if (runningSyncs.has(groupId)) return Promise.reject(new Error('sync-running'));
    const run = syncGroupShares(args);
    runningSyncs.set(groupId, run);
    void run.finally(() => { if (runningSyncs.get(groupId) === run) runningSyncs.delete(groupId); }).catch(() => undefined);
    return run;
}

const RULE_MAX_AGE_MS = 60_000;

const autoQueue = new Map<string, Promise<unknown>>();

/** An own event entered one or more groups: share it per the groups' auto-share rules (never for private events). */
export function autoShareEventIntoGroups(eventId: string, groupIds: string[]): Promise<ApplyResult> {
    const id = baseIdOf(eventId);
    const prev = autoQueue.get(id) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(() => autoShareOnce(id, groupIds));
    autoQueue.set(id, run);
    void run.finally(() => { if (autoQueue.get(id) === run) autoQueue.delete(id); }).catch(() => undefined);
    return run;
}

async function autoShareOnce(eventId: string, groupIds: string[]): Promise<ApplyResult> {
    const none = { done: 0, failed: 0 };
    if (groupIds.length === 0) return none;
    // Another device may have changed or removed the rule: never act on a copy older than a minute.
    const rules = await useCalendarShareStore.getState().freshRules(RULE_MAX_AGE_MS);
    if (!rules) return none;
    const merged = mergeRulesForEvent(groupIds, rules);
    const event = storeEvent(eventId);
    if (!merged || !event) return none;
    const planEvent = toPlanEvent(event, useDataStore.getState().myId);
    if (planEvent.private || !planEvent.owned) return none;
    const listed = await fetchShareUserIds(eventId);
    if (listed === null) {
        notifyError(tr('calShare.autoFailed', { count: merged.recipients.length }));
        return { done: 0, failed: merged.recipients.length };
    }
    const rule = { ...merged, recipients: merged.recipients.filter((r) => !listed.includes(r.userId)) };
    if (rule.recipients.length === 0) return none;
    const res = await shareNewEvent({ ...planEvent, groupIds: [rule.groupId] }, rule, shareEventWithContact);
    if (res.done > 0) notify(res.done === 1 ? tr('calShare.autoSharedOne') : tr('calShare.autoShared', { count: res.done }), { tone: 'success' });
    if (res.failed > 0) notifyError(tr('calShare.autoFailed', { count: res.failed }));
    return res;
}

/** Group recipients that currently have this event; null when the share list cannot be read. */
export async function groupRecipientsWithShare(eventId: string): Promise<string[] | null> {
    const id = baseIdOf(eventId);
    const event = storeEvent(id);
    if (!event) return [];
    const rules = await useCalendarShareStore.getState().freshRules(RULE_MAX_AGE_MS);
    if (!rules) return null;
    const recipients = new Set(getEventGroupIds(event).flatMap((g) => rules[g]?.recipients.map((r) => r.userId) ?? []));
    if (recipients.size === 0) return [];
    const listed = await fetchShareUserIds(id);
    return listed === null ? null : listed.filter((u) => recipients.has(u));
}

/** Revokes the given people from one event, one after another. */
export function revokeEventShares(eventId: string, userIds: string[]): Promise<ApplyResult> {
    const id = baseIdOf(eventId);
    return applyGroupShares(userIds.map((userId) => ({ eventId: id, userId, permission: 'view' as const })), (e, u) => revokeMentionShare(e, u));
}
