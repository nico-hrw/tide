import { nextFeedbackId, useFeedbackStore, type ToastAction, type ToastTone } from '@/store/useFeedbackStore';

/**
 * Tide never uses the browser's alert()/confirm(): messages are toasts, questions are Tide's own dialog.
 * Both work from anywhere (components, hooks, plain functions); `FeedbackHost` renders them.
 */

interface NotifyOptions {
    tone?: ToastTone;
    /** e.g. { label: 'Rückgängig', onClick } */
    action?: ToastAction;
    duration?: number;
}

/** Short message at the bottom of the screen. Errors stay a bit longer, a message with an action longest. */
export function notify(message: string, options: NotifyOptions = {}): number {
    const tone = options.tone ?? 'info';
    const duration = options.duration ?? (options.action ? 8000 : tone === 'error' ? 6000 : 4000);
    return useFeedbackStore.getState().pushToast({ message, tone, action: options.action, duration });
}

export function notifyError(message: string): number {
    return notify(message, { tone: 'error' });
}

/** Deleted something that can be restored: toast with an undo button. */
export function notifyUndo(message: string, undo: () => void | Promise<void>, label = 'Rückgängig'): number {
    return notify(message, { tone: 'success', action: { label, onClick: undo } });
}

export interface AskOptions {
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    /** `danger` (default for destructive questions): red confirm button, "cancel" has the focus */
    tone?: 'danger' | 'default';
}

/** Tide's own question dialog. Resolves `true` when confirmed, `false` on cancel, Escape or a click outside. */
export function askConfirm(options: AskOptions): Promise<boolean> {
    return new Promise((resolve) => {
        useFeedbackStore.getState().openConfirm({
            id: nextFeedbackId(),
            title: options.title,
            message: options.message,
            confirmLabel: options.confirmLabel ?? 'OK',
            cancelLabel: options.cancelLabel ?? 'Abbrechen',
            tone: options.tone ?? 'default',
            resolve,
        });
    });
}
