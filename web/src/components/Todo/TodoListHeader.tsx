'use client';

import React, { useMemo } from 'react';
import { Plus, ListTodo, Folder, FolderPlus } from 'lucide-react';
import { useDataStore, TaskItem } from '@/store/useDataStore';
import { TaskCreateDraft } from './TodoCreateCard';
import { NextEventCountdown, CountdownEvent } from '@/components/Layout/MobileHeaderWidgets';

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

interface UserStoreSlice {
  user?: { name?: string; username?: string };
}

export const TodoListHeader: React.FC<TodoListHeaderProps> = ({
  viewMode,
  setViewMode,
  selectedFolder,
  activeCycleTotal,
  activeCycleCompletedCount,
  activeCycleOverdueCount,
  archivedCount,
  allFolders,
  setDraft,
  setIsCreateOpen,
  setIsFolderModalOpen,
}) => {
  const storeUser = useDataStore((s) => (s as unknown as UserStoreSlice).user);
  const userName =
    storeUser?.name ||
    storeUser?.username ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('tide_user_name') || sessionStorage.getItem('tide_user_name')
      : null) ||
    'Nico';

  const storeEvents = useDataStore((s) => s.events);
  const countdownEvents: CountdownEvent[] = useMemo(() => {
    return (storeEvents || []).map((e) => {
      const rec = e as Record<string, unknown>;
      return {
        id: e.id,
        title: typeof e.title === 'string' ? e.title : undefined,
        start:
          typeof e.start === 'string'
            ? e.start
            : typeof rec.startTime === 'string'
            ? (rec.startTime as string)
            : '',
        end:
          typeof e.end === 'string'
            ? e.end
            : typeof rec.endTime === 'string'
            ? (rec.endTime as string)
            : undefined,
        allDay: Boolean(e.allDay),
        color: typeof e.color === 'string' ? e.color : undefined,
      };
    });
  }, [storeEvents]);

  return (
    <div className="sticky top-0 z-30 px-4 sm:px-6 pt-4 pb-3 border-b border-gray-100 dark:border-white/10 bg-white/95 dark:bg-[#121212]/95 backdrop-blur-md">
      {/* Visual Header (Top row) */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        {/* Left side: Greeting */}
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
            Hi,{' '}
            <span className="text-3xl sm:text-4xl text-gray-900 dark:text-white font-extrabold">
              {userName || 'Nico'},
            </span>
          </h1>
          <span className="block text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
            was steht an?
          </span>
        </div>

        {/* Right side: Next Event Countdown & Action Controls */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 flex-wrap justify-end">
          <NextEventCountdown events={countdownEvents} />

          {/* Segmented View Toggle: Aufgaben vs Ordner */}
          <div className="flex items-center bg-gray-100 dark:bg-white/5 p-1 rounded-xl border border-gray-200 dark:border-white/10">
            <button
              type="button"
              onClick={() => setViewMode('tasks')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer min-h-[30px] ${
                viewMode === 'tasks'
                  ? 'bg-white dark:bg-[#242424] text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
              title="Aufgaben"
            >
              <ListTodo size={14} />
              <span className="hidden sm:inline">Aufgaben</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('folders')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer min-h-[30px] ${
                viewMode === 'folders'
                  ? 'bg-white dark:bg-[#242424] text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
              title="Ordner"
            >
              <Folder size={14} />
              <span className="hidden sm:inline">Ordner</span>
              {allFolders.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold">
                  {allFolders.length}
                </span>
              )}
            </button>
          </div>

          {/* + Neuer Ordner */}
          <button
            type="button"
            onClick={() => setIsFolderModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-[#242424] hover:bg-gray-50 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 active:scale-95 rounded-xl transition-all shadow-2xs shrink-0 cursor-pointer min-h-[32px]"
            title="Neuer Ordner"
          >
            <FolderPlus size={15} />
            <span className="hidden sm:inline">Neuer Ordner</span>
          </button>

          {/* + Neue Aufgabe */}
          <button
            type="button"
            onClick={() => {
              if (viewMode === 'folders') setViewMode('tasks');
              setDraft((p) => ({ ...p, folder: selectedFolder || '' }));
              setIsCreateOpen((prev) => !prev);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-xl transition-all shadow-xs shrink-0 cursor-pointer min-h-[32px]"
            title="Neue Aufgabe"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Neue Aufgabe</span>
            <span className="sm:hidden">Aufgabe</span>
          </button>
        </div>
      </div>

      {/* Hairline 3px Progress Bar (Second row) */}
      <div className="w-full h-[3px] bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden flex mt-4">
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
    </div>
  );
};

export default TodoListHeader;
