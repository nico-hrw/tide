'use client';

import React, { useState } from 'react';
import { Check, ChevronDown, Layers, Plus } from 'lucide-react';
import { tagSafe, type Tag } from '@/lib/tags';
import { DEFAULT_TAG_COLOR } from '@/components/Todo/useTodoTags';
import { WorkspacePrefixBox } from '@/components/Workspaces/WorkspacePrefixBox';
import { TAG_PICKER_PANEL_ATTR } from './tagPickerPanelMarker';

export interface TagPickerPanelProps {
  /** Local workspace tags already filtered by the query. */
  tags: Tag[];
  externalTags?: Tag[];
  hasExternalTags?: boolean;
  value: string[];
  query: string;
  onQueryChange: (query: string) => void;
  /** Index into [...tags, createRow]; -1 when nothing is active. */
  active: number;
  canCreate: boolean;
  hasAnyTags: boolean;
  onToggle: (id: string) => void;
  onCreate: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  style: React.CSSProperties;
}

const rowBase = 'w-full min-h-[36px] flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs font-semibold text-left cursor-pointer transition-colors';

/** Dropdown panel of the TagPicker: search field, local tag rows, "create" row, and optional external workspaces. */
export const TagPickerPanel: React.FC<TagPickerPanelProps> = ({
  tags, externalTags = [], hasExternalTags = false, value, query, onQueryChange, active, canCreate, hasAnyTags, onToggle, onCreate, onKeyDown, inputRef, panelRef, style,
}) => {
  const [wsOpen, setWsOpen] = useState(false);
  const showEmpty = !hasAnyTags && !query.trim();
  const showExternal = wsOpen || (query.trim().length > 0 && externalTags.length > 0);
  return (
    <div
      ref={panelRef}
      role="listbox"
      {...{ [TAG_PICKER_PANEL_ATTR]: '' }}
      aria-multiselectable="true"
      aria-label="Tags"
      style={style}
      className="fixed z-[1050] bg-t2-surface border border-t2-line-soft rounded-xl shadow-xl p-1 flex flex-col gap-1 animate-in fade-in-50 duration-100"
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Tag suchen oder neu anlegen…"
        aria-label="Tag suchen"
        className="w-full text-xs bg-t2-sub border border-t2-line-soft rounded-lg px-2 py-1.5 text-t2-ink placeholder-t2-ink-3 focus:outline-none"
      />
      <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
        {showEmpty && (
          <p className="px-2 py-1.5 text-xs text-t2-ink-3">Noch keine Tags – tippe einen Namen zum Anlegen</p>
        )}
        {tags.map((tag, i) => {
          const selected = value.includes(tag.id);
          return (
            <div
              key={tag.id}
              role="option"
              aria-selected={selected}
              data-active={active === i ? 'true' : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onToggle(tag.id)}
              className={`${rowBase} ${selected ? 'text-t2-accent' : 'text-t2-ink'} ${active === i ? 'bg-t2-hover' : 'hover:bg-t2-sub'}`}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color || DEFAULT_TAG_COLOR }} />
                <span className="truncate">{tag.title}</span>
              </span>
              {selected && <Check size={11} className="text-t2-accent shrink-0" />}
            </div>
          );
        })}
        {canCreate && (
          <div
            role="option"
            aria-selected={false}
            data-active={active === tags.length ? 'true' : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onCreate}
            className={`${rowBase} text-t2-accent ${active === tags.length ? 'bg-t2-hover' : 'hover:bg-t2-sub'}`}
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <Plus size={11} className="shrink-0" />
              <span className="truncate">{`Neu anlegen »${query.trim()}«`}</span>
            </span>
          </div>
        )}
        {hasExternalTags && (
          <div className="mt-1 pt-1 border-t border-t2-line-soft">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setWsOpen((v) => !v)}
              className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-t2-ink-2 hover:bg-t2-sub rounded-lg cursor-pointer"
            >
              <Layers size={11} className="shrink-0 text-t2-ink-3" />
              <span className="flex-1 text-left">Andere Workspaces</span>
              <ChevronDown size={11} className={`shrink-0 transition-transform ${showExternal ? 'rotate-180' : ''}`} />
            </button>
            {showExternal && externalTags.map((tag) => {
              const selected = value.includes(tag.id);
              return (
                <div
                  key={tag.id}
                  role="option"
                  aria-selected={selected}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onToggle(tag.id)}
                  className={`${rowBase} ${selected ? 'text-t2-accent' : 'text-t2-ink'} hover:bg-t2-sub`}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <WorkspacePrefixBox safe={tagSafe(tag)} />
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color || DEFAULT_TAG_COLOR }} />
                    <span className="truncate">{tag.title}</span>
                  </span>
                  {selected && <Check size={11} className="text-t2-accent shrink-0" />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TagPickerPanel;
