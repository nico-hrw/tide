'use client';

import React from 'react';
import { useDataStore } from '@/store/useDataStore';
import type { HiddenTagMode, TagFilter } from '@/lib/tagFilter';

const OPTIONS: { value: HiddenTagMode; label: string }[] = [
  { value: 'default', label: 'Standard' },
  { value: 'include', label: 'Auch ausgeblendete' },
  { value: 'only', label: 'Nur ausgeblendete' },
];

/**
 * Tag filter option for tags the user hides by default (settings). Shown only when there are such tags
 * or the mode is already changed. Keeps every other part of the filter as it is.
 */
export const HiddenTagModeControl: React.FC<{ filter: TagFilter; onChange: (next: TagFilter) => void }> = ({ filter, onChange }) => {
  const hiddenCount = useDataStore((s) => s.hiddenTagIds.length);
  const mode = filter.hidden ?? 'default';
  if (hiddenCount === 0 && mode === 'default') return null;
  return (
    <div role="radiogroup" aria-label="Standardmäßig ausgeblendete Tags" className="mb-2 flex flex-wrap gap-1">
      {OPTIONS.map((o) => {
        const on = mode === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange({ ...filter, hidden: o.value })}
            className={`rounded-md px-2 py-0.5 text-[11px] font-medium cursor-pointer ${
              on ? 'bg-t2-accent text-t2-accent-ink' : 'bg-t2-hover text-t2-ink-2 hover:bg-t2-stage'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
};

export default HiddenTagModeControl;
