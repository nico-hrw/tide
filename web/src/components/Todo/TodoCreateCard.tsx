'use client';

import React from 'react';
import { Plus, X, Folder, Tag, Check, Repeat, Calendar } from 'lucide-react';
import { Priority, RecurrenceType, PRIORITY_OPTIONS, RECURRENCE_OPTIONS } from './types';

export interface TaskCreateDraft {
  title: string;
  description: string;
  priority: Priority;
  dueDate: string;
  recurrence: RecurrenceType;
  recurrenceEnd: string;
  folder: string;
  tags: string[];
  showInCalendar: boolean;
}

export interface TodoCreateCardProps {
  draft: TaskCreateDraft;
  setDraft: React.Dispatch<React.SetStateAction<TaskCreateDraft>>;
  titleInputRef: React.RefObject<HTMLInputElement | null>;
  newTagInput: string;
  setNewTagInput: React.Dispatch<React.SetStateAction<string>>;
  allTags: string[];
  customTags: string[];
  allFolders: string[];
  isSubmitting: boolean;
  handleAddTask: (e: React.FormEvent) => void | Promise<void>;
  handleAddCustomTag: (tag: string) => void;
  handleRemoveCustomTag: (tag: string) => void;
  onClose: () => void;
}

export const TodoCreateCard: React.FC<TodoCreateCardProps> = ({
  draft, setDraft, titleInputRef, newTagInput, setNewTagInput, allTags, customTags, allFolders,
  isSubmitting, handleAddTask, handleAddCustomTag, handleRemoveCustomTag, onClose,
}) => {
  return (
            <div className="bg-white dark:bg-[#1a1a1a] border border-blue-500/30 dark:border-blue-500/30 rounded-2xl p-4 sm:p-5 shadow-2xs transition-all">
              <form onSubmit={handleAddTask} className="flex flex-col gap-3 sm:gap-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Plus size={16} className="text-blue-500" />
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">Neue Aufgabe erstellen</h3>
                  </div>
                  <button type="button" onClick={() => onClose()} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg transition-colors cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center" aria-label="Schließen">
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
                    <button type="button" onClick={() => onClose()} className="flex-1 sm:flex-none px-3 py-2 text-xs rounded-xl font-medium bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 transition-colors cursor-pointer min-h-[36px]">
                      Abbrechen
                    </button>
                    <button type="submit" disabled={!draft.title.trim() || isSubmitting} className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-xs cursor-pointer min-h-[36px]">
                      <Plus size={14} /><span>Aufgabe hinzufügen</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
  );
};

export default TodoCreateCard;
