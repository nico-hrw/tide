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
  bg:          '#F0F4FF',
  card:        '#FFFFFF',
  accent:      '#3B82F6',
  textPrimary: '#111827',
  textSec:     '#6B7280',
  textMuted:   '#9CA3AF',
  border:      '#E5E7EB',
  iconBg:      '#EFF6FF',
  rowHover:    'rgba(0,0,0,0.035)',
} as const;

// ─── Shared animation preset ─────────────────────────────────────────────────
const tabAnim = {
  initial:    { opacity: 0, y: 8 },
  animate:    { opacity: 1, y: 0 },
  exit:       { opacity: 0, y: -8 },
  transition: { duration: 0.12, ease: 'easeOut' as const },
};

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

// ─── NavTab ───────────────────────────────────────────────────────────────────
const NavTab = ({
  icon,
  active,
  onClick,
  override,
}: {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  override?: React.ReactNode;
}) => (
  <motion.button
    onClick={onClick}
    whileTap={{ scale: 0.82 }}
    className="flex flex-col items-center justify-center flex-1 h-full gap-1 focus:outline-none"
    style={{ color: active ? T.accent : T.textMuted }} /* TODO(dark): inactive dark:text-gray-500 */
  >
    {override ?? icon}
    {/* Active dot */}
    <motion.div
      animate={{ opacity: active ? 1 : 0, scale: active ? 1 : 0 }}
      transition={{ duration: 0.15 }}
      className="w-1 h-1 rounded-full"
      style={{ backgroundColor: T.accent }}
    />
  </motion.button>
);

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
  userProfile,
}: MobileLayoutProps) {
  const [activeTab, setActiveTab] = useState<Tab>('calendar');
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [activeDate, setActiveDate] = useState(new Date());
  const [isCalendarExpanded, setIsCalendarExpanded] = useState(true);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [isMonthOpen, setIsMonthOpen] = useState(false);
  const [visibleDays, setVisibleDays] = useState(5);
  const touchStartY = useRef<number>(0);
  const loadMoreTriggeredAt = useRef<number>(0);

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

    if (el.scrollTop > 10) {
      setIsCalendarExpanded(false);
    }

    // Infinite scroll: only add days once per threshold crossing
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 300;
    if (nearBottom && visibleDays !== loadMoreTriggeredAt.current) {
      loadMoreTriggeredAt.current = visibleDays;
      setVisibleDays(d => d + 5);
    }
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
      <motion.div
        layout
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className="w-full z-40 shrink-0"
        style={{ backgroundColor: T.card, borderBottom: `1px solid ${T.border}`, overflow: 'visible' }}
      >
        <AnimatePresence mode="wait">

          {/* Calendar header */}
          {activeTab === 'calendar' && (
            <motion.div key={headerKey} {...tabAnim} className="pt-8 relative">

              {/* Month dropdown overlay */}
              {isMonthOpen && (
                <div
                  className="absolute top-full left-0 right-0 z-50 shadow-lg"
                  style={{ backgroundColor: T.card, borderBottom: `1px solid ${T.border}` }}
                >
                  <MiniCalendar
                    selectedDate={activeDate}
                    onSelect={d => { setActiveDate(d); setIsMonthOpen(false); }}
                  />
                </div>
              )}

              {isCalendarExpanded ? (
                /* ── Expanded: date label + big day name + week strip ── */
                <div>
                  {/* Tappable small date label */}
                  <button
                    onClick={() => setIsMonthOpen(o => !o)}
                    className="flex items-center gap-1 px-5 mb-0.5 active:opacity-70"
                  >
                    {/* TODO(dark): dark:text-gray-500 */}
                    <span className="text-xs font-medium" style={{ color: T.textMuted }}>
                      {format(activeDate, 'd. MMMM yyyy', { locale: enUS })}
                    </span>
                    <ChevronRight size={10} className="rotate-90" style={{ color: T.textMuted }} />
                  </button>

                  {/* Large day name */}
                  {/* TODO(dark): dark:text-gray-100 */}
                  <p className="text-3xl font-bold px-5 mb-3" style={{ color: T.textPrimary }}>
                    {dayLabel}
                  </p>

                  {/* Week strip */}
                  <div className="flex justify-between px-4 pb-3">
                    {weekDays.map(d => {
                      const isSelected = isSameDay(d, activeDate);
                      const isWeekToday = isSameDay(d, now);
                      return (
                        <button
                          key={d.toISOString()}
                          onClick={() => setActiveDate(d)}
                          className="flex flex-col items-center gap-0.5"
                        >
                          {/* TODO(dark): dark:text-gray-500 */}
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
                          {/* Today dot */}
                          <div
                            className="w-1 h-1 rounded-full"
                            style={{ backgroundColor: isWeekToday ? T.accent : 'transparent' }}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* ── Collapsed: compact month label + week strip ── */
                <div className="flex justify-between items-center px-4 pb-3 pt-1">
                  <button
                    onClick={() => setIsCalendarExpanded(true)}
                    className="flex items-center gap-1 active:opacity-70"
                    style={{ color: T.textMuted }}
                  >
                    {/* TODO(dark): dark:text-gray-500 */}
                    <span className="text-xs font-semibold uppercase tracking-widest">
                      {format(activeDate, 'MMM yyyy', { locale: enUS })}
                    </span>
                    <ChevronRight size={12} className="rotate-90" style={{ color: T.textMuted }} />
                  </button>

                  {weekDays.map(d => {
                    const isSelected = isSameDay(d, activeDate);
                    const isWeekToday = isSameDay(d, now);
                    return (
                      <button
                        key={d.toISOString()}
                        onClick={() => setActiveDate(d)}
                        className="flex flex-col items-center gap-0.5"
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
                            fontWeight: isSelected ? 700 : 400,
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
              )}
            </motion.div>
          )}

          {/* Notes list header */}
          {activeTab === 'notes' && !isEditingNote && (
            <motion.div
              key={headerKey}
              {...tabAnim}
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
              {...tabAnim}
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
              {...tabAnim}
              className="px-6 pt-12 pb-6 flex items-center justify-center"
            >
              {/* TODO(dark): dark:text-gray-100 */}
              <h1 className="font-bold text-xl" style={{ color: T.textPrimary }}>
                Profile
              </h1>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>

      {/* ── Scrollable content ──────────────────────────────────────────────── */}
      <div
        className="flex-1 w-full overflow-y-auto no-scrollbar pb-16"
        onScroll={handleScroll}
        onTouchStart={e => { touchStartY.current = e.touches[0].clientY; }}
        onTouchMove={e => {
          if (activeTab !== 'calendar' || isCalendarExpanded) return;
          if (e.currentTarget.scrollTop > 0) return;
          const dy = e.touches[0].clientY - touchStartY.current;
          if (dy > 40) setIsCalendarExpanded(true);
        }}
      >
        <AnimatePresence mode="wait">

          {/* ── Calendar tab ─────────────────────────────────────────────── */}
          {activeTab === 'calendar' && (
            <motion.div key={contentKey} {...tabAnim} className="p-4">
              {/* TODO(dark): card bg dark:bg-gray-900, border dark:border-gray-800 */}
              <div
                className="rounded-3xl overflow-hidden"
                style={{ backgroundColor: T.card, border: `1px solid ${T.border}` }}
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
                          <p className="text-xs py-2 mb-2" style={{ color: T.textMuted }}>
                            No events
                          </p>
                        ) : timedEvents.length === 0 ? null : (
                          <div className="relative flex flex-col gap-6">
                            {/* Vertical timeline line */}
                            {/* TODO(dark): base color dark:bg-gray-700 */}
                            <div
                              className="absolute top-2 bottom-4 w-0.5 z-0"
                              style={{ left: '4rem', background: lineBackground }}
                            />

                            {timedEvents.map((event, idx) => {
                              const startDate = new Date(event.start);
                              const endDate = event.end ? new Date(event.end) : startDate;
                              const nowDate = now;
                              const isPast = endDate < nowDate;
                              const isActive = startDate <= nowDate && nowDate < endDate;
                              const isExpanded = expandedEventId === event.id;

                              return (
                                <div
                                  key={`${event.id}-${idx}`}
                                  onClick={() => {
                                    setExpandedEventId(isExpanded ? null : event.id);
                                  }}
                                  className="flex gap-4 cursor-pointer relative z-10"
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

                                    <div
                                      className="pl-4 pb-2 pt-2 pr-3 rounded-2xl transition-all ml-1"
                                      style={{
                                        backgroundColor: (event.color || T.accent) + (isExpanded ? '28' : '15'),
                                        borderLeft: `3px solid ${event.color || T.accent}${isPast ? '80' : 'ff'}`,
                                      }}
                                    >
                                      {/* TODO(dark): dark:text-white */}
                                      <h3
                                        className="font-semibold text-sm leading-tight"
                                        style={{ color: T.textPrimary }}
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
                                            {(() => {
                                              const { status, duration } = formatTimeInfo(startDate, endDate, now);
                                              return (
                                                <div className="mt-2 flex flex-col gap-1.5">
                                                  {/* TODO(dark): dark:bg-opacity adjusted */}
                                                  <div
                                                    className="flex items-center px-3 py-2 rounded-xl text-xs font-semibold"
                                                    style={{
                                                      backgroundColor: (event.color || T.accent) + '22',
                                                      color: event.color || T.accent,
                                                    }}
                                                  >
                                                    {status}
                                                  </div>
                                                  {duration && (
                                                    <p className="text-xs px-1" style={{ color: T.textMuted }}>{duration}</p>
                                                  )}
                                                  {event.description && (
                                                    <p className="text-xs px-1" style={{ color: T.textSec }}>{event.description}</p>
                                                  )}
                                                </div>
                                              );
                                            })()}
                                            <button
                                              onClick={ev => {
                                                ev.stopPropagation();
                                                onEventDelete?.(event.id);
                                              }}
                                              className="text-red-500 text-xs font-medium px-2 py-1 mt-1"
                                            >
                                              Delete
                                            </button>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
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
              {...tabAnim}
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
              {...tabAnim}
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
              {...tabAnim}
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

      {/* ── Bottom navigation ───────────────────────────────────────────────── */}
      {/* TODO(dark): bg rgba(17,17,17,0.95), border dark:border-gray-800 */}
      <nav
        className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-stretch"
        style={{
          height: '56px',
          backgroundColor: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(12px)',
          borderTop: `1px solid ${T.border}`,
        }}
      >
        <NavTab
          icon={<FileText size={20} />}
          active={activeTab === 'notes'}
          override={activeTab === 'notes' && isEditingNote ? <ArrowLeft size={20} /> : undefined}
          onClick={() => {
            if (activeTab === 'notes' && isEditingNote) {
              setIsEditingNote(false);
            } else {
              setIsEditingNote(false);
              setActiveTab('notes');
            }
          }}
        />
        <NavTab
          icon={<CalendarIcon size={20} />}
          active={activeTab === 'calendar'}
          onClick={() => {
            setIsEditingNote(false);
            setActiveTab('calendar');
          }}
        />
        {/* Tracker tab — external link, never "active" */}
        {/* TODO(dark): color dark:text-gray-600 */}
        <a
          href={process.env.NEXT_PUBLIC_TRACKER_URL || '#'}
          className="flex flex-col items-center justify-center flex-1 h-full gap-1 focus:outline-none"
          style={{ color: T.textMuted }}
        >
          <Dumbbell size={20} />
          <div className="w-1 h-1" />
        </a>
        <NavTab
          icon={<User size={20} />}
          active={activeTab === 'profile'}
          onClick={() => {
            setIsEditingNote(false);
            setActiveTab('profile');
          }}
        />
      </nav>
    </div>
  );
}
