'use client';

import React, { useRef } from 'react';
import { Plus, X, Folder, Tag, Check, Repeat, Calendar } from 'lucide-react';
import type { Tag as TagItem } from '@/lib/tags';
import { DEFAULT_TAG_COLOR } from './useTodoTags';
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
  parentId?: string | null;
  order?: number;
}

export interface TodoCreateCardProps {
  draft: TaskCreateDraft;
  setDraft: React.Dispatch<React.SetStateAction<TaskCreateDraft>>;
  titleInputRef: React.RefObject<HTMLInputElement | null>;
  newTagInput: string;
  setNewTagInput: React.Dispatch<React.SetStateAction<string>>;
  allTags: TagItem[];
  allFolders: string[];
  isSubmitting: boolean;
  handleAddTask: (e: React.FormEvent) => void | Promise<void>;
  /** Returns the id of the existing or newly created tag with this name. */
  handleCreateTag: (name: string) => Promise<string | undefined>;
  onClose: () => void;
}

export const TodoCreateCard: React.FC<TodoCreateCardProps> = ({
  draft, setDraft, titleInputRef, newTagInput, setNewTagInput, allTags, allFolders,
  isSubmitting, handleAddTask, handleCreateTag, onClose,
}) => {
  const creatingTag = useRef(false);
  const addNewTag = async () => {
    const trimmed = newTagInput.trim().replace(/^#/, '');
    if (!trimmed || creatingTag.current) return;
    creatingTag.current = true;
    let id: string | undefined;
    try {
      id = await handleCreateTag(trimmed);
    } finally {
      creatingTag.current = false;
    }
    if (id) {
      setDraft((p) => (p.tags.includes(id) ? p : { ...p, tags: [...p.tags, id] }));
    }
    setNewTagInput('');
  };

  return (
            <div className="bg-t2-surface  border border-t2-accent  rounded-2xl p-4 sm:p-5 shadow-2xs transition-all">
              <form onSubmit={handleAddTask} className="flex flex-col gap-3 sm:gap-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Plus size={16} className="text-t2-accent" />
                    <h3 className="text-sm font-bold text-t2-ink ">Neue Aufgabe erstellen</h3>
                  </div>
                  <button type="button" onClick={() => onClose()} className="p-1.5 text-t2-ink-3 hover:text-t2-ink-2  rounded-lg transition-colors cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center" aria-label="Schließen">
                    <X size={16} />
                  </button>
                </div>

                <input
                  ref={titleInputRef}
                  type="text" value={draft.title} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Was möchtest du erledigen?..." autoFocus
                  className="w-full px-4 py-2.5 text-sm bg-t2-sub  border border-t2-line  rounded-xl text-t2-ink  placeholder-t2-ink-3  focus:outline-none focus:ring-2 focus:ring-t2-accent min-h-[40px]"
                />

                <textarea
                  value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Optionale Notiz oder Beschreibung..." rows={2}
                  className="w-full px-4 py-2 text-xs bg-t2-sub  border border-t2-line  rounded-xl text-t2-ink  placeholder-t2-ink-3  focus:outline-none focus:ring-2 focus:ring-t2-accent resize-none"
                />

                {/* Tag selector chips in Create Form */}
                <div className="flex flex-col gap-1.5 pt-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-t2-ink-2  font-medium">
                    <Tag size={13} className="text-t2-accent" />
                    <span>Tags:</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {allTags.map((tag) => {
                      const isSelected = draft.tags.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => {
                            setDraft((p) => ({
                              ...p,
                              tags: isSelected ? p.tags.filter((t) => t !== tag.id) : [...p.tags, tag.id],
                            }));
                          }}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-t2-sub text-t2-accent  border-t2-accent shadow-2xs'
                              : 'bg-t2-hover  text-t2-ink-2  border-t2-line  hover:border-t2-line '
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color || DEFAULT_TAG_COLOR }} />
                          <span>{tag.title}</span>
                          {isSelected && <Check size={11} className="text-t2-accent" />}
                        </button>
                      );
                    })}

                    <div className="inline-flex items-center gap-1 bg-t2-sub  border border-t2-line  rounded-lg px-2 py-0.5">
                      <span className="text-xs text-t2-ink-3">#</span>
                      <input
                        type="text"
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void addNewTag();
                          }
                        }}
                        placeholder="Neuer Tag..."
                        className="w-20 sm:w-24 text-xs bg-transparent text-t2-ink  placeholder-t2-ink-3  focus:outline-none py-0.5"
                      />
                      {newTagInput.trim() && (
                        <button
                          type="button"
                          onClick={() => {
                            void addNewTag();
                          }}
                          className="text-t2-accent  hover:text-t2-accent p-0.5 cursor-pointer"
                          title="Tag hinzufügen"
                        >
                          <Plus size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 pt-1 border-t border-t2-line-soft ">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 w-full sm:w-auto">
                    <select
                      value={draft.priority} onChange={(e) => setDraft((p) => ({ ...p, priority: e.target.value as Priority }))}
                      className="px-3 py-1.5 text-xs font-medium bg-t2-sub  border border-t2-line  rounded-xl text-t2-ink  focus:outline-none focus:ring-2 focus:ring-t2-accent cursor-pointer min-h-[36px]"
                      aria-label="Priorität"
                    >
                      {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>

                    <div className="flex items-center gap-1.5 flex-1 sm:flex-none min-w-[130px]">
                      <Folder size={14} className="text-t2-accent shrink-0" />
                      <input
                        list="todo-folder-options"
                        type="text"
                        value={draft.folder}
                        onChange={(e) => setDraft((p) => ({ ...p, folder: e.target.value }))}
                        placeholder="Ordner (optional)"
                        className="px-3 py-1.5 text-xs font-medium bg-t2-sub  border border-t2-line  rounded-xl text-t2-ink  placeholder-t2-ink-3  focus:outline-none focus:ring-2 focus:ring-t2-accent w-full sm:w-44 min-h-[36px]"
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
                          className="text-t2-ink-3 hover:text-t2-ink-2  p-1 min-w-[28px] min-h-[28px] flex items-center justify-center"
                          title="Ordner entfernen"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    <input
                      type="date" value={draft.dueDate} onChange={(e) => setDraft((p) => ({ ...p, dueDate: e.target.value }))}
                      className="px-3 py-1.5 text-xs font-medium bg-t2-sub  border border-t2-line  rounded-xl text-t2-ink  focus:outline-none focus:ring-2 focus:ring-t2-accent cursor-pointer min-h-[36px]"
                      aria-label="Fälligkeitsdatum"
                    />
                    <div className="flex items-center gap-1.5">
                      <Repeat size={14} className="text-t2-accent shrink-0" />
                      <select
                        value={draft.recurrence} onChange={(e) => setDraft((p) => ({ ...p, recurrence: e.target.value as RecurrenceType }))}
                        className="px-3 py-1.5 text-xs bg-t2-sub  border border-t2-line  rounded-xl text-t2-ink  focus:outline-none cursor-pointer min-h-[36px]"
                        aria-label="Wiederholung"
                      >
                        {RECURRENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    {draft.recurrence !== 'none' && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-t2-ink-2 ">Bis:</span>
                        <input
                          type="date" value={draft.recurrenceEnd} onChange={(e) => setDraft((p) => ({ ...p, recurrenceEnd: e.target.value }))}
                          className="px-3 py-1.5 text-xs bg-t2-sub  border border-t2-line  rounded-xl text-t2-ink  focus:outline-none cursor-pointer min-h-[36px]"
                          aria-label="Wiederholen bis"
                        />
                      </div>
                    )}

                    <label className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-t2-sub  border border-t2-line  rounded-xl text-t2-ink  cursor-pointer min-h-[36px] select-none hover:bg-t2-hover  transition-colors">
                      <Calendar size={14} className="text-t2-accent shrink-0" />
                      <span>Im Kalender anzeigen</span>
                      <input
                        type="checkbox"
                        checked={draft.showInCalendar}
                        onChange={(e) => setDraft((p) => ({ ...p, showInCalendar: e.target.checked }))}
                        className="rounded border-t2-line  text-t2-accent focus:ring-t2-accent cursor-pointer h-3.5 w-3.5 ml-1"
                      />
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-2 w-full sm:w-auto pt-2 sm:pt-0">
                    <button type="button" onClick={() => onClose()} className="flex-1 sm:flex-none px-3 py-2 text-xs rounded-xl font-medium bg-t2-hover hover:bg-t2-stage   text-t2-ink  transition-colors cursor-pointer min-h-[36px]">
                      Abbrechen
                    </button>
                    <button type="submit" disabled={!draft.title.trim() || isSubmitting} className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-t2-accent-ink bg-t2-accent hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-xs cursor-pointer min-h-[36px]">
                      <Plus size={14} /><span>Aufgabe hinzufügen</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
  );
};

export default TodoCreateCard;
