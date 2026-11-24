"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as cryptoLib from "@/lib/crypto";
import { apiFetch } from "@/lib/api";
import {
    clearMasterKey,
    getMasterKey,
    purgeLegacyKeys,
    storeMasterKey,
} from "@/lib/keyStorage";
import {
    CALENDAR_DATE_STORAGE_KEY,
    parseStoredCalendarDate,
} from "@/lib/calendarWeeks";
import { sanitizeRestoredTabs } from "@/lib/tabStorage";
import { clearPersistedSessions, parsePersistedSession, resolveRestoredActive, sessionStateKey } from "@/lib/sessionState";
import type { CalendarViewMode } from "@/components/Calendar/types";
import { loadEncryptedOfflineCache } from "@/lib/offlineCacheCrypto";
import { hydrateSettingsFromServer, hydrateWorkspacesFromServer } from "../../lib/settingsSync";
import { useDataStore, type DataItem, type DataStoreState, type TaskItem } from "@/store/useDataStore";
import type {
    DashboardStatus,
    SessionKeyPair,
    Tab,
    UserProfile,
} from "@/components/Dashboard/types";

interface ProfileApiResponse {
    username?: string;
    avatar_seed?: string;
    avatar_salt?: string;
    avatar_style?: string;
    bio?: string;
    title?: string;
    is_verified?: boolean;
    profile_status?: number;
}

export interface UseSessionRestoreOptions {
    setKeys?: (priv: CryptoKey, pub: CryptoKey, userId: string) => void;
    fetchDirectory?: (parentId: string | null) => Promise<void> | void;
    setOpenTabs?: React.Dispatch<React.SetStateAction<Tab[]>>;
    setActiveTabId?: React.Dispatch<React.SetStateAction<string>>;
    setCalendarDate?: React.Dispatch<React.SetStateAction<Date>>;
    setCalendarViewMode?: (mode: CalendarViewMode) => void;
    setEditorContent?: (content: unknown) => void;
    setActiveFileKey?: (key: CryptoKey | null) => void;
    setFileName?: (name: string) => void;
    loadNoteContent?: (id: string, title?: string) => Promise<void> | void;
    setPrivateKey?: React.Dispatch<React.SetStateAction<CryptoKey | null>>;
    setPublicKey?: React.Dispatch<React.SetStateAction<CryptoKey | null>>;
    setMyId?: React.Dispatch<React.SetStateAction<string>>;
    setUserEmail?: React.Dispatch<React.SetStateAction<string>>;
    setUserProfile?: React.Dispatch<React.SetStateAction<UserProfile | null>>;
    setIsRestored?: React.Dispatch<React.SetStateAction<boolean>>;
    setStatus?: React.Dispatch<React.SetStateAction<DashboardStatus>>;
}

export interface UseSessionRestoreResult {
    myId: string;
    privateKey: CryptoKey | null;
    publicKey: CryptoKey | null;
    keys: SessionKeyPair;
    userEmail: string;
    userProfile: UserProfile | null;
    setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
    isRestored: boolean;
    status: DashboardStatus;
    setStatus: React.Dispatch<React.SetStateAction<DashboardStatus>>;
}

async function clearSessionAndRedirect(router: ReturnType<typeof useRouter>): Promise<void> {
    sessionStorage.clear();
    await clearMasterKey();
    localStorage.removeItem("tide_session_key");
    localStorage.removeItem("tide_session_token");
    clearPersistedSessions();
    router.push("/auth");
}

function readStoredPublicKey(email: string): string {
    try {
        const userRecordStr = localStorage.getItem("tide_user_" + email);
        if (userRecordStr) {
            const record = JSON.parse(userRecordStr) as { public_key?: string };
            if (record.public_key) return record.public_key;
        }
        return (
            sessionStorage.getItem("tide_user_public_key") ||
            localStorage.getItem("tide_user_public_key") ||
            ""
        );
    } catch (e) {
        console.error("Error reading user record", e);
        return "";
    }
}

