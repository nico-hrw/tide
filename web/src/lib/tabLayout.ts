/**
 * Tab layout: rows of groups of tab ids. A group is a small cluster of tabs (no background);
 * empty groups and empty rows disappear. Pure functions, no DOM or store access.
 */

/** rows -> groups -> tab ids */
export type TabRows = string[][][];

/** Where a dragged tab is dropped. Targets name a neighbour tab, so they resolve after the tab was taken out. */
export type DropTarget =
  | { kind: 'before'; ref: string }      // into the group of ref, before ref
  | { kind: 'after'; ref: string }       // into the group of ref, after ref
  | { kind: 'intoGroup'; ref: string }   // at the end of the group of ref
  | { kind: 'groupBefore'; ref: string } // new group right before the group of ref
  | { kind: 'groupAfter'; ref: string }  // new group right after the group of ref
  | { kind: 'rowStart'; ref: string }    // new group at the left edge of the row of ref
  | { kind: 'rowEnd'; ref: string }      // new group at the right edge of the row of ref
  | { kind: 'rowAbove'; ref: string }    // new row above the row of ref
  | { kind: 'rowBelow'; ref: string };   // new row below the row of ref

function cleanup(rows: TabRows): TabRows {
  return rows
    .map((row) => row.filter((group) => group.length > 0))
    .filter((row) => row.length > 0);
}

/** Brings a stored layout in line with the tabs that exist now: drops unknown ids, adds new ones at the end. */
export function reconcileRows(rows: TabRows, ids: string[]): TabRows {
  const known = new Set(ids);
  const cleaned = cleanup(rows.map((row) => row.map((group) => group.filter((id) => known.has(id)))));
  const placed = new Set(cleaned.flat(2));
  const missing = ids.filter((id) => !placed.has(id));
  if (missing.length === 0) return cleaned;
  if (cleaned.length === 0) return [[missing]];
  // New tabs join the last group of the last row.
  const lastRow = cleaned[cleaned.length - 1];
  lastRow[lastRow.length - 1].push(...missing);
  return cleaned;
}

/** Position of a tab: row, group and index inside the group. */
export function locate(rows: TabRows, id: string): { r: number; g: number; i: number } | null {
  for (let r = 0; r < rows.length; r++) {
    for (let g = 0; g < rows[r].length; g++) {
      const i = rows[r][g].indexOf(id);
      if (i >= 0) return { r, g, i };
    }
  }
  return null;
}

function removeId(rows: TabRows, id: string): TabRows {
  return cleanup(rows.map((row) => row.map((group) => group.filter((x) => x !== id))));
}

/**
 * A tab dropped on a zone that names the tab itself (the last or first tab of a row). It leaves its group
 * and becomes a group of its own at the row edge, or in a new row above or below. Its group is split first,
 * so the neighbours stay where they are.
 */
function moveIsolated(rows: TabRows, id: string, kind: DropTarget['kind']): TabRows {
  const at = locate(rows, id);
  if (!at) return rows;
  const iso = rows.map((row) => row.map((group) => [...group]));
  const group = iso[at.r][at.g];
  const idx = group.indexOf(id);
  const left = group.slice(0, idx);
  const right = group.slice(idx + 1);
  iso[at.r].splice(at.g, 1, ...[left, [id], right].filter((g) => g.length > 0));

  const pos = locate(iso, id);
  if (!pos) return rows;
  const row = iso[pos.r];
  const [own] = row.splice(pos.g, 1);
  switch (kind) {
    case 'rowStart':
      row.unshift(own);
      break;
    case 'rowEnd':
      row.push(own);
      break;
    case 'rowAbove':
      iso.splice(pos.r, 0, [own]);
      break;
    case 'rowBelow':
      iso.splice(pos.r + 1, 0, [own]);
      break;
    default:
      // groupBefore / groupAfter onto its own group: it stays a group of its own, in place.
      row.splice(pos.g, 0, own);
      break;
  }
  return cleanup(iso);
}

