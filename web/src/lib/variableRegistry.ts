import type { Definition } from '@/lib/formula/scope';

/** One global variable or function in the central registry. `sourceNoteId` is the note that owns it (null: created in the popup). */
export interface RegistryEntry extends Definition {
    sourceNoteId: string | null;
}

/** Where the registry lives (an encrypted file in production, a fake in tests). */
export interface RegistryStorage {
    load(): Promise<RegistryEntry[]>;
    save(entries: RegistryEntry[]): Promise<void>;
}

type Op =
    | { t: 'note'; noteId: string; defs: Definition[] }
    | { t: 'removeNote'; noteId: string }
    | { t: 'set'; def: Definition }
    | { t: 'rm'; name: string };

function applyOp(list: RegistryEntry[], op: Op): RegistryEntry[] {
    switch (op.t) {
        case 'note':
            return [
                ...list.filter((e) => e.sourceNoteId !== op.noteId),
                ...op.defs.map((d): RegistryEntry => ({ ...d, global: true, sourceNoteId: op.noteId })),
            ];
        case 'removeNote':
            return list.filter((e) => e.sourceNoteId !== op.noteId);
        case 'set':
            return [
                ...list.filter((e) => !(e.sourceNoteId === null && e.name === op.def.name)),
                { ...op.def, global: true, sourceNoteId: null },
            ];
        case 'rm':
            return list.filter((e) => !(e.sourceNoteId === null && e.name === op.name));
    }
}

/**
 * Central registry of global variables. Read lazily (the encrypted file is only opened when a formula needs a name it
 * cannot resolve locally) and written as read-modify-write so edits from other devices are not overwritten.
 */
export class VariableRegistry {
    private entries: RegistryEntry[] = [];
    private loaded = false;
    private loading: Promise<void> | null = null;
    private pending: Op[] = [];
    private timer: ReturnType<typeof setTimeout> | null = null;
    private listeners = new Set<() => void>();

    constructor(private readonly storage: RegistryStorage, private readonly debounceMs = 1000) {}

    isLoaded(): boolean { return this.loaded; }

    subscribe(cb: () => void): () => void {
        this.listeners.add(cb);
        return () => { this.listeners.delete(cb); };
    }

    private notify() { this.listeners.forEach((cb) => cb()); }

    ensureLoaded(): Promise<void> {
        if (this.loaded) return Promise.resolve();
        if (!this.loading) {
            this.loading = this.storage.load().then(
                (list) => { this.entries = list; this.loaded = true; this.loading = null; this.notify(); },
                () => { this.loading = null; }, // offline or locked: stay unloaded, a later read retries
            );
        }
        return this.loading;
    }

    /** Synchronous view for the formula scope. Not loaded yet: returns nothing and starts loading (subscribers are told when ready). */
    definitions(): Definition[] {
        if (!this.loaded) { void this.ensureLoaded(); return []; }
        return this.entries.map(({ sourceNoteId: _src, ...d }) => d);
    }

    allEntries(): RegistryEntry[] { return [...this.entries]; }

    private queue(op: Op) {
        if (op.t === 'note' || op.t === 'removeNote') {
            this.pending = this.pending.filter((p) => !((p.t === 'note' || p.t === 'removeNote') && p.noteId === op.noteId));
        }
        this.pending.push(op);
        this.entries = applyOp(this.entries, op);
        this.notify();
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => { void this.commit(); }, this.debounceMs);
    }

    /**
     * Makes the globals of a note (entries marked `global`) the registry's entries for that note.
     * A note without globals does not open the registry unless `force` is set (e.g. the user just un-marked one).
     */
    async syncNote(noteId: string, defs: Definition[], opts: { force?: boolean } = {}): Promise<void> {
        const globals = defs.filter((d) => d.global);
        if (!this.loaded && globals.length === 0 && !opts.force) return;
        await this.ensureLoaded();
        this.queue({ t: 'note', noteId, defs: globals });
    }

    async removeNote(noteId: string): Promise<void> {
        await this.ensureLoaded();
        if (
            this.loaded &&
            !this.entries.some((e) => e.sourceNoteId === noteId) &&
            !this.pending.some((op) => op.t === 'note' && op.noteId === noteId)
        ) {
            return;
        }
        this.queue({ t: 'removeNote', noteId });
    }

    async setManual(def: Definition): Promise<void> {
        await this.ensureLoaded();
        this.queue({ t: 'set', def });
    }

    async removeManual(name: string): Promise<void> {
        await this.ensureLoaded();
        this.queue({ t: 'rm', name });
    }

    /** Saves pending edits now (e.g. before the page closes). */
    async flush(): Promise<void> {
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        if (this.pending.length) await this.commit();
    }

    private async commit(): Promise<void> {
        this.timer = null;
        const ops = this.pending;
        if (!ops.length) return;
        this.pending = [];
        try {
            const remote = await this.storage.load();
            const merged = ops.reduce(applyOp, remote);
            if (JSON.stringify(merged) === JSON.stringify(remote)) {
                this.entries = this.pending.reduce(applyOp, merged);
                this.loaded = true;
                this.notify();
                return;
            }
            await this.storage.save(merged);
            this.entries = this.pending.reduce(applyOp, merged); // edits made while saving stay visible
            this.loaded = true;
            this.notify();
        } catch {
            this.pending = [...ops, ...this.pending]; // keep the edits, try again on the next change or flush
        }
    }
}
