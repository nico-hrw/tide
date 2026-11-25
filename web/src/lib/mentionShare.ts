import type { Editor } from '@tiptap/core';
import { apiFetch } from '@/lib/api';
import { performMessengerShare } from '@/lib/shareLogic';
import { askConfirm, notifyError } from '@/lib/feedback';
import { formatMessage, getTranslation, type SettingsKey } from '@/lib/i18n';
import { useDataStore } from '@/store/useDataStore';
import { useActiveNoteStore } from '@/store/activeNoteStore';
import { useMentionShareStore, type MentionSharePermission } from '@/store/useMentionShareStore';

/**
 * @-mentioning a contact shares the current note with them ("view"), see
 * docs/superpowers/specs/2026-11-24-mentions-sharing-design.md (Randfälle).
 * The server stays the real enforcer; the client checks only avoid pointless calls.
 */

export type MentionShareResult = { status: 'shared' | 'already' | 'blocked' | 'failed'; reason?: string };

export interface MentionShareArgs {
    file: { id: string; title: string; type?: string };
    contact: { id: string; email?: string; public_key?: string; shareable: boolean };
    callerCanShare: boolean;
}

const enc = encodeURIComponent;

function tr(key: SettingsKey, vars?: Record<string, string | number>): string {
    const lang = useDataStore.getState().language === 'en' ? 'en' : 'de';
    return formatMessage(getTranslation(lang, 'settings', key), vars);
}

/** User ids the file is shared with, or null when the list could not be read (non-owners get 403). */
export async function fetchShareUserIds(fileId: string): Promise<string[] | null> {
    try {
        const res = await apiFetch(`/api/v1/files/${enc(fileId)}/shares`, { offline: 'never' });
        if (!res.ok) return null;
        const data: unknown = await res.json().catch(() => undefined);
        if (data === null) return []; // Go encodes an empty share list as null
        if (!Array.isArray(data)) return null;
        return data
            .map((s) => (!!s && typeof s === 'object' ? (s as { user_id?: unknown }).user_id : undefined))
            .filter((id): id is string => typeof id === 'string');
    } catch {
        return null;
    }
}

/** true/false = listed or not, null = the list could not be read. */
async function isListed(fileId: string, userId: string): Promise<boolean | null> {
    const ids = await fetchShareUserIds(fileId);
    return ids === null ? null : ids.includes(userId);
}

async function shareOnce({ file, contact }: MentionShareArgs, publicKeySpki: string): Promise<MentionShareResult> {
    const s = useDataStore.getState();
    if (!s.privateKey || !s.publicKey || !s.myId) return { status: 'failed', reason: 'no-keys' };
    const store = useMentionShareStore.getState();

    const listed = await isListed(file.id, contact.id);
    if (listed === null) return { status: 'failed', reason: 'shares-unavailable' };
    if (listed) {
        // Another mention of this person already created the share: count this chip too.
        if (store.origin(file.id, contact.id)) store.record(file.id, contact.id);
        return { status: 'already' };
    }
    // An entry without a live share is stale (revoked elsewhere): start over.
    store.clear(file.id, contact.id);

    try {
        await performMessengerShare(
            file, s.myId, s.privateKey, s.publicKey, s.events || [],
            contact.id, contact.email || '', publicKeySpki, 'view', [], false,
        );
    } catch (err) {
        // The share itself may have landed before a later step (chat notice) failed. Say so, but
        // record no origin: only a share call that itself succeeded may be revoked via a chip delete.
        if ((await isListed(file.id, contact.id)) === true) {
            return { status: 'shared', reason: 'notify-failed' };
        }
        return { status: 'failed', reason: err instanceof Error ? err.message : 'share-error' };
    }
    store.record(file.id, contact.id);
    return { status: 'shared' };
}

const inFlight = new Map<string, Promise<MentionShareResult>>();

export async function shareViaMention(args: MentionShareArgs): Promise<MentionShareResult> {
    const { file, contact, callerCanShare } = args;
    const spki = contact.public_key;
    if (!contact.shareable) return { status: 'blocked', reason: 'not-shareable' };
    if (!spki) return { status: 'blocked', reason: 'no-key' };
    if (!callerCanShare) return { status: 'blocked', reason: 'not-allowed' };

    const key = `${file.id}:${contact.id}`;
    const previous = inFlight.get(key);
    const run = async (): Promise<MentionShareResult> => {
        if (previous) {
            const prev = await previous.catch(() => null);
            if (prev?.status === 'shared') {
                const store = useMentionShareStore.getState();
                if (store.origin(file.id, contact.id)) store.record(file.id, contact.id);
                return { status: 'already' };
            }
        }
        return shareOnce(args, spki);
    };
    const p = run();
    inFlight.set(key, p);
    try {
        return await p;
    } finally {
        if (inFlight.get(key) === p) inFlight.delete(key);
    }
}