async function verifyRsaKeyPair(privKey: CryptoKey, pubKey: CryptoKey): Promise<boolean> {
    try {
        const testData = new TextEncoder().encode("sanity-check");
        const encrypted = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, pubKey, testData);
        const decrypted = await window.crypto.subtle.decrypt({ name: "RSA-OAEP" }, privKey, encrypted);
        const result = new TextDecoder().decode(decrypted);
        if (result !== "sanity-check") throw new Error("Sanity check result mismatch");
        console.log("[CRYPTO-AUDIT] Keys validated successfully.");
        return true;
    } catch (sanityErr: unknown) {
        const errObj = sanityErr as { name?: string; message?: string };
        const isCryptoError = errObj?.name === "InvalidAccessError" || errObj?.name === "OperationError";
        console.error("[CRYPTO-AUDIT] FATAL: Keys in storage are invalid or incompatible.", sanityErr);
        if (isCryptoError || errObj?.message?.includes("Sanity check")) {
            console.warn("[CRYPTO-AUDIT] Performing emergency cache reset...");
            await clearMasterKey();
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = "/auth?error=crypto_reset";
            return false;
        }
        return true;
    }
}

/**
 * Restores the encrypted user session, verifies RSA-OAEP keys, fetches the
 * public profile, and restores persisted tabs and calendar date.
 */
