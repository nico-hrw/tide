/**
 * Bridge between a note's VarSheet and the formulas inside that note.
 * The VarSheet publishes its evaluated symbols here; the note's formula scope reads them.
 */

type Bindings = ReadonlyMap<string, unknown>;

const bindingsByNote = new Map<string, Bindings>();
const bindingListeners = new Set<() => void>();
const sheetListeners = new Set<(noteId: string) => void>();

function sameBindings(a: Bindings | undefined, b: Bindings): boolean {
    if (!a || a.size !== b.size) return false;
    for (const [k, v] of b) if (!a.has(k) || !Object.is(a.get(k), v)) return false;
    return true;
}

/** Symbols the note's formulas can use; undefined when the note has none. */
export function getNoteBindings(noteId: string): Bindings | undefined {
    return bindingsByNote.get(noteId);
}

/** Stores the evaluated symbols of a note. Listeners are only notified when something actually changed. */
export function publishNoteBindings(noteId: string, bindings: Bindings): void {
    const prev = bindingsByNote.get(noteId);
    if (bindings.size === 0) {
        if (!prev) return;
        bindingsByNote.delete(noteId);
    } else {
        if (sameBindings(prev, bindings)) return;
        bindingsByNote.set(noteId, bindings);
    }
    bindingListeners.forEach((cb) => cb());
}

export function clearNoteBindings(noteId: string): void {
    publishNoteBindings(noteId, new Map());
}

/** Called whenever any note's published symbols change. Returns an unsubscribe function. */
export function subscribeNoteBindings(cb: () => void): () => void {
    bindingListeners.add(cb);
    return () => { bindingListeners.delete(cb); };
}

/** The VarSheet of a note was saved (rows added, edited, moved or deleted). */
export function notifySheetChanged(noteId: string): void {
    sheetListeners.forEach((cb) => cb(noteId));
}

/** Called after a note's VarSheet was saved. Returns an unsubscribe function. */
export function onSheetChanged(cb: (noteId: string) => void): () => void {
    sheetListeners.add(cb);
    return () => { sheetListeners.delete(cb); };
}
