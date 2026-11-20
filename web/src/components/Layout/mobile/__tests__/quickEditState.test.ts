import { describe, expect, it } from 'vitest';
import {
  DRAFT_DEFAULT_TITLE,
  DRAFT_EVENT_COLOR,
  confirmQuickEdit,
  draftNewEventMeta,
  isDraftEvent,
  quickEditContext,
  quickEditForDraft,
  quickEditForEvent,
} from '../quickEditState';

const at = (h: number, m = 0) => new Date(2026, 10, 20, h, m);

describe('quick edit state', () => {
  const ev = { id: 'a_2026-11-20', title: 'Arzt', color: '#ef4444', start: at(9).toISOString(), end: at(10).toISOString() };

  it('hold on a card opens edit mode with the event range, title and color', () => {
    const s = quickEditForEvent(ev);
    expect(s).toEqual({ mode: 'edit', target: { id: 'a_2026-11-20', title: 'Arzt', color: '#ef4444', start: at(9), end: at(10) } });
  });

  it('an event without end gets one hour', () => {
    const s = quickEditForEvent({ id: 'x', title: 'X', start: at(9).toISOString() });
    expect(s.target.end).toEqual(at(10));
  });

  it('double tap opens draft mode without id, empty title and the default color', () => {
    const s = quickEditForDraft(at(14), at(15));
    expect(s).toEqual({ mode: 'draft', target: { id: null, title: '', color: DRAFT_EVENT_COLOR, start: at(14), end: at(15) } });
  });

  it('context holds the other real timed events, not todos and not the target', () => {
    const evs = [
      ev,
      { id: 'b', title: 'Sport', start: at(12).toISOString(), end: at(13).toISOString() },
      { id: 't', title: 'Todo', start: at(11).toISOString(), end: at(11, 30).toISOString(), is_task: true },
      { id: 'l', title: 'Linked', start: at(16).toISOString(), end: at(17).toISOString(), linkedTaskId: 'task1' },
      { id: 'd', title: 'Ganztag', start: at(0).toISOString(), end: at(23, 59).toISOString(), allDay: true },
    ];
    expect(quickEditContext(evs, 'a_2026-11-20')).toEqual([
      { id: 'b', title: 'Sport', color: undefined, start: at(12), end: at(13) },
    ]);
    expect(quickEditContext(evs, null).map((e) => e.id)).toEqual(['a_2026-11-20', 'b']);
  });

  it('confirm in edit mode updates only when the range changed, keeping the instance id', () => {
    const s = quickEditForEvent(ev);
    expect(confirmQuickEdit(s, at(9), at(10))).toEqual({ kind: 'none' });
    expect(confirmQuickEdit(s, at(9, 30), at(10, 30))).toEqual({ kind: 'update', id: 'a_2026-11-20', start: at(9, 30), end: at(10, 30) });
  });

  it('confirm in draft mode yields a draft editing event with id "" and no recurrence', () => {
    const s = quickEditForDraft(at(14), at(15));
    const out = confirmQuickEdit(s, at(14, 10), at(15, 40));
    expect(out).toEqual({
      kind: 'draft',
      event: { id: '', title: '', color: DRAFT_EVENT_COLOR, start: at(14, 10).toISOString(), end: at(15, 40).toISOString(), recurrence: 'none' },
    });
    if (out.kind === 'draft') expect(isDraftEvent(out.event)).toBe(true);
    expect(isDraftEvent(ev)).toBe(false);
  });

  it('draft meta keeps all form fields and names a blank title "Neuer Termin"', () => {
    const meta = {
      title: '  ', color: '#8b5cf6', description: 'd', parent_id: 'g1', groupIds: ['g1'],
      recurrence: 'weekly' as const, recurrence_rule: 'FREQ=WEEKLY;INTERVAL=2', recurrence_end: '',
    };
    expect(draftNewEventMeta(meta)).toEqual({ ...meta, title: DRAFT_DEFAULT_TITLE });
    expect(DRAFT_DEFAULT_TITLE).toBe('Neuer Termin');
    expect(draftNewEventMeta({ ...meta, title: 'Kino' }).title).toBe('Kino');
  });
});
