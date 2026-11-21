import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MobileCalendarTab } from '../MobileCalendarTab';
import { CalendarTagPills } from '../../../Calendar/CalendarTagPills';
import { useDataStore } from '@/store/useDataStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const THEMES = [{ id: 'a', title: 'Arbeit' }, { id: 'b', title: 'Privat' }];

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  useDataStore.getState().setCalendarTagFilter({ tagIds: [], untagged: false });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function touch(target: Element, type: string, x: number) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  const point = { clientX: x, clientY: 100 };
  Object.assign(ev, { touches: type === 'touchend' ? [] : [point], changedTouches: [point] });
  act(() => { target.dispatchEvent(ev); });
}
const swipe = (target: Element) => {
  touch(target, 'touchstart', 300);
  touch(target, 'touchmove', 20);
  touch(target, 'touchend', 20);
};
const button = (text: string) =>
  Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement;

describe('MobileCalendarTab tag pill row', () => {
  const renderTab = (setActiveDate: () => void) => act(() => {
    root.render(
      <MobileCalendarTab
        activeDate={new Date(2026, 10, 21)} setActiveDate={setActiveDate as never} calViewMode="week"
        expandedEvents={[]} themes={THEMES} now={new Date(2026, 10, 21)}
      />,
    );
  });

  it('does not turn a horizontal pill-row swipe into a calendar swipe', () => {
    vi.useFakeTimers();
    try {
      const setActiveDate = vi.fn();
      renderTab(setActiveDate);
      swipe(host.querySelector('[data-testid="calendar-tag-pills"]')!);
      act(() => { vi.advanceTimersByTime(500); });
      expect(setActiveDate).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('control: the same swipe on the calendar area still navigates', () => {
    vi.useFakeTimers();
    try {
      const setActiveDate = vi.fn();
      renderTab(setActiveDate);
      const area = host.querySelector('[data-testid="calendar-tag-pills"]')!.parentElement!.parentElement!;
      swipe(area);
      act(() => { vi.advanceTimersByTime(500); });
      expect(setActiveDate).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});

describe('CalendarTagPills', () => {
  const render = () => act(() => { root.render(<CalendarTagPills tags={THEMES} />); });

  it('toggles a tag, "Ohne Tag", and shows reset only while a filter is active', () => {
    render();
    expect(button('zurücksetzen')).toBeUndefined();
    act(() => { button('Arbeit').click(); });
    expect(useDataStore.getState().calendarTagFilter).toEqual({ tagIds: ['a'], untagged: false });
    expect(button('zurücksetzen')).toBeDefined();
    act(() => { button('Ohne Tag').click(); });
    expect(useDataStore.getState().calendarTagFilter).toEqual({ tagIds: ['a'], untagged: true });
    act(() => { button('Arbeit').click(); });
    expect(useDataStore.getState().calendarTagFilter).toEqual({ tagIds: [], untagged: true });
    act(() => { button('zurücksetzen').click(); });
    expect(useDataStore.getState().calendarTagFilter).toEqual({ tagIds: [], untagged: false });
    expect(button('zurücksetzen')).toBeUndefined();
  });
});
