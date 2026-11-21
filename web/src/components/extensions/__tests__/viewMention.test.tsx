import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { NodeViewProps } from '@tiptap/react';
import { ViewMentionNodeView, resolveViewMention } from '../ViewMentionExtension';
import { matchViews, buildViewItems, capSuggestionItems } from '../viewSuggestion';
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

  const nameBtn = () => host.querySelector('[data-view-open="calendar"]') as HTMLElement;
  const todosBtn = () => host.querySelector('[data-view-open="todos"]') as HTMLElement;
  const clickDetails = (viewId: string, el: () => HTMLElement) => {
    const spy = vi.fn();
    window.addEventListener('viewMention:click', spy);
    act(() => root.render(<ViewMentionNodeView {...props(viewId)} />));
    act(() => el().click());
    window.removeEventListener('viewMention:click', spy);
    return spy.mock.calls.map((c) => (c[0] as CustomEvent).detail);
  };

  it('shows the live view name and dispatches target calendar on a name click', () => {
    act(() => root.render(<ViewMentionNodeView {...props('v1')} />));
    expect(chip().textContent).toContain('Reise Japan');
    expect(clickDetails('v1', nameBtn)).toEqual([{ viewId: 'v1', target: 'calendar' }]);
    expect(nameBtn().getAttribute('aria-label')).toBe('Kalender öffnen: Reise Japan');
  });

  it('dispatches target todos on a click on the Todos part', () => {
    expect(clickDetails('v1', todosBtn)).toEqual([{ viewId: 'v1', target: 'todos' }]);
    expect(todosBtn().textContent).toContain('Todos');
    expect(todosBtn().getAttribute('aria-label')).toBe('Todos öffnen: Reise Japan');
  });

  it('is greyed out and does not dispatch when the view is gone', () => {
    expect(clickDetails('gone', nameBtn)).toEqual([]);
    expect(clickDetails('gone', todosBtn)).toEqual([]);
    expect(chip().textContent).toContain('Ansicht gelöscht');
    expect(chip().getAttribute('data-missing')).toBe('true');
    expect(nameBtn().getAttribute('aria-disabled')).toBe('true');
    expect(todosBtn().getAttribute('aria-disabled')).toBe('true');
  });
});

describe('capSuggestionItems', () => {
  const rows = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i}`);
  it('keeps everything in order content, views, actions when it fits', () => {
    expect(capSuggestionItems(rows('c', 4), ['v0'], ['a0', 'a1'])).toEqual(['c0', 'c1', 'c2', 'c3', 'v0', 'a0', 'a1']);
  });
  it('reserves room for 3 views and 2 actions when content overflows', () => {
    const out = capSuggestionItems(rows('c', 19), rows('v', 3), rows('a', 2));
    expect(out).toHaveLength(10);
    expect(out).toEqual([...rows('c', 5), ...rows('v', 3), ...rows('a', 2)]);
  });
  it('keeps the actions last when there are no views and lots of content', () => {
    const out = capSuggestionItems(rows('c', 19), [], rows('a', 2));
    expect(out).toHaveLength(10);
    expect(out.slice(-2)).toEqual(['a0', 'a1']);
  });
  it('is unchanged without views and with few content rows', () => {
    expect(capSuggestionItems(rows('c', 3), [], rows('a', 2))).toEqual(['c0', 'c1', 'c2', 'a0', 'a1']);
  });
});
