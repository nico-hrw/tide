/**
 * Force layout for the note graph: every dot pushes the others away, a link pulls its two dots together, a weak
 * pull towards the middle keeps the whole thing in view. Linked notes end up close, clusters form by themselves.
 * Pure functions on plain objects, so it can be tested without a canvas.
 */

export interface SimNode {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** Links touching the note, incoming and outgoing */
    degree: number;
    /** Held in place (while dragged) */
    fixed?: boolean;
}

export interface SimEdge {
    a: SimNode;
    b: SimNode;
}

export interface SimOptions {
    width: number;
    height: number;
    repulsion: number;
    linkDistance: number;
    linkStrength: number;
    gravity: number;
    damping: number;
}

export const ISLAND_SIM: Omit<SimOptions, 'width' | 'height'> = {
    repulsion: 950, linkDistance: 44, linkStrength: 0.045, gravity: 0.012, damping: 0.82,
};

export const FULL_SIM: Omit<SimOptions, 'width' | 'height'> = {
    repulsion: 1500, linkDistance: 38, linkStrength: 0.05, gravity: 0.006, damping: 0.82,
};

/** Size grows with the number of links, softly. */
export function nodeRadius(degree: number): number {
    return 3.2 + Math.sqrt(Math.max(0, degree)) * 1.7;
}

/** 0 for a note without links up to 1 for a note with eight or more: drives how dark the dot is. */
export function nodeStrength(degree: number): number {
    return Math.min(1, Math.max(0, degree) / 8);
}

/** A start position on a ring around the middle (jittered), so the layout does not begin as one pile. */
export function seedPosition(index: number, total: number, width: number, height: number): { x: number; y: number } {
    const angle = (index / Math.max(1, total)) * Math.PI * 2;
    const ring = 0.25 + 0.2 * ((index * 7) % 5) / 4;
    return {
        x: width / 2 + Math.cos(angle) * width * ring,
        y: height / 2 + Math.sin(angle) * height * ring,
    };
}

/** One physics step. `alpha` (0..1) is the "heat": it cools down over time and is raised again to wake the layout. */
export function stepSim(nodes: SimNode[], edges: SimEdge[], o: SimOptions, alpha: number): void {
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i];
            const b = nodes[j];
            let dx = a.x - b.x;
            let dy = a.y - b.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 30) d2 = 30;
            const d = Math.sqrt(d2);
            const f = o.repulsion / d2;
            dx = (dx / d) * f;
            dy = (dy / d) * f;
            a.vx += dx; a.vy += dy;
            b.vx -= dx; b.vy -= dy;
        }
    }
    for (const e of edges) {
        let dx = e.b.x - e.a.x;
        let dy = e.b.y - e.a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d - o.linkDistance) * o.linkStrength;
        dx = (dx / d) * f;
        dy = (dy / d) * f;
        e.a.vx += dx; e.a.vy += dy;
        e.b.vx -= dx; e.b.vy -= dy;
    }
    const cx = o.width / 2;
    const cy = o.height / 2;
    for (const n of nodes) {
        if (n.fixed) { n.vx = 0; n.vy = 0; continue; }
        // Notes without links are held a little closer so they do not drift out of view.
        const g = n.degree === 0 ? o.gravity * 1.6 : o.gravity;
        n.vx = (n.vx + (cx - n.x) * g) * o.damping;
        n.vy = (n.vy + (cy - n.y) * g) * o.damping;
        n.x += n.vx * alpha;
        n.y += n.vy * alpha;
    }
}
