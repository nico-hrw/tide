import type { Tab } from '@/components/Layout/TabList';

export interface DecryptedFile {
    id: string;
    title: string;
    type: string;
    visibility: string;
    parent_id?: string | null;
    color?: string;
    owner_email?: string;
    owner_id?: string;
    effect?: string;
    isGroup?: boolean;
    share_status?: string;
    permission?: string;
    can_reshare?: boolean;
    metadata?: any;
}

export type ContextMenuEvent = React.MouseEvent | {
    clientX: number;
    clientY: number;
    preventDefault?: () => void;
    stopPropagation?: () => void;
};

export interface DropIndicator {
    id: string;
    zone: 'top' | 'middle' | 'bottom';
}

export interface ChatUser {
    id: string;
    public_key: string;
    username?: string;
    email?: string;
}

export interface UserProfile {
    id?: string;
    user_id?: string;
    username: string;
    email: string;
    bio?: string;
    title?: string;
    avatar_seed?: string;
    avatar_salt?: string;
}

export interface SidebarProps {
    files: DecryptedFile[];
    onFileSelect: (fileId: string, title: string) => void;
    onNewNote: (parentId?: string | null) => void;
    onDeleteNote: (e: React.MouseEvent, id: string) => void;
    onRenameNote: (e: React.MouseEvent, id: string, currentTitle: string) => void;
    onToggleVisibility: (e: React.MouseEvent, id: string, currentVisibility: string) => void;
    onShare: (e: React.MouseEvent, id: string) => void;
    onOpenMessages: () => void;
    editingFileId?: string | null;
    onRenameSubmit?: (id: string, newTitle: string) => void;
    onCreateFolder?: (parentId: string | null, color?: string) => void;
    onMoveItem?: (id: string, newParentId: string | null) => void;
    selectedDate?: Date;
    onDateSelect?: (date: Date) => void;
    hiddenThemeIds?: string[];
    onToggleThemeVisibility?: (themeId: string) => void;
    onChatSelect?: (partnerId: string, partnerName: string, partnerEmail: string) => void;
    eventGroups?: DecryptedFile[];
    onCreateEventGroup?: () => void;
    onUpdateEventGroup?: (id: string, updates: any) => void;
    enabledExtensions?: string[];
    onOpenSettings?: () => void;
    userProfile?: UserProfile;
    openTabs?: Tab[];
    activeTabId?: string;
    onTabSelect?: (id: string, type: Tab['type']) => void;
    onTabClose?: (e: React.MouseEvent, id: string) => void;
    onTabsReorder?: (newTabs: Tab[]) => void;
    onOpenCalendar?: () => void;
    onOpenSocial?: () => void;
    onOpenFinance?: () => void;
    onOpenExams?: () => void;
    onNewCanvasNote?: () => void;
    onOpenTodos?: () => void;
    isTodosActive?: boolean;
    onToggleTodos?: () => void;
}
