'use client';

import React, { useEffect, useRef } from 'react';
import {
    FileText,
    AlignCenter,
    StretchHorizontal,
    Maximize2,
    Square,
    AlignJustify,
    Grid,
    Printer,
    FileCode,
    FileSpreadsheet,
    Upload,
    Package,
    Check,
    Sparkles,
    type LucideIcon,
} from 'lucide-react';
import { DT } from '@/lib/designTokens';
import { useDataStore } from '@/store/useDataStore';
import type { NoteLayout, PaperPattern } from '@/store/slices/types';
import { tipTapToMarkdown, exportTideBundle } from '@/lib/bundleImportExport';

export interface NoteSettingsMenuProps {
    isOpen: boolean;
    onClose: () => void;
    anchorRef?: React.RefObject<HTMLElement | null>;
    noteId?: string;
    noteTitle?: string;
    noteContent?: unknown;
    noteLayout?: NoteLayout;
    onSetNoteLayout?: (layout: NoteLayout) => void;
    paperPattern?: PaperPattern;
    onSetPaperPattern?: (pattern: PaperPattern) => void;
    showPageBreaks?: boolean;
    onTogglePageBreaks?: (show: boolean) => void;
    onExportPdf?: () => void;
    onExportMarkdown?: () => void;
    onExportDocx?: () => void;
    onImportFile?: (file: File) => void;
    onExportTideBundle?: () => void;
    className?: string;
    style?: React.CSSProperties;
}

/**
 * Standard PDF Export / Print helper
 */
export function exportNoteAsPdf(noteTitle?: string): void {
    if (typeof window === 'undefined') return;
    const originalTitle = document.title;
    if (noteTitle) {
        document.title = noteTitle;
    }
    window.print();
    if (noteTitle) {
        setTimeout(() => {
            document.title = originalTitle;
        }, 1000);
    }
}

/**
 * Export note content as Markdown file (.md)
 */
