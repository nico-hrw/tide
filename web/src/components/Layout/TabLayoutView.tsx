'use client';

import React, { useState } from 'react';
import type { DropTarget, TabRows } from '@/lib/tabLayout';

interface TabLayoutViewProps {
  rows: TabRows;
  /** Renders one tab (the element itself, without drag handling). */
  renderTab: (id: string) => React.ReactNode;
  onMove: (id: string, target: DropTarget) => void;
}

/**
 * Tab bar layout: rows of small groups. Tabs are dragged with the mouse; drop zones appear only
 * while dragging: at the row edges (new group), between groups (new group), below a row (new row),
 * on a tab's left or right half (place next to it). Empty groups and rows are removed by moveTab.
 */
export function TabLayoutView({ rows, renderTab, onMove }: TabLayoutViewProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const drop = (target: DropTarget) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const id = dragId ?? e.dataTransfer.getData('text/plain');
    if (id) onMove(id, target);
    setDragId(null);
    setHint(null);
  };
  const over = (key: string) => (e: React.DragEvent) => {
    if (!dragId) return;
    e.preventDefault();
    e.stopPropagation();
    setHint(key);
  };
  const leave = (key: string) => () => setHint((h) => (h === key ? null : h));

  // A drop zone keeps its space all the time (no jump when dragging starts); it is only tinted while dragging.
  const zone = (key: string, target: DropTarget, box: string) => (
    <div
      key={key}
      onDragOver={(e) => {
        if (!dragId) return;
        e.dataTransfer.dropEffect = 'move';
        over(key)(e);
      }}
      onDragLeave={leave(key)}
      onDrop={drop(target)}
      className={`shrink-0 rounded-full transition-colors ${box} ${
        !dragId ? '' : hint === key ? 'bg-t2-accent' : 'bg-t2-line-soft'
      }`}
      aria-hidden="true"
    />
  );

  return (
    <div className="flex flex-col min-w-0">
      {rows.map((row, r) => {
        const firstRef = row[0][0];
        const lastGroup = row[row.length - 1];
        const lastRef = lastGroup[lastGroup.length - 1];
        return (
          <React.Fragment key={`row-${r}`}>
            {r === 0 && zone(`rowAbove-${r}`, { kind: 'rowAbove', ref: firstRef }, 'h-3 w-full')}
            <div className="flex items-stretch">
              {zone(`rowStart-${r}`, { kind: 'rowStart', ref: firstRef }, 'w-3 min-h-[34px]')}
              {row.map((group, g) => (
                <React.Fragment key={`group-${r}-${g}`}>
                  {g > 0 && zone(`groupBefore-${r}-${g}`, { kind: 'groupBefore', ref: group[0] }, 'w-4 min-h-[34px]')}
                  <div
                    className="flex items-center gap-1"
                    onDragOver={over(`group-${r}-${g}`)}
                    onDragLeave={leave(`group-${r}-${g}`)}
                    onDrop={drop({ kind: 'intoGroup', ref: group[group.length - 1] })}
                  >
                    {group.map((id) => (
                      <div
                        key={id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', id);
                          e.dataTransfer.effectAllowed = 'move';
                          setDragId(id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setHint(null);
                        }}
                        onDragOver={(e) => {
                          if (!dragId || dragId === id) return;
                          e.preventDefault();
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHint(`${e.clientX < rect.left + rect.width / 2 ? 'before' : 'after'}-${id}`);
                        }}
                        onDrop={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const before = e.clientX < rect.left + rect.width / 2;
                          drop({ kind: before ? 'before' : 'after', ref: id })(e);
                        }}
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
              {zone(`rowEnd-${r}`, { kind: 'rowEnd', ref: lastRef }, 'w-3 min-h-[34px]')}
            </div>
            {zone(`rowBelow-${r}`, { kind: 'rowBelow', ref: firstRef }, 'h-3 w-full')}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default TabLayoutView;
