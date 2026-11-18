// Snapping of floating note elements (images) to the edges of the note page.
// Positions are in page coordinates: (0, 0) is the top-left corner of the note column.

export const SNAP_PX = 14;

export type SnapEdge = 'left' | 'right' | 'top';

export interface SnapResult {
    left: number;
    top: number;
    /** Edges the element is sitting against; the UI hatches these. */
    edges: SnapEdge[];
}

/**
 * Keeps an element inside the page and pulls it onto an edge when it comes within SNAP_PX.
 * Elements wider than the page are pinned to the left edge.
 */
export function snapToPage(left: number, top: number, width: number, pageWidth: number): SnapResult {
    const edges: SnapEdge[] = [];
    const maxLeft = Math.max(0, pageWidth - width);

    let x = Math.min(Math.max(left, 0), maxLeft);
    if (x <= SNAP_PX) { x = 0; edges.push('left'); }
    else if (maxLeft - x <= SNAP_PX) { x = maxLeft; edges.push('right'); }

    let y = Math.max(top, 0);
    if (y <= SNAP_PX) { y = 0; edges.push('top'); }

    return { left: x, top: y, edges };
}

/** Re-applies a stored horizontal snap after the page width or the element width changed. */
export function resolveSnappedLeft(snapX: 'left' | 'right' | undefined, left: number, width: number, pageWidth: number): number {
    if (snapX === 'left') return 0;
    if (snapX === 'right') return Math.max(0, pageWidth - width);
    return left;
}
