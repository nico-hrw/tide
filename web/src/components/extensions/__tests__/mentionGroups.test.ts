import { describe, expect, it } from 'vitest';
import { buildContactItems, groupItems, groupKeyOf } from '../mentionGroups';

describe('groupKeyOf', () => {
  it('maps item kinds', () => {
    expect(groupKeyOf({ type: 'contact' })).toBe('person');
    expect(groupKeyOf({ type: 'tag' })).toBe('tag');
    expect(groupKeyOf({ is_task: true })).toBe('todo');
    expect(groupKeyOf({ type: 'task' })).toBe('todo');
    expect(groupKeyOf({ type: 'event' })).toBe('event');
    expect(groupKeyOf({ type: 'file' })).toBe('note');
    expect(groupKeyOf({ type: 'note' })).toBe('note');
    expect(groupKeyOf({})).toBe('note');
  });
});

describe('buildContactItems', () => {
  const contacts = [
    { id: '1', username: 'anna', status: 'accepted', public_key: 'k' },
    { id: '2', username: 'andreas', status: 'pending' },
    { id: '3', username: 'berta', status: 'accepted', public_key: 'k' },
  ];
  it('filters, flags shareable', () => {
    const r = buildContactItems(contacts, 'an');
    expect(r.map((c) => c.id)).toEqual(['1', '2']);
    expect(r[0]).toMatchObject({ type: 'contact', label: 'anna', username: 'anna', shareable: true });
    expect(r[1].shareable).toBe(false);
  });
  it('prefers prefix matches and caps at 5', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: String(i), username: `x${i}`, status: 'accepted', public_key: 'k' }));
    expect(buildContactItems(many, '')).toHaveLength(5);
    const r = buildContactItems([{ id: 'a', username: 'hanna' }, { id: 'b', username: 'anna' }], 'an');
    expect(r.map((c) => c.id)).toEqual(['b', 'a']);
  });
});

describe('groupItems', () => {
  const items = [
    { id: 't', type: 'tag' },
    { id: 'td', type: 'task' },
    { id: 'n', type: 'note' },
    { id: 'p', type: 'contact' },
  ];
  it('orders groups and drops empty', () => {
    expect(groupItems(items, 'all').map((g) => g.key)).toEqual(['person', 'note', 'todo', 'tag']);
  });
  it('filters to one group', () => {
    const g = groupItems(items, 'tag');
    expect(g).toHaveLength(1);
    expect(g[0].items[0].id).toBe('t');
  });
});
