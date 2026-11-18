import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { addDays, isSameDay } from 'date-fns';
import { useFixedWeekNavigation } from '../useFixedWeekNavigation';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DATE = new Date(2026, 10, 18);

interface HarnessProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onDateChange: (d: Date) => void;
  enabled?: boolean;
  isDragging?: boolean;
}

function Harness({ containerRef, onDateChange, enabled = true, isDragging = false }: HarnessProps) {
  useFixedWeekNavigation({ containerRef, date: DATE, onDateChange, enabled, isDragging });
  return null;
}

describe('useFixedWeekNavigation', () => {
  let root: Root;
  let host: HTMLDivElement;
  let container: HTMLDivElement;
  let onDateChange: ReturnType<typeof vi.fn<(d: Date) => void>>;
  const ref = { current: null as HTMLDivElement | null };

  const mount = (props: Partial<HarnessProps> = {}) => {
    act(() => {
      root.render(React.createElement(Harness, { containerRef: ref, onDateChange, ...props }));
    });
  };
  const wheel = (deltaX: number, deltaY = 0) => {
    const ev = new WheelEvent('wheel', { deltaX, deltaY, bubbles: true, cancelable: true });
    act(() => { container.dispatchEvent(ev); });
    return ev;
  };
  const key = (k: string, target: EventTarget = document.body) => {
    act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
  };

  beforeEach(() => {
    host = document.createElement('div');
    container = document.createElement('div');
    host.appendChild(container);
    document.body.appendChild(host);
    ref.current = container;
    root = createRoot(host.appendChild(document.createElement('div')));
    onDateChange = vi.fn<(d: Date) => void>();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('one horizontal gesture changes exactly one week', () => {
    mount();
    wheel(50);
    expect(onDateChange).not.toHaveBeenCalled();
    wheel(50);
    wheel(60); // inertia inside the lock
    wheel(60);
    expect(onDateChange).toHaveBeenCalledTimes(1);
    expect(isSameDay(onDateChange.mock.calls[0][0], addDays(DATE, 7))).toBe(true);
  });

  it('pages backwards for negative deltas', () => {
    mount();
    wheel(-100);
    expect(isSameDay(onDateChange.mock.calls[0][0], addDays(DATE, -7))).toBe(true);
  });

  it('leaves vertical wheel scrolling alone', () => {
    mount();
    const ev = wheel(10, 120);
    expect(onDateChange).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });

  it('does not page while an event is dragged', () => {
    mount({ isDragging: true });
    wheel(200);
    key('ArrowRight');
    expect(onDateChange).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    mount({ enabled: false });
    wheel(200);
    key('ArrowRight');
    expect(onDateChange).not.toHaveBeenCalled();
  });

  it('arrow keys page weeks unless focus is in a text field', () => {
    mount();
    key('ArrowRight');
    key('ArrowLeft');
    expect(onDateChange.mock.calls.map((c) => c[0].getTime()))
      .toEqual([addDays(DATE, 7).getTime(), addDays(DATE, -7).getTime()]);

    const input = document.createElement('input');
    host.appendChild(input);
    input.focus();
    key('ArrowRight', input);
    expect(onDateChange).toHaveBeenCalledTimes(2);
  });
});
