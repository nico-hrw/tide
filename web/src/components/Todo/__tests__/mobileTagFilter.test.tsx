import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MobileTodoView } from '../MobileTodoView';
import { useDataStore } from '@/store/useDataStore';
import type { DataItem, TaskItem } from '@/store/slices/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const notes = [{ id: 'a', title: 'Arbeit', type: 'folder', isGroup: true }] as unknown as DataItem[];
const tasks = [
  { id: 't1', title: 'Berichte', isCompleted: false, tags: ['a'] },
  { id: 't2', title: 'Wäsche', isCompleted: false, tags: [] },
] as TaskItem[];

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  useDataStore.setState({ notes, tasks, todoTagFilter: { tagIds: [], untagged: false } });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('MobileTodoView tag filter', () => {
  it('shows every todo without a filter', () => {
    act(() => root.render(<MobileTodoView />));
    expect(host.textContent).toContain('Berichte');
    expect(host.textContent).toContain('Wäsche');
    expect(host.textContent).not.toContain('Filter zurücksetzen');
  });

  it('applies the todo tag filter and resets it from the chip', () => {
    useDataStore.setState({ todoTagFilter: { tagIds: ['a'], untagged: false } });
    act(() => root.render(<MobileTodoView />));
    expect(host.textContent).toContain('Berichte');
    expect(host.textContent).not.toContain('Wäsche');
    const chip = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes('Filter zurücksetzen'))!;
    act(() => chip.click());
    expect(useDataStore.getState().todoTagFilter).toEqual({ tagIds: [], untagged: false });
    expect(host.textContent).toContain('Wäsche');
  });

  it('ignores deleted tag ids in the filter', () => {
    useDataStore.setState({ todoTagFilter: { tagIds: ['gone'], untagged: false } });
    act(() => root.render(<MobileTodoView />));
    expect(host.textContent).toContain('Wäsche');
  });
});
