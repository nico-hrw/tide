import { describe, expect, it } from 'vitest';
import { timelinePlacementClasses } from '../NoteHistoryTimeline';

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
