'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { TaskItem } from '@/store/useDataStore';
import { ArchiveTier, ARCHIVE_TIER_CONFIG, FilterStatus, TaskWithChildren } from './types';
import { groupRootsByDay } from './todoHierarchy';
import { TodoCard } from './TodoCard';
import { TodoDetailPane } from './TodoDetailPane';
import { TodoWeekStats } from './TodoWeekStats';

type Node = TaskWithChildren | TaskItem;

export interface TodoDesktopViewProps {
  tasks: TaskItem[];
  tasksToRender: Node[];
  recentlyCompletedTasks: Node[];
  archivedTasks: Node[];
  archivedByTier: Record<ArchiveTier, Node[]>;
  filterStatus: FilterStatus;
  showCompleted: boolean;
  showArchive: boolean;
  setShowCompleted: React.Dispatch<React.SetStateAction<boolean>>;
  setShowArchive: React.Dispatch<React.SetStateAction<boolean>>;
  completingTaskIds: Set<string>;
  initialTaskId?: string | null;
  onSelectTask?: (task: TaskItem) => void;
  onToggleTask: (task: TaskItem) => void;
  onToggleSubtask: (id: string) => void;
  onUpdateTask: (id: string, patch: Partial<TaskItem>) => void;
  onAddSubtask: (title: string, parent: TaskItem) => void | Promise<void>;
  onDeleteTask: (id: string) => void;
  /** Inhalt über der Liste (Erstellformular). */
  topSlot?: React.ReactNode;
}

const asTree = (n: Node): TaskWithChildren => n as TaskWithChildren;

// Only today and tomorrow carry a number; totals for older/later/archived lists only add pressure.
const showsCount = (key: string) => key === 'today' || key === 'tomorrow';

const GroupHeader: React.FC<{ label: string; count?: number; onClick?: () => void; open?: boolean }> = ({ label, count, onClick, open }) => {
  const Chevron = open === false ? ChevronRight : ChevronDown;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="flex items-center gap-2 mt-2.5 mx-1 text-[11.5px] font-semibold tracking-[.06em] uppercase text-t2-ink-3 text-left cursor-pointer disabled:cursor-default"
    >
      <Chevron size={13} />
      {label}
      {count !== undefined && <em className="not-italic font-medium">{count}</em>}
      <span className="flex-1 h-px bg-t2-line-soft" />
    </button>
  );
};

