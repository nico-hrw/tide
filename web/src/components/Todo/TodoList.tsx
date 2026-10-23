'use client';

import React, { useState, useMemo } from 'react';
import {
  CheckCircle2, Circle, Calendar, Repeat, Trash2, Edit2, Plus,
  Search, SlidersHorizontal, AlertCircle, Check, X, ListTodo,
  Folder, Inbox, ArrowLeft,
} from 'lucide-react';
import {
  format, isToday, isTomorrow, isBefore, startOfDay, endOfDay,
  parseISO, addDays, addWeeks, addMonths, addYears,
} from 'date-fns';
import { useDataStore, TaskItem } from '@/store/useDataStore';
import TodoFolderOverview, { FolderStat } from './TodoFolderOverview';

export type Priority = 'low' | 'medium' | 'high';
export type FilterStatus = 'all' | 'active' | 'completed';
export type SortOption = 'created' | 'deadline' | 'priority';
export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

interface TodoListProps {
  className?: string;
  onSelectTask?: (task: TaskItem) => void;
}

export const PRIORITY_COLORS: Record<Priority, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#3b82f6',
};

const PRIORITY_CONFIG: Record<Priority, { label: string; bg: string; text: string; border: string; dot: string }> = {
  high: { label: 'Hoch', bg: 'bg-rose-500/10 dark:bg-rose-500/20', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-500/30', dot: 'bg-rose-500' },
  medium: { label: 'Mittel', bg: 'bg-amber-500/10 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/30', dot: 'bg-amber-500' },
  low: { label: 'Niedrig', bg: 'bg-emerald-500/10 dark:bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-500' },
};

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'low', label: '🟢 Niedrig' }, { value: 'medium', label: '🟡 Mittel' }, { value: 'high', label: '🔴 Hoch' },
];

const RECURRENCE_OPTIONS: { value: RecurrenceType; label: string }[] = [
  { value: 'none', label: 'Keine' }, { value: 'daily', label: 'Täglich' },
  { value: 'weekly', label: 'Wöchentlich' }, { value: 'monthly', label: 'Monatlich' }, { value: 'yearly', label: 'Jährlich' },
];

const PRIORITY_WEIGHT: Record<Priority, number> = { high: 3, medium: 2, low: 1 };

function getTaskPriority(task: TaskItem): Priority {
  if (task.priority) return task.priority;
  if (task.color === 'high' || task.color === 'rose' || task.color === 'red' || task.color === '#ef4444') return 'high';
  if (task.color === 'low' || task.color === 'emerald' || task.color === 'green' || task.color === '#3b82f6') return 'low';
  return 'medium';
}

function getPriorityColor(priority: Priority, explicitColor?: string): string {
  if (explicitColor && explicitColor !== 'low' && explicitColor !== 'medium' && explicitColor !== 'high') {
    return explicitColor;
  }
  return PRIORITY_COLORS[priority] || '#f59e0b';
}

function buildRecurrenceRule(recurrence: RecurrenceType): string | undefined {
  return recurrence === 'none' ? undefined : `FREQ=${recurrence.toUpperCase()};INTERVAL=1`;
}

