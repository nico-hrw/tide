export interface LinePatchOp {
    lineIndex: number;
    deleteCount: number;
    insertLines: string[];
}

export interface DiffChange {
    type: 'added' | 'removed' | 'equal';
    text: string;
}

export interface DiffStats {
    addedChars: number;
    removedChars: number;
    addedWords: number;
    removedWords: number;
    hasChanges: boolean;
}

interface RawDiffOp<T> { type: 'added' | 'removed' | 'equal'; value: T; }
interface CharSegment { kind: 'equal' | 'edit'; text: string; removed: string; added: string; }
interface TipTapNodeLike {
    type?: string;
    text?: string;
    attrs?: {
        alt?: string; title?: string; code?: string; label?: string; isoDate?: string;
        id?: string; eventId?: string; viewId?: string; anchorId?: string;
        checked?: boolean; inkStrokes?: unknown[];
    };
    content?: unknown[];
}

const TOKEN_SPLIT_RE = /(\r\n|\n|[ \t]+|[\p{L}\p{N}_]+|[^\p{L}\p{N}_\s])/gu;
const WORD_MATCH_RE = /[\p{L}\p{N}_]+/gu;
const WORD_ONLY_RE = /^[\p{L}\p{N}_]+$/u;
const HAS_WORD_CHAR_RE = /[\p{L}\p{N}_]/u;
const WS_ONLY_RE = /^\s+$/;
const HORIZ_WS_ONLY_RE = /^[ \t]+$/;
const BLANK_LINE_END_RE = /\n\r?\n$/;
const BLANK_LINE_START_RE = /^\r?\n\r?\n/;
const SENTENCE_END_RE = /[.!?]$/;

/** Bounded Myers diff engine with O(min(N,M)) prefix/suffix trim and graceful fallback. */
function myersDiff<T>(a: T[], b: T[], maxD = 2000): RawDiffOp<T>[] {
    const aLen = a.length;
    const bLen = b.length;
    let prefix = 0;
    while (prefix < aLen && prefix < bLen && a[prefix] === b[prefix]) prefix++;

    let suffix = 0;
    while (suffix < aLen - prefix && suffix < bLen - prefix && a[aLen - 1 - suffix] === b[bLen - 1 - suffix]) suffix++;

    const out: RawDiffOp<T>[] = [];
    for (let i = 0; i < prefix; i++) out.push({ type: 'equal', value: a[i] });

    const aMid = a.slice(prefix, aLen - suffix);
    const bMid = b.slice(prefix, bLen - suffix);

    if (aMid.length === 0) {
        for (const item of bMid) out.push({ type: 'added', value: item });
    } else if (bMid.length === 0) {
        for (const item of aMid) out.push({ type: 'removed', value: item });
    } else {
        for (const op of myersMiddle(aMid, bMid, maxD)) out.push(op);
    }

    for (let i = aLen - suffix; i < aLen; i++) out.push({ type: 'equal', value: a[i] });
    return out;
}

function fallbackMiddle<T>(a: T[], b: T[]): RawDiffOp<T>[] {
    const out: RawDiffOp<T>[] = [];
    for (const item of a) out.push({ type: 'removed', value: item });
    for (const item of b) out.push({ type: 'added', value: item });
    return out;
}

function myersMiddle<T>(a: T[], b: T[], maxD: number): RawDiffOp<T>[] {
    const n = a.length;
    const m = b.length;
    const total = n + m;
    if (total > 20000) return fallbackMiddle(a, b);

    const max = Math.min(total, maxD);
    const offset = max;
    const v = new Int32Array(2 * max + 1);
    const trace: Int32Array[] = [];
    let foundD = -1;

    for (let d = 0; d <= max; d++) {
        if (d > 0) trace.push(v.slice(offset - (d - 1), offset + d));
        for (let k = -d; k <= d; k += 2) {
            let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])
                ? v[offset + k + 1]
                : v[offset + k - 1] + 1;
            let y = x - k;
            while (x < n && y < m && a[x] === b[y]) { x++; y++; }
            v[offset + k] = x;
            if (x >= n && y >= m) { foundD = d; break; }
        }
        if (foundD !== -1) break;
    }

    if (foundD === -1) return fallbackMiddle(a, b);

    const reversed: RawDiffOp<T>[] = [];
    let x = n;
    let y = m;
    for (let d = foundD; d >= 1; d--) {
        const prevV = trace[d - 1];
        const prevOffset = d - 1;
        const k = x - y;
        const prevK = k === -d || (k !== d && prevV[prevOffset + k - 1] < prevV[prevOffset + k + 1]) ? k + 1 : k - 1;
        const prevX = prevV[prevOffset + prevK];
        const prevY = prevX - prevK;

        while (x > prevX && y > prevY) {
            reversed.push({ type: 'equal', value: a[x - 1] });
            x--;
            y--;
        }
        reversed.push(x === prevX ? { type: 'added', value: b[y - 1] } : { type: 'removed', value: a[x - 1] });
        x = prevX;
        y = prevY;
    }
    while (x > 0 && y > 0) { reversed.push({ type: 'equal', value: a[x - 1] }); x--; y--; }
    reversed.reverse();
    return reversed;
}

