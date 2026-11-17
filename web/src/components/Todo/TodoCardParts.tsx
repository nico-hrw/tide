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

export const T2_PRIORITY_LABEL: Record<Priority, string> = {
  high: 'Hoch',
  medium: 'Mittel',
  low: 'Niedrig',
};

interface PriorityIconProps {
  priority: Priority;
  size?: number;
  className?: string;
  /** Farbe vom Elternelement erben (z. B. weiß auf der grünen Heute-Karte). */
  inherit?: boolean;
}

export const TodoPriorityIcon: React.FC<PriorityIconProps> = ({ priority, size = 16, className, inherit }) => {
  const Icon = priority === 'high' ? ChevronUp : priority === 'low' ? ChevronDown : Minus;
  return (
    <Icon
      size={size}
      strokeWidth={2.4}
      aria-label={`Priorität ${T2_PRIORITY_LABEL[priority]}`}
      className={className}
      style={inherit ? undefined : { color: T2_PRIORITY_COLOR[priority] }}
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
  const ring = onDark ? 'border-white' : 'border-t2-ink-3';
  const fill = onDark ? 'bg-white text-cal-praktikum' : 'bg-t2-ink text-t2-bg';
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
