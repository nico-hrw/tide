'use client';

import React from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { TaskItem } from '@/store/useDataStore';
import { TaskCreateDraft } from './TodoCreateCard';

export interface TodoListHeaderProps {
  viewMode: 'tasks' | 'folders';
  setViewMode: (mode: 'tasks' | 'folders') => void;
  selectedFolder: string | null;
  activeCycleTotal: number;
  activeCycleCompletedCount: number;
  activeCycleInProgressCount: number;
  activeCycleOverdueCount: number;
  activeCycleOpenNonOverdueCount: number;
  archivedCount: number;
  tasks: TaskItem[];
  allFolders: string[];
  setDraft: React.Dispatch<React.SetStateAction<TaskCreateDraft>>;
  setIsCreateOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsFolderModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  hideProgress?: boolean;
  onBack?: () => void;
}

export const TodoListHeader: React.FC<TodoListHeaderProps> = (props) => {
  const {
    activeCycleTotal,
    activeCycleCompletedCount,
    activeCycleOverdueCount,
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
    if (props.viewMode === 'folders') {
      props.setViewMode('tasks');
    }
  };

  const showBackButton = Boolean(hideProgress || onBack);

  return (
    <div
      className={`sticky top-0 z-30 ${
        hideProgress
          ? 'hidden md:block px-4 sm:px-6 py-3.5 border-b border-gray-200 dark:border-white/10'
          : 'px-4 sm:px-6 py-2.5 sm:py-3 border-b border-gray-200 dark:border-white/10'
      } bg-[#f8f9fa]/90 dark:bg-[#121212]/90 backdrop-blur-md`}
    >
      {/* Desktop & iPad Header */}
      <div className={`hidden md:flex items-center justify-between ${!hideProgress ? 'pb-3' : ''}`}>
        <div className="flex items-center gap-3">
          {showBackButton && (
            <button
              type="button"
              onClick={handleBack}
              className="p-1.5 -ml-1.5 rounded-xl text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
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
                className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white hover:opacity-80 transition-opacity cursor-pointer text-left"
                title="Zurück zur Übersicht"
              >
                Todos
              </button>
            ) : (
              <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
                Todos
              </h1>
            )}

            {hideProgress && (
              <>
                <ChevronRight size={18} className="text-gray-400 dark:text-gray-600" />
                <span className="text-xl font-bold text-gray-500 dark:text-gray-400">
                  Details
                </span>
              </>
            )}
          </div>

          {props.selectedFolder && (
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-semibold">
              {props.selectedFolder}
            </span>
          )}
        </div>

        {hideProgress && (
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white bg-white dark:bg-white/10 hover:bg-gray-100 dark:hover:bg-white/15 border border-gray-200/80 dark:border-white/10 rounded-xl transition-all shadow-2xs cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>Zurück</span>
          </button>
        )}
      </div>

      {!hideProgress && (
        <>
          {/* Progress Bar */}
          <div className="w-full h-2.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden flex">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-500 ease-out"
              style={{ width: `${(activeCycleCompletedCount / Math.max(activeCycleTotal, 1)) * 100}%` }}
            />
            <div
              className="h-full rounded-full bg-red-500 transition-all duration-500 ease-out"
              style={{ width: `${(activeCycleOverdueCount / Math.max(activeCycleTotal, 1)) * 100}%` }}
            />
          </div>

          {/* Counter text */}
          <div className="flex items-center justify-between mt-1.5">
            {archivedCount > 0 ? (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400 font-medium"
                title={`${archivedCount} archivierte Aufgaben (> 7 Tage)`}
              >
                +{archivedCount} archiviert
              </span>
            ) : (
              <span />
            )}
            <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500 mt-1.5 text-right">
              {activeCycleCompletedCount} von {activeCycleTotal} erledigt
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default TodoListHeader;
