"use client";

import React from "react";
import type { Editor } from "@tiptap/react";

type Level = 1 | 2 | 3;

const STYLES: { id: "p" | Level; label: string; title: string; className: string }[] = [
    { id: "p", label: "Text", title: "Normaler Text", className: "text-[12.5px] font-medium" },
    { id: 1, label: "H1", title: "Überschrift 1 (Strg+Alt+1)", className: "text-[13px] font-bold" },
    { id: 2, label: "H2", title: "Überschrift 2 (Strg+Alt+2)", className: "text-[13px] font-semibold" },
    { id: 3, label: "H3", title: "Überschrift 3 (Strg+Alt+3)", className: "text-[13px] font-semibold" },
];

/**
 * Text style for the block around the selection: plain text or heading 1-3.
 * Works on the whole block, so a selection of a few words is enough.
 */
export default function TextStyleButtons({ editor }: { editor: Editor }) {
    const isOn = (id: "p" | Level) => (id === "p" ? editor.isActive("paragraph") : editor.isActive("heading", { level: id }));

    const apply = (id: "p" | Level) => {
        const chain = editor.chain().focus();
        if (id === "p") chain.setParagraph().run();
        else chain.setHeading({ level: id }).run();
    };

    return (
        <div className="flex items-center gap-0.5 rounded-[8px] bg-t2-sub p-0.5" role="group" aria-label="Textstil">
            {STYLES.map((s) => (
                <button
                    key={s.id}
                    type="button"
                    title={s.title}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => apply(s.id)}
                    className={`rounded-[6px] px-2 py-1 leading-none transition-colors ${s.className} ${
                        isOn(s.id) ? "bg-t2-surface text-t2-ink shadow-[0_0_0_1px_var(--t2-line)]" : "text-t2-ink-2 hover:text-t2-ink"
                    }`}
                >
                    {s.label}
                </button>
            ))}
        </div>
    );
}
