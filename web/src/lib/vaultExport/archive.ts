// Reads and validates a vault export archive before the importer writes anything.

import type { TaskItem } from '@/store/useDataStore';
import { readZip } from './zip';
import { VAULT_EXPORT_FORMAT, VAULT_EXPORT_VERSION, type VaultFileRecord, type VaultManifest } from './types';

export interface VaultArchive {
    manifest: VaultManifest;
    files: VaultFileRecord[];
    tasks: TaskItem[];
    /** Raw bytes of an archive entry; throws when the path is missing. */
    bytes(path: string): Uint8Array;
    text(path: string): string;
}

const decoder = new TextDecoder();

function parseJson<T>(raw: Uint8Array | undefined, what: string): T {
    if (!raw) throw new Error(`${what} fehlt im Archiv.`);
    try {
        return JSON.parse(decoder.decode(raw)) as T;
    } catch {
        throw new Error(`${what} ist beschädigt.`);
    }
}

/** Throws a German, user-facing error when the archive is not a complete, supported export. */
export function openVaultArchive(zipBytes: Uint8Array): VaultArchive {
    const entries = new Map(readZip(zipBytes).map((e) => [e.path, e.data]));
    const manifest = parseJson<VaultManifest>(entries.get('manifest.json'), 'manifest.json');
    if (manifest.format !== VAULT_EXPORT_FORMAT) throw new Error('Das ist kein Tide-Export.');
    if (manifest.version > VAULT_EXPORT_VERSION) throw new Error(`Der Export hat Version ${manifest.version}. Diese App versteht nur Version ${VAULT_EXPORT_VERSION}.`);
    const files = parseJson<{ files: VaultFileRecord[] }>(entries.get('tree.json'), 'tree.json').files;
    if (!Array.isArray(files)) throw new Error('tree.json ist beschädigt.');
    const tasks = parseJson<TaskItem[]>(entries.get('tasks.json'), 'tasks.json');
    if (!Array.isArray(tasks)) throw new Error('tasks.json ist beschädigt.');

    const counts: Record<string, number> = {};
    const seen = new Set<string>();
    for (const f of files) {
        if (seen.has(f.id)) throw new Error(`Doppelte Datei-ID im Archiv: ${f.id}`);
        seen.add(f.id);
        counts[f.type] = (counts[f.type] ?? 0) + 1;
        for (const p of [f.contentPath, f.ydocPath, ...f.assets.map((a) => a.path)]) {
            if (p && !entries.has(p)) throw new Error(`Im Archiv fehlt ${p}.`);
        }
    }
    const expected = JSON.stringify(Object.entries(manifest.counts).sort());
    if (JSON.stringify(Object.entries(counts).sort()) !== expected) throw new Error('Die Zählung in manifest.json passt nicht zu tree.json.');
    if (manifest.taskCount !== tasks.length) throw new Error('Die Todo-Zahl in manifest.json passt nicht zu tasks.json.');

    const bytes = (path: string): Uint8Array => {
        const data = entries.get(path);
        if (!data) throw new Error(`Im Archiv fehlt ${path}.`);
        return data;
    };
    return { manifest, files, tasks, bytes, text: (path) => decoder.decode(bytes(path)) };
}
