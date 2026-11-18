"use client";

import React, { useState, useMemo, useEffect } from 'react';
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
  Check,
  CheckSquare,
  Archive,
  ChevronDown,
  X,
} from 'lucide-react';
import { FOLDER_PALETTE, getFolderColor } from '../../lib/folderColors';
import type { CountdownEvent } from '../Layout/MobileHeaderWidgets';
import { useSafes } from '@/store/useDataStore';

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
  events?: CountdownEvent[];
  onFileSelect: (id: string, title: string) => void;
  onCreateFolder: (name: string, color?: string, parentId?: string | null) => Promise<void> | void;
  onCreateNote: (folderId?: string | null) => Promise<void> | void;
  onMoveFile: (fileId: string, targetFolderId: string | null) => Promise<void> | void;
  onUpdateFolderColor: (folderId: string, color: string) => Promise<void> | void;
  onDeleteFile?: (id: string) => void;
  onOpenTodos?: () => void;
  onEventClick?: (eventId: string) => void;
}

export function CentralFolderView({
  files,
  events,
  onFileSelect,
  onCreateFolder,
  onCreateNote,
  onMoveFile,
  onUpdateFolderColor,
  onDeleteFile,
  onOpenTodos,
  onEventClick,
}: CentralFolderViewProps) {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState<string>(FOLDER_PALETTE[0].id);
  const [colorPickerFolderId, setColorPickerFolderId] = useState<string | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [dragOverBreadcrumbId, setDragOverBreadcrumbId] = useState<string | null>(null);
  const [customOrder, setCustomOrder] = useState<string[]>([]);

  const {
    availableSafes,
    activeSafes,
    setActiveSafes,
    toggleSafe,
    createSafe,
    deleteSafe,
  } = useSafes();

  const [isSafeDropdownOpen, setIsSafeDropdownOpen] = useState(false);
  const [isCreatingSafe, setIsCreatingSafe] = useState(false);
  const [newSafeName, setNewSafeName] = useState('');
  const safeDropdownRef = React.useRef<HTMLDivElement>(null);

  const safeLabel =
    activeSafes.length === 1
      ? activeSafes[0]
      : activeSafes.length > 1
      ? `${activeSafes.length} Workspaces`
      : 'Kein Workspace';

  // Click outside to close safe dropdown
  useEffect(() => {
    if (!isSafeDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (safeDropdownRef.current && !safeDropdownRef.current.contains(e.target as Node)) {
        setIsSafeDropdownOpen(false);
        setIsCreatingSafe(false);
        setNewSafeName('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSafeDropdownOpen]);

  // If currentFolderId is no longer in files (e.g. after safe change), reset to root
  useEffect(() => {
    if (currentFolderId && !files.some((f) => f.id === currentFolderId)) {
      setCurrentFolderId(null);
    }
  }, [files, currentFolderId]);

  // Load persisted order for current folder
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(`tide_folder_order_${currentFolderId || 'root'}`);
      if (saved) {
        setCustomOrder(JSON.parse(saved));
      } else {
        setCustomOrder([]);
      }
    } catch {
      setCustomOrder([]);
    }
  }, [currentFolderId]);

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

  // Sorted items based on user custom reorder
  const sortedFolders = useMemo(() => {
    if (customOrder.length === 0) return currentFolders;
    return [...currentFolders].sort((a, b) => {
      const idxA = customOrder.indexOf(a.id);
      const idxB = customOrder.indexOf(b.id);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }, [currentFolders, customOrder]);

  const sortedNotes = useMemo(() => {
    if (customOrder.length === 0) return currentNotes;
    return [...currentNotes].sort((a, b) => {
      const idxA = customOrder.indexOf(a.id);
      const idxB = customOrder.indexOf(b.id);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }, [currentNotes, customOrder]);

  // Helper to prevent circular folder parenting
  const isDescendant = (ancestorId: string, targetId: string | null): boolean => {
    if (!targetId) return false;
    let curr: string | null = targetId;
    const visited = new Set<string>();
    while (curr && !visited.has(curr)) {
      if (curr === ancestorId) return true;
      visited.add(curr);
      const parent = files.find((f) => f.id === curr);
      curr = parent?.parent_id || null;
    }
    return false;
  };

  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    await onCreateFolder(trimmed, newFolderColor, currentFolderId);
    setNewFolderName('');
    setShowNewFolderModal(false);
  };

  const handleReorder = (sourceId: string, targetId: string) => {
    setCustomOrder((prev) => {
      const allIds = [
        ...currentFolders.map((f) => f.id),
        ...currentNotes.map((n) => n.id),
      ];
      const baseList = prev.length > 0 ? [...prev] : [...allIds];
      for (const id of allIds) {
        if (!baseList.includes(id)) baseList.push(id);
      }
      const sourceIdx = baseList.indexOf(sourceId);
      const targetIdx = baseList.indexOf(targetId);
      if (sourceIdx !== -1 && targetIdx !== -1) {
        baseList.splice(sourceIdx, 1);
        baseList.splice(targetIdx, 0, sourceId);
      }
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(`tide_folder_order_${currentFolderId || 'root'}`, JSON.stringify(baseList));
        } catch {}
      }
      return baseList;
    });
  };

  const handleDropOnFolder = async (e: React.DragEvent, targetId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(null);
    setDragOverBreadcrumbId(null);
    setDragOverItemId(null);
    const fileId = e.dataTransfer.getData('text/plain') || draggedItemId;
    if (fileId && fileId !== targetId && !isDescendant(fileId, targetId)) {
      await onMoveFile(fileId, targetId);
    }
  };

  const handleDropOnItem = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverItemId(null);
    setDragOverFolderId(null);
    const sourceId = e.dataTransfer.getData('text/plain') || draggedItemId;
    if (!sourceId || sourceId === targetId) return;
    handleReorder(sourceId, targetId);
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-t2-line  bg-t2-surface  backdrop-blur-md shrink-0">
        {/* Breadcrumb Path & Back Button */}
        <div className="flex items-center gap-2 overflow-x-auto py-1 text-sm">
          {currentFolderId && (
            <button
              type="button"
              onClick={() => setCurrentFolderId(parentFolderId)}
              className="p-1.5 rounded-lg text-t2-ink-2 hover:text-t2-ink   hover:bg-t2-hover  transition-colors shrink-0"
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
                  {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-t2-ink-3 shrink-0" />}
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
                        ? 'bg-t2-sub text-t2-accent  ring-2 ring-t2-accent'
                        : isLast
                        ? 'text-t2-ink  font-semibold bg-t2-hover '
                        : 'text-t2-ink-2  hover:text-t2-ink  hover:bg-t2-hover '
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
          {/* Workspace Switcher */}
          <div className="relative" ref={safeDropdownRef}>
            <button
              type="button"
              onClick={() => setIsSafeDropdownOpen((prev) => !prev)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-t2-hover  text-t2-ink  hover:bg-t2-stage  transition-all shadow-xs cursor-pointer select-none"
              title="Workspace wechseln"
            >
              <Archive className="w-3.5 h-3.5 text-t2-accent shrink-0" />
              <span className="truncate max-w-[110px]">{safeLabel}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-t2-ink-3 shrink-0 transition-transform duration-200 ${
                  isSafeDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isSafeDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 p-2 rounded-2xl bg-t2-surface  border border-t2-line  shadow-2xl z-50 space-y-1.5">
                <div className="flex items-center justify-between px-2 py-0.5 text-[10px] font-bold text-t2-ink-3  uppercase tracking-wider">
                  <span>Workspaces</span>
                </div>
                <div className="flex flex-col gap-0.5 max-h-52 overflow-y-auto no-scrollbar">
                  {availableSafes.map((safe) => {
                    const isActive = activeSafes.includes(safe);
                    return (
                      <div
                        key={safe}
                        className={`flex items-center justify-between px-2 py-1.5 rounded-lg group transition-colors ${
                          isActive
                            ? 'bg-t2-sub  text-t2-accent  font-medium'
                            : 'text-t2-ink  hover:bg-t2-hover '
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSafes([safe]);
                            setIsSafeDropdownOpen(false);
                          }}
                          className="flex items-center gap-2 flex-1 text-left truncate cursor-pointer min-w-0"
                          title={`Zu "${safe}" wechseln`}
                        >
                          <Archive
                            size={13}
                            className={isActive ? 'text-t2-accent' : 'text-t2-ink-3 group-hover:text-t2-ink-2 '}
                          />
                          <span className="truncate text-xs">{safe}</span>
                          {isActive && (
                            <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-t2-sub  text-t2-accent  font-normal shrink-0">
                              aktiv
                            </span>
                          )}
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSafe(safe);
                            }}
                            className={`p-1 rounded hover:bg-t2-hover  transition-colors cursor-pointer ${
                              isActive ? 'text-t2-accent ' : 'text-t2-ink-3'
                            }`}
                            title={isActive ? 'Aus Ansicht entfernen' : 'Zusammen laden'}
                          >
                            <CheckSquare
                              size={13}
                              className={isActive ? 'opacity-100' : 'opacity-40 hover:opacity-80'}
                            />
                          </button>
                          {safe !== 'main' && safe !== 'Standard' && safe !== 'Archiv' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteSafe(safe);
                              }}
                              className="p-1 rounded text-t2-ink-3 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                              title={`Workspace "${safe}" löschen`}
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Inline form to create a new safe */}
                <div className="pt-1.5 border-t border-t2-line-soft ">
                  {isCreatingSafe ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (newSafeName.trim()) {
                          createSafe(newSafeName.trim());
                          setNewSafeName('');
                          setIsCreatingSafe(false);
                        }
                      }}
                      className="flex items-center gap-1"
                    >
                      <input
                        type="text"
                        value={newSafeName}
                        onChange={(e) => setNewSafeName(e.target.value)}
                        placeholder="Workspace Name..."
                        autoFocus
                        className="w-full text-xs px-2 py-1 rounded-md bg-t2-hover  border border-t2-line  outline-none text-t2-ink  placeholder:text-t2-ink-3"
                      />
                      <button
                        type="submit"
                        className="p-1 text-t2-accent hover:bg-t2-sub  rounded transition-colors cursor-pointer"
                        title="Workspace erstellen"
                      >
                        <Check size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreatingSafe(false);
                          setNewSafeName('');
                        }}
                        className="p-1 text-t2-ink-3 hover:bg-t2-hover  rounded transition-colors cursor-pointer"
                        title="Abbrechen"
                      >
                        <X size={13} />
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsCreatingSafe(true)}
                      className="w-full flex items-center gap-1.5 px-2 py-1 text-xs text-t2-ink-2  hover:text-t2-ink  hover:bg-t2-hover  rounded-md transition-colors cursor-pointer"
                    >
                      <Plus size={13} className="text-t2-accent" />
                      <span>Neuer Workspace</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {onOpenTodos && (
            <button
              type="button"
              onClick={onOpenTodos}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 dark:hover:bg-emerald-500/30 transition-all shadow-xs"
              title="Aufgaben / Todos öffnen"
            >
              <CheckSquare className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Aufgaben</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowNewFolderModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-t2-hover  text-t2-ink  hover:bg-t2-stage  transition-all shadow-xs"
          >
            <FolderPlus className="w-3.5 h-3.5 text-t2-accent" />
            <span>Neuer Ordner</span>
          </button>
          <button
            type="button"
            onClick={() => onCreateNote(currentFolderId)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-t2-accent hover:opacity-90 text-t2-accent-ink transition-all shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Neue Notiz</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Folders Section */}
        {sortedFolders.length > 0 && (
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-t2-ink-2  mb-4 px-1">
              Ordner ({sortedFolders.length})
            </h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-y-7 gap-x-4 justify-items-center">
              {sortedFolders.map((folder) => {
                const colorDef = getFolderColor(folder.color);
                const itemCount = files.filter(
                  (f) => f.parent_id === folder.id && f.type !== 'event'
                ).length;
                const isDragHover = dragOverFolderId === folder.id;
                const isItemHover = dragOverItemId === folder.id;
                const isColorPickerOpen = colorPickerFolderId === folder.id;

                return (
                  <div
                    key={folder.id}
                    draggable={true}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', folder.id);
                      e.dataTransfer.setData('tide/file-id', folder.id);
                      e.dataTransfer.setData('tide/type', 'folder');
                      setDraggedItemId(folder.id);
                    }}
                    onDragEnd={() => {
                      setDraggedItemId(null);
                      setDragOverFolderId(null);
                      setDragOverItemId(null);
                    }}
                    onClick={() => setCurrentFolderId(folder.id)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const draggedId = draggedItemId;
                      if (draggedId && (draggedId === folder.id || isDescendant(draggedId, folder.id))) {
                        return;
                      }
                      setDragOverFolderId(folder.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverFolderId === folder.id) setDragOverFolderId(null);
                    }}
                    onDrop={(e) => handleDropOnFolder(e, folder.id)}
                    className={`group relative flex flex-col items-center cursor-pointer select-none p-2 rounded-2xl transition-all ${
                      isDragHover
                        ? 'ring-2 ring-t2-accent bg-t2-sub scale-105 shadow-md'
                        : isItemHover
                        ? 'ring-2 ring-t2-accent bg-t2-sub scale-105'
                        : 'hover:bg-t2-hover '
                    }`}
                  >
                    <div className="relative flex flex-col items-center">
                      <Folder
                        className="w-16 h-16 transition-transform group-hover:scale-105"
                        style={{ color: colorDef.hex, fill: `${colorDef.hex}26` }}
                        strokeWidth={1.4}
                      />

                      {itemCount > 0 && (
                        <span
                          className="absolute bottom-1 right-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold text-white shadow-xs"
                          style={{ backgroundColor: colorDef.hex }}
                        >
                          {itemCount}
                        </span>
                      )}

                      {/* Floating Actions on Hover */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity absolute -top-1.5 -right-1.5 z-10 bg-t2-surface  shadow-md rounded-full p-0.5 border border-t2-line ">
                        <button
                          type="button"
                          title="Farbe ändern"
                          onClick={(e) => {
                            e.stopPropagation();
                            setColorPickerFolderId(isColorPickerOpen ? null : folder.id);
                          }}
                          className="p-1 rounded-full text-t2-ink-3 hover:text-t2-ink  hover:bg-t2-hover  transition-colors"
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
                            className="p-1 rounded-full text-t2-ink-3 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <span
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDragOverItemId(folder.id);
                        setDragOverFolderId(null);
                      }}
                      onDragLeave={() => {
                        if (dragOverItemId === folder.id) setDragOverItemId(null);
                      }}
                      onDrop={(e) => handleDropOnItem(e, folder.id)}
                      className="text-xs font-semibold text-center line-clamp-2 max-w-[100px] mt-2 text-t2-ink  group-hover:text-t2-accent  transition-colors"
                    >
                      {folder.title || 'Unbenannter Ordner'}
                    </span>

                    {/* Folder Color Picker Popover */}
                    {isColorPickerOpen && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute left-1/2 -translate-x-1/2 top-20 z-30 p-2 rounded-xl bg-t2-surface  border border-t2-line  shadow-xl grid grid-cols-3 gap-1.5 w-28"
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
        {sortedNotes.length > 0 && (
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-t2-ink-2  mb-4 px-1">
              Notizen & Dokumente ({sortedNotes.length})
            </h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-y-7 gap-x-4 justify-items-center">
              {sortedNotes.map((note) => {
                const isItemHover = dragOverItemId === note.id;
                return (
                  <div
                    key={note.id}
                    draggable={true}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', note.id);
                      e.dataTransfer.setData('tide/file-id', note.id);
                      e.dataTransfer.setData('tide/type', 'note');
                      setDraggedItemId(note.id);
                    }}
                    onDragEnd={() => {
                      setDraggedItemId(null);
                      setDragOverFolderId(null);
                      setDragOverItemId(null);
                    }}
                    onClick={() => onFileSelect(note.id, note.title)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverItemId(note.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverItemId === note.id) setDragOverItemId(null);
                    }}
                    onDrop={(e) => handleDropOnItem(e, note.id)}
                    className={`group relative flex flex-col items-center cursor-pointer select-none p-2 rounded-2xl transition-all ${
                      isItemHover
                        ? 'ring-2 ring-t2-accent bg-t2-sub scale-105'
                        : 'hover:bg-t2-hover '
                    }`}
                  >
                    <div className="relative flex flex-col items-center">
                      <FileText
                        className="w-14 h-16 text-t2-ink-2  group-hover:text-t2-accent transition-all group-hover:scale-105"
                        fill="currentColor"
                        fillOpacity={0.06}
                        strokeWidth={1.25}
                      />
                      {onDeleteFile && (
                        <button
                          type="button"
                          title="Löschen"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteFile(note.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-full text-t2-ink-3 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all absolute -top-1.5 -right-1.5 z-10 bg-t2-surface  shadow-md border border-t2-line "
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <span className="text-xs font-semibold text-center line-clamp-2 max-w-[100px] mt-2 text-t2-ink  group-hover:text-t2-accent  transition-colors">
                      {note.title || 'Neue Notiz'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {currentFolders.length === 0 && currentNotes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-3xl bg-t2-hover  flex items-center justify-center text-t2-ink-3  mb-4">
              <Folder className="w-8 h-8" />
            </div>
            <h3 className="text-base font-semibold text-t2-ink ">
              Dieser Ordner ist noch leer
            </h3>
            <p className="text-xs text-t2-ink-3  mt-1 max-w-sm">
              Erstelle einen neuen Ordner oder lege eine Notiz an. Du kannst Dokumente per Drag & Drop hierher verschieben.
            </p>
            <div className="flex items-center gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowNewFolderModal(true)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-t2-hover  hover:bg-t2-stage  text-t2-ink  transition-colors"
              >
                + Neuer Ordner
              </button>
              <button
                type="button"
                onClick={() => onCreateNote(currentFolderId)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-t2-accent hover:opacity-90 text-t2-accent-ink transition-colors"
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
            className="w-full max-w-sm rounded-2xl bg-t2-surface  border border-t2-line  p-5 shadow-2xl space-y-4"
          >
            <h3 className="text-sm font-bold text-t2-ink ">Neuen Ordner erstellen</h3>
            <div>
              <label className="block text-xs font-medium text-t2-ink-2  mb-1">
                Name des Ordners
              </label>
              <input
                type="text"
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="z. B. Arbeit, Privates, Studium..."
                className="w-full px-3 py-2 rounded-xl border border-t2-line  bg-transparent text-sm focus:outline-hidden focus:ring-2 focus:ring-t2-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-t2-ink-2  mb-2">
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

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-t2-line-soft ">
              <button
                type="button"
                onClick={() => setShowNewFolderModal(false)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-t2-ink-2  hover:bg-t2-hover  transition-colors"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={!newFolderName.trim()}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-t2-accent hover:opacity-90 disabled:opacity-50 text-t2-accent-ink transition-colors"
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
