# Mobile Polish Pass — Design Spec
**Date:** 2026-05-14  
**Status:** Approved by user (verbal confirmation)

## Summary

8 targeted UX/visual fixes to `MobileLayout.tsx` and minor touches to `MiniCalendar.tsx`. No new files. Desktop untouched.

---

## Fix 1 — Navigation bar: smaller & more elegant

**Current:** `height: 72px`, icons `size={22}`  
**New:** `height: 56px`, icons `size={20}`  
Active indicator: keep the small dot but make it `w-1 h-1` (already is, fine).  
No other changes to NavTab.

---

## Fix 2 — Multi-day timeline (scroll always works)

**Problem:** `todaysEvents` only shows today → not enough content to scroll → page snaps back, collapsing week strip re-expands.

**Fix A — Multi-day data:**  
Replace `todaysEvents` with `upcomingDays`: an array of `{ date: Date; events: Event[] }` for today + next 4 calendar days (5 total). Each day's events use the exact same recurrence filter logic, just called for each date. Events in the past (today's past events included) are still shown so the timeline has history context.

**Fix B — Scroll collapse logic:**  
Remove `scrollTop === 0 → setIsCalendarExpanded(true)`. The full mini-calendar must never auto-re-expand from scroll. It only collapses (on scroll > 10px) and re-expands only when the user explicitly taps a toggle (see below).

**Fix C — Week strip day selection:**  
When in collapsed (week strip) mode and the user taps a day: update `activeDate` but do NOT call `setIsCalendarExpanded(true)`. The week strip stays. Currently clicking a day in week strip doesn't toggle expansion (correct), but the scroll handler was re-expanding it on snap-back — removing Fix B eliminates this.

**Fix D — Re-expand toggle:**  
Add a small tap target in the week strip row (e.g., tapping the centered date header text, or a small chevron-down icon at the right) that calls `setIsCalendarExpanded(true)`. This is the only way to re-expand.

**Render format:**
```
[DATE HEADER: "Wednesday 14" in muted uppercase + divider]
[Event rows for that date]
[DATE HEADER: "Thursday 15"]
[Event rows...]
...
```

---

## Fix 3 — Event tap: colored card + time info + progress line

**Event card when expanded:**
- Wrap the event row in a `rounded-2xl` background with `backgroundColor: event.color + '18'` (very transparent tint)
- Left border: `borderLeft: 3px solid event.color`
- Expanded panel shows:
  - **Status chip**: "Starts in Xm", "Running — Xm left", or "Ended Xm ago"
  - **Duration**: "Duration: 1h 30m"
  - **Delete button** (already exists, keep)

**Timeline line progress:**
- `now = new Date()`
- For each event dot: if `endTime < now` → dot color = accent (blue), if `startTime <= now <= endTime` → dot is solid accent (active, slightly larger), if `startTime > now` → dot is muted gray border
- The single vertical line: split conceptually — draw it as a gradient from accent (top, past) to border gray (bottom, future) using a CSS linear-gradient, with the breakpoint calculated as `(nowY - lineTop) / lineHeight * 100%`
- Line position: shift from `left: '3.6rem'` to `left: 'calc(3rem + 5px)'` to center under the `w-2.5` dot (dot is at `-left-[5px]` relative to content div, which starts at `pl-4` = 16px after the line, so line should be at time-col-width(48px) + gap(16px)/2 = 56px → `left: '3.5rem'`)

Actually: time column is `w-12` = 48px, gap is `gap-4` = 16px, dot is at `-left-[5px]` from content start. Content starts at 48+16=64px. Dot center = 64 - 5 + 1.25 = ~60px from left. So line should be at ~`left: '3.75rem'` (60px). Round to `left: '3.8rem'`.

---

## Fix 4 — Animation: smooth & immediate for calendar toggle

**Problem:** Height animation on header causes full-page layout thrash and lag.

**Fix:**
- Remove `AnimatePresence` + height animation from the mini-calendar ↔ week-strip toggle
- Replace with instant `display` switch (conditional render, no animation)
- The header height change is instant — no motion transition
- Tab transitions (switching between Notes/Calendar/Profile) keep their `tabAnim` as-is

**Week strip appearance:**
- When collapsing: just immediately show week strip (no animation from top)
- `opacity` fade optional (0.15s) but no `y` movement

---

## Fix 5 — Remove icons from calendar header

Remove from the calendar header top row:
- Avatar circle (the blue `div` with `avatarLetter`)
- The `+` (Plus) button for creating events

**Result:** The calendar header top row is removed entirely. The header is just:
- The collapsible mini-calendar OR week strip
- A small `pt-safe-top` / `pt-10` top padding

The date is already shown inside the timeline via the date section label. No need to repeat it in the header.

The `+` for creating events can be removed since the Schedule Builder is still accessible; users can use an alternative approach or this will be added back as a FAB later.

**Note:** `onNewEvent` prop is preserved for compatibility.

---

## Fix 6 — Remove blue glow effects

- **Today highlight in week strip:** Days in the week strip get no special "today" treatment. Only the selected day gets the blue filled circle. Today is not highlighted differently from other unselected days.
- **MiniCalendar today:** Keep as-is (shared component, complex to modify; only shown briefly when expanded).
- **Profile NavTab active dot:** Keep (it's subtle, not glowing).
- **Create event button:** Already removed in Fix 5.
- **Any `shadow-md` or `shadow-lg` on blue elements:** Remove them.

---

## Fix 7 — Remove avatar from calendar header

Already covered in Fix 5. No avatar in calendar header.

---

## Fix 8 — Real profile picture in Profile tab

In the Profile tab avatar section:
- Import `Avatar` from `'../Profile/Avatar'`
- Replace the gradient `div` with `<Avatar seed={userProfile?.avatar_seed || username} size={80} />`
- Keep the username and email below
- `@dicebear/core` and `@dicebear/collection` are already installed

---

## Files Modified

| File | Changes |
|------|---------|
| `web/src/components/Layout/MobileLayout.tsx` | All 8 fixes |

## Out of Scope

- Dark mode
- Functional event editing (only delete is exposed)
- Desktop changes
- MiniCalendar today highlight (shared component)
