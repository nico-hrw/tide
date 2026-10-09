"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Settings, 
    X,
    Clock
} from 'lucide-react';
import { useDataStore, DataItem } from '@/store/useDataStore';
import { useJobPlannerStore } from '@/store/useJobPlannerStore';
import PlannerWeekCalendar from './PlannerWeekCalendar';
import PlannerQuickLinks from './PlannerQuickLinks';
import PlannerTermStatus from './PlannerTermStatus';
import PlannerSemesterBoard from './PlannerSemesterBoard';

interface JobPlannerProps {
    onCreateGroup?: (title: string, color?: string, effect?: string) => Promise<string | undefined>;
    onOpenCalendar?: () => void;
    onOpenSettings?: (tab?: string) => void;
}

export default function JobPlanner({
    onCreateGroup,
    onOpenSettings,
}: JobPlannerProps) {
    const { events, notes } = useDataStore();
    const { 
        mode, 
        pluginGroupId, 
        setPluginGroupId, 
        setProtectedGroupIds 
    } = useJobPlannerStore();

    const isCreatingRef = useRef(false);

    // Event creation modal state
    const [createModal, setCreateModal] = useState<{
        isOpen: boolean;
        date: string;
        startHour: number;
        title: string;
        room: string;
    }>({
        isOpen: false,
        date: '',
        startHour: 9,
        title: '',
        room: '',
    });

    // Existing group folders
    const groupFolders = useMemo(() => {
        return notes.filter((n: DataItem) => n.type === 'folder' && n.isGroup);
    }, [notes]);

    // Target title for the single plugin category
    const targetCategoryTitle = useMemo(() => {
        if (mode === 'job') return 'Job';
        if (mode === 'study') return 'Studium';
        return 'Job & Studium';
    }, [mode]);

    // Ensure exactly ONE single category is used or created for this plugin
    useEffect(() => {
        // 1. If pluginGroupId already points to an existing group, make sure it's protected
        if (pluginGroupId) {
            const currentFolder = groupFolders.find(g => g.id === pluginGroupId);
            if (currentFolder) {
                setProtectedGroupIds([pluginGroupId]);
                return;
            }
        }

        // 2. Look for any existing group folder matching our title or common plugin names
        const candidateTitles = mode === 'both' 
            ? ['job & studium', 'job & uni', 'job', 'studium']
            : (mode === 'job' ? ['job', 'job & studium'] : ['studium', 'job & studium']);

        const existingMatch = groupFolders.find(g => 
            candidateTitles.includes((g.title || '').trim().toLowerCase())
        );

        if (existingMatch) {
            // Adopt existing folder instead of creating a duplicate!
            setPluginGroupId(existingMatch.id);
            setProtectedGroupIds([existingMatch.id]);
            return;
        }

        // 3. If none exists at all and we have the creation callback, create exactly ONE category
        if (!onCreateGroup || isCreatingRef.current) return;

        isCreatingRef.current = true;
        const color = mode === 'job' ? '#0284c7' : (mode === 'study' ? '#7c3aed' : '#2563eb');
        onCreateGroup(targetCategoryTitle, color, 'none')
            .then((newId) => {
                if (newId) {
                    setPluginGroupId(newId);
                    setProtectedGroupIds([newId]);
                }
            })
            .catch((err) => {
                console.error("Failed to create plugin category:", err);
            })
            .finally(() => {
                isCreatingRef.current = false;
            });
    }, [pluginGroupId, groupFolders, targetCategoryTitle, mode, onCreateGroup, setPluginGroupId, setProtectedGroupIds]);

    const categoryGroupIds = useMemo(() => {
        return pluginGroupId ? [pluginGroupId] : [];
    }, [pluginGroupId]);

    const handleCreateEventSlot = (date: Date, hour: number) => {
        const dateStr = date.toISOString().split('T')[0];
        setCreateModal({
            isOpen: true,
            date: dateStr,
            startHour: Math.max(0, Math.min(23, hour)),
            title: '',
            room: '',
        });
    };

    const handleSaveNewEvent = () => {
        if (!createModal.title.trim()) return;

        const start = new Date(`${createModal.date}T${String(createModal.startHour).padStart(2, '0')}:00:00`);
        const end = new Date(start);
        end.setHours(start.getHours() + 1, 30); // Default 1.5h event

        const parentFolder = pluginGroupId ? groupFolders.find(g => g.id === pluginGroupId) : null;
        const eventColor = parentFolder?.color || (mode === 'job' ? '#0284c7' : '#7c3aed');

        const newEventData = {
            id: crypto.randomUUID(),
            title: createModal.title.trim(),
            description: createModal.room.trim() || undefined,
            start: start.toISOString(),
            end: end.toISOString(),
            parent_id: pluginGroupId || null,
            color: eventColor,
            type: 'event',
        };

        // Add to useDataStore
        useDataStore.setState((s) => ({
            events: [...s.events, newEventData]
        }));

        setCreateModal(prev => ({ ...prev, isOpen: false }));
    };

    const headerTitle = mode === 'job' 
        ? 'Jobplaner' 
        : (mode === 'study' ? 'Studienplaner' : 'Job & Studienplaner');

    return (
        <div className="flex-1 h-full flex flex-col bg-[#f8f9fa] dark:bg-[#121212] overflow-y-auto relative select-none">
            {/* Clean, uncluttered Sticky Header */}
            <div className="sticky top-0 z-30 flex items-center justify-between px-6 md:px-10 py-5 border-b border-gray-200 dark:border-white/10 bg-white/90 dark:bg-[#121212]/90 backdrop-blur-md">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">
                    {headerTitle}
                </h1>

                {/* Direct Settings shortcut */}
                {onOpenSettings && (
                    <button
                        onClick={() => onOpenSettings('extensions')}
                        className="p-2.5 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                        title="Plugin-Einstellungen öffnen"
                    >
                        <Settings size={20} />
                    </button>
                )}
            </div>

            {/* Board Content */}
            <div className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-8 py-6 flex flex-col gap-6">
                {/* 1. Quick Links Icons ABOVE the calendar */}
                <PlannerQuickLinks />

                {/* 2. Week Calendar */}
                <PlannerWeekCalendar
                    events={events}
                    categoryGroupIds={categoryGroupIds}
                    onCreateEvent={handleCreateEventSlot}
                />

                {/* 3. Term status cards (Aktueller & Nächster Termin) */}
                <PlannerTermStatus
                    events={events}
                    categoryGroupIds={categoryGroupIds}
                />

                {/* 4. Semester Board at the bottom */}
                <PlannerSemesterBoard />
            </div>

            {/* Event Quick Create Modal */}
            {createModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
                    <div className="w-full max-w-sm bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl p-5 animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-white/5">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Clock size={16} className="text-blue-500" />
                                Neuer Termin
                            </h3>
                            <button
                                onClick={() => setCreateModal(prev => ({ ...prev, isOpen: false }))}
                                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="space-y-3 py-4 text-xs">
                            <div>
                                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                    Titel
                                </label>
                                <input
                                    type="text"
                                    placeholder="z.B. Mathematik Vorlesung, Schicht A..."
                                    value={createModal.title}
                                    onChange={(e) => setCreateModal(prev => ({ ...prev, title: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white outline-none focus:border-blue-500"
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                    Raum / Ort / Notiz
                                </label>
                                <input
                                    type="text"
                                    placeholder="z.B. Raum A1.01, Homeoffice..."
                                    value={createModal.room}
                                    onChange={(e) => setCreateModal(prev => ({ ...prev, room: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white outline-none focus:border-blue-500"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                        Datum
                                    </label>
                                    <input
                                        type="date"
                                        value={createModal.date}
                                        onChange={(e) => setCreateModal(prev => ({ ...prev, date: e.target.value }))}
                                        className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                        Uhrzeit
                                    </label>
                                    <select
                                        value={createModal.startHour}
                                        onChange={(e) => setCreateModal(prev => ({ ...prev, startHour: Number(e.target.value) }))}
                                        className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white outline-none focus:border-blue-500"
                                    >
                                        {Array.from({ length: 24 }).map((_, h) => (
                                            <option key={h} value={h}>
                                                {String(h).padStart(2, '0')}:00 Uhr
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-white/5">
                            <button
                                onClick={() => setCreateModal(prev => ({ ...prev, isOpen: false }))}
                                className="px-3 py-1.5 text-xs font-semibold rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                            >
                                Abbrechen
                            </button>
                            <button
                                onClick={handleSaveNewEvent}
                                disabled={!createModal.title.trim()}
                                className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-xs"
                            >
                                Speichern
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
