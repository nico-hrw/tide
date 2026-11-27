import { describe, expect, it } from 'vitest';
import { buildNoteGraph, extractNoteLinkTargets, neighbourhood, pruneIndex, sameIds } from '../noteLinks';
import { nodeRadius, nodeStrength, stepSim, type SimEdge, type SimNode } from '../graphSim';

const mention = (id: unknown, attrs: Record<string, unknown> = {}) => ({ type: 'mention', attrs: { id, ...attrs } });
const doc = (...inline: unknown[]) => ({ type: 'doc', content: [{ type: 'paragraph', content: inline }] });

describe('extractNoteLinkTargets', () => {
    it('collects note mentions, once each, without the note itself', () => {
        const d = doc(mention('a'), mention('b'), mention('a'), mention('self'));
        expect(extractNoteLinkTargets(d, 'self').sort()).toEqual(['a', 'b']);
    });

    it('treats a mention without a type as a note (magic links are inserted that way)', () => {
        expect(extractNoteLinkTargets(doc(mention('a')), 'x')).toEqual(['a']);
    });

    it('ignores people, files, events, ghosts and broken ids', () => {
        const d = doc(
            mention('p', { type: 'contact' }),
            mention('f', { type: 'file' }),
            mention('e', { type: 'event' }),
            mention('g', { isGhost: true }),
            mention('ghost-1'),
            mention(''),
            mention(null),
            mention(42),
        );
        expect(extractNoteLinkTargets(d, 'x')).toEqual([]);
    });

    it('finds mentions nested in lists and tables', () => {
        const d = { type: 'doc', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [mention('deep')] }] }] }] };
        expect(extractNoteLinkTargets(d, 'x')).toEqual(['deep']);
    });

    it('survives garbage input', () => {
        expect(extractNoteLinkTargets(null, 'x')).toEqual([]);
        expect(extractNoteLinkTargets('text', 'x')).toEqual([]);
        expect(extractNoteLinkTargets({ content: 'nope' }, 'x')).toEqual([]);
    });
});

describe('buildNoteGraph', () => {
    const notes = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' }];

    it('keeps unlinked notes as nodes and counts incoming and outgoing links', () => {
        const g = buildNoteGraph(notes, { a: ['b'], c: ['b'] });
        const deg = Object.fromEntries(g.nodes.map((n) => [n.id, n.degree]));
        expect(deg).toEqual({ a: 1, b: 2, c: 1 });
        expect(g.edges).toHaveLength(2);
    });

    it('draws one line for links in both directions but counts both', () => {
        const g = buildNoteGraph(notes, { a: ['b'], b: ['a'] });
        expect(g.edges).toEqual([{ a: 'a', b: 'b', weight: 2 }]);
        expect(g.nodes.find((n) => n.id === 'a')!.degree).toBe(2);
    });

    it('drops links to notes the user cannot see: no dot, no title, no number on the neighbour', () => {
        const g = buildNoteGraph(notes, { a: ['b', 'secret-note'], 'hidden-source': ['a'] });
        expect(g.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
        expect(g.edges).toEqual([{ a: 'a', b: 'b', weight: 1 }]);
        expect(g.nodes.find((n) => n.id === 'a')!.degree).toBe(1);
        expect(JSON.stringify(g)).not.toContain('secret');
        expect(JSON.stringify(g)).not.toContain('hidden');
    });

    it('ignores a link of a note to itself', () => {
        expect(buildNoteGraph(notes, { a: ['a'] }).edges).toEqual([]);
    });
});

describe('neighbourhood and pruneIndex', () => {
    const notes = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, title: id }));
    const g = buildNoteGraph(notes, { a: ['b'], b: ['c'], c: ['d'] });

    it('returns the note, its links and their neighbours, within the limit', () => {
        expect(neighbourhood(g, 'a').nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
        expect(neighbourhood(g, 'a', 2).nodes).toHaveLength(2);
    });

    it('returns only the note itself when it has no links', () => {
        expect(neighbourhood(g, 'e').nodes.map((n) => n.id)).toEqual(['e']);
    });

    it('prunes deleted notes and links to them, and keeps the object when nothing changes', () => {
        const index = { a: ['b', 'gone'], gone: ['a'] };
        expect(pruneIndex(index, new Set(['a', 'b']))).toEqual({ a: ['b'] });
        const same = { a: ['b'] };
        expect(pruneIndex(same, new Set(['a', 'b']))).toBe(same);
    });

    it('compares id lists regardless of order', () => {
        expect(sameIds(['a', 'b'], ['b', 'a'])).toBe(true);
        expect(sameIds(['a'], ['a', 'b'])).toBe(false);
        expect(sameIds(undefined, [])).toBe(false);
    });
});

describe('force layout', () => {
    const make = (id: string, x: number, y: number): SimNode => ({ id, x, y, vx: 0, vy: 0, degree: 0 });
    const dist = (a: SimNode, b: SimNode) => Math.hypot(a.x - b.x, a.y - b.y);
    const opts = { width: 300, height: 200, repulsion: 950, linkDistance: 44, linkStrength: 0.045, gravity: 0.012, damping: 0.82 };

    it('keeps linked notes closer together than unlinked ones', () => {
        const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        const nodes = ids.map((id, i) => make(id, 150 + Math.cos(i) * 60, 100 + Math.sin(i * 1.7) * 50));
        const by = Object.fromEntries(nodes.map((n) => [n.id, n]));
        const pairs: Array<[string, string]> = [['a', 'b'], ['c', 'd'], ['e', 'f'], ['b', 'c']];
        const edges: SimEdge[] = pairs.map(([x, y]) => { by[x].degree++; by[y].degree++; return { a: by[x], b: by[y] }; });
        for (let i = 0; i < 500; i++) stepSim(nodes, edges, opts, 1);
        const linked = new Set(pairs.map(([x, y]) => `${x}${y}`));
        let linkSum = 0; let linkN = 0; let otherSum = 0; let otherN = 0;
        for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
            const d = dist(nodes[i], nodes[j]);
            if (linked.has(`${nodes[i].id}${nodes[j].id}`)) { linkSum += d; linkN++; } else { otherSum += d; otherN++; }
        }
        expect(linkSum / linkN).toBeLessThan(otherSum / otherN);
    });

    it('does not move a held (dragged) note', () => {
        const a = make('a', 10, 10); const b = make('b', 12, 10);
        a.fixed = true;
        stepSim([a, b], [], opts, 1);
        expect([a.x, a.y]).toEqual([10, 10]);
    });

    it('makes dots bigger and darker with every link, up to a limit', () => {
        expect(nodeRadius(4)).toBeGreaterThan(nodeRadius(0));
        expect(nodeStrength(0)).toBe(0);
        expect(nodeStrength(4)).toBeCloseTo(0.5);
        expect(nodeStrength(40)).toBe(1);
    });
});
