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

          {props.selectedFolder && (
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-t2-sub  text-t2-accent  font-semibold">
              {props.selectedFolder}
            </span>
          )}
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
        ) : (
          <div className="inline-flex items-center p-1 bg-t2-stage  rounded-xl">
            <button
              type="button"
              onClick={() => props.setViewMode('tasks')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                props.viewMode === 'tasks'
                  ? 'bg-t2-surface  text-t2-accent  shadow-xs'
                  : 'text-t2-ink-2  hover:text-t2-ink '
              }`}
            >
              Liste
            </button>
            <button
              type="button"
              onClick={() => props.setViewMode('folders')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                props.viewMode === 'folders'
                  ? 'bg-t2-surface  text-t2-accent  shadow-xs'
                  : 'text-t2-ink-2  hover:text-t2-ink '
              }`}
            >
              Ordner
            </button>
          </div>
        )}
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
          <div className="inline-flex items-center p-0.5 bg-t2-stage  rounded-xl">
            <button
              type="button"
              onClick={() => props.setViewMode('tasks')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                props.viewMode === 'tasks'
                  ? 'bg-t2-surface  text-t2-accent  shadow-xs'
                  : 'text-t2-ink-2 '
              }`}
            >
              Liste
            </button>
            <button
              type="button"
              onClick={() => props.setViewMode('folders')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                props.viewMode === 'folders'
                  ? 'bg-t2-surface  text-t2-accent  shadow-xs'
                  : 'text-t2-ink-2 '
              }`}
            >
              Ordner
            </button>
          </div>
        </div>
      )}

      {!hideProgress && (
        <>
          {/* Progress Bar */}
          <div className="w-full h-2.5 bg-t2-hover  rounded-full overflow-hidden flex">
            <div
              className="h-full rounded-full bg-t2-accent transition-all duration-500 ease-out"
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
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-t2-hover  text-t2-ink-2  font-medium"
                title={`${archivedCount} archivierte Aufgaben (> 7 Tage)`}
              >
                +{archivedCount} archiviert
              </span>
            ) : (
              <span />
            )}
            <p className="text-[11px] font-medium text-t2-ink-3  text-right">
              {activeCycleCompletedCount} von {activeCycleTotal} erledigt
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default TodoListHeader;
