import { describe, expect, it } from 'vitest';
import { timelinePlacementClasses, timelineShiftClasses, timelineWrapperClasses } from '../NoteHistoryTimeline';

describe('timelinePlacementClasses', () => {
  it('closed: anchored inside the container, hidden by opacity, no pointer events', () => {
    const c = timelinePlacementClasses({ open: false });
    expect(c.wrapper).toContain('pointer-events-none');
    expect(c.panel).toContain('right-4');
    expect(c.panel).not.toContain('pointer-events-auto');
    expect(c.panel).not.toMatch(/left-full|ml-/);
  });

  it('open: interactive and marked open for the CSS transition', () => {
    const c = timelinePlacementClasses({ open: true });
    expect(c.wrapper).toContain('z-30');
    expect(c.panel).toContain('right-4');
    expect(c.panel).toContain('pointer-events-auto');
    expect(c.panel).toContain('open');
    expect(c.panel).toContain('bg-t2-surface');
  });

  it('the card styling is the same open and closed, so closing fades instead of snapping', () => {
    expect(timelinePlacementClasses({ open: false }).panel).toContain('bg-t2-surface');
  });
});

describe('history shift', () => {
  it('open: the sheet slides by transform, never by padding or margin', () => {
    expect(timelineShiftClasses({ open: true })).toContain('translate-x');
    expect(timelineWrapperClasses()).not.toMatch(/-mr-|pr-/);
  });

  it('closed: no shift', () => {
    expect(timelineShiftClasses({ open: false })).toBe('');
  });
});
