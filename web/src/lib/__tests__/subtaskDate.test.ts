import { describe, expect, it } from 'vitest';
import { clampSubtaskDate, subtaskDateMax } from '../subtaskDate';

describe('subtaskDateMax', () => {
  it('returns the parent due date for a subtask', () => {
    expect(subtaskDateMax({ parentId: 'p' }, { dueDate: '2026-11-25' })).toBe('2026-11-25');
  });
  it('is undefined when the parent has no due date or is missing', () => {
    expect(subtaskDateMax({ parentId: 'p' }, {})).toBeUndefined();
    expect(subtaskDateMax({ parentId: 'p' }, undefined)).toBeUndefined();
  });
  it('is undefined for a main todo', () => {
    expect(subtaskDateMax({}, { dueDate: '2026-11-25' })).toBeUndefined();
    expect(subtaskDateMax({ parentId: null }, { dueDate: '2026-11-25' })).toBeUndefined();
  });
});

describe('clampSubtaskDate', () => {
  it('clamps a date after the max to the max', () => {
    expect(clampSubtaskDate('2026-11-30', '2026-11-25')).toBe('2026-11-25');
  });
  it('keeps the time part of the own value when clamping to the max date', () => {
    expect(clampSubtaskDate('2026-11-30T09:30:00', '2026-11-25T18:00:00')).toBe('2026-11-25T09:30:00');
  });
  it('leaves earlier or equal dates unchanged', () => {
    expect(clampSubtaskDate('2026-11-20', '2026-11-25')).toBe('2026-11-20');
    expect(clampSubtaskDate('2026-11-25', '2026-11-25')).toBe('2026-11-25');
    expect(clampSubtaskDate('2026-11-25T23:00:00', '2026-11-25')).toBe('2026-11-25T23:00:00');
  });
  it('leaves the date unchanged without a max', () => {
    expect(clampSubtaskDate('2026-12-31', undefined)).toBe('2026-12-31');
  });
  it('keeps an empty date empty', () => {
    expect(clampSubtaskDate('', '2026-11-25')).toBe('');
  });
});
