"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, Check, Trash2 } from 'lucide-react';
import { useJobPlannerStore } from '@/store/useJobPlannerStore';

const COLOR_OPTIONS = [
    { name: 'gray', bg: 'bg-gray-100 dark:bg-white/10 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-white/10' },
    { name: 'blue', bg: 'bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800/40' },
    { name: 'green', bg: 'bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800/40' },
    { name: 'purple', bg: 'bg-purple-50 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800/40' },
    { name: 'orange', bg: 'bg-orange-50 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-800/40' },
];

export default function PlannerSemesterBoard() {
    const { 
        mode,
        semesters, 
        addSemester, 
        updateSemester, 
        deleteSemester, 
        addExam, 
        deleteExam, 
        moveExam 
    } = useJobPlannerStore();

    const [newSemesterTitle, setNewSemesterTitle] = useState('');
    const [addingToSemester, setAddingToSemester] = useState<string | null>(null);
    const [newExamTitle, setNewExamTitle] = useState('');

    const [editingSemesterId, setEditingSemesterId] = useState<string | null>(null);
    const [editSemesterTitle, setEditSemesterTitle] = useState('');

    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (addingToSemester || editingSemesterId) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [addingToSemester, editingSemesterId]);

    const handleAddSemester = () => {
        const title = newSemesterTitle.trim();
        if (title) {
            addSemester(title);
            setNewSemesterTitle('');
        }
    };

    const handleAddExam = (semesterId: string) => {
        const title = newExamTitle.trim();
        if (title) {
            addExam(semesterId, { title, color: 'blue' });
            setNewExamTitle('');
            setAddingToSemester(null);
        }
    };

    const handleDragStart = (e: React.DragEvent, examId: string) => {
        e.dataTransfer.setData('text/plain', examId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDrop = (e: React.DragEvent, targetSemesterId: string, index: number) => {
        e.preventDefault();
        const examId = e.dataTransfer.getData('text/plain');
        if (examId) {
            const sourceSemester = semesters.find(s => s.exams.some(ex => ex.id === examId));
            if (sourceSemester) {
                moveExam(examId, sourceSemester.id, targetSemesterId, index);
            }
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const sectionTitle = mode === 'job' 
        ? 'Projekte & Phasen' 
        : (mode === 'both' ? 'Semester & Meilensteine' : 'Semester');

    const inputPlaceholder = mode === 'job' 
        ? 'Neues Projekt...' 
        : (mode === 'both' ? 'Neuer Abschnitt...' : 'Neues Semester...');

    const addItemText = mode === 'job' 
        ? 'Aufgabe / Meilenstein hinzufügen' 
        : 'Prüfung hinzufügen';

    return (
        <div className="w-full bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
            {/* Header matching Figma */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                    {sectionTitle}
                </h3>

                {/* New Semester input group matching Figma */}
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        placeholder={inputPlaceholder}
                        value={newSemesterTitle}
                        onChange={(e) => setNewSemesterTitle(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddSemester()}
                        className="px-3.5 py-1.5 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-xs text-gray-900 dark:text-white outline-none focus:border-blue-500 w-44 md:w-56 transition-colors placeholder:text-gray-400"
                    />
                    <button
                        onClick={handleAddSemester}
                        disabled={!newSemesterTitle.trim()}
                        className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 transition-colors shadow-sm shadow-blue-500/20 cursor-pointer"
                        title="Hinzufügen"
                    >
                        <Plus size={16} />
                    </button>
                </div>
            </div>

            {/* Semester Cards List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {semesters.map((semester) => (
                    <div
                        key={semester.id}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, semester.id, semester.exams.length)}
                        className="bg-white dark:bg-[#141414] border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden flex flex-col shadow-2xs hover:shadow-sm transition-all"
                    >
                        {/* Semester Header */}
                        <div className="flex items-center justify-between px-4 py-3 bg-gray-50/60 dark:bg-white/[0.02] border-b border-gray-100 dark:border-white/5">
                            {editingSemesterId === semester.id ? (
                                <div className="flex items-center gap-1.5 flex-1 mr-2">
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={editSemesterTitle}
                                        onChange={(e) => setEditSemesterTitle(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                if (editSemesterTitle.trim()) updateSemester(semester.id, editSemesterTitle.trim());
                                                setEditingSemesterId(null);
                                            }
                                            if (e.key === 'Escape') setEditingSemesterId(null);
                                        }}
                                        className="w-full text-xs font-bold px-2 py-1 rounded bg-white dark:bg-black border border-blue-500 text-gray-900 dark:text-white outline-none"
                                    />
                                    <button
                                        onClick={() => {
                                            if (editSemesterTitle.trim()) updateSemester(semester.id, editSemesterTitle.trim());
                                            setEditingSemesterId(null);
                                        }}
                                        className="p-1 rounded text-emerald-600 hover:bg-emerald-50"
                                    >
                                        <Check size={14} />
                                    </button>
                                </div>
                            ) : (
                                <h4
                                    onClick={() => {
                                        setEditingSemesterId(semester.id);
                                        setEditSemesterTitle(semester.title);
                                    }}
                                    className="text-xs md:text-sm font-semibold text-gray-900 dark:text-white cursor-pointer hover:text-blue-600 truncate"
                                    title="Klicken zum Umbenennen"
                                >
                                    {semester.title}
                                </h4>
                            )}

                            <div className="flex items-center gap-1">
                                <span className="text-[10px] font-mono font-bold text-gray-400 bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded">
                                    {semester.exams.length}
                                </span>
                                <button
                                    onClick={() => {
                                        if (semester.exams.length === 0 || confirm(`"${semester.title}" löschen?`)) {
                                            deleteSemester(semester.id);
                                        }
                                    }}
                                    className="p-1 text-gray-400 hover:text-rose-500 rounded transition-colors"
                                    title="Löschen"
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        </div>

                        {/* Exam list inside Semester */}
                        <div className="p-3 flex flex-col gap-2 min-h-[120px]">
                            {semester.exams.map((exam) => {
                                const colorClass = COLOR_OPTIONS.find(c => c.name === exam.color)?.bg || COLOR_OPTIONS[0].bg;
                                return (
                                    <div
                                        key={exam.id}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, exam.id)}
                                        className={`group relative p-2.5 rounded-xl border flex items-center justify-between transition-all cursor-grab active:cursor-grabbing ${colorClass}`}
                                    >
                                        <div className="flex-1 min-w-0 pr-2">
                                            <p className="text-xs font-semibold truncate leading-tight">
                                                {exam.title}
                                            </p>
                                            {(exam.grade || exam.credits) && (
                                                <div className="flex items-center gap-2 mt-1 text-[10px] opacity-80">
                                                    {exam.grade && <span>Note: {exam.grade}</span>}
                                                    {exam.credits && <span>{exam.credits} ECTS</span>}
                                                </div>
                                            )}
                                        </div>

                                        <button
                                            onClick={() => deleteExam(semester.id, exam.id)}
                                            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-rose-500 rounded transition-opacity"
                                            title="Löschen"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                );
                            })}

                            {/* Inline input if adding */}
                            {addingToSemester === semester.id ? (
                                <div className="p-2.5 rounded-xl border border-blue-500 bg-blue-50/20 dark:bg-blue-900/10 flex items-center gap-1.5 animate-in fade-in duration-150">
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        placeholder="Titel..."
                                        value={newExamTitle}
                                        onChange={(e) => setNewExamTitle(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleAddExam(semester.id);
                                            if (e.key === 'Escape') setAddingToSemester(null);
                                        }}
                                        className="w-full text-xs bg-transparent outline-none text-gray-900 dark:text-white placeholder:text-gray-400"
                                    />
                                    <button
                                        onClick={() => handleAddExam(semester.id)}
                                        className="p-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs shrink-0"
                                    >
                                        <Check size={12} />
                                    </button>
                                    <button
                                        onClick={() => setAddingToSemester(null)}
                                        className="p-1 text-gray-400 hover:text-gray-600 rounded-lg text-xs shrink-0"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ) : (
                                /* Add exam dashed card matching Figma node 23:188 */
                                <button
                                    onClick={() => {
                                        setAddingToSemester(semester.id);
                                        setNewExamTitle('');
                                    }}
                                    className="border border-dashed border-gray-200 dark:border-white/15 hover:border-blue-400 dark:hover:border-blue-500 rounded-xl p-3 flex flex-col items-center justify-center gap-1.5 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] cursor-pointer transition-all mt-auto"
                                >
                                    <Plus size={16} />
                                    <span className="text-xs font-medium">
                                        {addItemText}
                                    </span>
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
