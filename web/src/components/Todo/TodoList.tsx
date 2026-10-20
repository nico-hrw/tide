'use client';

import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  Circle,
  Calendar,
  AlertCircle,
  Trash2,
  Plus,
  ArrowUpDown,
  Edit2,
  Check,
  X,
  ListTodo,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { format, isToday, isTomorrow, isBefore, startOfDay, parseISO } from 'date-fns';
import { useDataStore, TaskItem } from '@/store/useDataStore';
import { DT } from '@/lib/designTokens';

export type Priority = 'low' | 'medium' | 'high';
export type FilterStatus = 'all' | 'active' | 'completed';
export type SortOption = 'created' | 'deadline' | 'priority';

interface TodoListProps {
  className?: string;
  onSelectTask?: (task: TaskItem) => void;
}

const PRIORITY_CONFIG: Record<
  Priority,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  high: {
    label: 'High',
    bg: 'bg-rose-500/10 dark:bg-rose-500/20',
    text: 'text-rose-600 dark:text-rose-400',
    border: 'border-rose-500/30',
    dot: 'bg-rose-500',
  },
  medium: {
    label: 'Medium',
    bg: 'bg-amber-500/10 dark:bg-amber-500/20',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-500/30',
    dot: 'bg-amber-500',
  },
  low: {
    label: 'Low',
    bg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-500/30',
    dot: 'bg-emerald-500',
  },
};

const PRIORITY_WEIGHT: Record<Priority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function getTaskPriority(task: TaskItem): Priority {
  if (task.color === 'high' || task.color === 'rose' || task.color === 'red') return 'high';
  if (task.color === 'low' || task.color === 'emerald' || task.color === 'green') return 'low';
  return 'medium';
}

type DeadlineStatus = 'overdue' | 'today' | 'tomorrow' | 'upcoming';

interface DeadlineInfo {
  status: DeadlineStatus;
  label: string;
}

