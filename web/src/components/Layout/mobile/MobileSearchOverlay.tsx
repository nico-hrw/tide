import React, { useMemo, useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, SearchX, X, Calendar, CheckCircle2, FileText, Check, Sparkles } from 'lucide-react';

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

type TopResult =
  | { type: 'event'; item: SearchEventItem; score: number }
  | { type: 'todo'; item: SearchTodoItem; score: number }
  | { type: 'note'; item: SearchNoteItem; score: number };

function computeScore(
  title: string,
  query: string,
  tag?: string,
  preview?: string
): number {
  let score = 0;
  const t = title.toLowerCase();
  const q = query.toLowerCase();

  // Exact match (+20)
  if (t === q) {
    score += 20;
  }
  // Title starts with query (+10)
  if (t.startsWith(q)) {
    score += 10;
  }
  // Title includes query (+5)
  if (t.includes(q)) {
    score += 5;
  }
  // Tag includes query (+2)
  if (tag && tag.toLowerCase().includes(q)) {
    score += 2;
  }
  // Preview includes query (+2)
  if (preview && preview.toLowerCase().includes(q)) {
    score += 2;
  }

  return score;
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

function EventRow({
  item,
  onClick,
}: {
  item: SearchEventItem;
  onClick?: () => void;
}) {
  const timeText = item.time || formatEventTime(item.start, item.end);
  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between hover:bg-neutral-100/80 dark:hover:bg-neutral-800/80 rounded-2xl px-2 py-1.5 transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={`w-2.5 h-2.5 rounded-full ${item.dotColor || 'bg-blue-500'} shrink-0`}
        />
        <div className="min-w-0">
          <p className="text-[13px] font-black text-neutral-900 dark:text-neutral-100 truncate">
            {item.title}
          </p>
          {timeText ? (
            <p className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 truncate">
              {timeText}
            </p>
          ) : null}
        </div>
      </div>
      {item.tag && (
        <span className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 bg-neutral-100/90 dark:bg-neutral-800 px-2 py-0.5 rounded-lg shrink-0">
          {item.tag}
        </span>
      )}
    </div>
  );
}

function TodoRow({
  item,
  onClick,
  onToggle,
}: {
  item: SearchTodoItem;
  onClick?: () => void;
  onToggle?: (id: string) => void;
}) {
  const done = Boolean(item.completed ?? item.isCompleted);
  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between hover:bg-neutral-100/80 dark:hover:bg-neutral-800/80 rounded-2xl px-2 py-1.5 transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          aria-label="Toggle status"
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.(item.id);
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
          {item.title}
        </span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {renderPriorityBadge(item.priority)}
        {item.tag && (
          <span className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 bg-neutral-100/90 dark:bg-neutral-800 px-2 py-0.5 rounded-lg">
            {item.tag}
          </span>
        )}
      </div>
    </div>
  );
}

