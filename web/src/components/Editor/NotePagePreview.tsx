"use client";

import React from 'react';

interface PMNode {
    type?: string;
    text?: string;
    attrs?: Record<string, unknown>;
    marks?: Array<{ type: string }>;
    content?: PMNode[];
}

const MAX_BLOCKS = 60;

function Inline({ n }: { n: PMNode }) {
    if (n.type === 'hardBreak') return <br />;
    let text: React.ReactNode = n.text ?? (typeof n.attrs?.label === 'string' ? n.attrs.label : '');
    for (const m of n.marks ?? []) {
        if (m.type === 'bold') text = <b>{text}</b>;
        else if (m.type === 'italic') text = <i>{text}</i>;
        else if (m.type === 'code') text = <code className="rounded bg-t2-sub px-0.5">{text}</code>;
        else if (m.type === 'strike') text = <s>{text}</s>;
    }
    return <>{text}</>;
}

function Children({ nodes }: { nodes?: PMNode[] }) {
    return <>{(nodes ?? []).map((c, i) => <Block key={i} n={c} />)}</>;
}

function Block({ n }: { n: PMNode }) {
    switch (n.type) {
        case 'text':
        case 'hardBreak':
        case 'mention':
            return <Inline n={n} />;
        case 'paragraph':
            return <p className="min-h-[1em] mb-1">{(n.content ?? []).map((c, i) => <Inline key={i} n={c} />)}</p>;
        case 'heading': {
            const level = Number(n.attrs?.level) || 1;
            const size = level === 1 ? 'text-[15px]' : level === 2 ? 'text-[13px]' : 'text-[11.5px]';
            return <p className={`${size} font-bold mt-1 mb-1 leading-tight`}>{(n.content ?? []).map((c, i) => <Inline key={i} n={c} />)}</p>;
        }
        case 'bulletList':
            return <ul className="list-disc pl-4 mb-1"><Children nodes={n.content} /></ul>;
        case 'orderedList':
            return <ol className="list-decimal pl-4 mb-1"><Children nodes={n.content} /></ol>;
        case 'taskList':
            return <ul className="pl-1 mb-1"><Children nodes={n.content} /></ul>;
        case 'listItem':
            return <li><Children nodes={n.content} /></li>;
        case 'taskItem':
            return <li className="flex gap-1"><span>{n.attrs?.checked ? '☑' : '☐'}</span><div><Children nodes={n.content} /></div></li>;
        case 'blockquote':
            return <blockquote className="border-l-2 border-t2-line pl-2 mb-1 text-t2-ink-2"><Children nodes={n.content} /></blockquote>;
        case 'codeBlock':
            return <pre className="mb-1 rounded bg-t2-sub p-1 font-mono text-[11px] whitespace-pre-wrap">{(n.content ?? []).map((c) => c.text).join('')}</pre>;
        case 'horizontalRule':
            return <hr className="my-1 border-t2-line" />;
        case 'image':
            return <div className="my-1 grid h-10 place-items-center rounded bg-t2-sub text-[11px] text-t2-ink-3">Bild</div>;
        case 'table':
            return <table className="mb-1 w-full border-collapse"><tbody><Children nodes={n.content} /></tbody></table>;
        case 'tableRow':
            return <tr><Children nodes={n.content} /></tr>;
        case 'tableCell':
        case 'tableHeader':
            return <td className="border border-t2-line px-1 align-top"><Children nodes={n.content} /></td>;
        default:
            return n.content ? <Children nodes={n.content} /> : null;
    }
}

/** A miniature of the note page (headings, lists, tables, ...) rendered from its ProseMirror JSON, fading out at the bottom. */
export default function NotePagePreview({ doc }: { doc: PMNode }) {
    const blocks = (doc.content ?? []).slice(0, MAX_BLOCKS);
    return (
        <div
            className="relative h-[190px] overflow-hidden rounded-lg border border-t2-line bg-white px-3 py-2.5 text-[11px] leading-snug text-t2-ink dark:bg-t2-bg"
            style={{ WebkitMaskImage: 'linear-gradient(#000 70%, transparent)', maskImage: 'linear-gradient(#000 70%, transparent)' }}
        >
            <Children nodes={blocks} />
        </div>
    );
}
