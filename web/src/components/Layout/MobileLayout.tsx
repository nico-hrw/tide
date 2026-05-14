"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar as CalendarIcon,
  FileText,
  User,
  ArrowLeft,
  Folder,
  ChevronRight,
  Plus,
  Settings,
  LogOut,
  Dumbbell,
  CheckSquare,
  Square,
  Trash2,
  Check,
} from 'lucide-react';
import { isSameDay, format, startOfWeek, addDays } from 'date-fns';
import { enUS } from 'date-fns/locale';
import MiniCalendar from '../Calendar/MiniCalendar';
import { useDataStore } from '@/store/useDataStore';
import Avatar from '../Profile/Avatar';

// ─── Design tokens (light mode) ──────────────────────────────────────────────
// TODO(dark): when adding dark mode, replace each token with a conditional
// value based on a useColorScheme() hook, or use Tailwind dark: variants
// throughout the JSX (search for every TODO(dark) comment in this file).
const T = {
  bg:          '#FFFFFF',
  card:        '#FFFFFF',
  accent:      '#3B82F6',
  textPrimary: '#111827',
  textSec:     '#6B7280',
  textMuted:   '#9CA3AF',
  border:      '#E5E7EB',
  iconBg:      '#EFF6FF',
  rowHover:    'rgba(0,0,0,0.035)',
} as const;

// ─── Shared animation preset — direction-aware ───────────────────────────────
// getTabAnim() is defined inside MobileLayout (needs swipeDir state)

// ─── Types ────────────────────────────────────────────────────────────────────
interface MobileLayoutProps {
  events: any[];
  files: any[];
  folders: any[];
  onNoteSelect: (id: string, title: string) => void;
  onNewNote: () => void;
  onDeleteNote?: (id: string) => void;
  editorElement: React.ReactNode;
  activeNoteId: string | null;
  activeNoteTitle: string;
  onNewEvent?: (date: Date) => void;
  onEventClick?: (id: string) => void;
  onEventUpdate?: (id: string, newStart: Date, newEnd: Date) => void;
  onEventDelete?: (id: string) => void;
  onTaskComplete?: (id: string, completed: boolean) => void;
  userProfile?: {
    username: string;
    email: string;
    avatar_seed?: string;
    avatar_salt?: string;
    bio?: string;
    title?: string;
    id?: string;
    user_id?: string;
  } | null;
}

type Tab = 'calendar' | 'notes' | 'profile';

// ─── MobileNoteRow ────────────────────────────────────────────────────────────
const MobileNoteRow = ({ file, onClick }: { file: any; onClick: () => void }) => (
  <button
    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-colors active:bg-black/5"
    onClick={onClick}
  >
    {/* TODO(dark): iconBg → dark:bg-blue-900/20 */}
    <div
      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
      style={{ backgroundColor: T.iconBg }}
    >
      <FileText size={16} style={{ color: T.accent }} />
    </div>
    <span className="flex-1 text-sm font-semibold truncate" style={{ color: T.textPrimary }}>
      {file.title || 'Untitled'}
    </span>
  </button>
);

