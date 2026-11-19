'use client';

import React, { useRef } from 'react';

export interface MobileNoteCardItem {
  id: string;
  title?: string | null;
  updated_at?: string | number;
  updatedAt?: string | number | Date;
  created_at?: string | number;
  createdAt?: string | number | Date;
  /** Optional plain-text excerpt; shown as a two-line preview when present. */
  previewText?: string;
}

interface MobileNoteCardProps<T extends MobileNoteCardItem> {
  file: T;
  isActive?: boolean;
  onOpen: () => void;
  onContextMenu?: (file: T) => void;
}

const LONG_PRESS_MS = 420;

function formatDate(file: MobileNoteCardItem): string {
  const raw = file.updated_at || file.updatedAt || file.created_at || file.createdAt;
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Note card for the mobile list: title, optional two-line excerpt and date.
 * Replaces the single-line row in the "Zuletzt bearbeitet" section.
 */
export function MobileNoteCard<T extends MobileNoteCardItem>({
  file,
  isActive,
  onOpen,
  onContextMenu,
}: MobileNoteCardProps<T>) {
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movedRef = useRef(false);

  const rawTitle = typeof file.title === 'string' ? file.title : '';
  const displayTitle = rawTitle.startsWith('#') ? rawTitle.slice(1).trim() : (rawTitle || 'Ohne Titel');
  const date = formatDate(file);

  const clearHold = () => {
    if (holdRef.current) {
      clearTimeout(holdRef.current);
      holdRef.current = null;
    }
  };

  return (
    <button
      type="button"
      onClick={onOpen}
      onTouchStart={() => {
        movedRef.current = false;
        clearHold();
        holdRef.current = setTimeout(() => {
          if (!movedRef.current) onContextMenu?.(file);
        }, LONG_PRESS_MS);
      }}
      onTouchMove={() => {
        movedRef.current = true;
        clearHold();
      }}
      onTouchEnd={clearHold}
      className={`w-full text-left flex flex-col gap-1 rounded-[14px] px-3.5 py-3 transition-colors bg-t2-surface ring-1 ring-t2-line ${
        isActive ? 'ring-2 ring-t2-ink' : 'active:bg-t2-hover'
      }`}
    >
      <span className="block truncate text-[15px] font-semibold text-t2-ink">{displayTitle}</span>
      {file.previewText && (
        <span className="block line-clamp-2 text-[13px] leading-snug text-t2-ink-2">{file.previewText}</span>
      )}
      {date && <span className="block text-[12px] text-t2-ink-3">{date}</span>}
    </button>
  );
}

export default MobileNoteCard;
