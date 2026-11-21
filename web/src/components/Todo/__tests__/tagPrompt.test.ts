import { describe, it, expect } from 'vitest';
import { needsNoTagConfirm, defaultTagIds } from '@/lib/tagPrompt';

describe('needsNoTagConfirm', () => {
  it('asks when no tag and not confirmed', () => {
    expect(needsNoTagConfirm([], false)).toBe(true);
  });
  it('does not ask when a tag is set', () => {
    expect(needsNoTagConfirm(['t1'], false)).toBe(false);
  });
  it('does not ask once confirmed', () => {
    expect(needsNoTagConfirm([], true)).toBe(false);
  });
});

describe('defaultTagIds', () => {
  it('returns the filter tag ids', () => {
    expect(defaultTagIds({ tagIds: ['a'], untagged: false })).toEqual(['a']);
  });
  it('returns nothing for untagged-only', () => {
    expect(defaultTagIds({ tagIds: [], untagged: true })).toEqual([]);
  });
});
