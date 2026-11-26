"use client";

import React from 'react';
import { Tag as TagIcon } from 'lucide-react';
import type { Tag } from '@/lib/tags';
import TagPicker from '@/components/Tags/TagPicker';
import NoTagConfirm from '@/components/Tags/NoTagConfirm';
import { useTagCreate } from '@/components/Tags/useTagCreate';

export interface MobileTagFieldProps {
  tags: Tag[];
  value: string[];
  onChange: (ids: string[]) => void;
  isDark: boolean;
  showNoTagPrompt: boolean;
  onNoTagConfirm: () => void;
  onNoTagChoose: () => void;
  /** Adds the bottom border when another row follows. */
  bordered?: boolean;
}

/** Tag row of the mobile create modal: picker plus the inline "save without tag?" question. */
export const MobileTagField: React.FC<MobileTagFieldProps> = ({
  tags, value, onChange, showNoTagPrompt, onNoTagConfirm, onNoTagChoose, bordered,
}) => {
  const createTag = useTagCreate();
  return (
    <div
      className={`flex flex-col gap-2.5 px-4 py-3.5 ${bordered ? 'border-b' : ''}`}
      style={{ borderColor: 'var(--t2-line-soft)' }}
    >
      <div className="flex items-center gap-2.5">
        <TagIcon size={18} className="text-t2-ink-3" />
        <span className="text-[16px]" style={{ color: 'var(--t2-ink)' }}>
          Tags
        </span>
      </div>
      <TagPicker tags={tags} value={value} onChange={onChange} onCreate={createTag} />
      {showNoTagPrompt && <NoTagConfirm onConfirm={onNoTagConfirm} onChoose={onNoTagChoose} />}
    </div>
  );
};

export default MobileTagField;
