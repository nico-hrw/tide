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
  P1: 'P1 - Niedrig',
  P2: 'P2 - Mittel',
  P3: 'P3 - Hoch',
};

export const PRIORITY_CLASSES: Record<NormalizedPriority, string> = {
  P3: 'text-[10px] font-bold text-white bg-black px-1.5 py-0.5 rounded leading-none',
  P2: 'text-[10px] font-bold text-white bg-gray-500 px-1.5 py-0.5 rounded leading-none',
  P1: 'text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded leading-none',
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
  const baseClasses = PRIORITY_CLASSES[normalized];
  const combinedClassName = className ? `${baseClasses} ${className}` : baseClasses;

  return (
    <span className={combinedClassName}>
      {normalized}
    </span>
  );
}

export default TodoPriorityBadge;
