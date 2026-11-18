"use client";

import type { SnapEdge } from '@/lib/canvasSnap';

const STRIP = 12;
const GAP = 4;

const hatch: React.CSSProperties = {
    position: 'absolute',
    pointerEvents: 'none',
    zIndex: 0,
    backgroundColor: 'color-mix(in srgb, var(--t2-accent) 10%, transparent)',
    backgroundImage: 'repeating-linear-gradient(135deg, var(--t2-accent) 0 1.5px, transparent 1.5px 6px)',
    opacity: 0.6,
    borderRadius: 4,
    transition: 'opacity 0.12s',
};

interface PageEdgeHatchProps {
    edges: SnapEdge[];
    /** Position and size of the element in page coordinates. */
    left: number;
    top: number;
    width: number;
    height: number;
    pageWidth: number;
}

/**
 * Hatched strip in the margin next to the page edge an element is touching, only as long as the
 * element itself, so it reads as "this edge is what stops the image".
 */
export function PageEdgeHatch({ edges, left, top, width, height, pageWidth }: PageEdgeHatchProps) {
    return (
        <>
            {edges.includes('left') && <div aria-hidden style={{ ...hatch, left: -STRIP - GAP, top, width: STRIP, height }} />}
            {edges.includes('right') && <div aria-hidden style={{ ...hatch, left: pageWidth + GAP, top, width: STRIP, height }} />}
            {edges.includes('top') && <div aria-hidden style={{ ...hatch, left, top: -STRIP - GAP, width, height: STRIP }} />}
        </>
    );
}
