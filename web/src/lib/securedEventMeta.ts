/** Max plaintext bytes for RSA-OAEP (2048-bit key, SHA-256): 256 - 2*32 - 2 = 190. Keep a margin. */
export const MAX_SECURED_META_BYTES = 180;

interface SecuredEventInput {
    title: string;
    start?: string;
    end?: string;
    allDay?: boolean;
}

/**
 * The part of an event that is RSA-encrypted into `secured_meta`. RSA can only encrypt one small block, so this
 * carries just the essentials (the long title is shortened if needed); descriptions, tags and the rest live in
 * `metadata` and the AES-encrypted content blob.
 */
export function buildSecuredEventMeta(input: SecuredEventInput): Record<string, unknown> {
    const byteLength = (o: unknown) => new TextEncoder().encode(JSON.stringify(o)).length;
    const base = {
        ...(input.start !== undefined ? { start: input.start } : {}),
        ...(input.end !== undefined ? { end: input.end } : {}),
        ...(input.allDay !== undefined ? { allDay: input.allDay } : {}),
    };
    let title = input.title;
    let candidate: Record<string, unknown> = { title, ...base };
    while (byteLength(candidate) > MAX_SECURED_META_BYTES && title.length > 1) {
        title = title.slice(0, Math.max(1, title.length - 8));
        candidate = { title, ...base };
    }
    if (byteLength(candidate) > MAX_SECURED_META_BYTES) candidate = { title };
    return candidate;
}
