'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, X, ListTodo, Folder, Inbox, ArrowLeft, FolderPlus,
  ChevronRight, Archive, CheckCircle2, Circle, Calendar, Repeat, Trash2, Check, Timer, RotateCcw, Clock, History, Search, SlidersHorizontal, AlertCircle,
} from 'lucide-react';
import {
  format, isBefore, startOfDay, endOfDay, addDays, addWeeks, addMonths, addYears,
  isToday, isTomorrow, isSameDay,
} from 'date-fns';
import { useTasks, useDataStore, TaskItem } from '@/store/useDataStore';
import { needsNoTagConfirm, defaultTagIds } from '@/lib/tagPrompt';
import { matchesTagFilter, pruneTagFilter, isTagFilterActive, EMPTY_TAG_FILTER } from '@/lib/tagFilter';
import { useTagRegistry } from './useTodoTags';
import TodoTagFilterPanel from './TodoTagFilterPanel';
import TodoFolderOverview, { FolderStat } from './TodoFolderOverview';
import TodoTreeItem from './TodoTreeItem';
import TodoListHeader from './TodoListHeader';
import TodoFolderBanner from './TodoFolderBanner';
import TodoListSections from './TodoListSections';
import TodoDateFilterStrip from './TodoDateFilterStrip';
import TodoFolderModal from './TodoFolderModal';
import TodoCreateCard, { TaskCreateDraft } from './TodoCreateCard';
import TodoFocusedGroupView from './TodoFocusedGroupView';
import TodoDesktopView from './TodoDesktopView';
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

