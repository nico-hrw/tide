interface MonthOrderable {
    title?: string;
    start: string;
    allDay?: boolean;
    is_task?: boolean;
}

const rank = (e: MonthOrderable) => (e.is_task ? 0 : e.allDay ? 1 : 2);

/** Month view order of a day: todos first, then all-day events, then timed events earliest first; ties by title. */
export function compareMonthEvents(a: MonthOrderable, b: MonthOrderable): number {
    return (
        rank(a) - rank(b) ||
        new Date(a.start).getTime() - new Date(b.start).getTime() ||
        (a.title || '').localeCompare(b.title || '')
    );
}

export function sortMonthEvents<T extends MonthOrderable>(events: readonly T[]): T[] {
    return [...events].sort(compareMonthEvents);
}