function parseDateSafe(dateStr?: string): Date | null {
  if (!dateStr) return null;
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const parts = dateStr.split('-');
      const y = Number(parts[0]);
      const m = Number(parts[1]);
      const d = Number(parts[2]);
      return new Date(y, m - 1, d);
    }
    const parsed = parseISO(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

function getDeadlineInfo(dateStr?: string): DeadlineInfo | null {
  const d = parseDateSafe(dateStr);
  if (!d) return null;

  const today = startOfDay(new Date());
  const itemDate = startOfDay(d);

  if (isBefore(itemDate, today)) {
    return { status: 'overdue', label: `Overdue (${format(d, 'MMM d')})` };
  }
  if (isToday(d)) {
    return { status: 'today', label: 'Due today' };
  }
  if (isTomorrow(d)) {
    return { status: 'tomorrow', label: 'Due tomorrow' };
  }
  return { status: 'upcoming', label: format(d, 'MMM d, yyyy') };
}

function getDeadlineChipClasses(status: DeadlineStatus, isCompleted: boolean): string {
  if (isCompleted) {
    return 'bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-zinc-500 border-gray-200 dark:border-zinc-700';
  }
  switch (status) {
    case 'overdue':
      return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30';
    case 'today':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
    case 'tomorrow':
    case 'upcoming':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30';
  }
}

export const TodoList: React.FC<TodoListProps> = ({ className = '', onSelectTask }) => {
  const theme = useDataStore((state) => state.theme);
  const tasks = useDataStore((state) => state.tasks);
  const addTask = useDataStore((state) => state.addTask);
  const updateTask = useDataStore((state) => state.updateTask);
  const toggleTask = useDataStore((state) => state.toggleTask);
  const deleteTask = useDataStore((state) => state.deleteTask);

  const isDark = theme === 'dark';

  // Quick Add State
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('medium');
  const [newDueDate, setNewDueDate] = useState('');
  const [showDescription, setShowDescription] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter & Sort State
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('deadline');

  // Edit State
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState<Priority>('medium');
  const [editDueDate, setEditDueDate] = useState('');

  const completedCount = useMemo(() => tasks.filter((t) => t.isCompleted).length, [tasks]);
  const progressPercent = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await addTask({
        title: trimmedTitle,
        description: newDescription.trim() || undefined,
        color: newPriority,
        scheduledDate: newDueDate || undefined,
        isCompleted: false,
      });
      setNewTitle('');
      setNewDescription('');
      setNewDueDate('');
      setShowDescription(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditing = (task: TaskItem) => {
    setEditingTaskId(task.id);
    setEditTitle(task.title);
    setEditDescription(task.description || '');
    setEditPriority(getTaskPriority(task));
    setEditDueDate(task.scheduledDate || '');
  };

  const cancelEditing = () => {
    setEditingTaskId(null);
  };

  const saveEditing = (id: string) => {
    if (!editTitle.trim()) return;
    updateTask(id, {
      title: editTitle.trim(),
      description: editDescription.trim() || undefined,
      color: editPriority,
      scheduledDate: editDueDate || undefined,
    });
    setEditingTaskId(null);
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // Status filter
      if (filterStatus === 'active' && task.isCompleted) return false;
      if (filterStatus === 'completed' && !task.isCompleted) return false;

      // Priority filter
      if (filterPriority !== 'all' && getTaskPriority(task) !== filterPriority) {
        return false;
      }

      return true;
    });
  }, [tasks, filterStatus, filterPriority]);

  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      // Sunk completed items
      if (a.isCompleted !== b.isCompleted) {
        return a.isCompleted ? 1 : -1;
      }

      if (sortBy === 'priority') {
        const pA = PRIORITY_WEIGHT[getTaskPriority(a)];
        const pB = PRIORITY_WEIGHT[getTaskPriority(b)];
        if (pA !== pB) return pB - pA;
      }

      if (sortBy === 'deadline') {
        const dateA = parseDateSafe(a.scheduledDate);
        const dateB = parseDateSafe(b.scheduledDate);
        if (dateA && dateB) return dateA.getTime() - dateB.getTime();
        if (dateA && !dateB) return -1;
        if (!dateA && dateB) return 1;
      }

      return 0;
    });
  }, [filteredTasks, sortBy]);

  return (
    <div
      className={`flex flex-col w-full border border-gray-200 dark:border-zinc-800 p-4 sm:p-6 transition-colors shadow-sm ${className}`}
      style={{
        borderRadius: DT.radius,
        backgroundColor: DT.cardBg(isDark),
      }}
    >
      {/* Header & Progress */}
      <div className="flex flex-col gap-2 pb-4 border-b border-gray-100 dark:border-zinc-800/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTodo className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-bold tracking-tight" style={{ color: DT.primaryText(isDark) }}>
              Tasks
            </h2>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400"
            >
              {tasks.length}
            </span>
          </div>
          <span className="text-xs font-medium" style={{ color: DT.mutedText(isDark) }}>
            {completedCount} of {tasks.length} completed
          </span>
        </div>

        {tasks.length > 0 && (
          <div className="w-full bg-gray-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-blue-500 h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>

      {/* Quick Add Bar */}
      <form onSubmit={handleQuickAdd} className="mt-4 flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add a new task..."
            className="flex-1 px-3.5 py-2 text-sm bg-gray-50 dark:bg-zinc-850 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700/80 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors"
            style={{ color: DT.primaryText(isDark) }}
          />

          {/* Priority Selector */}
          <select
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value as Priority)}
            className="px-2.5 py-2 text-xs font-medium bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700/80 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors cursor-pointer"
            style={{ color: DT.primaryText(isDark) }}
            aria-label="Task Priority"
          >
            <option value="low">🟢 Low</option>
            <option value="medium">🟡 Medium</option>
            <option value="high">🔴 High</option>
          </select>

          {/* Date Picker */}
          <input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            className="px-2.5 py-2 text-xs bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700/80 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors cursor-pointer"
            style={{ color: DT.primaryText(isDark) }}
            aria-label="Due Date"
          />

          <button
            type="submit"
            disabled={!newTitle.trim() || isSubmitting}
            className="flex items-center gap-1 px-3.5 py-2 text-sm font-medium text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 active:scale-95 shadow-sm"
            style={{ backgroundColor: DT.accent }}
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Add</span>
          </button>
        </div>

        {/* Optional Expandable Description */}
        <div className="flex items-center justify-between text-xs px-1">
          <button
            type="button"
            onClick={() => setShowDescription(!showDescription)}
            className="flex items-center gap-1 hover:underline transition-colors"
            style={{ color: DT.mutedText(isDark) }}
          >
            {showDescription ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            <span>{showDescription ? 'Hide note' : '+ Add note / description'}</span>
          </button>
        </div>

        {showDescription && (
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Additional details or notes..."
            rows={2}
            className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700/80 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors resize-none"
            style={{ color: DT.primaryText(isDark) }}
          />
        )}
      </form>

      {/* Filter and Sort Toolbar */}
      <div className="mt-4 pt-3 flex flex-wrap items-center justify-between gap-2.5 border-t border-gray-100 dark:border-zinc-800/80">
        {/* Status Filters */}
        <div className="flex items-center gap-1 text-xs">
          {(['all', 'active', 'completed'] as FilterStatus[]).map((status) => {
            const isActive = filterStatus === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setFilterStatus(status)}
                className={`px-2.5 py-1 rounded-md capitalize font-medium transition-colors ${DT.chip(
                  isActive,
                  isDark
                )}`}
              >
                {status}
              </button>
            );
          })}
        </div>

        {/* Priority & Sorting */}
        <div className="flex items-center gap-2">
          {/* Priority filter */}
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as Priority | 'all')}
            className="px-2 py-1 text-xs rounded-md bg-gray-100 dark:bg-zinc-800/70 border-0 focus:outline-none cursor-pointer"
            style={{ color: DT.primaryText(isDark) }}
            aria-label="Filter by priority"
          >
            <option value="all">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>

          {/* Sort selector */}
          <div className="flex items-center gap-1 text-xs" style={{ color: DT.mutedText(isDark) }}>
            <ArrowUpDown size={13} />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-2 py-1 text-xs rounded-md bg-gray-100 dark:bg-zinc-800/70 border-0 focus:outline-none cursor-pointer"
              style={{ color: DT.primaryText(isDark) }}
              aria-label="Sort tasks"
            >
              <option value="deadline">Due Date</option>
              <option value="priority">Priority</option>
              <option value="created">Created</option>
            </select>
          </div>
        </div>
      </div>

      {/* Task List */}
      <div className="mt-4 flex flex-col gap-2">
        {sortedTasks.map((task) => {
          const isEditing = editingTaskId === task.id;
          const priority = getTaskPriority(task);
          const priorityCfg = PRIORITY_CONFIG[priority];
          const deadline = getDeadlineInfo(task.scheduledDate);

          if (isEditing) {
            return (
              <div
                key={task.id}
                className="flex flex-col gap-2.5 p-3 rounded-lg border border-blue-400 dark:border-blue-500/40 bg-blue-50/20 dark:bg-blue-950/20"
              >
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="px-2.5 py-1.5 text-sm font-medium bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  style={{ color: DT.primaryText(isDark) }}
                  placeholder="Task title"
                />

                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Task description (optional)"
                  rows={2}
                  className="px-2.5 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
                  style={{ color: DT.primaryText(isDark) }}
                />

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-2">
                    <select
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value as Priority)}
                      className="px-2 py-1 text-xs rounded-md bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 focus:outline-none"
                      style={{ color: DT.primaryText(isDark) }}
                    >
                      <option value="low">🟢 Low</option>
                      <option value="medium">🟡 Medium</option>
                      <option value="high">🔴 High</option>
                    </select>

                    <input
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      className="px-2 py-1 text-xs rounded-md bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 focus:outline-none"
                      style={{ color: DT.primaryText(isDark) }}
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={cancelEditing}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md font-medium text-gray-600 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <X size={13} />
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => saveEditing(task.id)}
                      disabled={!editTitle.trim()}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md font-medium text-white transition-opacity disabled:opacity-50"
                      style={{ backgroundColor: DT.accent }}
                    >
                      <Check size={13} />
                      Save
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div
              key={task.id}
              onClick={() => onSelectTask?.(task)}
              className={`group flex items-start justify-between gap-3 p-3 rounded-lg border transition-all duration-150 ${
                task.isCompleted
                  ? 'border-gray-100 dark:border-zinc-800/60 bg-gray-50/50 dark:bg-zinc-900/30 opacity-75'
                  : 'border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700 hover:shadow-xs'
              }`}
            >
              {/* Checkbox & Details */}
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTask(task.id);
                  }}
                  className="mt-0.5 text-gray-400 hover:text-blue-500 dark:text-zinc-500 dark:hover:text-blue-400 transition-colors shrink-0"
                  aria-label={task.isCompleted ? 'Mark task incomplete' : 'Mark task complete'}
                >
                  {task.isCompleted ? (
                    <CheckCircle2 className="w-5 h-5 text-blue-500 fill-blue-500/20" />
                  ) : (
                    <Circle className="w-5 h-5 hover:text-blue-500 transition-colors" />
                  )}
                </button>

                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-sm font-medium break-words ${
                        task.isCompleted ? 'line-through text-gray-400 dark:text-zinc-500' : ''
                      }`}
                      style={{
                        color: task.isCompleted ? undefined : DT.primaryText(isDark),
                      }}
                    >
                      {task.title}
                    </span>

                    {/* Priority badge */}
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${priorityCfg.bg} ${priorityCfg.text} ${priorityCfg.border}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${priorityCfg.dot}`} />
                      {priorityCfg.label}
                    </span>

                    {/* Deadline Chip */}
                    {deadline && (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${getDeadlineChipClasses(
                          deadline.status,
                          task.isCompleted
                        )}`}
                      >
                        {deadline.status === 'overdue' && !task.isCompleted ? (
                          <AlertCircle size={11} />
                        ) : (
                          <Calendar size={11} />
                        )}
                        {deadline.label}
                      </span>
                    )}
                  </div>

                  {task.description && (
                    <p
                      className={`text-xs mt-1 line-clamp-2 ${
                        task.isCompleted ? 'text-gray-400 dark:text-zinc-500 line-through' : ''
                      }`}
                      style={{
                        color: task.isCompleted ? undefined : DT.mutedText(isDark),
                      }}
                    >
                      {task.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    startEditing(task);
                  }}
                  className="p-1.5 text-gray-400 hover:text-gray-700 dark:text-zinc-500 dark:hover:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
                  title="Edit task"
                  aria-label="Edit task"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteTask(task.id);
                  }}
                  className="p-1.5 text-gray-400 hover:text-rose-600 dark:text-zinc-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-md transition-colors"
                  title="Delete task"
                  aria-label="Delete task"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}

        {/* Empty State */}
        {sortedTasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center mb-2.5">
              {filterStatus === 'completed' ? <CheckCircle2 size={20} /> : <ListTodo size={20} />}
            </div>
            <h3 className="text-sm font-semibold mb-1" style={{ color: DT.primaryText(isDark) }}>
              {filterStatus === 'completed'
                ? 'No completed tasks yet'
                : filterStatus === 'active'
                ? 'All caught up!'
                : 'No tasks found'}
            </h3>
            <p className="text-xs max-w-xs" style={{ color: DT.mutedText(isDark) }}>
              {tasks.length === 0
                ? 'Add your first task above to start tracking your deadlines and priorities.'
                : 'No tasks match the active filters. Try changing or resetting filters.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TodoList;
