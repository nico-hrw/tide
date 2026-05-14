# Sprint C — Calendar Polish + Task Checkboxes
**Date:** 2026-05-14  
**Status:** Approved (user: "mach was du für richtig hältst")

## Files Changed
- `web/src/components/Layout/MobileLayout.tsx` — all UI changes
- `web/src/app/page.tsx` — add onTaskComplete prop handler

---

## Fix 1: Tracker tab link

**Problem:** `NEXT_PUBLIC_TRACKER_URL` is not set on the server → `href="#"` → link does nothing.

**Fix in MobileLayout.tsx:** Replace the `<a href>` with a `<button onClick>`. When URL is set: `window.open(url, '_self')`. When not set: tab is visually grayed out and click shows nothing (no navigation). This makes the broken state obvious without crashing.

```tsx
const trackerUrl = process.env.NEXT_PUBLIC_TRACKER_URL;

<button
  onClick={() => trackerUrl && (window.location.href = trackerUrl)}
  className="flex flex-col items-center justify-center flex-1 h-full gap-1 focus:outline-none"
  style={{ color: trackerUrl ? T.textMuted : T.border }}
>
  <Dumbbell size={20} />
  <div className="w-1 h-1" />
</button>
```

**User action required:** Set `NEXT_PUBLIC_TRACKER_URL=https://your-tracker-domain` in `.env.local` on the server, then rebuild.

---

## Fix 2: Design — timeline layout + event cards

### Timeline container
- Remove the `p-4` outer wrapper on the calendar tab content → timeline goes full width
- Scroll container background: `backgroundColor: T.card` (white) instead of `T.bg` (blue-gray)
- Timeline inner div: `rounded-t-[32px]` (more rounded at top), no `rounded-b` (flat at bottom)
- Remove `border` and `shadow` from the timeline container

### Event cards
- Remove `borderLeft: 3px solid color` from event content div
- Change `rounded-2xl` → `rounded-xl` on the content div
- Keep the pastel `backgroundColor` with hex alpha (keep `+15` / `+28` pattern)

### Empty state
- Change "No events" to a gray centered text with a subtle icon:
  ```tsx
  <p className="text-xs text-center py-6" style={{ color: T.textMuted }}>Keine Termine</p>
  ```

---

## Fix 3: Header redesign — always visible, mini-cal in scroll

### Remove
- `isCalendarExpanded` state
- `isMonthOpen` state  
- `motion.div layout` on header container (causes layout glitches)
- All scroll-based collapse/expand logic

### New header (always fixed, never changes)
```
[date small, gray, left-aligned — "14. Mai 2026"]
[Today / Wednesday — large bold]
[Week strip: 7 days, today = accent color text + dot]
```

Week strip: today has accent text color + small dot below. Selected day: bold weight. No filled circles. Tapping a day → sets activeDate.

### New scroll area
- Add `const scrollRef = useRef<HTMLDivElement>(null)`
- Add `const MINI_CAL_HEIGHT = 290` constant
- The MiniCalendar is the **first child** of the scroll container (above the timeline)
- On mount + on activeDate change: `scrollRef.current.scrollTop = MINI_CAL_HEIGHT` (auto-hide mini-cal)
- On date select in MiniCalendar: `setActiveDate(d); scrollRef.current.scrollTop = MINI_CAL_HEIGHT;`
- User scrolls/pulls all the way up → mini-calendar becomes visible

### Scroll handler (simplified)
Keep only infinite scroll (load more days). Remove collapse/expand:
```typescript
const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
  if (activeTab !== 'calendar') return;
  const el = e.currentTarget;
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) {
    if (visibleDays !== loadMoreTriggeredAt.current) {
      loadMoreTriggeredAt.current = visibleDays;
      setVisibleDays(d => d + 5);
    }
  }
};
```

Remove touch handlers (swipe-down no longer needed — scrolling to top shows mini-cal naturally).

---

## Fix 4: Time-based event spacing

Replace `gap-6` on the timeline flex container with individual `marginTop` per event.

For each `timedEvent` at index `idx`:
- If `idx === 0`: no top margin
- Else: compute `gapMs = startDate.getTime() - new Date(timedEvents[idx-1].end || timedEvents[idx-1].start).getTime()`
- `gapMinutes = Math.max(0, gapMs / 60_000)`
- `mt = Math.round(Math.max(8, Math.min(56, 8 + (gapMinutes / 60) * 64)))`
- Apply as `style={{ marginTop: mt + 'px' }}`

Remove the `gap-6` from the container div; replace with `gap-0`.

---

## Fix 5: Task checkboxes

### MobileLayoutProps — add prop
```typescript
onTaskComplete?: (id: string, completed: boolean) => void;
```

### Event row — show checkbox when is_task
Import `CheckSquare, Square` from lucide-react.

When `event.is_task === true`, show checkbox button in the event content:
```tsx
{event.is_task && (
  <button
    onClick={e => {
      e.stopPropagation();
      onTaskComplete?.(event.id, !event.is_completed);
    }}
    className="shrink-0 mt-0.5"
    style={{ color: event.is_completed ? T.accent : T.textMuted }}
  >
    {event.is_completed ? <CheckSquare size={16} /> : <Square size={16} />}
  </button>
)}
```

Place it to the left of the event title inside the card.

Completed task styling:
- Title: `textDecoration: 'line-through'`, `opacity: 0.5`
- Card background alpha stays the same

### page.tsx — add handler
```typescript
onTaskComplete={(id: string, completed: boolean) => {
  useDataStore.setState((s: any) => ({
    events: s.events.map((e: any) =>
      e.id === id ? { ...e, is_completed: completed } : e
    )
  }));
}}
```

Add `import { useDataStore } from '@/store/useDataStore';` if not already present (it likely is).
