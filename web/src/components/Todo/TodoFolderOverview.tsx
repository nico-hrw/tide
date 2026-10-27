'use client';

import React, { useState, useEffect } from 'react';
import {
  Folder,
  Plus,
  ListTodo,
  Inbox,
  ArrowLeft,
  CheckCircle2,
  Trash2,
  Timer,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  FOLDER_PALETTE,
  getFolderColor,
  TodoFolderMeta,
  loadTodoFoldersMeta,
  saveTodoFoldersMeta,
} from '../../lib/folderColors';
import { useDataStore } from '../../store/useDataStore';

export interface FolderStat {
  name: string;
  total: number;
  completed: number;
  active: number;
  inProgress?: number;
}

export interface TodoFolderOverviewProps {
  folders: FolderStat[];
  unfiledCount: { total: number; completed: number; active: number; inProgress?: number };
  totalAllTasks: number;
  onSelectFolder: (folderName: string | null) => void;
  onCreateFolder: (folderName: string, color?: string, showInCalendar?: boolean) => void;
  onDeleteFolder?: (folderName: string) => void;
  onBackToTasks: () => void;
  onAssignTaskFolder?: (taskId: string, folderName: string) => void;
}

export const TodoFolderOverview: React.FC<TodoFolderOverviewProps> = ({
  folders,
  unfiledCount,
  totalAllTasks,
  onSelectFolder,
  onCreateFolder,
  onDeleteFolder,
  onBackToTasks,
  onAssignTaskFolder,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('blue');
  const [newFolderShowInCal, setNewFolderShowInCal] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [foldersMeta, setFoldersMeta] = useState<Record<string, TodoFolderMeta>>(() => loadTodoFoldersMeta());
  const [activeColorPickerFolder, setActiveColorPickerFolder] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!activeColorPickerFolder) return;
    const handleClickOutside = () => setActiveColorPickerFolder(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [activeColorPickerFolder]);

  const handleCreate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      setError('Ordnername darf nicht leer sein');
      return;
    }
    const meta = loadTodoFoldersMeta();
    meta[trimmed] = { id: trimmed, name: trimmed, color: newFolderColor, showInCalendar: newFolderShowInCal };
    saveTodoFoldersMeta(meta);
    setFoldersMeta(meta);
    onCreateFolder(trimmed, newFolderColor, newFolderShowInCal);
    setNewFolderName('');
    setNewFolderColor('blue');
    setNewFolderShowInCal(true);
    setIsCreating(false);
    setError(null);
  };

  const toggleShowInCalendar = (folderName: string) => {
    setFoldersMeta((prev) => {
      const existing = prev[folderName] || { id: folderName, name: folderName };
      const next = { ...prev, [folderName]: { ...existing, showInCalendar: existing.showInCalendar === false } };
      saveTodoFoldersMeta(next);
      return next;
    });
  };

  const changeFolderColor = (folderName: string, colorId: string) => {
    setFoldersMeta((prev) => {
      const existing = prev[folderName] || { id: folderName, name: folderName };
      const next = { ...prev, [folderName]: { ...existing, color: colorId } };
      saveTodoFoldersMeta(next);
      return next;
    });
  };

  const handleDelete = (e: React.MouseEvent, folderName: string) => {
    e.stopPropagation();
    setFoldersMeta((prev) => {
      const next = { ...prev };
      delete next[folderName];
      saveTodoFoldersMeta(next);
      return next;
    });
    onDeleteFolder?.(folderName);
  };

  const handleAssignTask = (taskId: string, targetFolderName: string) => {
    if (onAssignTaskFolder) {
      onAssignTaskFolder(taskId, targetFolderName);
    } else {
      useDataStore.getState().updateTask(taskId, { folder: targetFolderName ? targetFolderName : undefined });
    }
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
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md py-1 px-2 -ml-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>← Zurück zu allen Aufgaben</span>
        </button>
      </div>

      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-gray-200 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Ordner-Übersicht</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">Verwalte deine Aufgaben in thematischen Ordnern</p>
        </div>

        <div>
          {!isCreating ? (
            <button
              type="button"
              onClick={() => { setIsCreating(true); setError(null); }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Neuer Ordner</span>
            </button>
          ) : (
            <form onSubmit={handleCreate} className="flex flex-col gap-2 p-3 bg-gray-50 dark:bg-zinc-800/60 rounded-xl border border-gray-200 dark:border-zinc-700">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => { setNewFolderName(e.target.value); if (error) setError(null); }}
                    placeholder="Ordnername eingeben..."
                    autoFocus
                    className="w-full sm:w-64 px-3 py-1.5 text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-white border border-gray-300 dark:border-zinc-700 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {error && <p className="absolute left-0 -bottom-5 text-xs text-red-500 whitespace-nowrap">{error}</p>}
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="submit" className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer">
                    Erstellen
                  </button>
                  <button type="button" onClick={() => { setIsCreating(false); setNewFolderName(''); setError(null); }} className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer">
                    Abbrechen
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
                <div className="flex items-center gap-1.5">
                  {FOLDER_PALETTE.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      title={c.name}
                      onClick={() => setNewFolderColor(c.id)}
                      className={`w-4 h-4 rounded-full transition-transform cursor-pointer ${
                        newFolderColor === c.id ? 'ring-2 ring-offset-1 ring-blue-500 scale-125' : 'hover:scale-110 opacity-70 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
                <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-zinc-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newFolderShowInCal}
                    onChange={(e) => setNewFolderShowInCal(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-blue-600 border-gray-300 dark:border-zinc-700 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>Im Kalender anzeigen</span>
                </label>
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
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectFolder(null); }
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

        {/* Card 2: Unfiled tasks (Ohne Ordner) with Drop target */}
        {unfiledCount.total > 0 && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelectFolder('')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectFolder(''); }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dragOverTarget !== '__unfiled__') setDragOverTarget('__unfiled__');
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
              if (dragOverTarget === '__unfiled__') setDragOverTarget(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverTarget(null);
              const taskId = e.dataTransfer.getData('text/plain');
              if (taskId) handleAssignTask(taskId, '');
            }}
            className={`group relative flex flex-col justify-between p-5 bg-white dark:bg-zinc-900 border rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              dragOverTarget === '__unfiled__'
                ? 'ring-2 ring-amber-500 border-amber-500 bg-amber-50/20 dark:bg-amber-950/20 scale-[1.01]'
                : 'border-gray-200 dark:border-zinc-800 hover:border-amber-500 dark:hover:border-amber-500'
            }`}
          >
            <div>
              <div className="flex items-start justify-between">
                <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 group-hover:scale-105 transition-transform">
                  <Inbox className="w-5 h-5" />
                </div>
                <div className="flex items-center gap-1">
                  {unfiledCount.inProgress !== undefined && unfiledCount.inProgress > 0 && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                      title={`${unfiledCount.inProgress} in Bearbeitung`}
                    >
                      <Timer className="w-3 h-3 animate-pulse" />
                      <span>{unfiledCount.inProgress}</span>
                    </span>
                  )}
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300">
                    {unfiledCount.total}
                  </span>
                </div>
              </div>
              <h2 className="mt-4 text-base font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                Ohne Ordner
              </h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                {unfiledCount.active} offen{unfiledCount.inProgress ? ` · ${unfiledCount.inProgress} in Arbeit` : ''} · {unfiledCount.completed} erledigt
              </p>
            </div>

            <div className="mt-4 pt-2">
              <div className="w-full h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden flex items-stretch">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-300"
                  style={{ width: `${calculateProgress(unfiledCount.completed, unfiledCount.total)}%` }}
                />
                {unfiledCount.inProgress !== undefined && unfiledCount.inProgress > 0 && unfiledCount.total > 0 && (
                  <div
                    className="h-full bg-amber-400/80 transition-all duration-300"
                    style={{ width: `${Math.min(100 - calculateProgress(unfiledCount.completed, unfiledCount.total), Math.round((unfiledCount.inProgress / unfiledCount.total) * 100))}%` }}
                    title={`${unfiledCount.inProgress} in Bearbeitung`}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Dynamic folder cards */}
        {folders.map((f) => {
          const progress = calculateProgress(f.completed, f.total);
          const meta = foldersMeta[f.name];
          const colorDef = getFolderColor(meta?.color);
          const showInCalendar = meta?.showInCalendar !== false;
          const isDragOver = dragOverTarget === f.name;

          return (
            <div
              key={f.name}
              role="button"
              tabIndex={0}
              onClick={() => onSelectFolder(f.name)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectFolder(f.name); }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverTarget !== f.name) setDragOverTarget(f.name);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                if (dragOverTarget === f.name) setDragOverTarget(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverTarget(null);
                const taskId = e.dataTransfer.getData('text/plain');
                if (taskId) handleAssignTask(taskId, f.name);
              }}
              className={`group relative flex flex-col justify-between p-5 bg-white dark:bg-zinc-900 border rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isDragOver
                  ? 'ring-2 ring-blue-500 border-blue-500 bg-blue-50/20 dark:bg-blue-950/20 scale-[1.01]'
                  : 'border-gray-200 dark:border-zinc-800 hover:border-blue-400 dark:hover:border-blue-400'
              }`}
            >
              <div>
                <div className="flex items-start justify-between">
                  <div
                    className="p-2.5 rounded-lg transition-transform group-hover:scale-105"
                    style={{ backgroundColor: `${colorDef.hex}18` }}
                  >
                    <Folder className="w-5 h-5" style={{ color: colorDef.hex }} />
                  </div>

                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {f.inProgress !== undefined && f.inProgress > 0 && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                        title={`${f.inProgress} in Bearbeitung`}
                      >
                        <Timer className="w-3 h-3 animate-pulse" />
                        <span>{f.inProgress}</span>
                      </span>
                    )}

                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300">
                      {f.total}
                    </span>

                    {/* Calendar visibility toggle button */}
                    <button
                      type="button"
                      title={showInCalendar ? 'Im Kalender sichtbar (klicken zum Ausblenden)' : 'Im Kalender ausgeblendet (klicken zum Einblenden)'}
                      aria-label={showInCalendar ? 'Im Kalender sichtbar' : 'Im Kalender ausgeblendet'}
                      onClick={(e) => { e.stopPropagation(); toggleShowInCalendar(f.name); }}
                      className={`p-1.5 min-w-[28px] min-h-[28px] flex items-center justify-center rounded-md transition-all cursor-pointer ${
                        showInCalendar
                          ? 'text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                          : 'text-amber-500 bg-amber-500/15 hover:bg-amber-500/25'
                      }`}
                    >
                      {showInCalendar ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>

                    {/* Quick color change badge / picker */}
                    <div className="relative">
                      <button
                        type="button"
                        title={`Farbe ändern (${colorDef.name})`}
                        aria-label={`Farbe ändern`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveColorPickerFolder((prev) => (prev === f.name ? null : f.name));
                        }}
                        className="w-4 h-4 rounded-full border border-black/10 dark:border-white/20 transition-transform hover:scale-125 cursor-pointer shadow-xs"
                        style={{ backgroundColor: colorDef.hex }}
                      />
                      {activeColorPickerFolder === f.name && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 top-6 z-30 p-2 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl flex items-center gap-1.5 flex-wrap w-44"
                        >
                          {FOLDER_PALETTE.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              title={c.name}
                              onClick={(e) => {
                                e.stopPropagation();
                                changeFolderColor(f.name, c.id);
                                setActiveColorPickerFolder(null);
                              }}
                              className={`w-5 h-5 rounded-full transition-transform cursor-pointer ${
                                colorDef.id === c.id ? 'ring-2 ring-offset-1 ring-blue-500 scale-110' : 'hover:scale-110'
                              }`}
                              style={{ backgroundColor: c.hex }}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {onDeleteFolder && (
                      <button
                        type="button"
                        title={`Ordner "${f.name}" löschen`}
                        aria-label={`Ordner "${f.name}" löschen`}
                        onClick={(e) => handleDelete(e, f.name)}
                        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 min-w-[28px] min-h-[28px] flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md transition-all focus:opacity-100 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colorDef.hex }} />
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate" title={f.name}>
                    {f.name}
                  </h2>
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                  {f.active} offen{f.inProgress ? ` · ${f.inProgress} in Arbeit` : ''} · {f.completed} erledigt
                </p>
              </div>

              <div className="mt-4 pt-2">
                <div className="flex items-center justify-between text-[11px] text-gray-400 dark:text-zinc-500 mb-1">
                  <span className="inline-flex items-center gap-1">
                    Fortschritt
                    {progress === 100 && f.total > 0 && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                  </span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden flex items-stretch">
                  <div
                    className={`h-full transition-all duration-300 ${progress === 100 ? 'bg-emerald-500' : ''}`}
                    style={{ width: `${progress}%`, backgroundColor: progress === 100 ? undefined : colorDef.hex }}
                  />
                  {f.inProgress !== undefined && f.inProgress > 0 && progress < 100 && f.total > 0 && (
                    <div
                      className="h-full bg-amber-500 transition-all duration-300"
                      style={{ width: `${Math.min(100 - progress, Math.round((f.inProgress / f.total) * 100))}%` }}
                      title={`${f.inProgress} in Bearbeitung`}
                    />
                  )}
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

