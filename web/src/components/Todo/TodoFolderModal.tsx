'use client';

import React from 'react';
import { FolderPlus } from 'lucide-react';

export interface TodoFolderModalProps {
  isFolderModalOpen: boolean;
  setIsFolderModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  newFolderNameInput: string;
  setNewFolderNameInput: React.Dispatch<React.SetStateAction<string>>;
  handleCreateFolder: (name: string) => void;
}

export const TodoFolderModal: React.FC<TodoFolderModalProps> = ({
  isFolderModalOpen, setIsFolderModalOpen, newFolderNameInput, setNewFolderNameInput, handleCreateFolder,
}) => {
  return (
    <>
      {isFolderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-white/10 rounded-2xl p-5 w-full max-w-sm shadow-xl">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <FolderPlus size={18} className="text-blue-500" /> Neuer Ordner
            </h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const trimmed = newFolderNameInput.trim();
              if (trimmed) {
                handleCreateFolder(trimmed);
                setNewFolderNameInput('');
                setIsFolderModalOpen(false);
              }
            }}>
              <input
                type="text"
                autoFocus
                placeholder="Ordnername eingeben..."
                value={newFolderNameInput}
                onChange={(e) => setNewFolderNameInput(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 mb-4"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setIsFolderModalOpen(false); setNewFolderNameInput(''); }}
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
