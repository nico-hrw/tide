import type { RecurrenceScope } from '@/lib/recurrence';

export type ScopeAction = 'move' | 'delete';

export interface ScopeRequest {
    action: ScopeAction;
    title: string;
    resolve: (scope: RecurrenceScope | null) => void;
}

type Listener = (req: ScopeRequest) => void;

let listener: Listener | null = null;

/** Called by `RecurrenceScopeDialog` once mounted. Returns the cleanup. */
export function registerScopePromptHost(fn: Listener): () => void {
    listener = fn;
    return () => {
        if (listener === fn) listener = null;
    };
}

/**
 * Asks whether a change applies to only this occurrence or to the whole series.
 * Resolves `null` when the user cancels, or when no dialog is mounted (nothing is changed then).
 */
export function askRecurrenceScope(action: ScopeAction, title: string): Promise<RecurrenceScope | null> {
    return new Promise((resolve) => {
        if (!listener) {
            resolve(null);
            return;
        }
        listener({ action, title, resolve });
    });
}
