'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, CheckCheck, ListTodo, CalendarDays } from 'lucide-react';
import { addDays } from 'date-fns';

/** Local calendar day as yyyy-MM-dd (the due date format of the store). */
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
import { useDataStore } from '@/store/useDataStore';
import type { TaskItem } from '@/store/slices/types';
import { matchesTagFilter, pruneTagFilter, isTagFilterActive, EMPTY_TAG_FILTER } from '@/lib/tagFilter';
import { useTagRegistry } from './useTodoTags';
import { buildTaskTree } from './treeUtils';
import { TaskWithChildren, isTaskArchived, parseDateSafe } from './types';
import { MobileTodoDetail } from './MobileTodoDetail';
import { TodoProgressRing, CheckMark, SwipeRow } from './MobileTodoParts';
import { MobilePriorityIcon } from './MobileTodoStyle';

const kids = (t: TaskWithChildren): TaskWithChildren[] => t.children ?? [];

type Section = { key: string; title: string; items: TaskWithChildren[] };

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function isDueToday(t: TaskWithChildren): boolean {
  const due = parseDateSafe(t.dueDate || t.scheduledDate);
  return !!due && due.toDateString() === new Date().toDateString();
}

/** Heute, überfällig oder ohne Datum. Erledigte und archivierte Todos gehören nicht in die Gruppen. */
function groupOpenTodos(roots: TaskWithChildren[]): Section[] {
  const today = startOfToday();
  const overdue: TaskWithChildren[] = [];
  const todays: TaskWithChildren[] = [];
  const undated: TaskWithChildren[] = [];

  roots.forEach((t) => {
    if (t.isCompleted || isTaskArchived(t)) return;
    const due = parseDateSafe(t.dueDate || t.scheduledDate);
    if (!due) {
      undated.push(t);
      return;
    }
    const day = new Date(due);
    day.setHours(0, 0, 0, 0);
    if (day.getTime() === today.getTime()) todays.push(t);
    else if (day < today) overdue.push(t);
    else undated.push(t);
  });

  const sections: Section[] = [];
  if (overdue.length) sections.push({ key: 'overdue', title: 'Überfällig', items: overdue });
  if (todays.length) sections.push({ key: 'today', title: 'Heute', items: todays });
  if (undated.length) sections.push({ key: 'undated', title: 'Ohne Datum', items: undated });
  return sections;
}

/** Richtet die Liste nach Ordnern aus, für die Ansicht „Ordner“. */
function groupByFolder(roots: TaskWithChildren[]): Section[] {
  const map = new Map<string, TaskWithChildren[]>();
  roots.forEach((t) => {
    if (t.isCompleted || isTaskArchived(t)) return;
    const key = t.folder || 'Ohne Ordner';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  });
  return Array.from(map.entries()).map(([title, items]) => ({ key: title, title, items }));
}

function dateBlock(t: TaskWithChildren, isToday: boolean): React.ReactNode {
  const due = parseDateSafe(t.dueDate || t.scheduledDate);
  if (isToday) return <div className="w-[44px] shrink-0 text-center text-[13px] font-bold">Heute</div>;
  if (!due) return <div className="w-[44px] shrink-0" />;
  return (
    <div className="w-[44px] shrink-0 text-center leading-[1.15] text-t2-ink">
      <b className="block text-[15px] font-bold">{due.getDate()}.</b>
      <small className="text-[11px] font-semibold uppercase tracking-wide">
        {due.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '')}
      </small>
    </div>
  );
}

