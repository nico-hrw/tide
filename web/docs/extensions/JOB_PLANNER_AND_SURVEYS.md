# Modular Extensions: JobPlanner

> The Surveys / Mood Tracker and Daily Summary plugins were removed (web, API and the `survey_responses` table, dropped by migration 14).

## 1. Modular Extensions Framework

Tide features a pluggable, modular extension system designed to maintain a clean core workspace while allowing specialized workflows (academic planning, career management, longitudinal mood/productivity tracking) to be toggled on demand without overhead.

### 1.1 Dynamic Extension Registration & Preference State

Extensions are toggled dynamically through user preferences governed by `useDataStore.UiSlice`:

```typescript
// web/src/store/useDataStore.ts
export interface UiSlice {
    enabledExtensions: string[]; // e.g. ['smart_island', 'job_planner', 'smart_date_detection', 'todos']
    setEnabledExtensions: (extensions: string[] | ((prev: string[]) => string[])) => void;
    // ...
}
```

- **Runtime Toggle:** Extensions can be toggled without requiring application restarts.
- **Lazy Rendering & Branch Elimination:** React trees check `enabledExtensions.includes('<extension_id>')` before mounting extension views, guaranteeing zero DOM or lifecycle overhead when disabled.
- **Zero Runtime Memory Footprint:** Subsystems decouple their operational event loops (such as NLP watchers) from the core shell when the respective extension is inactive.

### 1.2 Isolated Zustand Stores & Namespace Separation

Extensions maintain strictly isolated Zustand store slices. This guarantees that domain-specific states do not pollute the core note/event store (`useDataStore`) and maintain separate persistence keys in `localStorage`:

| Extension | Store Identifier | Persistence Key | Schema Responsibilities |
| :--- | :--- | :--- | :--- |
| **JobPlanner** | `useJobPlannerStore` | `tide-job-planner-storage` | Semesters, exams/modules, grades, ECTS credits, campus quick links, planner mode |
| **Smart Island** | `useIslandStore` | `tide_island_store` | Contextual HUD view stack, temporal parsed suggestions, active briefing state |

#### Persistence & Migration Separation
Each extension controls its own `partialize` configuration in Zustand middleware. Core workspace backups or migrations can export extension stores as optional satellite objects without breaking core workspace structures.

---

## 2. JobPlanner Extension (`useJobPlannerStore.ts`)

The **JobPlanner** extension is designed for university students, apprentices, and professionals managing modular semesters, coursework, exams, academic credits, and employer/study resources.

### 2.1 Domain Data Model

```typescript
// web/src/store/useJobPlannerStore.ts
export type PlannerMode = 'job' | 'study' | 'both';

export interface PlannerQuickLink {
    id: string;
    name: string;
    url: string;
    icon?: string; // 'book-open' | 'calendar' | 'file-text' | 'users' | 'settings' | string URL
}

export interface PlannerExam {
    id: string;
    title: string;
    description?: string;
    grade?: string;
    credits?: number; // ECTS or study credit points
    color?: string;
    date?: string;    // ISO timestamp or YYYY-MM-DD
    room?: string;    // Exam hall / lecture hall / remote link
}

export interface PlannerSemester {
    id: string;
    title: string;    // e.g. "1. Semester", "Winter 2026", "Thesis Term"
    exams: PlannerExam[];
}
```

### 2.2 Board & Kanban-Style Term Management

The JobPlanner interface organizes academic modules and exams into columns representing semesters or evaluation periods:

1. **Semester Columns:**
   - Creation, renaming, and removal via `addSemester(title)`, `updateSemester(id, title)`, `deleteSemester(id)`.
   - Index reordering of columns via `reorderSemester(semesterId, newIndex)` using clean array splicing.
2. **Exams / Modules Cards:**
   - Card additions: `addExam(semesterId, exam)` assigns a deterministic UUID v4.
   - Updates: `updateExam(semesterId, examId, updates)` for editing grade targets, actual marks, room numbers, and dates.
   - Cross-column dragging: `moveExam(examId, sourceSemesterId, targetSemesterId, newIndex)` handles intra-column and inter-column relocations with full immutability.
3. **Credit & GPA Computations:**
   - ECTS tallies: Aggregated per column and across all completed semesters.
   - Weighted Grade Point Average: Computed dynamically over modules that possess both non-null `credits` and valid numeric `grade` values.
4. **Quick Links Launcher:**
   - Fast-access launcher for portals (ILIAS, Moodle, Campus Management, Microsoft Teams, Zoom, Note shortcuts).
   - Allows user-defined URLs, reordering via `reorderQuickLinks(links)`, and custom iconography.

### 2.3 Linking JobPlanner Items to Core Notes and Calendar

JobPlanner integrates seamlessly with the core Tide workspace:
- **Calendar Synchronization:** Exams with defined `date` and `room` attributes map directly to Tide calendar events. The exam title, room, and notes populate the calendar event descriptor.
- **Syllabus & Lecture Notes Deep Linking:** Each `PlannerExam` can store a reference to a note ID in `useDataStore.notes`. Clicking "View Notes" opens the associated lecture or exam prep notebook.
- **Protected Group Isolation (`protectedGroupIds` & `pluginGroupId`):** JobPlanner items can be grouped under protected folder trees in the workspace file system to prevent accidental deletion during bulk note pruning.

---
