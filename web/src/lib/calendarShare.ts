/**
 * Sharing a calendar (event group) = sharing every event of the group one by one, plus a rule that
 * shares events added later (design spec "Kalender", approach A). Pure helpers only: network calls
 * live in calendarShareActions.ts, the stored rules in store/useCalendarShareStore.ts.
 */

export type CalendarSharePermission = 'view' | 'edit';

export type CalendarShareRecipient = { userId: string; permission: CalendarSharePermission };

export type CalendarShareRule = {
    groupId: string;
    recipients: CalendarShareRecipient[];
    autoShareNew: boolean;
    /** People removed in the dialog whose access is not yet confirmed revoked on every event (retried on next sync). */
    pendingRevoke?: string[];
};

export type CalendarShareRules = Record<string, CalendarShareRule>;

/**
 * An event as the planner sees it. `sharedWith` is the user ids from `GET /files/{id}/shares`
 * (undefined = not checked). `owned` must be true to share: listing, changing and revoking shares
 * is owner-only on the server.
 */
export type PlanEvent = {
    id: string;
    groupId?: string | null;
    groupIds?: string[];
    private?: boolean;
    sharedWith?: string[];
    owned?: boolean;
};

export type PlannedShare = { eventId: string; userId: string; permission: CalendarSharePermission };

export type ShareOne = (eventId: string, userId: string, permission: CalendarSharePermission) => Promise<void>;

export type ApplyResult = { done: number; failed: number };

export type ApplyProgress = ApplyResult & { total: number };

/** Group ids of an event: `groupIds` when set, otherwise the single `groupId` (same order as getEventGroupIds). */
export function eventGroupIdsOf(e: Pick<PlanEvent, 'groupId' | 'groupIds'>): string[] {
    if (Array.isArray(e.groupIds) && e.groupIds.length > 0) return e.groupIds;
    return e.groupId ? [e.groupId] : [];
}

export function eventInGroup(e: Pick<PlanEvent, 'groupId' | 'groupIds'>, groupId: string): boolean {
    return eventGroupIdsOf(e).includes(groupId);
}

/** Same rule as the rest of the app (handleDeleteGroup): owner_id wins, otherwise share_status. */
export function isOwnedEvent(e: { owner_id?: string; share_status?: string }, myId: string | null | undefined): boolean {
    if (!myId) return false;
    if (typeof e.owner_id === 'string' && e.owner_id) return e.owner_id === myId;
    return !e.share_status || e.share_status === 'owner';
}

/** Shares still missing: own, non-private events of the group, per recipient who is not listed yet. */
export function planGroupShares(args: { events: PlanEvent[]; rule: CalendarShareRule }): PlannedShare[] {
    const { events, rule } = args;
    const plan: PlannedShare[] = [];
    for (const e of events) {
        if (e.owned !== true || e.private === true || !eventInGroup(e, rule.groupId)) continue;
        const has = new Set(e.sharedWith ?? []);
        for (const r of rule.recipients) {
            if (!has.has(r.userId)) plan.push({ eventId: e.id, userId: r.userId, permission: r.permission });
        }
    }
    return plan;
}

/** Runs the plan one after another; a failing step is counted and the rest still runs. */
export async function applyGroupShares(
    plan: PlannedShare[],
    shareOne: ShareOne,
    onProgress?: (p: ApplyProgress) => void,
): Promise<ApplyResult> {
    let done = 0;
    let failed = 0;
    for (const step of plan) {
        try {
            await shareOne(step.eventId, step.userId, step.permission);
            done += 1;
        } catch {
            failed += 1;
        }
        onProgress?.({ done, failed, total: plan.length });
    }
    return { done, failed };
}

/** Called when an event enters a group: shares it with the rule's recipients if the rule says so. */
export async function shareNewEvent(event: PlanEvent, rule: CalendarShareRule, shareOne: ShareOne): Promise<ApplyResult> {
    if (!rule.autoShareNew || event.private === true || event.owned !== true || !eventInGroup(event, rule.groupId)) {
        return { done: 0, failed: 0 };
    }
    const plan = rule.recipients.map((r) => ({ eventId: event.id, userId: r.userId, permission: r.permission }));
    return applyGroupShares(plan, shareOne);
}

