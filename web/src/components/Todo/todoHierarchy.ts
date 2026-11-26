import { addDays, isBefore, isSameDay, startOfDay } from 'date-fns';
import type { TaskItem } from '@/store/slices/types';
import { matchesTagFilter, type TagFilter } from '@/lib/tagFilter';
import { FilterStatus, Priority, TaskWithChildren, getTaskPriority, isTaskArchived, parseDateSafe } from './types';

/*
 * Placement rule for subtodos (all todo lists and the calendar day list):
 * - Groups and sections (Heute, Morgen, Überfällig, …, a calendar day) hold top-level todos only.
 *   A subtodo is shown directly under its own parent, indented per level, in the parent's section;
 *   its own date never moves it into another section.
 * - Todo list filters (status, tag, priority, date) apply to top-level todos. A subtodo whose parent is
 *   filtered out, completed or archived goes with its parent; search also looks into subtodos and then
 *   shows the parent together with them.
 * - Calendar day list: when the parent is not on that day, the subtodo stands on its own row without
 *   indentation and names its parent, so it never looks like a child of the todo above it.
 */

export interface DaySection<T> {
  key: 'overdue' | 'today' | 'tomorrow' | 'upcoming' | 'none';
  title: string;
  items: T[];
}

type Dated = Pick<TaskItem, 'dueDate' | 'scheduledDate'>;

/** Sorts top-level todos into the day sections of the todo list, keeping their order. */
export function groupRootsByDay<T extends Dated>(roots: T[], now: Date = new Date()): DaySection<T>[] {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const g = { overdue: [] as T[], today: [] as T[], tomorrow: [] as T[], upcoming: [] as T[], none: [] as T[] };
  for (const t of roots) {
    const d = parseDateSafe(t.dueDate || t.scheduledDate);
    if (!d) g.none.push(t);
    else if (isBefore(startOfDay(d), today)) g.overdue.push(t);
    else if (isSameDay(d, today)) g.today.push(t);
    else if (isSameDay(d, tomorrow)) g.tomorrow.push(t);
    else g.upcoming.push(t);
  }
  const all: DaySection<T>[] = [
    { key: 'overdue', title: 'Überfällig', items: g.overdue },
    { key: 'today', title: 'Heute', items: g.today },
    { key: 'tomorrow', title: 'Morgen', items: g.tomorrow },
    { key: 'upcoming', title: 'Demnächst', items: g.upcoming },
    { key: 'none', title: 'Ohne Datum', items: g.none },
  ];
  return all.filter((s) => s.items.length > 0);
}

export interface TodoRootFilter {
  tagFilter: TagFilter;
  knownTagIds: Set<string>;
  /** Titles of the todo's tags, for the search. */
  tagTitles: (tagIds: string[] | undefined) => string[];
  filterStatus: FilterStatus;
  filterPriority: Priority | 'all';
  searchQuery: string;
  selectedDateFilter: Date | null;
}

/** Applies the todo list filters to the top-level todos of a tree (see the placement rule above). */
export function filterTodoRoots(tree: TaskWithChildren[], f: TodoRootFilter): TaskWithChildren[] {
  const q = f.searchQuery.trim().toLowerCase();
  const matchesSearch = (t: TaskWithChildren): boolean => {
    if (t.title.toLowerCase().includes(q)) return true;
    if ((t.description || '').toLowerCase().includes(q)) return true;
    if (f.tagTitles(t.tags).some((title) => title.toLowerCase().includes(q))) return true;
    return Boolean(t.children && t.children.some(matchesSearch));
  };
  return tree.filter((t) => {
    if (!matchesTagFilter(t.tags ?? [], f.tagFilter, f.knownTagIds)) return false;
    const archived = isTaskArchived(t);
    if (f.filterStatus === 'active' && (t.isCompleted || t.status === 'in_progress' || archived)) return false;
    if (f.filterStatus === 'in_progress' && (t.isCompleted || t.status !== 'in_progress' || archived)) return false;
    if (f.filterStatus === 'completed' && (!t.isCompleted || archived)) return false;
    if (f.filterStatus === 'archived' && !archived) return false;
    if (f.filterPriority !== 'all' && getTaskPriority(t) !== f.filterPriority) return false;
    if (f.selectedDateFilter !== null) {
      const d = parseDateSafe(t.dueDate || t.scheduledDate);
      if (!d || !isSameDay(d, f.selectedDateFilter)) return false;
    }
    if (q && !matchesSearch(t)) return false;
    return true;
  });
}

/** A todo entry of a calendar day (linked to a todo, or an older stand-alone task entry). */
export interface DayTodoEntry {
  id: string;
  linkedTaskId?: string;
  /** On calendar entries this is usually the tag/group id, not a todo. */
  parent_id?: string | null;
}

export interface PlacedDayTodo<E> {
  entry: E;
  /** 0 = own row without indentation; 1+ = directly under its parent, indented per level. */
  depth: number;
  /** Set when the entry is a subtodo whose parent is not in this list. */
  parentTitle?: string;
}

/** Orders a day's todo entries so every subtodo sits directly under its own parent (see the rule above). */
export function placeDayTodos<E extends DayTodoEntry>(entries: E[], tasks: TaskItem[] | undefined): PlacedDayTodo<E>[] {
  const taskById = new Map((tasks ?? []).map((t) => [t.id, t]));
  const entryByKey = new Map<string, E>();
  for (const e of entries) {
    if (!entryByKey.has(e.id)) entryByKey.set(e.id, e);
    if (e.linkedTaskId && !entryByKey.has(e.linkedTaskId)) entryByKey.set(e.linkedTaskId, e);
  }

  // A linked todo's own parentId decides; an entry's parent_id only counts when it names another entry here.
  const parentOf = (e: E): E | undefined => {
    const task = e.linkedTaskId ? taskById.get(e.linkedTaskId) : undefined;
    const key = task ? task.parentId : e.parent_id;
    const p = key ? entryByKey.get(key) : undefined;
    return p && p !== e ? p : undefined;
  };
  const orderOf = (e: E): number => (e.linkedTaskId ? taskById.get(e.linkedTaskId)?.order : undefined) ?? 0;

  const children = new Map<E, E[]>();
  const roots: E[] = [];
  for (const e of entries) {
    const p = parentOf(e);
    if (p) children.set(p, [...(children.get(p) ?? []), e]);
    else roots.push(e);
  }
  for (const list of children.values()) {
    const index = new Map(list.map((e, i) => [e, i]));
    list.sort((a, b) => orderOf(a) - orderOf(b) || index.get(a)! - index.get(b)!);
  }

  const parentTitleOf = (e: E): string | undefined => {
    const task = e.linkedTaskId ? taskById.get(e.linkedTaskId) : undefined;
    return task?.parentId ? taskById.get(task.parentId)?.title : undefined;
  };

  const out: PlacedDayTodo<E>[] = [];
  const seen = new Set<E>();
  const walk = (e: E, depth: number) => {
    if (seen.has(e)) return;
    seen.add(e);
    out.push(depth === 0 ? { entry: e, depth, parentTitle: parentTitleOf(e) } : { entry: e, depth });
    for (const c of children.get(e) ?? []) walk(c, depth + 1);
  };
  roots.forEach((r) => walk(r, 0));
  // Entries caught in a parent cycle have no root: each gets its own row.
  for (const e of entries) walk(e, 0);
  return out;
}
