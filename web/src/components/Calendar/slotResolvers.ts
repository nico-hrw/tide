import { parseLocalDay, slotForMinutes, SLOT_DEFAULT_MIN, type SlotHit } from '@/hooks/useSlotCreateGesture';

/** Time grid (week / day): the touched minute of the day, floored to 15 minutes, 60 minutes long. */
export function resolveTimeGridSlot(target: EventTarget | null, _clientX: number, clientY: number): SlotHit | null {
    const grid = (target as Element | null)?.closest?.('[data-slot-grid]') as HTMLElement | null;
    if (!grid) return null;
    const day = parseLocalDay(grid.getAttribute('data-slot-grid'));
    if (!day) return null;
    const rect = grid.getBoundingClientRect();
    if (rect.height <= 0) return null;
    const minutes = ((clientY - rect.top) / rect.height) * 1440;
    const { start, end } = slotForMinutes(day, minutes);
    const startMin = start.getHours() * 60 + start.getMinutes();
    const span = (end.getTime() - start.getTime()) / 60000;
    return {
        start,
        end,
        feedbackEl: grid,
        feedbackTop: (startMin / 1440) * rect.height,
        feedbackHeight: (Math.min(span, SLOT_DEFAULT_MIN) / 1440) * rect.height,
    };
}

/** Month cell: same default as the "+" button (9:00 to 10:00 on the touched day). */
export function resolveMonthCellSlot(target: EventTarget | null): SlotHit | null {
    const cell = (target as Element | null)?.closest?.('[data-month-day]') as HTMLElement | null;
    if (!cell) return null;
    const day = parseLocalDay(cell.getAttribute('data-month-day'));
    if (!day) return null;
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0, 0, 0);
    const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10, 0, 0, 0);
    return { start, end, feedbackEl: cell };
}
