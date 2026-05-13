# Mobile Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the mobile UI to match a minimalist, app-like aesthetic (clean blue accent, white cards on `#F0F4FF` background, smooth Framer Motion animations) without touching any desktop components.

**Architecture:** Three files change — a new `BottomSheet.tsx` reusable component, a full rewrite of `MobileLayout.tsx`, and a mobile-aware update to `ScheduleModal.tsx`. Props interfaces stay identical to `page.tsx`, so the parent requires no changes.

**Tech Stack:** Next.js 14, React, TypeScript, Tailwind CSS, Framer Motion, Lucide React, date-fns

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `web/src/components/Layout/BottomSheet.tsx` | **Create** | Reusable slide-up sheet with backdrop + spring animation |
| `web/src/components/Layout/MobileLayout.tsx` | **Rewrite** | Full mobile UI — calendar, notes, profile tabs + bottom nav |
| `web/src/components/Calendar/ScheduleModal.tsx` | **Modify** | Detect mobile via hook; render as BottomSheet instead of centered overlay |

---

## Task 1: Create BottomSheet component

**Files:**
- Create: `web/src/components/Layout/BottomSheet.tsx`

- [ ] **Step 1: Write the file**

```tsx
// web/src/components/Layout/BottomSheet.tsx
"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  snapHeight?: string;
}

export default function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  snapHeight = '90vh',
}: BottomSheetProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop — TODO(dark): already neutral, works in dark mode */}
          <motion.div
            key="bs-backdrop"
            className="fixed inset-0 z-[400] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Sheet — TODO(dark): add dark:bg-gray-900 */}
          <motion.div
            key="bs-sheet"
            className="fixed bottom-0 left-0 right-0 z-[401] bg-white rounded-t-[28px] flex flex-col overflow-hidden"
            style={{ maxHeight: snapHeight }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Optional title */}
            {title && (
              <div className="px-6 pt-3 pb-2 shrink-0">
                {/* TODO(dark): dark:text-gray-100 */}
                <h2 className="text-lg font-bold text-gray-900">{title}</h2>
              </div>
            )}

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors related to `BottomSheet.tsx`.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/Layout/BottomSheet.tsx
git commit -m "feat(mobile): add reusable BottomSheet component"
```

---

## Task 2: Rewrite MobileLayout.tsx

**Files:**
- Modify: `web/src/components/Layout/MobileLayout.tsx` (full rewrite)

This is a full replacement of the file. All existing event-filter/recurrence logic is preserved verbatim — only the JSX and styling change.

- [ ] **Step 1: Replace the entire file with the new implementation**

