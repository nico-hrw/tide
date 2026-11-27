import { useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Plus, FolderPlus, Upload, Layout } from "lucide-react";
import { usePopupTimer } from "@/hooks/usePopupTimer";
import { PopupTimerBar } from "@/components/Popup/PopupTimerBar";
import FileContextMenu from "./FileContextMenu";
import type { DecryptedFile, SidebarProps } from "./types";

export type FileContextMenuState = { x: number; y: number; id: string; type: 'file' | 'folder' };
export type SidebarContextMenuState = { x: number; y: number };

type ContextMenuProps = Pick<SidebarProps, 'files' | 'onNewNote' | 'onCreateFolder' | 'onShare' | 'onDeleteNote' | 'onRenameNote' | 'onNewCanvasNote' | 'onMoveItem'> & {
    contextMenu: FileContextMenuState | null;
    setContextMenu: (v: FileContextMenuState | null) => void;
    sidebarContextMenu: SidebarContextMenuState | null;
    setSidebarContextMenu: (v: SidebarContextMenuState | null) => void;
    myId: string;
    handleOpenSecuritySettings: (id: string) => void;
    handleExport: (itemId: string, format: 'bundle' | 'markdown') => void | Promise<void>;
    handleImport: (targetFolderId?: string | null) => void;
    handleCopyToMyNotes: (file: DecryptedFile) => void | Promise<void>;
};

/** Menu of the empty sidebar area: new note, canvas, folder, import. Closes by itself when the mouse stays away. */
function BackgroundMenu({ menu, close, onNewNote, onNewCanvasNote, onCreateFolder, handleImport }: {
    menu: SidebarContextMenuState;
    close: () => void;
} & Pick<SidebarProps, 'onNewNote' | 'onNewCanvasNote' | 'onCreateFolder'> & Pick<ContextMenuProps, 'handleImport'>) {
    const rootRef = useRef<HTMLDivElement>(null);
    const { fillRef, restRef } = usePopupTimer({ refs: [rootRef], onExpire: close });
    const row = "w-full flex items-center gap-3 whitespace-nowrap px-3 py-2 text-sm text-t2-ink hover:bg-t2-hover rounded-lg transition-colors cursor-pointer";
    return createPortal(
        <div
            ref={rootRef}
            className="context-menu fixed z-[9999] w-[272px] rounded-xl border border-t2-line bg-t2-surface pt-3 pb-1 shadow-2xl animate-in fade-in zoom-in-95 duration-100"
            style={{ left: menu.x, top: menu.y }}
        >
            <PopupTimerBar fillRef={fillRef} restRef={restRef} />
            <div className="flex flex-col gap-0.5 px-2 py-1">
                <button type="button" onClick={() => { close(); onNewNote(); }} className={row}>
                    <Plus size={16} className="text-t2-ink-3" />
                    <span className="font-medium">Neue Notiz</span>
                </button>
                {onNewCanvasNote && (
                    <button type="button" onClick={() => { close(); onNewCanvasNote(); }} className={row}>
                        <Layout size={16} className="text-t2-ink-3" />
                        <span className="font-medium">Neue Leinwand</span>
                    </button>
                )}
                <button type="button" onClick={() => { close(); onCreateFolder && onCreateFolder(null); }} className={row}>
                    <FolderPlus size={16} className="text-t2-ink-3" />
                    <span className="font-medium">Neuer Ordner</span>
                </button>
                <div className="my-1 h-px bg-t2-line-soft" />
                <button type="button" onClick={() => { close(); handleImport(); }} className={row}>
                    <Upload size={16} className="text-t2-ink-3" />
                    <span className="font-medium">Importieren (.tide.json, .md)</span>
                </button>
            </div>
        </div>,
        document.body,
    );
}

export default function SidebarContextMenu({
    files, onNewNote, onCreateFolder, onShare, onDeleteNote, onRenameNote, onNewCanvasNote, onMoveItem,
    contextMenu, setContextMenu, sidebarContextMenu, setSidebarContextMenu, myId,
    handleOpenSecuritySettings, handleExport, handleImport, handleCopyToMyNotes,
}: ContextMenuProps) {
    const closeBackground = useCallback(() => setSidebarContextMenu(null), [setSidebarContextMenu]);
    return (
        <>
            {contextMenu && typeof document !== 'undefined' && (
                <FileContextMenu
                    key={contextMenu.id + ':' + contextMenu.x + ':' + contextMenu.y}
                    contextMenu={contextMenu}
                    setContextMenu={setContextMenu}
                    files={files}
                    myId={myId}
                    onNewNote={onNewNote}
                    onCreateFolder={onCreateFolder}
                    onShare={onShare}
                    onDeleteNote={onDeleteNote}
                    onRenameNote={onRenameNote}
                    onMoveItem={onMoveItem}
                    handleOpenSecuritySettings={handleOpenSecuritySettings}
                    handleExport={handleExport}
                    handleImport={handleImport}
                    handleCopyToMyNotes={handleCopyToMyNotes}
                />
            )}
            {sidebarContextMenu && typeof document !== 'undefined' && (
                <BackgroundMenu
                    key={sidebarContextMenu.x + ':' + sidebarContextMenu.y}
                    menu={sidebarContextMenu}
                    close={closeBackground}
                    onNewNote={onNewNote}
                    onNewCanvasNote={onNewCanvasNote}
                    onCreateFolder={onCreateFolder}
                    handleImport={handleImport}
                />
            )}
        </>
    );
}