/** Generates a line-based patch between oldStr and newStr. */
export function createLinePatch(oldStr: string, newStr: string): LinePatchOp[] {
    if (oldStr === newStr) return [];
    const rawOps = myersDiff(oldStr.split('\n'), newStr.split('\n'));
    const ops: LinePatchOp[] = [];
    let pending: LinePatchOp | null = null;
    let oldIdx = 0;

    for (const op of rawOps) {
        if (op.type === 'equal') {
            if (pending) { ops.push(pending); pending = null; }
            oldIdx++;
        } else if (op.type === 'removed') {
            pending ??= { lineIndex: oldIdx, deleteCount: 0, insertLines: [] };
            pending.deleteCount++;
            oldIdx++;
        } else {
            pending ??= { lineIndex: oldIdx, deleteCount: 0, insertLines: [] };
            pending.insertLines.push(op.value);
        }
    }
    if (pending) ops.push(pending);
    return ops;
}

/** Applies a line-based patch to sourceStr. */
export function applyLinePatch(sourceStr: string, patch: LinePatchOp[]): string {
    const lines = sourceStr.split('\n');
    const sorted = [...patch].sort((a, b) => b.lineIndex - a.lineIndex);
    for (const op of sorted) lines.splice(op.lineIndex, op.deleteCount, ...op.insertLines);
    return lines.join('\n');
}

function splitLinesKeepNewline(text: string): string[] {
    if (!text) return [];
    const lines: string[] = [];
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) === 10) { lines.push(text.slice(start, i + 1)); start = i + 1; }
    }
    if (start < text.length) lines.push(text.slice(start));
    return lines;
}

function rawOpsToChanges(ops: RawDiffOp<string>[]): DiffChange[] {
    const changes: DiffChange[] = [];
    for (const op of ops) {
        if (!op.value) continue;
        const last = changes[changes.length - 1];
        if (last && last.type === op.type) last.text += op.value;
        else changes.push({ type: op.type, text: op.value });
    }
    return changes;
}

/** Strips empty chunks, coalesces equals, and puts removed before added in every edit run. */
function normalizeChanges(changes: DiffChange[]): DiffChange[] {
    const out: DiffChange[] = [];
    let removedBuf = '';
    let addedBuf = '';
    const flushEdits = () => {
        if (removedBuf) { out.push({ type: 'removed', text: removedBuf }); removedBuf = ''; }
        if (addedBuf) { out.push({ type: 'added', text: addedBuf }); addedBuf = ''; }
    };

    for (const c of changes) {
        if (!c.text) continue;
        if (c.type === 'equal') {
            flushEdits();
            const last = out[out.length - 1];
            if (last && last.type === 'equal') last.text += c.text;
            else out.push({ type: 'equal', text: c.text });
        } else if (c.type === 'removed') removedBuf += c.text;
        else addedBuf += c.text;
    }
    flushEdits();
    return out;
}