```tsx
// web/src/components/Layout/MobileLayout.tsx
"use client";

import React, { useState, useMemo, useEffect } from 'react';
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
} from 'lucide-react';
import { isSameDay, format, startOfWeek, addDays } from 'date-fns';
import { enUS } from 'date-fns/locale';
import MiniCalendar from '../Calendar/MiniCalendar';
import { useDataStore } from '@/store/useDataStore';

// ─── Design tokens (light mode) ──────────────────────────────────────────────
// TODO(dark): when adding dark mode, replace each token with a conditional
// value based on a `useColorScheme()` hook, or use Tailwind dark: variants
// throughout the JSX (search for every TODO(dark) comment in this file).
const T = {
  bg:          '#F0F4FF',  // page background
  card:        '#FFFFFF',  // card / sheet surface
  accent:      '#3B82F6',  // primary blue
  textPrimary: '#111827',
  textSec:     '#6B7280',
  textMuted:   '#9CA3AF',
  border:      '#E5E7EB',
  iconBg:      '#EFF6FF',  // light icon container background
  rowHover:    'rgba(0,0,0,0.035)',
} as const;

// ─── Shared animation preset ─────────────────────────────────────────────────
const tabAnim = {
  initial:    { opacity: 0, y: 8 },
  animate:    { opacity: 1, y: 0 },
  exit:       { opacity: 0, y: -8 },
  transition: { duration: 0.18, ease: 'easeOut' as const },
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
const MobileNoteRow = ({ file }: { file: any }) => (
  <button
    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-colors"
    style={{ ['--hover-bg' as any]: T.rowHover }}
    onMouseEnter={e => (e.currentTarget.style.backgroundColor = T.rowHover)}
    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
    onClick={() => {
      useDataStore.getState().setActiveNoteId(file.id);
      window.dispatchEvent(
        new CustomEvent('mobile_open_note', { detail: { id: file.id, title: file.title } })
      );
    }}
  >
    {/* TODO(dark): iconBg → blue-900/20 */}
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
  const children = allFiles.filter(f => f.parent_id === folder.id);
  const subfolders = children.filter(f => f.type === 'folder');
  const notes = children.filter(f => f.type !== 'folder');

  return (
    <div className={level > 0 ? 'mt-1' : ''}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-colors"
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = T.rowHover)}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        onClick={() => {
          setIsOpen(o => !o);
          if (!isOpen) {
            const store = useDataStore.getState();
            if (!store.loadedDirectories.has(folder.id)) store.fetchDirectory(folder.id);
          }
        }}
      >
        {/* TODO(dark): iconBg → blue-900/20 */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: T.iconBg }}
        >
          <Folder size={16} style={{ color: T.accent }} />
        </div>
        <span className="flex-1 text-sm font-semibold truncate" style={{ color: T.textPrimary }}>
          {folder.title || 'Untitled Folder'}
        </span>
        <motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.18 }}>
          <ChevronRight size={16} style={{ color: T.textMuted }} />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden pl-4"
          >
            {subfolders.map(sub => (
              <MobileFolderItem key={sub.id} folder={sub} allFiles={allFiles} level={level + 1} />
            ))}
            {notes.map(file => (
              <MobileNoteRow key={file.id} file={file} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── NavTab ───────────────────────────────────────────────────────────────────
function NavTab({
  icon,
  active,
  onClick,
  override,
}: {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  override?: React.ReactNode;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.82 }}
      className="flex flex-col items-center justify-center gap-1 flex-1 py-2"
      style={{ color: active ? T.accent : T.textMuted }}
      // TODO(dark): inactive → dark:text-gray-600
    >
      {override ?? icon}
      <motion.div
        className="w-1 h-1 rounded-full"
        animate={{ opacity: active ? 1 : 0, scale: active ? 1 : 0 }}
        transition={{ duration: 0.15 }}
        style={{ backgroundColor: T.accent }}
      />
    </motion.button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function MobileLayout({
  events,
  files,
  folders,
  onNoteSelect,
  onNewNote,
  editorElement,
  activeNoteId,
  activeNoteTitle,
  onEventUpdate,
  onEventDelete,
  onNewEvent,
  onEventClick,
  userProfile,
}: MobileLayoutProps) {
  const [activeTab, setActiveTab] = useState<Tab>('calendar');
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [activeDate, setActiveDate] = useState(new Date());
  const [isCalendarExpanded, setIsCalendarExpanded] = useState(true);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const weekStart = startOfWeek(activeDate, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  const username =
    userProfile?.username ||
    (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('tide_user_name') : null) ||
    userProfile?.email?.split('@')[0] ||
    'User';
  const avatarLetter = username[0].toUpperCase();

  useEffect(() => {
    const handleMobileOpenNote = (e: any) => {
      const { id, title } = e.detail;
      onNoteSelect(id, title);
      setIsEditingNote(true);
    };
    window.addEventListener('mobile_open_note', handleMobileOpenNote);
    return () => window.removeEventListener('mobile_open_note', handleMobileOpenNote);
  }, [onNoteSelect]);

  // ── Recurrence filter (unchanged logic from original) ─────────────────────
  const todaysEvents = useMemo(() => {
    return events
      .filter(e => {
        const startNode = new Date(e.start);
        const occDateKey = format(activeDate, 'yyyy-MM-dd');
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

        if (freq === 'none') return isSameDay(startNode, activeDate);

        let current = new Date(startNode);
        const safeRecEnd = (e as any).recurrence_end
          ? new Date((e as any).recurrence_end)
          : new Date(activeDate.getTime() + 31_536_000_000);

        let count = 0;
        const targetTime = new Date(
          activeDate.getFullYear(),
          activeDate.getMonth(),
          activeDate.getDate()
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
        const mappedStart = new Date(activeDate);
        mappedStart.setHours(startNode.getHours(), startNode.getMinutes(), 0, 0);
        return {
          ...e,
          id: isSameDay(new Date(e.start), activeDate) ? e.id : `${e.id}_${mappedStart.getTime()}`,
          start: mappedStart.toISOString(),
          end: new Date(mappedStart.getTime() + duration).toISOString(),
        };
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [events, activeDate]);

  return (
    // TODO(dark): outer wrapper → dark:bg-gray-950
    <div
      className="flex md:hidden flex-col h-[100dvh] w-full relative overflow-hidden"
      style={{ backgroundColor: T.bg }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      {/* TODO(dark): dark:bg-gray-900 dark:border-gray-800 */}
      <div
        className="w-full z-40 shrink-0"
        style={{ backgroundColor: T.card, borderBottom: `1px solid ${T.border}` }}
      >
        <AnimatePresence mode="wait">

          {/* Calendar header */}
          {activeTab === 'calendar' && (
            <motion.div key="hdr-cal" {...tabAnim} className="pt-10">
              {/* Top row */}
              <div className="flex items-center justify-between px-5 pb-3">
                {/* TODO(dark): accent bg stays same */}
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold uppercase shrink-0"
                  style={{ backgroundColor: T.accent }}
                >
                  {avatarLetter}
                </div>

                <div className="text-center">
                  {/* TODO(dark): dark:text-gray-400 / dark:text-gray-100 */}
                  <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: T.textMuted }}>
                    {format(new Date(), 'EEEE', { locale: enUS })}
                  </p>
                  <p className="text-base font-bold" style={{ color: T.textPrimary }}>
                    {format(activeDate, 'd MMMM', { locale: enUS })}
                  </p>
                </div>

                <button
                  onClick={() => onNewEvent?.(activeDate)}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-md shrink-0"
                  style={{ backgroundColor: T.accent }}
                >
                  <Plus size={18} strokeWidth={2.5} />
                </button>
              </div>

              {/* Collapsible calendar / week strip */}
              <AnimatePresence mode="wait">
                {isCalendarExpanded ? (
                  <motion.div
                    key="month-cal"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    className="overflow-hidden"
                  >
                    <MiniCalendar selectedDate={activeDate} onSelect={setActiveDate} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="week-strip"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    className="overflow-hidden"
                  >
                    <div className="flex justify-between px-5 pb-4 pt-1">
                      {weekDays.map(d => {
                        const isSel = isSameDay(d, activeDate);
                        return (
                          <button
                            key={d.toISOString()}
                            onClick={() => setActiveDate(d)}
                            className="flex flex-col items-center gap-1.5"
                          >
                            {/* TODO(dark): textMuted → dark:text-gray-500 */}
                            <span
                              className="text-[10px] font-semibold uppercase tracking-wide"
                              style={{ color: T.textMuted }}
                            >
                              {format(d, 'eeeee', { locale: enUS })}
                            </span>
                            <div
                              className="w-9 h-9 flex items-center justify-center rounded-full text-sm font-bold transition-all"
                              style={
                                isSel
                                  ? { backgroundColor: T.accent, color: '#fff' }
                                  : { color: T.textPrimary }
                              }
                            >
                              {format(d, 'd')}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* Notes header — list view */}
          {activeTab === 'notes' && !isEditingNote && (
            <motion.div key="hdr-notes" {...tabAnim} className="px-5 pt-12 pb-5">
              {/* TODO(dark): dark:text-gray-100 */}
              <h1 className="text-2xl font-bold" style={{ color: T.textPrimary }}>
                My Notes
              </h1>
            </motion.div>
          )}

          {/* Notes header — editor view */}
          {activeTab === 'notes' && isEditingNote && (
            <motion.div key="hdr-editor" {...tabAnim} className="flex items-center gap-3 px-4 pt-12 pb-4">
              {/* TODO(dark): dark:bg-gray-800 dark:text-gray-100 */}
              <button
                onClick={() => setIsEditingNote(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: '#F3F4F6', color: T.textPrimary }}
              >
                <ArrowLeft size={18} />
              </button>
              <span
                className="font-semibold text-base truncate flex-1"
                style={{ color: T.textPrimary }}
              >
                {activeNoteTitle || 'Untitled Note'}
              </span>
            </motion.div>
          )}

          {/* Profile header */}
          {activeTab === 'profile' && (
            <motion.div key="hdr-profile" {...tabAnim} className="px-5 pt-12 pb-5">
              {/* TODO(dark): dark:text-gray-100 */}
              <h1 className="text-2xl font-bold" style={{ color: T.textPrimary }}>
                Profile
              </h1>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ── Scrollable content ──────────────────────────────────────────── */}
      <div
        className="flex-1 w-full overflow-y-auto no-scrollbar pb-24"
        onScroll={e => {
          if (activeTab === 'calendar') {
            setIsCalendarExpanded(e.currentTarget.scrollTop < 10);
          }
        }}
      >
        <AnimatePresence mode="wait">

          {/* ── CALENDAR TAB ─────────────────────────────────────────── */}
          {activeTab === 'calendar' && (
            <motion.div key="tab-cal" {...tabAnim} className="p-4">
              {/* TODO(dark): dark:bg-gray-900 dark:border-gray-800 */}
              <div
                className="rounded-3xl p-5 shadow-sm"
                style={{ backgroundColor: T.card, border: `1px solid ${T.border}` }}
              >
                {/* Section label row */}
                <div className="flex items-center gap-3 mb-5">
                  {/* TODO(dark): dark:text-gray-500 */}
                  <span
                    className="text-xs font-semibold uppercase tracking-widest"
                    style={{ color: T.textMuted }}
                  >
                    {format(activeDate, 'EEEE d', { locale: enUS })}
                  </span>
                  {/* TODO(dark): dark:bg-gray-800 */}
                  <div className="flex-1 h-px" style={{ backgroundColor: T.border }} />
                </div>

                {todaysEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2">
                    {/* TODO(dark): dark:text-gray-600 */}
                    <CalendarIcon size={28} style={{ color: T.textMuted }} />
                    <p className="text-sm font-medium" style={{ color: T.textMuted }}>
                      No events today
                    </p>
                  </div>
                ) : (
                  <div className="relative flex flex-col gap-5">
                    {/* Vertical timeline line — TODO(dark): dark:bg-gray-800 */}
                    <div
                      className="absolute top-1 bottom-3 w-px z-0"
                      style={{ left: '3.6rem', backgroundColor: T.border }}
                    />

                    {todaysEvents.map((event, idx) => {
                      const startDate = new Date(event.start);
                      const endDate = event.end ? new Date(event.end) : startDate;
                      const isExpanded = expandedEventId === event.id;

                      return (
                        <div
                          key={event.id + idx}
                          className="flex gap-4 relative z-10 cursor-pointer"
                          onClick={() => {
                            setExpandedEventId(isExpanded ? null : event.id);
                            onEventClick?.(event.id);
                          }}
                        >
                          {/* Time */}
                          <div className="w-12 shrink-0 flex flex-col items-end pt-0.5">
                            {/* TODO(dark): dark:text-gray-400 */}
                            <span className="text-xs font-medium" style={{ color: T.textMuted }}>
                              {format(startDate, 'HH:mm')}
                            </span>
                            {event.end && (
                              <span className="text-[10px] mt-0.5" style={{ color: T.textMuted }}>
                                {format(endDate, 'HH:mm')}
                              </span>
                            )}
                          </div>

                          {/* Dot — ring-white TODO(dark): ring-gray-900 */}
                          <div
                            className="w-3 h-3 rounded-full shrink-0 mt-1 ring-4 ring-white z-10 shadow-sm"
                            style={{ backgroundColor: event.color || T.accent }}
                          />

                          {/* Content */}
                          <div className="flex-1 pl-1 pb-1 min-w-0">
                            {/* TODO(dark): dark:text-gray-100 */}
                            <p
                              className="text-sm font-semibold leading-tight truncate"
                              style={{ color: T.textPrimary }}
                            >
                              {event.title || 'Untitled Event'}
                            </p>
                            {event.description && (
                              <p className="text-xs mt-0.5 line-clamp-1" style={{ color: T.textSec }}>
                                {event.description}
                              </p>
                            )}

                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.18 }}
                                  className="overflow-hidden"
                                >
                                  {/* TODO(dark): dark:bg-gray-800 dark:text-gray-300 */}
                                  <div
                                    className="mt-3 p-3 rounded-xl text-xs"
                                    style={{ backgroundColor: '#F9FAFB', color: T.textSec }}
                                  >
                                    {event.description || 'No additional details.'}
                                  </div>
                                  <button
                                    className="mt-2 text-xs font-medium px-2 py-1 rounded-lg"
                                    style={{ color: '#EF4444' }}
                                    onClick={ev => {
                                      ev.stopPropagation();
                                      onEventDelete?.(event.id);
                                    }}
                                  >
                                    Delete
                                  </button>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ── NOTES TAB — list ─────────────────────────────────────── */}
          {activeTab === 'notes' && !isEditingNote && (
            <motion.div key="tab-notes" {...tabAnim} className="p-4 flex flex-col gap-3">
              {/* TODO(dark): dark:bg-gray-900 dark:border-gray-800 */}
              <div
                className="rounded-3xl overflow-hidden shadow-sm"
                style={{ backgroundColor: T.card, border: `1px solid ${T.border}` }}
              >
                {/* New note row */}
                <button
                  onClick={onNewNote}
                  className="w-full flex items-center gap-3 px-4 py-4 transition-colors"
                  style={{ borderBottom: `1px solid ${T.border}` }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = T.rowHover)}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {/* TODO(dark): dark:bg-blue-900/20 */}
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: T.iconBg }}
                  >
                    <Plus size={16} style={{ color: T.accent }} />
                  </div>
                  <span className="text-sm font-semibold" style={{ color: T.accent }}>
                    New Note
                  </span>
                </button>

                {/* Folders */}
                {folders.filter(f => !f.parent_id).length > 0 && (
                  <div className="px-1 py-2">
                    {folders
                      .filter(f => !f.parent_id)
                      .map(folder => (
                        <MobileFolderItem key={folder.id} folder={folder} allFiles={files} />
                      ))}
                  </div>
                )}

                {/* Root-level files */}
                {(() => {
                  const rootFiles = files.filter(f => !f.parent_id && f.type !== 'folder');
                  if (rootFiles.length === 0) return null;
                  return (
                    <div
                      className="px-1 py-2"
                      style={
                        folders.filter(f => !f.parent_id).length > 0
                          ? { borderTop: `1px solid ${T.border}` }
                          : undefined
                      }
                    >
                      {rootFiles.map(file => (
                        <MobileNoteRow key={file.id} file={file} />
                      ))}
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          )}

          {/* ── NOTES TAB — editor ───────────────────────────────────── */}
          {activeTab === 'notes' && isEditingNote && (
            <motion.div
              key="tab-editor"
              initial={{ opacity: 0, scale: 0.99 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="min-h-full p-5 pb-24"
              style={{ backgroundColor: T.card }}
              // TODO(dark): dark:bg-gray-950
            >
              {editorElement}
            </motion.div>
          )}

          {/* ── PROFILE TAB ──────────────────────────────────────────── */}
          {activeTab === 'profile' && (
            <motion.div key="tab-profile" {...tabAnim} className="p-4 flex flex-col gap-4">
              {/* Avatar card — TODO(dark): dark:bg-gray-900 dark:border-gray-800 */}
              <div
                className="rounded-3xl p-6 flex flex-col items-center gap-2 shadow-sm"
                style={{ backgroundColor: T.card, border: `1px solid ${T.border}` }}
              >
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-bold uppercase mb-1"
                  style={{ background: `linear-gradient(135deg, ${T.accent}, #8B5CF6)` }}
                >
                  {avatarLetter}
                </div>
                {/* TODO(dark): dark:text-gray-100 */}
                <p className="text-lg font-bold" style={{ color: T.textPrimary }}>
                  {username}
                </p>
                {/* TODO(dark): dark:text-gray-400 */}
                <p className="text-sm" style={{ color: T.textSec }}>
                  {userProfile?.email || ''}
                </p>
              </div>

              {/* Menu list — TODO(dark): dark:bg-gray-900 dark:border-gray-800 */}
              <div
                className="rounded-3xl overflow-hidden shadow-sm"
                style={{ backgroundColor: T.card, border: `1px solid ${T.border}` }}
              >
                {(
                  [
                    { icon: <User size={18} />, label: 'Profil' },
                    { icon: <Settings size={18} />, label: 'E2EE Keys' },
                    { icon: <Settings size={18} />, label: 'Geräte' },
                    { icon: <Settings size={18} />, label: 'Passwörter' },
                    { icon: <FileText size={18} />, label: 'Sprache' },
                    { icon: <LogOut size={18} />, label: 'Abmelden', danger: true },
                  ] as { icon: React.ReactNode; label: string; danger?: boolean }[]
                ).map((item, i, arr) => (
                  <button
                    key={item.label}
                    className="w-full flex items-center gap-4 px-5 py-4 transition-colors"
                    style={{
                      borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : undefined,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = T.rowHover)}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    // TODO(dark): dark:border-gray-800
                  >
                    {/* TODO(dark): dark:bg-gray-800 */}
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: '#F3F4F6',
                        color: item.danger ? '#EF4444' : T.textSec,
                      }}
                    >
                      {item.icon}
                    </div>
                    <span
                      className="flex-1 text-sm font-semibold text-left"
                      style={{ color: item.danger ? '#EF4444' : T.textPrimary }}
                    >
                      {item.label}
                    </span>
                    {!item.danger && (
                      <ChevronRight size={16} style={{ color: T.textMuted }} />
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ── Bottom Navigation ────────────────────────────────────────────── */}
      {/* TODO(dark): dark:bg-gray-900/95 dark:border-gray-800 */}
      <nav
        className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-stretch"
        style={{
          height: '72px',
          backgroundColor: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(12px)',
          borderTop: `1px solid ${T.border}`,
        }}
      >
        <NavTab
          icon={<FileText size={22} />}
          active={activeTab === 'notes'}
          override={activeTab === 'notes' && isEditingNote ? <ArrowLeft size={22} /> : undefined}
          onClick={() => {
            if (activeTab === 'notes' && isEditingNote) {
              setIsEditingNote(false);
            } else {
              setActiveTab('notes');
              setIsEditingNote(false);
            }
          }}
        />
        <NavTab
          icon={<CalendarIcon size={22} />}
          active={activeTab === 'calendar'}
          onClick={() => {
            setActiveTab('calendar');
            setIsEditingNote(false);
          }}
        />
        <NavTab
          icon={<User size={22} />}
          active={activeTab === 'profile'}
          onClick={() => {
            setActiveTab('profile');
            setIsEditingNote(false);
          }}
        />
      </nav>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors in `MobileLayout.tsx`.

- [ ] **Step 3: Start dev server and smoke-test on mobile viewport**

```bash
cd web && npm run dev
```

Open browser → DevTools → toggle device toolbar → iPhone 14 Pro (390×844).  
Check:
- Calendar tab shows with blue header, mini-calendar, timeline card
- Tap a day → week strip collapses when you scroll down
- Notes tab shows folder/file list inside white rounded card
- Profile tab shows avatar + menu list
- Bottom nav dot animates between tabs
- No console errors

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Layout/MobileLayout.tsx
git commit -m "feat(mobile): rewrite MobileLayout with minimalist app design"
```

---

## Task 3: Add mobile bottom-sheet support to ScheduleModal

**Files:**
- Modify: `web/src/components/Calendar/ScheduleModal.tsx`

The modal detects mobile via `useMediaQuery` and renders its content inside `BottomSheet` instead of a centered overlay. All existing state and handlers are untouched.

- [ ] **Step 1: Add imports at the top of ScheduleModal.tsx**

Replace the existing import block (lines 1–2):

```tsx
import React, { useState, useRef } from 'react';
import { Download, Upload, Plus, Trash2, X, AlertCircle, ListPlus } from 'lucide-react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import BottomSheet from '@/components/Layout/BottomSheet';
```

- [ ] **Step 2: Read mobile state inside the component**

After the line `const [activeDateSettings, setActiveDateSettings] = useState<string | null>(null);` (currently line 33), add:

```tsx
    const isMobile = useMediaQuery('(max-width: 767px)');
```

- [ ] **Step 3: Remove the early-return guard and extract inner content**

The existing `if (!isOpen) return null;` on line 36 must move inside the conditional render.  
Replace everything from the existing `if (!isOpen) return null;` through the closing `);` of the component's return statement with:

```tsx
    // ── Shared modal body ────────────────────────────────────────────────
    const modalBody = (
        <div className="flex-1 overflow-hidden flex flex-col">
            <div className="p-6 pb-2 border-b border-gray-100 dark:border-slate-800/50">
                {/* Meta Settings */}
                <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-end">
                    <div className="flex-1 w-full max-w-sm">
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Group / Theme</label>
                        <select
                            className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            value={theme}
                            onChange={(e) => setTheme(e.target.value)}
                        >
                            <option value="new-theme">+ Create New Theme</option>
                            <optgroup label="Existing Themes">
                                {existingThemes.map(t => (
                                    <option key={t.id} value={t.id}>{t.title || 'Untitled'}</option>
                                ))}
                            </optgroup>
                        </select>
                        {theme === 'new-theme' && (
                            <div className="mt-3 flex flex-col gap-3 p-4 bg-gray-50/50 dark:bg-black/20 rounded-2xl border border-gray-200 dark:border-slate-800">
                                <input
                                    type="text"
                                    placeholder="Theme Name..."
                                    maxLength={30}
                                    value={themeName}
                                    onChange={(e) => setThemeName(e.target.value)}
                                    className="w-full bg-white dark:bg-[#2A2A2A] border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm font-semibold focus:outline-none focus:border-blue-500 shadow-sm"
                                />
                                <div className="flex flex-col md:flex-row gap-4">
                                    <div className="flex-1">
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Color</label>
                                        <div className="flex flex-wrap gap-2">
                                            {['#ef4444','#f97316','#f59e0b','#10b981','#06b6d4','#3b82f6','#6366f1','#8b5cf6','#d946ef','#ec4899','#64748b'].map(c => (
                                                <button
                                                    key={c}
                                                    onClick={() => setThemeColor(c)}
                                                    className={`w-6 h-6 rounded-full transition-all border-2 ${themeColor === c ? 'border-blue-500 scale-110 shadow-md ring-2 ring-blue-500/20' : 'border-transparent hover:scale-105'}`}
                                                    style={{ backgroundColor: c }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                    <div className="w-full md:w-32">
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Effect</label>
                                        <select
                                            value={themeEffect}
                                            onChange={(e) => setThemeEffect(e.target.value)}
                                            className="w-full bg-white dark:bg-[#2A2A2A] border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold outline-none cursor-pointer"
                                        >
                                            <option value="none">Kein Muster</option>
                                            <option value="stripes">Gestreift</option>
                                            <option value="waves">Wellen</option>
                                            <option value="dots">Punkte</option>
                                            <option value="chess">Karo</option>
                                            <option value="diamonds">Diamant</option>
                                            <option value="gradient">Farbverlauf</option>
                                            <option value="bars">Balken</option>
                                            <option value="dimmed">Gedimmt</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <input type="file" accept=".json" ref={fileInputRef} onChange={importFromJSON} className="hidden" id="schedule-import-input" />
                        <label htmlFor="schedule-import-input" className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 cursor-pointer transition-colors">
                            <Upload size={16} /> Import
                        </label>
                        <button onClick={exportToJSON} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl text-sm font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                            <Download size={16} /> Export
                        </button>
                    </div>
                </div>
                {error && (
                    <div className="mt-4 flex items-center gap-2 text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg text-sm font-medium">
                        <AlertCircle size={16} /> {error}
                    </div>
                )}
            </div>

            {/* Events List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3 max-h-[50vh]">
                {events.map((event, index) => (
                    <div key={event.id} className="group relative flex flex-col md:flex-row items-start md:items-center gap-3 bg-gray-50/50 dark:bg-[#151515] border border-gray-200 dark:border-slate-800/80 rounded-2xl p-3 pl-4 transition-all hover:border-gray-300 dark:hover:border-slate-700/80">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gray-200 dark:bg-slate-800 rounded-l-2xl group-hover:bg-blue-400 dark:group-hover:bg-blue-600 transition-colors"></div>
                        <span className="text-xs font-bold text-gray-400 w-5 shrink-0 select-none">{index + 1}.</span>
                        <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-4 gap-3">
                            <input type="text" placeholder="Event Title..." value={event.title} className="col-span-1 md:col-span-1 bg-white dark:bg-black/40 border border-gray-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/50 w-full" onChange={(e) => updateEvent(event.id, { title: e.target.value })} />
                            <input type="text" placeholder="Description (optional)" value={event.description} className="col-span-1 md:col-span-1 bg-transparent border border-dashed border-gray-300 dark:border-slate-700/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white dark:focus:bg-black/40 w-full" onChange={(e) => updateEvent(event.id, { description: e.target.value })} />
                            <div className="col-span-1 md:col-span-2 relative flex flex-col justify-end gap-2">
                                <button onClick={() => setActiveDateSettings(activeDateSettings === event.id ? null : event.id)} className="w-full flex items-center justify-between px-3 py-2 bg-white dark:bg-black/40 border border-gray-200 dark:border-slate-800 rounded-xl text-xs font-medium hover:bg-gray-50 focus:outline-none transition-colors border-dashed">
                                    <span className="truncate text-gray-600 dark:text-gray-300">
                                        {event.dateOverride ? new Date(event.dateOverride).toLocaleDateString('de-DE', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Kein Datum'}
                                        {!event.allDay ? ` • ${event.startTime} - ${event.endTime}` : ' • Ganztags'}
                                        {event.recurrence !== 'none' && ` • Wiederholt: ${event.recurrence}`}
                                    </span>
                                    <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${activeDateSettings === event.id ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                </button>
                                {activeDateSettings === event.id && (
                                    <div className="w-full bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-slate-700 rounded-2xl p-4 flex flex-col gap-3 transition-all">
                                        <div className="flex justify-between items-center pb-2 border-b border-gray-100 dark:border-slate-800">
                                            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Zeit & Datum</span>
                                        </div>
                                        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
                                            Datum einstellen
                                            <input type="date" value={event.dateOverride || ''} onChange={(e) => updateEvent(event.id, { dateOverride: e.target.value })} className="mt-1 bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                        </label>
                                        <label className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-slate-800 cursor-pointer">
                                            <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 accent-blue-500" checked={event.allDay} onChange={(e) => updateEvent(event.id, { allDay: e.target.checked })} />
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Ganztägig</span>
                                        </label>
                                        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
                                            Wiederholung
                                            <select value={event.recurrence} onChange={(e) => updateEvent(event.id, { recurrence: e.target.value as any })} className="mt-1 bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-blue-500">
                                                <option value="none">Nie</option>
                                                <option value="daily">Täglich</option>
                                                <option value="weekly">Wöchentlich</option>
                                                <option value="monthly">Monatlich</option>
                                                <option value="yearly">Jährlich</option>
                                            </select>
                                        </label>
                                        {!event.allDay && (
                                            <div className="flex items-center gap-2 pt-1">
                                                <input type="time" value={event.startTime} onChange={(e) => updateEvent(event.id, { startTime: e.target.value })} className="flex-1 bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-slate-800 rounded-xl px-2 py-2 text-sm font-medium focus:outline-none text-center" />
                                                <span className="text-gray-400 font-bold">-</span>
                                                <input type="time" value={event.endTime} onChange={(e) => updateEvent(event.id, { endTime: e.target.value })} className="flex-1 bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-slate-800 rounded-xl px-2 py-2 text-sm font-medium focus:outline-none text-center" />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                        <button onClick={() => removeEvent(event.id)} disabled={events.length === 1} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors disabled:opacity-30 disabled:hover:bg-transparent shrink-0" title="Remove Event">
                            <Trash2 size={16} />
                        </button>
                    </div>
                ))}
            </div>

            <div className="px-6 py-3 border-t border-gray-100 dark:border-slate-800/50 flex flex-col gap-2">
                <button onClick={addEvent} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 dark:border-slate-800 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 dark:hover:border-blue-500/50 rounded-2xl text-sm font-bold text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-all cursor-pointer">
                    <Plus size={16} /> Add Event
                </button>
                <button onClick={handleApply} disabled={isSaving} className="w-full flex items-center justify-center gap-2 py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-60 rounded-2xl text-sm font-bold text-white transition-colors">
                    {isSaving ? 'Saving…' : 'Apply Schedule'}
                </button>
            </div>
        </div>
    );

    // ── Mobile: render as bottom sheet ───────────────────────────────────────
    if (isMobile) {
        return (
            <BottomSheet isOpen={isOpen} onClose={onClose} title="Schedule Builder" snapHeight="92vh">
                {modalBody}
            </BottomSheet>
        );
    }

    // ── Desktop: centered overlay ────────────────────────────────────────────
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center pointer-events-auto">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-white dark:bg-[#1A1A1A] w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-float flex flex-col m-4 border border-gray-200 dark:border-slate-800">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-800/80">
                    <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <ListPlus size={22} className="text-blue-500" />
                        Schedule Builder
                    </h2>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
                        <X size={20} />
                    </button>
                </div>
                {modalBody}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Test on mobile viewport**

With dev server running:
1. Open mobile viewport in DevTools
2. Navigate to Calendar tab
3. Tap the **+** button in the header
4. Verify: ScheduleModal slides up from bottom as a bottom sheet with spring animation
5. Tap backdrop → sheet slides away
6. On desktop viewport: modal still appears centered as before

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Calendar/ScheduleModal.tsx
git commit -m "feat(mobile): render ScheduleModal as bottom sheet on mobile"
```

---

## Self-Review

**Spec coverage:**
- ✅ Background `#F0F4FF`, white cards — `T.bg` / `T.card` tokens in MobileLayout
- ✅ Accent color `#3B82F6` — `T.accent` throughout
- ✅ `BottomSheet.tsx` with spring animation `stiffness: 400, damping: 40`
- ✅ ScheduleModal uses BottomSheet on mobile via `useMediaQuery`
- ✅ Tab transitions with `y: 8 → 0`, `duration: 0.18`
- ✅ Event expand with height animation
- ✅ Collapsible calendar ↔ week strip
- ✅ Bottom nav with animated dot + `whileTap scale`
- ✅ `TODO(dark):` comments on every styled element
- ✅ Desktop untouched — all changes inside `flex md:hidden`
- ✅ Props interface identical — `page.tsx` requires no changes
- ✅ `MobileNoteRow` extracted so it can be used in both folder and root lists

**Type consistency:**
- `T` tokens object — same key names used consistently
- `tabAnim` spread — used identically across all tab motion divs
- `onEventDelete?.(event.id)` — matches `MobileLayoutProps.onEventDelete?: (id: string) => void`
