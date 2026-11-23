"use client";

import React, { useMemo } from "react";

interface NoteBreadcrumbProps {
    noteId: string | null;
    files: Array<{ id: string; title?: string; parent_id?: string | null; type?: string }>;
}

/** Pale folder path above the note title, e.g. "/Mails/TUD/"; hidden at the top level. */
export default function NoteBreadcrumb({ noteId, files }: NoteBreadcrumbProps) {
    const trail = useMemo(() => {
        const out: string[] = [];
        const seen = new Set<string>();
        let cur = files.find((f) => f.id === noteId);
        while (cur?.parent_id && !seen.has(cur.parent_id)) {
            seen.add(cur.parent_id);
            const parent = files.find((f) => f.id === cur!.parent_id && f.type === "folder");
            if (!parent) break;
            out.unshift(parent.title || "Ordner");
            cur = parent;
        }
        return out;
    }, [noteId, files]);

    // Top-level notes have no meaningful path, so the bare "/" is hidden.
    if (trail.length === 0) return null;
    const path = "/" + trail.map((name) => `${name}/`).join("");
    return (
        <nav aria-label="Pfad" className="mb-1 text-xs font-normal text-t2-ink-3 truncate">
            {path}
        </nav>
    );
}
