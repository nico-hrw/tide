/**
 * WebAuthn <-> JSON helpers for the go-webauthn server. Binary fields travel as base64url.
 * Client extension results are never forwarded: the PRF output is a secret and stays on the device.
 */

export function bytesToB64url(buf: ArrayBuffer | Uint8Array): string {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
    const bin = atob(b64);
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

interface DescriptorJSON {
    id: string;
    type: 'public-key';
    transports?: AuthenticatorTransport[];
}

export interface CreationOptionsJSON {
    challenge: string;
    rp: { id?: string; name: string };
    user: { id: string; name: string; displayName: string };
    pubKeyCredParams: PublicKeyCredentialParameters[];
    timeout?: number;
    excludeCredentials?: DescriptorJSON[];
    authenticatorSelection?: AuthenticatorSelectionCriteria;
    attestation?: AttestationConveyancePreference;
}

export interface RequestOptionsJSON {
    challenge: string;
    rpId?: string;
    timeout?: number;
    allowCredentials?: DescriptorJSON[];
    userVerification?: UserVerificationRequirement;
}

const toDescriptor = (d: DescriptorJSON): PublicKeyCredentialDescriptor => ({ id: b64urlToBytes(d.id), type: d.type, transports: d.transports });

export function toCreationOptions(o: CreationOptionsJSON): PublicKeyCredentialCreationOptions {
    return {
        challenge: b64urlToBytes(o.challenge),
        rp: o.rp,
        user: { ...o.user, id: b64urlToBytes(o.user.id) },
        pubKeyCredParams: o.pubKeyCredParams,
        timeout: o.timeout,
        excludeCredentials: (o.excludeCredentials ?? []).map(toDescriptor),
        authenticatorSelection: o.authenticatorSelection,
        attestation: o.attestation ?? 'none',
    };
}

export function toRequestOptions(o: RequestOptionsJSON): PublicKeyCredentialRequestOptions {
    return {
        challenge: b64urlToBytes(o.challenge),
        rpId: o.rpId,
        timeout: o.timeout,
        allowCredentials: (o.allowCredentials ?? []).map(toDescriptor),
        userVerification: o.userVerification ?? 'required',
    };
}

/** Registration response for the server, without extension outputs. */
export function creationToJSON(cred: PublicKeyCredential): Record<string, unknown> {
    const r = cred.response as AuthenticatorAttestationResponse;
    return {
        id: cred.id,
        rawId: bytesToB64url(cred.rawId),
        type: cred.type,
        authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
        response: {
            clientDataJSON: bytesToB64url(r.clientDataJSON),
            attestationObject: bytesToB64url(r.attestationObject),
            transports: typeof r.getTransports === 'function' ? r.getTransports() : [],
        },
        clientExtensionResults: {},
    };
}

/** Assertion for the server, without extension outputs. */
export function assertionToJSON(cred: PublicKeyCredential): Record<string, unknown> {
    const r = cred.response as AuthenticatorAssertionResponse;
    return {
        id: cred.id,
        rawId: bytesToB64url(cred.rawId),
        type: cred.type,
        authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
        response: {
            clientDataJSON: bytesToB64url(r.clientDataJSON),
            authenticatorData: bytesToB64url(r.authenticatorData),
            signature: bytesToB64url(r.signature),
            userHandle: r.userHandle ? bytesToB64url(r.userHandle) : undefined,
        },
        clientExtensionResults: {},
    };
}
