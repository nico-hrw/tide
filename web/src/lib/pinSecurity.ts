// web/src/lib/pinSecurity.ts

export interface ItemSecuritySettings {
    has_custom_password: boolean;
    pwd_salt: string;
    pin_hash: string;
    require_for_shares?: boolean; // Müssen andere bei Freigabe ebenfalls eine PIN eingeben?
    frequency: 'always' | 'session' | 'every_x_times' | 'timeout_minutes' | 'timeout_days' | 'once';
    frequency_value?: number; // z. B. 5 Mal, 15 Minuten, 3 Tage
    created_at?: string;
    updated_at?: string;
    recovery_vault?: string; // Optional: mit Master-RSA verschlüsselter DEK für Wiederherstellung via E-Mail OTP
}

// In-memory cache for the current session to store unwrap PINs
const sessionPinCache = new Map<string, string>();

/**
 * Derives a cryptographic hash from a PIN and salt using PBKDF2 with SHA-256.
 */
export async function hashPin(pin: string, saltBase64: string): Promise<string> {
    const encoder = new TextEncoder();
    const pinBuffer = encoder.encode(pin);
    const saltBuffer = Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0));

    const keyMaterial = await window.crypto.subtle.importKey(
        'raw',
        pinBuffer,
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
    );

    const derivedBits = await window.crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: saltBuffer,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        256
    );

    const hashArray = Array.from(new Uint8Array(derivedBits));
    return btoa(String.fromCharCode.apply(null, hashArray));
}

/**
 * Generates a random 16-byte salt as base64.
 */
export function generateSalt(): string {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    return btoa(String.fromCharCode.apply(null, Array.from(salt)));
}

/**
 * Verifies if the provided PIN matches the stored hash.
 */
export async function verifyPin(pin: string, saltBase64: string, expectedHash: string): Promise<boolean> {
    try {
        const computedHash = await hashPin(pin, saltBase64);
        return computedHash === expectedHash;
    } catch (e) {
        console.error('[pinSecurity] verifyPin error:', e);
        return false;
    }
}

/**
 * Checks whether an item is currently unlocked according to its frequency policy.
 */
export function isItemUnlocked(itemId: string, settings?: ItemSecuritySettings | null): boolean {
    if (!settings || !settings.has_custom_password) {
        return true; // No security protection
    }

    const { frequency, frequency_value = 1 } = settings;

    // 'always': Must enter PIN on every single open
    if (frequency === 'always') {
        return false;
    }

    // 'session': Unlocked for the browser session
    if (frequency === 'session') {
        if (typeof sessionStorage !== 'undefined') {
            return sessionStorage.getItem(`tide_unlocked_${itemId}`) === 'true';
        }
        return false;
    }

    // 'every_x_times': Unlocked for X consecutive opens, then re-prompts
    if (frequency === 'every_x_times') {
        if (typeof localStorage !== 'undefined') {
            const countStr = localStorage.getItem(`tide_unlock_count_${itemId}`);
            const count = countStr ? parseInt(countStr, 10) : 0;
            if (count > 0 && count < frequency_value) {
                return true;
            }
        }
        return false;
    }

    // 'timeout_minutes': Unlocked for X minutes after last unlock
    if (frequency === 'timeout_minutes') {
        if (typeof sessionStorage !== 'undefined') {
            const timestampStr = sessionStorage.getItem(`tide_unlock_time_${itemId}`);
            if (timestampStr) {
                const timestamp = parseInt(timestampStr, 10);
                const elapsedMs = Date.now() - timestamp;
                const maxMs = (frequency_value || 15) * 60 * 1000;
                return elapsedMs < maxMs;
            }
        }
        return false;
    }

    // 'timeout_days': Unlocked for X days
    if (frequency === 'timeout_days') {
        if (typeof localStorage !== 'undefined') {
            const timestampStr = localStorage.getItem(`tide_unlock_time_${itemId}`);
            if (timestampStr) {
                const timestamp = parseInt(timestampStr, 10);
                const elapsedMs = Date.now() - timestamp;
                const maxMs = (frequency_value || 1) * 24 * 60 * 60 * 1000;
                return elapsedMs < maxMs;
            }
        }
        return false;
    }

    // 'once': Unlocked forever on this device
    if (frequency === 'once') {
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem(`tide_unlocked_once_${itemId}`) === 'true';
        }
        return false;
    }

    return false;
}

/**
 * Records a successful unlock and updates session/local storage according to policy.
 */
export function recordItemUnlock(itemId: string, settings: ItemSecuritySettings, pin?: string): void {
    const { frequency } = settings;

    if (pin) {
        sessionPinCache.set(itemId, pin);
    }

    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(`tide_unlocked_${itemId}`, 'true');
        sessionStorage.setItem(`tide_unlock_time_${itemId}`, Date.now().toString());
    }

    if (frequency === 'every_x_times' && typeof localStorage !== 'undefined') {
        const countStr = localStorage.getItem(`tide_unlock_count_${itemId}`);
        const currentCount = countStr ? parseInt(countStr, 10) : 0;
        const max = settings.frequency_value || 5;
        if (currentCount >= max) {
            localStorage.setItem(`tide_unlock_count_${itemId}`, '1');
        } else {
            localStorage.setItem(`tide_unlock_count_${itemId}`, (currentCount + 1).toString());
        }
    }

    if (frequency === 'timeout_days' && typeof localStorage !== 'undefined') {
        localStorage.setItem(`tide_unlock_time_${itemId}`, Date.now().toString());
    }

    if (frequency === 'once' && typeof localStorage !== 'undefined') {
        localStorage.setItem(`tide_unlocked_once_${itemId}`, 'true');
    }
}

/**
 * Explicitly locks an item by clearing stored tokens.
 */
export function lockItem(itemId: string): void {
    sessionPinCache.delete(itemId);
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(`tide_unlocked_${itemId}`);
        sessionStorage.removeItem(`tide_unlock_time_${itemId}`);
    }
    if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(`tide_unlocked_once_${itemId}`);
        localStorage.removeItem(`tide_unlock_count_${itemId}`);
        localStorage.removeItem(`tide_unlock_time_${itemId}`);
    }
}

/**
 * Retrieves the cached session PIN (if available in memory).
 */
export function getSessionPin(itemId: string): string | null {
    return sessionPinCache.get(itemId) || null;
}
