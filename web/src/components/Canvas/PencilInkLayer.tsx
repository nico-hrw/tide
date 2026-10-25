'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { DT } from '@/lib/designTokens';
import type { InkPoint, InkStroke, InkToolType, PencilInputMode } from '@/components/extensions/PencilInkExtension';

export interface PencilInkLayerProps {
  strokes: InkStroke[];
  onStrokesChange: (nextStrokes: InkStroke[]) => void;
  mode: PencilInputMode;
  activeTool: InkToolType;
  strokeColor: string;
  strokeSize: number;
  selectedStrokeIds: string[];
  onSelectedStrokeIdsChange: (ids: string[]) => void;
  editable?: boolean;
}

interface SelectionBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function createStrokeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `ink_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function pointsToSvgPath(points: InkPoint[], offsetX = 0, offsetY = 0): string {
  if (points.length === 0) return '';
  const startX = points[0].x + offsetX;
  const startY = points[0].y + offsetY;
  if (points.length === 1) {
    return `M ${startX.toFixed(2)} ${startY.toFixed(2)} L ${(startX + 0.1).toFixed(2)} ${(startY + 0.1).toFixed(2)}`;
  }
  let d = `M ${startX.toFixed(2)} ${startY.toFixed(2)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    const midX = (curr.x + next.x) / 2 + offsetX;
    const midY = (curr.y + next.y) / 2 + offsetY;
    d += ` Q ${(curr.x + offsetX).toFixed(2)} ${(curr.y + offsetY).toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${(last.x + offsetX).toFixed(2)} ${(last.y + offsetY).toFixed(2)}`;
}

