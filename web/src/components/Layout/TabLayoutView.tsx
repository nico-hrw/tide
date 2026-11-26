'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { moveTab, resolveDrop, type DropTarget, type RowBox, type TabBox, type TabRows } from '@/lib/tabLayout';

interface TabLayoutViewProps {
  rows: TabRows;
  /** Renders one tab (the element itself, without drag handling). */
  renderTab: (id: string) => React.ReactNode;
  onMove: (id: string, target: DropTarget) => void;
}

/** Pointer distance before a press turns into a drag (a plain click must still click). */
const DRAG_THRESHOLD = 6;
const MOVE_MS = 180;

/** Where every tab is on screen right now, row by row (taken when a drag starts). */
function measureRows(root: HTMLElement, rows: TabRows): RowBox[] {
  const els = new Map<string, HTMLElement>();
  root.querySelectorAll<HTMLElement>('[data-tab-id]').forEach((el) => {
    if (el.dataset.tabId) els.set(el.dataset.tabId, el);
  });
  return rows.map((row) => {
    const tabs: TabBox[] = [];
    let top = Infinity;
    let bottom = -Infinity;
    row.forEach((group, g) =>
      group.forEach((id) => {
        const el = els.get(id);
        if (!el) return;
        const r = el.getBoundingClientRect();
        tabs.push({ id, left: r.left, right: r.right, group: g });
        top = Math.min(top, r.top);
        bottom = Math.max(bottom, r.bottom);
      }),
    );
    return { top, bottom, tabs };
  });
}

/** The translation a running animation currently applies to an element. */
function currentTranslate(el: HTMLElement): { x: number; y: number } {
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return { x: 0, y: 0 };
  const m = new DOMMatrixReadOnly(t);
  return { x: m.m41, y: m.m42 };
}

/**
 * Tab bar layout: rows of small groups. A tab is dragged with the mouse (pointer events, so it behaves the
 * same in every browser). While it is dragged the other tabs make room: next to a tab it joins that tab's
 * group; further away (in the gap between groups, past the end of a row, above, below or between rows) a
 * new group or row appears. The result is shown live and the tabs slide to their new places. Empty groups
 * and rows are removed by moveTab.
 */
export function TabLayoutView({ rows, renderTab, onMove }: TabLayoutViewProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [preview, setPreview] = useState<TabRows | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const onMoveRef = useRef(onMove);
  const rowsRef = useRef(rows);
  useEffect(() => {
    onMoveRef.current = onMove;
    rowsRef.current = rows;
  });

  // Tabs slide to their new place (FLIP): each render, compare layout positions with the previous ones.
  const lastPos = useRef(new Map<string, { x: number; y: number }>());
  const running = useRef(new WeakMap<HTMLElement, Animation>());
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const next = new Map<string, { x: number; y: number }>();
    root.querySelectorAll<HTMLElement>('[data-tab-id]').forEach((el) => {
      const id = el.dataset.tabId;
      if (!id) return;
      const pos = { x: el.offsetLeft, y: el.offsetTop };
      next.set(id, pos);
      const prev = lastPos.current.get(id);
      if (reduce || !prev || (prev.x === pos.x && prev.y === pos.y)) return;
      const cur = currentTranslate(el);
      running.current.get(el)?.cancel();
      running.current.set(
        el,
        el.animate(
          [
            { transform: `translate(${prev.x - pos.x + cur.x}px, ${prev.y - pos.y + cur.y}px)` },
            { transform: 'translate(0px, 0px)' },
          ],
          { duration: MOVE_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
        ),
      );
    });
    lastPos.current = next;
  });

  const startDrag = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    const startX = e.clientX;
    const startY = e.clientY;
    const box = e.currentTarget.getBoundingClientRect();
    const grabX = startX - box.left;
    const grabY = startY - box.top;
    let active = false;
    let geometry: RowBox[] = [];
    let current: DropTarget | null = null;
    let currentKey = '';

    const move = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
        active = true;
        // Measured before anything moves: the answer for a pointer position stays the same while tabs make room.
        if (rootRef.current) geometry = measureRows(rootRef.current, rowsRef.current);
        setDragId(id);
        document.body.style.userSelect = 'none';
      }
      setGhost({ x: ev.clientX - grabX, y: ev.clientY - grabY });
      const target = resolveDrop(geometry, id, ev.clientX, ev.clientY);
      const key = target ? `${target.kind}:${target.ref}` : '';
      if (key === currentKey) return;
      currentKey = key;
      current = target;
      const next = target ? moveTab(rowsRef.current, id, target) : rowsRef.current;
      setPreview(next === rowsRef.current ? null : next);
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
        if (commit && current) onMoveRef.current(id, current);
      }
      setDragId(null);
      setPreview(null);
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

  const shown = preview ?? rows;

  // The bar grows and shrinks smoothly when rows come and go: its height follows the content with a transition.
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const update = () => setHeight(el.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={rootRef}
      className="relative min-w-0 flex-1 transition-[height] duration-200 ease-out motion-reduce:transition-none"
      style={height === null ? undefined : { height }}
    >
      <div ref={innerRef} className={`flex flex-col gap-3 ${shown.length > 1 ? 'py-2.5' : ''}`}>
      {shown.map((row, r) => (
        <div key={`row-${r}`} className="flex w-full items-center justify-center">
          {row.map((group, g) => (
            <React.Fragment key={`group-${r}-${g}`}>
              {/* Tabs of one group sit close together; groups keep room between them (28 to 128 px). */}
              {g > 0 && <div className="h-px min-w-7 max-w-32 flex-1" aria-hidden="true" />}
              <div className="flex items-center gap-1">
                {group.map((id) => (
                  <div
                    key={id}
                    data-tab-id={id}
                    onPointerDown={(e) => startDrag(e, id)}
                    onDragStart={(e) => e.preventDefault()}
                    className={`relative flex items-center ${dragId === id ? 'opacity-40' : ''}`}
                  >
                    {renderTab(id)}
                  </div>
                ))}
              </div>
            </React.Fragment>
          ))}
        </div>
      ))}
      </div>
      {dragId && ghost && (
        <div
          className="pointer-events-none fixed z-[900] flex items-center rounded-lg border border-t2-line bg-t2-surface opacity-95 shadow-lg"
          style={{ left: ghost.x, top: ghost.y }}
          aria-hidden="true"
        >
          {renderTab(dragId)}
        </div>
      )}
    </div>
  );
}

export default TabLayoutView;
