import { create } from 'zustand';

/**
 * Snapshot of the event being dragged. Used by the ghost preview AND
 * carried through Phase 1 (sidebar drop) → Phase 2 (cursor follow in editor).
 */
export interface DragGhostSnapshot {
    eventId: string;
    title: string;
    start: string;
    end: string;
    color?: string;
    targetNoteId: string;  // The note we just opened, where the mention will be inserted.
}

interface DragGhostState {
    /** True only during Phase 2 — cursor follows mouse, awaiting click. */
    active: boolean;
    snapshot: DragGhostSnapshot | null;
    startGhost: (snapshot: DragGhostSnapshot) => void;
    cancel: () => void;
}

/**
 * Global ephemeral drag-ghost state. Phase 1 (calendar→sidebar) is handled by
 * native HTML5 DnD; on successful drop, the sidebar handler calls `startGhost`,
 * which transitions us into Phase 2: a portal-rendered ghost follows the cursor
 * until the user clicks inside the editor (consumes) or hits ESC (cancels).
 */
export const useDragGhost = create<DragGhostState>((set) => ({
    active: false,
    snapshot: null,
    startGhost: (snapshot) => set({ active: true, snapshot }),
    cancel: () => set({ active: false, snapshot: null }),
}));
