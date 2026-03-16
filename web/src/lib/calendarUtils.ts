import { format, isSameDay, startOfDay, addDays } from 'date-fns';

export interface CalendarEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    color?: string;
    effect?: string;
    description?: string;
    allDay?: boolean;
    is_task?: boolean;
    is_completed?: boolean;
    is_cancelled?: boolean;
    exdates?: string[]; // YYYY-MM-DD strings of skipped instances
    completed_dates?: string[]; // YYYY-MM-DD strings of completed instances
    recurrence_rule?: string;
    recurrence_end?: string;
    recurrence?: string;
    parent_id?: string;
    parent_event_id?: string;
}

export function getEventsForDate(targetDate: string | Date, allEvents: CalendarEvent[]): CalendarEvent[] {
    const target = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;
    const targetStart = startOfDay(target);
    const targetKey = format(targetStart, "yyyy-MM-dd");
    
    const dayEvents: CalendarEvent[] = [];

    allEvents.forEach(e => {
        const start = new Date(e.start);
        const end = new Date(e.end);

        // Simple check for non-recurring events or the first occurrence
        if (!e.recurrence_rule) {
            const occurrenceStart = startOfDay(start);
            const occurrenceEnd = startOfDay(end);
            if (targetStart >= occurrenceStart && targetStart <= occurrenceEnd) {
                dayEvents.push(e);
            }
        } else {
            // Recurrence logic
            const duration = end.getTime() - start.getTime();
            const recEndOrig = e.recurrence_end ? new Date(e.recurrence_end) : new Date(start.getTime() + 10 * 365 * 24 * 60 * 60 * 1000); // 10 years default
            
            // Optimization: if target is before start, it can't match
            if (targetStart < startOfDay(start)) return;
            if (targetStart > startOfDay(recEndOrig)) return;

            const ruleParts = e.recurrence_rule.split(';');
            let freq = '';
            let interval = 1;
            ruleParts.forEach(p => {
                if (p.startsWith('FREQ=')) freq = p.substring(5).toLowerCase();
                if (p.startsWith('INTERVAL=')) interval = parseInt(p.substring(9), 10);
            });

            let current = new Date(start);
            let safety = 0;
            
            while (startOfDay(current) <= targetStart && current <= recEndOrig && safety < 1000) {
                const occStart = startOfDay(current);
                const occEnd = startOfDay(new Date(current.getTime() + duration));
                
                if (targetStart >= occStart && targetStart <= occEnd) {
                    const occDateKey = format(current, "yyyy-MM-dd");

                    // [TASK 2] Cancel Check: Option B - Mark as cancelled
                    // [TASK 2] Cancel Check: If it's in exdates, it's definitely cancelled.
                    // If e.is_cancelled is true, the whole series is cancelled UNLESS we wanted independent control.
                    // But for now, we'll treat e.is_cancelled as "Whole series cancelled".
                    const isCancelled = e.exdates?.includes(occDateKey) || !!e.is_cancelled;

                    const occId = current.getTime() === start.getTime() ? e.id : `${e.id}_${current.getTime()}`;
                    
                    // [TASK 2] Completion Check: Override if in completed_dates
                    const isCompleted = e.completed_dates?.includes(occDateKey) || !!e.is_completed;

                    const occurrenceStart = new Date(current);
                    const occurrenceEnd = new Date(current.getTime() + duration);

                    dayEvents.push({
                        ...e,
                        id: occId,
                        start: occurrenceStart.toISOString(),
                        end: occurrenceEnd.toISOString(),
                        is_completed: isCompleted,
                        is_task: !!e.is_task,
                        is_cancelled: isCancelled,
                        parent_event_id: current.getTime() === start.getTime() ? undefined : e.id
                    } as any);
                    break; 
                }

                if (freq === 'daily') current.setDate(current.getDate() + interval);
                else if (freq === 'weekly') current.setDate(current.getDate() + (interval * 7));
                else if (freq === 'monthly') current.setMonth(current.getMonth() + interval);
                else if (freq === 'yearly') current.setFullYear(current.getFullYear() + interval);
                else break;
                safety++;
            }
        }
    });

    return dayEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}
