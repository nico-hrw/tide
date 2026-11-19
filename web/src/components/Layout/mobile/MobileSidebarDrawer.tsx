"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, FolderPlus, GraduationCap, Plus, Settings, Smile } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { setAnimatedEmojiEnabled, useAnimatedEmojiEnabled } from '@/lib/animatedEmoji';
import SidebarQuickNotes from '../sidebar/SidebarQuickNotes';
import { FolderItem, MobileListItem, NoteRow, PinPromptTarget } from './MobileNoteListItems';
import { T } from './mobileTheme';

export interface MobileSidebarContextMenuItem {
  type: 'note' | 'folder';
  id: string;
  title: string;
  parentId?: string | null;
}

export interface DragGhostPosition {
  x: number;
  y: number;
}

export interface MobileSidebarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  files: MobileListItem[];
  folders?: MobileListItem[];
  myId?: string;
  activeNoteId: string | null;
  onNoteSelect: (id: string, title: string) => void;
  onNewNote: () => void;
  onNewFolder?: () => void;
  onOpenExams: () => void;
  onOpenSurveys: () => void;
  onOpenSettings: () => void;
  draggingNote: { id: string; title: string } | null;
  dragGhostPos: DragGhostPosition | { current: DragGhostPosition };
  dragOverFolderId?: string | null;
  onDragOverFolder?: (id: string | null) => void;
  onNoteDragStart?: (file: MobileListItem, e: React.TouchEvent) => void;
  onContextMenu?: (item: MobileSidebarContextMenuItem) => void;
  onPromptPin?: (item: PinPromptTarget) => void;
  enabledExtensions?: string[];
}

