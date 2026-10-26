'use client';

import { useState, useCallback } from 'react';

export type DropPosition = 'before' | 'after' | 'inside';

export interface DragItemInfo {
  id: string;
  parentId?: string | null;
  order?: number;
  [key: string]: unknown;
}

export interface UseTodoDragAndDropOptions<T extends DragItemInfo = DragItemInfo> {
  tasks: T[];
  onReorder?: (tasks: T[]) => void | Promise<void>;
  onReparent?: (taskId: string, newParentId: string | null, targetIndex?: number) => void | Promise<void>;
  onMove?: (sourceId: string, targetId: string, position: DropPosition) => void | Promise<void>;
  allowNesting?: boolean;
}

export function isDescendantTask<T extends DragItemInfo>(tasks: T[], ancestorId: string, targetId: string): boolean {
  if (ancestorId === targetId) return true;
  let current = tasks.find((t) => t.id === targetId);
  const visited = new Set<string>();
  while (current?.parentId && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.parentId === ancestorId) return true;
    current = tasks.find((t) => t.id === current!.parentId);
  }
  return false;
}

export function reorderTasks<T extends DragItemInfo>(items: T[], sourceId: string, targetId: string, position: DropPosition): T[] {
  const sourceIndex = items.findIndex((t) => t.id === sourceId);
  const targetIndex = items.findIndex((t) => t.id === targetId);
  if (sourceIndex === -1 || targetIndex === -1) return items;

  const source = items[sourceIndex];
  const target = items[targetIndex];
  const updatedSource = { ...source, parentId: position === 'inside' ? targetId : target.parentId ?? null };

  const remaining = items.filter((t) => t.id !== sourceId);
  const newTargetIndex = remaining.findIndex((t) => t.id === targetId);
  const insertIndex = position === 'before' ? newTargetIndex : newTargetIndex + 1;

  const result = [...remaining];
  result.splice(insertIndex, 0, updatedSource);
  return result.map((item, idx) => ('order' in item ? { ...item, order: idx } : item));
}

export function useTodoDragAndDrop<T extends DragItemInfo = DragItemInfo>({
  tasks,
  onReorder,
  onReparent,
  onMove,
  allowNesting = true,
}: UseTodoDragAndDropOptions<T>) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<DropPosition | null>(null);

  const resetDrag = useCallback(() => {
    setDraggedId(null);
    setDropTargetId(null);
    setDropPosition(null);
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, task: T) => {
    setDraggedId(task.id);
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, target: T) => {
    e.preventDefault();
    if (!draggedId || draggedId === target.id) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;
    const isInvalidParent = isDescendantTask(tasks, draggedId, target.id);

    let pos: DropPosition = 'after';
    if (allowNesting && !isInvalidParent && y > height * 0.25 && y < height * 0.75) {
      pos = 'inside';
    } else if (y <= height * 0.5) {
      pos = 'before';
    }
    setDropTargetId(target.id);
    setDropPosition(pos);
    e.dataTransfer.dropEffect = 'move';
  }, [draggedId, tasks, allowNesting]);

  const handleDragLeave = useCallback((e: React.DragEvent, target: T) => {
    if (dropTargetId === target.id && !e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropTargetId(null);
      setDropPosition(null);
    }
  }, [dropTargetId]);

  const handleDrop = useCallback((e: React.DragEvent, target: T) => {
    e.preventDefault();
    if (!draggedId || draggedId === target.id || !dropPosition) {
      resetDrag();
      return;
    }
    const sourceId = draggedId;
    const targetId = target.id;
    const pos = dropPosition;
    resetDrag();

    if (isDescendantTask(tasks, sourceId, targetId)) return;
    onMove?.(sourceId, targetId, pos);
    onReparent?.(sourceId, pos === 'inside' ? targetId : target.parentId ?? null);
    if (onReorder) {
      onReorder(reorderTasks(tasks, sourceId, targetId, pos));
    }
  }, [draggedId, dropPosition, tasks, onMove, onReparent, onReorder, resetDrag]);

  const getDragProps = useCallback((task: T) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => handleDragStart(e, task),
    onDragEnd: resetDrag,
  }), [handleDragStart, resetDrag]);

  const getDropProps = useCallback((task: T) => ({
    onDragOver: (e: React.DragEvent) => handleDragOver(e, task),
    onDragLeave: (e: React.DragEvent) => handleDragLeave(e, task),
    onDrop: (e: React.DragEvent) => handleDrop(e, task),
  }), [handleDragOver, handleDragLeave, handleDrop]);

  const getRootDropProps = useCallback(() => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (!draggedId) return;
      const sourceId = draggedId;
      resetDrag();
      onReparent?.(sourceId, null);
      if (onReorder) {
        onReorder(tasks.map((t) => (t.id === sourceId ? { ...t, parentId: null } : t)));
      }
    },
  }), [draggedId, tasks, onReparent, onReorder, resetDrag]);

  return {
    draggedId,
    dropTargetId,
    dropPosition,
    isDragging: !!draggedId,
    getDragProps,
    getDropProps,
    getRootDropProps,
    resetDrag,
    reorderTasks,
  };
}

export default useTodoDragAndDrop;
