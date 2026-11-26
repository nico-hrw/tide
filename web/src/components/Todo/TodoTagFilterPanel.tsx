'use client';

import React from 'react';
import { Tag as TagIcon } from 'lucide-react';
import type { Tag } from '@/lib/tags';
import { isTagFilterActive, toggleTagInFilter, toggleUntaggedInFilter, EMPTY_TAG_FILTER, type TagFilter } from '@/lib/tagFilter';
import { DEFAULT_TAG_COLOR } from './useTodoTags';
import { HiddenTagModeControl } from '@/components/Tags/HiddenTagModeControl';

interface TodoTagFilterPanelProps {
  tags: Tag[];
  filter: TagFilter;
  onChange: (filter: TagFilter) => void;
}

const ACTIVE = 'bg-t2-accent text-t2-accent-ink shadow-xs font-semibold';
const INACTIVE = 'bg-t2-hover  text-t2-ink  hover:bg-t2-stage ';

/** Multi-select (OR) tag filter with an "Ohne Tag" option, used in the filter popover. */
export const TodoTagFilterPanel: React.FC<TodoTagFilterPanelProps> = ({ tags, filter, onChange }) => (
  <div>
    <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-t2-ink-3  mb-1.5">
      <span className="flex items-center gap-1">
        <TagIcon size={12} />
        Tags
      </span>
      {isTagFilterActive(filter) && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_TAG_FILTER)}
          className="text-[11px] text-t2-accent  hover:underline capitalize cursor-pointer"
        >
          Tag entfernen
        </button>
      )}
    </div>
    <HiddenTagModeControl filter={filter} onChange={onChange} />
    {tags.length === 0 ? (
      <p className="text-[11px] text-t2-ink-3  italic py-1">Keine Tags vorhanden</p>
    ) : (
      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
        <button
          type="button"
          onClick={() => onChange(toggleUntaggedInFilter(filter))}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${filter.untagged ? ACTIVE : INACTIVE}`}
        >
          Ohne Tag
        </button>
        {tags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            onClick={() => onChange(toggleTagInFilter(filter, tag.id))}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              filter.tagIds.includes(tag.id) ? ACTIVE : INACTIVE
            }`}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color || DEFAULT_TAG_COLOR }} />
            {tag.title}
          </button>
        ))}
      </div>
    )}
  </div>
);

export default TodoTagFilterPanel;
