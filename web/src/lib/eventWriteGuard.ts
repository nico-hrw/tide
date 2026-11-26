/**
 * Write guard for calendar entries (`PUT /api/v1/files/<id>` of type event).
 *
 * - Content signature: a normalised, deterministically sorted fingerprint of what gets stored,
 *   so "nothing really changed" can be told apart from "something changed".
 * - Skip of repeated identical writes while nobody else wrote in between (same server version).
 * - At most one conflict retry (409): fresh server state, re-merge of the own changes, then stop.
 * - Safety brake per file: a burst of a few writes, then at most one every 2 s, and a hard cap
 *   per minute. A write that has to wait is sent later; a newer write for the same file replaces it.
 */
import { apiFetch } from '@/lib/api';

type Meta = Record<string, unknown>;

/** Writes within BURST_WINDOW_MS before the brake spaces them (average: one per MIN_INTERVAL_MS). */
export const EVENT_WRITE_BURST = 3;
export const EVENT_WRITE_MIN_INTERVAL_MS = 2_000;
const BURST_WINDOW_MS = EVENT_WRITE_BURST * EVENT_WRITE_MIN_INTERVAL_MS;
export const EVENT_WRITE_MAX_PER_MINUTE = 20;
const MINUTE_MS = 60_000;

/** `recurrence_rule` values that mean "does not repeat" ("", "NONE", "none", "FREQ=NONE;INTERVAL=1"). */
export function normalizeRecurrenceRule(rule: unknown): string {
    if (typeof rule !== 'string') return '';
    const r = rule.trim().toUpperCase();
    if (!r || r === 'NONE' || /^FREQ=NONE(;|$)/.test(r)) return '';
    return r;
}

/** A stored, non-empty rule that still means "no repetition" (e.g. "NONE" from the event popover). */
export function isNoneLikeRecurrenceRule(rule: unknown): boolean {
    return typeof rule === 'string' && rule.trim() !== '' && normalizeRecurrenceRule(rule) === '';
}

const DATE_KEYS = new Set(['start', 'end', 'recurrence_end']);

function normalizeValue(key: string | undefined, value: unknown): unknown {
    if (value === undefined || value === null || value === '' || value === false) return undefined;
    if (key === 'recurrence_rule') return normalizeRecurrenceRule(value) || undefined;
    if (key && DATE_KEYS.has(key) && typeof value === 'string' && value.includes('T')) {
        const t = new Date(value).getTime();
        return isNaN(t) ? value : new Date(t).toISOString();
    }
    if (Array.isArray(value)) {
        const items = value.map((v) => normalizeValue(undefined, v)).filter((v) => v !== undefined);
        if (items.length === 0) return undefined;
        return items.every((v) => typeof v === 'string') ? [...new Set(items as string[])].sort() : items;
    }
    if (typeof value === 'object') {
        const out: Meta = {};
        for (const k of Object.keys(value as Meta).sort()) {
            const n = normalizeValue(k, (value as Meta)[k]);
            if (n !== undefined) out[k] = n;
        }
        return Object.keys(out).length > 0 ? out : undefined;
    }
    return value;
}

/**
 * Deterministic fingerprint of event content: keys sorted, string lists sorted and de-duplicated,
 * empty values (undefined/null/""/false/[]) dropped, "no repetition" rules dropped, ISO dates unified.
 */
export function eventContentSignature(content: Meta): string {
    return JSON.stringify(normalizeValue(undefined, content) ?? {});
}

interface FileWriteState {
    stamps: number[];
    seq: number;
    lastWritten?: { signature: string; version: number };
}

const writeState = new Map<string, FileWriteState>();

function stateFor(fileId: string): FileWriteState {
    let st = writeState.get(fileId);
    if (!st) {
        st = { stamps: [], seq: 0 };
        writeState.set(fileId, st);
    }
    return st;
}

