import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MobileTodoDetail } from '../MobileTodoDetail';
import { MobileTodoView } from '../MobileTodoView';
import { useDataStore } from '@/store/useDataStore';
import type { TaskItem } from '@/store/useDataStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mk = (extra: Partial<TaskItem>): TaskItem => ({
  id: 't1',
  title: 'Eltern',
  status: 'todo',
  isCompleted: false,
  ...extra,
} as TaskItem);

describe('MobileTodoDetail', () => {
  let root: Root;
  let host: HTMLDivElement;
  const updateTask = vi.fn();
  const toggleTask = vi.fn();
  const addTask = vi.fn();

  beforeEach(() => {
    updateTask.mockReset();
    toggleTask.mockReset();
    addTask.mockReset();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function setTasks(tasks: TaskItem[]) {
    useDataStore.setState({ tasks, updateTask, toggleTask, addTask } as never);
  }

  function renderDetail(task: TaskItem, tasks: TaskItem[], onOpenSubtask = vi.fn(), onBack = vi.fn()) {
    setTasks(tasks);
    act(() => {
      root.render(
        <MobileTodoDetail
          key={task.id}
          task={task}
          parent={task.parentId ? tasks.find((t) => t.id === task.parentId) : undefined}
          onBack={onBack}
          onOpenSubtask={onOpenSubtask}
        />,
      );
    });
    return { onOpenSubtask, onBack };
  }

  const area = () => host.querySelector('textarea[aria-label="Beschreibung"]') as HTMLTextAreaElement;
  const dateInput = () => host.querySelector('input[type="date"]') as HTMLInputElement;

  function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('shows the description and saves it verbatim on blur', () => {
    const t = mk({ description: 'Hallo' });
    renderDetail(t, [t]);
    expect(area().value).toBe('Hallo');
    act(() => setValue(area(), 'Zeile 1\nZeile 2'));
    act(() => { area().dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    expect(updateTask).toHaveBeenCalledWith('t1', { description: 'Zeile 1\nZeile 2' });
  });

  it('shows a description textarea for subtasks too', () => {
    const p = mk({});
    const s = mk({ id: 's1', parentId: 't1', description: 'Sub' });
    renderDetail(s, [p, s]);
    expect(area().value).toBe('Sub');
  });

  it('bounds a subtask date by the parent due date and clamps changes', () => {
    const p = mk({ dueDate: '2026-11-25' });
    const s = mk({ id: 's1', parentId: 't1', dueDate: '2026-11-20' });
    renderDetail(s, [p, s]);
    expect(dateInput().max).toBe('2026-11-25');
    // jsdom drops out-of-range values on inputs with a max (browsers keep them): lift max while typing.
    const input = dateInput();
    input.removeAttribute('max');
    act(() => setValue(input, '2026-11-30'));
    expect(updateTask).toHaveBeenCalledWith('s1', { dueDate: '2026-11-25', scheduledDate: '2026-11-25' });
  });

  it('has no max when the parent has no due date', () => {
    const p = mk({});
    const s = mk({ id: 's1', parentId: 't1' });
    renderDetail(s, [p, s]);
    expect(dateInput().max).toBe('');
  });

  it('opens a subtask via its title, toggles via its checkbox without opening', () => {
    const p = mk({});
    const c = mk({ id: 'c1', parentId: 't1', title: 'Kind' });
    const { onOpenSubtask } = renderDetail(p, [p, c]);
    const title = host.querySelector('[data-testid="subtask-title-c1"]') as HTMLElement;
    act(() => { title.click(); });
    expect(onOpenSubtask).toHaveBeenCalledWith('c1');
    expect(toggleTask).not.toHaveBeenCalled();

    onOpenSubtask.mockClear();
    const box = host.querySelector('[data-testid="subtask-check-c1"]') as HTMLElement;
    act(() => { box.click(); });
    expect(toggleTask).toHaveBeenCalledWith('c1');
    expect(onOpenSubtask).not.toHaveBeenCalled();
  });

  it('renders no add-subtask input inside a subtask detail', () => {
    const p = mk({});
    const s = mk({ id: 's1', parentId: 't1' });
    renderDetail(s, [p, s]);
    expect(host.querySelector('input[placeholder="Untertodo hinzufügen"]')).toBeNull();
    renderDetail(p, [p, s]);
    expect(host.querySelector('input[placeholder="Untertodo hinzufügen"]')).not.toBeNull();
  });

  it('shows the parent hint in a subtask detail', () => {
    const p = mk({});
    const s = mk({ id: 's1', parentId: 't1' });
    renderDetail(s, [p, s]);
    expect(host.textContent).toContain('Untertodo von «Eltern»');
  });

  it('view: back from a subtask detail returns to the parent detail', () => {
    const p = mk({});
    const c = mk({ id: 'c1', parentId: 't1', title: 'Kind' });
    setTasks([p, c]);
    act(() => { root.render(<MobileTodoView />); });
    const card = Array.from(host.querySelectorAll('[role="button"]')).find((e) => e.textContent?.includes('Eltern')) as HTMLElement;
    act(() => { card.click(); });
    act(() => { (host.querySelector('[data-testid="subtask-title-c1"]') as HTMLElement).click(); });
    expect(host.textContent).toContain('Untertodo von «Eltern»');
    act(() => { (host.querySelector('button[aria-label="Zurück"]') as HTMLElement).click(); });
    expect(host.textContent).not.toContain('Untertodo von');
    expect(host.querySelector('[data-testid="subtask-title-c1"]')).not.toBeNull();
    act(() => { (host.querySelector('button[aria-label="Zurück"]') as HTMLElement).click(); });
    expect(host.textContent).toContain('Todos');
  });
});
