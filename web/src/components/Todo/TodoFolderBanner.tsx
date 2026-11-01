'use client';

import React from 'react';
import { X, Folder, Inbox, ArrowLeft } from 'lucide-react';

export interface TodoFolderBannerProps {
  setViewMode: (mode: 'tasks' | 'folders') => void;
  selectedFolder: string | null;
  setSelectedFolder: (folder: string | null) => void;
  selectedFolderActiveCount: number;
}

export const TodoFolderBanner: React.FC<TodoFolderBannerProps> = ({
  setViewMode, selectedFolder, setSelectedFolder, selectedFolderActiveCount,
}) => {
  return (
    <>
          {selectedFolder !== null && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent border border-blue-500/20 dark:border-blue-500/30">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setSelectedFolder(null)}
                  className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl bg-white dark:bg-white/10 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-white shadow-2xs hover:scale-105 transition-all cursor-pointer shrink-0"
                  title="Alle Aufgaben anzeigen"
                >
                  <ArrowLeft size={16} />
                </button>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-xl bg-blue-600 text-white shrink-0">
                    {selectedFolder === '' ? <Inbox size={18} /> : <Folder size={18} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-bold text-gray-900 dark:text-white truncate">
                        {selectedFolder === '' ? 'Ohne Ordner' : selectedFolder}
                      </h2>
                      <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400">
                        {selectedFolderActiveCount} {selectedFolderActiveCount === 1 ? 'offene Aufgabe' : 'offene Aufgaben'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {selectedFolder === ''
                        ? 'Aufgaben, die keinem speziellen Ordner zugewiesen sind'
                        : `Gefilterte Ansicht für den Ordner "${selectedFolder}"`}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('folders')}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white bg-white dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 rounded-xl transition-colors cursor-pointer min-h-[36px] flex items-center"
                >
                  Ordner-Übersicht
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFolder(null)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-xl transition-colors cursor-pointer min-h-[36px]"
                >
                  <X size={14} />
                  <span>Filter zurücksetzen</span>
                </button>
              </div>
            </div>
          )}
    </>
  );
};

export default TodoFolderBanner;