export const TodoDesktopView: React.FC<TodoDesktopViewProps> = ({
  tasks, tasksToRender, recentlyCompletedTasks, archivedTasks, archivedByTier, filterStatus,
  showCompleted, showArchive, setShowCompleted, setShowArchive, completingTaskIds,
  initialTaskId, onSelectTask, onToggleTask, onToggleSubtask, onUpdateTask, onAddSubtask, onDeleteTask, topSlot,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(initialTaskId ?? null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const [lastInitialId, setLastInitialId] = useState(initialTaskId);
  if (initialTaskId !== lastInitialId) {
    setLastInitialId(initialTaskId);
    if (initialTaskId) setSelectedId(initialTaskId);
  }

  // tasksToRender holds top-level todos only; subtodos stay inside their parent's card (todoHierarchy.ts).
  const groups = useMemo(() => groupRootsByDay(tasksToRender), [tasksToRender]);

  // Opening the list scrolls to today's todos once, so overdue ones above do not push them out of sight.
  const listRef = useRef<HTMLDivElement>(null);
  const scrolledToToday = useRef(false);
  useEffect(() => {
    if (scrolledToToday.current) return;
    const box = listRef.current;
    const todayEl = box?.querySelector<HTMLElement>('#todo-section-today');
    if (!box || !todayEl) return;
    const timer = setTimeout(() => {
      scrolledToToday.current = true;
      box.scrollTo({ top: todayEl.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 4, behavior: 'smooth' });
    }, 120);
    return () => clearTimeout(timer);
  }, [groups]);

  const selected = selectedId ? tasks.find((t) => t.id === selectedId) : undefined;
  const parentTask = selected?.parentId ? tasks.find((t) => t.id === selected.parentId) : undefined;
  // The left list highlights the top-level todo that owns the open item.
  const highlightedId = parentTask ? parentTask.id : selectedId;
  const subtasks = useMemo(
    () => (selected ? tasks.filter((t) => t.parentId === selected.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : []),
    [tasks, selected],
  );

  // One click shows the todo's content on the right at once; a todo with subtasks also unfolds its list.
  const activate = (task: TaskWithChildren) => {
    if ((task.children?.length ?? 0) > 0) {
      setExpandedId(expandedId === task.id ? null : task.id);
    }
    setSelectedId(task.id);
    onSelectTask?.(task);
  };

  const card = (n: Node) => (
    <TodoCard
      key={n.id}
      task={asTree(n)}
      isSelected={n.id === highlightedId}
      isExpanded={n.id === expandedId}
      isCompleting={completingTaskIds.has(n.id)}
      onActivate={activate}
      onToggleTask={onToggleTask}
      onToggleSubtask={onToggleSubtask}
    />
  );

  const archiveOpen = showArchive || filterStatus === 'archived';
  const showRecent = filterStatus !== 'completed' && filterStatus !== 'archived' && recentlyCompletedTasks.length > 0;

  return (
    <div className="flex-1 min-h-0 grid grid-cols-[520px_minmax(0,1fr)] gap-10 px-10 pb-6">
      <div className="flex flex-col min-h-0">
        <div ref={listRef} className="overflow-y-auto flex-1 flex flex-col gap-2 p-0.5">
          {topSlot}
          {groups.map((s) => {
            const isCollapsed = Boolean(collapsed[s.key]);
            return (
              <React.Fragment key={s.key}>
                <div id={s.key === 'today' ? 'todo-section-today' : undefined}>
                  <GroupHeader
                    label={s.title}
                    count={showsCount(s.key) ? s.items.length : undefined}
                    open={!isCollapsed}
                    onClick={() => setCollapsed((p) => ({ ...p, [s.key]: !p[s.key] }))}
                  />
                </div>
                {!isCollapsed && s.items.map(card)}
              </React.Fragment>
            );
          })}
          {groups.length === 0 && !showRecent && archivedTasks.length === 0 && (
            <p className="text-sm text-t2-ink-3 px-1 py-6">Keine Todos</p>
          )}
          {showRecent && (
            <>
              <GroupHeader label="Kürzlich erledigt" open={showCompleted} onClick={() => setShowCompleted((p) => !p)} />
              {showCompleted && recentlyCompletedTasks.map(card)}
            </>
          )}
          {archivedTasks.length > 0 && filterStatus !== 'completed' && (
            <>
              <GroupHeader label="Archiv" open={archiveOpen} onClick={() => setShowArchive((p) => !p)} />
              {archiveOpen && ARCHIVE_TIER_CONFIG.map((tier) => {
                const items = archivedByTier[tier.key];
                if (!items.length) return null;
                return (
                  <React.Fragment key={tier.key}>
                    <div className="text-xs text-t2-ink-3 mx-1 mt-1">{tier.label}</div>
                    {items.map(card)}
                  </React.Fragment>
                );
              })}
            </>
          )}
          {filterStatus === 'completed' && tasksToRender.length === 0 && <p className="text-sm text-t2-ink-3 px-1 py-6">Keine erledigten Todos</p>}
        </div>
      </div>
      {selected ? (
        <TodoDetailPane
          key={selected.id}
          task={selected}
          parent={parentTask}
          subtasks={subtasks}
          onUpdate={onUpdateTask}
          onToggleSubtask={onToggleSubtask}
          onAddSubtask={onAddSubtask}
          onDelete={onDeleteTask}
          onOpenTask={setSelectedId}
        />
      ) : (
        <TodoWeekStats tasks={tasks} />
      )}
    </div>
  );
};

export default TodoDesktopView;
