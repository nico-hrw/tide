"use client";

import React, { useState, useRef, useEffect } from 'react';
import { askConfirm } from '@/lib/feedback';
import { Plus, X, Check, Trash2, Palette } from 'lucide-react';
import { useJobPlannerStore } from '@/store/useJobPlannerStore';

// Flat tinted entries (same look as the link chips); `color` stores the name, the tint comes from `hex`.
const COLOR_OPTIONS = [
    { name: 'gray', label: 'Grau', hex: '#6b7280' },
    { name: 'blue', label: 'Blau', hex: '#2563eb' },
    { name: 'green', label: 'Grün', hex: '#16a34a' },
    { name: 'purple', label: 'Violett', hex: '#7c3aed' },
    { name: 'orange', label: 'Orange', hex: '#ea580c' },
    { name: 'red', label: 'Rot', hex: '#dc2626' },
    { name: 'pink', label: 'Pink', hex: '#db2777' },
    { name: 'yellow', label: 'Gelb', hex: '#ca8a04' },
];

export default function PlannerSemesterBoard() {
    const { 
        mode,
        semesters, 
        addSemester, 
        updateSemester, 
        deleteSemester, 
        addExam, 
        updateExam,
        deleteExam, 
        moveExam 
    } = useJobPlannerStore();

    const [newSemesterTitle, setNewSemesterTitle] = useState('');
    const [addingToSemester, setAddingToSemester] = useState<string | null>(null);
    const [newExamTitle, setNewExamTitle] = useState('');

    const [editingExamId, setEditingExamId] = useState<string | null>(null);
    const [editExamTitle, setEditExamTitle] = useState('');
    const [colorExamId, setColorExamId] = useState<string | null>(null);

    const [editingSemesterId, setEditingSemesterId] = useState<string | null>(null);
    const [editSemesterTitle, setEditSemesterTitle] = useState('');

    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (addingToSemester || editingSemesterId || editingExamId) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [addingToSemester, editingSemesterId, editingExamId]);

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
        <div className="w-full bg-t2-surface  border border-t2-line  rounded-2xl p-5 shadow-sm flex flex-col gap-4">
            {/* Header matching Figma */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-bold text-t2-ink ">
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
                        className="px-3.5 py-1.5 rounded-xl border border-t2-line  bg-t2-sub  text-xs text-t2-ink  outline-none focus:border-t2-accent w-44 md:w-56 transition-colors placeholder:text-t2-ink-3"
                    />
                    <button
                        onClick={handleAddSemester}
                        disabled={!newSemesterTitle.trim()}
                        className="w-8 h-8 rounded-xl bg-t2-accent text-t2-accent-ink flex items-center justify-center hover:opacity-90 disabled:opacity-40 transition-colors shadow-sm shadow-blue-500/20 cursor-pointer"
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
                        className="bg-t2-surface  border border-t2-line  rounded-xl overflow-hidden flex flex-col shadow-2xs hover:shadow-sm transition-all"
                    >
                        {/* Semester Header */}
                        <div className="flex items-center justify-between px-4 py-3 bg-t2-sub  border-b border-t2-line-soft ">
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
                                        className="w-full text-xs font-bold px-2 py-1 rounded bg-t2-bg border border-t2-accent text-t2-ink  outline-none"
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
                                    className="text-xs md:text-sm font-semibold text-t2-ink  cursor-pointer hover:text-t2-accent truncate"
                                    title="Klicken zum Umbenennen"
                                >
                                    {semester.title}
                                </h4>
                            )}

                            <div className="flex items-center gap-1">
                                <span className="text-[11px] font-mono font-bold text-t2-ink-3 bg-t2-hover  px-1.5 py-0.5 rounded">
                                    {semester.exams.length}
                                </span>
                                <button
                                    onClick={async () => {
                                        if (semester.exams.length === 0 || await askConfirm({
                                            title: `„${semester.title}“ löschen?`,
                                            message: `${semester.exams.length} Prüfungen werden mit gelöscht.`,
                                            confirmLabel: 'Löschen',
                                            tone: 'danger',
                                        })) {
                                            deleteSemester(semester.id);
                                        }
                                    }}
                                    className="p-1 text-t2-ink-3 hover:text-rose-500 rounded transition-colors"
                                    title="Löschen"
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        </div>

                        {/* Exam list inside Semester */}
                        <div className="p-3 flex flex-col gap-2 min-h-[120px]">
                            {semester.exams.map((exam) => {
                                const tint = (COLOR_OPTIONS.find(c => c.name === exam.color) ?? COLOR_OPTIONS[0]).hex;
                                const commitRename = () => {
                                    const title = editExamTitle.trim();
                                    if (title && title !== exam.title) updateExam(semester.id, exam.id, { title });
                                    setEditingExamId(null);
                                };
                                return (
                                    <div
                                        key={exam.id}
                                        draggable={editingExamId !== exam.id}
                                        onDragStart={(e) => handleDragStart(e, exam.id)}
                                        style={{ '--chip': tint } as React.CSSProperties}
                                        className="mention-chip group relative px-3 py-2 rounded-md transition-colors cursor-grab active:cursor-grabbing"
                                    >
                                        <div className="flex items-center justify-between gap-1">
                                            <div className="flex-1 min-w-0 pr-1">
                                                {editingExamId === exam.id ? (
                                                    <input
                                                        ref={inputRef}
                                                        type="text"
                                                        value={editExamTitle}
                                                        onChange={(e) => setEditExamTitle(e.target.value)}
                                                        onBlur={commitRename}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') commitRename();
                                                            if (e.key === 'Escape') setEditingExamId(null);
                                                        }}
                                                        className="w-full text-xs font-medium bg-transparent outline-none border-b border-current"
                                                    />
                                                ) : (
                                                    <p
                                                        onClick={() => { setEditingExamId(exam.id); setEditExamTitle(exam.title); }}
                                                        className="text-xs font-medium truncate leading-tight cursor-text"
                                                        title="Klicken zum Umbenennen"
                                                    >
                                                        {exam.title}
                                                    </p>
                                                )}
                                                {(exam.grade || exam.credits) && (
                                                    <div className="flex items-center gap-2 mt-1 text-[11px] opacity-80">
                                                        {exam.grade && <span>Note: {exam.grade}</span>}
                                                        {exam.credits && <span>{exam.credits} ECTS</span>}
                                                    </div>
                                                )}
                                            </div>

                                            <button
                                                onClick={() => setColorExamId(colorExamId === exam.id ? null : exam.id)}
                                                className="opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity"
                                                title="Farbe ändern"
                                                aria-label="Farbe ändern"
                                            >
                                                <Palette size={12} />
                                            </button>
                                            <button
                                                onClick={() => deleteExam(semester.id, exam.id)}
                                                className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-500 rounded transition-opacity"
                                                title="Löschen"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                        {colorExamId === exam.id && (
                                            <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Farbe">
                                                {COLOR_OPTIONS.map((c) => (
                                                    <button
                                                        key={c.name}
                                                        type="button"
                                                        role="radio"
                                                        aria-checked={(exam.color ?? 'gray') === c.name}
                                                        title={c.label}
                                                        onClick={() => { updateExam(semester.id, exam.id, { color: c.name }); setColorExamId(null); }}
                                                        style={{ backgroundColor: c.hex }}
                                                        className={`w-4 h-4 rounded-full transition-transform hover:scale-110 ${(exam.color ?? 'gray') === c.name ? 'ring-2 ring-offset-1 ring-current ring-offset-transparent' : ''}`}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Inline input if adding */}
                            {addingToSemester === semester.id ? (
                                <div className="p-2.5 rounded-xl border border-t2-accent bg-t2-sub  flex items-center gap-1.5 animate-in fade-in duration-150">
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
                                        className="w-full text-xs bg-transparent outline-none text-t2-ink  placeholder:text-t2-ink-3"
                                    />
                                    <button
                                        onClick={() => handleAddExam(semester.id)}
                                        className="p-1 bg-t2-accent text-t2-accent-ink rounded-lg hover:opacity-90 text-xs shrink-0"
                                    >
                                        <Check size={12} />
                                    </button>
                                    <button
                                        onClick={() => setAddingToSemester(null)}
                                        className="p-1 text-t2-ink-3 hover:text-t2-ink-2 rounded-lg text-xs shrink-0"
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
                                    className="border border-dashed border-t2-line  hover:border-t2-accent  rounded-xl p-3 flex flex-col items-center justify-center gap-1.5 text-t2-ink-3  hover:text-t2-accent  hover:bg-t2-sub  cursor-pointer transition-all mt-auto"
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
