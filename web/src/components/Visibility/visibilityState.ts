export type VisibilityKind = 'private' | 'shared' | 'shared-with-me' | 'public';

export interface VisibilityInput {
  visibility?: string | null;
  isOwner: boolean;
  sharedWith?: ReadonlyArray<{ userId: string }>;
  /** Shared with others, recipient list unknown (no count is shown). */
  isShared?: boolean;
}

/** Derives the visibility icon state. Public wins over shared; non-owners see "shared with me". */
export function getVisibilityState(input: VisibilityInput): { kind: VisibilityKind; count: number } {
  if (input.visibility === 'public') return { kind: 'public', count: 0 };
  if (!input.isOwner) return { kind: 'shared-with-me', count: 0 };
  const count = input.sharedWith?.length ?? 0;
  if (count > 0) return { kind: 'shared', count };
  if (input.isShared) return { kind: 'shared', count: 0 };
  return { kind: 'private', count: 0 };
}
