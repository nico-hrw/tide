import { describe, it, expect, beforeEach } from 'vitest';
import {
  newEventMeta,
  markInteractiveCreate,
  isInteractiveCreate,
  clearInteractiveCreate,
  shouldPromptNoTag,
} from '@/lib/tagPrompt';

describe('newEventMeta', () => {
  it('uses the filter tags with the first one as parent_id', () => {
    expect(newEventMeta({ tagIds: ['a', 'b'], untagged: false })).toEqual({ groupIds: ['a', 'b'], parent_id: 'a' });
  });
  it('is empty for an empty filter', () => {
    expect(newEventMeta({ tagIds: [], untagged: false })).toEqual({ groupIds: [], parent_id: null });
  });
  it('does not alias the filter array', () => {
    const filter = { tagIds: ['a'], untagged: false };
    expect(newEventMeta(filter).groupIds).not.toBe(filter.tagIds);
  });
});

describe('interactive create registry', () => {
  beforeEach(() => clearInteractiveCreate('e1'));
  it('marks, checks and clears an id', () => {
    expect(isInteractiveCreate('e1')).toBe(false);
    markInteractiveCreate('e1');
    expect(isInteractiveCreate('e1')).toBe(true);
    clearInteractiveCreate('e1');
    expect(isInteractiveCreate('e1')).toBe(false);
  });
  it('ignores null ids', () => {
    markInteractiveCreate(null);
    expect(isInteractiveCreate(null)).toBe(false);
  });
});

describe('shouldPromptNoTag', () => {
  it('prompts only for an interactive create without known tags', () => {
    markInteractiveCreate('e1');
    const known = new Set(['t1']);
    expect(shouldPromptNoTag('e1', [], known)).toBe(true);
    expect(shouldPromptNoTag('e1', ['gone'], known)).toBe(true);
    expect(shouldPromptNoTag('e1', ['t1'], known)).toBe(false);
    expect(shouldPromptNoTag('other', [], known)).toBe(false);
  });
});
