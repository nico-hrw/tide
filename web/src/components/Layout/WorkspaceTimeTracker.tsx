'use client';

import { useEffect, useState } from 'react';
import { Clock, X } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { useIslandActionsStore } from '@/store/useIslandActionsStore';
import { useWorkspaceTimeStore } from '@/store/useWorkspaceTimeStore';
import { formatDuration, workspaceLabel } from '@/lib/workspaceTime';

/**
 * Counts the time spent in each workspace and offers to save a finished stint as a calendar
 * entry. Mount once. Nothing leaves the device until the user confirms.
 */
export default function WorkspaceTimeTracker() {
    const activeSafes = useDataStore((s) => s.activeSafes);
    const dispatch = useWorkspaceTimeStore((s) => s.dispatch);
    const pending = useWorkspaceTimeStore((s) => s.pending);
    const dismiss = useWorkspaceTimeStore((s) => s.dismiss);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const label = workspaceLabel(activeSafes ?? []);

    useEffect(() => {
        dispatch({ type: 'workspace', label, at: Date.now() });
    }, [label, dispatch]);

    useEffect(() => {
        const onVisibility = () =>
            dispatch({ type: 'visibility', visible: document.visibilityState === 'visible', at: Date.now() });
        onVisibility();
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, [dispatch]);

    useEffect(() => {
        if (!pending) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') dismiss();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [pending, dismiss]);

    if (!pending) return null;

    const save = async () => {
        const create = useIslandActionsStore.getState().createEvent;
        if (!create) {
            setError('Öffne zuerst den Kalender und versuche es dann erneut.');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const id = await create(new Date(pending.start), new Date(pending.end), `Arbeit: ${pending.label}`);
            if (id) dismiss();
            else setError('Der Termin konnte nicht gespeichert werden.');
        } catch {
            setError('Der Termin konnte nicht gespeichert werden.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            role="dialog"
            aria-label="Arbeitszeit eintragen"
            className="fixed bottom-6 left-1/2 z-[60] w-[340px] max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-2xl border border-t2-line bg-t2-surface p-4 text-t2-ink shadow-[var(--shadow-float)]"
        >
            <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-t2-sub text-t2-accent">
                    <Clock size={16} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold">
                        Du warst {formatDuration(pending.end - pending.start)} in {pending.label}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-t2-ink-2">
                        Als Termin im Kalender speichern? Bis dahin bleibt es auf diesem Gerät.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={dismiss}
                    aria-label="Verwerfen"
                    className="rounded-md p-1 text-t2-ink-3 hover:bg-t2-hover hover:text-t2-ink"
                >
                    <X size={14} aria-hidden="true" />
                </button>
            </div>
            <div className="mt-3 flex gap-2">
                <button
                    type="button"
                    onClick={save}
                    disabled={busy}
                    className="flex-1 rounded-[10px] bg-t2-accent px-3 py-2 text-[13.5px] font-medium text-t2-accent-ink hover:opacity-90 disabled:opacity-60"
                >
                    Als Termin speichern
                </button>
                <button
                    type="button"
                    onClick={dismiss}
                    className="rounded-[10px] border border-t2-line px-3 py-2 text-[13.5px] text-t2-ink-2 hover:bg-t2-hover"
                >
                    Verwerfen
                </button>
            </div>
            {error && <p role="alert" className="mt-2 text-[12.5px] text-t2-ink-2">{error}</p>}
        </div>
    );
}
