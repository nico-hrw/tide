import { describe, expect, it } from 'vitest';
import { getVisibilityState } from '../visibilityState';

describe('getVisibilityState', () => {
  it('private owner', () => {
    expect(getVisibilityState({ visibility: 'private', isOwner: true })).toEqual({ kind: 'private', count: 0 });
  });
  it('shared with count', () => {
    expect(getVisibilityState({ visibility: 'private', isOwner: true, sharedWith: [{ userId: 'a' }, { userId: 'b' }] }))
      .toEqual({ kind: 'shared', count: 2 });
  });
  it('shared-with-me for non-owner', () => {
    expect(getVisibilityState({ visibility: 'private', isOwner: false })).toEqual({ kind: 'shared-with-me', count: 0 });
  });
  it('public wins over shared', () => {
    expect(getVisibilityState({ visibility: 'public', isOwner: true, sharedWith: [{ userId: 'a' }] }))
      .toEqual({ kind: 'public', count: 0 });
  });
});
