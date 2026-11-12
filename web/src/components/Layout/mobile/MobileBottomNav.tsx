"use client";

import React from 'react';
import { Calendar, FileText, CheckSquare, Search, SlidersHorizontal, Plus } from 'lucide-react';

export type MobileTab = 'calendar' | 'notes' | 'todos';

export interface MobileBottomNavProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  onTabReclick?: (tab: MobileTab) => void;
  isSearchOpen: boolean;
  onToggleSearch: () => void;
  isFilterOpen: boolean;
  onToggleFilter: () => void;
  onFabClick: () => void;
  badges?: {
    calendar?: number;
    notes?: number;
    todos?: number;
  };
  className?: string;
}

const TABS: { id: MobileTab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: 'calendar', label: 'Kalender', icon: Calendar },
  { id: 'notes', label: 'Notizen', icon: FileText },
  { id: 'todos', label: 'Aufgaben', icon: CheckSquare },
];

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onTabChange,
  onTabReclick,
  isSearchOpen,
  onToggleSearch,
  isFilterOpen,
  onToggleFilter,
  onFabClick,
  badges,
  className = '',
}) => {
  const capsuleClass =
    'pointer-events-auto bg-white/85 dark:bg-neutral-900/85 backdrop-blur-md border border-neutral-200/80 dark:border-neutral-800 rounded-full p-1.5 shadow-lg flex items-center gap-1';

  const getButtonClass = (isActive: boolean) =>
    `relative w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 ${
      isActive
        ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-sm'
        : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
    }`;

  return (
    <nav
      aria-label="Mobile Navigation"
      className={`fixed bottom-0 left-0 right-0 px-4 pb-2 sm:pb-2.5 pt-1.5 flex items-center justify-between z-20 pointer-events-none ${className}`}
      style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
    >
      {/* 1. Linke Kapsel: Kalender / Notizen / Aufgaben */}
      <div className={capsuleClass}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const badgeCount = badges?.[tab.id];

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (isActive && onTabReclick) {
                  onTabReclick(tab.id);
                }
                onTabChange(tab.id);
              }}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
              className={getButtonClass(isActive)}
            >
              <Icon size={20} />
              {typeof badgeCount === 'number' && badgeCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center pointer-events-none">
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 2. Mittlere Kapsel: Suche & Filter */}
      <div className={capsuleClass}>
        <button
          type="button"
          onClick={onToggleSearch}
          aria-label="Suche umschalten"
          aria-expanded={isSearchOpen}
          className={getButtonClass(isSearchOpen)}
        >
          <Search size={20} />
        </button>

        <button
          type="button"
          onClick={onToggleFilter}
          aria-label="Filter umschalten"
          aria-expanded={isFilterOpen}
          className={getButtonClass(isFilterOpen)}
        >
          <SlidersHorizontal size={20} />
        </button>
      </div>

      {/* 3. Rechte Kapsel: Floating Action Button (+) */}
      <button
        type="button"
        onClick={onFabClick}
        aria-label="Neues Element erstellen"
        className="pointer-events-auto w-[52px] h-[52px] rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 flex items-center justify-center shadow-lg hover:bg-neutral-800 dark:hover:bg-neutral-100 active:scale-95 transition-all"
      >
        <Plus size={24} />
      </button>
    </nav>
  );
};

export default MobileBottomNav;
