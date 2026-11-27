/**
 * Which stored files can be previewed, and how. Everything else is still stored and can be downloaded; it just shows
 * a card instead of a preview. Pure functions.
 */

export type PreviewKind = 'pdf' | 'image' | 'text' | 'html' | 'none';

interface KindInfo {
    kind: PreviewKind;
    /** MIME type used for the preview blob (never taken from the file itself: sanitising happens elsewhere) */
    mime: string;
}

const BY_EXT: Record<string, KindInfo> = {
    pdf: { kind: 'pdf', mime: 'application/pdf' },
    png: { kind: 'image', mime: 'image/png' },
    jpg: { kind: 'image', mime: 'image/jpeg' },
    jpeg: { kind: 'image', mime: 'image/jpeg' },
    gif: { kind: 'image', mime: 'image/gif' },
    webp: { kind: 'image', mime: 'image/webp' },
    md: { kind: 'text', mime: 'text/plain' },
    markdown: { kind: 'text', mime: 'text/plain' },
    txt: { kind: 'text', mime: 'text/plain' },
    html: { kind: 'html', mime: 'text/html' },
    htm: { kind: 'html', mime: 'text/html' },
};

/** Lower-case extension without the dot, '' when there is none. */
export function extensionOf(name: string): string {
    const i = name.lastIndexOf('.');
    return i > 0 && i < name.length - 1 ? name.slice(i + 1).toLowerCase() : '';
}

export function previewKindOf(name: string): PreviewKind {
    return BY_EXT[extensionOf(name)]?.kind ?? 'none';
}

/** MIME type for a preview blob of this file, or the generic one when there is no preview. */
export function previewMimeOf(name: string): string {
    return BY_EXT[extensionOf(name)]?.mime ?? 'application/octet-stream';
}

/** Short label for the icon card, e.g. "PPTX", "GOODNOTES" (upper case, '' when unknown). */
export function formatLabel(name: string): string {
    return extensionOf(name).toUpperCase();
}

export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
