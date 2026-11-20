import type { Node as PmNode } from '@tiptap/pm/model';
import { buildScope, isDefinition, parseDefinitions, type Definition } from '@/lib/formula/scope';
import type { CalcScope } from '@/lib/formula/tableCalc';

export const VARIABLES_NODE = 'variablesBlock';

/** Maximum number of snapshot entries read from a note (they can come from other people). */
const MAX_SNAPSHOT = 500;

/** Local definitions (all variables blocks of the note) and the copies of globals stored for sharing. */
export function collectDocDefinitions(doc: PmNode): { local: Definition[]; snapshot: Definition[] } {
    const local: Definition[] = [];
    const snapshot: Definition[] = [];
    doc.descendants((node) => {
        if (node.type.name !== VARIABLES_NODE) return true;
        local.push(...parseDefinitions(String(node.attrs.code ?? '')));
        const snap: unknown = node.attrs.snapshot;
        if (Array.isArray(snap)) {
            for (const d of snap.slice(0, MAX_SNAPSHOT)) if (isDefinition(d)) snapshot.push({ ...d, global: true });
        }
        return false;
    });
    return { local, snapshot };
}

/** Scope for formulas in this document: local, then the central registry (lazy), then the shared copy, then stdlib. */
export function scopeForDoc(doc: PmNode, global: () => Definition[]): CalcScope {
    const { local, snapshot } = collectDocDefinitions(doc);
    return buildScope({ local, global, snapshot });
}
