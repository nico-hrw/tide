'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X } from 'lucide-react';
import { canCreateTag, filterTagsByQuery, type Tag } from '@/lib/tags';
import { DEFAULT_TAG_COLOR } from '@/components/Todo/useTodoTags';
import { TagPickerPanel } from './TagPickerPanel';

export interface TagPickerProps {
  tags: Tag[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** Returns the id of the existing or newly created tag with this title. */
  onCreate: (title: string) => Promise<string | undefined>;
  /** Accepted for compatibility; the structure is the same for every usage. */
  compact?: boolean;
  /** "hash" renders selected tags as plain "#title" text in the tag colour instead of boxed chips. */
  variant?: 'chip' | 'hash';
}

const PANEL_MIN_WIDTH = 240;
const PANEL_HEIGHT = 250;
const VIEWPORT_GAP = 8;

/**
 * Selected tags as removable chips plus a "+ Tag" button that opens a searchable list.
 * The panel is portaled with fixed positioning so overflow-hidden ancestors (mobile cards,
 * popovers) cannot clip it.
 */
export const TagPicker: React.FC<TagPickerProps> = ({ tags, value, onChange, onCreate, compact, variant = 'chip' }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const creating = useRef(false);
  const valueRef = useRef(value);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    valueRef.current = value;
  });

  const filtered = filterTagsByQuery(tags, query);
  const canCreate = canCreateTag(tags, query);
  const rowCount = filtered.length + (canCreate ? 1 : 0);

  const measure = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(Math.max(r.width, PANEL_MIN_WIDTH), vw - VIEWPORT_GAP * 2);
    const left = Math.max(VIEWPORT_GAP, Math.min(r.left, vw - width - VIEWPORT_GAP));
    const below = vh - r.bottom;
    const flip = below < PANEL_HEIGHT && r.top > below;
    setStyle(flip
      ? { left, width, bottom: vh - r.top + 4 }
      : { left, width, top: r.bottom + 4 });
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onMove = (e: Event) => {
      if (e.target instanceof Node && panelRef.current?.contains(e.target)) return;
      measure();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, measure]);

  const toggle = (id: string) => {
    const current = valueRef.current;
    onChange(current.includes(id) ? current.filter((v) => v !== id) : [...current, id]);
  };

  const create = async () => {
    const title = query.trim();
    if (!title || !canCreate || creating.current) return;
    creating.current = true;
    let id: string | undefined;
    try {
      id = await onCreate(title);
    } finally {
      creating.current = false;
    }
    if (!id) return;
    const current = valueRef.current;
    if (!current.includes(id)) onChange([...current, id]);
    setQuery('');
    setActive(-1);
  };

  const activate = (index: number) => {
    if (index < filtered.length) toggle(filtered[index].id);
    else void create();
  };

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (rowCount === 0) return;
      setActive(e.key === 'ArrowDown' ? (active + 1) % rowCount : active <= 0 ? rowCount - 1 : active - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && active < rowCount) activate(active);
      else if (query.trim() && filtered.length === 1) toggle(filtered[0].id);
      else if (filtered.length === 0 && canCreate) void create();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  const selectedTags = value
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is Tag => Boolean(t));

  return (
    <div ref={wrapRef} className="flex flex-wrap items-center gap-1.5">
      {selectedTags.map((tag) => variant === 'hash' ? (
        <span
          key={tag.id}
          data-tag-chip
          className="group inline-flex items-center text-sm font-medium"
          style={{ color: tag.color || DEFAULT_TAG_COLOR }}
        >
          <span>#{tag.title}</span>
          <button
            type="button"
            aria-label={`Tag entfernen: ${tag.title}`}
            onClick={() => onChange(value.filter((v) => v !== tag.id))}
            className="inline-flex items-center justify-center w-0 overflow-hidden opacity-0 group-hover:w-5 group-hover:opacity-70 focus-visible:w-5 focus-visible:opacity-70 hover:!opacity-100 transition-all cursor-pointer"
          >
            <X size={11} />
          </button>
        </span>
      ) : (
        <span
          key={tag.id}
          data-tag-chip
          className={`inline-flex items-center gap-1 ${compact ? 'pl-2 pr-1 py-0.5' : 'pl-2.5 pr-1.5 py-1'} rounded-lg text-xs font-medium border bg-t2-sub text-t2-ink border-t2-line-soft`}
        >
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color || DEFAULT_TAG_COLOR }} />
          <span>{tag.title}</span>
          <button
            type="button"
            aria-label={`Tag entfernen: ${tag.title}`}
            onClick={() => onChange(value.filter((v) => v !== tag.id))}
            className="inline-flex items-center justify-center min-w-7 min-h-7 -my-1 -mr-1 rounded text-t2-ink-3 hover:text-t2-ink cursor-pointer"
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <button
        ref={buttonRef}
        type="button"
        aria-label="Tag hinzufügen"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (!open) {
            measure();
            setQuery('');
            setActive(-1);
          }
          setOpen(!open);
        }}
        className={`inline-flex items-center gap-1 ${compact ? 'px-2 py-0.5' : 'px-2.5 py-1'} rounded-full text-xs font-medium border border-t2-line bg-white dark:bg-t2-surface text-t2-ink-2 shadow-xs hover:text-t2-ink hover:border-t2-ink-3 hover:shadow-sm cursor-pointer transition-all`}
      >
        <Plus size={11} className="shrink-0" />
        Tag
      </button>
      {open && createPortal(
        <TagPickerPanel
          tags={filtered}
          value={value}
          query={query}
          onQueryChange={(q) => { setQuery(q); setActive(-1); }}
          active={active}
          canCreate={canCreate}
          hasAnyTags={tags.length > 0}
          onToggle={toggle}
          onCreate={() => void create()}
          onKeyDown={onKeyDown}
          inputRef={inputRef}
          panelRef={panelRef}
          style={style}
        />,
        document.body,
      )}
    </div>
  );
};

export default TagPicker;
