// E2EE Framing for Tide Realtime Collaboration
// Encrypted binary WebSocket frames and snapshots with AEAD (AES-GCM + AAD).

import { arrayBufferToBase64, base64ToArrayBuffer } from "./crypto";

export const FRAME_TYPE_CRDT = 0x01;
export const FRAME_TYPE_AWARENESS = 0x02;
export const FRAME_TYPE_CONTROL = 0x03;
export const MIN_ENCRYPTED_FRAME_LEN = 33;

/**
 * Builds Associated Authenticated Data (AAD) for frame encryption.
 * Format: UTF8Encode(fileId) || msgType (1 byte) || keyEpoch (4 bytes Big-Endian uint32)
 */
export function buildFrameAAD(fileId: string, msgType: number, keyEpoch: number): Uint8Array {
    const enc = new TextEncoder();
    const fileIdBytes = enc.encode(fileId);
    const aad = new Uint8Array(fileIdBytes.length + 5);
    aad.set(fileIdBytes, 0);
    const view = new DataView(aad.buffer, aad.byteOffset, aad.byteLength);
    view.setUint8(fileIdBytes.length, msgType);
    view.setUint32(fileIdBytes.length + 1, keyEpoch, false); // Big-Endian
    return aad;
}

/**
 * Encrypts a collaborative WebSocket payload into a binary frame.
 * Frame Layout: msgType (1B) || keyEpoch (4B Big-Endian) || IV (12B) || ciphertext (AES-GCM with AAD)
 */
export async function encryptWSFrame(
    fileId: string,
    msgType: 0x01 | 0x02,
    keyEpoch: number,
    dek: CryptoKey,
    plaintextPayload: Uint8Array
): Promise<Uint8Array> {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const aad = buildFrameAAD(fileId, msgType, keyEpoch);
    const payloadBytes = plaintextPayload.slice();

    const ciphertext = await window.crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv,
            additionalData: aad.buffer as ArrayBuffer,
        },
        dek,
        payloadBytes.buffer as ArrayBuffer
    );

    const frame = new Uint8Array(17 + ciphertext.byteLength);
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    view.setUint8(0, msgType);
    view.setUint32(1, keyEpoch, false);
    frame.set(iv, 5);
    frame.set(new Uint8Array(ciphertext), 17);

    return frame;
}

/**
 * Decrypts a binary WebSocket frame, authenticating AAD and returning the payload.
 * Throws if the frame is shorter than MIN_ENCRYPTED_FRAME_LEN (33 bytes) or MAC validation fails.
 */
export async function decryptWSFrame(
    fileId: string,
    frame: Uint8Array,
    dek: CryptoKey
): Promise<{ msgType: number; keyEpoch: number; plaintext: Uint8Array }> {
    if (frame.byteLength < MIN_ENCRYPTED_FRAME_LEN) {
        throw new Error(
            `[E2EE-FRAME] Frame length ${frame.byteLength} is less than minimum ${MIN_ENCRYPTED_FRAME_LEN} bytes`
        );
    }

    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    const msgType = view.getUint8(0);
    const keyEpoch = view.getUint32(1, false);
    const iv = frame.slice(5, 17);
    const ciphertext = frame.slice(17);

    const aad = buildFrameAAD(fileId, msgType, keyEpoch);

    const decrypted = await window.crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: iv.buffer as ArrayBuffer,
            additionalData: aad.buffer as ArrayBuffer,
        },
        dek,
        ciphertext.buffer as ArrayBuffer
    );

    return {
        msgType,
        keyEpoch,
        plaintext: new Uint8Array(decrypted),
    };
}

/**
 * Encrypts a Yjs CRDT document snapshot with AES-GCM and frame AAD.
 */
export async function encryptSnapshot(
    fileId: string,
    keyEpoch: number,
    dek: CryptoKey,
    yjsState: Uint8Array
): Promise<{ ivBase64: string; ciphertextBase64: string }> {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const aad = buildFrameAAD(fileId, FRAME_TYPE_CRDT, keyEpoch);
    const stateBytes = yjsState.slice();

    const ciphertext = await window.crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv,
            additionalData: aad.buffer as ArrayBuffer,
        },
        dek,
        stateBytes.buffer as ArrayBuffer
    );

    return {
        ivBase64: arrayBufferToBase64(iv.buffer as ArrayBuffer),
        ciphertextBase64: arrayBufferToBase64(ciphertext),
    };
}

/**
 * Decrypts an encrypted Yjs CRDT document snapshot, verifying AAD and MAC.
 */
export async function decryptSnapshot(
    fileId: string,
    keyEpoch: number,
    ivBase64: string,
    ciphertextBase64: string,
    dek: CryptoKey
): Promise<Uint8Array> {
    const iv = base64ToArrayBuffer(ivBase64);
    const ciphertext = base64ToArrayBuffer(ciphertextBase64);
    const aad = buildFrameAAD(fileId, FRAME_TYPE_CRDT, keyEpoch);

    const decrypted = await window.crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: new Uint8Array(iv),
            additionalData: aad.buffer as ArrayBuffer,
        },
        dek,
        ciphertext
    );

    return new Uint8Array(decrypted);
}
