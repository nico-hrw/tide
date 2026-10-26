import { useState, useEffect } from "react";
import { getApiBase } from "@/lib/api";
import type { UserProfile } from "./types";

export const handleSignOut = () => {
        sessionStorage.clear();
        localStorage.removeItem("tide_user_email");
        localStorage.removeItem("tide_user_id");
        localStorage.removeItem("tide_session_token");
        window.location.reload();
};

export function useSidebarUserProfile() {
    const [myId, setMyId] = useState<string>("");
    const [sidebarUserProfile, setSidebarUserProfile] = useState<UserProfile | null>(null);

    useEffect(() => {
        const id = sessionStorage.getItem('tide_user_id') || localStorage.getItem('tide_user_id') || '';
        setMyId(id);

        const email = sessionStorage.getItem("tide_user_email") || localStorage.getItem("tide_user_email");
        let username = "User";

        if (email) {
            username = email.split('@')[0];
            const userRecordStr = localStorage.getItem("tide_user_" + email);
            if (userRecordStr) {
                try {
                    const record = JSON.parse(userRecordStr);
                    if (record.username) username = record.username;
                } catch (e) { }
            }
            setSidebarUserProfile({ username, email });

            // Fetch real profile (avatar_seed + avatar_salt) from backend
            if (id) {
                fetch(`${getApiBase()}/api/v1/profiles/${id}`)
                    .then(r => r.ok ? r.json() : null)
                    .then(profile => {
                        if (profile) {
                            setSidebarUserProfile({
                                username: profile.username || username,
                                email,
                                avatar_seed: profile.avatar_seed || id,
                                avatar_salt: profile.avatar_salt || '',
                            });
                        }
                    })
                    .catch(() => { });
            }
        }
    }, []);

    return { myId, sidebarUserProfile };
}
