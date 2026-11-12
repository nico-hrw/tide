"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings, ArrowLeft, ArrowRight, Folder, FolderOpen, FileText, Lock, Layout,
  ChevronRight, ChevronLeft, ChevronDown, Plus, Search, Calendar as CalendarIcon,
  Trash2, GraduationCap, Clock, MapPin,
  X, PenLine, FolderPlus,
  BookOpen, Coffee, RotateCcw, ListTodo, SlidersHorizontal, Check, List, LayoutGrid,
  CalendarPlus, CheckSquare, Smile,
} from 'lucide-react';
import { MoodPopup } from '@/components/Surveys/MoodPopup';
import { isSameDay, format, startOfWeek, addDays, isAfter } from 'date-fns';
import { de } from 'date-fns/locale';
import MiniCalendar from '../Calendar/MiniCalendar';
import MobileWeekGrid from './MobileWeekGrid';
import { useDataStore } from '@/store/useDataStore';
import dynamic from 'next/dynamic';
import { pickGreetingTemplate, formatGreeting, NextEventCountdown, fireConfetti } from './MobileHeaderWidgets';
import TodoList from '../Todo/TodoList';
import { isItemUnlocked, ItemSecuritySettings } from '@/lib/pinSecurity';
import PinPromptModal from '@/components/Security/PinPromptModal';
import { getFolderColor } from '@/lib/folderColors';
import { T } from './mobile/mobileTheme';
import { useMobileSwipeGestures } from './mobile/useMobileSwipeGestures';
import {
  OverlayShell,
  EventSheet,
  MobileNewEventSheet,
  MobileEditEventSheet,
  MobileContextMenuSheet,
  MobileRenameModal,
} from './mobile/MobileBottomSheets';
import { MobileCreateModal } from './mobile/MobileCreateModal';
import { MobileDateWheel } from './mobile/MobileDateWheel';
import {
  DbTimelineDay,
  MobileAgendaTimeline,
  getGroupedDayViewItems,
} from './mobile/MobileAgendaTimeline';
import { MobileBottomNav, MobileTab } from './mobile/MobileBottomNav';
import SidebarQuickNotes from './sidebar/SidebarQuickNotes';
import {
  MobileFilterPopover,
  PriorityOption,
  StatusOption,
  DateFilterOption,
} from './mobile/MobileFilterPopover';
import {
  MobileSearchOverlay,
  SearchEventItem,
  SearchTodoItem,
  SearchNoteItem,
} from './mobile/MobileSearchOverlay';

type PinPromptTarget = React.ComponentProps<typeof PinPromptModal>['item'] & { onUnlocked?: () => void };

const getDayDiff = (d1: Date, d2: Date) => {
  const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
  return Math.round((utc1 - utc2) / 86_400_000);
};

const JobPlanner = dynamic(() => import('../JobPlanner/JobPlanner'), {
  loading: () => <div className="flex-1 flex items-center justify-center p-8 text-sm" style={{ color: 'var(--muted-text)' }}>Lade…</div>,
});

const SurveyAnalytics = dynamic(() => import('@/components/Surveys/SurveyAnalytics'), {
  loading: () => <div className="flex-1 flex items-center justify-center p-8 text-sm" style={{ color: 'var(--muted-text)' }}>Lade…</div>,
});

export interface MobileLayoutProps {
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
  onNewEvent?: (date: Date, endDate?: Date, meta?: { title?: string; color?: string; description?: string }) => void;
  onEventClick?: (id: string) => void;
  onEventUpdate?: (id: string, newStart: Date, newEnd: Date, meta?: { title?: string; color?: string; description?: string }) => void;
  onEventSave?: (id: string, updates: Record<string, unknown>) => void;
  onEventDelete?: (id: string) => void;
  onTaskComplete?: (id: string, completed: boolean) => void;
  socialHubElement?: React.ReactNode;
  userProfile?: {
    username: string; email: string; avatar_seed?: string;
    avatar_salt?: string; bio?: string; title?: string;
    id?: string; user_id?: string;
  } | null;
  themes?: Array<{ id: string; title: string; color?: string; effect?: string }>;
}

