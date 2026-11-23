"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Editor, JSONContent } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Tab } from "@/components/Layout/TabList";
import { getTranslation } from "@/lib/i18n";
import { canReuseTabCache } from "@/lib/tabStorage";
import { clearNotePreviews } from "@/lib/notePreview";
import { clearAllSessionData } from "@/lib/api";
import { useDataStore, type NavigationMode } from "@/store/useDataStore";

export interface WorkspaceFileItem {
    id: string;
    title: string;
    type?: string;
    parent_id?: string | null;
}

export interface MagicLinkTarget {
    id: string;
    type: string;
    title?: string;
    rect?: DOMRect;
    start?: string;
}

export type SwitchTabFn = (
    newId: string,
    type: string,
    forcedTitle?: string,
    fallbackData?: unknown,
    currentOverride?: unknown
) => Promise<void>;

export interface UseWorkspaceTabsOptions {
    openTabs: Tab[];
    setOpenTabs: React.Dispatch<React.SetStateAction<Tab[]>>;
    activeTabId: string;
    setActiveTabId: React.Dispatch<React.SetStateAction<string>>;
    activeNoteId: string | null;
    files: readonly WorkspaceFileItem[];
    navigationMode?: NavigationMode;
    router: { push: (href: string) => void };
    setCalendarDate: React.Dispatch<React.SetStateAction<Date>>;
    setActiveEventId: React.Dispatch<React.SetStateAction<string | null>>;
    setShowBackups: React.Dispatch<React.SetStateAction<boolean>>;
    editorInstance: Editor | null;
    editorContent: unknown;
    setEditorContent: (content: unknown) => void;
    canvasNoteData: unknown;
    setCanvasNoteData: (data: unknown) => void;
    fileName: string;
    setFileName: React.Dispatch<React.SetStateAction<string>>;
    activeFileKey: CryptoKey | null;
    setActiveFileKey: (key: CryptoKey | null) => void;
    saveStatus: "saved" | "unsaved" | "saving";
    setSaveStatus: React.Dispatch<React.SetStateAction<"saved" | "unsaved" | "saving">>;
    setActiveCollaborators: (users: unknown[]) => void;
    initialContentRef: React.MutableRefObject<unknown>;
    userHasTypedRef: React.MutableRefObject<boolean>;
    switchTabRef?: React.MutableRefObject<((newId: string, type: string, forcedTitle?: string, fallbackData?: unknown, currentOverride?: unknown) => Promise<void> | void) | null>;
    triggerSave: (noteId: string, fileKey?: CryptoKey | null, content?: unknown) => Promise<void> | void;
    loadNoteContent: (fileId: string, titleFn: string, passedFile?: unknown) => Promise<void> | void;
    handleEditorChange: (json: unknown, yjsUpdateBase64?: string) => void;
}

const MD_REPLACEMENTS: ReadonlyArray<[RegExp, string]> = [
    [/<h1>(.*?)<\/h1>/gi, "# $1\n\n"], [/<h2>(.*?)<\/h2>/gi, "## $1\n\n"], [/<h3>(.*?)<\/h3>/gi, "### $1\n\n"],
    [/<p>(.*?)<\/p>/gi, "$1\n\n"], [/<strong>(.*?)<\/strong>/gi, "**$1**"], [/<em>(.*?)<\/em>/gi, "*$1*"],
    [/<li>(.*?)<\/li>/gi, "- $1\n"], [/<ul>(.*?)<\/ul>/gi, "$1\n"], [/<ol>(.*?)<\/ol>/gi, "$1\n"],
    [/<br\s*\/?>/gi, "\n"], [/<[^>]+>/g, ""], [/&nbsp;/g, " "], [/&lt;/g, "<"], [/&gt;/g, ">"], [/&amp;/g, "&"],
];

function htmlToBasicMarkdown(html: string): string {
    return MD_REPLACEMENTS.reduce((acc, [pattern, repl]) => acc.replace(pattern, repl), html).trim();
}

