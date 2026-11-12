'use client';

import React, { useEffect, useRef, useState } from 'react';
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
    Code,
    Lock,
    AlertTriangle,
    Loader2,
    type LucideIcon,
} from 'lucide-react';
import { DT } from '@/lib/designTokens';
import { apiFetch, getApiBase } from '@/lib/api';
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
    const [copiedApi, setCopiedApi] = useState(false);
    const [showUnencryptedWarning, setShowUnencryptedWarning] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [reencryptedSuccess, setReencryptedSuccess] = useState(false);

    // Fallbacks from Zustand store
    const storeNoteLayout = useDataStore((s) => s.noteLayout);
    const setStoreNoteLayout = useDataStore((s) => s.setNoteLayout);
    const storePaperPattern = useDataStore((s) => s.paperPattern);
    const setStorePaperPattern = useDataStore((s) => s.setPaperPattern);
    const storeShowPageBreaks = useDataStore((s) => s.showPageBreaks);
    const setStoreShowPageBreaks = useDataStore((s) => s.setShowPageBreaks);
    const enabledExtensions = useDataStore((s) => s.enabledExtensions ?? []);
    const activeNoteId = useDataStore((s) => s.activeNoteId);
    const notes = useDataStore((s) => s.notes);

    const activeLayout: NoteLayout = propNoteLayout ?? storeNoteLayout ?? 'normal';
    const activePattern: PaperPattern = propPaperPattern ?? storePaperPattern ?? 'blanko';
    const activeShowBreaks: boolean = propShowPageBreaks ?? storeShowPageBreaks ?? false;
    const hasFileSupport = enabledExtensions.includes('file_support');

    const effectiveNoteId = noteId ?? activeNoteId;
    const effectiveTitle = noteTitle || 'Notiz';

    const currentFile = notes.find((f) => f.id === effectiveNoteId);
    const isUnencrypted = Boolean(currentFile?.metadata?.unencrypted === true);

    useEffect(() => {
        if (!isOpen) {
            setShowUnencryptedWarning(false);
            setIsProcessing(false);
            setReencryptedSuccess(false);
        }
    }, [isOpen]);

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

    const copyApiUrlToClipboard = async () => {
        if (!effectiveNoteId) return;
        const apiUrl = `${getApiBase()}/api/v1/external/notes/${effectiveNoteId}`;
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(apiUrl);
            } else if (typeof document !== 'undefined') {
                const textArea = document.createElement('textarea');
                textArea.value = apiUrl;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
            }
            setCopiedApi(true);
            setTimeout(() => {
                setCopiedApi(false);
                onClose();
            }, 800);
        } catch (err) {
            console.error('[NoteSettingsMenu] Failed to copy API URL', err);
            onClose();
        }
    };

    const handleCopyApiUrl = async () => {
        if (!effectiveNoteId) return;
        if (!isUnencrypted) {
            setShowUnencryptedWarning(true);
            return;
        }
        await copyApiUrlToClipboard();
    };

    const isCiphertextPattern = (str: string): boolean => {
        if (!str || typeof str !== 'string') return false;
        return (
            str.startsWith('tide:v1:') ||
            str.startsWith('tide:v2:') ||
            /^tide:v[12]:/.test(str) ||
            str.includes('{"ciphertext":') ||
            str.includes('{"cipherText":') ||
            str.includes('"ciphertext"') ||
            str.includes('"cipherText"')
        );
    };

    const handleConfirmUnencryptedShare = async () => {
        if (!effectiveNoteId) return;
        if (isUnencrypted) {
            setShowUnencryptedWarning(false);
            await copyApiUrlToClipboard();
            return;
        }

        if (typeof noteContent === 'string' && isCiphertextPattern(noteContent)) {
            console.warn('[NoteSettingsMenu] Cannot share note: content is encrypted');
            if (typeof window !== 'undefined') {
                alert('Warnung: Die Notiz ist verschlüsselt und kann nicht unverschlüsselt freigegeben werden.');
            }
            setShowUnencryptedWarning(false);
            return;
        }

        setIsProcessing(true);
        try {
            const activeEditor = typeof window !== 'undefined' ? (window as any).__tideEditor : null;
            const contentToUse = (activeEditor && !activeEditor.isDestroyed)
                ? activeEditor.getJSON()
                : noteContent;

            let md = '';
            if (typeof contentToUse === 'string') {
                md = contentToUse;
            } else if (contentToUse && typeof contentToUse === 'object') {
                try {
                    md = tipTapToMarkdown(contentToUse);
                } catch {
                    md = JSON.stringify(contentToUse, null, 2);
                }
            } else {
                md = `# ${effectiveTitle}\n\n`;
            }

            if (typeof md === 'string' && isCiphertextPattern(md)) {
                console.warn('[NoteSettingsMenu] Cannot share note: converted content is encrypted');
                if (typeof window !== 'undefined') {
                    alert('Warnung: Die Notiz ist verschlüsselt und kann nicht unverschlüsselt freigegeben werden.');
                }
                setShowUnencryptedWarning(false);
                setIsProcessing(false);
                return;
            }

            // 1. Upload plaintext markdown
            await apiFetch(`/api/v1/files/${effectiveNoteId}/upload`, {
                method: 'POST',
                body: new Blob([md], { type: 'text/markdown;charset=utf-8' }),
            });

            // 2. Update file metadata
            const currentFileObj = useDataStore.getState().notes.find((f) => f.id === effectiveNoteId);
            const existingMeta = (currentFileObj?.metadata as Record<string, unknown>) || {};
            const updatedMeta = { ...existingMeta, unencrypted: true };

            await apiFetch(`/api/v1/files/${effectiveNoteId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ metadata: updatedMeta }),
            });

            // 3. Update store
            useDataStore.getState().updateFileRaw(effectiveNoteId, { metadata: updatedMeta });

            // 4. Copy URL and notify
            setShowUnencryptedWarning(false);
            await copyApiUrlToClipboard();
        } catch (err) {
            console.error('[NoteSettingsMenu] Failed to share note unencrypted', err);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReEncrypt = async () => {
        if (!effectiveNoteId) return;
        if (!isUnencrypted) {
            console.warn('[NoteSettingsMenu] Note is already encrypted, aborting re-encryption');
            return;
        }
        setIsProcessing(true);
        try {
            const cryptoV2 = await import('@/lib/cryptoV2');
            const cryptoLib = await import('@/lib/crypto');
            const state = useDataStore.getState();
            const { publicKey, myId } = state;

            if (!publicKey || !myId) {
                console.error('[NoteSettingsMenu] Missing public key or user ID for re-encryption');
                setIsProcessing(false);
                return;
            }

            const docContent =
                noteContent && typeof noteContent === 'object'
                    ? noteContent
                    : typeof noteContent === 'string'
                    ? noteContent
                    : {
                          type: 'doc',
                          content: [
                              {
                                  type: 'paragraph',
                                  attrs: { blockId: crypto.randomUUID() },
                              },
                          ],
                      };

            const contentStr = typeof docContent === 'string' ? docContent : JSON.stringify(docContent);

            if (typeof contentStr === 'string' && isCiphertextPattern(contentStr)) {
                console.error('[NoteSettingsMenu] Note content appears already encrypted, aborting re-encryption');
                if (typeof window !== 'undefined') {
                    alert('Fehler: Der Notizinhalt ist bereits verschlüsselt.');
                }
                setIsProcessing(false);
                return;
            }

            // 1. Re-encrypt note using V2 envelope encryption
            const v2Result = await cryptoV2.encryptFileV2(contentStr, publicKey);
            const accessKeysMap = { [myId]: v2Result.encrypted_dek };
            const securedMeta = await cryptoLib.encryptMetadata({ title: effectiveTitle }, publicKey);

            // 2. Upload ciphertext blob
            await apiFetch(`/api/v1/files/${effectiveNoteId}/upload`, {
                method: 'POST',
                body: v2Result.content_ciphertext,
            });

            // 3. Update metadata via PUT
            const currentFileObj = state.notes.find((f) => f.id === effectiveNoteId);
            const existingMeta = { ...((currentFileObj?.metadata as Record<string, unknown>) || {}) };
            delete existingMeta.unencrypted;
            const updatedMeta = { ...existingMeta, unencrypted: false };

            await apiFetch(`/api/v1/files/${effectiveNoteId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    metadata: updatedMeta,
                    access_keys: accessKeysMap,
                    secured_meta: securedMeta,
                }),
            });

            // 4. Update store
            state.updateFileRaw(effectiveNoteId, {
                metadata: updatedMeta,
                access_keys: accessKeysMap,
                secured_meta: securedMeta,
            });

            // 5. Show notification
            setReencryptedSuccess(true);
            setTimeout(() => {
                setReencryptedSuccess(false);
                onClose();
            }, 1000);
        } catch (err) {
            console.error('[NoteSettingsMenu] Failed to re-encrypt note', err);
        } finally {
            setIsProcessing(false);
        }
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
                <button
                    type="button"
                    onClick={handleCopyApiUrl}
                    disabled={isProcessing}
                    className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800/60 transition-colors text-left cursor-pointer"
                >
                    {copiedApi ? (
                        <>
                            <Check size={15} className="text-emerald-500 shrink-0" />
                            <span className="truncate text-emerald-600 dark:text-emerald-400 font-medium">API-Adresse kopiert!</span>
                        </>
                    ) : (
                        <>
                            <Code size={15} className="text-gray-500 dark:text-gray-400 shrink-0" />
                            <span className="truncate flex-1">API-Adresse kopieren</span>
                            {isUnencrypted && (
                                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 shrink-0">
                                    Offen
                                </span>
                            )}
                        </>
                    )}
                </button>

                {/* Inline warning / confirmation prompt */}
                {showUnencryptedWarning && (
                    <div className="mt-1.5 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/70 text-amber-900 dark:text-amber-200 text-xs flex flex-col gap-2 animate-in fade-in">
                        <div className="flex items-start gap-2">
                            <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <div className="leading-snug text-[11px]">
                                Hinweis: Für den Lese- und Schreibzugriff per API muss die Notiz unverschlüsselt auf dem Server hinterlegt werden.
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <button
                                type="button"
                                disabled={isProcessing}
                                onClick={handleConfirmUnencryptedShare}
                                className="flex-1 px-2 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-medium text-[11px] text-center transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                            >
                                {isProcessing ? (
                                    <>
                                        <Loader2 size={12} className="animate-spin" />
                                        <span>Freigeben...</span>
                                    </>
                                ) : (
                                    <span>Unverschlüsselt freigeben & kopieren</span>
                                )}
                            </button>
                            <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => setShowUnencryptedWarning(false)}
                                className="px-2 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 font-medium text-[11px] transition-colors cursor-pointer"
                            >
                                Abbrechen
                            </button>
                        </div>
                    </div>
                )}

                {/* Prominent Re-encrypt option when note is unencrypted */}
                {isUnencrypted && (
                    <button
                        type="button"
                        disabled={isProcessing}
                        onClick={handleReEncrypt}
                        className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border border-emerald-200/80 dark:border-emerald-800/60 transition-colors text-left cursor-pointer mt-1"
                    >
                        {reencryptedSuccess ? (
                            <>
                                <Check size={15} className="text-emerald-500 shrink-0" />
                                <span className="truncate text-emerald-600 dark:text-emerald-400 font-medium">Notiz wieder verschlüsselt!</span>
                            </>
                        ) : (
                            <>
                                {isProcessing ? (
                                    <Loader2 size={15} className="text-emerald-600 dark:text-emerald-400 animate-spin shrink-0" />
                                ) : (
                                    <Lock size={15} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                                )}
                                <span className="truncate font-medium">Wieder verschlüsseln</span>
                            </>
                        )}
                    </button>
                )}
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