export async function revokeMentionShare(fileId: string, userId: string): Promise<void> {
    const res = await apiFetch(`/api/v1/files/${enc(fileId)}/shares/${enc(userId)}`, { method: 'DELETE', offline: 'never' });
    if (!res.ok) throw new Error(`Revoke failed: ${res.status}`);
}

export async function updateMentionSharePermission(fileId: string, userId: string, permission: MentionSharePermission): Promise<void> {
    const res = await apiFetch(`/api/v1/files/${enc(fileId)}/shares/${enc(userId)}`, {
        method: 'PATCH',
        offline: 'never',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission }),
    });
    if (!res.ok) throw new Error(`Permission update failed: ${res.status}`);
}

/**
 * Owner only. The server also lets non-owners with can_reshare share, but listing,
 * changing and revoking shares is owner-only there, so the mandatory undo could not work.
 */
export function callerCanShareFile(
    note: Record<string, unknown> | undefined,
    myId: string | null | undefined,
    livePermission: string,
): boolean {
    if (!note || !myId || livePermission === 'view') return false;
    if (typeof note.owner_id === 'string' && note.owner_id) return note.owner_id === myId;
    return (note.share_status ?? 'owner') === 'owner';
}

const NON_FILE_TABS = ['calendar', 'messages', 'social', 'ext_finance'];
function isFileTab(id: string | null | undefined): id is string {
    return !!id && !id.startsWith('quicknote:') && !id.startsWith('chat-') && !id.startsWith('profile:') && !NON_FILE_TABS.includes(id);
}

/** File id of the document an editor belongs to (Mention storage set in useTipTapConfig). */
export function mentionFileIdOf(editor: { storage: unknown }): string | null {
    const storage = editor.storage as Record<string, { getFileId?: () => string | null | undefined } | undefined>;
    return storage.mention?.getFileId?.() ?? null;
}

/** Runs after a contact chip was inserted: shares and shows the hint (none for `already`). */
export async function startContactMentionShare(o: {
    fileId: string | null; contactId: string; label: string; shareable: boolean; chipPos?: number;
}): Promise<MentionShareResult | null> {
    if (!isFileTab(o.fileId)) return null;
    const fileId = o.fileId;
    const state = useDataStore.getState();
    const note = (state.notes || []).find((n) => n.id === fileId);
    const callerCanShare = callerCanShareFile(note, state.myId, useActiveNoteStore.getState().permission);
    // Email and key come from the contact list at share time, never from the menu item.
    const c = (state.contacts || []).find((x) => x.id === o.contactId);
    // Accepted is required; a missing key is reported separately ('no-key'). The menu flag is UI only.
    const shareable = !!c && c.status === 'accepted';
    const contact = { id: o.contactId, email: c?.email, public_key: c?.public_key, shareable };
    const title = typeof note?.title === 'string' ? note.title : '';

    const res = await shareViaMention({ file: { id: fileId, title, type: note?.type }, contact, callerCanShare });
    if (res.status !== 'already') {
        useMentionShareStore.getState().showHint({
            fileId, fileTitle: title, contactId: o.contactId, name: o.label, status: res.status,
            reason: res.reason, permission: 'view', chipPos: o.chipPos,
        });
    }
    return res;
}

type MentionLike = { type: { name: string }; attrs: Record<string, unknown> };
type DocLike = { descendants: (cb: (node: MentionLike) => boolean | void) => void };

export function countContactMentions(doc: DocLike): Map<string, { count: number; label: string }> {
    const out = new Map<string, { count: number; label: string }>();
    doc.descendants((node) => {
        if (node.type.name !== 'mention' || node.attrs.type !== 'contact' || typeof node.attrs.id !== 'string') return;
        const prev = out.get(node.attrs.id);
        const label = typeof node.attrs.label === 'string' ? node.attrs.label : node.attrs.id;
        out.set(node.attrs.id, { count: (prev?.count ?? 0) + 1, label: prev?.label ?? label });
    });
    return out;
}

/** One entry per contact chip that is in `before` but no longer in `after`. */
export function removedContactMentions(before: DocLike, after: DocLike): Array<{ id: string; label: string }> {
    const a = countContactMentions(after);
    const removed: Array<{ id: string; label: string }> = [];
    for (const [id, { count, label }] of countContactMentions(before)) {
        for (let i = (a.get(id)?.count ?? 0); i < count; i++) removed.push({ id, label });
    }
    return removed;
}

