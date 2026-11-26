import { describe, expect, it } from 'vitest';
import { flatten, moveTab, reconcileRows, type TabRows } from '@/lib/tabLayout';

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
