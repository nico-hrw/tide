/**
 * Feature detection and the WebAuthn PRF extension.
 *
 * PRF input: one fixed, app-wide value. For a discoverable sign-in the browser does not know in
 * advance which passkey the user picks, and `evalByCredential` needs a non-empty allow list, so a
 * per-credential input cannot be sent. The PRF output is still secret and different per credential;
 * each envelope adds its own random HKDF salt. The input is stored in the envelope (`prfSalt`) so
 * it could change later.
 */

export const PRF_INPUT_LABEL = 'tide-vault-prf-v1';

export function prfInput(): Uint8Array<ArrayBuffer> {
    const encoded = new TextEncoder().encode(PRF_INPUT_LABEL);
    const out = new Uint8Array(new ArrayBuffer(encoded.length));
    out.set(encoded);
    return out;
}

/** WebAuthn API present at all (old browsers and non-secure contexts: false). */
export function isWebAuthnAvailable(): boolean {
    return typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function' && !!navigator.credentials;
}

interface PrfOutputs {
    enabled?: boolean;
    results?: { first?: BufferSource };
}

function prfOutputs(cred: PublicKeyCredential): PrfOutputs | undefined {
    const ext = cred.getClientExtensionResults() as unknown as { prf?: PrfOutputs };
    return ext.prf;
}

/** The PRF result of a create()/get() call, or null when the platform gave none. */
export function prfResult(cred: PublicKeyCredential): ArrayBuffer | null {
    const first = prfOutputs(cred)?.results?.first;
    if (!first) return null;
    if (first instanceof ArrayBuffer) return first;
    const view = first as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice().buffer;
}

/** false only when the platform explicitly said the credential has no PRF. */
export function prfMaybeEnabled(cred: PublicKeyCredential): boolean {
    return prfOutputs(cred)?.enabled !== false;
}

/** The `extensions` member that asks for the PRF output. */
export function prfExtension(): AuthenticationExtensionsClientInputs {
    return { prf: { eval: { first: prfInput() } } } as unknown as AuthenticationExtensionsClientInputs;
}

/** Tells the platform to forget a passkey the server never stored (if the browser supports it). */
export async function forgetUnusedPasskey(rpId: string, credentialId: string): Promise<void> {
    const pkc = window.PublicKeyCredential as unknown as { signalUnknownCredential?: (o: { rpId: string; credentialId: string }) => Promise<void> };
    try {
        await pkc.signalUnknownCredential?.({ rpId, credentialId });
    } catch {
        // best effort only
    }
}
