import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    exportNoteAsPdf,
    exportNoteAsMarkdown,
    exportNoteAsDocx,
    importFileToNote,
    tipTapToHtml,
    sanitizeFilename
} from '../fileSupport';

describe('fileSupport', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('sanitizeFilename', () => {
        it('cleans illegal characters from filename', () => {
            expect(sanitizeFilename('my/test:file*name?.txt')).toBe('my_test_file_name_.txt');
            expect(sanitizeFilename('')).toBe('Note');
        });
    });

    describe('exportNoteAsPdf', () => {
        it('triggers window.print and restores title', () => {
            const printMock = vi.fn();
            const originalPrint = window.print;
            window.print = printMock;

            document.title = 'Original Title';
            exportNoteAsPdf('New Document');

            expect(document.title).toBe('New Document');
            expect(printMock).toHaveBeenCalledTimes(1);

            // trigger afterprint event
            window.dispatchEvent(new Event('afterprint'));
            expect(document.title).toBe('Original Title');

            window.print = originalPrint;
        });
    });

    describe('exportNoteAsMarkdown', () => {
        it('converts tiptap document and triggers download', () => {
            const clickMock = vi.fn();
            const originalCreateElement = document.createElement.bind(document);
            vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
                const el = originalCreateElement(tag);
                if (tag === 'a') {
                    el.click = clickMock;
                }
                return el;
            });

            const dummyDoc = {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Hello World' }]
                    }
                ]
            };

            exportNoteAsMarkdown(dummyDoc, 'My Note');
            expect(clickMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('exportNoteAsDocx', () => {
        it('generates HTML-compatible Word document and triggers download', () => {
            const clickMock = vi.fn();
            let downloadedBlob: any = null;

            const originalCreateElement = document.createElement.bind(document);
            vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
                const el = originalCreateElement(tag);
                if (tag === 'a') {
                    el.click = clickMock;
                }
                return el;
            });

            global.URL.createObjectURL = vi.fn((blob: any) => {
                downloadedBlob = blob;
                return 'blob:mock-url';
            });

            const dummyDoc = {
                type: 'doc',
                content: [
                    {
                        type: 'heading',
                        attrs: { level: 1 },
                        content: [{ type: 'text', text: 'Meeting Notes' }]
                    },
                    {
                        type: 'paragraph',
                        content: [
                            { type: 'text', text: 'Important ', marks: [{ type: 'bold' }] },
                            { type: 'text', text: 'update' }
                        ]
                    }
                ]
            };

            exportNoteAsDocx(dummyDoc, 'Meeting Notes');
            expect(clickMock).toHaveBeenCalledTimes(1);
            expect(downloadedBlob).toBeDefined();
        });
    });

    describe('tipTapToHtml', () => {
        it('renders heading, bold text, and task items properly', () => {
            const doc = {
                type: 'doc',
                content: [
                    {
                        type: 'heading',
                        attrs: { level: 2 },
                        content: [{ type: 'text', text: 'Subtitle' }]
                    },
                    {
                        type: 'taskList',
                        content: [
                            {
                                type: 'taskItem',
                                attrs: { checked: true },
                                content: [{ type: 'text', text: 'Done Task' }]
                            }
                        ]
                    }
                ]
            };

            const html = tipTapToHtml(doc, 'Main Title');
            expect(html).toContain('Main Title');
            expect(html).toContain('<h2');
            expect(html).toContain('Subtitle');
            expect(html).toContain('☑');
            expect(html).toContain('Done Task');
        });
    });

    describe('importFileToNote', () => {
        it('imports markdown file', async () => {
            const file = new File(['# Test Title\n\nSome paragraph text'], 'Test Title.md', {
                type: 'text/markdown'
            });

            const result = await importFileToNote(file);
            expect(result.title).toBe('Test Title');
            expect(result.content.type).toBe('doc');
            expect(result.plainText).toContain('Some paragraph text');
        });

        it('imports text file', async () => {
            const file = new File(['Simple plain text content'], 'Plain.txt', {
                type: 'text/plain'
            });

            const result = await importFileToNote(file);
            expect(result.title).toBe('Plain');
            expect(result.content.type).toBe('doc');
            expect(result.plainText).toBe('Simple plain text content');
        });

        it('imports docx file in HTML format', async () => {
            const htmlWord = `
                <html xmlns:w="urn:schemas-microsoft-com:office:word">
                <body>
                    <h1>Document Header</h1>
                    <p>Paragraph in Word document</p>
                </body>
                </html>
            `;
            const file = new File([htmlWord], 'WordDoc.docx', {
                type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            });

            const result = await importFileToNote(file);
            expect(result.title).toBe('WordDoc');
            expect(result.content.type).toBe('doc');
            expect(result.plainText).toContain('Document Header');
            expect(result.plainText).toContain('Paragraph in Word document');
        });

        it('imports pdf file with text stream', async () => {
            const pdfData = `%PDF-1.4\n1 0 obj\n<< /Length 40 >>\nstream\nBT\n/F1 12 Tf\n(Hello from PDF) Tj\nET\nendstream\nendobj\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 >>\nstartxref\n100\n%%EOF`;
            const file = new File([pdfData], 'Report.pdf', {
                type: 'application/pdf'
            });

            const result = await importFileToNote(file);
            expect(result.title).toBe('Report');
            expect(result.content.type).toBe('doc');
            expect(result.plainText).toContain('Hello from PDF');
        });
    });
});
