'use client';

import React, { useState } from 'react';
import { Folder, Plus, ListTodo, Inbox, ArrowLeft, CheckCircle2, Trash2 } from 'lucide-react';

export interface FolderStat {
  name: string;
  total: number;
  completed: number;
  active: number;
}

export interface TodoFolderOverviewProps {
  folders: FolderStat[];
  unfiledCount: { total: number; completed: number; active: number };
  totalAllTasks: number;
  onSelectFolder: (folderName: string | null) => void;
  onCreateFolder: (folderName: string) => void;
  onDeleteFolder?: (folderName: string) => void;
  onBackToTasks: () => void;
}

export const TodoFolderOverview: React.FC<TodoFolderOverviewProps> = ({
  folders,
  unfiledCount,
  totalAllTasks,
  onSelectFolder,
  onCreateFolder,
  onDeleteFolder,
  onBackToTasks,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleCreate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      setError('Ordnername darf nicht leer sein');
      return;
    }
    onCreateFolder(trimmed);
    setNewFolderName('');
    setIsCreating(false);
    setError(null);
  };

  const calculateProgress = (completed: number, total: number) => {
    if (total <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((completed / total) * 100)));
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6 pb-28 sm:pb-8">
      {/* Back button */}
      <div className="mb-4">
        <button
          type="button"
          onClick={onBackToTasks}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md py-1 px-2 -ml-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>← Zurück zu allen Aufgaben</span>
        </button>
      </div>

      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-gray-200 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Ordner-Übersicht
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
            Verwalte deine Aufgaben in thematischen Ordnern
          </p>
        </div>

        <div>
          {!isCreating ? (
            <button
              type="button"
              onClick={() => {
                setIsCreating(true);
                setError(null);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900"
            >
              <Plus className="w-4 h-4" />
              <span>+ Neuer Ordner</span>
            </button>
          ) : (
            <form onSubmit={handleCreate} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => {
                    setNewFolderName(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Ordnername eingeben..."
                  autoFocus
                  className="w-full sm:w-64 px-3 py-1.5 text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-white border border-gray-300 dark:border-zinc-700 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {error && (
                  <p className="absolute left-0 -bottom-5 text-xs text-red-500 whitespace-nowrap">
                    {error}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-2 sm:mt-0">
                <button
                  type="submit"
                  className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Erstellen
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setNewFolderName('');
                    setError(null);
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  Abbrechen
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Grid of folder cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {/* Card 1: All tasks */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelectFolder(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectFolder(null);
            }
          }}
          className="group relative flex flex-col justify-between p-5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-sm hover:shadow-md hover:border-blue-500 dark:hover:border-blue-500 hover:-translate-y-0.5 transition-all cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <div>
            <div className="flex items-start justify-between">
              <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform">
                <ListTodo className="w-5 h-5" />
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300">
                {totalAllTasks} {totalAllTasks === 1 ? 'Aufgabe' : 'Aufgaben'}
              </span>
            </div>
            <h2 className="mt-4 text-base font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              Alle Aufgaben
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
              Vollständige Übersicht aller deiner Tasks
            </p>
          </div>
        </div>

        {/* Card 2: Unfiled tasks (if unfiledCount.total > 0) */}
        {unfiledCount.total > 0 && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelectFolder('')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectFolder('');
              }
            }}
            className="group relative flex flex-col justify-between p-5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-sm hover:shadow-md hover:border-blue-500 dark:hover:border-blue-500 hover:-translate-y-0.5 transition-all cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <div>
              <div className="flex items-start justify-between">
                <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 group-hover:scale-105 transition-transform">
                  <Inbox className="w-5 h-5" />
                </div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300">
                  {unfiledCount.total}
                </span>
              </div>
              <h2 className="mt-4 text-base font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                Ohne Ordner
              </h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                {unfiledCount.active} offen · {unfiledCount.completed} erledigt
              </p>
            </div>

            <div className="mt-4 pt-2">
              <div className="w-full h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-300"
                  style={{ width: `${calculateProgress(unfiledCount.completed, unfiledCount.total)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Dynamic folder cards */}
        {folders.map((f) => {
          const progress = calculateProgress(f.completed, f.total);
          return (
            <div
              key={f.name}
              role="button"
              tabIndex={0}
              onClick={() => onSelectFolder(f.name)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectFolder(f.name);
                }
              }}
              className="group relative flex flex-col justify-between p-5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-sm hover:shadow-md hover:border-blue-500 dark:hover:border-blue-500 hover:-translate-y-0.5 transition-all cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 group-hover:bg-blue-50 group-hover:text-blue-600 dark:group-hover:bg-blue-950/40 dark:group-hover:text-blue-400 transition-colors">
                    <Folder className="w-5 h-5" />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300">
                      {f.total}
                    </span>
                    {onDeleteFolder && (
                      <button
                        type="button"
                        title={`Ordner "${f.name}" löschen`}
                        aria-label={`Ordner "${f.name}" löschen`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteFolder(f.name);
                        }}
                        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md transition-all focus:opacity-100 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <h2 className="mt-4 text-base font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate" title={f.name}>
                  {f.name}
                </h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                  {f.active} offen · {f.completed} erledigt
                </p>
              </div>

              <div className="mt-4 pt-2">
                <div className="flex items-center justify-between text-[11px] text-gray-400 dark:text-zinc-500 mb-1">
                  <span className="inline-flex items-center gap-1">
                    Fortschritt
                    {progress === 100 && f.total > 0 && (
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    )}
                  </span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      progress === 100 ? 'bg-emerald-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TodoFolderOverview;
