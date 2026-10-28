'use client';

import React, { useMemo } from 'react';
import { useDataStore, TaskItem } from '@/store/useDataStore';
import { TaskCreateDraft } from './TodoCreateCard';
import {
  NextEventCountdown,
  CountdownEvent,
  pickGreetingTemplate,
  formatGreeting,
} from '@/components/Layout/MobileHeaderWidgets';

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

export const TodoListHeader: React.FC<TodoListHeaderProps> = (props) => {
  const {
    activeCycleTotal,
    activeCycleCompletedCount,
    activeCycleOverdueCount,
    archivedCount,
  } = props;

  const greetingTemplate = React.useMemo(() => pickGreetingTemplate(new Date()), []);
  const storeUser = useDataStore((s) => (s as unknown as UserStoreSlice).user);
  const displayName = (
    storeUser?.name ||
    storeUser?.username ||
    (typeof window !== 'undefined'
      ? sessionStorage.getItem('tide_user_name') || localStorage.getItem('tide_user_name') || ''
      : '')
  ).trim();
  const greeting = formatGreeting(greetingTemplate, displayName);

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
      <div className="flex items-start justify-between gap-3">
        {/* Left side: Greeting */}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
            {greeting}
          </h1>
        </div>

        {/* Right side: Next Event Countdown */}
        <div className="shrink-0">
          <NextEventCountdown events={countdownEvents} />
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
