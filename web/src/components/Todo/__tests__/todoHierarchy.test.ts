import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskItem } from '@/store/useDataStore';
import { EMPTY_TAG_FILTER } from '@/lib/tagFilter';
import { buildTaskTree } from '../treeUtils';
import { filterTodoRoots, groupRootsByDay, placeDayTodos, type TodoRootFilter } from '../todoHierarchy';
import type { TaskWithChildren } from '../types';

const NOW = new Date(2026, 10, 26, 10, 0); // Do., 26.11.2026

const mk = (id: string, extra: Partial<TaskItem> = {}): TaskItem => ({
  id, title: id, status: 'todo', isCompleted: false, ...extra,
} as TaskItem);

const noFilter: TodoRootFilter = {
  tagFilter: EMPTY_TAG_FILTER, knownTagIds: new Set(), tagTitles: () => [],
  filterStatus: 'all', filterPriority: 'all', searchQuery: '', selectedDateFilter: null,
};

/** Section key -> ids of its rows; children listed as parent>child. */
function layout(tasks: TaskItem[], f: Partial<TodoRootFilter> = {}): Record<string, string[]> {
  const roots = filterTodoRoots(buildTaskTree(tasks), { ...noFilter, ...f });
  const flat = (t: TaskWithChildren, prefix = ''): string[] =>
    [prefix + t.id, ...(t.children ?? []).flatMap((c) => flat(c, `${prefix}${t.id}>`))];
  return Object.fromEntries(groupRootsByDay(roots, NOW).map((s) => [s.key, s.items.flatMap((t) => flat(t))]));
}

describe('todo list: subtodos stay under their own parent', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); });

  it('a child dated differently from its parent stays in the parent section', () => {
    const tasks = [
      mk('A', { dueDate: '2026-11-27' }),
      mk('a1', { parentId: 'A', dueDate: '2026-11-20' }),
      mk('B', { dueDate: '2026-11-20' }),
    ];
    expect(layout(tasks)).toEqual({ overdue: ['B'], tomorrow: ['A', 'A>a1'] });
  });

  it('a child without date stays under a dated parent; a dated child under an undated parent', () => {
    const tasks = [
      mk('A', { dueDate: '2026-11-26' }), mk('a1', { parentId: 'A' }),
      mk('B'), mk('b1', { parentId: 'B', dueDate: '2026-11-26' }),
    ];
    expect(layout(tasks)).toEqual({ today: ['A', 'A>a1'], none: ['B', 'B>b1'] });
  });

  it('keeps children in their own order under the parent', () => {
    const tasks = [mk('A'), mk('a2', { parentId: 'A', order: 2 }), mk('a1', { parentId: 'A', order: 1 })];
    expect(layout(tasks)).toEqual({ none: ['A', 'A>a1', 'A>a2'] });
  });

  it('a completed parent takes its open children along (not into the open sections)', () => {
    const tasks = [
      mk('A', { dueDate: '2026-11-26', isCompleted: true, completedAt: NOW.toISOString() }),
      mk('a1', { parentId: 'A', dueDate: '2026-11-26' }),
    ];
    expect(layout(tasks, { filterStatus: 'active' })).toEqual({});
    expect(layout(tasks, { filterStatus: 'completed' })).toEqual({ today: ['A', 'A>a1'] });
  });

  it('an archived parent takes its open children along', () => {
    const tasks = [mk('A', { isArchived: true }), mk('a1', { parentId: 'A' })];
    expect(layout(tasks, { filterStatus: 'active' })).toEqual({});
    expect(layout(tasks, { filterStatus: 'archived' })).toEqual({ none: ['A', 'A>a1'] });
  });

  it('grandchildren sit under their own parent, two levels deep', () => {
    const tasks = [
      mk('A', { dueDate: '2026-11-26' }),
      mk('a1', { parentId: 'A', dueDate: '2026-12-10' }),
      mk('a1x', { parentId: 'a1', dueDate: '2026-11-01' }),
      mk('B', { dueDate: '2026-11-26' }),
    ];
    expect(layout(tasks)).toEqual({ today: ['A', 'A>a1', 'A>a1>a1x', 'B'] });
  });

  it('a search that only hits the child shows the parent with the child', () => {
    const tasks = [mk('Einkauf'), mk('Milch', { parentId: 'Einkauf' }), mk('Sport')];
    expect(layout(tasks, { searchQuery: 'milch' })).toEqual({ none: ['Einkauf', 'Einkauf>Milch'] });
  });

  it('the date filter applies to top-level todos; a child of a hidden parent is not shown', () => {
    const tasks = [
      mk('A', { dueDate: '2026-11-30' }), mk('a1', { parentId: 'A', dueDate: '2026-11-28' }),
      mk('B', { dueDate: '2026-11-28' }),
    ];
    const roots = filterTodoRoots(buildTaskTree(tasks), { ...noFilter, selectedDateFilter: new Date(2026, 10, 28) });
    expect(roots.map((t) => t.id)).toEqual(['B']);
  });

  it('a child whose parent is gone becomes a top-level todo', () => {
    expect(layout([mk('a1', { parentId: 'deleted', dueDate: '2026-11-26' })])).toEqual({ today: ['a1'] });
  });
});

