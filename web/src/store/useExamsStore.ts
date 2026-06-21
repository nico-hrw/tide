import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Exam {
    id: string;
    title: string;
    description?: string;
    grade?: string;
    credits?: number;
    color?: string;
}

export interface Semester {
    id: string;
    title: string;
    exams: Exam[];
}

interface ExamsState {
    semesters: Semester[];
    addSemester: (title: string) => void;
    updateSemester: (id: string, title: string) => void;
    deleteSemester: (id: string) => void;
    addExam: (semesterId: string, exam: Omit<Exam, 'id'>) => void;
    updateExam: (semesterId: string, examId: string, updates: Partial<Exam>) => void;
    deleteExam: (semesterId: string, examId: string) => void;
    moveExam: (examId: string, sourceSemesterId: string, targetSemesterId: string, newIndex: number) => void;
    reorderSemester: (semesterId: string, newIndex: number) => void;
}

export const useExamsStore = create<ExamsState>()(
    persist(
        (set) => ({
            semesters: [
                { id: '1', title: '1. Semester', exams: [] },
                { id: '2', title: '2. Semester', exams: [] },
            ],
            addSemester: (title) => set((state) => ({
                semesters: [...state.semesters, { id: crypto.randomUUID(), title, exams: [] }]
            })),
            updateSemester: (id, title) => set((state) => ({
                semesters: state.semesters.map(s => s.id === id ? { ...s, title } : s)
            })),
            deleteSemester: (id) => set((state) => ({
                semesters: state.semesters.filter(s => s.id !== id)
            })),
            addExam: (semesterId, exam) => set((state) => ({
                semesters: state.semesters.map(s => 
                    s.id === semesterId 
                        ? { ...s, exams: [...s.exams, { ...exam, id: crypto.randomUUID() }] }
                        : s
                )
            })),
            updateExam: (semesterId, examId, updates) => set((state) => ({
                semesters: state.semesters.map(s => 
                    s.id === semesterId 
                        ? { ...s, exams: s.exams.map(e => e.id === examId ? { ...e, ...updates } : e) }
                        : s
                )
            })),
            deleteExam: (semesterId, examId) => set((state) => ({
                semesters: state.semesters.map(s => 
                    s.id === semesterId 
                        ? { ...s, exams: s.exams.filter(e => e.id !== examId) }
                        : s
                )
            })),
            moveExam: (examId, sourceSemesterId, targetSemesterId, newIndex) => set((state) => {
                const newSemesters = [...state.semesters];
                const sourceIndex = newSemesters.findIndex(s => s.id === sourceSemesterId);
                const targetIndex = newSemesters.findIndex(s => s.id === targetSemesterId);
                
                if (sourceIndex === -1 || targetIndex === -1) return state;

                const sourceSemester = { ...newSemesters[sourceIndex] };
                const targetSemester = sourceIndex === targetIndex ? sourceSemester : { ...newSemesters[targetIndex] };

                const examIndex = sourceSemester.exams.findIndex(e => e.id === examId);
                if (examIndex === -1) return state;

                const [exam] = sourceSemester.exams.splice(examIndex, 1);
                targetSemester.exams.splice(newIndex, 0, exam);

                newSemesters[sourceIndex] = sourceSemester;
                if (sourceIndex !== targetIndex) {
                    newSemesters[targetIndex] = targetSemester;
                }

                return { semesters: newSemesters };
            }),
            reorderSemester: (semesterId, newIndex) => set((state) => {
                const newSemesters = [...state.semesters];
                const currentIndex = newSemesters.findIndex(s => s.id === semesterId);
                if (currentIndex === -1) return state;
                const [semester] = newSemesters.splice(currentIndex, 1);
                newSemesters.splice(newIndex, 0, semester);
                return { semesters: newSemesters };
            })
        }),
        {
            name: 'tide-exams-storage',
        }
    )
);
