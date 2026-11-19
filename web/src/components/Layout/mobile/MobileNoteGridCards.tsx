"use client";

import React, { useRef, useState } from 'react';
import { ChevronDown, FileText, Folder, FolderOpen, Layout, Lock } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { isItemUnlocked, ItemSecuritySettings } from '@/lib/pinSecurity';
import { getFolderColor } from '@/lib/folderColors';
import { T } from './mobileTheme';
import { PinPromptTarget, isItemProtected, getItemDisplayTitle } from './MobileNoteListItems';

export interface NoteCardMetadata {
  has_custom_password?: boolean;
  security_settings?: ItemSecuritySettings;
  color?: string;
  pwd_salt?: string;
  pin_hash?: string;
  frequency?: ItemSecuritySettings['frequency'];
  [key: string]: unknown;
}

export interface NoteCardItem {
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
  updated_at?: string | number;
  updatedAt?: string | number | Date;
  created_at?: string | number;
  createdAt?: string | number | Date;
}

export const NoteCard = React.memo(function NoteCard(props: {
  file: NoteCardItem;
  isActive?: boolean;
  onOpen: () => void;
  onContextMenu?: (file: NoteCardItem) => void;
}) {
  const { file, isActive, onOpen, onContextMenu } = props;
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movedRef = useRef(false);

  const isLocked = isItemProtected(file);
  const isCanvas = file.type === 'canvas';
  const isShared = file.share_status === 'shared' || file.is_shared;
  const displayTitle = getItemDisplayTitle(file, 'Untitled');

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
      className={`group relative flex flex-col items-center justify-between cursor-pointer select-none p-1.5 rounded-xl transition-all active:scale-95 hover:bg-t2-hover  active:bg-t2-hover  w-full ${
        isActive
          ? 'ring-2 ring-t2-accent bg-t2-sub '
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
            className="w-9 h-11 text-t2-accent  transition-transform group-active:scale-105"
            fill="currentColor"
            fillOpacity={0.06}
            strokeWidth={1.25}
          />
        ) : (
          <FileText
            className={`w-9 h-11 transition-transform group-active:scale-105 ${
              isActive
                ? 'text-t2-accent '
                : 'text-t2-ink-2  group-hover:text-t2-accent'
            }`}
            fill="currentColor"
            fillOpacity={0.06}
            strokeWidth={1.25}
          />
        )}
        {isLocked && (
          <span title="PIN-geschützt" className="absolute -top-1 -right-1 flex items-center justify-center p-[2px] bg-t2-surface  rounded-full shadow-xs">
            <Lock size={11} className="text-amber-500" strokeWidth={2.5} />
          </span>
        )}
      </div>

      <span
        className={`text-[11px] leading-tight font-semibold text-center line-clamp-2 max-w-[84px] mt-1.5 transition-colors ${
          isActive ? 'text-t2-accent  font-bold' : 'text-t2-ink '
        }`}
      >
        {displayTitle}
      </span>

      {isShared ? (
        <span className="mt-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-t2-sub text-t2-accent   leading-none">
          Geteilt
        </span>
      ) : dateStr ? (
        <span className="mt-1 text-[10px] text-t2-ink-3  leading-none">
          {dateStr}
        </span>
      ) : null}
    </button>
  );
});

export interface FolderCardItem {
  id: string;
  title?: string;
  type?: string;
  has_pin?: boolean;
  is_locked?: boolean;
  metadata?: NoteCardMetadata | null;
  parent_id?: string | null;
  color?: string;
  updated_at?: string | number;
  updatedAt?: string | number | Date;
  created_at?: string | number;
  createdAt?: string | number | Date;
}

export const FolderCard = React.memo(function FolderCard({
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

  const isLocked = isItemProtected(folder);
  const displayTitle = getItemDisplayTitle(folder, 'Ordner');

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
      className="group relative flex flex-col items-center justify-between cursor-pointer select-none p-1.5 rounded-xl transition-all active:scale-95 hover:bg-t2-hover  active:bg-t2-hover  w-full"
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
          <span title="PIN-geschützt" className="absolute -top-1 -right-1 flex items-center justify-center p-[2px] bg-t2-surface  rounded-full shadow-xs">
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
        className="text-[11px] leading-tight font-semibold text-center line-clamp-2 max-w-[84px] mt-1.5 text-t2-ink  transition-colors"
      >
        {displayTitle}
      </span>
    </button>
  );
});
