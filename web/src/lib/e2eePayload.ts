import { arrayBufferToBase64, base64ToArrayBuffer, decryptMetadata } from '@/lib/crypto';
import { encryptFileV2, importDEK, unwrapDEKData } from '@/lib/cryptoV2';

export interface SecuredEnvelopeDecryptOptions {
    accessKeys?: unknown;
    myId?: string | null;
    cacheId?: string;
}

export interface UnencryptedCheckTarget {
    type?: string;
    visibility?: string;
    metadata?: Record<string, unknown> | null;
    secured_meta?: unknown;
    [key: string]: unknown;
}

/**
 * Only non-sensitive operational flags belong in plaintext `files.metadata` for private E2EE items.
 */
export const SAFE_FILE_METADATA_KEYS: ReadonlySet<string> = new Set([
    'has_custom_password',
    'pwd_salt',
    'pin_hash',
    'security_settings',
    'deleted_at',
    'unencrypted',
    'version',
    'isGroup',
]);

interface V2EnvelopeShape {
    v?: unknown;
    wk?: unknown;
    ct?: unknown;
    data?: unknown;
    iv?: unknown;
}

interface AccessKeyEntry {
    wrapped_key?: unknown;
    pwd_iv?: unknown;
}

function tryParseJsonRecord(raw: string): Record<string, unknown> | null {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('{')) return null;
    try {
        const parsed: unknown = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch {
        // Not valid JSON
    }
    return null;
}

function decodeEnvelopeObject(encoded: string): V2EnvelopeShape | null {
    const direct = tryParseJsonRecord(encoded);
    if (direct) return direct;

    try {
        const buf = base64ToArrayBuffer(encoded);
        const bytes = new Uint8Array(buf);
        if (bytes.length === 0 || bytes[0] !== 0x7b) return null;
        const decoded = new TextDecoder().decode(bytes);
        return tryParseJsonRecord(decoded);
    } catch {
        return null;
    }
}

async function decryptAesGcmJson(
    payloadStr: string,
    dek: CryptoKey
): Promise<Record<string, unknown>> {
    const payload = tryParseJsonRecord(payloadStr);
    if (!payload || typeof payload.data !== 'string' || typeof payload.iv !== 'string') {
        throw new Error('[E2EE-PAYLOAD] Invalid AES-GCM ciphertext payload');
    }
    const ivBuf = base64ToArrayBuffer(payload.iv);
    const dataBuf = base64ToArrayBuffer(payload.data);
    const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivBuf },
        dek,
        dataBuf
    );
    const decodedText = new TextDecoder().decode(decrypted);
    const parsed = tryParseJsonRecord(decodedText);
    if (!parsed) {
        throw new Error('[E2EE-PAYLOAD] Decrypted envelope payload is not a JSON object');
    }
    return parsed;
}

