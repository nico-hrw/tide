// Persistence of the open tabs (sessionStorage) without volatile data.
//
// Tabs carry `content` (the editor document as it was when the tab was left) and `_fileKey` (the
// note's CryptoKey) as in-memory caches. A CryptoKey serialises to `{}` and the content is stale
// after a reload, so neither may be restored: the key would be an object that is no key (the Yjs
// provider then fails to decrypt the snapshot and the note opens empty) and the stale content would
// be shown instead of the saved note. After a restore a note tab is always loaded from the server.

/** Fields that only make sense while the page is alive. */
const VOLATILE_KEYS = ['content', '_fileKey', '_saveStatus'] as const;

type TabLike = Record<string, unknown>;

/** Tab list as it is written to storage: no cached content, no key. */
export function serializeTabsForStorage(tabs: readonly TabLike[]): string {
    return JSON.stringify(tabs.map((tab) => stripVolatile(tab)));
}

/** Cleans a tab list read from storage; also removes volatile fields written by older versions. */
export function sanitizeRestoredTabs<T extends TabLike>(tabs: readonly T[]): T[] {
    return tabs.map((tab) => stripVolatile(tab) as T);
}

function stripVolatile<T extends TabLike>(tab: T): T {
    const clean: TabLike = { ...tab };
    for (const key of VOLATILE_KEYS) delete clean[key];
    return clean as T;
}

/** A usable file key is a real CryptoKey; `{}` from a JSON round trip is not. */
export function isCryptoKey(value: unknown): value is CryptoKey {
    return typeof CryptoKey !== 'undefined' && value instanceof CryptoKey;
}

/** The cached content of a tab may only be reused while its live key is still known. */
export function canReuseTabCache(tab: { content?: unknown; _fileKey?: unknown } | undefined): boolean {
    return !!tab && !!tab.content && isCryptoKey(tab._fileKey);
}
