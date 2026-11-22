'use client';

import React, { createContext, useContext } from 'react';
import { ChevronUp, ChevronDown, Minus, Clock } from 'lucide-react';
import { normalizePriority, type PriorityLevel } from './TodoPriorityBadge';

/**
 * Tide 2 mobile look for todo cards. MobileLayout wraps TodoList in
 * <MobileTodoStyleProvider>; TodoTreeItem reads the flag and swaps only
 * colours/icons, so desktop rendering is untouched.
 */
const MobileTodoStyleContext = createContext(false);

export const MobileTodoStyleProvider = ({ children }: { children: React.ReactNode }) => (
  <MobileTodoStyleContext.Provider value={true}>{children}</MobileTodoStyleContext.Provider>
);

export const useMobileTodoStyle = () => useContext(MobileTodoStyleContext);

const PRIORITY_COLOR = { P3: '#A9623F', P2: '#C0893A', P1: '#7E9A83' } as const;
/** On today's green card the regular colours blend in (Niedrig has the card's own green), so lighter ones are used. */
const PRIORITY_COLOR_ON_TODAY = { P3: '#FFB38A', P2: '#FFE08A', P1: '#C9F2D0' } as const;

/** Light grey tint card, Balsam green for today's card. */
export function mobileCardStyle(isCompleted: boolean, isTodayActive: boolean): React.CSSProperties {
  if (isCompleted) return {};
  if (isTodayActive) return { background: 'var(--cal-praktikum)', color: 'var(--cal-praktikum-ink)', border: '1px solid transparent', boxShadow: 'none' };
  return { background: 'color-mix(in srgb, #5C6E6C 8%, var(--t2-bg))', color: 'var(--t2-ink)', border: '1px solid transparent', boxShadow: 'none' };
}

export function MobilePriorityIcon({ priority, onToday }: { priority?: PriorityLevel | string; onToday?: boolean }) {
  if (!priority) return null;
  const p = normalizePriority(priority);
  const Icon = p === 'P3' ? ChevronUp : p === 'P2' ? Minus : ChevronDown;
  return (
    <span className="select-none inline-flex items-center justify-center" style={{ color: (onToday ? PRIORITY_COLOR_ON_TODAY : PRIORITY_COLOR)[p] }}>
      <Icon size={14} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </span>
  );
}

export function MobileOverdue() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium whitespace-nowrap" style={{ color: 'var(--t2-ink-3)' }}>
      <Clock size={12} strokeWidth={2.2} />
      Überfällig
    </span>
  );
}
