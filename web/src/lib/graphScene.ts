import type { GraphNode, NoteGraph } from './noteLinks';
import { FULL_SIM, ISLAND_SIM, nodeRadius, nodeStrength, seedPosition, stepSim, type SimEdge, type SimNode, type SimOptions } from './graphSim';

/**
 * Canvas scene of the note graph, shared by the island (small, animated) and the settings page (full, draggable).
 * Dots are grey: the more links a note has, the bigger and darker the dot. A new note or a new link is tinted in a
 * colour of the event palette for a moment and then fades into the grey of its link count.
 */

interface SceneNode extends SimNode {
    title: string;
    born: number;
    glowAt: number;
    labelAt: number;
    tint: string | null;
    tintAt: number;
    /** Shown size / darkness, easing towards the value the link count asks for */
    shownR: number;
    shownS: number;
    dim: boolean;
}

interface SceneEdge extends SimEdge {
    a: SceneNode;
    b: SceneNode;
    startedAt: number | null;
    hotAt: number;
    sparkAt: number;
}

export interface GraphSceneOptions {
    width: number;
    height: number;
    kind: 'island' | 'full';
    /** Most dots drawn; the rest is left out (most linked first), keeps the simulation cheap */
    maxNodes?: number;
}

const SETTLE_STEPS = 320;
const TINT_HOLD_MS = 1400;
const TINT_FADE_MS = 2400;

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [parseInt(full.slice(0, 2), 16) || 0, parseInt(full.slice(2, 4), 16) || 0, parseInt(full.slice(4, 6), 16) || 0];
}

export class GraphScene {
    private nodes: SceneNode[] = [];
    private edges: SceneEdge[] = [];
    private byId = new Map<string, SceneNode>();
    private alpha = 1;
    private busyUntil = 0;
    private ctx: CanvasRenderingContext2D | null;
    private sim: SimOptions;
    private dragging: SceneNode | null = null;
    private highlightId: string | null = null;
    private readonly floor: number;

    constructor(private canvas: HTMLCanvasElement, private opts: GraphSceneOptions) {
        this.ctx = canvas.getContext('2d');
        this.sim = { ...(opts.kind === 'island' ? ISLAND_SIM : FULL_SIM), width: opts.width, height: opts.height };
        this.floor = opts.kind === 'island' ? 0.03 : 0.02;
        this.applySize(opts.width, opts.height);
    }

    private applySize(w: number, h: number): void {
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        this.canvas.width = Math.max(1, Math.round(w * dpr));
        this.canvas.height = Math.max(1, Math.round(h * dpr));
        this.canvas.style.width = `${w}px`;
        this.canvas.style.height = `${h}px`;
        this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.sim.width = w;
        this.sim.height = h;
    }

    resize(w: number, h: number): void {
        if (w === this.opts.width && h === this.opts.height) return;
        this.opts = { ...this.opts, width: w, height: h };
        this.applySize(w, h);
        this.wake(0.4);
    }

    /** Replaces the scene with `graph` (laid out in the background, no animation). */
    setGraph(graph: NoteGraph): void {
        const max = this.opts.maxNodes ?? 240;
        const nodes = [...graph.nodes].sort((a, b) => b.degree - a.degree).slice(0, max);
        const keep = new Set(nodes.map((n) => n.id));
        this.nodes = []; this.edges = []; this.byId.clear();
        nodes.forEach((n, i) => {
            const p = seedPosition(i, nodes.length, this.sim.width, this.sim.height);
            this.addNode(n, p.x, p.y, -1e9);
        });
        for (const e of graph.edges) {
            const a = this.byId.get(e.a);
            const b = this.byId.get(e.b);
            if (a && b && keep.has(e.a) && keep.has(e.b)) this.edges.push({ a, b, startedAt: null, hotAt: -1e9, sparkAt: -1e9 });
        }
        for (const n of this.nodes) { n.shownR = nodeRadius(n.degree); n.shownS = nodeStrength(n.degree); }
        for (let i = 0; i < SETTLE_STEPS; i++) stepSim(this.nodes, this.edges, this.sim, 1);
        this.alpha = 0.3;
    }

