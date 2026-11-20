"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { isSameDay, format, startOfWeek, addDays } from 'date-fns';
import { useDataStore, useWeekStartsOn } from '@/store/useDataStore';
import { isItemUnlocked, ItemSecuritySettings } from '@/lib/pinSecurity';
import { MoodPopup } from '@/components/Surveys/MoodPopup';
import MobileTodoView from '../Todo/MobileTodoView';
import { MobileTodoStyleProvider } from '../Todo/MobileTodoStyle';
import { T } from './mobile/mobileTheme';
import { expandMobileEvents, type CalendarEvent } from './mobile/expandMobileEvents';
import type { MobileTab } from './mobile/MobileBottomNav';
import type { PinPromptTarget, MobileListItem } from './mobile/MobileNoteListItems';
import type { PriorityOption, StatusOption, DateFilterOption } from './mobile/MobileFilterPopover';
import type { SearchEventItem, SearchTodoItem, SearchNoteItem } from './mobile/MobileSearchOverlay';
import type { MobileContextMenuTarget } from './mobile/MobileBottomSheets';
import { MobileTopHeader, type MobileCalViewMode } from './mobile/MobileTopHeader';
import { MobileSidebarDrawer } from './mobile/MobileSidebarDrawer';
import { MobileCalendarTab } from './mobile/MobileCalendarTab';
import { MobileNotesTab, type MobileNoteItem } from './mobile/MobileNotesTab';
import { MobileBottomDock } from './mobile/MobileBottomDock';
import { MobileOverlaysAndModals, type MobileOverlayEvent, type MobileThemeItem, type NewEventMeta } from './mobile/MobileOverlaysAndModals';

export interface MobileLayoutProps {
  events: CalendarEvent[];
  files: MobileNoteItem[];
  folders: MobileNoteItem[];
  onNoteSelect: (id: string, title: string) => void;
  onNewNote: (title?: string) => void;
  onDeleteNote?: (id: string) => void;
  onNewFolder?: () => void;
  onNewFolderIn?: (parentId: string) => void;
  onNoteRename?: (id: string, title: string) => void;
  editorElement: React.ReactNode;
  activeNoteId: string | null;
  activeNoteTitle: string;
  onNewEvent?: (date: Date, endDate?: Date, meta?: NewEventMeta) => void;
  onEventClick?: (id: string) => void;
  onEventUpdate?: (id: string, newStart: Date, newEnd: Date, meta?: { title?: string; color?: string; description?: string }) => void;
  onEventSave?: (id: string, updates: Record<string, unknown>) => void;
  onEventDelete?: (id: string) => void;
  onTaskComplete?: (id: string, completed: boolean) => void;
  socialHubElement?: React.ReactNode;
  userProfile?: { username: string; email: string; displayName?: string; name?: string; avatar_seed?: string; avatar_salt?: string; bio?: string; title?: string; id?: string; user_id?: string } | null;
  themes?: MobileThemeItem[];
}

type WindowWithNoteCache = Window & { __mobileNoteCache?: Record<string, string> };

