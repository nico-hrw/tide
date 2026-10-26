'use client';

import React from 'react';
import { Plus, ListTodo, Folder, FolderPlus } from 'lucide-react';
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
}

export const TodoListHeader: React.FC<TodoListHeaderProps> = ({
  viewMode, setViewMode, selectedFolder, activeCycleTotal, activeCycleCompletedCount, activeCycleInProgressCount, activeCycleOverdueCount, activeCycleOpenNonOverdueCount, archivedCount, tasks, allFolders, setDraft, setIsCreateOpen, setIsFolderModalOpen,
}) => {
  return (
    <>
      {/* Header & Status Indicator */}
      <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 px-3 sm:px-6 md:px-8 py-2.5 sm:py-3 border-b border-gray-200 dark:border-white/10 bg-white/90 dark:bg-[#121212]/90 backdrop-blur-md">
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white leading-tight">Todos</h1>

          {/* Thick Segmented Progress Bar */}
          <div className="flex flex-col gap-1 w-full sm:w-auto sm:min-w-[220px] flex-1 sm:flex-initial max-w-xs">
            <div className="flex items-center justify-between text-[11px] font-semibold text-gray-700 dark:text-gray-300 px-0.5">
              <span className="truncate">
                {activeCycleTotal > 0
                  ? `${activeCycleCompletedCount} von ${activeCycleTotal} erledigt`
                  : 'Keine aktiven Aufgaben'}
                <span className="text-[10px] text-gray-400 dark:text-gray-500 font-normal ml-1">
                  (letzte 7 Tage)
                </span>
              </span>
              {archivedCount > 0 && (
                <span
                  className="text-[10px] px-1.5 py-0.2 rounded-full bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400 font-medium shrink-0 ml-1.5"
                  title={`${archivedCount} archivierte Aufgaben (> 7 Tage)`}
                >
                  +{archivedCount} archiviert
                </span>
              )}
            </div>

            <div className="h-3.5 sm:h-4 w-full bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden flex items-stretch">
              {activeCycleTotal > 0 ? (
                <>
                  {activeCycleCompletedCount > 0 && (
                    <div
                      className="bg-emerald-500 dark:bg-emerald-400 transition-all duration-300"
                      style={{ width: `${(activeCycleCompletedCount / activeCycleTotal) * 100}%` }}
                      title={`Erledigt: ${activeCycleCompletedCount}`}
                    />
                  )}
                  {activeCycleInProgressCount > 0 && (
                    <div
                      className="bg-amber-500 dark:bg-amber-400 transition-all duration-300"
                      style={{ width: `${(activeCycleInProgressCount / activeCycleTotal) * 100}%` }}
                      title={`In Bearbeitung: ${activeCycleInProgressCount}`}
                    />
                  )}
                  {activeCycleOpenNonOverdueCount > 0 && (
                    <div
                      className="bg-blue-500 dark:bg-blue-400 transition-all duration-300"
                      style={{ width: `${(activeCycleOpenNonOverdueCount / activeCycleTotal) * 100}%` }}
                      title={`Offen: ${activeCycleOpenNonOverdueCount}`}
                    />
                  )}
                  {activeCycleOverdueCount > 0 && (
                    <div
                      className="bg-rose-500 dark:bg-rose-400 transition-all duration-300"
                      style={{ width: `${(activeCycleOverdueCount / activeCycleTotal) * 100}%` }}
                      title={`ÃœberfÃ¤llig: ${activeCycleOverdueCount}`}
                    />
                  )}
                </>
              ) : null}
            </div>

            <div className="flex items-center gap-2.5 text-xs font-bold px-0.5">
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400" title="Erledigt (letzte 7 Tage)">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                {activeCycleCompletedCount}
              </span>
              {activeCycleInProgressCount > 0 && (
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400" title="In Bearbeitung">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  {activeCycleInProgressCount}
                </span>
              )}
              <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400" title="Offen">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                {activeCycleOpenNonOverdueCount}
              </span>
              {activeCycleOverdueCount > 0 && (
                <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400" title="ÃœberfÃ¤llig">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  {activeCycleOverdueCount}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions & View Switch */}
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
          {/* Segmented View Toggle: Aufgaben vs Ordner */}
          <div className="flex items-center bg-gray-100 dark:bg-white/5 p-1 rounded-xl border border-gray-200 dark:border-white/10">
            <button
              type="button"
              onClick={() => setViewMode('tasks')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer min-h-[32px] ${
                viewMode === 'tasks'
                  ? 'bg-white dark:bg-[#242424] text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <ListTodo size={14} />
              <span>Aufgaben</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('folders')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer min-h-[32px] ${
                viewMode === 'folders'
                  ? 'bg-white dark:bg-[#242424] text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Folder size={14} />
              <span>Ordner</span>
              {allFolders.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                  {allFolders.length}
                </span>
              )}
            </button>
          </div>

          {/* + Neuer Ordner */}
          <button
            type="button"
            onClick={() => setIsFolderModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-[#242424] hover:bg-gray-50 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 active:scale-95 rounded-xl transition-all shadow-2xs shrink-0 cursor-pointer min-h-[36px]"
          >
            <FolderPlus size={16} />
            <span className="hidden sm:inline">Neuer Ordner</span>
            <span className="sm:hidden">Ordner</span>
          </button>

          {/* + Neue Aufgabe */}
          <button
            type="button"
            onClick={() => {
              if (viewMode === 'folders') setViewMode('tasks');
              setDraft((p) => ({ ...p, folder: selectedFolder || '' }));
              setIsCreateOpen((prev) => !prev);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-xl transition-all shadow-xs shrink-0 cursor-pointer min-h-[36px]"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Neue Aufgabe</span>
            <span className="sm:hidden">Aufgabe</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default TodoListHeader;
