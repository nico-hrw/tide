'use client';

import React, { useState, useRef, useEffect } from 'react';
import { CheckCircle2, Trash2, Folder, Tag, X, ChevronDown } from 'lucide-react';

export interface TodoBatchActionsProps {
  selectedIds: string[];
  onClearSelection: () => void;
  onBulkComplete: (completed?: boolean) => void | Promise<void>;
  onBulkDelete: () => void | Promise<void>;
  onBulkSetFolder?: (folder: string) => void | Promise<void>;
  onBulkAddTag?: (tag: string) => void | Promise<void>;
  folders?: string[];
  availableFolders?: string[];
  tags?: string[];
  availableTags?: string[];
  isAllCompleted?: boolean;
  className?: string;
}

export function TodoBatchActions({
  selectedIds,
  onClearSelection,
  onBulkComplete,
  onBulkDelete,
  onBulkSetFolder,
  onBulkAddTag,
  folders,
  availableFolders,
  tags,
  availableTags,
  isAllCompleted = false,
  className = '',
}: TodoBatchActionsProps) {
  const [folderOpen, setFolderOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const folderList = folders || availableFolders || [];
  const tagList = tags || availableTags || [];
  const count = selectedIds.length;

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setFolderOpen(false);
        setTagOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  if (count === 0) return null;

  return (
    <div
      ref={menuRef}
      role="toolbar"
      aria-label="Stapelaktionen"
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3.5 py-2 bg-white/95 dark:bg-[#1e1e1e]/95 backdrop-blur-md rounded-2xl border border-gray-200 dark:border-white/10 shadow-2xl transition-all animate-in fade-in slide-in-from-bottom-2 ${className}`}
    >
      <div className="flex items-center gap-1.5 pr-2 border-r border-gray-200 dark:border-white/10">
        <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-semibold rounded-full bg-blue-500 text-white">
          {count}
        </span>
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 hidden sm:inline">ausgewählt</span>
        <button onClick={onClearSelection} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg" title="Auswahl aufheben" aria-label="Auswahl aufheben">
          <X size={14} />
        </button>
      </div>

      <button onClick={() => onBulkComplete(!isAllCompleted)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 text-gray-700 dark:text-gray-200" title={isAllCompleted ? 'Als offen markieren' : 'Als erledigt markieren'}>
        <CheckCircle2 size={15} className={isAllCompleted ? 'text-amber-500' : 'text-emerald-500'} />
        <span>{isAllCompleted ? 'Reaktivieren' : 'Erledigen'}</span>
      </button>

      {onBulkSetFolder && (
        <div className="relative">
          <button onClick={() => { setFolderOpen(!folderOpen); setTagOpen(false); }} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 text-gray-700 dark:text-gray-200">
            <Folder size={14} className="text-blue-500" />
            <span>Ordner</span>
            <ChevronDown size={12} className="opacity-60" />
          </button>
          {folderOpen && (
            <div className="absolute bottom-full mb-2 left-0 w-44 p-1 bg-white dark:bg-[#252525] rounded-xl border border-gray-200 dark:border-white/10 shadow-xl max-h-48 overflow-y-auto z-50">
              <button onClick={() => { onBulkSetFolder(''); setFolderOpen(false); }} className="w-full text-left px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg">
                Kein Ordner
              </button>
              {folderList.map((f) => (
                <button key={f} onClick={() => { onBulkSetFolder(f); setFolderOpen(false); }} className="w-full text-left px-2.5 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-white/5 rounded-lg truncate">
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {onBulkAddTag && (
        <div className="relative">
          <button onClick={() => { setTagOpen(!tagOpen); setFolderOpen(false); }} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 text-gray-700 dark:text-gray-200">
            <Tag size={14} className="text-purple-500" />
            <span>Tag</span>
            <ChevronDown size={12} className="opacity-60" />
          </button>
          {tagOpen && (
            <div className="absolute bottom-full mb-2 left-0 w-44 p-1 bg-white dark:bg-[#252525] rounded-xl border border-gray-200 dark:border-white/10 shadow-xl max-h-48 overflow-y-auto z-50">
              {tagList.length === 0 ? (
                <span className="block px-2.5 py-1.5 text-xs text-gray-400">Keine Tags</span>
              ) : (
                tagList.map((t) => (
                  <button key={t} onClick={() => { onBulkAddTag(t); setTagOpen(false); }} className="w-full text-left px-2.5 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-purple-50 dark:hover:bg-white/5 rounded-lg truncate">
                    #{t}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <div className="h-4 w-px bg-gray-200 dark:bg-white/10" />

      <button onClick={() => onBulkDelete()} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-xl hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 transition-colors" title="Ausgewählte Aufgaben löschen">
        <Trash2 size={14} />
        <span className="hidden sm:inline">Löschen</span>
      </button>
    </div>
  );
}

export default TodoBatchActions;