/** Moves a tab to a drop target. An unknown target leaves the layout as it was. */
export function moveTab(rows: TabRows, id: string, target: DropTarget): TabRows {
  if (locate(rows, id) === null) return rows;
  if (target.ref === id) {
    // Dropping a tab next to itself: inside its own group nothing changes; edges and new groups move it out.
    if (target.kind === 'before' || target.kind === 'after' || target.kind === 'intoGroup') return rows;
    return moveIsolated(rows, id, target.kind);
  }
  const before = rows;
  const r = removeId(rows, id);
  const pos = locate(r, target.ref);
  if (!pos) return before;
  const next = r.map((row) => row.map((group) => [...group]));

  switch (target.kind) {
    case 'before':
      next[pos.r][pos.g].splice(pos.i, 0, id);
      break;
    case 'after':
      next[pos.r][pos.g].splice(pos.i + 1, 0, id);
      break;
    case 'intoGroup':
      next[pos.r][pos.g].push(id);
      break;
    case 'groupBefore':
      next[pos.r].splice(pos.g, 0, [id]);
      break;
    case 'groupAfter':
      next[pos.r].splice(pos.g + 1, 0, [id]);
      break;
    case 'rowStart':
      next[pos.r].unshift([id]);
      break;
    case 'rowEnd':
      next[pos.r].push([id]);
      break;
    case 'rowAbove':
      next.splice(pos.r, 0, [[id]]);
      break;
    case 'rowBelow':
      next.splice(pos.r + 1, 0, [[id]]);
      break;
  }
  return cleanup(next);
}

/** Flat order of the ids, row by row, group by group. */
export function flatten(rows: TabRows): string[] {
  return rows.flat(2);
}

/** A tab's horizontal extent on screen and the index of its group inside the row. */
export interface TabBox {
  id: string;
  left: number;
  right: number;
  group: number;
}

/** One row on screen: its vertical extent and its tabs from left to right. */
export interface RowBox {
  top: number;
  bottom: number;
  tabs: TabBox[];
}

/** How far past a tab or row the pointer must go before it counts as "away": a new group or row. */
export const DROP_MARGIN = { x: 12, y: 8, between: 6 } as const;

/**
 * Where a dragged tab lands for a pointer position, from the layout as it was when the drag started
 * (so the answer does not change while the tabs make room). Next to a tab it joins that tab's group;
 * in the gap between two groups, past the ends of a row, or above, below or between rows it makes a
 * new group or row. Returns null when there is nothing to drop on.
 */
export function resolveDrop(rows: RowBox[], dragId: string, x: number, y: number): DropTarget | null {
  const rowsWithTabs = rows.filter((r) => r.tabs.length > 0);
  if (rowsWithTabs.length === 0) return null;
  const first = rowsWithTabs[0];
  const last = rowsWithTabs[rowsWithTabs.length - 1];

  if (y < first.top - DROP_MARGIN.y) return { kind: 'rowAbove', ref: first.tabs[0].id };
  if (y > last.bottom + DROP_MARGIN.y) return { kind: 'rowBelow', ref: last.tabs[0].id };
  for (let i = 0; i < rowsWithTabs.length - 1; i++) {
    if (y > rowsWithTabs[i].bottom - DROP_MARGIN.between && y < rowsWithTabs[i + 1].top + DROP_MARGIN.between) {
      return { kind: 'rowBelow', ref: rowsWithTabs[i].tabs[0].id };
    }
  }

  // The row the pointer is in (or the nearest one).
  let row = rowsWithTabs[0];
  let best = Infinity;
  for (const r of rowsWithTabs) {
    const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    if (d < best) {
      best = d;
      row = r;
    }
  }

  const tabs = row.tabs;
  const lastTab = tabs[tabs.length - 1];
  if (x < tabs[0].left - DROP_MARGIN.x) return { kind: 'rowStart', ref: tabs[0].id };
  if (x > lastTab.right + DROP_MARGIN.x) return { kind: 'rowEnd', ref: lastTab.id };

  for (let i = 0; i < tabs.length; i++) {
    const t = tabs[i];
    if (x >= t.left && x <= t.right) {
      // On the dragged tab itself nothing changes.
      if (t.id === dragId) return { kind: 'before', ref: dragId };
      return { kind: x < (t.left + t.right) / 2 ? 'before' : 'after', ref: t.id };
    }
    const next = tabs[i + 1];
    if (next && x > t.right && x < next.left) {
      return t.group === next.group ? { kind: 'before', ref: next.id } : { kind: 'groupBefore', ref: next.id };
    }
  }
  // Just outside the first or last tab, inside the margin: next to that tab, same group.
  return x < tabs[0].left ? { kind: 'before', ref: tabs[0].id } : { kind: 'after', ref: lastTab.id };
}