export function useWorkspaceTabs({
    openTabs, setOpenTabs, activeTabId, setActiveTabId, activeNoteId, files,
    navigationMode, router, setCalendarDate, setActiveEventId, setShowBackups,
    editorInstance, editorContent, setEditorContent, canvasNoteData, setCanvasNoteData,
    fileName, setFileName, activeFileKey, setActiveFileKey, saveStatus, setSaveStatus,
    setActiveCollaborators, initialContentRef, userHasTypedRef, switchTabRef,
    triggerSave, loadNoteContent, handleEditorChange,
}: UseWorkspaceTabsOptions) {

    const lastActiveTabRef = useRef<{ id: string; type: Tab["type"]; title?: string }>({
        id: "calendar",
        type: "calendar",
        title: "Calendar",
    });

    useEffect(() => {
        if (activeTabId && activeTabId !== "todos") {
            const currentTab = openTabs.find((t) => t.id === activeTabId);
            lastActiveTabRef.current = {
                id: activeTabId,
                type: (currentTab?.type || (activeTabId === "calendar" ? "calendar" : "file")) as Tab["type"],
                title: currentTab?.title,
            };
        }
    }, [activeTabId, openTabs]);

    useEffect(() => {
        const handleExternalNoteUpdated = (event: Event) => {
            const fileId = (event as CustomEvent<{ fileId?: string }>).detail?.fileId;
            if (!fileId) return;
            setOpenTabs((prev) =>
                prev.some((t) => t.id === fileId)
                    ? prev.map((t) => (t.id === fileId ? { ...t, content: undefined } : t))
                    : prev
            );
        };
        window.addEventListener("tide:external_note_updated", handleExternalNoteUpdated);
        return () => window.removeEventListener("tide:external_note_updated", handleExternalNoteUpdated);
    }, [setOpenTabs]);

    const switchTab: SwitchTabFn = async (
        newId, type, forcedTitle, fallbackData, currentOverride
    ) => {
        if (switchTabRef) switchTabRef.current = switchTab;
        if (!newId) {
            newId = "calendar";
            type = "calendar";
            forcedTitle = undefined;
        }
        const currentContentToUse = currentOverride || editorContent || canvasNoteData;
        const currentTabId = useDataStore.getState().activeNoteId || activeTabId;

        const isOldAFile =
            currentTabId !== "calendar" &&
            currentTabId !== "todos" &&
            currentTabId !== "messages" &&
            !currentTabId.startsWith("chat-");

        if (isOldAFile && (saveStatus === "unsaved" || currentOverride) && currentContentToUse) {
            console.log(`[Lifecycle] Tab switch: Forcing final save of ${currentTabId}`);
            triggerSave(currentTabId, activeFileKey, currentContentToUse);
        }

        setOpenTabs((prev) => {
            let nextTabs = [...prev];
            if (isOldAFile) {
                nextTabs = nextTabs.map((t) =>
                    t.id === activeTabId
                        ? { ...t, content: currentContentToUse, _fileKey: activeFileKey, _saveStatus: "saved" }
                        : t
                );
            }
            const existingTab = nextTabs.find((t) => t.id === newId);
            const defaultNoteTitle = getTranslation(useDataStore.getState().language || "de", "common", "newNote");

            if (existingTab) {
                if (forcedTitle && forcedTitle !== existingTab.title) {
                    return nextTabs.map((t) => (t.id === newId ? { ...t, title: forcedTitle } : t));
                }
                return nextTabs;
            }
            const newTab: Tab = {
                id: newId,
                title: forcedTitle || (type === "calendar" ? "Calendar" : type === "todos" ? "Todos" : defaultNoteTitle),
                type: type as Tab["type"],
            };
            return [...nextTabs, newTab];
        });

        setActiveTabId(newId);
        setEditorContent(null);
        setCanvasNoteData(null);
        setActiveFileKey(null);
        setSaveStatus("saved");
        setActiveCollaborators([]);

        if (type === "file") {
            useDataStore.getState().setActiveNoteId(newId);
            const existingTab = openTabs.find((t) => t.id === newId);
            const finalTitle = forcedTitle || existingTab?.title || "";
            setFileName(finalTitle);
            if (existingTab && canReuseTabCache(existingTab)) {
                setEditorContent(existingTab.content);
                initialContentRef.current = existingTab.content;
                userHasTypedRef.current = false;
                setActiveFileKey(existingTab._fileKey ?? null);
                setSaveStatus(existingTab._saveStatus || "saved");
            } else {
                userHasTypedRef.current = false;
                loadNoteContent(newId, finalTitle, fallbackData);
            }

            const defaultTitleStr = getTranslation(useDataStore.getState().language || "de", "common", "newNote");
            const isUnsetTitle =
                !finalTitle ||
                finalTitle === defaultTitleStr ||
                finalTitle === "Untitled" ||
                finalTitle === "Neue Notiz" ||
                finalTitle === "New Note";
            setTimeout(() => {
                if (isUnsetTitle) {
                    const inputEl = document.getElementById("note-title-input") as HTMLInputElement | null;
                    if (inputEl) {
                        inputEl.focus();
                        inputEl.select();
                    }
                } else {
                    const pos = useDataStore.getState().noteCaretPositions[newId];
                    if (editorInstance && !editorInstance.isDestroyed && editorInstance.commands) {
                        editorInstance.commands.focus(pos ? pos.from : "end");
                    }
                }
            }, 180);
        } else {
            useDataStore.getState().setActiveNoteId(null);
        }
    };

    if (switchTabRef) switchTabRef.current = switchTab;

    const handleNewNote = async (parentIdOverride?: string | null) => {
        try {
            const { createNote, activeParentId, toggleFolder } = useDataStore.getState();
            const parentId = parentIdOverride !== undefined ? parentIdOverride : activeParentId;
            const newFileId = await createNote("Untitled", undefined, parentId);
            if (parentId) toggleFolder(parentId, true);
            switchTab(newFileId, "file", "Untitled");
        } catch (e) {
            console.error(e);
            alert("Error creating note");
        }
    };

    const handleNewCanvasNote = async () => {
        const title = "Neue Leinwand";
        const newId = await useDataStore.getState().createCanvasNote(title);
        useDataStore.getState().fetchDirectory(null, true);
        switchTab(newId, "file", title);
    };

    const handleExportNote = useCallback(() => {
        if (!activeNoteId || !editorContent || !fileName) return;
        let contentToExport = "";
        if (typeof editorContent === "string") {
            contentToExport = editorContent;
        } else if (editorInstance) {
            contentToExport = htmlToBasicMarkdown(editorInstance.getHTML());
        }
        const blob = new Blob([contentToExport], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${fileName}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [activeNoteId, editorContent, fileName, editorInstance]);

    const handleFileSelect = async (fileId: string, title: string, fileData?: unknown) => {
        switchTab(fileId, "file", title, fileData);
    };

    const handleLogout = async () => {
        clearNotePreviews();
        await clearAllSessionData({ callServerLogout: true });
        router.push("/auth");
    };

    const handleDateSelect = (date: Date) => {
        setCalendarDate(date);
        setActiveTabId("calendar");
        if (!openTabs.find((t) => t.id === "calendar")) {
            setOpenTabs((prev) => [...prev, { id: "calendar", title: "Calendar", type: "calendar" }]);
        }
    };

    const shiftCalendarWeek = (deltaDays: number) => {
        setCalendarDate((prev) => {
            const d = new Date(prev);
            d.setDate(d.getDate() + deltaDays);
            return d;
        });
    };
    const handlePrevWeek = () => shiftCalendarWeek(-7);
    const handleNextWeek = () => shiftCalendarWeek(7);

    const handleToggleTodos = () => {
        if (activeTabId === "todos") {
            const prevTab = openTabs.find((t) => t.id === lastActiveTabRef.current.id);
            if (prevTab) {
                switchTab(prevTab.id, prevTab.type, prevTab.title);
            } else {
                const fallbackTab = openTabs.find((t) => t.id !== "todos");
                if (fallbackTab) switchTab(fallbackTab.id, fallbackTab.type, fallbackTab.title);
                else switchTab("calendar", "calendar", "Calendar");
            }
        } else {
            switchTab("todos", "todos", "Todos");
        }
    };

    const handleTabSelect = (id: string, type: Tab["type"]) => {
        if (id === "folders" || type === "folders") return void switchTab("folders", "folders", "Notizen");
        if (id === "todos" || type === "todos") return void switchTab("todos", "todos", "Todos");
        if (type === "social") return void setActiveTabId("social");
        if (type === "trash") return void setActiveTabId("trash");
        switchTab(id, type);
    };

    const handleTabClose = (e: React.MouseEvent | null, id: string) => {
        if (e) e.stopPropagation();
        const mode = navigationMode ?? useDataStore.getState().navigationMode;
        if (id === "calendar" || (mode === "folders" && id === "folders")) return;

        const currentIndex = openTabs.findIndex((t) => t.id === id);
        const filtered = openTabs.filter((t) => t.id !== id);
        setOpenTabs(filtered);

        if (activeTabId === id) {
            let nextTab: Tab | undefined;
            if (filtered.length > 0) {
                const targetIdx = Math.min(Math.max(0, currentIndex - 1), filtered.length - 1);
                nextTab = filtered[targetIdx] || filtered[filtered.length - 1];
            }
            const targetId = nextTab ? nextTab.id : "calendar";
            const targetType = nextTab ? nextTab.type : "calendar";
            switchTab(targetId, targetType, nextTab?.title);
        }
    };

    const handleMagicLinkClick = async (target: MagicLinkTarget) => {
        const targetIsEvent =
            target.type === "event" || useDataStore.getState().events?.some((e) => e.id === target.id);
        if (targetIsEvent) {
            window.dispatchEvent(new CustomEvent("tide:select-event", { detail: { id: target.id } }));
            return;
        }

        if (target.id && target.id.startsWith("ghost-")) {
            const ghostId = target.id;
            const title = target.title || target.id.replace("ghost-", "");
            const newId = await useDataStore.getState().createNote(title);

            if (activeNoteId && editorInstance) {
                const { tr } = editorInstance.state;
                let ghostOccurrences = 0;
                editorInstance.state.doc.descendants((node: ProseMirrorNode, pos: number) => {
                    if (node.type.name === "mention" && node.attrs.id === ghostId) {
                        tr.setNodeMarkup(pos, null, { ...node.attrs, id: newId, isGhost: false });
                        ghostOccurrences++;
                    }
                });

                if (ghostOccurrences > 0) {
                    editorInstance.view.dispatch(tr);
                    const freshJson = editorInstance.getJSON();
                    handleEditorChange(freshJson);
                    switchTab(newId, "file", title, null, freshJson);
                } else {
                    switchTab(newId, "file", title);
                }
            } else {
                switchTab(newId, "file", title);
            }
            useDataStore.getState().setActiveNoteId(newId);
        } else if (target.type === "event") {
            window.dispatchEvent(new CustomEvent("tide:select-event", { detail: { id: target.id } }));
        } else if (target.type === "task") {
            const linkedEvent = useDataStore.getState().events.find((e) => e.linkedTaskId === target.id);
            if (linkedEvent) {
                switchTab("calendar", "calendar");
                setCalendarDate(new Date(linkedEvent.start as string | number | Date));
                setActiveEventId(linkedEvent.id);
            }
        } else if (target.type === "file" || target.type === "note") {
            const targetFile = files.find((f) => f.id === target.id);
            const title = target.title || targetFile?.title || "Untitled";
            switchTab(target.id, "file", title);
            useDataStore.getState().setActiveNoteId(target.id);
        } else if (target.type === "folder") {
            const store = useDataStore.getState();
            const seen = new Set<string>();
            let cur: string | null = target.id;
            while (cur && !seen.has(cur)) {
                seen.add(cur);
                store.toggleFolder(cur, true);
                cur = (store.notes.find((f) => f.id === cur)?.parent_id as string | null | undefined) ?? null;
            }
            window.setTimeout(() => {
                const el = document.querySelector<HTMLElement>(`[data-folder-id="${target.id}"]`);
                if (!el) return;
                el.scrollIntoView({ block: "center", behavior: "smooth" });
                el.setAttribute("data-revealed", "true");
                window.setTimeout(() => el.removeAttribute("data-revealed"), 1600);
            }, 150);
        } else if (target.type === "chat") {
            switchTab(target.id, "chat", target.title);
        } else {
            switchTab(target.id, target.type);
        }
    };

    const handleOpenMessages = () => {
        if (activeTabId === "messages") {
            const possibleLast = openTabs.length > 0 ? openTabs[openTabs.length - 1] : null;
            if (possibleLast) switchTab(possibleLast.id, possibleLast.type, possibleLast.title);
            else switchTab("calendar", "calendar");
        } else {
            switchTab("messages", "messages");
        }
    };

    const handleChatSelect = (partnerId: string, partnerName: string, partnerEmail: string) => {
        const existingTab = openTabs.find((t) => t.id === `chat-${partnerId}`);
        if (existingTab) {
            setActiveTabId(existingTab.id);
            return;
        }
        const newTab: Tab = {
            id: `chat-${partnerId}`,
            title: partnerName || partnerEmail || "Chat",
            type: "chat",
            content: { id: partnerId, username: partnerName, email: partnerEmail },
        };
        setOpenTabs([...openTabs, newTab]);
        setActiveTabId(newTab.id);
    };

    const handleRestoreBackup = (content: JSONContent | Record<string, unknown> | null) => {
        if (!content) return;
        window.dispatchEvent(new CustomEvent("editor:restore-content", { detail: content }));
        setEditorContent(content);
        initialContentRef.current = content;
        userHasTypedRef.current = true;
        setShowBackups(false);
    };

    return {
        handleNewNote, handleNewCanvasNote, handleExportNote, switchTab, handleFileSelect,
        handleLogout, handleDateSelect, handlePrevWeek, handleNextWeek, handleToggleTodos,
        handleTabSelect, handleTabClose, handleMagicLinkClick, handleOpenMessages,
        handleChatSelect, handleRestoreBackup,
    };
}