export const MobileSidebarDrawer: React.FC<MobileSidebarDrawerProps> = ({
  isOpen,
  onClose,
  files,
  folders,
  activeNoteId,
  onNoteSelect,
  onNewNote,
  onNewFolder,
  onOpenExams,
  onOpenSurveys,
  onOpenSettings,
  draggingNote,
  dragGhostPos,
  dragOverFolderId = null,
  onDragOverFolder,
  onNoteDragStart,
  onContextMenu,
  onPromptPin,
  enabledExtensions,
}) => {
  const storeExtensions = useDataStore((s) => s.enabledExtensions);
  const resolvedExtensions = enabledExtensions ?? storeExtensions;
  const animatedEmojiOn = useAnimatedEmojiEnabled();

  const nonFolderFiles = files.filter((f) => f.type !== 'folder');
  const recentFiles = nonFolderFiles.slice(0, 2);
  const recentIds = new Set(recentFiles.map((f) => f.id));
  const folderList = folders ?? files.filter((f) => f.type === 'folder');
  const rootFolders = folderList.filter((f) => !f.parent_id);
  const rootNotes = nonFolderFiles.filter((f) => !f.parent_id && !recentIds.has(f.id));
  const ghostCoords = 'current' in dragGhostPos ? dragGhostPos.current : dragGhostPos;

  const emitContext = (type: 'note' | 'folder', item: MobileListItem) =>
    onContextMenu?.({
      type,
      id: item.id,
      title: item.title || (type === 'folder' ? 'Ordner' : 'Untitled'),
      parentId: item.parent_id,
    });

  const featureTabs: Array<{ id: string; icon: React.ReactNode; label: string; ext: string; action: () => void }> = [
    { id: 'job_planner', icon: <GraduationCap size={18} />, label: 'Job & Uni', ext: 'job_planner', action: () => { onClose(); onOpenExams(); } },
    { id: 'surveys', icon: <Smile size={18} />, label: 'Umfragen', ext: 'surveys', action: () => { onClose(); onOpenSurveys(); } },
    { id: 'settings', icon: <Settings size={18} />, label: 'Optionen', ext: '', action: () => { onClose(); onOpenSettings(); } },
  ];

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="sb-back"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.45)' }}
            onClick={onClose}
          />
        )}

        {isOpen && (
          <motion.aside
            key="sidebar"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed left-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden"
            style={{ width: 280, background: 'var(--t2-bg)', borderRight: '1px solid var(--t2-line)' }}
          >
            <div className="px-5 pt-14 pb-2">
              <p className="text-xl font-extrabold" style={{ color: T.pri }}>tide</p>
              <p className="text-xs" style={{ color: T.mut }}>Notizen &amp; Kalender</p>
            </div>

            <div className="px-2 pb-1">
              <SidebarQuickNotes className="flex-shrink-0" />
            </div>

            <div className="mx-4 mb-2 flex gap-2">
              <button
                onClick={() => { onClose(); onNewNote(); }}
                className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-xl"
                style={{ background: 'var(--t2-ink)', color: 'var(--t2-bg)' }}
              >
                <Plus size={14} />
                <span className="text-sm font-semibold">Notiz</span>
              </button>
              <button
                onClick={() => (onNewFolder ? onNewFolder() : window.dispatchEvent(new CustomEvent('mobile_new_folder')))}
                className="w-10 flex items-center justify-center rounded-xl"
                style={{ background: T.hov, border: `1px solid ${T.brd}` }}
              >
                <FolderPlus size={16} style={{ color: T.sec }} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-2">
              <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: T.mut }}>Zuletzt</p>
              {recentFiles.map((f) => (
                <NoteRow
                  key={f.id}
                  file={f}
                  isActive={activeNoteId === f.id}
                  onOpen={() => onNoteSelect(f.id, f.title || 'Untitled')}
                  onDragStart={onNoteDragStart}
                  onContextMenu={(item) => emitContext('note', item)}
                />
              ))}

              <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: T.mut }}>Notizen</p>
              {rootFolders.map((folder) => (
                <FolderItem
                  key={folder.id}
                  folder={folder}
                  allFiles={files}
                  onOpen={onNoteSelect}
                  activeNoteId={activeNoteId}
                  dragOverId={dragOverFolderId}
                  onDragOver={(id) => onDragOverFolder?.(id)}
                  onDragLeave={() => onDragOverFolder?.(null)}
                  onContextMenu={(item) => emitContext('folder', item)}
                  onNoteContextMenu={(item) => emitContext('note', item)}
                  onNoteDragStart={onNoteDragStart}
                  isDragging={Boolean(draggingNote)}
                  onPromptPin={onPromptPin}
                />
              ))}

              {rootNotes.map((f) => (
                <NoteRow
                  key={f.id}
                  file={f}
                  isActive={activeNoteId === f.id}
                  onOpen={() => onNoteSelect(f.id, f.title || 'Untitled')}
                  onDragStart={onNoteDragStart}
                  onContextMenu={(item) => emitContext('note', item)}
                />
              ))}
            </div>

            <div style={{ borderTop: `1px solid ${T.brd}`, flexShrink: 0 }}>
              <div className="flex overflow-x-auto gap-2 px-3 py-3 no-scrollbar">
                {featureTabs.map((tab) => {
                  const enabled = !tab.ext || resolvedExtensions.includes(tab.ext);
                  return (
                    <button
                      key={tab.id}
                      onClick={enabled ? tab.action : undefined}
                      className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl flex-shrink-0 active:opacity-70"
                      style={{ background: T.hov, border: `1px solid ${T.brd}`, opacity: enabled ? 1 : 0.35, minWidth: 60 }}
                    >
                      <span style={{ color: T.sec }}>{tab.icon}</span>
                      <span className="text-[10px] font-semibold" style={{ color: T.sec }}>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-3 px-4 pb-4">
                <span className="text-[13px] font-semibold" style={{ color: T.pri }}>Animierte Emojis</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={animatedEmojiOn}
                  aria-label="Animierte Emojis"
                  onClick={() => setAnimatedEmojiEnabled(!animatedEmojiOn)}
                  className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
                  style={{ background: animatedEmojiOn ? T.accent : T.brd }}
                >
                  <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-t2-surface shadow transition-transform ${animatedEmojiOn ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {draggingNote && (
        <div
          className="fixed pointer-events-none z-[70] px-4 py-2.5 rounded-2xl shadow-2xl"
          style={{ left: ghostCoords.x - 80, top: ghostCoords.y - 20, background: T.card, border: `1px solid ${T.brd}`, maxWidth: 180 }}
        >
          <div className="flex items-center gap-2">
            <FileText size={12} style={{ color: T.sec }} />
            <span className="text-xs font-semibold truncate" style={{ color: T.pri }}>{draggingNote.title}</span>
          </div>
        </div>
      )}
    </>
  );
};

export default MobileSidebarDrawer;
