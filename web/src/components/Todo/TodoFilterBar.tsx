'use client';

import React, { useState } from 'react';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { TaskItem } from '@/store/useDataStore';
import { FilterStatus, Priority, SortOption, PRIORITY_OPTIONS } from './types';

export interface TodoFilterBarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filterStatus: FilterStatus;
  setFilterStatus: (status: FilterStatus) => void;
  totalCount: number;
  activeCycleOpenCount: number;
  activeCycleInProgressCount: number;
  activeCycleCompletedCount: number;
  archivedCount: number;
  allFolders: string[];
  unfiledCount: { total: number; completed?: number; active?: number; inProgress?: number };
  selectedFolder: string | null;
  setSelectedFolder: (folder: string | null) => void;
  allTags: string[];
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
  tasks: TaskItem[];
  filterPriority: Priority | 'all';
  setFilterPriority: (priority: Priority | 'all') => void;
  sortBy: SortOption;
  setSortBy: (sortBy: SortOption) => void;
  className?: string;
}

const ACTIVE_PILL_CLASS =
  'whitespace-nowrap px-4 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-full shadow-sm transition-transform active:scale-95 cursor-pointer dark:bg-white dark:text-gray-900';
const INACTIVE_PILL_CLASS =
  'whitespace-nowrap px-4 py-1.5 bg-gray-50 text-gray-600 border border-gray-200 text-sm font-medium rounded-full hover:bg-gray-100 transition-colors cursor-pointer dark:bg-[#1a1a1a] dark:text-gray-300 dark:border-white/10 dark:hover:bg-white/5';

