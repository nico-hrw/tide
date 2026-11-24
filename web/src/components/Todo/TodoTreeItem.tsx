'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trash2, Plus,
  X, Tag, Repeat, Check, ArrowLeft, ChevronUp, ChevronDown, Minus,
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import { useDataStore, TaskItem } from '@/store/useDataStore';
import TodoSplitModal from './TodoSplitModal';
import { useTagRegistry, DEFAULT_TAG_COLOR } from './useTodoTags';
import { toggleTagInFilter } from '@/lib/tagFilter';
import { useMobileTodoStyle, mobileCardStyle, MobilePriorityIcon, MobileOverdue } from './MobileTodoStyle';
import { TodoPriorityBadge } from './TodoPriorityBadge';
import { VisibilityBadge } from '@/components/Visibility/VisibilityBadge';
import {
  RecurrenceType, TaskWithChildren, TaskEditDraft,
  RECURRENCE_OPTIONS, getTaskPriority, getDeadlineInfo, parseDateSafe,
} from './types';

export interface TodoTreeItemProps {
  task: TaskWithChildren; depth?: number; isExpanded?: boolean; editingTaskId?: string | null;
  isCompleting?: boolean; completingTaskIds?: Set<string>;
  editDraft?: TaskEditDraft; setEditDraft?: React.Dispatch<React.SetStateAction<TaskEditDraft>>;
  editNewTagInput?: string; setEditNewTagInput?: React.Dispatch<React.SetStateAction<string>>;
  /** Returns the id of the existing or newly created tag with this name. */
  handleCreateTag?: (name: string) => Promise<string | undefined>;
  handleToggleTask: (task: TaskItem) => void; handleToggleInProgress: (task: TaskItem) => void;
  saveEditing?: (id: string, draft?: TaskEditDraft) => void; cancelEditing?: () => void;
  deleteTask: (id: string) => Promise<void> | void;
  onRowClick?: (task: TaskItem) => void; onSelectTask?: (task: TaskItem) => void;
  disableClickDebounce?: boolean; onFocusGroup?: (task: TaskWithChildren) => void;
  parentDueDate?: string;
}

const MONTHS_DE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

const TAG_CHIP_CLASS = 'bg-t2-sub text-t2-ink-2';

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

