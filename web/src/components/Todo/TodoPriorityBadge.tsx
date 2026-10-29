import React from 'react';

export type PriorityLevel = 'low' | 'medium' | 'high' | 'P1' | 'P2' | 'P3' | 1 | 2 | 3;

export type NormalizedPriority = 'P1' | 'P2' | 'P3';

export const PRIORITY_MAP: Record<string, NormalizedPriority> = {
  high: 'P3',
  High: 'P3',
  HIGH: 'P3',
  P3: 'P3',
  p3: 'P3',
  '3': 'P3',

  medium: 'P2',
  Medium: 'P2',
  MEDIUM: 'P2',
  P2: 'P2',
  p2: 'P2',
  '2': 'P2',

  low: 'P1',
  Low: 'P1',
  LOW: 'P1',
  P1: 'P1',
  p1: 'P1',
  '1': 'P1',
};

export const PRIORITY_LABELS: Record<NormalizedPriority, string> = {
  P1: '1 - Niedrig',
  P2: '2 - Mittel',
  P3: '3 - Hoch',
};

export const PRIORITY_CLASSES: Record<NormalizedPriority, string> = {
  P3: 'text-[10px] font-bold px-1.5 py-0.5 rounded leading-none text-white bg-red-600 dark:bg-red-500',
  P2: 'text-[10px] font-bold px-1.5 py-0.5 rounded leading-none text-black bg-amber-400 dark:bg-amber-400',
  P1: 'text-[10px] font-bold px-1.5 py-0.5 rounded leading-none text-white bg-emerald-600 dark:bg-emerald-500',
};

export function normalizePriority(priority?: PriorityLevel | string): NormalizedPriority {
  if (priority === undefined || priority === null || priority === '') {
    return 'P1';
  }

  if (typeof priority === 'number') {
    if (priority === 3) return 'P3';
    if (priority === 2) return 'P2';
    return 'P1';
  }

  const key = String(priority).trim().toLowerCase();
  return PRIORITY_MAP[key] ?? 'P1';
}

export function getPriorityLabel(priority?: PriorityLevel | string): string {
  const normalized = normalizePriority(priority);
  return PRIORITY_LABELS[normalized];
}

export interface TodoPriorityBadgeProps {
  priority?: PriorityLevel | string;
  className?: string;
}

export function TodoPriorityBadge({ priority, className }: TodoPriorityBadgeProps) {
  const normalized = normalizePriority(priority);

  if (normalized === 'P2') {
    return null;
  }

  if (normalized === 'P3') {
    return (
      <span className={`text-red-500 dark:text-red-400 font-black text-xs leading-none select-none ${className || ''}`} title="Priorität: Hoch">
        ∧
      </span>
    );
  }

  return (
    <span className={`text-emerald-500 dark:text-emerald-400 font-black text-xs leading-none select-none ${className || ''}`} title="Priorität: Niedrig">
      ∨
    </span>
  );
}

export default TodoPriorityBadge;