function parseDateSafe(dateStr?: string): Date | null {
  if (!dateStr) return null;
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    const parsed = parseISO(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

function getDeadlineInfo(dateStr?: string): { status: 'overdue' | 'today' | 'tomorrow' | 'upcoming'; label: string } | null {
  const d = parseDateSafe(dateStr);
  if (!d) return null;
  const today = startOfDay(new Date());
  if (isBefore(startOfDay(d), today)) return { status: 'overdue', label: `Überfällig (${format(d, 'dd.MM.')})` };
  if (isToday(d)) return { status: 'today', label: 'Heute fällig' };
  if (isTomorrow(d)) return { status: 'tomorrow', label: 'Morgen fällig' };
  return { status: 'upcoming', label: `Fällig ${format(d, 'dd.MM.yyyy')}` };
}

function getDeadlineChipClasses(status: string, isCompleted: boolean): string {
  if (isCompleted) return 'bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-white/5';
  if (status === 'overdue') return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30';
  if (status === 'today') return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
  if (status === 'tomorrow') return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30';
  return 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-white/10';
}

export const TodoList: React.FC<TodoListProps> = ({ className = '', onSelectTask }) => {
  const { tasks, addTask, updateTask, toggleTask, deleteTask } = useDataStore();

  const [viewMode, setViewMode] = useState<'tasks' | 'folders'>('tasks');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [createdFolders, setCreatedFolders] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('tide_todo_folders');
        return saved ? JSON.parse(saved) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  const handleCreateFolder = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreatedFolders((prev) => {
      if (prev.includes(trimmed)) return prev;
      const next = [...prev, trimmed];
      try {
        localStorage.setItem('tide_todo_folders', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleDeleteFolder = (name: string) => {
    setCreatedFolders((prev) => {
      const next = prev.filter((f) => f !== name);
      try {
        localStorage.setItem('tide_todo_folders', JSON.stringify(next));
      } catch {}
      return next;
    });
    tasks.filter((t) => t.folder === name).forEach((t) => {
      updateTask(t.id, { folder: undefined });
    });
    if (selectedFolder === name) {
      setSelectedFolder(null);
    }
  };

  const allFolders = useMemo(() => {
    const taskFolders = tasks.map((t) => t.folder).filter(Boolean) as string[];
    return Array.from(new Set([...taskFolders, ...createdFolders])).sort();
  }, [tasks, createdFolders]);

  const folderStats: FolderStat[] = useMemo(() => {
    return allFolders.map((name) => {
      const folderTasks = tasks.filter((t) => t.folder === name);
      const total = folderTasks.length;
      const completed = folderTasks.filter((t) => t.isCompleted).length;
      return { name, total, completed, active: total - completed };
    });
  }, [allFolders, tasks]);

  const unfiledCount = useMemo(() => {
    const unfiledTasks = tasks.filter((t) => !t.folder);
    const total = unfiledTasks.length;
    const completed = unfiledTasks.filter((t) => t.isCompleted).length;
    return { total, completed, active: total - completed };
  }, [tasks]);

  const selectedFolderActiveCount = useMemo(() => {
    if (selectedFolder === null) return 0;
    return tasks.filter((t) => (selectedFolder === '' ? !t.folder : t.folder === selectedFolder) && !t.isCompleted).length;
  }, [tasks, selectedFolder]);

  const [draft, setDraft] = useState({
    title: '', description: '', priority: 'medium' as Priority,
    dueDate: '', recurrence: 'none' as RecurrenceType, recurrenceEnd: '',
    folder: '',
  });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('deadline');

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    title: '', description: '', priority: 'medium' as Priority,
    dueDate: '', recurrence: 'none' as RecurrenceType, recurrenceEnd: '',
    folder: '',
  });

  const totalCount = tasks.length;
  const completedCount = useMemo(() => tasks.filter((t) => t.isCompleted).length, [tasks]);
  const activeCount = totalCount - completedCount;
  const overdueCount = useMemo(() => {
    const today = startOfDay(new Date());
    return tasks.filter((t) => !t.isCompleted && parseDateSafe(t.dueDate || t.scheduledDate) && isBefore(startOfDay(parseDateSafe(t.dueDate || t.scheduledDate)!), today)).length;
  }, [tasks]);
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleToggleTask = (task: TaskItem) => {
    if (!task.isCompleted && task.recurrence && task.recurrence !== 'none') {
      const currentRef = task.dueDate || task.scheduledDate;
      const baseDate = parseDateSafe(currentRef) || new Date();
      const nextDate = task.recurrence === 'daily' ? addDays(baseDate, 1) : task.recurrence === 'weekly' ? addWeeks(baseDate, 1) : task.recurrence === 'monthly' ? addMonths(baseDate, 1) : addYears(baseDate, 1);
      const end = parseDateSafe(task.recurrence_end);
      if (end && nextDate > endOfDay(end)) {
        updateTask(task.id, { isCompleted: true, completed_dates: [...(task.completed_dates || []), new Date().toISOString()] });
      } else {
        const nextDateStr = currentRef && currentRef.includes('T') ? format(nextDate, "yyyy-MM-dd'T'HH:mm:ss") : format(nextDate, 'yyyy-MM-dd');
        updateTask(task.id, { dueDate: nextDateStr, scheduledDate: nextDateStr, isCompleted: false, completed_dates: [...(task.completed_dates || []), new Date().toISOString()] });
      }
    } else {
      toggleTask(task.id);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim() || isSubmitting) return;
    try {
      setIsSubmitting(true);
      const folderVal = draft.folder.trim() || undefined;
      await addTask({
        title: draft.title.trim(), description: draft.description.trim() || undefined,
        priority: draft.priority, color: getPriorityColor(draft.priority, (draft as { color?: string }).color),
        scheduledDate: draft.dueDate || undefined, dueDate: draft.dueDate || undefined,
        recurrence: draft.recurrence, recurrence_rule: buildRecurrenceRule(draft.recurrence),
        recurrence_end: draft.recurrence !== 'none' && draft.recurrenceEnd ? draft.recurrenceEnd : undefined,
        folder: folderVal,
        isCompleted: false,
      });
      if (folderVal && !createdFolders.includes(folderVal)) {
        handleCreateFolder(folderVal);
      }
      setDraft({ title: '', description: '', priority: 'medium', dueDate: '', recurrence: 'none', recurrenceEnd: '', folder: selectedFolder || '' });
      setIsCreateOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditing = (task: TaskItem) => {
    setEditingTaskId(task.id);
    setEditDraft({
      title: task.title, description: task.description || '', priority: getTaskPriority(task),
      dueDate: task.dueDate || task.scheduledDate || '', recurrence: task.recurrence || 'none', recurrenceEnd: task.recurrence_end || '',
      folder: task.folder || '',
    });
  };

  const saveEditing = (id: string) => {
    if (!editDraft.title.trim()) return;
    const folderVal = editDraft.folder.trim() || undefined;
    updateTask(id, {
      title: editDraft.title.trim(), description: editDraft.description.trim() || undefined,
      priority: editDraft.priority, color: getPriorityColor(editDraft.priority, (editDraft as { color?: string }).color),
      scheduledDate: editDraft.dueDate || undefined, dueDate: editDraft.dueDate || undefined,
      recurrence: editDraft.recurrence, recurrence_rule: buildRecurrenceRule(editDraft.recurrence),
      recurrence_end: editDraft.recurrence !== 'none' && editDraft.recurrenceEnd ? editDraft.recurrenceEnd : undefined,
      folder: folderVal,
    });
    if (folderVal && !createdFolders.includes(folderVal)) {
      handleCreateFolder(folderVal);
    }
    setEditingTaskId(null);
  };

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tasks.filter((t) => {
      if (selectedFolder !== null) {
        if (selectedFolder === '') {
          if (t.folder) return false;
        } else {
          if (t.folder !== selectedFolder) return false;
        }
      }
      if (filterStatus === 'active' && t.isCompleted) return false;
      if (filterStatus === 'completed' && !t.isCompleted) return false;
      if (filterPriority !== 'all' && getTaskPriority(t) !== filterPriority) return false;
      if (q && !t.title.toLowerCase().includes(q) && !(t.description || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, selectedFolder, filterStatus, filterPriority, searchQuery]);

  const sortedTasks = useMemo(() => [...filteredTasks].sort((a, b) => {
    if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
    if (sortBy === 'priority') {
      const diff = PRIORITY_WEIGHT[getTaskPriority(b)] - PRIORITY_WEIGHT[getTaskPriority(a)];
      if (diff !== 0) return diff;
    }
    if (sortBy === 'deadline') {
      const dA = parseDateSafe(a.dueDate || a.scheduledDate);
      const dB = parseDateSafe(b.dueDate || b.scheduledDate);
      if (dA && dB) return dA.getTime() - dB.getTime();
      if (dA && !dB) return -1;
      if (!dA && dB) return 1;
    }
    return 0;
  }), [filteredTasks, sortBy]);

  return (
    <div className={`flex-1 h-full flex flex-col bg-[#f8f9fa] dark:bg-[#121212] overflow-y-auto relative select-none ${className}`}>
      {/* Header & Status Indicator */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-3 px-6 md:px-10 py-4 border-b border-gray-200 dark:border-white/10 bg-white/90 dark:bg-[#121212]/90 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400"><ListTodo size={20} /></div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">Todos</h1>
          </div>

          {/* Segmented View Toggle: Aufgaben vs Ordner */}
          <div className="flex items-center bg-gray-100 dark:bg-white/5 p-1 rounded-xl border border-gray-200 dark:border-white/10">
            <button
              type="button"
              onClick={() => setViewMode('tasks')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                viewMode === 'tasks'
                  ? 'bg-white dark:bg-[#242424] text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <ListTodo size={14} />
              <span>Aufgaben</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('folders')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                viewMode === 'folders'
                  ? 'bg-white dark:bg-[#242424] text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Folder size={14} />
              <span>Ordner</span>
              {allFolders.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                  {allFolders.length}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="px-2.5 py-0.5 rounded-full font-medium bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-white/10">{totalCount} gesamt</span>
            <span className="px-2.5 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">{activeCount} offen</span>
            <span className="px-2.5 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">{completedCount} erledigt</span>
            {overdueCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">{overdueCount} überfällig</span>
            )}
          </div>
          {totalCount > 0 && (
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-gray-200 dark:border-white/10">
              <div className="w-20 bg-gray-200 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
              </div>
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{progressPercent}%</span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            if (viewMode === 'folders') setViewMode('tasks');
            setDraft((p) => ({ ...p, folder: selectedFolder || '' }));
            setIsCreateOpen((prev) => !prev);
          }}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-xl transition-all shadow-xs shrink-0 cursor-pointer"
        >
          <Plus size={16} /><span>Neue Aufgabe</span>
        </button>
      </div>

      {viewMode === 'folders' ? (
        <TodoFolderOverview
          folders={folderStats}
          unfiledCount={unfiledCount}
          totalAllTasks={totalCount}
          onSelectFolder={(folder) => {
            setSelectedFolder(folder);
            setViewMode('tasks');
          }}
          onCreateFolder={handleCreateFolder}
          onDeleteFolder={handleDeleteFolder}
          onBackToTasks={() => setViewMode('tasks')}
        />
      ) : (
        /* Main Container */
        <div className="max-w-4xl md:max-w-5xl w-full mx-auto px-4 md:px-8 py-6 flex flex-col gap-5">
          {/* Folder Header Banner (View b) */}
          {selectedFolder !== null && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent border border-blue-500/20 dark:border-blue-500/30">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setSelectedFolder(null)}
                  className="p-1.5 rounded-xl bg-white dark:bg-white/10 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-white shadow-2xs hover:scale-105 transition-all cursor-pointer shrink-0"
                  title="Alle Aufgaben anzeigen"
                >
                  <ArrowLeft size={16} />
                </button>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-xl bg-blue-600 text-white shrink-0">
                    {selectedFolder === '' ? <Inbox size={18} /> : <Folder size={18} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-bold text-gray-900 dark:text-white truncate">
                        {selectedFolder === '' ? 'Ohne Ordner' : selectedFolder}
                      </h2>
                      <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400">
                        {selectedFolderActiveCount} {selectedFolderActiveCount === 1 ? 'offene Aufgabe' : 'offene Aufgaben'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {selectedFolder === ''
                        ? 'Aufgaben, die keinem speziellen Ordner zugewiesen sind'
                        : `Gefilterte Ansicht für den Ordner "${selectedFolder}"`}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('folders')}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white bg-white dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 rounded-xl transition-colors cursor-pointer"
                >
                  Ordner-Übersicht
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFolder(null)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-xl transition-colors cursor-pointer"
                >
                  <X size={14} />
                  <span>Filter zurücksetzen</span>
                </button>
              </div>
            </div>
          )}

          {/* Task Creation Form Card (Collapsed by default) */}
          {isCreateOpen && (
            <div className="bg-white dark:bg-[#1a1a1a] border border-blue-500/30 dark:border-blue-500/30 rounded-2xl p-5 shadow-2xs transition-all">
              <form onSubmit={handleAddTask} className="flex flex-col gap-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Plus size={16} className="text-blue-500" />
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">Neue Aufgabe erstellen</h3>
                  </div>
                  <button type="button" onClick={() => setIsCreateOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg transition-colors cursor-pointer" aria-label="Schließen">
                    <X size={16} />
                  </button>
                </div>

                <input
                  type="text" value={draft.title} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Was möchtest du erledigen?..." autoFocus
                  className="w-full px-4 py-2.5 text-sm bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />

                <textarea
                  value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Optionale Notiz oder Beschreibung..." rows={2}
                  className="w-full px-4 py-2 text-xs bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
                />

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-gray-100 dark:border-white/5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <select
                      value={draft.priority} onChange={(e) => setDraft((p) => ({ ...p, priority: e.target.value as Priority }))}
                      className="px-3 py-1.5 text-xs font-medium bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer"
                      aria-label="Priorität"
                    >
                      {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>

                    <div className="flex items-center gap-1.5">
                      <Folder size={14} className="text-blue-500 shrink-0" />
                      <input
                        list="todo-folder-options"
                        type="text"
                        value={draft.folder}
                        onChange={(e) => setDraft((p) => ({ ...p, folder: e.target.value }))}
                        placeholder="Ordner (optional)"
                        className="px-3 py-1.5 text-xs font-medium bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 w-36 sm:w-44"
                      />
                      <datalist id="todo-folder-options">
                        {allFolders.map((f) => (
                          <option key={f} value={f} />
                        ))}
                      </datalist>
                      {draft.folder && (
                        <button
                          type="button"
                          onClick={() => setDraft((p) => ({ ...p, folder: '' }))}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-0.5"
                          title="Ordner entfernen"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    <input
                      type="date" value={draft.dueDate} onChange={(e) => setDraft((p) => ({ ...p, dueDate: e.target.value }))}
                      className="px-3 py-1.5 text-xs font-medium bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer"
                      aria-label="Fälligkeitsdatum"
                    />
                    <div className="flex items-center gap-1.5">
                      <Repeat size={14} className="text-purple-500" />
                      <select
                        value={draft.recurrence} onChange={(e) => setDraft((p) => ({ ...p, recurrence: e.target.value as RecurrenceType }))}
                        className="px-3 py-1.5 text-xs bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none cursor-pointer"
                        aria-label="Wiederholung"
                      >
                        {RECURRENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    {draft.recurrence !== 'none' && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Bis:</span>
                        <input
                          type="date" value={draft.recurrenceEnd} onChange={(e) => setDraft((p) => ({ ...p, recurrenceEnd: e.target.value }))}
                          className="px-3 py-1.5 text-xs bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none cursor-pointer"
                          aria-label="Wiederholen bis"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setIsCreateOpen(false)} className="px-3 py-1.5 text-xs rounded-xl font-medium bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 transition-colors cursor-pointer">
                      Abbrechen
                    </button>
                    <button type="submit" disabled={!draft.title.trim() || isSubmitting} className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-xs cursor-pointer">
                      <Plus size={14} /><span>Aufgabe hinzufügen</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* Filter & Sort Card */}
          <div className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-2xl p-4 sm:p-5 shadow-2xs flex flex-col gap-3.5">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Aufgaben durchsuchen..."
                  className="w-full pl-9 pr-8 py-2 text-xs bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 self-start sm:self-auto">
                {(['all', 'active', 'completed'] as FilterStatus[]).map((status) => {
                  const isActive = filterStatus === status;
                  const label = status === 'all' ? 'Alle' : status === 'active' ? 'Offen' : 'Erledigt';
                  return (
                    <button
                      key={status} type="button" onClick={() => setFilterStatus(status)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isActive ? 'bg-blue-600 text-white shadow-xs' : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick folder pills / shortcuts */}
            {(allFolders.length > 0 || unfiledCount.total > 0) && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 text-xs">
                <span className="text-gray-400 dark:text-gray-500 shrink-0 font-medium flex items-center gap-1">
                  <Folder size={12} /> Ordner:
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedFolder(null)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    selectedFolder === null
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10'
                  }`}
                >
                  Alle ({totalCount})
                </button>
                {unfiledCount.total > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedFolder(selectedFolder === '' ? null : '')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap flex items-center gap-1 transition-colors cursor-pointer ${
                      selectedFolder === ''
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10'
                    }`}
                  >
                    <Inbox size={12} />
                    <span>Ohne Ordner ({unfiledCount.total})</span>
                    {selectedFolder === '' && <X size={12} className="ml-0.5" />}
                  </button>
                )}
                {allFolders.map((folder) => {
                  const isSelected = selectedFolder === folder;
                  const count = tasks.filter((t) => t.folder === folder).length;
                  return (
                    <button
                      key={folder}
                      type="button"
                      onClick={() => setSelectedFolder(isSelected ? null : folder)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10'
                      }`}
                    >
                      <span>{folder}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-300'}`}>
                        {count}
                      </span>
                      {isSelected && <X size={12} className="ml-0.5" />}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-100 dark:border-white/5 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 dark:text-gray-400 font-medium">Priorität:</span>
                <select
                  value={filterPriority} onChange={(e) => setFilterPriority(e.target.value as Priority | 'all')}
                  className="px-2.5 py-1.5 bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-800 dark:text-gray-200 focus:outline-none cursor-pointer"
                >
                  <option value="all">Alle Prioritäten</option>
                  {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label.replace(/^[^\s]+\s/, '')}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={14} className="text-gray-400" />
                <span className="text-gray-500 dark:text-gray-400 font-medium">Sortieren:</span>
                <select
                  value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="px-2.5 py-1.5 bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-800 dark:text-gray-200 focus:outline-none cursor-pointer"
                >
                  <option value="deadline">Fälligkeit</option>
                  <option value="priority">Priorität</option>
                  <option value="created">Erstellt</option>
                </select>
              </div>
            </div>
          </div>

          {/* Task Cards List */}
          <div className="flex flex-col gap-3">
            {sortedTasks.map((task) => {
              const isEditing = editingTaskId === task.id;
              const priority = getTaskPriority(task);
              const priorityCfg = PRIORITY_CONFIG[priority];
              const deadline = getDeadlineInfo(task.dueDate || task.scheduledDate);
              const isRecurring = task.recurrence && task.recurrence !== 'none';

              if (isEditing) {
                return (
                  <div key={task.id} className="flex flex-col gap-3 p-5 rounded-2xl border border-blue-400 dark:border-blue-500/40 bg-white dark:bg-[#1a1a1a] shadow-md">
                    <input
                      type="text" value={editDraft.title} onChange={(e) => setEditDraft((p) => ({ ...p, title: e.target.value }))}
                      className="px-3 py-2 text-sm font-medium bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      placeholder="Titel der Aufgabe"
                    />
                    <textarea
                      value={editDraft.description} onChange={(e) => setEditDraft((p) => ({ ...p, description: e.target.value }))}
                      placeholder="Beschreibung (optional)" rows={2}
                      className="px-3 py-2 text-xs bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none resize-none"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100 dark:border-white/5">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={editDraft.priority} onChange={(e) => setEditDraft((p) => ({ ...p, priority: e.target.value as Priority }))}
                          className="px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none cursor-pointer"
                        >
                          {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <div className="flex items-center gap-1.5">
                          <Folder size={14} className="text-blue-500 shrink-0" />
                          <input
                            list="todo-folder-options"
                            type="text"
                            value={editDraft.folder}
                            onChange={(e) => setEditDraft((p) => ({ ...p, folder: e.target.value }))}
                            placeholder="Ordner (optional)"
                            className="px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 w-36"
                          />
                          {editDraft.folder && (
                            <button
                              type="button"
                              onClick={() => setEditDraft((p) => ({ ...p, folder: '' }))}
                              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-0.5"
                              title="Ordner entfernen"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                        <input
                          type="date" value={editDraft.dueDate} onChange={(e) => setEditDraft((p) => ({ ...p, dueDate: e.target.value }))}
                          className="px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none cursor-pointer"
                          aria-label="Fälligkeitsdatum"
                        />
                        <select
                          value={editDraft.recurrence} onChange={(e) => setEditDraft((p) => ({ ...p, recurrence: e.target.value as RecurrenceType }))}
                          className="px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none cursor-pointer"
                        >
                          {RECURRENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        {editDraft.recurrence !== 'none' && (
                          <input
                            type="date" value={editDraft.recurrenceEnd} onChange={(e) => setEditDraft((p) => ({ ...p, recurrenceEnd: e.target.value }))}
                            className="px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none cursor-pointer"
                            aria-label="Wiederholen bis"
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setEditingTaskId(null)} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-xl font-medium bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 transition-colors cursor-pointer"><X size={13} /> Abbrechen</button>
                        <button type="button" onClick={() => saveEditing(task.id)} disabled={!editDraft.title.trim()} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-xl font-medium text-white bg-blue-600 hover:bg-blue-700 transition-opacity disabled:opacity-50 cursor-pointer"><Check size={13} /> Speichern</button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={task.id}
                  onClick={() => onSelectTask?.(task)}
                  className={`group flex items-start justify-between gap-4 p-5 rounded-2xl border transition-all duration-150 ${
                    task.isCompleted
                      ? 'border-gray-100 dark:border-white/5 bg-gray-50/60 dark:bg-[#161616] opacity-75'
                      : 'bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20 shadow-2xs hover:shadow-xs'
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <button
                      type="button" onClick={(e) => { e.stopPropagation(); handleToggleTask(task); }}
                      className="mt-0.5 text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400 transition-colors shrink-0 cursor-pointer"
                      aria-label={task.isCompleted ? 'Als unvollständig markieren' : 'Als erledigt markieren'}
                    >
                      {task.isCompleted ? <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-500/20" /> : <Circle className="w-5 h-5 hover:text-blue-500 transition-colors" />}
                    </button>

                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-sm font-semibold break-words ${task.isCompleted ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
                          {task.title}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${priorityCfg.bg} ${priorityCfg.text} ${priorityCfg.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${priorityCfg.dot}`} />
                          {priorityCfg.label}
                        </span>
                        {task.folder && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFolder(task.folder!);
                              setViewMode('tasks');
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 transition-colors cursor-pointer"
                            title={`Nur Ordner "${task.folder}" anzeigen`}
                          >
                            <Folder size={11} />
                            <span>{task.folder}</span>
                          </button>
                        )}
                        {deadline && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border ${getDeadlineChipClasses(deadline.status, task.isCompleted)}`}>
                            {deadline.status === 'overdue' && !task.isCompleted ? <AlertCircle size={12} /> : <Calendar size={12} />}
                            {deadline.label}
                          </span>
                        )}
                        {isRecurring && task.recurrence && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-medium border bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30">
                            <Repeat size={12} />
                            <span>{RECURRENCE_OPTIONS.find((o) => o.value === task.recurrence)?.label || task.recurrence}</span>
                            {task.recurrence_end && (
                              <span className="opacity-80">
                                bis {format(parseDateSafe(task.recurrence_end) || new Date(), 'dd.MM.yy')}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                      {task.description && (
                        <p className={`text-xs mt-1.5 line-clamp-2 ${task.isCompleted ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-600 dark:text-gray-400'}`}>
                          {task.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button type="button" onClick={(e) => { e.stopPropagation(); startEditing(task); }} className="p-2 text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-colors cursor-pointer" title="Aufgabe bearbeiten" aria-label="Aufgabe bearbeiten"><Edit2 size={15} /></button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }} className="p-2 text-gray-400 hover:text-rose-600 dark:text-gray-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors cursor-pointer" title="Aufgabe löschen" aria-label="Aufgabe löschen"><Trash2 size={15} /></button>
                  </div>
                </div>
              );
            })}

            {sortedTasks.length === 0 && (
              <div className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-2xl p-12 text-center flex flex-col items-center justify-center shadow-2xs">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center mb-3">
                  {filterStatus === 'completed' ? <CheckCircle2 size={24} /> : <ListTodo size={24} />}
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">
                  {filterStatus === 'completed' ? 'Keine erledigten Aufgaben' : filterStatus === 'active' ? 'Alles erledigt!' : searchQuery ? 'Keine Aufgaben gefunden' : selectedFolder !== null ? `Keine Aufgaben in "${selectedFolder || 'Ohne Ordner'}"` : 'Noch keine Aufgaben'}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mb-4">
                  {searchQuery
                    ? `Für "${searchQuery}" wurden keine passenden Aufgaben gefunden.`
                    : selectedFolder !== null
                    ? `In diesem Ordner befinden sich aktuell keine passenden Aufgaben.`
                    : tasks.length === 0
                    ? 'Erstelle oben deine erste Aufgabe, um Termine, Prioritäten und Wiederholungen zu planen.'
                    : 'Keine Aufgaben für die aktuellen Filterkriterien vorhanden.'}
                </p>
                {selectedFolder !== null ? (
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
        </div>
      )}
    </div>
  );
};

export default TodoList;
