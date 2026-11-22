'use client';

import React from 'react';
import { ChevronUp, ChevronDown, Minus, Check } from 'lucide-react';
import type { Priority } from './types';

/** Tide 2 Prioritätsfarben (gedämpft, bewusst kein Rot). */
export const T2_PRIORITY_COLOR: Record<Priority, string> = {
  high: '#A9623F',
  medium: '#C0893A',
  low: '#7E9A83',
};

/** Auf der grünen Heute-Karte würden die normalen Farben verschwinden (Niedrig ist dort sogar gleichfarbig), deshalb hellere Varianten. */
export const T2_PRIORITY_COLOR_ON_DARK: Record<Priority, string> = {
  high: '#FFB38A',
  medium: '#FFE08A',
  low: '#C9F2D0',
};

export const T2_PRIORITY_LABEL: Record<Priority, string> = {
  high: 'Hoch',
  medium: 'Mittel',
  low: 'Niedrig',
};

interface PriorityIconProps {
  priority: Priority;
  size?: number;
  className?: string;
  /** Icon liegt auf der grünen Heute-Karte: helle, aber weiterhin farbige Varianten. */
  onDark?: boolean;
}

export const TodoPriorityIcon: React.FC<PriorityIconProps> = ({ priority, size = 16, className, onDark }) => {
  const Icon = priority === 'high' ? ChevronUp : priority === 'low' ? ChevronDown : Minus;
  return (
    <Icon
      size={size}
      strokeWidth={2.4}
      aria-label={`Priorität ${T2_PRIORITY_LABEL[priority]}`}
      className={className}
      style={{ color: (onDark ? T2_PRIORITY_COLOR_ON_DARK : T2_PRIORITY_COLOR)[priority] }}
    />
  );
};

interface CheckboxProps {
  checked: boolean;
  onClick: (e: React.MouseEvent) => void;
  size?: number;
  onDark?: boolean;
  label: string;
}

export const TodoCheckbox: React.FC<CheckboxProps> = ({ checked, onClick, size = 18, onDark, label }) => {
  const ring = onDark ? 'border-t2-line' : 'border-t2-ink-3';
  const fill = onDark ? 'bg-t2-surface text-cal-praktikum' : 'bg-t2-ink text-t2-bg';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-full border-[1.5px] flex items-center justify-center cursor-pointer transition-colors ${
        checked ? `${fill} border-transparent` : `${ring} bg-transparent hover:bg-t2-hover`
      }`}
    >
      {checked && <Check size={size - 7} strokeWidth={3} />}
    </button>
  );
};
