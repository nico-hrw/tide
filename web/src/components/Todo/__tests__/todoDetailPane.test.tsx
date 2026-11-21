import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TodoDetailPane } from '../TodoDetailPane';
import type { TaskItem } from '@/store/useDataStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mk = (extra: Partial<TaskItem>): TaskItem => ({
  id: 't1',
  title: 'Todo',
  status: 'todo',
  isCompleted: false,
  ...extra,
} as TaskItem);

describe('TodoDetailPane', () => {
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

  function render(task: TaskItem, parent?: TaskItem, onUpdate = vi.fn()) {
    act(() => {
      root.render(
        <TodoDetailPane
          key={task.id}
          task={task}
          parent={parent}
          subtasks={[]}
          folders={[]}
          onUpdate={onUpdate}
          onToggleSubtask={() => {}}
          onAddSubtask={() => {}}
          onDelete={() => {}}
          onOpenTask={() => {}}
        />,
      );
    });
    return onUpdate;
  }

  const area = () => host.querySelector('[data-testid="todo-description"]') as HTMLTextAreaElement;
  const dateInput = () => host.querySelector('input[type="date"]') as HTMLInputElement;

  function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLTextAreaElement ? 'input' : 'input', { bubbles: true }));
  }

  it('shows the description of a main todo and a subtask', () => {
    render(mk({ description: 'Hallo' }));
    expect(area().value).toBe('Hallo');
    render(mk({ id: 's1', parentId: 't1', description: 'Sub' }), mk({}));
    expect(area().value).toBe('Sub');
  });

  it('saves the multi-line description verbatim on blur', () => {
    const onUpdate = render(mk({}));
    act(() => setValue(area(), 'Zeile 1\nZeile 2'));
    act(() => { area().dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    expect(onUpdate).toHaveBeenCalledWith('t1', { description: 'Zeile 1\nZeile 2' });
  });

  it('bounds a subtask date by the parent due date and clamps changes', () => {
    const onUpdate = render(mk({ id: 's1', parentId: 't1', dueDate: '2026-11-20' }), mk({ dueDate: '2026-11-25' }));
    expect(dateInput().max).toBe('2026-11-25');
    // jsdom drops out-of-range values on inputs with a max (browsers keep them): lift max while typing.
    const input = dateInput();
    input.removeAttribute('max');
    act(() => setValue(input, '2026-11-30'));
    expect(onUpdate).toHaveBeenCalledWith('s1', { dueDate: '2026-11-25', scheduledDate: '2026-11-25' });
  });

  it('has no max when the parent has no due date', () => {
    render(mk({ id: 's1', parentId: 't1' }), mk({}));
    expect(dateInput().max).toBe('');
  });
});