function NoteRow({
  item,
  onClick,
}: {
  item: SearchNoteItem;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between hover:bg-neutral-100/80 dark:hover:bg-neutral-800/80 rounded-2xl px-2 py-1.5 transition-colors cursor-pointer gap-2"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <FileText className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-[13px] font-black text-neutral-900 dark:text-neutral-100 truncate">
            {item.title}
          </p>
          {item.preview && (
            <p className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500 truncate">
              {item.preview}
            </p>
          )}
        </div>
      </div>
      {item.tag && (
        <span className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 bg-neutral-100/90 dark:bg-neutral-800 px-2 py-0.5 rounded-lg shrink-0">
          {item.tag}
        </span>
      )}
    </div>
  );
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
  const [keyboardOffset, setKeyboardOffset] = useState<number>(0);

  useEffect(() => {
    if (!isOpen) {
      setKeyboardOffset(0);
      return;
    }

    // Immediately focus without delay to trigger keyboard instantly
    inputRef.current?.focus();

    const updateKeyboardOffset = () => {
      if (typeof window === 'undefined') return;
      const vv = window.visualViewport;
      if (vv) {
        // Calculate occluded height from the bottom of the window
        const offset = Math.max(0, window.innerHeight - (vv.height + (vv.offsetTop || 0)));
        setKeyboardOffset(offset);
      }
    };

    updateKeyboardOffset();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', updateKeyboardOffset);
      vv.addEventListener('scroll', updateKeyboardOffset);
      return () => {
        vv.removeEventListener('resize', updateKeyboardOffset);
        vv.removeEventListener('scroll', updateKeyboardOffset);
      };
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

  // Determine top (most likely) result
  const topResult = useMemo<TopResult | null>(() => {
    if (!trimmedQuery) return null;

    let best: TopResult | null = null;
    let highestScore = -1;

    for (const ev of filteredEvents) {
      const score = computeScore(ev.title, trimmedQuery, ev.tag);
      if (score > highestScore) {
        highestScore = score;
        best = { type: 'event', item: ev, score };
      }
    }

    for (const td of filteredTodos) {
      const score = computeScore(td.title, trimmedQuery, td.tag);
      if (score > highestScore) {
        highestScore = score;
        best = { type: 'todo', item: td, score };
      }
    }

    for (const nt of filteredNotes) {
      const score = computeScore(nt.title, trimmedQuery, nt.tag, nt.preview);
      if (score > highestScore) {
        highestScore = score;
        best = { type: 'note', item: nt, score };
      }
    }

    return best;
  }, [trimmedQuery, filteredEvents, filteredTodos, filteredNotes]);

  // Exclude topResult from the main list of results to prevent duplication
  const remainingEvents = useMemo(() => {
    if (!topResult || topResult.type !== 'event') return filteredEvents;
    return filteredEvents.filter((e) => e.id !== topResult.item.id);
  }, [filteredEvents, topResult]);

  const remainingTodos = useMemo(() => {
    if (!topResult || topResult.type !== 'todo') return filteredTodos;
    return filteredTodos.filter((t) => t.id !== topResult.item.id);
  }, [filteredTodos, topResult]);

  const remainingNotes = useMemo(() => {
    if (!topResult || topResult.type !== 'note') return filteredNotes;
    return filteredNotes.filter((n) => n.id !== topResult.item.id);
  }, [filteredNotes, topResult]);

  const hasRemainingEvents = remainingEvents.length > 0;
  const hasRemainingTodos = remainingTodos.length > 0;
  const hasRemainingNotes = remainingNotes.length > 0;
  const hasRemaining = hasRemainingEvents || hasRemainingTodos || hasRemainingNotes;

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
          className="fixed inset-0 z-40 bg-white/70 dark:bg-neutral-950/70 backdrop-blur-xl flex flex-col justify-end p-4 pb-6 transition-[padding-bottom] duration-150 ease-out"
          style={{
            paddingBottom: keyboardOffset > 0 ? `${keyboardOffset + 12}px` : undefined,
          }}
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
            {/* Scrollable results area above top result and search bar */}
            {hasRemaining && (
              <div
                style={{
                  maxHeight: keyboardOffset > 0 ? `calc(100dvh - ${keyboardOffset + 180}px)` : undefined,
                }}
                className="bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md rounded-3xl border border-neutral-200/80 dark:border-neutral-800 shadow-xl p-4 flex flex-col max-h-[60vh] overflow-y-auto mb-2.5"
              >
                {/* Section 1: Termine */}
                {hasRemainingEvents && (
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between px-1.5 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                          Termine
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500">
                        {remainingEvents.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {remainingEvents.map((ev) => (
                        <EventRow
                          key={ev.id}
                          item={ev}
                          onClick={() => onSelectEvent?.(ev)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Section 2: Todos */}
                {hasRemainingTodos && (
                  <div
                    className={`flex flex-col ${
                      hasRemainingEvents ? 'border-t border-neutral-100 dark:border-neutral-800/80 pt-3 mt-1' : ''
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
                        {remainingTodos.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {remainingTodos.map((td) => (
                        <TodoRow
                          key={td.id}
                          item={td}
                          onClick={() => onSelectTodo?.(td)}
                          onToggle={onToggleTodo}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Section 3: Notizen */}
                {hasRemainingNotes && (
                  <div
                    className={`flex flex-col ${
                      hasRemainingEvents || hasRemainingTodos
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
                        {remainingNotes.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {remainingNotes.map((nt) => (
                        <NoteRow
                          key={nt.id}
                          item={nt}
                          onClick={() => onSelectNote?.(nt)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Top Result ("Bester Treffer") Card - Prominently placed directly above search bar */}
            {topResult && (
              <div className="bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md rounded-2xl border border-neutral-200/90 dark:border-neutral-800 shadow-xl p-3 mb-2.5 transition-all">
                <div className="flex items-center justify-between gap-2 mb-1.5 px-0.5">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20" />
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      Bester Treffer
                    </span>
                    <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500">
                      • {topResult.type === 'event' ? 'Termin' : topResult.type === 'todo' ? 'Todo' : 'Notiz'}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
                    Öffnen
                  </span>
                </div>

                {topResult.type === 'event' && (
                  <EventRow
                    item={topResult.item}
                    onClick={() => onSelectEvent?.(topResult.item)}
                  />
                )}

                {topResult.type === 'todo' && (
                  <TodoRow
                    item={topResult.item}
                    onClick={() => onSelectTodo?.(topResult.item)}
                    onToggle={onToggleTodo}
                  />
                )}

                {topResult.type === 'note' && (
                  <NoteRow
                    item={topResult.item}
                    onClick={() => onSelectNote?.(topResult.item)}
                  />
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
                type="search"
                name="search"
                id="mobile-search-input"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    onClose();
                  } else if (e.key === 'Enter' && topResult) {
                    if (topResult.type === 'event') onSelectEvent?.(topResult.item);
                    else if (topResult.type === 'todo') onSelectTodo?.(topResult.item);
                    else if (topResult.type === 'note') onSelectNote?.(topResult.item);
                  }
                }}
                placeholder={placeholder}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                inputMode="search"
                enterKeyHint="search"
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore="true"
                className="flex-1 bg-transparent text-[13px] font-semibold text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 outline-none min-w-0 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
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
