'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, Circle, Calendar, Repeat, Trash2, Plus,
  Search, SlidersHorizontal, AlertCircle, Check, X, ListTodo,
  Folder, Inbox, ArrowLeft, Tag, FolderPlus, Timer,
} from 'lucide-react';
import {
  format, isToday, isTomorrow, isBefore, startOfDay, endOfDay,
  parseISO, addDays, addWeeks, addMonths, addYears,
} from 'date-fns';
import { useDataStore, TaskItem } from '@/store/useDataStore';
import TodoFolderOverview, { FolderStat } from './TodoFolderOverview';

export type Priority = 'low' | 'medium' | 'high';
export type FilterStatus = 'all' | 'active' | 'in_progress' | 'completed';
export type SortOption = 'created' | 'deadline' | 'priority' | 'tag' | 'title';
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

interface TodoItemCardProps {
  task: TaskItem;
  isExpanded: boolean;
  editDraft: {
    title: string;
    description: string;
    priority: Priority;
    status: 'todo' | 'in_progress' | 'completed';
    dueDate: string;
    recurrence: RecurrenceType;
    recurrenceEnd: string;
    folder: string;
    tags: string[];
    showInCalendar: boolean;
  };
  setEditDraft: React.Dispatch<React.SetStateAction<{
    title: string;
    description: string;
    priority: Priority;
    status: 'todo' | 'in_progress' | 'completed';
    dueDate: string;
    recurrence: RecurrenceType;
    recurrenceEnd: string;
    folder: string;
    tags: string[];
    showInCalendar: boolean;
  }>>;
  editNewTagInput: string;
  setEditNewTagInput: React.Dispatch<React.SetStateAction<string>>;
  allTags: string[];
  customTags: string[];
  allFolders: string[];
  selectedTag: string | null;
  setSelectedTag: React.Dispatch<React.SetStateAction<string | null>>;
  selectedFolder: string | null;
  setSelectedFolder: React.Dispatch<React.SetStateAction<string | null>>;
  setViewMode: React.Dispatch<React.SetStateAction<'tasks' | 'folders'>>;
  handleAddCustomTag: (tag: string) => void;
  handleRemoveCustomTag: (tag: string) => void;
  handleToggleTask: (task: TaskItem) => void;
  handleToggleInProgress: (task: TaskItem) => void;
  saveEditing: (id: string) => void;
  cancelEditing: () => void;
  deleteTask: (id: string) => Promise<void>;
  onRowClick: (task: TaskItem) => void;
}

