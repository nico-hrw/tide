import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CalendarViewsMenu } from '../CalendarViewsMenu';
import { useDataStore } from '@/store/useDataStore';
import type { SavedView } from '@/lib/viewsStorage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TAGS = [{ id: 'a', title: 'Arbeit', color: 'balsam' }, { id: 'b', title: 'Privat' }];
const VIEWS: SavedView[] = [
  { id: 'v1', name: 'Fokus', tagIds: ['a', 'gone'], untagged: false, viewMode: 'month' },
  { id: 'v2', name: 'Alles offen', tagIds: [], untagged: true, viewMode: 'day' },
];

let root: Root;
let host: HTMLDivElement;
const addView = vi.fn(async () => 'new');

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  addView.mockClear();
  useDataStore.setState({
    views: VIEWS,
    addView,
    calendarTagFilter: { tagIds: [], untagged: false },
    todoTagFilter: { tagIds: [], untagged: false },
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const btn = (text: string) =>
  Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes(text));

function mount(onViewModeChange = vi.fn(), onOpenTodos?: () => void) {
  act(() => root.render(
    <CalendarViewsMenu tags={TAGS} viewMode="week" onViewModeChange={onViewModeChange} onOpenTodos={onOpenTodos} />,
  ));
  act(() => btn('Ansichten')!.click());
  return onViewModeChange;
}

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('CalendarViewsMenu', () => {
  it('lists the saved view names after opening', () => {
    mount();
    expect(host.textContent).toContain('Fokus');
    expect(host.textContent).toContain('Alles offen');
  });

  it('clicking a view applies the pruned filter and the mode', () => {
    const onMode = mount();
    act(() => btn('Fokus')!.click());
    expect(useDataStore.getState().calendarTagFilter).toEqual({ tagIds: ['a'], untagged: false });
    expect(onMode).toHaveBeenCalledWith('month');
  });

  it('Save is disabled for an empty name and saves the pruned filter with the current mode', () => {
    mount();
    act(() => useDataStore.setState({ calendarTagFilter: { tagIds: ['b', 'gone'], untagged: true } }));
    const save = btn('Speichern')! as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    setInput(host.querySelector('input[placeholder="Name der Ansicht"]')!, '   ');
    expect((btn('Speichern') as HTMLButtonElement).disabled).toBe(true);
    setInput(host.querySelector('input[placeholder="Name der Ansicht"]')!, ' Neu ');
    const enabled = btn('Speichern') as HTMLButtonElement;
    expect(enabled.disabled).toBe(false);
    act(() => enabled.click());
    expect(addView).toHaveBeenCalledWith({ name: 'Neu', tagIds: ['b'], untagged: true, viewMode: 'week' });
  });

  it('hides the todo jump when the filter is empty', () => {
    mount(vi.fn(), vi.fn());
    expect(btn('Todos zu diesen Tags')).toBeUndefined();
  });

  it('todo jump copies the pruned filter to the todo filter and opens todos', () => {
    useDataStore.setState({ calendarTagFilter: { tagIds: ['a', 'gone'], untagged: false } });
    const open = vi.fn();
    mount(vi.fn(), open);
    act(() => btn('Todos zu diesen Tags')!.click());
    expect(useDataStore.getState().todoTagFilter).toEqual({ tagIds: ['a'], untagged: false });
    expect(open).toHaveBeenCalled();
  });

  it('omits the todo jump when no opener is given', () => {
    useDataStore.setState({ calendarTagFilter: { tagIds: ['a'], untagged: false } });
    mount();
    expect(btn('Todos zu diesen Tags')).toBeUndefined();
  });
});
