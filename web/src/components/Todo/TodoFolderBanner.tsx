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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent border border-t2-accent ">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setSelectedFolder(null)}
                  className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl bg-t2-surface  text-t2-ink-2  hover:text-t2-accent  shadow-2xs hover:scale-105 transition-all cursor-pointer shrink-0"
                  title="Alle Aufgaben anzeigen"
                >
                  <ArrowLeft size={16} />
                </button>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-xl bg-t2-accent text-t2-accent-ink shrink-0">
                    {selectedFolder === '' ? <Inbox size={18} /> : <Folder size={18} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-bold text-t2-ink  truncate">
                        {selectedFolder === '' ? 'Ohne Ordner' : selectedFolder}
                      </h2>
                      <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-t2-sub text-t2-accent ">
                        {selectedFolderActiveCount} {selectedFolderActiveCount === 1 ? 'offene Aufgabe' : 'offene Aufgaben'}
                      </span>
                    </div>
                    <p className="text-xs text-t2-ink-2 ">
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
                  className="px-3 py-1.5 text-xs font-medium text-t2-ink-2  hover:text-t2-ink  bg-t2-surface  hover:bg-t2-hover  border border-t2-line  rounded-xl transition-colors cursor-pointer min-h-[36px] flex items-center"
                >
                  Ordner-Übersicht
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFolder(null)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-t2-accent  hover:bg-t2-sub  rounded-xl transition-colors cursor-pointer min-h-[36px]"
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
