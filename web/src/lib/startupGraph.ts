import { FULL_SIM, nodeRadius, nodeStrength, seedPosition, stepSim, type SimEdge, type SimNode } from './graphSim';
import { MONTH_DAYS, WEEK_DAYS } from './recentNotes';

/**
 * Timeline drawing of the start animation: all notes fade in as grey dots, then the ones added in the last month
 * appear one after the other (oldest first) in a soft colour that fades back to grey, then the ones of the last week
 * in a warmer colour that stays and pulses once. No titles are drawn; only dots and links.
 */

export interface StartupNodeInput {
    id: string;
    degree: number;
    /** Days since the note was created */
    ageDays: number;
}

export interface StartupOptions {
    width: number;
    height: number;
    nodes: StartupNodeInput[];
    edges: Array<{ a: string; b: string }>;
    /** Hex colours (palette of the calendar) */
    monthColor: string;
    weekColor: string;
}

interface Dot extends SimNode {
    r: number;
    strength: number;
    cls: 'old' | 'month' | 'week';
    appear: number;
}

const FADE_OUT_MS = 900;
const SETTLE_STEPS = 500;

function rgb(hex: string): string {
    const h = hex.replace('#', '');
    const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [parseInt(f.slice(0, 2), 16) || 0, parseInt(f.slice(2, 4), 16) || 0, parseInt(f.slice(4, 6), 16) || 0].join(',');
}

const pop = (a: number): number => (a <= 0 ? 0 : a >= 1 ? 1 : 1 + 2.2 * Math.pow(a - 1, 3) + 1.2 * Math.pow(a - 1, 2));

export class StartupGraph {
    /** Total length in ms, including the fade out */
    readonly durationMs: number;
    private fadeAt: number;
    private dots: Dot[] = [];
    private edges: Array<SimEdge & { a: Dot; b: Dot }> = [];
    private ctx: CanvasRenderingContext2D | null;
    private monthRgb: string;
    private weekRgb: string;
    private monthStart: number;
    private weekStart: number;

    constructor(private canvas: HTMLCanvasElement, private o: StartupOptions) {
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        canvas.width = Math.round(o.width * dpr);
        canvas.height = Math.round(o.height * dpr);
        canvas.style.width = `${o.width}px`;
        canvas.style.height = `${o.height}px`;
        this.ctx = canvas.getContext('2d');
        this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.monthRgb = rgb(o.monthColor);
        this.weekRgb = rgb(o.weekColor);

        const old = o.nodes.filter((n) => n.ageDays >= MONTH_DAYS);
        const month = o.nodes.filter((n) => n.ageDays >= WEEK_DAYS && n.ageDays < MONTH_DAYS).sort((a, b) => b.ageDays - a.ageDays);
        const week = o.nodes.filter((n) => n.ageDays < WEEK_DAYS).sort((a, b) => b.ageDays - a.ageDays);
        // Without older notes the first phase is skipped, so the animation does not start with an empty screen.
        this.monthStart = old.length > 0 ? 1700 : 400;
        this.weekStart = this.monthStart + 1800;
        this.fadeAt = this.weekStart + 2200;
        this.durationMs = this.fadeAt + FADE_OUT_MS;

        const stagger = Math.min(14, 1100 / Math.max(1, old.length));
        const total = o.nodes.length;
        let idx = 0;
        const make = (n: StartupNodeInput, cls: Dot['cls'], appear: number): void => {
            const p = seedPosition(idx++, total, o.width, o.height);
            this.dots.push({ id: n.id, x: p.x, y: p.y, vx: 0, vy: 0, degree: n.degree, r: nodeRadius(n.degree) * 0.95, strength: nodeStrength(n.degree), cls, appear });
        };
        old.forEach((n, i) => make(n, 'old', 200 + i * stagger));
        month.forEach((n, i) => make(n, 'month', this.monthStart + (month.length > 1 ? (i / (month.length - 1)) * 1700 : 0)));
        week.forEach((n, i) => make(n, 'week', this.weekStart + (week.length > 1 ? (i / (week.length - 1)) * 1200 : 0)));

        const byId = new Map(this.dots.map((d) => [d.id, d]));
        for (const e of o.edges) {
            const a = byId.get(e.a);
            const b = byId.get(e.b);
            if (a && b) this.edges.push({ a, b });
        }
        const sim = { ...FULL_SIM, width: o.width, height: o.height };
        for (let i = 0; i < SETTLE_STEPS; i++) stepSim(this.dots, this.edges, sim, 1);
    }