const NoteRow = React.memo(function NoteRow(props: {
  file: any;
  isActive?: boolean;
  onOpen: () => void;
  onDragStart?: (file: any, e: React.TouchEvent) => void;
  onContextMenu?: (file: any) => void;
}) {
  const { file, isActive, onOpen, onContextMenu } = props;
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movedRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const theme = useDataStore(s => s.theme);

  const isLocked = Boolean(
    file.has_pin ||
    file.is_locked ||
    file.metadata?.has_custom_password ||
    file.metadata?.security_settings?.has_custom_password ||
    (typeof file.title === 'string' && file.title.startsWith('#'))
  );

  const isCanvas = file.type === 'canvas';
  const isShared = (file as any).share_status === 'shared' || (file as any).is_shared;

  const displayTitle = (typeof file.title === 'string' && file.title.startsWith('#'))
    ? file.title.slice(1).trim()
    : (file.title || 'Untitled');

  return (
    <button
      onClick={onOpen}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left rounded-xl transition-all duration-150 ${
        isActive
          ? 'bg-blue-100/90 dark:bg-blue-950/60 font-semibold ring-1 ring-blue-400/40'
          : 'hover:bg-[var(--hover-bg)] active:opacity-70'
      }`}
      style={{
        opacity: dragging ? 0.4 : 1,
        color: isActive
          ? (theme === 'dark' ? '#93c5fd' : '#1d4ed8')
          : T.pri,
      }}
      onTouchStart={() => {
        movedRef.current = false;
        holdRef.current = setTimeout(() => {
          if (!movedRef.current) {
            onContextMenu?.(file);
          }
        }, 420);
      }}
      onTouchMove={() => {
        movedRef.current = true;
        if (holdRef.current) {
          clearTimeout(holdRef.current);
          holdRef.current = null;
        }
      }}
      onTouchEnd={() => {
        if (holdRef.current) clearTimeout(holdRef.current);
        setDragging(false);
      }}
    >
      <div
        className="relative shrink-0 flex items-center justify-center"
        style={{
          color: isActive
            ? '#3b82f6'
            : T.sec,
        }}
      >
        {isCanvas ? (
          <Layout size={15} />
        ) : (
          <FileText size={15} />
        )}
        {isLocked && (
          <span title="PIN-geschützt" className="absolute -bottom-1 -right-1 flex items-center justify-center p-[1px] bg-white dark:bg-slate-900 rounded-full shadow-xs">
            <Lock size={8} className="text-amber-500" strokeWidth={2.5} />
          </span>
        )}
      </div>

      <span className="text-sm truncate flex-1 font-medium">
        {displayTitle}
      </span>

      {isShared && (
        <span
          className="shrink-0 w-1.5 h-1.5 rounded-full bg-sky-400"
          title="Geteilte Notiz"
        />
      )}
    </button>
  );
});

const FolderItem = React.memo(function FolderItem({
  folder,
  allFiles,
  onOpen,
  activeNoteId,
  dragOverId,
  onDragOver,
  onDragLeave,
  onContextMenu,
  onNoteContextMenu,
  onNoteDragStart,
  isDragging,
  onPromptPin,
}: {
  folder: any;
  allFiles: any[];
  onOpen: (id: string, t: string) => void;
  activeNoteId?: string | null;
  dragOverId?: string | null;
  onDragOver?: (id: string) => void;
  onDragLeave?: () => void;
  onContextMenu?: (folder: any) => void;
  onNoteContextMenu?: (file: any) => void;
  onNoteDragStart?: (file: any, e: React.TouchEvent) => void;
  isDragging?: boolean;
  onPromptPin?: (item: PinPromptTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movedRef = useRef(false);
  const loadedDirectories = useDataStore(s => s.loadedDirectories);
  const children = allFiles.filter(f => f.parent_id === folder.id);
  const isOver = dragOverId === folder.id;

  const isLocked = Boolean(
    folder.has_pin ||
    folder.is_locked ||
    folder.metadata?.has_custom_password ||
    folder.metadata?.security_settings?.has_custom_password ||
    (typeof folder.title === 'string' && folder.title.startsWith('#'))
  );

  const displayTitle = (typeof folder.title === 'string' && folder.title.startsWith('#'))
    ? folder.title.slice(1).trim()
    : (folder.title || 'Ordner');

  return (
    <div>
      <button
        onClick={() => {
          const isFolderProtected = Boolean(
            folder.has_pin ||
            folder.is_locked ||
            folder.metadata?.has_custom_password ||
            folder.metadata?.security_settings?.has_custom_password ||
            (typeof folder.title === 'string' && folder.title.startsWith('#'))
          );
          if (isFolderProtected && !open && !isItemUnlocked(folder.id, (folder.metadata?.security_settings || folder.metadata) as ItemSecuritySettings | null | undefined)) {
            const promptData = {
              id: folder.id,
              title: folder.title,
              type: 'folder' as const,
              metadata: folder.metadata,
              onUnlocked: () => {
                setOpen(true);
                if (!loadedDirectories.has(folder.id)) {
                  useDataStore.getState().fetchDirectory(folder.id);
                }
              }
            };
            if (onPromptPin) {
              onPromptPin(promptData);
            } else {
              window.dispatchEvent(new CustomEvent('tide:prompt-pin', { detail: promptData }));
            }
            return;
          }

          setOpen(v => !v);
          if (!open && !loadedDirectories.has(folder.id)) {
            useDataStore.getState().fetchDirectory(folder.id);
          }
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-colors text-left"
        style={{
          background: isOver ? `${T.accent}20` : 'transparent',
          border: isOver ? `1px solid ${T.accent}` : '1px solid transparent',
        }}
        onTouchStart={() => {
          movedRef.current = false;
          holdRef.current = setTimeout(() => {
            if (!movedRef.current) {
              onContextMenu?.(folder);
            }
          }, 420);
        }}
        onTouchMove={e => {
          movedRef.current = true;
          if (holdRef.current) {
            clearTimeout(holdRef.current);
            holdRef.current = null;
          }
          if (isDragging) {
            const touch = e.touches[0];
            const el = document.elementFromPoint(touch.clientX, touch.clientY);
            if (el?.closest(`[data-folder-id="${folder.id}"]`)) onDragOver?.(folder.id);
            else onDragLeave?.();
          }
        }}
        onTouchEnd={() => {
          if (holdRef.current) clearTimeout(holdRef.current);
        }}
        data-folder-id={folder.id}
      >
        <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0" style={{ color: T.mut }}>
          <ChevronRight
            size={13}
            className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          />
        </span>
        <div className="relative shrink-0 flex items-center justify-center" style={{ color: isOver ? T.accent : T.sec }}>
          {open ? (
            <FolderOpen size={15} />
          ) : (
            <Folder size={15} />
          )}
          {isLocked && (
            <span title="PIN-geschützt" className="absolute -bottom-1 -right-1 flex items-center justify-center p-[1px] bg-white dark:bg-slate-900 rounded-full shadow-xs">
              <Lock size={8} className="text-amber-500" strokeWidth={2.5} />
            </span>
          )}
        </div>
        <span className="text-sm font-semibold flex-1 text-left truncate" style={{ color: isOver ? T.accent : T.pri }}>
          {displayTitle}
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden relative ml-3 pl-2.5 border-l border-violet-200/60 dark:border-violet-800/40 space-y-0.5 mt-0.5"
          >
            {children.filter(f => f.type === 'folder').map(s => (
              <FolderItem
                key={s.id}
                folder={s}
                allFiles={allFiles}
                onOpen={onOpen}
                activeNoteId={activeNoteId}
                dragOverId={dragOverId}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onContextMenu={onContextMenu}
                onNoteContextMenu={onNoteContextMenu}
                onNoteDragStart={onNoteDragStart}
                isDragging={isDragging}
                onPromptPin={onPromptPin}
              />
            ))}
            {children.filter(f => f.type !== 'folder').map(f => (
              <NoteRow
                key={f.id}
                file={f}
                isActive={activeNoteId === f.id}
                onOpen={() => onOpen(f.id, f.title || 'Untitled')}
                onContextMenu={onNoteContextMenu}
                onDragStart={onNoteDragStart}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface NoteCardMetadata {
  has_custom_password?: boolean;
  security_settings?: ItemSecuritySettings;
  color?: string;
  [key: string]: unknown;
}

interface NoteCardItem {
  id: string;
  title?: string;
  type?: string;
  has_pin?: boolean;
  is_locked?: boolean;
  metadata?: NoteCardMetadata | null;
  share_status?: string;
  is_shared?: boolean;
  parent_id?: string | null;
  color?: string;
  updated_at?: string;
  updatedAt?: string;
  created_at?: string;
  createdAt?: string;
}

const NoteCard = React.memo(function NoteCard(props: {
  file: NoteCardItem;
  isActive?: boolean;
  onOpen: () => void;
  onContextMenu?: (file: NoteCardItem) => void;
}) {
  const { file, isActive, onOpen, onContextMenu } = props;
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movedRef = useRef(false);

  const isLocked = Boolean(
    file.has_pin ||
    file.is_locked ||
    file.metadata?.has_custom_password ||
    file.metadata?.security_settings?.has_custom_password ||
    (typeof file.title === 'string' && file.title.startsWith('#'))
  );

  const isCanvas = file.type === 'canvas';
  const isShared = file.share_status === 'shared' || file.is_shared;

  const displayTitle = (typeof file.title === 'string' && file.title.startsWith('#'))
    ? file.title.slice(1).trim()
    : (file.title || 'Untitled');

  const rawDate = file.updated_at || file.updatedAt || file.created_at || file.createdAt;
  let dateStr = '';
  if (rawDate) {
    try {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        dateStr = d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
      }
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group relative flex flex-col items-center justify-between cursor-pointer select-none p-1.5 rounded-xl transition-all active:scale-95 hover:bg-gray-100/50 dark:hover:bg-white/5 active:bg-gray-100/50 dark:active:bg-white/5 w-full ${
        isActive
          ? 'ring-2 ring-blue-500/80 bg-blue-500/10 dark:bg-blue-500/15'
          : ''
      }`}
      onTouchStart={() => {
        movedRef.current = false;
        holdRef.current = setTimeout(() => {
          if (!movedRef.current) {
            onContextMenu?.(file);
          }
        }, 420);
      }}
      onTouchMove={() => {
        movedRef.current = true;
        if (holdRef.current) {
          clearTimeout(holdRef.current);
          holdRef.current = null;
        }
      }}
      onTouchEnd={() => {
        if (holdRef.current) clearTimeout(holdRef.current);
      }}
    >
      <div className="relative flex flex-col items-center">
        {isCanvas ? (
          <Layout
            className="w-9 h-11 text-purple-500 dark:text-purple-400 transition-transform group-active:scale-105"
            fill="currentColor"
            fillOpacity={0.06}
            strokeWidth={1.25}
          />
        ) : (
          <FileText
            className={`w-9 h-11 transition-transform group-active:scale-105 ${
              isActive
                ? 'text-blue-500 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400 group-hover:text-blue-500'
            }`}
            fill="currentColor"
            fillOpacity={0.06}
            strokeWidth={1.25}
          />
        )}
        {isLocked && (
          <span title="PIN-geschützt" className="absolute -top-1 -right-1 flex items-center justify-center p-[2px] bg-white dark:bg-slate-900 rounded-full shadow-xs">
            <Lock size={11} className="text-amber-500" strokeWidth={2.5} />
          </span>
        )}
      </div>

      <span
        className={`text-[11px] leading-tight font-semibold text-center line-clamp-2 max-w-[84px] mt-1.5 transition-colors ${
          isActive ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-800 dark:text-gray-200'
        }`}
      >
        {displayTitle}
      </span>

      {isShared ? (
        <span className="mt-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-950/80 dark:text-sky-300 leading-none">
          Geteilt
        </span>
      ) : dateStr ? (
        <span className="mt-1 text-[10px] text-gray-400 dark:text-gray-500 leading-none">
          {dateStr}
        </span>
      ) : null}
    </button>
  );
});

interface FolderCardItem {
  id: string;
  title?: string;
  type?: string;
  has_pin?: boolean;
  is_locked?: boolean;
  metadata?: NoteCardMetadata | null;
  parent_id?: string | null;
  color?: string;
}

