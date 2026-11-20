import type { CalendarEvent } from './expandMobileEvents';
import type { QuickEditGridProps, QuickEditTarget } from './QuickEditGrid';
import type { MobileEventMeta, NewEventMeta } from './MobileOverlaysAndModals';

/** Default color of new events (same as the event default in `MobileCreateModal`). */
export const DRAFT_EVENT_COLOR = '#8b5cf6';
/** Title used when a draft is saved without a name. */
export const DRAFT_DEFAULT_TITLE = 'Neuer Termin';

/** Open quick edit overlay in the mobile day view, or null when closed. */
export interface QuickEditOpen {
  mode: 'edit' | 'draft';
  target: QuickEditTarget;
}
export type QuickEditState = QuickEditOpen | null;

/** What ✓ in the grid should do. */
export type QuickEditOutcome =
  | { kind: 'none' }
  | { kind: 'update'; id: string; start: Date; end: Date }
  | { kind: 'draft'; event: CalendarEvent };

interface DayEventLike {
  id: string;
  title?: string;
  color?: string;
  start: Date | string;
  end?: Date | string;
  allDay?: boolean;
  is_task?: boolean;
  linkedTaskId?: string;
}

const HOUR_MS = 3_600_000;

function rangeOf(ev: DayEventLike): { start: Date; end: Date } {
  const start = new Date(ev.start);
  const end = ev.end ? new Date(ev.end) : new Date(start.getTime() + HOUR_MS);
  return { start, end: Number.isNaN(end.getTime()) ? new Date(start.getTime() + HOUR_MS) : end };
}

/** Hold on a timed card: edit that event (recurring instance ids pass through unchanged). */
export function quickEditForEvent(ev: DayEventLike): QuickEditOpen {
  return { mode: 'edit', target: { id: ev.id, title: ev.title ?? '', color: ev.color, ...rangeOf(ev) } };
}

/** Double tap: an unnamed draft at the tapped time. */
export function quickEditForDraft(start: Date, end: Date): QuickEditOpen {
  return { mode: 'draft', target: { id: null, title: '', color: DRAFT_EVENT_COLOR, start, end } };
}

/** Faded context for the grid: the day's real timed events, without todos and without the target itself. */
export function quickEditContext(dayEvs: DayEventLike[], targetId: string | null): QuickEditGridProps['context'] {
  return dayEvs
    .filter((e) => !e.allDay && !e.is_task && !e.linkedTaskId && e.id !== targetId)
    .map((e) => ({ id: e.id, title: e.title ?? '', color: e.color, ...rangeOf(e) }));
}

/** ✓ in the grid: update a changed event, or hand a draft on to the edit form. */
export function confirmQuickEdit(state: QuickEditOpen, start: Date, end: Date): QuickEditOutcome {
  const { target } = state;
  if (state.mode === 'draft' || target.id === null) {
    return {
      kind: 'draft',
      event: { id: '', title: '', color: target.color ?? DRAFT_EVENT_COLOR, start: start.toISOString(), end: end.toISOString(), recurrence: 'none' },
    };
  }
  if (start.getTime() === target.start.getTime() && end.getTime() === target.end.getTime()) return { kind: 'none' };
  return { kind: 'update', id: target.id, start, end };
}

/** A draft in the edit form has the empty id; it is created on save, never updated or deleted. */
export function isDraftEvent(ev: { id: string }): boolean {
  return ev.id === '';
}

/** Meta for `onNewEvent` when a draft is saved from the edit form. */
export function draftNewEventMeta(meta: MobileEventMeta): NewEventMeta {
  return { ...meta, title: meta.title.trim() || DRAFT_DEFAULT_TITLE };
}
