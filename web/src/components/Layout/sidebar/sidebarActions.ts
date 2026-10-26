import { useDataStore } from "@/store/useDataStore";
import { importTideBundle, exportTideBundle, markdownToTipTap, tipTapToMarkdown } from "@/lib/bundleImportExport";
import type { DecryptedFile } from "./types";

export const handleImport = (onFileSelect: (fileId: string, title: string) => void, targetFolderId: string | null = null) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.tide.json,.json,.md,.txt';
        input.onchange = async (e: any) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const rawContent = event.target?.result as string;
                    if (file.name.endsWith('.json') || file.name.endsWith('.tide.json')) {
                        const parsed = JSON.parse(rawContent);
                        if (parsed && (parsed.version || Array.isArray(parsed.notes))) {
                            const res = await importTideBundle(parsed, targetFolderId);
                            await useDataStore.getState().fetchDirectory(null, true);
                            if (res.importedNoteIds.length > 0) {
                                onFileSelect(res.importedNoteIds[0], "Importiert");
                            }
                            return;
                        }
                    }

                    const title = file.name.replace(/\.(md|txt|json)$/, '');
                    const tiptapDoc = markdownToTipTap(rawContent);
                    const newId = await useDataStore.getState().createNote(title, tiptapDoc, targetFolderId);
                    await useDataStore.getState().fetchDirectory(null, true);
                    onFileSelect(newId, title);
                } catch (err: any) {
                    console.error("Import error:", err);
                    alert("Import fehlgeschlagen: " + (err?.message || "Ungültige Datei"));
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

export const handleExport = async (files: DecryptedFile[], itemId: string, format: 'bundle' | 'markdown') => {
        const targetFile = files.find(f => f.id === itemId);
        if (!targetFile) return;

        try {
            if (format === 'bundle') {
                const bundle = await exportTideBundle([itemId], true);
                const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const safeTitle = (targetFile.title || 'tide_bundle').replace(/[/\\?%*:|"<>]/g, '_');
                a.download = `${safeTitle}.tide.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } else {
                const bundle = await exportTideBundle([itemId], false);
                const noteItem = bundle.items.find(i => i.id === itemId);
                const md = tipTapToMarkdown(noteItem?.content, noteItem?.title || targetFile.title);
                const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const safeTitle = (targetFile.title || 'note').replace(/[/\\?%*:|"<>]/g, '_');
                a.download = `${safeTitle}.md`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        } catch (err: any) {
            console.error("Export error:", err);
            alert("Export fehlgeschlagen: " + (err?.message || "Fehler"));
        }
    };

export const handleCopyToMyNotes = async (
    file: DecryptedFile,
    onFileSelect: (fileId: string, title: string) => void,
    setContextMenu: (v: null) => void,
    setToastMessage: (v: string | null) => void,
) => {
        try {
            setContextMenu(null);
            let content: any = null;
            const backupKey = `tide_backup_${file.id}`;
            const localBackup = typeof window !== 'undefined' ? localStorage.getItem(backupKey) : null;
            if (localBackup) {
                try {
                    content = JSON.parse(localBackup);
                } catch (e) {
                    console.warn("Failed to parse local backup for copy", e);
                }
            }

            if (!content) {
                try {
                    const bundle = await exportTideBundle([file.id], false);
                    const item = bundle.items.find(i => i.id === file.id);
                    if (item?.content) {
                        content = item.content;
                    }
                } catch (bundleErr) {
                    console.warn("Failed to get content via bundle export", bundleErr);
                }
            }

            if (!content) {
                content = {
                    type: 'doc',
                    content: [{ type: 'paragraph', attrs: { blockId: crypto.randomUUID() }, content: [] }]
                };
            }

            const newTitle = `${file.title} (Kopie)`;
            const newId = await useDataStore.getState().createNote(newTitle, content, null);
            setToastMessage("Notiz in eigene Notizen kopiert! Du hast nun volle Rechte über diese Kopie.");
            setTimeout(() => {
                setToastMessage(null);
            }, 4000);

            if (newId) {
                onFileSelect(newId, newTitle);
            }
        } catch (err: any) {
            console.error("Failed to copy note to my notes:", err);
            alert("Kopieren fehlgeschlagen: " + (err?.message || "Unbekannter Fehler"));
        }
    };