const FolderCard = React.memo(function FolderCard({
  folder,
  allFiles,
  onOpen,
  activeNoteId,
  onContextMenu,
  onNoteContextMenu,
  onPromptPin,
}: {
  folder: FolderCardItem;
  allFiles: NoteCardItem[];
  onOpen: (id: string, t: string) => void;
  activeNoteId?: string | null;
  onContextMenu?: (folder: FolderCardItem) => void;
  onNoteContextMenu?: (file: NoteCardItem) => void;
  onPromptPin?: (item: PinPromptTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movedRef = useRef(false);
  const loadedDirectories = useDataStore(s => s.loadedDirectories);
  const theme = useDataStore(s => s.theme);
  const children = allFiles.filter(f => f.parent_id === folder.id);
  const colorDef = getFolderColor(folder.color || folder.metadata?.color);

  const isLocked = Boolean(
    folder.has_pin ||
    folder.is_locked ||
    folder.metadata?.has_custom_password ||
    folder.metadata?.security_settings?.has_custom_password ||
    (typeof folder.title === 'string' && folder.title.startsWith('#'))
  );

  const displayTitle = (typeof folder.title === 'string' && folder.title.startsWith('#'))
    ? folder.title.slice(1).trim()
    : (folder.title || 'Ordner');

  const handleToggle = () => {
    if (isLocked && !open && !isItemUnlocked(folder.id, (folder.metadata?.security_settings || folder.metadata) as ItemSecuritySettings | null | undefined)) {
      const promptData: PinPromptTarget = {
        id: folder.id,
        title: folder.title || 'Ordner',
        type: 'folder' as const,
        metadata: folder.metadata || undefined,
        onUnlocked: () => {
          setOpen(true);
          if (!loadedDirectories.has(folder.id)) {
            useDataStore.getState().fetchDirectory(folder.id);
          }
        }
      };
      if (onPromptPin) {
        onPromptPin(promptData);
      } else {
        window.dispatchEvent(new CustomEvent('tide:prompt-pin', { detail: promptData }));
      }
      return;
    }

    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && !loadedDirectories.has(folder.id)) {
      useDataStore.getState().fetchDirectory(folder.id);
    }
  };

  if (open) {
    return (
      <div
        className="col-span-3 min-[480px]:col-span-4 rounded-2xl p-3 border transition-all"
        style={{
          background: theme === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
          borderColor: T.brd,
        }}
      >
        <div
          onClick={handleToggle}
          className="flex items-center justify-between pb-2 mb-2 border-b cursor-pointer select-none"
          style={{ borderColor: T.brd }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{
                backgroundColor: `${colorDef.hex}20`,
                color: colorDef.hex,
              }}
            >
              <FolderOpen size={16} />
            </div>
            <span className="text-xs font-bold truncate" style={{ color: T.pri }}>
              {displayTitle}
            </span>
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white shadow-xs leading-none"
              style={{ backgroundColor: colorDef.hex }}
            >
              {children.length}
            </span>
          </div>
          <ChevronDown size={14} className="rotate-180 transition-transform" style={{ color: T.mut }} />
        </div>

        {children.length === 0 ? (
          <p className="text-xs py-3 text-center" style={{ color: T.mut }}>
            Ordner ist leer
          </p>
        ) : (
          <div className="grid grid-cols-3 min-[480px]:grid-cols-4 gap-2">
            {children.map(child => (
              child.type === 'folder' ? (
                <FolderCard
                  key={child.id}
                  folder={child}
                  allFiles={allFiles}
                  onOpen={onOpen}
                  activeNoteId={activeNoteId}
                  onContextMenu={onContextMenu}
                  onNoteContextMenu={onNoteContextMenu}
                  onPromptPin={onPromptPin}
                />
              ) : (
                <NoteCard
                  key={child.id}
                  file={child}
                  isActive={activeNoteId === child.id}
                  onOpen={() => onOpen(child.id, child.title || 'Untitled')}
                  onContextMenu={onNoteContextMenu}
                />
              )
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      className="group relative flex flex-col items-center justify-between cursor-pointer select-none p-1.5 rounded-xl transition-all active:scale-95 hover:bg-gray-100/50 dark:hover:bg-white/5 active:bg-gray-100/50 dark:active:bg-white/5 w-full"
      onTouchStart={() => {
        movedRef.current = false;
        holdRef.current = setTimeout(() => {
          if (!movedRef.current) {
            onContextMenu?.(folder);
          }
        }, 420);
      }}
      onTouchMove={() => {
        movedRef.current = true;
        if (holdRef.current) {
          clearTimeout(holdRef.current);
          holdRef.current = null;
        }
      }}
      onTouchEnd={() => {
        if (holdRef.current) clearTimeout(holdRef.current);
      }}
    >
      <div className="relative flex flex-col items-center">
        <Folder
          className="w-11 h-11 transition-transform group-active:scale-105"
          style={{ color: colorDef.hex, fill: `${colorDef.hex}26` }}
          strokeWidth={1.4}
        />
        {isLocked && (
          <span title="PIN-geschützt" className="absolute -top-1 -right-1 flex items-center justify-center p-[2px] bg-white dark:bg-slate-900 rounded-full shadow-xs">
            <Lock size={11} className="text-amber-500" strokeWidth={2.5} />
          </span>
        )}
        {children.length > 0 && (
          <span
            className="absolute bottom-0 right-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white shadow-xs leading-none"
            style={{ backgroundColor: colorDef.hex }}
          >
            {children.length}
          </span>
        )}
      </div>

      <span
        className="text-[11px] leading-tight font-semibold text-center line-clamp-2 max-w-[84px] mt-1.5 text-gray-800 dark:text-gray-200 transition-colors"
      >
        {displayTitle}
      </span>
    </button>
  );
});

export default function MobileLayout({
  events, files, folders, onNoteSelect, onNewNote, onDeleteNote,
  onNewFolder, onNewFolderIn, onNoteRename,
  editorElement, activeNoteId, activeNoteTitle, onNewEvent,
  onEventClick, onEventUpdate, onEventSave, onEventDelete, onTaskComplete,
  socialHubElement, userProfile, themes,
}: MobileLayoutProps) {
  const resolvedThemes = useMemo(() => {
    if (themes && themes.length > 0) return themes;
    return (files || [])
      .filter((f: any) => f.type === 'folder' && f.isGroup)
      .map((g: any) => ({
        id: g.id,
        title: g.title || 'Gruppe',
        color: g.color,
        effect: g.effect,
      }));
  }, [themes, files]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [isExamsOpen, setIsExamsOpen] = useState(false);
  const [isSurveysOpen, setIsSurveysOpen] = useState(false);
  const [activeDate, setActiveDate] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [editingEvent, setEditingEvent] = useState<React.ComponentProps<typeof MobileEditEventSheet>['event'] | null>(null);
  const [contextMenu, setContextMenu] = useState<{ type: 'note' | 'folder'; id: string; title: string; parentId?: string | null } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [calViewMode, setCalViewMode] = useState<'day' | 'agenda' | 'week' | 'month'>('day');
  const [activeTab, setActiveTab] = useState<'calendar' | 'notes' | 'todos'>('calendar');
  const [, setWheelVisibleMonth] = useState<string>(() => format(activeDate, 'MMMM yyyy', { locale: de }));
  const [dayViewDays, setDayViewDays] = useState<Date[]>([]);
  const dayViewSentinelRef = useRef<HTMLDivElement>(null);
  const [isNewEventSheetOpen, setIsNewEventSheetOpen] = useState(false);
  const [newEventDefaultDate, setNewEventDefaultDate] = useState<Date>(new Date());
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createModalMode, setCreateModalMode] = useState<'event' | 'todo'>('event');
  const [isSharedFolderOpen, setIsSharedFolderOpen] = useState(true);
  const [pinPromptItem, setPinPromptItem] = useState<PinPromptTarget | null>(null);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedPriority, setSelectedPriority] = useState<PriorityOption | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<StatusOption | string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const tasks = useDataStore((s) => s.tasks);
  const [notesViewMode, setNotesViewMode] = useState<'list' | 'grid'>(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem('tide_notes_view') === 'list' ? 'list' : 'grid';
    } catch { return 'grid'; }
  });

  useEffect(() => {
    const isMobileVisible = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
    const handleStart = (e: any) => {
      if (!isMobileVisible()) return;
      if (e.detail?.source === 'desktop' || e.detail?.isDesktop) return;
      if (activeTab !== 'todos') return;
      setEditingTodoId(e.detail?.id || 'active');
    };
    const handleEnd = (e?: any) => {
      if (!isMobileVisible()) return;
      if (e?.detail?.source === 'desktop' || e?.detail?.isDesktop) return;
      setEditingTodoId(null);
    };
    window.addEventListener('tide:todo-editing-start', handleStart);
    window.addEventListener('tide:todo-editing-end', handleEnd);
    return () => {
      window.removeEventListener('tide:todo-editing-start', handleStart);
      window.removeEventListener('tide:todo-editing-end', handleEnd);
    };
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isMobileVisible = window.matchMedia('(max-width: 767px)').matches;
    if (!isMobileVisible) {
      if (editingTodoId) setEditingTodoId(null);
      return;
    }
    if (activeTab !== 'todos' && editingTodoId) {
      setEditingTodoId(null);
      window.dispatchEvent(new CustomEvent('tide:todo-cancel-edit', { detail: { source: 'mobile' } }));
    }
  }, [activeTab, editingTodoId]);

  useEffect(() => {
    const handlePromptPin = (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail;
      if (detail && detail.id) {
        setPinPromptItem({
          id: detail.id,
          title: detail.title,
          type: detail.type,
          metadata: detail.metadata,
          onUnlocked: () => {
            if (detail.onUnlocked) {
              detail.onUnlocked();
            } else if (detail.type === 'folder') {
              useDataStore.getState().toggleFolder(detail.id, true);
            }
          }
        });
      }
    };
    window.addEventListener('tide:prompt-pin', handlePromptPin);
    return () => window.removeEventListener('tide:prompt-pin', handlePromptPin);
  }, []);

  useEffect(() => {
    if (activeNoteId) {
      setIsEditingNote(true);
    }
  }, [activeNoteId]);

  // Note drag-to-folder
  const [draggingNote, setDraggingNote] = useState<{ id: string; title: string } | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const dragGhostPos = useRef({ x: 0, y: 0 });

  const {
    swipeDx,
    swipeElRef,
    snapping,
    eventDragActive,
    setEventDragActive,
    eventDragActiveRef,
    onSwipeStart,
    onSwipeMove,
    onSwipeEnd,
  } = useMobileSwipeGestures({
    calViewMode,
    setActiveDate,
  });


  // Top bar right-swipe → open sidebar
  const topBarTouch = useRef({ x0: 0, y0: 0 });

  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(id); }, []);

  const [greetingTemplate] = useState(() => pickGreetingTemplate(new Date()));

  const handleCountdownTap = useCallback((eventId: string) => {
    setEditingTodoId(null);
    window.dispatchEvent(new CustomEvent('tide:todo-cancel-edit', { detail: { source: 'mobile' } }));
    setActiveTab('calendar');
    setCalViewMode('day');
    setActiveDate(new Date());
    setTimeout(() => {
      const el = document.getElementById('ev-' + eventId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  }, [setActiveTab, setCalViewMode, setActiveDate]);

  const handleGoToToday = useCallback(() => {
    const today = new Date();
    setActiveDate(today);

    // Ensure dayViewDays includes today; if outside range, regenerate centered around today
    setDayViewDays(prev => {
      const hasToday = prev.some(d => isSameDay(d, today));
      if (hasToday) return prev;
      const ws = startOfWeek(today, { weekStartsOn: 1 });
      return Array.from({ length: 30 }, (_, i) => addDays(ws, i));
    });

    setTimeout(() => {
      const el = document.getElementById(`day-${format(today, 'yyyy-MM-dd')}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }, []);

  const storedName = typeof window !== 'undefined' ? (localStorage.getItem('tide_user_name') || sessionStorage.getItem('tide_user_name')) : null;
  const emailPrefix = (userProfile?.email || '').split('@')[0];
  const validUsername = userProfile?.username && userProfile.username !== emailPrefix ? userProfile.username : null;
  const displayName = (userProfile as any)?.displayName || (userProfile as any)?.name || validUsername || storedName || userProfile?.username || emailPrefix || '';
  const viewModesRef = useRef<HTMLDivElement>(null);
  const weekTouchX = useRef<number | null>(null);

  useEffect(() => {
    const el = document.getElementById(`btn-view-${calViewMode}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [calViewMode]);

  const enabledExtensions = useDataStore(s => s.enabledExtensions);
  const setSettingsOpen = useDataStore(s => s.setSettingsModalOpen);
  const theme = useDataStore(s => s.theme);

  // Synchronize mobile status bar / safe-area theme color with the active app theme
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const bgColor = theme === 'dark' ? '#0F172A' : '#FFFFFF';
    if (meta) {
      meta.setAttribute('content', bgColor);
    }
  }, [theme]);

  // ── Keyboard-aware bottom bar offset ────────────────────────────────────────
  const [kbOffset, setKbOffset] = useState(0);
  useEffect(() => {
    const vv = (window as any).visualViewport as VisualViewport | undefined;
    if (!vv) return;
    let raf: number | null = null;
    const handler = () => {
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const next = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        setKbOffset(prev => (prev === next ? prev : next));
      });
    };
    vv.addEventListener('resize', handler);
    vv.addEventListener('scroll', handler);
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      vv.removeEventListener('resize', handler);
      vv.removeEventListener('scroll', handler);
    };
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

  // ── [RECURRENCE-EXPANSION] ──────────────────────────────────────────────────────────
  const expandedEvents = useMemo(() => {
    const minDate = new Date(activeDate.getFullYear(), activeDate.getMonth() - 2, 1);
    const maxDate = new Date(activeDate.getFullYear(), activeDate.getMonth() + 3, 1);
    const expanded: any[] = [];

    const processEvent = (evt: any, start: Date) => {
      const duration = new Date(evt.end).getTime() - new Date(evt.start).getTime();
      const end = new Date(start.getTime() + duration);
      const occId = evt.id;
      const isOcc = occId.includes('_');
      const baseId = isOcc ? occId.split('_')[0] : occId;
      const timeKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;

      // Check if this specific occurrence date is cancelled or has overrides
      const overrides = evt.overrides || {};
      if (overrides[timeKey]) {
        const dayOverrides = overrides[timeKey];
        if (dayOverrides.is_cancelled) {
          return; // Skip cancelled occurrence
        }
        // Apply date overrides
        if (dayOverrides.start) start = new Date(dayOverrides.start);
        if (dayOverrides.end) {
          end.setTime(new Date(dayOverrides.end).getTime());
        }
      }

      expanded.push({
        ...evt,
        id: start.getTime() === new Date(evt.start).getTime() ? evt.id : `${evt.id}_${start.getTime()}`,
        start: start.toISOString(),
        end: end.toISOString()
      });
    };

    events.forEach(e => {
      const start = new Date(e.start);
      if (isNaN(start.getTime())) {
        return;
      }

      const rule = e.recurrence_rule;
      const rrule = rule || `FREQ=${(e.recurrence && e.recurrence !== 'none') ? e.recurrence.toUpperCase() : 'NONE'};INTERVAL=1`;

      let freq = 'none';
      let interval = 1;
      const matchFreq = rrule.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY|NONE)/i);
      if (matchFreq) freq = matchFreq[1].toLowerCase();
      const matchInterval = rrule.match(/INTERVAL=(\d+)/i);
      if (matchInterval) interval = parseInt(matchInterval[1], 10);
      interval = Math.max(1, interval);

      if (freq === 'none') {
        processEvent(e, start);
      } else {
        const current = new Date(start);
        const recEndOrig = e.recurrence_end ? new Date(e.recurrence_end) : new Date(maxDate.getTime() + 31536000000);
        if (isNaN(recEndOrig.getTime())) {
          processEvent(e, start); // Fallback to single occurrence
          return;
        }
        const safeRecEnd = recEndOrig < maxDate ? recEndOrig : maxDate;

        while (current < minDate && current < safeRecEnd) {
          if (freq === 'daily') current.setDate(current.getDate() + interval);
          else if (freq === 'weekly') current.setDate(current.getDate() + (interval * 7));
          else if (freq === 'monthly') current.setMonth(current.getMonth() + interval);
          else if (freq === 'yearly') current.setFullYear(current.getFullYear() + interval);
          else break;
        }

        let count = 0;
        while (current < maxDate && current <= safeRecEnd && count < 1000) {
          processEvent({
            ...e,
            parent_event_id: current.getTime() === start.getTime() ? undefined : e.id
          }, new Date(current));
          if (freq === 'daily') current.setDate(current.getDate() + interval);
          else if (freq === 'weekly') current.setDate(current.getDate() + (interval * 7));
          else if (freq === 'monthly') current.setMonth(current.getMonth() + interval);
          else if (freq === 'yearly') current.setFullYear(current.getFullYear() + interval);
          else break;
          count++;
        }
      }
    });

    return expanded;
  }, [events, activeDate]);

  useEffect(() => {
    const handleEditEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const id = customEvent.detail?.id;
      if (!id) return;
      const target = expandedEvents.find(ev => ev.id === id) || events.find(ev => ev.id === id);
      if (target) {
        setSelectedEvent(null);
        setEditingEvent(target);
      }
    };
    window.addEventListener('mobile_edit_event', handleEditEvent);
    return () => window.removeEventListener('mobile_edit_event', handleEditEvent);
  }, [expandedEvents, events]);

  const weekStart = useMemo(() => startOfWeek(activeDate, { weekStartsOn: 1 }), [activeDate]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  // AllDay events for the week view row
  const allDayEventsForWeek = useMemo(() => {
    const wStart = new Date(weekDays[0]); wStart.setHours(0, 0, 0, 0);
    const wEnd   = new Date(weekDays[6]); wEnd.setHours(23, 59, 59, 999);
    return expandedEvents.filter(e => {
      if (!e.allDay) return false;
      if (e.is_task || e.linkedTaskId) return false;
      try { const s = new Date(e.start); const en = e.end ? new Date(e.end) : s; return s <= wEnd && en >= wStart; }
      catch { return false; }
    });
  }, [expandedEvents, weekDays]);

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

  // (infinite scroll mode removed)

  // Reset day-view list when the calendar week changes
  useEffect(() => {
    const ws = startOfWeek(activeDate, { weekStartsOn: 1 });
    setDayViewDays(Array.from({ length: 30 }, (_, i) => addDays(ws, i)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStartStr]);

  // Infinite scroll sentinel for day view
  useEffect(() => {
    if (calViewMode !== 'agenda') return;
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


  // ── Grouped day-view days (groups consecutive empty days into clean hints) ───────
  const groupedDayViewItems = useMemo(
    () => getGroupedDayViewItems(dayViewDays, expandedEvents, now),
    [dayViewDays, expandedEvents, now]
  );

  // Text collector: open search on key press
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isSearchOpen || isEditingNote || isSidebarOpen || activeTab === 'notes') return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length !== 1) return;
      setSearchQuery(e.key);
      setIsSearchOpen(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isSearchOpen, isEditingNote, isSidebarOpen, activeTab]);

  const searchEvents: SearchEventItem[] = useMemo(() => {
    return (expandedEvents || []).map((e: any) => ({
      id: e.id,
      title: e.title || 'Termin',
      start: e.start,
      end: e.end,
      dotColor: e.color,
      tag: e.tag || e.category,
    }));
  }, [expandedEvents]);

  const searchTodos: SearchTodoItem[] = useMemo(() => {
    return (tasks || []).map((t) => ({
      id: t.id,
      title: t.title || 'Aufgabe',
      completed: t.isCompleted,
      isCompleted: t.isCompleted,
      priority: t.priority,
      tag: t.folder || (t.tags && t.tags[0]),
    }));
  }, [tasks]);

  const searchNotes: SearchNoteItem[] = useMemo(() => {
    const contentCache: Record<string, string> =
      typeof window !== 'undefined' ? ((window as any).__mobileNoteCache ?? {}) : {};
    return (files || [])
      .filter((f: any) => f.type !== 'folder')
      .map((f: any) => ({
        id: f.id,
        title: f.title || 'Notiz',
        preview: contentCache[f.id] || f.preview || '',
        tag: f.folder_name || (f.tags && f.tags[0]),
        updatedAt: f.updated_at || f.updatedAt,
      }));
  }, [files]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    (tasks || []).forEach((t) => t.tags?.forEach((tag) => s.add(tag)));
    (files || []).forEach((f: any) => f.tags?.forEach?.((tag: string) => s.add(tag)));
    return Array.from(s);
  }, [tasks, files]);

  const navBadges = useMemo(() => {
    const openTodos = (tasks || []).filter((t) => !t.isCompleted).length;
    const todayEvts = (expandedEvents || []).filter((e: any) => {
      try {
        return isSameDay(new Date(e.start), new Date());
      } catch {
        return false;
      }
    }).length;
    return {
      calendar: todayEvts > 0 ? todayEvts : undefined,
      todos: openTodos > 0 ? openTodos : undefined,
    };
  }, [tasks, expandedEvents]);

  const openNote = useCallback((id: string, title: string) => {
    const note = useDataStore.getState().notes.find(n => n.id === id) || files.find((f: { id?: string }) => f?.id === id);
    const isProtected = Boolean(
      note?.has_pin ||
      note?.is_locked ||
      note?.metadata?.has_custom_password ||
      note?.metadata?.security_settings?.has_custom_password ||
      (typeof title === 'string' && title.startsWith('#'))
    );
    if (isProtected && !isItemUnlocked(id, (note?.metadata?.security_settings || note?.metadata) as ItemSecuritySettings | null | undefined)) {
      setPinPromptItem({
        id,
        title,
        type: 'note',
        metadata: note?.metadata,
        onUnlocked: () => {
          setIsSidebarOpen(false);
          setIsSearchOpen(false);
          onNoteSelect(id, title);
          setIsEditingNote(true);
        }
      });
      return;
    }

    setIsSidebarOpen(false);
    setIsSearchOpen(false);
    onNoteSelect(id, title);
    setIsEditingNote(true);
  }, [files, onNoteSelect]);

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
            {/* Workspace Switcher */}
            <div className="px-2 pb-1">
              <SidebarQuickNotes className="flex-shrink-0" />
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
                      <NoteRow key={f.id} file={f} isActive={activeNoteId === f.id} onOpen={() => openNote(f.id, f.title || 'Untitled')} onDragStart={handleNoteDragStart} onContextMenu={f => setContextMenu({ type: 'note', id: f.id, title: f.title || 'Untitled', parentId: f.parent_id })} />
                    ))}
                    <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: T.mut }}>Notizen</p>
                    {folders.filter(f => !f.parent_id).map(folder => (
                      <FolderItem key={folder.id} folder={folder} allFiles={files} onOpen={openNote} activeNoteId={activeNoteId} dragOverId={dragOverFolderId} onDragOver={setDragOverFolderId} onDragLeave={() => setDragOverFolderId(null)}
                        onContextMenu={f => setContextMenu({ type: 'folder', id: f.id, title: f.title || 'Ordner', parentId: f.parent_id })}
                        onNoteContextMenu={f => setContextMenu({ type: 'note', id: f.id, title: f.title || 'Untitled', parentId: f.parent_id })}
                        onNoteDragStart={handleNoteDragStart} isDragging={!!draggingNote}
                        onPromptPin={setPinPromptItem} />
                    ))}
                    {files.filter(f => !f.parent_id && f.type !== 'folder' && !recentIds.has(f.id)).map(f => (
                      <NoteRow key={f.id} file={f} isActive={activeNoteId === f.id} onOpen={() => openNote(f.id, f.title || 'Untitled')} onDragStart={handleNoteDragStart} onContextMenu={f => setContextMenu({ type: 'note', id: f.id, title: f.title || 'Untitled', parentId: f.parent_id })} />
                    ))}
                  </>
                );
              })()}
            </div>
            {/* Feature tabs — Social/Chat removed */}
            <div style={{ borderTop: `1px solid ${T.brd}`, flexShrink: 0 }}>
              <div className="flex overflow-x-auto gap-2 px-3 py-3 no-scrollbar">
                {[
                  { id: 'job_planner', icon: <GraduationCap size={18} />, label: 'Job & Uni', ext: 'job_planner', action: () => { setIsSidebarOpen(false); setIsExamsOpen(true); } },
                  { id: 'surveys', icon: <Smile size={18} />, label: 'Umfragen', ext: 'surveys', action: () => { setIsSidebarOpen(false); setIsSurveysOpen(true); } },
                  { id: 'settings', icon: <Settings size={18} />, label: 'Optionen', ext: '', action: () => { setIsSidebarOpen(false); setSettingsOpen(true); } },
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

        {/* Note editor with rename header (Fullscreen focus mode) */}
        {(isEditingNote || Boolean(activeNoteId)) && editorElement && (
          <motion.div key="editor"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-50 flex flex-col overflow-hidden"
            style={{ background: T.bg }}
          >
            <div className="flex items-center gap-3 px-4 shrink-0" style={{ paddingTop: 'max(52px, calc(env(safe-area-inset-top) + 10px))', paddingBottom: 10, borderBottom: `1px solid ${T.brd}` }}>
              <button
                onClick={() => {
                  setIsEditingNote(false);
                  onNoteSelect?.('', '');
                }}
                className="p-2 rounded-full transition-colors active:opacity-70"
                style={{ background: T.hov }}
                aria-label="Zurück"
              >
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
            <div
              className="flex-1 overflow-y-auto w-full overscroll-contain px-3 py-2"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
            >
              {editorElement}
            </div>
          </motion.div>
        )}

        {/* Social removed from mobile */}

        {/* Job & Study Planner */}
        {isExamsOpen && (
          <OverlayShell key="job_planner" title="Job & Uni" onBack={() => setIsExamsOpen(false)}>
            <div className="flex-1 overflow-y-auto"><JobPlanner /></div>
          </OverlayShell>
        )}

        {/* Surveys & Mood */}
        {isSurveysOpen && (
          <OverlayShell key="surveys" title="Umfragen & Mood" onBack={() => setIsSurveysOpen(false)}>
            <div className="flex-1 overflow-y-auto"><SurveyAnalytics /></div>
          </OverlayShell>
        )}

        {/* Unified Mobile Search Overlay */}
        <MobileSearchOverlay
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          events={searchEvents}
          todos={searchTodos}
          notes={searchNotes}
          onSelectEvent={(evItem) => {
            const found = expandedEvents.find((e: any) => e.id === evItem.id);
            if (found) {
              setSelectedEvent(found);
            }
            setIsSearchOpen(false);
          }}
          onSelectTodo={(todoItem) => {
            setActiveTab('todos');
            setIsSearchOpen(false);
            window.dispatchEvent(new CustomEvent('tide:select-todo', { detail: { id: todoItem.id } }));
          }}
          onSelectNote={(noteItem) => {
            openNote(noteItem.id, noteItem.title);
            setIsSearchOpen(false);
          }}
          onToggleTodo={async (id) => {
            await useDataStore.getState().toggleTask(id);
          }}
        />

        {/* Mobile Filter Popover */}
        <MobileFilterPopover
          isOpen={isFilterOpen}
          onClose={() => setIsFilterOpen(false)}
          selectedPriority={selectedPriority}
          onPriorityChange={(priority) => {
            setSelectedPriority(priority);
            window.dispatchEvent(new CustomEvent('tide:filter-priority', { detail: { priority } }));
          }}
          selectedStatus={selectedStatus}
          onStatusChange={(status) => {
            setSelectedStatus(status);
            window.dispatchEvent(new CustomEvent('tide:filter-status', { detail: { status } }));
          }}
          dateFilter={dateFilter}
          onDateFilterChange={(date) => {
            setDateFilter(date);
            window.dispatchEvent(new CustomEvent('tide:filter-date', { detail: { date } }));
          }}
          tags={allTags}
          selectedTag={selectedTag}
          onTagChange={(tag) => {
            setSelectedTag(tag);
            window.dispatchEvent(new CustomEvent('tide:filter-tag', { detail: { tag } }));
          }}
          onResetFilters={() => {
            setSelectedPriority(null);
            setSelectedStatus(null);
            setDateFilter('all');
            setSelectedTag(null);
            window.dispatchEvent(new CustomEvent('tide:filter-reset'));
          }}
        />

        {/* Event detail sheet */}
        {selectedEvent && (
          <EventSheet
            key={`evsheet-${selectedEvent.id}`}
            event={selectedEvent}
            now={now}
            onDelete={() => { onEventDelete?.(selectedEvent.id); setSelectedEvent(null); }}
            onEdit={() => {
              setEditingEvent(selectedEvent);
              setSelectedEvent(null);
            }}
            onTaskComplete={onTaskComplete}
            onToggleComplete={() => {
              const nextCompleted = !selectedEvent.is_completed;
              if (selectedEvent.linkedTaskId) {
                useDataStore.getState().toggleTask(selectedEvent.linkedTaskId);
              }
              onTaskComplete?.(selectedEvent.id, nextCompleted);
              setSelectedEvent((prev: typeof selectedEvent) => prev ? { ...prev, is_completed: nextCompleted } : null);
            }}
            onDismiss={() => setSelectedEvent(null)}
          />
        )}

        {/* Edit Event Sheet */}
        {editingEvent && (
          <MobileEditEventSheet
            key={`edit-${editingEvent.id}`}
            event={editingEvent}
            themes={resolvedThemes}
            onSave={(id, start, end, meta) => {
              if (onEventSave) {
                onEventSave(id, {
                  title: meta.title,
                  start: start.toISOString(),
                  end: end.toISOString(),
                  color: meta.color,
                  description: meta.description,
                  parent_id: meta.parent_id,
                  groupIds: meta.groupIds,
                  recurrence_rule: meta.recurrence_rule,
                  recurrence_end: meta.recurrence_end,
                  recurrence: meta.recurrence,
                });
              } else if (onEventUpdate) {
                onEventUpdate(id, start, end, meta);
              }
              if (meta.title && meta.title !== editingEvent.title && onNoteRename) {
                onNoteRename(id, meta.title);
              }
              useDataStore.setState(s => ({
                events: s.events.map(e =>
                  (e.id === id || (id.includes('_') && e.id === id.split('_')[0]))
                    ? {
                        ...e,
                        title: meta.title,
                        start: start.toISOString(),
                        end: end.toISOString(),
                        color: meta.color,
                        description: meta.description,
                        parent_id: meta.parent_id,
                        groupIds: meta.groupIds,
                        recurrence_rule: meta.recurrence_rule,
                        recurrence_end: meta.recurrence_end,
                        recurrence: meta.recurrence,
                      }
                    : e
                ),
              }));
              setEditingEvent(null);
            }}
            onDismiss={() => setEditingEvent(null)}
          />
        )}

        {/* ── Context menu sheet (note / folder) ─────── */}
        {contextMenu && (
          <MobileContextMenuSheet
            contextMenu={contextMenu}
            onClose={() => setContextMenu(null)}
            onOpenNote={(id, title) => openNote(id, title)}
            onNewNoteInFolder={folderId => {
              window.dispatchEvent(new CustomEvent('mobile_set_parent', { detail: { parentId: folderId } }));
              setTimeout(() => { onNewNote(); setIsEditingNote(true); }, 0);
            }}
            onNewFolderInFolder={folderId => onNewFolderIn?.(folderId)}
            onRename={(id, title) => { setRenamingId(id); setRenameValue(title); }}
            onShare={(id, title) => {
              window.dispatchEvent(new CustomEvent('mobile_share_file', { detail: { id, title } }));
            }}
            onDelete={id => onDeleteNote?.(id)}
          />
        )}

        {/* Rename inline input */}
        {renamingId && (
          <MobileRenameModal
            id={renamingId}
            value={renameValue}
            onChange={setRenameValue}
            onSave={(id, newTitle) => onNoteRename?.(id, newTitle)}
            onClose={() => setRenamingId(null)}
          />
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

      {/* ── Top Header with Greeting, Sidebar Menu, and Apple-style Date Wheel ── */}
      <div
        className="shrink-0 z-20 sticky top-0"
        style={{
          paddingTop: 'max(12px, calc(env(safe-area-inset-top) + 4px))',
          background: T.bg,
        }}
      >
          {/* Row 1: Date & Greeting ("XX. Monat", "Guten Morgen/Mittag/Tag/Abend Name!") */}
          <div className="px-4 pt-1 pb-1.5 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 flex-wrap" style={{ color: T.mut }}>
                {format(now, 'd. MMMM', { locale: de })}
              </p>
              <h1 className="text-[1.7rem] font-black tracking-tight line-clamp-2 leading-tight mt-0.5" style={{ color: T.pri }}>
                {(() => {
                  const trimmed = displayName?.trim();
                  if (!trimmed || !greetingTemplate.includes('{name}')) {
                    return formatGreeting(greetingTemplate, displayName);
                  }
                  const [prefix, ...rest] = greetingTemplate.split('{name}');
                  const suffix = rest.join('{name}');
                  return (
                    <>
                      {prefix}
                      {prefix ? ', ' : ''}
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          fireConfetti(e.currentTarget);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            fireConfetti(e.currentTarget);
                          }
                        }}
                        className="cursor-pointer select-none active:scale-95 transition-transform inline-block"
                        title="Konfetti"
                      >
                        {trimmed}
                      </span>
                      {suffix}
                    </>
                  );
                })()}
              </h1>
            </div>
            <div className="shrink-0">
              <NextEventCountdown events={expandedEvents} onTap={handleCountdownTap} className="-mt-1.5" userName={displayName} />
            </div>
          </div>

          <div>
          {/* Row 2: Apple-style Horizontal Date Wheel */}
          {activeTab === 'calendar' && calViewMode !== 'month' && (
            <MobileDateWheel
              activeDate={activeDate}
              onSelectDate={d => {
                setActiveDate(d);
                if (calViewMode === 'agenda') {
                  setDayViewDays(prev => {
                    if (prev.some(day => isSameDay(day, d))) return prev;
                    const ws = startOfWeek(d, { weekStartsOn: 1 });
                    return Array.from({ length: 30 }, (_, i) => addDays(ws, i));
                  });
                  setTimeout(() => {
                    document.getElementById(`day-${format(d, 'yyyy-MM-dd')}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 60);
                }
              }}
              now={now}
              theme={theme}
              onMonthChange={setWheelVisibleMonth}
            />
          )}

          {/* Row 3: View mode selector — compact pills */}
          {activeTab === 'calendar' && (
            <div className="flex items-center justify-between gap-1 px-4 pb-2 pt-0.5">
              <div className="flex items-center gap-1">
                {(['day', 'agenda', 'week', 'month'] as const).map(mode => {
                  const labels: Record<string, string> = { day: 'Tag', agenda: 'Fortlaufend', week: 'Woche', month: 'Monat' };
                  const isAct = calViewMode === mode;
                  return (
                    <button
                      key={mode}
                      id={`btn-view-${mode}`}
                      onClick={() => setCalViewMode(mode)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all active:scale-95 cursor-pointer"
                      style={{
                        background: isAct
                          ? (theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)')
                          : 'transparent',
                        color: isAct ? T.pri : T.mut,
                      }}
                    >
                      {labels[mode]}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={handleGoToToday}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all active:scale-95 shrink-0 cursor-pointer"
                style={{
                  background: isSameDay(activeDate, now)
                    ? (theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)')
                    : 'linear-gradient(135deg, #4c1d95 0%, #7e22ce 100%)',
                  color: isSameDay(activeDate, now) ? T.mut : '#ffffff',
                  boxShadow: isSameDay(activeDate, now) ? 'none' : '0 2px 6px rgba(126, 34, 206, 0.3)',
                }}
                title="Zum heutigen Tag springen"
              >
                <RotateCcw size={11} />
                <span>Heute</span>
              </button>
            </div>
          )}
          </div>

          <div className="h-px" style={{ background: T.brd }} />
        </div>

      {/* ── Main content area ───────────────────────────── */}
      {activeTab === 'calendar' ? (
      <div
        className="flex flex-col"
        style={{ flex: 1, overflow: 'hidden', paddingBottom: 'calc(76px + env(safe-area-inset-bottom))' }}
        onTouchStart={calViewMode === 'week' || calViewMode === 'day' ? onSwipeStart : undefined}
        onTouchMove={calViewMode === 'week' || calViewMode === 'day' ? onSwipeMove : undefined}
        onTouchEnd={calViewMode === 'week' || calViewMode === 'day' ? onSwipeEnd : undefined}
      >
        {calViewMode === 'week' ? (
          <div
            ref={swipeElRef}
            style={{
              transform: snapping === 'left' ? 'translateX(-100%)' : snapping === 'right' ? 'translateX(100%)' : `translateX(${swipeDx * 0.4}px)`,
              transition: snapping ? 'transform 0.24s cubic-bezier(0.4,0,0.2,1)' : (swipeDx === 0 && !eventDragActive) ? 'transform 0.18s ease-out' : 'none',
              flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >


            <div
              className="flex shrink-0"
              style={{ borderBottom: allDayRows.length > 0 ? 'none' : `1px solid ${T.brd}`, paddingLeft: 38 }}
              onWheel={e => {
                e.stopPropagation();
                if (e.deltaY > 0 || e.deltaX > 0) setActiveDate(d => addDays(d, 7));
                else if (e.deltaY < 0 || e.deltaX < 0) setActiveDate(d => addDays(d, -7));
              }}
            >
              {weekDays.map(d => {
                const isToday = isSameDay(d, now);
                const isSel = isSameDay(d, activeDate);
                return (
                  <button key={d.toISOString()} className="flex-1 flex flex-col items-center py-1"
                    style={{ background: isToday ? 'rgba(59,130,246,0.04)' : 'transparent', border: 'none', cursor: 'pointer' }}
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

            {/* AllDay events strip */}
            {allDayRows.length > 0 && (
              <div className="shrink-0" style={{ paddingLeft: 38, borderBottom: `1px solid ${T.brd}`, height: allDayRows.length * 20 + 4 }}>
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                  {allDayRows.flatMap((row, ri) =>
                    row.map(({ event, sc, ec }) => (
                      <button
                        key={event.id}
                        onClick={() => { const ev = expandedEvents.find(e => e.id === event.id); if (ev) setSelectedEvent(ev); }}
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
              events={expandedEvents}
              now={now}
              onEventTap={id => {
                const ev = expandedEvents.find(e => e.id === id);
                if (ev) setSelectedEvent(ev);
                onEventClick?.(id);
              }}
              onNewEvent={(start, _end) => { onNewEvent?.(start); }}
              onEventUpdate={onEventUpdate}
              onWeekShift={dir => setActiveDate(d => addDays(d, dir * 7))}
              onEventDragChange={active => { eventDragActiveRef.current = active; setEventDragActive(active); }}
            />
          </div>
        ) : calViewMode === 'month' ? (
          /* ── Month view ── */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flexShrink: 0 }}>
              <MiniCalendar
                selectedDate={activeDate}
                events={expandedEvents}
                onSelect={d => { setActiveDate(d); }}
                onMonthChange={d => { setActiveDate(d); }}
                hideVisibleRangeHighlight={true}
              />
            </div>
            {/* Events for selected date */}
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <div className="flex items-center py-2.5">
                <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: T.pri }}>
                  {format(activeDate, 'EEEE d. MMM', { locale: de }).toUpperCase()}
                </span>
              </div>
              <div className="h-px mb-3" style={{ background: T.brd }} />
              {(() => {
                const sameDay = (e: { start: string; allDay?: boolean }) => { try { return isSameDay(new Date(e.start), activeDate); } catch { return false; } };
                const allDayEvs = expandedEvents.filter(e => e.allDay && sameDay(e));
                const dayEvs = expandedEvents.filter(e => !e.allDay && sameDay(e)).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
                return (
                  <DbTimelineDay
                    day={activeDate}
                    dayEvs={dayEvs}
                    allDayEvs={allDayEvs}
                    isToday={isSameDay(activeDate, now)}
                    now={now}
                    theme={theme}
                    onNewEvent={date => {
                      setNewEventDefaultDate(date);
                      setCreateModalMode('event');
                      setIsCreateModalOpen(true);
                    }}
                    onDeleteEvent={onEventDelete}
                    onEditEvent={ev => { setSelectedEvent(null); setEditingEvent(ev); }}
                    onTaskComplete={onTaskComplete}
                  />
                );
              })()}
            </div>
          </div>
        ) : calViewMode === 'day' ? (
          /* ── Single day view (DB Navigator style) ── */
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="flex-1 overflow-y-auto pb-4 px-4 pt-2">
              {(() => {
                const sameDay = (e: { start: string; allDay?: boolean }) => {
                  try { return isSameDay(new Date(e.start), activeDate); } catch { return false; }
                };
                const allDayEvs = expandedEvents.filter(e => e.allDay && sameDay(e));
                const dayEvs = expandedEvents
                  .filter(e => !e.allDay && sameDay(e))
                  .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
                const todayFlag = isSameDay(activeDate, now);

                return (
                  <DbTimelineDay
                    day={activeDate}
                    dayEvs={dayEvs}
                    allDayEvs={allDayEvs}
                    isToday={todayFlag}
                    now={now}
                    theme={theme}
                    onNewEvent={date => {
                      setNewEventDefaultDate(date);
                      setCreateModalMode('event');
                      setIsCreateModalOpen(true);
                    }}
                    onDeleteEvent={onEventDelete}
                    onEditEvent={ev => { setSelectedEvent(null); setEditingEvent(ev); }}
                    onTaskComplete={onTaskComplete}
                  />
                );
              })()}
            </div>
          </div>
        ) : (
          /* ── Fortlaufend / Agenda view (infinite scroll) ── */
          <MobileAgendaTimeline
            dayViewDays={dayViewDays}
            events={expandedEvents}
            now={now}
            theme={theme}
            onSelectDate={setActiveDate}
            onTodayClick={handleGoToToday}
            onNewEvent={date => {
              setNewEventDefaultDate(date);
              setCreateModalMode('event');
              setIsCreateModalOpen(true);
            }}
            onDeleteEvent={onEventDelete}
            onEditEvent={ev => { setSelectedEvent(null); setEditingEvent(ev); }}
            onTaskComplete={onTaskComplete}
            dayViewSentinelRef={dayViewSentinelRef}
          />
        )}
      </div>
      ) : activeTab === 'notes' ? (
      /* ── Notes tab ── */
      <div className="flex flex-col" style={{ flex: 1, overflow: 'hidden', paddingBottom: 'calc(76px + env(safe-area-inset-bottom))' }}>
        {/* Notes header */}
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-lg font-extrabold" style={{ color: T.pri }}>Notizen</span>
          <div
            className="flex items-center p-0.5 rounded-xl border"
            style={{
              background: theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
              borderColor: T.brd,
            }}
          >
            <button
              onClick={() => { setNotesViewMode('list'); try { localStorage.setItem('tide_notes_view', 'list'); } catch {} }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all active:scale-95 cursor-pointer"
              style={{
                background: notesViewMode === 'list'
                  ? (theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)')
                  : 'transparent',
                color: notesViewMode === 'list' ? T.pri : T.mut,
              }}
              title="Liste"
            >
              <List size={14} />
              <span>Liste</span>
            </button>
            <button
              onClick={() => { setNotesViewMode('grid'); try { localStorage.setItem('tide_notes_view', 'grid'); } catch {} }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all active:scale-95 cursor-pointer"
              style={{
                background: notesViewMode === 'grid'
                  ? (theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)')
                  : 'transparent',
                color: notesViewMode === 'grid' ? T.pri : T.mut,
              }}
              title="Kacheln"
            >
              <LayoutGrid size={14} />
              <span>Kacheln</span>
            </button>
          </div>
        </div>
        {/* Workspace selector bar */}
        <SidebarQuickNotes className="px-3 pb-1 shrink-0" />
        {/* Notes list */}
        <div className="flex-1 overflow-y-auto px-2">
          {(() => {
            const q = searchQuery.toLowerCase().trim();
            const filteredFiles = q.length >= 2
              ? files.filter(f => f.type !== 'folder' && (f.title || '').toLowerCase().includes(q))
              : null;

            if (filteredFiles) {
              if (filteredFiles.length === 0) {
                return <p className="text-sm py-8 text-center" style={{ color: T.mut }}>Keine Ergebnisse gefunden</p>;
              }
              return notesViewMode === 'grid' ? (
                <div className="grid grid-cols-3 min-[480px]:grid-cols-4 gap-2 p-1">
                  {filteredFiles.map(f => (
                    <NoteCard
                      key={f.id}
                      file={f}
                      isActive={activeNoteId === f.id}
                      onOpen={() => openNote(f.id, f.title || 'Untitled')}
                      onContextMenu={f => setContextMenu({ type: 'note', id: f.id, title: f.title || 'Untitled', parentId: f.parent_id })}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filteredFiles.map(f => (
                    <NoteRow
                      key={f.id}
                      file={f}
                      isActive={activeNoteId === f.id}
                      onOpen={() => openNote(f.id, f.title || 'Untitled')}
                      onDragStart={handleNoteDragStart}
                      onContextMenu={f => setContextMenu({ type: 'note', id: f.id, title: f.title || 'Untitled', parentId: f.parent_id })}
                    />
                  ))}
                </div>
              );
            }

            const sharedNotes = files.filter(f => {
              const status = (f as any).share_status;
              return status === 'pending' || status === 'accepted' || (f as any).is_shared;
            });
            const sharedIds = new Set(sharedNotes.map(f => f.id));

            const nonSharedFiles = files.filter(f => !sharedIds.has(f.id));
            const recentFiles = nonSharedFiles
              .filter(f => f.type !== 'folder')
              .slice()
              .sort((a, b) => new Date(b.updated_at || b.updatedAt || b.created_at || b.createdAt || 0).getTime() - new Date(a.updated_at || a.updatedAt || a.created_at || a.createdAt || 0).getTime())
              .slice(0, 3);
            const recentIds = new Set(recentFiles.map(f => f.id));
            const rootFolders = folders.filter(f => !f.parent_id && !sharedIds.has(f.id));
            const rootNotes = nonSharedFiles.filter(f => !f.parent_id && f.type !== 'folder' && !recentIds.has(f.id));

            const isEmpty = sharedNotes.length === 0 && recentFiles.length === 0 && rootFolders.length === 0 && rootNotes.length === 0;

            if (isEmpty) {
              return (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <FileText size={32} style={{ color: T.mut }} className="mb-2 opacity-50" />
                  <p className="text-sm font-medium" style={{ color: T.sec }}>Keine Notizen vorhanden</p>
                  <button
                    onClick={() => { onNewNote(); setIsEditingNote(true); }}
                    className="mt-3 text-xs font-semibold px-3 py-1.5 rounded-lg"
                    style={{ background: `${T.accent}15`, color: T.accent }}
                  >
                    Erste Notiz erstellen
                  </button>
                </div>
              );
            }

            return (
              <div className="space-y-1">
                {/* Geteilt mit mir Section */}
                {sharedNotes.length > 0 && (
                  <div className="mb-2">
                    <button
                      onClick={() => setIsSharedFolderOpen(o => !o)}
                      className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-left transition-colors"
                      style={{ background: isSharedFolderOpen ? 'rgba(168, 85, 247, 0.08)' : 'transparent' }}
                    >
                      <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0" style={{ color: T.sec }}>
                        <ChevronRight
                          size={13}
                          className={`transition-transform duration-150 ${isSharedFolderOpen ? 'rotate-90' : ''}`}
                        />
                      </span>
                      {isSharedFolderOpen ? (
                        <FolderOpen size={16} className="text-violet-400 shrink-0" />
                      ) : (
                        <Folder size={16} className="text-violet-400 shrink-0" />
                      )}
                      <span className="text-sm font-semibold flex-1 truncate" style={{ color: T.pri }}>Geteilt mit mir</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200">
                        {sharedNotes.length}
                      </span>
                    </button>
                    {isSharedFolderOpen && (
                      notesViewMode === 'grid' ? (
                        <div className="grid grid-cols-3 min-[480px]:grid-cols-4 gap-2 p-1 mt-1">
                          {sharedNotes.map(f => (
                            f.type === 'folder' ? (
                              <FolderCard
                                key={f.id}
                                folder={f}
                                allFiles={files}
                                onOpen={openNote}
                                activeNoteId={activeNoteId}
                                onContextMenu={f => setContextMenu({ type: 'folder', id: f.id, title: f.title || 'Ordner', parentId: f.parent_id })}
                                onNoteContextMenu={f => setContextMenu({ type: 'note', id: f.id, title: f.title || 'Untitled', parentId: f.parent_id })}
                                onPromptPin={setPinPromptItem}
                              />
                            ) : (
                              <NoteCard
                                key={f.id}
                                file={f}
                                isActive={activeNoteId === f.id}
                                onOpen={() => openNote(f.id, f.title || 'Untitled')}
                                onContextMenu={f => setContextMenu({ type: 'note', id: f.id, title: f.title || 'Untitled', parentId: f.parent_id })}
                              />
                            )
                          ))}
                        </div>
                      ) : (
                        <div className="relative mt-1 ml-3 pl-2.5 border-l border-violet-200/60 dark:border-violet-800/40 space-y-0.5">
                          {sharedNotes.map(f => (
                            f.type === 'folder' ? (
                              <FolderItem
                                key={f.id}
                                folder={f}
                                allFiles={files}
                                onOpen={openNote}
                                activeNoteId={activeNoteId}
                                dragOverId={dragOverFolderId}
                                onDragOver={setDragOverFolderId}
                                onDragLeave={() => setDragOverFolderId(null)}
                                onContextMenu={f => setContextMenu({ type: 'folder', id: f.id, title: f.title || 'Ordner', parentId: f.parent_id })}
                                onNoteContextMenu={f => setContextMenu({ type: 'note', id: f.id, title: f.title || 'Untitled', parentId: f.parent_id })}
                                onNoteDragStart={handleNoteDragStart}
                                isDragging={!!draggingNote}
                                onPromptPin={setPinPromptItem}
                              />
                            ) : (
                              <NoteRow
                                key={f.id}
                                file={f}
                                isActive={activeNoteId === f.id}
                                onOpen={() => openNote(f.id, f.title || 'Untitled')}
                                onDragStart={handleNoteDragStart}
                                onContextMenu={f => setContextMenu({ type: 'note', id: f.id, title: f.title || 'Untitled', parentId: f.parent_id })}
                              />
                            )
                          ))}
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* Zuletzt */}
                {recentFiles.length > 0 && (
                  <div>
                    <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: T.mut }}>Mach weiter wo du aufgehört hast</p>
                    {notesViewMode === 'grid' ? (
                      <div className="grid grid-cols-3 min-[480px]:grid-cols-4 gap-2 p-1">
                        {recentFiles.map(f => (
                          <NoteCard
                            key={f.id}
                            file={f}
                            isActive={activeNoteId === f.id}
                            onOpen={() => openNote(f.id, f.title || 'Untitled')}
                            onContextMenu={f => setContextMenu({ type: 'note', id: f.id, title: f.title || 'Untitled', parentId: f.parent_id })}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        {recentFiles.map(f => (
                          <NoteRow
                            key={f.id}
                            file={f}
                            isActive={activeNoteId === f.id}
                            onOpen={() => openNote(f.id, f.title || 'Untitled')}
                            onDragStart={handleNoteDragStart}
                            onContextMenu={f => setContextMenu({ type: 'note', id: f.id, title: f.title || 'Untitled', parentId: f.parent_id })}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Ordner */}
                {rootFolders.length > 0 && (
                  <div>
                    <p className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: T.mut }}>Ordner</p>
                    {notesViewMode === 'grid' ? (
                      <div className="grid grid-cols-3 min-[480px]:grid-cols-4 gap-2 p-1">
                        {rootFolders.map(folder => (
                          <FolderCard
                            key={folder.id}
                            folder={folder}
                            allFiles={files}
                            onOpen={openNote}
                            activeNoteId={activeNoteId}
                            onContextMenu={f => setContextMenu({ type: 'folder', id: f.id, title: f.title || 'Ordner', parentId: f.parent_id })}
                            onNoteContextMenu={f => setContextMenu({ type: 'note', id: f.id, title: f.title || 'Untitled', parentId: f.parent_id })}
                            onPromptPin={setPinPromptItem}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        {rootFolders.map(folder => (
                          <FolderItem
                            key={folder.id}
                            folder={folder}
                            allFiles={files}
                            onOpen={openNote}
                            activeNoteId={activeNoteId}
                            dragOverId={dragOverFolderId}
                            onDragOver={setDragOverFolderId}
                            onDragLeave={() => setDragOverFolderId(null)}
                            onContextMenu={f => setContextMenu({ type: 'folder', id: f.id, title: f.title || 'Ordner', parentId: f.parent_id })}
                            onNoteContextMenu={f => setContextMenu({ type: 'note', id: f.id, title: f.title || 'Untitled', parentId: f.parent_id })}
                            onNoteDragStart={handleNoteDragStart}
                            isDragging={!!draggingNote}
                            onPromptPin={setPinPromptItem}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Alle Notizen */}
                {rootNotes.length > 0 && (
                  <div>
                    <p className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: T.mut }}>Alle Notizen</p>
                    {notesViewMode === 'grid' ? (
                      <div className="grid grid-cols-3 min-[480px]:grid-cols-4 gap-2 p-1">
                        {rootNotes.map(f => (
                          <NoteCard
                            key={f.id}
                            file={f}
                            isActive={activeNoteId === f.id}
                            onOpen={() => openNote(f.id, f.title || 'Untitled')}
                            onContextMenu={f => setContextMenu({ type: 'note', id: f.id, title: f.title || 'Untitled', parentId: f.parent_id })}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        {rootNotes.map(f => (
                          <NoteRow
                            key={f.id}
                            file={f}
                            isActive={activeNoteId === f.id}
                            onOpen={() => openNote(f.id, f.title || 'Untitled')}
                            onDragStart={handleNoteDragStart}
                            onContextMenu={f => setContextMenu({ type: 'note', id: f.id, title: f.title || 'Untitled', parentId: f.parent_id })}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
      ) : (
      /* ── Todos tab ── */
      <div
        className="mobile-todos-container w-full h-full flex flex-col flex-1 min-h-0 relative max-w-full overflow-hidden bg-[#f8f9fa] dark:bg-[#121212]"
        style={{ paddingBottom: 'max(64px, calc(56px + env(safe-area-inset-bottom)))' }}
      >
        <style>{`
          .mobile-todos-container .sticky.top-0 {
            padding-top: max(8px, calc(env(safe-area-inset-top) + 4px)) !important;
          }
          .mobile-todos-container .max-w-4xl,
          .mobile-todos-container .md\\:max-w-5xl {
            padding-left: 12px !important;
            padding-right: 12px !important;
            padding-top: 12px !important;
            padding-bottom: calc(28px + env(safe-area-inset-bottom)) !important;
            gap: 12px !important;
            max-width: 100% !important;
          }
        `}</style>
        <TodoList className="w-full flex-1 min-h-0" />
      </div>
      )}

      {/* Unified Mobile Create Modal (Termin & To-Do) */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <MobileCreateModal
            isOpen={isCreateModalOpen}
            mode={createModalMode}
            initialDate={newEventDefaultDate || activeDate}
            themes={resolvedThemes}
            onClose={() => setIsCreateModalOpen(false)}
            onSaveEvent={(start, end, meta) => {
              onNewEvent?.(start, end, meta);
            }}
            onSaveTodo={async (taskDraft) => {
              await useDataStore.getState().addTask({
                ...taskDraft,
                isCompleted: false,
              });
            }}
          />
        )}
      </AnimatePresence>

      {/* Quick Mobile New Event Sheet (backwards compatibility) */}
      <AnimatePresence>
        {isNewEventSheetOpen && (
          <MobileNewEventSheet
            initialDate={newEventDefaultDate}
            themes={resolvedThemes}
            onSave={(start, end, meta) => {
              onNewEvent?.(start, end, meta);
            }}
            onDismiss={() => setIsNewEventSheetOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── High-presence Bottom Navigation Bar (Todo Editing Mode) ────────────────── */}
      {editingTodoId ? (
        <div
          className="fixed left-0 right-0 px-4 pb-2 sm:pb-2.5 pt-1.5 flex items-center justify-between z-30 pointer-events-none"
          style={{
            bottom: kbOffset > 0 ? kbOffset : 0,
            paddingBottom: kbOffset > 0 ? 8 : 'max(8px, env(safe-area-inset-bottom))',
          }}
        >
          {/* Central Pill: Abbrechen, Löschen, Fertig */}
          <div className="pointer-events-auto bg-white/85 dark:bg-neutral-900/85 backdrop-blur-md border border-neutral-200/80 dark:border-neutral-800 rounded-full p-1.5 shadow-lg flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setEditingTodoId(null);
                window.dispatchEvent(new CustomEvent('tide:todo-cancel-edit', { detail: { source: 'mobile' } }));
              }}
              className="h-10 px-3.5 flex items-center gap-1.5 rounded-full text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all active:scale-95 shrink-0 cursor-pointer"
              title="Abbrechen"
            >
              <X size={15} />
              <span>Abbrechen</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const idToDelete = editingTodoId;
                setEditingTodoId(null);
                window.dispatchEvent(new CustomEvent('tide:todo-delete', { detail: { id: idToDelete } }));
              }}
              className="w-10 h-10 flex items-center justify-center rounded-full text-rose-500 hover:bg-rose-500/10 transition-all active:scale-95 shrink-0 cursor-pointer"
              title="Löschen"
            >
              <Trash2 size={16} />
            </button>

            <button
              type="button"
              onClick={() => {
                const idToSave = editingTodoId;
                setEditingTodoId(null);
                window.dispatchEvent(new CustomEvent('tide:todo-save-edit', { detail: { id: idToSave } }));
              }}
              className="h-10 px-4 flex items-center gap-1.5 rounded-full text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-sm transition-all active:scale-95 shrink-0 cursor-pointer hover:bg-neutral-800 dark:hover:bg-neutral-100"
              title="Fertig"
            >
              <Check size={15} strokeWidth={2.4} />
              <span>Fertig</span>
            </button>
          </div>

          {/* Right Floating FAB Button */}
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('tide:new-subtask'));
            }}
            aria-label="Unteraufgabe hinzufügen"
            className="pointer-events-auto w-[52px] h-[52px] rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 flex items-center justify-center shadow-lg hover:bg-neutral-800 dark:hover:bg-neutral-100 active:scale-95 transition-all cursor-pointer shrink-0"
            title="Unteraufgabe hinzufügen"
          >
            <Plus size={24} />
          </button>
        </div>
      ) : (
        <>
          <MobileBottomNav
            activeTab={activeTab}
            onTabChange={(tab: MobileTab) => {
              if (tab === activeTab) {
                if (tab === 'calendar') {
                  handleGoToToday();
                } else if (tab === 'todos') {
                  window.dispatchEvent(new CustomEvent('tide:scroll-to-today'));
                }
              } else {
                setActiveTab(tab);
              }
              setIsPlusMenuOpen(false);
            }}
            onTabReclick={(tab: MobileTab) => {
              if (tab === 'calendar') {
                handleGoToToday();
              } else if (tab === 'todos') {
                window.dispatchEvent(new CustomEvent('tide:scroll-to-today'));
              }
            }}
            isSearchOpen={isSearchOpen}
            onToggleSearch={() => {
              if (!isSearchOpen) setSearchQuery('');
              setIsSearchOpen((prev) => !prev);
            }}
            isFilterOpen={isFilterOpen}
            onToggleFilter={() => {
              setIsFilterOpen((prev) => !prev);
            }}
            onFabClick={() => {
              setIsPlusMenuOpen((prev) => !prev);
            }}
            badges={navBadges}
          />
          {isPlusMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsPlusMenuOpen(false)}
              />
              <div
                className="fixed bottom-[84px] right-4 rounded-2xl shadow-xl border p-2 flex flex-col w-[170px] z-50 transition-all origin-bottom-right"
                style={{
                  background: theme === 'dark' ? '#1a1e28' : '#ffffff',
                  borderColor: theme === 'dark' ? '#262b38' : '#f1f2f5',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setIsPlusMenuOpen(false);
                    setCreateModalMode('event');
                    setIsCreateModalOpen(true);
                  }}
                  className="flex items-center gap-3 w-full text-left px-3 py-3 text-[15px] font-semibold rounded-xl transition-colors cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5"
                  style={{ color: theme === 'dark' ? '#f3f4f6' : '#1f2937' }}
                >
                  <CalendarPlus className="w-5 h-5 text-blue-500 shrink-0" />
                  <span>Termin</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsPlusMenuOpen(false);
                    setCreateModalMode('todo');
                    setIsCreateModalOpen(true);
                  }}
                  className="flex items-center gap-3 w-full text-left px-3 py-3 text-[15px] font-semibold rounded-xl transition-colors cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5"
                  style={{ color: theme === 'dark' ? '#f3f4f6' : '#1f2937' }}
                >
                  <CheckSquare className="w-5 h-5 text-green-500 shrink-0" />
                  <span>To-Do</span>
                </button>

                {activeTab === 'notes' && (
                  <>
                    <div
                      className="h-[1px] my-1"
                      style={{ background: theme === 'dark' ? '#262b38' : '#f3f4f6' }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        onNewNote();
                        setIsEditingNote(true);
                        setIsPlusMenuOpen(false);
                      }}
                      className="flex items-center gap-3 w-full text-left px-3 py-2 text-[14px] font-medium rounded-xl transition-colors cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5"
                      style={{ color: theme === 'dark' ? '#9ca3af' : '#4b5563' }}
                    >
                      <PenLine size={16} className="text-purple-500 shrink-0" />
                      <span>Notiz</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onNewFolder?.();
                        setIsPlusMenuOpen(false);
                      }}
                      className="flex items-center gap-3 w-full text-left px-3 py-2 text-[14px] font-medium rounded-xl transition-colors cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5"
                      style={{ color: theme === 'dark' ? '#9ca3af' : '#4b5563' }}
                    >
                      <FolderPlus size={16} className="text-purple-500 shrink-0" />
                      <span>Ordner</span>
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}

      {pinPromptItem && (
        <PinPromptModal
          isOpen={!!pinPromptItem}
          onClose={() => setPinPromptItem(null)}
          item={pinPromptItem}
          userEmail={userProfile?.email}
          onUnlock={() => {
            pinPromptItem.onUnlocked?.();
            setPinPromptItem(null);
          }}
        />
      )}

      <MoodPopup />
    </div>
  );
}
