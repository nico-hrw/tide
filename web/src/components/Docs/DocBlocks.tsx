import type { ReactNode } from 'react';
import { NOTE_LABEL } from '@/lib/apiDocs/types';
import type { DocBlock, DocSection, NoteTone } from '@/lib/apiDocs/types';
import CopyButton from './CopyButton';

/** Inline syntax: `code` and **bold**. */
function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) => {
    if (part.startsWith('`')) {
      return <code key={i} className="rounded-md bg-t2-sub px-1.5 py-0.5 font-mono text-[0.86em] text-t2-ink">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('**')) return <strong key={i} className="font-semibold text-t2-ink">{part.slice(2, -2)}</strong>;
    return part;
  });
}

const TONE_STYLE: Record<NoteTone, string> = {
  info: 'border-t2-line bg-t2-sub text-t2-ink-2',
  warn: 'border-t2-late text-t2-ink-2',
  unverified: 'border-dashed border-t2-line bg-t2-sub text-t2-ink-2',
};

function Block({ b }: { b: DocBlock }) {
  switch (b.kind) {
    case 'p':
      return <p className="text-[15px] leading-7 text-t2-ink-2">{inline(b.text)}</p>;
    case 'h3':
      return <h3 className="pt-3 text-base font-semibold text-t2-ink">{b.text}</h3>;
    case 'list':
      return (
        <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-7 text-t2-ink-2 marker:text-t2-ink-3">
          {b.items.map((it, i) => <li key={i}>{inline(it)}</li>)}
        </ul>
      );
    case 'note':
      return (
        <div role="note" className={`rounded-xl border px-4 py-3 text-sm leading-6 ${TONE_STYLE[b.tone]}`}>
          <span className={`mr-1.5 font-semibold ${b.tone === 'warn' ? 'text-t2-late' : 'text-t2-ink'}`}>{NOTE_LABEL[b.tone]}:</span>
          {inline(b.text)}
        </div>
      );
    case 'table':
      return (
        <div className="overflow-x-auto rounded-xl border border-t2-line">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead className="bg-t2-sub text-xs uppercase tracking-wide text-t2-ink-3">
              <tr>{b.head.map((h, i) => <th key={i} scope="col" className="px-3 py-2 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri} className="border-t border-t2-line-soft align-top">
                  {r.map((c, ci) => <td key={ci} className="px-3 py-2 leading-6 text-t2-ink-2">{inline(c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'code':
      return (
        <figure className="overflow-hidden rounded-xl border border-t2-line bg-t2-sub">
          <figcaption className="flex items-center justify-between gap-3 border-b border-t2-line px-3 py-1.5">
            <span className="truncate text-xs font-medium text-t2-ink-3">{b.label ?? b.lang}</span>
            <CopyButton text={b.code} />
          </figcaption>
          <pre className="overflow-x-auto px-4 py-3 font-mono text-[12.5px] leading-6 text-t2-ink"><code>{b.code}</code></pre>
        </figure>
      );
    case 'endpoint':
      return (
        <div className="pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md border border-t2-line px-2 py-0.5 font-mono text-xs font-semibold ${b.method === 'DELETE' ? 'text-t2-late' : 'bg-t2-accent text-t2-accent-ink'}`}>{b.method}</span>
            <code className="break-all font-mono text-sm font-semibold text-t2-ink">{b.path}</code>
          </div>
          <p className="mt-1.5 text-[15px] leading-7 text-t2-ink-2">{b.summary} <span className="text-t2-ink-3">Recht:</span> {inline(b.scope)}</p>
        </div>
      );
  }
}

export default function DocSectionView({ section, index }: { section: DocSection; index: number }) {
  return (
    <section id={section.id} aria-labelledby={`${section.id}-h`} className="scroll-mt-28 space-y-4 border-t border-t2-line pt-8 first:border-t-0 first:pt-0">
      <h2 id={`${section.id}-h`} className="text-xl font-semibold tracking-tight text-t2-ink">
        <span className="mr-2 text-t2-ink-3">{index + 1}.</span>{section.title}
      </h2>
      {section.blocks.map((b, i) => <Block key={i} b={b} />)}
    </section>
  );
}
