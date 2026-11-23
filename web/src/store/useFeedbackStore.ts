import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastAction {
    label: string;
    onClick: () => void | Promise<void>;
}

export interface Toast {
    id: number;
    message: string;
    tone: ToastTone;
    action?: ToastAction;
    /** ms until it disappears on its own */
    duration: number;
}

export interface ConfirmRequest {
    id: number;
    title: string;
    message?: string;
    confirmLabel: string;
    cancelLabel: string;
    /** `danger` paints the confirm button red and focuses "cancel" first */
    tone: 'danger' | 'default';
    resolve: (confirmed: boolean) => void;
}

interface FeedbackState {
    toasts: Toast[];
    /** One dialog at a time; a second request waits in `queue` */
    confirm: ConfirmRequest | null;
    queue: ConfirmRequest[];
    pushToast: (toast: Omit<Toast, 'id'>) => number;
    dismissToast: (id: number) => void;
    openConfirm: (req: ConfirmRequest) => void;
    resolveConfirm: (confirmed: boolean) => void;
}

let nextId = 1;
export const nextFeedbackId = () => nextId++;

const MAX_TOASTS = 3;

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
    toasts: [],
    confirm: null,
    queue: [],

    pushToast: (toast) => {
        const id = nextFeedbackId();
        set((s) => ({ toasts: [...s.toasts, { ...toast, id }].slice(-MAX_TOASTS) }));
        return id;
    },

    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    openConfirm: (req) => {
        if (get().confirm) set((s) => ({ queue: [...s.queue, req] }));
        else set({ confirm: req });
    },

    resolveConfirm: (confirmed) => {
        const current = get().confirm;
        if (!current) return;
        current.resolve(confirmed);
        const [next, ...rest] = get().queue;
        set({ confirm: next ?? null, queue: rest });
    },
}));
