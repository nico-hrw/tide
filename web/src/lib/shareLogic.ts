import * as cryptoV2 from './cryptoV2';
import * as cryptoLib from './crypto';
import { apiFetch } from './api';

export async function performMessengerShare(
    shareModalFile: { id: string; title: string },
    myId: string,
    privateKey: CryptoKey,
    publicKey: CryptoKey,
    events: any[],
    recipientEmail: string,
    recipientPubKeySpki: string
) {
    if (!shareModalFile || !privateKey || !publicKey) {
        throw new Error("Invalid state");
    }

    const fileId = shareModalFile.id;

    try {
        // 1. Fetch file to get current access_keys
        const res = await apiFetch(`/api/v1/files/${fileId}`);
        if (!res.ok) throw new Error("Failed to fetch file");
        const file = await res.json().catch(() => null);
        if (!file) throw new Error("Failed to parse file metadata");

        // 2. Import Recipient Public Key First
        const recipientPubKey = await window.crypto.subtle.importKey(
            "spki",
            cryptoLib.base64ToArrayBuffer(recipientPubKeySpki),
            { name: "RSA-OAEP", hash: "SHA-256" },
            true,
            ["encrypt"]
        );

        // 3. True Zero-Knowledge Sharing via DEK unwrapping/wrapping
        let accessKeysMap = typeof file.access_keys === 'string' ? JSON.parse(file.access_keys) : (file.access_keys || {});
        let myAccess = accessKeysMap[myId];
        
        if (!myAccess || !myAccess.wrapped_key) {
            throw new Error("No access key found for the owner. Ensure file is V2 encrypted.");
        }

        // Unwrap the DEK using the owner's private key
        const rawDek = await cryptoV2.unwrapDEKData(myAccess.wrapped_key, privateKey);
        
        // Wrap the DEK using the recipient's public key
        const recipientWrapped = await cryptoV2.wrapDEKData(rawDek, recipientPubKey);
        
        // Push the sharing update to the backend
        const shareRes = await apiFetch(`/api/v1/files/${fileId}/share`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: recipientEmail,
                secured_meta: recipientWrapped.ciphertext // wrapped DEK for recipient, added to access_keys map
            })
        });

        if (!shareRes.ok) throw new Error("Failed to share file");

        const messageRes = await apiFetch("/api/v1/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                recipient_email: recipientEmail,
                content: JSON.stringify({
                    type: "file_share_request",
                    file_id: fileId,
                    file_name: shareModalFile.title,
                    file_type: file.type,
                    file_preview: "Shared document"
                })
            })
        });

        if (!messageRes.ok) throw new Error("Failed to send share request");
    } catch (err) {
        console.error("Share failed:", err);
        throw err;
    }
}
