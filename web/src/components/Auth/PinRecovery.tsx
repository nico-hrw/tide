"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ActionButton, SegmentedDigitInput } from "./AuthInputs";
import { fetchRecoveryVault, FreshSessionRequiredError } from "@/lib/recovery/recoveryApi";
import { recoverWithKey, recoverWithSecret } from "@/lib/recovery/recoveryFlow";
import { passkeyEnvelopes } from "@/lib/passkey/passkeyEnvelope";
import { openVaultWithPasskey, PasskeyCancelledError } from "@/lib/passkey/passkeyFlow";
import { isWebAuthnAvailable } from "@/lib/passkey/passkeySupport";
import { RecoverySecretFormatError } from "@/lib/recovery/recoverySecret";
import { RecoveryVaultError } from "@/lib/recovery/recoveryVault";

const EMPTY_PIN = ["", "", "", "", ""];

export interface PinRecoveryProps {
    pepper: string;
    /** Session token from the OTP sign-in that just happened (fresh session). */
    token?: string;
    onRecovered: (privateKey: CryptoKey) => void | Promise<void>;
    onBack: () => void;
    onRestartLogin: () => void;
}

/** Hint at sign-in that the vault PIN was reset with the recovery key (fallback for the notice mail). */
export function VaultReplacedNotice({ replacedAt }: { replacedAt: string }) {
    const [now] = useState(() => Date.now());
    const at = new Date(replacedAt);
    if (Number.isNaN(at.getTime()) || now - at.getTime() > 30 * 24 * 3600 * 1000) return null;
    return (
        <p role="status" className="mb-8 max-w-md rounded-card bg-t2-sub ring-1 ring-t2-line px-4 py-3 text-sm text-t2-ink-2">
            Dein Tresor-PIN wurde am {at.toLocaleString("de-DE", { dateStyle: "long", timeStyle: "short" })} mit dem
            Wiederherstellungsschlüssel neu gesetzt. Warst du das nicht, richte sofort einen neuen Wiederherstellungsschlüssel ein
            und melde dich bei uns. Die vorige Fassung des Tresors bleibt 24 Stunden lang vor weiteren Änderungen geschützt.
        </p>
    );
}