function distanceToSegmentSq(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return (px - x1) ** 2 + (py - y1) ** 2;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return (px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2;
}

function strokeHitsEraser(stroke: InkStroke, cx: number, cy: number, eraserRadius: number): boolean {
  const pts = stroke.points;
  if (pts.length === 0) return false;
  const thresholdSq = (eraserRadius + stroke.size / 2) ** 2;
  for (let i = 0; i < pts.length; i++) {
    if ((pts[i].x - cx) ** 2 + (pts[i].y - cy) ** 2 <= thresholdSq) return true;
    if (i > 0 && distanceToSegmentSq(cx, cy, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) <= thresholdSq) return true;
  }
  return false;
}

function isPointInPolygon(point: InkPoint, polygon: InkPoint[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if (yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi || 1e-7) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function isStrokeSelectedByLasso(stroke: InkStroke, lasso: InkPoint[]): boolean {
  if (lasso.length < 3 || stroke.points.length === 0) return false;
  let insideCount = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pt of stroke.points) {
    if (isPointInPolygon(pt, lasso)) insideCount++;
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }
  if (insideCount / stroke.points.length >= 0.5 || (stroke.points.length <= 2 && insideCount > 0)) return true;
  return isPointInPolygon({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, lasso);
}

export const PencilInkLayer: React.FC<PencilInkLayerProps> = ({
  strokes,
  onStrokesChange,
  mode,
  activeTool,
  strokeColor,
  strokeSize,
  selectedStrokeIds,
  onSelectedStrokeIdsChange,
  editable = true,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activePenPointerIdRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const interactionRef = useRef<'none' | 'drawing' | 'erasing' | 'lassoing' | 'moving'>('none');
  const moveStartRef = useRef<{ x: number; y: number } | null>(null);
  const activePointsRef = useRef<InkPoint[]>([]);
  const activeStrokeMetaRef = useRef<Omit<InkStroke, 'points'> | null>(null);
  const lassoPointsRef = useRef<InkPoint[]>([]);
  const workingStrokesRef = useRef<InkStroke[]>(strokes);

  const [currentStroke, setCurrentStroke] = useState<InkStroke | null>(null);
  const [eraserCursor, setEraserCursor] = useState<{ x: number; y: number } | null>(null);
  const [lassoPoints, setLassoPoints] = useState<InkPoint[]>([]);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  useEffect(() => {
    if (interactionRef.current !== 'erasing') workingStrokesRef.current = strokes;
  }, [strokes]);

  const selectedSet = useMemo(() => new Set(selectedStrokeIds), [selectedStrokeIds]);

  const selectionBounds = useMemo<SelectionBounds | null>(() => {
    if (selectedSet.size === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, found = false;
    for (const s of strokes) {
      if (!selectedSet.has(s.id)) continue;
      const pad = Math.max(s.size / 2, 6);
      for (const pt of s.points) {
        found = true;
        if (pt.x - pad < minX) minX = pt.x - pad;
        if (pt.y - pad < minY) minY = pt.y - pad;
        if (pt.x + pad > maxX) maxX = pt.x + pad;
        if (pt.y + pad > maxY) maxY = pt.y + pad;
      }
    }
    return found ? { minX: minX - 6, minY: minY - 6, maxX: maxX + 6, maxY: maxY + 6 } : null;
  }, [strokes, selectedSet]);

  const eraserRadius = Math.max(strokeSize * 2.5, 14);
  const isDrawInteractive = Boolean(editable && mode === 'draw');

  const extractRelativePoints = useCallback((e: React.PointerEvent<HTMLDivElement>): InkPoint[] => {
    const container = containerRef.current;
    if (!container) return [];
    const rect = container.getBoundingClientRect();
    const nativeEv = e.nativeEvent;
    const coalesced: PointerEvent[] =
      'getCoalescedEvents' in nativeEv && typeof nativeEv.getCoalescedEvents === 'function'
        ? nativeEv.getCoalescedEvents()
        : [nativeEv];
    const events = coalesced.length > 0 ? coalesced : [nativeEv];
    return events.map((ev) => ({ x: ev.clientX - rect.left, y: ev.clientY - rect.top, p: ev.pressure || 0.5 }));
  }, []);

  const eraseAtPoints = useCallback(
    (pts: InkPoint[]) => {
      let current = workingStrokesRef.current;
      let changed = false;
      for (const pt of pts) {
        const filtered = current.filter((s) => !strokeHitsEraser(s, pt.x, pt.y, eraserRadius));
        if (filtered.length !== current.length) {
          current = filtered;
          changed = true;
        }
      }
      if (changed) {
        workingStrokesRef.current = current;
        onStrokesChange(current);
      }
    },
    [eraserRadius, onStrokesChange]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDrawInteractive) return;
      if (e.pointerType === 'pen') activePenPointerIdRef.current = e.pointerId;
      else if (e.pointerType === 'touch' && activePenPointerIdRef.current !== null) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;

      e.preventDefault();
      e.stopPropagation();
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic event */ }

      activePointerIdRef.current = e.pointerId;
      const pts = extractRelativePoints(e);
      const firstPt = pts[0];
      if (!firstPt) return;

      if (activeTool === 'pen' || activeTool === 'marker') {
        if (selectedStrokeIds.length > 0) onSelectedStrokeIdsChange([]);
        interactionRef.current = 'drawing';
        const isMarker = activeTool === 'marker';
        const meta: Omit<InkStroke, 'points'> = {
          id: createStrokeId(),
          tool: isMarker ? 'marker' : 'pen',
          color: strokeColor,
          size: isMarker ? Math.max(strokeSize * 3.5, 16) : strokeSize,
          opacity: isMarker ? 0.35 : 1,
        };
        activeStrokeMetaRef.current = meta;
        activePointsRef.current = pts;
        setCurrentStroke({ ...meta, points: pts });
      } else if (activeTool === 'eraser') {
        interactionRef.current = 'erasing';
        workingStrokesRef.current = strokes;
        setEraserCursor({ x: firstPt.x, y: firstPt.y });
        eraseAtPoints(pts);
      } else if (activeTool === 'select') {
        const insideSelection =
          selectionBounds !== null &&
          firstPt.x >= selectionBounds.minX &&
          firstPt.x <= selectionBounds.maxX &&
          firstPt.y >= selectionBounds.minY &&
          firstPt.y <= selectionBounds.maxY;

        if (insideSelection && selectedStrokeIds.length > 0) {
          interactionRef.current = 'moving';
          moveStartRef.current = { x: firstPt.x, y: firstPt.y };
          setDragOffset({ dx: 0, dy: 0 });
        } else {
          interactionRef.current = 'lassoing';
          lassoPointsRef.current = pts;
          setLassoPoints(pts);
          if (selectedStrokeIds.length > 0) onSelectedStrokeIdsChange([]);
        }
      }
    },
    [
      isDrawInteractive,
      extractRelativePoints,
      activeTool,
      selectedStrokeIds.length,
      onSelectedStrokeIdsChange,
      strokeColor,
      strokeSize,
      strokes,
      eraseAtPoints,
      selectionBounds,
    ]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDrawInteractive) return;
      if (e.pointerType === 'touch' && activePenPointerIdRef.current !== null) return;
      if (activePointerIdRef.current !== e.pointerId) return;

      const modeNow = interactionRef.current;
      if (modeNow === 'none') return;
      e.preventDefault();
      const pts = extractRelativePoints(e);
      if (pts.length === 0) return;
      const lastPt = pts[pts.length - 1];

      if (modeNow === 'drawing' && activeStrokeMetaRef.current) {
        const nextPoints = [...activePointsRef.current, ...pts];
        activePointsRef.current = nextPoints;
        setCurrentStroke({ ...activeStrokeMetaRef.current, points: nextPoints });
      } else if (modeNow === 'erasing') {
        setEraserCursor({ x: lastPt.x, y: lastPt.y });
        eraseAtPoints(pts);
      } else if (modeNow === 'lassoing') {
        const nextLasso = [...lassoPointsRef.current, ...pts];
        lassoPointsRef.current = nextLasso;
        setLassoPoints(nextLasso);
      } else if (modeNow === 'moving' && moveStartRef.current) {
        setDragOffset({ dx: lastPt.x - moveStartRef.current.x, dy: lastPt.y - moveStartRef.current.y });
      }
    },
    [isDrawInteractive, extractRelativePoints, eraseAtPoints]
  );

  const finishPointerInteraction = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'pen' && activePenPointerIdRef.current === e.pointerId) {
        activePenPointerIdRef.current = null;
      }
      if (activePointerIdRef.current !== e.pointerId) return;

      const modeNow = interactionRef.current;
      interactionRef.current = 'none';
      activePointerIdRef.current = null;

      if (modeNow === 'drawing' && activeStrokeMetaRef.current) {
        const finalPoints = activePointsRef.current;
        if (finalPoints.length > 0) {
          onStrokesChange([...strokes, { ...activeStrokeMetaRef.current, points: finalPoints }]);
        }
        activeStrokeMetaRef.current = null;
        activePointsRef.current = [];
        setCurrentStroke(null);
      } else if (modeNow === 'erasing') {
        setEraserCursor(null);
      } else if (modeNow === 'lassoing') {
        const poly = lassoPointsRef.current;
        const matchedIds = poly.length >= 3 ? strokes.filter((s) => isStrokeSelectedByLasso(s, poly)).map((s) => s.id) : [];
        onSelectedStrokeIdsChange(matchedIds);
        lassoPointsRef.current = [];
        setLassoPoints([]);
      } else if (modeNow === 'moving') {
        if (dragOffset.dx !== 0 || dragOffset.dy !== 0) {
          const updated = strokes.map((s) =>
            selectedSet.has(s.id)
              ? { ...s, points: s.points.map((pt) => ({ ...pt, x: pt.x + dragOffset.dx, y: pt.y + dragOffset.dy })) }
              : s
          );
          onStrokesChange(updated);
        }
        moveStartRef.current = null;
        setDragOffset({ dx: 0, dy: 0 });
      }
    },
    [strokes, onStrokesChange, onSelectedStrokeIdsChange, dragOffset, selectedSet]
  );

  const handleDeleteSelected = useCallback(
    (e: React.MouseEvent<HTMLButtonElement> | React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (selectedSet.size === 0) return;
      onStrokesChange(strokes.filter((s) => !selectedSet.has(s.id)));
      onSelectedStrokeIdsChange([]);
      setDragOffset({ dx: 0, dy: 0 });
    },
    [selectedSet, strokes, onStrokesChange, onSelectedStrokeIdsChange]
  );

  const lassoPolygonPoints = useMemo(
    () => lassoPoints.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' '),
    [lassoPoints]
  );

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerInteraction}
      onPointerCancel={finishPointerInteraction}
      className={`absolute inset-0 w-full h-full z-30 select-none ${
        isDrawInteractive ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
      style={{
        touchAction: isDrawInteractive ? 'none' : 'auto',
        cursor: isDrawInteractive ? (activeTool === 'eraser' ? 'none' : 'crosshair') : 'default',
      }}
    >
      <svg className="w-full h-full overflow-visible pointer-events-none">
        {strokes.map((stroke) => {
          const isSelected = selectedSet.has(stroke.id);
          const pathData = pointsToSvgPath(stroke.points, isSelected ? dragOffset.dx : 0, isSelected ? dragOffset.dy : 0);
          if (!pathData) return null;
          return (
            <path
              key={stroke.id}
              d={pathData}
              fill="none"
              stroke={stroke.color}
              strokeWidth={stroke.size}
              strokeOpacity={stroke.opacity}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={stroke.tool === 'marker' ? { mixBlendMode: 'multiply' } : undefined}
            />
          );
        })}

        {currentStroke && (
          <path
            d={pointsToSvgPath(currentStroke.points)}
            fill="none"
            stroke={currentStroke.color}
            strokeWidth={currentStroke.size}
            strokeOpacity={currentStroke.opacity}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={currentStroke.tool === 'marker' ? { mixBlendMode: 'multiply' } : undefined}
          />
        )}

        {lassoPoints.length > 1 && (
          <polygon
            points={lassoPolygonPoints}
            fill={DT.accent}
            fillOpacity={0.08}
            stroke={DT.accent}
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />
        )}

        {selectionBounds && (
          <rect
            x={selectionBounds.minX + dragOffset.dx}
            y={selectionBounds.minY + dragOffset.dy}
            width={Math.max(selectionBounds.maxX - selectionBounds.minX, 4)}
            height={Math.max(selectionBounds.maxY - selectionBounds.minY, 4)}
            rx={DT.radius}
            fill={DT.accent}
            fillOpacity={0.04}
            stroke={DT.accent}
            strokeWidth={1.5}
            strokeDasharray="6 4"
          />
        )}

        {eraserCursor && (
          <circle
            cx={eraserCursor.x}
            cy={eraserCursor.y}
            r={eraserRadius}
            fill={DT.glass(false)}
            stroke={DT.borderControl}
            strokeWidth={1.5}
          />
        )}
      </svg>

      {isDrawInteractive && selectionBounds && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleDeleteSelected}
          title="Auswahl löschen"
          className="absolute flex items-center justify-center w-7 h-7 transition-transform active:scale-95"
          style={{
            left: `${selectionBounds.maxX + dragOffset.dx - 14}px`,
            top: `${Math.max(selectionBounds.minY + dragOffset.dy - 14, 4)}px`,
            borderRadius: DT.radius,
            backgroundColor: DT.status.danger.bg,
            color: DT.status.danger.fg,
            boxShadow: DT.shadowE1,
          }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

export default PencilInkLayer;
