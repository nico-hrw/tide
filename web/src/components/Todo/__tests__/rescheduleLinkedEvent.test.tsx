/**
 * Quick reschedule of an overdue todo that has a linked calendar entry: one click must cause exactly one
 * todo write and at most one entry write, and nothing may keep writing afterwards (eventWriteGuard /
 * useTaskCalendarSync ping-pong). Store, calendar actions and task sync run for real against a fake server
 * that "broadcasts" each entry write like the SSE refresh (other clients at once, the writer after 3 s).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

// Moving a repeating entry asks "this or all?" (RecurrenceScopeDialog); the test answers "all".
const askScope = vi.fn(async () => 'all' as const);
vi.mock('@/lib/recurrenceScopePrompt', () => ({ askRecurrenceScope: (...args: unknown[]) => askScope(...(args as [])) }));

type Meta = Record<string, unknown>;
interface Call { method: string; url: string; body?: Meta }

let files: Map<string, { version: number; metadata: Meta }>;
let calls: Call[];

const json = (status: number, body: unknown): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response;

vi.mock('@/lib/api', () => ({
  getApiBase: () => '',
  apiFetch: async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? (JSON.parse(String(init.body)) as Meta) : undefined;
    calls.push({ method, url, body });
    const m = url.match(/^\/api\/v1\/files\/([^/?]+)$/);
    if (m && method === 'GET') {
      const f = files.get(m[1]);
      return f ? json(200, { id: m[1], version: f.version, metadata: f.metadata }) : json(404, {});
    }
    if (m && method === 'DELETE') {
      files.delete(m[1]);
      return json(200, {});
    }
    if (m && method === 'PUT') {
      const f = files.get(m[1]);
      if (!f) return json(404, {});
      if (typeof body?.version === 'number' && body.version !== f.version) return json(409, { current_version: f.version });
      if (body?.metadata) f.metadata = body.metadata as Meta;
      f.version += 1;
      // SSE-like refresh: the writer merges the server state after its own-save cooldown.
      setTimeout(() => act(() => refresh()), 3000);
      return json(200, { version: f.version });
    }
    return json(200, {});
  },
}));

import { useDataStore } from '@/store/useDataStore';
import { useCalendarActions } from '@/hooks/dashboard/useCalendarActions';
import { useTaskCalendarSync } from '@/hooks/dashboard/useTaskCalendarSync';
import { TodoRescheduleBar } from '../TodoRescheduleBar';
import { resetEventWriteGuard } from '@/lib/eventWriteGuard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function refresh(): void {
  useDataStore.setState((s) => ({
    events: s.events.map((e) => {
      const f = files.get(e.id);
      return f ? { ...e, ...f.metadata, version: f.version } : e;
    }),
    tasks: s.tasks.map((t) => ({ ...t })),
  }));
}

const key = {} as CryptoKey;

const Harness: React.FC = () => {
  const syncingTaskIdsRef = useRef<Set<string>>(new Set());
  const tasks = useDataStore((s) => s.tasks);
  const events = useDataStore((s) => s.events);
  const updateTask = useDataStore((s) => s.updateTask);
  const { handleEventCreate, handleEventSave } = useCalendarActions({ publicKey: key, privateKey: key, myId: 'me', syncingTaskIdsRef });
  useTaskCalendarSync({
    tasks, events, privateKey: key, publicKey: key, loadedDirectories: new Set(['root']),
    syncingTaskIdsRef, handleEventCreate, handleEventSave,
  });
  const task = tasks.find((t) => t.id === 't1');
  // The desktop views pass updateTask straight through (TodoDesktopView.reschedule / TodoDetailPane.onUpdate).
  return task ? <TodoRescheduleBar task={task} onReschedule={(id, patch) => { void updateTask(id, patch); }} /> : null;
};

async function runFor(ms: number): Promise<void> {
  for (let t = 0; t < ms; t += 250) {
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  }
}

const todoPuts = () => calls.filter((c) => c.method === 'PUT' && c.url.startsWith('/api/v1/todos/'));
const entryWrites = () => calls.filter((c) => c.url === '/api/v1/files/ev1' && (c.method === 'PUT' || c.method === 'DELETE'));

describe('quick reschedule of a todo with a linked calendar entry', () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 26, 9, 41, 17));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sessionStorage.setItem('tide_user_id', 'me');
    resetEventWriteGuard();
    askScope.mockClear();
    files = new Map();
    calls = [];
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function start(todo: Meta, eventMeta: Meta) {
    files.set('ev1', { version: 40, metadata: { ...eventMeta } });
    useDataStore.setState({
      tasks: [{ ...todo }] as never,
      events: [{ id: 'ev1', type: 'event', ...eventMeta, version: 40 }] as never,
      notes: [],
    });
    await act(async () => root.render(<Harness />));
    await runFor(5_000);
    // In sync before the click: nothing is written.
    expect(entryWrites()).toHaveLength(0);
    calls = [];
  }

  const click = async (k: string) => {
    const el = host.querySelector(`[data-reschedule="${k}"]`) as HTMLButtonElement;
    await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  };

  const timedStart = new Date(2026, 10, 20, 8, 30).toISOString();
  const timedEnd = new Date(2026, 10, 20, 9, 0).toISOString();
  const timedTodo: Meta = {
    id: 't1', title: 'Steuer', isCompleted: false, status: 'todo', dueDate: '2026-11-20T08:30:00',
    scheduledDate: '2026-11-20T08:30:00', showInCalendar: true, priority: 'high',
  };
  const timedEntry: Meta = {
    title: 'Steuer', start: timedStart, end: timedEnd, allDay: false, isAllDay: false, is_task: true,
    linkedTaskId: 't1', is_completed: false, has_custom_password: false,
  };

  it('"Morgen" on a timed todo: one todo write, one entry write, then quiet', async () => {
    await start(timedTodo, timedEntry);
    await click('tomorrow');
    await runFor(60_000);

    expect(todoPuts()).toHaveLength(1);
    expect(todoPuts()[0].body).toMatchObject({ due_date: '2026-11-27T08:30:00', scheduled_date: '2026-11-27T08:30:00' });
    expect(entryWrites()).toHaveLength(1);
    const meta = files.get('ev1')!.metadata;
    expect(new Date(String(meta.start)).getTime()).toBe(new Date(2026, 10, 27, 8, 30).getTime());
    // The entry write does not write the todo back (the sync marks the todo while it saves the entry).
    const settled = calls.length;
    await runFor(30_000);
    expect(calls.length).toBe(settled);
    expect(useDataStore.getState().tasks[0].dueDate).toBe('2026-11-27T08:30:00');
  }, 30_000);

  it('"Jetzt" on an all-day todo turns the entry into a timed one, once', async () => {
    const allDayStart = new Date(2026, 10, 20, 0, 0, 0).toISOString();
    const allDayEnd = new Date(2026, 10, 20, 23, 59, 59).toISOString();
    await start(
      { ...timedTodo, dueDate: '2026-11-20', scheduledDate: '2026-11-20' },
      { ...timedEntry, start: allDayStart, end: allDayEnd, allDay: true, isAllDay: true },
    );
    await click('now');
    await runFor(60_000);

    expect(todoPuts()).toHaveLength(1);
    expect(todoPuts()[0].body).toMatchObject({ due_date: '2026-11-26T09:41:00' });
    expect(entryWrites()).toHaveLength(1);
    expect(Boolean(files.get('ev1')!.metadata.allDay)).toBe(false);
    expect(new Date(String(files.get('ev1')!.metadata.start)).getTime()).toBe(new Date(2026, 10, 26, 9, 41).getTime());
    const settled = calls.length;
    await runFor(30_000);
    expect(calls.length).toBe(settled);
  }, 30_000);

  it('a repeating todo keeps its rule; the entry moves once', async () => {
    const rule = 'FREQ=WEEKLY;INTERVAL=1';
    await start({ ...timedTodo, recurrence: 'weekly', recurrence_rule: rule }, { ...timedEntry, recurrence_rule: rule });
    await click('nextWeek');
    await runFor(60_000);

    expect(todoPuts()).toHaveLength(1);
    expect(todoPuts()[0].body).toMatchObject({ due_date: '2026-11-30T08:30:00', recurrence_rule: rule });
    // The existing series prompt comes up once (same as a date change in the date field), not again and again.
    expect(askScope).toHaveBeenCalledTimes(1);
    expect(entryWrites()).toHaveLength(1);
    expect(files.get('ev1')!.metadata.recurrence_rule).toBe(rule);
    const settled = calls.length;
    await runFor(30_000);
    expect(calls.length).toBe(settled);
  }, 30_000);

  it('"Ohne Datum" removes the linked entry once and writes the todo once', async () => {
    await start(timedTodo, timedEntry);
    await click('none');
    await runFor(30_000);

    expect(todoPuts()).toHaveLength(1);
    expect(todoPuts()[0].body).toMatchObject({ due_date: '', scheduled_date: '' });
    expect(entryWrites().map((c) => c.method)).toEqual(['DELETE']);
    expect(useDataStore.getState().events).toHaveLength(0);
    const settled = calls.length;
    await runFor(30_000);
    expect(calls.length).toBe(settled);
  }, 30_000);
});
