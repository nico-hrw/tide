import React, { useState, useEffect } from 'react';
import { X, User, Puzzle, Palette, Info, KeyRound, Calendar, Wrench } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { NoteLayout } from '@/store/slices/types';
import { motion, AnimatePresence } from 'framer-motion';
import DebugPluginSettings from './DebugPluginSettings';
import { ProfileTab } from './tabs/ProfileTab';
import { SecurityVaultTab } from './tabs/SecurityVaultTab';
import { SyncCloudTab } from './tabs/SyncCloudTab';
import { AppearanceTab } from './tabs/AppearanceTab';
import { IntegrationsTab } from './tabs/IntegrationsTab';
import { CalendarTab } from './tabs/CalendarTab';

type SettingsTabId = 'account' | 'calendar' | 'extensions' | 'appearance' | 'info' | 'access' | 'debug';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialTab?: SettingsTabId;
    enabledExtensions: string[];
    onToggleExtension: (extensionId: string, enabled: boolean) => void;
    userProfile?: { id?: string; user_id?: string; username: string; email: string; bio?: string; title?: string; avatar_seed?: string; avatar_salt?: string; avatar_style?: string; is_verified?: boolean; profile_status?: number };
    onLogout?: () => void;
    noteLayout?: NoteLayout;
    onSetNoteLayout?: (layout: NoteLayout) => void;
    groups?: { id: string; title: string; effect?: string; color?: string }[];
    hiddenGroupIds?: string[];
    onToggleGroupVisibility?: (id: string) => void;
    onUpdateGroup?: (id: string, updates: any) => void;
    onShareGroup?: (e: any, id: string) => void;
    onDeleteGroup?: (e: any, id: string) => void;
    onCreateGroup?: (title: string, color?: string, effect?: string) => Promise<string | undefined>;
}

export default function SettingsModal({
    isOpen,
    onClose,
    initialTab,
    enabledExtensions,
    onToggleExtension,
    userProfile,
    onLogout,
    noteLayout = 'normal',
    onSetNoteLayout,
    groups = [],
    hiddenGroupIds = [],
    onToggleGroupVisibility,
    onUpdateGroup,
    onShareGroup,
    onDeleteGroup,
    onCreateGroup
}: SettingsModalProps) {

    const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab || 'account');

    useEffect(() => {
        if (initialTab) {
            setActiveTab(initialTab);
        }
    }, [initialTab]);

    const { language } = useDataStore();

    // Reset tab when modal closes
    useEffect(() => {
        if (!isOpen) {
            setActiveTab('account');
        }
    }, [isOpen]);

    // Handle Escape key to close modal
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const tabs = [
        { id: 'account', label: 'Account', icon: User },
        { id: 'calendar', label: 'Calendar', icon: Calendar },
        { id: 'appearance', label: 'Appearance', icon: Palette },
        { id: 'extensions', label: 'Extensions', icon: Puzzle },
        { id: 'access', label: language === 'de' ? 'Zugriff' : 'Access', icon: KeyRound },
        { id: 'info', label: 'Info', icon: Info },
        { id: 'debug', label: 'Debug & Diagnose', icon: Wrench },
    ];

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center pointer-events-none p-4 sm:p-0">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-[#111827]/20 pointer-events-auto"
            />

            <motion.div
                layout
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="relative bg-white dark:bg-[#18181b] rounded-[24px] shadow-[0px_24px_64px_rgba(17,24,39,0.16)] overflow-hidden border border-[#e5e7eb] dark:border-zinc-800 flex flex-col pointer-events-auto w-full max-w-[900px] h-[85vh] sm:h-[650px]"
                onClick={e => e.stopPropagation()}
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 h-[44px] w-[44px] rounded-[12px] bg-[#f9fafb] hover:bg-[#f3f4f6] dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-[#e5e7eb] dark:border-zinc-700 flex items-center justify-center text-[#111827] dark:text-zinc-200 cursor-pointer z-10 transition-colors"
                    aria-label="Close settings"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="flex flex-col sm:flex-row h-full">
                    {/* Permanent Sidebar Tab List */}
                    <div className="w-full sm:w-64 border-b sm:border-b-0 sm:border-r border-[#e5e7eb] dark:border-zinc-800 p-6 flex flex-col gap-2 bg-[#f9fafb] dark:bg-[#18181b]/50">
                        <div className="mb-8 px-2 hidden sm:block">
                            <h2 className="text-2xl font-semibold text-[#111827] dark:text-white">Settings</h2>
                        </div>

                        <div className="flex flex-row sm:flex-col overflow-x-auto sm:overflow-visible gap-2 pb-2 sm:pb-0 custom-scrollbar">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as SettingsTabId)}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-[8px] transition-all whitespace-nowrap sm:whitespace-normal shrink-0 ${activeTab === tab.id ? 'bg-[#111827] text-white dark:bg-white dark:text-zinc-900 font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-[#f5f5f5] dark:hover:bg-zinc-800 font-medium'}`}
                                >
                                    <tab.icon className="w-5 h-5 shrink-0" />
                                    <span className="font-medium text-sm">{tab.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-transparent">
                        <div className="p-8 pb-4 border-b border-[#e5e7eb] dark:border-zinc-800 hidden sm:block">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{tabs.find(t => t.id === activeTab)?.label}</h2>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 sm:p-8 custom-scrollbar relative">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={activeTab}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.15 }}
                                    className="h-full"
                                >
                                    {activeTab === 'account' && (
                                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                            <ProfileTab userProfile={userProfile} onClose={onClose} />
                                            <SecurityVaultTab userProfile={userProfile} onLogout={onLogout} />
                                        </div>
                                    )}
                                    {activeTab === 'calendar' && (
                                        <CalendarTab
                                            groups={groups}
                                            hiddenGroupIds={hiddenGroupIds}
                                            onToggleGroupVisibility={onToggleGroupVisibility}
                                            onUpdateGroup={onUpdateGroup}
                                            onShareGroup={onShareGroup}
                                            onDeleteGroup={onDeleteGroup}
                                            onCreateGroup={onCreateGroup}
                                            enabledExtensions={enabledExtensions}
                                        />
                                    )}
                                    {activeTab === 'appearance' && (
                                        <AppearanceTab noteLayout={noteLayout} onSetNoteLayout={onSetNoteLayout} />
                                    )}
                                    {activeTab === 'extensions' && (
                                        <IntegrationsTab
                                            enabledExtensions={enabledExtensions}
                                            onToggleExtension={onToggleExtension}
                                            groups={groups}
                                        />
                                    )}
                                    {activeTab === 'access' && <SyncCloudTab view="access" />}
                                    {activeTab === 'info' && <SyncCloudTab view="info" />}
                                    {activeTab === 'debug' && <DebugPluginSettings />}
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
