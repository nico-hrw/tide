'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trash2, Plus,
  X, Folder, Tag, Repeat, Check,
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import { useDataStore, TaskItem } from '@/store/useDataStore';
import TodoSplitModal from './TodoSplitModal';
import { TodoPriorityBadge } from './TodoPriorityBadge';
import {
  RecurrenceType, TaskWithChildren, TaskEditDraft,
  RECURRENCE_OPTIONS, getTaskPriority, getDeadlineInfo, parseDateSafe,
} from './types';

export interface TodoTreeItemProps {
  task: TaskWithChildren; depth?: number; isExpanded?: boolean; editingTaskId?: string | null;
  isCompleting?: boolean; completingTaskIds?: Set<string>;
  editDraft?: TaskEditDraft; setEditDraft?: React.Dispatch<React.SetStateAction<TaskEditDraft>>;
  editNewTagInput?: string; setEditNewTagInput?: React.Dispatch<React.SetStateAction<string>>;
  allTags?: string[]; customTags?: string[]; allFolders?: string[];
  selectedTag?: string | null; setSelectedTag?: (tag: string | null) => void;
  selectedFolder?: string | null; setSelectedFolder?: (folder: string | null) => void;
  setViewMode?: (mode: 'tasks' | 'folders') => void;
  handleAddCustomTag?: (tag: string) => void; handleRemoveCustomTag?: (tag: string) => void;
  handleToggleTask: (task: TaskItem) => void; handleToggleInProgress: (task: TaskItem) => void;
  saveEditing?: (id: string, draft?: TaskEditDraft) => void; cancelEditing?: () => void;
  deleteTask: (id: string) => Promise<void> | void;
  onRowClick?: (task: TaskItem) => void; onSelectTask?: (task: TaskItem) => void;
  disableClickDebounce?: boolean; onFocusGroup?: (task: TaskWithChildren) => void;
}

const MONTHS_DE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

const KNOWN_TAG_COLORS: Record<string, string> = {
  pflegen: 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  erledigen: 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
  vorbereiten: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300',
  aufräumen: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
  lernen: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  routine: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
  arbeit: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
  kleidung: 'bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300',
  pflanzen: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
};

const COLOR_PALETTE = [
  'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
  'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
  'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
  'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
];

function getTagColorClass(tag: string): string {
  const lower = tag.toLowerCase().trim();
  if (KNOWN_TAG_COLORS[lower]) {
    return KNOWN_TAG_COLORS[lower];
  }
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash << 5) - hash + tag.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % COLOR_PALETTE.length;
  return COLOR_PALETTE[idx];
}