    private addNode(n: GraphNode, x: number, y: number, born: number): SceneNode {
        const node: SceneNode = {
            id: n.id, title: n.title, degree: n.degree, x, y, vx: 0, vy: 0,
            born, glowAt: -1e9, labelAt: -1e9, tint: null, tintAt: -1e9,
            shownR: 3.2, shownS: 0, dim: false,
        };
        this.nodes.push(node);
        this.byId.set(n.id, node);
        return node;
    }

    has(id: string): boolean { return this.byId.has(id); }

    private wake(alpha: number, ms = 4200): void {
        this.alpha = Math.max(this.alpha, alpha);
        this.busyUntil = Math.max(this.busyUntil, performance.now() + ms);
    }

    /** A new note appears in the middle, without links yet. */
    spawnNote(node: { id: string; title: string }, tint: string, now: number): void {
        if (this.byId.has(node.id)) return;
        const n = this.addNode({ id: node.id, title: node.title, degree: 0 }, this.sim.width / 2 + (Math.random() - 0.5) * 16, this.sim.height / 2 + (Math.random() - 0.5) * 16, now);
        n.tint = tint; n.tintAt = now; n.glowAt = now; n.labelAt = now;
        this.wake(0.9);
    }

    /** A link is drawn between two existing notes; both dots take the same colour for a moment. */
    linkNotes(aId: string, bId: string, tint: string, now: number): boolean {
        const a = this.byId.get(aId);
        const b = this.byId.get(bId);
        if (!a || !b || a === b) return false;
        if (this.edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))) return false;
        this.edges.push({ a, b, startedAt: now, hotAt: now, sparkAt: now + 500 });
        a.degree += 1; b.degree += 1;
        a.tint = tint; b.tint = tint; a.tintAt = now; b.tintAt = now;
        a.glowAt = now; b.glowAt = now + 500; a.labelAt = now; b.labelAt = now + 400;
        this.wake(0.8, 5000);
        return true;
    }

    // ── pointer interaction (settings view) ───────────────────────────────────
    pick(x: number, y: number): string | null {
        let best: SceneNode | null = null;
        let bestD = 14 * 14;
        for (const n of this.nodes) {
            const d = (n.x - x) ** 2 + (n.y - y) ** 2;
            if (d < bestD) { bestD = d; best = n; }
        }
        return best?.id ?? null;
    }

    highlight(id: string | null): void {
        this.highlightId = id;
        const near = new Set<string>();
        if (id) {
            near.add(id);
            for (const e of this.edges) {
                if (e.a.id === id) near.add(e.b.id);
                if (e.b.id === id) near.add(e.a.id);
            }
        }
        for (const n of this.nodes) n.dim = id !== null && !near.has(n.id);
        this.wake(this.alpha, 600);
    }

    startDrag(id: string): void {
        const n = this.byId.get(id);
        if (!n) return;
        this.dragging = n;
        n.fixed = true;
        this.wake(0.5, 3000);
    }

    dragTo(x: number, y: number): void {
        if (!this.dragging) return;
        this.dragging.x = x; this.dragging.y = y;
        this.wake(0.5, 3000);
    }

    endDrag(): void {
        if (this.dragging) this.dragging.fixed = false;
        this.dragging = null;
    }

    // ── frame ─────────────────────────────────────────────────────────────────
    /** Advances the physics and draws. Returns false when the scene is at rest (the caller can stop its loop). */
    frame(now: number): boolean {
        const active = now < this.busyUntil || this.alpha > this.floor * 2.2 || this.dragging !== null;
        if (active) {
            stepSim(this.nodes, this.edges, this.sim, this.alpha);
            this.alpha = Math.max(this.floor, this.alpha * 0.992);
            for (const n of this.nodes) {
                n.shownR += (nodeRadius(n.degree) - n.shownR) * 0.06;
                n.shownS += (nodeStrength(n.degree) - n.shownS) * 0.06;
            }
        }
        this.draw(now);
        return active;
    }

    private inkRgb(): string {
        const m = typeof window !== 'undefined' ? getComputedStyle(this.canvas).color.match(/\d+(\.\d+)?/g) : null;
        return m && m.length >= 3 ? `${m[0]},${m[1]},${m[2]}` : '20,20,20';
    }

    private draw(now: number): void {
        const c = this.ctx;
        if (!c) return;
        const ink = this.inkRgb();
        c.clearRect(0, 0, this.sim.width, this.sim.height);
        c.lineCap = 'round';
        for (const e of this.edges) {
            let p = 1;
            if (e.startedAt !== null) {
                p = Math.min(1, Math.max(0, (now - e.startedAt) / 800));
                p = 1 - Math.pow(1 - p, 3);
                if (p >= 1) e.startedAt = null;
            }
            const hot = now - e.hotAt < 2000;
            const faded = (e.a.dim || e.b.dim);
            c.strokeStyle = hot ? `rgba(${ink},.7)` : `rgba(${ink},${faded ? 0.06 : 0.2})`;
            c.lineWidth = hot ? 1.6 : 1;
            c.beginPath();
            c.moveTo(e.a.x, e.a.y);
            c.lineTo(e.a.x + (e.b.x - e.a.x) * p, e.a.y + (e.b.y - e.a.y) * p);
            c.stroke();
            const sp = (now - e.sparkAt) / 950;
            if (sp >= 0 && sp < 1) {
                const q = sp * sp * (3 - 2 * sp);
                c.fillStyle = `rgba(${ink},${(1 - sp) * 0.8})`;
                c.beginPath();
                c.arc(e.a.x + (e.b.x - e.a.x) * q, e.a.y + (e.b.y - e.a.y) * q, 2.6, 0, Math.PI * 2);
                c.fill();
            }
        }
        for (const n of this.nodes) {
            const age = (now - n.born) / 700;
            // pops in with a little overshoot
            const scale = age >= 1 ? 1 : age < 0 ? 0 : 1 + 2.2 * Math.pow(age - 1, 3) + 1.2 * Math.pow(age - 1, 2);
            const r = Math.max(0, n.shownR * scale);
            const dim = n.dim ? 0.2 : 1;
            c.globalAlpha = dim;
            c.fillStyle = `rgba(${ink},${0.28 + 0.72 * n.shownS})`;
            c.beginPath();
            c.arc(n.x, n.y, r, 0, Math.PI * 2);
            c.fill();
            if (n.tint) {
                const fade = Math.min(1, Math.max(0, (now - n.tintAt - TINT_HOLD_MS) / TINT_FADE_MS));
                if (fade >= 1) n.tint = null;
                else {
                    const [tr, tg, tb] = hexToRgb(n.tint);
                    c.fillStyle = `rgba(${tr},${tg},${tb},${(1 - fade) * dim})`;
                    c.beginPath();
                    c.arc(n.x, n.y, r, 0, Math.PI * 2);
                    c.fill();
                }
            }
            const glow = (now - n.glowAt) / 1700;
            if (glow >= 0 && glow < 1) {
                const gc = n.tint ? hexToRgb(n.tint).join(',') : ink;
                c.strokeStyle = `rgba(${gc},${(1 - glow) * 0.5})`;
                c.lineWidth = 1.3;
                c.beginPath();
                c.arc(n.x, n.y, r + 3 + glow * 10, 0, Math.PI * 2);
                c.stroke();
            }
            const showLabel = (now - n.labelAt) / 3200;
            const hovered = this.highlightId === n.id;
            if ((showLabel >= 0 && showLabel < 1) || hovered) {
                const a = hovered ? 1 : Math.min(1, showLabel * 6) * (1 - Math.max(0, (showLabel - 0.75) * 4));
                c.globalAlpha = a;
                c.fillStyle = `rgba(${ink},.75)`;
                c.font = '500 12px system-ui, sans-serif';
                c.textAlign = 'center';
                const text = n.title.length > 22 ? `${n.title.slice(0, 21)}…` : n.title;
                c.fillText(text, n.x, n.y + r + 15);
            }
            c.globalAlpha = 1;
        }
    }

    /** Ids and titles of the notes in the scene, for labels outside the canvas. */
    titleOf(id: string): string | undefined { return this.byId.get(id)?.title; }
}
