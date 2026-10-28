'use client';

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, Circle, Trash2, Plus,
  X, ChevronDown, GitFork, Maximize2, Timer,
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import { TaskItem } from '@/store/useDataStore';
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
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isChildrenCollapsed, setIsChildrenCollapsed] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const isSwipingRef = useRef(false);
  const isVerticalScrollRef = useRef(false);
  const justSwipedRef = useRef(false);

  const isControlledExpanded = isExpanded !== undefined ? isExpanded : editingTaskId !== undefined ? editingTaskId === task.id : undefined;
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = isControlledExpanded !== undefined ? isControlledExpanded : localExpanded;

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

  const draftDate = parseDateSafe(draft.dueDate);
  const isDraftToday = draftDate ? deadline?.status === 'today' || format(draftDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') : false;
  const isDraftTomorrow = draftDate ? format(draftDate, 'yyyy-MM-dd') === format(addDays(new Date(), 1), 'yyyy-MM-dd') : false;

  const indentPx = Math.min(depth * 20, 80);

  return (
    <div className="flex flex-col w-full" style={{ paddingLeft: depth > 0 ? `${indentPx}px` : undefined }}>
      <div className="relative overflow-hidden rounded-lg">
        {/* Swipe action background indicators */}
        <div className={`absolute inset-0 flex items-center justify-between px-5 rounded-lg pointer-events-none transition-colors ${swipeOffset > 0 ? 'bg-emerald-500 text-white' : swipeOffset < 0 ? 'bg-rose-500 text-white' : 'bg-transparent'}`}>
          <div className={`flex items-center gap-2 font-bold text-xs transition-opacity duration-150 ${swipeOffset > 30 ? 'opacity-100' : 'opacity-0'}`}>
            <CheckCircle2 size={20} /><span>{isTaskCompleted ? 'Wiedereröffnen' : 'Erledigen'}</span>
          </div>
          <div className={`flex items-center gap-2 font-bold text-xs transition-opacity duration-150 ${swipeOffset < -30 ? 'opacity-100' : 'opacity-0'}`}>
            <span>Löschen</span><Trash2 size={20} />
          </div>
        </div>

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
              className="flex items-start gap-3 sm:gap-4 py-3.5 sm:py-4 border-b border-gray-100/80 dark:border-white/5 relative pr-2 sm:pr-3 cursor-pointer group hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors rounded-lg"
            >
              {/* Left Date Column */}
              {parsedDate ? (
                isOverdue ? (
                  <div className="w-12 shrink-0 pt-0.5 text-left flex flex-col ml-1 sm:ml-2">
                    <span className="text-[14px] font-bold text-red-500 leading-tight">
                      {format(parsedDate, 'd.')}
                    </span>
                    <span className="text-[10px] font-semibold text-red-400 uppercase tracking-widest">
                      {MONTHS_DE[parsedDate.getMonth()].toUpperCase()}
                    </span>
                  </div>
                ) : isTodayDate ? (
                  <div className="w-12 shrink-0 pt-0.5 text-left flex flex-col ml-1 sm:ml-2">
                    <span className={`text-[13px] font-bold leading-tight ${isTaskCompleted ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
                      Heute
                    </span>
                  </div>
                ) : (
                  <div className="w-12 shrink-0 pt-0.5 text-left flex flex-col ml-1 sm:ml-2">
                    <span className={`text-[14px] font-bold leading-tight ${isTaskCompleted ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
                      {format(parsedDate, 'd.')}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                      {MONTHS_DE[parsedDate.getMonth()]}
                    </span>
                  </div>
                )
              ) : (
                <div className="w-12 shrink-0 ml-1 sm:ml-2" />
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
                      className={`text-gray-900 dark:text-gray-100 font-medium text-[15px] leading-tight truncate ${
                        isTaskCompleted ? 'line-through text-gray-400 dark:text-gray-500' : ''
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

                    {task.status === 'in_progress' && !isTaskCompleted && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleInProgress(task);
                        }}
                        className="p-1 rounded text-amber-500 hover:bg-amber-500/10 transition-colors shrink-0 cursor-pointer"
                        title="In Bearbeitung - klicken zum Zurücksetzen"
                      >
                        <Timer className="w-3.5 h-3.5 animate-pulse" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleTask(task);
                      }}
                      className="p-1 -mr-1 text-gray-300 dark:text-gray-600 hover:text-blue-600 dark:hover:text-blue-400 transition-colors shrink-0 cursor-pointer min-w-[28px] min-h-[28px] flex items-center justify-center"
                      aria-label={isTaskCompleted ? 'Als unvollständig markieren' : 'Als erledigt markieren'}
                    >
                      {isTaskCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-500/20" />
                      ) : (
                        <Circle className="w-5 h-5 hover:text-blue-500 transition-colors" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Sub-details Line */}
                {((task.tags && task.tags.length > 0) || task.folder || (task.children && task.children.length > 0)) && (
                  <div className="ml-[32px] sm:ml-[34px] flex flex-wrap items-center gap-2 mt-0.5">
                    {task.folder && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFolder?.(selectedFolder === task.folder ? null : (task.folder || null));
                          setViewMode?.('tasks');
                        }}
                        className="text-[12px] text-gray-500 dark:text-gray-400 font-medium cursor-pointer hover:underline"
                        title={`Nach Ordner "${task.folder}" filtern`}
                      >
                        {task.folder}
                      </span>
                    )}

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

                    {task.children && task.children.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsChildrenCollapsed((p) => !p);
                          }}
                          className="inline-flex items-center gap-1 font-medium hover:text-gray-700 dark:hover:text-gray-200 transition-colors cursor-pointer"
                          aria-label={isChildrenCollapsed ? 'Unteraufgaben anzeigen' : 'Unteraufgaben ausblenden'}
                        >
                          <ChevronDown size={13} className={`transition-transform duration-200 ${isChildrenCollapsed ? '-rotate-90' : ''}`} />
                          <span>{task.children.filter((c) => c.isCompleted).length}/{task.children.length}</span>
                        </button>

                        {onFocusGroup && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onFocusGroup(task);
                            }}
                            className="p-0.5 text-gray-400 hover:text-blue-500 transition-colors cursor-pointer"
                            title="Gruppe vergrößern / zentrieren"
                          >
                            <Maximize2 size={11} />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsSplitModalOpen(true);
                          }}
                          className="p-0.5 text-gray-400 hover:text-blue-500 transition-colors cursor-pointer"
                          title="In Unteraufgaben aufteilen"
                        >
                          <GitFork size={11} />
                        </button>
                      </div>
                    )}
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
              className="p-4 sm:p-5 my-1.5 rounded-2xl bg-white dark:bg-[#1a1a1a] border border-gray-200/90 dark:border-white/10 shadow-sm flex flex-col gap-3.5"
            >
              {/* Title input */}
              <input
                type="text"
                value={draft.title}
                onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (draft.title.trim()) saveEditing?.(task.id, draft);
                    if (isControlledExpanded === undefined) setLocalExpanded(false);
                  }
                }}
                placeholder="Titel der Aufgabe"
                className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white bg-transparent border-b border-gray-200 dark:border-white/10 pb-1.5 outline-none w-full placeholder-gray-400 dark:placeholder-gray-600"
              />

              {/* Description (optional) */}
              <textarea
                value={draft.description}
                onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
                placeholder="Optionale Notiz..."
                rows={2}
                className="w-full text-xs sm:text-sm bg-transparent border-none text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-600 outline-none resize-none -mt-1"
              />

              {/* Quick Date Selector */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 shrink-0">Datum:</span>
                <button
                  type="button"
                  onClick={() => handleQuickDate('today')}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
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
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
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
                    className="px-2.5 py-1 text-xs font-medium bg-gray-100 dark:bg-white/10 text-gray-800 dark:text-gray-200 rounded-lg border border-transparent focus:border-blue-500 focus:outline-none cursor-pointer"
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

              {/* Priority Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 shrink-0">Priorität:</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDraft((p) => ({ ...p, priority: 'low' }))}
                    className={`text-[11px] font-bold text-gray-600 bg-gray-100 px-2.5 py-1 rounded transition-all cursor-pointer ${
                      draft.priority === 'low'
                        ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-[#1a1a1a] shadow-xs scale-105'
                        : 'opacity-50 hover:opacity-100'
                    }`}
                  >
                    P1
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft((p) => ({ ...p, priority: 'medium' }))}
                    className={`text-[11px] font-bold text-white bg-gray-500 px-2.5 py-1 rounded transition-all cursor-pointer ${
                      draft.priority === 'medium'
                        ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-[#1a1a1a] shadow-xs scale-105'
                        : 'opacity-50 hover:opacity-100'
                    }`}
                  >
                    P2
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft((p) => ({ ...p, priority: 'high' }))}
                    className={`text-[11px] font-bold text-white bg-black dark:bg-white dark:text-black px-2.5 py-1 rounded transition-all cursor-pointer ${
                      draft.priority === 'high'
                        ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-[#1a1a1a] shadow-xs scale-105'
                        : 'opacity-50 hover:opacity-100'
                    }`}
                  >
                    P3
                  </button>
                </div>
              </div>

              {/* Folder Dropdown */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 shrink-0">Ordner:</span>
                <select
                  value={draft.folder}
                  onChange={(e) => setDraft((p) => ({ ...p, folder: e.target.value }))}
                  className="px-2.5 py-1 text-xs font-medium bg-gray-100 dark:bg-white/10 rounded-lg text-gray-800 dark:text-gray-200 border border-transparent focus:border-blue-500 focus:outline-none cursor-pointer"
                >
                  <option value="">Kein Ordner</option>
                  {allFolders.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>

              {/* Tags */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Tags:</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {draft.tags.map((tag) => (
                    <span
                      key={tag}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${getTagColorClass(tag)}`}
                    >
                      <span>{tag}</span>
                      <button
                        type="button"
                        onClick={() => setDraft((p) => ({ ...p, tags: p.tags.filter((t) => t !== tag) }))}
                        className="hover:opacity-75 p-0.5 cursor-pointer"
                        title={`Tag "${tag}" entfernen`}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                  <div className="inline-flex items-center gap-1 bg-gray-100 dark:bg-white/10 rounded-lg px-2 py-1 text-xs">
                    <span className="text-gray-400">#</span>
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
                      placeholder="Neuer Tag..."
                      className="w-20 bg-transparent text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
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
                        <Plus size={11} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Recurrence & Calendar options */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 shrink-0">Wiederholung:</span>
                  <select
                    value={draft.recurrence}
                    onChange={(e) => setDraft((p) => ({ ...p, recurrence: e.target.value as RecurrenceType }))}
                    className="px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-white/10 rounded-lg text-gray-800 dark:text-gray-200 border border-transparent focus:border-blue-500 focus:outline-none cursor-pointer"
                  >
                    {RECURRENCE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={draft.showInCalendar}
                    onChange={(e) => setDraft((p) => ({ ...p, showInCalendar: e.target.checked }))}
                    className="rounded border-gray-300 dark:border-white/20 text-blue-600 focus:ring-blue-500 cursor-pointer h-3.5 w-3.5"
                  />
                  <span>Im Kalender anzeigen</span>
                </label>
              </div>

              {/* Actions row */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-100 dark:border-white/10 mt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleTask(task);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      isTaskCompleted
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100'
                        : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/15'
                    }`}
                  >
                    {isTaskCompleted ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Circle size={14} />}
                    <span>{isTaskCompleted ? 'Erledigt' : 'Als erledigt markieren'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      void deleteTask(task.id);
                    }}
                    className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                    title="Aufgabe löschen"
                    aria-label="Aufgabe löschen"
                  >
                    <Trash2 size={16} />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsSplitModalOpen(true);
                    }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    title="In Unteraufgaben aufteilen"
                    aria-label="In Unteraufgaben aufteilen"
                  >
                    <GitFork size={16} />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      cancelEditing?.();
                      if (isControlledExpanded === undefined) setLocalExpanded(false);
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors cursor-pointer"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (draft.title.trim()) {
                        saveEditing?.(task.id, draft);
                      } else {
                        cancelEditing?.();
                      }
                      if (isControlledExpanded === undefined) setLocalExpanded(false);
                    }}
                    className="px-4 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-semibold rounded-lg hover:bg-black dark:hover:bg-gray-100 transition-colors cursor-pointer shadow-xs"
                  >
                    Fertig
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Recursive subtasks */}
      {task.children && task.children.length > 0 && !isChildrenCollapsed && (
        <div className="flex flex-col gap-1 mt-1">
          {task.children.map((child) => (
            <TodoTreeItem
              key={child.id} task={child} depth={depth + 1}
              isExpanded={editingTaskId !== undefined ? editingTaskId === child.id : undefined}
              editingTaskId={editingTaskId} isCompleting={completingTaskIds?.has(child.id)} completingTaskIds={completingTaskIds}
              editDraft={editDraft} setEditDraft={setEditDraft} editNewTagInput={editNewTagInput} setEditNewTagInput={setEditNewTagInput}
              allTags={allTags} customTags={customTags} allFolders={allFolders}
              selectedTag={selectedTag} setSelectedTag={setSelectedTag} selectedFolder={selectedFolder} setSelectedFolder={setSelectedFolder}
              setViewMode={setViewMode} handleAddCustomTag={handleAddCustomTag} handleRemoveCustomTag={handleRemoveCustomTag}
              handleToggleTask={handleToggleTask} handleToggleInProgress={handleToggleInProgress}
              saveEditing={saveEditing} cancelEditing={cancelEditing} deleteTask={deleteTask}
              onRowClick={onRowClick} onSelectTask={onSelectTask} disableClickDebounce={disableClickDebounce}
              onFocusGroup={onFocusGroup}
            />
          ))}
        </div>
      )}

      <TodoSplitModal isOpen={isSplitModalOpen} onClose={() => setIsSplitModalOpen(false)} parentTask={task} />
    </div>
  );
};

export default TodoTreeItem;
