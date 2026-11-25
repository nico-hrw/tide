"use client";

import React, { useEffect, useState } from 'react';
import {
  CalendarPlus,
  Check,
  CheckSquare,
  FolderPlus,
  PenLine,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  MobileBottomNav,
  MobileBottomNavProps,
  MobileTab,
} from './MobileBottomNav';

export interface MobileBottomDockProps {
  activeTab: MobileTab;
  setActiveTab: (tab: MobileTab) => void;
  navBadges?: MobileBottomNavProps['badges'];
  editingTodoId: string | null;
  onCancelEditTodo: () => void;
  onDeleteEditTodo: (id: string) => void;
  onDoneEditTodo: (id: string) => void;
  onAddSubtask: () => void;
  isPlusMenuOpen: boolean;
  setIsPlusMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onNewEvent: () => void;
  onNewTodo: () => void;
  onNewNote: () => void;
  onNewFolder?: () => void;
  onMoreClick?: () => void;
  onGoToToday?: () => void;
}

export const MobileBottomDock: React.FC<MobileBottomDockProps> = ({
  activeTab,
  setActiveTab,
  navBadges,
  editingTodoId,
  onCancelEditTodo,
  onDeleteEditTodo,
  onDoneEditTodo,
  onAddSubtask,
  isPlusMenuOpen,
  setIsPlusMenuOpen,
  onNewEvent,
  onNewTodo,
  onNewNote,
  onNewFolder,
  onMoreClick,
  onGoToToday,
}) => {
  // ── Keyboard-aware bottom bar offset ────────────────────────────────────────
  const [kbOffset, setKbOffset] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    let raf: number | null = null;
    const handler = () => {
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const next = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        setKbOffset((prev) => (prev === next ? prev : next));
      });
    };

    vv.addEventListener('resize', handler);
    vv.addEventListener('scroll', handler);
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      vv.removeEventListener('resize', handler);
      vv.removeEventListener('scroll', handler);
    };
  }, []);

  if (editingTodoId) {
    return (
      <div
        className="fixed left-0 right-0 px-4 pb-2 sm:pb-2.5 pt-1.5 flex items-center justify-between z-30 pointer-events-none"
        style={{
          bottom: kbOffset > 0 ? kbOffset : 0,
          paddingBottom: kbOffset > 0 ? 8 : 'max(8px, env(safe-area-inset-bottom))',
        }}
      >
        {/* Central Pill: Abbrechen, Löschen, Fertig */}
        <div className="pointer-events-auto bg-t2-surface backdrop-blur-md border border-t2-line rounded-full p-1.5 shadow-lg flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCancelEditTodo}
            className="h-10 px-3.5 flex items-center gap-1.5 rounded-full text-xs font-semibold text-t2-ink-2 hover:text-t2-ink hover:bg-t2-hover transition-all active:scale-95 shrink-0 cursor-pointer"
            title="Abbrechen"
          >
            <X size={15} />
            <span>Abbrechen</span>
          </button>

          <button
            type="button"
            onClick={() => onDeleteEditTodo(editingTodoId)}
            className="w-10 h-10 flex items-center justify-center rounded-full text-rose-500 hover:bg-rose-500/10 transition-all active:scale-95 shrink-0 cursor-pointer"
            title="Löschen"
            aria-label="Löschen"
          >
            <Trash2 size={16} />
          </button>

          <button
            type="button"
            onClick={() => onDoneEditTodo(editingTodoId)}
            className="h-10 px-4 flex items-center gap-1.5 rounded-full text-xs font-semibold bg-t2-ink text-white dark:text-neutral-900 shadow-sm transition-all active:scale-95 shrink-0 cursor-pointer hover:bg-t2-ink"
            title="Fertig"
          >
            <Check size={15} strokeWidth={2.4} />
            <span>Fertig</span>
          </button>
        </div>

        {/* Right Floating FAB Button */}
        <button
          type="button"
          onClick={onAddSubtask}
          aria-label="Unteraufgabe hinzufügen"
          className="pointer-events-auto w-[52px] h-[52px] rounded-full bg-t2-ink text-white dark:text-neutral-900 flex items-center justify-center shadow-lg hover:bg-t2-ink active:scale-95 transition-all cursor-pointer shrink-0"
          title="Unteraufgabe hinzufügen"
        >
          <Plus size={24} />
        </button>
      </div>
    );
  }

  return (
    <>
      <MobileBottomNav
        activeTab={activeTab}
        onTabChange={(tab: MobileTab) => {
          if (tab !== activeTab) {
            setActiveTab(tab);
          }
          setIsPlusMenuOpen(false);
        }}
        onTabReclick={(tab: MobileTab) => {
          if (tab === 'calendar') {
            onGoToToday?.();
          } else if (tab === 'todos') {
            window.dispatchEvent(new CustomEvent('tide:scroll-to-today'));
          }
        }}
        onMoreClick={onMoreClick}
        onFabClick={() => {
          setIsPlusMenuOpen((prev) => !prev);
        }}
        badges={navBadges}
      />

      {isPlusMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsPlusMenuOpen(false)}
          />
          <div
            className="fixed bottom-[84px] right-4 rounded-2xl shadow-xl border p-2 flex flex-col w-[170px] z-50 transition-all origin-bottom-right"
            style={{
              background: 'var(--t2-surface)',
              borderColor: 'var(--t2-line-soft)',
              boxShadow:
                '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setIsPlusMenuOpen(false);
                onNewEvent();
              }}
              className="flex items-center gap-3 w-full text-left px-3 py-3 text-[15px] font-semibold rounded-xl transition-colors cursor-pointer hover:bg-t2-sub"
              style={{ color: 'var(--t2-ink)' }}
            >
              <CalendarPlus className="w-5 h-5 text-t2-accent shrink-0" />
              <span>Termin</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsPlusMenuOpen(false);
                onNewTodo();
              }}
              className="flex items-center gap-3 w-full text-left px-3 py-3 text-[15px] font-semibold rounded-xl transition-colors cursor-pointer hover:bg-t2-sub"
              style={{ color: 'var(--t2-ink)' }}
            >
              <CheckSquare className="w-5 h-5 text-green-500 shrink-0" />
              <span>To-Do</span>
            </button>

            {activeTab === 'notes' && (
              <>
                <div
                  className="h-[1px] my-1"
                  style={{ background: 'var(--t2-hover)' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    onNewNote();
                    setIsPlusMenuOpen(false);
                  }}
                  className="flex items-center gap-3 w-full text-left px-3 py-2 text-[14px] font-medium rounded-xl transition-colors cursor-pointer hover:bg-t2-sub"
                  style={{ color: 'var(--t2-ink-2)' }}
                >
                  <PenLine size={16} className="text-t2-accent shrink-0" />
                  <span>Notiz</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onNewFolder?.();
                    setIsPlusMenuOpen(false);
                  }}
                  className="flex items-center gap-3 w-full text-left px-3 py-2 text-[14px] font-medium rounded-xl transition-colors cursor-pointer hover:bg-t2-sub"
                  style={{ color: 'var(--t2-ink-2)' }}
                >
                  <FolderPlus size={16} className="text-t2-accent shrink-0" />
                  <span>Ordner</span>
                </button>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
};

export default MobileBottomDock;
