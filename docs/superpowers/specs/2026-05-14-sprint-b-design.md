# Sprint B — Calendar Overhaul
**Date:** 2026-05-14  
**Status:** Approved

## Overview
Full calendar UX pass in `MobileLayout.tsx`. All changes are mobile-only (`flex md:hidden`).

---

## B1 — Header Redesign

**Remove:** Full MiniCalendar from default view.

**New header structure (always visible when calendar tab active):**
```
[small gray text: "14. May 2026"]
[large bold: "Today" or "Wednesday"]
[Week strip: Mon–Sun with numbers]
```

**Week strip today marker:** Today's day letter + number rendered in `T.accent` color (blue). No filled circle. A small dot `w-1 h-1 rounded-full bg-accent` below the number.

**Selected day (not today):** Bold number, no color change — just `font-bold`.

**Selected day that IS today:** Accent text + dot (same as today marker).

**MiniCalendar access:** Tapping the small date label at top opens/closes the full MiniCalendar as an overlay dropdown (absolute positioned below the header, z-50). Week strip remains visible beneath it.

**Implementation:**
- `isMonthOpen` boolean state (default false)
- Tapping date label toggles `isMonthOpen`
- MiniCalendar renders in `absolute top-full left-0 right-0` inside the header div when open
- Tapping a day in MiniCalendar: sets `activeDate`, closes month, collapses week strip if open

**Large day text:**
```tsx
const isToday = isSameDay(activeDate, now);
const dayLabel = isToday ? 'Today' : format(activeDate, 'EEEE', { locale: enUS });
```

---

## B2 — All-Day Events: Separate Display

**Filter:** In `filterEventsForDate`, the returned array stays the same (no change). In the render, split each day's events:
```tsx
const allDayEvents = dayEvents.filter(e => e.allDay === true || (
  format(new Date(e.start), 'HH:mm') === '00:00' &&
  format(new Date(e.end || e.start), 'HH:mm') === '23:59'
));
const timedEvents = dayEvents.filter(e => !allDayEvents.includes(e));
```

**All-day render:** Compact chips above the timeline, below the date separator:
```
[TODAY · THU 14] ──────────────────
[● keine Lehrveranstaltungen] [● Männertag]   ← colored chips, no time
```

Chip style: `rounded-full px-3 py-1 text-xs font-semibold` with `backgroundColor: event.color + '25'` and `color: event.color`. No dot on timeline for these.

**Timeline:** Only `timedEvents` rendered in the timeline with dots and vertical line.

---

## B3 — Event Cards: Always Visible Pastel Background

Every event row (whether expanded or not) gets a card with pastel background:

```tsx
<div
  className="rounded-2xl px-3 py-2.5 transition-all"
  style={{
    backgroundColor: (event.color || T.accent) + (isExpanded ? '30' : '18'),
    borderLeft: `3px solid ${event.color || T.accent}`,
  }}
>
```

The colored left border always shows. When expanded: slightly more opaque background (`30` vs `18` in hex alpha).

**Dot style change:** Hollow ring (not filled) for past/future events. Filled for active:
- Past/future: `border: 2px solid ${event.color || T.accent}; backgroundColor: transparent; ring-2`
- Active: `backgroundColor: event.color || T.accent` (solid, 14px)

---

## B4 — Progress Line Fix

The vertical line must skip all-day events. The progress gradient is computed only from `timedEvents`:

```tsx
if (isDayToday && timedEvents.length >= 2) {
  const firstStart = new Date(timedEvents[0].start).getTime();
  const lastStart = new Date(timedEvents[timedEvents.length - 1].start).getTime();
  ...
}
```

The line itself renders only alongside `timedEvents`, not all-day events.

---

## B5 — Smooth Header Collapse Animation

Add `layout` prop to the header container so it animates height changes:

```tsx
<motion.div
  layout
  className="w-full z-40 shrink-0"
  transition={{ duration: 0.25, ease: 'easeInOut' }}
  style={{ backgroundColor: T.card, borderBottom: `1px solid ${T.border}` }}
>
```

This makes the calendar→week-strip collapse smooth without height animation on the children.

---

## B6 — Swipe Down to Re-expand (Pull-to-Expand)

When `isCalendarExpanded === false` and the scroll container is at `scrollTop === 0`, a pull-down gesture re-expands the calendar.

**Implementation:** `onTouchStart` + `onTouchMove` on the scroll container:
```tsx
const touchStartY = useRef(0);

onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; }}
onTouchMove={(e) => {
  if (activeTab !== 'calendar' || isCalendarExpanded) return;
  const scrollEl = e.currentTarget;
  if (scrollEl.scrollTop > 0) return; // only when at top
  const dy = e.touches[0].clientY - touchStartY.current;
  if (dy > 40) setIsCalendarExpanded(true); // pull down 40px threshold
}}
```

---

## B7 — Infinite Scroll (Load More Days)

Add `visibleDays` state (default: 5). When scroll position is within 300px of the container bottom, add 5 more:

```tsx
const [visibleDays, setVisibleDays] = useState(5);

const upcomingDays = useMemo(() => {
  return Array.from({ length: visibleDays }).map((_, i) => {
    const date = addDays(activeDate, i);
    return { date, events: filterEventsForDate(events, date) };
  });
}, [events, activeDate, visibleDays]);
```

Reset `visibleDays` to 5 when `activeDate` changes.

Scroll handler addition:
```tsx
const scrollEl = e.currentTarget;
const nearBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 300;
if (nearBottom && activeTab === 'calendar') {
  setVisibleDays(d => d + 5);
}
```

---

## Files Changed

| File | Changes |
|------|---------|
| `web/src/components/Layout/MobileLayout.tsx` | B1–B7 |
