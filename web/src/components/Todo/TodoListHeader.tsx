'use client';

import React from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { TaskItem } from '@/store/useDataStore';
import { TaskCreateDraft } from './TodoCreateCard';

export interface TodoListHeaderProps {
  activeCycleTotal: number;
  activeCycleCompletedCount: number;
  activeCycleInProgressCount: number;
  activeCycleOverdueCount: number;
  activeCycleOpenNonOverdueCount: number;
  archivedCount: number;
  tasks: TaskItem[];
  setDraft: React.Dispatch<React.SetStateAction<TaskCreateDraft>>;
  setIsCreateOpen: React.Dispatch<React.SetStateAction<boolean>>;
  hideProgress?: boolean;
  onBack?: () => void;
}

export const TodoListHeader: React.FC<TodoListHeaderProps> = (props) => {
  const {
    activeCycleTotal,
    activeCycleCompletedCount,
    archivedCount,
    hideProgress,
    onBack,
  } = props;

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (hideProgress) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tide:todo-cancel-edit'));
      }
      return;
    }
  };

  const showBackButton = Boolean(hideProgress || onBack);

  return (
    <div
      className={`sticky top-0 z-10 ${
        hideProgress
          ? 'hidden md:block px-4 sm:px-6 py-3.5 border-b border-t2-line '
          : 'px-4 sm:px-6 py-1.5 sm:py-2 border-b border-t2-line '
      } bg-[#f8f9fa]/90 dark:bg-[#121212]/90 backdrop-blur-md`}
    >
      {/* Desktop & iPad Header */}
      <div className={`hidden md:flex items-center justify-between ${!hideProgress ? 'pb-3' : ''}`}>
        <div className="flex items-center gap-3">
          {showBackButton && (
            <button
              type="button"
              onClick={handleBack}
              className="p-1.5 -ml-1.5 rounded-xl text-t2-ink-2 hover:text-t2-ink   hover:bg-t2-stage  transition-colors cursor-pointer shrink-0"
              title="Zurück zur Übersicht"
              aria-label="Zurück zur Übersicht"
            >
              <ArrowLeft size={20} />
            </button>
          )}

          <div className="flex items-center gap-2.5">
            {hideProgress ? (
              <button
                type="button"
                onClick={handleBack}
                className="text-3xl font-extrabold tracking-tight text-t2-ink  hover:opacity-80 transition-opacity cursor-pointer text-left"
                title="Zurück zur Übersicht"
              >
                Todos
              </button>
            ) : (
              <h1 className="text-3xl font-extrabold tracking-tight text-t2-ink ">
                Todos
              </h1>
            )}

            {hideProgress && (
              <>
                <ChevronRight size={18} className="text-t2-ink-3 " />
                <span className="text-xl font-bold text-t2-ink-2 ">
                  Details
                </span>
              </>
            )}
          </div>

        </div>

        {hideProgress ? (
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-t2-ink-2  hover:text-t2-ink  bg-t2-surface  hover:bg-t2-hover  border border-t2-line  rounded-xl transition-all shadow-2xs cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>Zurück</span>
          </button>
        ) : null}
      </div>

      {/* Mobile Segmented Pill Row */}
      {!hideProgress && (
        <div className="flex md:hidden items-center justify-between pt-0.5 pb-2">
          <div className="flex items-center gap-2">
            {showBackButton && (
              <button
                type="button"
                onClick={handleBack}
                className="p-1 rounded-lg text-t2-ink-2 hover:text-t2-ink   cursor-pointer shrink-0"
                title="Zurück zur Übersicht"
                aria-label="Zurück zur Übersicht"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <h1 className="text-xl font-black tracking-tight text-t2-ink ">
              Todos
            </h1>
          </div>
        </div>
      )}

      {!hideProgress && (
        <>
          {/* Progress circle: the arc fills with the completed share of this cycle */}
          <div className="flex items-center justify-end pb-1">
            <svg width="28" height="28" viewBox="0 0 36 36" aria-label={`${Math.round((activeCycleCompletedCount / Math.max(activeCycleTotal, 1)) * 100)}% erledigt`}>
              <circle cx="18" cy="18" r="15" fill="none" stroke="var(--t2-line)" strokeWidth="3.5" />
              <circle
                cx="18" cy="18" r="15" fill="none" stroke="var(--t2-ink)" strokeWidth="3.5" strokeLinecap="round"
                strokeDasharray={`${(activeCycleCompletedCount / Math.max(activeCycleTotal, 1)) * 94.25} 94.25`}
                transform="rotate(-90 18 18)"
                className="transition-all duration-500 ease-out"
              />
            </svg>
          </div>

          {/* Counter text */}
          <div className="flex items-center justify-between mt-1.5">
            {archivedCount > 0 ? (
              <span
                className="text-[11px] px-1.5 py-0.5 rounded-full bg-t2-hover  text-t2-ink-2  font-medium"
                title={`${archivedCount} archivierte Aufgaben (> 7 Tage)`}
              >
                +{archivedCount} archiviert
              </span>
            ) : (
              <span />
            )}
            <p className="text-[11px] font-medium text-t2-ink-3  text-right">
              {activeCycleTotal > 0 ? `Heute ${activeCycleCompletedCount} von ${activeCycleTotal} erledigt` : ''}
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default TodoListHeader;
