import { createEncryptedSingletonStorage, type SingletonKeys } from './encryptedSingletonStorage';
import { isDefinition } from './formula/scope';
import type { RegistryEntry, RegistryStorage } from './variableRegistry';

/** Server file type of the registry file (a free-form TEXT column, no schema change needed). */
export const REGISTRY_FILE_TYPE = 'variables';

export type RegistryKeys = SingletonKeys;

function toEntries(raw: unknown): RegistryEntry[] {
    if (!Array.isArray(raw)) return [];
    const out: RegistryEntry[] = [];
    for (const e of raw) {
        if (!isDefinition(e)) continue;
        const src = (e as { sourceNoteId?: unknown }).sourceNoteId;
        if (src !== null && typeof src !== 'string') continue;
        out.push({ name: e.name, expr: e.expr, ...(e.params ? { params: e.params } : {}), global: true, sourceNoteId: src });
    }
    return out;
}

/**
 * The registry as one encrypted file (same pattern as the search index): content is AES-GCM encrypted with a DEK that is
 * RSA-wrapped for the user. The server only ever sees ciphertext. `getKeys` returns null while the vault is locked.
 */
export function createApiRegistryStorage(getKeys: () => RegistryKeys | null): RegistryStorage {
    return createEncryptedSingletonStorage<RegistryEntry[]>(getKeys, {
        type: REGISTRY_FILE_TYPE,
        label: 'variables',
        blobName: 'registry',
        downloadName: 'variable registry',
        empty: () => [],
        parse: (text) => toEntries(JSON.parse(text)),
    });
}
