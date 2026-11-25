// Rewrites references from old ids to new ids inside JSON values and Yjs documents, and swaps the
// image keys of re-uploaded assets. Used by the vault import: every file gets a fresh id and every
// image a fresh key, and everything that pointed at the old ones must follow.

import * as Y from 'yjs';

export interface NewAssetRef {
    assetId: string;
    bekBase64: string;
    ivBase64: string;
    mimeType: string;
}

export interface RewriteContext {
    /** old id -> new id for files, tags, todos and assets. */
    ids: Map<string, string>;
    /** old asset id -> new upload (new id, key, iv). */
    assets: Map<string, NewAssetRef>;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Replaces every known old id inside a string (ids may sit inside links such as tide://note/<id>). */
export function rewriteString(text: string, ids: Map<string, string>): string {
    return text.replace(UUID, (m) => ids.get(m) ?? ids.get(m.toLowerCase()) ?? m);
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function assetFor(o: Record<string, unknown>, ctx: RewriteContext): NewAssetRef | undefined {
    for (const key of ['assetId', 'blobId']) {
        const v = o[key];
        if (typeof v === 'string') {
            const hit = ctx.assets.get(v);
            if (hit) return hit;
        }
    }
    return undefined;
}

/** Deep copy of a JSON value with ids rewritten; asset records receive their new id, key and iv. */
export function rewriteJson<T>(value: T, ctx: RewriteContext): T {
    const walk = (v: unknown): unknown => {
        if (typeof v === 'string') return rewriteString(v, ctx.ids);
        if (Array.isArray(v)) return v.map(walk);
        if (!isObj(v)) return v;
        const asset = assetFor(v, ctx);
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(v)) out[rewriteString(k, ctx.ids)] = walk(val);
        if (asset) {
            for (const k of ['assetId', 'blobId']) if (k in out) out[k] = asset.assetId;
            for (const k of ['bekBase64', 'bek']) if (k in out) out[k] = asset.bekBase64;
            for (const k of ['ivBase64', 'iv']) if (k in out) out[k] = asset.ivBase64;
        }
        return out;
    };
    return walk(value) as T;
}

function rewriteYMap(map: Y.Map<unknown>, ctx: RewriteContext): void {
    // Asset records held as Y.Map (canvas elements) are patched field by field.
    const own: Record<string, unknown> = {};
    for (const key of ['assetId', 'blobId']) own[key] = map.get(key);
    const asset = assetFor(own, ctx);
    if (asset) {
        for (const k of ['assetId', 'blobId']) if (map.has(k)) map.set(k, asset.assetId);
        for (const k of ['bekBase64', 'bek']) if (map.has(k)) map.set(k, asset.bekBase64);
        for (const k of ['ivBase64', 'iv']) if (map.has(k)) map.set(k, asset.ivBase64);
    }
    for (const [key, val] of Array.from(map.entries())) {
        if (val instanceof Y.Map) {
            rewriteYMap(val, ctx);
        } else if (val instanceof Y.Array) {
            rewriteYArray(val, ctx);
        } else if (val instanceof Y.AbstractType) {
            continue; // text and other types carry no references
        } else {
            const next = rewriteJson(val, ctx);
            const newKey = rewriteString(key, ctx.ids);
            if (newKey !== key) {
                map.delete(key);
                map.set(newKey, next);
            } else if (JSON.stringify(next) !== JSON.stringify(val)) {
                map.set(key, next);
            }
        }
    }
}

function rewriteYArray(arr: Y.Array<unknown>, ctx: RewriteContext): void {
    arr.forEach((item, i) => {
        if (item instanceof Y.Map) return rewriteYMap(item, ctx);
        if (item instanceof Y.Array) return rewriteYArray(item, ctx);
        if (item instanceof Y.AbstractType) return;
        const next = rewriteJson(item, ctx);
        if (JSON.stringify(next) !== JSON.stringify(item)) {
            arr.delete(i, 1);
            arr.insert(i, [next]);
        }
    });
}

function rewriteXml(node: Y.XmlFragment | Y.XmlElement, ctx: RewriteContext): void {
    if (node instanceof Y.XmlElement) {
        for (const [name, value] of Object.entries(node.getAttributes())) {
            if (typeof value === 'string') {
                const next = rewriteString(value, ctx.ids);
                if (next !== value) node.setAttribute(name, next);
            }
        }
    }
    for (const child of node.toArray()) {
        if (child instanceof Y.XmlElement) rewriteXml(child, ctx);
    }
}

/** Rewrites ids and image keys in the note document in place (maps `assets`, `canvas`, `overlay` and the editor tree). */
export function rewriteYDoc(doc: Y.Doc, ctx: RewriteContext): void {
    doc.transact(() => {
        for (const name of ['assets', 'canvas', 'overlay']) rewriteYMap(doc.getMap(name), ctx);
        rewriteXml(doc.getXmlFragment('prosemirror'), ctx);
    });
}
