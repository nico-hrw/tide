import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VariableRegistry, type RegistryEntry, type RegistryStorage } from '../variableRegistry';

const g = (name: string, expr = '1', params?: string[]) => ({ name, expr, params, global: true });
const entry = (name: string, noteId: string | null, expr = '1'): RegistryEntry => ({ name, expr, global: true, sourceNoteId: noteId });

function fakeStorage(initial: RegistryEntry[] = []) {
  const state = { remote: initial, loads: 0, saves: 0 };
  const storage: RegistryStorage = {
    load: async () => { state.loads++; return structuredClone(state.remote); },
    save: async (entries) => { state.saves++; state.remote = structuredClone(entries); },
  };
  return { state, storage };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('VariableRegistry', () => {
  it('loads lazily on first read, once, and notifies subscribers', async () => {
    const { state, storage } = fakeStorage([entry('zins', 'n1', '3,9 %')]);
    const reg = new VariableRegistry(storage, 10);
    const cb = vi.fn();
    reg.subscribe(cb);
    expect(state.loads).toBe(0);
    expect(reg.definitions()).toEqual([]); // not loaded yet: triggers the load
    reg.definitions();
    await vi.advanceTimersByTimeAsync(0);
    expect(state.loads).toBe(1);
    expect(cb).toHaveBeenCalled();
    expect(reg.definitions().map((d) => d.name)).toEqual(['zins']);
  });

  it('a failed load returns nothing and can be retried', async () => {
    let fail = true;
    const reg = new VariableRegistry({
      load: async () => { if (fail) throw new Error('offline'); return [entry('a', 'n1')]; },
      save: async () => {},
    }, 10);
    expect(reg.definitions()).toEqual([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(reg.isLoaded()).toBe(false);
    fail = false;
    reg.definitions();
    await vi.advanceTimersByTimeAsync(0);
    expect(reg.definitions().map((d) => d.name)).toEqual(['a']);
  });

  it('syncNote replaces only that note\'s entries and saves after the debounce', async () => {
    const { state, storage } = fakeStorage([entry('a', 'n1'), entry('b', 'n2')]);
    const reg = new VariableRegistry(storage, 50);
    await reg.syncNote('n1', [g('c', '2')]);
    expect(state.saves).toBe(0);
    await vi.advanceTimersByTimeAsync(60);
    expect(state.saves).toBe(1);
    expect(state.remote.map((e) => `${e.name}:${e.sourceNoteId}`).sort()).toEqual(['b:n2', 'c:n1']);
  });

  it('several quick edits produce one save', async () => {
    const { state, storage } = fakeStorage();
    const reg = new VariableRegistry(storage, 50);
    await reg.syncNote('n1', [g('a')]);
    await reg.syncNote('n1', [g('a'), g('b')]);
    await reg.syncNote('n1', [g('a'), g('b'), g('c')]);
    await vi.advanceTimersByTimeAsync(60);
    expect(state.saves).toBe(1);
    expect(state.remote).toHaveLength(3);
  });

  it('does not touch the registry for a note without globals unless forced', async () => {
    const { state, storage } = fakeStorage([entry('a', 'n1')]);
    const reg = new VariableRegistry(storage, 10);
    await reg.syncNote('n2', []);
    await vi.advanceTimersByTimeAsync(50);
    expect(state.loads).toBe(0);
    expect(state.saves).toBe(0);
    await reg.syncNote('n1', [], { force: true });
    await vi.advanceTimersByTimeAsync(50);
    expect(state.remote).toEqual([]);
  });

  it('ignores definitions that are not marked global', async () => {
    const { state, storage } = fakeStorage();
    const reg = new VariableRegistry(storage, 10);
    await reg.syncNote('n1', [{ name: 'lokal', expr: '1', global: false }, g('global')]);
    await vi.advanceTimersByTimeAsync(20);
    expect(state.remote.map((e) => e.name)).toEqual(['global']);
  });

  it('merges with changes made on another device before saving', async () => {
    const { state, storage } = fakeStorage([entry('a', 'n1')]);
    const reg = new VariableRegistry(storage, 50);
    await reg.syncNote('n1', [g('a', '9')]);
    state.remote = [...state.remote, entry('fremd', 'n9')]; // another device saved in between
    await vi.advanceTimersByTimeAsync(60);
    expect(state.remote.map((e) => e.name).sort()).toEqual(['a', 'fremd']);
    expect(state.remote.find((e) => e.name === 'a')!.expr).toBe('9');
  });

  it('removeNote drops its entries; manual entries are kept apart from notes', async () => {
    const { state, storage } = fakeStorage([entry('a', 'n1'), entry('m', null)]);
    const reg = new VariableRegistry(storage, 10);
    await reg.removeNote('n1');
    await vi.advanceTimersByTimeAsync(20);
    expect(state.remote.map((e) => e.name)).toEqual(['m']);
    await reg.syncNote('n2', [g('m', '5')]); // same name in a note: both entries exist, the note one is listed
    await vi.advanceTimersByTimeAsync(20);
    expect(state.remote.filter((e) => e.name === 'm')).toHaveLength(2);
  });

  it('removeNote does not save when the registry has no entries for that note', async () => {
    const { storage } = fakeStorage([entry('a', 'n1')]);
    const saveSpy = vi.spyOn(storage, 'save');
    const reg = new VariableRegistry(storage, 10);
    await reg.removeNote('non-existent');
    await vi.advanceTimersByTimeAsync(20);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('setManual and removeManual edit entries without a note', async () => {
    const { state, storage } = fakeStorage();
    const reg = new VariableRegistry(storage, 10);
    await reg.setManual({ name: 'sparquote', expr: '12 %', global: true });
    await vi.advanceTimersByTimeAsync(20);
    expect(state.remote).toEqual([{ name: 'sparquote', expr: '12 %', global: true, sourceNoteId: null }]);
    await reg.removeManual('sparquote');
    await vi.advanceTimersByTimeAsync(20);
    expect(state.remote).toEqual([]);
  });

  it('flush saves immediately', async () => {
    const { state, storage } = fakeStorage();
    const reg = new VariableRegistry(storage, 10_000);
    await reg.syncNote('n1', [g('a')]);
    await reg.flush();
    expect(state.saves).toBe(1);
  });
});
