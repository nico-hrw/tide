"use client";

import React, { useEffect, useState } from 'react';
import { ChevronRight, FileText, Folder, FolderOpen } from 'lucide-react';
import { getNotePreview, preloadNotePreviews, subscribeNotePreviews } from '@/lib/notePreview';
import SidebarQuickNotes from '../sidebar/SidebarQuickNotes';
import { MobileNoteCard } from './MobileNoteCard';
import { FolderCard, NoteCard } from './MobileNoteGridCards';
import {
  FolderItem,
  MobileListItem,
  NoteRow,
  PinPromptTarget,
} from './MobileNoteListItems';
import { T } from './mobileTheme';

export interface MobileNoteItem extends MobileListItem {
  previewText?: string;
  isGroup?: boolean;
  effect?: string;
  tags?: string[];
  preview?: string;
  folder_name?: string;
}

export interface NotesContextMenuTarget {
  type: 'note' | 'folder';
  id: string;
  title: string;
  parentId?: string | null;
}

export interface MobileNotesTabProps {
  files: MobileNoteItem[];
  folders?: MobileNoteItem[];
  myId?: string | null;
  activeNoteId: string | null;
  onNoteSelect: (id: string, title: string) => void;
  onOpenNote?: (id: string, title: string) => void;
  onNewNote: (title?: string) => void;
  onNewFolder?: () => void;
  onDeleteFile?: (id: string) => void;
  onRenameFile?: (id: string, title: string) => void;
  onStartEditing?: () => void;
  searchQuery: string;
  notesViewMode: 'list' | 'grid';
  setNotesViewMode: (mode: 'list' | 'grid') => void;
  isSharedFolderOpen: boolean;
  setIsSharedFolderOpen: (open: boolean) => void;
  dragOverFolderId: string | null;
  setDragOverFolderId?: (id: string | null) => void;
  draggingNote?: { id: string; title: string } | null;
  handleNoteDragStart?: (file: MobileListItem, e: React.TouchEvent) => void;
  onContextMenu?: (target: NotesContextMenuTarget) => void;
  setContextMenu?: (target: NotesContextMenuTarget | null) => void;
  onPromptPin?: (item: PinPromptTarget) => void;
}

/** Kurzer Textauszug der Notiz, vorab entschlüsselt (nur im Arbeitsspeicher). */
function readNotePreview(id: string): string | undefined {
  const text = getNotePreview(id);
  return text ? text.slice(0, 180) : undefined;
}

function getItemTimestamp(item: MobileNoteItem): number {
  return new Date(item.updated_at || item.updatedAt || item.created_at || item.createdAt || 0).getTime();
}

