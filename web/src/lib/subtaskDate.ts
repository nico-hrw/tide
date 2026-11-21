/** A subtask may not be due later than its parent (mirrors TodoTreeItem's `max`). */
export function subtaskDateMax(
  task: { parentId?: string | null },
  parent: { dueDate?: string } | undefined,
): string | undefined {
  if (!task.parentId) return undefined;
  return parent?.dueDate || undefined;
}

const datePart = (s: string) => s.slice(0, 10);

/** Clamps `date` to `max` (compared by ISO date part); keeps the value's own time part. */
export function clampSubtaskDate(date: string, max: string | undefined): string {
  if (!date || !max) return date;
  if (datePart(date) <= datePart(max)) return date;
  return datePart(max) + date.slice(10);
}
