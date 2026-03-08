"use client";

import React, { createContext, useContext, useReducer, useRef, useCallback, useEffect } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export type IslandViewType = 'calendar' | 'message' | 'morning' | 'task_reminder' | 'finance_alert' | 'welcome' | 'timeline' | 'next_event' | 'upload_progress' | 'interactive_card' | 'event_preview';

export interface IslandView {
    id: string;
    type: IslandViewType;
    /** Payload for the view, e.g. message text, task counts, etc. */
    payload?: Record<string, any>;
}

interface IslandState {
    queue: IslandView[];
    /** The currently displayed view (null = show MiniCalendar default) */
    current: IslandView | null;
    /** Is the timer active for the current item? */
    timerActive: boolean;
    /** When did the current view start showing? (Used for pause/resume) */
    currentStartedAt: number | null;
    /** If a long-running view is interrupted, store it here to resume later */
    interruptedView: { view: IslandView; remainingMs: number } | null;
    /** Developer Mode: if true, popping an item puts it back in the queue (infinite loop) */
    devMode: boolean;
    /** Payload for the periodic idle timeline push */
    idlePayload?: Record<string, any>;
}

type IslandAction =
    | { type: 'PUSH'; view: IslandView }
    | { type: 'DISMISS_CURRENT' }
    | { type: 'TOGGLE_DEV_MODE' }
    | { type: 'SET_IDLE_PAYLOAD'; payload: Record<string, any> }
    | { type: 'CLEAR_ALL' };

// ─── Reducer ────────────────────────────────────────────────────────────────

function islandReducer(state: IslandState, action: IslandAction): IslandState {
    switch (action.type) {
        case 'PUSH': {
            // Is this a transient notification?
            const isTransient = action.view.type !== 'timeline' && action.view.type !== 'welcome' && action.view.type !== 'morning';

            // If nothing is showing, promote directly
            if (!state.current) {
                return { ...state, current: action.view, queue: [], timerActive: true, currentStartedAt: Date.now() };
            }

            // Immediately replace if clicking another event preview
            if (state.current.type === 'event_preview' && action.view.type === 'event_preview') {
                return { ...state, current: action.view, currentStartedAt: Date.now() };
            }

            // If a timeline is currently showing and a transient notification arrives, INTERRUPT IT
            if (state.current.type === 'timeline' && isTransient) {
                const elapsed = state.currentStartedAt ? Date.now() - state.currentStartedAt : 0;
                const remaining = Math.max(5000, (3 * 60 * 1000) - elapsed); // default timeline duration is 3m

                return {
                    ...state,
                    interruptedView: { view: state.current, remainingMs: remaining },
                    current: action.view,
                    currentStartedAt: Date.now(),
                    timerActive: true
                };
            }

            return { ...state, queue: [...state.queue, action.view] };
        }
        case 'DISMISS_CURRENT': {
            let nextQueue = [...state.queue];

            // If devMode is active and we have a current view, put it back at the end of the queue
            if (state.devMode && state.current) {
                nextQueue.push(state.current);
            }

            if (nextQueue.length > 0) {
                const [next, ...remaining] = nextQueue;
                return { ...state, current: next, queue: remaining, timerActive: true, currentStartedAt: Date.now() };
            }

            // Queue is empty. Should we resume an interrupted view?
            if (state.interruptedView) {
                return {
                    ...state,
                    current: state.interruptedView.view,
                    interruptedView: null,
                    timerActive: true,
                    currentStartedAt: Date.now() - ((3 * 60 * 1000) - state.interruptedView.remainingMs) // Fake start time to maintain total duration
                };
            }

            return { ...state, current: null, queue: [], timerActive: false, currentStartedAt: null };
        }
        case 'TOGGLE_DEV_MODE': {
            const enabling = !state.devMode;
            if (enabling) {
                // Pre-seed with boot sequence items for the infinite loop
                const bootItems: IslandView[] = [
                    { id: 'boot_welcome', type: 'welcome', payload: {} },
                    { id: 'boot_timeline', type: 'timeline', payload: state.idlePayload ?? {} },
                    { id: 'boot_next_event', type: 'next_event', payload: {} },
                ];
                const [first, ...rest] = bootItems;
                return { ...state, devMode: true, current: first, queue: [...rest, ...state.queue], timerActive: true, currentStartedAt: Date.now() };
            }
            return { ...state, devMode: false };
        }
        case 'SET_IDLE_PAYLOAD': {
            return { ...state, idlePayload: action.payload };
        }
        case 'CLEAR_ALL': {
            return { ...state, current: null, queue: [], timerActive: false, currentStartedAt: null, interruptedView: null };
        }
    }
}

