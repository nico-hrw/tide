import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TodoCard } from '../TodoCard';
import { TodoDetailPane } from '../TodoDetailPane';
import type { TaskItem } from '@/store/useDataStore';
import type { TaskWithChildren } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mk = (extra: Partial<TaskItem>): TaskWithChildren => ({
  id: 't1', title: 'Steuer', status: 'todo', isCompleted: false, children: [], ...extra,
} as TaskWithChildren);

describe('quick reschedule on the desktop todo views', () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 26, 9, 41, 17)); // Thu 26 Nov 2026, local
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
  });

  const bar = () => host.querySelector('[data-testid="todo-reschedule"]');
  const opt = (key: string) => host.querySelector(`[data-reschedule="${key}"]`) as HTMLButtonElement;
  const badge = () => host.querySelector('button[aria-expanded]') as HTMLButtonElement | null;
  const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

  function renderCard(task: TaskWithChildren, open = false) {
    const onActivate = vi.fn();
    const onToggleReschedule = vi.fn();
    const onReschedule = vi.fn();
    act(() => {
      root.render(
        <TodoCard
          task={task} isSelected={false} isExpanded={false} isCompleting={false}
          onActivate={onActivate} onToggleTask={() => {}} onToggleSubtask={() => {}}
          rescheduleOpen={open} onToggleReschedule={onToggleReschedule} onReschedule={onReschedule}
        />,
      );
    });
    return { onActivate, onToggleReschedule, onReschedule };
  }

  function renderPane(task: TaskItem, parent?: TaskItem) {
    const onUpdate = vi.fn();
    act(() => {
      root.render(
        <TodoDetailPane
          key={task.id} task={task} parent={parent} subtasks={[]} onUpdate={onUpdate}
          onToggleSubtask={() => {}} onAddSubtask={() => {}} onDelete={() => {}} onOpenTask={() => {}}
        />,
      );
    });
    return onUpdate;
  }

  describe('list card', () => {
    it('the "Überfällig" badge is a keyboard-reachable button that toggles the options', () => {
      const { onToggleReschedule, onActivate } = renderCard(mk({ dueDate: '2026-11-20' }));
      const b = badge();
      expect(b).not.toBeNull();
      expect(b!.tagName).toBe('BUTTON');
      expect(b!.getAttribute('aria-expanded')).toBe('false');
      expect(bar()).toBeNull();
      click(b!);
      expect(onToggleReschedule).toHaveBeenCalledTimes(1);
      expect(onToggleReschedule).toHaveBeenCalledWith('t1');
      expect(onActivate).not.toHaveBeenCalled();
    });

    it('shows all options when open; one click = exactly one reschedule call', () => {
      const { onReschedule, onToggleReschedule, onActivate } = renderCard(mk({ dueDate: '2026-11-20T08:30:00' }), true);
      const labels = Array.from(bar()!.querySelectorAll('button')).map((b) => b.textContent);
      expect(labels).toEqual(['Jetzt', 'Heute', 'Morgen', 'Übermorgen', 'Nächste Woche', 'Datum wählen…', 'Ohne Datum']);
      click(opt('tomorrow'));
      expect(onReschedule).toHaveBeenCalledTimes(1);
      expect(onReschedule).toHaveBeenCalledWith('t1', { dueDate: '2026-11-27T08:30:00', scheduledDate: '2026-11-27T08:30:00' });
      expect(onToggleReschedule).toHaveBeenCalledTimes(1); // closes the menu
      expect(onActivate).not.toHaveBeenCalled();
    });

    it.each([
      ['now', '2026-11-26T09:41:00'],
      ['today', '2026-11-26'],
      ['dayAfter', '2026-11-28'],
      ['nextWeek', '2026-11-30'],
      ['none', undefined],
    ])('%s sends one patch', (key, value) => {
      const { onReschedule } = renderCard(mk({ dueDate: '2026-11-20', scheduledDate: '2026-11-20' }), true);
      click(opt(key));
      expect(onReschedule).toHaveBeenCalledTimes(1);
      expect(onReschedule).toHaveBeenCalledWith('t1', { dueDate: value, scheduledDate: value });
    });

    it('Escape closes the open options', () => {
      const { onToggleReschedule } = renderCard(mk({ dueDate: '2026-11-20' }), true);
      act(() => { opt('today').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
      expect(onToggleReschedule).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['today', { dueDate: '2026-11-26' }],
      ['future', { dueDate: '2026-11-30' }],
      ['no date', {}],
      ['completed', { dueDate: '2026-11-20', isCompleted: true, status: 'completed' as const }],
      ['archived', { dueDate: '2026-11-20', isArchived: true }],
    ])('no options for a %s todo', (_name, extra) => {
      renderCard(mk(extra), true);
      expect(badge()).toBeNull();
      expect(bar()).toBeNull();
    });
  });

  describe('detail pane', () => {
    it('shows the options for an overdue open todo; one click = one onUpdate', () => {
      const onUpdate = renderPane(mk({ dueDate: '2026-11-25', scheduledDate: '2026-11-25' }));
      expect(bar()).not.toBeNull();
      click(opt('nextWeek'));
      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenCalledWith('t1', { dueDate: '2026-11-30', scheduledDate: '2026-11-30' });
    });

    it('picking a date in the picker sends one onUpdate', () => {
      const onUpdate = renderPane(mk({ dueDate: '2026-11-25T17:00:00' }));
      const picker = bar()!.querySelector('input[type="date"]') as HTMLInputElement;
      expect(picker.min).toBe('2026-11-26');
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(picker, '2026-12-02');
        picker.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenCalledWith('t1', { dueDate: '2026-12-02T17:00:00', scheduledDate: '2026-12-02T17:00:00' });
    });

    it('hidden for today, completed and undated todos', () => {
      renderPane(mk({ dueDate: '2026-11-26' }));
      expect(bar()).toBeNull();
      renderPane(mk({ id: 't2', dueDate: '2026-11-20', isCompleted: true }));
      expect(bar()).toBeNull();
      renderPane(mk({ id: 't3' }));
      expect(bar()).toBeNull();
    });

    it('a subtask cannot be moved past its parent: later options are disabled', () => {
      const onUpdate = renderPane(mk({ id: 's1', parentId: 't1', dueDate: '2026-11-20' }), mk({ dueDate: '2026-11-27' }));
      expect(opt('today').disabled).toBe(false);
      expect(opt('tomorrow').disabled).toBe(false);
      expect(opt('dayAfter').disabled).toBe(true);
      expect(opt('nextWeek').disabled).toBe(true);
      click(opt('dayAfter'));
      expect(onUpdate).not.toHaveBeenCalled();
    });
  });
});
