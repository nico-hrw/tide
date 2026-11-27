import { describe, expect, it } from 'vitest';
import { extensionOf, formatBytes, formatLabel, previewKindOf, previewMimeOf } from '../fileKinds';

describe('previewKindOf', () => {
    it('previews the common formats', () => {
        expect(previewKindOf('Skript.pdf')).toBe('pdf');
        expect(previewKindOf('foto.JPG')).toBe('image');
        expect(previewKindOf('bild.png')).toBe('image');
        expect(previewKindOf('notiz.md')).toBe('text');
        expect(previewKindOf('seite.html')).toBe('html');
    });

    it('shows a card (no preview) for everything else, including office and GoodNotes files', () => {
        expect(previewKindOf('Vortrag.pptx')).toBe('none');
        expect(previewKindOf('Arbeit.docx')).toBe('none');
        expect(previewKindOf('Mitschrift.goodnotes')).toBe('none');
        expect(previewKindOf('archiv.zip')).toBe('none');
        expect(previewKindOf('grafik.svg')).toBe('none');
    });

    it('handles names without extension and dotfiles', () => {
        expect(previewKindOf('README')).toBe('none');
        expect(previewKindOf('.hidden')).toBe('none');
        expect(extensionOf('.hidden')).toBe('');
    });
});

describe('previewMimeOf', () => {
    it('gives the preview type, never the name-derived one for unknown files', () => {
        expect(previewMimeOf('a.pdf')).toBe('application/pdf');
        expect(previewMimeOf('a.html')).toBe('text/html');
        expect(previewMimeOf('a.pptx')).toBe('application/octet-stream');
    });
});

describe('formatting', () => {
    it('formats sizes and labels', () => {
        expect(formatBytes(512)).toBe('512 B');
        expect(formatBytes(2048)).toBe('2.0 KB');
        expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
        expect(formatBytes(-1)).toBe('');
        expect(formatLabel('Vortrag.pptx')).toBe('PPTX');
        expect(formatLabel('ohne')).toBe('');
    });
});
