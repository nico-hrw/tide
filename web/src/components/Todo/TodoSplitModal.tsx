'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GitFork, Plus, X, Check, ListTree, Tag, Folder, AlertCircle } from 'lucide-react';
import { useDataStore, TaskItem } from '@/store/useDataStore';
import { Priority, PRIORITY_OPTIONS, TaskWithChildren, getTaskPriority } from './types';

export interface TodoSplitModalProps {
  isOpen: boolean;
  onClose: () => void;
  parentTask: TaskItem | TaskWithChildren;
  onSuccess?: (createdCount: number) => void;
}

export const TodoSplitModal: React.FC<TodoSplitModalProps> = ({
  isOpen,
  onClose,
  parentTask,
  onSuccess,
}) => {
  const addTask = useDataStore((s) => s.addTask);

  const [rawText, setRawText] = useState('');
  const [quickInput, setQuickInput] = useState('');
  const [priorityChoice, setPriorityChoice] = useState<Priority | 'inherit'>('inherit');
  const [inheritMeta, setInheritMeta] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const quickInputRef = useRef<HTMLInputElement | null>(null);

  // Reset inputs when modal opens with a new or same task
  useEffect(() => {
    if (isOpen) {
      setRawText('');
      setQuickInput('');
      setPriorityChoice('inherit');
      setInheritMeta(true);
      setIsSubmitting(false);
      setFeedback(null);
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [isOpen, parentTask.id]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Parse lines into list of subtask titles
  const parsedSubtasks = useMemo(() => {
    return rawText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }, [rawText]);

  const handleAddQuickInput = () => {
    const trimmed = quickInput.trim();
    if (!trimmed) return;
    setRawText((prev) => (prev ? `${prev}\n${trimmed}` : trimmed));
    setQuickInput('');
    quickInputRef.current?.focus();
  };

  const handleRemoveSubtask = (indexToRemove: number) => {
    const lines = rawText.split('\n').filter((l) => l.trim().length > 0);
    const updated = lines.filter((_, idx) => idx !== indexToRemove).join('\n');
    setRawText(updated);
  };

  const handleConfirm = async () => {
    if (parsedSubtasks.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const resolvedPriority: Priority =
        priorityChoice === 'inherit' ? getTaskPriority(parentTask) : priorityChoice;

      const subtaskFolder = inheritMeta && parentTask.folder ? parentTask.folder : undefined;
      const subtaskTags = inheritMeta && parentTask.tags ? [...parentTask.tags] : [];

      for (let i = 0; i < parsedSubtasks.length; i++) {
        const title = parsedSubtasks[i];
        await addTask({
          title,
          parentId: parentTask.id,
          folder: subtaskFolder,
          tags: subtaskTags,
          priority: resolvedPriority,
          isCompleted: false,
          status: 'todo',
          order: i,
        });
      }

      const count = parsedSubtasks.length;
      const msg = `${count} ${count === 1 ? 'Unteraufgabe' : 'Unteraufgaben'} erfolgreich erstellt`;

      // Trigger feedback event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('tide:toast', {
            detail: { message: msg },
          })
        );
      }

      onSuccess?.(count);
      onClose();
    } catch (err) {
      console.error('Failed to split task into subtasks:', err);
      setFeedback('Fehler beim Erstellen der Unteraufgaben.');
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative w-full max-w-lg bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <GitFork size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                    Aufgabe aufteilen
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Erstelle mehrere Unteraufgaben für diese Aufgabe
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                aria-label="Schließen"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Content - Scrollable */}
            <div className="p-5 flex-1 overflow-y-auto flex flex-col gap-4">
              {/* Parent Task Card */}
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-[#252525] border border-gray-200 dark:border-white/10 flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  Übergeordnete Aufgabe
                </span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {parentTask.title}
                </span>

                {/* Show badges if parent task has folder or tags */}
                {(parentTask.folder || (parentTask.tags && parentTask.tags.length > 0)) && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1 pt-1 border-t border-gray-200/60 dark:border-white/5">
                    {parentTask.folder && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <Folder size={10} />
                        <span>{parentTask.folder}</span>
                      </span>
                    )}
                    {parentTask.tags?.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                      >
                        <Tag size={10} />
                        <span>#{tag}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Subtask Input Area (Textarea) */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Unteraufgaben eingeben (eine pro Zeile)
                  </label>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500">
                    {parsedSubtasks.length}{' '}
                    {parsedSubtasks.length === 1 ? 'Aufgabe' : 'Aufgaben'}
                  </span>
                </div>
                <textarea
                  ref={textareaRef}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder={`Recherche durchführen\nErsten Entwurf schreiben\nFeedback einholen`}
                  rows={4}
                  className="w-full px-3 py-2.5 text-xs bg-gray-50 dark:bg-[#252525] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none font-mono"
                />
              </div>

              {/* Quick Add Row */}
              <div className="flex items-center gap-2">
                <input
                  ref={quickInputRef}
                  type="text"
                  value={quickInput}
                  onChange={(e) => setQuickInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddQuickInput();
                    }
                  }}
                  placeholder="Einzelne Aufgabe schnell hinzufügen..."
                  className="flex-1 px-3 py-2 text-xs bg-gray-50 dark:bg-[#252525] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                <button
                  type="button"
                  onClick={handleAddQuickInput}
                  disabled={!quickInput.trim()}
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 dark:hover:bg-blue-900/40 border border-blue-200 dark:border-blue-900/40 rounded-xl transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0 min-h-[36px]"
                >
                  <Plus size={14} />
                  <span>Hinzufügen</span>
                </button>
              </div>

              {/* Live Preview List */}
              {parsedSubtasks.length > 0 && (
                <div className="flex flex-col gap-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                    <ListTree size={13} className="text-blue-500" />
                    <span>Vorschau der neuen Unteraufgaben:</span>
                  </span>
                  <div className="max-h-36 overflow-y-auto p-2 bg-gray-50 dark:bg-[#252525] border border-gray-200 dark:border-white/10 rounded-xl flex flex-col gap-1">
                    {parsedSubtasks.map((taskTitle, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-white dark:bg-[#1e1e1e] border border-gray-200/60 dark:border-white/5 rounded-lg text-xs group"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="w-4 h-4 rounded-full border border-gray-300 dark:border-white/20 flex items-center justify-center text-[9px] text-gray-400 shrink-0">
                            {idx + 1}
                          </span>
                          <span className="truncate font-medium text-gray-800 dark:text-gray-200">
                            {taskTitle}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSubtask(idx)}
                          className="text-gray-400 hover:text-rose-500 transition-colors p-0.5 cursor-pointer opacity-70 group-hover:opacity-100 shrink-0"
                          title="Entfernen"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Settings / Options */}
              <div className="pt-2 border-t border-gray-100 dark:border-white/10 flex flex-col gap-3">
                {/* Priority Option */}
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Priorität der Unteraufgaben
                  </label>
                  <select
                    value={priorityChoice}
                    onChange={(e) =>
                      setPriorityChoice(e.target.value as Priority | 'inherit')
                    }
                    className="px-2.5 py-1.5 text-xs font-medium bg-gray-50 dark:bg-[#252525] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer min-h-[34px]"
                  >
                    <option value="inherit">Wie übergeordnete Aufgabe</option>
                    {PRIORITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Inherit Metadata Checkbox */}
                <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={inheritMeta}
                    onChange={(e) => setInheritMeta(e.target.checked)}
                    className="rounded border-gray-300 dark:border-white/20 text-blue-600 focus:ring-blue-500/40 cursor-pointer h-4 w-4"
                  />
                  <span>Ordner & Tags der übergeordneten Aufgabe übernehmen</span>
                </label>
              </div>

              {/* Feedback error display if any */}
              {feedback && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{feedback}</span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-100 dark:border-white/10 bg-gray-50/50 dark:bg-[#1a1a1a]/50">
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                {parsedSubtasks.length > 0
                  ? `${parsedSubtasks.length} ${
                      parsedSubtasks.length === 1
                        ? 'Unteraufgabe wird'
                        : 'Unteraufgaben werden'
                    } erstellt`
                  : 'Mindestens eine Zeile erforderlich'}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-3.5 py-2 text-xs font-medium rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 transition-colors cursor-pointer min-h-[36px]"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={parsedSubtasks.length === 0 || isSubmitting}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl text-white bg-blue-600 hover:bg-blue-700 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer min-h-[36px] shadow-xs"
                >
                  <Check size={14} />
                  <span>
                    {isSubmitting
                      ? 'Wird erstellt...'
                      : `Aufteilen (${parsedSubtasks.length})`}
                  </span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default TodoSplitModal;
