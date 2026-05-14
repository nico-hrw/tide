# Sprint G — Bug Fixes + Social Polish
**Date:** 2026-05-14 | Status: Approved

---

## G1: Events in Notes filter (page.tsx)
Change files filter in `<MobileLayout>` to exclude events:
```tsx
files={files.filter((f: any) => !f.isGroup && !(f.title || '').startsWith('.') && f.type !== 'event')}
```

---

## G2: Calendar expand — pull resistance
**Remove** scroll-based expand (`scrollTop <= 15 → setIsMonthExpanded(true)`). Only collapse via scroll.
**Add** deliberate pull detection: track vertical pull distance from touchStart when `scrollTop === 0`. Expand only after 60px downward pull on scroll container.

Implementation in MobileLayout:
```tsx
const verticalPullStartY = useRef(0);

onTouchStart of scroll container: verticalPullStartY.current = e.touches[0].clientY
onTouchMove of scroll container: 
  if (el.scrollTop <= 0 && activeTab === 'calendar') {
    const pull = e.touches[0].clientY - verticalPullStartY.current;
    if (pull > 60) setIsMonthExpanded(true);
  }
```

handleScroll: keep `scrollTop > 60 → setIsMonthExpanded(false)` but REMOVE `scrollTop <= 15 → setIsMonthExpanded(true)`.

---

## G3: Notes design + Today highlight + All-day "keine Termine"

### Notes design
Remove the outer `<div className="rounded-3xl overflow-hidden" style={{ backgroundColor: T.card, border: ...}}>` wrapper in the notes list. Show folders and files directly on `T.bg` (now white). Make it flat — no page-within-a-page.

File icons: change `T.iconBg` (#EFF6FF) to `'#F3F4F6'` (neutral gray-100) for all note/folder icons. Change icon color from `T.accent` (blue) to `T.textSec` (gray). Only the "New Note" button keeps blue accent.

### Today highlight in timeline  
In the date separator of `upcomingDays.map`, when `isDayToday`:
- Make the label text **bold + accent colored**
- Add a small `bg-accent rounded-full px-2 py-0.5 text-white text-[10px]` "Heute" chip next to the label
- Give the section a slightly different visual weight

### All-day only days
In the timeline, the empty state currently checks `dayEvents.length === 0`. Add a check for when timed events are empty but all-day events exist:
```tsx
{timedEvents.length === 0 ? (
  <div className="flex flex-col items-center gap-2 py-4">
    <p className="text-xs text-center" style={{ color: T.textMuted }}>
      {allDayEvents.length > 0 ? 'Keine weiteren Termine' : 'Keine Termine'}
    </p>
  </div>
) : ( /* timeline */ )}
```

---

## G4: Day snapping + Tracker smooth animation

### Day snapping
Add `scroll-snap-type: y proximity` to the scrollable content div.
Each day's outer container div in `upcomingDays.map` gets `scroll-snap-align: start`.

### Tracker smooth animation
Use `useMotionValue` + `useTransform` from framer-motion to bypass React re-renders:
```tsx
import { useMotionValue, useTransform } from 'framer-motion';

const trackerProgressMV = useMotionValue(0);
const circumference = 2 * Math.PI * 34;
const dashOffset = useTransform(trackerProgressMV, [0, 1], [circumference, 0]);
```

In `handleSwipeMove`: `trackerProgressMV.set(progress)` alongside `setTrackerProgress(progress)`.
In `handleSwipeEnd`: `trackerProgressMV.set(0)`.

Replace the SVG progress circle with `motion.circle`:
```tsx
<motion.circle
  cx="40" cy="40" r="34"
  fill="none"
  stroke={T.accent}
  strokeWidth="4"
  strokeDasharray={circumference}
  style={{ strokeDashoffset: dashOffset }}
  strokeLinecap="round"
  transform="rotate(-90 40 40)"
/>
```
Remove the CSS `transition` from this element (framer handles it).

---

## G5: Social Tab mobile optimization (SocialHub.tsx + MobileLayout.tsx)

### SocialHub.tsx changes
Add `compact?: boolean` prop.

**When compact:**
- Hide the own-profile card block (the `{userProfile && (<div className="relative flex flex-col items-center bg-gray-50..."> ... </div>)}`)
- Remove the outer `max-w-5xl mx-auto py-12 px-8` padding — use `p-0` div or just pass through children
- Make contacts list items full-width with `w-full`
- Chat: wrap `activeChatPartner && <ChatPanel ...>` in `<BottomSheet isOpen={!!activeChatPartner} onClose={() => setActiveChatPartner(null)} title={activeChatPartner?.username}>` (import BottomSheet from '@/components/Layout/BottomSheet')
- Move search form to the bottom of the component when compact
- Hide "Discover People" / suggestions section when `suggestions.length === 0`

### MobileLayout.tsx: pass compact=true
In the socialHubElement prop passed in MobileLayout (or in page.tsx), add `compact={true}` to the SocialHub. But since socialHubElement is a ReactNode passed from page.tsx, update page.tsx to pass `compact={true}`.

### Avatar salt in Social header
In MobileLayout, the Social tab header avatar already uses:
```tsx
seed={`${userProfile.avatar_seed}_${userProfile.avatar_salt ?? ''}`}
```
But SocialHub uses direct concatenation (no underscore): `seed + salt`. To be consistent with SocialHub, change the separator in MobileLayout to no separator:
```tsx
seed={`${userProfile.avatar_seed}${userProfile.avatar_salt ?? ''}`}
```

Also update the profile overlay Avatar in MobileLayout to match.

---

## Files Changed
- `web/src/app/page.tsx` — G1, G5 (compact prop)
- `web/src/components/Layout/MobileLayout.tsx` — G2, G3, G4, G5
- `web/src/components/Social/SocialHub.tsx` — G5