// ─── MobileFolderItem ─────────────────────────────────────────────────────────
const MobileFolderItem = ({
  folder,
  allFiles,
  level = 0,
}: {
  folder: any;
  allFiles: any[];
  level?: number;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { loadedDirectories } = useDataStore();

  const children = allFiles.filter(f => f.parent_id === folder.id);
  const subfolders = children.filter(f => f.type === 'folder');
  const notes = children.filter(f => f.type !== 'folder');

  const handleToggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next && !loadedDirectories.has(folder.id)) {
      useDataStore.getState().fetchDirectory(folder.id);
    }
  };

  return (
    // TODO(dark): card bg should be dark:bg-gray-900, border dark:border-gray-800
    <div
      className={`flex flex-col rounded-3xl overflow-hidden${level > 0 ? ' mt-2' : ''}`}
      style={{ backgroundColor: T.card, border: `1px solid ${T.border}` }}
    >
      <button
        onClick={handleToggle}
        className="flex items-center gap-3 px-5 py-4 w-full text-left active:bg-black/5"
        // TODO(dark): hover bg should be dark:bg-gray-800/50
        style={{ backgroundColor: 'rgba(249,250,251,1)' }}
      >
        {/* TODO(dark): folder icon dark:text-blue-400 */}
        <Folder size={18} style={{ color: T.accent }} />
        <span
          className="font-bold text-sm w-full truncate"
          style={{ color: T.textPrimary }} /* TODO(dark): dark:text-gray-100 */
        >
          {folder.title || 'Untitled Folder'}
        </span>
        <motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.18 }}>
          <ChevronRight size={18} style={{ color: T.textMuted }} /* TODO(dark): dark:text-gray-500 */ />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="flex flex-col px-3 py-2 pl-4">
              {subfolders.map(sub => (
                <MobileFolderItem key={sub.id} folder={sub} allFiles={allFiles} level={level + 1} />
              ))}
              {notes.map(file => (
                <MobileNoteRow
                  key={file.id}
                  file={file}
                  onClick={() => {
                    useDataStore.getState().setActiveNoteId(file.id);
                    window.dispatchEvent(
                      new CustomEvent('mobile_open_note', { detail: { id: file.id, title: file.title } })
                    );
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Time-relative info for an event ─────────────────────────────────────────
function formatTimeInfo(
  startDate: Date,
  endDate: Date,
  now: Date
): { status: string; duration: string } {
  const minsToStr = (ms: number) => {
    const m = Math.round(Math.abs(ms) / 60_000);
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h${m % 60 > 0 ? ` ${m % 60}m` : ''}`;
  };

  const diffStart = startDate.getTime() - now.getTime();
  const diffEnd = endDate.getTime() - now.getTime();
  const durationMs = endDate.getTime() - startDate.getTime();

  let status: string;
  if (diffStart > 0) {
    status = `Starts in ${minsToStr(diffStart)}`;
  } else if (diffEnd > 0) {
    status = `Running — ${minsToStr(diffEnd)} left`;
  } else {
    status = `Ended ${minsToStr(diffEnd)} ago`;
  }

  const duration = durationMs > 60_000 ? `Duration: ${minsToStr(durationMs)}` : '';
  return { status, duration };
}

// ─── Recurrence-aware event filter for a given date ──────────────────────────
function filterEventsForDate(events: any[], targetDate: Date): any[] {
  return events
    .filter(e => {
      const startNode = new Date(e.start);
      const occDateKey = format(targetDate, 'yyyy-MM-dd');
      if (e.exdates && e.exdates.includes(occDateKey)) return false;

      const rule = (e as any).recurrence_rule;
      const rrule =
        rule ||
        `FREQ=${e.recurrence && e.recurrence !== 'none' ? e.recurrence.toUpperCase() : 'NONE'};INTERVAL=1`;

      let freq = 'none';
      let interval = 1;
      const matchFreq = rrule.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY|NONE)/i);
      if (matchFreq) freq = matchFreq[1].toLowerCase();
      const matchInterval = rrule.match(/INTERVAL=(\d+)/i);
      if (matchInterval) interval = parseInt(matchInterval[1], 10);
      interval = Math.max(1, interval);

      if (freq === 'none') return isSameDay(startNode, targetDate);

      let current = new Date(startNode);
      const safeRecEnd = (e as any).recurrence_end
        ? new Date((e as any).recurrence_end)
        : new Date(targetDate.getTime() + 31_536_000_000);

      let count = 0;
      const targetTime = new Date(
        targetDate.getFullYear(),
        targetDate.getMonth(),
        targetDate.getDate()
      ).getTime();
      const endTime = new Date(
        safeRecEnd.getFullYear(),
        safeRecEnd.getMonth(),
        safeRecEnd.getDate()
      ).getTime();

      while (count < 1000) {
        const curTime = new Date(
          current.getFullYear(),
          current.getMonth(),
          current.getDate()
        ).getTime();
        if (curTime === targetTime) return true;
        if (curTime > targetTime || curTime > endTime) break;
        if (freq === 'daily') current.setDate(current.getDate() + interval);
        else if (freq === 'weekly') current.setDate(current.getDate() + interval * 7);
        else if (freq === 'monthly') current.setMonth(current.getMonth() + interval);
        else if (freq === 'yearly') current.setFullYear(current.getFullYear() + interval);
        else break;
        count++;
      }
      return false;
    })
    .map(e => {
      const startNode = new Date(e.start);
      const endNode = e.end ? new Date(e.end) : startNode;
      const duration = endNode.getTime() - startNode.getTime();
      const mappedStart = new Date(targetDate);
      mappedStart.setHours(startNode.getHours(), startNode.getMinutes(), 0, 0);
      return {
        ...e,
        id: isSameDay(new Date(e.start), targetDate) ? e.id : `${e.id}_${mappedStart.getTime()}`,
        start: mappedStart.toISOString(),
        end: new Date(mappedStart.getTime() + duration).toISOString(),
      };
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

// ─── MobileLayout ─────────────────────────────────────────────────────────────
export default function MobileLayout({
  events,
  files,
  folders,
  onNoteSelect,
  onNewNote,
  onDeleteNote,
  editorElement,
  activeNoteId,
  activeNoteTitle,
  onNewEvent,
  onEventClick,
  onEventUpdate,
  onEventDelete,
  onTaskComplete,
  userProfile,
}: MobileLayoutProps) {
  const [activeTab, setActiveTab] = useState<Tab>('calendar');
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [activeDate, setActiveDate] = useState(new Date());
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [visibleDays, setVisibleDays] = useState(5);
  const [isMonthExpanded, setIsMonthExpanded] = useState(false);
  const [editingDescId, setEditingDescId] = useState<string | null>(null);
  const loadMoreTriggeredAt = useRef<number>(0);

  // Swipe navigation
  const tabOrder: Tab[] = ['notes', 'calendar', 'profile'];
  const swipeTouchStartX = useRef<number>(0);
  const [swipeDelta, setSwipeDelta] = useState(0);
  const [trackerProgress, setTrackerProgress] = useState(0);
  const [swipeDir, setSwipeDir] = useState<1 | -1>(1);

  const getTabAnim = () => ({
    initial:    { x: swipeDir * 40, opacity: 0 },
    animate:    { x: 0, opacity: 1 },
    exit:       { x: swipeDir * -40, opacity: 0 },
    transition: { duration: 0.2, ease: 'easeOut' as const },
  });

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(activeDate, { weekStartsOn: 0 });
    return Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
  }, [activeDate]);

  const username =
    userProfile?.username ||
    (typeof window !== 'undefined' ? sessionStorage.getItem('tide_user_name') ?? '' : '') ||
    userProfile?.email?.split('@')[0] ||
    'User';

  const avatarLetter = username[0]?.toUpperCase() ?? 'U';

  const isDayToday = isSameDay(activeDate, now);
  const dayLabel = isDayToday ? 'Today' : format(activeDate, 'EEEE', { locale: enUS });

  // Listen for note open events dispatched by MobileNoteRow / MobileFolderItem
  useEffect(() => {
    const handleMobileOpenNote = (e: Event) => {
      const { id, title } = (e as CustomEvent).detail;
      onNoteSelect(id, title);
      setIsEditingNote(true);
      setActiveTab('notes');
    };
    window.addEventListener('mobile_open_note', handleMobileOpenNote);
    return () => window.removeEventListener('mobile_open_note', handleMobileOpenNote);
  }, [onNoteSelect]);

  // Reset expandedEventId when activeDate changes
  useEffect(() => {
    setExpandedEventId(null);
    setVisibleDays(5);
  }, [activeDate]);

  // Shows activeDate + 4 more days so the timeline always has scrollable content
  const upcomingDays = useMemo(() => {
    return Array.from({ length: visibleDays }).map((_, i) => {
      const date = addDays(activeDate, i);
      return { date, events: filterEventsForDate(events, date) };
    });
  }, [events, activeDate, visibleDays]);

  // ── Scroll handler ──────────────────────────────────────────────────────────
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (activeTab !== 'calendar') return;
    const el = e.currentTarget;

    // Month/week toggle
    if (el.scrollTop <= 15) {
      setIsMonthExpanded(true);
    } else if (el.scrollTop > 60) {
      setIsMonthExpanded(false);
    }

    // Infinite scroll
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) {
      if (visibleDays !== loadMoreTriggeredAt.current) {
        loadMoreTriggeredAt.current = visibleDays;
        setVisibleDays(d => d + 5);
      }
    }
  };

  const handleSwipeStart = (e: React.TouchEvent) => {
    swipeTouchStartX.current = e.touches[0].clientX;
    setSwipeDelta(0);
    setTrackerProgress(0);
  };

  const handleSwipeMove = (e: React.TouchEvent) => {
    const delta = e.touches[0].clientX - swipeTouchStartX.current;
    setSwipeDelta(delta);
    const idx = tabOrder.indexOf(activeTab);
    if (idx === 2 && delta < 0) {
      setTrackerProgress(Math.min(1, Math.abs(delta) / 150));
    } else {
      setTrackerProgress(0);
    }
  };

  const handleSwipeEnd = () => {
    const delta = swipeDelta;
    const threshold = 60;
    const idx = tabOrder.indexOf(activeTab);
    if (delta < -threshold) {
      if (idx === 2) {
        if (trackerProgress >= 1) {
          const url = process.env.NEXT_PUBLIC_TRACKER_URL;
          if (url) window.location.href = url;
        }
      } else {
        setSwipeDir(1);
        setActiveTab(tabOrder[Math.min(idx + 1, 2)]);
      }
    } else if (delta > threshold && idx > 0) {
      setSwipeDir(-1);
      setActiveTab(tabOrder[Math.max(idx - 1, 0)]);
    }
    setSwipeDelta(0);
    setTrackerProgress(0);
  };

  // ── Header key per sub-view ─────────────────────────────────────────────────
  const headerKey =
    activeTab === 'calendar'
      ? 'header-calendar'
      : activeTab === 'notes' && isEditingNote
      ? 'header-notes-editor'
      : activeTab === 'notes'
      ? 'header-notes-list'
      : 'header-profile';

  // ── Content key per sub-view ────────────────────────────────────────────────
  const contentKey =
    activeTab === 'calendar'
      ? 'calendar'
      : activeTab === 'notes' && isEditingNote
      ? 'notes-editor'
      : activeTab === 'notes'
      ? 'notes-list'
      : 'profile';

  return (
    // TODO(dark): outer bg dark:bg-gray-950
    <div
      className="flex md:hidden flex-col h-[100dvh] w-full relative overflow-hidden"
      style={{ backgroundColor: T.bg }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      {/* TODO(dark): header bg dark:bg-gray-900, border dark:border-gray-800 */}
      {/* TODO(dark): dark:bg-gray-900 dark:border-gray-800 */}
      <div
        className="w-full z-40 shrink-0"
        style={{ backgroundColor: T.card, borderBottom: `1px solid ${T.border}` }}
      >
        <AnimatePresence mode="wait">

          {/* Calendar header */}
          {activeTab === 'calendar' && (
            <motion.div key={headerKey} {...getTabAnim()} className="pt-8 pb-2">
              {/* Small date label */}
              {/* TODO(dark): dark:text-gray-500 */}
              <p className="text-xs px-5 mb-0.5" style={{ color: T.textMuted }}>
                {format(activeDate, 'd. MMMM yyyy', { locale: enUS })}
              </p>

              {/* Large day name */}
              {/* TODO(dark): dark:text-gray-100 */}
              <p className="text-3xl font-bold px-5 mb-3" style={{ color: T.textPrimary }}>
                {dayLabel}
              </p>

              {/* Month calendar OR week strip */}
              <AnimatePresence mode="wait">
                {isMonthExpanded ? (
                  <motion.div
                    key="month-cal"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <MiniCalendar
                      selectedDate={activeDate}
                      onSelect={d => {
                        setActiveDate(d);
                        setIsMonthExpanded(false);
                      }}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="week-strip"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className="flex justify-between px-4 pb-1">
                      {weekDays.map(d => {
                        const isSelected = isSameDay(d, activeDate);
                        const isWeekToday = isSameDay(d, now);
                        return (
                          <button
                            key={d.toISOString()}
                            onClick={() => setActiveDate(d)}
                            className="flex flex-col items-center gap-0.5 py-0.5"
                          >
                            <span
                              className="text-[10px] font-semibold uppercase"
                              style={{ color: isWeekToday ? T.accent : T.textMuted }}
                            >
                              {format(d, 'eeeee', { locale: enUS })}
                            </span>
                            <span
                              className="text-sm w-8 h-8 flex items-center justify-center"
                              style={{
                                color: isWeekToday ? T.accent : isSelected ? T.textPrimary : T.textSec,
                                fontWeight: isSelected ? 700 : 500,
                              }}
                            >
                              {format(d, 'd')}
                            </span>
                            <div
                              className="w-1 h-1 rounded-full"
                              style={{ backgroundColor: isWeekToday ? T.accent : 'transparent' }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* Notes list header */}
          {activeTab === 'notes' && !isEditingNote && (
            <motion.div
              key={headerKey}
              {...getTabAnim()}
              className="px-6 pt-12 pb-6 flex items-center justify-center"
            >
              {/* TODO(dark): dark:text-gray-100 */}
              <h1 className="font-bold text-xl" style={{ color: T.textPrimary }}>
                My Notes
              </h1>
            </motion.div>
          )}

          {/* Notes editor header */}
          {activeTab === 'notes' && isEditingNote && (
            <motion.div
              key={headerKey}
              {...getTabAnim()}
              className="px-4 pt-12 pb-4 flex items-center gap-3"
            >
              <button
                onClick={() => setIsEditingNote(false)}
                className="p-2 rounded-full"
                // TODO(dark): hover dark:bg-gray-800
                style={{ backgroundColor: T.iconBg }}
              >
                <ArrowLeft size={20} style={{ color: T.accent }} />
              </button>
              {/* TODO(dark): dark:text-gray-100 */}
              <span className="font-bold text-base truncate" style={{ color: T.textPrimary }}>
                {activeNoteTitle || 'Untitled Note'}
              </span>
            </motion.div>
          )}

          {/* Profile header */}
          {activeTab === 'profile' && (
            <motion.div
              key={headerKey}
              {...getTabAnim()}
              className="px-6 pt-12 pb-6 flex items-center justify-center"
            >
              {/* TODO(dark): dark:text-gray-100 */}
              <h1 className="font-bold text-xl" style={{ color: T.textPrimary }}>
                Profile
              </h1>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ── Scrollable content ──────────────────────────────────────────────── */}
      <div
        className="flex-1 w-full overflow-y-auto no-scrollbar pb-12"
        onScroll={handleScroll}
        onTouchStart={handleSwipeStart}
        onTouchMove={handleSwipeMove}
        onTouchEnd={handleSwipeEnd}
        style={{
          transform: `translateX(${swipeDelta * 0.15}px)`,
          transition: swipeDelta === 0 ? 'transform 0.2s ease-out' : 'none',
        }}
      >
        <AnimatePresence mode="wait">

          {/* ── Calendar tab ─────────────────────────────────────────────── */}
          {activeTab === 'calendar' && (
            <motion.div key={contentKey} {...getTabAnim()}>
              {/* TODO(dark): dark:bg-gray-900 */}
              <div
                className="rounded-t-[32px] overflow-hidden min-h-full"
                style={{
                  backgroundColor: T.card,
                  boxShadow: '0 0 0 1.5px #D1D5DB, 0 2px 16px rgba(0,0,0,0.07)',
                }}
              >
                <div className="p-5 pb-32">
                  {upcomingDays.map(({ date, events: dayEvents }, dayIdx) => {
                    const allDayEvents = dayEvents.filter(e =>
                      e.allDay === true ||
                      (e.end &&
                        format(new Date(e.start), 'HH:mm') === '00:00' &&
                        format(new Date(e.end), 'HH:mm') === '23:59')
                    );
                    const timedEvents = dayEvents.filter(e => !allDayEvents.includes(e));

                    const isDayToday = isSameDay(date, now);

                    // Progress gradient for today's vertical line
                    let lineBackground: string = T.border;
                    if (isDayToday && timedEvents.length >= 2) {
                      const firstStart = new Date(timedEvents[0].start).getTime();
                      const lastStart = new Date(timedEvents[timedEvents.length - 1].start).getTime();
                      const nowMs = now.getTime();
                      const pct =
                        lastStart === firstStart
                          ? 0
                          : Math.min(100, Math.max(0, ((nowMs - firstStart) / (lastStart - firstStart)) * 100));
                      lineBackground = `linear-gradient(to bottom, ${T.accent} ${pct}%, ${T.border} ${pct}%)`;
                    }

                    return (
                      <div key={date.toISOString()} className={dayIdx > 0 ? 'mt-8' : ''}>
                        {/* Date separator */}
                        <div className="flex items-center gap-4 mb-5">
                          {/* TODO(dark): dark:text-gray-500 */}
                          <span
                            className="text-xs font-semibold uppercase tracking-widest shrink-0"
                            style={{ color: T.textMuted }}
                          >
                            {isDayToday
                              ? `Today · ${format(date, 'EEE d', { locale: enUS })}`
                              : format(date, 'EEEE d', { locale: enUS })}
                          </span>
                          {/* TODO(dark): dark:bg-gray-800 */}
                          <div className="flex-1 h-px" style={{ backgroundColor: T.border }} />
                        </div>

                        {/* All-day event chips */}
                        {allDayEvents.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-4">
                            {allDayEvents.map(event => (
                              <div
                                key={event.id}
                                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                                style={{
                                  backgroundColor: (event.color || T.accent) + '25',
                                  color: event.color || T.accent,
                                }}
                              >
                                <div
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: event.color || T.accent }}
                                />
                                {event.title || 'All Day Event'}
                              </div>
                            ))}
                          </div>
                        )}

                        {dayEvents.length === 0 ? (
                          <div className="flex flex-col items-center gap-2 py-6">
                            <CalendarIcon size={20} style={{ color: T.border }} />
                            <p className="text-xs" style={{ color: T.textMuted }}>Keine Termine</p>
                          </div>
                        ) : timedEvents.length === 0 ? null : (
                          <div className="relative flex flex-col">
                            {/* Vertical timeline line */}
                            {/* TODO(dark): base color dark:bg-gray-700 */}
                            <div
                              className="absolute top-2 bottom-4 w-0.5 z-0"
                              style={{ left: '4rem', background: lineBackground }}
                            />

                            {timedEvents.map((event, idx) => {
                              // Time-proportional spacing from previous event's end
                              const prevEvent = idx > 0 ? timedEvents[idx - 1] : null;
                              const gapMs = prevEvent
                                ? new Date(event.start).getTime() -
                                  new Date(prevEvent.end || prevEvent.start).getTime()
                                : 0;
                              const gapMinutes = Math.max(0, gapMs / 60_000);
                              const eventMarginTop = idx === 0
                                ? 0
                                : Math.round(Math.max(8, Math.min(56, 8 + (gapMinutes / 60) * 64)));

                              const startDate = new Date(event.start);
                              const endDate = event.end ? new Date(event.end) : startDate;
                              const nowDate = now;
                              const isPast = endDate < nowDate;
                              const isActive = startDate <= nowDate && nowDate < endDate;
                              const isExpanded = expandedEventId === event.id;

                              return (
                                <div
                                  key={`${event.id}-${idx}`}
                                  className="flex gap-4 relative z-10"
                                  style={{ marginTop: eventMarginTop + 'px' }}
                                >
                                  {/* Time column */}
                                  <div className="w-12 flex flex-col text-right pt-0.5 shrink-0">
                                    {/* TODO(dark): dark:text-gray-500 */}
                                    <span className="text-xs font-medium" style={{ color: T.textSec }}>
                                      {format(startDate, 'HH:mm')}
                                    </span>
                                    {event.end && (
                                      <span className="text-[10px] mt-0.5" style={{ color: T.textMuted }}>
                                        {format(endDate, 'HH:mm')}
                                      </span>
                                    )}
                                  </div>

                                  {/* Dot + content */}
                                  <div className="flex flex-col relative w-full">
                                    {/* Colored dot — larger when active */}
                                    {/* TODO(dark): ring-white → dark:ring-gray-900 */}
                                    <div
                                      className="rounded-full absolute ring-4 ring-white z-10 transition-all"
                                      style={{
                                        backgroundColor: isActive ? (event.color || T.accent) : 'white',
                                        border: `2px solid ${event.color || T.accent}`,
                                        width: isActive ? '14px' : '10px',
                                        height: isActive ? '14px' : '10px',
                                        top: isActive ? '0px' : '2px',
                                        left: isActive ? '-7px' : '-5px',
                                        opacity: isPast ? 0.5 : 1,
                                      }}
                                    />

                                    {/* Swipe container */}
                                    <div className="relative overflow-hidden rounded-xl ml-1">
                                      {/* Right swipe background (delete) */}
                                      <div
                                        className="absolute inset-y-0 left-0 flex items-center pl-3"
                                        style={{ backgroundColor: '#FEF2F2' }}
                                      >
                                        <Trash2 size={16} style={{ color: '#EF4444' }} />
                                      </div>
                                      {/* Left swipe background (complete task) */}
                                      {event.is_task && (
                                        <div
                                          className="absolute inset-y-0 right-0 flex items-center pr-3"
                                          style={{ backgroundColor: '#F0FDF4' }}
                                        >
                                          <Check size={16} style={{ color: '#10B981' }} />
                                        </div>
                                      )}

                                      {/* Draggable card */}
                                      <motion.div
                                        drag="x"
                                        dragConstraints={{ left: event.is_task ? -90 : 0, right: 90 }}
                                        dragElastic={{ left: event.is_task ? 0.15 : 0, right: 0.15 }}
                                        onDragEnd={(_, info) => {
                                          if (info.offset.x > 70) {
                                            onEventDelete?.(event.id);
                                          } else if (event.is_task && info.offset.x < -70) {
                                            onTaskComplete?.(event.id, true);
                                          }
                                        }}
                                        onClick={() => setExpandedEventId(isExpanded ? null : event.id)}
                                        className="pl-4 pb-2 pt-2 pr-3 rounded-xl transition-colors relative"
                                        style={{
                                          backgroundColor: (event.color || T.accent) + (isExpanded ? '28' : '15'),
                                        }}
                                      >
                                        {/* Task checkbox — shown when event.is_task is true */}
                                        {event.is_task && (
                                          <button
                                            onClick={e => {
                                              e.stopPropagation();
                                              onTaskComplete?.(event.id, !event.is_completed);
                                            }}
                                            className="mb-1 flex items-center gap-1.5 active:opacity-60"
                                            style={{ color: event.is_completed ? T.accent : T.textMuted }}
                                          >
                                            {event.is_completed
                                              ? <CheckSquare size={15} />
                                              : <Square size={15} />}
                                            <span className="text-[10px] font-semibold uppercase tracking-wide">
                                              {event.is_completed ? 'Erledigt' : 'Aufgabe'}
                                            </span>
                                          </button>
                                        )}
                                        {/* TODO(dark): dark:text-white */}
                                        <h3
                                          className="font-semibold text-sm leading-tight"
                                          style={{
                                            color: T.textPrimary,
                                            textDecoration: event.is_completed ? 'line-through' : 'none',
                                            opacity: event.is_completed ? 0.5 : 1,
                                          }}
                                        >
                                          {event.title || 'Untitled Event'}
                                        </h3>
                                        {event.description && !isExpanded && (
                                          <p
                                            className="text-xs mt-0.5 line-clamp-1"
                                            style={{ color: T.textSec }}
                                          >
                                            {event.description}
                                          </p>
                                        )}

                                        {/* Expanded detail */}
                                        <AnimatePresence>
                                          {isExpanded && (
                                            <motion.div
                                              key="event-detail"
                                              initial={{ opacity: 0, height: 0 }}
                                              animate={{ opacity: 1, height: 'auto' }}
                                              exit={{ opacity: 0, height: 0 }}
                                              transition={{ duration: 0.15, ease: 'easeOut' }}
                                              className="overflow-hidden"
                                            >
                                              <div className="mt-2 flex flex-col gap-2">
                                                {/* Compact status chip */}
                                                {/* TODO(dark): chip color */}
                                                <div
                                                  className="flex items-center px-3 py-1.5 rounded-xl text-xs font-semibold w-fit"
                                                  style={{
                                                    backgroundColor: (event.color || T.accent) + '22',
                                                    color: event.color || T.accent,
                                                  }}
                                                >
                                                  {formatTimeInfo(startDate, endDate, now).status}
                                                </div>

                                                {/* Description — editable on tap */}
                                                {editingDescId === event.id ? (
                                                  <textarea
                                                    autoFocus
                                                    defaultValue={event.description || ''}
                                                    className="text-xs rounded-lg resize-none outline-none w-full"
                                                    style={{
                                                      color: T.textSec,
                                                      backgroundColor: T.iconBg,
                                                      minHeight: '48px',
                                                      padding: '8px',
                                                      border: 'none',
                                                    }}
                                                    onBlur={e => {
                                                      const newDesc = e.target.value;
                                                      useDataStore.setState((s: any) => ({
                                                        events: s.events.map((ev: any) =>
                                                          ev.id === event.id ? { ...ev, description: newDesc } : ev
                                                        )
                                                      }));
                                                      setEditingDescId(null);
                                                    }}
                                                  />
                                                ) : (
                                                  <p
                                                    className="text-xs px-1 cursor-text"
                                                    style={{ color: event.description ? T.textSec : T.textMuted, minHeight: '20px' }}
                                                    onClick={e => { e.stopPropagation(); setEditingDescId(event.id); }}
                                                  >
                                                    {event.description || 'Beschreibung hinzufügen…'}
                                                  </p>
                                                )}

                                                {/* Delete icon button */}
                                                <button
                                                  onClick={e => { e.stopPropagation(); onEventDelete?.(event.id); }}
                                                  className="flex items-center gap-1 px-1 py-1 rounded-lg w-fit active:opacity-60"
                                                  style={{ color: '#EF4444' }}
                                                >
                                                  <Trash2 size={14} />
                                                  <span className="text-xs font-medium">Löschen</span>
                                                </button>
                                              </div>
                                            </motion.div>
                                          )}
                                        </AnimatePresence>
                                      </motion.div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Notes list tab ────────────────────────────────────────────── */}
          {activeTab === 'notes' && !isEditingNote && (
            <motion.div
              key={contentKey}
              {...getTabAnim()}
              className="p-4"
            >
              {/* TODO(dark): card bg dark:bg-gray-900, border dark:border-gray-800 */}
              <div
                className="rounded-3xl overflow-hidden"
                style={{ backgroundColor: T.card, border: `1px solid ${T.border}` }}
              >
                {/* New Note button row */}
                <button
                  onClick={() => {
                    onNewNote();
                    setIsEditingNote(true);
                  }}
                  className="flex items-center gap-3 w-full px-5 py-4 transition-colors active:bg-black/5"
                  style={{ borderBottom: `1px solid ${T.border}` }} /* TODO(dark): dark:border-gray-800 */
                >
                  {/* TODO(dark): iconBg dark:bg-blue-900/20 */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: T.iconBg }}
                  >
                    <Plus size={16} style={{ color: T.accent }} />
                  </div>
                  {/* TODO(dark): dark:text-blue-400 */}
                  <span className="font-semibold text-sm" style={{ color: T.accent }}>
                    New Note
                  </span>
                </button>

                {/* Folders */}
                <div className="flex flex-col gap-1 p-3">
                  {folders
                    .filter(f => !f.parent_id)
                    .map(folder => (
                      <MobileFolderItem key={folder.id} folder={folder} allFiles={files} />
                    ))}

                  {/* Root files */}
                  {files
                    .filter(f => !f.parent_id && f.type !== 'folder')
                    .map(file => (
                      <MobileNoteRow
                        key={file.id}
                        file={file}
                        onClick={() => {
                          useDataStore.getState().setActiveNoteId(file.id);
                          window.dispatchEvent(
                            new CustomEvent('mobile_open_note', { detail: { id: file.id, title: file.title } })
                          );
                        }}
                      />
                    ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Notes editor tab ──────────────────────────────────────────── */}
          {activeTab === 'notes' && isEditingNote && (
            <motion.div
              key={contentKey}
              {...getTabAnim()}
              className="min-h-full p-4"
            >
              {/* TODO(dark): bg dark:bg-gray-900 */}
              <div
                className="min-h-full rounded-3xl p-4"
                style={{ backgroundColor: T.card }}
              >
                {editorElement}
              </div>
            </motion.div>
          )}

          {/* ── Profile tab ───────────────────────────────────────────────── */}
          {activeTab === 'profile' && (
            <motion.div
              key={contentKey}
              {...getTabAnim()}
              className="p-4 flex flex-col gap-4"
            >
              {/* Avatar card */}
              {/* TODO(dark): card bg dark:bg-gray-900, border dark:border-gray-800 */}
              <div
                className="rounded-3xl p-6 flex flex-col items-center gap-2"
                style={{ backgroundColor: T.card, border: `1px solid ${T.border}` }}
              >
                {/* Avatar */}
                {userProfile?.avatar_seed ? (
                  <Avatar
                    seed={`${userProfile.avatar_seed}_${userProfile.avatar_salt ?? ''}`}
                    size={80}
                    style="notionists"
                  />
                ) : (
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-1 uppercase"
                    style={{ background: `linear-gradient(135deg, ${T.accent}, #8B5CF6)` }}
                  >
                    {avatarLetter}
                  </div>
                )}
                {/* TODO(dark): dark:text-gray-100 */}
                <h2 className="text-lg font-bold" style={{ color: T.textPrimary }}>
                  {username}
                </h2>
                {/* TODO(dark): dark:text-gray-400 */}
                <span className="text-sm" style={{ color: T.textSec }}>
                  {userProfile?.email || 'No email linked'}
                </span>
              </div>

              {/* Menu list card */}
              {/* TODO(dark): card bg dark:bg-gray-900, border dark:border-gray-800 */}
              <div
                className="rounded-3xl overflow-hidden"
                style={{ backgroundColor: T.card, border: `1px solid ${T.border}` }}
              >
                {[
                  { icon: <User size={18} />, label: 'Profil', isRed: false },
                  { icon: <Settings size={18} />, label: 'E2EE Keys', isRed: false },
                  { icon: <Settings size={18} />, label: 'Geräte', isRed: false },
                  { icon: <Settings size={18} />, label: 'Passwörter', isRed: false },
                  { icon: <FileText size={18} />, label: 'Sprache', isRed: false },
                  { icon: <LogOut size={18} />, label: 'Abmelden', isRed: true },
                ].map((item, i) => (
                  <button
                    key={item.label}
                    className="flex items-center justify-between w-full px-5 py-4 transition-colors active:bg-black/5"
                    style={{
                      borderTop: i > 0 ? `1px solid ${T.border}` : 'none', /* TODO(dark): dark:border-gray-800 */
                    }}
                  >
                    <div className="flex items-center gap-4">
                      {/* Icon container */}
                      {/* TODO(dark): iconBg dark:bg-gray-800 */}
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: item.isRed ? '#FEF2F2' : T.iconBg, /* TODO(dark): red bg dark:bg-red-900/20 */
                          color: item.isRed ? '#EF4444' : T.textSec, /* TODO(dark): dark:text-gray-400 */
                        }}
                      >
                        {item.icon}
                      </div>
                      {/* TODO(dark): dark:text-gray-200 / red stays */}
                      <span
                        className="font-semibold text-sm"
                        style={{ color: item.isRed ? '#EF4444' : T.textPrimary }}
                      >
                        {item.label}
                      </span>
                    </div>
                    {/* No chevron on Abmelden */}
                    {!item.isRed && (
                      /* TODO(dark): dark:text-gray-600 */
                      <ChevronRight size={18} style={{ color: T.textMuted }} />
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Floating dot navigation — 3 tabs + tracker */}
      {/* TODO(dark): dot color dark:rgba(255,255,255,0.25) */}
      <div className="fixed bottom-5 left-0 right-0 flex justify-center items-center gap-2.5 z-50 pointer-events-none">
        {tabOrder.map((tab) => (
          <div
            key={tab}
            className="rounded-full transition-all duration-200"
            style={{
              width: activeTab === tab ? '18px' : '6px',
              height: '6px',
              backgroundColor: activeTab === tab ? T.accent : 'rgba(0,0,0,0.18)',
            }}
          />
        ))}
        {/* Tracker dot */}
        <div
          className="rounded-full transition-all duration-200"
          style={{
            width: trackerProgress > 0 ? '18px' : '6px',
            height: '6px',
            backgroundColor: trackerProgress > 0 ? T.accent : 'rgba(0,0,0,0.18)',
          }}
        />
      </div>

      {/* Tracker circular progress — appears when swiping from Profile toward Tracker */}
      {trackerProgress > 0 && (
        <div
          className="fixed bottom-3 right-4 z-50 flex items-center justify-center"
          style={{ width: 44, height: 44 }}
        >
          <svg width="44" height="44" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="18" fill="none" stroke="#E5E7EB" strokeWidth="2.5" />
            <circle
              cx="22" cy="22" r="18"
              fill="none"
              stroke={T.accent}
              strokeWidth="2.5"
              strokeDasharray={`${2 * Math.PI * 18}`}
              strokeDashoffset={`${2 * Math.PI * 18 * (1 - trackerProgress)}`}
              strokeLinecap="round"
              transform="rotate(-90 22 22)"
              style={{ transition: 'stroke-dashoffset 0.05s linear' }}
            />
          </svg>
          <div className="absolute" style={{ color: T.accent }}>
            <Dumbbell size={14} />
          </div>
        </div>
      )}
    </div>
  );
}
