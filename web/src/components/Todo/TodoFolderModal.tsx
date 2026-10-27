'use client';

import React, { useState } from 'react';
import { FolderPlus } from 'lucide-react';
import { FOLDER_PALETTE, loadTodoFoldersMeta, saveTodoFoldersMeta } from '../../lib/folderColors';

export interface TodoFolderModalProps {
  isFolderModalOpen: boolean;
  setIsFolderModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  newFolderNameInput: string;
  setNewFolderNameInput: React.Dispatch<React.SetStateAction<string>>;
  handleCreateFolder: (name: string, color?: string, showInCalendar?: boolean) => void;
  initialColor?: string;
  initialShowInCalendar?: boolean;
}

export const TodoFolderModal: React.FC<TodoFolderModalProps> = ({
  isFolderModalOpen,
  setIsFolderModalOpen,
  newFolderNameInput,
  setNewFolderNameInput,
  handleCreateFolder,
  initialColor = 'blue',
  initialShowInCalendar = true,
}) => {
  const [selectedColor, setSelectedColor] = useState<string>(initialColor);
  const [showInCalendar, setShowInCalendar] = useState<boolean>(initialShowInCalendar);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderNameInput.trim();
    if (trimmed) {
      try {
        const meta = loadTodoFoldersMeta();
        meta[trimmed] = {
          id: trimmed,
          name: trimmed,
          color: selectedColor,
          showInCalendar,
        };
        saveTodoFoldersMeta(meta);
      } catch (err) {
        console.error('Failed to save folder meta', err);
      }
      handleCreateFolder(trimmed, selectedColor, showInCalendar);
      setNewFolderNameInput('');
      setSelectedColor(initialColor);
      setShowInCalendar(initialShowInCalendar);
      setIsFolderModalOpen(false);
    }
  };

  const handleClose = () => {
    setIsFolderModalOpen(false);
    setNewFolderNameInput('');
    setSelectedColor(initialColor);
    setShowInCalendar(initialShowInCalendar);
  };

  return (
    <>
      {isFolderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-white/10 rounded-2xl p-5 w-full max-w-sm shadow-xl">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <FolderPlus size={18} className="text-blue-500" /> Neuer Ordner
            </h3>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder="Ordnername eingeben..."
                  value={newFolderNameInput}
                  onChange={(e) => setNewFolderNameInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>

              {/* Color picker row */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Ordnerfarbe
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {FOLDER_PALETTE.map((color) => {
                    const isSelected = selectedColor === color.id;
                    return (
                      <button
                        key={color.id}
                        type="button"
                        title={color.name}
                        aria-label={color.name}
                        onClick={() => setSelectedColor(color.id)}
                        className={`w-6 h-6 rounded-full transition-transform cursor-pointer flex items-center justify-center ${
                          isSelected
                            ? 'ring-2 ring-offset-2 ring-blue-500 scale-110 dark:ring-offset-[#1e1e1e]'
                            : 'hover:scale-105 opacity-80 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: color.hex }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Show in calendar toggle */}
              <div className="mb-5 flex items-center justify-between">
                <label
                  htmlFor="modal-show-in-calendar"
                  className="text-xs font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none"
                >
                  Im Kalender anzeigen
                </label>
                <input
                  id="modal-show-in-calendar"
                  type="checkbox"
                  checked={showInCalendar}
                  onChange={(e) => setShowInCalendar(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 border-gray-300 dark:border-white/20 focus:ring-blue-500 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-3.5 py-1.5 text-xs rounded-xl font-medium bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 transition-colors cursor-pointer min-h-[32px]"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={!newFolderNameInput.trim()}
                  className="px-3.5 py-1.5 text-xs rounded-xl font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors cursor-pointer shadow-xs min-h-[32px]"
                >
                  Erstellen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default TodoFolderModal;
