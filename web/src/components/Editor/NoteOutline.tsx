"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import "./noteChrome.css";

interface OutlineItem { pos: number; level: 1 | 2 | 3; text: string; }

interface NoteOutlineProps { editor: Editor | null; }

function readHeadings(editor: Editor): OutlineItem[] {
    const items: OutlineItem[] = [];
    editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading" && (node.attrs.level === 1 || node.attrs.level === 2 || node.attrs.level === 3)) {
            items.push({ pos, level: node.attrs.level, text: node.textContent.trim() || "Ohne Titel" });
        }
    });
    return items;
}

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
    let cur = el?.parentElement ?? null;
    while (cur) {
        const oy = getComputedStyle(cur).overflowY;
        if (oy === "auto" || oy === "scroll") return cur;
        cur = cur.parentElement;
    }
    return null;
}

function headingEl(editor: Editor, pos: number): HTMLElement | null {
    try {
        const dom = editor.view.nodeDOM(pos);
        return dom instanceof HTMLElement ? dom : null;
    } catch {
        return null;
    }
}

/** Outline (Gliederung): short bars beside the text, expands on hover into a heading list. */
export default function NoteOutline({ editor }: NoteOutlineProps) {
    const [items, setItems] = useState<OutlineItem[]>([]);
    const [active, setActive] = useState(0);

    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        const refresh = () => { if (!editor.isDestroyed) setItems(readHeadings(editor)); };
        const raf = requestAnimationFrame(refresh);
        editor.on("update", refresh);
        return () => { cancelAnimationFrame(raf); editor.off("update", refresh); };
    }, [editor]);

    const spy = useCallback(() => {
        if (!editor || editor.isDestroyed || items.length === 0) return;
        const root = editor.view.dom as HTMLElement;
        const sc = findScrollParent(root);
        const top = sc ? sc.getBoundingClientRect().top : 0;
        let a = 0;
        items.forEach((it, i) => {
            const el = headingEl(editor, it.pos);
            if (el && el.getBoundingClientRect().top - top <= 140) a = i;
        });
        setActive(a);
    }, [editor, items]);

    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        const sc = findScrollParent(editor.view.dom as HTMLElement);
        const raf = requestAnimationFrame(spy);
        sc?.addEventListener("scroll", spy, { passive: true });
        return () => { cancelAnimationFrame(raf); sc?.removeEventListener("scroll", spy); };
    }, [editor, spy]);

    const goTo = (it: OutlineItem) => {
        if (!editor) return;
        const el = headingEl(editor, it.pos);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    if (items.length === 0) return null;

    return (
        <div className="sticky top-0 h-0 z-20 hidden md:block">
            <nav aria-label="Gliederung" className="t2-outline absolute left-4 lg:left-7 top-5 pl-1 pr-2 py-1.5">
                <div className="t2-ol-bars flex flex-col gap-[9px]">
                    {items.map((it, i) => (
                        <i key={it.pos} className={`${it.level === 1 ? "l1" : it.level === 2 ? "l2" : "l3"}${i === active ? " on" : ""}`} />
                    ))}
                </div>
                <div className="t2-ol-card hidden absolute -left-1 -top-1.5 min-w-[250px] max-w-[320px] py-2.5 px-2 rounded-[14px] bg-t2-surface shadow-lg ring-1 ring-t2-line">
                    {items.map((it, i) => (
                        <button
                            key={it.pos}
                            type="button"
                            onClick={() => goTo(it)}
                            className={`block w-full text-left py-1.5 pr-3 rounded-lg truncate hover:bg-t2-hover ${
                                it.level === 3 ? "pl-8 text-[13px]" : it.level === 2 ? "pl-5 text-[13.5px]" : "pl-3 text-[14px] font-medium"
                            } ${i === active ? "text-t2-blue font-semibold" : "text-t2-ink-2"}`}
                        >
                            {it.text}
                        </button>
                    ))}
                </div>
            </nav>
        </div>
    );
}