const initialState: IslandState = {
    queue: [],
    current: null,
    timerActive: false,
    currentStartedAt: null,
    interruptedView: null,
    devMode: false,
    idlePayload: undefined,
};

// ─── Context ────────────────────────────────────────────────────────────────

interface IslandContextValue {
    state: IslandState;
    push: (view: Omit<IslandView, 'id'>) => void;
    dismiss: () => void;
    clearAll: () => void;
    toggleDevMode: () => void;
    setIdlePayload: (payload: Record<string, any>) => void;
}

const IslandContext = createContext<IslandContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

const DISPLAY_DURATION_MS = 5000;       // 5 seconds per view
const IDLE_INTERVAL_MS = 3 * 60 * 1000; // Push schedule every 3 minutes in production

export function IslandProvider({ children }: { children: React.ReactNode }) {
    const [state, dispatch] = useReducer(islandReducer, initialState);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const idleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const dismiss = useCallback(() => {
        dispatch({ type: 'DISMISS_CURRENT' });
    }, []);

    const toggleDevMode = useCallback(() => {
        dispatch({ type: 'TOGGLE_DEV_MODE' });
    }, []);

    const clearAll = useCallback(() => {
        dispatch({ type: 'CLEAR_ALL' });
    }, []);

    const push = useCallback((view: Omit<IslandView, 'id'>) => {
        const id = `island_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        dispatch({ type: 'PUSH', view: { ...view, id } });
    }, []);

    const setIdlePayload = useCallback((payload: Record<string, any>) => {
        dispatch({ type: 'SET_IDLE_PAYLOAD', payload });
    }, []);

    // ── Per-view display timer ─────────────────────────────────────────────
    useEffect(() => {
        if (state.current && state.timerActive) {
            if (timerRef.current) clearTimeout(timerRef.current);

            let duration = DISPLAY_DURATION_MS;
            if (state.current.payload?.duration) {
                duration = state.current.payload.duration;
            } else if (state.current.type === 'timeline') {
                duration = 3 * 60 * 1000; // 3 minutes for timeline
                if (state.currentStartedAt) {
                    const elapsed = Date.now() - state.currentStartedAt;
                    duration = Math.max(5000, duration - elapsed);
                }
            } else if (state.current.type === 'event_preview') {
                duration = 20 * 1000; // 20 seconds for event preview
            }

            timerRef.current = setTimeout(() => {
                dispatch({ type: 'DISMISS_CURRENT' });
            }, duration);
        } else {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        }
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [state.current?.id, state.timerActive, state.currentStartedAt]);

    // ── Idle timer — push TimelineView periodically ────────────────────────
    useEffect(() => {
        // Clear any existing idle interval
        if (idleIntervalRef.current) clearInterval(idleIntervalRef.current);

        // In dev mode, rotation is handled by the devMode infinite loop already.
        // In production, push a schedule reminder every IDLE_INTERVAL_MS.
        if (!state.devMode) {
            idleIntervalRef.current = setInterval(() => {
                dispatch({
                    type: 'PUSH',
                    view: {
                        id: `idle_timeline_${Date.now()}`,
                        type: 'timeline',
                        payload: state.idlePayload ?? {},
                    },
                });
            }, IDLE_INTERVAL_MS);
        }

        return () => {
            if (idleIntervalRef.current) clearInterval(idleIntervalRef.current);
        };
    }, [state.devMode, state.idlePayload]);

    return (
        <IslandContext.Provider value={{ state, push, dismiss, clearAll, toggleDevMode, setIdlePayload }}>
            {children}
        </IslandContext.Provider>
    );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useIslandStore() {
    const ctx = useContext(IslandContext);
    if (!ctx) throw new Error('useIslandStore must be used inside <IslandProvider>');
    return ctx;
}
