import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, Copy, Download, Edit3, FileText, FolderPlus, KeyRound, LogOut, Plus, Send, ShieldCheck, Trash2, Upload, Archive } from "lucide-react";
import { useDataStore } from "@/store/useDataStore";
import { usePopupTimer } from "@/hooks/usePopupTimer";
import { PopupTimerBar } from "@/components/Popup/PopupTimerBar";
import { normalizeSafe } from "@/lib/todoSafes";
import { workspaceLabel, workspaceTone } from "@/lib/workspaceColor";
import type { DecryptedFile, SidebarProps } from "./types";
import type { FileContextMenuState } from "./SidebarContextMenu";

type FileContextMenuProps = Pick<SidebarProps, 'files' | 'onNewNote' | 'onCreateFolder' | 'onShare' | 'onDeleteNote' | 'onRenameNote' | 'onMoveItem'> & {
    contextMenu: FileContextMenuState;
    setContextMenu: (v: FileContextMenuState | null) => void;
    myId: string;
    handleOpenSecuritySettings: (id: string) => void;
    handleExport: (itemId: string, format: 'bundle' | 'markdown') => void | Promise<void>;
    handleImport: (targetFolderId?: string | null) => void;
    handleCopyToMyNotes: (file: DecryptedFile) => void | Promise<void>;
};

const MENU_W = 272;
const FLYOUT_W = 224;

/** A menu row: neutral icon, one line of text. */
function Item({ icon, label, onClick, danger = false, trailing, title }: {
    icon: React.ReactNode;
    label: string;
    onClick?: (e: React.MouseEvent) => void;
    danger?: boolean;
    trailing?: React.ReactNode;
    title?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className={`flex w-full items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-t2-ink transition-colors cursor-pointer ${
                danger ? 'hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30' : 'hover:bg-t2-hover'
            }`}
        >
            <span className="shrink-0 text-t2-ink-3">{icon}</span>
            <span className="min-w-0 flex-1 truncate text-left font-medium">{label}</span>
            {trailing}
        </button>
    );
}

/** An icon-only button with a tooltip. */
function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={label}
            aria-label={label}
            className="grid h-8 flex-1 place-items-center rounded-lg text-t2-ink-3 transition-colors hover:bg-t2-hover hover:text-t2-ink cursor-pointer"
        >
            {children}
        </button>
    );
}

/**
 * Right-click menu of a note or folder in the sidebar. Closes by itself when the mouse stays away (the bar along the
 * top shows how long is left). "In Workspace verschieben" opens a flyout on hover; the flyout hangs on the row with
 * a transparent bridge, so crossing the gap does not close it.
 */
