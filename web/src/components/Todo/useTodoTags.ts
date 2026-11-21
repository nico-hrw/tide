import { useCallback, useMemo } from 'react';
import { useDataStore } from '@/store/useDataStore';
import { normalizeTagName, selectTags, type Tag } from '@/lib/tags';

export const DEFAULT_TAG_COLOR = '#3b82f6';

export interface TagRegistry {
  /** All tags, sorted by title. */
  tags: Tag[];
  byId: Map<string, Tag>;
  knownIds: Set<string>;
  /** Resolves tag ids to tags; unknown ids are skipped. */
  resolve: (ids: readonly string[] | undefined) => Tag[];
  /** Existing tag id for the name (normalized compare), or created via onCreateTag. */
  ensureTag: (name: string) => Promise<string | undefined>;
}

/** Tag registry for todos; tags are the group files in the data store. */
export function useTagRegistry(onCreateTag?: (title: string) => Promise<string | undefined>): TagRegistry {
  const notes = useDataStore((s) => s.notes);
  const tags = useMemo(
    () => selectTags(notes).sort((a, b) => a.title.localeCompare(b.title)),
    [notes],
  );
  const byId = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const knownIds = useMemo(() => new Set(tags.map((t) => t.id)), [tags]);
  const resolve = useCallback(
    (ids: readonly string[] | undefined) =>
      (ids ?? []).map((id) => byId.get(id)).filter((t): t is Tag => t !== undefined),
    [byId],
  );
  const ensureTag = useCallback(
    async (name: string) => {
      const key = normalizeTagName(name);
      if (!key) return undefined;
      const existing = tags.find((t) => normalizeTagName(t.title) === key);
      if (existing) return existing.id;
      return onCreateTag ? onCreateTag(name.trim()) : undefined;
    },
    [tags, onCreateTag],
  );
  return { tags, byId, knownIds, resolve, ensureTag };
}
