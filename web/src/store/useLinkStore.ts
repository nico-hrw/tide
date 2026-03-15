import { create } from 'zustand';

export interface PendingLink {
    /** The Tiptap document range to delete (where '--' was typed) */
    range: { from: number; to: number };
    /** ID of the linked target (e.g. event ID) */
    targetId: string;
    /** Type of the target */
    targetType: 'file' | 'event' | 'chat' | 'tab' | 'calendar' | 'messages';
    /** Display title for the Magic Link pill */
    title: string;
    /** Tab ID to return to after insertion */
    sourceTabId: string;
}

interface LinkStoreState {
    isLinkingMode: boolean;
    /** Range + sourceTabId saved when '--' is triggered. No editor reference stored. */
    pendingRange: { from: number; to: number } | null;
    sourceTabId: string | null;
    /** Full pending link object populated when the user clicks an event in Calendar. */
    pendingLink: PendingLink | null;
    /** Source note ID for cross-linking (e.g. from -- trigger) */
    pendingLinkSource: string | null;
    setRange: (range: { from: number; to: number }, tabId: string) => void;
    setPendingLink: (link: PendingLink) => void;
    setPendingLinkSource: (id: string | null) => void;
    setIsLinkingMode: (isLinking: boolean) => void;
    clearPendingLink: () => void;
}

export const useLinkStore = create<LinkStoreState>((set) => ({
    isLinkingMode: false,
    pendingRange: null,
    sourceTabId: null,
    pendingLink: null,
    pendingLinkSource: null,
    setRange: (range, tabId) => set({ pendingRange: range, sourceTabId: tabId }),
    setPendingLink: (link) => set({ pendingLink: link }),
    setPendingLinkSource: (id) => set({ pendingLinkSource: id }),
    setIsLinkingMode: (isLinking) => set({ isLinkingMode: isLinking }),
    clearPendingLink: () => set({ pendingLink: null, pendingRange: null, sourceTabId: null, pendingLinkSource: null, isLinkingMode: false }),
}));
