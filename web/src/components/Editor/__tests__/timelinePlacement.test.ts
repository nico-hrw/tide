import { describe, expect, it } from 'vitest';
import { HISTORY_GUTTER_PX, timelineGutterClasses, timelinePlacementClasses, timelineWrapperClasses } from '../NoteHistoryTimeline';

describe('timelinePlacementClasses', () => {
  it('closed: anchored inside the container, no surface, no pointer events', () => {
    const c = timelinePlacementClasses({ open: false });
    expect(c.wrapper).toContain('pointer-events-none');
    expect(c.panel).toContain('right-4');
    expect(c.panel).not.toContain('pointer-events-auto');
    expect(c.panel).not.toContain('bg-t2-surface');
    expect(c.panel).not.toMatch(/left-full|ml-/);
  });

  it('open: right-4, z-30, solid surface', () => {
    const c = timelinePlacementClasses({ open: true });
    expect(c.wrapper).toContain('z-30');
    expect(c.panel).toContain('right-4');
    expect(c.panel).toContain('z-30');
    expect(c.panel).toContain('bg-t2-surface');
  });
});

describe('history gutter', () => {
  it('open: wrapper margin matches the container padding', () => {
    const pad = timelineGutterClasses({ open: true });
    const wrap = timelineWrapperClasses({ open: true });
    expect(pad).toBe(`lg:pr-[${HISTORY_GUTTER_PX}px]`);
    expect(wrap).toContain(`lg:-mr-[${HISTORY_GUTTER_PX}px]`);
    expect(wrap).toContain('sticky');
  });

  it('closed: no reserve, no negative margin', () => {
    expect(timelineGutterClasses({ open: false })).toBe('');
    expect(timelineWrapperClasses({ open: false })).not.toMatch(/-mr-|pr-/);
  });
});
