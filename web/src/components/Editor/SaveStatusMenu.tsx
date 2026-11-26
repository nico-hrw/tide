"use client";

import React, { useEffect, useRef } from "react";
import { 
    Check, 
    Loader2, 
    AlertCircle, 
    Lock, 
    ShieldCheck, 
    ChevronRight 
} from "lucide-react";
import { VisibilityBadge } from "@/components/Visibility/VisibilityBadge";
import { getVisibilityState } from "@/components/Visibility/visibilityState";

interface SaveStatusMenuProps {
    fileId: string;
    saveStatus: "saved" | "unsaved" | "saving";
    visibility?: string;
    isShared: boolean;
    isSharedByOwner: boolean;
    isRecipient: boolean;
    isProtected: boolean;
    onClose: () => void;
    onOpenShare: () => void;
    onOpenSecurity: () => void;
}

export default function SaveStatusMenu({
    fileId,
    saveStatus,
    visibility = "private",
    isSharedByOwner,
    isRecipient,
    isProtected,
    onClose,
    onOpenShare,
    onOpenSecurity
}: SaveStatusMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    // Recipient list is not passed in, so the shared state carries no count.
    const visibilityState = getVisibilityState({
        visibility,
        isOwner: !isRecipient,
        isShared: isSharedByOwner,
    });

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [onClose]);

    return (
        <div
            ref={menuRef}
            className="absolute right-0 top-10 w-72 bg-t2-surface  border border-t2-line  rounded-2xl shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl"
        >
            {/* Header */}
            <div className="px-2 py-1 mb-2 border-b border-t2-line-soft ">
                <span className="text-[11px] font-bold uppercase tracking-wider text-t2-ink-3 ">
                    Dokument-Status
                </span>
            </div>

            {/* 1. Speicherstatus */}
            <div className="px-2 py-2 rounded-xl bg-t2-sub  mb-2">
                <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 shrink-0">
                        {saveStatus === "saved" && (
                            <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                                <Check size={12} strokeWidth={3} />
                            </div>
                        )}
                        {saveStatus === "saving" && (
                            <div className="w-5 h-5 rounded-full bg-t2-sub  flex items-center justify-center text-t2-accent ">
                                <Loader2 size={12} className="animate-spin" />
                            </div>
                        )}
                        {saveStatus === "unsaved" && (
                            <div className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 dark:text-amber-400">
                                <AlertCircle size={12} />
                            </div>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-t2-ink  leading-tight">
                            {saveStatus === "saved"
                                ? "Lokal & Online gespeichert"
                                : saveStatus === "saving"
                                ? "Wird synchronisiert…"
                                : "Ungespeicherte Änderungen"}
                        </p>
                        <p className="text-[11px] text-t2-ink-2  mt-0.5 leading-snug">
                            {saveStatus === "saved"
                                ? "Alle Daten sind verschlüsselt und sicher gesichert."
                                : saveStatus === "saving"
                                ? "Änderungen werden mit dem Server synchronisiert…"
                                : "Änderungen werden automatisch zwischengespeichert."}
                        </p>
                    </div>
                </div>
            </div>

            {/* 2. Freigabe & Sichtbarkeit */}
            <div className="mb-2">
                <button
                    onClick={() => {
                        onClose();
                        onOpenShare();
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-t2-hover  transition-colors group text-left"
                >
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-t2-sub  flex items-center justify-center text-t2-accent  shrink-0">
                            <VisibilityBadge kind={visibilityState.kind} size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-t2-ink  truncate">
                                {isRecipient
                                    ? "Geteilt mit dir"
                                    : isSharedByOwner
                                    ? "Freigegeben für Kontakte"
                                    : visibility === "public"
                                    ? "Öffentlicher Link"
                                    : "Privat (Nur du)"}
                            </p>
                            <p className="text-[11px] text-t2-ink-3 ">
                                Freigabe & Berechtigungen verwalten
                            </p>
                        </div>
                    </div>
                    <ChevronRight size={14} className="text-t2-ink-3 group-hover:text-t2-ink-2  shrink-0 transition-transform group-hover:translate-x-0.5" />
                </button>
            </div>

            {/* 3. PIN- & Sicherheitseinstellungen */}
            <div>
                <button
                    onClick={() => {
                        onClose();
                        onOpenSecurity();
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-t2-hover  transition-colors group text-left"
                >
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            isProtected 
                                ? "bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400"
                                : "bg-t2-hover  text-t2-ink-2 "
                        }`}>
                            {isProtected ? <ShieldCheck size={14} /> : <Lock size={14} />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-t2-ink  truncate">
                                {isProtected ? "PIN-Schutz aktiv" : "Kein PIN-Schutz"}
                            </p>
                            <p className="text-[11px] text-t2-ink-3 ">
                                {isProtected ? "Sicherheitseinstellungen anpassen" : "Notiz mit PIN sperren"}
                            </p>
                        </div>
                    </div>
                    <ChevronRight size={14} className="text-t2-ink-3 group-hover:text-t2-ink-2  shrink-0 transition-transform group-hover:translate-x-0.5" />
                </button>
            </div>
        </div>
    );
}
