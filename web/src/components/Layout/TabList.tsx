import React from 'react';
import { X, Calendar, FileText, MessageSquare, DollarSign, User } from 'lucide-react';
import { useHighlight } from '../HighlightContext';
import { motion, Reorder, AnimatePresence } from 'framer-motion';

export interface Tab {
    id: string;
    title: string;
    type: 'file' | 'calendar' | 'messages' | 'chat' | 'ext_finance' | 'profile';
    content?: any;
    _fileKey?: CryptoKey | null;
    _saveStatus?: "saved" | "unsaved" | "saving";
}

interface TabListProps {
    tabs: Tab[];
    activeTabId: string;
    onTabSelect: (id: string, type: 'file' | 'calendar' | 'messages' | 'chat' | 'ext_finance' | 'profile') => void;
    onTabClose: (e: React.MouseEvent, id: string) => void;
    onTabsReorder?: (newTabs: Tab[]) => void;
    enabledExtensions?: string[];
    onOpenMessages?: () => void;
    onOpenFinance?: () => void;
}

export default function TabList({ tabs, activeTabId, onTabSelect, onTabClose, onTabsReorder, enabledExtensions, onOpenMessages, onOpenFinance }: TabListProps) {
    const { highlight, isHighlighted } = useHighlight();

    const documentTabs = tabs.filter(t => ['file', 'chat', 'profile'].includes(t.type));
    const systemTabs = tabs.filter(t => !['file', 'chat', 'profile'].includes(t.type));

    const handleReorder = (newDocTabs: Tab[]) => {
        if (onTabsReorder) {
            // Merge reordered docs with system tabs to prevent wiping them out of page state
            onTabsReorder([...newDocTabs, ...systemTabs]);
        }
    };

    if (tabs.length === 0 && (!enabledExtensions || enabledExtensions.length === 0)) return null;

    return (
        <div className="pointer-events-auto flex items-center justify-center z-30 mb-8">
            <motion.div
                layout
                className="flex items-center gap-2 px-6 py-3 rounded-[2rem] bg-white/75 dark:bg-slate-900/70 backdrop-blur-2xl border border-gray-200/50 dark:border-white/10 shadow-sm"
                transition={{ type: "spring", stiffness: 300, damping: 35 }}
            >
                {/* Section A: Draggable Documents */}
                {documentTabs.length > 0 && (
                    <Reorder.Group
                        axis="x"
                        values={documentTabs}
                        onReorder={handleReorder}
                        className="flex items-center gap-2 m-0 p-0 list-none"
                        layout
                    >
                        <AnimatePresence mode="popLayout">
                            {documentTabs.map((tab) => {
                                const isActive = activeTabId === tab.id;

                                return (
                                    <Reorder.Item
                                        key={tab.id}
                                        value={tab}
                                        id={tab.id}
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.7 }}
                                        whileDrag={{ scale: 1.05, zIndex: 50 }}
                                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                        className="relative shrink-0 flex items-center justify-center origin-center"
                                        layout
                                    >
                                        <div
                                            onClick={(e) => {
                                                if (highlight.isSelectingLink && highlight.onLinkSelect) {
                                                    highlight.onLinkSelect({ id: tab.id, title: tab.title, type: tab.type as any, rect: e.currentTarget.getBoundingClientRect() });
                                                } else {
                                                    onTabSelect(tab.id, tab.type);
                                                }
                                            }}
                                            className={`group flex items-center gap-2 h-9 transition-all duration-200 cursor-pointer rounded-full
                                                ${isActive
                                                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-md px-3 pr-2'
                                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 px-3 pr-2'
                                                }`}
                                        >
                                            <div className={`shrink-0 ${isActive ? 'opacity-100' : 'opacity-60 group-hover:opacity-90'}`}>
                                                {tab.type === 'chat' ? <MessageSquare size={14} /> : tab.type === 'profile' ? <User size={14} /> : <FileText size={14} />}
                                            </div>
                                            <span className="text-xs font-semibold max-w-[90px] truncate block pointer-events-none select-none">
                                                {tab.title && tab.title !== "Untitled" ? tab.title : (tab.type === 'chat' ? 'Chat' : tab.type === 'profile' ? 'Profile' : 'Untitled')}
                                            </span>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onTabClose(e, tab.id); }}
                                                className={`ml-1 p-0.5 rounded-full transition-colors ${isActive ? 'hover:bg-white/20' : 'hover:bg-gray-200 dark:hover:bg-white/15'}`}
                                            >
                                                <X size={11} strokeWidth={2.5} />
                                            </button>
                                        </div>
                                    </Reorder.Item>
                                );
                            })}
                        </AnimatePresence>
                    </Reorder.Group>
                )}

                {/* Vertical Divider */}
                {documentTabs.length > 0 && (
                    <div className="w-px h-6 bg-gray-300/50 dark:bg-white/10 mx-2" />
                )}

                {/* Section B: Pinned System Tabs */}
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={() => onTabSelect('calendar', 'calendar')}
                        className={`group flex items-center justify-center w-9 h-9 transition-all duration-200 cursor-pointer rounded-full ${activeTabId === 'calendar' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-md' : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10'}`}
                        title="Calendar (Always Open)"
                    >
                        <Calendar size={16} />
                    </button>

                    {enabledExtensions?.includes('messenger') && (
                        <button
                            onClick={() => { if (onOpenMessages) onOpenMessages(); else onTabSelect('messages', 'messages'); }}
                            className={`group flex items-center justify-center w-9 h-9 transition-all duration-200 cursor-pointer rounded-full ${activeTabId === 'messages' ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400' : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10'}`}
                            title="Messages"
                        >
                            <MessageSquare size={16} />
                        </button>
                    )}

                    {enabledExtensions?.includes('finance') && (
                        <button
                            onClick={() => { if (onOpenFinance) onOpenFinance(); else onTabSelect('ext_finance', 'ext_finance'); }}
                            className={`group flex items-center justify-center w-9 h-9 transition-all duration-200 cursor-pointer rounded-full ${activeTabId === 'ext_finance' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400' : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10'}`}
                            title="Finance"
                        >
                            <DollarSign size={16} />
                        </button>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
