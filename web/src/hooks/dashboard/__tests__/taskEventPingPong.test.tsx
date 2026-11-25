/**
 * Reproduces the production write loop on calendar entries that belong to todos
 * (`PUT /api/v1/files/<id>` every ~2 s, versions ~75 000) with two open clients.
 *
 * Each client gets its own module graph (store + hooks) via `vi.resetModules()`, both talk to one
 * fake server with optimistic concurrency. A successful PUT is "broadcast" like the SSE
 * `file_updated`: the other client refreshes at once, the writer after the 3 s own-save cooldown
 * (useRealtimeSync). A refresh merges the server metadata over the local event, as the cached
 * fetchDirectory path does (keys the server dropped survive locally).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@/lib/crypto', async (orig) => ({
    ...(await orig<Record<string, unknown>>()),
    encryptMetadata: vi.fn(async () => 'cipher'),
}));
vi.mock('@/lib/cryptoV2', () => ({
    encryptFileV2: vi.fn(async () => ({ metadata: { has_custom_password: false }, encrypted_dek: 'k', content_ciphertext: 'c' })),
}));
vi.mock('@/lib/offlineCacheCrypto', async (orig) => ({
    ...(await orig<Record<string, unknown>>()),
    saveEncryptedOfflineCache: vi.fn(async () => undefined),
}));

interface FakeGlobals {
    __tideFakeApi: (clientId: string, url: string, init?: RequestInit) => Promise<Response>;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Meta = Record<string, unknown>;
interface ServerFile { version: number; metadata: Meta }
interface Client {
    id: string;
    root: Root;
    store: typeof import('@/store/useDataStore').useDataStore;
}

const OWN_SAVE_COOLDOWN_MS = 3000;
const key = {} as CryptoKey;

let files: Map<string, ServerFile>;
let puts: Array<{ client: string; status: number; meta?: Meta }>;
let clients: Client[];

const json = (status: number, body: unknown): Response =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response;

function refresh(c: Client): void {
    c.store.setState((s) => ({
        events: s.events.map((e) => {
            const f = files.get(e.id);
            return f ? { ...e, ...f.metadata, version: f.version } : e;
        }),
        tasks: s.tasks.map((t) => ({ ...t })),
    }));
}

function installFakeApi(): void {
    (globalThis as unknown as FakeGlobals).__tideFakeApi = async (clientId, url, init) => {
        const m = url.match(/^\/api\/v1\/files\/([^/?]+)$/);
        const method = (init?.method ?? 'GET').toUpperCase();
        if (m && method === 'GET') {
            const f = files.get(m[1]);
            return f ? json(200, { id: m[1], version: f.version, metadata: f.metadata }) : json(404, {});
        }
        if (m && method === 'PUT') {
            const f = files.get(m[1]);
            if (!f) return json(404, {});
            const body = JSON.parse(String(init?.body ?? '{}')) as { version?: number; metadata?: Meta };
            if (typeof body.version === 'number' && body.version !== f.version) {
                puts.push({ client: clientId, status: 409 });
                return json(409, { error: 'conflict', current_version: f.version });
            }
            if (body.metadata) f.metadata = body.metadata;
            f.version += 1;
            puts.push({ client: clientId, status: 200, meta: body.metadata });
            for (const c of clients) {
                setTimeout(() => act(() => refresh(c)), c.id === clientId ? OWN_SAVE_COOLDOWN_MS : 50);
            }
            return json(200, { version: f.version });
        }
        return json(200, {});
    };
}

async function startClient(id: string, task: Meta, event: Meta): Promise<Client> {
    vi.resetModules();
    // Every client has its own apiFetch, so the fake server knows who wrote.
    vi.doMock('@/lib/api', () => ({
        apiFetch: (url: string, init?: RequestInit) => (globalThis as unknown as FakeGlobals).__tideFakeApi(id, url, init),
        getApiBase: () => '',
    }));
    const { useDataStore } = await import('@/store/useDataStore');
    const { useCalendarActions } = await import('../useCalendarActions');
    const { useTaskCalendarSync } = await import('../useTaskCalendarSync');
    useDataStore.setState({ tasks: [{ ...task }] as never, events: [{ ...event }] as never, notes: [] });

    const Probe = () => {
        const syncingTaskIdsRef = useRef<Set<string>>(new Set());
        const tasks = useDataStore((s) => s.tasks);
        const events = useDataStore((s) => s.events);
        const { handleEventCreate, handleEventSave } = useCalendarActions({
            publicKey: key, privateKey: key, myId: 'me', syncingTaskIdsRef,
        });
        useTaskCalendarSync({
            tasks, events, privateKey: key, publicKey: key, loadedDirectories: new Set(['root']),
            syncingTaskIdsRef, handleEventCreate, handleEventSave,
        });
        return null;
    };
    const client: Client = { id, root: createRoot(document.createElement('div')), store: useDataStore };
    clients.push(client); // registered before the first render, so its own first write is broadcast too
    await act(async () => client.root.render(<Probe />));
    return client;
}

async function runFor(ms: number): Promise<void> {
    for (let t = 0; t < ms; t += 250) {
        await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    }
}

// All-day todo on 29 Oct, as the sync hook computes it in the local time zone.
const dayStart = new Date(2026, 9, 29, 0, 0, 0).toISOString();
const dayEnd = new Date(2026, 9, 29, 23, 59, 59).toISOString();

const completedTodo: Meta = {
    id: 't1', title: 'Kinos checken', isCompleted: true, status: 'completed', dueDate: '2026-10-29',
    showInCalendar: true, recurrence: 'none', completed_dates: [], priority: 'high',
};

/** The shape of the six looping files in production (recurrence_rule "NONE", completion only in completed_dates). */
const productionEventMeta: Meta = {
    title: 'Kinos checken', start: dayStart, end: dayEnd, allDay: true, color: '#6366f1',
    recurrence_rule: 'NONE', completed_dates: ['2026-10-29'], is_completed: false, is_task: true,
    linkedTaskId: 't1', has_custom_password: false,
};

