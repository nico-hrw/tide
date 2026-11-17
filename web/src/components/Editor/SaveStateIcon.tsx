"use client";

import React from "react";
import "./noteChrome.css";

export type SaveStatus = "saved" | "unsaved" | "saving";
type IconState = "saved" | "saving" | "failed" | "coop";

interface SaveStateIconProps {
    saveStatus: SaveStatus;
    /** Note is shared and at least one collaborator is live. */
    isLiveShared?: boolean;
    onClick?: () => void;
}

const TIPS: Record<IconState, string> = {
    saved: "Gespeichert",
    saving: "Speichert …",
    failed: "Nicht gespeichert",
    coop: "Geteilt · live",
};

/** Minimal animated stroke icon for the note save state (no glow, no filled circle). */
export default function SaveStateIcon({ saveStatus, isLiveShared = false, onClick }: SaveStateIconProps) {
    const state: IconState =
        saveStatus === "saving" ? "saving" : saveStatus === "unsaved" ? "failed" : isLiveShared ? "coop" : "saved";
    return (
        <button
            type="button"
            onClick={onClick}
            data-state={state}
            aria-label={`Speicherstand: ${TIPS[state]}`}
            className="t2-save cursor-pointer"
        >
            {/* key restarts the one-shot animations whenever the state changes */}
            <svg key={state} viewBox="0 0 20 20" className="t2-save-icon" aria-hidden="true">
                <path className="t2-s-ok" d="M4.5 10.5l3.7 3.7L15.5 6.5" />
                <circle className="t2-s-busy" cx="10" cy="10" r="6.5" />
                <g className="t2-s-err"><path d="M10 4.8v6" /><path d="M10 14.4v.2" /></g>
                <g className="t2-s-coop">
                    <circle cx="7.5" cy="7.8" r="2.4" />
                    <path d="M3.2 15c.4-2.4 2.2-3.4 4.3-3.4s3.9 1 4.3 3.4" />
                    <circle cx="13.6" cy="8.4" r="1.9" />
                    <path d="M13.6 12c1.7 0 3 .9 3.3 2.8" />
                </g>
            </svg>
            <span className="t2-save-tip">{TIPS[state]}</span>
        </button>
    );
}
