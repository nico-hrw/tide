export interface LinkTarget {
    id: string;
    title: string;
    type: 'file' | 'event' | 'chat' | 'tab' | 'calendar' | 'messages';
    rect?: DOMRect;
    start?: string;
}

export interface TableMenuPosition {
    x: number;
    y: number;
}

export interface EditorProps {
    initialContent: any; // JSON
    isShared?: boolean;
    editable?: boolean;
    dek?: CryptoKey | null;
    keyEpoch?: number;
    onChange?: (content: any, yjsUpdateBase64?: string) => void;
    onLinkClick?: (target: LinkTarget) => void;
    onForceSave?: (content: any) => void;
    /** Called when the user pops selected text out to the canvas layer */
    onPopOut?: (text: string, anchorBlockId: string) => void;
    /** Called by the BlockId plugin when blocks are deleted (for anchor recovery) */
    onBlocksDeleted?: (ids: string[]) => void;
    /** Called when user wants to connect an image to the selection; passes the block ID */
    onConnectImage?: (blockId: string) => void;
    onEditorReady?: (editor: any) => void;
    onBlockHover?: (id: string | null) => void;
    onAbortLinking?: () => void;
    activeTabId?: string;
    onReturnToTab?: (tabId: string) => void;
    onFileClick?: (id: string, title?: string) => void;
    onEventClick?: (id: string) => void;
    onActiveUsersChange?: (users: any[]) => void;
    userProfile?: any;
    myId?: string;
}

export interface UseTipTapConfigOptions {
    initialContent?: any;
    editable?: boolean;
    isShared?: boolean;
    activeTabId?: string;
    provider?: any;
    ydoc?: any;
    dek?: CryptoKey | null;
    keyEpoch?: number;
    userProfile?: any;
    myId?: string;
    onChange?: (content: any, yjsUpdateBase64?: string) => void;
    onForceSave?: (content: any) => void;
    onLinkClick?: (target: LinkTarget) => void;
    onFileClick?: (id: string, title?: string) => void;
    onEventClick?: (id: string) => void;
    onBlocksDeleted?: (ids: string[]) => void;
    onEditorReady?: (editor: any) => void;
    onBlockHover?: (id: string | null) => void;
    onInkStrokesChange?: (strokes: any[]) => void;
}