function cleanupSemanticCharHunk(changes: DiffChange[]): DiffChange[] {
    const normalized = normalizeChanges(changes);
    const segments: CharSegment[] = [];
    for (let i = 0; i < normalized.length; i++) {
        const cur = normalized[i];
        if (cur.type === 'equal') {
            segments.push({ kind: 'equal', text: cur.text, removed: '', added: '' });
        } else if (cur.type === 'removed') {
            const next = normalized[i + 1];
            const added = next && next.type === 'added' ? (i++, next.text) : '';
            segments.push({ kind: 'edit', text: '', removed: cur.text, added });
        } else {
            segments.push({ kind: 'edit', text: '', removed: '', added: cur.text });
        }
    }

    let i = 1;
    while (i < segments.length - 1) {
        const [prev, cur, next] = [segments[i - 1], segments[i], segments[i + 1]];
        if (cur.kind === 'equal' && prev.kind === 'edit' && next.kind === 'edit') {
            const d1 = Array.from(prev.removed).length;
            const i1 = Array.from(prev.added).length;
            const d2 = Array.from(next.removed).length;
            const i2 = Array.from(next.added).length;
            const eLen = Array.from(cur.text).length;

            const hasBothOps = d1 + d2 > 0 && i1 + i2 > 0;
            const allNonWord =
                !HAS_WORD_CHAR_RE.test(prev.removed) && !HAS_WORD_CHAR_RE.test(prev.added) &&
                !HAS_WORD_CHAR_RE.test(next.removed) && !HAS_WORD_CHAR_RE.test(next.added);
            const preserveWordBridge = WORD_ONLY_RE.test(cur.text) && allNonWord;

            if (hasBothOps && !preserveWordBridge && eLen <= Math.max(d1, i1) && eLen <= Math.max(d2, i2)) {
                segments.splice(i - 1, 3, {
                    kind: 'edit',
                    text: '',
                    removed: prev.removed + cur.text + next.removed,
                    added: prev.added + cur.text + next.added,
                });
                i = Math.max(1, i - 1);
                continue;
            }
        }
        i++;
    }

    const out: DiffChange[] = [];
    for (const seg of segments) {
        if (seg.kind === 'equal') out.push({ type: 'equal', text: seg.text });
        else {
            if (seg.removed) out.push({ type: 'removed', text: seg.removed });
            if (seg.added) out.push({ type: 'added', text: seg.added });
        }
    }
    return normalizeChanges(out);
}

function refineCharHunk(removed: string, added: string): DiffChange[] {
    if (removed.length > 4000 || added.length > 4000) {
        return [{ type: 'removed', text: removed }, { type: 'added', text: added }];
    }

    const oldChars = Array.from(removed);
    const newChars = Array.from(added);
    const cleaned = cleanupSemanticCharHunk(rawOpsToChanges(myersDiff(oldChars, newChars)));

    let hasRemoved = false;
    let hasAdded = false;
    let totalEqualChars = 0;
    let equalNonWsChars = 0;
    let maxEqualRun = 0;

    for (const c of cleaned) {
        if (c.type === 'removed') hasRemoved = true;
        else if (c.type === 'added') hasAdded = true;
        else {
            const chars = Array.from(c.text);
            totalEqualChars += chars.length;
            if (chars.length > maxEqualRun) maxEqualRun = chars.length;
            for (const ch of chars) if (!WS_ONLY_RE.test(ch)) equalNonWsChars++;
        }
    }

    if ((!hasRemoved || !hasAdded) && totalEqualChars > 0) return cleaned;

    const denom = oldChars.length + newChars.length;
    const similarity = denom > 0 ? (2 * totalEqualChars) / denom : 0;
    if (totalEqualChars > 0 && similarity >= 0.5 && (maxEqualRun >= 2 || equalNonWsChars >= 2)) return cleaned;
    return [{ type: 'removed', text: removed }, { type: 'added', text: added }];
}

function semanticBoundaryScore(one: string, two: string): number {
    if (!one || !two) return 6;
    const c1 = one[one.length - 1];
    const c2 = two[0];
    if (BLANK_LINE_END_RE.test(one) || BLANK_LINE_START_RE.test(two)) return 5;
    if (c1 === '\n' || c2 === '\n' || c1 === '\r' || c2 === '\r') return 4;
    if (SENTENCE_END_RE.test(one)) return 3;
    if (WS_ONLY_RE.test(c1) || WS_ONLY_RE.test(c2)) return 2;
    if (!HAS_WORD_CHAR_RE.test(c1) || !HAS_WORD_CHAR_RE.test(c2)) return 1;
    return 0;
}

function commonSuffixLength(a: string, b: string): number {
    const aChars = Array.from(a);
    const bChars = Array.from(b);
    let i = aChars.length - 1;
    let j = bChars.length - 1;
    let codeUnits = 0;
    while (i >= 0 && j >= 0 && aChars[i] === bChars[j]) {
        codeUnits += aChars[i].length;
        i--;
        j--;
    }
    return codeUnits;
}

