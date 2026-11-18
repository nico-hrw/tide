"use client";

import React, { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { ChevronDown } from "lucide-react";

type Level = 1 | 2 | 3;
type StyleId = "p" | Level;

const STYLES: { id: StyleId; label: string; title: string; className: string }[] = [
    { id: "p", label: "Text", title: "Normaler Text", className: "text-[13px] font-medium" },
    { id: 1, label: "Überschrift 1", title: "Überschrift 1 (Strg+Alt+1)", className: "text-[14px] font-bold" },
    { id: 2, label: "Überschrift 2", title: "Überschrift 2 (Strg+Alt+2)", className: "text-[13.5px] font-semibold" },
    { id: 3, label: "Überschrift 3", title: "Überschrift 3 (Strg+Alt+3)", className: "text-[13px] font-semibold" },
];

/**
 * Text style of the block around the selection, as a dropdown: the button shows the current style,
 * the menu lists plain text and headings 1-3. Works on the whole block, so a few words are enough.
 */
export default function TextStyleButtons({ editor }: { editor: Editor }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    const current: StyleId = editor.isActive("heading", { level: 1 }) ? 1
        : editor.isActive("heading", { level: 2 }) ? 2
        : editor.isActive("heading", { level: 3 }) ? 3
        : "p";
    const currentLabel = STYLES.find((s) => s.id === current)?.label ?? "Text";

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
    }, [open]);

    const apply = (id: StyleId) => {
        const chain = editor.chain().focus();
        if (id === "p") chain.setParagraph().run();
        else chain.setHeading({ level: id }).run();
        setOpen(false);
    };

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={open}
                title="Textstil"
                className="flex h-8 items-center gap-1 rounded-[8px] px-2 text-[13px] text-t2-ink hover:bg-t2-hover"
            >
                {currentLabel}
                <ChevronDown size={13} className="text-t2-ink-3" />
            </button>
            {open && (
                <div role="menu" className="absolute left-0 top-full z-[600] mt-1 flex w-40 flex-col gap-0.5 rounded-[12px] bg-t2-surface p-1.5 shadow-[0_0_0_1px_var(--t2-line),0_10px_30px_rgba(0,0,0,0.12)]">
                    {STYLES.map((s) => (
                        <button
                            key={String(s.id)}
                            type="button"
                            role="menuitemradio"
                            aria-checked={current === s.id}
                            title={s.title}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => apply(s.id)}
                            className={`flex items-center justify-between rounded-[8px] px-2.5 py-1.5 text-left hover:bg-t2-hover ${s.className} ${current === s.id ? "text-t2-ink" : "text-t2-ink-2"}`}
                        >
                            {s.label}
                            {current === s.id && <span className="text-t2-ink-3">✓</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
