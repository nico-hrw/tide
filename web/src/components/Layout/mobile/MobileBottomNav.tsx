"use client";

import React from 'react';
import { Calendar, FileText, CheckSquare, MoreHorizontal, Plus } from 'lucide-react';

export type MobileTab = 'calendar' | 'notes' | 'todos';

export interface MobileBottomNavProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  onTabReclick?: (tab: MobileTab) => void;
  /** „Mehr“ öffnet die Seitenleiste mit Optionen und Erweiterungen. */
  onMoreClick?: () => void;
  onFabClick: () => void;
  badges?: {
    calendar?: number;
    notes?: number;
    todos?: number;
  };
  className?: string;
}

const TABS: { id: MobileTab; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
  { id: 'calendar', label: 'Kalender', icon: Calendar },
  { id: 'notes', label: 'Notizen', icon: FileText },
  { id: 'todos', label: 'Todos', icon: CheckSquare },
];

/**
 * Untere Leiste: ruhige Fläche mit vier Bereichen, der aktive zeigt seinen Namen.
 * Der Erstellen-Knopf steht getrennt rechts daneben.
 */
export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onTabChange,
  onTabReclick,
  onMoreClick,
  onFabClick,
  badges,
  className = '',
}) => {
  const itemBase =
    'relative h-11 min-w-[40px] px-2.5 rounded-2xl flex items-center justify-center gap-1.5 text-[12px] font-semibold whitespace-nowrap transition-colors active:scale-95';

  const renderTab = (tab: (typeof TABS)[number]) => {
    const Icon = tab.icon;
    const isActive = activeTab === tab.id;
    const badgeCount = badges?.[tab.id];
    return (
      <button
        key={tab.id}
        type="button"
        onClick={() => {
          if (isActive && onTabReclick) onTabReclick(tab.id);
          onTabChange(tab.id);
        }}
        aria-label={tab.label}
        aria-current={isActive ? 'page' : undefined}
        className={`${itemBase} ${isActive ? 'bg-t2-sub text-t2-ink' : 'text-t2-ink-3'}`}
      >
        <Icon size={20} strokeWidth={1.7} />
        {isActive && <span>{tab.label}</span>}
        {typeof badgeCount === 'number' && badgeCount > 0 && (
          <span className="absolute -top-1 -right-0.5 min-w-[18px] h-[18px] px-1 bg-t2-late text-white text-[10px] font-bold rounded-full flex items-center justify-center pointer-events-none">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <nav
      aria-label="Mobile Navigation"
      className={`fixed bottom-0 left-0 right-0 px-4 pt-1.5 flex items-center gap-2 z-20 pointer-events-none ${className}`}
      style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}
    >
      <div className="pointer-events-auto flex-1 min-w-0 h-[62px] rounded-[24px] flex items-center justify-between px-2">
        {TABS.map(renderTab)}
        <button
          type="button"
          onClick={onMoreClick}
          aria-label="Mehr"
          className={`${itemBase} text-t2-ink-3`}
        >
          <MoreHorizontal size={20} strokeWidth={1.7} />
        </button>
      </div>

      <button
        type="button"
        onClick={onFabClick}
        aria-label="Neues Element erstellen"
        className="pointer-events-auto w-[52px] h-[52px] shrink-0 rounded-full bg-cal-praktikum text-white flex items-center justify-center shadow-[0_6px_18px_-10px_rgba(0,0,0,0.35)] active:scale-95 transition-transform"
      >
        <Plus size={22} />
      </button>
    </nav>
  );
};

export default MobileBottomNav;
