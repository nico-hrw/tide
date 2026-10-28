'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, X, ListTodo, Folder, Inbox, ArrowLeft, Tag, FolderPlus,
  ChevronRight, Archive, CheckCircle2, Circle, Calendar, Repeat, Trash2, Check, Timer, RotateCcw, Clock, History, Search, SlidersHorizontal, AlertCircle,
} from 'lucide-react';
import {
  format, isBefore, startOfDay, endOfDay, addDays, addWeeks, addMonths, addYears,
} from 'date-fns';
import { useDataStore, TaskItem } from '@/store/useDataStore';
import TodoFolderOverview, { FolderStat } from './TodoFolderOverview';
import TodoFilterBar from './TodoFilterBar';
import TodoTreeItem from './TodoTreeItem';
import TodoListHeader from './TodoListHeader';
import TodoFolderBanner from './TodoFolderBanner';
import TodoListSections from './TodoListSections';
import TodoFolderModal from './TodoFolderModal';
import TodoCreateCard, { TaskCreateDraft } from './TodoCreateCard';
import TodoFocusedGroupView from './TodoFocusedGroupView';
import { buildTaskTree } from './treeUtils';
import { loadTodoFoldersMeta, saveTodoFoldersMeta } from '../../lib/folderColors';
import {
  Priority, FilterStatus, SortOption, RecurrenceType, ArchiveTier, TodoListProps, TaskEditDraft, TaskWithChildren,
  PRIORITY_WEIGHT, ARCHIVE_TIER_CONFIG,
  getTaskPriority, getPriorityColor, buildRecurrenceRule, parseDateSafe,
  isTaskArchived, getTaskArchiveTier,
} from './types';

export type { Priority, FilterStatus, SortOption, RecurrenceType, ArchiveTier } from './types';
export {
  PRIORITY_COLORS, SEVEN_DAYS_MS, THIRTY_DAYS_MS, ONE_YEAR_MS, ARCHIVE_TIER_CONFIG,
  getTaskCompletionTime, isTaskArchived, getTaskArchiveTier,
} from './types';

