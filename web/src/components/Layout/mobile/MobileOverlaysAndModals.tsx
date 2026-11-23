"use client";

import { isRecurringEvent } from '@/lib/recurrence';
import React, { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import PinPromptModal from '@/components/Security/PinPromptModal';
import { T } from './mobileTheme';
import type { PinPromptTarget } from './MobileNoteListItems';
import {
  OverlayShell,
  EventSheet,
  MobileNewEventSheet,
  MobileEditEventSheet,
  MobileContextMenuSheet,
  MobileRenameModal,
  type MobileContextMenuTarget,
  type MobileEditEventSheetProps,
} from './MobileBottomSheets';
import { MobileCreateModal } from './MobileCreateModal';
import { draftNewEventMeta, isDraftEvent } from './quickEditState';
import {
  MobileFilterPopover,
  type PriorityOption,
  type StatusOption,
  type DateFilterOption,
} from './MobileFilterPopover';
import {
  MobileSearchOverlay,
  type SearchEventItem,
  type SearchTodoItem,
  type SearchNoteItem,
} from './MobileSearchOverlay';

export type RecurrenceFreq = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface MobileEventMeta {
  title: string;
  color: string;
  description?: string;
  parent_id?: string | null;
  groupIds?: string[];
  recurrence?: RecurrenceFreq;
  recurrence_rule?: string;
  recurrence_end?: string;
}

/** Meta accepted by the mobile new-event path (`onNewEvent`). */
export type NewEventMeta = Partial<MobileEventMeta>;

export type MobileOverlayEvent = MobileEditEventSheetProps['event'];

export interface MobileThemeItem {
  id: string;
  title: string;
  color?: string;
  effect?: string;
}

const LoadingOverlay = () => (
  <div className="flex-1 flex items-center justify-center p-8 text-sm" style={{ color: 'var(--muted-text)' }}>
    Lade…
  </div>
);

const JobPlanner = dynamic(() => import('../../JobPlanner/JobPlanner'), { loading: LoadingOverlay });
const SurveyAnalytics = dynamic(() => import('@/components/Surveys/SurveyAnalytics'), { loading: LoadingOverlay });

export interface MobileOverlaysAndModalsProps {
  isEditingNote: boolean;
  activeNoteId: string | null;
  activeNoteTitle: string;
  editorElement?: React.ReactNode;
  onCloseEditor: () => void;
  onNoteRename?: (id: string, title: string) => void;
  isExamsOpen: boolean;
  onCloseExams: () => void;
  isSurveysOpen: boolean;
  onCloseSurveys: () => void;
  isSearchOpen: boolean;
  onCloseSearch: () => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  searchEvents: SearchEventItem[];
  searchTodos: SearchTodoItem[];
  searchNotes: SearchNoteItem[];
  expandedEvents: MobileOverlayEvent[];
  onSwitchToTodos: () => void;
  onOpenNote: (id: string, title: string) => void;
  isFilterOpen: boolean;
  onCloseFilter: () => void;
  selectedPriority: PriorityOption | null;
  onPriorityChange: (priority: PriorityOption | null) => void;
  selectedStatus: StatusOption | string | null;
  onStatusChange: (status: StatusOption | string | null) => void;
  dateFilter: DateFilterOption;
  onDateFilterChange: (date: DateFilterOption) => void;
  allTags: string[];
  selectedTag: string | null;
  onTagChange: (tag: string | null) => void;
  selectedEvent: MobileOverlayEvent | null;
  onSelectEvent: (event: MobileOverlayEvent | null) => void;
  editingEvent: MobileOverlayEvent | null;
  onEditEvent: (event: MobileOverlayEvent | null) => void;
  now: Date;
  resolvedThemes: MobileThemeItem[];
  onEventDelete?: (id: string) => void;
  onEventSave?: (id: string, updates: Record<string, unknown>) => void;
  onEventUpdate?: (id: string, newStart: Date, newEnd: Date, meta?: MobileEventMeta) => void;
  onTaskComplete?: (id: string, completed: boolean) => void;
  contextMenu: MobileContextMenuTarget | null;
  onCloseContextMenu: () => void;
  onNewNote: () => void;
  onStartEditingNote: () => void;
  onNewFolderIn?: (parentId: string) => void;
  onStartRename: (id: string, title: string) => void;
  onDeleteNote?: (id: string) => void;
  renamingId: string | null;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onCloseRename: () => void;
  isCreateModalOpen: boolean;
  createModalMode: 'event' | 'todo';
  newEventDefaultDate: Date;
  activeDate: Date;
  onCloseCreateModal: () => void;
  isNewEventSheetOpen: boolean;
  onCloseNewEventSheet: () => void;
  onNewEvent?: (date: Date, endDate?: Date, meta?: NewEventMeta) => void;
  pinPromptItem: PinPromptTarget | null;
  userEmail?: string;
  onClosePinPrompt: () => void;
}

export const MobileOverlaysAndModals: React.FC<MobileOverlaysAndModalsProps> = (props) => {
  const {
    isEditingNote, activeNoteId, activeNoteTitle, editorElement, onCloseEditor, onNoteRename,
    isExamsOpen, onCloseExams, isSurveysOpen, onCloseSurveys,
    isSearchOpen, onCloseSearch, searchQuery, onSearchQueryChange,
    searchEvents, searchTodos, searchNotes, expandedEvents, onSwitchToTodos, onOpenNote,
    isFilterOpen, onCloseFilter, selectedPriority, onPriorityChange,
    selectedStatus, onStatusChange, dateFilter, onDateFilterChange, allTags, selectedTag, onTagChange,
    selectedEvent, onSelectEvent, editingEvent, onEditEvent, now, resolvedThemes,
    onEventDelete, onEventSave, onEventUpdate, onTaskComplete,
    contextMenu, onCloseContextMenu, onNewNote, onStartEditingNote, onNewFolderIn, onStartRename, onDeleteNote,
    renamingId, renameValue, onRenameValueChange, onCloseRename,
    isCreateModalOpen, createModalMode, newEventDefaultDate, activeDate, onCloseCreateModal,
    isNewEventSheetOpen, onCloseNewEventSheet, onNewEvent,
    pinPromptItem, userEmail, onClosePinPrompt,
  } = props;

  // Latest open sheet; the closing sheet keeps an old `onSave` closure during its exit animation.
  const editingRef = useRef(editingEvent);
  useEffect(() => { editingRef.current = editingEvent; }, [editingEvent]);

  const handleSaveEditedEvent = (id: string, start: Date, end: Date, meta: MobileEventMeta) => {
    if (!editingRef.current) return; // already saved or closed
    // A draft (double tap in the day view) is created on save, never updated or renamed.
    if (isDraftEvent({ id })) {
      onNewEvent?.(start, end, draftNewEventMeta(meta));
      onEditEvent(null);
      return;
    }
    const payload = {
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
    };
    if (onEventSave) {
      onEventSave(id, payload);
    } else if (onEventUpdate) {
      onEventUpdate(id, start, end, meta);
    }
    if (meta.title && editingEvent && meta.title !== editingEvent.title && onNoteRename) {
      onNoteRename(id, meta.title);
    }
    // Repeating events are updated by `handleEventSave` itself (it asks whether one occurrence or the series
    // changes); writing the payload onto the series here would move every repetition.
    const baseId = id.includes('_') ? id.split('_')[0] : id;
    const target = useDataStore.getState().events.find((e) => e.id === baseId);
    if (!target || !isRecurringEvent(target as { recurrence_rule?: string; recurrence?: string })) {
      useDataStore.setState((s) => ({
        events: s.events.map((e) => (e.id === id ? { ...e, ...payload } : e)),
      }));
    }
    onEditEvent(null);
  };

  return (
    <>
      <AnimatePresence>
        {(isEditingNote || Boolean(activeNoteId)) && editorElement && (
          <motion.div
            key="editor"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-50 flex flex-col overflow-hidden"
            style={{ background: T.bg }}
          >
            <div
              className="flex items-center gap-3 px-4 shrink-0"
              style={{
                paddingTop: 'max(52px, calc(env(safe-area-inset-top) + 10px))',
                paddingBottom: 10,
                borderBottom: `1px solid ${T.brd}`,
              }}
            >
              <button
                onClick={onCloseEditor}
                className="p-2 rounded-full transition-colors active:opacity-70"
                style={{ background: T.hov }}
                aria-label="Zurück"
              >
                <ArrowLeft size={18} style={{ color: T.accent }} />
              </button>
              <input
                className="flex-1 bg-transparent outline-none font-bold text-base truncate"
                style={{ color: T.pri }}
                value={activeNoteTitle || ''}
                onChange={(e) => {
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

        {isExamsOpen && (
          <OverlayShell key="job_planner" title="Job & Uni" onBack={onCloseExams}>
            <div className="flex-1 overflow-y-auto"><JobPlanner /></div>
          </OverlayShell>
        )}

        {isSurveysOpen && (
          <OverlayShell key="surveys" title="Umfragen & Mood" onBack={onCloseSurveys}>
            <div className="flex-1 overflow-y-auto"><SurveyAnalytics /></div>
          </OverlayShell>
        )}

        {selectedEvent && (
          <EventSheet
            key={`evsheet-${selectedEvent.id}`}
            event={selectedEvent}
            now={now}
            onDelete={() => { onEventDelete?.(selectedEvent.id); onSelectEvent(null); }}
            onEdit={() => { onEditEvent(selectedEvent); onSelectEvent(null); }}
            onTaskComplete={onTaskComplete}
            onToggleComplete={() => {
              const nextCompleted = !selectedEvent.is_completed;
              if (selectedEvent.linkedTaskId) {
                useDataStore.getState().toggleTask(selectedEvent.linkedTaskId);
              }
              onTaskComplete?.(selectedEvent.id, nextCompleted);
              onSelectEvent({ ...selectedEvent, is_completed: nextCompleted });
            }}
            onDismiss={() => onSelectEvent(null)}
          />
        )}

        {editingEvent && (
          <MobileEditEventSheet
            key={`edit-${editingEvent.id}`}
            event={editingEvent}
            themes={resolvedThemes}
            onDelete={isDraftEvent(editingEvent) ? undefined : (id) => onEventDelete?.(id)}
            onSave={handleSaveEditedEvent}
            onDismiss={() => onEditEvent(null)}
          />
        )}

        {contextMenu && (
          <MobileContextMenuSheet
            contextMenu={contextMenu}
            onClose={onCloseContextMenu}
            onOpenNote={(id, title) => onOpenNote(id, title)}
            onNewNoteInFolder={(folderId) => {
              window.dispatchEvent(new CustomEvent('mobile_set_parent', { detail: { parentId: folderId } }));
              setTimeout(() => { onNewNote(); onStartEditingNote(); }, 0);
            }}
            onNewFolderInFolder={(folderId) => onNewFolderIn?.(folderId)}
            onRename={(id, title) => onStartRename(id, title)}
            onShare={(id, title) => {
              window.dispatchEvent(new CustomEvent('mobile_share_file', { detail: { id, title } }));
            }}
            onDelete={(id) => onDeleteNote?.(id)}
          />
        )}

        {renamingId && (
          <MobileRenameModal
            id={renamingId}
            value={renameValue}
            onChange={onRenameValueChange}
            onSave={(id, newTitle) => onNoteRename?.(id, newTitle)}
            onClose={onCloseRename}
          />
        )}
      </AnimatePresence>

      <MobileSearchOverlay
        isOpen={isSearchOpen}
        onClose={onCloseSearch}
        query={searchQuery}
        onQueryChange={onSearchQueryChange}
        events={searchEvents}
        todos={searchTodos}
        notes={searchNotes}
        onSelectEvent={(evItem) => {
          const found = expandedEvents.find((e) => e.id === evItem.id);
          if (found) onSelectEvent(found);
          onCloseSearch();
        }}
        onSelectTodo={(todoItem) => {
          onSwitchToTodos();
          onCloseSearch();
          window.dispatchEvent(new CustomEvent('tide:select-todo', { detail: { id: todoItem.id } }));
        }}
        onSelectNote={(noteItem) => { onOpenNote(noteItem.id, noteItem.title); onCloseSearch(); }}
        onToggleTodo={async (id) => { await useDataStore.getState().toggleTask(id); }}
      />

      <MobileFilterPopover
        isOpen={isFilterOpen}
        onClose={onCloseFilter}
        selectedPriority={selectedPriority}
        onPriorityChange={(priority) => {
          onPriorityChange(priority);
          window.dispatchEvent(new CustomEvent('tide:filter-priority', { detail: { priority } }));
        }}
        selectedStatus={selectedStatus}
        onStatusChange={(status) => {
          onStatusChange(status);
          window.dispatchEvent(new CustomEvent('tide:filter-status', { detail: { status } }));
        }}
        dateFilter={dateFilter}
        onDateFilterChange={(date) => {
          onDateFilterChange(date);
          window.dispatchEvent(new CustomEvent('tide:filter-date', { detail: { date } }));
        }}
        tags={allTags}
        selectedTag={selectedTag}
        onTagChange={(tag) => {
          onTagChange(tag);
          window.dispatchEvent(new CustomEvent('tide:filter-tag', { detail: { tag } }));
        }}
        onResetFilters={() => {
          onPriorityChange(null);
          onStatusChange(null);
          onDateFilterChange('all');
          onTagChange(null);
          window.dispatchEvent(new CustomEvent('tide:filter-reset'));
        }}
      />

      <AnimatePresence>
        {isCreateModalOpen && (
          <MobileCreateModal
            isOpen={isCreateModalOpen}
            mode={createModalMode}
            initialDate={newEventDefaultDate || activeDate}
            themes={resolvedThemes}
            onClose={onCloseCreateModal}
            onSaveEvent={(start, end, meta) => onNewEvent?.(start, end, meta)}
            onSaveTodo={async (taskDraft) => {
              await useDataStore.getState().addTask({ ...taskDraft, isCompleted: false });
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isNewEventSheetOpen && (
          <MobileNewEventSheet
            initialDate={newEventDefaultDate}
            themes={resolvedThemes}
            onSave={(start, end, meta) => onNewEvent?.(start, end, meta)}
            onDismiss={onCloseNewEventSheet}
          />
        )}
      </AnimatePresence>

      {pinPromptItem && (
        <PinPromptModal
          isOpen={!!pinPromptItem}
          onClose={onClosePinPrompt}
          item={pinPromptItem}
          userEmail={userEmail}
          onUnlock={() => { pinPromptItem.onUnlocked?.(); onClosePinPrompt(); }}
        />
      )}
    </>
  );
};