export const TodoList: React.FC<TodoListProps> = ({ className = '', onSelectTask, initialTaskId, variant = 'default', onCreateTag }) => {
  const { tasks, addTask, updateTask, toggleTask, toggleTaskInProgress, deleteTask } = useTasks();
  const isDesktopVariant = variant === 'desktop';

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

  const { tags: allTags, knownIds: knownTagIds, resolve: resolveTags, ensureTag } = useTagRegistry(onCreateTag);
  const rawTagFilter = useDataStore((st) => st.todoTagFilter);
  // Deleted tags are treated as absent
  const tagFilter = useMemo(() => pruneTagFilter(rawTagFilter, knownTagIds), [rawTagFilter, knownTagIds]);
  const setTagFilter = useDataStore((st) => st.setTodoTagFilter);
  const tagFilterActive = isTagFilterActive(tagFilter);
  const tagFilterLabel = useMemo(() => {
    if (!tagFilterActive) return null;
    const titles = resolveTags(tagFilter.tagIds).map((t) => t.title);
    if (tagFilter.untagged) titles.push('Ohne Tag');
    return titles.join(' / ') || 'Ohne Tag';
  }, [tagFilter, tagFilterActive, resolveTags]);
  const clearTagFilter = useCallback(() => setTagFilter(EMPTY_TAG_FILTER), [setTagFilter]);
  const [noTagPrompt, setNoTagPrompt] = useState(false);
  const [noTagConfirmed, setNoTagConfirmed] = useState(false);
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
  const tagFilterRef = useRef(tagFilter);
  tagFilterRef.current = tagFilter;

  // Opening the create card: preselect the active filter tags, reset the no-tag prompt
  useEffect(() => {
    if (!isCreateOpen) return;
    setNoTagPrompt(false);
    setNoTagConfirmed(false);
    setDraft((p) => (p.tags.length > 0 ? p : { ...p, tags: defaultTagIds(tagFilterRef.current) }));
  }, [isCreateOpen]);

  // Selecting any tag clears the prompt
  useEffect(() => {
    if (draft.tags.length > 0) setNoTagPrompt(false);
  }, [draft.tags]);

  const noTagProps = {
    noTagPrompt,
    onNoTagConfirm: () => {
      setNoTagConfirmed(true);
      setNoTagPrompt(false);
      void handleAddTask(undefined, true);
    },
    onNoTagChoose: () => setNoTagPrompt(false),
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');
  const [selectedDateFilter, setSelectedDateFilter] = useState<Date | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('deadline');
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderNameInput, setNewFolderNameInput] = useState('');

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const hasAutoScrolledToTodayRef = useRef(false);

  // Auto-scroll to "Heute" section on mount / task load if no date filter is selected
  useEffect(() => {
    if (selectedDateFilter !== null) return;
    if (hasAutoScrolledToTodayRef.current) return;
    if (tasks.length === 0) return;
    if (viewMode !== 'tasks') return;

    const timer = setTimeout(() => {
      const container = listScrollRef.current;
      const todayEl = document.getElementById('todo-section-today');
      if (container && todayEl) {
        const targetScroll = todayEl.offsetTop - container.offsetTop;
        container.scrollTo({
          top: Math.max(0, targetScroll),
          behavior: 'smooth',
        });
        hasAutoScrolledToTodayRef.current = true;
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [tasks.length, selectedDateFilter, viewMode]);

  const cancelEditing = (id?: string) => {
    if (!id || id === editingTaskId) {
      setEditingTaskId(null);
    }
  };

  const editingTaskIdRef = useRef<string | null>(editingTaskId);
  editingTaskIdRef.current = editingTaskId;

  useEffect(() => {
    if (initialTaskId) {
      setViewMode('tasks');
      setEditingTaskId(initialTaskId);
    }
  }, [initialTaskId]);

  const cancelEditingRef = useRef(cancelEditing);
  cancelEditingRef.current = cancelEditing;

  const saveEditingRef = useRef<(id: string, specificDraft?: TaskEditDraft) => void>(() => {});

  const deleteTaskRef = useRef(deleteTask);
  deleteTaskRef.current = deleteTask;

  // Synchronize editing state with the bottom navigation
  useEffect(() => {
    const isInsideMobile = Boolean(listScrollRef.current?.closest('.mobile-todos-container'));
    if (editingTaskId) {
      window.dispatchEvent(new CustomEvent('tide:todo-editing-start', {
        detail: {
          id: editingTaskId,
          source: isInsideMobile ? 'mobile' : 'desktop',
          isDesktop: !isInsideMobile,
        },
      }));
    } else {
      window.dispatchEvent(new CustomEvent('tide:todo-editing-end', {
        detail: {
          source: isInsideMobile ? 'mobile' : 'desktop',
          isDesktop: !isInsideMobile,
        },
      }));
    }
    return () => {
      window.dispatchEvent(new CustomEvent('tide:todo-editing-end'));
    };
  }, [editingTaskId]);

  useEffect(() => {
    const handleNewTodoEvent = () => {
      setViewMode('tasks');
      setIsCreateOpen(true);
      setTimeout(() => {
        titleInputRef.current?.focus();
      }, 50);
    };
    const handleToggleFilterEvent = () => {
      setIsFilterMenuOpen((prev) => !prev);
      setIsAddMenuOpen(false);
    };
    const handleNewFolderEvent = () => {
      setIsFolderModalOpen(true);
    };

    const handleCancelEdit = (e?: Event) => {
      const customEvent = e as CustomEvent<{ source?: string }>;
      const isInsideMobile = Boolean(listScrollRef.current?.closest('.mobile-todos-container'));
      if (!isInsideMobile && customEvent?.detail?.source === 'mobile') {
        return;
      }
      const currentId = editingTaskIdRef.current || editingTaskId;
      if (currentId) cancelEditingRef.current(currentId);
    };
    const handleSaveEdit = () => {
      const currentId = editingTaskIdRef.current || editingTaskId;
      if (currentId) saveEditingRef.current(currentId);
    };
    const handleDeleteTask = (e: Event) => {
      const customEvent = e as CustomEvent<{ id?: string }>;
      if (customEvent.detail?.id) {
        deleteTaskRef.current(customEvent.detail.id);
      }
      setEditingTaskId(null);
    };
    const handleNewSubtask = () => {
      window.dispatchEvent(new CustomEvent('tide:toggle-subtask-input'));
    };
    const handleSelectTodo = (e: Event) => {
      const customEvent = e as CustomEvent<{ id?: string }>;
      if (customEvent.detail?.id) {
        setViewMode('tasks');
        setEditingTaskId(customEvent.detail.id);
      }
    };
    const handleScrollToToday = () => {
      setViewMode((prev) => (prev !== 'tasks' ? 'tasks' : prev));
      setSelectedDateFilter((prev) => (prev !== null ? null : prev));
      if (editingTaskIdRef.current) {
        cancelEditingRef.current(editingTaskIdRef.current);
      }
      const doScroll = () => {
        const todayEl = document.getElementById('todo-section-today');
        if (todayEl) {
          todayEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (listScrollRef.current) {
          listScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
      };
      doScroll();
      setTimeout(doScroll, 60);
    };

    window.addEventListener('tide:new-todo', handleNewTodoEvent);
    window.addEventListener('tide:toggle-todo-filter', handleToggleFilterEvent);
    window.addEventListener('tide:new-todo-folder', handleNewFolderEvent);
    window.addEventListener('tide:todo-cancel-edit', handleCancelEdit);
    window.addEventListener('tide:todo-save-edit', handleSaveEdit);
    window.addEventListener('tide:todo-delete', handleDeleteTask as EventListener);
    window.addEventListener('tide:new-subtask', handleNewSubtask);
    window.addEventListener('tide:select-todo', handleSelectTodo as EventListener);
    window.addEventListener('tide:scroll-to-today', handleScrollToToday);
    return () => {
      window.removeEventListener('tide:new-todo', handleNewTodoEvent);
      window.removeEventListener('tide:toggle-todo-filter', handleToggleFilterEvent);
      window.removeEventListener('tide:new-todo-folder', handleNewFolderEvent);
      window.removeEventListener('tide:todo-cancel-edit', handleCancelEdit);
      window.removeEventListener('tide:todo-save-edit', handleSaveEdit);
      window.removeEventListener('tide:todo-delete', handleDeleteTask as EventListener);
      window.removeEventListener('tide:new-subtask', handleNewSubtask);
      window.removeEventListener('tide:select-todo', handleSelectTodo as EventListener);
      window.removeEventListener('tide:scroll-to-today', handleScrollToToday);
    };
  }, []);

  // Close menus on click outside or escape key
  useEffect(() => {
    if (!isAddMenuOpen && !isFilterMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (isAddMenuOpen && addMenuRef.current && !addMenuRef.current.contains(target)) {
        setIsAddMenuOpen(false);
      }
      if (isFilterMenuOpen && filterMenuRef.current && !filterMenuRef.current.contains(target)) {
        const targetEl = target as HTMLElement;
        if (targetEl?.closest?.('button[aria-label*="ilter" i], [data-todo-filter], [data-action*="filter"]')) {
          return;
        }
        setIsFilterMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAddMenuOpen(false);
        setIsFilterMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAddMenuOpen, isFilterMenuOpen]);

  // Hide popovers when editing task
  useEffect(() => {
    if (editingTaskId !== null) {
      setIsAddMenuOpen(false);
      setIsFilterMenuOpen(false);
    }
  }, [editingTaskId]);
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

  const handleAddTask = async (e?: React.FormEvent, skipNoTagPrompt = false) => {
    e?.preventDefault();
    if (!draft.title.trim() || isSubmitting) return;
    if (!skipNoTagPrompt && needsNoTagConfirm(draft.tags, noTagConfirmed)) {
      setNoTagPrompt(true);
      return;
    }
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
      setIsCreateOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenCreateTask = () => {
    if (viewMode === 'folders') {
      setViewMode('tasks');
    }
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
    setIsCreateOpen(true);
    setIsAddMenuOpen(false);
    setTimeout(() => {
      titleInputRef.current?.focus();
    }, 50);
  };

  const handleOpenCreateFolder = () => {
    setIsFolderModalOpen(true);
    setIsAddMenuOpen(false);
  };

  const lastRowClickRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });
  const editingStartTimeRef = useRef<number>(0);

  const startEditing = (task: TaskItem) => {
    editingStartTimeRef.current = Date.now();
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

  const saveEditing = (id: string, specificDraft?: TaskEditDraft) => {
    const draftToUse = specificDraft || editDraft;
    if (!draftToUse.title.trim()) return;
    const folderVal = draftToUse.folder ? draftToUse.folder.trim() || undefined : undefined;
    const isCompleted = draftToUse.status === 'completed';
    updateTask(id, {
      title: draftToUse.title.trim(),
      description: draftToUse.description ? draftToUse.description.trim() || undefined : undefined,
      priority: draftToUse.priority,
      status: draftToUse.status,
      isCompleted,
      color: getPriorityColor(draftToUse.priority, (draftToUse as { color?: string }).color),
      scheduledDate: draftToUse.dueDate || undefined,
      dueDate: draftToUse.dueDate || undefined,
      recurrence: draftToUse.recurrence,
      recurrence_rule: buildRecurrenceRule(draftToUse.recurrence),
      recurrence_end: draftToUse.recurrence !== 'none' && draftToUse.recurrenceEnd ? draftToUse.recurrenceEnd : undefined,
      folder: folderVal,
      tags: draftToUse.tags,
      showInCalendar: draftToUse.showInCalendar,
    });
    if (folderVal && !createdFolders.includes(folderVal)) {
      handleCreateFolder(folderVal);
    }
    if (id === editingTaskId) {
      setEditingTaskId(null);
    }
  };
  saveEditingRef.current = saveEditing;

  const handleRowClick = (task: TaskItem) => {
    const now = Date.now();
    const timeSinceLastClick = now - lastRowClickRef.current.time;
    const sameTask = lastRowClickRef.current.id === task.id;

    // Debounce rapid successive clicks on the same row (within 300ms)
    if (sameTask && timeSinceLastClick < 300) {
      return;
    }
    lastRowClickRef.current = { id: task.id, time: now };

    if (editingTaskId === task.id) {
      // Do not rapidly toggle off an item if clicked again during editing (within 500ms of opening)
      if (now - editingStartTimeRef.current < 500) {
        return;
      }
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
      if (resolveTags(t.tags).some((tag) => tag.title.toLowerCase().includes(q))) return true;
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
      if (!matchesTagFilter(t.tags ?? [], tagFilter, knownTagIds)) return false;
      const archived = isTaskArchived(t);
      if (filterStatus === 'active' && (t.isCompleted || t.status === 'in_progress' || archived)) return false;
      if (filterStatus === 'in_progress' && (t.isCompleted || t.status !== 'in_progress' || archived)) return false;
      if (filterStatus === 'completed' && (!t.isCompleted || archived)) return false;
      if (filterStatus === 'archived' && !archived) return false;
      if (filterPriority !== 'all' && getTaskPriority(t) !== filterPriority) return false;
      if (selectedDateFilter !== null) {
        const d = parseDateSafe(t.dueDate || t.scheduledDate);
        if (!d || !isSameDay(d, selectedDateFilter)) return false;
      }
      if (q && !matchesSearch(t)) return false;
      return true;
    });
  }, [taskTree, selectedFolder, tagFilter, knownTagIds, resolveTags, filterStatus, filterPriority, searchQuery, selectedDateFilter]);

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
      const tagA = resolveTags(a.tags)[0]?.title ?? '(Kein Tag)';
      const tagB = resolveTags(b.tags)[0]?.title ?? '(Kein Tag)';
      const diff = tagA.localeCompare(tagB);
      if (diff !== 0) return diff;
    }
    if (sortBy === 'title') {
      const diff = a.title.localeCompare(b.title);
      if (diff !== 0) return diff;
    }
    return 0;
  }), [filteredTasks, sortBy, resolveTags]);

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

  const renderTask = useCallback((task: TaskWithChildren) => (
    <TodoTreeItem disableClickDebounce
        task={task}
        isExpanded={editingTaskId === task.id}
        editingTaskId={editingTaskId}
        isCompleting={completingTaskIds.has(task.id)}
        completingTaskIds={completingTaskIds}
        editDraft={editDraft}
        setEditDraft={setEditDraft}
        editNewTagInput={editNewTagInput}
        setEditNewTagInput={setEditNewTagInput}
        allFolders={allFolders}
        selectedFolder={selectedFolder}
        setSelectedFolder={setSelectedFolder}
        setViewMode={setViewMode}
        handleCreateTag={ensureTag}
        handleToggleTask={handleToggleTask}
        handleToggleInProgress={handleToggleInProgress}
        saveEditing={saveEditing}
        cancelEditing={() => cancelEditing(task.id)}
        deleteTask={deleteTask}
        onRowClick={handleRowClick}
        onFocusGroup={(groupTask) => setFocusedGroupId(groupTask.id)}
      />
  ), [
    editingTaskId,
    completingTaskIds,
    editDraft,
    setEditDraft,
    editNewTagInput,
    setEditNewTagInput,
    ensureTag,
    allFolders,
    selectedFolder,
    setSelectedFolder,
    setViewMode,
    handleToggleTask,
    handleToggleInProgress,
    saveEditing,
    cancelEditing,
    deleteTask,
    handleRowClick,
    setFocusedGroupId,
  ]);

  return (
    <div className={`w-full h-full flex flex-col ${isDesktopVariant ? 'bg-t2-bg' : 'bg-[#f8f9fa] '} relative overflow-hidden ${className || ''}`}>
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
        hideProgress={editingTaskId !== null}
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
      ) : isDesktopVariant ? (
        <TodoDesktopView
          tasks={tasks}
          tasksToRender={tasksToRender}
          recentlyCompletedTasks={recentlyCompletedTasks}
          archivedTasks={archivedTasks}
          archivedByTier={archivedByTier}
          filterStatus={filterStatus}
          showCompleted={showCompleted}
          showArchive={showArchive}
          setShowCompleted={setShowCompleted}
          setShowArchive={setShowArchive}
          folders={allFolders}
          completingTaskIds={completingTaskIds}
          initialTaskId={initialTaskId}
          onSelectTask={onSelectTask}
          onToggleTask={handleToggleTask}
          onToggleSubtask={(id) => { void toggleTask(id); }}
          onUpdateTask={updateTask}
          onDeleteTask={deleteTask}
          onAddSubtask={async (title, parent) => {
            await addTask({
              title,
              parentId: parent.id,
              folder: parent.folder,
              tags: parent.tags ? [...parent.tags] : [],
              priority: parent.priority || 'medium',
              isCompleted: false,
              status: 'todo',
              order: tasks.filter((t) => t.parentId === parent.id).length,
            });
          }}
          topSlot={(
            <>
              <TodoFolderBanner
                setViewMode={setViewMode}
                selectedFolder={selectedFolder}
                setSelectedFolder={setSelectedFolder}
                selectedFolderActiveCount={selectedFolderActiveCount}
              />
              {isCreateOpen && (
                <TodoCreateCard
                  draft={draft} setDraft={setDraft} titleInputRef={titleInputRef}
                  allTags={allTags} allFolders={allFolders}
                  isSubmitting={isSubmitting} handleAddTask={handleAddTask}
                  handleCreateTag={ensureTag}
                  onClose={() => setIsCreateOpen(false)}
                  {...noTagProps}
                />
              )}
            </>
          )}
        />
      ) : (
        /* Center container */
        <div className={`w-full max-w-2xl lg:max-w-3xl mx-auto flex-1 flex flex-col min-h-0 relative px-0 sm:px-2 ${editingTaskId !== null ? 'h-full' : ''}`}>
          {/* Scrollable list container */}
          <div
            ref={listScrollRef}
            className={`flex-1 min-h-0 ${editingTaskId !== null ? 'h-full' : ''} overflow-y-auto overflow-x-hidden px-3 sm:px-4 ${editingTaskId !== null ? 'pt-0 pb-2 sm:pb-6' : 'pt-1 sm:pt-2 pb-16'} flex flex-col gap-2`}
          >
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
                  className={`flex flex-col ${editingTaskId !== null ? 'h-full flex-1 min-h-0 gap-0' : 'gap-4 sm:gap-5'}`}
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
                      allTags={allTags} allFolders={allFolders}
                      isSubmitting={isSubmitting} handleAddTask={handleAddTask}
                      handleCreateTag={ensureTag}
                      onClose={() => setIsCreateOpen(false)}
                      {...noTagProps}
                    />
                  )}



                  {/* Horizontal Date Scrollbar / Strip ("Datumsfilter") */}
                  {editingTaskId === null && viewMode === 'tasks' && (
                    <TodoDateFilterStrip
                      selectedDate={selectedDateFilter}
                      onSelectDate={setSelectedDateFilter}
                      tasks={tasks}
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
                    selectedTag={tagFilterLabel}
                    selectedTagIds={tagFilter.tagIds}
                    clearTagFilter={clearTagFilter}
                    renderTask={renderTask}
                    editingTaskId={editingTaskId}
                    selectedDateFilter={selectedDateFilter}
                    setSelectedDateFilter={setSelectedDateFilter}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Filter Popover */}
      {editingTaskId === null && (
        <AnimatePresence>
          {isFilterMenuOpen && (
            <motion.div
              ref={filterMenuRef}
              initial={{ opacity: 0, scale: 0.92, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 8 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="fixed bottom-20 right-4 sm:right-6 md:bottom-22 md:right-8 z-50 w-[310px] sm:w-[340px] max-w-[calc(100vw-2.5rem)] max-h-[75vh] overflow-y-auto bg-t2-surface  backdrop-blur-xl border border-t2-line  rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.18)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.5)] p-4 flex flex-col gap-4 text-xs text-t2-ink "
            >
                      {/* Header */}
                      <div className="flex items-center justify-between pb-2 border-b border-t2-line-soft ">
                        <div className="flex items-center gap-2">
                          <SlidersHorizontal size={15} className="text-t2-accent" />
                          <span className="font-semibold text-sm text-t2-ink ">Ansicht & Filter</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {(filterPriority !== 'all' || tagFilterActive || filterStatus !== 'all' || searchQuery.trim() !== '' || selectedDateFilter !== null) && (
                            <button
                              type="button"
                              onClick={() => {
                                setFilterPriority('all');
                                clearTagFilter();
                                setFilterStatus('all');
                                setSearchQuery('');
                                setSelectedDateFilter(null);
                              }}
                              className="text-[11px] text-t2-accent  hover:underline px-1 py-0.5 rounded cursor-pointer"
                            >
                              Zurücksetzen
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setIsFilterMenuOpen(false)}
                            className="p-1 text-t2-ink-3 hover:text-t2-ink  rounded-lg transition-colors cursor-pointer"
                            aria-label="Schließen"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      </div>

                      {!isDesktopVariant && (
                      <>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-t2-ink-3" />
                        <input
                          type="text"
                          placeholder="Aufgaben durchsuchen..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-8 pr-7 py-1.5 bg-t2-hover  border border-t2-line  rounded-xl text-xs text-t2-ink  placeholder-t2-ink-3 focus:outline-none focus:ring-1 focus:ring-t2-accent"
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-t2-ink-3 hover:text-t2-ink-2  cursor-pointer"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                      </>
                      )}

                      {/* View Mode Switcher */}
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-t2-ink-3  mb-1.5">
                          Ansicht
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 bg-t2-hover  p-1 rounded-xl border border-t2-line ">
                          <button
                            type="button"
                            onClick={() => {
                              setViewMode('tasks');
                              setIsFilterMenuOpen(false);
                            }}
                            className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              viewMode === 'tasks'
                                ? 'bg-t2-surface  text-t2-accent  shadow-xs'
                                : 'text-t2-ink-2  hover:text-t2-ink '
                            }`}
                          >
                            <ListTodo size={14} />
                            <span>Liste</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setViewMode('folders');
                              setIsFilterMenuOpen(false);
                            }}
                            className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              viewMode === 'folders'
                                ? 'bg-t2-surface  text-t2-accent  shadow-xs'
                                : 'text-t2-ink-2  hover:text-t2-ink '
                            }`}
                          >
                            <Folder size={14} />
                            <span>Ordner</span>
                            {allFolders.length > 0 && (
                              <span className="px-1 py-0.2 rounded-full text-[11px] bg-t2-sub  text-t2-accent  font-semibold">
                                {allFolders.length}
                              </span>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Filter nach Status */}
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-t2-ink-3  mb-1.5">
                          Status
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { id: 'all' as FilterStatus, label: 'Alle' },
                            { id: 'active' as FilterStatus, label: 'Offen' },
                            { id: 'in_progress' as FilterStatus, label: 'In Arbeit' },
                            { id: 'completed' as FilterStatus, label: 'Erledigt' },
                            { id: 'archived' as FilterStatus, label: 'Archiv' },
                          ].map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setFilterStatus(item.id);
                                setIsFilterMenuOpen(false);
                              }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                                filterStatus === item.id
                                  ? 'bg-[#18181b] dark:bg-white text-white dark:text-[#09090b] shadow-xs font-semibold'
                                  : 'bg-t2-hover  text-t2-ink-2  hover:bg-t2-stage '
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Filter nach Priorität */}
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-t2-ink-3  mb-1.5">
                          Priorität
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { id: 'all' as const, label: 'Alle', colorDot: 'bg-t2-ink-3' },
                            { id: 'high' as const, label: 'P3 (Hoch)', colorDot: 'bg-red-500' },
                            { id: 'medium' as const, label: 'P2 (Mittel)', colorDot: 'bg-amber-500' },
                            { id: 'low' as const, label: 'P1 (Niedrig)', colorDot: 'bg-emerald-500' },
                          ].map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setFilterPriority(item.id);
                                setIsFilterMenuOpen(false);
                              }}
                              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                                filterPriority === item.id
                                  ? 'bg-[#18181b] dark:bg-white text-white dark:text-[#09090b] shadow-xs font-semibold'
                                  : 'bg-t2-hover  text-t2-ink  hover:bg-t2-stage '
                              }`}
                            >
                              <span className={`w-2 h-2 rounded-full ${item.colorDot} shrink-0`} />
                              <span className="truncate">{item.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Filter nach Tags */}
                      <TodoTagFilterPanel tags={allTags} filter={tagFilter} onChange={setTagFilter} />

                      {/* Filter nach Datum */}
                      <div>
                        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-t2-ink-3  mb-1.5">
                          <span className="flex items-center gap-1">
                            <Calendar size={12} />
                            Datum
                          </span>
                          {selectedDateFilter && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDateFilter(null);
                                setIsFilterMenuOpen(false);
                              }}
                              className="text-[11px] text-t2-accent  hover:underline cursor-pointer"
                            >
                              Zurücksetzen
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDateFilter(null);
                              setIsFilterMenuOpen(false);
                            }}
                            className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                              selectedDateFilter === null
                                ? 'bg-[#18181b] dark:bg-white text-white dark:text-[#09090b] shadow-xs font-semibold'
                                : 'bg-t2-hover  text-t2-ink-2  hover:bg-t2-stage '
                            }`}
                          >
                            Alle
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDateFilter(startOfDay(new Date()));
                              setIsFilterMenuOpen(false);
                            }}
                            className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                              selectedDateFilter && isToday(selectedDateFilter)
                                ? 'bg-t2-accent text-t2-accent-ink shadow-xs font-semibold'
                                : 'bg-t2-hover  text-t2-ink-2  hover:bg-t2-stage '
                            }`}
                          >
                            Heute
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDateFilter(startOfDay(addDays(new Date(), 1)));
                              setIsFilterMenuOpen(false);
                            }}
                            className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                              selectedDateFilter && isTomorrow(selectedDateFilter)
                                ? 'bg-t2-accent text-t2-accent-ink shadow-xs font-semibold'
                                : 'bg-t2-hover  text-t2-ink-2  hover:bg-t2-stage '
                            }`}
                          >
                            Morgen
                          </button>
                        </div>
                      </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Desktop & iPad Floating Action Buttons */}
      {editingTaskId === null && (
        <div className="hidden md:flex fixed bottom-8 right-8 z-40 items-center gap-3">
          {/* Filter button */}
          <button
            type="button"
            data-todo-filter
            aria-label="Filter"
            onClick={() => {
              setIsFilterMenuOpen((prev) => !prev);
              setIsAddMenuOpen(false);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-t2-surface  backdrop-blur-md hover:bg-t2-sub  text-t2-ink  border border-t2-line  rounded-xl shadow-lg transition-all active:scale-95 font-medium text-sm cursor-pointer select-none"
          >
            <SlidersHorizontal size={16} className="text-t2-ink-2 " />
            <span>Filter</span>
          </button>

          {/* Plus button with popover */}
          <div ref={addMenuRef} className="relative">
            <AnimatePresence>
              {isAddMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 8 }}
                  transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute bottom-full right-0 mb-3 w-48 bg-t2-surface  backdrop-blur-xl border border-t2-line  rounded-2xl shadow-xl p-1.5 flex flex-col gap-1 z-50 text-xs"
                >
                  <button
                    type="button"
                    onClick={handleOpenCreateTask}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left rounded-xl text-t2-ink  hover:bg-t2-hover  transition-colors font-medium cursor-pointer"
                  >
                    <Plus size={15} className="text-t2-accent" />
                    <span>Aufgabe erstellen</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenCreateFolder}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left rounded-xl text-t2-ink  hover:bg-t2-hover  transition-colors font-medium cursor-pointer"
                  >
                    <FolderPlus size={15} className="text-t2-accent" />
                    <span>Ordner erstellen</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="button"
              aria-label="Aufgabe hinzufügen"
              onClick={() => {
                setIsAddMenuOpen((prev) => !prev);
                setIsFilterMenuOpen(false);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-t2-accent hover:opacity-90   text-t2-accent-ink rounded-xl shadow-lg transition-all active:scale-95 font-medium text-sm cursor-pointer select-none"
            >
              <Plus size={18} />
              <span>Aufgabe</span>
            </button>
          </div>
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