function resolveAccessKeyEntry(
    accessKeys: unknown,
    myId: string | null | undefined
): AccessKeyEntry | null {
    let akMap: Record<string, unknown> | null = null;
    if (typeof accessKeys === 'string') {
        akMap = tryParseJsonRecord(accessKeys);
    } else if (accessKeys && typeof accessKeys === 'object' && !Array.isArray(accessKeys)) {
        akMap = accessKeys as Record<string, unknown>;
    }
    if (!akMap) return null;

    let entry: unknown = null;
    if (myId && akMap[myId]) {
        entry = akMap[myId];
    } else {
        const keys = Object.keys(akMap);
        if (keys.length === 1 || (!myId && keys.length > 0)) {
            entry = akMap[keys[0]];
        }
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    return entry as AccessKeyEntry;
}

/**
 * Encrypts an arbitrary JSON metadata/todo object using a fresh 256-bit AES-GCM DEK wrapped
 * with the recipient's RSA-OAEP public key, removing the RSA plaintext size limit (~190-446 B).
 */
export async function encryptSecuredEnvelope(
    payload: Record<string, unknown>,
    publicKey: CryptoKey
): Promise<string> {
    const serialized = JSON.stringify(payload ?? {});
    const v2 = await encryptFileV2(serialized, publicKey);
    const dekField: unknown = v2.encrypted_dek;
    const wrappedKey =
        typeof dekField === 'string'
            ? dekField
            : dekField && typeof dekField === 'object' && 'wrapped_key' in dekField
            ? String((dekField as { wrapped_key?: unknown }).wrapped_key ?? '')
            : '';

    const envelope = {
        v: 2,
        wk: wrappedKey,
        ct: v2.content_ciphertext,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(envelope));
    return arrayBufferToBase64(bytes.buffer as ArrayBuffer);
}

/**
 * Decrypts a V2 self-contained envelope, a DEK-bound AES-GCM envelope, or legacy V1 RSA-OAEP metadata.
 */
export async function decryptSecuredEnvelope(
    encoded: string,
    privateKey: CryptoKey,
    opts?: SecuredEnvelopeDecryptOptions
): Promise<Record<string, unknown>> {
    if (!encoded || typeof encoded !== 'string' || encoded.trim().length === 0) {
        return { title: 'Locked Note (Invalid Metadata)', isLocked: true };
    }

    const env = decodeEnvelopeObject(encoded);
    if (env) {
        try {
            // Case 1: Self-contained V2 envelope { v: 2, wk, ct } or { v: 2, wk, data, iv }
            if (env.v === 2 && typeof env.wk === 'string' && env.wk.length > 0) {
                const ctStr =
                    typeof env.ct === 'string'
                        ? env.ct
                        : typeof env.data === 'string' && typeof env.iv === 'string'
                        ? JSON.stringify({ data: env.data, iv: env.iv })
                        : null;
                if (ctStr) {
                    const rawDek = await unwrapDEKData(env.wk, privateKey);
                    const dek = await importDEK(rawDek);
                    const parsed = await decryptAesGcmJson(ctStr, dek);
                    if (!parsed.title && typeof parsed.name === 'string') {
                        parsed.title = parsed.name;
                    }
                    return parsed;
                }
            }

            // Case 2: DEK-bound V2 envelope { data, iv } using accessKeys
            if (typeof env.data === 'string' && typeof env.iv === 'string') {
                const entry = resolveAccessKeyEntry(opts?.accessKeys, opts?.myId);
                if (entry && !entry.pwd_iv && typeof entry.wrapped_key === 'string' && entry.wrapped_key.length > 0) {
                    const rawDek = await unwrapDEKData(entry.wrapped_key, privateKey);
                    const dek = await importDEK(rawDek);
                    const parsed = await decryptAesGcmJson(JSON.stringify({ data: env.data, iv: env.iv }), dek);
                    if (!parsed.title && typeof parsed.name === 'string') {
                        parsed.title = parsed.name;
                    }
                    return parsed;
                }
            }
        } catch {
            return { title: 'Locked Note (Decryption Failed)', isLocked: true };
        }
    }

    // Case 3: Legacy V1 RSA-OAEP Base64 metadata
    return decryptMetadata(encoded, privateKey, opts?.cacheId);
}

/**
 * Strips confidential plaintext fields from `files.metadata` while keeping only safe operational flags.
 */
export function stripSensitiveFileMetadata(
    meta: Record<string, unknown> | undefined | null,
    opts?: { keepUnencrypted?: boolean }
): Record<string, unknown> {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
        return {};
    }
    if (opts?.keepUnencrypted && meta.unencrypted === true) {
        return { ...meta };
    }
    const clean: Record<string, unknown> = {};
    for (const key of Object.keys(meta)) {
        if (SAFE_FILE_METADATA_KEYS.has(key)) {
            clean[key] = meta[key];
        }
    }
    return clean;
}

/**
 * True only when a file is public OR explicitly unlocked (`metadata.unencrypted === true`) with no active `secured_meta`.
 */
export function isExplicitlyUnencryptedFile(
    file: UnencryptedCheckTarget | undefined | null
): boolean {
    if (!file) return false;
    if (file.visibility === 'public') return true;
    const hasSecuredMeta = typeof file.secured_meta === 'string' && file.secured_meta.trim().length > 0;
    return file.metadata?.unencrypted === true && !hasSecuredMeta;
}
