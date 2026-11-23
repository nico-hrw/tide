import { format } from "date-fns";
import type { Tab } from "@/components/Layout/TabList";
import type { CalendarViewMode } from "@/components/Calendar/types";

export type { Tab, CalendarViewMode };

export interface DecryptedFile {
    id: string;
    title: string;
    type: string;
    size?: number;
    updated_at?: string;
    secured_meta?: string;
    share_status?: string;
    visibility: string;
    parent_id?: string | null;
    owner_email?: string;
    owner_id?: string;
    color?: string;
    isGroup?: boolean;
    effect?: string;
    metadata?: Record<string, unknown> & {
        safe?: string;
        title?: string;
        color?: string;
        [key: string]: unknown;
    };
    safe?: string;
    linkedSafes?: string[];
}

export interface CalendarEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    description?: string;
    color?: string;
    secured_meta?: string; // Store for rename/update without re-fetch
    share_status?: string; // Track pending/accepted status for shared events
    parent_id?: string | null;
    effect?: string;
    allDay?: boolean;
    isAllDay?: boolean;
    is_task?: boolean;
    is_completed?: boolean;
    linkedTaskId?: string;
    recurrence_rule?: string;
    recurrence_end?: string;
    metadata?: Record<string, unknown>;
    version?: number;
}

export interface UserProfile {
    username: string;
    email: string;
    avatar_seed?: string;
    avatar_salt?: string;
    avatar_style?: string;
    bio?: string;
    title?: string;
    is_verified?: boolean;
    profile_status?: number;
    id?: string;
    user_id?: string;
}

export type DashboardStatus = "loading" | "ready";

export type SaveStatus = "saved" | "unsaved" | "saving";

export interface DeleteConfirmState {
    isOpen?: boolean;
    fileId: string;
    isShared: boolean;
    isFolder: boolean;
}

export interface DeleteErrorState {
    fileId: string;
    title: string;
    message: string;
    isCorrupt: boolean;
}

export interface NoteSecurityModalItem {
    id: string;
    title: string;
    type: "file" | "folder" | "canvas" | "note";
    metadata?: Record<string, unknown>;
}

export interface ShareModalFile {
    id: string;
    title: string;
    type?: string;
    callerPermission?: "owner" | "view" | "edit" | "share";
}

export interface SessionKeyPair {
    privateKey: CryptoKey | null;
    publicKey: CryptoKey | null;
}

/**
 * Compares two date/time strings with minute-level tolerance for timestamps
 * or calendar-day equality when either input is a YYYY-MM-DD date-only string.
 */
export const isSameTime = (d1?: string, d2?: string): boolean => {
    if (!d1 && !d2) return true;
    if (!d1 || !d2) return false;
    const isD1DateOnly = /^\d{4}-\d{2}-\d{2}$/.test(d1.trim());
    const isD2DateOnly = /^\d{4}-\d{2}-\d{2}$/.test(d2.trim());
    if (isD1DateOnly || isD2DateOnly) {
        const k1 = isD1DateOnly ? d1.trim() : format(new Date(d1), "yyyy-MM-dd");
        const k2 = isD2DateOnly ? d2.trim() : format(new Date(d2), "yyyy-MM-dd");
        return k1 === k2;
    }
    const t1 = new Date(d1).getTime();
    const t2 = new Date(d2).getTime();
    return !isNaN(t1) && !isNaN(t2) && Math.abs(t1 - t2) < 60000;
};
