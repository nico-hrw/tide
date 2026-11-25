/**
 * Recovery secret ("Wiederherstellungsschlüssel"): 160 random bits from the browser CSPRNG,
 * written as 32 Crockford-Base32 characters in groups of four (e.g. "7K2M-…").
 *
 * Crockford-Base32 leaves out I, L, O and U, so hand-typed input can be normalised:
 * case is ignored, spaces and dashes are dropped, O is read as 0 and I/L as 1.
 */

export const RECOVERY_SECRET_BITS = 160;
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SECRET_LENGTH = RECOVERY_SECRET_BITS / 5; // 32 characters, 5 bits each
const GROUP = 4;

export class RecoverySecretFormatError extends Error {
    constructor(message = 'Der Wiederherstellungsschlüssel hat nicht das richtige Format.') {
        super(message);
        this.name = 'RecoverySecretFormatError';
    }
}

function encodeBase32(bytes: Uint8Array): string {
    let out = '';
    let buffer = 0;
    let bits = 0;
    for (const byte of bytes) {
        buffer = (buffer << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            out += ALPHABET[(buffer >>> (bits - 5)) & 31];
            bits -= 5;
        }
        buffer &= (1 << bits) - 1;
    }
    if (bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 31];
    return out;
}

/** Groups a canonical secret as XXXX-XXXX-… for display, mail and download. */
export function formatRecoverySecret(canonical: string): string {
    const parts: string[] = [];
    for (let i = 0; i < canonical.length; i += GROUP) parts.push(canonical.slice(i, i + GROUP));
    return parts.join('-');
}

/**
 * Turns user input into the canonical 32-character form used as KDF input.
 * Throws RecoverySecretFormatError for wrong length or characters outside the alphabet.
 */
export function normalizeRecoverySecret(input: string): string {
    const cleaned = input
        .toUpperCase()
        .replace(/[\s\-_.]/g, '')
        .replace(/O/g, '0')
        .replace(/[IL]/g, '1');
    if (cleaned.length !== SECRET_LENGTH) {
        throw new RecoverySecretFormatError(
            `Der Wiederherstellungsschlüssel hat ${SECRET_LENGTH} Zeichen (ohne Bindestriche), eingegeben wurden ${cleaned.length}.`,
        );
    }
    for (const ch of cleaned) {
        if (!ALPHABET.includes(ch)) {
            throw new RecoverySecretFormatError(`Das Zeichen „${ch}“ kommt in Wiederherstellungsschlüsseln nicht vor.`);
        }
    }
    return cleaned;
}

/** Fresh secret, canonical form (32 characters, no separators). */
export function generateRecoverySecret(): string {
    const bytes = new Uint8Array(RECOVERY_SECRET_BITS / 8);
    window.crypto.getRandomValues(bytes);
    return encodeBase32(bytes);
}