export function exportNoteAsMarkdown(title: string = 'Notiz', content?: unknown): void {
    if (typeof window === 'undefined') return;

    let mdText = '';
    if (typeof content === 'string') {
        mdText = content;
    } else if (content && typeof content === 'object') {
        try {
            mdText = tipTapToMarkdown(content);
        } catch {
            mdText = `# ${title}\n\n` + JSON.stringify(content, null, 2);
        }
    } else {
        mdText = `# ${title}\n\n`;
    }

    const safeTitle = (title || 'Notiz').replace(/[/\\?%*:|"<>]/g, '_');
    const blob = new Blob([mdText], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeTitle}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

const LAYOUT_OPTIONS: Array<{
    id: NoteLayout;
    label: string;
    shortLabel: string;
    icon: LucideIcon;
}> = [
    { id: 'a4', label: 'DIN A4 (Seiten-Rolle)', shortLabel: 'DIN A4', icon: FileText },
    { id: 'normal', label: 'Standard', shortLabel: 'Standard', icon: AlignCenter },
    { id: 'wide', label: 'Breit', shortLabel: 'Breit', icon: StretchHorizontal },
    { id: 'extra-wide', label: 'Vollbild', shortLabel: 'Vollbild', icon: Maximize2 },
];

const PATTERN_OPTIONS: Array<{
    id: PaperPattern;
    label: string;
    icon: LucideIcon;
}> = [
    { id: 'blanko', label: 'Blanko', icon: Square },
    { id: 'ruled', label: 'Liniert', icon: AlignJustify },
    { id: 'grid', label: 'Kariert', icon: Grid },
];

export const NoteSettingsMenu: React.FC<NoteSettingsMenuProps> = ({
    isOpen,
    onClose,
    anchorRef,
    noteId,
    noteTitle,
    noteContent,
    noteLayout: propNoteLayout,
    onSetNoteLayout,
    paperPattern: propPaperPattern,
    onSetPaperPattern,
    showPageBreaks: propShowPageBreaks,
    onTogglePageBreaks,
    onExportPdf,
    onExportMarkdown,
    onExportDocx,
    onImportFile,
    onExportTideBundle,
    className = '',
    style = {},
}) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Fallbacks from Zustand store
    const storeNoteLayout = useDataStore((s) => s.noteLayout);
    const setStoreNoteLayout = useDataStore((s) => s.setNoteLayout);
    const storePaperPattern = useDataStore((s) => s.paperPattern);
    const setStorePaperPattern = useDataStore((s) => s.setPaperPattern);
    const storeShowPageBreaks = useDataStore((s) => s.showPageBreaks);
    const setStoreShowPageBreaks = useDataStore((s) => s.setShowPageBreaks);
    const enabledExtensions = useDataStore((s) => s.enabledExtensions ?? []);
    const activeNoteId = useDataStore((s) => s.activeNoteId);

    const activeLayout: NoteLayout = propNoteLayout ?? storeNoteLayout ?? 'normal';
    const activePattern: PaperPattern = propPaperPattern ?? storePaperPattern ?? 'blanko';
    const activeShowBreaks: boolean = propShowPageBreaks ?? storeShowPageBreaks ?? false;
    const hasFileSupport = enabledExtensions.includes('file_support');

    const effectiveNoteId = noteId ?? activeNoteId;
    const effectiveTitle = noteTitle || 'Notiz';

    // Outside-click & Escape dismissal
    useEffect(() => {
        if (!isOpen) return;

        const handlePointerDown = (event: MouseEvent | TouchEvent) => {
            const target = event.target as Node;
            if (menuRef.current && !menuRef.current.contains(target)) {
                if (anchorRef?.current && anchorRef.current.contains(target)) {
                    return;
                }
                onClose();
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('touchstart', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('touchstart', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose, anchorRef]);

    if (!isOpen) return null;

    const handleSelectLayout = (layout: NoteLayout) => {
        if (onSetNoteLayout) {
            onSetNoteLayout(layout);
        } else if (typeof setStoreNoteLayout === 'function') {
            setStoreNoteLayout(layout);
        }
    };

    const handleSelectPattern = (pattern: PaperPattern) => {
        if (onSetPaperPattern) {
            onSetPaperPattern(pattern);
        } else if (typeof setStorePaperPattern === 'function') {
            setStorePaperPattern(pattern);
        }
    };

    const handleToggleGuidelines = () => {
        const nextVal = !activeShowBreaks;
        if (onTogglePageBreaks) {
            onTogglePageBreaks(nextVal);
        } else if (typeof setStoreShowPageBreaks === 'function') {
            setStoreShowPageBreaks(nextVal);
        }
    };

    const handlePdfExport = () => {
        if (onExportPdf) {
            onExportPdf();
        } else {
            exportNoteAsPdf(effectiveTitle);
        }
        onClose();
    };

    const handleMarkdownExport = () => {
        if (onExportMarkdown) {
            onExportMarkdown();
        } else {
            exportNoteAsMarkdown(effectiveTitle, noteContent);
        }
        onClose();
    };

    const handleDocxExport = () => {
        if (onExportDocx) {
            onExportDocx();
        } else {
            // Default docx notification if not implemented externally
            console.info('[NoteSettingsMenu] Word export requested for:', effectiveTitle);
        }
        onClose();
    };

    const handleTideBundleExport = async () => {
        if (onExportTideBundle) {
            onExportTideBundle();
        } else if (effectiveNoteId) {
            try {
                const bundle = await exportTideBundle([effectiveNoteId], true);
                const blob = new Blob([JSON.stringify(bundle, null, 2)], {
                    type: 'application/json;charset=utf-8',
                });
                const url = URL.createObjectURL(blob);
                const safeTitle = effectiveTitle.replace(/[/\\?%*:|"<>]/g, '_');
                const a = document.createElement('a');
                a.href = url;
                a.download = `${safeTitle}.tide.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (err) {
                console.error('[NoteSettingsMenu] Failed to export Tide bundle', err);
            }
        }
        onClose();
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (onImportFile) {
            onImportFile(file);
        } else {
            console.info('[NoteSettingsMenu] File selected for import:', file.name);
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        onClose();
    };

    return (
        <div
            ref={menuRef}
            role="menu"
            aria-label="Notiz-Einstellungen"
            style={{
                borderRadius: DT.radiusLg,
                boxShadow: DT.shadowFloat,
                ...style,
            }}
            className={`absolute right-0 top-full mt-2 z-50 w-72 sm:w-80 p-2.5 bg-white/95 dark:bg-[#18181b]/95 backdrop-blur-md border border-gray-200/80 dark:border-zinc-800 text-gray-900 dark:text-gray-100 select-none transition-all duration-150 animate-in fade-in zoom-in-95 ${className}`}
        >
            {/* Hidden file input for file import */}
            <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.docx,.md,.json,.tide.json"
                onChange={handleFileInputChange}
            />

            {/* SECTION 1: Format selection */}
            <div className="px-2 py-1 mb-1">
                <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                    Seitenformat
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                    {LAYOUT_OPTIONS.map((opt) => {
                        const Icon = opt.icon;
                        const isSelected = activeLayout === opt.id;
                        return (
                            <button
                                key={opt.id}
                                type="button"
                                onClick={() => handleSelectLayout(opt.id)}
                                className={`flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all text-left border ${
                                    isSelected
                                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 shadow-xs'
                                        : 'bg-transparent hover:bg-gray-100 dark:hover:bg-zinc-800/60 text-gray-700 dark:text-gray-300 border-transparent'
                                }`}
                                title={opt.label}
                            >
                                <Icon size={14} className={isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'} />
                                <span className="truncate flex-1">{opt.shortLabel}</span>
                                {isSelected && <Check size={12} className="text-blue-600 dark:text-blue-400 shrink-0" />}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="my-1.5 border-t border-gray-100 dark:border-zinc-800/80" />

            {/* SECTION 2: Paper Pattern */}
            <div className="px-2 py-1 mb-1">
                <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                    Papier-Muster
                </div>
                <div className="grid grid-cols-3 gap-1">
                    {PATTERN_OPTIONS.map((opt) => {
                        const Icon = opt.icon;
                        const isSelected = activePattern === opt.id;
                        return (
                            <button
                                key={opt.id}
                                type="button"
                                onClick={() => handleSelectPattern(opt.id)}
                                className={`flex flex-col items-center justify-center gap-1 py-1.5 px-2 text-xs font-medium rounded-lg transition-all border ${
                                    isSelected
                                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 shadow-xs'
                                        : 'bg-transparent hover:bg-gray-100 dark:hover:bg-zinc-800/60 text-gray-700 dark:text-gray-300 border-transparent'
                                }`}
                            >
                                <Icon size={14} className={isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'} />
                                <span>{opt.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="my-1.5 border-t border-gray-100 dark:border-zinc-800/80" />

            {/* SECTION 3: Guidelines toggle */}
            <div className="px-2 py-1 mb-1">
                <button
                    type="button"
                    onClick={handleToggleGuidelines}
                    className="w-full flex items-center justify-between gap-2 p-1.5 -mx-1 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800/60 transition-colors text-left"
                >
                    <div className="flex flex-col">
                        <span className="text-xs font-medium text-gray-800 dark:text-gray-200">
                            A4-Hilfslinien anzeigen
                        </span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                            Seitenumbrüche & Schnittmarken
                        </span>
                    </div>
                    {/* Toggle Switch */}
                    <div
                        className={`w-9 h-5 rounded-full transition-colors relative flex items-center p-0.5 ${
                            activeShowBreaks
                                ? 'bg-blue-600 dark:bg-blue-500'
                                : 'bg-gray-300 dark:bg-zinc-700'
                        }`}
                    >
                        <div
                            className={`w-4 h-4 rounded-full bg-white shadow-xs transition-transform transform ${
                                activeShowBreaks ? 'translate-x-4' : 'translate-x-0'
                            }`}
                        />
                    </div>
                </button>
            </div>

            <div className="my-1.5 border-t border-gray-100 dark:border-zinc-800/80" />

            {/* SECTION 4: Standard File Export */}
            <div className="px-1 py-1">
                <div className="px-1 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                    Exportieren
                </div>
                <button
                    type="button"
                    onClick={handlePdfExport}
                    className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800/60 transition-colors text-left cursor-pointer"
                >
                    <Printer size={15} className="text-gray-500 dark:text-gray-400 shrink-0" />
                    <span className="truncate">Als PDF exportieren / Drucken</span>
                </button>
                <button
                    type="button"
                    onClick={handleMarkdownExport}
                    className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800/60 transition-colors text-left cursor-pointer"
                >
                    <FileCode size={15} className="text-gray-500 dark:text-gray-400 shrink-0" />
                    <span className="truncate">Als Markdown (.md) exportieren</span>
                </button>
            </div>

            {/* SECTION 5: Extended File Support (active when enabledExtensions.includes('file_support')) */}
            {hasFileSupport && (
                <>
                    <div className="my-1.5 border-t border-gray-100 dark:border-zinc-800/80" />
                    <div className="px-1 py-1">
                        <div className="px-1 flex items-center justify-between mb-1">
                            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Datei-Erweiterungen
                            </span>
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                <Sparkles size={10} />
                                Plugin aktiv
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={handleDocxExport}
                            className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800/60 transition-colors text-left cursor-pointer"
                        >
                            <FileSpreadsheet size={15} className="text-blue-500 shrink-0" />
                            <span className="truncate">Als Word (.docx) exportieren</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800/60 transition-colors text-left cursor-pointer"
                        >
                            <Upload size={15} className="text-amber-500 shrink-0" />
                            <span className="truncate">Datei importieren (PDF, DOCX, MD)</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleTideBundleExport}
                            className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800/60 transition-colors text-left cursor-pointer"
                        >
                            <Package size={15} className="text-indigo-500 shrink-0" />
                            <span className="truncate">Tide-Paket (.tide.json) exportieren</span>
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default NoteSettingsMenu;
