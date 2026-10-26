'use client';

import React from 'react';
import { Search, X, Folder, Inbox, Tag, SlidersHorizontal } from 'lucide-react';
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

export const TodoFilterBar: React.FC<TodoFilterBarProps> = ({
  searchQuery, setSearchQuery, filterStatus, setFilterStatus,
  totalCount, activeCycleOpenCount, activeCycleInProgressCount, activeCycleCompletedCount, archivedCount,
  allFolders, unfiledCount, selectedFolder, setSelectedFolder,
  allTags, selectedTag, setSelectedTag, tasks,
  filterPriority, setFilterPriority, sortBy, setSortBy, className = '',
}) => {
  const statusItems: { key: FilterStatus; label: string; count: number }[] = [
    { key: 'all', label: 'Alle', count: totalCount },
    { key: 'active', label: 'Offen', count: activeCycleOpenCount },
    { key: 'in_progress', label: 'In Arbeit', count: activeCycleInProgressCount },
    { key: 'completed', label: 'Erledigt', count: activeCycleCompletedCount },
    { key: 'archived', label: 'Archiv', count: archivedCount },
  ];

  return (
    <div className={`w-full max-w-full min-w-0 overflow-hidden bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-2xl p-3.5 sm:p-4 shadow-2xs flex flex-col gap-3 ${className}`}>
      {/* Search & Status Toggle */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Aufgaben durchsuchen..."
            className="w-full pl-9 pr-8 py-2 text-xs bg-gray-50/80 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 min-h-[36px] transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition-colors cursor-pointer"
              title="Suche leeren"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Status Pills */}
        <div className="w-full flex overflow-x-auto no-scrollbar sm:w-auto items-center bg-gray-100 dark:bg-white/5 p-1 rounded-xl border border-gray-200 dark:border-white/10 shrink-0 gap-0.5">
          {statusItems.map((item) => {
            const isActive = filterStatus === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilterStatus(item.key)}
                className={`px-2 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap min-h-[28px] flex items-center gap-1 sm:gap-1.5 justify-center shrink-0 ${
                  isActive
                    ? 'bg-white dark:bg-[#242424] text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <span>{item.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  isActive
                    ? item.key === 'in_progress'
                      ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                      : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                    : item.key === 'in_progress' && item.count > 0
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-400'
                }`}>
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick folder pills / shortcuts */}
      {(allFolders.length > 0 || unfiledCount.total > 0) && (
        <div className="w-full max-w-full overflow-x-auto no-scrollbar flex items-center gap-1.5 py-0.5 text-xs">
          <span className="text-gray-400 dark:text-gray-500 shrink-0 font-medium flex items-center gap-1 mr-1">
            <Folder size={13} /> Ordner:
          </span>
          <button
            type="button"
            onClick={() => setSelectedFolder(null)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap min-h-[30px] flex items-center transition-all cursor-pointer ${
              selectedFolder === null
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10'
            }`}
          >
            Alle ({totalCount})
          </button>
          {unfiledCount.total > 0 && (
            <button
              type="button"
              onClick={() => setSelectedFolder(selectedFolder === '' ? null : '')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap min-h-[30px] flex items-center gap-1.5 transition-all cursor-pointer ${
                selectedFolder === ''
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10'
              }`}
            >
              <Inbox size={12} />
              <span>Ohne Ordner ({unfiledCount.total})</span>
              {selectedFolder === '' && <X size={12} className="ml-0.5" />}
            </button>
          )}
          {allFolders.map((folder) => {
            const isSelected = selectedFolder === folder;
            const count = tasks.filter((t) => t.folder === folder).length;
            return (
              <button
                key={folder}
                type="button"
                onClick={() => setSelectedFolder(isSelected ? null : folder)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap min-h-[30px] flex items-center gap-1.5 transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10'
                }`}
              >
                <span>{folder}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${isSelected ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-300'}`}>
                  {count}
                </span>
                {isSelected && <X size={12} className="ml-0.5" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Quick tag pills / shortcuts */}
      {allTags.length > 0 && (
        <div className="w-full max-w-full overflow-x-auto no-scrollbar flex items-center gap-1.5 py-0.5 text-xs">
          <span className="text-gray-400 dark:text-gray-500 shrink-0 font-medium flex items-center gap-1 mr-1">
            <Tag size={13} /> Tags:
          </span>
          <button
            type="button"
            onClick={() => setSelectedTag(null)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap min-h-[30px] flex items-center transition-all cursor-pointer ${
              selectedTag === null
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10'
            }`}
          >
            Alle ({totalCount})
          </button>
          {allTags.map((tag) => {
            const isSelected = selectedTag === tag;
            const count = tasks.filter((t) => t.tags?.includes(tag)).length;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(isSelected ? null : tag)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap min-h-[30px] flex items-center gap-1.5 transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10'
                }`}
              >
                <span>#{tag}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${isSelected ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-300'}`}>
                  {count}
                </span>
                {isSelected && <X size={12} className="ml-0.5" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Bottom Row: Priority & Sort dropdowns */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 w-full pt-2.5 border-t border-gray-100 dark:border-white/5 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-gray-500 dark:text-gray-400 font-medium">Priorität:</span>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as Priority | 'all')}
            className="px-2.5 py-1.5 bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer min-h-[34px] font-medium transition-all"
          >
            <option value="all">Alle Prioritäten</option>
            {PRIORITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label.replace(/^[^\s]+\s/, '')}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={13} className="text-gray-400 shrink-0" />
          <span className="text-gray-500 dark:text-gray-400 font-medium">Sortieren:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="px-2.5 py-1.5 bg-gray-50 dark:bg-[#242424] border border-gray-200 dark:border-white/10 rounded-xl text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer min-h-[34px] font-medium transition-all"
          >
            <option value="deadline">Fälligkeit</option>
            <option value="priority">Priorität</option>
            <option value="created">Erstellt</option>
            <option value="tag">Tag</option>
            <option value="title">Titel</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default TodoFilterBar;
