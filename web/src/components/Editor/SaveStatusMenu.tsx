"use client";

import React, { useEffect, useRef } from "react";
import { 
    Check, 
    Loader2, 
    AlertCircle, 
    Share2, 
    Users, 
    Globe, 
    Lock, 
    ShieldCheck, 
    ChevronRight 
} from "lucide-react";

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
    isShared,
    isSharedByOwner,
    isRecipient,
    isProtected,
    onClose,
    onOpenShare,
    onOpenSecurity
}: SaveStatusMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

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
            className="absolute right-0 top-10 w-72 bg-white dark:bg-slate-900 border border-gray-200/90 dark:border-slate-800 rounded-2xl shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl"
        >
            {/* Header */}
            <div className="px-2 py-1 mb-2 border-b border-gray-100 dark:border-slate-800">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                    Dokument-Status
                </span>
            </div>

            {/* 1. Speicherstatus */}
            <div className="px-2 py-2 rounded-xl bg-gray-50/80 dark:bg-slate-800/40 mb-2">
                <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 shrink-0">
                        {saveStatus === "saved" && (
                            <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                                <Check size={12} strokeWidth={3} />
                            </div>
                        )}
                        {saveStatus === "saving" && (
                            <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400">
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
                        <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 leading-tight">
                            {saveStatus === "saved"
                                ? "Lokal & Online gespeichert"
                                : saveStatus === "saving"
                                ? "Wird synchronisiert…"
                                : "Ungespeicherte Änderungen"}
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5 leading-snug">
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
                    className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800/80 transition-colors group text-left"
                >
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                            {visibility === "public" ? (
                                <Globe size={14} />
                            ) : isShared ? (
                                <Users size={14} />
                            ) : (
                                <Share2 size={14} />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                                {isRecipient
                                    ? "Geteilt mit dir"
                                    : isSharedByOwner
                                    ? "Freigegeben für Kontakte"
                                    : visibility === "public"
                                    ? "Öffentlicher Link"
                                    : "Privat (Nur du)"}
                            </p>
                            <p className="text-[10px] text-gray-400 dark:text-slate-500">
                                Freigabe & Berechtigungen verwalten
                            </p>
                        </div>
                    </div>
                    <ChevronRight size={14} className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-slate-300 shrink-0 transition-transform group-hover:translate-x-0.5" />
                </button>
            </div>

            {/* 3. PIN- & Sicherheitseinstellungen */}
            <div>
                <button
                    onClick={() => {
                        onClose();
                        onOpenSecurity();
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800/80 transition-colors group text-left"
                >
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            isProtected 
                                ? "bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400"
                                : "bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400"
                        }`}>
                            {isProtected ? <ShieldCheck size={14} /> : <Lock size={14} />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                                {isProtected ? "PIN-Schutz aktiv" : "Kein PIN-Schutz"}
                            </p>
                            <p className="text-[10px] text-gray-400 dark:text-slate-500">
                                {isProtected ? "Sicherheitseinstellungen anpassen" : "Notiz mit PIN sperren"}
                            </p>
                        </div>
                    </div>
                    <ChevronRight size={14} className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-slate-300 shrink-0 transition-transform group-hover:translate-x-0.5" />
                </button>
            </div>
        </div>
    );
}
