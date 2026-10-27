"use client";

import React, { useState, useMemo } from 'react';
import {
  Folder,
  FileText,
  ChevronRight,
  Plus,
  Palette,
  ArrowLeft,
  Trash2,
  FolderPlus,
  Home,
  Check
} from 'lucide-react';
import { FOLDER_PALETTE, getFolderColor } from '../../lib/folderColors';

export interface CentralFolderItem {
  id: string;
  title: string;
  type?: string;
  parent_id?: string | null;
  color?: string;
  updated_at?: string;
  isGroup?: boolean;
}

export interface CentralFolderViewProps {
  files: CentralFolderItem[];
  onFileSelect: (id: string, title: string) => void;
  onCreateFolder: (name: string, color?: string, parentId?: string | null) => Promise<void> | void;
  onCreateNote: (folderId?: string | null) => Promise<void> | void;
  onMoveFile: (fileId: string, targetFolderId: string | null) => Promise<void> | void;
  onUpdateFolderColor: (folderId: string, color: string) => Promise<void> | void;
  onDeleteFile?: (id: string) => void;
}

export function CentralFolderView({
  files,
  onFileSelect,
  onCreateFolder,
  onCreateNote,
  onMoveFile,
  onUpdateFolderColor,
  onDeleteFile,
}: CentralFolderViewProps) {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState<string>(FOLDER_PALETTE[0].id);
  const [colorPickerFolderId, setColorPickerFolderId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverBreadcrumbId, setDragOverBreadcrumbId] = useState<string | null>(null);

  // Compute breadcrumbs path from root to current folder
  const breadcrumbs = useMemo(() => {
    const rootItem = { id: null as string | null, title: 'Hauptordner' };
    if (!currentFolderId) return [rootItem];

    const trail: Array<{ id: string | null; title: string }> = [];
    let currId: string | null = currentFolderId;
    const visited = new Set<string>();

    while (currId && !visited.has(currId)) {
      visited.add(currId);
      const folder = files.find((f) => f.id === currId && f.type === 'folder');
      if (folder) {
        trail.unshift({ id: folder.id, title: folder.title || 'Unbenannter Ordner' });
        currId = folder.parent_id || null;
      } else {
        break;
      }
    }
    return [rootItem, ...trail];
  }, [currentFolderId, files]);

  // Current folder's parent ID (for the back button)
  const parentFolderId = useMemo(() => {
    if (!currentFolderId) return null;
    const current = files.find((f) => f.id === currentFolderId);
    return current?.parent_id || null;
  }, [currentFolderId, files]);

  // Filter folders in current directory
  const currentFolders = useMemo(() => {
    return files.filter(
      (f) =>
        f.type === 'folder' &&
        !f.isGroup &&
        !(f.title || '').startsWith('.') &&
        (currentFolderId ? f.parent_id === currentFolderId : !f.parent_id)
    );
  }, [files, currentFolderId]);

  // Filter notes/canvases in current directory
  const currentNotes = useMemo(() => {
    return files.filter(
      (f) =>
        f.type !== 'folder' &&
        f.type !== 'event' &&
        !f.isGroup &&
        !(f.title || '').startsWith('.') &&
        (currentFolderId ? f.parent_id === currentFolderId : !f.parent_id)
    );
  }, [files, currentFolderId]);

  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    await onCreateFolder(trimmed, newFolderColor, currentFolderId);
    setNewFolderName('');
    setShowNewFolderModal(false);
  };

  const handleDropOnFolder = async (e: React.DragEvent, targetId: string | null) => {
    e.preventDefault();
    setDragOverFolderId(null);
    setDragOverBreadcrumbId(null);
    const fileId = e.dataTransfer.getData('text/plain');
    if (fileId && fileId !== targetId) {
      await onMoveFile(fileId, targetId);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--background)] overflow-hidden">
      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-gray-200/80 dark:border-white/10 bg-white/50 dark:bg-slate-900/40 backdrop-blur-md shrink-0">
        {/* Breadcrumb Path & Back Button */}
        <div className="flex items-center gap-2 overflow-x-auto py-1 text-sm">
          {currentFolderId && (
            <button
              type="button"
              onClick={() => setCurrentFolderId(parentFolderId)}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors shrink-0"
              title="Zurück zum übergeordneten Ordner"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <div className="flex items-center gap-1.5 min-w-0">
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              const isDropTarget = dragOverBreadcrumbId === (crumb.id || '__root__');
              return (
                <React.Fragment key={crumb.id || '__root__'}>
                  {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                  <button
                    type="button"
                    onClick={() => setCurrentFolderId(crumb.id)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverBreadcrumbId(crumb.id || '__root__');
                    }}
                    onDragLeave={() => setDragOverBreadcrumbId(null)}
                    onDrop={(e) => handleDropOnFolder(e, crumb.id)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                      isDropTarget
                        ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500'
                        : isLast
                        ? 'text-gray-900 dark:text-white font-semibold bg-gray-100/80 dark:bg-white/10'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5'
                    }`}
                  >
                    {idx === 0 && <Home className="w-3.5 h-3.5" />}
                    <span className="truncate max-w-[140px] sm:max-w-[200px]">{crumb.title}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowNewFolderModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-white/10 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-white/15 transition-all shadow-xs"
          >
            <FolderPlus className="w-3.5 h-3.5 text-blue-500" />
            <span>Neuer Ordner</span>
          </button>
          <button
            type="button"
            onClick={() => onCreateNote(currentFolderId)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Neue Notiz</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Folders Section */}
        {currentFolders.length > 0 && (
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3 px-1">
              Ordner ({currentFolders.length})
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {currentFolders.map((folder) => {
                const colorDef = getFolderColor(folder.color);
                const itemCount = files.filter(
                  (f) => f.parent_id === folder.id && f.type !== 'event'
                ).length;
                const isDragHover = dragOverFolderId === folder.id;
                const isColorPickerOpen = colorPickerFolderId === folder.id;

                return (
                  <div
                    key={folder.id}
                    onClick={() => setCurrentFolderId(folder.id)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverFolderId(folder.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverFolderId === folder.id) setDragOverFolderId(null);
                    }}
                    onDrop={(e) => handleDropOnFolder(e, folder.id)}
                    className={`relative group rounded-2xl p-4 border transition-all cursor-pointer select-none flex flex-col justify-between min-h-[115px] ${
                      isDragHover
                        ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500 shadow-md scale-[1.02]'
                        : 'border-gray-200/80 dark:border-white/10 bg-white dark:bg-white/5 hover:border-gray-300 dark:hover:border-white/20 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
                        style={{ backgroundColor: `${colorDef.hex}20` }}
                      >
                        <Folder className="w-5 h-5" style={{ color: colorDef.hex }} />
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          title="Farbe ändern"
                          onClick={(e) => {
                            e.stopPropagation();
                            setColorPickerFolderId(isColorPickerOpen ? null : folder.id);
                          }}
                          className="p-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                        >
                          <Palette className="w-3.5 h-3.5" />
                        </button>
                        {onDeleteFile && (
                          <button
                            type="button"
                            title="Ordner löschen"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteFile(folder.id);
                            }}
                            className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-3">
                      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                        {folder.title || 'Unbenannter Ordner'}
                      </h3>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {itemCount} {itemCount === 1 ? 'Element' : 'Elemente'}
                      </p>
                    </div>

                    {/* Folder Color Picker Popover */}
                    {isColorPickerOpen && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-2 top-12 z-30 p-2 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-white/10 shadow-xl grid grid-cols-3 gap-1.5"
                      >
                        {FOLDER_PALETTE.map((pal) => (
                          <button
                            key={pal.id}
                            type="button"
                            onClick={() => {
                              onUpdateFolderColor(folder.id, pal.id);
                              setColorPickerFolderId(null);
                            }}
                            className="w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                            style={{ backgroundColor: pal.hex }}
                            title={pal.name}
                          >
                            {folder.color === pal.id && <Check className="w-3 h-3 text-white" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Files / Notes Section */}
        {currentNotes.length > 0 && (
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3 px-1">
              Notizen & Dokumente ({currentNotes.length})
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {currentNotes.map((note) => {
                const dateStr = formatDate(note.updated_at);
                return (
                  <div
                    key={note.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', note.id);
                      e.dataTransfer.setData('tide/file-id', note.id);
                    }}
                    onClick={() => onFileSelect(note.id, note.title)}
                    className="group rounded-2xl p-4 border border-gray-200/80 dark:border-white/10 bg-white dark:bg-white/5 hover:border-blue-400/60 dark:hover:border-blue-500/50 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing select-none flex flex-col justify-between min-h-[110px]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-white/10 flex items-center justify-center text-gray-600 dark:text-gray-300 group-hover:text-blue-500 transition-colors">
                        <FileText className="w-4 h-4" />
                      </div>
                      {onDeleteFile && (
                        <button
                          type="button"
                          title="Löschen"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteFile(note.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="mt-3">
                      <h4 className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                        {note.title || 'Neue Notiz'}
                      </h4>
                      {dateStr && (
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{dateStr}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {currentFolders.length === 0 && currentNotes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-3xl bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-400 dark:text-gray-500 mb-4">
              <Folder className="w-8 h-8" />
            </div>
            <h3 className="text-base font-semibold text-gray-700 dark:text-gray-200">
              Dieser Ordner ist noch leer
            </h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-sm">
              Erstelle einen neuen Ordner oder lege eine Notiz an. Du kannst Dokumente per Drag & Drop hierher verschieben.
            </p>
            <div className="flex items-center gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowNewFolderModal(true)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-gray-800 dark:text-gray-200 transition-colors"
              >
                + Neuer Ordner
              </button>
              <button
                type="button"
                onClick={() => onCreateNote(currentFolderId)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                + Neue Notiz
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Neuer Ordner */}
      {showNewFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <form
            onSubmit={handleCreateFolderSubmit}
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/10 p-5 shadow-2xl space-y-4"
          >
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Neuen Ordner erstellen</h3>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Name des Ordners
              </label>
              <input
                type="text"
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="z. B. Arbeit, Privates, Studium..."
                className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-white/15 bg-transparent text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                Farbe wählen
              </label>
              <div className="flex flex-wrap gap-2">
                {FOLDER_PALETTE.map((pal) => (
                  <button
                    key={pal.id}
                    type="button"
                    onClick={() => setNewFolderColor(pal.id)}
                    className="w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                    style={{ backgroundColor: pal.hex }}
                    title={pal.name}
                  >
                    {newFolderColor === pal.id && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-white/10">
              <button
                type="button"
                onClick={() => setShowNewFolderModal(false)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={!newFolderName.trim()}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors"
              >
                Erstellen
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default CentralFolderView;
