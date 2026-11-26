'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { DropTarget, TabRows } from '@/lib/tabLayout';

interface TabLayoutViewProps {
  rows: TabRows;
  /** Renders one tab (the element itself, without drag handling). */
  renderTab: (id: string) => React.ReactNode;
  onMove: (id: string, target: DropTarget) => void;
}

/** Pointer distance before a press turns into a drag (a plain click must still click). */
const DRAG_THRESHOLD = 6;

interface Resolved {
  target: DropTarget;
  /** Key of the element that shows the drop hint. */
  hint: string;
}

/** Finds the drop target under the pointer from the data attributes of the elements there. */
function resolveTarget(x: number, y: number, dragId: string): Resolved | null {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;

  const zone = el.closest<HTMLElement>('[data-drop-zone]');
  if (zone?.dataset.kind && zone.dataset.ref) {
    return { target: { kind: zone.dataset.kind as DropTarget['kind'], ref: zone.dataset.ref }, hint: zone.dataset.dropZone ?? '' };
  }

  const tab = el.closest<HTMLElement>('[data-tab-id]');
  if (tab?.dataset.tabId) {
    if (tab.dataset.tabId === dragId) return null;
    const rect = tab.getBoundingClientRect();
    const side = x < rect.left + rect.width / 2 ? 'before' : 'after';
    return { target: { kind: side, ref: tab.dataset.tabId }, hint: `${side}-${tab.dataset.tabId}` };
  }

  const group = el.closest<HTMLElement>('[data-group-ref]');
  if (group?.dataset.groupRef) {
    return { target: { kind: 'intoGroup', ref: group.dataset.groupRef }, hint: `group-${group.dataset.groupKey ?? ''}` };
  }
  return null;
}

/**
 * Tab bar layout: rows of small groups. A tab is dragged with the mouse (pointer events, so it behaves the
 * same in every browser): the drop zones show a thin line while dragging, at the row edges (new group),
 * between groups (new group) and above or below a row (new row); on a tab's left or right half it is placed
 * next to it. Empty groups and rows are removed by moveTab.
 */
export function TabLayoutView({ rows, renderTab, onMove }: TabLayoutViewProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const onMoveRef = useRef(onMove);
  useEffect(() => {
    onMoveRef.current = onMove;
  });

  const startDrag = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    const startX = e.clientX;
    const startY = e.clientY;
    let active = false;
    let current: Resolved | null = null;

    const move = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
        active = true;
        setDragId(id);
        document.body.style.userSelect = 'none';
      }
      setGhost({ x: ev.clientX, y: ev.clientY });
      current = resolveTarget(ev.clientX, ev.clientY, id);
      setHint(current?.hint ?? null);
    };

    const finish = (commit: boolean) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);
      document.body.style.userSelect = '';
      if (active) {
        // The click that follows the release must not activate the tab that was dragged.
        const swallow = (c: MouseEvent) => {
          c.stopPropagation();
          c.preventDefault();
        };
        window.addEventListener('click', swallow, { capture: true, once: true });
        window.setTimeout(() => window.removeEventListener('click', swallow, true), 100);
        if (commit && current) onMoveRef.current(id, current.target);
      }
      setDragId(null);
      setHint(null);
      setGhost(null);
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') finish(false);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);
  };

  // A drop zone keeps its space all the time (no jump when dragging starts); it shows a thin line while dragging.
  const zone = (key: string, target: DropTarget, box: string, vertical: boolean) => (
    <div
      key={key}
      data-drop-zone={key}
      data-kind={target.kind}
      data-ref={target.ref}
      className={`relative shrink-0 ${box}`}
      aria-hidden="true"
    >
      {dragId && (
        <span
          className={`pointer-events-none absolute rounded-full transition-colors ${
            vertical ? 'inset-y-1 left-1/2 w-[2px] -translate-x-1/2' : 'inset-x-1 top-1/2 h-[2px] -translate-y-1/2'
          } ${hint === key ? 'bg-t2-accent' : 'bg-t2-line'}`}
        />
      )}
    </div>
  );

  return (
    <div className="flex flex-col min-w-0">
      {rows.map((row, r) => {
        const firstRef = row[0][0];
        const lastGroup = row[row.length - 1];
        const lastRef = lastGroup[lastGroup.length - 1];
        return (
          <React.Fragment key={`row-${r}`}>
            {r === 0 && zone(`rowAbove-${r}`, { kind: 'rowAbove', ref: firstRef }, 'h-5 w-full', false)}
            <div className="flex items-stretch">
              {zone(`rowStart-${r}`, { kind: 'rowStart', ref: firstRef }, 'w-6 min-h-[34px]', true)}
              {row.map((group, g) => (
                <React.Fragment key={`group-${r}-${g}`}>
                  {g > 0 && zone(`groupBefore-${r}-${g}`, { kind: 'groupBefore', ref: group[0] }, 'w-6 min-h-[34px]', true)}
                  <div
                    className="flex items-center gap-1"
                    data-group-ref={group[group.length - 1]}
                    data-group-key={`${r}-${g}`}
                  >
                    {group.map((id) => (
                      <div
                        key={id}
                        data-tab-id={id}
                        onPointerDown={(e) => startDrag(e, id)}
                        onDragStart={(e) => e.preventDefault()}
                        className={`relative flex items-center ${dragId === id ? 'opacity-50' : ''}`}
                      >
                        {dragId && dragId !== id && hint === `before-${id}` && (
                          <span className="pointer-events-none absolute -left-1 top-1 bottom-1 w-[3px] rounded-full bg-t2-accent" aria-hidden="true" />
                        )}
                        {dragId && dragId !== id && hint === `after-${id}` && (
                          <span className="pointer-events-none absolute -right-1 top-1 bottom-1 w-[3px] rounded-full bg-t2-accent" aria-hidden="true" />
                        )}
                        {renderTab(id)}
                      </div>
                    ))}
                  </div>
                </React.Fragment>
              ))}
              {zone(`rowEnd-${r}`, { kind: 'rowEnd', ref: lastRef }, 'w-6 min-h-[34px]', true)}
            </div>
            {zone(`rowBelow-${r}`, { kind: 'rowBelow', ref: firstRef }, 'h-5 w-full', false)}
          </React.Fragment>
        );
      })}
      {dragId && ghost && (
        <div
          className="pointer-events-none fixed z-[900] flex items-center rounded-lg border border-t2-line bg-t2-surface opacity-90 shadow-lg"
          style={{ left: ghost.x + 12, top: ghost.y + 12 }}
          aria-hidden="true"
        >
          {renderTab(dragId)}
        </div>
      )}
    </div>
  );
}

export default TabLayoutView;
