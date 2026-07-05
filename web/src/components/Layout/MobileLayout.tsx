"use client";

import React, { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu, User, Settings, ArrowLeft, Folder, FileText,
  ChevronRight, Plus, Search, Calendar as CalendarIcon,
  Trash2, GraduationCap, MessageCircle,
  DollarSign, X, PenLine, FolderPlus, GripVertical, LayoutList, LayoutGrid,
  Crosshair, Infinity as InfinityIcon,
} from 'lucide-react';
import { isSameDay, format, startOfWeek, addDays } from 'date-fns';
import { de } from 'date-fns/locale';
import MiniCalendar from '../Calendar/MiniCalendar';
import MobileWeekGrid from './MobileWeekGrid';
import { useDataStore } from '@/store/useDataStore';
import dynamic from 'next/dynamic';
import { parseGermanDate } from '@/lib/dateParser';

const ExamsPlanner = dynamic(() => import('../Exams/ExamsPlanner'), {
  loading: () => <div className="flex-1 flex items-center justify-center p-8 text-sm" style={{ color: 'var(--muted-text)' }}>Lade…</div>,
});
const FinanceDashboard = dynamic(() => import('../Finance/FinanceDashboard'), {
  loading: () => <div className="flex-1 flex items-center justify-center p-8 text-sm" style={{ color: 'var(--muted-text)' }}>Lade…</div>,
});

const T = {
  bg:     'var(--background)',
  card:   'var(--sidebar-bg)',
  pri:    'var(--foreground)',
  sec:    'var(--muted-text)',
  mut:    'var(--text-subtle)',
  brd:    'var(--border-color)',
  hov:    'var(--hover-bg)',
  accent: '#3B82F6',
  danger: '#EF4444',
} as const;

interface MobileLayoutProps {
  events: any[];
  files: any[];
  folders: any[];
  onNoteSelect: (id: string, title: string) => void;
  onNewNote: (title?: string) => void;
  onDeleteNote?: (id: string) => void;
  onNewFolder?: () => void;
  onNewFolderIn?: (parentId: string) => void;
  onNoteRename?: (id: string, title: string) => void;
  editorElement: React.ReactNode;
  activeNoteId: string | null;
  activeNoteTitle: string;
  onNewEvent?: (date: Date) => void;
  onEventClick?: (id: string) => void;
  onEventUpdate?: (id: string, newStart: Date, newEnd: Date) => void;
  onEventDelete?: (id: string) => void;
  onTaskComplete?: (id: string, completed: boolean) => void;
  socialHubElement?: React.ReactNode;
  userProfile?: {
    username: string; email: string; avatar_seed?: string;
    avatar_salt?: string; bio?: string; title?: string;
    id?: string; user_id?: string;
  } | null;
}

const NoteRow = React.memo(function NoteRow({ file, onOpen, onDragStart, onContextMenu }: {
  file: any; onOpen: () => void;
  onDragStart?: (file: any, e: React.TouchEvent) => void;
  onContextMenu?: (file: any) => void;
}) {
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movedRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left rounded-xl"
      style={{ opacity: dragging ? 0.4 : 1 }}
      onTouchStart={e => {
        movedRef.current = false;
        holdRef.current = setTimeout(() => {
          if (movedRef.current) {
            setDragging(true);
            onDragStart?.(file, e);
          } else {
            onContextMenu?.(file);
          }
        }, 420);
      }}
      onTouchMove={() => { movedRef.current = true; }}
      onTouchEnd={() => { if (holdRef.current) clearTimeout(holdRef.current); setDragging(false); }}
    >
      <GripVertical size={12} style={{ color: T.mut, flexShrink: 0 }} />
      <FileText size={14} style={{ color: T.sec, flexShrink: 0 }} />
      <span className="text-sm truncate flex-1" style={{ color: T.pri, fontWeight: 500 }}>{file.title || 'Untitled'}</span>
    </button>
  );
});

