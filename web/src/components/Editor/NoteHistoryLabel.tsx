"use client";

import React from "react";

interface NoteHistoryLabelProps {
    /** ISO timestamp of the last edit. */
    lastEdited?: string | null;
    open: boolean;
    onToggle: () => void;
}

export function formatRelativeDe(iso?: string | null, now: number = Date.now()): string {
    if (!iso) return "";
    const t = new Date(iso).getTime();
    if (isNaN(t)) return "";
    const min = Math.max(0, Math.floor((now - t) / 60000));
    if (min < 1) return "gerade eben";
    if (min < 60) return `vor ${min} ${min === 1 ? "Minute" : "Minuten"}`;
    const h = Math.floor(min / 60);
    if (h < 24) return `vor ${h} ${h === 1 ? "Stunde" : "Stunden"}`;
    const d = Math.floor(h / 24);
    if (d < 30) return `vor ${d} ${d === 1 ? "Tag" : "Tagen"}`;
    const mo = Math.floor(d / 30);
    if (mo < 12) return `vor ${mo} ${mo === 1 ? "Monat" : "Monaten"}`;
    const y = Math.floor(d / 365);
    return `vor ${y} ${y === 1 ? "Jahr" : "Jahren"}`;
}

/** "Zuletzt bearbeitet vor …" — toggles the on-page version timeline. */
export default function NoteHistoryLabel({ lastEdited, open, onToggle }: NoteHistoryLabelProps) {
    const rel = formatRelativeDe(lastEdited);
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            title="Versionsverlauf ein-/ausblenden"
            className={`px-2 py-1 rounded-lg text-[12.5px] transition-colors hover:bg-t2-hover ${open ? "text-t2-blue" : "text-t2-ink-3"}`}
        >
            {rel ? `Zuletzt bearbeitet ${rel}` : "Versionsverlauf"}
        </button>
    );
}