export const TodoList: React.FC<TodoListProps> = ({ className = '', onSelectTask }) => {
  const { tasks, addTask, updateTask, toggleTask, toggleTaskInProgress, deleteTask } = useDataStore();

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

  const handleCreateFolder = (name: string, color?: string, showInCalendar?: boolean) => {
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
    try {
      const meta = loadTodoFoldersMeta();
      meta[trimmed] = {
        id: trimmed,
        name: trimmed,
        color: color || 'blue',
        showInCalendar: showInCalendar !== false,
      };
      saveTodoFoldersMeta(meta);
    } catch {}
  };

  const handleDeleteFolder = (name: string) => {
    setCreatedFolders((prev) => {
      const next = prev.filter((f) => f !== name);
      try {
        localStorage.setItem('tide_todo_folders', JSON.stringify(next));
      } catch {}
      return next;
    });
    try {
      const meta = loadTodoFoldersMeta();
      delete meta[name];
      saveTodoFoldersMeta(meta);
    } catch {}
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
      const inProgress = folderTasks.filter((t) => !t.isCompleted && t.status === 'in_progress').length;
      return { name, total, completed, active: total - completed - inProgress, inProgress };
    });
  }, [allFolders, tasks]);

  const unfiledCount = useMemo(() => {
    const unfiledTasks = tasks.filter((t) => !t.folder);
    const total = unfiledTasks.length;
    const completed = unfiledTasks.filter((t) => t.isCompleted).length;
    const inProgress = unfiledTasks.filter((t) => !t.isCompleted && t.status === 'in_progress').length;
    return { total, completed, active: total - completed - inProgress, inProgress };
  }, [tasks]);

  const selectedFolderActiveCount = useMemo(() => {
    if (selectedFolder === null) return 0;
    return tasks.filter((t) => (selectedFolder === '' ? !t.folder : t.folder === selectedFolder) && !t.isCompleted).length;
  }, [tasks, selectedFolder]);

  const [customTags, setCustomTags] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('tide_todo_custom_tags');
        return saved ? JSON.parse(saved) : ['Vorbereiten', 'Lernen'];
      } catch {
        return ['Vorbereiten', 'Lernen'];
      }
    }
    return ['Vorbereiten', 'Lernen'];
  });

  const handleAddCustomTag = (tagName: string) => {
    const trimmed = tagName.trim().replace(/^#/, '');
    if (!trimmed) return;
    setCustomTags((prev) => {
      if (prev.includes(trimmed)) return prev;
      const next = [...prev, trimmed];
      try {
        localStorage.setItem('tide_todo_custom_tags', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleRemoveCustomTag = (tagName: string) => {
    setCustomTags((prev) => {
      const next = prev.filter((t) => t !== tagName);
      try {
        localStorage.setItem('tide_todo_custom_tags', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const allTags = useMemo(() => {
    return Array.from(new Set([...customTags, ...tasks.flatMap((t) => t.tags || [])])).sort();
  }, [customTags, tasks]);

  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [newTagInput, setNewTagInput] = useState('');
  const [editNewTagInput, setEditNewTagInput] = useState('');

  const [draft, setDraft] = useState<TaskCreateDraft>({
    title: '', description: '', priority: 'medium' as Priority,
    dueDate: '', recurrence: 'none' as RecurrenceType, recurrenceEnd: '',
    folder: '', tags: [] as string[],
    showInCalendar: true,
  });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleNewTodoEvent = () => {
      setViewMode('tasks');
      setIsCreateOpen(true);
      setTimeout(() => {
        titleInputRef.current?.focus();
      }, 50);
    };

    window.addEventListener('tide:new-todo', handleNewTodoEvent);
    return () => {
      window.removeEventListener('tide:new-todo', handleNewTodoEvent);
    };
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('deadline');
  const [showFilters, setShowFilters] = useState(true);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderNameInput, setNewFolderNameInput] = useState('');

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TaskEditDraft>({
    title: '', description: '', priority: 'medium' as Priority,
    status: 'todo',
    dueDate: '', recurrence: 'none' as RecurrenceType, recurrenceEnd: '',
    folder: '', tags: [] as string[],
    showInCalendar: true,
  });

  const [showCompleted, setShowCompleted] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [openTiers, setOpenTiers] = useState<Record<ArchiveTier, boolean>>({
    week: true,
    month: true,
    year: true,
  });
  const [completingTaskIds, setCompletingTaskIds] = useState<Set<string>>(new Set());
  const [focusedGroupId, setFocusedGroupId] = useState<string | null>(null);

  // Hierarchical task tree: roots are tasks without valid parentId
  const taskTree = useMemo(() => {
    return buildTaskTree(tasks);
  }, [tasks]);

  // Focused group task details
  const focusedTask = useMemo(() => {
    if (!focusedGroupId) return null;
    const parent = tasks.find((t) => t.id === focusedGroupId);
    if (!parent) return null;
    const children = tasks.filter((t) => t.parentId === focusedGroupId);
    return { ...parent, children } as TaskWithChildren;
  }, [tasks, focusedGroupId]);

  useEffect(() => {
    if (focusedGroupId && !tasks.some((t) => t.id === focusedGroupId)) {
      setFocusedGroupId(null);
    }
  }, [focusedGroupId, tasks]);

  // Active cycle calculations:
  // Open tasks (!t.isCompleted && !t.isArchived) + Recently completed tasks (completed in last 7 days, !t.isArchived)
  const activeCycleTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.isArchived) return false;
      if (!t.isCompleted) return true;
      return !isTaskArchived(t);
    });
  }, [tasks]);

  const activeCycleTotal = activeCycleTasks.length;
  const activeCycleCompletedCount = useMemo(() => activeCycleTasks.filter((t) => t.isCompleted).length, [activeCycleTasks]);
  const activeCycleInProgressCount = useMemo(() => activeCycleTasks.filter((t) => !t.isCompleted && t.status === 'in_progress').length, [activeCycleTasks]);
  const activeCycleOpenCount = useMemo(() => activeCycleTasks.filter((t) => !t.isCompleted && t.status !== 'in_progress').length, [activeCycleTasks]);
  const activeCycleOverdueCount = useMemo(() => {
    const today = startOfDay(new Date());
    return activeCycleTasks.filter((t) => !t.isCompleted && parseDateSafe(t.dueDate || t.scheduledDate) && isBefore(startOfDay(parseDateSafe(t.dueDate || t.scheduledDate)!), today)).length;
  }, [activeCycleTasks]);
  const activeCycleOpenNonOverdueCount = Math.max(0, activeCycleOpenCount - activeCycleOverdueCount);

  const archivedCount = useMemo(() => tasks.filter((t) => isTaskArchived(t)).length, [tasks]);
  const totalCount = tasks.length;

  const executeToggleTask = (task: TaskItem) => {
    if (task.isCompleted) {
      updateTask(task.id, {
        isCompleted: false,
        status: 'todo',
        completedAt: undefined,
        isArchived: false,
      });
      return;
    }
    if (!task.isCompleted && task.recurrence && task.recurrence !== 'none') {
      const currentRef = task.dueDate || task.scheduledDate;
      const baseDate = parseDateSafe(currentRef) || new Date();
      const nextDate = task.recurrence === 'daily' ? addDays(baseDate, 1) : task.recurrence === 'weekly' ? addWeeks(baseDate, 1) : task.recurrence === 'monthly' ? addMonths(baseDate, 1) : addYears(baseDate, 1);
      const end = parseDateSafe(task.recurrence_end);
      if (end && nextDate > endOfDay(end)) {
        updateTask(task.id, { isCompleted: true, completedAt: new Date().toISOString(), completed_dates: [...(task.completed_dates || []), new Date().toISOString()] });
      } else {
        const nextDateStr = currentRef && currentRef.includes('T') ? format(nextDate, "yyyy-MM-dd'T'HH:mm:ss") : format(nextDate, 'yyyy-MM-dd');
        updateTask(task.id, { dueDate: nextDateStr, scheduledDate: nextDateStr, isCompleted: false, completed_dates: [...(task.completed_dates || []), new Date().toISOString()] });
      }
    } else {
      toggleTask(task.id);
    }
  };

  const handleToggleTask = (task: TaskItem) => {
    if (task.isCompleted) {
      executeToggleTask(task);
    } else {
      if (completingTaskIds.has(task.id)) return;
      setCompletingTaskIds((prev) => new Set(prev).add(task.id));
      setTimeout(() => {
        executeToggleTask(task);
        setCompletingTaskIds((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
      }, 300);
    }
  };

  const handleToggleInProgress = (task: TaskItem) => {
    if (task.isCompleted) {
      updateTask(task.id, { isCompleted: false, status: 'in_progress' });
    } else {
      toggleTaskInProgress(task.id);
    }
    if (editingTaskId === task.id) {
      setEditDraft((p) => ({
        ...p,
        status: (task.isCompleted || task.status !== 'in_progress') ? 'in_progress' : 'todo',
      }));
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
        tags: draft.tags.length > 0 ? draft.tags : undefined,
        showInCalendar: draft.showInCalendar,
        isCompleted: false,
      });
      if (folderVal && !createdFolders.includes(folderVal)) {
        handleCreateFolder(folderVal);
      }
      setDraft({ title: '', description: '', priority: 'medium', dueDate: '', recurrence: 'none', recurrenceEnd: '', folder: selectedFolder || '', tags: [], showInCalendar: true });
      setNewTagInput('');
      setIsCreateOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditing = (task: TaskItem) => {
    setEditingTaskId(task.id);
    setEditDraft({
      title: task.title, description: task.description || '', priority: getTaskPriority(task),
      status: task.isCompleted ? 'completed' : (task.status || 'todo'),
      dueDate: task.dueDate || task.scheduledDate || '', recurrence: task.recurrence || 'none', recurrenceEnd: task.recurrence_end || '',
      folder: task.folder || '', tags: task.tags ? [...task.tags] : [],
      showInCalendar: task.showInCalendar !== false,
    });
    setEditNewTagInput('');
  };

  const saveEditing = (id: string) => {
    if (!editDraft.title.trim()) return;
    const folderVal = editDraft.folder.trim() || undefined;
    const isCompleted = editDraft.status === 'completed';
    updateTask(id, {
      title: editDraft.title.trim(), description: editDraft.description.trim() || undefined,
      priority: editDraft.priority,
      status: editDraft.status,
      isCompleted,
      color: getPriorityColor(editDraft.priority, (editDraft as { color?: string }).color),
      scheduledDate: editDraft.dueDate || undefined, dueDate: editDraft.dueDate || undefined,
      recurrence: editDraft.recurrence, recurrence_rule: buildRecurrenceRule(editDraft.recurrence),
      recurrence_end: editDraft.recurrence !== 'none' && editDraft.recurrenceEnd ? editDraft.recurrenceEnd : undefined,
      folder: folderVal,
      tags: editDraft.tags,
      showInCalendar: editDraft.showInCalendar,
    });
    if (folderVal && !createdFolders.includes(folderVal)) {
      handleCreateFolder(folderVal);
    }
    setEditingTaskId(null);
  };

  const handleRowClick = (task: TaskItem) => {
    if (editingTaskId === task.id) {
      saveEditing(task.id);
    } else {
      if (editingTaskId) saveEditing(editingTaskId);
      startEditing(task);
      onSelectTask?.(task);
    }
  };

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const matchesSearch = (t: TaskWithChildren): boolean => {
      if (t.title.toLowerCase().includes(q)) return true;
      if ((t.description || '').toLowerCase().includes(q)) return true;
      if (t.tags && t.tags.some((tag) => tag.toLowerCase().includes(q))) return true;
      if (t.children && t.children.some(matchesSearch)) return true;
      return false;
    };

    return taskTree.filter((t) => {
      if (selectedFolder !== null) {
        if (selectedFolder === '') {
          if (t.folder) return false;
        } else {
          if (t.folder !== selectedFolder) return false;
        }
      }
      if (selectedTag !== null) {
        if (!t.tags || !t.tags.includes(selectedTag)) return false;
      }
      const archived = isTaskArchived(t);
      if (filterStatus === 'active' && (t.isCompleted || t.status === 'in_progress' || archived)) return false;
      if (filterStatus === 'in_progress' && (t.isCompleted || t.status !== 'in_progress' || archived)) return false;
      if (filterStatus === 'completed' && (!t.isCompleted || archived)) return false;
      if (filterStatus === 'archived' && !archived) return false;
      if (filterPriority !== 'all' && getTaskPriority(t) !== filterPriority) return false;
      if (q && !matchesSearch(t)) return false;
      return true;
    });
  }, [taskTree, selectedFolder, selectedTag, filterStatus, filterPriority, searchQuery]);

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
    if (sortBy === 'tag') {
      const tagA = (a.tags && a.tags.length > 0) ? a.tags[0] : '(Kein Tag)';
      const tagB = (b.tags && b.tags.length > 0) ? b.tags[0] : '(Kein Tag)';
      const diff = tagA.localeCompare(tagB);
      if (diff !== 0) return diff;
    }
    if (sortBy === 'title') {
      const diff = a.title.localeCompare(b.title);
      if (diff !== 0) return diff;
    }
    return 0;
  }), [filteredTasks, sortBy]);

  const activeTasks = useMemo(() => sortedTasks.filter((t) => !t.isCompleted && !isTaskArchived(t)), [sortedTasks]);
  const recentlyCompletedTasks = useMemo(() => sortedTasks.filter((t) => t.isCompleted && !isTaskArchived(t)), [sortedTasks]);
  const archivedTasks = useMemo(() => sortedTasks.filter((t) => isTaskArchived(t)), [sortedTasks]);

  const tasksToRender = useMemo(() => {
    if (filterStatus === 'completed') return recentlyCompletedTasks;
    if (filterStatus === 'archived') return [];
    return activeTasks;
  }, [filterStatus, recentlyCompletedTasks, activeTasks]);

  const archivedByTier = useMemo(() => {
    const week: TaskItem[] = [];
    const month: TaskItem[] = [];
    const year: TaskItem[] = [];
    for (const t of archivedTasks) {
      const tier = getTaskArchiveTier(t);
      if (tier === 'year') year.push(t);
      else if (tier === 'month') month.push(t);
      else week.push(t);
    }
    return { week, month, year };
  }, [archivedTasks]);

  const renderTask = (task: TaskWithChildren) => (
    <TodoTreeItem disableClickDebounce
        task={task}
        isExpanded={editingTaskId === task.id}
        isCompleting={completingTaskIds.has(task.id)}
        completingTaskIds={completingTaskIds}
        editDraft={editDraft}
        setEditDraft={setEditDraft}
        editNewTagInput={editNewTagInput}
        setEditNewTagInput={setEditNewTagInput}
        allTags={allTags}
        customTags={customTags}
        allFolders={allFolders}
        selectedTag={selectedTag}
        setSelectedTag={setSelectedTag}
        selectedFolder={selectedFolder}
        setSelectedFolder={setSelectedFolder}
        setViewMode={setViewMode}
        handleAddCustomTag={handleAddCustomTag}
        handleRemoveCustomTag={handleRemoveCustomTag}
        handleToggleTask={handleToggleTask}
        handleToggleInProgress={handleToggleInProgress}
        saveEditing={saveEditing}
        cancelEditing={() => setEditingTaskId(null)}
        deleteTask={deleteTask}
        onRowClick={handleRowClick}
        onFocusGroup={(groupTask) => setFocusedGroupId(groupTask.id)}
      />
  );

  return (
    <div className={`w-full h-full flex flex-col bg-white dark:bg-[#0a0a0a] relative overflow-hidden ${className || ''}`}>
      <TodoListHeader
        viewMode={viewMode}
        setViewMode={setViewMode}
        selectedFolder={selectedFolder}
        activeCycleTotal={activeCycleTotal}
        activeCycleCompletedCount={activeCycleCompletedCount}
        activeCycleInProgressCount={activeCycleInProgressCount}
        activeCycleOverdueCount={activeCycleOverdueCount}
        activeCycleOpenNonOverdueCount={activeCycleOpenNonOverdueCount}
        archivedCount={archivedCount}
        tasks={tasks}
        allFolders={allFolders}
        setDraft={setDraft}
        setIsCreateOpen={setIsCreateOpen}
        setIsFolderModalOpen={setIsFolderModalOpen}
      />


      {viewMode === 'folders' ? (
        <div className="flex-1 overflow-y-auto min-h-0">
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
            onAssignTaskFolder={(taskId, folderName) => updateTask(taskId, { folder: folderName || undefined })}
          />
        </div>
      ) : (
        /* Center container */
        <div className="w-full max-w-2xl lg:max-w-3xl mx-auto flex-1 flex flex-col min-h-0 relative px-0 sm:px-2">
          {/* Scrollable list container */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-4 py-4 sm:py-6 flex flex-col gap-4 sm:gap-5 pb-28">
            <AnimatePresence mode="wait" initial={false}>
              {focusedTask ? (
                <motion.div
                  key={`focused-group-${focusedTask.id}`}
                  initial={{ opacity: 0, scale: 0.95, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 15 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="w-full"
                >
                  <TodoFocusedGroupView
                    groupTask={focusedTask}
                    allTasks={tasks}
                    onMinimize={() => setFocusedGroupId(null)}
                    onToggleTask={handleToggleTask}
                    onToggleInProgress={handleToggleInProgress}
                    onUpdateTask={updateTask}
                    onDeleteTask={deleteTask}
                    completingTaskIds={completingTaskIds}
                    onAddSubtask={async (title, parentId) => {
                      await addTask({
                        title,
                        parentId,
                        folder: focusedTask.folder,
                        tags: focusedTask.tags ? [...focusedTask.tags] : [],
                        priority: focusedTask.priority || 'medium',
                        isCompleted: false,
                        status: 'todo',
                        order: focusedTask.children?.length || 0,
                      });
                    }}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="standard-list-view"
                  initial={{ opacity: 0, x: -300, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -300, scale: 0.95, transition: { duration: 0.3 } }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-col gap-4 sm:gap-5"
                >
                  <TodoFolderBanner
                    setViewMode={setViewMode}
                    selectedFolder={selectedFolder}
                    setSelectedFolder={setSelectedFolder}
                    selectedFolderActiveCount={selectedFolderActiveCount}
                  />

                  {/* Task Creation Form Card (Collapsed by default) */}
                  {isCreateOpen && (
                    <TodoCreateCard
                      draft={draft} setDraft={setDraft} titleInputRef={titleInputRef}
                      newTagInput={newTagInput} setNewTagInput={setNewTagInput}
                      allTags={allTags} customTags={customTags} allFolders={allFolders}
                      isSubmitting={isSubmitting} handleAddTask={handleAddTask}
                      handleAddCustomTag={handleAddCustomTag} handleRemoveCustomTag={handleRemoveCustomTag}
                      onClose={() => setIsCreateOpen(false)}
                    />
                  )}

                  {/* Filter & Sort Card */}
                  {showFilters && (
                    <TodoFilterBar
                      searchQuery={searchQuery} setSearchQuery={setSearchQuery}
                      filterStatus={filterStatus} setFilterStatus={setFilterStatus}
                      totalCount={totalCount} activeCycleOpenCount={activeCycleOpenCount}
                      activeCycleInProgressCount={activeCycleInProgressCount}
                      activeCycleCompletedCount={activeCycleCompletedCount} archivedCount={archivedCount}
                      allFolders={allFolders} unfiledCount={unfiledCount}
                      selectedFolder={selectedFolder} setSelectedFolder={setSelectedFolder}
                      allTags={allTags} selectedTag={selectedTag} setSelectedTag={setSelectedTag}
                      tasks={tasks} filterPriority={filterPriority} setFilterPriority={setFilterPriority}
                      sortBy={sortBy} setSortBy={setSortBy}
                    />
                  )}

                  <TodoListSections
                    selectedFolder={selectedFolder}
                    setSelectedFolder={setSelectedFolder}
                    filterStatus={filterStatus}
                    searchQuery={searchQuery}
                    tasks={tasks}
                    sortedTasks={sortedTasks}
                    tasksToRender={tasksToRender}
                    activeTasks={activeTasks}
                    recentlyCompletedTasks={recentlyCompletedTasks}
                    archivedTasks={archivedTasks}
                    archivedByTier={archivedByTier}
                    openTiers={openTiers}
                    showCompleted={showCompleted}
                    showArchive={showArchive}
                    setShowCompleted={setShowCompleted}
                    setShowArchive={setShowArchive}
                    setOpenTiers={setOpenTiers}
                    setDraft={setDraft}
                    setIsCreateOpen={setIsCreateOpen}
                    setSelectedTag={setSelectedTag}
                    selectedTag={selectedTag}
                    renderTask={renderTask}
                    editingTaskId={editingTaskId}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Minimalist Floating Action Buttons (FABs) from tide_minimalist_to_do_app.html */}
          {editingTaskId === null && (
            <div className="absolute bottom-8 right-6 flex items-center gap-3 z-30">
              {/* Filter FAB */}
              <button
                type="button"
                onClick={() => setShowFilters((prev) => !prev)}
                aria-label="Filter"
                className="w-12 h-12 bg-white dark:bg-[#1f1f1f] text-gray-700 dark:text-gray-200 rounded-full flex items-center justify-center shadow-[0_8px_16px_rgba(0,0,0,0.08)] border border-gray-100 dark:border-white/10 transition-transform active:scale-95 cursor-pointer"
              >
                <SlidersHorizontal size={20} />
              </button>

              {/* Add FAB */}
              <button
                type="button"
                onClick={() => {
                  setIsCreateOpen(true);
                  setDraft({
                    title: '',
                    description: '',
                    priority: 'medium',
                    dueDate: '',
                    recurrence: 'none',
                    recurrenceEnd: '',
                    folder: selectedFolder || '',
                    tags: [],
                    showInCalendar: true,
                  });
                }}
                aria-label="Neue Aufgabe"
                className="w-14 h-14 bg-gray-900 dark:bg-white hover:bg-black text-white dark:text-gray-900 rounded-full flex items-center justify-center shadow-[0_8px_16px_rgba(0,0,0,0.25)] transition-transform active:scale-95 cursor-pointer"
              >
                <Plus size={24} strokeWidth={2.5} />
              </button>
            </div>
          )}
        </div>
      )}

      <TodoFolderModal
            setIsFolderModalOpen={setIsFolderModalOpen}
            isFolderModalOpen={isFolderModalOpen}
            newFolderNameInput={newFolderNameInput}
            setNewFolderNameInput={setNewFolderNameInput}
            handleCreateFolder={handleCreateFolder}
          />
    </div>
  );
};

export default TodoList;

