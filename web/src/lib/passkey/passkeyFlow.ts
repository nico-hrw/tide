/**
 * Passkey flows: add a passkey (with its vault envelope), sign in with it, open the vault with it
 * for "PIN vergessen?". Everything that needs the PRF output happens here, on the device.
 */
import { requestKeyProof } from '@/lib/recovery/keyProof';
import type { AuthOpts } from '@/lib/recovery/recoveryApi';
import { passkeyLoginOptions, passkeyLoginVerify, passkeyRegisterFinish, passkeyRegisterOptions, type PasskeyLoginData } from './passkeyApi';
import { buildPasskeyEnvelope, openPasskeyEnvelope, passkeyEnvelopes, PasskeyEnvelopeError, withPasskeyEnvelope } from './passkeyEnvelope';
import { forgetUnusedPasskey, prfExtension, prfMaybeEnabled, prfResult } from './passkeySupport';
import { assertionToJSON, b64urlToBytes, creationToJSON, toCreationOptions, toRequestOptions } from './webauthnJson';

export class PasskeyPrfUnsupportedError extends Error {
    constructor() {
        super('Dieses Gerät bzw. dieser Browser kann mit Passkeys keinen Tresor-Schlüssel ableiten (PRF fehlt). Der Passkey wurde nicht eingerichtet; Anmeldung und Wiederherstellung bleiben bei Mail-Code, PIN und Wiederherstellungsschlüssel.');
        this.name = 'PasskeyPrfUnsupportedError';
    }
}

export class PasskeyCancelledError extends Error {
    constructor() {
        super('Der Passkey-Dialog wurde abgebrochen.');
        this.name = 'PasskeyCancelledError';
    }
}

async function webauthn<T>(op: () => Promise<T | null>): Promise<T> {
    try {
        const out = await op();
        if (!out) throw new PasskeyCancelledError();
        return out;
    } catch (err) {
        if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')) throw new PasskeyCancelledError();
        throw err;
    }
}

/** PRF output for one known credential via a local get() (the assertion is not sent anywhere). */
async function prfForCredential(rpId: string | undefined, credentialIds: string[]): Promise<{ credentialId: string; prf: ArrayBuffer | null }> {
    const cred = await webauthn(() => navigator.credentials.get({
        publicKey: {
            challenge: window.crypto.getRandomValues(new Uint8Array(32)),
            rpId,
            allowCredentials: credentialIds.map((id) => ({ id: b64urlToBytes(id), type: 'public-key' as const })),
            userVerification: 'required',
            extensions: prfExtension(),
        },
    }) as Promise<PublicKeyCredential | null>);
    return { credentialId: cred.id, prf: prfResult(cred) };
}

/**
 * Adds a passkey: create it with PRF, get the PRF output (some platforms only give it on get()),
 * wrap the extractable private key, prove key possession and store passkey + envelope together.
 */
export async function registerPasskey(params: {
    privateKey: CryptoKey;
    email: string;
    name: string;
    currentRecoveryVault: string | null;
}, opts?: AuthOpts): Promise<void> {
    const options = await passkeyRegisterOptions(opts);
    const rpId = options.publicKey.rp.id;
    const cred = await webauthn(() => navigator.credentials.create({
        publicKey: { ...toCreationOptions(options.publicKey), extensions: prfExtension() },
    }) as Promise<PublicKeyCredential | null>);

    let prf = prfResult(cred);
    if (!prf && prfMaybeEnabled(cred)) {
        prf = (await prfForCredential(rpId, [cred.id])).prf;
    }
    if (!prf) {
        if (rpId) await forgetUnusedPasskey(rpId, cred.id);
        throw new PasskeyPrfUnsupportedError();
    }
    const envelope = await buildPasskeyEnvelope({ privateKey: params.privateKey, prf, credentialId: cred.id, email: params.email });
    const recoveryVault = withPasskeyEnvelope(params.currentRecoveryVault, envelope);
    const proof = await requestKeyProof(params.privateKey, opts?.token);
    await passkeyRegisterFinish({ ceremonyId: options.ceremony_id, name: params.name, credential: creationToJSON(cred), recoveryVault, proof }, opts);
}

export interface PasskeySignIn {
    data: PasskeyLoginData;
    privateKey: CryptoKey;
    email: string | null;
}

/**
 * Sign-in with a passkey instead of mail code + PIN. Without a PRF output nothing is sent to the
 * server (no session is created). If the envelope cannot be opened, the error says so and the caller
 * falls back to mail code + PIN.
 */
export async function signInWithPasskey(): Promise<PasskeySignIn> {
    const options = await passkeyLoginOptions();
    const cred = await webauthn(() => navigator.credentials.get({
        publicKey: { ...toRequestOptions(options.publicKey), extensions: prfExtension() },
    }) as Promise<PublicKeyCredential | null>);
    const prf = prfResult(cred);
    if (!prf) throw new PasskeyPrfUnsupportedError();
    const data = await passkeyLoginVerify(options.ceremony_id, assertionToJSON(cred));
    const envelope = passkeyEnvelopes(data.recovery_vault).find((e) => e.credentialId === data.credential_id);
    if (!envelope) throw new PasskeyEnvelopeError('Für diesen Passkey ist kein Tresor-Zugang hinterlegt.');
    const { privateKey, email } = await openPasskeyEnvelope(envelope, prf, false);
    return { data, privateKey, email };
}

/** "PIN vergessen?": opens the vault (extractable) with one of the account's passkeys. */
export async function openVaultWithPasskey(recoveryVault: string): Promise<CryptoKey> {
    const envelopes = passkeyEnvelopes(recoveryVault);
    if (envelopes.length === 0) throw new PasskeyEnvelopeError('Für dieses Konto ist kein Passkey hinterlegt.');
    const rpId = (await passkeyLoginOptions()).publicKey.rpId;
    const { credentialId, prf } = await prfForCredential(rpId, envelopes.map((e) => e.credentialId));
    if (!prf) throw new PasskeyPrfUnsupportedError();
    const envelope = envelopes.find((e) => e.credentialId === credentialId);
    if (!envelope) throw new PasskeyEnvelopeError();
    return (await openPasskeyEnvelope(envelope, prf, true)).privateKey;
}
