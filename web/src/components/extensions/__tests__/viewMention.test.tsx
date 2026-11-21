import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { NodeViewProps } from '@tiptap/react';
import { ViewMentionNodeView, resolveViewMention } from '../ViewMentionExtension';
import { matchViews, buildViewItems } from '../viewSuggestion';
import { useDataStore } from '@/store/useDataStore';
import type { SavedView } from '@/lib/viewsStorage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VIEWS: SavedView[] = [
  { id: 'v1', name: 'Reise Japan', tagIds: ['a'], untagged: false, viewMode: 'month' },
  { id: 'v2', name: 'Arbeit', tagIds: [], untagged: true, viewMode: 'week' },
  { id: 'v3', name: 'Reiseplanung', tagIds: [], untagged: false, viewMode: 'day' },
];

describe('resolveViewMention', () => {
  it('returns the matching view', () => {
    expect(resolveViewMention('v1', VIEWS)).toBe(VIEWS[0]);
  });
  it('returns null for an unknown id', () => {
    expect(resolveViewMention('nope', VIEWS)).toBeNull();
  });
});

describe('matchViews', () => {
  it('matches case-insensitively on the name', () => {
    expect(matchViews('reise', VIEWS).map((v) => v.id)).toEqual(['v1', 'v3']);
    expect(matchViews('JAPAN', VIEWS).map((v) => v.id)).toEqual(['v1']);
  });
  it('returns all (max 5, order preserved) for an empty query', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...VIEWS[0], id: `x${i}`, name: `N${i}` }));
    expect(matchViews('', many).map((v) => v.id)).toEqual(['x0', 'x1', 'x2', 'x3', 'x4']);
    expect(matchViews('', VIEWS)).toHaveLength(3);
  });
  it('returns [] without a match', () => {
    expect(matchViews('zzz', VIEWS)).toEqual([]);
  });
});

describe('buildViewItems', () => {
  it('builds at most 3 view rows', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...VIEWS[0], id: `x${i}`, name: `N${i}` }));
    const items = buildViewItems('', many, []);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ id: 'x0', label: 'N0', type: 'view' });
  });
});

describe('ViewMentionNodeView', () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    useDataStore.setState({ views: VIEWS });
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const props = (viewId: string) => ({ node: { attrs: { viewId } } }) as unknown as NodeViewProps;
  const chip = () => host.querySelector('[data-view-chip]') as HTMLElement;

  it('shows the live view name and dispatches viewMention:click on click', () => {
    const spy = vi.fn();
    window.addEventListener('viewMention:click', spy);
    act(() => root.render(<ViewMentionNodeView {...props('v1')} />));
    expect(chip().textContent).toContain('Reise Japan');
    act(() => chip().click());
    window.removeEventListener('viewMention:click', spy);
    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.mock.calls[0][0] as CustomEvent).detail).toEqual({ viewId: 'v1' });
  });

  it('is greyed out and does not dispatch when the view is gone', () => {
    const spy = vi.fn();
    window.addEventListener('viewMention:click', spy);
    act(() => root.render(<ViewMentionNodeView {...props('gone')} />));
    expect(chip().textContent).toContain('Ansicht gelöscht');
    expect(chip().getAttribute('data-missing')).toBe('true');
    act(() => chip().click());
    window.removeEventListener('viewMention:click', spy);
    expect(spy).not.toHaveBeenCalled();
  });
});
