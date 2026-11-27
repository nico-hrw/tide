/**
 * Links between notes (@-mentions of notes), as ids only. Pure helpers: no store, no network.
 *
 * Privacy rules, kept in one place:
 *  - Only ids are ever kept, never titles or text. Titles are looked up from the notes the signed-in user can
 *    already see, at the moment a graph is built.
 *  - A link only counts when BOTH ends are notes the user can see right now. A link to a note that is gone,
 *    belongs to somebody else without being shared, or is locked by a PIN is dropped, so it never shows up as a
 *    dangling dot, a title, or a number on its neighbour.
 */

export interface DocNodeLike {
    type?: string;
    attrs?: Record<string, unknown>;
    content?: DocNodeLike[];
}

/** The part of a store note the graph needs. `visible` is decided by the caller (store, PIN lock, trash). */
export interface GraphNoteInput {
    id: string;
    title: string;
}

export interface GraphNode {
    id: string;
    title: string;
    /** Links touching this note, incoming and outgoing together (A to B and B to A count twice). */
    degree: number;
}

export interface GraphEdge {
    a: string;
    b: string;
    /** 1 for one direction, 2 when both notes link to each other. */
    weight: number;
}

export interface NoteGraph {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export type LinkIndex = Record<string, string[]>;

/** Ids of the notes an editor document links to (note mentions only), without duplicates and without itself. */
export function extractNoteLinkTargets(doc: unknown, selfId: string): string[] {
    const found = new Set<string>();
    const walk = (node: unknown) => {
        if (!node || typeof node !== 'object') return;
        const n = node as DocNodeLike;
        if (n.type === 'mention' && n.attrs) {
            const kind = n.attrs.type ?? 'note';
            const id = n.attrs.id;
            const ghost = n.attrs.isGhost === true || n.attrs.isGhost === 'true';
            if (kind === 'note' && !ghost && typeof id === 'string' && id.length > 0 && !id.startsWith('ghost-') && id !== selfId) {
                found.add(id);
            }
        }
        if (Array.isArray(n.content)) n.content.forEach(walk);
    };
    walk(doc);
    return Array.from(found);
}

/** Same ids in the same order? Used to tell whether a note's links changed. */
export function sameIds(a: readonly string[] | undefined, b: readonly string[]): boolean {
    if (!a || a.length !== b.length) return false;
    const set = new Set(a);
    return b.every((x) => set.has(x));
}

/**
 * Builds the graph from the visible notes and the link index. Every note is a node (unlinked ones too);
 * links whose source or target is not in `notes` are ignored.
 */
export function buildNoteGraph(notes: readonly GraphNoteInput[], index: LinkIndex): NoteGraph {
    const byId = new Map<string, GraphNode>();
    for (const n of notes) byId.set(n.id, { id: n.id, title: n.title, degree: 0 });

    const edges = new Map<string, GraphEdge>();
    for (const [source, targets] of Object.entries(index)) {
        if (!byId.has(source)) continue;
        for (const target of targets) {
            if (target === source || !byId.has(target)) continue;
            const [a, b] = source < target ? [source, target] : [target, source];
            const key = `${a}|${b}`;
            const existing = edges.get(key);
            if (existing) existing.weight = 2;
            else edges.set(key, { a, b, weight: 1 });
            byId.get(source)!.degree += 1;
            byId.get(target)!.degree += 1;
        }
    }
    return { nodes: Array.from(byId.values()), edges: Array.from(edges.values()) };
}

/** The note, its linked notes and (up to `limit` in total) their neighbours. Used for the island's small view. */
export function neighbourhood(graph: NoteGraph, centerId: string, limit = 14): NoteGraph {
    const adj = new Map<string, Set<string>>();
    for (const e of graph.edges) {
        if (!adj.has(e.a)) adj.set(e.a, new Set());
        if (!adj.has(e.b)) adj.set(e.b, new Set());
        adj.get(e.a)!.add(e.b);
        adj.get(e.b)!.add(e.a);
    }
    const picked = new Set<string>();
    if (graph.nodes.some((n) => n.id === centerId)) picked.add(centerId);
    const first = Array.from(adj.get(centerId) ?? []);
    for (const id of first) if (picked.size < limit) picked.add(id);
    for (const id of first) {
        for (const next of adj.get(id) ?? []) if (picked.size < limit) picked.add(next);
    }
    return {
        nodes: graph.nodes.filter((n) => picked.has(n.id)),
        edges: graph.edges.filter((e) => picked.has(e.a) && picked.has(e.b)),
    };
}

/** Drops index entries of notes that no longer exist (and links to them). Returns the same object when nothing changed. */
export function pruneIndex(index: LinkIndex, existingIds: ReadonlySet<string>): LinkIndex {
    let changed = false;
    const out: LinkIndex = {};
    for (const [source, targets] of Object.entries(index)) {
        if (!existingIds.has(source)) { changed = true; continue; }
        const kept = targets.filter((t) => existingIds.has(t));
        if (kept.length !== targets.length) changed = true;
        out[source] = kept;
    }
    return changed ? out : index;
}
