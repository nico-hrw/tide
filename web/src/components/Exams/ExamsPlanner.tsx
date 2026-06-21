"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, GraduationCap, Check, Edit2 } from 'lucide-react';
import { useExamsStore, Exam, Semester } from '@/store/useExamsStore';

const COLORS = [
    { name: 'gray', class: 'bg-gray-100 dark:bg-[#242424] text-gray-900 dark:text-gray-100 border-gray-200 dark:border-white/10', dot: 'bg-gray-400' },
    { name: 'blue', class: 'bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100 border-blue-200 dark:border-blue-800/50', dot: 'bg-blue-500' },
    { name: 'green', class: 'bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-100 border-green-200 dark:border-green-800/50', dot: 'bg-green-500' },
    { name: 'yellow', class: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-900 dark:text-yellow-100 border-yellow-200 dark:border-yellow-800/50', dot: 'bg-yellow-500' },
    { name: 'red', class: 'bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-100 border-red-200 dark:border-red-800/50', dot: 'bg-red-500' },
    { name: 'purple', class: 'bg-purple-50 dark:bg-purple-900/20 text-purple-900 dark:text-purple-100 border-purple-200 dark:border-purple-800/50', dot: 'bg-purple-500' },
    { name: 'orange', class: 'bg-orange-50 dark:bg-orange-900/20 text-orange-900 dark:text-orange-100 border-orange-200 dark:border-orange-800/50', dot: 'bg-orange-500' },
];

export default function ExamsPlanner() {
    const { semesters, addSemester, deleteSemester, addExam, moveExam, deleteExam, updateExam, updateSemester } = useExamsStore();
    const [newSemesterTitle, setNewSemesterTitle] = useState('');
    const [draggedExamId, setDraggedExamId] = useState<string | null>(null);

    // Inline states
    const [addingToSemester, setAddingToSemester] = useState<string | null>(null);
    const [newExamTitle, setNewExamTitle] = useState('');
    
    const [editingSemesterId, setEditingSemesterId] = useState<string | null>(null);
    const [editSemesterTitle, setEditSemesterTitle] = useState('');

    const [editingExamId, setEditingExamId] = useState<string | null>(null);
    const [editExamTitle, setEditExamTitle] = useState('');

    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (addingToSemester || editingSemesterId || editingExamId) {
            setTimeout(() => {
                inputRef.current?.focus();
            }, 50);
        }
    }, [addingToSemester, editingSemesterId, editingExamId]);

    const handleDragStart = (e: React.DragEvent, examId: string) => {
        setDraggedExamId(examId);
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
        setDraggedExamId(null);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleAddExamSubmit = (semesterId: string) => {
        if (newExamTitle.trim()) {
            addExam(semesterId, { title: newExamTitle.trim(), color: 'gray' });
        }
        setAddingToSemester(null);
        setNewExamTitle('');
    };

    const handleEditSemesterSubmit = (semesterId: string) => {
        if (editSemesterTitle.trim()) {
            updateSemester(semesterId, editSemesterTitle.trim());
        }
        setEditingSemesterId(null);
    };

    const handleEditExamSubmit = (semesterId: string, examId: string) => {
        if (editExamTitle.trim()) {
            updateExam(semesterId, examId, { title: editExamTitle.trim() });
        }
        setEditingExamId(null);
    };

    return (
        <div className="flex-1 h-full flex flex-col bg-[#F9FAFB] dark:bg-[#121212] overflow-y-auto relative">
            {/* Header */}
            <div className="sticky top-0 flex items-center justify-between px-8 py-6 border-b border-gray-200 dark:border-white/10 bg-white/80 dark:bg-black/60 backdrop-blur-md z-20 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                        <GraduationCap size={20} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">Studienplaner</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Verwalte deine Semester und Prüfungen</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <input 
                        type="text" 
                        value={newSemesterTitle}
                        onChange={(e) => setNewSemesterTitle(e.target.value)}
                        placeholder="Neues Semester..."
                        className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && newSemesterTitle.trim()) {
                                addSemester(newSemesterTitle.trim());
                                setNewSemesterTitle('');
                            }
                        }}
                    />
                    <button 
                        onClick={() => {
                            if (newSemesterTitle.trim()) {
                                addSemester(newSemesterTitle.trim());
                                setNewSemesterTitle('');
                            }
                        }}
                        className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                        <Plus size={18} />
                    </button>
                </div>
            </div>

            {/* Grid Layout for Semesters */}
            <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start">
                    {semesters.map((semester) => (
                        <div key={semester.id} className="bg-white dark:bg-[#1A1A1A] rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm flex flex-col">
                            {/* Semester Header */}
                            <div className="p-4 border-b border-gray-100 dark:border-white/5 flex items-center justify-between group min-h-[60px]">
                                {editingSemesterId === semester.id ? (
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={editSemesterTitle}
                                        onChange={(e) => setEditSemesterTitle(e.target.value)}
                                        onBlur={() => handleEditSemesterSubmit(semester.id)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleEditSemesterSubmit(semester.id);
                                            if (e.key === 'Escape') setEditingSemesterId(null);
                                        }}
                                        className="font-semibold bg-gray-50 dark:bg-black/20 border border-blue-300 dark:border-blue-500/50 rounded px-2 py-0.5 text-gray-900 dark:text-gray-100 focus:outline-none w-full mr-2"
                                    />
                                ) : (
                                    <h3 
                                        className="font-semibold text-gray-900 dark:text-gray-100 cursor-text flex-1"
                                        onClick={() => {
                                            setEditSemesterTitle(semester.title);
                                            setEditingSemesterId(semester.id);
                                        }}
                                        title="Klicken zum Umbenennen"
                                    >
                                        {semester.title}
                                    </h3>
                                )}

                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                    <button 
                                        onClick={() => {
                                            setAddingToSemester(semester.id);
                                            setNewExamTitle('');
                                        }}
                                        className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-md transition-colors"
                                        title="Prüfung hinzufügen"
                                    >
                                        <Plus size={16} />
                                    </button>
                                    <button 
                                        onClick={() => {
                                            if (semester.exams.length === 0 || window.confirm("Semester wirklich löschen?")) {
                                                deleteSemester(semester.id);
                                            }
                                        }}
                                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-colors"
                                        title="Semester löschen"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>
                            
                            {/* Exams List Container */}
                            <div 
                                className="p-3 space-y-3 min-h-[150px] transition-colors"
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, semester.id, semester.exams.length)}
                            >
                                {semester.exams.map((exam, index) => {
                                    const colorTheme = COLORS.find(c => c.name === (exam.color || 'gray')) || COLORS[0];
                                    return (
                                        <div 
                                            key={exam.id}
                                            draggable={editingExamId !== exam.id}
                                            onDragStart={(e) => handleDragStart(e, exam.id)}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                            }}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleDrop(e, semester.id, index);
                                            }}
                                            className={`relative p-3 rounded-xl border ${colorTheme.class} shadow-sm group transition-all ${draggedExamId === exam.id ? 'opacity-40 scale-95' : 'hover:scale-[1.02]'} ${editingExamId !== exam.id ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                        >
                                            {editingExamId === exam.id ? (
                                                <div className="flex flex-col gap-3">
                                                    <input
                                                        ref={inputRef}
                                                        type="text"
                                                        value={editExamTitle}
                                                        onChange={(e) => setEditExamTitle(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleEditExamSubmit(semester.id, exam.id);
                                                            if (e.key === 'Escape') setEditingExamId(null);
                                                        }}
                                                        className="font-medium text-sm bg-white/50 dark:bg-black/20 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 focus:outline-none focus:border-blue-500 w-full"
                                                        placeholder="Name der Prüfung"
                                                    />
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-1.5">
                                                            {COLORS.map(c => (
                                                                <button
                                                                    key={c.name}
                                                                    onClick={() => {
                                                                        updateExam(semester.id, exam.id, { color: c.name });
                                                                    }}
                                                                    className={`w-5 h-5 rounded-full ${c.dot} flex items-center justify-center border-[3px] ${exam.color === c.name ? 'border-white dark:border-black shadow-sm scale-110' : 'border-transparent opacity-50 hover:opacity-100 hover:scale-110'} transition-all`}
                                                                    title={c.name}
                                                                >
                                                                </button>
                                                            ))}
                                                        </div>
                                                        <button
                                                            onClick={() => handleEditExamSubmit(semester.id, exam.id)}
                                                            className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors shadow-sm"
                                                        >
                                                            Fertig
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-start justify-between">
                                                    <div 
                                                        className="flex-1 pr-6 cursor-pointer" 
                                                        onClick={() => {
                                                            setEditExamTitle(exam.title);
                                                            setEditingExamId(exam.id);
                                                        }}
                                                    >
                                                        <h4 className="font-medium text-sm leading-tight select-none" title="Klicken zum Bearbeiten">{exam.title}</h4>
                                                    </div>
                                                    
                                                    {/* Hover Actions */}
                                                    <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button 
                                                            onClick={() => {
                                                                setEditExamTitle(exam.title);
                                                                setEditingExamId(exam.id);
                                                            }}
                                                            className="p-1 text-current opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 rounded transition-colors"
                                                            title="Bearbeiten"
                                                        >
                                                            <Edit2 size={13} />
                                                        </button>
                                                        <button 
                                                            onClick={() => deleteExam(semester.id, exam.id)}
                                                            className="p-1 text-current opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 rounded hover:text-red-500 transition-colors"
                                                            title="Löschen"
                                                        >
                                                            <X size={13} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {/* Inline Add Exam Input */}
                                {addingToSemester === semester.id && (
                                    <div className="bg-white dark:bg-[#242424] p-3 rounded-xl border border-blue-300 dark:border-blue-500/50 shadow-sm animate-in fade-in zoom-in duration-200">
                                        <input
                                            ref={inputRef}
                                            type="text"
                                            value={newExamTitle}
                                            onChange={(e) => setNewExamTitle(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleAddExamSubmit(semester.id);
                                                if (e.key === 'Escape') {
                                                    setAddingToSemester(null);
                                                    setNewExamTitle('');
                                                }
                                            }}
                                            onBlur={() => {
                                                if (newExamTitle.trim()) {
                                                    handleAddExamSubmit(semester.id);
                                                } else {
                                                    setAddingToSemester(null);
                                                }
                                            }}
                                            placeholder="Name der Prüfung..."
                                            className="w-full text-sm font-medium bg-transparent outline-none text-gray-900 dark:text-gray-100"
                                        />
                                        <div className="mt-2 text-[10px] text-gray-400">Enter drücken zum Speichern</div>
                                    </div>
                                )}

                                {semester.exams.length === 0 && addingToSemester !== semester.id && (
                                    <div 
                                        className="h-24 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600 text-sm border-2 border-dashed border-gray-100 dark:border-white/5 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group"
                                        onClick={() => {
                                            setAddingToSemester(semester.id);
                                            setNewExamTitle('');
                                        }}
                                    >
                                        <Plus size={20} className="mb-1 opacity-50 group-hover:opacity-100 transition-opacity" />
                                        <span className="opacity-80 group-hover:opacity-100 transition-opacity">Prüfung hinzufügen</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
