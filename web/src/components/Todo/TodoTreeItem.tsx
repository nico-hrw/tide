'use client';

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, Circle, Calendar, Repeat, Trash2, Plus,
  AlertCircle, Check, X, Folder, Timer, RotateCcw, ChevronDown, Tag,
} from 'lucide-react';
import { format } from 'date-fns';
import { TaskItem } from '@/store/useDataStore';
import {
  Priority, RecurrenceType, TaskWithChildren, TaskEditDraft,
  PRIORITY_CONFIG, PRIORITY_OPTIONS, RECURRENCE_OPTIONS,
  getTaskPriority, getDeadlineInfo, getDeadlineChipClasses,
} from './types';

export interface TodoTreeItemProps {
  task: TaskWithChildren;
  depth?: number;
  isExpanded?: boolean;
  editingTaskId?: string | null;
  isCompleting?: boolean;
  completingTaskIds?: Set<string>;
  editDraft?: TaskEditDraft;
  setEditDraft?: React.Dispatch<React.SetStateAction<TaskEditDraft>>;
  editNewTagInput?: string;
  setEditNewTagInput?: React.Dispatch<React.SetStateAction<string>>;
  allTags?: string[];
  customTags?: string[];
  allFolders?: string[];
  selectedTag?: string | null;
  setSelectedTag?: (tag: string | null) => void;
  selectedFolder?: string | null;
  setSelectedFolder?: (folder: string | null) => void;
  setViewMode?: (mode: 'tasks' | 'folders') => void;
  handleAddCustomTag?: (tag: string) => void;
  handleRemoveCustomTag?: (tag: string) => void;
  handleToggleTask: (task: TaskItem) => void;
  handleToggleInProgress: (task: TaskItem) => void;
  saveEditing?: (id: string, draft?: TaskEditDraft) => void;
  cancelEditing?: () => void;
  deleteTask: (id: string) => Promise<void> | void;
  onRowClick?: (task: TaskItem) => void;
  onSelectTask?: (task: TaskItem) => void;
  disableClickDebounce?: boolean;
}

