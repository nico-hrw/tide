'use client';

import React, { createContext, useContext } from 'react';
import { useTagRegistry } from '@/components/Todo/useTodoTags';

type TagCreator = (title: string) => Promise<string | undefined>;

const TagCreateContext = createContext<TagCreator | undefined>(undefined);

/** Provided once in app/page.tsx with `handleCreateEventGroup`. */
export const TagCreateProvider: React.FC<{ create: TagCreator; children: React.ReactNode }> = ({ create, children }) => (
  <TagCreateContext.Provider value={create}>{children}</TagCreateContext.Provider>
);

/**
 * Returns a creator that reuses an existing tag with the same normalized name
 * (case-insensitive), dedupes in-flight creations, and otherwise creates via
 * the provided `handleCreateEventGroup`.
 */
export function useTagCreate(): TagCreator {
  const create = useContext(TagCreateContext);
  return useTagRegistry(create).ensureTag;
}
