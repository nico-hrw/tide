# Sprint E — Swipe Navigation + Dot Indicators
**Date:** 2026-05-14  
**Status:** Approved

---

## Overview

Replace the icon bottom nav bar with:
1. 4 floating dot indicators (no background, no icon bar)
2. Horizontal swipe between tabs (Notes → Calendar → Profile → [Tracker])
3. Tracker tab requires sustained swipe with a circular loading indicator

Tabs in order: `notes` (0), `calendar` (1), `profile` (2), and Tracker (3, external redirect)

---

## E1 — Remove nav bar, add dot indicators

### Remove
- The entire `<nav>` element (bottom bar with NavTab components)
- The `pb-16` padding on scrollable content (or change to `pb-10` for dots)
- NavTab component definition

### Add dot indicator
```tsx
{/* Floating dot navigation — positioned over content */}
<div className="fixed bottom-6 left-0 right-0 flex justify-center items-center gap-3 z-50 pointer-events-none">
  {['notes', 'calendar', 'profile', 'tracker'].map((tab, i) => (
    <div
      key={tab}
      className="rounded-full transition-all duration-200"
      style={{
        width: activeTabIndex === i ? '20px' : '6px',
        height: '6px',
        backgroundColor: activeTabIndex === i
          ? T.accent
          : 'rgba(0,0,0,0.2)',
      }}
    />
  ))}
</div>
```

Active dot: wider pill (`20px × 6px`). Inactive: small circle (`6px × 6px`). No background behind dots.

### State changes
- Replace `activeTab: 'notes' | 'calendar' | 'profile'` with `activeTabIndex: number` (0–2, not 3 since tracker is external)
- Keep `activeTab` derived: `const activeTab = ['notes', 'calendar', 'profile'][activeTabIndex]`
- Or keep `activeTab` as-is and map to index when needed

---

## E2 — Horizontal swipe between tabs

### Gesture detection
Add `onTouchStart`, `onTouchMove`, `onTouchEnd` to the main content area (outside event cards — event card drags stop propagation).

```tsx
const touchStartXRef = useRef(0);
const [swipeOffset, setSwipeOffset] = useState(0); // visual feedback during swipe

onTouchStart: record e.touches[0].clientX
onTouchMove: setSwipeOffset(currentX - startX), limit to ±screenWidth/2
onTouchEnd: if |offset| > 60 → change tab; reset offset with spring animation
```

### Animation during swipe
Apply `transform: translateX(swipeOffset * 0.3)` to the content (parallax effect, 30% follow-through). On tab change: animate to 0 with `transition: 'transform 0.25s ease-out'`.

### Tab changing
```tsx
const goNext = () => setActiveTabIndex(i => Math.min(i + 1, 2));
const goPrev = () => setActiveTabIndex(i => Math.max(i - 1, 0));
```

Swiping left (negative offset → next tab). Swiping right (positive offset → prev tab).

Back button in notes editor: set `isEditingNote(false)` instead of tab change.

### Resistance on right edge of Profile tab (index 2 → "Tracker")
When `activeTabIndex === 2` and user swipes LEFT (toward tracker):
- Allow drag with resistance: `swipeOffset = Math.min(0, offset * 0.3)` (dampened)
- Show circular progress indicator: `progress = Math.min(1, Math.abs(offset) / 150)`
- Circular progress SVG (radius 20, stroke):

```tsx
<svg width="48" height="48" viewBox="0 0 48 48" style={{
  position: 'fixed',
  bottom: 24,
  right: 24,
  opacity: progress > 0 ? 1 : 0,
  transition: 'opacity 0.2s',
}}>
  <circle cx="24" cy="24" r="18" fill="none" stroke="#E5E7EB" strokeWidth="3" />
  <circle
    cx="24" cy="24" r="18" fill="none"
    stroke={T.accent} strokeWidth="3"
    strokeDasharray={`${2 * Math.PI * 18}`}
    strokeDashoffset={`${2 * Math.PI * 18 * (1 - progress)}`}
    strokeLinecap="round"
    transform="rotate(-90 24 24)"
    style={{ transition: 'stroke-dashoffset 0.05s' }}
  />
  <Dumbbell ... /> {/* icon in center */}
</svg>
```

When `progress >= 1` (drag ≥ 150px): navigate to tracker URL.
When drag released before 100%: spring back, hide progress circle.

---

## E3 — Keep existing tab header animations

The header AnimatePresence already handles tab-specific headers. Keep this as-is. The swipe gesture changes `activeTab`, which triggers the existing header + content animations.

---

## Files Changed
- `web/src/components/Layout/MobileLayout.tsx` — everything
