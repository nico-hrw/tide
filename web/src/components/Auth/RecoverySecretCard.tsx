"use client";

import { useState } from "react";
import { Copy, Download, Mail } from "lucide-react";
import { buildRecoveryMailto, buildRecoveryText, RECOVERY_FILE_NAME } from "@/lib/recovery/recoveryMail";

export interface RecoverySecretCardLabels {
    mail: string;
    copy: string;
    copied: string;
    download: string;
    copyFailed: string;
}

const DE_LABELS: RecoverySecretCardLabels = {
    mail: "An mich selbst mailen",
    copy: "Kopieren",
    copied: "Kopiert",
    download: "Herunterladen",
    copyFailed: "Kopieren nicht möglich. Bitte markiere den Schlüssel und kopiere ihn von Hand.",
};

export interface RecoverySecretCardProps {
    /** Formatted secret (XXXX-XXXX-…). Lives only in component state, never in storage or logs. */
    secret: string;
    email: string;
    labels?: RecoverySecretCardLabels;
    /** Called when the user used one of the safekeeping options. */
    onSaved?: () => void;
}

/** Shows the recovery secret with mail-to-self, copy and download. Nothing is sent to Tide's server. */
export function RecoverySecretCard({ secret, email, labels = DE_LABELS, onSaved }: RecoverySecretCardProps) {
    const [copied, setCopied] = useState(false);
    const [copyError, setCopyError] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(secret);
            setCopied(true);
            setCopyError(false);
            setTimeout(() => setCopied(false), 2000);
            onSaved?.();
        } catch {
            setCopyError(true);
        }
    };

    const download = () => {
        const blob = new Blob([buildRecoveryText(secret, email)], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = RECOVERY_FILE_NAME;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        onSaved?.();
    };

    const buttonClass =
        "inline-flex items-center gap-1.5 rounded-ui px-3 py-2 text-sm font-medium bg-t2-surface text-t2-ink ring-1 ring-t2-line hover:bg-t2-hover transition-colors cursor-pointer";

    return (
        <div className="w-full max-w-md">
            <div
                className="rounded-card bg-t2-sub ring-1 ring-t2-line px-4 py-4 mb-4 font-mono text-lg sm:text-xl tracking-wider text-t2-ink break-all select-all"
                aria-label="Wiederherstellungsschlüssel"
                data-testid="recovery-secret"
            >
                {secret}
            </div>
            <div className="flex flex-wrap gap-2">
                <a href={buildRecoveryMailto(email, secret)} onClick={() => onSaved?.()} className={buttonClass}>
                    <Mail className="h-4 w-4" aria-hidden />
                    {labels.mail}
                </a>
                <button type="button" onClick={copy} className={buttonClass}>
                    <Copy className="h-4 w-4" aria-hidden />
                    {copied ? labels.copied : labels.copy}
                </button>
                <button type="button" onClick={download} className={buttonClass}>
                    <Download className="h-4 w-4" aria-hidden />
                    {labels.download}
                </button>
            </div>
            {copyError && <p className="mt-2 text-sm text-t2-late">{labels.copyFailed}</p>}
        </div>
    );
}
