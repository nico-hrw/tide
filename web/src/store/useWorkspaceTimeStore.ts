import { create } from 'zustand';
import {
    createTrackerState,
    isTrackingEnabled,
    loadTotals,
    reduceTracker,
    saveTotals,
    type TimeSession,
    type TrackerEvent,
    type TrackerState,
} from '@/lib/workspaceTime';

interface WorkspaceTimeState {
    tracker: TrackerState;
    /** A finished stint waiting for the user's decision (save as calendar entry or discard). */
    pending: TimeSession | null;
    dispatch: (ev: TrackerEvent) => void;
    dismiss: () => void;
}

const now = Date.now();

export const useWorkspaceTimeStore = create<WorkspaceTimeState>()((set, get) => ({
    tracker: createTrackerState(now, true, loadTotals(now)),
    pending: null,
    dispatch: (ev) => {
        if (!isTrackingEnabled()) return;
        const result = reduceTracker(get().tracker, ev);
        saveTotals(result.state);
        set({ tracker: result.state, pending: result.prompt ?? get().pending });
    },
    dismiss: () => set({ pending: null }),
}));
