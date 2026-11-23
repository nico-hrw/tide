"use client";

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Check, Info, X } from 'lucide-react';
import { useFeedbackStore, type Toast } from '@/store/useFeedbackStore';
import { defaultToastTimerConfig, initialToastTimer, stepToastTimer, toastTimerProgress } from '@/lib/toastTimer';

// Last known mouse position (null on touch devices), shared by all toasts
let mousePos: { x: number; y: number } | null = null;
let mouseListening = false;
function trackMouse() {
    if (mouseListening || typeof window === 'undefined') return;
    mouseListening = true;
    window.addEventListener('mousemove', (e) => { mousePos = { x: e.clientX, y: e.clientY }; }, { passive: true });
}

const RING_R = 12;
const RING_C = 2 * Math.PI * RING_R;

function distanceToRect(p: { x: number; y: number }, r: DOMRect): number {
    const dx = Math.max(r.left - p.x, 0, p.x - r.right);
    const dy = Math.max(r.top - p.y, 0, p.y - r.bottom);
    return Math.hypot(dx, dy);
}

function ToastItem({ toast }: { toast: Toast }) {
    const dismiss = useFeedbackStore((s) => s.dismissToast);
    const rootRef = useRef<HTMLDivElement>(null);
    const ringRef = useRef<SVGCircleElement>(null);

    // Auto-dismiss: slow users get more time while the mouse heads for the banner (see lib/toastTimer.ts)
    useEffect(() => {
        trackMouse();
        const cfg = defaultToastTimerConfig(toast.duration);
        let state = initialToastTimer(toast.duration);
        let shown = 1; // eased ring value, so it glides instead of jumping
        let last = performance.now();
        let raf = 0;
        const tick = (now: number) => {
            const dt = Math.min(now - last, 100); // a background tab must not burn the timer in one step
            last = now;
            const rect = rootRef.current?.getBoundingClientRect();
            const distance = rect && mousePos ? distanceToRect(mousePos, rect) : null;
            const r = stepToastTimer(state, dt, distance, cfg);
            state = r.state;
            if (r.expired) { dismiss(toast.id); return; }
            const target = toastTimerProgress(state, cfg);
            shown += (target - shown) * (1 - Math.exp(-dt / 140));
            ringRef.current?.setAttribute('stroke-dashoffset', String(RING_C * (1 - shown)));
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [toast.id, toast.duration, dismiss]);

    const Icon = toast.tone === 'error' ? AlertCircle : toast.tone === 'success' ? Check : Info;
    return (
        <div
            ref={rootRef}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex min-w-[260px] max-w-[min(440px,calc(100vw-32px))] items-center gap-3 rounded-2xl border border-t2-line bg-t2-surface px-4 py-3 text-t2-ink shadow-[0_14px_36px_rgba(0,0,0,0.18)] animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
            <Icon size={16} className={`shrink-0 ${toast.tone === 'error' ? 'text-t2-late' : 'text-t2-ink-3'}`} aria-hidden />
            <span className="min-w-0 flex-1 text-[13.5px] leading-snug">{toast.message}</span>
            {toast.action && (
                <button
                    type="button"
                    onClick={() => { void toast.action!.onClick(); dismiss(toast.id); }}
                    className="shrink-0 rounded-lg bg-t2-ink px-3 py-1.5 text-[12.5px] font-semibold text-t2-bg transition-opacity hover:opacity-90 cursor-pointer"
                >
                    {toast.action.label}
                </button>
            )}
            <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Schließen"
                className="relative -mr-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-t2-ink-3 transition-colors hover:bg-t2-hover hover:text-t2-ink cursor-pointer"
            >
                <svg className="pointer-events-none absolute inset-0 -rotate-90" viewBox="0 0 28 28" aria-hidden>
                    <circle cx="14" cy="14" r={RING_R} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="2" />
                    <circle ref={ringRef} cx="14" cy="14" r={RING_R} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                        strokeDasharray={RING_C} strokeDashoffset={0} />
                </svg>
                <X size={13} />
            </button>
        </div>
    );
}

function ConfirmDialog() {
    const request = useFeedbackStore((s) => s.confirm);
    const resolve = useFeedbackStore((s) => s.resolveConfirm);
    const cancelRef = useRef<HTMLButtonElement>(null);
    const okRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!request) return;
        // Destructive questions start on "cancel" so a stray Enter never deletes
        (request.tone === 'danger' ? cancelRef : okRef).current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); resolve(false); } };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [request, resolve]);

    if (!request) return null;
    const danger = request.tone === 'danger';
    return (
        <div
            className="pointer-events-auto fixed inset-0 z-[1300] flex items-center justify-center bg-black/40 p-4 animate-in fade-in duration-100"
            onMouseDown={() => resolve(false)}
        >
            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="tide-confirm-title"
                aria-describedby={request.message ? 'tide-confirm-text' : undefined}
                onMouseDown={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-2xl border border-t2-line bg-t2-surface p-5 text-t2-ink shadow-2xl animate-in zoom-in-95 duration-100"
            >
                <h2 id="tide-confirm-title" className="text-[15px] font-semibold">{request.title}</h2>
                {request.message && (
                    <p id="tide-confirm-text" className="mt-1.5 whitespace-pre-line text-[13.5px] leading-relaxed text-t2-ink-2">{request.message}</p>
                )}
                <div className="mt-5 flex justify-end gap-2">
                    <button
                        ref={cancelRef}
                        type="button"
                        onClick={() => resolve(false)}
                        className="rounded-xl border border-t2-line px-4 py-2 text-[13px] font-medium transition-colors hover:bg-t2-hover cursor-pointer"
                    >
                        {request.cancelLabel}
                    </button>
                    <button
                        ref={okRef}
                        type="button"
                        onClick={() => resolve(true)}
                        className={`rounded-xl px-4 py-2 text-[13px] font-semibold transition-opacity hover:opacity-90 cursor-pointer ${
                            danger ? 'bg-t2-late text-white' : 'bg-t2-ink text-t2-bg'
                        }`}
                    >
                        {request.confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

/** Mounted once at the root: the stack of toasts and the question dialog (see lib/feedback.ts). */
export default function FeedbackHost() {
    const toasts = useFeedbackStore((s) => s.toasts);
    const mounted = React.useSyncExternalStore(() => () => {}, () => true, () => false);
    if (!mounted) return null;
    return createPortal(
        <>
            <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[1250] flex flex-col items-center gap-2 px-4">
                {toasts.map((t) => <ToastItem key={t.id} toast={t} />)}
            </div>
            <ConfirmDialog />
        </>,
        document.body,
    );
}