export const TodoFilterBar: React.FC<TodoFilterBarProps> = ({
  searchQuery,
  setSearchQuery,
  filterStatus,
  setFilterStatus,
  totalCount,
  activeCycleOpenCount,
  activeCycleInProgressCount,
  activeCycleCompletedCount,
  archivedCount,
  allFolders,
  unfiledCount,
  selectedFolder,
  setSelectedFolder,
  allTags,
  selectedTag,
  setSelectedTag,
  tasks,
  filterPriority,
  setFilterPriority,
  sortBy,
  setSortBy,
  className = '',
}) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const isAllActive = selectedFolder === null && selectedTag === null && filterStatus === 'all';

  const statusPills: { key: FilterStatus; label: string; count: number }[] = [
    { key: 'active', label: 'Offen', count: activeCycleOpenCount },
    { key: 'in_progress', label: 'In Arbeit', count: activeCycleInProgressCount },
    { key: 'completed', label: 'Erledigt', count: activeCycleCompletedCount },
    { key: 'archived', label: 'Archiv', count: archivedCount },
  ];

  return (
    <div className={`px-4 sm:px-6 pb-2 shrink-0 flex flex-col gap-2 ${className}`}>
      {/* Horizontal pill scroll container */}
      <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar scrollbar-none pb-1">
        {/* 'Alle' pill */}
        <button
          type="button"
          onClick={() => {
            setSelectedFolder(null);
            setSelectedTag(null);
            setFilterStatus('all');
          }}
          className={isAllActive ? ACTIVE_PILL_CLASS : INACTIVE_PILL_CLASS}
          title={`Alle Aufgaben (${totalCount})`}
        >
          Alle
        </button>

        {/* Status pills */}
        {statusPills.map((pill) => {
          const isActive = filterStatus === pill.key;
          return (
            <button
              key={pill.key}
              type="button"
              onClick={() => setFilterStatus(isActive ? 'all' : pill.key)}
              className={isActive ? ACTIVE_PILL_CLASS : INACTIVE_PILL_CLASS}
              title={`${pill.label} (${pill.count})`}
            >
              {pill.label}
            </button>
          );
        })}

        {/* Unfiled folder pill */}
        {unfiledCount.total > 0 && (
          <button
            type="button"
            onClick={() => setSelectedFolder(selectedFolder === '' ? null : '')}
            className={selectedFolder === '' ? ACTIVE_PILL_CLASS : INACTIVE_PILL_CLASS}
            title={`Ohne Ordner (${unfiledCount.total})`}
          >
            Ohne Ordner
          </button>
        )}

        {/* Folder pills */}
        {allFolders.map((folder) => {
          const isActive = selectedFolder === folder;
          const count = tasks.filter((t) => t.folder === folder).length;
          return (
            <button
              key={`folder-${folder}`}
              type="button"
              onClick={() => setSelectedFolder(isActive ? null : folder)}
              className={isActive ? ACTIVE_PILL_CLASS : INACTIVE_PILL_CLASS}
              title={`${folder} (${count})`}
            >
              {folder}
            </button>
          );
        })}

        {/* Tag pills */}
        {allTags.map((tag) => {
          const isActive = selectedTag === tag;
          const count = tasks.filter((t) => t.tags?.includes(tag)).length;
          return (
            <button
              key={`tag-${tag}`}
              type="button"
              onClick={() => setSelectedTag(isActive ? null : tag)}
              className={isActive ? ACTIVE_PILL_CLASS : INACTIVE_PILL_CLASS}
              title={`#${tag} (${count})`}
            >
              #{tag}
            </button>
          );
        })}

        {/* Compact search toggle pill */}
        <button
          type="button"
          onClick={() => setIsSearchOpen((prev) => !prev)}
          className={`whitespace-nowrap px-3 py-1.5 text-sm font-medium rounded-full border transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
            isSearchOpen || searchQuery
              ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 border-transparent shadow-sm'
              : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100 dark:bg-[#1a1a1a] dark:text-gray-300 dark:border-white/10 dark:hover:bg-white/5'
          }`}
          title="Suche"
        >
          <Search size={14} />
          {searchQuery ? <span className="text-xs max-w-[80px] truncate">{searchQuery}</span> : <span>Suche</span>}
        </button>

        {/* Priority & sort options toggle pill */}
        <button
          type="button"
          onClick={() => setShowOptions((prev) => !prev)}
          className={`whitespace-nowrap px-3 py-1.5 text-sm font-medium rounded-full border transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
            showOptions || filterPriority !== 'all' || sortBy !== 'deadline'
              ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 border-transparent shadow-sm'
              : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100 dark:bg-[#1a1a1a] dark:text-gray-300 dark:border-white/10 dark:hover:bg-white/5'
          }`}
          title="Filter & Sortierung"
        >
          <SlidersHorizontal size={14} />
          <span>Optionen</span>
          {(filterPriority !== 'all' || sortBy !== 'deadline') && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
          )}
        </button>
      </div>

      {/* Expandable search input */}
      {(isSearchOpen || searchQuery) && (
        <div className="relative w-full flex items-center pt-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Aufgaben durchsuchen..."
            className="w-full pl-9 pr-8 py-1.5 text-xs bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-full text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-400 dark:focus:ring-white/20 transition-all min-h-[34px]"
            autoFocus={isSearchOpen && !searchQuery}
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-full cursor-pointer"
              title="Suche leeren"
            >
              <X size={13} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsSearchOpen(false)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-full cursor-pointer"
              title="Suche schließen"
            >
              <X size={13} />
            </button>
          )}
        </div>
      )}

      {/* Expandable priority & sort options */}
      {(showOptions || filterPriority !== 'all' || sortBy !== 'deadline') && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 w-full pt-1 px-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 dark:text-gray-400 font-medium">Priorität:</span>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value as Priority | 'all')}
              className="px-2.5 py-1 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-full text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-gray-400 cursor-pointer min-h-[30px] font-medium transition-all"
            >
              <option value="all">Alle</option>
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label.replace(/^[^\s]+\s/, '')}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 dark:text-gray-400 font-medium">Sortieren:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-2.5 py-1 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-full text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-gray-400 cursor-pointer min-h-[30px] font-medium transition-all"
            >
              <option value="deadline">Fälligkeit</option>
              <option value="priority">Priorität</option>
              <option value="created">Erstellt</option>
              <option value="tag">Tag</option>
              <option value="title">Titel</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
};

export default TodoFilterBar;
