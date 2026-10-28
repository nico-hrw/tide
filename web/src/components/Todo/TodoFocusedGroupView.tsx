'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Minimize2,
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Timer,
  Calendar,
  AlertCircle,
  Layers,
  Folder,
  Tag,
} from 'lucide-react';
import { TaskItem } from '@/store/useDataStore';
import {
  TaskWithChildren,
  PRIORITY_CONFIG,
  getTaskPriority,
  getDeadlineInfo,
  getDeadlineChipClasses,
} from './types';

export interface TodoFocusedGroupViewProps {
  groupTask: TaskWithChildren;
  allTasks: TaskItem[];
  onMinimize: () => void;
  onToggleTask: (task: TaskItem) => void;
  onToggleInProgress: (task: TaskItem) => void;
  onUpdateTask: (id: string, updates: Partial<TaskItem>) => Promise<void> | void;
  onDeleteTask: (id: string) => Promise<void> | void;
  onAddSubtask: (title: string, parentId: string) => Promise<void> | void;
  completingTaskIds?: Set<string>;
}

export const TodoFocusedGroupView: React.FC<TodoFocusedGroupViewProps> = ({
  groupTask,
  allTasks,
  onMinimize,
  onToggleTask,
  onToggleInProgress,
  onUpdateTask,
  onDeleteTask,
  onAddSubtask,
  completingTaskIds,
}) => {
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);

  // Always resolve latest version of the parent task from the full task list
  const liveParent = useMemo(() => {
    return allTasks.find((t) => t.id === groupTask.id) || groupTask;
  }, [allTasks, groupTask]);

  // Current subtasks of this group
  const subtasks = useMemo(() => {
    return allTasks
      .filter((t) => t.parentId === groupTask.id)
      .sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
        if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
        return 0;
      });
  }, [allTasks, groupTask.id]);

  const totalSubtasks = subtasks.length;
  const completedSubtasks = subtasks.filter((s) => s.isCompleted).length;
  const percent = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;

  const parentPriority = getTaskPriority(liveParent);
  const parentPriorityCfg = PRIORITY_CONFIG[parentPriority];
  const parentDeadline = getDeadlineInfo(liveParent.dueDate || liveParent.scheduledDate);
  const isParentCompleted = liveParent.isCompleted || (completingTaskIds?.has(liveParent.id) ?? false);

  // Esc key listener: cancel edit first, otherwise minimize
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingSubtaskId) {
          setEditingSubtaskId(null);
        } else {
          onMinimize();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingSubtaskId, onMinimize]);

  // Auto-focus input on edit
  useEffect(() => {
    if (editingSubtaskId) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingSubtaskId]);

  const handleStartEdit = (subtask: TaskItem) => {
    setEditingSubtaskId(subtask.id);
    setEditingTitle(subtask.title);
  };

  const handleSaveEdit = async (id: string) => {
    const trimmed = editingTitle.trim();
    if (!trimmed) return;
    await onUpdateTask(id, { title: trimmed });
    setEditingSubtaskId(null);
  };

  const handleQuickAdd = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = newSubtaskTitle.trim();
    if (!trimmed || isAdding) return;

    try {
      setIsAdding(true);
      await onAddSubtask(trimmed, liveParent.id);
      setNewSubtaskTitle('');
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-5 sm:gap-6 py-2">
      {/* Top Bar: Breadcrumb + Minimieren Button */}
      <div className="flex items-center justify-between gap-3 w-full">
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400 min-w-0">
          <button
            type="button"
            onClick={onMinimize}
            className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 rounded-xl text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors font-semibold cursor-pointer shrink-0"
            title="Zurück zur Gesamtübersicht (Esc)"
          >
            <ArrowLeft size={15} />
            <span>Aufgaben</span>
          </button>
          <span className="text-gray-300 dark:text-gray-600 select-none">/</span>
          <span className="font-bold text-gray-900 dark:text-white truncate">
            {liveParent.title}
          </span>
        </div>

        <button
          type="button"
          onClick={onMinimize}
          className="flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20 shadow-2xs hover:shadow-xs transition-all cursor-pointer shrink-0"
          title="Gruppe minimieren (Esc)"
        >
          <Minimize2 size={14} className="text-blue-500" />
          <span>Minimieren</span>
          <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 text-[10px] font-mono text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-white/5 rounded border border-gray-200 dark:border-white/10">
            Esc
          </kbd>
        </button>
      </div>

      {/* Hero Card: Centered Parent Group Todo */}
      <motion.div
        layout
        initial={{ opacity: 0, y: 15, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="bg-white dark:bg-[#1a1a1a] rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm p-4 sm:p-6 flex flex-col gap-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => onToggleTask(liveParent)}
              className="mt-0.5 p-1 -ml-1 text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400 transition-colors shrink-0 cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center"
              aria-label={isParentCompleted ? 'Als unvollständig markieren' : 'Als erledigt markieren'}
            >
              {isParentCompleted ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-500 fill-emerald-500/20" />
              ) : (
                <Circle className="w-6 h-6 hover:text-blue-500 transition-colors" />
              )}
            </button>

            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
                  <Layers size={11} className="text-blue-500" />
                  <span>Gruppe</span>
                </span>
                <h1
                  className={`text-lg sm:text-xl font-bold tracking-tight truncate ${
                    isParentCompleted
                      ? 'line-through text-gray-400 dark:text-gray-500'
                      : 'text-gray-900 dark:text-white'
                  }`}
                >
                  {liveParent.title}
                </h1>
              </div>

              {liveParent.description && (
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 whitespace-pre-wrap mt-0.5">
                  {liveParent.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {parentDeadline && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border ${getDeadlineChipClasses(
                  parentDeadline.status,
                  isParentCompleted
                )}`}
              >
                {parentDeadline.status === 'overdue' && !isParentCompleted ? (
                  <AlertCircle size={12} />
                ) : (
                  <Calendar size={12} />
                )}
                <span>{parentDeadline.label}</span>
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${parentPriorityCfg.bg} ${parentPriorityCfg.text} ${parentPriorityCfg.border}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${parentPriorityCfg.dot}`} />
              <span>{parentPriorityCfg.label}</span>
            </span>
          </div>
        </div>

        {/* Tags and Folder */}
        {((liveParent.tags && liveParent.tags.length > 0) || liveParent.folder) && (
          <div className="flex flex-wrap items-center gap-1.5 pl-9">
            {liveParent.folder && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-white/10">
                <Folder size={11} className="text-gray-500" />
                <span>{liveParent.folder}</span>
              </span>
            )}
            {liveParent.tags?.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-medium bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20"
              >
                <Tag size={10} />
                <span>{tag}</span>
              </span>
            ))}
          </div>
        )}

        {/* Progress Bar & Subtasks Count */}
        <div className="flex flex-col gap-2 pt-3 border-t border-gray-100 dark:border-white/5">
          <div className="flex items-center justify-between text-xs font-medium text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1.5 font-semibold text-gray-700 dark:text-gray-300">
              <Layers size={13} className="text-blue-500" />
              <span>Unteraufgaben</span>
            </span>
            <span>
              {completedSubtasks} von {totalSubtasks} erledigt ({percent}%)
            </span>
          </div>

          <div className="w-full bg-gray-100 dark:bg-white/10 h-2.5 rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full transition-all duration-300 ${
                percent === 100 ? 'bg-emerald-500' : 'bg-blue-600 dark:bg-blue-500'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
        </div>
      </motion.div>

      {/* Inline Quick-Add for New Subtasks */}
      <form
        onSubmit={handleQuickAdd}
        className="flex items-center gap-2 bg-white dark:bg-[#1a1a1a] rounded-2xl border border-gray-200 dark:border-white/10 shadow-2xs p-2 sm:p-2.5 focus-within:border-blue-500/60 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all"
      >
        <div className="p-1 text-blue-500 shrink-0">
          <Plus size={18} />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={newSubtaskTitle}
          onChange={(e) => setNewSubtaskTitle(e.target.value)}
          placeholder="Neue Unteraufgabe hinzufügen... (Enter zum Speichern)"
          className="flex-1 bg-transparent text-xs sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none min-w-0"
        />
        <button
          type="submit"
          disabled={!newSubtaskTitle.trim() || isAdding}
          className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer shadow-xs shrink-0"
        >
          Hinzufügen
        </button>
      </form>

      {/* Subtasks List */}
      <div className="flex flex-col gap-2.5">
        {totalSubtasks === 0 ? (
          <div className="py-8 text-center text-xs sm:text-sm text-gray-400 dark:text-gray-500 bg-white/40 dark:bg-white/[0.02] border border-dashed border-gray-200 dark:border-white/10 rounded-2xl">
            Keine Unteraufgaben vorhanden. Füge oben die erste Unteraufgabe hinzu.
          </div>
        ) : (
          <AnimatePresence mode="popLayout" initial={false}>
            {subtasks.map((subtask, idx) => {
              const isSubtaskCompleted =
                subtask.isCompleted || (completingTaskIds?.has(subtask.id) ?? false);
              const isEditing = editingSubtaskId === subtask.id;

              return (
                <motion.div
                  key={subtask.id}
                  layout
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: idx * 0.03 } }}
                  exit={{
                    opacity: 0,
                    x: -25,
                    height: 0,
                    marginBottom: 0,
                    transition: { duration: 0.25 },
                  }}
                  className={`group relative flex items-center justify-between gap-2.5 p-3 sm:p-3.5 rounded-2xl border transition-all duration-150 ${
                    isSubtaskCompleted
                      ? 'border-gray-100 dark:border-white/5 bg-gray-50/60 dark:bg-[#161616] opacity-75'
                      : subtask.status === 'in_progress'
                      ? 'bg-amber-500/[0.04] dark:bg-amber-500/[0.06] border-amber-500/40 dark:border-amber-500/30 shadow-2xs'
                      : 'bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20 shadow-2xs hover:shadow-xs'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* Subtask Checkbox */}
                    <button
                      type="button"
                      onClick={() => onToggleTask(subtask)}
                      className="p-1 -ml-1 text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400 transition-colors shrink-0 cursor-pointer min-w-[28px] min-h-[28px] flex items-center justify-center"
                      aria-label={
                        isSubtaskCompleted ? 'Als unvollständig markieren' : 'Als erledigt markieren'
                      }
                    >
                      {isSubtaskCompleted ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 fill-emerald-500/20" />
                      ) : (
                        <Circle className="w-4 h-4 hover:text-blue-500 transition-colors" />
                      )}
                    </button>

                    {/* In-progress timer button */}
                    <button
                      type="button"
                      onClick={() => onToggleInProgress(subtask)}
                      className={`p-1 rounded-lg transition-all shrink-0 cursor-pointer min-w-[26px] min-h-[26px] flex items-center justify-center ${
                        subtask.status === 'in_progress'
                          ? 'text-amber-500 bg-amber-500/20 ring-1 ring-amber-500/40 shadow-xs'
                          : 'text-gray-400 hover:text-amber-500 hover:bg-amber-500/10'
                      }`}
                      title={
                        subtask.status === 'in_progress'
                          ? 'In Bearbeitung'
                          : "Als 'in Bearbeitung' markieren"
                      }
                    >
                      <Timer
                        className={`w-3.5 h-3.5 ${
                          subtask.status === 'in_progress' ? 'animate-pulse' : ''
                        }`}
                      />
                    </button>

                    {/* Subtask Title (Editable) */}
                    {isEditing ? (
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(subtask.id);
                            if (e.key === 'Escape') setEditingSubtaskId(null);
                          }}
                          className="flex-1 px-2 py-1 text-xs sm:text-sm bg-gray-50 dark:bg-white/5 border border-blue-500 rounded-lg text-gray-900 dark:text-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(subtask.id)}
                          className="p-1 rounded-md text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors cursor-pointer"
                          title="Speichern"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingSubtaskId(null)}
                          className="p-1 rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                          title="Abbrechen"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <span
                        onClick={() => handleStartEdit(subtask)}
                        className={`text-xs sm:text-sm font-medium truncate flex-1 min-w-0 cursor-text select-text ${
                          isSubtaskCompleted
                            ? 'line-through text-gray-400 dark:text-gray-500'
                            : 'text-gray-800 dark:text-gray-200'
                        }`}
                        title="Klicken zum Bearbeiten"
                      >
                        {subtask.title}
                      </span>
                    )}
                  </div>

                  {/* Actions: Edit & Delete */}
                  {!isEditing && (
                    <div className="flex items-center gap-1 shrink-0 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(subtask)}
                        className="p-1 rounded-lg text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                        title="Bearbeiten"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteTask(subtask.id)}
                        className="p-1 rounded-lg text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                        title="Löschen"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

export default TodoFocusedGroupView;
