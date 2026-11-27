import { describe, expect, it } from 'vitest';
import { flatten, moveTab, reconcileRows, resolveDrop, type RowBox, type TabRows } from '@/lib/tabLayout';

const one: TabRows = [[['todos', 'a', 'b']]];

describe('reconcileRows', () => {
  it('starts with one group holding every tab', () => {
    expect(reconcileRows([], ['todos', 'a'])).toEqual([[['todos', 'a']]]);
  });
  it('drops closed tabs and adds new ones at the end', () => {
    expect(reconcileRows([[['a', 'x']], [['b']]], ['a', 'b', 'c'])).toEqual([[['a']], [['b', 'c']]]);
  });
  it('removes empty groups and rows', () => {
    expect(reconcileRows([[['x']], [['a']]], ['a'])).toEqual([[['a']]]);
  });
});

describe('moveTab', () => {
  it('reorders inside a group', () => {
    expect(moveTab(one, 'b', { kind: 'before', ref: 'todos' })).toEqual([[['b', 'todos', 'a']]]);
  });
  it('drops a tab to the far left of its row as a new group', () => {
    expect(moveTab(one, 'b', { kind: 'rowStart', ref: 'a' })).toEqual([[['b'], ['todos', 'a']]]);
  });
  it('drops between two groups as a new group', () => {
    const rows: TabRows = [[['a'], ['b']]];
    expect(moveTab(rows, 'a', { kind: 'groupBefore', ref: 'b' })).toEqual([[['a'], ['b']]].map((r) => r));
    expect(moveTab([[['a'], ['b', 'c']]], 'c', { kind: 'groupBefore', ref: 'a' })).toEqual([[['c'], ['a'], ['b']]]);
  });
  it('drops below a group into a new row', () => {
    expect(moveTab([[['a'], ['b']]], 'b', { kind: 'rowBelow', ref: 'a' })).toEqual([[['a']], [['b']]]);
  });
  it('removes an empty group and an empty row when a tab leaves them', () => {
    expect(moveTab([[['a']], [['b', 'c']]], 'a', { kind: 'intoGroup', ref: 'c' })).toEqual([[['b', 'c', 'a']]]);
  });
  it('drops the last tab of a row to the right edge as its own group', () => {
    expect(moveTab(one, 'b', { kind: 'rowEnd', ref: 'b' })).toEqual([[['todos', 'a'], ['b']]]);
  });
  it('drops the last tab of a row to the left edge as its own group', () => {
    expect(moveTab(one, 'b', { kind: 'rowStart', ref: 'b' })).toEqual([[['b'], ['todos', 'a']]]);
  });
  it('drops a tab below its own row as a new row', () => {
    expect(moveTab(one, 'b', { kind: 'rowBelow', ref: 'b' })).toEqual([[['todos', 'a']], [['b']]]);
  });
  it('keeps the layout when the target is missing or the tab drops on itself', () => {
    expect(moveTab(one, 'a', { kind: 'after', ref: 'a' })).toEqual(one);
    expect(moveTab(one, 'a', { kind: 'after', ref: 'zz' })).toEqual(one);
  });
  it('flattens row by row', () => {
    expect(flatten([[['a', 'b'], ['c']], [['d']]])).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('resolveDrop', () => {
  // Row 0: group [a, b] and group [c] with a 20 px gap between them; row 1 below it: [d].
  const rows: RowBox[] = [
    {
      top: 0,
      bottom: 34,
      tabs: [
        { id: 'a', left: 0, right: 80, group: 0 },
        { id: 'b', left: 84, right: 164, group: 0 },
        { id: 'c', left: 184, right: 264, group: 1 },
      ],
    },
    { top: 44, bottom: 78, tabs: [{ id: 'd', left: 0, right: 80, group: 0 }] },
  ];

  it('joins the group of a tab it is dropped right next to, on that tab\'s side', () => {
    expect(resolveDrop(rows, 'd', 150, 17)).toEqual({ kind: 'after', ref: 'b' });
    expect(resolveDrop(rows, 'd', 10, 17)).toEqual({ kind: 'before', ref: 'a' });
  });
  it('places between two tabs of the same group', () => {
    expect(resolveDrop(rows, 'd', 82, 17)).toEqual({ kind: 'before', ref: 'b' });
  });
  it('makes a new group in the gap between two groups', () => {
    expect(resolveDrop(rows, 'd', 174, 17)).toEqual({ kind: 'groupBefore', ref: 'c' });
  });
  it('makes a new group past either end of a row, and stays in the group just inside the margin', () => {
    expect(resolveDrop(rows, 'd', 300, 17)).toEqual({ kind: 'rowEnd', ref: 'c' });
    expect(resolveDrop(rows, 'd', -20, 17)).toEqual({ kind: 'rowStart', ref: 'a' });
    expect(resolveDrop(rows, 'd', 270, 17)).toEqual({ kind: 'after', ref: 'c' });
  });
  it('makes a new row above the first, below the last and between two rows', () => {
    expect(resolveDrop(rows, 'b', 40, -20)).toEqual({ kind: 'rowAbove', ref: 'a' });
    expect(resolveDrop(rows, 'b', 40, 100)).toEqual({ kind: 'rowBelow', ref: 'd' });
    expect(resolveDrop(rows, 'b', 40, 39)).toEqual({ kind: 'rowBelow', ref: 'a' });
  });
  it('changes nothing on the dragged tab itself', () => {
    const t = resolveDrop(rows, 'b', 120, 17);
    expect(t).toEqual({ kind: 'before', ref: 'b' });
    expect(moveTab([[['a', 'b'], ['c']], [['d']]], 'b', t!)).toEqual([[['a', 'b'], ['c']], [['d']]]);
  });
  it('finds the row by the pointer height', () => {
    expect(resolveDrop(rows, 'a', 30, 60)).toEqual({ kind: 'before', ref: 'd' });
  });
  it('returns null when there are no tabs', () => {
    expect(resolveDrop([], 'a', 0, 0)).toBeNull();
  });
});
