import React, { useEffect, useState } from 'react';
import { registerScopePromptHost, type ScopeRequest } from '@/lib/recurrenceScopePrompt';

const COPY = {
    move: { heading: 'Wiederholenden Termin ändern', this: 'Nur dieser Termin', all: 'Alle Wiederholungen' },
    delete: { heading: 'Wiederholenden Termin löschen', this: 'Nur dieser Termin', all: 'Alle Wiederholungen löschen' },
} as const;

/** Mounted once at the app root; answers `askRecurrenceScope` with a small modal. */
export function RecurrenceScopeDialog() {
    const [request, setRequest] = useState<ScopeRequest | null>(null);

    useEffect(() => registerScopePromptHost((req) => {
        // A second request while one is open cancels the first, so no promise stays pending.
        setRequest((prev) => {
            prev?.resolve(null);
            return req;
        });
    }), []);

    if (!request) return null;
    const copy = COPY[request.action];
    const answer = (scope: 'this' | 'all' | null) => {
        request.resolve(scope);
        setRequest(null);
    };

    return (
        <div
            className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 p-4"
            onClick={() => answer(null)}
            onKeyDown={(e) => e.key === 'Escape' && answer(null)}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={copy.heading}
                className="w-full max-w-sm rounded-2xl border border-t2-line bg-t2-surface p-5 text-t2-ink shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-base font-semibold">{copy.heading}</h2>
                <p className="mt-1 truncate text-sm text-t2-ink-2">{request.title}</p>
                <div className="mt-4 flex flex-col gap-2">
                    <button
                        type="button"
                        autoFocus
                        onClick={() => answer('this')}
                        className="rounded-xl bg-t2-accent px-4 py-2.5 text-sm font-medium text-t2-accent-ink hover:opacity-90"
                    >
                        {copy.this}
                    </button>
                    <button
                        type="button"
                        onClick={() => answer('all')}
                        className="rounded-xl border border-t2-line px-4 py-2.5 text-sm font-medium hover:bg-t2-hover"
                    >
                        {copy.all}
                    </button>
                    <button
                        type="button"
                        onClick={() => answer(null)}
                        className="rounded-xl px-4 py-2 text-sm text-t2-ink-2 hover:bg-t2-hover"
                    >
                        Abbrechen
                    </button>
                </div>
            </div>
        </div>
    );
}

export default RecurrenceScopeDialog;
