import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MobileCreateModal } from '../MobileCreateModal';
import { useDataStore } from '@/store/useDataStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const THEMES = [{ id: 'a', title: 'Arbeit' }, { id: 'b', title: 'Privat' }];

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function typeTitle(value: string) {
  const input = host.querySelector('input[type="text"]') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const button = (text: string) =>
  Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement;

function renderEventModal(onSaveEvent: ReturnType<typeof vi.fn>) {
  act(() => {
    root.render(
      <MobileCreateModal isOpen mode="event" themes={THEMES} onClose={() => {}} onSaveEvent={onSaveEvent} />,
    );
  });
}

describe('MobileCreateModal tag prompt (event)', () => {
  it('asks before saving without tag, then saves without groupIds on confirm', async () => {
    const onSave = vi.fn();
    renderEventModal(onSave);
    typeTitle('Meeting');
    await act(async () => { button('Hinzufügen').click(); });
    expect(host.textContent).toContain('Ohne Tag speichern?');
    expect(onSave).not.toHaveBeenCalled();
    await act(async () => { button('Ohne Tag speichern').click(); });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][2]).toMatchObject({ title: 'Meeting', groupIds: [], parent_id: null });
  });

  it('saves with selected tag ids and parent_id without prompting', async () => {
    const onSave = vi.fn();
    renderEventModal(onSave);
    typeTitle('Meeting');
    act(() => { (host.querySelector('button[aria-label="Tag hinzufügen"]') as HTMLButtonElement).click(); });
    act(() => { (Array.from(document.querySelectorAll('[role="option"]')).find((o) => o.textContent === 'Privat') as HTMLElement).click(); });
    await act(async () => { button('Hinzufügen').click(); });
    expect(host.textContent).not.toContain('Ohne Tag speichern?');
    expect(onSave.mock.calls[0][2]).toMatchObject({ groupIds: ['b'], parent_id: 'b' });
  });
});

describe('MobileCreateModal todo preselect', () => {
  it('drops stale filter ids from the preselected tags', async () => {
    useDataStore.getState().setTodoTagFilter({ tagIds: ['a', 'gone'], untagged: false });
    const onSaveTodo = vi.fn();
    act(() => {
      root.render(
        <MobileCreateModal isOpen mode="todo" themes={THEMES} onClose={() => {}} onSaveTodo={onSaveTodo} />,
      );
    });
    typeTitle('Aufgabe');
    await act(async () => { button('Hinzufügen').click(); });
    expect(onSaveTodo).toHaveBeenCalledTimes(1);
    expect(onSaveTodo.mock.calls[0][0].tags).toEqual(['a']);
    useDataStore.getState().setTodoTagFilter({ tagIds: [], untagged: false });
  });
});

describe('MobileCreateModal event preselect', () => {
  it('preselects pruned calendar filter tags in event mode', async () => {
    useDataStore.getState().setCalendarTagFilter({ tagIds: ['b', 'gone'], untagged: false });
    const onSave = vi.fn();
    renderEventModal(onSave);
    typeTitle('Meeting');
    await act(async () => { button('Hinzufügen').click(); });
    expect(host.textContent).not.toContain('Ohne Tag speichern?');
    expect(onSave.mock.calls[0][2]).toMatchObject({ groupIds: ['b'], parent_id: 'b' });
    useDataStore.getState().setCalendarTagFilter({ tagIds: [], untagged: false });
  });
});
