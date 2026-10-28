import { tipTapToMarkdown, markdownToTipTap } from '@/lib/bundleImportExport';

export interface TipTapMark {
    type: string;
    attrs?: Record<string, unknown>;
}

export interface TipTapNode {
    type: string;
    text?: string;
    attrs?: Record<string, unknown>;
    marks?: TipTapMark[];
    content?: TipTapNode[];
}

export interface TipTapDoc {
    type: string;
    content?: TipTapNode[];
}

export interface ImportedNoteResult {
    title: string;
    content: TipTapDoc;
    plainText: string;
}

export function sanitizeFilename(name: string): string {
    return (name || 'Note').replace(/[/\\?%*:|"<>]/g, '_').trim();
}

export function downloadFile(content: BlobPart, filename: string, mimeType: string): void {
    if (typeof window === 'undefined') return;
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function exportNoteAsPdf(title: string): void {
    if (typeof window === 'undefined') return;
    const originalTitle = document.title;
    const cleanTitle = (title || 'Note').trim();
    if (cleanTitle) document.title = cleanTitle;

    const printStyleId = 'tide-print-styles';
    let styleEl = document.getElementById(printStyleId) as HTMLStyleElement | null;
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = printStyleId;
        styleEl.innerHTML = `@media print {
            body { background: #fff !important; color: #000 !important; }
            header, nav, aside, [role="navigation"], .no-print, button { display: none !important; }
            main, .editor-container, .ProseMirror { width: 100% !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
        }`;
        document.head.appendChild(styleEl);
    }

    const restoreTitle = () => {
        document.title = originalTitle;
        window.removeEventListener('afterprint', restoreTitle);
    };
    window.addEventListener('afterprint', restoreTitle);
    window.print();
    setTimeout(restoreTitle, 2000);
}

export function exportNoteAsMarkdown(doc: TipTapDoc | Record<string, unknown> | unknown, title: string): void {
    const cleanTitle = (title || 'Note').trim();
    const safeTitle = sanitizeFilename(cleanTitle);
    const md = tipTapToMarkdown(doc, cleanTitle);
    downloadFile(md, `${safeTitle}.md`, 'text/markdown;charset=utf-8');
}

export function tipTapToHtml(doc: TipTapDoc | Record<string, unknown> | unknown, title?: string): string {
    if (!doc) return '';
    if (typeof doc === 'string') {
        return doc.split(/\r?\n/).map(l => l.trim() ? `<p>${escapeHtml(l)}</p>` : '').filter(Boolean).join('\n');
    }

    const renderMarks = (text: string, marks?: TipTapMark[]): string => {
        let res = escapeHtml(text);
        if (!marks?.length) return res;
        for (const m of marks) {
            if (m.type === 'bold') res = `<strong>${res}</strong>`;
            else if (m.type === 'italic') res = `<em>${res}</em>`;
            else if (m.type === 'strike') res = `<s>${res}</s>`;
            else if (m.type === 'underline') res = `<u>${res}</u>`;
            else if (m.type === 'code') res = `<code>${res}</code>`;
            else if (m.type === 'highlight') res = `<mark style="background-color: #fef08a;">${res}</mark>`;
            else if (m.type === 'link') res = `<a href="${escapeHtml(String(m.attrs?.href || ''))}" style="color: #2563eb; text-decoration: underline;">${res}</a>`;
            else if (m.type === 'referenceMark') res = `<span style="color: #059669; font-weight: 500;">${res}</span>`;
        }
        return res;
    };

    const renderNode = (node: TipTapNode): string => {
        if (!node) return '';
        if (node.type === 'text') return renderMarks(node.text || '', node.marks);
        if (node.type === 'dateMention') return `<span style="background-color: #e0f2fe; color: #0284c7; padding: 2px 6px; border-radius: 4px; font-size: 0.9em;">📅 ${escapeHtml(String(node.attrs?.date || ''))}</span>`;
        if (node.type === 'calendarEventMention') return `<span style="background-color: #f3e8ff; color: #7e22ce; padding: 2px 6px; border-radius: 4px; font-size: 0.9em;">🗓️ ${escapeHtml(String(node.attrs?.title || 'Event'))}</span>`;
        if (node.type === 'taskMention') return `<span style="background-color: #dcfce7; color: #15803d; padding: 2px 6px; border-radius: 4px; font-size: 0.9em;">☑️ ${escapeHtml(String(node.attrs?.title || 'Aufgabe'))}</span>`;
        if (node.type === 'mathBlock') return `<div style="text-align: center; margin: 12pt 0; font-family: monospace; background-color: #f8fafc; padding: 8pt; border-radius: 4px;">$$ ${escapeHtml(String(node.attrs?.latex || ''))} $$</div>`;
        if (node.type === 'inlineMath') return `<span style="font-family: monospace; background-color: #f8fafc; padding: 1px 4px; border-radius: 2px;">$${escapeHtml(String(node.attrs?.latex || ''))}$</span>`;
        if (node.type === 'horizontalRule') return `<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16pt 0;" />`;
        if (node.type === 'image') return `<p><img src="${escapeHtml(String(node.attrs?.src || ''))}" alt="${escapeHtml(String(node.attrs?.alt || ''))}" style="max-width: 100%; height: auto; border-radius: 6px;" /></p>`;

        const inner = Array.isArray(node.content) ? node.content.map(renderNode).join('') : '';
        switch (node.type) {
            case 'heading': {
                const lvl = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 6);
                return `<h${lvl} style="margin-top: 14pt; margin-bottom: 6pt; color: #111827;">${inner}</h${lvl}>`;
            }
            case 'paragraph': return `<p style="margin-bottom: 8pt; line-height: 1.6;">${inner || '<br />'}</p>`;
            case 'bulletList': return `<ul style="margin-bottom: 8pt; padding-left: 20pt;">${inner}</ul>`;
            case 'orderedList': return `<ol style="margin-bottom: 8pt; padding-left: 20pt;">${inner}</ol>`;
            case 'listItem': return `<li style="margin-bottom: 4pt;">${inner}</li>`;
            case 'taskList': return `<ul style="list-style: none; padding-left: 0; margin-bottom: 8pt;">${inner}</ul>`;
            case 'taskItem': return `<li style="list-style: none; margin-bottom: 4pt;"><span style="font-size: 1.1em; margin-right: 6px;">${node.attrs?.checked ? '☑' : '☐'}</span>${inner}</li>`;
            case 'blockquote': return `<blockquote style="border-left: 3pt solid #cbd5e1; padding-left: 10pt; color: #475569; font-style: italic; margin: 10pt 0;">${inner}</blockquote>`;
            case 'codeBlock': return `<pre style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 10pt; border-radius: 6px; font-family: monospace; font-size: 10pt; overflow-x: auto;"><code>${inner}</code></pre>`;
            case 'table': return `<table style="border-collapse: collapse; width: 100%; margin: 12pt 0;"><tbody>${inner}</tbody></table>`;
            case 'tableRow': return `<tr>${inner}</tr>`;
            case 'tableHeader': return `<th style="border: 1px solid #cbd5e1; padding: 6pt 10pt; background-color: #f1f5f9; font-weight: 600; text-align: left;">${inner}</th>`;
            case 'tableCell': return `<td style="border: 1px solid #cbd5e1; padding: 6pt 10pt; text-align: left;">${inner}</td>`;
            default: return inner;
        }
    };

    const rendered = Array.isArray((doc as TipTapDoc).content) ? (doc as TipTapDoc).content!.map(renderNode).join('\n') : '';
    if (title && !rendered.includes('<h1')) {
        return `<h1 style="color: #111827; margin-bottom: 12pt;">${escapeHtml(title)}</h1>\n${rendered}`;
    }
    return rendered;
}

export function exportNoteAsDocx(doc: TipTapDoc | Record<string, unknown> | unknown, title: string): void {
    const cleanTitle = (title || 'Note').trim();
    const safeTitle = sanitizeFilename(cleanTitle);
    const htmlBody = tipTapToHtml(doc, cleanTitle);

    const docxContent = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset="utf-8"><title>${escapeHtml(cleanTitle)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
<style>
  @page Section1 { size: 8.5in 11.0in; margin: 1.0in; }
  div.Section1 { page: Section1; }
  body { font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #111827; line-height: 1.5; }
  h1 { font-size: 20pt; font-weight: bold; margin-bottom: 12pt; }
  h2 { font-size: 15pt; font-weight: bold; margin-top: 14pt; margin-bottom: 6pt; }
  h3 { font-size: 13pt; font-weight: bold; margin-top: 12pt; margin-bottom: 4pt; }
  p { margin-bottom: 8pt; }
  ul, ol { margin-left: 20pt; margin-bottom: 8pt; }
  li { margin-bottom: 4pt; }
  code, pre { font-family: 'Consolas', monospace; background-color: #f3f4f6; }
  pre { padding: 8pt; border-radius: 6px; }
  blockquote { border-left: 3pt solid #d1d5db; padding-left: 10pt; color: #4b5563; font-style: italic; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 12pt; }
  th, td { border: 1px solid #d1d5db; padding: 6pt 8pt; text-align: left; }
  th { background-color: #f9fafb; font-weight: 600; }
</style>
</head>
<body><div class="Section1">${htmlBody}</div></body></html>`;

    downloadFile('\ufeff' + docxContent, `${safeTitle}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}

function parseWordXmlToMarkdown(xml: string): string {
    if (typeof DOMParser !== 'undefined') {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xml, 'text/xml');
            const paragraphs = xmlDoc.getElementsByTagName('w:p');
            const lines: string[] = [];

            for (let i = 0; i < paragraphs.length; i++) {
                const p = paragraphs[i];
                let pText = '';
                const styleEl = p.getElementsByTagName('w:pStyle')[0];
                const styleVal = styleEl ? (styleEl.getAttribute('w:val') || styleEl.getAttribute('val') || '') : '';
                const runs = p.getElementsByTagName('w:r');
                for (let j = 0; j < runs.length; j++) {
                    const r = runs[j];
                    const isBold = r.getElementsByTagName('w:b').length > 0;
                    const isItalic = r.getElementsByTagName('w:i').length > 0;
                    const texts = r.getElementsByTagName('w:t');
                    let rText = '';
                    for (let k = 0; k < texts.length; k++) rText += texts[k].textContent || '';
                    if (isBold && isItalic) rText = `***${rText}***`;
                    else if (isBold) rText = `**${rText}**`;
                    else if (isItalic) rText = `*${rText}*`;
                    pText += rText;
                }
                pText = pText.trim();
                if (!pText) continue;
                const lowerStyle = styleVal.toLowerCase();
                if (lowerStyle.includes('heading1') || lowerStyle === '1') lines.push(`# ${pText}`);
                else if (lowerStyle.includes('heading2') || lowerStyle === '2') lines.push(`## ${pText}`);
                else if (lowerStyle.includes('heading3') || lowerStyle === '3') lines.push(`### ${pText}`);
                else if (p.getElementsByTagName('w:numPr').length > 0) lines.push(`- ${pText}`);
                else lines.push(pText);
            }
            if (lines.length > 0) return lines.join('\n\n');
        } catch { /* fallback to regex */ }
    }
    return xml.replace(/<w:p[^>]*>/g, '\n\n').replace(/<w:t[^>]*>(.*?)<\/w:t>/g, '$1').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

function extractHtmlToMarkdown(html: string): string {
    if (typeof DOMParser === 'undefined') return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const walk = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
        if (node.nodeType !== Node.ELEMENT_NODE) return '';
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'xml') return '';
        let content = '';
        for (let i = 0; i < el.childNodes.length; i++) content += walk(el.childNodes[i]);

        switch (tag) {
            case 'h1': return `\n# ${content.trim()}\n`;
            case 'h2': return `\n## ${content.trim()}\n`;
            case 'h3': return `\n### ${content.trim()}\n`;
            case 'p': return `\n${content.trim()}\n`;
            case 'li': return `\n- ${content.trim()}`;
            case 'blockquote': return `\n> ${content.trim()}\n`;
            case 'strong':
            case 'b': return `**${content}**`;
            case 'em':
            case 'i': return `*${content}*`;
            case 'code': return `\`${content}\``;
            case 'pre': return `\n\`\`\`\n${content}\n\`\`\`\n`;
            case 'br': return '\n';
            default: return content;
        }
    };
    return walk(doc.body || doc.documentElement).replace(/\n{3,}/g, '\n\n').trim();
}

export async function extractDocxContent(buffer: ArrayBuffer): Promise<string> {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let offset = 0;

    if (view.byteLength >= 4 && view.getUint32(0, true) === 0x04034b50) {
        while (offset + 30 <= bytes.length) {
            if (view.getUint32(offset, true) !== 0x04034b50) break;
            const compression = view.getUint16(offset + 8, true);
            const compressedSize = view.getUint32(offset + 18, true);
            const fileNameLen = view.getUint16(offset + 26, true);
            const extraLen = view.getUint16(offset + 28, true);
            const fileNameBytes = bytes.subarray(offset + 30, offset + 30 + fileNameLen);
            const fileName = new TextDecoder().decode(fileNameBytes);
            const dataOffset = offset + 30 + fileNameLen + extraLen;
            const dataBytes = bytes.subarray(dataOffset, dataOffset + compressedSize);

            if (fileName === 'word/document.xml') {
                let xmlText = '';
                if (compression === 0) {
                    xmlText = new TextDecoder().decode(dataBytes);
                } else if (compression === 8 && typeof DecompressionStream !== 'undefined') {
                    try {
                        const ds = new DecompressionStream('deflate-raw');
                        xmlText = await new Response(new Blob([dataBytes]).stream().pipeThrough(ds)).text();
                    } catch {
                        try {
                            const ds = new DecompressionStream('deflate');
                            xmlText = await new Response(new Blob([dataBytes]).stream().pipeThrough(ds)).text();
                        } catch { /* Decompression fallback */ }
                    }
                }
                if (xmlText) return parseWordXmlToMarkdown(xmlText);
            }
            offset = dataOffset + compressedSize;
        }
    }

    const rawText = new TextDecoder().decode(bytes);
    if (rawText.includes('<html') || rawText.includes('<body') || rawText.includes('<w:wordDocument')) {
        return extractHtmlToMarkdown(rawText);
    }
    const matches = rawText.match(/[\p{L}\p{N}\p{P}\s]{4,}/gu);
    return matches ? matches.join(' ').replace(/\s+/g, ' ').trim() : '';
}

export async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
    const bytes = new Uint8Array(buffer);
    const latin1Text = new TextDecoder('latin1').decode(bytes);
    const textPieces: string[] = [];

    const decodePdfString = (str: string): string => {
        return str
            .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\([()\\])/g, '$1');
    };

    const extractFromContentStream = (stream: string) => {
        const btBlocks = stream.match(/BT[\s\S]*?ET/g) || [stream];
        for (const block of btBlocks) {
            const tjMatches = block.matchAll(/\(([^)]*(?:\\.[^)]*)*)\)\s*Tj/g);
            for (const match of tjMatches) {
                const decoded = decodePdfString(match[1]);
                if (decoded.trim()) textPieces.push(decoded);
            }
            const arrayMatches = block.matchAll(/\[([\s\S]*?)\]\s*TJ/g);
            for (const arrMatch of arrayMatches) {
                let segment = '';
                const innerMatches = arrMatch[1].matchAll(/\(([^)]*(?:\\.[^)]*)*)\)/g);
                for (const inner of innerMatches) segment += decodePdfString(inner[1]);
                if (segment.trim()) textPieces.push(segment);
            }
        }
    };

    extractFromContentStream(latin1Text);

    if (typeof DecompressionStream !== 'undefined') {
        const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
        let match: RegExpExecArray | null;
        while ((match = streamRegex.exec(latin1Text)) !== null) {
            const startIdx = match.index + match[0].indexOf('\n') + 1;
            const endIdx = match.index + match[0].lastIndexOf('endstream');
            if (endIdx > startIdx) {
                const streamBytes = bytes.subarray(startIdx, endIdx);
                try {
                    const ds = new DecompressionStream('deflate');
                    const decompressed = await new Response(new Blob([streamBytes]).stream().pipeThrough(ds)).text();
                    extractFromContentStream(decompressed);
                } catch {
                    try {
                        const dsRaw = new DecompressionStream('deflate-raw');
                        const decompressed = await new Response(new Blob([streamBytes]).stream().pipeThrough(dsRaw)).text();
                        extractFromContentStream(decompressed);
                    } catch { /* Ignore */ }
                }
            }
        }
    }

    if (textPieces.length > 0) return textPieces.join(' ').replace(/\s+/g, ' ').trim();
    const rawMatches = latin1Text.match(/[\x20-\x7E\xA0-\xFF]{4,}/g);
    if (rawMatches) {
        const filtered = rawMatches.filter(s =>
            !s.startsWith('/Filter') && !s.startsWith('/Length') && !s.startsWith('obj') &&
            !s.startsWith('endobj') && !s.startsWith('xref') && !s.includes('Font')
        );
        if (filtered.length > 0) return filtered.join('\n');
    }
    return '';
}

export async function importFileToNote(file: File): Promise<ImportedNoteResult> {
    const rawExt = file.name.split('.').pop()?.toLowerCase() || '';
    const baseTitle = file.name.replace(/\.[^/.]+$/, '').trim() || 'Untitled Note';
    let markdown = '';
    let plainText = '';

    if (rawExt === 'md' || rawExt === 'txt') {
        const text = await file.text();
        plainText = text;
        markdown = text;
    } else if (rawExt === 'docx' || rawExt === 'doc') {
        const buffer = await file.arrayBuffer();
        markdown = await extractDocxContent(buffer);
        plainText = markdown;
    } else if (rawExt === 'pdf') {
        const buffer = await file.arrayBuffer();
        const extracted = await extractTextFromPdf(buffer);
        plainText = extracted || `[PDF Document: ${file.name}]`;
        markdown = plainText;
    } else {
        const text = await file.text();
        plainText = text;
        markdown = text;
    }

    const content = markdownToTipTap(markdown);
    return { title: baseTitle, content, plainText };
}
