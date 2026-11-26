import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
    attachSlotGesture,
    floorToSlot,
    slotForMinutes,
    parseLocalDay,
    LONG_PRESS_MS,
    type SlotHit,
    type SlotVia,
} from '../useSlotCreateGesture';
import { resolveTimeGridSlot, resolveMonthCellSlot } from '@/components/Calendar/slotResolvers';

function pointer(type: string, target: Element, x: number, y: number, pointerType = 'touch', pointerId = 1) {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(ev, { pointerType, pointerId, clientX: x, clientY: y });
    target.dispatchEvent(ev);
    return ev;
}

describe('useSlotCreateGesture', () => {
    let container: HTMLDivElement;
    let cell: HTMLDivElement;
    let eventEl: HTMLDivElement;
    let onCreate: Mock<(hit: SlotHit, via: SlotVia) => void>;
    let detach: () => void;
    const hit: SlotHit = { start: new Date(2026, 5, 3, 10, 15), end: new Date(2026, 5, 3, 11, 15) };

    beforeEach(() => {
        vi.useFakeTimers();
        container = document.createElement('div');
        cell = document.createElement('div');
        cell.setAttribute('data-cell', '1');
        cell.style.position = 'relative';
        eventEl = document.createElement('div');
        eventEl.setAttribute('data-event-id', 'e1');
        cell.appendChild(eventEl);
        container.appendChild(cell);
        document.body.appendChild(container);
        onCreate = vi.fn<(hit: SlotHit, via: SlotVia) => void>();
        detach = attachSlotGesture(container, () => ({
            resolve: (t) => ((t as Element).closest('[data-cell]') ? { ...hit, feedbackEl: cell } : null),
            onCreate,
        }));
    });

    afterEach(() => {
        detach();
        container.remove();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    const tap = (x = 100, y = 100, holdMs = 50) => {
        pointer('pointerdown', cell, x, y);
        vi.advanceTimersByTime(holdMs);
        pointer('pointerup', cell, x, y);
    };

    it('creates on a double tap (two quick taps close together)', () => {
        tap();
        vi.advanceTimersByTime(150);
        tap(104, 98);
        expect(onCreate).toHaveBeenCalledTimes(1);
        expect(onCreate.mock.calls[0][1]).toBe('double-tap');
        expect(onCreate.mock.calls[0][0].start).toEqual(hit.start);
    });

    it('does not create on a single tap', () => {
        tap();
        vi.advanceTimersByTime(1000);
        expect(onCreate).not.toHaveBeenCalled();
    });

    it('does not create when the second tap comes too late', () => {
        tap();
        vi.advanceTimersByTime(400);
        tap();
        expect(onCreate).not.toHaveBeenCalled();
    });

    it('does not create when the second tap is far away', () => {
        tap(100, 100);
        vi.advanceTimersByTime(100);
        tap(100, 200);
        expect(onCreate).not.toHaveBeenCalled();
    });

    it('a third tap right after a double tap starts over', () => {
        tap(); vi.advanceTimersByTime(100); tap();
        vi.advanceTimersByTime(100); tap();
        expect(onCreate).toHaveBeenCalledTimes(1);
    });

    it('creates on a long press after 450 ms and vibrates', () => {
        const vibrate = vi.fn();
        Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
        pointer('pointerdown', cell, 50, 50);
        vi.advanceTimersByTime(LONG_PRESS_MS - 10);
        expect(onCreate).not.toHaveBeenCalled();
        vi.advanceTimersByTime(20);
        expect(onCreate).toHaveBeenCalledTimes(1);
        expect(onCreate.mock.calls[0][1]).toBe('long-press');
        expect(vibrate).toHaveBeenCalled();
        pointer('pointerup', cell, 50, 50);
        expect(onCreate).toHaveBeenCalledTimes(1);
    });

    it('tolerates a small finger jitter during a long press', () => {
        pointer('pointerdown', cell, 50, 50);
        pointer('pointermove', cell, 53, 54);
        vi.advanceTimersByTime(LONG_PRESS_MS + 5);
        expect(onCreate).toHaveBeenCalledTimes(1);
    });

    it('aborts the long press when the finger moves beyond the threshold', () => {
        pointer('pointerdown', cell, 50, 50);
        vi.advanceTimersByTime(200);
        pointer('pointermove', cell, 50, 80);
        vi.advanceTimersByTime(1000);
        pointer('pointerup', cell, 50, 80);
        expect(onCreate).not.toHaveBeenCalled();
    });

    it('a moved tap does not count towards a double tap', () => {
        pointer('pointerdown', cell, 50, 50);
        pointer('pointermove', cell, 50, 70);
        pointer('pointerup', cell, 50, 70);
        vi.advanceTimersByTime(100);
        tap(50, 70);
        expect(onCreate).not.toHaveBeenCalled();
    });

    it('aborts on scroll and on pointercancel', () => {
        pointer('pointerdown', cell, 50, 50);
        vi.advanceTimersByTime(200);
        container.dispatchEvent(new Event('scroll'));
        vi.advanceTimersByTime(1000);
        expect(onCreate).not.toHaveBeenCalled();
        pointer('pointerup', cell, 50, 50);

        vi.advanceTimersByTime(500);
        pointer('pointerdown', cell, 50, 50);
        vi.advanceTimersByTime(200);
        pointer('pointercancel', cell, 50, 50);
        vi.advanceTimersByTime(1000);
        expect(onCreate).not.toHaveBeenCalled();
    });

    it('a touch right after scrolling (momentum stop) is not a tap', () => {
        container.dispatchEvent(new Event('scroll'));
        vi.advanceTimersByTime(40);
        tap();
        vi.advanceTimersByTime(80);
        tap();
        expect(onCreate).not.toHaveBeenCalled();
    });

    it('ignores taps and holds on an existing event', () => {
        pointer('pointerdown', eventEl, 50, 50);
        vi.advanceTimersByTime(LONG_PRESS_MS + 50);
        pointer('pointerup', eventEl, 50, 50);
        pointer('pointerdown', eventEl, 50, 50);
        pointer('pointerup', eventEl, 50, 50);
        pointer('pointerdown', eventEl, 50, 50);
        pointer('pointerup', eventEl, 50, 50);
        expect(onCreate).not.toHaveBeenCalled();
    });

    it('ignores buttons and spots the resolver rejects', () => {
        const btn = document.createElement('button');
        cell.appendChild(btn);
        pointer('pointerdown', btn, 5, 5);
        vi.advanceTimersByTime(LONG_PRESS_MS + 50);
        const outside = document.createElement('div');
        container.appendChild(outside);
        pointer('pointerdown', outside, 5, 5);
        vi.advanceTimersByTime(LONG_PRESS_MS + 50);
        expect(onCreate).not.toHaveBeenCalled();
    });

    it('leaves mouse and pen alone', () => {
        for (const pt of ['mouse', 'pen']) {
            pointer('pointerdown', cell, 50, 50, pt);
            vi.advanceTimersByTime(LONG_PRESS_MS + 50);
            pointer('pointerup', cell, 50, 50, pt);
            pointer('pointerdown', cell, 50, 50, pt);
            pointer('pointerup', cell, 50, 50, pt);
            pointer('pointerdown', cell, 50, 50, pt);
            pointer('pointerup', cell, 50, 50, pt);
        }
        expect(onCreate).not.toHaveBeenCalled();
    });

    it('a second finger aborts the gesture', () => {
        pointer('pointerdown', cell, 50, 50, 'touch', 1);
        pointer('pointerdown', cell, 90, 50, 'touch', 2);
        vi.advanceTimersByTime(LONG_PRESS_MS + 50);
        expect(onCreate).not.toHaveBeenCalled();
    });

    it('never calls preventDefault on pointer events (scrolling stays native)', () => {
        const down = pointer('pointerdown', cell, 50, 50);
        const move = pointer('pointermove', cell, 50, 80);
        const up = pointer('pointerup', cell, 50, 80);
        expect(down.defaultPrevented || move.defaultPrevented || up.defaultPrevented).toBe(false);
    });

    it('swallows the click that follows a created slot, once', () => {
        const clicks = vi.fn();
        document.body.addEventListener('click', clicks);
        pointer('pointerdown', cell, 50, 50);
        vi.advanceTimersByTime(LONG_PRESS_MS + 5);
        pointer('pointerup', cell, 50, 50);
        cell.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
        expect(clicks).not.toHaveBeenCalled();
        cell.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
        expect(clicks).toHaveBeenCalledTimes(1);
        document.body.removeEventListener('click', clicks);
    });

    it('shows a press hint and removes it when the press ends', () => {
        pointer('pointerdown', cell, 50, 50);
        vi.advanceTimersByTime(200);
        expect(cell.querySelector('[data-slot-press]')).not.toBeNull();
        pointer('pointerup', cell, 50, 50);
        expect(cell.querySelector('[data-slot-press]')).toBeNull();
    });

    it('detach removes the listeners', () => {
        detach();
        pointer('pointerdown', cell, 50, 50);
        vi.advanceTimersByTime(LONG_PRESS_MS + 50);
        expect(onCreate).not.toHaveBeenCalled();
    });
});

describe('slot math', () => {
    it('floors minutes to 15', () => {
        expect(floorToSlot(0)).toBe(0);
        expect(floorToSlot(14.9)).toBe(0);
        expect(floorToSlot(75)).toBe(75);
        expect(floorToSlot(89)).toBe(75);
        expect(floorToSlot(-5)).toBe(0);
    });

    it('builds a one hour slot on the right local day and clamps at midnight', () => {
        const day = new Date(2026, 5, 3);
        const a = slotForMinutes(day, 10 * 60 + 40);
        expect(a.start).toEqual(new Date(2026, 5, 3, 10, 30));
        expect(a.end).toEqual(new Date(2026, 5, 3, 11, 30));
        const late = slotForMinutes(day, 23 * 60 + 50);
        expect(late.start).toEqual(new Date(2026, 5, 3, 23, 45));
        expect(late.end).toEqual(new Date(2026, 5, 4, 0, 0));
        expect(parseLocalDay('2026-06-03')).toEqual(day);
        expect(parseLocalDay('')).toBeNull();
    });
});

describe('resolvers', () => {
    it('time grid: maps the touched y to the day and 15 minute slot', () => {
        const grid = document.createElement('div');
        grid.setAttribute('data-slot-grid', '2026-06-03');
        grid.getBoundingClientRect = () => ({ top: 100, height: 1152, left: 0, right: 100, bottom: 1252, width: 100, x: 0, y: 100, toJSON: () => ({}) });
        const child = document.createElement('span');
        grid.appendChild(child);
        // 48 px per hour: 100 + 48 * 9.6h = 560.8 -> 09:36 -> 09:30
        const r = resolveTimeGridSlot(child, 10, 100 + 48 * 9.6)!;
        expect(r.start).toEqual(new Date(2026, 5, 3, 9, 30));
        expect(r.end).toEqual(new Date(2026, 5, 3, 10, 30));
        expect(r.feedbackEl).toBe(grid);
        expect(r.feedbackTop).toBeCloseTo((570 / 1440) * 1152);
        expect(resolveTimeGridSlot(document.createElement('div'), 0, 0)).toBeNull();
    });

    it('month: 9 to 10 on the touched day', () => {
        const cell = document.createElement('div');
        cell.setAttribute('data-month-day', '2026-06-10');
        const inner = document.createElement('span');
        cell.appendChild(inner);
        const r = resolveMonthCellSlot(inner)!;
        expect(r.start).toEqual(new Date(2026, 5, 10, 9, 0));
        expect(r.end).toEqual(new Date(2026, 5, 10, 10, 0));
        expect(resolveMonthCellSlot(document.createElement('div'))).toBeNull();
    });
});
