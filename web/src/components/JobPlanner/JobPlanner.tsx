"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { 
    GraduationCap, 
    Briefcase, 
    Sparkles, 
    Settings, 
    Calendar as CalendarIcon,
    X,
    Clock
} from 'lucide-react';
import { useDataStore, DataItem } from '@/store/useDataStore';
import { useJobPlannerStore, PlannerMode } from '@/store/useJobPlannerStore';
import PlannerWeekCalendar from './PlannerWeekCalendar';
import PlannerQuickLinks from './PlannerQuickLinks';
import PlannerTermStatus from './PlannerTermStatus';
import PlannerSemesterBoard from './PlannerSemesterBoard';

interface JobPlannerProps {
    onCreateGroup?: (title: string, color?: string, effect?: string) => Promise<string | undefined>;
    onOpenCalendar?: () => void;
    onOpenSettings?: () => void;
}

export default function JobPlanner({
    onCreateGroup,
    onOpenCalendar,
    onOpenSettings,
}: JobPlannerProps) {
    const { events, notes } = useDataStore();
    const { mode, setMode, setProtectedGroupIds, addProtectedGroupId } = useJobPlannerStore();

    // Event creation modal state
    const [createModal, setCreateModal] = useState<{
        isOpen: boolean;
        date: string;
        startHour: number;
        title: string;
        room: string;
        isJob: boolean;
    }>({
        isOpen: false,
        date: '',
        startHour: 9,
        title: '',
        room: '',
        isJob: false,
    });

    // Find or create categories for the selected mode
    const groupFolders = useMemo(() => {
        return notes.filter((n: DataItem) => n.type === 'folder' && n.isGroup);
    }, [notes]);

    // Active category names based on mode
    const targetCategoryTitles = useMemo(() => {
        if (mode === 'job') return ['Job'];
        if (mode === 'study') return ['Studium'];
        return ['Job', 'Studium'];
    }, [mode]);

    // Match groups to target titles
    const matchingGroups = useMemo(() => {
        return groupFolders.filter(g => 
            targetCategoryTitles.some(t => g.title?.toLowerCase() === t.toLowerCase())
        );
    }, [groupFolders, targetCategoryTitles]);

    const categoryGroupIds = useMemo(() => {
        return matchingGroups.map(g => g.id);
    }, [matchingGroups]);

    // Auto-create category if missing
    useEffect(() => {
        if (!onCreateGroup) return;

        targetCategoryTitles.forEach(async (title) => {
            const exists = groupFolders.some(g => g.title?.toLowerCase() === title.toLowerCase());
            if (!exists) {
                const color = title.toLowerCase() === 'job' ? '#3b82f6' : '#8b5cf6';
                try {
                    const newId = await onCreateGroup(title, color, 'none');
                    if (newId) {
                        addProtectedGroupId(newId);
                    }
                } catch (e) {
                    console.error("Failed to auto-create category", title, e);
                }
            }
        });
    }, [targetCategoryTitles, groupFolders, onCreateGroup, addProtectedGroupId]);

    // Update protected ids whenever matching groups change
    useEffect(() => {
        if (categoryGroupIds.length > 0) {
            setProtectedGroupIds(categoryGroupIds);
        }
    }, [categoryGroupIds, setProtectedGroupIds]);

    const handleCreateEventSlot = (date: Date, hour: number) => {
        const dateStr = date.toISOString().split('T')[0];
        setCreateModal({
            isOpen: true,
            date: dateStr,
            startHour: Math.max(0, Math.min(23, hour)),
            title: '',
            room: '',
            isJob: mode === 'job' || (mode === 'both' && false),
        });
    };

    const handleSaveNewEvent = async () => {
        if (!createModal.title.trim()) return;

        const start = new Date(`${createModal.date}T${String(createModal.startHour).padStart(2, '0')}:00:00`);
        const end = new Date(start);
        end.setHours(start.getHours() + 1, 30); // Default 1.5h event

        // Choose category group
        const targetTitle = createModal.isJob ? 'Job' : 'Studium';
        const targetGroup = matchingGroups.find(g => g.title?.toLowerCase() === targetTitle.toLowerCase()) || matchingGroups[0];

        const newEventData = {
            id: crypto.randomUUID(),
            title: createModal.title.trim(),
            description: createModal.room.trim() || undefined,
            start: start.toISOString(),
            end: end.toISOString(),
            parent_id: targetGroup?.id || null,
            color: createModal.isJob ? '#3b82f6' : '#8b5cf6',
            type: 'event',
        };

        // Add to useDataStore
        useDataStore.setState((s) => ({
            events: [...s.events, newEventData]
        }));

        setCreateModal(prev => ({ ...prev, isOpen: false }));
    };

    // Header labels according to mode
    const headerTitle = mode === 'job' 
        ? 'Jobplaner' 
        : (mode === 'study' ? 'Studienplaner' : 'Job & Studienplaner');

    const headerSubtitle = mode === 'job' 
        ? 'Verwalte deine Arbeitszeiten, Schichten und Projekte' 
        : (mode === 'study' ? 'Verwalte deine Semester und Prüfungen' : 'Verwalte deine Arbeitszeiten, Semester und Termine');

    const HeaderIcon = mode === 'job' 
        ? Briefcase 
        : (mode === 'study' ? GraduationCap : Sparkles);

    return (
        <div className="flex-1 h-full flex flex-col bg-[#f8f9fa] dark:bg-[#121212] overflow-y-auto relative select-none">
            {/* Sticky Header matching Figma */}
            <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between px-6 md:px-10 py-5 border-b border-gray-200 dark:border-white/10 bg-white/90 dark:bg-[#121212]/90 backdrop-blur-md gap-4">
                {/* Planner identity */}
                <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-[#dae9ff] dark:bg-blue-900/30 text-[#2461f2] dark:text-blue-400 flex items-center justify-center shrink-0 shadow-xs">
                        <HeaderIcon size={22} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">
                            {headerTitle}
                        </h1>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {headerSubtitle}
                        </p>
                    </div>
                </div>

                {/* Right controls: Mode Switcher & Category info */}
                <div className="flex items-center gap-3">
                    {/* Mode Segmented Switcher */}
                    <div className="bg-gray-100 dark:bg-white/10 p-1 rounded-xl flex items-center gap-1 border border-gray-200/60 dark:border-white/5">
                        {(['job', 'study', 'both'] as PlannerMode[]).map((m) => {
                            const label = m === 'job' ? 'Job' : (m === 'study' ? 'Studium' : 'Beides');
                            const active = mode === m;
                            return (
                                <button
                                    key={m}
                                    onClick={() => setMode(m)}
                                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                                        active
                                            ? 'bg-white dark:bg-[#1f1f1f] text-gray-900 dark:text-white shadow-xs'
                                            : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                                    }`}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Calendar shortcut button */}
                    {onOpenCalendar && (
                        <button
                            onClick={onOpenCalendar}
                            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                            title="Hauptkalender öffnen"
                        >
                            <CalendarIcon size={18} />
                        </button>
                    )}

                    {/* Settings shortcut button */}
                    {onOpenSettings && (
                        <button
                            onClick={onOpenSettings}
                            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                            title="Einstellungen öffnen"
                        >
                            <Settings size={18} />
                        </button>
                    )}
                </div>
            </div>

            {/* Board Content matching Figma layout */}
            <div className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-8 py-6 flex flex-col gap-6">
                {/* 1. Week Calendar at the top */}
                <PlannerWeekCalendar
                    events={events}
                    categoryGroupIds={categoryGroupIds}
                    onCreateEvent={handleCreateEventSlot}
                />

                {/* 2. Quick Links Icons under the calendar */}
                <PlannerQuickLinks />

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
                                        Startzeit (Uhr)
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={23}
                                        value={createModal.startHour}
                                        onChange={(e) => setCreateModal(prev => ({ ...prev, startHour: parseInt(e.target.value) || 0 }))}
                                        className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white outline-none focus:border-blue-500"
                                    />
                                </div>
                            </div>

                            {mode === 'both' && (
                                <div>
                                    <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                        Kategorie
                                    </label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setCreateModal(prev => ({ ...prev, isJob: false }))}
                                            className={`flex-1 py-1.5 rounded-xl font-medium text-xs transition-colors ${
                                                !createModal.isJob
                                                    ? 'bg-purple-600 text-white'
                                                    : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300'
                                            }`}
                                        >
                                            Studium / Schule
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setCreateModal(prev => ({ ...prev, isJob: true }))}
                                            className={`flex-1 py-1.5 rounded-xl font-medium text-xs transition-colors ${
                                                createModal.isJob
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300'
                                            }`}
                                        >
                                            Job / Arbeit
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100 dark:border-white/5">
                            <button
                                onClick={() => setCreateModal(prev => ({ ...prev, isOpen: false }))}
                                className="px-3.5 py-1.5 rounded-xl font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-xs"
                            >
                                Abbrechen
                            </button>
                            <button
                                onClick={handleSaveNewEvent}
                                disabled={!createModal.title.trim()}
                                className="px-4 py-1.5 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors text-xs shadow-sm shadow-blue-500/20"
                            >
                                Termin erstellen
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
