'use client';

import React, { useMemo, useState } from 'react';
import { useDataStore } from '@/store/useDataStore';
import type { TaskItem } from '@/store/slices/types';
import { buildTaskTree } from './treeUtils';
import { TaskWithChildren, isTaskArchived, parseDateSafe } from './types';
import { MobileTodoDetail } from './MobileTodoDetail';
import { TodoProgressRing, CheckMark } from './MobileTodoParts';

const kids = (t: TaskWithChildren): TaskWithChildren[] => t.children ?? [];

type Section = { key: string; title: string; items: TaskWithChildren[] };

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
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
  const overdue = due < startOfToday();
  return (
    <div className={`w-[44px] shrink-0 text-center leading-[1.15] ${overdue ? 'text-t2-late' : 'text-t2-ink-3'}`}>
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
  const [mode, setMode] = useState<'list' | 'folders'>('list');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);

  const roots = useMemo<TaskWithChildren[]>(
    () => buildTaskTree(tasks).map((t) => ({ ...t, children: kids(t) ?? [] })),
    [tasks],
  );
  const sections = useMemo(
    () => (mode === 'list' ? groupOpenTodos(roots) : groupByFolder(roots)),
    [roots, mode],
  );
  const completedCount = useMemo(() => roots.filter((t) => t.isCompleted).length, [roots]);
  const archivedCount = useMemo(() => roots.filter((t) => isTaskArchived(t)).length, [roots]);

  const toggleOne = (id: string) => { void toggleTask(id); };

  /** Ring-Tipp: alle Untertodos auf den gleichen Stand bringen, oder das Todo selbst. */
  const toggleAll = (t: TaskWithChildren) => {
    if (!kids(t).length) { toggleOne(t.id); return; }
    const target = kids(t).some((c) => !c.isCompleted);
    kids(t).forEach((c) => { if (c.isCompleted !== !target) toggleOne(c.id); });
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const onCardTap = (t: TaskWithChildren, isToday: boolean) => {
    if (isToday || !kids(t).length) { setDetailId(t.id); return; }
    if (expanded.has(t.id)) setDetailId(t.id);     // zweiter Tipp: ganze Seite
    else toggleExpanded(t.id);                     // erster Tipp: aufklappen
  };

  const renderCard = (t: TaskWithChildren, isToday: boolean) => {
    const openChildren = kids(t).filter((c) => !c.isCompleted);
    const isOpen = expanded.has(t.id);
    const showChildren = isToday ? openChildren.slice(0, 3) : (isOpen ? kids(t) : []);
    const hidden = isToday ? Math.max(0, openChildren.length - 3) : 0;
    const due = parseDateSafe(t.dueDate || t.scheduledDate);
    const isOverdue = !isToday && !t.isCompleted && !!due && due < startOfToday();

    return (
      <div
        key={t.id}
        role="button"
        tabIndex={0}
        onClick={() => onCardTap(t, isToday)}
        onKeyDown={(e) => { if (e.key === 'Enter') onCardTap(t, isToday); }}
        className={`flex items-start gap-3 rounded-[18px] p-3.5 cursor-pointer ${
          isToday ? 'bg-cal-praktikum text-white' :'bg-[color-mix(in_srgb,#5C6E6C_8%,var(--t2-bg))] text-t2-ink'
        }`}
      >
        {dateBlock(t, isToday)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`flex-1 min-w-0 truncate text-[16px] font-semibold leading-[22px] ${t.isCompleted ? 'line-through opacity-50' : ''}`}>
              {t.title}
            </span>
            {isOverdue && <span className="shrink-0 rounded-full bg-t2-late px-2 py-0.5 text-[11px] font-bold text-white">Überfällig</span>}
            <span onClick={(e) => { e.stopPropagation(); toggleAll(t); }} role="presentation">
              <TodoProgressRing segments={kids(t).length ? kids(t).map((c) => c.isCompleted) : [t.isCompleted]} inverted={isToday} />
            </span>
          </div>
          {t.folder && <div className={`text-[12.5px] ${isToday ? 'opacity-70' : 'text-t2-ink-3'}`}>{t.folder}</div>}

          {showChildren.length > 0 && (
            <div className="mt-2 flex flex-col gap-2">
              {showChildren.map((c) => (
                <div
                  key={c.id}
                  onClick={(e) => { e.stopPropagation(); toggleOne(c.id); }}
                  className={`flex items-center gap-2.5 text-[14px] ${c.isCompleted ? 'opacity-50 line-through' : ''}`}
                >
                  <CheckMark checked={c.isCompleted} inverted={isToday} size={18} />
                  <span className="truncate">{c.title}</span>
                </div>
              ))}
              {hidden > 0 && <div className="pl-7 text-[12.5px] opacity-70">+ {hidden} weitere</div>}
            </div>
          )}

          {!isToday && kids(t).length > 0 && !isOpen && (
            <div className="mt-1.5 text-[12.5px] text-t2-ink-3">
              {openChildren.length === 0 ? 'Alle Untertodos erledigt' : `${openChildren.length} Untertodos`}
            </div>
          )}
        </div>
      </div>
    );
  };

  const selected = detailId ? tasks.find((t) => t.id === detailId) : undefined;
  if (selected) {
    return <MobileTodoDetail task={selected} onBack={() => setDetailId(null)} />;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-5 pt-3 pb-1">
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

      <div className="flex-1 overflow-y-auto px-3.5 pb-28 flex flex-col gap-2">
        {sections.map((s) => (
          <React.Fragment key={s.key}>
            <div className="mt-3.5 mb-0.5 flex items-center gap-2 px-1.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-t2-ink-3">
              {s.title}
              <em className="not-italic font-medium">{s.items.length}</em>
              <span className="h-px flex-1 bg-t2-line-soft" />
            </div>
            {s.items.map((t) => renderCard(t, s.key === 'today'))}
          </React.Fragment>
        ))}

        {mode === 'list' && (
          <>
            <div className="mt-3.5 mb-0.5 flex items-center gap-2 px-1.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-t2-ink-3">
              Kürzlich erledigt <em className="not-italic font-medium">{completedCount}</em>
              <span className="h-px flex-1 bg-t2-line-soft" />
            </div>
            <div className="mt-1 flex items-center gap-3 rounded-[14px] bg-t2-sub px-3.5 py-3 text-[14px] text-t2-ink-2">
              {completedCount} erledigte Todos
            </div>
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