/** "PIN vergessen?": recovery secret + new PIN, then the normal unlock. */
export function PinRecovery({ pepper, token, onRecovered, onBack, onRestartLogin }: PinRecoveryProps) {
    const [vault, setVault] = useState<string | null | undefined>(undefined);
    const [loadError, setLoadError] = useState("");
    const [secret, setSecret] = useState("");
    const [pin, setPin] = useState<string[]>(EMPTY_PIN);
    const [pin2, setPin2] = useState<string[]>(EMPTY_PIN);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [sessionTooOld, setSessionTooOld] = useState(false);
    // Private key opened with a passkey ("Mit Passkey wiederherstellen"); then no secret is needed.
    const [passkeyKey, setPasskeyKey] = useState<CryptoKey | null>(null);
    const [webauthn] = useState(() => isWebAuthnAvailable());
    const hasPasskey = webauthn && passkeyEnvelopes(vault).length > 0;
    const hasMailSecret = !!vault && vault.includes('"mail-secret"');

    const usePasskey = async () => {
        if (!vault) return;
        setBusy(true);
        setError("");
        try {
            setPasskeyKey(await openVaultWithPasskey(vault));
        } catch (err) {
            if (!(err instanceof PasskeyCancelledError)) setError(err instanceof Error ? err.message : "Passkey konnte den Tresor nicht öffnen.");
        } finally {
            setBusy(false);
        }
    };

    useEffect(() => {
        let cancelled = false;
        fetchRecoveryVault({ token })
            .then((v) => { if (!cancelled) setVault(v); })
            .catch((err: unknown) => {
                if (!cancelled) setLoadError(err instanceof Error ? err.message : "Wiederherstellung konnte nicht geladen werden.");
            });
        return () => { cancelled = true; };
    }, [token]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!vault) return;
        const newPin = pin.join("");
        if (!passkeyKey && !secret.trim()) return setError("Bitte gib deinen Wiederherstellungsschlüssel ein.");
        if (newPin.length !== 5) return setError("Der neue PIN muss genau 5 Ziffern lang sein.");
        if (newPin !== pin2.join("")) {
            setPin2(EMPTY_PIN);
            return setError("Die beiden PINs stimmen nicht überein.");
        }
        setBusy(true);
        setError("");
        try {
            const result = passkeyKey
                ? await recoverWithKey({ privateKey: passkeyKey, newPin, pepperBase64: pepper, token })
                : await recoverWithSecret({ recoveryVault: vault, secret, newPin, pepperBase64: pepper, token });
            setSecret("");
            await onRecovered(result.privateKey);
        } catch (err) {
            if (err instanceof FreshSessionRequiredError) setSessionTooOld(true);
            if (err instanceof RecoverySecretFormatError || err instanceof RecoveryVaultError || err instanceof Error) setError(err.message);
            else setError("Wiederherstellung fehlgeschlagen. Bitte versuche es erneut.");
        } finally {
            setBusy(false);
        }
    };

    const backLink = (
        <button type="button" onClick={onBack} className="text-sm font-medium text-t2-ink-3 hover:text-t2-ink transition-colors cursor-pointer">
            Zurück zur PIN-Eingabe
        </button>
    );

    return (
        <div>
            <h1 className="text-4xl sm:text-5xl font-medium tracking-tight text-t2-ink mb-4 sm:mb-6 leading-tight">PIN vergessen?</h1>

            {vault === undefined && !loadError && (
                <p className="flex items-center gap-2 text-t2-ink-2"><Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Einen Moment …</p>
            )}

            {loadError && (
                <div className="max-w-md">
                    <p role="alert" className="text-sm text-t2-late mb-6">{loadError}</p>
                    {backLink}
                </div>
            )}

            {vault === null && (
                <div className="max-w-md">
                    <p className="text-base sm:text-lg text-t2-ink-2 font-light leading-relaxed mb-4">
                        Für dieses Konto wurde kein Wiederherstellungsschlüssel eingerichtet. Ohne deinen PIN lässt sich dein Tresor
                        deshalb nicht öffnen. Auch Tide kann das nicht, denn wir kennen weder PIN noch Schlüssel.
                    </p>
                    <p className="text-sm text-t2-ink-2 leading-relaxed mb-8">
                        Versuch es in Ruhe weiter mit deinem PIN. Fällt er dir nicht mehr ein, bliebe nur, das Konto leer neu zu
                        starten. Dabei gingen alle bisherigen Notizen, Termine und Dateien unwiderruflich verloren. Diese Möglichkeit
                        gibt es in der App noch nicht.
                    </p>
                    {backLink}
                </div>
            )}

            {vault && (
                <>
                    <p className="text-base sm:text-lg text-t2-ink-2 font-light leading-relaxed max-w-md mb-8">
                        {passkeyKey
                            ? "Dein Passkey hat den Tresor geöffnet. Wähle jetzt einen neuen PIN. Deine Daten bleiben erhalten."
                            : "Gib deinen Wiederherstellungsschlüssel ein oder nutze einen Passkey, und wähle einen neuen PIN. Deine Daten bleiben erhalten."}
                    </p>
                    {hasPasskey && !passkeyKey && (
                        <div className="mb-8">
                            <button type="button" onClick={usePasskey} disabled={busy}
                                className="inline-flex items-center gap-2 rounded-ui px-4 py-2.5 text-sm font-medium bg-t2-surface text-t2-ink ring-1 ring-t2-line hover:bg-t2-hover transition-colors disabled:opacity-50 cursor-pointer">
                                Mit Passkey wiederherstellen
                            </button>
                        </div>
                    )}
                    {!hasMailSecret && !hasPasskey && !passkeyKey && (
                        <p role="alert" className="mb-8 max-w-md text-sm text-t2-late">
                            Für dieses Konto ist nur ein Passkey als Wiederherstellung hinterlegt, und dieses Gerät bzw. dieser Browser unterstützt keine Passkeys. Nutze ein Gerät mit deinem Passkey.
                        </p>
                    )}
                    <form onSubmit={submit} className="w-full max-w-md" noValidate>
                        {!passkeyKey && hasMailSecret && (<>
                        <label htmlFor="recovery-secret" className="block text-xs font-semibold tracking-wider uppercase text-t2-ink-2 mb-2">
                            Wiederherstellungsschlüssel
                        </label>
                        <textarea
                            id="recovery-secret"
                            value={secret}
                            rows={2}
                            autoFocus
                            autoComplete="off"
                            autoCapitalize="characters"
                            spellCheck={false}
                            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                            onChange={(e) => { setSecret(e.target.value); if (error) setError(""); }}
                            className="w-full resize-none bg-transparent border-0 border-b border-t2-line focus:border-b-t2-ink py-2 px-0 font-mono text-lg text-t2-ink placeholder:text-t2-ink-3 focus:outline-none transition-colors"
                        />
                        <p className="mt-1 mb-6 text-xs text-t2-ink-3">Bindestriche, Leerzeichen und Groß-/Kleinschreibung sind egal.</p>
                        </>)}

                        <p className="block text-xs font-semibold tracking-wider uppercase text-t2-ink-2 mb-2">Neuer PIN</p>
                        <SegmentedDigitInput length={5} digits={pin} onChange={setPin} type="password"
                            inputClassName="w-9 sm:w-11 h-12 sm:h-14 text-2xl font-mono text-center pb-2" gapClassName="gap-2 sm:gap-3" />
                        <p className="block text-xs font-semibold tracking-wider uppercase text-t2-ink-2 mt-6 mb-2">Neuen PIN wiederholen</p>
                        <SegmentedDigitInput length={5} digits={pin2} onChange={setPin2} type="password"
                            inputClassName="w-9 sm:w-11 h-12 sm:h-14 text-2xl font-mono text-center pb-2" gapClassName="gap-2 sm:gap-3" />

                        {error && <p role="alert" className="mt-6 text-sm font-medium text-t2-late">{error}</p>}
                        {sessionTooOld && (
                            <button type="button" onClick={onRestartLogin} className="mt-3 text-sm font-medium text-t2-ink underline underline-offset-4 cursor-pointer">
                                Neu mit Mail-Code anmelden
                            </button>
                        )}

                        <div className="flex flex-wrap items-center gap-6 mt-10">
                            <ActionButton loading={busy} disabled={busy} label={busy ? "Wird wiederhergestellt..." : "PIN neu setzen"} />
                            {backLink}
                        </div>
                    </form>
                </>
            )}
        </div>
    );
}
