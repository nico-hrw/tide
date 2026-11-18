import { NOTE_LABEL } from './types';
import type { ApiDoc, DocBlock } from './types';

const escapeCell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function tableMd(head: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.map(escapeCell).join(' | ')} |`;
  return [line(head), line(head.map(() => '---')), ...rows.map(line)].join('\n');
}

function blockMd(b: DocBlock): string {
  switch (b.kind) {
    case 'p':
      return b.text;
    case 'h3':
      return `### ${b.text}`;
    case 'list':
      return b.items.map((i) => `- ${i}`).join('\n');
    case 'note':
      return `> **${NOTE_LABEL[b.tone]}:** ${b.text}`;
    case 'table':
      return tableMd(b.head, b.rows);
    case 'code': {
      const fence = '```';
      const label = b.label ? `**${b.label}**\n\n` : '';
      return `${label}${fence}${b.lang}\n${b.code}\n${fence}`;
    }
    case 'endpoint':
      return `#### \`${b.method} ${b.path}\`\n\nBenötigtes Recht: ${b.scope}. ${b.summary}`;
  }
}

/** Renders the documentation as plain Markdown (single source: the same tree the HTML page uses). */
export function toMarkdown(doc: ApiDoc, opts: { pageUrl?: string } = {}): string {
  const out: string[] = [`# ${doc.title}`, doc.lead];
  if (opts.pageUrl) out.push(`Diese Seite als HTML: ${opts.pageUrl}`);
  out.push('## Inhalt', doc.sections.map((s, i) => `${i + 1}. ${s.title}`).join('\n'));
  doc.sections.forEach((s, i) => {
    out.push(`## ${i + 1}. ${s.title}`);
    s.blocks.forEach((b) => out.push(blockMd(b)));
  });
  return out.join('\n\n') + '\n';
}