function firstCharLength(s: string): number {
    const cp = s.codePointAt(0);
    return cp !== undefined && cp > 0xffff ? 2 : 1;
}

/** Slides single-edit boundaries across identical flanking chars to the strongest semantic boundary. */
function cleanupSemanticLossless(changes: DiffChange[]): DiffChange[] {
    const out = changes.map((c) => ({ ...c }));
    for (let i = 1; i < out.length - 1; i++) {
        if (out[i].type === 'equal' || out[i - 1].type !== 'equal' || out[i + 1].type !== 'equal') continue;
        let [eq1, edit, eq2] = [out[i - 1].text, out[i].text, out[i + 1].text];

        const commonOffset = commonSuffixLength(eq1, edit);
        if (commonOffset > 0) {
            const suffix = edit.slice(edit.length - commonOffset);
            eq1 = eq1.slice(0, eq1.length - commonOffset);
            edit = suffix + edit.slice(0, edit.length - commonOffset);
            eq2 = suffix + eq2;
        }

        let [bestEq1, bestEdit, bestEq2] = [eq1, edit, eq2];
        let bestScore = semanticBoundaryScore(eq1, edit) + semanticBoundaryScore(edit, eq2);

        while (edit.length > 0 && eq2.length > 0) {
            const step1 = firstCharLength(edit);
            const step2 = firstCharLength(eq2);
            const ch = edit.slice(0, step1);
            if (ch !== eq2.slice(0, step2)) break;
            eq1 += ch;
            edit = edit.slice(step1) + ch;
            eq2 = eq2.slice(step2);

            const score = semanticBoundaryScore(eq1, edit) + semanticBoundaryScore(edit, eq2);
            if (score >= bestScore) {
                bestScore = score;
                [bestEq1, bestEdit, bestEq2] = [eq1, edit, eq2];
            }
        }
        [out[i - 1].text, out[i].text, out[i + 1].text] = [bestEq1, bestEdit, bestEq2];
    }
    return normalizeChanges(out);
}

function mergeMixedWhitespaceBridges(changes: DiffChange[]): DiffChange[] {
    const out = changes.map((c) => ({ ...c }));
    let i = 0;
    while (i + 4 < out.length) {
        const [r1, a1, eq, r2, a2] = [out[i], out[i + 1], out[i + 2], out[i + 3], out[i + 4]];
        if (r1.type === 'removed' && a1.type === 'added' && eq.type === 'equal' &&
            WS_ONLY_RE.test(eq.text) && r2.type === 'removed' && a2.type === 'added') {
            out.splice(i, 5,
                { type: 'removed', text: r1.text + eq.text + r2.text },
                { type: 'added', text: a1.text + eq.text + a2.text }
            );
            continue;
        }
        i++;
    }
    return out;
}

function dissolveHorizontalSpaceBridges(changes: DiffChange[]): DiffChange[] {
    return normalizeChanges(changes.flatMap((c, i): DiffChange[] =>
        i > 0 && i < changes.length - 1 && c.type === 'equal' && HORIZ_WS_ONLY_RE.test(c.text) &&
        changes[i - 1].type !== 'equal' && changes[i + 1].type !== 'equal'
            ? [{ type: 'removed', text: c.text }, { type: 'added', text: c.text }]
            : [c]
    ));
}

function refinePairedHunks(changes: DiffChange[], refine: (rem: string, add: string) => DiffChange[]): DiffChange[] {
    const out: DiffChange[] = [];
    for (let i = 0; i < changes.length; i++) {
        const cur = changes[i];
        const next = changes[i + 1];
        if (cur.type === 'removed' && next && next.type === 'added') {
            for (const c of refine(cur.text, next.text)) out.push(c);
            i++;
        } else {
            out.push(cur);
        }
    }
    return normalizeChanges(out);
}

/** Computes a multi-stage semantic diff between oldText and newText. */
export function diffWords(oldText: string, newText: string): DiffChange[] {
    if (oldText === newText) return oldText.length > 0 ? [{ type: 'equal', text: oldText }] : [];
    if (!oldText) return [{ type: 'added', text: newText }];
    if (!newText) return [{ type: 'removed', text: oldText }];

    const stage1 = normalizeChanges(
        rawOpsToChanges(myersDiff(splitLinesKeepNewline(oldText), splitLinesKeepNewline(newText)))
    );
    const stage2 = dissolveHorizontalSpaceBridges(refinePairedHunks(stage1, (rem, add) =>
        rawOpsToChanges(myersDiff(rem.split(TOKEN_SPLIT_RE).filter(Boolean), add.split(TOKEN_SPLIT_RE).filter(Boolean)))
    ));
    const stage3 = refinePairedHunks(stage2, refineCharHunk);
    return cleanupSemanticLossless(mergeMixedWhitespaceBridges(stage3));
}

