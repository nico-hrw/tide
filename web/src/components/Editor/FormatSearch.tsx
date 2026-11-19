'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';

/**
 * Format search: type what you want to do to the text (heading, numbering, link, table …).
 * Opens with Ctrl/⌘+Shift+F. Options whose extension is not active in the note are left out.
 */

type Chain = Record<string, (arg?: unknown) => { run: () => boolean }>;

interface FormatCommand {
    id: string;
    label: string;
    keywords: string;
    /** Extension names that must be active for this command to show. */
    needs: string[];
    /** Runs on the editor; `arg` is text typed after the command (links). */
    run: (chain: Chain, arg?: string) => boolean;
    /** Needs a text argument (the typed rest of the query). */
    takesText?: boolean;
}

const COMMANDS: FormatCommand[] = [
    { id: 'p', label: 'Normaler Text', keywords: 'absatz paragraph text', needs: [], run: (c) => c.setParagraph().run() },
    { id: 'h1', label: 'Überschrift 1', keywords: 'titel heading h1', needs: [], run: (c) => c.setHeading({ level: 1 }).run() },
    { id: 'h2', label: 'Überschrift 2', keywords: 'heading h2 abschnitt', needs: [], run: (c) => c.setHeading({ level: 2 }).run() },
    { id: 'h3', label: 'Überschrift 3', keywords: 'heading h3 unterabschnitt', needs: [], run: (c) => c.setHeading({ level: 3 }).run() },
    { id: 'ol', label: 'Absatznummerierung (1. 2. 3.)', keywords: 'nummer liste ordered numbering', needs: ['orderedList'], run: (c) => c.toggleOrderedList().run() },
    { id: 'ul', label: 'Aufzählung', keywords: 'punkt liste bullet', needs: ['bulletList'], run: (c) => c.toggleBulletList().run() },
    { id: 'task', label: 'Aufgabenliste', keywords: 'todo checkbox check', needs: ['taskList'], run: (c) => c.toggleTaskList().run() },
    { id: 'quote', label: 'Zitat', keywords: 'blockquote zitat', needs: ['blockquote'], run: (c) => c.toggleBlockquote().run() },
    { id: 'code', label: 'Codeblock', keywords: 'code quelltext', needs: ['codeBlock'], run: (c) => c.toggleCodeBlock().run() },
    { id: 'hr', label: 'Trennlinie', keywords: 'linie hr trenner', needs: ['horizontalRule'], run: (c) => c.setHorizontalRule().run() },
    { id: 'pb', label: 'Seitenumbruch', keywords: 'seite page break umbruch', needs: ['pageBreak'], run: (c) => c.insertContent({ type: 'pageBreak' }).run() },
    { id: 'table', label: 'Tabelle 3 × 3', keywords: 'tabelle table raster', needs: ['table'], run: (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { id: 'link', label: 'Link einfügen', keywords: 'link url verweis adresse', needs: ['link'], takesText: true, run: (c, arg) => {
        const raw = (arg ?? '').trim();
        if (!raw) return false;
        const href = /^(https?:|mailto:)/i.test(raw) ? raw : `https://${raw}`;
        return c.setLink({ href }).run();
    } },
    { id: 'bold', label: 'Fett', keywords: 'bold fett', needs: ['bold'], run: (c) => c.toggleBold().run() },
    { id: 'italic', label: 'Kursiv', keywords: 'italic kursiv', needs: ['italic'], run: (c) => c.toggleItalic().run() },
    { id: 'strike', label: 'Durchgestrichen', keywords: 'strike durchstreichen', needs: ['strike'], run: (c) => c.toggleStrike().run() },
    { id: 'underline', label: 'Unterstrichen', keywords: 'underline unterstrichen', needs: ['underline'], run: (c) => c.toggleUnderline().run() },
    { id: 'highlight', label: 'Hervorheben', keywords: 'markieren highlight farbe', needs: ['highlight'], run: (c) => c.toggleHighlight().run() },
    { id: 'code-inline', label: 'Code (im Text)', keywords: 'monospace code', needs: ['code'], run: (c) => c.toggleCode().run() },
    { id: 'sup', label: 'Hochgestellt', keywords: 'superscript hoch exponent', needs: ['superscript'], run: (c) => c.toggleSuperscript().run() },
    { id: 'sub', label: 'Tiefgestellt', keywords: 'subscript tief index', needs: ['subscript'], run: (c) => c.toggleSubscript().run() },
    { id: 'clear', label: 'Formatierung entfernen', keywords: 'clear reset plain', needs: [], run: (c) => c.unsetAllMarks().run() },
];

const TEXT_ID = 'link';

export function FormatSearch({ editor }: { editor: Editor | null }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    // Ctrl/⌘+Shift+F opens the search; the editor keeps its selection for the command.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                setQuery('');
                setActive(0);
                setOpen(true);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    useEffect(() => {
        if (open) requestAnimationFrame(() => inputRef.current?.focus());
    }, [open]);

    const names = useMemo(() => new Set(editor?.extensionManager.extensions.map((e) => e.name) ?? []), [editor]);

    const available = useMemo(() => COMMANDS.filter((c) => c.needs.every((n) => names.has(n))), [names]);

    const q = query.trim().toLowerCase();
    // What is typed after a command name becomes its argument (e.g. "link beispiel.de").
    const linkMatch = /^(link|verweis)\s+/i.test(query.trim());
    const items: { cmd: FormatCommand; arg?: string }[] = (() => {
        if (linkMatch) {
            const cmd = available.find((c) => c.id === TEXT_ID);
            return cmd ? [{ cmd, arg: query.trim().replace(/^\S+\s+/, '') }] : [];
        }
        return available
            .filter((c) => !q || `${c.label} ${c.keywords}`.toLowerCase().includes(q))
            .map((cmd) => ({ cmd }));
    })();

    const close = () => {
        setOpen(false);
        editor?.commands.focus();
    };

    const run = (index: number) => {
        const item = items[index];
        if (!item || !editor) return;
        const chain = editor.chain().focus() as unknown as Chain;
        const ok = item.cmd.run(chain, item.arg);
        if (ok) close();
    };

    if (!open || !editor) return null;

    return (
        <div className="fixed inset-0 z-[700] flex items-start justify-center pt-[16vh]" onMouseDown={close}>
            <div
                role="dialog"
                aria-label="Formatierung suchen"
                className="w-[min(92vw,380px)] rounded-[14px] bg-t2-surface text-t2-ink shadow-[0_0_0_1px_var(--t2-line),0_14px_36px_rgba(0,0,0,0.14)] p-2"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <input
                    ref={inputRef}
                    autoFocus
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') { e.preventDefault(); close(); }
                        else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, items.length - 1)); }
                        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
                        else if (e.key === 'Enter') { e.preventDefault(); run(active); }
                    }}
                    placeholder="Formatieren … z. B. Nummerierung, Link, Tabelle"
                    className="w-full bg-transparent px-2.5 py-2 text-[14px] outline-none placeholder:text-t2-ink-3"
                />
                <div className="mt-1 max-h-[300px] overflow-y-auto">
                    {items.length === 0 && (
                        <div className="px-2.5 py-2 text-[13px] text-t2-ink-3">Nichts gefunden.</div>
                    )}
                    {items.map((item, i) => (
                        <button
                            key={item.cmd.id}
                            type="button"
                            onMouseEnter={() => setActive(i)}
                            onClick={() => run(i)}
                            className={`w-full flex items-center justify-between rounded-[9px] px-2.5 py-1.5 text-left text-[13.5px] ${i === active ? 'bg-t2-hover text-t2-ink' : 'text-t2-ink-2'}`}
                        >
                            <span>{item.cmd.label}{item.arg !== undefined && item.arg !== '' ? `: ${item.arg}` : ''}</span>
                            {item.cmd.takesText && <span className="text-[11px] text-t2-ink-3">Text danach</span>}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default FormatSearch;