export const TodoTreeItem: React.FC<TodoTreeItemProps> = React.memo(function TodoTreeItem({
  task, depth = 0, isExpanded, editingTaskId, isCompleting = false, completingTaskIds,
  editDraft, setEditDraft, editNewTagInput, setEditNewTagInput,
  handleCreateTag, handleToggleTask, handleToggleInProgress,
  saveEditing, cancelEditing, deleteTask, onRowClick, onSelectTask, disableClickDebounce = false,
  onFocusGroup, parentDueDate,
}) {
  const addTask = useDataStore((s) => s.addTask);
  const { resolve: resolveTags, ensureTag } = useTagRegistry(handleCreateTag);
  const tagFilter = useDataStore((s) => s.todoTagFilter);
  const setTodoTagFilter = useDataStore((s) => s.setTodoTagFilter);
  const updateTask = useDataStore((s) => s.updateTask);
  const myId = useDataStore((s) => s.myId);
  const isSharedWithMe = !!task.owner_id && !!myId && task.owner_id !== myId;
  const parentTask = useDataStore((s) => task.parentId ? s.tasks.find((t) => t.id === task.parentId) : undefined);
  const effectiveParentDueDate = (parentDueDate || parentTask?.dueDate || parentTask?.scheduledDate || '').slice(0, 10);
  const [isParentMinimized, setIsParentMinimized] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [showSubtaskInput, setShowSubtaskInput] = useState(false);
  const [subtasksCollapsed, setSubtasksCollapsed] = useState(false);
  const subtaskInputRef = useRef<HTMLInputElement>(null);
  const totalCount = task.children?.length || 0;
  const completedCount = task.children?.filter((c) => c.isCompleted).length || 0;
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const isSwipingRef = useRef(false);
  const isVerticalScrollRef = useRef(false);
  const justSwipedRef = useRef(false);

  const isControlledExpanded = isExpanded !== undefined ? isExpanded : editingTaskId !== undefined ? editingTaskId === task.id : undefined;
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = isControlledExpanded !== undefined ? isControlledExpanded : localExpanded;

  useEffect(() => {
    if (!expanded) return;
    const handleToggleSubtask = () => {
      setShowSubtaskInput((prev) => !prev);
    };
    window.addEventListener('tide:toggle-subtask-input', handleToggleSubtask);
    return () => {
      window.removeEventListener('tide:toggle-subtask-input', handleToggleSubtask);
    };
  }, [expanded]);

  useEffect(() => {
    if (showSubtaskInput) {
      const timer = setTimeout(() => {
        subtaskInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [showSubtaskInput]);

  const [localDraft, setLocalDraft] = useState<TaskEditDraft>(() => ({
    title: task.title, description: task.description || '', priority: getTaskPriority(task),
    status: task.isCompleted ? 'completed' : (task.status || 'todo'),
    dueDate: task.dueDate || task.scheduledDate || '', recurrence: task.recurrence || 'none',
    recurrenceEnd: task.recurrence_end || '', tags: task.tags ? [...task.tags] : [],
    showInCalendar: task.showInCalendar !== false,
  }));
  const draft = editDraft || localDraft;
  const setDraft = setEditDraft || setLocalDraft;

  useEffect(() => {
    if (!editDraft && !expanded) {
      setLocalDraft({
        title: task.title,
        description: task.description || '',
        priority: getTaskPriority(task),
        status: task.isCompleted ? 'completed' : (task.status || 'todo'),
        dueDate: task.dueDate || task.scheduledDate || '',
        recurrence: task.recurrence || 'none',
        recurrenceEnd: task.recurrence_end || '',
        tags: task.tags ? [...task.tags] : [],
        showInCalendar: task.showInCalendar !== false,
      });
    }
  }, [task.id, task.updatedAt, (task as any).updated_at, editDraft, expanded]);

  const [localTagInput, setLocalTagInput] = useState('');
  const tagInput = editNewTagInput !== undefined ? editNewTagInput : localTagInput;
  const setTagInput = setEditNewTagInput || setLocalTagInput;

  const deadline = getDeadlineInfo(task.dueDate || task.scheduledDate);
  const parsedDate = parseDateSafe(task.dueDate || task.scheduledDate);
  const isTaskCompleted = task.isCompleted || isCompleting;
  const isOverdue = deadline?.status === 'overdue' && !isTaskCompleted;
  const isTodayDate = deadline?.status === 'today';
  const isTodayActive = isTodayDate && !isTaskCompleted && (!depth || depth === 0);
  const isMobileT2 = useMobileTodoStyle();

  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, textarea, select')) return;
    if (expanded) return;
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    isSwipingRef.current = false;
    isVerticalScrollRef.current = false;
    justSwipedRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (expanded || isVerticalScrollRef.current) return;
    const deltaX = e.touches[0].clientX - touchStartXRef.current;
    const deltaY = e.touches[0].clientY - touchStartYRef.current;
    if (!isSwipingRef.current && !isVerticalScrollRef.current) {
      if (Math.abs(deltaY) > 8 && Math.abs(deltaY) > Math.abs(deltaX)) { isVerticalScrollRef.current = true; return; }
      if (Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY)) { isSwipingRef.current = true; setIsSwiping(true); }
    }
    if (isSwipingRef.current) {
      let offset = deltaX;
      if (offset > 110) offset = 110 + (offset - 110) * 0.25;
      if (offset < -110) offset = -110 + (offset + 110) * 0.25;
      setSwipeOffset(offset);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isSwipingRef.current) { setSwipeOffset(0); setIsSwiping(false); return; }
    const currentOffset = swipeOffset;
    setIsSwiping(false);
    setSwipeOffset(0);
    isSwipingRef.current = false;
    justSwipedRef.current = true;
    setTimeout(() => { justSwipedRef.current = false; }, 300);
    if (currentOffset > 60) {
      handleToggleTask(task);
    } else if (currentOffset < -60) {
      e.stopPropagation();
      e.preventDefault();
      void deleteTask(task.id);
    }
  };

  const handleClick = () => {
    if (justSwipedRef.current) { justSwipedRef.current = false; return; }
    if (onRowClick) {
      onRowClick(task);
    } else {
      if (isControlledExpanded === undefined) setLocalExpanded((p) => !p);
      onSelectTask?.(task);
    }
  };

  const handleAddTag = async (name: string) => {
    const tagId = await ensureTag(name);
    if (tagId && !draft.tags.includes(tagId)) {
      const nextTags = [...draft.tags, tagId];
      setDraft((p) => ({ ...p, tags: nextTags }));
      updateTask(task.id, { tags: nextTags });
    }
    setTagInput('');
  };

  const handleQuickDate = (option: 'now' | 'today' | 'tomorrow' | 'none') => {
    if (option === 'none') {
      setDraft((p) => ({ ...p, dueDate: '' }));
      updateTask(task.id, { dueDate: undefined, scheduledDate: undefined });
      return;
    }
    if (option === 'now') {
      const now = new Date();
      let dateStr = format(now, 'yyyy-MM-dd');
      const timeStr = format(now, 'HH:mm');
      if ((depth || 0) > 0 && effectiveParentDueDate && dateStr > effectiveParentDueDate) {
        dateStr = effectiveParentDueDate;
      }
      const targetStr = `${dateStr}T${timeStr}:00`;
      setDraft((p) => ({ ...p, dueDate: targetStr }));
      updateTask(task.id, { dueDate: targetStr, scheduledDate: targetStr });
      return;
    }
    const target = option === 'today' ? new Date() : addDays(new Date(), 1);
    let targetStr = format(target, 'yyyy-MM-dd');
    if ((depth || 0) > 0 && effectiveParentDueDate && targetStr > effectiveParentDueDate) {
      targetStr = effectiveParentDueDate;
    }
    setDraft((p) => ({ ...p, dueDate: targetStr }));
    updateTask(task.id, { dueDate: targetStr, scheduledDate: targetStr });
  };

  const handleAddSubtask = async () => {
    const trimmed = newSubtaskTitle.trim();
    if (!trimmed) return;
    const inheritedDate = draft.dueDate || task.dueDate || task.scheduledDate || undefined;
    await addTask({
      title: trimmed,
      parentId: task.id,
      tags: task.tags ? [...task.tags] : [],
      priority: (draft.priority || task.priority || 'low') as any,
      dueDate: inheritedDate,
      scheduledDate: inheritedDate,
      isCompleted: false,
      status: 'todo',
      order: task.children?.length || 0,
    });
    setNewSubtaskTitle('');
  };

  const draftDate = parseDateSafe(draft.dueDate);
  const isDraftNow = Boolean(
    draft.dueDate &&
    draft.dueDate.includes('T') &&
    draftDate &&
    format(draftDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
  );
  const isDraftToday = Boolean(
    draftDate &&
    !draft.dueDate?.includes('T') &&
    (deadline?.status === 'today' || format(draftDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd'))
  );
  const isDraftTomorrow = Boolean(
    draftDate &&
    format(draftDate, 'yyyy-MM-dd') === format(addDays(new Date(), 1), 'yyyy-MM-dd')
  );

  const indentPx = Math.max(0, Math.min((depth - 1) * 16, 48));

  return (
    <div className={`flex flex-col w-full ${expanded && (!depth || depth === 0) ? 'h-full flex-1 min-h-0' : ''}`} style={{ paddingLeft: indentPx > 0 ? `${indentPx}px` : undefined }}>
      <div className={`relative ${expanded && (!depth || depth === 0) ? 'h-full flex-1 min-h-0 flex flex-col' : expanded ? 'flex flex-col' : 'overflow-hidden rounded-xl sm:rounded-2xl'}`}>
        {/* Swipe action background indicators */}
        {!expanded && (
          <div className={`absolute inset-0 my-0.5 sm:my-1 flex items-center justify-between px-5 rounded-xl sm:rounded-2xl pointer-events-none transition-colors ${swipeOffset > 0 ? 'bg-emerald-500 text-white' : swipeOffset < 0 ? 'bg-rose-500 text-white' : 'bg-transparent'}`}>
            <div className={`flex items-center gap-2 font-bold text-xs transition-opacity duration-150 ${swipeOffset > 30 ? 'opacity-100' : 'opacity-0'}`}>
              <Check size={20} /><span>{isTaskCompleted ? 'Wiedereröffnen' : 'Erledigen'}</span>
            </div>
            <div className={`flex items-center gap-2 font-bold text-xs transition-opacity duration-150 ${swipeOffset < -30 ? 'opacity-100' : 'opacity-0'}`}>
              <span>Löschen</span><Trash2 size={20} />
            </div>
          </div>
        )}

        {/* Item View / Options Panel */}
        <AnimatePresence initial={false}>
          {!expanded ? (
            <motion.div
              layoutId={`todo-card-${task.id}`}
              key={`collapsed-${task.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, x: swipeOffset }}
              exit={{ opacity: 0 }}
              transition={{
                x: isSwiping ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 35 },
                layout: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
                opacity: { duration: 0.15 },
              }}
              style={{
                touchAction: 'pan-y',
                ...(isMobileT2 ? mobileCardStyle(isTaskCompleted, isTodayActive) : {}),
              }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onClick={handleClick}
              className={`flex items-start gap-3 sm:gap-4 p-3.5 sm:p-4 my-0.5 sm:my-1 backdrop-blur-xs rounded-xl sm:rounded-2xl relative pr-3 sm:pr-4 cursor-pointer group transition-all ${
                isTaskCompleted
                  ? 'opacity-40 grayscale-[30%] bg-t2-sub  text-t2-ink-2  border border-t2-line '
                  : isMobileT2
                    ? (isTodayActive ? 'tide-m-today' : '')
                  : isTodayActive
                    ? 'bg-[#27272a] text-white border border-[#27272a] shadow-md dark:bg-white dark:text-black dark:border-white dark:shadow-md'
                    : 'bg-t2-surface  text-t2-ink  border border-t2-line  hover:border-t2-line  shadow-[0_1px_3px_rgba(0,0,0,0.03)] dark:shadow-none'
              }`}
            >
              {/* Left Date Column */}
              {parsedDate ? (
                isOverdue ? (
                  <div className={`w-12 shrink-0 self-center flex flex-col items-center justify-center text-center ml-1 sm:ml-2 ${isTaskCompleted ? 'opacity-50' : ''}`}>
                    <span className={`text-[14px] font-bold leading-tight ${isTaskCompleted ? 'text-t2-ink-3 ' : 'text-t2-ink'}`}>
                      {format(parsedDate, 'd.')}
                    </span>
                    <span className={`text-[11px] font-semibold uppercase tracking-widest ${isTaskCompleted ? 'text-t2-ink-3 ' : 'text-t2-ink'}`}>
                      {MONTHS_DE[parsedDate.getMonth()].toUpperCase()}
                    </span>
                  </div>
                ) : isTodayDate ? (
                  <div className={`w-12 shrink-0 self-center flex flex-col items-center justify-center text-center ml-1 sm:ml-2 ${isTaskCompleted ? 'opacity-50' : ''}`}>
                    <span className={`text-[13px] font-bold leading-tight ${
                      isTaskCompleted
                        ? 'text-t2-ink-3 '
                        : isTodayActive
                          ? 'text-t2-bg'
                          : 'text-t2-ink'
                    }`}>
                      Heute
                    </span>
                  </div>
                ) : (
                  <div className={`w-12 shrink-0 self-center flex flex-col items-center justify-center text-center ml-1 sm:ml-2 ${isTaskCompleted ? 'opacity-50' : ''}`}>
                    <span className={`text-[14px] font-bold leading-tight ${isTaskCompleted ? 'text-t2-ink-3 ' : 'text-t2-ink'}`}>
                      {format(parsedDate, 'd.')}
                    </span>
                    <span className={`text-[11px] uppercase tracking-widest ${isTaskCompleted ? 'text-t2-ink-3 ' : 'text-t2-ink'}`}>
                      {MONTHS_DE[parsedDate.getMonth()]}
                    </span>
                  </div>
                )
              ) : (
                <div className="w-12 shrink-0 self-center ml-1 sm:ml-2" />
              )}

              {/* Right Content Column */}
              <div className="flex-1 flex flex-col gap-1 min-w-0">
                {/* Title Line */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleTask(task);
                      }}
                      className={`w-5 h-5 rounded-full border-2 hidden [@media(hover:hover)_and_(pointer:fine)]:flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                        isTaskCompleted
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-t2-line  hover:border-emerald-500'
                      }`}
                      title={isTaskCompleted ? "Als unerledigt markieren" : "Als erledigt markieren"}
                    >
                      {isTaskCompleted && <Check size={12} strokeWidth={3} />}
                    </button>
                    <div className={`shrink-0 flex items-center justify-center ${isTaskCompleted ? 'opacity-50 grayscale' : ''}`}>
                      {isMobileT2 ? <MobilePriorityIcon priority={task.priority} /> : <TodoPriorityBadge priority={task.priority} />}
                    </div>
                    <span
                      className={`font-medium text-[15px] leading-tight truncate ${
                        isTaskCompleted
                          ? 'line-through text-t2-ink-3 '
                          : isTodayActive
                            ? 'text-t2-bg'
                            : 'text-t2-ink '
                      }`}
                    >
                      {task.title}
                    </span>
                    <VisibilityBadge kind={isSharedWithMe ? 'shared-with-me' : 'private'} size={12} />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isOverdue && isMobileT2 && <MobileOverdue />}
                    {isOverdue && !isMobileT2 && (
                      <span className="text-[11px] font-medium bg-t2-hover text-t2-ink-2 px-1.5 py-0.5 rounded whitespace-nowrap">
                        Überfällig
                      </span>
                    )}
                  </div>
                </div>

                {/* Sub-details Line */}
                {Boolean((task.tags && task.tags.length > 0) || (depth && depth > 0)) && (
                  <div className={`flex flex-wrap items-center gap-2 mt-0.5 ${isTaskCompleted ? 'opacity-60' : ''}`}>
                    {Boolean(depth && depth > 0) && (
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                        isTaskCompleted
                          ? 'bg-t2-hover  text-t2-ink-3 '
                          : 'bg-t2-sub  text-t2-accent '
                      }`}>
                        Teilaufgabe
                      </span>
                    )}
                    {resolveTags(task.tags).map((tag) => (
                      <span
                        key={tag.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setTodoTagFilter(toggleTagInFilter(tagFilter, tag.id));
                        }}
                        className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded font-medium cursor-pointer transition-opacity hover:opacity-80 ${
                          isTaskCompleted
                            ? 'bg-t2-hover  text-t2-ink-3  grayscale'
                            : TAG_CHIP_CLASS
                        }`}
                        title={`Nach #${tag.title} filtern`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: tag.color || DEFAULT_TAG_COLOR }} />
                        {tag.title}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              layoutId={`todo-card-${task.id}`}
              key={`expanded-${task.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                layout: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
                opacity: { duration: 0.15 },
              }}
              onClick={(e) => e.stopPropagation()}
              className={`flex flex-col relative ${expanded && (!depth || depth === 0) ? 'h-full flex-1 min-h-0' : ''} ${expanded ? 'mt-0 mb-0' : 'my-1.5'}`}
            >
              {/* Sticky Top: Main Info Card & Unteraufgaben Header */}
              <div className={`shrink-0 z-20 ${(!depth || depth < 1) ? 'sticky top-0' : ''} flex flex-col`}>
                {/* Main Info Card */}
                <div className={`p-4 sm:p-5 rounded-2xl border flex flex-col shrink-0 z-20 ${
                  isTodayActive
                    ? 'bg-[#27272a] text-white border border-[#27272a] dark:bg-white dark:text-black dark:border-white shadow-md'
                    : 'bg-t2-surface  text-t2-ink  border-t2-line  shadow-sm'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    {depth && depth > 0 ? (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-t2-sub  text-t2-accent ">
                        Teilaufgabe
                      </span>
                    ) : (
                      <span className={`text-[11px] font-semibold uppercase tracking-wider ${
                        isTodayActive ? 'text-white/60 ' : 'text-t2-ink-3 '
                      }`}>
                        {isParentMinimized ? 'Aufgabe minimiert' : 'Aufgabe bearbeiten'}
                      </span>
                    )}
                    {(!depth || depth < 1) ? (
                      <button
                        type="button"
                        onClick={() => setIsParentMinimized((p) => !p)}
                        className={`p-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs ${
                          isTodayActive
                            ? 'text-white/80 hover:text-white dark:text-black/80 dark:hover:text-black hover:bg-white/10 dark:hover:bg-black/10'
                            : 'text-t2-ink-3 hover:text-t2-ink-2  hover:bg-t2-hover '
                        }`}
                        title={isParentMinimized ? "Details anzeigen" : "Details minimieren"}
                      >
                        <span className={`text-[11px] font-medium ${
                          isTodayActive ? 'text-white/80 ' : 'text-t2-ink-2 '
                        }`}>
                          {isParentMinimized ? 'Details einblenden' : 'Minimieren'}
                        </span>
                        {isParentMinimized ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (isControlledExpanded === undefined) setLocalExpanded(false);
                        }}
                        className={`p-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs ${
                          isTodayActive
                            ? 'text-white/80 hover:text-white dark:text-black/80 dark:hover:text-black hover:bg-white/10 dark:hover:bg-black/10'
                            : 'text-t2-ink-3 hover:text-t2-ink-2  hover:bg-t2-hover '
                        }`}
                        title="Zuklappen"
                      >
                        <span className={`text-[11px] font-medium ${
                          isTodayActive ? 'text-white/80 ' : 'text-t2-ink-2 '
                        }`}>
                          Zuklappen
                        </span>
                        <ChevronUp size={14} />
                      </button>
                    )}
                  </div>

                  {/* Title row with Priority selector */}
                  <div className={`flex items-center justify-between gap-3 ${
                    isParentMinimized
                      ? ''
                      : isTodayActive
                        ? 'border-b border-white/20 dark:border-black/20 pb-2 mb-3'
                        : 'border-b border-t2-line  pb-2 mb-3'
                  }`}>
                    <input
                      value={draft.title}
                      onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (draft.title.trim()) {
                            if (saveEditing) {
                              saveEditing(task.id, draft);
                            } else {
                              updateTask(task.id, {
                                title: draft.title.trim(),
                                description: draft.description.trim() || undefined,
                                priority: draft.priority,
                                status: draft.status,
                                dueDate: draft.dueDate || undefined,
                                recurrence: draft.recurrence,
                                recurrence_end: draft.recurrenceEnd || undefined,
                                tags: draft.tags,
                                showInCalendar: draft.showInCalendar,
                              });
                            }
                          }
                          if (isControlledExpanded === undefined) setLocalExpanded(false);
                        } else if (e.key === 'Escape') {
                          cancelEditing?.();
                          if (isControlledExpanded === undefined) setLocalExpanded(false);
                        }
                      }}
                      placeholder="Titel der Aufgabe..."
                      className={`text-lg font-bold bg-transparent outline-none flex-1 min-w-0 ${
                        isTodayActive
                          ? 'text-t2-bg placeholder-white/40 dark:placeholder-black/40'
                          : 'text-t2-ink  placeholder-t2-ink-3 '
                      }`}
                    />
                    {!isParentMinimized && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setDraft((p) => ({ ...p, priority: 'low' }));
                            updateTask(task.id, { priority: 'low' });
                          }}
                          className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center ${
                            draft.priority === 'low'
                              ? `bg-emerald-500 text-white ring-2 ring-emerald-500 ring-offset-1 ${isTodayActive ? 'ring-offset-[#27272a] dark:ring-offset-white' : 'dark:ring-offset-[#1a1a1a]'} shadow-xs scale-105`
                              : isTodayActive
                                ? 'bg-white/10 dark:bg-black/10 text-emerald-300 dark:text-emerald-700 hover:opacity-100 opacity-70'
                                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:opacity-100 opacity-60'
                          }`}
                          title="Niedrige Priorität"
                        >
                          <ChevronDown size={14} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDraft((p) => ({ ...p, priority: 'medium' }));
                            updateTask(task.id, { priority: 'medium' });
                          }}
                          className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center ${
                            draft.priority === 'medium'
                              ? `bg-amber-500 text-white ring-2 ring-amber-500 ring-offset-1 ${isTodayActive ? 'ring-offset-[#27272a] dark:ring-offset-white' : 'dark:ring-offset-[#1a1a1a]'} shadow-xs scale-105`
                              : isTodayActive
                                ? 'bg-white/10 dark:bg-black/10 text-amber-300 dark:text-amber-700 hover:opacity-100 opacity-70'
                                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 hover:opacity-100 opacity-60'
                          }`}
                          title="Mittlere Priorität"
                        >
                          <Minus size={14} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDraft((p) => ({ ...p, priority: 'high' }));
                            updateTask(task.id, { priority: 'high' });
                          }}
                          className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center ${
                            draft.priority === 'high'
                              ? `bg-rose-500 text-white ring-2 ring-rose-500 ring-offset-1 ${isTodayActive ? 'ring-offset-[#27272a] dark:ring-offset-white' : 'dark:ring-offset-[#1a1a1a]'} shadow-xs scale-105`
                              : isTodayActive
                                ? 'bg-white/10 dark:bg-black/10 text-rose-300 dark:text-rose-700 hover:opacity-100 opacity-70'
                                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:opacity-100 opacity-60'
                          }`}
                          title="Hohe Priorität"
                        >
                          <ChevronUp size={14} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Properties Section */}
                  {!isParentMinimized && (
                    <div className="flex flex-col gap-3">
                      {/* Fälligkeit */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleQuickDate('now')}
                          className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                            isTodayActive
                              ? isDraftNow
                                ? 'bg-t2-surface text-black  dark:text-white shadow-xs'
                                : 'bg-white/15 text-white hover:bg-white/20 dark:bg-black/10 dark:text-black dark:hover:bg-black/15'
                              : isDraftNow
                                ? 'bg-t2-ink text-white  dark:text-gray-900 shadow-xs'
                                : 'bg-t2-hover hover:bg-t2-stage   text-t2-ink '
                          }`}
                        >
                          Jetzt
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickDate('today')}
                          className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                            isTodayActive
                              ? isDraftToday
                                ? 'bg-t2-surface text-black  dark:text-white shadow-xs'
                                : 'bg-white/15 text-white hover:bg-white/20 dark:bg-black/10 dark:text-black dark:hover:bg-black/15'
                              : isDraftToday
                                ? 'bg-t2-ink text-white  dark:text-gray-900 shadow-xs'
                                : 'bg-t2-hover hover:bg-t2-stage   text-t2-ink '
                          }`}
                        >
                          Heute
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickDate('tomorrow')}
                          className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                            isTodayActive
                              ? isDraftTomorrow
                                ? 'bg-t2-surface text-black  dark:text-white shadow-xs'
                                : 'bg-white/15 text-white hover:bg-white/20 dark:bg-black/10 dark:text-black dark:hover:bg-black/15'
                              : isDraftTomorrow
                                ? 'bg-t2-ink text-white  dark:text-gray-900 shadow-xs'
                                : 'bg-t2-hover hover:bg-t2-stage   text-t2-ink '
                          }`}
                        >
                          Morgen
                        </button>
                        <div className="relative inline-flex items-center">
                          <input
                            type="date"
                            value={draft.dueDate ? draft.dueDate.slice(0, 10) : ''}
                            max={((depth || 0) > 0 && effectiveParentDueDate) ? effectiveParentDueDate : undefined}
                            onChange={(e) => {
                              let nextVal = e.target.value;
                              if ((depth || 0) > 0 && effectiveParentDueDate && nextVal > effectiveParentDueDate) {
                                nextVal = effectiveParentDueDate;
                              }
                              if (nextVal && draft.dueDate && draft.dueDate.includes('T')) {
                                const timePart = draft.dueDate.split('T')[1].slice(0, 5);
                                nextVal = `${nextVal}T${timePart}`;
                              }
                              setDraft((p) => ({ ...p, dueDate: nextVal }));
                              updateTask(task.id, { dueDate: nextVal || undefined, scheduledDate: nextVal || undefined });
                            }}
                            className={`px-2 py-1 text-xs font-medium rounded-lg border focus:border-t2-accent focus:outline-none cursor-pointer ${
                              isTodayActive
                                ? 'bg-white/15 dark:bg-black/10 text-t2-bg border-transparent [color-scheme:dark] dark:[color-scheme:light]'
                                : 'bg-t2-hover  text-t2-ink  border-transparent'
                            }`}
                            aria-label="Fälligkeitsdatum auswählen"
                          />
                          {draft.dueDate && (
                            <button
                              type="button"
                              onClick={() => handleQuickDate('none')}
                              className={`ml-1 p-0.5 cursor-pointer ${
                                isTodayActive
                                  ? 'text-white/60 hover:text-white dark:text-black/60 dark:hover:text-black'
                                  : 'text-t2-ink-3 hover:text-t2-ink-2 '
                              }`}
                              title="Datum entfernen"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                        <div className="relative inline-flex items-center">
                          <input
                            type="time"
                            value={draft.dueDate && draft.dueDate.includes('T') ? draft.dueDate.split('T')[1].slice(0, 5) : ''}
                            onChange={(e) => {
                              const timeVal = e.target.value;
                              if (timeVal) {
                                let datePart = draft.dueDate ? draft.dueDate.slice(0, 10) : format(new Date(), 'yyyy-MM-dd');
                                if ((depth || 0) > 0 && effectiveParentDueDate && datePart > effectiveParentDueDate) {
                                  datePart = effectiveParentDueDate;
                                }
                                const targetStr = `${datePart}T${timeVal}`;
                                setDraft((p) => ({ ...p, dueDate: targetStr }));
                                updateTask(task.id, { dueDate: targetStr, scheduledDate: targetStr });
                              } else if (draft.dueDate && draft.dueDate.includes('T')) {
                                const datePart = draft.dueDate.slice(0, 10);
                                setDraft((p) => ({ ...p, dueDate: datePart }));
                                updateTask(task.id, { dueDate: datePart, scheduledDate: datePart });
                              }
                            }}
                            className={`px-2 py-1 text-xs font-medium rounded-lg border focus:border-t2-accent focus:outline-none cursor-pointer ${
                              isTodayActive
                                ? 'bg-white/15 dark:bg-black/10 text-t2-bg border-transparent [color-scheme:dark] dark:[color-scheme:light]'
                                : 'bg-t2-hover  text-t2-ink  border-transparent'
                            }`}
                            aria-label="Fälligkeitszeit auswählen"
                          />
                          {draft.dueDate && draft.dueDate.includes('T') && (
                            <button
                              type="button"
                              onClick={() => {
                                const datePart = draft.dueDate.slice(0, 10);
                                setDraft((p) => ({ ...p, dueDate: datePart }));
                                updateTask(task.id, { dueDate: datePart, scheduledDate: datePart });
                              }}
                              className={`ml-1 p-0.5 cursor-pointer ${
                                isTodayActive
                                  ? 'text-white/60 hover:text-white dark:text-black/60 dark:hover:text-black'
                                  : 'text-t2-ink-3 hover:text-t2-ink-2 '
                              }`}
                              title="Uhrzeit entfernen"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Wiederholung */}
                      {(!depth || depth < 1) && (
                        <div className="grid grid-cols-1 gap-2">
                          <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 min-w-0 ${
                            isTodayActive ? 'bg-white/15 ' : 'bg-t2-hover '
                          }`}>
                            <Repeat size={14} className={isTodayActive ? 'text-white/60  shrink-0' : 'text-t2-ink-3 shrink-0'} />
                            <select
                              value={draft.recurrence}
                              onChange={(e) => {
                                const nextRecurrence = e.target.value as RecurrenceType;
                                setDraft((p) => ({ ...p, recurrence: nextRecurrence }));
                                updateTask(task.id, { recurrence: nextRecurrence });
                              }}
                              className={`bg-transparent text-xs font-medium border-none focus:outline-none cursor-pointer w-full truncate pr-1 ${
                                isTodayActive ? 'text-t2-bg' : 'text-t2-ink '
                              }`}
                            >
                              {RECURRENCE_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value} className="bg-t2-surface  text-t2-ink ">{o.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}

                      {/* Tags section - full width with comfortable padding */}
                      <div className={`w-full flex flex-wrap items-center gap-2 p-2.5 rounded-xl border ${
                        isTodayActive
                          ? 'bg-white/10 dark:bg-black/5 border-white/10 dark:border-black/10'
                          : 'bg-t2-sub  border-t2-line-soft '
                      }`}>
                        {resolveTags(draft.tags).map((tag) => (
                          <span
                            key={tag.id}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${TAG_CHIP_CLASS}`}
                          >
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color || DEFAULT_TAG_COLOR }} />
                            <span>{tag.title}</span>
                            <button
                              type="button"
                              onClick={() => {
                                const nextTags = draft.tags.filter((t) => t !== tag.id);
                                setDraft((p) => ({ ...p, tags: nextTags }));
                                updateTask(task.id, { tags: nextTags });
                              }}
                              className="hover:opacity-75 p-0.5 cursor-pointer"
                              title={`Tag "${tag.title}" entfernen`}
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                        <div className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs border ${
                          isTodayActive
                            ? 'bg-white/15 dark:bg-black/10 border-white/20 dark:border-black/10'
                            : 'bg-t2-surface  border-t2-line '
                        }`}>
                          <Tag size={13} className={isTodayActive ? 'text-white/60 ' : 'text-t2-ink-3'} />
                          <input
                            type="text"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const t = tagInput.trim().replace(/^#/, '');
                                if (t) void handleAddTag(t);
                              }
                            }}
                            placeholder="Tag hinzufügen..."
                            className={`w-28 bg-transparent text-xs focus:outline-none ${
                              isTodayActive
                                ? 'text-t2-bg placeholder-white/50 dark:placeholder-black/50'
                                : 'text-t2-ink  placeholder-t2-ink-3'
                            }`}
                          />
                          {tagInput.trim() && (
                            <button
                              type="button"
                              onClick={() => {
                                const t = tagInput.trim().replace(/^#/, '');
                                if (t) void handleAddTag(t);
                              }}
                              className={`p-0.5 cursor-pointer ${
                                isTodayActive
                                  ? 'text-t2-bg hover:opacity-80'
                                  : 'text-t2-accent  hover:text-t2-accent'
                              }`}
                              title="Tag hinzufügen"
                            >
                              <Plus size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Notes/Description textarea */}
                      <textarea
                        value={draft.description}
                        onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
                        onBlur={() => {
                          updateTask(task.id, { description: draft.description.trim() || undefined });
                        }}
                        placeholder="Optionale Notiz..."
                        rows={1}
                        className={`w-full text-xs sm:text-sm rounded-lg p-2.5 border outline-none resize-none transition-colors ${
                          isTodayActive
                            ? 'bg-white/10 dark:bg-black/5 border-white/10 dark:border-black/10 text-t2-bg placeholder-white/40 dark:placeholder-black/40 focus:border-white/30 dark:focus:border-black/30'
                            : 'bg-t2-sub  border-t2-line-soft  text-t2-ink  placeholder-t2-ink-3  focus:border-t2-line '
                        }`}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 mt-3 pt-2 border-t border-t2-line-soft ">
                    <button
                      type="button"
                      onClick={() => {
                        if (saveEditing) {
                          saveEditing(task.id, draft);
                        } else {
                          updateTask(task.id, {
                            title: draft.title.trim(),
                            description: draft.description.trim() || undefined,
                            scheduledDate: draft.dueDate || undefined,
                            dueDate: draft.dueDate || undefined,
                            priority: draft.priority,
                            tags: draft.tags,
                            recurrence: draft.recurrence,
                            recurrence_end: draft.recurrenceEnd || undefined,
                            status: draft.status,
                            showInCalendar: draft.showInCalendar,
                          });
                        }
                        if (isControlledExpanded === undefined) setLocalExpanded(false);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg bg-[#18181b] hover:bg-[#09090b] text-white dark:bg-white dark:text-[#09090b] dark:hover:bg-gray-100 transition-colors cursor-pointer"
                      title="Fertig"
                    >
                      <Check size={13} strokeWidth={2.5} />
                      <span>Fertig</span>
                    </button>
                  </div>
                </div>

                {/* Raw Unteraufgaben Header */}
                {(!depth || depth < 1) && (
                  <div className="shrink-0 z-20">
                    <button
                      type="button"
                      onClick={() => setSubtasksCollapsed((prev) => !prev)}
                      className="w-full flex items-center justify-between px-1 pt-2 cursor-pointer group select-none text-left"
                    >
                      <span className="text-xs font-bold uppercase tracking-wider text-t2-ink-3  group-hover:text-t2-ink-2  transition-colors">
                        Unteraufgaben ({completedCount}/{totalCount})
                      </span>
                      <ChevronDown
                        className={cn(
                          "w-4 h-4 text-t2-ink-3  transition-transform duration-200",
                          subtasksCollapsed && "-rotate-90"
                        )}
                      />
                    </button>
                    <div className="w-full h-2 bg-t2-stage  rounded-full overflow-hidden mt-1.5 mb-2">
                      <div
                        className="h-full bg-t2-accent rounded-full transition-all duration-300"
                        style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
                      />
                    </div>

                    {showSubtaskInput && (
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <input
                          ref={subtaskInputRef}
                          type="text"
                          value={newSubtaskTitle}
                          onChange={(e) => setNewSubtaskTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void handleAddSubtask();
                            } else if (e.key === 'Escape') {
                              setShowSubtaskInput(false);
                            }
                          }}
                          placeholder="Neue Unteraufgabe hinzufügen..."
                          className="flex-1 px-3 py-1.5 text-xs bg-t2-hover  rounded-lg text-t2-ink  placeholder-t2-ink-3 focus:outline-none border border-transparent focus:border-t2-accent"
                        />
                        <button
                          type="button"
                          onClick={() => void handleAddSubtask()}
                          disabled={!newSubtaskTitle.trim()}
                          className="p-1.5 bg-[#18181b] dark:bg-white text-white dark:text-[#09090b] rounded-lg hover:bg-[#09090b] dark:hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                          title="Unteraufgabe hinzufügen"
                        >
                          <Plus size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowSubtaskInput(false)}
                          className="p-1.5 text-t2-ink-3 hover:text-t2-ink-2  cursor-pointer"
                          title="Schließen"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Subtasks list - ONLY scrollable element */}
              {(!depth || depth < 1) && !subtasksCollapsed && (
                <div
                  className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1 pb-6 sm:pb-8"
                >
                  {task.children && task.children.length > 0 ? (
                    task.children.map((child) => (
                      <TodoTreeItem
                        key={child.id}
                        task={child as TaskWithChildren}
                        depth={(depth || 0) + 1}
                        parentDueDate={draft.dueDate || task.dueDate || task.scheduledDate || undefined}
                        handleCreateTag={handleCreateTag}
                        handleToggleTask={handleToggleTask}
                        handleToggleInProgress={handleToggleInProgress}
                        saveEditing={(id, d) => {
                          if (d) {
                            updateTask(id, {
                              title: d.title,
                              description: d.description,
                              priority: d.priority,
                              status: d.status,
                              dueDate: d.dueDate || undefined,
                              scheduledDate: d.dueDate || undefined,
                              recurrence: d.recurrence,
                              recurrence_end: d.recurrenceEnd || undefined,
                              tags: d.tags,
                              showInCalendar: d.showInCalendar,
                            });
                          }
                        }}
                        deleteTask={deleteTask}
                        disableClickDebounce={disableClickDebounce}
                      />
                    ))
                  ) : (
                    <div className="text-xs text-t2-ink-3 italic py-2 px-1">Keine Unteraufgaben vorhanden</div>
                  )}
                </div>
              )}

              {/* Action Bar: Centered at Bottom on PC & iPad, No Duplicate on Mobile or Subtasks */}
              {(!depth || depth < 1) && (
                <div className="hidden md:flex fixed bottom-6 left-1/2 -translate-x-1/2 z-50 items-center gap-2 px-3 py-2 rounded-2xl bg-t2-surface  backdrop-blur-md border border-t2-line  shadow-xl">
                  <button
                    type="button"
                    onClick={() => {
                      if (cancelEditing) cancelEditing();
                      if (isControlledExpanded === undefined) setLocalExpanded(false);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-t2-hover hover:bg-t2-stage   text-t2-ink  transition-colors cursor-pointer"
                    title="Abbrechen"
                  >
                    <ArrowLeft size={14} />
                    <span>Abbrechen</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowSubtaskInput(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-t2-hover hover:bg-t2-stage   text-t2-ink  transition-colors cursor-pointer"
                    title="Teilaufgabe hinzufügen"
                  >
                    <Plus size={14} />
                    <span>Teilaufgabe</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (cancelEditing) cancelEditing();
                      if (isControlledExpanded === undefined) setLocalExpanded(false);
                      void deleteTask(task.id);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl text-t2-ink-2 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                    title="Aufgabe löschen"
                  >
                    <Trash2 size={14} />
                    <span>Löschen</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (saveEditing) {
                        saveEditing(task.id, draft);
                      } else {
                        updateTask(task.id, {
                          title: draft.title.trim(),
                          description: draft.description.trim() || undefined,
                          scheduledDate: draft.dueDate || undefined,
                          dueDate: draft.dueDate || undefined,
                          priority: draft.priority,
                          tags: draft.tags,
                          recurrence: draft.recurrence,
                          recurrence_end: draft.recurrenceEnd || undefined,
                          status: draft.status,
                          showInCalendar: draft.showInCalendar,
                        });
                      }
                      if (isControlledExpanded === undefined) setLocalExpanded(false);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-xl bg-[#18181b] hover:bg-[#09090b] text-white dark:bg-white dark:text-[#09090b] dark:hover:bg-gray-100 transition-colors cursor-pointer shadow-xs"
                    title="Speichern"
                  >
                    <Check size={14} strokeWidth={2.5} />
                    <span>Fertig</span>
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <TodoSplitModal isOpen={isSplitModalOpen} onClose={() => setIsSplitModalOpen(false)} parentTask={task} />
    </div>
  );
});

export default TodoTreeItem;
