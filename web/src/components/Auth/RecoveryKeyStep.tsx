"use client";

import { useState } from "react";
import { RecoverySecretCard } from "./RecoverySecretCard";

export interface RecoveryKeyStepProps {
    /** Formatted secret; the parent drops it from state once onDone runs. */
    secret: string;
    email: string;
    onDone: () => void;
}

/** Registration step "Wiederherstellungsschlüssel": keep the secret safe before continuing. */
export function RecoveryKeyStep({ secret, email, onDone }: RecoveryKeyStepProps) {
    const [confirmed, setConfirmed] = useState(false);
    const [skipArmed, setSkipArmed] = useState(false);

    return (
        <div>
            <h1 className="text-4xl sm:text-5xl font-medium tracking-tight text-t2-ink mb-4 sm:mb-6 leading-tight">
                Wiederherstellungsschlüssel
            </h1>
            <p className="text-base sm:text-lg text-t2-ink-2 font-light leading-relaxed max-w-md mb-3">
                Falls du deinen PIN einmal vergisst, öffnest du deinen Tresor mit diesem Schlüssel wieder. Tide kennt ihn nicht und
                kann ihn nicht wiederherstellen.
            </p>
            <p className="text-sm text-t2-ink-2 leading-relaxed max-w-md mb-6">
                Bewahre ihn gut auf: am einfachsten als Mail an dich selbst, zusätzlich im Passwortmanager oder ausgedruckt. Er wird
                nach diesem Schritt nirgends mehr angezeigt.
            </p>

            <RecoverySecretCard secret={secret} email={email} />

            <label className="mt-6 flex items-start gap-3 max-w-md text-sm text-t2-ink cursor-pointer select-none">
                <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-t2-accent"
                />
                <span>Ich habe den Wiederherstellungsschlüssel sicher aufbewahrt.</span>
            </label>

            <div className="flex flex-wrap items-center gap-6 mt-8">
                <button
                    type="button"
                    disabled={!confirmed}
                    onClick={onDone}
                    className="text-lg font-medium tracking-wide text-t2-ink hover:text-t2-ink-2 transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                >
                    Weiter zur Anmeldung →
                </button>
                {!skipArmed && (
                    <button
                        type="button"
                        onClick={() => setSkipArmed(true)}
                        className="text-sm font-medium text-t2-ink-3 hover:text-t2-ink transition-colors cursor-pointer"
                    >
                        Überspringen
                    </button>
                )}
            </div>

            {skipArmed && (
                <div role="alert" className="mt-6 max-w-md rounded-card bg-t2-sub ring-1 ring-t2-line p-4 text-sm">
                    <p className="font-medium text-t2-late mb-3">
                        Ohne Schlüssel sind deine Daten bei vergessenem PIN unwiederbringlich verloren.
                    </p>
                    <div className="flex flex-wrap gap-4">
                        <button type="button" onClick={onDone} className="font-medium text-t2-late underline underline-offset-4 cursor-pointer">
                            Trotzdem ohne Schlüssel weiter
                        </button>
                        <button type="button" onClick={() => setSkipArmed(false)} className="font-medium text-t2-ink underline underline-offset-4 cursor-pointer">
                            Zurück zum Schlüssel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