    /** Counts shown next to the animation at time `t` (ms) and which phase is on. */
    stateAt(t: number): { month: number; week: number; phase: 'all' | 'month' | 'week' } {
        let month = 0;
        let week = 0;
        for (const d of this.dots) {
            if (t <= d.appear + 300) continue;
            if (d.cls === 'month') month++;
            if (d.cls === 'week') { week++; month++; }
        }
        return { month, week, phase: t < this.monthStart - 200 ? 'all' : t < this.weekStart - 100 ? 'month' : 'week' };
    }

    draw(t: number): void {
        const c = this.ctx;
        if (!c) return;
        const m = typeof window !== 'undefined' ? getComputedStyle(this.canvas).color.match(/\d+(\.\d+)?/g) : null;
        const ink = m && m.length >= 3 ? `${m[0]},${m[1]},${m[2]}` : '20,20,20';
        const fade = t > this.fadeAt ? Math.max(0, 1 - (t - this.fadeAt) / FADE_OUT_MS) : 1;
        c.clearRect(0, 0, this.o.width, this.o.height);
        c.lineCap = 'round';
        for (const e of this.edges) {
            const start = Math.max(e.a.appear, e.b.appear) + 250;
            let p = Math.min(1, Math.max(0, (t - start) / 450));
            if (p <= 0) continue;
            p = 1 - Math.pow(1 - p, 3);
            c.strokeStyle = `rgba(${ink},${0.16 * fade})`;
            c.lineWidth = 1;
            c.beginPath();
            c.moveTo(e.a.x, e.a.y);
            c.lineTo(e.a.x + (e.b.x - e.a.x) * p, e.a.y + (e.b.y - e.a.y) * p);
            c.stroke();
        }
        for (const d of this.dots) {
            const s = pop((t - d.appear) / 650);
            if (s <= 0) continue;
            const r = d.r * s;
            c.globalAlpha = fade;
            c.fillStyle = `rgba(${ink},${0.26 + 0.74 * d.strength})`;
            c.beginPath();
            c.arc(d.x, d.y, r, 0, Math.PI * 2);
            c.fill();
            let tint: string | null = null;
            let mix = 0;
            if (d.cls === 'month') { tint = this.monthRgb; mix = Math.max(0, 1 - (t - d.appear - 900) / 1800); }
            else if (d.cls === 'week') { tint = this.weekRgb; mix = t < this.fadeAt - 300 ? 1 : Math.max(0, 1 - (t - (this.fadeAt - 300)) / 900); }
            if (tint && mix > 0) {
                c.fillStyle = `rgba(${tint},${mix})`;
                c.beginPath();
                c.arc(d.x, d.y, r, 0, Math.PI * 2);
                c.fill();
            }
            if (d.cls === 'week') {
                const pulse = (t - (d.appear + 500)) / 1400;
                if (pulse > 0 && pulse < 1) {
                    c.strokeStyle = `rgba(${this.weekRgb},${(1 - pulse) * 0.6})`;
                    c.lineWidth = 1.3;
                    c.beginPath();
                    c.arc(d.x, d.y, r + 3 + pulse * 13, 0, Math.PI * 2);
                    c.stroke();
                }
            }
            c.globalAlpha = 1;
        }
    }
}
