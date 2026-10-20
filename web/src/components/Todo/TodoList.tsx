'use client';

import React, { useState, useMemo } from 'react';
import {
  CheckCircle2, Circle, Calendar, Repeat, Trash2, Edit2, Plus,
  Search, SlidersHorizontal, AlertCircle, Check, X, ListTodo,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  format, isToday, isTomorrow, isBefore, startOfDay, endOfDay,
  parseISO, addDays, addWeeks, addMonths, addYears,
} from 'date-fns';
import { useDataStore, TaskItem } from '@/store/useDataStore';

export type Priority = 'low' | 'medium' | 'high';
export type FilterStatus = 'all' | 'active' | 'completed';
export type SortOption = 'created' | 'deadline' | 'priority';
export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

interface TodoListProps {
  className?: string;
  onSelectTask?: (task: TaskItem) => void;
}

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
  if (task.color === 'high' || task.color === 'rose' || task.color === 'red') return 'high';
  if (task.color === 'low' || task.color === 'emerald' || task.color === 'green') return 'low';
  return 'medium';
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
  const itemDate = startOfDay(d);
  if (isBefore(itemDate, today)) return { status: 'overdue', label: `Überfällig (${format(d, 'dd.MM.')})` };
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

  const [draft, setDraft] = useState({
    title: '', description: '', priority: 'medium' as Priority,
    dueDate: '', recurrence: 'none' as RecurrenceType, recurrenceEnd: '',
  });
  const [showOptions, setShowOptions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('deadline');

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    title: '', description: '', priority: 'medium' as Priority,
    dueDate: '', recurrence: 'none' as RecurrenceType, recurrenceEnd: '',
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
      const nextDate = task.recurrence === 'daily' ? addDays(baseDate, 1)
        : task.recurrence === 'weekly' ? addWeeks(baseDate, 1)
        : task.recurrence === 'monthly' ? addMonths(baseDate, 1) : addYears(baseDate, 1);
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
      await addTask({
        title: draft.title.trim(), description: draft.description.trim() || undefined,
        priority: draft.priority, color: draft.priority,
        scheduledDate: draft.dueDate || undefined, dueDate: draft.dueDate || undefined,
        recurrence: draft.recurrence, recurrence_rule: buildRecurrenceRule(draft.recurrence),
        recurrence_end: draft.recurrence !== 'none' && draft.recurrenceEnd ? draft.recurrenceEnd : undefined,
        isCompleted: false,
      });
      setDraft({ title: '', description: '', priority: 'medium', dueDate: '', recurrence: 'none', recurrenceEnd: '' });
      setShowOptions(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditing = (task: TaskItem) => {
    setEditingTaskId(task.id);
    setEditDraft({
      title: task.title, description: task.description || '', priority: getTaskPriority(task),
      dueDate: task.dueDate || task.scheduledDate || '', recurrence: task.recurrence || 'none', recurrenceEnd: task.recurrence_end || '',
    });
  };

  const saveEditing = (id: string) => {
    if (!editDraft.title.trim()) return;
    updateTask(id, {
      title: editDraft.title.trim(), description: editDraft.description.trim() || undefined,
      priority: editDraft.priority, color: editDraft.priority,
      scheduledDate: editDraft.dueDate || undefined, dueDate: editDraft.dueDate || undefined,
      recurrence: editDraft.recurrence, recurrence_rule: buildRecurrenceRule(editDraft.recurrence),
      recurrence_end: editDraft.recurrence !== 'none' && editDraft.recurrenceEnd ? editDraft.recurrenceEnd : undefined,
    });
    setEditingTaskId(null);
  };

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tasks.filter((t) => {
      if (filterStatus === 'active' && t.isCompleted) return false;
      if (filterStatus === 'completed' && !t.isCompleted) return false;
      if (filterPriority !== 'all' && getTaskPriority(t) !== filterPriority) return false;
      if (q && !t.title.toLowerCase().includes(q) && !(t.description || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, filterStatus, filterPriority, searchQuery]);

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

  const statItems = [
    { label: 'Gesamt', val: totalCount, color: 'text-gray-900 dark:text-white' },
    { label: 'Offen', val: activeCount, color: 'text-blue-600 dark:text-blue-400' },
    { label: 'Erledigt', val: completedCount, color: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Überfällig', val: overdueCount, color: 'text-rose-600 dark:text-rose-400' },
  ];

  return (
    <div className={`flex-1 h-full flex flex-col bg-[#f8f9fa] dark:bg-[#121212] overflow-y-auto relative select-none ${className}`}>
      {/* Header */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-6 md:px-10 py-5 border-b border-gray-200 dark:border-white/10 bg-white/90 dark:bg-[#121212]/90 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400"><ListTodo size={22} /></div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">Todos & Aufgaben</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Aufgaben verwalten, Termine setzen und Wiederholungen planen</p>
          </div>
          <span className="ml-2 hidden sm:inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">{totalCount} gesamt</span>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-xs font-medium text-gray-700 dark:text-gray-300">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span>{completedCount} von {totalCount} erledigt ({progressPercent}%)</span>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-4xl md:max-w-5xl w-full mx-auto px-4 md:px-8 py-8 flex flex-col gap-6">
        {/* Progress Overview Card */}
        <div className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-2xl p-6 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} className="text-blue-500" />
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Fortschrittsübersicht</h2>
            </div>
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{progressPercent}% abgeschlossen</span>
          </div>
          <div className="w-full bg-gray-100 dark:bg-white/5 h-2.5 rounded-full overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            {statItems.map((s) => (
              <div key={s.label} className="p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5">
                <span className="text-xs text-gray-500 dark:text-gray-400">{s.label}</span>
                <p className={`text-lg font-bold mt-0.5 ${s.color}`}>{s.val}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Task Creation Form Card */}
        <div className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-2xl p-6 shadow-2xs">
          <form onSubmit={handleAddTask} className="flex flex-col gap-3.5">
            <div className="flex items-center gap-2">
              <Plus size={16} className="text-blue-500" />
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Neue Aufgabe erstellen</h3>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <input
                type="text" value={draft.title} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
                placeholder="Was möchtest du erledigen?..."
                className="flex-1 px-4 py-2.5 text-sm bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
              <div className="flex items-center gap-2">
                <select
                  value={draft.priority} onChange={(e) => setDraft((p) => ({ ...p, priority: e.target.value as Priority }))}
                  className="px-3 py-2.5 text-xs font-medium bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer"
                  aria-label="Priorität"
                >
                  {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input
                  type="date" value={draft.dueDate} onChange={(e) => setDraft((p) => ({ ...p, dueDate: e.target.value }))}
                  className="px-3 py-2.5 text-xs font-medium bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer"
                  aria-label="Fälligkeitsdatum"
                />
                <button
                  type="submit" disabled={!draft.title.trim() || isSubmitting}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-xs shrink-0 cursor-pointer"
                >
                  <Plus size={16} /><span>Hinzufügen</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <button
                type="button" onClick={() => setShowOptions(!showOptions)}
                className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors cursor-pointer"
              >
                {showOptions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                <span>{showOptions ? 'Optionen ausblenden' : '+ Details & Wiederholung planen'}</span>
              </button>
            </div>

            {showOptions && (
              <div className="flex flex-col gap-3 pt-2 border-t border-gray-100 dark:border-white/5">
                <textarea
                  value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Optionale Notiz oder Beschreibung..." rows={2}
                  className="w-full px-4 py-2 text-xs bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Repeat size={14} className="text-purple-500" />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Wiederholung:</span>
                    <select
                      value={draft.recurrence} onChange={(e) => setDraft((p) => ({ ...p, recurrence: e.target.value as RecurrenceType }))}
                      className="px-3 py-1.5 text-xs bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none cursor-pointer"
                    >
                      {RECURRENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  {draft.recurrence !== 'none' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Wiederholen bis:</span>
                      <input
                        type="date" value={draft.recurrenceEnd} onChange={(e) => setDraft((p) => ({ ...p, recurrenceEnd: e.target.value }))}
                        className="px-3 py-1.5 text-xs bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none cursor-pointer"
                        aria-label="Wiederholen bis"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </form>
        </div>

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
                {filterStatus === 'completed' ? 'Keine erledigten Aufgaben' : filterStatus === 'active' ? 'Alles erledigt!' : searchQuery ? 'Keine Aufgaben gefunden' : 'Noch keine Aufgaben'}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">
                {searchQuery ? `Für "${searchQuery}" wurden keine passenden Aufgaben gefunden.` : tasks.length === 0 ? 'Erstelle oben deine erste Aufgabe, um Termine, Prioritäten und Wiederholungen zu planen.' : 'Keine Aufgaben für die aktuellen Filterkriterien vorhanden.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TodoList;