/**
 * One rule for an event in several auto-sharing groups: every recipient once, and when the groups
 * disagree the stricter permission ('view') wins. The first matching group names the result.
 */
export function mergeRulesForEvent(groupIds: string[], rules: CalendarShareRules): CalendarShareRule | null {
    const active = groupIds.map((id) => rules[id]).filter((r): r is CalendarShareRule => !!r && r.autoShareNew && r.recipients.length > 0);
    if (active.length === 0) return null;
    const byUser = new Map<string, CalendarSharePermission>();
    for (const r of active) {
        for (const p of r.recipients) {
            const prev = byUser.get(p.userId);
            byUser.set(p.userId, prev === 'view' || p.permission === 'view' ? 'view' : 'edit');
        }
    }
    return {
        groupId: active[0].groupId,
        autoShareNew: true,
        recipients: [...byUser].map(([userId, permission]) => ({ userId, permission })),
    };
}

export type GroupShareSummary = { total: number; shared: number; privateCount: number; notOwned: number; unchecked: number };

/** Numbers for the status line "13 von 14 Terminen geteilt · 1 Termin privat gehalten". */
export function summarizeGroupShares(args: { events: PlanEvent[]; rule: CalendarShareRule }): GroupShareSummary {
    const { events, rule } = args;
    const s: GroupShareSummary = { total: 0, shared: 0, privateCount: 0, notOwned: 0, unchecked: 0 };
    for (const e of events) {
        if (!eventInGroup(e, rule.groupId)) continue;
        s.total += 1;
        if (e.owned !== true) s.notOwned += 1;
        else if (e.private === true) s.privateCount += 1;
        else if (!e.sharedWith) s.unchecked += 1;
        else if (rule.recipients.length > 0 && rule.recipients.every((r) => e.sharedWith?.includes(r.userId))) s.shared += 1;
    }
    return s;
}

const PERMISSIONS: readonly CalendarSharePermission[] = ['view', 'edit'];

/** Tolerant parser for the decrypted rules file: broken entries are dropped, never guessed. */
export function parseShareRules(raw: unknown): CalendarShareRules {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: CalendarShareRules = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (!value || typeof value !== 'object') continue;
        const v = value as Record<string, unknown>;
        if (v.groupId !== key || !key) continue;
        const seen = new Set<string>();
        const recipients: CalendarShareRecipient[] = [];
        for (const r of Array.isArray(v.recipients) ? v.recipients : []) {
            if (!r || typeof r !== 'object') continue;
            const { userId, permission } = r as Record<string, unknown>;
            if (typeof userId !== 'string' || !userId || seen.has(userId)) continue;
            if (!PERMISSIONS.includes(permission as CalendarSharePermission)) continue;
            seen.add(userId);
            recipients.push({ userId, permission: permission as CalendarSharePermission });
        }
        const pending = [...new Set((Array.isArray(v.pendingRevoke) ? v.pendingRevoke : []).filter((u): u is string => typeof u === 'string' && !!u))];
        if (recipients.length === 0 && pending.length === 0) continue;
        out[key] = { groupId: key, recipients, autoShareNew: v.autoShareNew === true, ...(pending.length > 0 ? { pendingRevoke: pending } : {}) };
    }
    return out;
}

/** Stores a copy of the rule; a rule without recipients and without pending removals removes the group's entry. */
export function upsertShareRule(rules: CalendarShareRules, rule: CalendarShareRule): CalendarShareRules {
    const pending = rule.pendingRevoke?.length ? [...rule.pendingRevoke] : undefined;
    if (rule.recipients.length === 0 && !pending) return removeShareRule(rules, rule.groupId);
    const copy: CalendarShareRule = { groupId: rule.groupId, recipients: rule.recipients.map((r) => ({ ...r })), autoShareNew: rule.autoShareNew };
    if (pending) copy.pendingRevoke = pending;
    return { ...rules, [rule.groupId]: copy };
}

export function removeShareRule(rules: CalendarShareRules, groupId: string): CalendarShareRules {
    if (!(groupId in rules)) return rules;
    const next = { ...rules };
    delete next[groupId];
    return next;
}
