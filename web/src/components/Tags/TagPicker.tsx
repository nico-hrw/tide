'use client';

import React, { useRef, useState } from 'react';
import { Plus, Check } from 'lucide-react';
import type { Tag } from '@/lib/tags';
import { DEFAULT_TAG_COLOR } from '@/components/Todo/useTodoTags';

export interface TagPickerProps {
  tags: Tag[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** Returns the id of the existing or newly created tag with this title. */
  onCreate: (title: string) => Promise<string | undefined>;
  compact?: boolean;
}

/** Multi-select tag chips with an inline "+" field to create a tag. */
export const TagPicker: React.FC<TagPickerProps> = ({ tags, value, onChange, onCreate, compact }) => {
  const [input, setInput] = useState('');
  const creating = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const submit = async () => {
    const title = input.trim();
    if (!title || creating.current) return;
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
    setInput('');
  };

  const chipPad = compact ? 'px-2 py-0.5' : 'px-2.5 py-1';
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => {
        const selected = value.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            aria-pressed={selected}
            onClick={() => toggle(tag.id)}
            className={`inline-flex items-center gap-1 ${chipPad} rounded-lg text-xs font-medium border transition-all cursor-pointer ${
              selected
                ? 'bg-t2-sub text-t2-accent border-t2-accent shadow-2xs'
                : 'bg-t2-hover text-t2-ink-2 border-t2-line'
            }`}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color || DEFAULT_TAG_COLOR }} />
            <span>{tag.title}</span>
            {selected && <Check size={11} className="text-t2-accent" />}
          </button>
        );
      })}
      <div className={`inline-flex items-center gap-1 bg-t2-sub border border-t2-line rounded-lg px-2 ${compact ? 'py-0' : 'py-0.5'}`}>
        <Plus size={12} className="text-t2-ink-3 shrink-0" />
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Neuer Tag..."
          aria-label="Neuer Tag"
          className="w-20 sm:w-24 text-xs bg-transparent text-t2-ink placeholder-t2-ink-3 focus:outline-none py-0.5"
        />
      </div>
    </div>
  );
};

export default TagPicker;
