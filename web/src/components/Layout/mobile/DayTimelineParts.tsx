'use client';

import React from 'react';
import { DEFAULT_DURATION_MIN, gapHeightPx, nowPlacement, type NowPlacement } from './timelineMath';
import { FreeGap, formatFree } from './AgendaParts';

/** Inner vertical padding of a block segment; replaces the old `my-1` so DOM height = computed height. */
export const SEG_PAD_PX = 4;

/** Day view only: no text selection and no iOS callout, so a long press reaches the hold gesture. */
export const NO_CALLOUT_STYLE: React.CSSProperties = { WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' };
/** Card style in the day view: the extra style plus the callout guard; other views get `extra` unchanged. */
export const dayCardStyle = (proportional: boolean, extra?: React.CSSProperties) => (proportional ? { ...extra, ...NO_CALLOUT_STYLE } : extra);

const MIN_MS = 60_000;

interface TimedLike { id: string; start: string; end?: string }

export interface DayCluster<E> { events: E[]; clusterStart: Date; clusterEnd: Date }

/** End of an event; events without `end` last DEFAULT_DURATION_MIN. */
export function eventEnd(ev: { start: string; end?: string }): Date {
  return ev.end ? new Date(ev.end) : new Date(new Date(ev.start).getTime() + DEFAULT_DURATION_MIN * MIN_MS);
}

/** Groups start-sorted events into clusters of overlapping events (touching by under a minute does not count). */
export function buildClusters<E extends { start: string; end?: string }>(events: E[]): DayCluster<E>[] {
  const list: DayCluster<E>[] = [];
  for (const ev of events) {
    const s = new Date(ev.start), e = eventEnd(ev);
    const last = list[list.length - 1];
    if (last && s.getTime() < last.clusterEnd.getTime() - MIN_MS) {
      last.events.push(ev);
      if (e.getTime() > last.clusterEnd.getTime()) last.clusterEnd = e;
    } else { list.push({ events: [ev], clusterStart: s, clusterEnd: e }); }
  }
  return list;
}

/** Where "now" sits among the clusters; null on days other than today. */
export function dayNowPlacement(clusters: DayCluster<unknown>[], isToday: boolean, now: Date): NowPlacement | null {
  if (!isToday) return null;
  return nowPlacement(clusters.map(c => ({ start: c.clusterStart.getTime(), end: c.clusterEnd.getTime() })), now.getTime());
}

/**
 * Now-line layout of a day list. `placement` drives the line inside a block or gap (proportional only).
 * `flowIdx` is the cluster before which an in-flow line goes (`clusters.length` = after the last one;
 * anything else = none). Legacy (month/agenda): in front of the first cluster that starts after now.
 */
export function dayNowLayout(clusters: DayCluster<unknown>[], isToday: boolean, now: Date, proportional: boolean) {
  if (!proportional) {
    return { placement: null, flowIdx: isToday ? clusters.findIndex(c => c.clusterStart.getTime() > now.getTime()) : -2 };
  }
  const placement = clusters.length > 0 ? dayNowPlacement(clusters, isToday, now) : null;
  const flowIdx = placement?.kind === 'before-first' ? 0 : placement?.kind === 'after-last' ? clusters.length : -2;
  return { placement, flowIdx };
}

/** Fraction of the now-line inside segment `index` of the given kind, or undefined if it is elsewhere. */
export function nowFractionIn(p: NowPlacement | null, kind: 'in-block' | 'in-gap', index: number): number | undefined {
  return p && p.kind === kind && p.index === index ? p.fraction : undefined;
}

/**
 * Thin line with a dot and the time: where "now" sits in today's list. With `fraction` it is drawn
 * absolutely inside its (relative) segment at that share of the segment height.
 */
export function NowLine({ time, dark, fraction }: { time: Date; dark: boolean; fraction?: number }) {
  // Bordeaux on light, a lighter rose on dark, so it stays readable and matches the calm palette.
  const color = dark ? '#E8909B' : '#7A1F2E';
  const floating = fraction !== undefined;
  return (
    <div
      className={`w-full h-4 flex items-center pointer-events-none ${floating ? '' : 'relative my-0.5'}`}
      style={floating ? { position: 'absolute', left: 0, right: 0, top: `${fraction * 100}%`, transform: 'translateY(-50%)', zIndex: 300, transition: 'top 0.4s ease' } : undefined}
      role="img" aria-label="Jetzt"
    >
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="flex-1 h-px" style={{ background: color }} />
      <span className="text-[11px] font-bold px-1.5" style={{ color }}>{time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
  );
}

/**
 * One event or one cluster of overlapping events, at a proportional height. Grows freely while expanded.
 * With `proportional` off it renders the legacy markup: a bare card, or the `my-1` cluster box at `height`.
 */
export function BlockSeg({ start, end, height, grow, nowFraction, now, dark, cluster, proportional = true, children }: {
  start: Date; end: Date; height: number; grow?: boolean; nowFraction?: number; now: Date; dark: boolean;
  cluster?: boolean; proportional?: boolean; children: React.ReactNode;
}) {
  if (!proportional) {
    return cluster ? <div className="relative w-full my-1" style={{ height }}>{children}</div> : <>{children}</>;
  }
  return (
    <div
      data-seg="block" data-seg-start={String(start.getTime())} data-seg-end={String(end.getTime())}
      className="relative w-full"
      style={{ height: grow ? undefined : height, minHeight: height, paddingTop: SEG_PAD_PX, paddingBottom: SEG_PAD_PX }}
    >
      {cluster ? <div className="relative w-full h-full">{children}</div> : children}
      {nowFraction !== undefined && <NowLine time={now} dark={dark} fraction={nowFraction} />}
    </div>
  );
}

/**
 * Free time between two clusters. Shown when it has a label (15 min or more) or holds "now". Only the gap
 * holding "now" grows to its true length (gapHeightPx); the others stay GAP_PX. Legacy: plain labelled FreeGap.
 */
export function GapSeg({ prevEnd, nextStart, nowMs, nowFraction, now, dark, proportional = true }: {
  prevEnd: Date; nextStart: Date; nowMs: number | null; nowFraction?: number; now: Date; dark: boolean; proportional?: boolean;
}) {
  const label = formatFree(Math.round((nextStart.getTime() - prevEnd.getTime()) / MIN_MS));
  if (!proportional) return label ? <FreeGap label={label} /> : null;
  if (!label && nowFraction === undefined) return null;
  return (
    <FreeGap label={label ?? ''} height={gapHeightPx(prevEnd.getTime(), nextStart.getTime(), nowMs)} segStart={prevEnd.getTime()} segEnd={nextStart.getTime()}>
      {nowFraction !== undefined && <NowLine time={now} dark={dark} fraction={nowFraction} />}
    </FreeGap>
  );
}

/**
 * Column for overlapping events. The longer event keeps the full width; a shorter event that overlaps a
 * longer one moves to the right and gets narrower, more so the more events it sits under. Events that do
 * not overlap are not narrowed. Later starts are drawn on top. `legacyEnd` keeps the old reading of a
 * missing `end` (NaN, never overlapping) for the month/agenda views; otherwise it counts as 60 min.
 */
export function columnsFor(events: TimedLike[], legacyEnd = false): Map<string, { left: number; z: number }> {
  const start = (e: TimedLike) => new Date(e.start).getTime();
  const end = (e: TimedLike) => (legacyEnd ? new Date(e.end ?? NaN).getTime() : eventEnd(e).getTime());
  const dur = (e: TimedLike) => end(e) - start(e);
  const order = [...events].sort((x, y) => start(x) - start(y));
  const out = new Map<string, { left: number; z: number }>();
  order.forEach((e, idx) => {
    const longer = events.filter(o => o.id !== e.id && start(o) < end(e) && end(o) > start(e)
      && (dur(o) > dur(e) || (dur(o) === dur(e) && start(o) < start(e)))).length;
    // A shifted event is drawn above the wide one it sits on, so its title stays readable.
    out.set(e.id, { left: Math.min(longer * 24, 46), z: (longer > 0 ? 100 : 1) + idx });
  });
  return out;
}