/** Test helper: forget all per-file write history. */
export function resetEventWriteGuard(): void {
    writeState.clear();
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function brakeDelay(st: FileWriteState, now: number): number {
    st.stamps = st.stamps.filter((t) => now - t < MINUTE_MS);
    let wait = 0;
    if (st.stamps.length >= EVENT_WRITE_MAX_PER_MINUTE) {
        wait = Math.max(wait, st.stamps[st.stamps.length - EVENT_WRITE_MAX_PER_MINUTE] + MINUTE_MS - now);
    }
    if (st.stamps.length >= EVENT_WRITE_BURST) {
        wait = Math.max(wait, st.stamps[st.stamps.length - EVENT_WRITE_BURST] + BURST_WINDOW_MS - now);
    }
    return wait;
}

/**
 * Waits until the safety brake allows a write for this file. Resolves `false` when a newer write
 * for the same file was requested meanwhile (that one carries the newer state, this one is dropped).
 */
export async function acquireEventWriteSlot(fileId: string): Promise<boolean> {
    const st = stateFor(fileId);
    const mine = ++st.seq;
    for (;;) {
        const wait = brakeDelay(st, Date.now());
        if (wait <= 0) break;
        console.warn(`[eventWriteGuard] Too many writes for ${fileId} (${st.stamps.length} in the last minute); next write in ${Math.ceil(wait)} ms.`);
        await sleep(wait);
        if (st.seq !== mine) return false;
    }
    st.stamps.push(Date.now());
    return true;
}

/** True when exactly this content was the last write for the file and nobody wrote after it. */
export function isUnchangedSinceLastWrite(fileId: string, signature: string, currentVersion: unknown): boolean {
    const last = writeState.get(fileId)?.lastWritten;
    return Boolean(last && typeof currentVersion === 'number' && last.signature === signature && last.version === currentVersion);
}

function rememberWrite(fileId: string, signature: string, version: unknown): void {
    if (typeof version === 'number') stateFor(fileId).lastWritten = { signature, version };
}

export interface GuardedEventPutOptions {
    strict?: boolean;
    /** Signature of the content in `body` (for skipping identical rewrites later). */
    signature: string;
    /** Metadata keys this save owns: on a conflict they win over the server, all others come from the server. */
    ownKeys: string[];
    /** Called with each server version learned (success, conflict). */
    onVersion?: (version: number) => void;
    /** Latest known server version, read again after waiting for the brake. */
    currentVersion?: () => number | undefined;
}

export type GuardedEventPutResult = 'written' | 'unchanged' | 'superseded' | 'failed';

async function readJson<T>(res: Response): Promise<T | null> {
    return (await res.json().catch(() => null)) as T | null;
}

function remerge(serverMeta: Meta, ownMeta: Meta, ownKeys: string[]): Meta {
    const merged: Meta = { ...serverMeta };
    for (const k of ownKeys) {
        if (ownMeta[k] === undefined) delete merged[k];
        else merged[k] = ownMeta[k];
    }
    return merged;
}

/**
 * PUT for an event file through the safety brake. On 409: one retry with the fresh server state
 * (own keys merged over it, after a short backoff); if that fails too, it stops with a warning.
 */
export async function putEventGuarded(fileId: string, body: Meta, opts: GuardedEventPutOptions): Promise<GuardedEventPutResult> {
    const fail = (message: string): GuardedEventPutResult => {
        if (opts.strict) throw new Error(message);
        return 'failed';
    };
    if (!(await acquireEventWriteSlot(fileId))) return 'superseded';
    const latest = opts.currentVersion?.();
    if (typeof latest === 'number' && typeof body.version === 'number') body = { ...body, version: latest };

    const send = (b: Meta) => apiFetch(`/api/v1/files/${fileId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
    });

    const res = await send(body);
    if (res.ok) {
        const data = await readJson<{ version?: number }>(res);
        if (typeof data?.version === 'number') {
            opts.onVersion?.(data.version);
            rememberWrite(fileId, opts.signature, data.version);
        }
        return 'written';
    }
    if (res.status !== 409) return fail(`Event save failed (${res.status})`);

    const conflict = await readJson<{ current_version?: number }>(res);
    if (typeof conflict?.current_version !== 'number') return fail('Event save conflict without current version');
    opts.onVersion?.(conflict.current_version);

    await sleep(250 + Math.floor(Math.random() * 500));
    let version = conflict.current_version;
    let retryBody: Meta = { ...body, version };
    try {
        const fresh = await apiFetch(`/api/v1/files/${fileId}`);
        const file = fresh.ok ? await readJson<{ version?: number; metadata?: Meta | string }>(fresh) : null;
        const serverMeta = typeof file?.metadata === 'string' ? (JSON.parse(file.metadata) as Meta) : file?.metadata;
        if (file && typeof file.version === 'number' && serverMeta && typeof serverMeta === 'object') {
            version = file.version;
            opts.onVersion?.(version);
            const merged = remerge(serverMeta, (body.metadata as Meta | undefined) ?? {}, opts.ownKeys);
            if (eventContentSignature(merged) === eventContentSignature(serverMeta)) {
                // The server already holds what this save wanted (e.g. the other client wrote the same).
                rememberWrite(fileId, opts.signature, version);
                return 'unchanged';
            }
            retryBody = { ...body, metadata: merged, version };
        }
    } catch {
        // Fresh state unavailable: retry once with the server version only.
    }

    const retry = await send(retryBody);
    if (retry.ok) {
        const data = await readJson<{ version?: number }>(retry);
        if (typeof data?.version === 'number') {
            opts.onVersion?.(data.version);
            rememberWrite(fileId, opts.signature, data.version);
        }
        return 'written';
    }
    console.warn(`[eventWriteGuard] Gave up saving ${fileId} after one conflict retry (${retry.status}); the next refresh shows the server state.`);
    return fail(`Event save failed after conflict retry (${retry.status})`);
}
