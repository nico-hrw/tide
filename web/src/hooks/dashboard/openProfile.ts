export interface OpenProfileDetail {
    userId?: string;
    username?: string;
}

/**
 * Decides how a `tide:open-profile` event is handled. Mobile has no tab surface for
 * profiles (it renders a full-screen overlay), so when `openOverlay` is given it is used
 * and no `profile:` tab is created. Desktop opens the profile tab.
 */
export function routeOpenProfile(
    detail: OpenProfileDetail | undefined,
    targets: {
        openOverlay?: (userId: string, username?: string) => void;
        switchTab: (id: string, type: string, title?: string) => unknown;
    },
): 'overlay' | 'tab' | 'ignored' {
    const userId = detail?.userId;
    if (!userId) return 'ignored';
    if (targets.openOverlay) {
        targets.openOverlay(userId, detail?.username);
        return 'overlay';
    }
    targets.switchTab(`profile:${userId}`, 'profile', detail?.username);
    return 'tab';
}