export default function FileContextMenu({
    contextMenu, setContextMenu, files, myId, onNewNote, onCreateFolder, onShare, onDeleteNote, onRenameNote, onMoveItem,
    handleOpenSecuritySettings, handleExport, handleImport, handleCopyToMyNotes,
}: FileContextMenuProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const [flyout, setFlyout] = useState(false);
    const availableSafes = useDataStore((s) => s.availableSafes);
    const setNoteSafe = useDataStore((s) => s.setNoteSafe);

    const close = useCallback(() => setContextMenu(null), [setContextMenu]);
    const { fillRef, restRef } = usePopupTimer({ refs: [rootRef], onExpire: close });

    if (typeof document === 'undefined') return null;

    const file = files.find((f) => f.id === contextMenu.id);
    const isFolder = contextMenu.type === 'folder';
    const currentMyId = myId || useDataStore.getState().myId;
    const isSharedNote = Boolean(file && file.type !== 'folder' && file.owner_id && currentMyId && file.owner_id !== currentMyId);
    const isOwner = !file?.owner_id || file.owner_id === currentMyId || file.share_status === 'owner';
    const canShare = isOwner || Boolean(file?.can_reshare);
    const isProtected = Boolean(file?.metadata?.has_custom_password || file?.metadata?.security_settings?.has_custom_password);
    const isShared = Boolean(file && file.share_status && file.share_status !== 'owner');
    const parentId = isFolder ? contextMenu.id : (file?.parent_id || null);
    const currentSafe = normalizeSafe(file?.safe || file?.metadata?.safe || 'main');
    const safes = Array.from(new Set(['main', ...availableSafes].map(normalizeSafe)));

    const left = Math.max(8, Math.min(contextMenu.x, window.innerWidth - MENU_W - 8));
    const top = Math.max(8, Math.min(contextMenu.y, window.innerHeight - 380));
    const flyoutLeft = left + MENU_W + FLYOUT_W + 16 > window.innerWidth;

    return createPortal(
        <div
            ref={rootRef}
            className="context-menu fixed z-[9999] rounded-xl border border-t2-line bg-t2-surface pt-3 pb-1 shadow-2xl animate-in fade-in zoom-in-95 duration-100"
            style={{ left, top, width: MENU_W }}
        >
            <PopupTimerBar fillRef={fillRef} restRef={restRef} />
            <div className="flex flex-col gap-0.5 px-2 py-1">
                <Item icon={<Edit3 size={15} />} label="Umbenennen" onClick={(e) => { setContextMenu(null); onRenameNote(e, contextMenu.id, ""); }} />

                <div className="my-0.5 grid grid-cols-2 gap-1">
                    <button
                        type="button"
                        onClick={() => { setContextMenu(null); onNewNote(parentId); }}
                        title="Neue Notiz"
                        className="flex items-center justify-center gap-1.5 rounded-lg border border-t2-line bg-t2-sub px-2 py-1.5 text-xs font-medium text-t2-ink transition-colors hover:bg-t2-hover cursor-pointer"
                    >
                        <Plus size={14} className="text-t2-ink-3" />
                        <span>Notiz</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => { setContextMenu(null); onCreateFolder?.(parentId); }}
                        title="Neuer Ordner"
                        className="flex items-center justify-center gap-1.5 rounded-lg border border-t2-line bg-t2-sub px-2 py-1.5 text-xs font-medium text-t2-ink transition-colors hover:bg-t2-hover cursor-pointer"
                    >
                        <FolderPlus size={14} className="text-t2-ink-3" />
                        <span>Ordner</span>
                    </button>
                </div>

                <div className="my-1 h-px bg-t2-line-soft" />

                {isSharedNote && file && (
                    <Item icon={<Copy size={15} />} label="In meine Notizen kopieren" onClick={() => handleCopyToMyNotes(file)} />
                )}
                {canShare && (
                    <Item icon={<Send size={15} />} label="Teilen" onClick={(e) => { setContextMenu(null); onShare(e, contextMenu.id); }} />
                )}
                <Item
                    icon={isProtected ? <ShieldCheck size={15} /> : <KeyRound size={15} />}
                    label={isProtected ? "PIN-Schutz verwalten" : "Schützen"}
                    onClick={() => { const id = contextMenu.id; setContextMenu(null); handleOpenSecuritySettings(id); }}
                />

                {/* Hover option: the workspaces open beside the menu */}
                <div className="relative" onMouseEnter={() => setFlyout(true)} onMouseLeave={() => setFlyout(false)}>
                    <Item
                        icon={<Archive size={15} />}
                        label="In Workspace verschieben"
                        onClick={(e) => { e.stopPropagation(); setFlyout((v) => !v); }}
                        trailing={<ChevronRight size={14} className="shrink-0 text-t2-ink-3" />}
                    />
                    {flyout && (
                        <div
                            data-popup-part
                            className={`absolute top-0 z-[10000] ${flyoutLeft ? 'right-full pr-1.5' : 'left-full pl-1.5'}`}
                            style={{ width: FLYOUT_W + 6 }}
                        >
                            <div className="rounded-xl border border-t2-line bg-t2-surface py-1 shadow-2xl animate-in fade-in zoom-in-95 duration-100">
                                <div className="mb-1 border-b border-t2-line-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-t2-ink-3">
                                    Workspace wählen
                                </div>
                                <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto px-1">
                                    {safes.map((safe) => {
                                        const isCurrent = currentSafe === safe;
                                        const tone = workspaceTone(safe);
                                        return (
                                            <button
                                                key={safe}
                                                type="button"
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    const id = contextMenu.id;
                                                    setContextMenu(null);
                                                    if (safe === currentSafe) return;
                                                    // A note inside a folder follows the folder's workspace, so it leaves the folder.
                                                    const parent = file?.parent_id ? files.find((f) => f.id === file.parent_id) : undefined;
                                                    if (parent) {
                                                        const parentSafe = normalizeSafe(parent.safe || parent.metadata?.safe || 'main');
                                                        if (parentSafe !== safe) onMoveItem?.(id, null);
                                                    }
                                                    await setNoteSafe(id, safe);
                                                }}
                                                className={`flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm transition-colors cursor-pointer ${
                                                    isCurrent ? 'bg-t2-sub font-medium text-t2-ink' : 'text-t2-ink hover:bg-t2-hover'
                                                }`}
                                            >
                                                <span
                                                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold"
                                                    style={{ background: tone.bg, color: tone.ink }}
                                                    aria-hidden="true"
                                                >
                                                    {workspaceLabel(safe).charAt(0).toUpperCase()}
                                                </span>
                                                <span className="min-w-0 flex-1 truncate text-left">{workspaceLabel(safe)}</span>
                                                {isCurrent && <Check size={13} className="shrink-0 text-t2-ink-3" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="my-1 h-px bg-t2-line-soft" />

                <div className="flex items-center gap-1 px-1">
                    <IconAction label="Export (.tide.json), komplettes Bundle mit internen Referenzen" onClick={() => { const id = contextMenu.id; setContextMenu(null); handleExport(id, 'bundle'); }}>
                        <Download size={16} />
                    </IconAction>
                    {!isFolder && (
                        <IconAction label="Export (.md), reines Markdown" onClick={() => { const id = contextMenu.id; setContextMenu(null); handleExport(id, 'markdown'); }}>
                            <FileText size={16} />
                        </IconAction>
                    )}
                    <IconAction label="Hier importieren" onClick={() => { setContextMenu(null); handleImport(parentId); }}>
                        <Upload size={16} />
                    </IconAction>
                </div>

                <div className="my-1 h-px bg-t2-line-soft" />

                <Item
                    danger
                    icon={isShared ? <LogOut size={15} /> : <Trash2 size={15} />}
                    label={isShared ? (isFolder ? "Ordner verlassen" : "Notiz verlassen") : (isFolder ? "Ordner löschen" : "Löschen")}
                    onClick={(e) => { setContextMenu(null); onDeleteNote(e, contextMenu.id); }}
                />
            </div>
        </div>,
        document.body,
    );
}
