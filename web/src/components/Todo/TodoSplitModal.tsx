'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GitFork, Plus, X, Check, ListTree, Tag, AlertCircle } from 'lucide-react';
import { useDataStore, TaskItem } from '@/store/useDataStore';
import { useTagRegistry } from './useTodoTags';
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
  const { resolve: resolveTags } = useTagRegistry();

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

      const subtaskTags = inheritMeta && parentTask.tags ? [...parentTask.tags] : [];

      for (let i = 0; i < parsedSubtasks.length; i++) {
        const title = parsedSubtasks[i];
        await addTask({
          title,
          parentId: parentTask.id,
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
            className="relative w-full max-w-lg bg-t2-surface  border border-t2-line  rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-t2-line-soft ">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-t2-sub  text-t2-accent  flex items-center justify-center shrink-0">
                  <GitFork size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-t2-ink ">
                    Aufgabe aufteilen
                  </h3>
                  <p className="text-xs text-t2-ink-2 ">
                    Erstelle mehrere Unteraufgaben für diese Aufgabe
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-t2-ink-3 hover:text-t2-ink-2  hover:bg-t2-hover  transition-colors cursor-pointer"
                aria-label="Schließen"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Content - Scrollable */}
            <div className="p-5 flex-1 overflow-y-auto flex flex-col gap-4">
              {/* Parent Task Card */}
              <div className="p-3 rounded-xl bg-t2-sub  border border-t2-line  flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-t2-ink-3  uppercase tracking-wider">
                  Übergeordnete Aufgabe
                </span>
                <span className="text-sm font-semibold text-t2-ink  truncate">
                  {parentTask.title}
                </span>

                {/* Show badges if parent task has tags */}
                {(parentTask.tags && parentTask.tags.length > 0) && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1 pt-1 border-t border-t2-line ">
                    {resolveTags(parentTask.tags).map((tag) => (
                      <span
                        key={tag.id}
                        className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-t2-sub text-t2-accent "
                      >
                        <Tag size={10} />
                        <span>#{tag.title}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Subtask Input Area (Textarea) */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-t2-ink ">
                    Unteraufgaben eingeben (eine pro Zeile)
                  </label>
                  <span className="text-[11px] text-t2-ink-3 ">
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
                  className="w-full px-3 py-2.5 text-xs bg-t2-sub  border border-t2-line  rounded-xl text-t2-ink  placeholder-t2-ink-3  focus:outline-none focus:ring-2 focus:ring-t2-accent resize-none font-mono"
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
                  className="flex-1 px-3 py-2 text-xs bg-t2-sub  border border-t2-line  rounded-xl text-t2-ink  placeholder-t2-ink-3  focus:outline-none focus:ring-2 focus:ring-t2-accent"
                />
                <button
                  type="button"
                  onClick={handleAddQuickInput}
                  disabled={!quickInput.trim()}
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-t2-accent  bg-t2-sub hover:bg-t2-sub   border border-t2-line  rounded-xl transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0 min-h-[36px]"
                >
                  <Plus size={14} />
                  <span>Hinzufügen</span>
                </button>
              </div>

              {/* Live Preview List */}
              {parsedSubtasks.length > 0 && (
                <div className="flex flex-col gap-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-t2-ink-2  flex items-center gap-1.5">
                    <ListTree size={13} className="text-t2-accent" />
                    <span>Vorschau der neuen Unteraufgaben:</span>
                  </span>
                  <div className="max-h-36 overflow-y-auto p-2 bg-t2-sub  border border-t2-line  rounded-xl flex flex-col gap-1">
                    {parsedSubtasks.map((taskTitle, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-t2-surface  border border-t2-line  rounded-lg text-xs group"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="w-4 h-4 rounded-full border border-t2-line  flex items-center justify-center text-[11px] text-t2-ink-3 shrink-0">
                            {idx + 1}
                          </span>
                          <span className="truncate font-medium text-t2-ink ">
                            {taskTitle}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSubtask(idx)}
                          className="text-t2-ink-3 hover:text-rose-500 transition-colors p-0.5 cursor-pointer opacity-70 group-hover:opacity-100 shrink-0"
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
              <div className="pt-2 border-t border-t2-line-soft  flex flex-col gap-3">
                {/* Priority Option */}
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs font-semibold text-t2-ink ">
                    Priorität der Unteraufgaben
                  </label>
                  <select
                    value={priorityChoice}
                    onChange={(e) =>
                      setPriorityChoice(e.target.value as Priority | 'inherit')
                    }
                    className="px-2.5 py-1.5 text-xs font-medium bg-t2-sub  border border-t2-line  rounded-xl text-t2-ink  focus:outline-none focus:ring-2 focus:ring-t2-accent cursor-pointer min-h-[34px]"
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
                <label className="inline-flex items-center gap-2 text-xs font-medium text-t2-ink  cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={inheritMeta}
                    onChange={(e) => setInheritMeta(e.target.checked)}
                    className="rounded border-t2-line  text-t2-accent focus:ring-t2-accent cursor-pointer h-4 w-4"
                  />
                  <span>Tags der übergeordneten Aufgabe übernehmen</span>
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
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-t2-line-soft  bg-t2-sub ">
              <span className="text-[11px] text-t2-ink-2 ">
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
                  className="px-3.5 py-2 text-xs font-medium rounded-xl bg-t2-hover hover:bg-t2-stage   text-t2-ink  transition-colors cursor-pointer min-h-[36px]"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={parsedSubtasks.length === 0 || isSubmitting}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl text-t2-accent-ink bg-t2-accent hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer min-h-[36px] shadow-xs"
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
