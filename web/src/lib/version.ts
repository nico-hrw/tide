export const CURRENT_APP_VERSION = '0.2.0';

const DISMISSED_VERSION_KEY = 'tide_dismissed_version';
const POST_UPDATE_KEY = 'tide_just_updated';

export function getStoredDismissedVersion(): string | null {
    if (typeof window === 'undefined') return null;
    try {
        return localStorage.getItem(DISMISSED_VERSION_KEY);
    } catch {
        return null;
    }
}

export function setStoredDismissedVersion(version: string): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(DISMISSED_VERSION_KEY, version);
    } catch {
        // Ignore storage errors (e.g. private browsing or quota restrictions)
    }
}

export function setPostUpdateFlag(): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(POST_UPDATE_KEY, 'true');
    } catch {
        // Ignore storage errors
    }
}

export function checkAndClearPostUpdateFlag(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        const val = localStorage.getItem(POST_UPDATE_KEY);
        if (val === 'true') {
            localStorage.removeItem(POST_UPDATE_KEY);
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * Compares two semantic version strings (e.g. "0.2.0" > "0.1.0").
 * Strips leading 'v' if present (e.g. "v0.2.0").
 * Returns true if remoteVersion is strictly greater than currentVersion.
 */
export function isNewerVersion(remoteVersion: string, currentVersion: string = CURRENT_APP_VERSION): boolean {
    if (!remoteVersion) return false;

    const parseParts = (v: string): number[] => {
        const cleaned = v.trim().replace(/^v/i, '');
        return cleaned.split('.').map(part => {
            const num = parseInt(part, 10);
            return isNaN(num) ? 0 : num;
        });
    };

    const remoteParts = parseParts(remoteVersion);
    const currentParts = parseParts(currentVersion);

    const maxLength = Math.max(remoteParts.length, currentParts.length);
    for (let i = 0; i < maxLength; i++) {
        const r = remoteParts[i] ?? 0;
        const c = currentParts[i] ?? 0;
        if (r > c) return true;
        if (r < c) return false;
    }

    return false;
}