export const TodoTreeItem: React.FC<TodoTreeItemProps> = ({
  task, depth = 0, isExpanded, editingTaskId, isCompleting = false, completingTaskIds,
  editDraft, setEditDraft, editNewTagInput, setEditNewTagInput,
  allTags = [], customTags = [], allFolders = [],
  selectedTag = null, setSelectedTag, selectedFolder = null, setSelectedFolder, setViewMode,
  handleAddCustomTag, handleRemoveCustomTag, handleToggleTask, handleToggleInProgress,
  saveEditing, cancelEditing, deleteTask, onRowClick, onSelectTask, disableClickDebounce = false,
}) => {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isChildrenCollapsed, setIsChildrenCollapsed] = useState(false);
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

  const [localTagInput, setLocalTagInput] = useState('');
  const tagInput = editNewTagInput !== undefined ? editNewTagInput : localTagInput;
  const setTagInput = setEditNewTagInput || setLocalTagInput;

  const priority = getTaskPriority(task);
  const priorityCfg = PRIORITY_CONFIG[priority];
  const deadline = getDeadlineInfo(task.dueDate || task.scheduledDate);
  const isTaskCompleted = task.isCompleted || isCompleting;

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
    if (currentOffset > 60) handleToggleTask(task);
    else if (currentOffset < -60) { e.stopPropagation(); e.preventDefault(); void deleteTask(task.id); }
  };

  const handleClick = () => {
    if (justSwipedRef.current) { justSwipedRef.current = false; return; }
    if (onRowClick) onRowClick(task);
    else {
      if (isControlledExpanded === undefined) setLocalExpanded((p) => !p);
      onSelectTask?.(task);
    }
  };

  const handleAddTag = (tag: string) => {
    handleAddCustomTag?.(tag);
    if (!draft.tags.includes(tag)) setDraft((p) => ({ ...p, tags: [...p.tags, tag] }));
    setTagInput('');
  };

  const indentPx = Math.min(depth * 20, 80);

  return (
    <div className="flex flex-col w-full" style={{ paddingLeft: depth > 0 ? `${indentPx}px` : undefined }}>
      <div className="relative overflow-hidden rounded-2xl">
        {/* Swipe action background indicators */}
        <div className={`absolute inset-0 flex items-center justify-between px-5 rounded-2xl pointer-events-none transition-colors ${swipeOffset > 0 ? 'bg-emerald-500 text-white' : swipeOffset < 0 ? 'bg-rose-500 text-white' : 'bg-transparent'}`}>
          <div className={`flex items-center gap-2 font-bold text-xs transition-opacity duration-150 ${swipeOffset > 30 ? 'opacity-100' : 'opacity-0'}`}>
            <CheckCircle2 size={20} /><span>{isTaskCompleted ? 'Wiedereröffnen' : 'Erledigen'}</span>
          </div>
          <div className={`flex items-center gap-2 font-bold text-xs transition-opacity duration-150 ${swipeOffset < -30 ? 'opacity-100' : 'opacity-0'}`}>
            <span>Löschen</span><Trash2 size={20} />
          </div>
        </div>

        {/* Foreground card */}
        <div
          style={{ transform: `translateX(${swipeOffset}px)`, transition: isSwiping ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)', touchAction: 'pan-y' }}
          onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onClick={handleClick}
          className={`relative group flex flex-col p-3.5 sm:p-4 rounded-2xl border transition-colors duration-150 cursor-pointer ${
            expanded
              ? task.status === 'in_progress' && !isTaskCompleted ? 'bg-white dark:bg-[#1a1a1a] border-amber-500/50 dark:border-amber-500/40 shadow-sm' : 'bg-white dark:bg-[#1a1a1a] border-blue-500/50 dark:border-blue-500/40 shadow-sm'
              : isTaskCompleted ? 'border-gray-100 dark:border-white/5 bg-gray-50/60 dark:bg-[#161616] opacity-75'
              : task.status === 'in_progress' ? 'bg-amber-500/[0.04] dark:bg-amber-500/[0.06] border-amber-500/40 dark:border-amber-500/30 hover:border-amber-500/60 dark:hover:border-amber-500/50 shadow-2xs hover:shadow-xs'
              : 'bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20 shadow-2xs hover:shadow-xs'
          }`}
        >
          {/* Top row */}
          <div className="min-w-0 w-full flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
              {task.children && task.children.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setIsChildrenCollapsed((p) => !p); }}
                  className="p-1 -ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors shrink-0"
                  aria-label={isChildrenCollapsed ? 'Unteraufgaben anzeigen' : 'Unteraufgaben ausblenden'}
                >
                  <ChevronDown size={14} className={`transition-transform duration-200 ${isChildrenCollapsed ? '-rotate-90' : ''}`} />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleToggleTask(task); }}
                className="p-1 -ml-1 text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400 transition-colors shrink-0 cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center"
                aria-label={isTaskCompleted ? 'Als unvollständig markieren' : 'Als erledigt markieren'}
              >
                {isTaskCompleted ? <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-500/20" /> : <Circle className="w-5 h-5 hover:text-blue-500 transition-colors" />}
              </button>

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleToggleInProgress(task); }}
                className={`p-1 rounded-lg transition-all shrink-0 cursor-pointer min-w-[30px] min-h-[30px] flex items-center justify-center opacity-100 ${
                  task.status === 'in_progress' ? 'text-amber-500 bg-amber-500/20 hover:bg-amber-500/30 ring-1 ring-amber-500/40 shadow-xs' : 'text-gray-400 hover:text-amber-500 hover:bg-amber-500/10 dark:text-gray-400 dark:hover:text-amber-400'
                }`}
                title={task.status === 'in_progress' ? 'In Bearbeitung - klicken um zurückzusetzen' : "Als 'in Bearbeitung' markieren"}
              >
                <Timer className={`w-4 h-4 ${task.status === 'in_progress' ? 'animate-pulse' : ''}`} />
              </button>

              <span className={`text-sm font-semibold truncate min-w-0 flex-1 ${isTaskCompleted ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
                {task.title}
              </span>
              {task.children && task.children.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-white/10 text-gray-500 font-medium shrink-0">
                  {task.children.filter((c) => c.isCompleted).length}/{task.children.length}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {task.status === 'in_progress' && !isTaskCompleted && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /><span>In Bearbeitung</span>
                </span>
              )}
              {isTaskCompleted && task.completedAt ? (
                <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-lg text-[11px] sm:text-xs font-medium border bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/10">
                  <Check size={11} className="text-emerald-500" /><span>{format(new Date(task.completedAt), 'dd.MM.yyyy')}</span>
                </span>
              ) : deadline ? (
                <span className={`inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-lg text-[11px] sm:text-xs font-medium border ${getDeadlineChipClasses(deadline.status, isTaskCompleted)}`}>
                  {deadline.status === 'overdue' && !isTaskCompleted ? <AlertCircle size={12} /> : <Calendar size={12} />}<span>{deadline.label}</span>
                </span>
              ) : null}
              <span className={`inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[11px] sm:text-xs font-semibold border ${priorityCfg.bg} ${priorityCfg.text} ${priorityCfg.border}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${priorityCfg.dot}`} /><span>{priorityCfg.label}</span>
              </span>
            </div>
          </div>

          {/* Bottom row: Tags and folder badges */}
          {((task.tags && task.tags.length > 0) || task.folder) && (
            <div className="min-w-0 flex flex-wrap items-center gap-1.5 mt-1.5 pl-7 sm:pl-9">
              {task.tags?.map((tag) => (
                <span
                  key={tag}
                  onClick={(e) => { e.stopPropagation(); setSelectedTag?.(selectedTag === tag ? null : tag); setViewMode?.('tasks'); }}
                  className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    selectedTag === tag ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-500/40 shadow-2xs' : 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-500/20'
                  }`}
                  title={`Nach #${tag} filtern`}
                >
                  #{tag}
                </span>
              ))}
              {task.folder && (
                <span
                  onClick={(e) => { e.stopPropagation(); setSelectedFolder?.(selectedFolder === task.folder ? null : (task.folder || null)); setViewMode?.('tasks'); }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 transition-colors cursor-pointer"
                  title={`Nur Ordner "${task.folder}" anzeigen`}
                >
                  <Folder size={11} /><span>{task.folder}</span>
                </span>
              )}
            </div>
          )}

          {/* Expanded Edit Form */}
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                key={`accordion-${task.id}`}
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }} className="overflow-hidden" onClick={(e) => e.stopPropagation()}
              >
                <div className="pt-3.5 mt-3 border-t border-gray-100 dark:border-white/10 flex flex-col gap-3.5">
                  <div className="flex flex-col md:flex-row gap-3.5 items-start">
                    <div className="w-full md:w-[65%] flex flex-col gap-2.5">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Titel</label>
                        <input
                          type="text" value={draft.title} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
                          placeholder="Titel der Aufgabe"
                          className="w-full px-3 py-2 text-sm font-medium bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 min-h-[38px]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Beschreibung</label>
                        <textarea
                          value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
                          placeholder="Optionale Notiz oder Beschreibung..." rows={3}
                          className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
                        />
                      </div>
                    </div>

                    <div className="w-full md:w-[35%] flex flex-col gap-2.5">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Status</label>
                        <select
                          value={draft.status} onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value as 'todo' | 'in_progress' | 'completed' }))}
                          className="w-full px-3 py-2 text-xs font-medium bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer min-h-[38px]"
                        >
                          <option value="todo">⚪ Offen</option>
                          <option value="in_progress">⏳ In Bearbeitung</option>
                          <option value="completed">✅ Erledigt</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Priorität</label>
                        <select
                          value={draft.priority} onChange={(e) => setDraft((p) => ({ ...p, priority: e.target.value as Priority }))}
                          className="w-full px-3 py-2 text-xs font-medium bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer min-h-[38px]"
                        >
                          {PRIORITY_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Fälligkeitsdatum / Uhrzeit</label>
                        <input
                          type="date" value={draft.dueDate} onChange={(e) => setDraft((p) => ({ ...p, dueDate: e.target.value }))}
                          className="w-full px-3 py-2 text-xs font-medium bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer min-h-[38px]"
                          aria-label="Fälligkeitsdatum / Uhrzeit"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
                    <div className="flex flex-col gap-1.5 md:col-span-1">
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <Tag size={13} className="text-blue-500" /><span>Tags</span>
                      </label>
                      <div className="flex flex-wrap items-center gap-1.5 p-2 bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl min-h-[42px]">
                        {allTags.map((tag) => {
                          const isSelected = draft.tags.includes(tag);
                          return (
                            <button
                              key={tag} type="button"
                              onClick={() => setDraft((p) => ({ ...p, tags: isSelected ? p.tags.filter((t) => t !== tag) : [...p.tags, tag] }))}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                                isSelected ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/40 shadow-2xs' : 'bg-white dark:bg-white/5 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'
                              }`}
                            >
                              <span>#{tag}</span>
                              {isSelected ? <Check size={11} className="text-blue-500" /> : customTags.includes(tag) ? (
                                <span onClick={(e) => { e.stopPropagation(); handleRemoveCustomTag?.(tag); }} className="text-gray-400 hover:text-rose-500 ml-0.5 p-0.5 transition-colors" title={`Tag "${tag}" löschen`}>
                                  <X size={10} />
                                </span>
                              ) : null}
                            </button>
                          );
                        })}

                        <div className="inline-flex items-center gap-1 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-lg px-2 py-0.5">
                          <span className="text-xs text-gray-400">#</span>
                          <input
                            type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const t = tagInput.trim().replace(/^#/, ''); if (t) handleAddTag(t); } }}
                            placeholder="Neuer Tag..." className="w-20 sm:w-24 text-xs bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none py-0.5"
                          />
                          {tagInput.trim() && (
                            <button type="button" onClick={() => { const t = tagInput.trim().replace(/^#/, ''); if (t) handleAddTag(t); }} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 p-0.5 cursor-pointer" title="Tag hinzufügen">
                              <Plus size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 md:col-span-1">
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <Folder size={13} className="text-blue-500" /><span>Ordner</span>
                      </label>
                      <select
                        value={draft.folder} onChange={(e) => setDraft((p) => ({ ...p, folder: e.target.value }))}
                        className="w-full px-3 py-2 text-xs font-medium bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer min-h-[42px]"
                      >
                        <option value="">Kein Ordner</option>
                        {allFolders.map((f) => (<option key={f} value={f}>{f}</option>))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5 md:col-span-1">
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <Repeat size={13} className="text-purple-500" /><span>Wiederholung</span>
                      </label>
                      <div className="flex flex-col gap-2">
                        <select
                          value={draft.recurrence} onChange={(e) => setDraft((p) => ({ ...p, recurrence: e.target.value as RecurrenceType }))}
                          className="w-full px-3 py-2 text-xs font-medium bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer min-h-[42px]"
                        >
                          {RECURRENCE_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                        </select>
                        {draft.recurrence !== 'none' && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">Bis:</span>
                            <input
                              type="date" value={draft.recurrenceEnd} onChange={(e) => setDraft((p) => ({ ...p, recurrenceEnd: e.target.value }))}
                              className="w-full px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none cursor-pointer min-h-[36px]"
                              aria-label="Wiederholen bis"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center pt-1">
                    <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-700 dark:text-gray-300 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                      <Calendar size={13} className="text-blue-500 shrink-0" />
                      <span>Im Kalender anzeigen</span>
                      <input
                        type="checkbox" checked={draft.showInCalendar} onChange={(e) => setDraft((p) => ({ ...p, showInCalendar: e.target.checked }))}
                        className="rounded border-gray-300 dark:border-white/20 text-blue-600 focus:ring-blue-500/40 cursor-pointer h-3.5 w-3.5 ml-1"
                      />
                    </label>
                  </div>

                  {/* Footer actions */}
                  <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-100 dark:border-white/5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); void deleteTask(task.id); }}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 border border-rose-200 dark:border-rose-900/40 rounded-xl transition-colors cursor-pointer min-h-[36px]"
                        title="Aufgabe löschen"
                      >
                        <Trash2 size={15} /><span>Löschen</span>
                      </button>

                      {isTaskCompleted && (
                        <button
                          type="button" onClick={(e) => { e.stopPropagation(); handleToggleTask(task); }}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-900/40 rounded-xl transition-colors cursor-pointer min-h-[36px]"
                          title="Aufgabe wieder in die aktive Liste verschieben"
                        >
                          <RotateCcw size={13} /><span>Wiederherstellen</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button" onClick={(e) => { e.stopPropagation(); cancelEditing?.(); if (isControlledExpanded === undefined) setLocalExpanded(false); }}
                        className="flex items-center justify-center gap-1 px-3.5 py-2 text-xs rounded-xl font-medium bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 transition-colors cursor-pointer min-h-[36px]"
                      >
                        <X size={13} /><span>Abbrechen</span>
                      </button>
                      <button
                        type="button" onClick={(e) => { e.stopPropagation(); if (!draft.title.trim()) return; saveEditing?.(task.id, draft); if (isControlledExpanded === undefined) setLocalExpanded(false); }}
                        disabled={!draft.title.trim()}
                        className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-opacity disabled:opacity-50 cursor-pointer min-h-[36px] shadow-xs"
                      >
                        <Check size={13} /><span>Speichern</span>
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Recursive subtasks */}
      {task.children && task.children.length > 0 && !isChildrenCollapsed && (
        <div className="flex flex-col gap-2 mt-2">
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
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default TodoTreeItem;
