'use client';

import React, { useMemo, useState } from 'react';
import { ChevronDown, Layers, Search, Tag as TagIcon } from 'lucide-react';
import { filterTagsByQuery, splitTagsByWorkspace, tagSafe, type Tag } from '@/lib/tags';
import { isTagFilterActive, toggleTagInFilter, toggleUntaggedInFilter, EMPTY_TAG_FILTER, type TagFilter } from '@/lib/tagFilter';
import { useDataStore } from '@/store/useDataStore';
import { DEFAULT_TAG_COLOR } from './useTodoTags';
import { HiddenTagModeControl } from '@/components/Tags/HiddenTagModeControl';
import { WorkspacePrefixBox } from '@/components/Workspaces/WorkspacePrefixBox';

interface TodoTagFilterPanelProps {
  tags: Tag[];
  filter: TagFilter;
  onChange: (filter: TagFilter) => void;
}

const ACTIVE = 'bg-t2-accent text-t2-accent-ink shadow-xs font-semibold';
const INACTIVE = 'bg-t2-hover  text-t2-ink  hover:bg-t2-stage ';

/** Multi-select (OR) tag filter scoped to active workspaces, with a Workspaces section for external tags. */
export const TodoTagFilterPanel: React.FC<TodoTagFilterPanelProps> = ({ tags, filter, onChange }) => {
  const activeSafes = useDataStore((s) => s.activeSafes);
  const [wsOpen, setWsOpen] = useState(false);
  const [wsQuery, setWsQuery] = useState('');

  const { local: localTags, external: externalTags } = useMemo(
    () => splitTagsByWorkspace(tags, activeSafes ?? []),
    [tags, activeSafes],
  );
  const visibleExternal = useMemo(() => filterTagsByQuery(externalTags, wsQuery), [externalTags, wsQuery]);
  const selectedExternalCount = externalTags.filter((t) => filter.tagIds.includes(t.id)).length;

  return (
    <div>
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-t2-ink-3 mb-1.5">
        <span className="flex items-center gap-1">
          <TagIcon size={12} />
          Tags
        </span>
        {isTagFilterActive(filter) && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_TAG_FILTER)}
            className="text-[11px] text-t2-accent hover:underline capitalize cursor-pointer"
          >
            Tag entfernen
          </button>
        )}
      </div>
      <HiddenTagModeControl filter={filter} onChange={onChange} />
      {localTags.length === 0 && externalTags.length === 0 ? (
        <p className="text-[11px] text-t2-ink-3 italic py-1">Keine Tags vorhanden</p>
      ) : (
        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
          <button
            type="button"
            onClick={() => onChange(toggleUntaggedInFilter(filter))}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${filter.untagged ? ACTIVE : INACTIVE}`}
          >
            Ohne Tag
          </button>
          {localTags.map((tag) => (
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

      {externalTags.length > 0 && (
        <div className="mt-2 pt-2 border-t border-t2-line-soft">
          <button
            type="button"
            aria-expanded={wsOpen}
            onClick={() => setWsOpen((v) => !v)}
            className="flex w-full items-center gap-1.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-t2-ink-2 hover:text-t2-ink cursor-pointer"
          >
            <Layers size={11} className="shrink-0 text-t2-ink-3" />
            <span className="flex-1 text-left">Workspaces</span>
            {selectedExternalCount > 0 && (
              <span className="rounded-full bg-t2-sub px-1.5 text-[11px] text-t2-accent">{selectedExternalCount}</span>
            )}
            <ChevronDown size={12} className={`shrink-0 transition-transform ${wsOpen ? 'rotate-180' : ''}`} />
          </button>
          {wsOpen && (
            <div className="mt-1.5 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 rounded-lg border border-t2-line-soft bg-t2-sub/60 px-2 py-1">
                <Search size={11} className="shrink-0 text-t2-ink-3" />
                <input
                  value={wsQuery}
                  onChange={(e) => setWsQuery(e.target.value)}
                  placeholder="Tags anderer Workspaces suchen…"
                  aria-label="Tags anderer Workspaces suchen"
                  className="w-full bg-transparent text-[11.5px] text-t2-ink outline-none placeholder:text-t2-ink-3"
                />
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                {visibleExternal.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => onChange(toggleTagInFilter(filter, tag.id))}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      filter.tagIds.includes(tag.id) ? ACTIVE : INACTIVE
                    }`}
                  >
                    <WorkspacePrefixBox safe={tagSafe(tag)} />
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color || DEFAULT_TAG_COLOR }} />
                    {tag.title}
                  </button>
                ))}
                {visibleExternal.length === 0 && (
                  <p className="text-[11px] text-t2-ink-3 italic py-1">Kein passender Tag</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TodoTagFilterPanel;