export default function MobileLayout({
  events, files, folders, onNoteSelect, onNewNote, onDeleteNote, onNewFolder, onNewFolderIn, onNoteRename,
  editorElement, activeNoteId, activeNoteTitle, onNewEvent, onEventClick, onEventUpdate, onEventSave,
  onEventDelete, onTaskComplete, userProfile, themes,
}: MobileLayoutProps) {
  const weekStartsOn = useWeekStartsOn();
  const tasks = useDataStore((s) => s.tasks);
  const enabledExtensions = useDataStore((s) => s.enabledExtensions);
  const setSettingsOpen = useDataStore((s) => s.setSettingsModalOpen);
  const theme = useDataStore((s) => s.theme);

  const [ui, setUi] = useState({ sidebar: false, search: false, editingNote: false, exams: false, surveys: false, newEventSheet: false });
  const [isSharedFolderOpen, setIsSharedFolderOpen] = useState(true);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const [activeDate, setActiveDate] = useState(() => new Date());
  const [now, setNow] = useState(() => new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<MobileOverlayEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<MobileOverlayEvent | null>(null);
  const [contextMenu, setContextMenu] = useState<MobileContextMenuTarget | null>(null);
  const [renameState, setRenameState] = useState<{ id: string | null; value: string }>({ id: null, value: '' });
  const [calViewMode, setCalViewMode] = useState<MobileCalViewMode>('day');
  const [activeTab, setActiveTab] = useState<MobileTab>('calendar');
  const [dayViewDays, setDayViewDays] = useState<Date[]>([]);
  const [createModal, setCreateModal] = useState<{ open: boolean; mode: 'event' | 'todo'; date: Date }>({ open: false, mode: 'event', date: new Date() });
  const [pinPromptItem, setPinPromptItem] = useState<PinPromptTarget | null>(null);
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [filterState, setFilterState] = useState<{
    open: boolean; priority: PriorityOption | null; status: StatusOption | string | null; date: DateFilterOption; tag: string | null;
  }>({ open: false, priority: null, status: null, date: 'all', tag: null });
  const [draggingNote, setDraggingNote] = useState<{ id: string; title: string } | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const dragGhostPos = useRef({ x: 0, y: 0 });
  const [notesViewMode, setNotesViewMode] = useState<'list' | 'grid'>(() => {
    try { return typeof window !== 'undefined' && localStorage.getItem('tide_notes_view') === 'list' ? 'list' : 'grid'; }
    catch { return 'grid'; }
  });

  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(id); }, []);
  useEffect(() => { document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0F172A' : '#FFFFFF'); }, [theme]);
  useEffect(() => { if (activeNoteId) setUi((p) => (p.editingNote ? p : { ...p, editingNote: true })); }, [activeNoteId]);

  useEffect(() => {
    const isMobileVisible = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
    if (!isMobileVisible()) setEditingTodoId(null);
    else if (activeTab !== 'todos') {
      setEditingTodoId((prev) => { if (prev) window.dispatchEvent(new CustomEvent('tide:todo-cancel-edit', { detail: { source: 'mobile' } })); return null; });
    }
    const onStart = (e: Event) => {
      const d = (e as CustomEvent<{ id?: string; source?: string; isDesktop?: boolean }>).detail;
      if (!isMobileVisible() || d?.source === 'desktop' || d?.isDesktop || activeTab !== 'todos') return;
      setEditingTodoId(d?.id || 'active');
    };
    const onEnd = (e: Event) => {
      const d = (e as CustomEvent<{ source?: string; isDesktop?: boolean }>).detail;
      if (!isMobileVisible() || d?.source === 'desktop' || d?.isDesktop) return;
      setEditingTodoId(null);
    };
    window.addEventListener('tide:todo-editing-start', onStart);
    window.addEventListener('tide:todo-editing-end', onEnd);
    return () => { window.removeEventListener('tide:todo-editing-start', onStart); window.removeEventListener('tide:todo-editing-end', onEnd); };
  }, [activeTab]);

  useEffect(() => {
    const onPromptPin = (e: Event) => {
      const d = (e as CustomEvent<PinPromptTarget>).detail;
      if (!d?.id) return;
      setPinPromptItem({ ...d, onUnlocked: () => { if (d.onUnlocked) d.onUnlocked(); else if (d.type === 'folder') useDataStore.getState().toggleFolder(d.id, true); } });
    };
    window.addEventListener('tide:prompt-pin', onPromptPin);
    return () => window.removeEventListener('tide:prompt-pin', onPromptPin);
  }, []);

  useEffect(() => {
    if (!ui.search) return;
    const win = window as WindowWithNoteCache;
    if (!win.__mobileNoteCache) win.__mobileNoteCache = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('tide_search_')) {
          const id = key.slice('tide_search_'.length);
          if (!win.__mobileNoteCache[id]) win.__mobileNoteCache[id] = localStorage.getItem(key) || '';
        }
      }
    } catch { /* ignore private mode or quota errors */ }
  }, [ui.search]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (ui.search || ui.editingNote || ui.sidebar || activeTab === 'notes') return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
      setSearchQuery(e.key);
      setUi((p) => ({ ...p, search: true }));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ui.search, ui.editingNote, ui.sidebar, activeTab]);

  const resolvedThemes = useMemo<MobileThemeItem[]>(() => {
    if (themes && themes.length > 0) return themes;
    return (files || []).filter((f) => f.type === 'folder' && Boolean(f.isGroup)).map((g) => ({
      id: g.id, title: g.title || 'Gruppe', color: g.color, effect: typeof g.effect === 'string' ? g.effect : undefined,
    }));
  }, [themes, files]);

  const expandedEvents = useMemo(
    () => expandMobileEvents(events, activeDate, resolvedThemes),
    [events, activeDate, resolvedThemes]
  );

  useEffect(() => {
    const onEditEvent = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      const target = expandedEvents.find((ev) => ev.id === id) || events.find((ev) => ev.id === id);
      if (target) { setSelectedEvent(null); setEditingEvent(target); }
    };
    window.addEventListener('mobile_edit_event', onEditEvent);
    return () => window.removeEventListener('mobile_edit_event', onEditEvent);
  }, [expandedEvents, events]);

  const openNote = useCallback((id: string, title: string) => {
    const note = useDataStore.getState().notes.find((n) => n.id === id) || files.find((f) => f?.id === id);
    const meta = note?.metadata as { has_custom_password?: boolean; security_settings?: ItemSecuritySettings } | undefined;
    const locked = Boolean(note?.has_pin || note?.is_locked || meta?.has_custom_password || meta?.security_settings?.has_custom_password || (typeof title === 'string' && title.startsWith('#')));
    const finishOpen = () => { setUi((p) => ({ ...p, sidebar: false, search: false, editingNote: true })); onNoteSelect(id, title); };
    if (locked && !isItemUnlocked(id, (meta?.security_settings || meta) as ItemSecuritySettings | null | undefined)) {
      setPinPromptItem({ id, title, type: 'note', metadata: meta, onUnlocked: finishOpen });
      return;
    }
    finishOpen();
  }, [files, onNoteSelect]);

  useEffect(() => {
    const onOpen = (e: Event) => { const d = (e as CustomEvent<{ id: string; title: string }>).detail; openNote(d.id, d.title); };
    const onFolder = () => onNewFolder?.();
    window.addEventListener('mobile_open_note', onOpen);
    window.addEventListener('mobile_new_folder', onFolder);
    return () => { window.removeEventListener('mobile_open_note', onOpen); window.removeEventListener('mobile_new_folder', onFolder); };
  }, [openNote, onNewFolder]);

  const handleGoToToday = useCallback(() => {
    const today = new Date();
    setActiveDate(today);
    setDayViewDays((prev) => prev.some((d) => isSameDay(d, today)) ? prev : Array.from({ length: 30 }, (_, i) => addDays(startOfWeek(today, { weekStartsOn }), i)));
    setTimeout(() => document.getElementById(`day-${format(today, 'yyyy-MM-dd')}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }, [weekStartsOn]);

  const handleNoteDragStart = useCallback((file: MobileListItem, e: React.TouchEvent) => {
    setDraggingNote({ id: file.id, title: file.title || 'Untitled' });
    dragGhostPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    const onMove = (ev: TouchEvent) => {
      dragGhostPos.current = { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
      const folderEl = document.elementFromPoint(ev.touches[0].clientX, ev.touches[0].clientY)?.closest('[data-folder-id]');
      setDragOverFolderId(folderEl ? folderEl.getAttribute('data-folder-id') : null);
    };
    const onEnd = () => {
      document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onEnd);
      setDragOverFolderId((prev) => { if (prev) window.dispatchEvent(new CustomEvent('mobile_move_to_folder', { detail: { noteId: file.id, folderId: prev } })); return null; });
      setDraggingNote(null);
    };
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd);
  }, []);

  const displayName = useMemo(() => {
    const stored = typeof window !== 'undefined' ? (localStorage.getItem('tide_user_name') || sessionStorage.getItem('tide_user_name')) : null;
    const prefix = (userProfile?.email || '').split('@')[0];
    const validUser = userProfile?.username && userProfile.username !== prefix ? userProfile.username : null;
    return userProfile?.displayName || userProfile?.name || validUser || stored || userProfile?.username || prefix || '';
  }, [userProfile]);

  const { searchEvents, searchTodos, searchNotes, allTags, navBadges } = useMemo(() => {
    const cache = typeof window !== 'undefined' ? ((window as WindowWithNoteCache).__mobileNoteCache ?? {}) : {};
    const tagSet = new Set<string>();
    const today = new Date();
    const sEvents: SearchEventItem[] = (expandedEvents || []).map((e) => ({
      id: e.id, title: e.title || 'Termin', start: e.start, end: e.end, dotColor: e.color,
      tag: (e as CalendarEvent & { tag?: string; category?: string }).tag || (e as CalendarEvent & { category?: string }).category,
    }));
    const sTodos: SearchTodoItem[] = (tasks || []).map((t) => {
      t.tags?.forEach((tag) => tagSet.add(tag));
      return { id: t.id, title: t.title || 'Aufgabe', completed: t.isCompleted, isCompleted: t.isCompleted, priority: t.priority, tag: t.folder || t.tags?.[0] };
    });
    const sNotes: SearchNoteItem[] = (files || []).filter((f) => {
      if (Array.isArray(f.tags)) f.tags.forEach((tag) => { if (typeof tag === 'string') tagSet.add(tag); });
      return f.type !== 'folder';
    }).map((f) => ({
      id: f.id, title: f.title || 'Notiz', preview: cache[f.id] || (typeof f.preview === 'string' ? f.preview : ''),
      tag: typeof f.folder_name === 'string' ? f.folder_name : (Array.isArray(f.tags) ? String(f.tags[0] ?? '') : undefined),
      updatedAt: f.updated_at || f.updatedAt,
    }));
    const openTodos = (tasks || []).filter((t) => !t.isCompleted && Boolean(t.dueDate || t.scheduledDate) && (() => { try { return isSameDay(new Date((t.dueDate || t.scheduledDate)!), today); } catch { return false; } })()).length;
    const todayEvts = (expandedEvents || []).filter((e) => { try { return isSameDay(new Date(e.start), today); } catch { return false; } }).length;
    return {
      searchEvents: sEvents, searchTodos: sTodos, searchNotes: sNotes, allTags: Array.from(tagSet),
      navBadges: { calendar: todayEvts > 0 ? todayEvts : undefined, todos: openTodos > 0 ? openTodos : undefined },
    };
  }, [expandedEvents, tasks, files]);

  const dispatchTodoAction = (eventName: string, detail?: Record<string, unknown>) => {
    setEditingTodoId(null);
    window.dispatchEvent(new CustomEvent(eventName, detail ? { detail } : undefined));
  };

  return (
    <div className="flex md:hidden flex-col h-[100dvh] w-full relative overflow-hidden" style={{ background: T.bg }}>
      <MobileSidebarDrawer
        isOpen={ui.sidebar} onClose={() => setUi((p) => ({ ...p, sidebar: false }))} files={files} folders={folders}
        activeNoteId={activeNoteId} onNoteSelect={openNote} onNewNote={() => { onNewNote(); setUi((p) => ({ ...p, editingNote: true })); }}
        onNewFolder={onNewFolder} onOpenExams={() => setUi((p) => ({ ...p, exams: true }))}
        onOpenSurveys={() => setUi((p) => ({ ...p, surveys: true }))} onOpenSettings={() => setSettingsOpen(true)}
        draggingNote={draggingNote} dragGhostPos={dragGhostPos} dragOverFolderId={dragOverFolderId}
        onDragOverFolder={setDragOverFolderId} onNoteDragStart={handleNoteDragStart}
        onContextMenu={setContextMenu} onPromptPin={setPinPromptItem} enabledExtensions={enabledExtensions}
      />
      <MobileTopHeader
        displayName={displayName} calViewMode={calViewMode} setCalViewMode={setCalViewMode} activeDate={activeDate}
        setActiveDate={setActiveDate} onGoToToday={handleGoToToday} activeTab={activeTab} theme={theme}
        now={now} weekStartsOn={weekStartsOn} setDayViewDays={setDayViewDays}
      />
      {activeTab === 'calendar' ? (
        <MobileCalendarTab
          activeDate={activeDate} setActiveDate={setActiveDate} calViewMode={calViewMode} expandedEvents={expandedEvents}
          theme={theme} now={now} weekStartsOn={weekStartsOn} dayViewDays={dayViewDays} setDayViewDays={setDayViewDays}
          onSelectEvent={setSelectedEvent} onEditEvent={(ev) => { setSelectedEvent(null); setEditingEvent(ev); }}
          onNewEvent={(date, endDate, meta) => onNewEvent?.(date, endDate, meta)}
          onCreateEvent={(date) => setCreateModal({ open: true, mode: 'event', date })} onEventClick={onEventClick}
          onEventUpdate={onEventUpdate} onEventDelete={onEventDelete} onTaskComplete={onTaskComplete} onTodayClick={handleGoToToday}
        />
      ) : null}
      {activeTab === 'notes' ? (
        <MobileNotesTab
          files={files} folders={folders} activeNoteId={activeNoteId} onNoteSelect={openNote} onOpenNote={openNote}
          onNewNote={onNewNote} onNewFolder={onNewFolder} onStartEditing={() => setUi((p) => ({ ...p, editingNote: true }))}
          searchQuery={searchQuery} notesViewMode={notesViewMode} setNotesViewMode={setNotesViewMode}
          isSharedFolderOpen={isSharedFolderOpen} setIsSharedFolderOpen={setIsSharedFolderOpen} dragOverFolderId={dragOverFolderId}
          setDragOverFolderId={setDragOverFolderId} draggingNote={draggingNote} handleNoteDragStart={handleNoteDragStart}
          setContextMenu={setContextMenu} onPromptPin={setPinPromptItem}
        />
      ) : null}
      {activeTab === 'todos' ? (
        <div
          className="mobile-todos-container w-full h-full flex flex-col flex-1 min-h-0 relative max-w-full overflow-hidden bg-[#f8f9fa] dark:bg-[#121212]"
          style={{ paddingBottom: 'max(64px, calc(56px + env(safe-area-inset-bottom)))' }}
        >
          <style>{`.mobile-todos-container .sticky.top-0{padding-top:max(8px,calc(env(safe-area-inset-top) + 4px))!important}.mobile-todos-container .max-w-4xl,.mobile-todos-container .md\\:max-w-5xl{padding:12px 12px calc(28px + env(safe-area-inset-bottom)) 12px!important;gap:12px!important;max-width:100%!important}`}</style>
          <MobileTodoStyleProvider><MobileTodoView /></MobileTodoStyleProvider>
        </div>
      ) : null}
      <MobileBottomDock
        activeTab={activeTab} setActiveTab={setActiveTab} navBadges={navBadges} editingTodoId={editingTodoId}
        onCancelEditTodo={() => dispatchTodoAction('tide:todo-cancel-edit', { source: 'mobile' })}
        onDeleteEditTodo={(id) => dispatchTodoAction('tide:todo-delete', { id })}
        onDoneEditTodo={(id) => dispatchTodoAction('tide:todo-save-edit', { id })}
        onAddSubtask={() => window.dispatchEvent(new CustomEvent('tide:new-subtask'))}
        isPlusMenuOpen={isPlusMenuOpen} setIsPlusMenuOpen={setIsPlusMenuOpen}
        onNewEvent={() => setCreateModal((p) => ({ ...p, open: true, mode: 'event' }))}
        onNewTodo={() => setCreateModal((p) => ({ ...p, open: true, mode: 'todo' }))}
        onNewNote={() => { onNewNote(); setUi((p) => ({ ...p, editingNote: true })); }} onNewFolder={onNewFolder}
        onMoreClick={() => setUi((p) => ({ ...p, sidebar: true }))} onGoToToday={handleGoToToday}
      />
      <MobileOverlaysAndModals
        isEditingNote={ui.editingNote} activeNoteId={activeNoteId} activeNoteTitle={activeNoteTitle} editorElement={editorElement}
        onCloseEditor={() => { setUi((p) => ({ ...p, editingNote: false })); onNoteSelect?.('', ''); }} onNoteRename={onNoteRename}
        isExamsOpen={ui.exams} onCloseExams={() => setUi((p) => ({ ...p, exams: false }))} isSurveysOpen={ui.surveys}
        onCloseSurveys={() => setUi((p) => ({ ...p, surveys: false }))} isSearchOpen={ui.search}
        onCloseSearch={() => setUi((p) => ({ ...p, search: false }))} searchQuery={searchQuery} onSearchQueryChange={setSearchQuery}
        searchEvents={searchEvents} searchTodos={searchTodos} searchNotes={searchNotes} expandedEvents={expandedEvents}
        onSwitchToTodos={() => setActiveTab('todos')} onOpenNote={openNote} isFilterOpen={filterState.open}
        onCloseFilter={() => setFilterState((p) => ({ ...p, open: false }))} selectedPriority={filterState.priority}
        onPriorityChange={(priority) => setFilterState((p) => ({ ...p, priority }))} selectedStatus={filterState.status}
        onStatusChange={(status) => setFilterState((p) => ({ ...p, status }))} dateFilter={filterState.date}
        onDateFilterChange={(date) => setFilterState((p) => ({ ...p, date }))} allTags={allTags} selectedTag={filterState.tag}
        onTagChange={(tag) => setFilterState((p) => ({ ...p, tag }))} selectedEvent={selectedEvent} onSelectEvent={setSelectedEvent}
        editingEvent={editingEvent} onEditEvent={setEditingEvent} now={now} resolvedThemes={resolvedThemes}
        onEventDelete={onEventDelete} onEventSave={onEventSave} onEventUpdate={onEventUpdate} onTaskComplete={onTaskComplete}
        contextMenu={contextMenu} onCloseContextMenu={() => setContextMenu(null)} onNewNote={onNewNote}
        onStartEditingNote={() => setUi((p) => ({ ...p, editingNote: true }))} onNewFolderIn={onNewFolderIn}
        onStartRename={(id, value) => setRenameState({ id, value })} onDeleteNote={onDeleteNote} renamingId={renameState.id}
        renameValue={renameState.value} onRenameValueChange={(value) => setRenameState((p) => ({ ...p, value }))}
        onCloseRename={() => setRenameState((p) => ({ ...p, id: null }))} isCreateModalOpen={createModal.open}
        createModalMode={createModal.mode} newEventDefaultDate={createModal.date} activeDate={activeDate}
        onCloseCreateModal={() => setCreateModal((p) => ({ ...p, open: false }))} isNewEventSheetOpen={ui.newEventSheet}
        onCloseNewEventSheet={() => setUi((p) => ({ ...p, newEventSheet: false }))} onNewEvent={onNewEvent}
        pinPromptItem={pinPromptItem} userEmail={userProfile?.email} onClosePinPrompt={() => setPinPromptItem(null)}
      />
      <MoodPopup />
    </div>
  );
}
