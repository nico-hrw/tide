'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, ListTodo, ChevronRight, Archive, CheckCircle2, Timer,
  AlertCircle, Calendar, Clock,
} from 'lucide-react';
import { format, isToday, isBefore, startOfDay, addDays, isSameDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { TaskItem } from '@/store/useDataStore';
import { tagFilterTexts } from '@/lib/tagFilter';
import { FilterStatus, ArchiveTier, ARCHIVE_TIER_CONFIG, TaskWithChildren, parseDateSafe } from './types';
import { TaskCreateDraft } from './TodoCreateCard';

export interface TodoListSectionsProps {
  filterStatus: FilterStatus;
  searchQuery: string;
  tasks: TaskItem[];
  sortedTasks: TaskItem[];
  tasksToRender: (TaskWithChildren | TaskItem)[];
  activeTasks: (TaskWithChildren | TaskItem)[];
  recentlyCompletedTasks: (TaskWithChildren | TaskItem)[];
  archivedTasks: (TaskWithChildren | TaskItem)[];
  archivedByTier: Record<ArchiveTier, (TaskWithChildren | TaskItem)[]>;
  openTiers: Record<ArchiveTier, boolean>;
  showCompleted: boolean;
  showArchive: boolean;
  setShowCompleted: React.Dispatch<React.SetStateAction<boolean>>;
  setShowArchive: React.Dispatch<React.SetStateAction<boolean>>;
  setOpenTiers: React.Dispatch<React.SetStateAction<Record<ArchiveTier, boolean>>>;
  setDraft: React.Dispatch<React.SetStateAction<TaskCreateDraft>>;
  setIsCreateOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** Label of the active tag filter (resolved titles / "Ohne Tag"), null when no tag filter is active. */
  selectedTag: string | null;
  /** Tag ids of the active filter, used to prefill new tasks. */
  selectedTagIds: string[];
  clearTagFilter: () => void;
  renderTask: (task: TaskWithChildren) => React.ReactNode;
  editingTaskId?: string | null;
  selectedDateFilter?: Date | null;
  setSelectedDateFilter?: (date: Date | null) => void;
}

export const TodoListSections: React.FC<TodoListSectionsProps> = ({
  filterStatus, searchQuery, tasks, sortedTasks, tasksToRender, activeTasks, recentlyCompletedTasks, archivedTasks, archivedByTier, openTiers, showCompleted, showArchive, setShowCompleted, setShowArchive, setOpenTiers, setDraft, setIsCreateOpen, selectedTag, selectedTagIds, clearTagFilter, renderTask, editingTaskId = null,
  selectedDateFilter = null, setSelectedDateFilter,
}) => {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isDateGroupedView = selectedDateFilter === null && filterStatus !== 'completed' && filterStatus !== 'archived';

  const isEditingCompleted = Boolean(
    editingTaskId &&
      recentlyCompletedTasks.some(
        (t) => t.id === editingTaskId || (t as TaskWithChildren).children?.some((c) => c.id === editingTaskId)
      )
  );
  const isEditingArchived = Boolean(
    editingTaskId &&
      archivedTasks.some(
        (t) => t.id === editingTaskId || (t as TaskWithChildren).children?.some((c) => c.id === editingTaskId)
      )
  );

  useEffect(() => {
    if (isEditingCompleted && !showCompleted) {
      setShowCompleted(true);
    }
  }, [isEditingCompleted, showCompleted, setShowCompleted]);

  const dateSections = useMemo(() => {
    if (!isDateGroupedView) return [];
    const today = startOfDay(new Date());
    const tomorrow = startOfDay(addDays(today, 1));

    const overdue: (TaskWithChildren | TaskItem)[] = [];
    const todayTasks: (TaskWithChildren | TaskItem)[] = [];
    const tomorrowTasks: (TaskWithChildren | TaskItem)[] = [];
    const upcoming: (TaskWithChildren | TaskItem)[] = [];
    const noDate: (TaskWithChildren | TaskItem)[] = [];

    for (const task of tasksToRender) {
      const rawDate = task.dueDate || task.scheduledDate;
      const d = parseDateSafe(rawDate);
      if (!d) {
        noDate.push(task);
        continue;
      }
      const day = startOfDay(d);
      if (isBefore(day, today)) {
        overdue.push(task);
      } else if (isSameDay(day, today)) {
        todayTasks.push(task);
      } else if (isSameDay(day, tomorrow)) {
        tomorrowTasks.push(task);
      } else {
        upcoming.push(task);
      }
    }

    return [
      {
        key: 'overdue',
        title: 'Überfällig',
        tasks: overdue,
        badgeClass: 'text-t2-ink-3 ',
        titleColor: 'text-t2-ink-3 ',
        icon: AlertCircle,
      },
      {
        key: 'today',
        title: 'Heute',
        tasks: todayTasks,
        badgeClass: 'text-t2-ink-3 ',
        titleColor: 'text-t2-ink-3 ',
        icon: Clock,
      },
      {
        key: 'tomorrow',
        title: 'Morgen',
        tasks: tomorrowTasks,
        badgeClass: 'text-t2-ink-3 ',
        titleColor: 'text-t2-ink-3 ',
        icon: Calendar,
      },
      {
        key: 'upcoming',
        title: 'Demnächst',
        tasks: upcoming,
        badgeClass: 'text-t2-ink-3 ',
        titleColor: 'text-t2-ink-3 ',
        icon: Calendar,
      },
      {
        key: 'no_date',
        title: 'Ohne Datum',
        tasks: noDate,
        badgeClass: 'text-t2-ink-3 ',
        titleColor: 'text-t2-ink-3 ',
        icon: ListTodo,
      },
    ];
  }, [isDateGroupedView, tasksToRender]);

  const renderTaskItem = (task: TaskWithChildren | TaskItem) => {
    const isEditing = task.id === editingTaskId || (task as TaskWithChildren).children?.some((c) => c.id === editingTaskId);
    const isOther = Boolean(editingTaskId && !isEditing);

    const animateState = editingTaskId
      ? isEditing
        ? { opacity: 1, y: 0, scale: 1, height: 'auto', display: 'flex' }
        : {
            opacity: 0,
            scale: 0.95,
            y: -10,
            height: 0,
            overflow: 'hidden',
            transitionEnd: { display: 'none' },
          }
      : {
          opacity: 1,
          y: 0,
          scale: 1,
          height: 'auto',
          display: 'block',
          overflow: 'visible',
        };

    const itemStyle: React.CSSProperties | undefined = isOther
      ? { pointerEvents: 'none' }
      : undefined;

    return (
      <motion.div
        key={task.id}
        initial={{ opacity: 0, y: -8 }}
        animate={animateState}
        exit={{ opacity: 0, scale: 0.95, y: -8, transition: { duration: 0.2, ease: 'easeOut' } }}
        transition={
          isOther
            ? { duration: 0.22, ease: [0.16, 1, 0.3, 1] }
            : { duration: 0.25, ease: [0.16, 1, 0.3, 1] }
        }
        style={itemStyle}
        className={isEditing ? 'relative z-20 h-full flex-1 min-h-0 flex flex-col' : undefined}
      >
        {renderTask(task as TaskWithChildren)}
      </motion.div>
    );
  };
  const sectionTitle = searchQuery
    ? 'Suchergebnisse'
    : selectedTag
    ? tagFilterTexts(selectedTag, selectedTagIds).sectionTitle
    : filterStatus === 'completed'
    ? 'Kürzlich erledigt'
    : filterStatus === 'archived'
    ? 'Archiv'
    : filterStatus === 'in_progress'
    ? 'In Arbeit'
    : null;

  return (
    <>
      {tasksToRender.length > 0 && sectionTitle && (
        <motion.h2
          animate={
            editingTaskId
              ? { opacity: 0, height: 0, marginBottom: 0, overflow: 'hidden', pointerEvents: 'none' as const }
              : { opacity: 1, height: 'auto', marginBottom: 12, pointerEvents: 'auto' as const }
          }
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="text-lg font-bold text-t2-ink  mt-1"
        >
          {sectionTitle}
        </motion.h2>
      )}

      {/* Task Cards List */}
      <div className={`flex flex-col ${editingTaskId !== null ? 'gap-0 h-full flex-1 min-h-0' : 'gap-1.5'}`}>
        {selectedDateFilter !== null && (
        <motion.div
          animate={
            editingTaskId
              ? { opacity: 0, height: 0, marginBottom: 0, overflow: 'hidden', pointerEvents: 'none' as const }
              : { opacity: 1, height: 'auto', marginBottom: 10, pointerEvents: 'auto' as const }
          }
          transition={{ duration: 0.3 }}
          className="flex items-center justify-between mt-1 px-1"
        >
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-t2-accent" />
            <h2 className="text-base sm:text-lg font-bold text-t2-ink  capitalize">
              {isToday(selectedDateFilter)
                ? 'Heute'
                : format(selectedDateFilter, 'EEEE, d. MMMM', { locale: de })}
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-t2-sub  text-t2-accent  font-semibold">
              {tasksToRender.length} {tasksToRender.length === 1 ? 'Aufgabe' : 'Aufgaben'}
            </span>
          </div>
          {setSelectedDateFilter && (
            <button
              type="button"
              onClick={() => setSelectedDateFilter(null)}
              className="text-xs text-t2-accent  hover:underline cursor-pointer"
            >
              Alle Aufgaben anzeigen
            </button>
          )}
        </motion.div>
      )}

      {/* When a specific date is selected and there are no tasks for it */}
      {selectedDateFilter !== null && tasksToRender.length === 0 && (
        <div className="bg-t2-surface  border border-t2-line  rounded-2xl p-8 text-center flex flex-col items-center justify-center shadow-2xs my-2">
          <div className="w-12 h-12 rounded-2xl bg-t2-sub text-t2-accent flex items-center justify-center mb-3">
            <Calendar size={24} />
          </div>
          <h3 className="text-base font-bold text-t2-ink  mb-1">
            {isToday(selectedDateFilter) ? 'Keine Aufgaben für heute' : `Keine Aufgaben am ${format(selectedDateFilter, 'd. MMMM', { locale: de })}`}
          </h3>
          <p className="text-xs text-t2-ink-2  max-w-sm mb-4">
            {isToday(selectedDateFilter)
              ? 'Für heute sind aktuell keine Aufgaben geplant.'
              : 'Für dieses Datum sind aktuell keine Aufgaben eingetragen.'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft((p) => ({
                  ...p,
                  dueDate: format(selectedDateFilter, 'yyyy-MM-dd'),
                }));
                setIsCreateOpen(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-t2-accent-ink bg-t2-accent hover:opacity-90 rounded-xl transition-all shadow-xs cursor-pointer"
            >
              <Plus size={14} />
              <span>Aufgabe für diesen Tag erstellen</span>
            </button>
            {setSelectedDateFilter && (
              <button
                type="button"
                onClick={() => setSelectedDateFilter(null)}
                className="px-4 py-2 text-xs font-medium text-t2-ink-2  hover:bg-t2-hover  rounded-xl transition-all cursor-pointer"
              >
                Alle anzeigen
              </button>
            )}
          </div>
        </div>
      )}

      {/* Task Cards List: Grouped by date if default view, or flat if date selected or completed */}
      {isDateGroupedView ? (
        <div className={`flex flex-col ${editingTaskId !== null ? 'gap-0 h-full flex-1 min-h-0' : 'gap-3.5 sm:gap-4'}`}>
          {dateSections.map((section) => {
            if (section.tasks.length === 0) return null;
            const hasEditingTask = Boolean(editingTaskId && section.tasks.some((t) => t.id === editingTaskId || (t as TaskWithChildren).children?.some((c) => c.id === editingTaskId)));
            const isCollapsed = Boolean(collapsedSections[section.key]) && !hasEditingTask;

            return (
              <div
                key={section.key}
                id={section.key === 'today' ? 'todo-section-today' : undefined}
                className={`flex flex-col ${hasEditingTask ? 'h-full flex-1 min-h-0' : editingTaskId ? 'pointer-events-none' : ''}`}
              >
                {/* Collapsible Section Header */}
                <motion.button
                  type="button"
                  onClick={() => toggleSection(section.key)}
                  animate={
                    editingTaskId
                      ? { opacity: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' as const, marginBottom: 0 }
                      : { opacity: 1, height: 'auto', pointerEvents: 'auto' as const, marginBottom: 6 }
                  }
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="flex items-center gap-2 py-1 px-0.5 text-left w-full cursor-pointer select-none group"
                >
                  <ChevronRight
                    size={13}
                    className={`text-t2-ink-3  group-hover:text-t2-ink-2  transition-transform duration-200 ${
                      !isCollapsed ? 'rotate-90' : ''
                    }`}
                  />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-t2-ink-3 ">
                    {section.title}
                  </span>
                  {(section.key === 'today' || section.key === 'tomorrow') && (
                    <span className="text-[11px] font-medium text-t2-ink-3 ">
                      {section.tasks.length}
                    </span>
                  )}
                  <div className="h-px flex-1 bg-t2-stage " />
                </motion.button>

                {/* Section Tasks */}
                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                      className={`flex flex-col ${hasEditingTask ? 'gap-0 h-full flex-1 min-h-0' : editingTaskId !== null ? 'gap-0' : 'gap-1.5'}`}
                    >
                      <AnimatePresence initial={false}>
                        {section.tasks.map(renderTaskItem)}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={`flex flex-col ${editingTaskId !== null ? 'gap-0 h-full flex-1 min-h-0' : 'gap-1.5'}`}>
          <AnimatePresence initial={false}>
            {tasksToRender.map(renderTaskItem)}
          </AnimatePresence>
        </div>
      )}

        {filterStatus === 'all' && activeTasks.length === 0 && (recentlyCompletedTasks.length > 0 || archivedTasks.length > 0) && (
          <motion.div
            animate={
              editingTaskId
                ? { opacity: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' as const }
                : { opacity: 1, height: 'auto', pointerEvents: 'auto' as const }
            }
            transition={{ duration: 0.15 }}
            className="py-4 text-center text-xs text-t2-ink-2  font-medium"
          >
            Alle offenen Aufgaben erledigt! 🎉
          </motion.div>
        )}

        {/* Collapsible Completed Tasks Section when filterStatus === 'all' */}
        {filterStatus === 'all' && recentlyCompletedTasks.length > 0 && (
          <motion.div
            className={`mt-2 pt-3 ${isEditingCompleted ? 'border-t-0' : 'border-t border-t2-line '}`}
            animate={
              editingTaskId && !isEditingCompleted
                ? { opacity: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' as const }
                : { opacity: 1, height: 'auto', pointerEvents: 'auto' as const }
            }
            transition={{ duration: 0.15 }}
          >
            <motion.button
              type="button"
              onClick={() => setShowCompleted((prev) => !prev)}
              animate={
                editingTaskId
                  ? { opacity: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' as const, marginBottom: 0 }
                  : { opacity: 1, height: 'auto', pointerEvents: 'auto' as const, marginBottom: 0 }
              }
              transition={{ duration: 0.15 }}
              className="w-full flex items-center justify-between text-xs font-bold text-t2-ink-2  hover:text-t2-ink  transition-colors cursor-pointer py-1.5 select-none"
            >
              <div className="flex items-center gap-2">
                <ChevronRight
                  size={16}
                  className={`transition-transform duration-200 ${showCompleted ? 'rotate-90' : ''}`}
                />
                <CheckCircle2 size={15} className="text-emerald-500" />
                <span>Kürzlich erledigt</span>
                <span className="text-[11px] text-t2-ink-3  font-normal">(letzte 7 Tage)</span>
              </div>
            </motion.button>

            <AnimatePresence initial={false}>
              {showCompleted && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="overflow-hidden pt-2 flex flex-col gap-3"
                >
                  <AnimatePresence initial={false}>
                    {recentlyCompletedTasks.map(renderTaskItem)}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* In filterStatus === 'completed', if there are no recently completed tasks but there are archived tasks */}
        {filterStatus === 'completed' && recentlyCompletedTasks.length === 0 && archivedTasks.length > 0 && (
          <motion.div
            animate={
              editingTaskId && !isEditingArchived
                ? { opacity: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' as const }
                : { opacity: 1, height: 'auto', pointerEvents: 'auto' as const }
            }
            transition={{ duration: 0.15 }}
            className="py-3 text-center text-xs text-t2-ink-2  font-medium"
          >
            Keine Aufgaben in den letzten 7 Tagen erledigt. Ältere Aufgaben befinden sich im Archiv unten.
          </motion.div>
        )}

        {/* Collapsible Archive Section when filterStatus === 'all' | 'completed' | 'archived' */}
        {(filterStatus === 'all' || filterStatus === 'completed' || filterStatus === 'archived') && archivedTasks.length > 0 && (
          <motion.div
            className={`mt-3 pt-3 ${isEditingArchived ? 'border-t-0' : 'border-t border-t2-line '}`}
            animate={
              editingTaskId && !isEditingArchived
                ? { opacity: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' as const }
                : { opacity: 1, height: 'auto', pointerEvents: 'auto' as const }
            }
            transition={{ duration: 0.15 }}
          >
                <button
                  type="button"
                  onClick={() => setShowArchive((prev) => !prev)}
                  className="w-full flex items-center justify-between text-xs font-bold text-t2-ink-2  hover:text-t2-ink  transition-colors cursor-pointer py-1.5 select-none"
                >
                  <div className="flex items-center gap-2">
                    <ChevronRight
                      size={16}
                      className={`transition-transform duration-200 ${showArchive || filterStatus === 'archived' ? 'rotate-90' : ''}`}
                    />
                    <Archive size={15} className="text-t2-ink-2 " />
                    <span>Archiv</span>
                    <span className="text-[11px] text-t2-ink-3  font-normal">(&gt; 7 Tage)</span>
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {(showArchive || filterStatus === 'archived') && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="overflow-hidden pt-2 flex flex-col gap-3"
                    >
                      {ARCHIVE_TIER_CONFIG.map((tierCfg) => {
                        const tierTasks = archivedByTier[tierCfg.key];
                        if (tierTasks.length === 0) return null;
                        const isTierOpen = openTiers[tierCfg.key];
                        const TierIcon = tierCfg.icon;

                        return (
                          <div
                            key={tierCfg.key}
                            className="rounded-2xl border border-t2-line  bg-t2-sub  p-3 sm:p-3.5 transition-all"
                          >
                            {/* Tier Accordion Header */}
                            <button
                              type="button"
                              onClick={() => setOpenTiers((prev) => ({ ...prev, [tierCfg.key]: !prev[tierCfg.key] }))}
                              className="w-full flex items-center justify-between cursor-pointer select-none"
                            >
                              <div className="flex items-center gap-2 sm:gap-2.5">
                                <ChevronRight
                                  size={14}
                                  className={`text-t2-ink-3 transition-transform duration-200 ${isTierOpen ? 'rotate-90' : ''}`}
                                />
                                <div className={`p-1.5 rounded-lg ${tierCfg.bg} ${tierCfg.color}`}>
                                  <TierIcon size={14} />
                                </div>
                                <div className="flex items-baseline gap-1.5 text-left">
                                  <span className="text-xs font-bold text-t2-ink ">
                                    {tierCfg.label}
                                  </span>
                                  <span className="text-[11px] text-t2-ink-3  font-normal">
                                    ({tierCfg.sublabel})
                                  </span>
                                </div>
                              </div>
                            </button>

                            {/* Tier Tasks List */}
                            <AnimatePresence initial={false}>
                              {isTierOpen && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                                  className="overflow-hidden pt-3 flex flex-col gap-2.5"
                                >
                                  <AnimatePresence mode="popLayout" initial={false}>
                                    {tierTasks.map((task) => (
                                      <motion.div
                                        key={task.id}
                                        layout
                                        initial={{ opacity: 0, y: -6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{
                                          opacity: 0,
                                          x: -20,
                                          height: 0,
                                          marginBottom: 0,
                                          scale: 0.95,
                                          transition: { duration: 0.35, ease: [0.32, 0.72, 0, 1] }
                                        }}
                                        transition={{
                                          layout: { type: 'spring', damping: 26, stiffness: 280 }
                                        }}
                                      >
                                        {renderTask(task as TaskWithChildren)}
                                      </motion.div>
                                    ))}
                                  </AnimatePresence>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {sortedTasks.length === 0 && selectedDateFilter === null && (
              <div className="bg-t2-surface  border border-t2-line  rounded-2xl p-12 text-center flex flex-col items-center justify-center shadow-2xs">
                <div className="w-12 h-12 rounded-2xl bg-t2-sub text-t2-accent flex items-center justify-center mb-3">
                  {filterStatus === 'completed' ? (
                    <CheckCircle2 size={24} />
                  ) : filterStatus === 'in_progress' ? (
                    <Timer size={24} className="text-amber-500" />
                  ) : filterStatus === 'archived' ? (
                    <Archive size={24} className="text-t2-accent" />
                  ) : (
                    <ListTodo size={24} />
                  )}
                </div>
                <h3 className="text-base font-bold text-t2-ink  mb-1">
                  {filterStatus === 'completed'
                    ? 'Keine kürzlich erledigten Aufgaben'
                    : filterStatus === 'archived'
                    ? 'Keine archivierten Aufgaben'
                    : filterStatus === 'in_progress'
                    ? 'Keine Aufgaben in Bearbeitung'
                    : filterStatus === 'active'
                    ? 'Alles erledigt!'
                    : searchQuery
                    ? 'Keine Aufgaben gefunden'
                    : selectedTag !== null
                    ? tagFilterTexts(selectedTag, selectedTagIds).emptyTitle
                    : 'Noch keine Aufgaben'}
                </h3>
                <p className="text-xs text-t2-ink-2  max-w-sm mb-4">
                  {searchQuery
                    ? `Für "${searchQuery}" wurden keine passenden Aufgaben gefunden.`
                    : filterStatus === 'archived'
                    ? 'Aufgaben, die älter als 7 Tage erledigt sind, werden hier übersichtlich nach Alter gruppiert.'
                    : filterStatus === 'in_progress'
                    ? 'Aktuell ist keine Aufgabe in Bearbeitung. Klicke auf das Stoppuhr-Symbol einer Aufgabe, um sie zu starten.'
                    : selectedTag !== null
                    ? tagFilterTexts(selectedTag, selectedTagIds).emptyHint
                    : tasks.length === 0
                    ? 'Erstelle oben deine erste Aufgabe, um Termine, Prioritäten und Wiederholungen zu planen.'
                    : 'Keine Aufgaben für die aktuellen Filterkriterien vorhanden.'}
                </p>
                {selectedTag !== null ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDraft((p) => ({ ...p, tags: selectedTagIds }));
                        setIsCreateOpen(true);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-t2-accent-ink bg-t2-accent hover:opacity-90 rounded-xl transition-all shadow-xs cursor-pointer"
                    >
                      <Plus size={14} /><span>{tagFilterTexts(selectedTag, selectedTagIds).createLabel}</span>
                    </button>
                    <button
                      type="button"
                      onClick={clearTagFilter}
                      className="px-4 py-2 text-xs font-medium text-t2-ink-2  hover:bg-t2-hover  rounded-xl transition-all cursor-pointer"
                    >
                      Tag-Filter aufheben
                    </button>
                  </div>
                ) : tasks.length === 0 && !searchQuery ? (
                  <button
                    type="button" onClick={() => setIsCreateOpen(true)}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-t2-accent-ink bg-t2-accent hover:opacity-90 rounded-xl transition-all shadow-xs cursor-pointer"
                  >
                    <Plus size={14} /><span>Erste Aufgabe erstellen</span>
                  </button>
                ) : null}
              </div>
            )}
          </div>
    </>
  );
};

export default TodoListSections;
