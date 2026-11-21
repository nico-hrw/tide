import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useCalendarScroll } from '../useCalendarScroll';
import { TagPicker } from '@/components/Tags/TagPicker';
import { isInsideTagPickerPanel } from '@/components/Tags/tagPickerPanelMarker';
import type { ActivePopover } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Api = ReturnType<typeof useCalendarScroll>;
const NOW = new Date('2026-01-05T10:00:00Z');
const WEEKS: Date[] = [];

const holder: { api: Api | null } = { api: null };
const onChangeSpy = vi.fn();

function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  const api = useCalendarScroll({
    scrollContainerRef: ref, date: NOW, onDateChange: () => {}, viewMode: 'week',
    weeks: WEEKS, events: [], editingEventId: null,
  });
  useEffect(() => {
    holder.api = api;
  });
  return (
    <div ref={ref}>
      {api.activePopover && (
        <div id="active-event-popover">
          <TagPicker tags={[{ id: 'a', title: 'Arbeit' }]} value={[]} onChange={(ids) => onChangeSpy(ids)} onCreate={async () => undefined} />
        </div>
      )}
    </div>
  );
}

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
  holder.api = null;
});

function openPopoverAndPicker() {
  act(() => root.render(<Harness />));
  act(() => holder.api!.setActivePopover({ id: 'e1', rect: new DOMRect(0, 0, 10, 10) } as ActivePopover));
  act(() => { holder.api!.lastPopoverOpenTimeRef.current = 0; });
  act(() => (host.querySelector('button[aria-label="Tag hinzufügen"]') as HTMLButtonElement).click());
}

describe('isInsideTagPickerPanel', () => {
  it('detects descendants of the marked panel only', () => {
    const panel = document.createElement('div');
    panel.setAttribute('data-tag-picker-panel', '');
    const child = document.createElement('span');
    panel.appendChild(child);
    expect(isInsideTagPickerPanel(child)).toBe(true);
    expect(isInsideTagPickerPanel(panel)).toBe(true);
    expect(isInsideTagPickerPanel(document.createElement('div'))).toBe(false);
    expect(isInsideTagPickerPanel(null)).toBe(false);
    expect(isInsideTagPickerPanel(window)).toBe(false);
  });
});

describe('event popover hosting the tag picker', () => {
  it('mousedown / touchend / scroll inside the portaled panel keep the popover open', () => {
    openPopoverAndPicker();
    const option = document.querySelector('[role="option"]') as HTMLElement;
    expect(option).not.toBeNull();
    act(() => { option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(holder.api!.activePopover).not.toBeNull();
    act(() => { option.dispatchEvent(new Event('touchend', { bubbles: true })); });
    expect(holder.api!.activePopover).not.toBeNull();
    act(() => { option.dispatchEvent(new Event('scroll', { bubbles: false })); });
    expect(holder.api!.activePopover).not.toBeNull();
  });

  it('selecting an option keeps the popover open and reports the tag id', () => {
    onChangeSpy.mockClear();
    openPopoverAndPicker();
    const option = document.querySelector('[role="option"]') as HTMLElement;
    act(() => { option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    act(() => { option.click(); });
    expect(onChangeSpy).toHaveBeenCalledWith(['a']);
    expect(holder.api!.activePopover).not.toBeNull();
  });

  it('mousedown outside everything still closes the popover', () => {
    openPopoverAndPicker();
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(holder.api!.activePopover).toBeNull();
  });
});