type StepLike = { getMap: () => { forEach: (fn: (oldStart: number, oldEnd: number) => void) => void } };
type NodeRangeDoc = { nodesBetween: (from: number, to: number, cb: (node: MentionLike) => boolean | void) => void };

/** Cheap gate for every keystroke: did any step replace a range that held a contact chip? */
export function stepsTouchContactMention(tr: { steps: readonly StepLike[]; docs: readonly NodeRangeDoc[] }): boolean {
    let hit = false;
    tr.steps.forEach((step, i) => {
        const doc = tr.docs[i];
        if (hit || !doc) return;
        step.getMap().forEach((oldStart, oldEnd) => {
            if (hit || oldEnd <= oldStart) return;
            doc.nodesBetween(oldStart, oldEnd, (node) => {
                if (node.type.name === 'mention' && node.attrs.type === 'contact') hit = true;
                return !hit;
            });
        });
    });
    return hit;
}

/** Transactions carrying this meta (content replaced by load, restore or a remote update) never ask to revoke. */
export const MENTION_SHARE_SKIP_META = 'mentionShareSkip';

type TrLike = { getMeta: (key: string) => unknown; before: DocLike & NodeRangeDoc; steps: readonly StepLike[]; docs: readonly NodeRangeDoc[] };

/**
 * Pure decision for one editor transaction: the people whose LAST chip a local edit removed.
 * Remote Yjs updates (`y-sync$`) and flagged content replacements are skipped; a person who
 * still has a chip in `after` is never listed (no release, no question).
 */
export function mentionRemovalsToConfirm(tr: TrLike, after: DocLike): Array<{ id: string; label: string }> {
    if (tr.getMeta('y-sync$') || tr.getMeta(MENTION_SHARE_SKIP_META)) return [];
    if (!stepsTouchContactMention(tr)) return [];
    const remaining = countContactMentions(after);
    const seen = new Set<string>();
    return removedContactMentions(tr.before, after).filter((r) => {
        if (remaining.has(r.id) || seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
    });
}

/** Called with people whose last chip is gone (see mentionRemovalsToConfirm): ask to revoke a mention-made share. */
export async function handleRemovedContactMentions(fileId: string | null, removed: Array<{ id: string; label: string }>): Promise<void> {
    if (!isFileTab(fileId)) return;
    for (const r of removed) {
        const store = useMentionShareStore.getState();
        if (store.origin(fileId, r.id) !== 'mention') continue;
        // No chip of this person is left in the note, whatever the counter says.
        while (store.release(fileId, r.id) > 0) { /* drop all references */ }
        const hint = store.hint;
        if (hint && hint.fileId === fileId && hint.contactId === r.id) store.dismissHint();
        const yes = await askConfirm({
            title: tr('mention.revokeAsk', { name: r.label }),
            confirmLabel: tr('mention.revokeConfirm'),
            cancelLabel: tr('mention.revokeKeep'),
            tone: 'danger',
        });
        if (!yes) continue;
        try {
            await revokeMentionShare(fileId, r.id);
            useMentionShareStore.getState().clear(fileId, r.id);
        } catch {
            notifyError(tr('mention.revokeFailed'));
        }
    }
}

/** Removes one contact chip: the one at `pos` if it matches, otherwise the last one for that contact. */
export function deleteContactChip(editor: Editor, contactId: string, pos?: number): void {
    if (editor.isDestroyed) return;
    const { doc } = editor.state;
    const matches = (n: { type: { name: string }; attrs: Record<string, unknown> } | null | undefined) =>
        !!n && n.type.name === 'mention' && n.attrs.type === 'contact' && n.attrs.id === contactId;
    let target: { from: number; to: number } | null = null;
    if (typeof pos === 'number' && pos >= 0 && pos < doc.content.size) {
        const at = doc.nodeAt(pos);
        if (matches(at) && at) target = { from: pos, to: pos + at.nodeSize };
    }
    if (!target) {
        doc.descendants((node, p) => {
            if (matches(node)) target = { from: p, to: p + node.nodeSize };
        });
    }
    if (target) editor.chain().deleteRange(target).run();
}

/** "Rückgängig": revoke first; forget the entry before deleting the chip so no revoke question follows. */
export async function undoMentionShare(editor: Editor | null, fileId: string, contactId: string, chipPos?: number): Promise<boolean> {
    try {
        await revokeMentionShare(fileId, contactId);
    } catch {
        notifyError(tr('mention.revokeFailed'));
        return false;
    }
    useMentionShareStore.getState().clear(fileId, contactId);
    if (editor) deleteContactChip(editor, contactId, chipPos);
    return true;
}
