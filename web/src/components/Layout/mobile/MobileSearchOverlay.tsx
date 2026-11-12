import React, { useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, SearchX, X, Calendar, CheckCircle2, FileText, Check } from 'lucide-react';

export interface SearchEventItem {
  id: string;
  title: string;
  time?: string;
  start?: string | Date;
  end?: string | Date;
  dotColor?: string;
  tag?: string;
}

export interface SearchTodoItem {
  id: string;
  title: string;
  completed?: boolean;
  isCompleted?: boolean;
  priority?: 'high' | 'medium' | 'low' | string;
  tag?: string;
}

export interface SearchNoteItem {
  id: string;
  title: string;
  preview?: string;
  tag?: string;
  updatedAt?: string;
}

export interface MobileSearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (query: string) => void;
  events?: SearchEventItem[];
  todos?: SearchTodoItem[];
  notes?: SearchNoteItem[];
  onSelectEvent?: (event: SearchEventItem) => void;
  onSelectTodo?: (todo: SearchTodoItem) => void;
  onSelectNote?: (note: SearchNoteItem) => void;
  onToggleTodo?: (id: string) => void;
  placeholder?: string;
}

function formatEventTime(start?: string | Date, end?: string | Date): string {
  if (!start) return '';
  try {
    const s = typeof start === 'string' ? new Date(start) : start;
    if (isNaN(s.getTime())) return '';
    const startStr = s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (!end) return startStr;
    const e = typeof end === 'string' ? new Date(end) : end;
    if (isNaN(e.getTime())) return startStr;
    const endStr = e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${startStr} – ${endStr}`;
  } catch {
    return '';
  }
}

function renderPriorityBadge(priority?: string) {
  if (!priority) return null;
  const p = priority.toLowerCase();
  if (p === 'high' || p === '^') {
    return (
      <span className="w-5 h-5 rounded-md bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 text-[11px] font-black flex items-center justify-center shrink-0">
        ^
      </span>
    );
  }
  if (p === 'medium' || p === '-') {
    return (
      <span className="w-5 h-5 rounded-md bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400 text-[11px] font-black flex items-center justify-center shrink-0">
        -
      </span>
    );
  }
  if (p === 'low' || p === 'v') {
    return (
      <span className="w-5 h-5 rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 text-[11px] font-black flex items-center justify-center shrink-0">
        v
      </span>
    );
  }
  return null;
}

export const MobileSearchOverlay: React.FC<MobileSearchOverlayProps> = ({
  isOpen,
  onClose,
  query,
  onQueryChange,
  events = [],
  todos = [],
  notes = [],
  onSelectEvent,
  onSelectTodo,
  onSelectNote,
  onToggleTodo,
  placeholder = 'Termine, Todos & Notizen durchsuchen...',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const trimmedQuery = query.trim().toLowerCase();

  const filteredEvents = useMemo(() => {
    if (!events) return [];
    if (!trimmedQuery) return events;
    return events.filter(
      (e) =>
        e.title.toLowerCase().includes(trimmedQuery) ||
        (e.tag && e.tag.toLowerCase().includes(trimmedQuery))
    );
  }, [events, trimmedQuery]);

  const filteredTodos = useMemo(() => {
    if (!todos) return [];
    if (!trimmedQuery) return todos;
    return todos.filter(
      (t) =>
        t.title.toLowerCase().includes(trimmedQuery) ||
        (t.tag && t.tag.toLowerCase().includes(trimmedQuery))
    );
  }, [todos, trimmedQuery]);

  const filteredNotes = useMemo(() => {
    if (!notes) return [];
    if (!trimmedQuery) return notes;
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(trimmedQuery) ||
        (n.preview && n.preview.toLowerCase().includes(trimmedQuery)) ||
        (n.tag && n.tag.toLowerCase().includes(trimmedQuery))
    );
  }, [notes, trimmedQuery]);

  const hasEvents = filteredEvents.length > 0;
  const hasTodos = filteredTodos.length > 0;
  const hasNotes = filteredNotes.length > 0;
  const totalResults = filteredEvents.length + filteredTodos.length + filteredNotes.length;
  const hasQuery = trimmedQuery.length > 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="mobile-search-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-40 bg-white/70 dark:bg-neutral-950/70 backdrop-blur-xl flex flex-col justify-end p-4 pb-6"
          onClick={onClose}
        >
          <motion.div
            key="mobile-search-content"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="w-full flex flex-col justify-end max-w-lg mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Scrollable results area above the search bar */}
            {totalResults > 0 && (
              <div className="bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md rounded-3xl border border-neutral-200/80 dark:border-neutral-800 shadow-xl p-4 flex flex-col max-h-[70vh] overflow-y-auto mb-3">
                {/* Section 1: Termine */}
                {hasEvents && (
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between px-1.5 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                          Termine
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500">
                        {filteredEvents.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {filteredEvents.map((ev) => {
                        const timeText = ev.time || formatEventTime(ev.start, ev.end);
                        return (
                          <div
                            key={ev.id}
                            onClick={() => onSelectEvent?.(ev)}
                            className="flex items-center justify-between hover:bg-neutral-100/80 dark:hover:bg-neutral-800/80 rounded-2xl px-2 py-1.5 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`w-2.5 h-2.5 rounded-full ${
                                  ev.dotColor || 'bg-blue-500'
                                } shrink-0`}
                              />
                              <div className="min-w-0">
                                <p className="text-[13px] font-black text-neutral-900 dark:text-neutral-100 truncate">
                                  {ev.title}
                                </p>
                                {timeText ? (
                                  <p className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 truncate">
                                    {timeText}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                            {ev.tag && (
                              <span className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 bg-neutral-100/90 dark:bg-neutral-800 px-2 py-0.5 rounded-lg shrink-0">
                                {ev.tag}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Section 2: Todos */}
                {hasTodos && (
                  <div
                    className={`flex flex-col ${
                      hasEvents ? 'border-t border-neutral-100 dark:border-neutral-800/80 pt-3 mt-1' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between px-1.5 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                          Todos
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500">
                        {filteredTodos.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {filteredTodos.map((td) => {
                        const done = Boolean(td.completed ?? td.isCompleted);
                        return (
                          <div
                            key={td.id}
                            onClick={() => onSelectTodo?.(td)}
                            className="flex items-center justify-between hover:bg-neutral-100/80 dark:hover:bg-neutral-800/80 rounded-2xl px-2 py-1.5 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <button
                                type="button"
                                aria-label="Toggle status"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleTodo?.(td.id);
                                }}
                                className={`w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                                  done
                                    ? 'bg-emerald-500 border-emerald-500 text-white'
                                    : 'border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800'
                                }`}
                              >
                                {done && <Check className="w-3 h-3 stroke-[3]" />}
                              </button>
                              <span
                                className={`text-[13px] font-bold truncate ${
                                  done
                                    ? 'line-through text-neutral-400 dark:text-neutral-500'
                                    : 'text-neutral-900 dark:text-neutral-100'
                                }`}
                              >
                                {td.title}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {renderPriorityBadge(td.priority)}
                              {td.tag && (
                                <span className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 bg-neutral-100/90 dark:bg-neutral-800 px-2 py-0.5 rounded-lg">
                                  {td.tag}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Section 3: Notizen */}
                {hasNotes && (
                  <div
                    className={`flex flex-col ${
                      hasEvents || hasTodos
                        ? 'border-t border-neutral-100 dark:border-neutral-800/80 pt-3 mt-1'
                        : ''
                    }`}
                  >
                    <div className="flex items-center justify-between px-1.5 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                          Notizen
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500">
                        {filteredNotes.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {filteredNotes.map((nt) => (
                        <div
                          key={nt.id}
                          onClick={() => onSelectNote?.(nt)}
                          className="flex items-center justify-between hover:bg-neutral-100/80 dark:hover:bg-neutral-800/80 rounded-2xl px-2 py-1.5 transition-colors cursor-pointer gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-[13px] font-black text-neutral-900 dark:text-neutral-100 truncate">
                              {nt.title}
                            </p>
                            {nt.preview && (
                              <p className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500 truncate">
                                {nt.preview}
                              </p>
                            )}
                          </div>
                          {nt.tag && (
                            <span className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 bg-neutral-100/90 dark:bg-neutral-800 px-2 py-0.5 rounded-lg shrink-0">
                              {nt.tag}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Empty state when query is provided but yields no results */}
            {totalResults === 0 && hasQuery && (
              <div className="bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border border-neutral-200/80 dark:border-neutral-800 rounded-3xl p-5 text-center shadow-xl mb-3">
                <SearchX className="w-7 h-7 text-neutral-300 dark:text-neutral-600 mx-auto mb-1" />
                <p className="text-[13px] font-extrabold text-neutral-700 dark:text-neutral-200">
                  Keine Treffer gefunden
                </p>
                <p className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500 mt-0.5">
                  Versuche einen anderen Suchbegriff.
                </p>
              </div>
            )}

            {/* Sticky bottom search bar */}
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200/90 dark:border-neutral-800 rounded-full px-3.5 py-2 shadow-2xl flex items-center gap-2">
              <Search className="w-4 h-4 text-neutral-900 dark:text-neutral-100 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    onClose();
                  }
                }}
                placeholder={placeholder}
                autoComplete="off"
                className="flex-1 bg-transparent text-[13px] font-semibold text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 outline-none min-w-0"
              />
              {query.length > 0 && (
                <button
                  type="button"
                  title="Eingabe löschen"
                  onClick={() => onQueryChange('')}
                  className="w-6 h-6 rounded-full bg-neutral-200/80 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 flex items-center justify-center transition-colors shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-[11px] font-bold hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shrink-0"
              >
                Fertig
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MobileSearchOverlay;