export function useSessionRestore(options: UseSessionRestoreOptions = {}): UseSessionRestoreResult {
    const router = useRouter();
    const storeSetKeys = useDataStore((s) => s.setKeys);
    const storeFetchDirectory = useDataStore((s) => s.fetchDirectory);

    const setKeys = options.setKeys ?? storeSetKeys;
    const fetchDirectory = options.fetchDirectory ?? storeFetchDirectory;

    const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
    const [publicKey, setPublicKey] = useState<CryptoKey | null>(null);
    const [myId, setMyId] = useState<string>("");
    const [userEmail, setUserEmail] = useState<string>("");
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [isRestored, setIsRestored] = useState<boolean>(false);
    const [status, setStatus] = useState<DashboardStatus>("loading");

    const optionsRef = useRef<UseSessionRestoreOptions>(options);

    useEffect(() => {
        optionsRef.current = options;
    });

    useEffect(() => {
        let cancelled = false;

        const updateStatus = (next: DashboardStatus) => {
            setStatus(next);
            optionsRef.current.setStatus?.(next);
        };
        const updateUserProfile: React.Dispatch<React.SetStateAction<UserProfile | null>> = (updater) => {
            setUserProfile(updater);
            optionsRef.current.setUserProfile?.(updater);
        };

        const restoreSession = async () => {
            console.log("[STATE-AUDIT] Initializing Application | Restore Session Start");
            const email = sessionStorage.getItem("tide_user_email") || localStorage.getItem("tide_user_email");
            const userId = sessionStorage.getItem("tide_user_id") || localStorage.getItem("tide_user_id");

            let privKey = await getMasterKey();
            if (!privKey) {
                const legacyKeyJwkStr =
                    sessionStorage.getItem("tide_session_key") || localStorage.getItem("tide_session_key");
                if (legacyKeyJwkStr) {
                    try {
                        privKey = await window.crypto.subtle.importKey(
                            "jwk",
                            JSON.parse(legacyKeyJwkStr) as JsonWebKey,
                            { name: "RSA-OAEP", hash: "SHA-256" },
                            true,
                            ["decrypt"]
                        );
                        if (privKey) await storeMasterKey(privKey);
                    } catch (e) {
                        console.error("Failed to migrate legacy session key", e);
                    }
                }
            }
            purgeLegacyKeys();
            if (cancelled) return;

            const token = sessionStorage.getItem("tide_session_token") || localStorage.getItem("tide_session_token");
            if (!email || !userId || !privKey || !token) {
                console.warn("[STATE-AUDIT] Session missing or incomplete.");
                updateStatus("ready");
                if (window.location.pathname !== "/auth" && window.location.pathname !== "/login") {
                    await clearSessionAndRedirect(router);
                }
                return;
            }

            const pubKeySpkiStr = readStoredPublicKey(email);
            if (!pubKeySpkiStr) {
                console.error("Public key not found for user", email);
                updateStatus("ready");
                await clearSessionAndRedirect(router);
                return;
            }

            try {
                const pubKey = await window.crypto.subtle.importKey(
                    "spki",
                    cryptoLib.base64ToArrayBuffer(pubKeySpkiStr),
                    { name: "RSA-OAEP", hash: "SHA-256" },
                    true,
                    ["encrypt"]
                );
                if (cancelled) return;

                setPrivateKey(privKey);
                optionsRef.current.setPrivateKey?.(privKey);
                setPublicKey(pubKey);
                optionsRef.current.setPublicKey?.(pubKey);

                const keysValid = await verifyRsaKeyPair(privKey, pubKey);
                if (!keysValid || cancelled) return;

                setKeys(privKey, pubKey, userId);
                void Promise.all([
                    loadEncryptedOfflineCache<DataItem[]>("notes"),
                    loadEncryptedOfflineCache<DataItem[]>("events"),
                    loadEncryptedOfflineCache<TaskItem[]>("tasks"),
                ])
                    .then(([cachedNotes, cachedEvents, cachedTasks]) => {
                        if (cancelled) return;
                        const store = useDataStore.getState();
                        const patch: Partial<Pick<DataStoreState, "notes" | "events" | "tasks">> = {};
                        if (Array.isArray(cachedNotes) && cachedNotes.length > 0 && store.notes.length === 0) {
                            patch.notes = cachedNotes;
                        }
                        if (Array.isArray(cachedEvents) && cachedEvents.length > 0 && store.events.length === 0) {
                            patch.events = cachedEvents;
                        }
                        if (Array.isArray(cachedTasks) && cachedTasks.length > 0 && store.tasks.length === 0) {
                            patch.tasks = cachedTasks;
                        }
                        if (Object.keys(patch).length > 0) {
                            useDataStore.setState(patch);
                        }
                    })
                    .catch((err) => {
                        console.warn("[OFFLINE-CACHE] Failed to hydrate encrypted offline cache", err);
                    });
                void fetchDirectory(null);
                void hydrateSettingsFromServer();
                void hydrateWorkspacesFromServer();
                setMyId(userId);
                optionsRef.current.setMyId?.(userId);
                setUserEmail(email);
                optionsRef.current.setUserEmail?.(email);

                const storedName =
                    typeof window !== "undefined"
                        ? localStorage.getItem("tide_user_name") || sessionStorage.getItem("tide_user_name")
                        : null;
                updateUserProfile({ username: storedName || email.split("@")[0], email });

                apiFetch(`/api/v1/profiles/${userId}`)
                    .then((r) => (r.ok ? (r.json() as Promise<ProfileApiResponse>) : null))
                    .then((profile) => {
                        if (!profile || cancelled) return;
                        updateUserProfile((prev) => {
                            if (!prev) return null;
                            return {
                                ...prev,
                                username: profile.username || prev.username || email.split("@")[0],
                                avatar_seed: profile.avatar_seed || prev.avatar_seed || userId,
                                avatar_salt: profile.avatar_salt || prev.avatar_salt || "",
                                avatar_style: profile.avatar_style || prev.avatar_style || "notionists",
                                bio: profile.bio || prev.bio || "",
                                title: profile.title || prev.title || "",
                                is_verified: profile.is_verified ?? prev.is_verified ?? false,
                                profile_status: profile.profile_status ?? prev.profile_status ?? 0,
                                id: userId,
                                user_id: userId,
                                email: prev.email,
                            };
                        });
                    })
                    .catch(() => {
                        /* non-critical, keep fallback */
                    });

                // Persistence: Restore tabs (from sessionStorage — per-window)
                // Window-level record (reload) first; durable record (app restart) as fallback.
                const durableKey = sessionStateKey(userId);
                const persisted = durableKey ? parsePersistedSession(localStorage.getItem(durableKey)) : null;
                let fromDurable = false;
                let savedTabs = sessionStorage.getItem("tide_open_tabs");
                let savedActiveId = sessionStorage.getItem("tide_active_tab_id");
                if (!savedTabs && persisted && persisted.tabs.length > 0) {
                    const notes = useDataStore.getState().notes;
                    savedTabs = JSON.stringify(
                        persisted.tabs.map((t) => ({
                            id: t.id,
                            type: t.type,
                            title: t.title ?? notes.find((n) => n.id === t.id)?.title ?? "",
                        }))
                    );
                    savedActiveId = persisted.activeTabId;
                    fromDurable = true;
                }
                if (persisted?.calendarViewMode) optionsRef.current.setCalendarViewMode?.(persisted.calendarViewMode);

                if (savedTabs) {
                    try {
                        const rawParsed: unknown = JSON.parse(savedTabs);
                        let parsed: Tab[] = Array.isArray(rawParsed)
                            ? (sanitizeRestoredTabs(rawParsed as Record<string, unknown>[]) as unknown as Tab[])
                            : [];
                        if (parsed.length > 0) {
                            const navMode = localStorage.getItem("tide_navigation_mode");
                            if (navMode === "folders" && !parsed.some((t) => t?.id === "folders")) {
                                const calIdx = parsed.findIndex((t) => t?.id === "calendar");
                                const fTab: Tab = { id: "folders", title: "Notizen", type: "folders" };
                                if (calIdx !== -1) parsed.splice(calIdx + 1, 0, fTab);
                                else parsed.push(fTab);
                            } else if (navMode === "sidebar") {
                                parsed = parsed.filter((t) => t?.id !== "folders");
                                if (parsed.length === 0) {
                                    parsed.push({ id: "calendar", title: "Calendar", type: "calendar" });
                                }
                            }

                            // Cold restart (durable record): the calendar is the home tab and the
                            // restored tabs stay open. A reload keeps the previously active tab.
                            const resolved = resolveRestoredActive(parsed, savedActiveId, { startOnCalendar: fromDurable });
                            parsed = resolved.tabs;
                            optionsRef.current.setOpenTabs?.(parsed);
                            const validActive = parsed.find((t) => t.id === resolved.activeTabId);
                            const activeIdToSet = resolved.activeTabId;
                            const activeTypeToSet = validActive ? validActive.type : parsed[0].type;
                            optionsRef.current.setActiveTabId?.(activeIdToSet);

                            if (activeTypeToSet === "file") {
                                const activeTitle = validActive ? validActive.title : parsed[0].title;
                                useDataStore.getState().setActiveNoteId(activeIdToSet);
                                const content = validActive?.content || parsed[0].content;
                                if (content) {
                                    optionsRef.current.setEditorContent?.(content);
                                    const cachedKey = validActive?._fileKey || parsed[0]._fileKey;
                                    if (cachedKey) optionsRef.current.setActiveFileKey?.(cachedKey);
                                    optionsRef.current.setFileName?.(activeTitle);
                                } else {
                                    setTimeout(() => {
                                        if (!cancelled) {
                                            void optionsRef.current.loadNoteContent?.(activeIdToSet, activeTitle);
                                        }
                                    }, 50);
                                }
                            } else {
                                useDataStore.getState().setActiveNoteId(null);
                            }
                        }
                    } catch (e) {
                        console.error("Corrupted tabs payload", e);
                    }
                }

                const savedDate = parseStoredCalendarDate(localStorage.getItem(CALENDAR_DATE_STORAGE_KEY));
                if (savedDate) optionsRef.current.setCalendarDate?.(savedDate);

                setIsRestored(true);
                optionsRef.current.setIsRestored?.(true);
                updateStatus("ready");
            } catch (e) {
                console.error("Session restore failed:", e);
                updateStatus("ready");
                await clearSessionAndRedirect(router);
            }
        };

        void restoreSession();

        return () => {
            cancelled = true;
        };
    }, [router, setKeys, fetchDirectory]);

    const keys = useMemo<SessionKeyPair>(() => ({ privateKey, publicKey }), [privateKey, publicKey]);

    return {
        myId,
        privateKey,
        publicKey,
        keys,
        userEmail,
        userProfile,
        setUserProfile,
        isRestored,
        status,
        setStatus,
    };
}