/** Computes summary character and word statistics for a diff result. */
export function computeDiffStats(changes: DiffChange[]): DiffStats {
    let addedChars = 0;
    let removedChars = 0;
    let addedWords = 0;
    let removedWords = 0;
    for (const change of changes) {
        if (change.type === 'added') {
            addedChars += Array.from(change.text).length;
            addedWords += change.text.match(WORD_MATCH_RE)?.length ?? 0;
        } else if (change.type === 'removed') {
            removedChars += Array.from(change.text).length;
            removedWords += change.text.match(WORD_MATCH_RE)?.length ?? 0;
        }
    }
    return { addedChars, removedChars, addedWords, removedWords, hasChanges: addedChars > 0 || removedChars > 0 };
}

function asString(val: unknown): string { return typeof val === 'string' ? val : ''; }
function collectChildrenText(content: unknown[] | undefined): string {
    if (!Array.isArray(content)) return '';
    let text = '';
    for (const child of content) text += getPlainTextFromJSON(child);
    return text;
}

/** Extracts plain text from a TipTap JSON node recursively. */
export function getPlainTextFromJSON(node: unknown): string {
    if (!node || typeof node !== 'object') return '';
    const n = node as TipTapNodeLike;
    const type = asString(n.type);
    const attrs = n.attrs;

    switch (type) {
        case 'text': return asString(n.text);
        case 'hardBreak': return '\n';
        case 'horizontalRule': return '---\n';
        case 'pageBreak': return '\n--- Seitenumbruch ---\n';
        case 'image': return (asString(attrs?.alt) || asString(attrs?.title)) ? `[Bild: ${asString(attrs?.alt) || asString(attrs?.title)}]` : '[Bild]';
        case 'inlineMath': return asString(attrs?.code) ? `$${asString(attrs?.code)}$` : '';
        case 'mathBlock': return asString(attrs?.code) ? `$$${asString(attrs?.code)}$$\n` : '';
        case 'variablesBlock': return asString(attrs?.code) ? `[Variablen]\n${asString(attrs?.code)}\n` : '';
        case 'dateMention': return `@${asString(attrs?.label) || asString(attrs?.isoDate)}`;
        case 'taskMention':
        case 'mention': return `@${asString(attrs?.label) || asString(attrs?.id)}`;
        case 'calendarEvent': return `[Termin: ${asString(attrs?.title) || asString(attrs?.label) || asString(attrs?.eventId)}]`;
        case 'viewMention': return `[Ansicht: ${asString(attrs?.label) || asString(attrs?.viewId)}]`;
        case 'anchor': return collectChildrenText(n.content) || (asString(attrs?.anchorId) ? `[Anker: ${asString(attrs?.anchorId)}]` : '');
        case 'inlineComment': return collectChildrenText(n.content);
        case 'tableRow': {
            const cells = (Array.isArray(n.content) ? n.content : [])
                .filter((c): c is TipTapNodeLike => !!c && typeof c === 'object' && (asString((c as TipTapNodeLike).type) === 'tableCell' || asString((c as TipTapNodeLike).type) === 'tableHeader'))
                .map((c) => getPlainTextFromJSON(c).trim());
            return `${cells.join(' | ')}\n`;
        }
        default: break;
    }

    let text = collectChildrenText(n.content);
    if (Array.isArray(attrs?.inkStrokes) && attrs.inkStrokes.length > 0) {
        if (text && !text.endsWith('\n')) text += '\n';
        text += `[Zeichnung: ${attrs.inkStrokes.length} Striche]\n`;
    }
    if (type === 'taskItem') {
        text = (attrs?.checked ? '[x] ' : '[ ] ') + text;
        if (!text.endsWith('\n')) text += '\n';
    } else if (type === 'paragraph' || type === 'heading' || type === 'codeBlock') text += '\n';
    else if ((type === 'blockquote' || type === 'listItem') && !text.endsWith('\n')) text += '\n';
    return text;
}