export function MobileNotesTab({
  files,
  folders,
  activeNoteId,
  onNoteSelect,
  onOpenNote,
  onNewNote,
  onStartEditing,
  searchQuery,
  notesViewMode,
  setNotesViewMode,
  isSharedFolderOpen,
  setIsSharedFolderOpen,
  dragOverFolderId,
  setDragOverFolderId,
  draggingNote,
  handleNoteDragStart,
  onContextMenu,
  setContextMenu,
  onPromptPin,
}: MobileNotesTabProps) {
  // Vorschau der zuletzt bearbeiteten Notizen: vorab entschlüsseln und bei Fertigstellung neu zeichnen.
  const [, setPreviewTick] = useState(0);
  useEffect(() => subscribeNotePreviews(() => setPreviewTick((t) => t + 1)), []);
  useEffect(() => {
    const latest = (files || [])
      .filter((f) => f.type !== 'folder')
      .slice()
      .sort((a, b) => getItemTimestamp(b) - getItemTimestamp(a))
      .slice(0, 3);
    void preloadNotePreviews(latest.map((f) => ({ ...f })));
  }, [files]);

  const handleOpen = onOpenNote ?? onNoteSelect;
  const triggerContext = (type: 'note' | 'folder', item: { id: string; title?: string | null; parent_id?: string | null }) => {
    const target: NotesContextMenuTarget = {
      type,
      id: item.id,
      title: item.title || (type === 'folder' ? 'Ordner' : 'Untitled'),
      parentId: item.parent_id,
    };
    onContextMenu?.(target);
    setContextMenu?.(target);
  };

  const renderNoteCard = (f: MobileNoteItem) => (
    <NoteCard
      key={f.id}
      file={f}
      isActive={activeNoteId === f.id}
      onOpen={() => handleOpen(f.id, f.title || 'Untitled')}
      onContextMenu={(item) => triggerContext('note', item)}
    />
  );

  const renderNoteRow = (f: MobileNoteItem) => (
    <NoteRow
      key={f.id}
      file={f}
      isActive={activeNoteId === f.id}
      onOpen={() => handleOpen(f.id, f.title || 'Untitled')}
      onDragStart={handleNoteDragStart}
      onContextMenu={(item) => triggerContext('note', item)}
    />
  );

  const renderFolderCard = (folder: MobileNoteItem) => (
    <FolderCard
      key={folder.id}
      folder={folder}
      allFiles={files}
      onOpen={handleOpen}
      activeNoteId={activeNoteId}
      onContextMenu={(item) => triggerContext('folder', item)}
      onNoteContextMenu={(item) => triggerContext('note', item)}
      onPromptPin={onPromptPin}
    />
  );

  const renderFolderItem = (folder: MobileNoteItem) => (
    <FolderItem
      key={folder.id}
      folder={folder}
      allFiles={files}
      onOpen={handleOpen}
      activeNoteId={activeNoteId}
      dragOverId={dragOverFolderId}
      onDragOver={(id) => setDragOverFolderId?.(id)}
      onDragLeave={() => setDragOverFolderId?.(null)}
      onContextMenu={(item) => triggerContext('folder', item)}
      onNoteContextMenu={(item) => triggerContext('note', item)}
      onNoteDragStart={handleNoteDragStart}
      isDragging={Boolean(draggingNote)}
      onPromptPin={onPromptPin}
    />
  );

  const q = searchQuery.toLowerCase().trim();
  const filteredFiles = q.length >= 2
    ? files.filter((f) => f.type !== 'folder' && (f.title || '').toLowerCase().includes(q))
    : null;

  const sharedNotes = files.filter(
    (f) => f.share_status === 'pending' || f.share_status === 'accepted' || Boolean(f.is_shared),
  );
  const sharedIds = new Set(sharedNotes.map((f) => f.id));

  const nonSharedFiles = files.filter((f) => !sharedIds.has(f.id));
  const recentFiles = nonSharedFiles
    .filter((f) => f.type !== 'folder')
    .slice()
    .sort((a, b) => getItemTimestamp(b) - getItemTimestamp(a))
    .slice(0, 3)
    .map((f) => ({ ...f, previewText: readNotePreview(f.id) }));
  const recentIds = new Set(recentFiles.map((f) => f.id));

  const folderSource = folders ?? files.filter((f) => f.type === 'folder');
  const rootFolders = folderSource.filter((f) => !f.parent_id && !sharedIds.has(f.id));
  const rootNotes = nonSharedFiles.filter((f) => !f.parent_id && f.type !== 'folder' && !recentIds.has(f.id));

  const isEmpty = sharedNotes.length === 0 && recentFiles.length === 0 && rootFolders.length === 0 && rootNotes.length === 0;

  return (
    <div className="flex flex-col" style={{ flex: 1, overflow: 'hidden', paddingBottom: 'calc(76px + env(safe-area-inset-bottom))' }}>
      {/* Notes header */}
      <div className="px-5 pt-3 pb-1">
        <span className="block text-[28px] font-bold tracking-[-0.025em] leading-tight text-t2-ink">Notizen</span>
      </div>
      {/* Segment: Liste / Kacheln, links wie im Mockup */}
      <div className="flex items-center justify-between gap-2 px-5 pb-2">
        <div className="flex gap-1" role="tablist" aria-label="Ansicht">
          {([['list', 'Liste'], ['grid', 'Kacheln']] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={notesViewMode === mode}
              onClick={() => {
                setNotesViewMode(mode);
                try { localStorage.setItem('tide_notes_view', mode); } catch {}
              }}
              className={`px-3 py-1.5 rounded-full text-[13.5px] transition-colors ${
                notesViewMode === mode ? 'bg-t2-sub font-semibold text-t2-ink' : 'font-medium text-t2-ink-3'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {/* Workspace-Auswahl rechts neben Liste/Kacheln */}
        <SidebarQuickNotes compact />
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto px-2">
        {filteredFiles ? (
          filteredFiles.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: T.mut }}>Keine Ergebnisse gefunden</p>
          ) : notesViewMode === 'grid' ? (
            <div className="grid grid-cols-3 min-[480px]:grid-cols-4 gap-2 p-1">
              {filteredFiles.map(renderNoteCard)}
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredFiles.map(renderNoteRow)}
            </div>
          )
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <FileText size={32} style={{ color: T.mut }} className="mb-2 opacity-50" />
            <p className="text-sm font-medium" style={{ color: T.sec }}>Keine Notizen vorhanden</p>
            <button
              onClick={() => { onNewNote(); onStartEditing?.(); }}
              className="mt-3 text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: `${T.accent}15`, color: T.accent }}
            >
              Erste Notiz erstellen
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {/* Geteilt mit mir Section */}
            {sharedNotes.length > 0 && (
              <div className="mb-2">
                <button
                  onClick={() => setIsSharedFolderOpen(!isSharedFolderOpen)}
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
                    <FolderOpen size={16} className="text-t2-accent shrink-0" />
                  ) : (
                    <Folder size={16} className="text-t2-accent shrink-0" />
                  )}
                  <span className="text-sm font-semibold flex-1 truncate" style={{ color: T.pri }}>Geteilt mit mir</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-t2-sub text-t2-accent  ">
                    {sharedNotes.length}
                  </span>
                </button>
                {isSharedFolderOpen && (
                  notesViewMode === 'grid' ? (
                    <div className="grid grid-cols-3 min-[480px]:grid-cols-4 gap-2 p-1 mt-1">
                      {sharedNotes.map((f) => (f.type === 'folder' ? renderFolderCard(f) : renderNoteCard(f)))}
                    </div>
                  ) : (
                    <div className="relative mt-1 ml-3 pl-2.5 border-l border-t2-line  space-y-0.5">
                      {sharedNotes.map((f) => (f.type === 'folder' ? renderFolderItem(f) : renderNoteRow(f)))}
                    </div>
                  )
                )}
              </div>
            )}

            {/* Zuletzt */}
            {recentFiles.length > 0 && (
              <div>
                <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: T.mut }}>Zuletzt bearbeitet</p>
                {notesViewMode === 'grid' ? (
                  <div className="grid grid-cols-3 min-[480px]:grid-cols-4 gap-2 p-1">
                    {recentFiles.map(renderNoteCard)}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 px-1">
                    {recentFiles.map((f) => (
                      <MobileNoteCard
                        key={f.id}
                        file={f}
                        isActive={activeNoteId === f.id}
                        onOpen={() => handleOpen(f.id, f.title || 'Untitled')}
                        onContextMenu={(item) => triggerContext('note', item)}
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
                    {rootFolders.map(renderFolderCard)}
                  </div>
                ) : (
                  <div className="divide-y divide-t2-line-soft">
                    {rootFolders.map(renderFolderItem)}
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
                    {rootNotes.map(renderNoteCard)}
                  </div>
                ) : (
                  <div className="divide-y divide-t2-line-soft">
                    {rootNotes.map(renderNoteRow)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default MobileNotesTab;
