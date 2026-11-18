// Bookkeeping for the Yjs documents of open notes.
//
// A snapshot written from the wrong document destroys data: the empty doc of a tab that was just
// opened, the doc of another note, or a doc whose server state could not be read (wrong key) must
// never be saved over the real note. The editor registers each doc with its note, and the provider
// reports whether the server state was loaded completely; saving checks both.

import type * as Y from 'yjs';

const owners = new WeakMap<Y.Doc, string>();
const hydration = new WeakMap<Y.Doc, boolean>();

export function setDocNote(doc: Y.Doc, noteId: string): void {
    owners.set(doc, noteId);
}

export function getDocNote(doc: Y.Doc): string | undefined {
    return owners.get(doc);
}

/** Called by the provider after its bootstrap: false when snapshot or updates could not be read. */
export function setDocHydrated(doc: Y.Doc, ok: boolean): void {
    hydration.set(doc, ok);
}

/** Why a doc must not be saved as the state of `noteId`, or null when saving is fine. */
export function whyNotSavable(doc: Y.Doc, noteId: string): string | null {
    const owner = owners.get(doc);
    if (owner !== undefined && owner !== noteId) return `doc belongs to note ${owner}, not ${noteId}`;
    if (hydration.get(doc) === false) return 'server state could not be loaded into this doc';
    return null;
}