export const MobileTodoView: React.FC = () => {
  const tasks = useDataStore((s) => s.tasks) as TaskItem[];
  const toggleTask = useDataStore((s) => s.toggleTask);
  const deleteTask = useDataStore((s) => s.deleteTask);
  const updateTask = useDataStore((s) => s.updateTask);
  const [overdueMenuId, setOverdueMenuId] = useState<string | null>(null);
  const [mode, setMode] = useState<'list' | 'folders'>('list');
  /** Ids, deren Untertodo-Liste umgeschaltet wurde (heute: zugeklappt, sonst: aufgeklappt). */
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const [showCompleted, setShowCompleted] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const scrolledRef = useRef(false);

  const { knownIds: knownTagIds } = useTagRegistry();
  const rawTagFilter = useDataStore((s) => s.todoTagFilter);
  const setTagFilter = useDataStore((s) => s.setTodoTagFilter);
  const tagFilter = useMemo(() => pruneTagFilter(rawTagFilter, knownTagIds), [rawTagFilter, knownTagIds]);
  const tagFilterActive = isTagFilterActive(tagFilter);

  const roots = useMemo<TaskWithChildren[]>(
    () => buildTaskTree(tasks)
      .filter((t) => matchesTagFilter(t.tags ?? [], tagFilter, knownTagIds))
      .map((t) => ({ ...t, children: kids(t) ?? [] })),
    [tasks, tagFilter, knownTagIds],
  );
  const sections = useMemo(
    () => (mode === 'list' ? groupOpenTodos(roots) : groupByFolder(roots)),
    [roots, mode],
  );
  const todayAll = useMemo(() => roots.filter(isDueToday), [roots]);
  const completedRoots = useMemo(
    () => roots
      .filter((t) => t.isCompleted)
      .sort((a, b) => String(b.completedAt ?? '').localeCompare(String(a.completedAt ?? ''))),
    [roots],
  );
  const archivedCount = useMemo(() => roots.filter((t) => isTaskArchived(t)).length, [roots]);

  // Beim Öffnen auf „Heute“ scrollen, damit überfällige Todos darüber nur kurz stören.
  useEffect(() => {
    if (scrolledRef.current || mode !== 'list') return;
    const box = scrollRef.current;
    const el = todayRef.current;
    if (!box || !el) return;
    scrolledRef.current = true;
    box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - 8;
  }, [mode, sections]);

  const toggleOne = (id: string) => { void toggleTask(id); };

  /** Ring-Tipp: alle Untertodos auf den gleichen Stand bringen, oder das Todo selbst. */
  const toggleAll = (t: TaskWithChildren) => {
    if (!kids(t).length) { toggleOne(t.id); return; }
    const target = kids(t).some((c) => !c.isCompleted);
    kids(t).forEach((c) => { if (c.isCompleted !== !target) toggleOne(c.id); });
  };

  const toggleExpanded = (id: string) => {
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const renderCard = (t: TaskWithChildren, isToday: boolean) => {
    const kidList = kids(t);
    const hasKids = kidList.length > 0;
    const openKids = kidList.filter((c) => !c.isCompleted);
    const doneKids = kidList.length - openKids.length;
    const isOpen = hasKids && (isToday ? !toggled.has(t.id) : toggled.has(t.id));
    const shown = isOpen ? (isToday ? openKids : kidList) : [];
    const due = parseDateSafe(t.dueDate || t.scheduledDate);
    const isOverdue = !isToday && !t.isCompleted && !!due && due < startOfToday();

    return (
      <SwipeRow
        key={t.id}
        completeLabel={t.isCompleted ? 'Wieder öffnen' : 'Erledigen'}
        onComplete={() => toggleOne(t.id)}
        onDelete={() => { void deleteTask(t.id); }}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => setDetailId(t.id)}
          onKeyDown={(e) => { if (e.key === 'Enter') setDetailId(t.id); }}
          className={`flex items-start gap-3 p-3.5 cursor-pointer rounded-[18px] shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-transform active:scale-[0.99] ${
            isToday ? 'bg-cal-praktikum text-white' : 'bg-t2-surface text-t2-ink ring-1 ring-t2-line'
          }`}
        >
          {dateBlock(t, isToday)}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                onClick={hasKids ? (e) => { e.stopPropagation(); toggleExpanded(t.id); } : undefined}
                className={`flex-1 min-w-0 truncate text-[16px] font-semibold leading-[22px] ${t.isCompleted ? 'line-through opacity-50' : ''}`}
              >
                {t.title}
              </span>
              {isOverdue && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setOverdueMenuId((id) => (id === t.id ? null : t.id)); }}
                  aria-expanded={overdueMenuId === t.id}
                  className="shrink-0 rounded-full bg-t2-late px-2 py-0.5 text-[11px] font-bold text-white"
                >
                  Überfällig
                </button>
              )}
              <span onClick={(e) => { e.stopPropagation(); toggleAll(t); }} role="presentation">
                <TodoProgressRing segments={hasKids ? kidList.map((c) => c.isCompleted) : [t.isCompleted]} inverted={isToday} />
              </span>
            </div>
            <div className={`mt-0.5 flex items-center gap-2 text-[12.5px] ${isToday ? 'opacity-80' : 'text-t2-ink-3'}`}>
              {t.priority && <MobilePriorityIcon priority={t.priority} />}
              {t.folder && <span className="truncate">{t.folder}</span>}
              {hasKids && (
                <span className="inline-flex shrink-0 items-center gap-1">
                  {doneKids === kidList.length ? <CheckCheck size={14} strokeWidth={2.2} /> : <ListTodo size={14} strokeWidth={2.2} />}
                  {doneKids}/{kidList.length}
                </span>
              )}
            </div>

            {isOverdue && overdueMenuId === t.id && (
              <div className="mt-2 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => { void updateTask(t.id, { dueDate: isoDay(new Date()), scheduledDate: isoDay(new Date()) }); setOverdueMenuId(null); }} className="rounded-full bg-t2-sub px-3 py-1 text-[12px] font-semibold text-t2-ink">Auf heute</button>
                <button type="button" onClick={() => { const m = isoDay(addDays(new Date(), 1)); void updateTask(t.id, { dueDate: m, scheduledDate: m }); setOverdueMenuId(null); }} className="rounded-full bg-t2-sub px-3 py-1 text-[12px] font-semibold text-t2-ink">Morgen</button>
                <label aria-label="Anderes Datum wählen" title="Anderes Datum wählen" className="relative grid h-[27px] w-[27px] place-items-center rounded-full bg-t2-sub text-t2-ink-2">
                  <CalendarDays size={14} />
                  <input
                    type="date"
                    aria-label="Anderes Datum wählen"
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    onChange={(e) => { if (e.target.value) { void updateTask(t.id, { dueDate: e.target.value, scheduledDate: e.target.value }); setOverdueMenuId(null); } }}
                  />
                </label>
              </div>
            )}
            {shown.length > 0 && (
              <div className="mt-2 flex flex-col gap-2">
                {shown.map((c) => (
                  <div
                    key={c.id}
                    onClick={(e) => { e.stopPropagation(); toggleOne(c.id); }}
                    className={`flex items-center gap-2.5 text-[14px] ${c.isCompleted ? 'opacity-50 line-through' : ''}`}
                  >
                    <CheckMark checked={c.isCompleted} inverted={isToday} size={18} />
                    <span className="truncate">{c.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SwipeRow>
    );
  };

  const selected = detailId ? tasks.find((t) => t.id === detailId) : undefined;
  if (selected) {
    // Zurück aus einem Untertodo führt zum Eltern-Todo, sonst zur Liste.
    const parent = selected.parentId ? tasks.find((t) => t.id === selected.parentId) : undefined;
    return (
      <MobileTodoDetail
        task={selected}
        parent={parent}
        onBack={() => setDetailId(parent ? parent.id : null)}
        onOpenSubtask={setDetailId}
      />
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-5 pt-3 pb-1">
        <div className="flex-1 min-w-0">
          <div className="text-[28px] font-bold leading-tight tracking-[-0.025em] text-t2-ink">Todos</div>
          <div className="mt-3 flex gap-1" role="tablist" aria-label="Ansicht">
            {([['list', 'Liste'], ['folders', 'Ordner']] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={mode === key}
                onClick={() => setMode(key)}
                className={`rounded-full px-3 py-1.5 text-[13.5px] transition-colors ${
                  mode === key ? 'bg-t2-sub font-semibold text-t2-ink' : 'font-medium text-t2-ink-3'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {mode === 'list' && todayAll.length > 0 && (
          <div className="relative grid shrink-0 place-items-center" aria-label={`Heute: ${todayAll.filter((t) => t.isCompleted).length} von ${todayAll.length} erledigt`}>
            <TodoProgressRing segments={todayAll.map((t) => t.isCompleted)} size={60} />
            <span className="absolute text-[13px] font-bold text-t2-ink">
              {todayAll.filter((t) => t.isCompleted).length}/{todayAll.length}
            </span>
          </div>
        )}
      </div>

      {tagFilterActive && (
        <div className="px-5 pb-1">
          <button
            type="button"
            onClick={() => setTagFilter(EMPTY_TAG_FILTER)}
            className="rounded-full bg-t2-sub px-3 py-1 text-[12.5px] font-semibold text-t2-ink"
          >
            Filter zurücksetzen
          </button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 pb-28 flex flex-col gap-2">
        {sections.map((s) => (
          <React.Fragment key={s.key}>
            <div
              ref={s.key === 'today' ? todayRef : undefined}
              className="mt-3.5 mb-0.5 flex items-center gap-2 px-1.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-t2-ink-3"
            >
              {s.title}
              <em className="not-italic font-medium">{s.items.length}</em>
              <span className="h-px flex-1 bg-t2-line-soft" />
            </div>
            {s.items.map((t) => renderCard(t, s.key === 'today'))}
          </React.Fragment>
        ))}

        {mode === 'list' && (
          <>
            <button
              type="button"
              onClick={() => setShowCompleted((p) => !p)}
              aria-expanded={showCompleted}
              className="mt-3.5 mb-0.5 flex w-full items-center gap-2 px-1.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-t2-ink-3"
            >
              Kürzlich erledigt <em className="not-italic font-medium">{completedRoots.length}</em>
              <span className="h-px flex-1 bg-t2-line-soft" />
              <ChevronDown size={14} className={`transition-transform ${showCompleted ? 'rotate-180' : ''}`} />
            </button>
            {showCompleted && completedRoots.length === 0 && (
              <div className="px-1.5 py-2 text-[13px] text-t2-ink-3">Noch nichts erledigt</div>
            )}
            {showCompleted && completedRoots.slice(0, 30).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setDetailId(t.id)}
                className="flex items-center gap-3 rounded-[14px] bg-t2-sub px-3.5 py-2.5 text-left text-[14px] text-t2-ink-2"
              >
                <CheckMark checked size={18} />
                <span className="flex-1 min-w-0 truncate line-through opacity-70">{t.title}</span>
              </button>
            ))}
            <div className="mt-3.5 mb-0.5 flex items-center gap-2 px-1.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-t2-ink-3">
              Archiv <em className="not-italic font-medium">{archivedCount}</em>
              <span className="h-px flex-1 bg-t2-line-soft" />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MobileTodoView;
