# Sprint D — Event Panel + Calendar Header + Background
**Date:** 2026-05-14  
**Status:** Approved

---

## D1 — Event expand panel redesign

### Time info: compact single line
Instead of two separate `<div>` lines for status + duration, show one compact info chip:
- Status text only in the colored pill: `"Starts in 2h"` / `"Running — 45m left"` / `"Ended 2h ago"`
- No separate duration line (remove it)
- Description shown below, editable

### Delete button: icon only
Replace the text "Delete" button with `<Trash2 size={16} />` icon, red color, small tap area.

### Description: editable on tap
Description is shown as text. Tapping it makes it a `<textarea>` (controlled by local `editingDesc` state per event). On blur: update via `useDataStore.setState` (optimistic local update only — encryption sync is a future task).

```
Expanded event card:
[status pill]
[description — tappable → becomes textarea]
[Trash icon button]
```

### Swipe gestures on event rows
Use Framer Motion `drag="x"` on the outermost event row div.

- **Left swipe** (if `event.is_task`): reveal green "✓" background from right; on `onDragEnd` if `offset.x < -80` → call `onTaskComplete(id, true)`
- **Right swipe** (always): reveal red trash background from left; on `onDragEnd` if `offset.x > 80` → call `onEventDelete(id)`
- Threshold not met → spring back to center (`dragConstraints={{ left: -120, right: 120 }}`, `dragElastic: 0.2`)
- Swipe bg colors: `rgba(16, 185, 129, 0.15)` for left (green), `rgba(239, 68, 68, 0.15)` for right (red)
- Show icon hint during drag: `<Check>` appears from right, `<Trash2>` appears from left

Implementation: wrap the event row in a relative container with colored backgrounds, then `motion.div` on top that drags.

---

## D2 — Calendar header: month/week scroll toggle

### Behavior
- `isMonthExpanded` state (default: `false`)
- Scroll handler logic (added to `handleScroll`):
  - `scrollTop <= 15` → `setIsMonthExpanded(true)` — show full month calendar in header
  - `scrollTop > 60` → `setIsMonthExpanded(false)` — collapse to week strip
- No bounce-back issue because: infinite scroll means always enough content, and threshold gap (15 vs 60) provides hysteresis

### Header structure
```
[date label small]           ← always visible
[Today / Wednesday large]    ← always visible
[AnimatePresence →
  isMonthExpanded: <MiniCalendar>  fade in/out  
  !isMonthExpanded: week strip
]
```

AnimatePresence mode="wait" between MiniCalendar and week strip. Each transition fades (opacity only, no height animation to avoid layout jitter).

MiniCalendar: `onSelect(d)` → `setActiveDate(d)` + no scroll reset (month stays visible until user scrolls down).

---

## D3 — White background + timeline border

### Background
- Change outer container `backgroundColor` from `T.bg` (`#F0F4FF`) to `'#FFFFFF'`
- Update `T.bg` constant to `'#FFFFFF'`

### Timeline card border
- Add `boxShadow: '0 0 0 1.5px #D1D5DB, 0 2px 12px rgba(0,0,0,0.06)'` to the timeline card div
- Keep existing `rounded-t-[32px]`

---

## Files Changed
- `web/src/components/Layout/MobileLayout.tsx` — D1 + D2 + D3