describe('calendar day list: placeDayTodos', () => {
  type Ev = { id: string; linkedTaskId?: string; parent_id?: string | null };
  const ev = (id: string, linkedTaskId?: string, parent_id?: string | null): Ev => ({ id, linkedTaskId, parent_id });
  const show = (rows: ReturnType<typeof placeDayTodos<Ev>>) =>
    rows.map((r) => `${'-'.repeat(r.depth)}${r.entry.id}${r.parentTitle ? ` (${r.parentTitle})` : ''}`);

  it('puts a child directly after its parent even when another todo came between', () => {
    const tasks = [mk('A', { title: 'Alpha' }), mk('B'), mk('a1', { parentId: 'A' })];
    const rows = placeDayTodos([ev('eA', 'A'), ev('eB', 'B'), ev('ea1', 'a1')], tasks);
    expect(show(rows)).toEqual(['eA', '-ea1', 'eB']);
  });

  it('a child whose parent is not on this day stands alone without indentation and names the parent', () => {
    const tasks = [mk('A', { title: 'Alpha' }), mk('B'), mk('a1', { parentId: 'A' })];
    const rows = placeDayTodos([ev('eB', 'B'), ev('ea1', 'a1')], tasks);
    expect(show(rows)).toEqual(['eB', 'ea1 (Alpha)']);
  });

  it('a tag id in parent_id does not make a todo a subtodo', () => {
    const tasks = [mk('A'), mk('B')];
    const rows = placeDayTodos([ev('eA', 'A', 'tag-work'), ev('eB', 'B', 'tag-home')], tasks);
    expect(show(rows)).toEqual(['eA', 'eB']);
  });

  it('places grandchildren under their own parent, sorted by order', () => {
    const tasks = [
      mk('A'), mk('a2', { parentId: 'A', order: 2 }), mk('a1', { parentId: 'A', order: 1 }),
      mk('a1x', { parentId: 'a1' }),
    ];
    const rows = placeDayTodos([ev('ea1x', 'a1x'), ev('ea2', 'a2'), ev('eA', 'A'), ev('ea1', 'a1')], tasks);
    expect(show(rows)).toEqual(['eA', '-ea1', '--ea1x', '-ea2']);
  });

  it('older unlinked task entries may still point at another entry', () => {
    const rows = placeDayTodos([ev('p'), ev('x'), ev('c', undefined, 'p')], []);
    expect(show(rows)).toEqual(['p', '-c', 'x']);
  });

  it('survives a parent cycle', () => {
    const tasks = [mk('a', { parentId: 'b' }), mk('b', { parentId: 'a' })];
    const rows = placeDayTodos([ev('ea', 'a'), ev('eb', 'b')], tasks);
    expect(rows.map((r) => r.entry.id).sort()).toEqual(['ea', 'eb']);
  });
});