const FolderItem = React.memo(function FolderItem({ folder, allFiles, onOpen, dragOverId, onDragOver, onDragLeave, onContextMenu, onNoteContextMenu, onNoteDragStart }: {
  folder: any; allFiles: any[]; onOpen: (id: string, t: string) => void;
  dragOverId?: string | null; onDragOver?: (id: string) => void; onDragLeave?: () => void;
  onContextMenu?: (folder: any) => void; onNoteContextMenu?: (file: any) => void;
  onNoteDragStart?: (file: any, e: React.TouchEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movedRef = useRef(false);
  const { loadedDirectories } = useDataStore();
  const children = allFiles.filter(f => f.parent_id === folder.id);
  const isOver = dragOverId === folder.id;
  return (
    <div>
      <button
        onClick={() => { setOpen(v => !v); if (!open && !loadedDirectories.has(folder.id)) useDataStore.getState().fetchDirectory(folder.id); }}
        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl"
        style={{ background: isOver ? `${T.accent}20` : 'transparent', border: isOver ? `1px solid ${T.accent}` : '1px solid transparent' }}
        onTouchStart={() => { movedRef.current = false; holdRef.current = setTimeout(() => { if (!movedRef.current) onContextMenu?.(folder); }, 420); }}
        onTouchMove={e => {
          movedRef.current = true;
          const touch = e.touches[0];
          const el = document.elementFromPoint(touch.clientX, touch.clientY);
          if (el?.closest(`[data-folder-id="${folder.id}"]`)) onDragOver?.(folder.id);
          else onDragLeave?.();
        }}
        onTouchEnd={() => { if (holdRef.current) clearTimeout(holdRef.current); }}
        data-folder-id={folder.id}
      >
        <Folder size={14} style={{ color: isOver ? T.accent : T.sec, flexShrink: 0 }} />
        <span className="text-sm font-semibold flex-1 text-left truncate" style={{ color: isOver ? T.accent : T.pri }}>{folder.title || 'Ordner'}</span>
        <motion.div animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronRight size={13} style={{ color: T.mut }} />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden pl-5">
            {children.filter(f => f.type === 'folder').map(s => <FolderItem key={s.id} folder={s} allFiles={allFiles} onOpen={onOpen} dragOverId={dragOverId} onDragOver={onDragOver} onDragLeave={onDragLeave} onContextMenu={onContextMenu} onNoteContextMenu={onNoteContextMenu} onNoteDragStart={onNoteDragStart} />)}
            {children.filter(f => f.type !== 'folder').map(f => <NoteRow key={f.id} file={f} onOpen={() => onOpen(f.id, f.title || 'Untitled')} onContextMenu={onNoteContextMenu} onDragStart={onNoteDragStart} />)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

const OverlayShell = ({ title, onBack, children, from = 'right' }: { title: string; onBack: () => void; children: React.ReactNode; from?: 'right' | 'bottom' }) => (
  <motion.div
    initial={{ [from === 'right' ? 'x' : 'y']: '100%' }}
    animate={{ [from === 'right' ? 'x' : 'y']: 0 }}
    exit={{ [from === 'right' ? 'x' : 'y']: '100%' }}
    transition={{ type: 'spring', damping: 30, stiffness: 300 }}
    className="fixed inset-0 z-50 flex flex-col overflow-hidden"
    style={{ background: T.bg }}
  >
    <div className="flex items-center gap-3 px-4 shrink-0" style={{ paddingTop: 'max(52px, calc(env(safe-area-inset-top) + 10px))', paddingBottom: 10, borderBottom: `1px solid ${T.brd}` }}>
      <button onClick={onBack} className="p-2 rounded-full" style={{ background: T.hov }}>
        <ArrowLeft size={18} style={{ color: T.accent }} />
      </button>
      <span className="font-bold text-base flex-1 truncate" style={{ color: T.pri }}>{title}</span>
    </div>
    {children}
  </motion.div>
);

const EventSheet = ({ event, now, onDelete, onEdit, onDismiss }: { event: any; now: Date; onDelete: () => void; onEdit?: () => void; onDismiss: () => void }) => {
  const start = new Date(event.start);
  const end = event.end ? new Date(event.end) : start;
  const isPast = end < now;
  const isActive = start <= now && now < end;
  return (
    <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 32, stiffness: 300 }}
      className="fixed left-0 right-0 z-[65] rounded-t-3xl overflow-hidden"
      style={{ bottom: 0, background: T.card, border: `1px solid ${T.brd}`, maxHeight: '60vh', paddingBottom: 'max(80px, calc(env(safe-area-inset-bottom) + 64px))' }}>
      <div className="flex justify-center pt-2.5 pb-1"><div className="w-9 h-1 rounded-full" style={{ background: T.brd }} /></div>
      <div className="px-5 pb-6 pt-2">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-3 h-3 rounded-full mt-1.5 shrink-0" style={{ background: event.color || T.accent }} />
          <div>
            <p className="text-base font-bold" style={{ color: T.pri }}>{event.title}</p>
            <p className="text-sm mt-0.5" style={{ color: T.sec }}>
              {format(start, 'EEE d. MMM', { locale: de })} · {format(start, 'HH:mm')} – {format(end, 'HH:mm')}
            </p>
          </div>
          <button onClick={onDismiss} className="ml-auto p-1.5 rounded-full" style={{ background: T.hov }}>
            <X size={14} style={{ color: T.sec }} />
          </button>
        </div>
        <div className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-semibold mb-4"
          style={{ background: `${event.color || T.accent}18`, color: event.color || T.accent }}>
          {isActive ? 'Läuft gerade' : isPast ? 'Beendet' : `Startet ${format(start, 'HH:mm')}`}
        </div>
        {event.description && <p className="text-sm mb-4" style={{ color: T.sec }}>{event.description}</p>}
        <div className="flex gap-3">
          <button onClick={() => { onEdit?.(); onDismiss(); }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: `${T.accent}14`, color: T.accent }}>
            <PenLine size={15} /> Bearbeiten
          </button>
          <button onClick={() => { onDelete(); onDismiss(); }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: '#EF444414', color: T.danger }}>
            <Trash2 size={15} /> Löschen
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default function MobileLayout({
  events, files, folders, onNoteSelect, onNewNote, onDeleteNote,
  onNewFolder, onNewFolderIn, onNoteRename,
  editorElement, activeNoteId, activeNoteTitle, onNewEvent,
  onEventClick, onEventUpdate, onEventDelete, onTaskComplete,
  socialHubElement, userProfile,
}: MobileLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [isSocialOpen, setIsSocialOpen] = useState(false);
  const [isExamsOpen, setIsExamsOpen] = useState(false);
  const [isFinanceOpen, setIsFinanceOpen] = useState(false);
  const [activeDate, setActiveDate] = useState(new Date());
  const [isMonthExpanded, setIsMonthExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [contextMenu, setContextMenu] = useState<{ type: 'note' | 'folder'; id: string; title: string; parentId?: string | null } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [calViewMode, setCalViewMode] = useState<'week' | 'day'>('week');
  const [dayViewDays, setDayViewDays] = useState<Date[]>([]);
  const dayViewSentinelRef = useRef<HTMLDivElement>(null);

  // Note drag-to-folder
  const [draggingNote, setDraggingNote] = useState<{ id: string; title: string } | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const dragGhostPos = useRef({ x: 0, y: 0 });

  const swipeX0 = useRef(0);
  const swipeY0 = useRef(0);
  const [swipeDx, setSwipeDx] = useState(0);
  const [snapping, setSnapping] = useState<'left' | 'right' | null>(null);
  const isSwipingWeek = useRef(false);
  const eventDragActiveRef = useRef(false);
  const [eventDragActive, setEventDragActive] = useState(false);

  const [infiniteScrollMode, setInfiniteScrollMode] = useState(false);
  const infScrollRef = useRef<HTMLDivElement>(null);
  const infScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const infResetting = useRef(false);
  const timeStripInnerRef = useRef<HTMLDivElement>(null);
  const [infHourH, setInfHourH] = useState<number>(() => {
    if (typeof window === 'undefined') return 54;
    const s = localStorage.getItem('tide_mobile_hour_h');
    return s ? Math.max(24, Math.min(120, parseFloat(s))) : 54;
  });
  const handleInfScrollY = useCallback((top: number) => {
    if (timeStripInnerRef.current) timeStripInnerRef.current.style.transform = `translateY(-${top}px)`;
  }, []);

  // Top bar right-swipe → open sidebar
  const topBarTouch = useRef({ x0: 0, y0: 0 });

  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(id); }, []);

  const enabledExtensions = useDataStore(s => s.enabledExtensions);
  const setSettingsOpen = useDataStore(s => s.setSettingsModalOpen);
  const theme = useDataStore(s => s.theme);

  // ── Keyboard-aware bottom bar offset ────────────────────────────────────────
  const [kbOffset, setKbOffset] = useState(0);
  useEffect(() => {
    const vv = (window as any).visualViewport as VisualViewport | undefined;
    if (!vv) return;
    const handler = () => {
      const offset = window.innerHeight - vv.height - vv.offsetTop;
      setKbOffset(Math.max(0, offset));
    };
    vv.addEventListener('resize', handler);
    vv.addEventListener('scroll', handler);
    return () => { vv.removeEventListener('resize', handler); vv.removeEventListener('scroll', handler); };
  }, []);

  // Load persistent search index from localStorage into __mobileNoteCache each time search opens.
  // The index is written by page.tsx after each successful note decryption.
  useEffect(() => {
    if (!isSearchOpen) return;
    if (!(window as any).__mobileNoteCache) (window as any).__mobileNoteCache = {};
    const cache = (window as any).__mobileNoteCache as Record<string, string>;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('tide_search_')) {
          const noteId = key.slice('tide_search_'.length);
          if (!cache[noteId]) cache[noteId] = localStorage.getItem(key) || '';
        }
      }
    } catch { /* private mode or quota — ignore */ }
  }, [isSearchOpen]);

  const weekStart = useMemo(() => startOfWeek(activeDate, { weekStartsOn: 1 }), [activeDate]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const prevWeekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i - 7)), [weekStart]);
  const nextWeekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i + 7)), [weekStart]);
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  // AllDay events for the week view row
  const allDayEventsForWeek = useMemo(() => {
    const wStart = new Date(weekDays[0]); wStart.setHours(0, 0, 0, 0);
    const wEnd   = new Date(weekDays[6]); wEnd.setHours(23, 59, 59, 999);
    return events.filter(e => {
      if (!e.allDay) return false;
      try { const s = new Date(e.start); const en = e.end ? new Date(e.end) : s; return s <= wEnd && en >= wStart; }
      catch { return false; }
    });
  }, [events, weekDays]);

  // Assign allday events to non-overlapping rows
  const allDayRows = useMemo(() => {
    const rows: Array<{event: any; sc: number; ec: number}[]> = [];
    for (const ev of allDayEventsForWeek) {
      const s = new Date(ev.start); const en = ev.end ? new Date(ev.end) : s;
      let sc = weekDays.findIndex(d => isSameDay(d, s));
      let ec = weekDays.findIndex(d => isSameDay(d, en));
      if (sc < 0) sc = 0; if (ec < 0) ec = 6;
      ec = Math.max(sc, Math.min(6, ec));
      let placed = false;
      for (const row of rows) {
        if (!row.some(r => sc <= r.ec && ec >= r.sc)) { row.push({ event: ev, sc, ec }); placed = true; break; }
      }
      if (!placed) rows.push([{ event: ev, sc, ec }]);
    }
    return rows;
  }, [allDayEventsForWeek, weekDays]);

  // Center infinite scroll on current week whenever week changes or mode enabled.
  // useLayoutEffect so scrollLeft is set before paint — avoids visible flash on left slide.
  useLayoutEffect(() => {
    if (!infiniteScrollMode) return;
    const el = infScrollRef.current;
    if (!el) return;
    infResetting.current = true;
    // Temporarily disable snap so we can jump without animation
    el.style.scrollSnapType = 'none';
    el.scrollLeft = el.offsetWidth;
    // Re-enable snap after a frame so user swipes still snap
    const raf = requestAnimationFrame(() => {
      el.style.scrollSnapType = '';
      setTimeout(() => { infResetting.current = false; }, 80);
    });
    return () => cancelAnimationFrame(raf);
  }, [infiniteScrollMode, weekStartStr]);

  const handleInfScroll = useCallback(() => {
    if (infResetting.current) return;
    if (infScrollTimer.current) clearTimeout(infScrollTimer.current);
    infScrollTimer.current = setTimeout(() => {
      const el = infScrollRef.current;
      if (!el) return;
      const w = el.offsetWidth;
      const sl = el.scrollLeft;
      if (sl < w * 0.4) {
        infResetting.current = true; setActiveDate(d => addDays(d, -7));
      } else if (sl > w * 1.6) {
        infResetting.current = true; setActiveDate(d => addDays(d, 7));
      } else if (Math.abs(sl - w) > 4) {
        // Partial swipe — spring back to center without changing week
        infResetting.current = true;
        el.scrollTo({ left: w, behavior: 'smooth' });
        setTimeout(() => { infResetting.current = false; }, 400);
      }
    }, 100);
  }, []);

  // Reset day-view list when the calendar week changes
  useEffect(() => {
    const ws = startOfWeek(activeDate, { weekStartsOn: 1 });
    setDayViewDays(Array.from({ length: 30 }, (_, i) => addDays(ws, i)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStartStr]);

  // Infinite scroll sentinel for day view
  useEffect(() => {
    if (calViewMode !== 'day') return;
    const el = dayViewSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setDayViewDays(prev => {
          const last = prev[prev.length - 1];
          if (!last) return prev;
          return [...prev, ...Array.from({ length: 14 }, (_, i) => addDays(last, i + 1))];
        });
      }
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [calViewMode]);

  const nextEvent = useMemo(() =>
    events.filter(e => { try { return new Date(e.start) > now; } catch { return false; } })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())[0] ?? null,
    [events, now]);

  // Date/time recognition from search query (use new Date() inside so `now` tick doesn't re-run)
  const parsedDate = useMemo(() => {
    const q = searchQuery.trim();
    if (q.length < 3) return null;
    try {
      const results = parseGermanDate(q, new Date());
      return results.length > 0 ? results[0] : null;
    } catch { return null; }
  }, [searchQuery]);

  // Text collector: open search on key press
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isSearchOpen || isEditingNote || isSidebarOpen) return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length !== 1) return;
      setSearchQuery(e.key);
      setIsSearchOpen(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isSearchOpen, isEditingNote, isSidebarOpen]);

  const searchResults = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q || q.length < 2) return [];
    const contentCache: Record<string, string> = typeof window !== 'undefined' ? ((window as any).__mobileNoteCache ?? {}) : {};
    const notes = files.filter(f => f.type !== 'folder' && (
      (f.title || '').toLowerCase().includes(q) ||
      (contentCache[f.id] ?? '').includes(q)
    )).map(f => ({ kind: 'note', ...f }));
    const now = Date.now();
    const evts = events
      .filter(e => (e.title || '').toLowerCase().includes(q))
      .sort((a, b) => Math.abs(new Date(a.start).getTime() - now) - Math.abs(new Date(b.start).getTime() - now))
      .map(e => ({ kind: 'event', ...e }));
    return [...notes, ...evts];
  }, [searchQuery, files, events]);

  const openNote = useCallback((id: string, title: string) => {
    setIsSidebarOpen(false);
    setIsSearchOpen(false);
    onNoteSelect(id, title);
    setIsEditingNote(true);
  }, [onNoteSelect]);

  useEffect(() => {
    const h = (e: Event) => { const { id, title } = (e as CustomEvent).detail; openNote(id, title); };
    window.addEventListener('mobile_open_note', h);
    return () => window.removeEventListener('mobile_open_note', h);
  }, [openNote]);

  useEffect(() => {
    const h = () => onNewFolder?.();
    window.addEventListener('mobile_new_folder', h);
    return () => window.removeEventListener('mobile_new_folder', h);
  }, [onNewFolder]);

  const handleNoteDragStart = useCallback((file: any, e: React.TouchEvent) => {
    setDraggingNote({ id: file.id, title: file.title || 'Untitled' });
    dragGhostPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    const onMove = (ev: TouchEvent) => {
      dragGhostPos.current = { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
      // Find folder under finger
      const el = document.elementFromPoint(ev.touches[0].clientX, ev.touches[0].clientY);
      const folderEl = el?.closest('[data-folder-id]');
      setDragOverFolderId(folderEl ? folderEl.getAttribute('data-folder-id') : null);
    };
    const onEnd = () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      setDragOverFolderId(prev => {
        if (prev) window.dispatchEvent(new CustomEvent('mobile_move_to_folder', { detail: { noteId: file.id, folderId: prev } }));
        return null;
      });
      setDraggingNote(null);
    };
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd);
  }, []);

  const onSwipeStart = (e: React.TouchEvent) => {
    if (snapping || eventDragActiveRef.current || infiniteScrollMode) return;
    swipeX0.current = e.touches[0].clientX;
    swipeY0.current = e.touches[0].clientY;
    isSwipingWeek.current = false;
    setSwipeDx(0);
  };
  const onSwipeMove = (e: React.TouchEvent) => {
    if (snapping || eventDragActiveRef.current || document.body.hasAttribute('data-ev-drag')) return;
    const dx = e.touches[0].clientX - swipeX0.current;
    const dy = Math.abs(e.touches[0].clientY - swipeY0.current);
    // Cancel swipe if vertical movement dominates (user is scrolling)
    if (dy > 12 && !isSwipingWeek.current) return;
    // Don't start week swipe if touch began on the time label column (~first 50px)
    if (!isSwipingWeek.current && Math.abs(dx) > dy && Math.abs(dx) > 12 && swipeX0.current > 50) {
      isSwipingWeek.current = true;
    }
    if (isSwipingWeek.current) setSwipeDx(dx);
  };
  const onSwipeEnd = (e: React.TouchEvent) => {
    if (snapping) return;
    // dx computed from changedTouches — swipeDx is 0 for time-column touches that never set isSwipingWeek
    const dx = e.changedTouches[0].clientX - swipeX0.current;
    if (isSwipingWeek.current && Math.abs(swipeDx) > 45) {
      const dir = swipeDx < 0 ? 'left' : 'right';
      setSnapping(dir);
      setTimeout(() => {
        setActiveDate(d => addDays(d, dir === 'left' ? 7 : -7));
        setSnapping(null);
        setSwipeDx(0);
      }, 240);
    } else if (!isSwipingWeek.current && dx > 60 && swipeX0.current < 55) {
      // Right swipe from time column → open sidebar
      setIsSidebarOpen(true);
      setSwipeDx(0);
    } else {
      setSwipeDx(0);
    }
    isSwipingWeek.current = false;
  };

  return (
    <div className="flex md:hidden flex-col h-[100dvh] w-full relative overflow-hidden" style={{ background: T.bg }}>

      <AnimatePresence>
        {/* Sidebar backdrop */}
        {isSidebarOpen && (
          <motion.div key="sb-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.45)' }}
            onClick={() => setIsSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        {isSidebarOpen && (
          <motion.aside key="sidebar"
            initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed left-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden"
            style={{ width: 280, background: T.card, borderRight: `1px solid ${T.brd}` }}
          >
            <div className="px-5 pt-14 pb-2">
              <p className="text-xl font-extrabold" style={{ color: T.pri }}>tide</p>
              <p className="text-xs" style={{ color: T.mut }}>Notizen &amp; Kalender</p>
            </div>
            <div className="mx-4 mb-2 flex gap-2">
              <button onClick={() => { setIsSidebarOpen(false); onNewNote(); setIsEditingNote(true); }}
                className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-xl"
                style={{ background: T.accent, color: '#fff' }}>
                <Plus size={14} /><span className="text-sm font-semibold">Notiz</span>
              </button>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('mobile_new_folder'))}
                className="w-10 flex items-center justify-center rounded-xl"
                style={{ background: T.hov, border: `1px solid ${T.brd}` }}>
                <FolderPlus size={16} style={{ color: T.sec }} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-2">
              {(() => {
                const recentFiles = files.filter(f => f.type !== 'folder').slice(0, 2);
                const recentIds = new Set(recentFiles.map(f => f.id));
                return (
                  <>
                    <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: T.mut }}>Zuletzt</p>
                    {recentFiles.map(f => (
                      <NoteRow key={f.id} file={f} onOpen={() => openNote(f.id, f.title || 'Untitled')} onDragStart={handleNoteDragStart} onContextMenu={f => setContextMenu({ type: 'note', id: f.id, title: f.title || 'Untitled', parentId: f.parent_id })} />
                    ))}
                    <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: T.mut }}>Notizen</p>
                    {folders.filter(f => !f.parent_id).map(folder => (
                      <FolderItem key={folder.id} folder={folder} allFiles={files} onOpen={openNote} dragOverId={dragOverFolderId} onDragOver={setDragOverFolderId} onDragLeave={() => setDragOverFolderId(null)}
                        onContextMenu={f => setContextMenu({ type: 'folder', id: f.id, title: f.title || 'Ordner', parentId: f.parent_id })}
                        onNoteContextMenu={f => setContextMenu({ type: 'note', id: f.id, title: f.title || 'Untitled', parentId: f.parent_id })}
                        onNoteDragStart={handleNoteDragStart} />
                    ))}
                    {files.filter(f => !f.parent_id && f.type !== 'folder' && !recentIds.has(f.id)).map(f => (
                      <NoteRow key={f.id} file={f} onOpen={() => openNote(f.id, f.title || 'Untitled')} onDragStart={handleNoteDragStart} onContextMenu={f => setContextMenu({ type: 'note', id: f.id, title: f.title || 'Untitled', parentId: f.parent_id })} />
                    ))}
                  </>
                );
              })()}
            </div>
            {/* Feature tabs */}
            <div style={{ borderTop: `1px solid ${T.brd}`, flexShrink: 0 }}>
              <div className="flex overflow-x-auto gap-2 px-3 py-3 no-scrollbar">
                {[
                  { id: 'exams', icon: <GraduationCap size={18} />, label: 'Prüfungen', ext: 'exams', action: () => { setIsSidebarOpen(false); setIsExamsOpen(true); } },
                  { id: 'chat', icon: <MessageCircle size={18} />, label: 'Chat', ext: undefined, action: () => { setIsSidebarOpen(false); setIsSocialOpen(true); } },
                  { id: 'finance', icon: <DollarSign size={18} />, label: 'Finanzen', ext: 'finance', action: () => { setIsSidebarOpen(false); setIsFinanceOpen(true); } },
                ].map(tab => {
                  const enabled = !tab.ext || enabledExtensions.includes(tab.ext);
                  return (
                    <button key={tab.id} onClick={enabled ? tab.action : undefined}
                      className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl flex-shrink-0 active:opacity-70"
                      style={{ background: T.hov, border: `1px solid ${T.brd}`, opacity: enabled ? 1 : 0.35, minWidth: 60 }}>
                      <span style={{ color: T.sec }}>{tab.icon}</span>
                      <span className="text-[10px] font-semibold" style={{ color: T.sec }}>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.aside>
        )}

        {/* Note editor with rename header + SmartSearch at bottom */}
        {isEditingNote && (
          <motion.div key="editor"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-50 flex flex-col overflow-hidden"
            style={{ background: T.bg }}
          >
            <div className="flex items-center gap-3 px-4 shrink-0" style={{ paddingTop: 'max(52px, calc(env(safe-area-inset-top) + 10px))', paddingBottom: 10, borderBottom: `1px solid ${T.brd}` }}>
              <button onClick={() => setIsEditingNote(false)} className="p-2 rounded-full" style={{ background: T.hov }}>
                <ArrowLeft size={18} style={{ color: T.accent }} />
              </button>
              {/* Editable title */}
              <input
                className="flex-1 bg-transparent outline-none font-bold text-base truncate"
                style={{ color: T.pri }}
                value={activeNoteTitle || ''}
                onChange={e => {
                  window.dispatchEvent(new CustomEvent('mobile_note_rename', { detail: { title: e.target.value } }));
                  if (activeNoteId) onNoteRename?.(activeNoteId, e.target.value);
                }}
                placeholder="Notiz…"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="rounded-2xl p-4 h-full" style={{ background: T.card }}>{editorElement}</div>
            </div>
            {/* SmartSearch bar — opens the same slide-up panel as the calendar */}
            {kbOffset === 0 && (
              <button
                onClick={() => { setSearchQuery(''); setIsSearchOpen(true); }}
                className="flex items-center gap-3 px-4 py-3 mx-3 mb-3 rounded-2xl shrink-0"
                style={{
                  background: theme === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: `1px solid ${T.brd}`,
                }}>
                <Search size={14} style={{ color: T.sec }} />
                <span className="text-sm flex-1 text-left" style={{ color: T.mut }}>Suchen, Notiz oder Termin erfassen…</span>
              </button>
            )}
          </motion.div>
        )}

        {/* Social */}
        {isSocialOpen && (
          <OverlayShell key="social" title="Social" onBack={() => setIsSocialOpen(false)} from="bottom">
            <div className="flex-1 overflow-y-auto">{socialHubElement}</div>
          </OverlayShell>
        )}

        {/* Exams */}
        {isExamsOpen && (
          <OverlayShell key="exams" title="Prüfungen" onBack={() => setIsExamsOpen(false)}>
            <div className="flex-1 overflow-y-auto"><ExamsPlanner /></div>
          </OverlayShell>
        )}

        {/* Finance */}
        {isFinanceOpen && (
          <OverlayShell key="finance" title="Finanzen" onBack={() => setIsFinanceOpen(false)}>
            <div className="flex-1 overflow-y-auto"><FinanceDashboard /></div>
          </OverlayShell>
        )}

        {/* ── Search glass panel — slides up from bottom, partial overlay ── */}
        {isSearchOpen && (
          <>
            {/* Dimmed backdrop, dismisses on tap */}
            <motion.div key="search-back"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className={`fixed inset-0 ${isEditingNote ? 'z-[55]' : 'z-30'}`}
              style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)' }}
              onClick={() => setIsSearchOpen(false)}
            />

            {/* Glass panel — slides up, covers ~75% of screen */}
            <motion.div key="search"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 320 }}
              className={`fixed left-0 right-0 ${isEditingNote ? 'z-[60]' : 'z-40'} flex flex-col rounded-t-3xl overflow-hidden`}
              style={{
                bottom: kbOffset,
                maxHeight: kbOffset > 0 ? `calc(100dvh - ${kbOffset}px - 40px)` : '78vh',
                background: theme === 'dark'
                  ? 'rgba(15,23,42,0.92)'
                  : 'rgba(255,255,255,0.88)',
                backdropFilter: 'blur(24px) saturate(180%)',
                WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                borderTop: `1px solid ${T.brd}`,
                boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
              }}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-2 cursor-pointer shrink-0" onClick={() => setIsSearchOpen(false)}>
                <div className="w-10 h-1.5 rounded-full" style={{ background: T.brd }} />
              </div>

              {/* Search input */}
              <div className="flex items-center gap-3 mx-4 mb-3 px-4 py-3 rounded-2xl shrink-0"
                style={{ background: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', border: `1.5px solid ${T.accent}`, boxShadow: `0 0 0 3px ${T.accent}20` }}>
                <Search size={16} style={{ color: T.accent, flexShrink: 0 }} />
                <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Suchen, Notiz oder Termin erfassen…"
                  className="flex-1 bg-transparent outline-none text-sm" style={{ color: T.pri }} />
                {searchQuery
                  ? <button onClick={() => setSearchQuery('')}><X size={14} style={{ color: T.sec }} /></button>
                  : <button onClick={() => setIsSearchOpen(false)} className="text-sm font-semibold" style={{ color: T.accent }}>Fertig</button>
                }
              </div>

              {/* Date recognition hint */}
              {parsedDate && (
                <div className="mx-4 mb-2 shrink-0 px-4 py-2.5 rounded-2xl flex items-center gap-3"
                  style={{ background: `${T.accent}12`, border: `1px solid ${T.accent}30` }}>
                  <CalendarIcon size={14} style={{ color: T.accent, flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold" style={{ color: T.accent }}>
                      Termin erkannt: {format(parsedDate.proposedStart, 'EEE d. MMM, HH:mm', { locale: de })}
                      {parsedDate.proposedEnd && ` – ${format(parsedDate.proposedEnd, 'HH:mm')}`}
                    </p>
                    {parsedDate.titleHint && <p className="text-xs truncate" style={{ color: T.sec }}>{parsedDate.titleHint}</p>}
                  </div>
                  <button
                    onClick={() => { setIsSearchOpen(false); onNewEvent?.(parsedDate.proposedStart); }}
                    className="text-xs font-bold px-3 py-1.5 rounded-xl shrink-0"
                    style={{ background: T.accent, color: '#fff' }}>
                    + Anlegen
                  </button>
                </div>
              )}

              {/* Stacked action buttons */}
              <div className="mx-4 mb-3 flex flex-col gap-2 shrink-0">
                <button onClick={() => { const t = searchQuery.trim() || undefined; setIsSearchOpen(false); onNewNote(t); setIsEditingNote(true); }}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold w-full text-left"
                  style={{ background: '#22C55E14', border: '1px solid #22C55E30', color: '#22C55E' }}>
                  <PenLine size={16} />
                  <span className="flex-1">Neue Notiz{searchQuery.trim() ? ` · "${searchQuery.slice(0, 24)}"` : ''}</span>
                </button>
                <button onClick={() => { setIsSearchOpen(false); onNewEvent?.(parsedDate?.proposedStart ?? activeDate); }}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold w-full text-left"
                  style={{ background: `${T.accent}14`, border: `1px solid ${T.accent}30`, color: T.accent }}>
                  <CalendarIcon size={16} />
                  <span className="flex-1">
                    Neues Ereignis{parsedDate ? ` · ${format(parsedDate.proposedStart, 'd. MMM HH:mm', { locale: de })}` : ''}
                  </span>
                </button>
              </div>

              {/* Results — ~3 items visible by default, scrollable for all */}
              <div className="overflow-y-auto px-4 pb-6" style={{ overscrollBehavior: 'contain', maxHeight: 195, minHeight: 0 }}>
                {searchResults.length > 0 ? (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: T.mut }}>Ergebnisse</p>
                    {searchResults.map(r => (
                      <button key={r.id}
                        onClick={() => r.kind === 'note' ? openNote(r.id, r.title) : (() => { const ev = events.find(e => e.id === r.id); if (ev) setSelectedEvent(ev); setIsSearchOpen(false); })()}
                        className="w-full flex items-center gap-3 py-3 text-left" style={{ borderBottom: `1px solid ${T.brd}` }}>
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: r.kind === 'note' ? '#6366F122' : `${T.accent}22` }}>
                          {r.kind === 'note' ? <FileText size={14} style={{ color: '#6366F1' }} /> : <CalendarIcon size={14} style={{ color: T.accent }} />}
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className="text-sm font-medium truncate" style={{ color: T.pri }}>{r.title}</p>
                          <p className="text-xs" style={{ color: T.mut }}>
                            {r.kind === 'note' ? 'Notiz' : `Ereignis · ${format(new Date(r.start), 'd. MMM', { locale: de })}`}
                          </p>
                        </div>
                        <ChevronRight size={13} style={{ color: T.mut }} />
                      </button>
                    ))}
                  </>
                ) : searchQuery ? (
                  <p className="text-sm py-4 text-center" style={{ color: T.mut }}>Keine Ergebnisse für &ldquo;{searchQuery}&rdquo;</p>
                ) : null}
              </div>
            </motion.div>
          </>
        )}

        {/* Event detail sheet */}
        {selectedEvent && (
          <EventSheet key="evsheet" event={selectedEvent} now={now}
            onDelete={() => { onEventDelete?.(selectedEvent.id); setSelectedEvent(null); }}
            onEdit={() => window.dispatchEvent(new CustomEvent('mobile_edit_event', { detail: { id: selectedEvent.id } }))}
            onDismiss={() => setSelectedEvent(null)} />
        )}

        {/* ── Context menu sheet (note / folder) ─────── */}
        {contextMenu && (
          <>
            <motion.div key="cm-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[70]" style={{ background: 'rgba(0,0,0,0.3)' }}
              onClick={() => setContextMenu(null)} />
            <motion.div key="cm"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 320 }}
              className="fixed left-0 right-0 z-[75] rounded-t-3xl overflow-hidden"
              style={{ bottom: 0, background: T.card, paddingBottom: 'max(28px, calc(env(safe-area-inset-bottom) + 12px))' }}>
              {/* Title */}
              <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1.5 rounded-full" style={{ background: T.brd }} /></div>
              <div className="px-6 pt-2 pb-3 flex items-center gap-3" style={{ borderBottom: `1px solid ${T.brd}` }}>
                {contextMenu.type === 'folder' ? <Folder size={16} style={{ color: T.sec }} /> : <FileText size={16} style={{ color: T.sec }} />}
                <p className="text-sm font-bold truncate flex-1" style={{ color: T.pri }}>{contextMenu.title}</p>
              </div>
              {/* Menu items */}
              {[
                { label: 'Öffnen', icon: <FileText size={18} style={{ color: T.sec }} />, action: () => { setContextMenu(null); if (contextMenu.type === 'note') { openNote(contextMenu.id, contextMenu.title); } } },
                ...(contextMenu.type === 'folder' ? [
                  { label: 'Neue Notiz hier', icon: <Plus size={18} style={{ color: T.sec }} />, action: () => { const pid = contextMenu.id; setContextMenu(null); window.dispatchEvent(new CustomEvent('mobile_set_parent', { detail: { parentId: pid } })); setTimeout(() => { onNewNote(); setIsEditingNote(true); }, 0); } },
                  { label: 'Neuer Ordner hier', icon: <FolderPlus size={18} style={{ color: T.sec }} />, action: () => { setContextMenu(null); onNewFolderIn?.(contextMenu.id); } },
                ] : []),
                { label: 'Umbenennen', icon: <PenLine size={18} style={{ color: T.sec }} />, action: () => { setContextMenu(null); setRenamingId(contextMenu.id); setRenameValue(contextMenu.title); } },
                { label: 'Teilen', icon: <Search size={18} style={{ color: T.sec }} />, action: () => { setContextMenu(null); window.dispatchEvent(new CustomEvent('mobile_share_file', { detail: { id: contextMenu.id, title: contextMenu.title } })); } },
                { label: 'Löschen', icon: <Trash2 size={18} style={{ color: T.danger }} />, danger: true, action: () => { setContextMenu(null); onDeleteNote?.(contextMenu.id); } },
              ].map((item, i, arr) => (
                <button key={item.label} onClick={item.action}
                  className="w-full flex items-center gap-4 px-6 py-3.5"
                  style={{ borderBottom: i < arr.length - 1 ? `1px solid ${T.brd}` : 'none' }}>
                  {item.icon}
                  <span className="text-base font-medium" style={{ color: (item as any).danger ? T.danger : T.pri }}>{item.label}</span>
                  {item.label === 'Sichtbarkeit' && <ChevronRight size={16} style={{ color: T.mut, marginLeft: 'auto' }} />}
                </button>
              ))}
            </motion.div>
          </>
        )}

        {/* Rename inline input */}
        {renamingId && (
          <motion.div key="rename-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={e => { if (e.target === e.currentTarget) setRenamingId(null); }}>
            <div className="w-full rounded-t-3xl p-6" style={{ background: T.card }}>
              <p className="text-sm font-bold mb-3" style={{ color: T.pri }}>Umbenennen</p>
              <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl text-sm font-medium outline-none mb-3"
                style={{ background: T.hov, border: `1.5px solid ${T.accent}`, color: T.pri }}
                onKeyDown={e => { if (e.key === 'Enter') { onNoteRename?.(renamingId, renameValue); setRenamingId(null); } }}
              />
              <div className="flex gap-3">
                <button onClick={() => setRenamingId(null)} className="flex-1 py-2.5 rounded-2xl text-sm font-semibold" style={{ background: T.hov, color: T.sec }}>Abbrechen</button>
                <button onClick={() => { onNoteRename?.(renamingId, renameValue); setRenamingId(null); }} className="flex-1 py-2.5 rounded-2xl text-sm font-semibold" style={{ background: T.accent, color: '#fff' }}>Speichern</button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Drag ghost for note-to-folder */}
        {draggingNote && (
          <div className="fixed pointer-events-none z-[70] px-4 py-2.5 rounded-2xl shadow-2xl"
            style={{
              left: dragGhostPos.current.x - 80,
              top: dragGhostPos.current.y - 20,
              background: T.card,
              border: `1px solid ${T.brd}`,
              maxWidth: 180,
            }}>
            <div className="flex items-center gap-2">
              <FileText size={12} style={{ color: T.sec }} />
              <span className="text-xs font-semibold truncate" style={{ color: T.pri }}>{draggingNote.title}</span>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Top bar ─────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 shrink-0 z-10" style={{ paddingTop: 'max(52px, calc(env(safe-area-inset-top) + 10px))', paddingBottom: 6 }}
        onTouchStart={e => { topBarTouch.current = { x0: e.touches[0].clientX, y0: e.touches[0].clientY }; }}
        onTouchEnd={e => {
          const dx = e.changedTouches[0].clientX - topBarTouch.current.x0;
          const dy = Math.abs(e.changedTouches[0].clientY - topBarTouch.current.y0);
          if (dx > 40 && dy < 30) setIsSidebarOpen(true);
        }}
      >
        <button onClick={() => setIsSidebarOpen(true)} className="w-9 h-9 flex items-center justify-center rounded-xl" style={{ background: T.card, border: `1px solid ${T.brd}` }}>
          <Menu size={17} style={{ color: T.sec }} />
        </button>
        <div className="flex gap-2">
          <button onClick={() => setIsSocialOpen(true)} className="w-9 h-9 flex items-center justify-center rounded-xl" style={{ background: T.card, border: `1px solid ${T.brd}` }}>
            <User size={16} style={{ color: T.sec }} />
          </button>
          <button onClick={() => setSettingsOpen(true)} className="w-9 h-9 flex items-center justify-center rounded-xl" style={{ background: T.card, border: `1px solid ${T.brd}` }}>
            <Settings size={16} style={{ color: T.sec }} />
          </button>
        </div>
      </div>

      {/* ── Calendar header (month title + nav) ─────── */}
      <div className="shrink-0">
        <div className="px-5 flex items-center justify-between">
          <button onClick={() => setIsMonthExpanded(v => !v)} className="text-lg font-extrabold" style={{ color: T.pri }}>
            {format(activeDate, 'MMMM yyyy', { locale: de }).toUpperCase()}
          </button>
          <div className="flex gap-2 items-center">
            <button onClick={() => setCalViewMode(m => m === 'week' ? 'day' : 'week')} className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ background: calViewMode === 'day' ? `${T.accent}20` : T.card, border: `1px solid ${calViewMode === 'day' ? T.accent : T.brd}` }}>
              {calViewMode === 'week' ? <LayoutList size={14} style={{ color: T.sec }} /> : <LayoutGrid size={14} style={{ color: T.accent }} />}
            </button>
            <button onClick={() => setInfiniteScrollMode(m => !m)} className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ background: infiniteScrollMode ? `${T.accent}20` : T.card, border: `1px solid ${infiniteScrollMode ? T.accent : T.brd}` }}>
              <InfinityIcon size={14} style={{ color: infiniteScrollMode ? T.accent : T.sec }} />
            </button>
            <button onClick={() => {
                setActiveDate(new Date());
                if (calViewMode === 'day') requestAnimationFrame(() => document.getElementById(`day-${format(new Date(), 'yyyy-MM-dd')}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
              }}
              className="w-8 h-8 flex items-center justify-center rounded-xl"
              style={{ background: T.card, border: `1px solid ${T.brd}` }}>
              <Crosshair size={14} style={{ color: T.accent }} />
            </button>
            <button onClick={() => setActiveDate(d => addDays(d, -7))} className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ background: T.card, border: `1px solid ${T.brd}` }}>
              <ChevronRight size={14} style={{ color: T.sec, transform: 'rotate(180deg)' }} />
            </button>
            <button onClick={() => setActiveDate(d => addDays(d, 7))} className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ background: T.card, border: `1px solid ${T.brd}` }}>
              <ChevronRight size={14} style={{ color: T.sec }} />
            </button>
          </div>
        </div>

        <motion.div animate={{ height: isMonthExpanded ? 290 : 0 }} transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }} className="overflow-hidden relative">
          <motion.div animate={{ opacity: isMonthExpanded ? 1 : 0, y: isMonthExpanded ? 0 : -12 }} transition={{ duration: 0.2 }}
            style={{ position: 'absolute', inset: 0, pointerEvents: isMonthExpanded ? 'auto' : 'none' }}>
            <MiniCalendar selectedDate={activeDate} onSelect={d => { setActiveDate(d); setIsMonthExpanded(false); }} />
          </motion.div>
        </motion.div>
      </div>

      {/* ── Calendar views ───────────────────────────── */}
      <div
        className="flex flex-col"
        style={{ flex: 1, overflow: 'hidden', paddingBottom: 'calc(68px + env(safe-area-inset-bottom))' }}
        onTouchStart={onSwipeStart}
        onTouchMove={onSwipeMove}
        onTouchEnd={onSwipeEnd}
      >
        {calViewMode === 'week' ? (
          infiniteScrollMode ? (
            /* ── Infinite horizontal week scroll ── */
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              {/* Shared time strip — fixed left, scrolls vertically in sync with visible slide */}
              <div style={{ width: 38, flexShrink: 0, overflow: 'hidden', position: 'relative', borderRight: `1px solid ${T.brd}` }}>
                <div ref={timeStripInnerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${24 * infHourH}px` }}>
                  {Array.from({ length: 24 }, (_, h) => h).map(h => h > 0 && (
                    <div key={h} style={{ position: 'absolute', top: h * infHourH - 7, right: 5, left: 0, textAlign: 'right' }}>
                      <span style={{ fontSize: 9, color: T.mut, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{h}:00</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Horizontal carousel — no snap, free scroll */}
              <div ref={infScrollRef} className="no-scrollbar" style={{ flex: 1, display: 'flex', overflowX: 'auto' }} onScroll={handleInfScroll}>
                {[prevWeekDays, weekDays, nextWeekDays].map((wDays, slideIdx) => (
                  <div key={slideIdx} style={{ flex: '0 0 100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div className="flex shrink-0" style={{ borderBottom: `1px solid ${T.brd}` }}>
                      {wDays.map(d => {
                        const isToday = isSameDay(d, now);
                        const isSel = isSameDay(d, activeDate);
                        return (
                          <button key={d.toISOString()} className="flex-1 flex flex-col items-center py-1" onClick={() => setActiveDate(d)}>
                            <span className="text-[9px] font-bold uppercase" style={{ color: isToday ? T.accent : T.mut }}>
                              {format(d, 'eeeee', { locale: de })}
                            </span>
                            <span className="text-xs w-7 h-7 flex items-center justify-center rounded-full"
                              style={{ background: isToday ? T.danger : isSel ? `${T.accent}20` : 'transparent', color: isToday ? '#fff' : isSel ? T.accent : T.pri, fontWeight: isSel || isToday ? 700 : 500 }}>
                              {format(d, 'd')}
                            </span>
                            <div className="w-1 h-1 rounded-full" style={{ background: isToday ? T.danger : 'transparent', marginTop: 1 }} />
                          </button>
                        );
                      })}
                    </div>
                    <MobileWeekGrid
                      weekDays={wDays}
                      events={events}
                      now={now}
                      hideTimeStrip
                      onScrollY={slideIdx === 1 ? handleInfScrollY : undefined}
                      onHourHeightChange={h => setInfHourH(h)}
                      onEventTap={id => { const ev = events.find(e => e.id === id); if (ev) setSelectedEvent(ev); onEventClick?.(id); }}
                      onNewEvent={(start) => { onNewEvent?.(start); }}
                      onEventUpdate={onEventUpdate}
                      onWeekShift={dir => setActiveDate(d => addDays(d, dir * 7))}
                      onEventDragChange={active => { eventDragActiveRef.current = active; setEventDragActive(active); }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
          <div
            style={{
              transform: snapping === 'left' ? 'translateX(-100%)' : snapping === 'right' ? 'translateX(100%)' : `translateX(${swipeDx * 0.4}px)`,
              transition: snapping ? 'transform 0.24s cubic-bezier(0.4,0,0.2,1)' : (swipeDx === 0 && !eventDragActive) ? 'transform 0.18s ease-out' : 'none',
              flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            <div className="flex shrink-0" style={{ borderBottom: allDayRows.length > 0 ? 'none' : `1px solid ${T.brd}`, paddingLeft: 38 }}>
              {weekDays.map(d => {
                const isToday = isSameDay(d, now);
                const isSel = isSameDay(d, activeDate);
                return (
                  <button key={d.toISOString()} className="flex-1 flex flex-col items-center py-1"
                    style={{ borderLeft: '1px solid var(--border-color)', background: isToday ? 'rgba(59,130,246,0.04)' : 'transparent', border: 'none', cursor: 'pointer' }}
                    onClick={() => setActiveDate(d)}>
                    <span className="text-[9px] font-bold uppercase" style={{ color: isToday ? T.accent : T.mut }}>
                      {format(d, 'eeeee', { locale: de })}
                    </span>
                    <span className="text-xs w-7 h-7 flex items-center justify-center rounded-full"
                      style={{ background: isToday ? T.danger : isSel ? `${T.accent}20` : 'transparent', color: isToday ? '#fff' : isSel ? T.accent : T.pri, fontWeight: isSel || isToday ? 700 : 500 }}>
                      {format(d, 'd')}
                    </span>
                    <div className="w-1 h-1 rounded-full" style={{ background: isToday ? T.danger : 'transparent', marginTop: 1 }} />
                  </button>
                );
              })}
            </div>

            {/* AllDay events strip — Google Calendar style */}
            {allDayRows.length > 0 && (
              <div className="shrink-0" style={{ paddingLeft: 38, borderBottom: `1px solid ${T.brd}`, height: allDayRows.length * 20 + 4 }}>
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                  {allDayRows.flatMap((row, ri) =>
                    row.map(({ event, sc, ec }) => (
                      <button
                        key={event.id}
                        onClick={() => { const ev = events.find(e => e.id === event.id); if (ev) setSelectedEvent(ev); }}
                        style={{
                          position: 'absolute',
                          top: ri * 20 + 2,
                          left: `${(sc / 7) * 100}%`,
                          width: `calc(${((ec - sc + 1) / 7) * 100}% - 2px)`,
                          height: 18,
                          borderRadius: 3,
                          background: (event.color || T.accent) + 'DD',
                          overflow: 'hidden',
                          padding: '0 4px',
                          display: 'flex',
                          alignItems: 'center',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {event.title}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            <MobileWeekGrid
              key={weekStartStr}
              weekDays={weekDays}
              events={events}
              now={now}
              onEventTap={id => {
                const ev = events.find(e => e.id === id);
                if (ev) setSelectedEvent(ev);
                onEventClick?.(id);
              }}
              onNewEvent={(start, _end) => { onNewEvent?.(start); }}
              onEventUpdate={onEventUpdate}
              onWeekShift={dir => setActiveDate(d => addDays(d, dir * 7))}
              onEventDragChange={active => { eventDragActiveRef.current = active; setEventDragActive(active); }}
            />
          </div>
          )
        ) : (
          /* ── Day / Agenda view (infinite scroll) ── */
          <div
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            <div className="flex-1 overflow-y-auto pb-4" style={{ paddingLeft: 12, paddingRight: 12 }}>
              {dayViewDays.map(day => {
                const isToday = isSameDay(day, now);
                const sameDay = (e: any) => { try { return isSameDay(new Date(e.start), day); } catch { return false; } };
                const allDayEvs = events.filter(e => e.allDay && sameDay(e));
                const dayEvs = events
                  .filter(e => !e.allDay && sameDay(e))
                  .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
                return (
                  <div key={day.toISOString()} id={`day-${format(day, 'yyyy-MM-dd')}`}>
                    {/* Day header */}
                    <div className="flex items-center gap-3 py-3">
                      {isToday && <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg shrink-0" style={{ background: T.accent, color: '#fff' }}>Heute</span>}
                      <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: isToday ? T.accent : T.sec }}>
                        {format(day, 'EEEE d. MMM', { locale: de }).toUpperCase()}
                      </span>
                      <div className="flex-1 h-px" style={{ background: T.brd }} />
                    </div>
                    {/* All-day events */}
                    {allDayEvs.map(ev => (
                      <button key={`allday-${ev.id}`} onClick={() => { const found = events.find(e => e.id === ev.id); if (found) setSelectedEvent(found); }}
                        className="w-full flex items-center gap-2 mb-2 text-left px-2 py-1.5 rounded-xl"
                        style={{ background: (ev.color || T.accent) + '22', border: `1px solid ${(ev.color || T.accent)}44` }}>
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: ev.color || T.accent }} />
                        <span className="text-xs font-semibold flex-1 truncate" style={{ color: T.pri }}>{ev.title}</span>
                        <span className="text-[10px] shrink-0" style={{ color: T.mut }}>Ganztag</span>
                      </button>
                    ))}
                    {dayEvs.length === 0 && allDayEvs.length === 0 ? (
                      <p className="text-xs pb-3 pl-1" style={{ color: T.mut }}>Keine Ereignisse</p>
                    ) : dayEvs.map(ev => {
                      const evStart = new Date(ev.start);
                      const evEnd = ev.end ? new Date(ev.end) : new Date(evStart.getTime() + 3_600_000);
                      const color = ev.color || T.accent;
                      return (
                        <button key={ev.id} onClick={() => { const found = events.find(e => e.id === ev.id); if (found) setSelectedEvent(found); }}
                          className="w-full flex items-stretch gap-0 mb-3 text-left">
                          {/* Time column */}
                          <div className="w-12 shrink-0 flex flex-col items-end justify-between pr-2 py-1">
                            <span className="text-[11px] font-bold leading-none" style={{ color: T.sec }}>{format(evStart, 'HH:mm')}</span>
                            <span className="text-[10px] leading-none" style={{ color: T.mut }}>{format(evEnd, 'HH:mm')}</span>
                          </div>
                          {/* Timeline */}
                          <div className="flex flex-col items-center w-5 shrink-0 py-1">
                            <div className="w-px flex-1" style={{ background: color + '66', minHeight: 6 }} />
                            <div className="w-3 h-3 rounded-full border-2 shrink-0 my-0.5" style={{ borderColor: color, background: T.card }} />
                            <div className="w-px flex-1" style={{ background: color + '66', minHeight: 6 }} />
                          </div>
                          {/* Event card */}
                          <div className="flex-1 rounded-2xl px-3 py-2.5 ml-2" style={{ background: color + '22', border: `1px solid ${color}44` }}>
                            <p className="text-sm font-bold leading-snug" style={{ color: T.pri }}>{ev.title}</p>
                            <p className="text-[11px] mt-0.5" style={{ color: T.sec }}>{format(evStart, 'HH:mm')} – {format(evEnd, 'HH:mm')}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              {/* Infinite scroll sentinel */}
              <div ref={dayViewSentinelRef} style={{ height: 1 }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom smart bar — liquid glass ─────────── */}
      <button
        onClick={() => { setSearchQuery(''); setIsSearchOpen(true); }}
        className="fixed left-3 right-3 flex items-center gap-3 px-4 py-3 rounded-2xl z-20"
        style={{
          bottom: kbOffset > 0 ? kbOffset + 8 : 'max(16px, calc(env(safe-area-inset-bottom) + 8px))',
          background: theme === 'dark' ? 'rgba(15,23,42,0.72)' : 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
          boxShadow: theme === 'dark' ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 32px rgba(0,0,0,0.12)',
        }}
      >
        <div className="flex-1 text-left">
          <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: T.mut }}>
            {format(now, 'EEE, d. MMM', { locale: de })} · Nächstes Ereignis
          </p>
          {nextEvent ? (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: nextEvent.color || T.accent }} />
              <span className="text-sm font-semibold truncate" style={{ color: T.pri }}>{nextEvent.title}</span>
              <span className="text-xs shrink-0" style={{ color: T.mut }}>{format(new Date(nextEvent.start), 'HH:mm')}</span>
            </div>
          ) : (
            <span className="text-sm" style={{ color: T.mut }}>Tippe zum Suchen oder Erfassen…</span>
          )}
        </div>
        <div className="w-8 h-8 flex items-center justify-center rounded-xl shrink-0" style={{ background: T.hov }}>
          <Search size={14} style={{ color: T.sec }} />
        </div>
      </button>
    </div>
  );
}
