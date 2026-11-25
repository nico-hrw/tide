import { describe, expect, it } from 'vitest';
import type { TaskItem } from '@/store/useDataStore';
import { eventsToIcs, folderPathOf, noteToMarkdown, safeName, todosToMarkdown } from '../readable';
import type { VaultFileRecord } from '../types';

const rec = (p: Partial<VaultFileRecord>): VaultFileRecord => ({
  id: 'x', type: 'note', title: 't', parentId: null, visibility: 'private', publicMeta: {}, metadata: {}, securedMeta: null, assets: [], ...p,
});

describe('readable companions', () => {
  it('makes file-system safe names', () => {
    expect(safeName('a/b:c*?', 'x')).toBe('a_b_c__');
    expect(safeName('  ', 'Notiz')).toBe('Notiz');
    expect(safeName('.hidden', 'x')).toBe('hidden');
  });

  it('builds the folder path and survives parent cycles', () => {
    const a = rec({ id: 'a', type: 'folder', title: 'Reise', parentId: 'b' });
    const b = rec({ id: 'b', type: 'folder', title: 'Japan', parentId: 'a' });
    const n = rec({ id: 'n', parentId: 'a' });
    const map = new Map([[a.id, a], [b.id, b], [n.id, n]]);
    expect(folderPathOf(n, map)).toBe('Japan/Reise/');
  });

  it('converts editor JSON to Markdown and rejects other content', () => {
    const doc = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hallo' }] }] });
    expect(noteToMarkdown('Titel', doc)).toContain('Hallo');
    expect(noteToMarkdown('T', '{"version":1}')).toBeNull();
    expect(noteToMarkdown('T', 'kein json')).toBeNull();
  });

  it('writes valid ICS with escaping, recurrence and all-day dates', () => {
    const ev = rec({
      id: 'e1', type: 'event', title: 'Treffen',
      metadata: { start: '2026-03-01T09:00:00.000Z', end: '2026-03-01T10:00:00.000Z', recurrence_rule: 'RRULE:FREQ=WEEKLY' },
    });
    const allDay = rec({ id: 'e2', type: 'event', title: 'Urlaub', metadata: { start: '2026-07-01T00:00:00', allDay: true } });
    const broken = rec({ id: 'e3', type: 'event', title: 'Kaputt', metadata: {} });
    const ics = eventsToIcs([
      { file: ev, contentText: JSON.stringify({ description: 'a,b;c\nzeile', location: 'Berlin' }) },
      { file: allDay }, { file: broken },
    ], new Date('2026-01-01T00:00:00Z'));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART:20260301T090000Z');
    expect(ics).toContain(String.raw`DESCRIPTION:a\,b\;c\nzeile`);
    expect(ics).toContain('RRULE:FREQ=WEEKLY');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260701');
    expect(ics).not.toContain('Kaputt');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('nests subtasks in the todo list', () => {
    const tasks = [
      { id: '1', title: 'Haupt', isCompleted: false, dueDate: '2026-02-03T00:00:00Z' },
      { id: '2', title: 'Unter', isCompleted: true, parentId: '1' },
    ] as TaskItem[];
    const md = todosToMarkdown(tasks);
    expect(md).toContain('- [ ] Haupt (fällig 2026-02-03)');
    expect(md).toContain('  - [x] Unter');
  });
});
