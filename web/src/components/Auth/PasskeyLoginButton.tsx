"use client";

import { useState, useSyncExternalStore } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { isWebAuthnAvailable } from "@/lib/passkey/passkeySupport";
import { PasskeyCancelledError, signInWithPasskey, type PasskeySignIn } from "@/lib/passkey/passkeyFlow";
import { PasskeyEnvelopeError } from "@/lib/passkey/passkeyEnvelope";

const noopSubscribe = () => () => undefined;

export interface PasskeyLoginButtonProps {
    onSignedIn: (result: PasskeySignIn) => void | Promise<void>;
}

/**
 * "Mit Passkey anmelden": replaces mail code and PIN for accounts with a passkey. Shown only when
 * the browser has WebAuthn; every failure ends in a message and the normal mail-code flow.
 */
export function PasskeyLoginButton({ onSignedIn }: PasskeyLoginButtonProps) {
    // Server render: false; client: real detection (no hydration mismatch).
    const available = useSyncExternalStore(noopSubscribe, isWebAuthnAvailable, () => false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    if (!available) return null;

    const run = async () => {
        setBusy(true);
        setError("");
        try {
            const result = await signInWithPasskey();
            await onSignedIn(result);
        } catch (err) {
            if (err instanceof PasskeyEnvelopeError) {
                // A session was created but the vault did not open: drop it, continue with mail code + PIN.
                await apiFetch("/api/v1/auth/logout", { method: "POST" }).catch(() => undefined);
            }
            if (err instanceof PasskeyCancelledError) setError("");
            else setError(`${err instanceof Error ? err.message : "Passkey-Anmeldung fehlgeschlagen."} Melde dich bitte mit Mail-Code und PIN an.`);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mb-12 max-w-sm">
            <button
                type="button"
                onClick={run}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-ui px-4 py-2.5 text-sm font-medium bg-t2-surface text-t2-ink ring-1 ring-t2-line hover:bg-t2-hover transition-colors disabled:opacity-50 cursor-pointer"
            >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />}
                Mit Passkey anmelden
            </button>
            {error && <p role="alert" className="mt-3 text-sm text-t2-late">{error}</p>}
        </div>
    );
}