function isCompletedOnServer(meta: Meta): boolean {
    const dates = Array.isArray(meta.completed_dates) ? (meta.completed_dates as string[]) : [];
    return meta.is_completed === true || dates.includes('2026-10-29');
}

describe('todo calendar entries: no write ping-pong between two clients', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        sessionStorage.setItem('tide_user_id', 'me');
        files = new Map();
        puts = [];
        clients = [];
        installFakeApi();
    });

    afterEach(async () => {
        for (const c of clients) await act(async () => c.root.unmount());
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('a completed todo whose entry has recurrence_rule "NONE" settles after at most one write per client', async () => {
        files.set('ev1', { version: 75_000, metadata: { ...productionEventMeta } });
        const event = { id: 'ev1', type: 'event', ...productionEventMeta, version: 75_000 };
        await startClient('mac', completedTodo, event);
        await startClient('win', completedTodo, event);

        await runFor(60_000);

        const ok = puts.filter((p) => p.status === 200);
        expect(ok.length).toBeLessThanOrEqual(2);
        const settledAt = puts.length;
        await runFor(30_000);
        expect(puts.length).toBe(settledAt);

        const meta = files.get('ev1')!.metadata;
        expect(isCompletedOnServer(meta)).toBe(true);
        expect(meta.recurrence_rule === undefined || meta.recurrence_rule === '').toBe(true);
        expect(files.get('ev1')!.version).toBeLessThanOrEqual(75_002);
    }, 30_000);

    it('completing the todo on one client writes the entry at most twice and both converge', async () => {
        const openTodo = { ...completedTodo, isCompleted: false, status: 'todo' };
        const meta: Meta = { ...productionEventMeta, recurrence_rule: undefined, completed_dates: [], is_completed: false };
        files.set('ev1', { version: 10, metadata: JSON.parse(JSON.stringify(meta)) as Meta });
        const event = { id: 'ev1', type: 'event', ...meta, version: 10 };
        await startClient('mac', openTodo, event);
        await startClient('win', openTodo, event);
        await runFor(5_000);
        expect(puts.length).toBe(0);

        // The todo is ticked on the Mac; the Windows client learns about it through its refresh.
        for (const c of clients) {
            await act(async () => c.store.setState((s) => ({ tasks: s.tasks.map((t) => ({ ...t, isCompleted: true, status: 'completed' as const })) })));
        }
        await runFor(60_000);

        expect(puts.filter((p) => p.status === 200).length).toBeLessThanOrEqual(2);
        expect(isCompletedOnServer(files.get('ev1')!.metadata)).toBe(true);
        const settledAt = puts.length;
        await runFor(30_000);
        expect(puts.length).toBe(settledAt);
    }, 30_000);

    it('a really recurring todo entry whose todo is finished does not loop either', async () => {
        const recurringTodo = { ...completedTodo, recurrence: 'weekly', recurrence_rule: 'FREQ=WEEKLY;INTERVAL=1' };
        const meta: Meta = { ...productionEventMeta, recurrence_rule: 'FREQ=WEEKLY;INTERVAL=1', completed_dates: [], is_completed: false };
        files.set('ev1', { version: 3, metadata: { ...meta } });
        const event = { id: 'ev1', type: 'event', ...meta, version: 3 };
        await startClient('mac', recurringTodo, event);
        await startClient('win', recurringTodo, event);

        await runFor(60_000);

        expect(puts.filter((p) => p.status === 200).length).toBeLessThanOrEqual(2);
        const settledAt = puts.length;
        await runFor(30_000);
        expect(puts.length).toBe(settledAt);
    }, 30_000);
});
