import { addDays, format, isBefore, startOfDay, startOfWeek } from 'date-fns';
import type { TaskItem } from '@/store/slices/types';
import { parseDateSafe } from './types';

/** Quick reschedule choices for overdue todos (desktop list + detail pane). */
export type RescheduleOption = 'now' | 'today' | 'tomorrow' | 'dayAfter' | 'nextWeek' | 'none';

export const RESCHEDULE_OPTIONS: { key: RescheduleOption; label: string; hint?: string }[] = [
  { key: 'now', label: 'Jetzt', hint: 'Heute, aktuelle Uhrzeit' },
  { key: 'today', label: 'Heute' },
  { key: 'tomorrow', label: 'Morgen' },
  { key: 'dayAfter', label: 'Übermorgen' },
  { key: 'nextWeek', label: 'Nächste Woche', hint: 'Montag' },
  { key: 'none', label: 'Ohne Datum' },
];

type Dated = Pick<TaskItem, 'dueDate' | 'scheduledDate'>;
/** The one updateTask patch a choice sends: both date fields move together (the calendar sync reads dueDate). */
export type ReschedulePatch = Pick<TaskItem, 'dueDate' | 'scheduledDate'>;

/** Open (not completed, not archived) todo whose date lies before today. Day-based, local time. */
export function isOverdueOpen(task: Dated & Pick<TaskItem, 'isCompleted' | 'isArchived'>, now: Date = new Date()): boolean {
  if (task.isCompleted || task.isArchived) return false;
  const d = parseDateSafe(task.dueDate || task.scheduledDate);
  return !!d && isBefore(startOfDay(d), startOfDay(now));
}

/** Local wall-clock time of the todo's date, or null for a date without time (or midnight, which counts as all-day). */
function timeOf(value: string | undefined): string | null {
  if (!value || !value.includes('T')) return null;
  const d = parseDateSafe(value);
  if (!d) return null;
  const t = format(d, 'HH:mm:ss');
  return t === '00:00:00' ? null : t;
}

/**
 * New date string for an option, in the store's formats: `yyyy-MM-dd`, or `yyyy-MM-ddTHH:mm:ss` (local) when the
 * todo already had a time of day; "Jetzt" uses the current time. `undefined` = no date.
 */
export function rescheduleValue(option: RescheduleOption, current: string | undefined, now: Date = new Date()): string | undefined {
  if (option === 'none') return undefined;
  if (option === 'now') return format(now, "yyyy-MM-dd'T'HH:mm:00");
  const today = startOfDay(now);
  const day = option === 'today' ? today
    : option === 'tomorrow' ? addDays(today, 1)
    : option === 'dayAfter' ? addDays(today, 2)
    : addDays(startOfWeek(today, { weekStartsOn: 1 }), 7); // next Monday, also from a Sunday or a Monday
  const time = timeOf(current);
  return format(day, 'yyyy-MM-dd') + (time ? `T${time}` : '');
}

/** Patch for a date picked in the date field (`yyyy-MM-dd`); keeps the todo's time of day like the quick options. */
export function pickedDatePatch(
  day: string,
  task: Dated,
  max?: string,
): ReschedulePatch | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  if (max && day > max.slice(0, 10)) return null;
  const time = timeOf(task.dueDate || task.scheduledDate);
  const v = day + (time ? `T${time}` : '');
  return { dueDate: v, scheduledDate: v };
}

/**
 * The single updateTask patch for an option, or null when the option is not allowed: a subtask may not be due
 * later than its parent (`max`, see lib/subtaskDate), so such options are offered disabled instead of clamped.
 */
export function reschedulePatch(
  option: RescheduleOption,
  task: Dated,
  now: Date = new Date(),
  max?: string,
): ReschedulePatch | null {
  const v = rescheduleValue(option, task.dueDate || task.scheduledDate, now);
  if (v && max && v.slice(0, 10) > max.slice(0, 10)) return null;
  return { dueDate: v, scheduledDate: v };
}
