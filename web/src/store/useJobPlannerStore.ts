import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PlannerMode = 'job' | 'study' | 'both';

export interface PlannerQuickLink {
    id: string;
    name: string;
    url: string;
    icon?: string; // URL, data URL, or icon name (e.g. 'book-open', 'calendar', 'file-text', 'users', 'settings')
}

export interface PlannerExam {
    id: string;
    title: string;
    description?: string;
    grade?: string;
    credits?: number;
    color?: string;
    date?: string;
    room?: string;
}

export interface PlannerSemester {
    id: string;
    title: string;
    exams: PlannerExam[];
}

interface JobPlannerState {
    mode: PlannerMode;
    setMode: (mode: PlannerMode) => void;
    quickLinks: PlannerQuickLink[];
    addQuickLink: (link: Omit<PlannerQuickLink, 'id'>) => void;
    updateQuickLink: (id: string, updates: Partial<PlannerQuickLink>) => void;
    deleteQuickLink: (id: string) => void;
    reorderQuickLinks: (links: PlannerQuickLink[]) => void;
    semesters: PlannerSemester[];
    addSemester: (title: string) => void;
    updateSemester: (id: string, title: string) => void;
    deleteSemester: (id: string) => void;
    addExam: (semesterId: string, exam: Omit<PlannerExam, 'id'>) => void;
    updateExam: (semesterId: string, examId: string, updates: Partial<PlannerExam>) => void;
    deleteExam: (semesterId: string, examId: string) => void;
    moveExam: (examId: string, sourceSemesterId: string, targetSemesterId: string, newIndex: number) => void;
    reorderSemester: (semesterId: string, newIndex: number) => void;
    protectedGroupIds: string[];
    setProtectedGroupIds: (ids: string[]) => void;
    addProtectedGroupId: (id: string) => void;
}

const DEFAULT_QUICK_LINKS: PlannerQuickLink[] = [
    { id: '1', name: 'ILIAS / Moodle', url: 'https://moodle.org', icon: 'book-open' },
    { id: '2', name: 'Kalender', url: '/calendar', icon: 'calendar' },
    { id: '3', name: 'Notizen', url: '', icon: 'file-text' },
    { id: '4', name: 'Teams / Meet', url: 'https://teams.microsoft.com', icon: 'users' },
    { id: '5', name: 'Portal', url: '', icon: 'settings' },
];

export const useJobPlannerStore = create<JobPlannerState>()(
    persist(
        (set) => ({
            mode: 'both',
            setMode: (mode) => set({ mode }),
            quickLinks: DEFAULT_QUICK_LINKS,
            addQuickLink: (link) => set((state) => ({
                quickLinks: [...state.quickLinks, { ...link, id: crypto.randomUUID() }]
            })),
            updateQuickLink: (id, updates) => set((state) => ({
                quickLinks: state.quickLinks.map(l => l.id === id ? { ...l, ...updates } : l)
            })),
            deleteQuickLink: (id) => set((state) => ({
                quickLinks: state.quickLinks.filter(l => l.id !== id)
            })),
            reorderQuickLinks: (links) => set({ quickLinks: links }),
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
            }),
            protectedGroupIds: [],
            setProtectedGroupIds: (ids) => set({ protectedGroupIds: ids }),
            addProtectedGroupId: (id) => set((state) => ({
                protectedGroupIds: state.protectedGroupIds.includes(id)
                    ? state.protectedGroupIds
                    : [...state.protectedGroupIds, id]
            })),
        }),
        {
            name: 'tide-job-planner-storage',
        }
    )
);
