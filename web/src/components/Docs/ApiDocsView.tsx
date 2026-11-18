import { FileText, Globe } from 'lucide-react';
import type { ApiDoc } from '@/lib/apiDocs/types';
import CopyButton from './CopyButton';
import DocSectionView from './DocBlocks';
import DocToc from './DocToc';

/** Public API documentation page body. Server component; only copy buttons and the TOC are client-side. */
export default function ApiDocsView({ doc }: { doc: ApiDoc }) {
  return (
    <div className="min-h-screen bg-t2-bg text-t2-ink">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
        <header className="space-y-4 pb-6 pt-8 sm:pt-12">
          <p className="text-xs font-semibold uppercase tracking-wide text-t2-ink-3">Dokumentation</p>
          <h1 className="text-3xl font-semibold tracking-tight">{doc.title}</h1>
          <p className="max-w-2xl text-[15px] leading-7 text-t2-ink-2">{doc.lead}</p>
          <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-t2-line bg-t2-sub px-3 py-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-t2-line bg-t2-surface px-2.5 py-1 text-xs font-medium text-t2-ink">
              <Globe className="h-3.5 w-3.5 text-t2-accent" aria-hidden />
              Öffentlich, ohne Login erreichbar
            </span>
            <span className="flex-1" />
            <a
              href="/docs/api.md"
              className="inline-flex items-center gap-1.5 rounded-lg border border-t2-line bg-t2-surface px-2.5 py-1 text-xs font-medium text-t2-ink-2 transition-colors hover:bg-t2-hover hover:text-t2-ink"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden />
              Als Markdown
            </a>
            <CopyButton currentUrl label="Link kopieren" copiedLabel="Link kopiert" />
          </div>
        </header>

        <div className="lg:grid lg:grid-cols-[170px_minmax(0,1fr)] lg:gap-10">
          <DocToc items={doc.sections.map((s) => ({ id: s.id, title: s.title }))} />
          <main className="min-w-0 space-y-10 pb-24 pt-6 lg:pt-0">
            {doc.sections.map((s, i) => <DocSectionView key={s.id} section={s} index={i} />)}
          </main>
        </div>
      </div>
    </div>
  );
}
