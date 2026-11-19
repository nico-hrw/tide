"use client";

import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, FileText, Folder, FolderOpen, Layout, Lock } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { isItemUnlocked, ItemSecuritySettings } from '@/lib/pinSecurity';
import { T } from './mobileTheme';

export interface PinPromptTarget {
  id: string;
  title: string;
  type: 'file' | 'folder' | 'canvas' | 'note';
  metadata?: {
    security_settings?: ItemSecuritySettings;
    has_custom_password?: boolean;
    pwd_salt?: string;
    pin_hash?: string;
    frequency?: ItemSecuritySettings['frequency'];
    [key: string]: unknown;
  };
  onUnlocked?: () => void;
}

export interface MobileListItemMetadata {
  has_custom_password?: boolean;
  security_settings?: ItemSecuritySettings;
  pwd_salt?: string;
  pin_hash?: string;
  frequency?: ItemSecuritySettings['frequency'];
  color?: string;
  [key: string]: unknown;
}

export interface MobileListItem {
  id: string;
  title?: string;
  type?: string;
  has_pin?: boolean;
  is_locked?: boolean;
  metadata?: MobileListItemMetadata | null;
  share_status?: string;
  is_shared?: boolean;
  parent_id?: string | null;
  color?: string;
  updated_at?: string | number;
  updatedAt?: string | number | Date;
  created_at?: string | number;
  createdAt?: string | number | Date;
}

export function isItemProtected(
  item: MobileListItem | ItemSecuritySettings | null | undefined
): boolean {
  if (!item) return false;
  if ('id' in item) {
    return Boolean(
      item.has_pin ||
      item.is_locked ||
      item.metadata?.has_custom_password ||
      item.metadata?.security_settings?.has_custom_password ||
      (typeof item.title === 'string' && item.title.startsWith('#'))
    );
  }
  return Boolean(item.has_custom_password);
}

export function getItemDisplayTitle(
  titleOrItem: string | { title?: string; display_title?: string; name?: string } | null | undefined,
  fallback = 'Untitled'
): string {
  const rawTitle =
    typeof titleOrItem === 'string'
      ? titleOrItem
      : (titleOrItem?.display_title || titleOrItem?.title || titleOrItem?.name || '');
  if (rawTitle.startsWith('#')) {
    return rawTitle.slice(1).trim() || fallback;
  }
  return rawTitle || fallback;
}

export interface NoteRowProps {
  file: MobileListItem;
  isActive?: boolean;
  onOpen: () => void;
  onDragStart?: (file: MobileListItem, e: React.TouchEvent) => void;
  onContextMenu?: (file: MobileListItem) => void;
}

export const NoteRow = React.memo(function NoteRow(props: NoteRowProps) {
  const { file, isActive, onOpen, onContextMenu } = props;
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movedRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const theme = useDataStore(s => s.theme);

  const isLocked = isItemProtected(file);
  const isCanvas = file.type === 'canvas';
  const isShared = file.share_status === 'shared' || Boolean(file.is_shared);
  const displayTitle = getItemDisplayTitle(file.title ?? '', 'Untitled');

  return (
    <button
      onClick={onOpen}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left rounded-xl transition-all duration-150 ${
        isActive
          ? 'bg-t2-sub  font-semibold ring-1 ring-t2-accent'
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
          <span title="PIN-geschützt" className="absolute -bottom-1 -right-1 flex items-center justify-center p-[1px] bg-t2-surface  rounded-full shadow-xs">
            <Lock size={8} className="text-amber-500" strokeWidth={2.5} />
          </span>
        )}
      </div>

      <span className="text-sm truncate flex-1 font-medium">
        {displayTitle}
      </span>

      {isShared && (
        <span
          className="shrink-0 w-1.5 h-1.5 rounded-full bg-t2-accent"
          title="Geteilte Notiz"
        />
      )}
    </button>
  );
});

export interface FolderItemProps {
  folder: MobileListItem;
  allFiles: MobileListItem[];
  onOpen: (id: string, title: string) => void;
  activeNoteId?: string | null;
  dragOverId?: string | null;
  onDragOver?: (id: string) => void;
  onDragLeave?: () => void;
  onContextMenu?: (folder: MobileListItem) => void;
  onNoteContextMenu?: (file: MobileListItem) => void;
  onNoteDragStart?: (file: MobileListItem, e: React.TouchEvent) => void;
  isDragging?: boolean;
  onPromptPin?: (item: PinPromptTarget) => void;
}

export const FolderItem = React.memo(function FolderItem({
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
}: FolderItemProps) {
  const [open, setOpen] = useState(false);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movedRef = useRef(false);
  const loadedDirectories = useDataStore(s => s.loadedDirectories);
  const children = allFiles.filter(f => f.parent_id === folder.id);
  const isOver = dragOverId === folder.id;

  const isLocked = isItemProtected(folder);
  const displayTitle = getItemDisplayTitle(folder.title ?? '', 'Ordner');

  return (
    <div>
      <button
        onClick={() => {
          if (isLocked && !open && !isItemUnlocked(folder.id, (folder.metadata?.security_settings || folder.metadata) as ItemSecuritySettings | null | undefined)) {
            const promptData: PinPromptTarget = {
              id: folder.id,
              title: folder.title || 'Ordner',
              type: 'folder' as const,
              metadata: folder.metadata ?? undefined,
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
        </div>
        <span className="text-sm font-semibold flex-1 text-left truncate" style={{ color: isOver ? T.accent : T.pri }}>
          {displayTitle}
        </span>
        {isLocked ? (
          <Lock size={13} className="shrink-0" style={{ color: T.mut }} aria-label="PIN-geschützt" />
        ) : children.length > 0 && (
          <span className="text-[12px] tabular-nums shrink-0" style={{ color: T.mut }}>{children.length}</span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden relative ml-3 pl-2.5 border-l border-t2-line  space-y-0.5 mt-0.5"
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
