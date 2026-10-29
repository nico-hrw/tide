'use client';

import React from 'react';
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
}

export const TodoListHeader: React.FC<TodoListHeaderProps> = (props) => {
  const {
    activeCycleTotal,
    activeCycleCompletedCount,
    activeCycleOverdueCount,
    archivedCount,
    hideProgress,
  } = props;

  return (
    <div
      className={`sticky top-0 z-30 px-4 sm:px-6 ${
        hideProgress
          ? 'py-0 border-none'
          : 'py-2.5'
      } bg-[#f8f9fa]/90 dark:bg-[#121212]/90 backdrop-blur-md border-b border-gray-200 dark:border-white/10`}
    >
      {/* Desktop & iPad Header */}
      <div className="hidden md:flex items-center justify-between pb-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
            Todos
          </h1>
          {props.selectedFolder && (
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-semibold">
              {props.selectedFolder}
            </span>
          )}
        </div>
      </div>

      {!props.hideProgress && (
        <>
          {/* Hairline 3px Progress Bar */}
          <div className="w-full h-[3px] bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-blue-500 transition-all duration-500 ease-out"
              style={{ width: `${(activeCycleCompletedCount / Math.max(activeCycleTotal, 1)) * 100}%` }}
            />
            <div
              className="h-full bg-red-500 transition-all duration-500 ease-out"
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