const TodoItemCard: React.FC<TodoItemCardProps> = ({
  task,
  isExpanded,
  editDraft,
  setEditDraft,
  editNewTagInput,
  setEditNewTagInput,
  allTags,
  customTags,
  allFolders,
  selectedTag,
  setSelectedTag,
  selectedFolder,
  setSelectedFolder,
  setViewMode,
  handleAddCustomTag,
  handleRemoveCustomTag,
  handleToggleTask,
  handleToggleInProgress,
  saveEditing,
  cancelEditing,
  deleteTask,
  onRowClick,
}) => {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const isSwipingRef = useRef(false);
  const isVerticalScrollRef = useRef(false);
  const justSwipedRef = useRef(false);

  const priority = getTaskPriority(task);
  const priorityCfg = PRIORITY_CONFIG[priority];
  const deadline = getDeadlineInfo(task.dueDate || task.scheduledDate);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isExpanded) return;
    const touch = e.touches[0];
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    isSwipingRef.current = false;
    isVerticalScrollRef.current = false;
    justSwipedRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isExpanded || isVerticalScrollRef.current) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartXRef.current;
    const deltaY = touch.clientY - touchStartYRef.current;

    if (!isSwipingRef.current && !isVerticalScrollRef.current) {
      if (Math.abs(deltaY) > 8 && Math.abs(deltaY) > Math.abs(deltaX)) {
        isVerticalScrollRef.current = true;
        return;
      }
      if (Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY)) {
        isSwipingRef.current = true;
        setIsSwiping(true);
      }
    }

    if (isSwipingRef.current) {
      let offset = deltaX;
      if (offset > 110) offset = 110 + (offset - 110) * 0.25;
      if (offset < -110) offset = -110 + (offset + 110) * 0.25;
      setSwipeOffset(offset);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isSwipingRef.current) {
      setSwipeOffset(0);
      setIsSwiping(false);
      return;
    }

    const currentOffset = swipeOffset;
    setIsSwiping(false);
    setSwipeOffset(0);
    isSwipingRef.current = false;
    justSwipedRef.current = true;
    setTimeout(() => {
      justSwipedRef.current = false;
    }, 300);

    if (currentOffset > 60) {
      handleToggleTask(task);
    } else if (currentOffset < -60) {
      e.stopPropagation();
      e.preventDefault();
      deleteTask(task.id);
    }
  };

  const handleClick = () => {
    if (justSwipedRef.current) {
      justSwipedRef.current = false;
      return;
    }
    onRowClick(task);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Swipe action background indicators */}
      <div
        className={`absolute inset-0 flex items-center justify-between px-5 rounded-2xl pointer-events-none transition-colors ${
          swipeOffset > 0
            ? 'bg-emerald-500 text-white'
            : swipeOffset < 0
            ? 'bg-rose-500 text-white'
            : 'bg-transparent'
        }`}
      >
        <div
          className={`flex items-center gap-2 font-bold text-xs transition-opacity duration-150 ${
            swipeOffset > 30 ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <CheckCircle2 size={20} />
          <span>{task.isCompleted ? 'Wiedereröffnen' : 'Erledigen'}</span>
        </div>
        <div
          className={`flex items-center gap-2 font-bold text-xs transition-opacity duration-150 ${
            swipeOffset < -30 ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <span>Löschen</span>
          <Trash2 size={20} />
        </div>
      </div>

      {/* Foreground card */}
      <div
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: isSwiping ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
          touchAction: 'pan-y',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        className={`relative group flex flex-col p-3.5 sm:p-4 rounded-2xl border transition-colors duration-150 cursor-pointer ${
          isExpanded
            ? task.status === 'in_progress' && !task.isCompleted
              ? 'bg-white dark:bg-[#1a1a1a] border-amber-500/50 dark:border-amber-500/40 shadow-sm'
              : 'bg-white dark:bg-[#1a1a1a] border-blue-500/50 dark:border-blue-500/40 shadow-sm'
            : task.isCompleted
            ? 'border-gray-100 dark:border-white/5 bg-gray-50/60 dark:bg-[#161616] opacity-75'
            : task.status === 'in_progress'
            ? 'bg-amber-500/[0.04] dark:bg-amber-500/[0.06] border-amber-500/40 dark:border-amber-500/30 hover:border-amber-500/60 dark:hover:border-amber-500/50 shadow-2xs hover:shadow-xs'
            : 'bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20 shadow-2xs hover:shadow-xs'
        }`}
      >
        {/* Top row: Left (Checkbox + In-Progress + Title) vs Right (Due date + Priority) */}
        <div className="flex items-center justify-between gap-3 w-full">
          {/* Left side: Checkbox + In-Progress button + Task Title (left-aligned, truncated if long) */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleTask(task);
              }}
              className="p-1 -ml-1 text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400 transition-colors shrink-0 cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center"
              aria-label={task.isCompleted ? 'Als unvollständig markieren' : 'Als erledigt markieren'}
            >
              {task.isCompleted ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-500/20" />
              ) : (
                <Circle className="w-5 h-5 hover:text-blue-500 transition-colors" />
              )}
            </button>

            {/* In-Progress Quick Toggle Button */}
            {!task.isCompleted && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleInProgress(task);
                }}
                className={`p-1 rounded-lg transition-all shrink-0 cursor-pointer min-w-[28px] min-h-[28px] flex items-center justify-center ${
                  task.status === 'in_progress'
                    ? 'text-amber-500 bg-amber-500/15 hover:bg-amber-500/25 ring-1 ring-amber-500/30'
                    : 'text-gray-400 hover:text-amber-500 hover:bg-amber-500/10 dark:text-gray-500 dark:hover:text-amber-400 opacity-60 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
                }`}
                title={
                  task.status === 'in_progress'
                    ? 'In Bearbeitung - klicken um zurückzusetzen'
                    : "Als 'in Bearbeitung' markieren"
                }
                aria-label={
                  task.status === 'in_progress'
                    ? 'In Bearbeitung - klicken um zurückzusetzen'
                    : "Als 'in Bearbeitung' markieren"
                }
              >
                <Timer className={`w-4 h-4 ${task.status === 'in_progress' ? 'animate-pulse' : ''}`} />
              </button>
            )}

            <span
              className={`text-sm font-semibold truncate ${
                task.isCompleted ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'
              }`}
            >
              {task.title}
            </span>
          </div>

          {/* Right side: In-Progress badge, Due date badge and Priority badge */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {task.status === 'in_progress' && !task.isCompleted && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                title="Diese Aufgabe ist aktuell in Bearbeitung"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span>In Bearbeitung</span>
              </span>
            )}
            {deadline && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border ${getDeadlineChipClasses(
                  deadline.status,
                  task.isCompleted
                )}`}
              >
                {deadline.status === 'overdue' && !task.isCompleted ? <AlertCircle size={12} /> : <Calendar size={12} />}
                <span>{deadline.label}</span>
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${priorityCfg.bg} ${priorityCfg.text} ${priorityCfg.border}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${priorityCfg.dot}`} />
              <span>{priorityCfg.label}</span>
            </span>
          </div>
        </div>

        {/* Bottom row (under the title): Tags badges */}
        {((task.tags && task.tags.length > 0) || task.folder) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5 pl-8 sm:pl-9">
            {task.tags?.map((tag) => (
              <span
                key={tag}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTag(selectedTag === tag ? null : tag);
                  setViewMode('tasks');
                }}
                className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                  selectedTag === tag
                    ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-500/40 shadow-2xs'
                    : 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-500/20'
                }`}
                title={`Nach #${tag} filtern`}
              >
                #{tag}
              </span>
            ))}
            {task.folder && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFolder(selectedFolder === task.folder ? null : (task.folder || null));
                  setViewMode('tasks');
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 transition-colors cursor-pointer"
                title={`Nur Ordner "${task.folder}" anzeigen`}
              >
                <Folder size={11} />
                <span>{task.folder}</span>
              </span>
            )}
          </div>
        )}

        {/* Expanded Edit / Settings Form (in smooth accordion) */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              key={`accordion-${task.id}`}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="pt-3.5 mt-3 border-t border-gray-100 dark:border-white/10 flex flex-col gap-3.5">
                {/* Top: Left (Title & Description, ~65%) vs Right (Priority & Due Date, ~35%) */}
                <div className="flex flex-col md:flex-row gap-3.5 items-start">
                  {/* Left side: ~65% */}
                  <div className="w-full md:w-[65%] flex flex-col gap-2.5">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                        Titel
                      </label>
                      <input
                        type="text"
                        value={editDraft.title}
                        onChange={(e) => setEditDraft((p) => ({ ...p, title: e.target.value }))}
                        placeholder="Titel der Aufgabe"
                        className="w-full px-3 py-2 text-sm font-medium bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 min-h-[38px]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                        Beschreibung
                      </label>
                      <textarea
                        value={editDraft.description}
                        onChange={(e) => setEditDraft((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Optionale Notiz oder Beschreibung..."
                        rows={3}
                        className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
                      />
                    </div>
                  </div>

                  {/* Right side: ~35% */}
                  <div className="w-full md:w-[35%] flex flex-col gap-2.5">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                        Status
                      </label>
                      <select
                        value={editDraft.status}
                        onChange={(e) => setEditDraft((p) => ({ ...p, status: e.target.value as 'todo' | 'in_progress' | 'completed' }))}
                        className="w-full px-3 py-2 text-xs font-medium bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer min-h-[38px]"
                      >
                        <option value="todo">⚪ Offen</option>
                        <option value="in_progress">⏳ In Bearbeitung</option>
                        <option value="completed">✅ Erledigt</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                        Priorität
                      </label>
                      <select
                        value={editDraft.priority}
                        onChange={(e) => setEditDraft((p) => ({ ...p, priority: e.target.value as Priority }))}
                        className="w-full px-3 py-2 text-xs font-medium bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer min-h-[38px]"
                      >
                        {PRIORITY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                        Fälligkeitsdatum / Uhrzeit
                      </label>
                      <input
                        type="date"
                        value={editDraft.dueDate}
                        onChange={(e) => setEditDraft((p) => ({ ...p, dueDate: e.target.value }))}
                        className="w-full px-3 py-2 text-xs font-medium bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer min-h-[38px]"
                        aria-label="Fälligkeitsdatum / Uhrzeit"
                      />
                    </div>
                  </div>
                </div>

                {/* Below that: Three fields with clear labels: Tags, Ordner, Wiederholung */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
                  {/* Label "Tags" */}
                  <div className="flex flex-col gap-1.5 md:col-span-1">
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <Tag size={13} className="text-blue-500" />
                      <span>Tags</span>
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5 p-2 bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl min-h-[42px]">
                      {allTags.map((tag) => {
                        const isSelected = editDraft.tags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              setEditDraft((p) => ({
                                ...p,
                                tags: isSelected ? p.tags.filter((t) => t !== tag) : [...p.tags, tag],
                              }));
                            }}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/40 shadow-2xs'
                                : 'bg-white dark:bg-white/5 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'
                            }`}
                          >
                            <span>#{tag}</span>
                            {isSelected ? (
                              <Check size={11} className="text-blue-500" />
                            ) : customTags.includes(tag) ? (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveCustomTag(tag);
                                }}
                                className="text-gray-400 hover:text-rose-500 ml-0.5 p-0.5 transition-colors"
                                title={`Tag "${tag}" löschen`}
                              >
                                <X size={10} />
                              </span>
                            ) : null}
                          </button>
                        );
                      })}

                      <div className="inline-flex items-center gap-1 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-lg px-2 py-0.5">
                        <span className="text-xs text-gray-400">#</span>
                        <input
                          type="text"
                          value={editNewTagInput}
                          onChange={(e) => setEditNewTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const trimmed = editNewTagInput.trim().replace(/^#/, '');
                              if (trimmed) {
                                handleAddCustomTag(trimmed);
                                if (!editDraft.tags.includes(trimmed)) {
                                  setEditDraft((p) => ({ ...p, tags: [...p.tags, trimmed] }));
                                }
                                setEditNewTagInput('');
                              }
                            }
                          }}
                          placeholder="Neuer Tag..."
                          className="w-20 sm:w-24 text-xs bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none py-0.5"
                        />
                        {editNewTagInput.trim() && (
                          <button
                            type="button"
                            onClick={() => {
                              const trimmed = editNewTagInput.trim().replace(/^#/, '');
                              if (trimmed) {
                                handleAddCustomTag(trimmed);
                                if (!editDraft.tags.includes(trimmed)) {
                                  setEditDraft((p) => ({ ...p, tags: [...p.tags, trimmed] }));
                                }
                                setEditNewTagInput('');
                              }
                            }}
                            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 p-0.5 cursor-pointer"
                            title="Tag hinzufügen"
                          >
                            <Plus size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Label "Ordner" (Select dropdown) */}
                  <div className="flex flex-col gap-1.5 md:col-span-1">
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <Folder size={13} className="text-blue-500" />
                      <span>Ordner</span>
                    </label>
                    <select
                      value={editDraft.folder}
                      onChange={(e) => setEditDraft((p) => ({ ...p, folder: e.target.value }))}
                      className="w-full px-3 py-2 text-xs font-medium bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer min-h-[42px]"
                    >
                      <option value="">Kein Ordner</option>
                      {allFolders.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Label "Wiederholung" */}
                  <div className="flex flex-col gap-1.5 md:col-span-1">
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <Repeat size={13} className="text-purple-500" />
                      <span>Wiederholung</span>
                    </label>
                    <div className="flex flex-col gap-2">
                      <select
                        value={editDraft.recurrence}
                        onChange={(e) => setEditDraft((p) => ({ ...p, recurrence: e.target.value as RecurrenceType }))}
                        className="w-full px-3 py-2 text-xs font-medium bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer min-h-[42px]"
                      >
                        {RECURRENCE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      {editDraft.recurrence !== 'none' && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">Bis:</span>
                          <input
                            type="date"
                            value={editDraft.recurrenceEnd}
                            onChange={(e) => setEditDraft((p) => ({ ...p, recurrenceEnd: e.target.value }))}
                            className="w-full px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none cursor-pointer min-h-[36px]"
                            aria-label="Wiederholen bis"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Im Kalender anzeigen */}
                <div className="flex items-center pt-1">
                  <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-700 dark:text-gray-300 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                    <Calendar size={13} className="text-blue-500 shrink-0" />
                    <span>Im Kalender anzeigen</span>
                    <input
                      type="checkbox"
                      checked={editDraft.showInCalendar}
                      onChange={(e) => setEditDraft((p) => ({ ...p, showInCalendar: e.target.checked }))}
                      className="rounded border-gray-300 dark:border-white/20 text-blue-600 focus:ring-blue-500/40 cursor-pointer h-3.5 w-3.5 ml-1"
                    />
                  </label>
                </div>

                {/* Footer action bar: Löschen on left, Abbrechen & Speichern on right */}
                <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-100 dark:border-white/5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      deleteTask(task.id);
                    }}
                    onTouchEnd={(e) => {
                      e.stopPropagation();
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 border border-rose-200 dark:border-rose-900/40 rounded-xl transition-colors cursor-pointer min-h-[36px]"
                    title="Aufgabe löschen"
                  >
                    <Trash2 size={15} />
                    <span>Löschen</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        cancelEditing();
                      }}
                      className="flex items-center justify-center gap-1 px-3.5 py-2 text-xs rounded-xl font-medium bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 transition-colors cursor-pointer min-h-[36px]"
                    >
                      <X size={13} />
                      <span>Abbrechen</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        saveEditing(task.id);
                      }}
                      disabled={!editDraft.title.trim()}
                      className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-opacity disabled:opacity-50 cursor-pointer min-h-[36px] shadow-xs"
                    >
                      <Check size={13} />
                      <span>Speichern</span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

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

  const [draft, setDraft] = useState({
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
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderNameInput, setNewFolderNameInput] = useState('');

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    title: string;
    description: string;
    priority: Priority;
    status: 'todo' | 'in_progress' | 'completed';
    dueDate: string;
    recurrence: RecurrenceType;
    recurrenceEnd: string;
    folder: string;
    tags: string[];
    showInCalendar: boolean;
  }>({
    title: '', description: '', priority: 'medium' as Priority,
    status: 'todo',
    dueDate: '', recurrence: 'none' as RecurrenceType, recurrenceEnd: '',
    folder: '', tags: [] as string[],
    showInCalendar: true,
  });

  const totalCount = tasks.length;
  const completedCount = useMemo(() => tasks.filter((t) => t.isCompleted).length, [tasks]);
  const inProgressCount = useMemo(() => tasks.filter((t) => !t.isCompleted && t.status === 'in_progress').length, [tasks]);
  const openCount = useMemo(() => tasks.filter((t) => !t.isCompleted && t.status !== 'in_progress').length, [tasks]);
  const activeCount = totalCount - completedCount;
  const overdueCount = useMemo(() => {
    const today = startOfDay(new Date());
    return tasks.filter((t) => !t.isCompleted && parseDateSafe(t.dueDate || t.scheduledDate) && isBefore(startOfDay(parseDateSafe(t.dueDate || t.scheduledDate)!), today)).length;
  }, [tasks]);
  const openNonOverdueCount = Math.max(0, openCount - overdueCount);
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

  const handleToggleInProgress = (task: TaskItem) => {
    toggleTaskInProgress(task.id);
    if (editingTaskId === task.id) {
      setEditDraft((p) => ({
        ...p,
        status: p.status === 'in_progress' ? 'todo' : 'in_progress',
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

  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastClickedTaskIdRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  const handleRowClick = (task: TaskItem) => {
    if (clickTimeoutRef.current && lastClickedTaskIdRef.current === task.id) {
      // Double click / double tap detected -> complete/toggle task
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      lastClickedTaskIdRef.current = null;
      handleToggleTask(task);
    } else {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
      lastClickedTaskIdRef.current = task.id;
      clickTimeoutRef.current = setTimeout(() => {
        clickTimeoutRef.current = null;
        lastClickedTaskIdRef.current = null;
        // Single click -> smoothly expand/collapse accordion
        if (editingTaskId === task.id) {
          saveEditing(task.id);
        } else {
          if (editingTaskId) {
            saveEditing(editingTaskId);
          }
          startEditing(task);
          onSelectTask?.(task);
        }
      }, 250);
    }
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
      if (selectedTag !== null) {
        if (!t.tags || !t.tags.includes(selectedTag)) return false;
      }
      if (filterStatus === 'active' && (t.isCompleted || t.status === 'in_progress')) return false;
      if (filterStatus === 'in_progress' && (t.isCompleted || t.status !== 'in_progress')) return false;
      if (filterStatus === 'completed' && !t.isCompleted) return false;
      if (filterPriority !== 'all' && getTaskPriority(t) !== filterPriority) return false;
      const matchesTag = t.tags && t.tags.some((tag) => tag.toLowerCase().includes(q));
      if (q && !t.title.toLowerCase().includes(q) && !(t.description || '').toLowerCase().includes(q) && !matchesTag) return false;
      return true;
    });
  }, [tasks, selectedFolder, selectedTag, filterStatus, filterPriority, searchQuery]);

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

  return (
    <div className={`flex-1 h-full flex flex-col bg-[#f8f9fa] dark:bg-[#121212] overflow-y-auto relative select-none ${className}`}>
      {/* Header & Status Indicator */}
      <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 px-3 sm:px-6 md:px-8 py-3 border-b border-gray-200 dark:border-white/10 bg-white/90 dark:bg-[#121212]/90 backdrop-blur-md">
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white leading-tight">Todos</h1>

          {/* Thick Segmented Progress Bar */}
          <div className="flex flex-col gap-1 min-w-[180px] sm:min-w-[240px] max-w-xs">
            <div className="h-3.5 sm:h-4 w-full bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden flex items-stretch">
              {totalCount > 0 ? (
                <>
                  {completedCount > 0 && (
                    <div
                      className="bg-emerald-500 dark:bg-emerald-400 transition-all duration-300"
                      style={{ width: `${(completedCount / totalCount) * 100}%` }}
                      title={`Erledigt: ${completedCount}`}
                    />
                  )}
                  {inProgressCount > 0 && (
                    <div
                      className="bg-amber-500 dark:bg-amber-400 transition-all duration-300"
                      style={{ width: `${(inProgressCount / totalCount) * 100}%` }}
                      title={`In Bearbeitung: ${inProgressCount}`}
                    />
                  )}
                  {openNonOverdueCount > 0 && (
                    <div
                      className="bg-blue-500 dark:bg-blue-400 transition-all duration-300"
                      style={{ width: `${(openNonOverdueCount / totalCount) * 100}%` }}
                      title={`Offen: ${openNonOverdueCount}`}
                    />
                  )}
                  {overdueCount > 0 && (
                    <div
                      className="bg-rose-500 dark:bg-rose-400 transition-all duration-300"
                      style={{ width: `${(overdueCount / totalCount) * 100}%` }}
                      title={`Überfällig: ${overdueCount}`}
                    />
                  )}
                </>
              ) : null}
            </div>
            <div className="flex items-center gap-2.5 text-xs font-bold px-0.5">
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400" title="Erledigt">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                {completedCount}
              </span>
              {inProgressCount > 0 && (
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400" title="In Bearbeitung">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  {inProgressCount}
                </span>
              )}
              <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400" title="Offen">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                {openNonOverdueCount}
              </span>
              {overdueCount > 0 && (
                <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400" title="Überfällig">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  {overdueCount}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions & View Switch */}
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
          {/* Segmented View Toggle: Aufgaben vs Ordner */}
          <div className="flex items-center bg-gray-100 dark:bg-white/5 p-1 rounded-xl border border-gray-200 dark:border-white/10">
            <button
              type="button"
              onClick={() => setViewMode('tasks')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer min-h-[32px] ${
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
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer min-h-[32px] ${
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

          {/* + Neuer Ordner */}
          <button
            type="button"
            onClick={() => setIsFolderModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-[#242424] hover:bg-gray-50 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 active:scale-95 rounded-xl transition-all shadow-2xs shrink-0 cursor-pointer min-h-[36px]"
          >
            <FolderPlus size={16} />
            <span>Neuer Ordner</span>
          </button>

          {/* + Neue Aufgabe */}
          <button
            type="button"
            onClick={() => {
              if (viewMode === 'folders') setViewMode('tasks');
              setDraft((p) => ({ ...p, folder: selectedFolder || '' }));
              setIsCreateOpen((prev) => !prev);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-xl transition-all shadow-xs shrink-0 cursor-pointer min-h-[36px]"
          >
            <Plus size={16} /><span>Neue Aufgabe</span>
          </button>
        </div>
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
        <div className="max-w-4xl md:max-w-5xl w-full mx-auto px-3 sm:px-6 md:px-8 py-4 sm:py-6 flex flex-col gap-4 sm:gap-5 pb-28 sm:pb-8">
          {/* Folder Header Banner (View b) */}
          {selectedFolder !== null && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent border border-blue-500/20 dark:border-blue-500/30">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setSelectedFolder(null)}
                  className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl bg-white dark:bg-white/10 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-white shadow-2xs hover:scale-105 transition-all cursor-pointer shrink-0"
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
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white bg-white dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 rounded-xl transition-colors cursor-pointer min-h-[36px] flex items-center"
                >
                  Ordner-Übersicht
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFolder(null)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-xl transition-colors cursor-pointer min-h-[36px]"
                >
                  <X size={14} />
                  <span>Filter zurücksetzen</span>
                </button>
              </div>
            </div>
          )}

          {/* Task Creation Form Card (Collapsed by default) */}
          {isCreateOpen && (
            <div className="bg-white dark:bg-[#1a1a1a] border border-blue-500/30 dark:border-blue-500/30 rounded-2xl p-4 sm:p-5 shadow-2xs transition-all">
              <form onSubmit={handleAddTask} className="flex flex-col gap-3 sm:gap-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Plus size={16} className="text-blue-500" />
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">Neue Aufgabe erstellen</h3>
                  </div>
                  <button type="button" onClick={() => setIsCreateOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg transition-colors cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center" aria-label="Schließen">
                    <X size={16} />
                  </button>
                </div>

                <input
                  ref={titleInputRef}
                  type="text" value={draft.title} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Was möchtest du erledigen?..." autoFocus
                  className="w-full px-4 py-2.5 text-sm bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 min-h-[40px]"
                />

                <textarea
                  value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Optionale Notiz oder Beschreibung..." rows={2}
                  className="w-full px-4 py-2 text-xs bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
                />

                {/* Tag selector chips in Create Form */}
                <div className="flex flex-col gap-1.5 pt-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 font-medium">
                    <Tag size={13} className="text-blue-500" />
                    <span>Tags:</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {allTags.map((tag) => {
                      const isSelected = draft.tags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            setDraft((p) => ({
                              ...p,
                              tags: isSelected ? p.tags.filter((t) => t !== tag) : [...p.tags, tag],
                            }));
                          }}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/40 shadow-2xs'
                              : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'
                          }`}
                        >
                          <span>#{tag}</span>
                          {isSelected ? (
                            <Check size={11} className="text-blue-500" />
                          ) : customTags.includes(tag) ? (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveCustomTag(tag);
                              }}
                              className="text-gray-400 hover:text-rose-500 ml-0.5 p-0.5 transition-colors"
                              title={`Tag "${tag}" löschen`}
                            >
                              <X size={10} />
                            </span>
                          ) : null}
                        </button>
                      );
                    })}

                    <div className="inline-flex items-center gap-1 bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-lg px-2 py-0.5">
                      <span className="text-xs text-gray-400">#</span>
                      <input
                        type="text"
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const trimmed = newTagInput.trim().replace(/^#/, '');
                            if (trimmed) {
                              handleAddCustomTag(trimmed);
                              if (!draft.tags.includes(trimmed)) {
                                setDraft((p) => ({ ...p, tags: [...p.tags, trimmed] }));
                              }
                              setNewTagInput('');
                            }
                          }
                        }}
                        placeholder="Neuer Tag..."
                        className="w-20 sm:w-24 text-xs bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none py-0.5"
                      />
                      {newTagInput.trim() && (
                        <button
                          type="button"
                          onClick={() => {
                            const trimmed = newTagInput.trim().replace(/^#/, '');
                            if (trimmed) {
                              handleAddCustomTag(trimmed);
                              if (!draft.tags.includes(trimmed)) {
                                setDraft((p) => ({ ...p, tags: [...p.tags, trimmed] }));
                              }
                              setNewTagInput('');
                            }
                          }}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-700 p-0.5 cursor-pointer"
                          title="Tag hinzufügen"
                        >
                          <Plus size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 pt-1 border-t border-gray-100 dark:border-white/5">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 w-full sm:w-auto">
                    <select
                      value={draft.priority} onChange={(e) => setDraft((p) => ({ ...p, priority: e.target.value as Priority }))}
                      className="px-3 py-1.5 text-xs font-medium bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer min-h-[36px]"
                      aria-label="Priorität"
                    >
                      {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>

                    <div className="flex items-center gap-1.5 flex-1 sm:flex-none min-w-[130px]">
                      <Folder size={14} className="text-blue-500 shrink-0" />
                      <input
                        list="todo-folder-options"
                        type="text"
                        value={draft.folder}
                        onChange={(e) => setDraft((p) => ({ ...p, folder: e.target.value }))}
                        placeholder="Ordner (optional)"
                        className="px-3 py-1.5 text-xs font-medium bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 w-full sm:w-44 min-h-[36px]"
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
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 min-w-[28px] min-h-[28px] flex items-center justify-center"
                          title="Ordner entfernen"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    <input
                      type="date" value={draft.dueDate} onChange={(e) => setDraft((p) => ({ ...p, dueDate: e.target.value }))}
                      className="px-3 py-1.5 text-xs font-medium bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer min-h-[36px]"
                      aria-label="Fälligkeitsdatum"
                    />
                    <div className="flex items-center gap-1.5">
                      <Repeat size={14} className="text-purple-500 shrink-0" />
                      <select
                        value={draft.recurrence} onChange={(e) => setDraft((p) => ({ ...p, recurrence: e.target.value as RecurrenceType }))}
                        className="px-3 py-1.5 text-xs bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none cursor-pointer min-h-[36px]"
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
                          className="px-3 py-1.5 text-xs bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none cursor-pointer min-h-[36px]"
                          aria-label="Wiederholen bis"
                        />
                      </div>
                    )}

                    <label className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-700 dark:text-gray-300 cursor-pointer min-h-[36px] select-none hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                      <Calendar size={14} className="text-blue-500 shrink-0" />
                      <span>Im Kalender anzeigen</span>
                      <input
                        type="checkbox"
                        checked={draft.showInCalendar}
                        onChange={(e) => setDraft((p) => ({ ...p, showInCalendar: e.target.checked }))}
                        className="rounded border-gray-300 dark:border-white/20 text-blue-600 focus:ring-blue-500/40 cursor-pointer h-3.5 w-3.5 ml-1"
                      />
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-2 w-full sm:w-auto pt-2 sm:pt-0">
                    <button type="button" onClick={() => setIsCreateOpen(false)} className="flex-1 sm:flex-none px-3 py-2 text-xs rounded-xl font-medium bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 transition-colors cursor-pointer min-h-[36px]">
                      Abbrechen
                    </button>
                    <button type="submit" disabled={!draft.title.trim() || isSubmitting} className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-xs cursor-pointer min-h-[36px]">
                      <Plus size={14} /><span>Aufgabe hinzufügen</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* Filter & Sort Card */}
          <div className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-2xl p-3.5 sm:p-4 shadow-2xs flex flex-col gap-3">
            {/* Search & Status Toggle */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Aufgaben durchsuchen..."
                  className="w-full pl-9 pr-8 py-2 text-xs bg-gray-50/80 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 min-h-[36px] transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition-colors cursor-pointer"
                    title="Suche leeren"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Status Pills */}
              <div className="flex items-center bg-gray-100 dark:bg-white/5 p-1 rounded-xl border border-gray-200 dark:border-white/10 shrink-0 self-start sm:self-auto overflow-x-auto max-w-full">
                {(
                  [
                    { key: 'all' as FilterStatus, label: 'Alle', count: totalCount },
                    { key: 'active' as FilterStatus, label: 'Offen', count: openCount },
                    { key: 'in_progress' as FilterStatus, label: 'In Arbeit', count: inProgressCount },
                    { key: 'completed' as FilterStatus, label: 'Erledigt', count: completedCount },
                  ]
                ).map((item) => {
                  const isActive = filterStatus === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setFilterStatus(item.key)}
                      className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap min-h-[28px] flex items-center gap-1.5 justify-center ${
                        isActive
                          ? 'bg-white dark:bg-[#242424] text-blue-600 dark:text-blue-400 shadow-xs'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      <span>{item.label}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                          isActive
                            ? item.key === 'in_progress'
                              ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                              : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                            : item.key === 'in_progress' && item.count > 0
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        {item.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick folder pills / shortcuts */}
            {(allFolders.length > 0 || unfiledCount.total > 0) && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs">
                <span className="text-gray-400 dark:text-gray-500 shrink-0 font-medium flex items-center gap-1 mr-1">
                  <Folder size={13} /> Ordner:
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedFolder(null)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap min-h-[30px] flex items-center transition-all cursor-pointer ${
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
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap min-h-[30px] flex items-center gap-1.5 transition-all cursor-pointer ${
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
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap min-h-[30px] flex items-center gap-1.5 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10'
                      }`}
                    >
                      <span>{folder}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${isSelected ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-300'}`}>
                        {count}
                      </span>
                      {isSelected && <X size={12} className="ml-0.5" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Quick tag pills / shortcuts */}
            {allTags.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs">
                <span className="text-gray-400 dark:text-gray-500 shrink-0 font-medium flex items-center gap-1 mr-1">
                  <Tag size={13} /> Tags:
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedTag(null)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap min-h-[30px] flex items-center transition-all cursor-pointer ${
                    selectedTag === null
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10'
                  }`}
                >
                  Alle ({totalCount})
                </button>
                {allTags.map((tag) => {
                  const isSelected = selectedTag === tag;
                  const count = tasks.filter((t) => t.tags?.includes(tag)).length;
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setSelectedTag(isSelected ? null : tag)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap min-h-[30px] flex items-center gap-1.5 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10'
                      }`}
                    >
                      <span>#{tag}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${isSelected ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-300'}`}>
                        {count}
                      </span>
                      {isSelected && <X size={12} className="ml-0.5" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Bottom Row: Priority & Sort dropdowns */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 pt-2.5 border-t border-gray-100 dark:border-white/5 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 dark:text-gray-400 font-medium">Priorität:</span>
                <select
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value as Priority | 'all')}
                  className="px-2.5 py-1.5 bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer min-h-[34px] font-medium transition-all"
                >
                  <option value="all">Alle Prioritäten</option>
                  {PRIORITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label.replace(/^[^\s]+\s/, '')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={13} className="text-gray-400 shrink-0" />
                <span className="text-gray-500 dark:text-gray-400 font-medium">Sortieren:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="px-2.5 py-1.5 bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer min-h-[34px] font-medium transition-all"
                >
                  <option value="deadline">Fälligkeit</option>
                  <option value="priority">Priorität</option>
                  <option value="created">Erstellt</option>
                  <option value="tag">Tag</option>
                  <option value="title">Titel</option>
                </select>
              </div>
            </div>
          </div>

          {/* Task Cards List */}
          <div className="flex flex-col gap-3">
            {sortedTasks.map((task) => (
              <TodoItemCard
                key={task.id}
                task={task}
                isExpanded={editingTaskId === task.id}
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
              />
            ))}

            {sortedTasks.length === 0 && (
              <div className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-2xl p-12 text-center flex flex-col items-center justify-center shadow-2xs">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center mb-3">
                  {filterStatus === 'completed' ? (
                    <CheckCircle2 size={24} />
                  ) : filterStatus === 'in_progress' ? (
                    <Timer size={24} className="text-amber-500" />
                  ) : (
                    <ListTodo size={24} />
                  )}
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">
                  {filterStatus === 'completed'
                    ? 'Keine erledigten Aufgaben'
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
        </div>
      )}

      {/* Folder Creation Modal */}
      {isFolderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-white/10 rounded-2xl p-5 w-full max-w-sm shadow-xl">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <FolderPlus size={18} className="text-blue-500" /> Neuer Ordner
            </h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const trimmed = newFolderNameInput.trim();
              if (trimmed) {
                handleCreateFolder(trimmed);
                setNewFolderNameInput('');
                setIsFolderModalOpen(false);
              }
            }}>
              <input
                type="text"
                autoFocus
                placeholder="Ordnername eingeben..."
                value={newFolderNameInput}
                onChange={(e) => setNewFolderNameInput(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 mb-4"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setIsFolderModalOpen(false); setNewFolderNameInput(''); }}
                  className="px-3.5 py-1.5 text-xs rounded-xl font-medium bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 transition-colors cursor-pointer min-h-[32px]"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={!newFolderNameInput.trim()}
                  className="px-3.5 py-1.5 text-xs rounded-xl font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors cursor-pointer shadow-xs min-h-[32px]"
                >
                  Erstellen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TodoList;
