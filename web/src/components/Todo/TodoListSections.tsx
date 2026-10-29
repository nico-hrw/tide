'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, ListTodo, ChevronRight, Archive, CheckCircle2, Timer,
  AlertCircle, Calendar, Clock,
} from 'lucide-react';
import { format, isToday, isBefore, startOfDay, addDays, isSameDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { TaskItem } from '@/store/useDataStore';
import { FilterStatus, ArchiveTier, ARCHIVE_TIER_CONFIG, TaskWithChildren, parseDateSafe } from './types';
import { TaskCreateDraft } from './TodoCreateCard';

export interface TodoListSectionsProps {
  selectedFolder: string | null;
  setSelectedFolder: (folder: string | null) => void;
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
  setSelectedTag: (tag: string | null) => void;
  selectedTag: string | null;
  renderTask: (task: TaskWithChildren) => React.ReactNode;
  editingTaskId?: string | null;
  selectedDateFilter?: Date | null;
  setSelectedDateFilter?: (date: Date | null) => void;
}

export const TodoListSections: React.FC<TodoListSectionsProps> = ({
  selectedFolder, setSelectedFolder, filterStatus, searchQuery, tasks, sortedTasks, tasksToRender, activeTasks, recentlyCompletedTasks, archivedTasks, archivedByTier, openTiers, showCompleted, showArchive, setShowCompleted, setShowArchive, setOpenTiers, setDraft, setIsCreateOpen, setSelectedTag, selectedTag, renderTask, editingTaskId = null,
  selectedDateFilter = null, setSelectedDateFilter,
}) => {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isDateGroupedView = selectedDateFilter === null && filterStatus !== 'completed' && filterStatus !== 'archived';

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
        badgeClass: 'text-gray-400 dark:text-zinc-500',
        titleColor: 'text-gray-400 dark:text-zinc-500',
        icon: AlertCircle,
      },
      {
        key: 'today',
        title: 'Heute',
        tasks: todayTasks,
        badgeClass: 'text-gray-400 dark:text-zinc-500',
        titleColor: 'text-gray-400 dark:text-zinc-500',
        icon: Clock,
      },
      {
        key: 'tomorrow',
        title: 'Morgen',
        tasks: tomorrowTasks,
        badgeClass: 'text-gray-400 dark:text-zinc-500',
        titleColor: 'text-gray-400 dark:text-zinc-500',
        icon: Calendar,
      },
      {
        key: 'upcoming',
        title: 'Demnächst',
        tasks: upcoming,
        badgeClass: 'text-gray-400 dark:text-zinc-500',
        titleColor: 'text-gray-400 dark:text-zinc-500',
        icon: Calendar,
      },
      {
        key: 'no_date',
        title: 'Ohne Datum',
        tasks: noDate,
        badgeClass: 'text-gray-400 dark:text-zinc-500',
        titleColor: 'text-gray-400 dark:text-zinc-500',
        icon: ListTodo,
      },
    ];
  }, [isDateGroupedView, tasksToRender]);

  const renderTaskItem = (task: TaskWithChildren | TaskItem) => {
    const isEditing = task.id === editingTaskId;
    const isOther = Boolean(editingTaskId && !isEditing);

    const animateState = editingTaskId
      ? isEditing
        ? { opacity: 1, y: 0, scale: 1, display: 'block' }
        : { opacity: 0, display: 'none' }
      : { opacity: 1, y: 0, scale: 1, display: 'block' };

    const itemStyle: React.CSSProperties | undefined = isOther
      ? { pointerEvents: 'none' }
      : undefined;

    return (
      <motion.div
        key={task.id}
        initial={{ opacity: 0, y: -8 }}
        animate={animateState}
        exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.2, ease: 'easeOut' } }}
        transition={isOther ? { duration: 0.05, ease: 'easeOut' } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
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
    ? `#${selectedTag}`
    : selectedFolder
    ? selectedFolder
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
          className="text-lg font-bold text-gray-900 dark:text-white mt-1"
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
            <Calendar size={18} className="text-blue-500" />
            <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white capitalize">
              {isToday(selectedDateFilter)
                ? 'Heute'
                : format(selectedDateFilter, 'EEEE, d. MMMM', { locale: de })}
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-semibold">
              {tasksToRender.length} {tasksToRender.length === 1 ? 'Aufgabe' : 'Aufgaben'}
            </span>
          </div>
          {setSelectedDateFilter && (
            <button
              type="button"
              onClick={() => setSelectedDateFilter(null)}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              Alle Aufgaben anzeigen
            </button>
          )}
        </motion.div>
      )}

      {/* When a specific date is selected and there are no tasks for it */}
      {selectedDateFilter !== null && tasksToRender.length === 0 && (
        <div className="bg-white dark:bg-[#1a1a1a] border border-gray-200/80 dark:border-white/10 rounded-2xl p-8 text-center flex flex-col items-center justify-center shadow-2xs my-2">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center mb-3">
            <Calendar size={24} />
          </div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">
            {isToday(selectedDateFilter) ? 'Keine Aufgaben für heute' : `Keine Aufgaben am ${format(selectedDateFilter, 'd. MMMM', { locale: de })}`}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mb-4">
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
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-xs cursor-pointer"
            >
              <Plus size={14} />
              <span>Aufgabe für diesen Tag erstellen</span>
            </button>
            {setSelectedDateFilter && (
              <button
                type="button"
                onClick={() => setSelectedDateFilter(null)}
                className="px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-all cursor-pointer"
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
            const isCollapsed = Boolean(collapsedSections[section.key]) && !section.tasks.some((t) => t.id === editingTaskId);

            return (
              <div key={section.key} className="flex flex-col">
                {/* Collapsible Section Header */}
                <motion.button
                  type="button"
                  onClick={() => toggleSection(section.key)}
                  animate={
                    editingTaskId
                      ? { opacity: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' as const, marginBottom: 0 }
                      : { opacity: 1, height: 'auto', pointerEvents: 'auto' as const, marginBottom: 6 }
                  }
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-2 py-1 px-0.5 text-left w-full cursor-pointer select-none group"
                >
                  <ChevronRight
                    size={13}
                    className={`text-gray-400 dark:text-zinc-500 group-hover:text-gray-600 dark:group-hover:text-zinc-300 transition-transform duration-200 ${
                      !isCollapsed ? 'rotate-90' : ''
                    }`}
                  />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-zinc-500">
                    {section.title}
                  </span>
                  <span className="text-[10px] font-medium text-gray-400 dark:text-zinc-500">
                    {section.tasks.length}
                  </span>
                  <div className="h-px flex-1 bg-gray-200/60 dark:bg-white/10" />
                </motion.button>

                {/* Section Tasks */}
                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      className={`flex flex-col ${editingTaskId !== null ? 'gap-0 h-full flex-1 min-h-0' : 'gap-1.5'}`}
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
            className="py-4 text-center text-xs text-gray-500 dark:text-gray-400 font-medium"
          >
            Alle offenen Aufgaben erledigt! 🎉
          </motion.div>
        )}

        {/* Collapsible Completed Tasks Section when filterStatus === 'all' */}
        {filterStatus === 'all' && recentlyCompletedTasks.length > 0 && (
          <motion.div
            className="mt-2 pt-3 border-t border-gray-200 dark:border-white/10"
            animate={
              editingTaskId
                ? { opacity: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' as const }
                : { opacity: 1, height: 'auto', pointerEvents: 'auto' as const }
            }
            transition={{ duration: 0.15 }}
          >
            <button
              type="button"
              onClick={() => setShowCompleted((prev) => !prev)}
              className="w-full flex items-center justify-between text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors cursor-pointer py-1.5 select-none"
            >
              <div className="flex items-center gap-2">
                <ChevronRight
                  size={16}
                  className={`transition-transform duration-200 ${showCompleted ? 'rotate-90' : ''}`}
                />
                <CheckCircle2 size={15} className="text-emerald-500" />
                <span>Kürzlich erledigt</span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 font-normal">(letzte 7 Tage)</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-400">
                {recentlyCompletedTasks.length}
              </span>
            </button>

            <AnimatePresence initial={false}>
              {showCompleted && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="overflow-hidden pt-2 flex flex-col gap-3"
                >
                  <AnimatePresence mode="popLayout" initial={false}>
                    {recentlyCompletedTasks.map((task) => (
                      <motion.div
                        key={task.id}
                        layout
                        initial={{ opacity: 0, y: -8 }}
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
          </motion.div>
        )}

        {/* In filterStatus === 'completed', if there are no recently completed tasks but there are archived tasks */}
        {filterStatus === 'completed' && recentlyCompletedTasks.length === 0 && archivedTasks.length > 0 && (
          <motion.div
            animate={
              editingTaskId
                ? { opacity: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' as const }
                : { opacity: 1, height: 'auto', pointerEvents: 'auto' as const }
            }
            transition={{ duration: 0.15 }}
            className="py-3 text-center text-xs text-gray-500 dark:text-gray-400 font-medium"
          >
            Keine Aufgaben in den letzten 7 Tagen erledigt. Ältere Aufgaben befinden sich im Archiv unten.
          </motion.div>
        )}

        {/* Collapsible Archive Section when filterStatus === 'all' | 'completed' | 'archived' */}
        {(filterStatus === 'all' || filterStatus === 'completed' || filterStatus === 'archived') && archivedTasks.length > 0 && (
          <motion.div
            className="mt-3 pt-3 border-t border-gray-200 dark:border-white/10"
            animate={
              editingTaskId
                ? { opacity: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' as const }
                : { opacity: 1, height: 'auto', pointerEvents: 'auto' as const }
            }
            transition={{ duration: 0.15 }}
          >
                <button
                  type="button"
                  onClick={() => setShowArchive((prev) => !prev)}
                  className="w-full flex items-center justify-between text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors cursor-pointer py-1.5 select-none"
                >
                  <div className="flex items-center gap-2">
                    <ChevronRight
                      size={16}
                      className={`transition-transform duration-200 ${showArchive || filterStatus === 'archived' ? 'rotate-90' : ''}`}
                    />
                    <Archive size={15} className="text-gray-500 dark:text-gray-400" />
                    <span>Archiv</span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 font-normal">(&gt; 7 Tage)</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-400">
                    {archivedTasks.length}
                  </span>
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
                            className="rounded-2xl border border-gray-200/80 dark:border-white/10 bg-gray-50/50 dark:bg-white/[0.02] p-3 sm:p-3.5 transition-all"
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
                                  className={`text-gray-400 transition-transform duration-200 ${isTierOpen ? 'rotate-90' : ''}`}
                                />
                                <div className={`p-1.5 rounded-lg ${tierCfg.bg} ${tierCfg.color}`}>
                                  <TierIcon size={14} />
                                </div>
                                <div className="flex items-baseline gap-1.5 text-left">
                                  <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                                    {tierCfg.label}
                                  </span>
                                  <span className="text-[10px] text-gray-400 dark:text-gray-500 font-normal">
                                    ({tierCfg.sublabel})
                                  </span>
                                </div>
                              </div>
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white dark:bg-white/10 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-white/5 shadow-2xs">
                                {tierTasks.length}
                              </span>
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
              <div className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-2xl p-12 text-center flex flex-col items-center justify-center shadow-2xs">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center mb-3">
                  {filterStatus === 'completed' ? (
                    <CheckCircle2 size={24} />
                  ) : filterStatus === 'in_progress' ? (
                    <Timer size={24} className="text-amber-500" />
                  ) : filterStatus === 'archived' ? (
                    <Archive size={24} className="text-purple-500" />
                  ) : (
                    <ListTodo size={24} />
                  )}
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">
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
                    ? `Keine Aufgaben mit #${selectedTag}`
                    : selectedFolder !== null
                    ? `Keine Aufgaben in "${selectedFolder || 'Ohne Ordner'}"`
                    : 'Noch keine Aufgaben'}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mb-4">
                  {searchQuery
                    ? `Für "${searchQuery}" wurden keine passenden Aufgaben gefunden.`
                    : filterStatus === 'archived'
                    ? 'Aufgaben, die älter als 7 Tage erledigt sind, werden hier übersichtlich nach Alter gruppiert.'
                    : filterStatus === 'in_progress'
                    ? 'Aktuell ist keine Aufgabe in Bearbeitung. Klicke auf das Stoppuhr-Symbol einer Aufgabe, um sie zu starten.'
                    : selectedTag !== null
                    ? `Es gibt aktuell keine passenden Aufgaben mit dem Tag #${selectedTag}.`
                    : selectedFolder !== null
                    ? `In diesem Ordner befinden sich aktuell keine passenden Aufgaben.`
                    : tasks.length === 0
                    ? 'Erstelle oben deine erste Aufgabe, um Termine, Prioritäten und Wiederholungen zu planen.'
                    : 'Keine Aufgaben für die aktuellen Filterkriterien vorhanden.'}
                </p>
                {selectedTag !== null ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDraft((p) => ({ ...p, folder: selectedFolder || '', tags: [selectedTag] }));
                        setIsCreateOpen(true);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-xs cursor-pointer"
                    >
                      <Plus size={14} /><span>Aufgabe mit #{selectedTag} erstellen</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedTag(null)}
                      className="px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-all cursor-pointer"
                    >
                      Tag-Filter aufheben
                    </button>
                  </div>
                ) : selectedFolder !== null ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDraft((p) => ({ ...p, folder: selectedFolder || '' }));
                        setIsCreateOpen(true);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-xs cursor-pointer"
                    >
                      <Plus size={14} /><span>Aufgabe in diesem Ordner erstellen</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedFolder(null)}
                      className="px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-all cursor-pointer"
                    >
                      Filter aufheben
                    </button>
                  </div>
                ) : tasks.length === 0 && !searchQuery ? (
                  <button
                    type="button" onClick={() => setIsCreateOpen(true)}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-xs cursor-pointer"
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
