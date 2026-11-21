'use client';

import React, { useMemo } from 'react';
import TagPicker from '@/components/Tags/TagPicker';
import { useTagCreate } from '@/components/Tags/useTagCreate';
import { useNoteTags } from '@/hooks/dashboard/useNoteTags';
import { selectTags } from '@/lib/tags';
import { useDataStore } from '@/store/useDataStore';

const NO_IDS: string[] = [];

/** Tag picker under the note title. Only the owner can edit the tags, so everyone else sees nothing. */
export const NoteTagsRow: React.FC<{ noteId: string; isOwner: boolean }> = ({ noteId, isOwner }) => {
  const notes = useDataStore((s) => s.notes);
  const noteTagIds = useDataStore((s) => s.notes.find((n) => n.id === noteId)?.tagIds) ?? NO_IDS;
  const registry = useMemo(() => selectTags(notes), [notes]);
  const { setNoteTags } = useNoteTags();
  const create = useTagCreate();

  const value = useMemo(() => {
    const known = new Set(registry.map((t) => t.id));
    return noteTagIds.filter((id) => known.has(id));
  }, [registry, noteTagIds]);

  if (!isOwner) return null;
  return (
    <div className="-mt-3 mb-5">
      <TagPicker tags={registry} value={value} onChange={(ids) => void setNoteTags(noteId, ids)} onCreate={create} compact />
    </div>
  );
};

export default NoteTagsRow;