export const TodoTreeItem: React.FC<TodoTreeItemProps> = ({
  task, depth = 0, isExpanded, editingTaskId, isCompleting = false, completingTaskIds,
  editDraft, setEditDraft, editNewTagInput, setEditNewTagInput,
  allTags = [], customTags = [], allFolders = [],
  selectedTag = null, setSelectedTag, selectedFolder = null, setSelectedFolder, setViewMode,
  handleAddCustomTag, handleRemoveCustomTag, handleToggleTask, handleToggleInProgress,
  saveEditing, cancelEditing, deleteTask, onRowClick, onSelectTask, disableClickDebounce = false,
  onFocusGroup,
}) => {
  const addTask = useDataStore((s) => s.addTask);
  const updateTask = useDataStore((s) => s.updateTask);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [showSubtaskInput, setShowSubtaskInput] = useState(false);
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
    recurrenceEnd: task.recurrence_end || '', folder: task.folder || '', tags: task.tags ? [...task.tags] : [],
    showInCalendar: task.showInCalendar !== false,
  }));
  const draft = editDraft || localDraft;
  const setDraft = setEditDraft || setLocalDraft;

  const [prevTask, setPrevTask] = useState(task);
  if (!editDraft && !expanded && prevTask !== task) {
    setPrevTask(task);
    setLocalDraft({
      title: task.title, description: task.description || '', priority: getTaskPriority(task),
      status: task.isCompleted ? 'completed' : (task.status || 'todo'),
      dueDate: task.dueDate || task.scheduledDate || '', recurrence: task.recurrence || 'none',
      recurrenceEnd: task.recurrence_end || '', folder: task.folder || '', tags: task.tags ? [...task.tags] : [],
      showInCalendar: task.showInCalendar !== false,
    });
  }

  const [localTagInput, setLocalTagInput] = useState('');
  const tagInput = editNewTagInput !== undefined ? editNewTagInput : localTagInput;
  const setTagInput = setEditNewTagInput || setLocalTagInput;

  const deadline = getDeadlineInfo(task.dueDate || task.scheduledDate);
  const parsedDate = parseDateSafe(task.dueDate || task.scheduledDate);
  const isTaskCompleted = task.isCompleted || isCompleting;
  const isOverdue = deadline?.status === 'overdue' && !isTaskCompleted;
  const isTodayDate = deadline?.status === 'today';
  const isTodayActive = isTodayDate && !isTaskCompleted;

  const handleTouchStart = (e: React.TouchEvent) => {
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

  const handleAddTag = (tag: string) => {
    handleAddCustomTag?.(tag);
    if (!draft.tags.includes(tag)) setDraft((p) => ({ ...p, tags: [...p.tags, tag] }));
    setTagInput('');
  };

  const handleQuickDate = (option: 'today' | 'tomorrow' | 'none') => {
    if (option === 'none') {
      setDraft((p) => ({ ...p, dueDate: '' }));
      return;
    }
    const target = option === 'today' ? new Date() : addDays(new Date(), 1);
    setDraft((p) => ({ ...p, dueDate: format(target, 'yyyy-MM-dd') }));
  };

  const handleAddSubtask = async () => {
    const trimmed = newSubtaskTitle.trim();
    if (!trimmed) return;
    await addTask({
      title: trimmed,
      parentId: task.id,
      folder: task.folder,
      tags: task.tags ? [...task.tags] : [],
      priority: 'low',
      isCompleted: false,
      status: 'todo',
      order: task.children?.length || 0,
    });
    setNewSubtaskTitle('');
  };

  const draftDate = parseDateSafe(draft.dueDate);
  const isDraftToday = draftDate ? deadline?.status === 'today' || format(draftDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') : false;
  const isDraftTomorrow = draftDate ? format(draftDate, 'yyyy-MM-dd') === format(addDays(new Date(), 1), 'yyyy-MM-dd') : false;

  const indentPx = Math.max(0, Math.min((depth - 1) * 16, 48));

  return (
    <div className={`flex flex-col w-full ${expanded ? 'h-full flex-1 min-h-0' : ''}`} style={{ paddingLeft: indentPx > 0 ? `${indentPx}px` : undefined }}>
      <div className={`relative ${expanded ? 'h-full flex-1 min-h-0 flex flex-col' : 'overflow-hidden rounded-xl sm:rounded-2xl'}`}>
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
        <AnimatePresence mode="wait" initial={false}>
          {!expanded ? (
            <div
              key={`collapsed-${task.id}`}
              style={{
                transform: `translateX(${swipeOffset}px)`,
                transition: isSwiping ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
                touchAction: 'pan-y',
              }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onClick={handleClick}
              className={`flex items-start gap-3 sm:gap-4 p-3.5 sm:p-4 my-0.5 sm:my-1 backdrop-blur-xs rounded-xl sm:rounded-2xl relative pr-3 sm:pr-4 cursor-pointer group transition-all ${
                isTodayActive
                  ? 'bg-black text-white border border-black shadow-md dark:bg-white dark:text-black dark:border-white dark:shadow-md'
                  : 'bg-white/90 dark:bg-[#181818]/90 text-gray-900 dark:text-gray-100 border border-gray-200/80 dark:border-white/[0.08] hover:border-gray-300 dark:hover:border-white/20 shadow-[0_1px_3px_rgba(0,0,0,0.03)] dark:shadow-none'
              }`}
            >
              {/* Left Date Column */}
              {parsedDate ? (
                isOverdue ? (
                  <div className="w-12 shrink-0 self-center flex flex-col items-center justify-center text-center ml-1 sm:ml-2">
                    <span className="text-[14px] font-bold text-red-500 leading-tight">
                      {format(parsedDate, 'd.')}
                    </span>
                    <span className="text-[10px] font-semibold text-red-400 uppercase tracking-widest">
                      {MONTHS_DE[parsedDate.getMonth()].toUpperCase()}
                    </span>
                  </div>
                ) : isTodayDate ? (
                  <div className="w-12 shrink-0 self-center flex flex-col items-center justify-center text-center ml-1 sm:ml-2">
                    <span className={`text-[13px] font-bold leading-tight ${isTaskCompleted ? 'text-gray-400 dark:text-gray-500' : 'text-white dark:text-black'}`}>
                      Heute
                    </span>
                  </div>
                ) : (
                  <div className="w-12 shrink-0 self-center flex flex-col items-center justify-center text-center ml-1 sm:ml-2">
                    <span className={`text-[14px] font-bold leading-tight ${isTaskCompleted ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
                      {format(parsedDate, 'd.')}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest">
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
                    <div className="shrink-0 flex items-center justify-center">
                      <TodoPriorityBadge priority={task.priority} />
                    </div>
                    <span
                      className={`font-medium text-[15px] leading-tight truncate ${
                        isTaskCompleted
                          ? 'line-through text-gray-400 dark:text-gray-500'
                          : isTodayActive
                            ? 'text-white dark:text-black'
                            : 'text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      {task.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isOverdue && (
                      <span className="text-[11px] font-medium bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded whitespace-nowrap">
                        Überfällig
                      </span>
                    )}
                  </div>
                </div>

                {/* Sub-details Line */}
                {((task.tags && task.tags.length > 0) || task.folder || (depth && depth > 0)) && (
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    {depth && depth > 0 ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                        Teilaufgabe
                      </span>
                    ) : task.folder ? (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFolder?.(selectedFolder === task.folder ? null : (task.folder || null));
                          setViewMode?.('tasks');
                        }}
                        className={`text-[12px] font-medium cursor-pointer hover:underline ${
                          isTodayActive ? 'text-gray-300 dark:text-gray-700' : 'text-gray-500 dark:text-gray-400'
                        }`}
                        title={`Nach Ordner "${task.folder}" filtern`}
                      >
                        {task.folder}
                      </span>
                    ) : null}

                    {task.tags?.map((tag) => (
                      <span
                        key={tag}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTag?.(selectedTag === tag ? null : tag);
                          setViewMode?.('tasks');
                        }}
                        className={`text-[11px] px-1.5 py-0.5 rounded font-medium cursor-pointer transition-opacity hover:opacity-80 ${getTagColorClass(tag)}`}
                        title={`Nach #${tag} filtern`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <motion.div
              key={`expanded-${task.id}`}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              onClick={(e) => e.stopPropagation()}
              className="my-1.5 flex flex-col relative h-full flex-1 min-h-0"
            >
              {/* Sticky Top: Main Info Card & Unteraufgaben Header */}
              <div className="shrink-0 z-20 sticky top-0 flex flex-col">
                {/* Main Info Card */}
                <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 shadow-sm flex flex-col shrink-0 z-20">
                  {depth && depth > 0 ? (
                    <div className="mb-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                        Teilaufgabe
                      </span>
                    </div>
                  ) : null}

                  {/* Title row with Priority selector */}
                  <div className="flex items-center justify-between gap-3 border-b border-gray-200 dark:border-white/10 pb-2 mb-3">
                    <input
                      value={draft.title}
                      onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (draft.title.trim()) saveEditing?.(task.id, draft);
                          if (isControlledExpanded === undefined) setLocalExpanded(false);
                        } else if (e.key === 'Escape') {
                          cancelEditing?.();
                          if (isControlledExpanded === undefined) setLocalExpanded(false);
                        }
                      }}
                      placeholder="Titel der Aufgabe..."
                      className="text-lg font-bold text-gray-900 dark:text-white bg-transparent outline-none flex-1 min-w-0"
                    />
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setDraft((p) => ({ ...p, priority: 'low' }))}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded transition-all cursor-pointer ${
                          draft.priority === 'low'
                            ? 'bg-emerald-500 text-white ring-2 ring-emerald-500 ring-offset-1 dark:ring-offset-[#1a1a1a] shadow-xs scale-105'
                            : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:opacity-100 opacity-60'
                        }`}
                        title="Niedrige Priorität"
                      >
                        ∨
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraft((p) => ({ ...p, priority: 'medium' }))}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded transition-all cursor-pointer ${
                          draft.priority === 'medium'
                            ? 'bg-amber-500 text-white ring-2 ring-amber-500 ring-offset-1 dark:ring-offset-[#1a1a1a] shadow-xs scale-105'
                            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 hover:opacity-100 opacity-60'
                        }`}
                        title="Mittlere Priorität"
                      >
                        2
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraft((p) => ({ ...p, priority: 'high' }))}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded transition-all cursor-pointer ${
                          draft.priority === 'high'
                            ? 'bg-rose-500 text-white ring-2 ring-rose-500 ring-offset-1 dark:ring-offset-[#1a1a1a] shadow-xs scale-105'
                            : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:opacity-100 opacity-60'
                        }`}
                        title="Hohe Priorität"
                      >
                        ∧
                      </button>
                    </div>
                  </div>

                  {/* Properties Section */}
                  <div className="flex flex-col gap-3">
                    {/* Fälligkeit */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleQuickDate('today')}
                        className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                          isDraftToday
                            ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-xs'
                            : 'bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/15 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        Heute
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickDate('tomorrow')}
                        className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                          isDraftTomorrow
                            ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-xs'
                            : 'bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/15 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        Morgen
                      </button>
                      <div className="relative inline-flex items-center">
                        <input
                          type="date"
                          value={draft.dueDate ? draft.dueDate.slice(0, 10) : ''}
                          onChange={(e) => setDraft((p) => ({ ...p, dueDate: e.target.value }))}
                          className="px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-white/10 text-gray-800 dark:text-gray-200 rounded-lg border border-transparent focus:border-blue-500 focus:outline-none cursor-pointer"
                          aria-label="Fälligkeitsdatum auswählen"
                        />
                        {draft.dueDate && (
                          <button
                            type="button"
                            onClick={() => handleQuickDate('none')}
                            className="ml-1 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                            title="Datum entfernen"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Ordner & Wiederholung (2-column grid) */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-white/10 rounded-lg px-2.5 py-1.5 min-w-0">
                        <Folder size={14} className="text-gray-400 shrink-0" />
                        <select
                          value={draft.folder}
                          onChange={(e) => setDraft((p) => ({ ...p, folder: e.target.value }))}
                          className="bg-transparent text-xs font-medium text-gray-800 dark:text-gray-200 border-none focus:outline-none cursor-pointer w-full truncate pr-1"
                        >
                          <option value="" className="bg-white dark:bg-[#1a1a1a]">Kein Ordner</option>
                          {allFolders.map((f) => (
                            <option key={f} value={f} className="bg-white dark:bg-[#1a1a1a]">{f}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-white/10 rounded-lg px-2.5 py-1.5 min-w-0">
                        <Repeat size={14} className="text-gray-400 shrink-0" />
                        <select
                          value={draft.recurrence}
                          onChange={(e) => setDraft((p) => ({ ...p, recurrence: e.target.value as RecurrenceType }))}
                          className="bg-transparent text-xs font-medium text-gray-800 dark:text-gray-200 border-none focus:outline-none cursor-pointer w-full truncate pr-1"
                        >
                          {RECURRENCE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value} className="bg-white dark:bg-[#1a1a1a]">{o.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Tags section - full width with comfortable padding */}
                    <div className="w-full flex flex-wrap items-center gap-2 p-2.5 bg-gray-50 dark:bg-white/[0.04] rounded-xl border border-gray-100 dark:border-white/5">
                      {draft.tags.map((tag) => (
                        <span
                          key={tag}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${getTagColorClass(tag)}`}
                        >
                          <span>{tag}</span>
                          <button
                            type="button"
                            onClick={() => setDraft((p) => ({ ...p, tags: p.tags.filter((t) => t !== tag) }))}
                            className="hover:opacity-75 p-0.5 cursor-pointer"
                            title={`Tag "${tag}" entfernen`}
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                      <div className="inline-flex items-center gap-1.5 bg-white dark:bg-white/10 rounded-lg px-2.5 py-1 text-xs border border-gray-200/60 dark:border-white/10">
                        <Tag size={13} className="text-gray-400" />
                        <input
                          type="text"
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const t = tagInput.trim().replace(/^#/, '');
                              if (t) handleAddTag(t);
                            }
                          }}
                          placeholder="Tag hinzufügen..."
                          className="w-28 bg-transparent text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
                        />
                        {tagInput.trim() && (
                          <button
                            type="button"
                            onClick={() => {
                              const t = tagInput.trim().replace(/^#/, '');
                              if (t) handleAddTag(t);
                            }}
                            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 p-0.5 cursor-pointer"
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
                      placeholder="Optionale Notiz..."
                      rows={1}
                      className="w-full text-xs sm:text-sm bg-gray-50 dark:bg-white/[0.03] rounded-lg p-2.5 border border-gray-100 dark:border-white/5 text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-600 outline-none resize-none focus:border-gray-300 dark:focus:border-white/20 transition-colors"
                    />
                  </div>
                </div>

                {/* Raw Unteraufgaben Header */}
                {(!depth || depth < 1) && (
                  <div className="shrink-0 z-20">
                    <div className="flex items-center justify-between px-1 pt-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                        Unteraufgaben ({completedCount}/{totalCount})
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowSubtaskInput((prev) => !prev)}
                        className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Plus size={12} />
                        <span>Hinzufügen</span>
                      </button>
                    </div>
                    <div className="w-full h-2 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden mt-1.5 mb-2">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
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
                          className="flex-1 px-3 py-1.5 text-xs bg-gray-100 dark:bg-white/10 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none border border-transparent focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => void handleAddSubtask()}
                          disabled={!newSubtaskTitle.trim()}
                          className="p-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-black dark:hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                          title="Unteraufgabe hinzufügen"
                        >
                          <Plus size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowSubtaskInput(false)}
                          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
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
              {(!depth || depth < 1) && (
                <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1 pb-24">
                  {task.children && task.children.length > 0 ? (
                    task.children.map((child) => (
                      <TodoTreeItem
                        key={child.id}
                        task={child as TaskWithChildren}
                        depth={1}
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
                        saveEditing={(id, d) => {
                          if (d) {
                            updateTask(id, {
                              title: d.title,
                              description: d.description,
                              priority: d.priority,
                              status: d.status,
                              dueDate: d.dueDate || undefined,
                              recurrence: d.recurrence,
                              recurrence_end: d.recurrenceEnd || undefined,
                              folder: d.folder || undefined,
                              tags: d.tags,
                              showInCalendar: d.showInCalendar,
                            });
                          }
                          if (saveEditing) {
                            saveEditing(id, d);
                          }
                        }}
                        deleteTask={deleteTask}
                        disableClickDebounce={disableClickDebounce}
                      />
                    ))
                  ) : (
                    <div className="text-xs text-gray-400 italic py-2 px-1">Keine Unteraufgaben vorhanden</div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <TodoSplitModal isOpen={isSplitModalOpen} onClose={() => setIsSplitModalOpen(false)} parentTask={task} />
    </div>
  );
};

export default TodoTreeItem;
