"use client";

import React, { useState } from 'react';
import { Plus, X, GraduationCap } from 'lucide-react';
import { useExamsStore } from '@/store/useExamsStore';
import { Reorder } from 'framer-motion';

export default function ExamsPlanner() {
    const { semesters, addSemester, deleteSemester, addExam, moveExam, deleteExam } = useExamsStore();
    const [newSemesterTitle, setNewSemesterTitle] = useState('');
    const [draggedExamId, setDraggedExamId] = useState<string | null>(null);

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

    return (
        <div className="flex-1 h-full flex flex-col bg-[#F9FAFB] dark:bg-[#121212] overflow-hidden">
            <div className="flex items-center justify-between px-8 py-6 border-b border-gray-200 dark:border-white/10 bg-white/50 dark:bg-black/20 backdrop-blur-sm z-10 shrink-0">
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

            <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 flex items-start gap-6 no-scrollbar">
                <Reorder.Group 
                    axis="x" 
                    values={semesters} 
                    onReorder={(newOrder) => {
                        // TODO: Implement semester reordering
                    }} 
                    className="flex items-start gap-6 h-full"
                >
                    {semesters.map((semester) => (
                        <Reorder.Item key={semester.id} value={semester} className="w-[320px] shrink-0 h-full flex flex-col">
                            <div className="bg-white dark:bg-[#1A1A1A] rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm flex flex-col max-h-full">
                                <div className="p-4 border-b border-gray-100 dark:border-white/5 flex items-center justify-between group">
                                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{semester.title}</h3>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            onClick={() => {
                                                const title = prompt("Neue Prüfung:", "Mathe 1");
                                                if (title) addExam(semester.id, { title });
                                            }}
                                            className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-md transition-colors"
                                        >
                                            <Plus size={16} />
                                        </button>
                                        <button 
                                            onClick={() => {
                                                if (confirm("Semester wirklich löschen?")) deleteSemester(semester.id);
                                            }}
                                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-colors"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                </div>
                                
                                <div 
                                    className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[150px]"
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, semester.id, semester.exams.length)}
                                >
                                    {semester.exams.map((exam, index) => (
                                        <div 
                                            key={exam.id}
                                            draggable
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
                                            className={`bg-white dark:bg-[#242424] p-3 rounded-xl border ${draggedExamId === exam.id ? 'opacity-50' : 'border-gray-200 dark:border-white/10 hover:border-blue-300 dark:hover:border-blue-500/50'} shadow-sm cursor-grab active:cursor-grabbing group transition-all`}
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100">{exam.title}</h4>
                                                    {exam.grade && <span className="mt-2 inline-block px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400 rounded text-xs font-semibold">{exam.grade}</span>}
                                                </div>
                                                <button 
                                                    onClick={() => deleteExam(semester.id, exam.id)}
                                                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-opacity"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {semester.exams.length === 0 && (
                                        <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-600 text-sm py-8 border-2 border-dashed border-gray-100 dark:border-white/5 rounded-xl">
                                            Keine Prüfungen
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Reorder.Item>
                    ))}
                </Reorder.Group>
            </div>
            <style jsx>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
}
