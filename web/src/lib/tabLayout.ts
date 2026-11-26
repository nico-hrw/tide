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

/** Moves a tab to a drop target. An unknown target leaves the layout as it was. */
export function moveTab(rows: TabRows, id: string, target: DropTarget): TabRows {
  if (target.ref === id) return rows;
  if (locate(rows, id) === null) return rows;
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
