# Investigation Report: Smart Island (Tablet Mode & Mobile Fixes)

**Date**: 2026-11-02  
**Target Areas**: Tablet Mode Smart Island, Mobile Smart Island Issues (Timer, Duplicate Banner, Width, Animation Smoothness)  
**Files Investigated**:
- `web/src/components/Layout/MobileSmartIsland.tsx`
- `web/src/components/Layout/MobileHeaderWidgets.tsx`
- `web/src/components/Layout/MobileLayout.tsx`
- `web/src/components/extensions/smart_island/SmartIsland.tsx`
- `web/src/components/extensions/smart_island/useIslandStore.tsx`
- `web/src/components/extensions/smart_island/DailySummaryView.tsx`
- `web/src/components/extensions/smart_island/EventSuggestionView.tsx`
- `web/src/components/extensions/smart_island/WeekStrip.tsx`
- `web/src/components/SmartIsland.tsx` (`CalendarCaptureIsland`)
- `web/src/components/CloudStatusBanner.tsx`
- `web/src/app/page.tsx`
- `web/src/components/Layout/Sidebar.tsx`

---

## 1. Smart Island Implementations Overview

Across `web/src/`, there are three distinct components with "Smart Island" in their name or functionality:

| Component | File Path | Usage & Lifecycle |
| :--- | :--- | :--- |
| **Mobile Smart Island** | [`MobileSmartIsland.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/MobileSmartIsland.tsx) | Rendered in [`MobileLayout.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/MobileLayout.tsx#L1545) via `NextEventCountdown`. Serves as the mobile live countdown pill, imminent event alarm card, message notification receiver, and cloud sync/offline status indicator. |
| **Extension Smart Island (Desktop / Tablet)** | [`SmartIsland.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/extensions/smart_island/SmartIsland.tsx) | Rendered in [`page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L3180-L3190) (floating compact pill at `bottom-4 left-4` in folder mode) and in [`Sidebar.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/Sidebar.tsx#L370-L401) (MiniCalendar / morning briefing widget at the sidebar bottom). |
| **Legacy Calendar Capture Island** | [`SmartIsland.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/SmartIsland.tsx) | Imported in [`page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L39) as `CalendarCaptureIsland` and rendered at line 2947. Popover triggered from TipTap `EditorBubbleMenu` to quickly schedule selected text into a calendar event. |

---

## 2. Tablet Mode Smart Island

### 2.1 Why does Tablet Mode differ from Mobile?

#### Root Cause:
1. **Screen Breakpoint Routing:**  
   In [`page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L148-L154):
   ```ts
   const checkTablet = () => {
       const w = window.innerWidth;
       const isPad = /iPad|Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
       setIsTablet((w >= 768 && w <= 1180) || isPad);
   };
   ```
   Mobile layout is wrapped in `<div className="flex md:hidden ...">` ([`MobileLayout.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/MobileLayout.tsx#L1138)).  
   On screens $\ge 768\text{px}$ (tablets/iPads), Tailwind `md:` hides `MobileLayout` completely and reveals the desktop layout (`hidden md:flex` in `page.tsx:3127` and `page.tsx:3193`).
2. **Different Component Rendering:**  
   In Tablet/Desktop mode, [`MobileSmartIsland.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/MobileSmartIsland.tsx) is unmounted. Instead, [`SmartIsland.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/extensions/smart_island/SmartIsland.tsx) is rendered:
   - When in Folder navigation mode (`navigationMode === 'folders'`), it renders a compact pill at `fixed bottom-4 left-4` ([`page.tsx:3180`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L3180)).
   - When in Sidebar navigation mode, it renders inside the sidebar bottom spacer ([`Sidebar.tsx:370`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/Sidebar.tsx#L370)).
3. **Feature Discrepancy:**  
   The compact pill in `SmartIsland.tsx` (lines 1038–1069) only renders a static date icon, date string, separator, event title, and static start time (`HH:mm`). It completely lacks:
   - Real-time countdown timer ("NOCH" / "STARTET IN", "24 Min", "1:15h").
   - Imminent event card animation (bell icon, pulse ring, "In X Min!").
   - Realtime syncing / offline indicators.
   - Message notification card popups.

---

### 2.2 Why does it show all-day todos as "next event" even when checked off / completed?

#### Location
- [`SmartIsland.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/extensions/smart_island/SmartIsland.tsx#L917-L959) (`activeOrUpcomingEvent`)
- [`SmartIsland.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/extensions/smart_island/SmartIsland.tsx#L28-L40) (`WelcomeView`'s `upcomingEvents`)

#### Problematic Code in `SmartIsland.tsx` (lines 921–956):
```tsx
const activeOrUpcomingEvent = useMemo(() => {
    if (!compact) return null;
    const now = new Date();
    const today = new Date();
    const todayEvs = (storeEvents || []).filter((e: any) => {
        try { return isSameDay(new Date(e.start), today); } catch { return false; }
    });

    const activeMeeting = todayEvs.find((e: any) => {
        try {
            if (e.is_all_day) return false;
            const s = new Date(e.start);
            const en = new Date(e.end);
            return s <= now && en > now;
        } catch { return false; }
    });

    if (activeMeeting) {
        return { title: activeMeeting.title, start: activeMeeting.start, isOngoing: true };
    }

    const upcoming = todayEvs
        .filter((e: any) => {
            try {
                return new Date(e.start) > now;
            } catch { return false; }
        })
        .sort((a: any, b: any) => new Date(a.start).getTime() - new Date(b.start).getTime())[0];

    if (upcoming) {
        return { title: upcoming.title, start: upcoming.start, isOngoing: false };
    }

    return null;
}, [compact, storeEvents]);
```

#### Exact Root Causes:
1. **Missing `is_completed` filter:**  
   Completed calendar tasks and todos remain in `storeEvents` with `is_completed: true` (or with their recurrence date in `completed_dates`). `upcoming` has **zero checks** for `e.is_completed`, `e.isCompleted`, or `completed_dates`.
2. **Missing `is_all_day` / `allDay` filter in `upcoming`:**  
   Notice that while `activeMeeting` (line 927) includes `if (e.is_all_day) return false;`, `upcoming` (line 942) **completely forgot to check `e.is_all_day` or `e.allDay` or `e.is_task`**!
3. **All-day timestamp trap:**  
   In Tide and standard calendar data models, all-day tasks/events often have their `start` timestamp set to `23:59:59` or `12:00:00` or `00:00:00`. If an all-day todo is scheduled for today with an end-of-day timestamp, `new Date(e.start) > now` is `true` all day long.
4. **Result:**  
   Even if a user checks off an all-day todo in the morning, `upcoming` continues to find this completed all-day task, sorts it as the next event, and displays it in the island pill with a bogus time like `23:59` or `00:00`!
5. **Identical bug in `WelcomeView` (lines 31–39):**  
   `WelcomeView` filters `storeEvents` with `e.start.startsWith(todayStr) && start >= now` without checking `e.is_completed` or `e.is_all_day`.

---

### 2.3 How to replace / align Tablet Mode with Mobile Smart Island?

#### Fix 1: Universal Event Filtering Helper
In [`SmartIsland.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/extensions/smart_island/SmartIsland.tsx):
```tsx
const isEventCompleted = (e: any, targetDate: Date = new Date()): boolean => {
    if (e.is_completed || e.isCompleted) return true;
    const dateStr = format(targetDate, 'yyyy-MM-dd');
    if (Array.isArray(e.completed_dates) && e.completed_dates.includes(dateStr)) return true;
    return false;
};

const isAllDayOrTask = (e: any): boolean => {
    return Boolean(e.is_all_day || e.allDay || e.is_task);
};
```
Apply this to `activeOrUpcomingEvent`:
```tsx
const upcoming = todayEvs
    .filter((e: any) => {
        try {
            if (isAllDayOrTask(e)) return false;
            if (isEventCompleted(e, today)) return false;
            return new Date(e.start) > now;
        } catch { return false; }
    })
    .sort((a: any, b: any) => new Date(a.start).getTime() - new Date(b.start).getTime())[0];
```

#### Fix 2: Align Compact Pill with Mobile Smart Island
Instead of the static non-reactive text pill in `SmartIsland.tsx:1038–1069`, Tablet Mode can either:
1. **Delegate directly to `MobileSmartIsland`:**  
   Render `<MobileSmartIsland events={storeEvents} onTap={...} />` inside the floating container in `page.tsx:3182` and inside `Sidebar.tsx:390`.
2. **Or upgrade `SmartIsland.tsx` compact mode:**  
   Add a 1-second interval ticker for live countdown (`diffSec`), display "NOCH" / "STARTET IN", tabular countdown digits ("24 Min", "1:15h"), and animate into imminent / message notifications via `useIslandStore`.

---

## 3. Mobile Smart Island Issues

### 3.1 Duration / Timer: Why does it display contents too long (feels frozen)?

#### Location
- [`MobileSmartIsland.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/MobileSmartIsland.tsx#L205-L230)
- [`useIslandStore.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/extensions/smart_island/useIslandStore.tsx#L255-L284)
- [`page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L802-L810)

#### Root Cause:
1. **The 15-Minute `isImminent` Lock:**  
   In `MobileSmartIsland.tsx` lines 205–206:
   ```ts
   const isImminent = !target?.isActive && target !== null && diffSec > 0 && diffSec <= 900;
   const isImminentDismissed = target?.event?.id ? dismissedImminentId === target.event.id : false;
   ```
   `diffSec <= 900` means any event starting within the next **15 minutes** sets `isImminent = true`.
2. **Missing Auto-Dismiss in `MobileSmartIsland.tsx`:**  
   On line 225:
   ```ts
   } else if (state.current?.type === 'reminder' || (!isImminentDismissed && isImminent)) {
       mode = 'imminent';
   }
   ```
   There is **no timeout or auto-dismiss for `isImminent`**. Once an event enters the 15-minute window, `mode` becomes `'imminent'` and stays locked in that expanded amber card for up to **15 full minutes**! The user cannot see the regular countdown unless they manually tap the tiny `X` icon.
3. **Reminder & Imminent Conflict:**  
   When `page.tsx:804` pushes a reminder 10 minutes prior:
   `payload: { duration: 15_000 }` (shows for 15 seconds).
   When the 15-second timer in `useIslandStore` expires and dismisses `state.current`, `state.current` becomes null. **However**, line 225 falls back to `(!isImminentDismissed && isImminent)`, which is still `true`! The island **never collapses back to `idle`**. It feels permanently frozen.

#### Solution:
1. **Add Auto-Dismiss for Imminent State:**  
   In `MobileSmartIsland.tsx`, trigger `imminent` as a transient notification card for 8 seconds, then automatically set `dismissedImminentId(target.event.id)`. The island smoothly returns to `idle`, where the regular countdown ("In 14 Min!", "NOCH") is displayed.
   ```tsx
   useEffect(() => {
       if (isImminent && target?.event?.id && dismissedImminentId !== target.event.id) {
           const timer = setTimeout(() => {
               setDismissedImminentId(target.event.id);
           }, 8000); // Auto-dismiss imminent banner after 8s
           return () => clearTimeout(timer);
       }
   }, [isImminent, target?.event?.id, dismissedImminentId]);
   ```
2. **Reduce Reminder Duration in `page.tsx:809`:**  
   Change `duration: 15_000` to `duration: 7_000` (7 seconds). When the reminder is dismissed, also set `dismissedImminentId(ev.id)`.

---

### 3.2 Duplicate Banner: What is the other banner above it and how to remove it?

#### Identification of the Duplicate Banner:
- **Component:** [`CloudStatusBanner.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/CloudStatusBanner.tsx)
- **Rendered in:** [`page.tsx:2943`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L2943) (`<CloudStatusBanner />`) and [`web/src/app/calendar/page.tsx:489`](file:///C:/Users/nicoh/projects/tide/web/src/app/calendar/page.tsx#L489).
- **Positioning:**  
  `className="fixed top-3 left-1/2 -translate-x-1/2 z-[999] pointer-events-auto max-w-md w-[calc(100%-2rem)] ..."`

#### Why it duplicates Mobile Smart Island:
Both [`CloudStatusBanner.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/CloudStatusBanner.tsx#L68-L74) and [`MobileSmartIsland.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/MobileSmartIsland.tsx#L66-L70) listen to the **exact same 5 window events**:
1. `tide-syncing`
2. `tide-synced`
3. `tide-offline`
4. `online`
5. `offline`

When the user goes offline or Tide syncs:
1. `CloudStatusBanner` slides down at `fixed top-3` with an amber / purple banner:
   *"Cloud nicht erreichbar · Offline-Stand aktiv"* or *"Synchronisiere Änderungen mit der Cloud..."*.
2. Right below it in the top header, `MobileSmartIsland` expands into a pill with the exact same information:
   *"offline Keine Verbindung"* or *"synchronisieren... Tide Cloud"*.

#### Solution:
Hide `CloudStatusBanner` on mobile devices where `MobileSmartIsland` handles syncing and offline status natively.
In [`CloudStatusBanner.tsx:111`](file:///C:/Users/nicoh/projects/tide/web/src/components/CloudStatusBanner.tsx#L111):
```tsx
// Change:
<div className="fixed top-3 left-1/2 -translate-x-1/2 z-[999] pointer-events-auto max-w-md w-[calc(100%-2rem)] transition-all animate-in fade-in slide-in-from-top-2 duration-200">

// To:
<div className="hidden md:block fixed top-3 left-1/2 -translate-x-1/2 z-[999] pointer-events-auto max-w-md w-[calc(100%-2rem)] transition-all animate-in fade-in slide-in-from-top-2 duration-200">
```
And on lines 93–97, add `hidden md:flex` to the minimized offline pill button so it does not clutter mobile screens.

---

### 3.3 Width: How is width configured, and how to make it span full width with small margin/padding to screen edges?

#### Current Configuration:
1. In [`MobileSmartIsland.tsx:259`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/MobileSmartIsland.tsx#L259):
   `<div className={`relative shrink-0 w-20 h-20 ${className || ''}`}>`  
   The outer anchor box is hardcoded to `w-20` (80px).
2. In [`MobileSmartIsland.tsx:268-270`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/MobileSmartIsland.tsx#L268-L270):
   ```tsx
   className={`absolute right-0 top-0 h-20 bg-[#18181b]/95 dark:bg-[#09090b]/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-xl text-white overflow-hidden ${
       isExpanded ? 'w-[min(320px,calc(100vw-32px))] z-30' : isPill ? 'w-[min(210px,calc(100vw-32px))] z-30' : 'w-20 z-20'
   }`}
   ```
3. In [`MobileLayout.tsx:1503`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/MobileLayout.tsx#L1503):  
   Parent row has `px-5` (20px left, 20px right padding).

#### Problem:
- `w-[min(320px,calc(100vw-32px))]` hard-caps the width at 320px. On modern phones (390px, 412px, 430px wide), 320px leaves an awkward gap on the left.
- Expanding leftwards from `right-0` inside a `px-5` parent causes misaligned geometry: `right-0` is already 20px from screen right, so a width of `calc(100vw - 32px)` spills 12px off the left screen edge.

#### Solution:
Elevate the expanded Smart Island to a clean floating Dynamic Island (or full-width banner) using fixed coordinates:

```tsx
<motion.div
  layout
  transition={{ type: 'spring', stiffness: 420, damping: 26, mass: 0.8 }}
  ...
  className={`h-20 bg-[#18181b]/95 dark:bg-[#09090b]/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-xl text-white overflow-hidden ${
    isExpanded
      ? 'fixed top-[max(12px,calc(env(safe-area-inset-top)+4px))] inset-x-3.5 w-auto z-50'
      : isPill
        ? 'fixed top-[max(12px,calc(env(safe-area-inset-top)+4px))] right-3.5 w-[min(240px,calc(100vw-28px))] z-50'
        : 'absolute right-0 top-0 w-20 z-20'
  }`}
>
```
- `inset-x-3.5` (14px margin on both sides) ensures it spans the exact screen width with a crisp, uniform margin to screen edges on any device size.
- Using `top-[max(12px,calc(env(safe-area-inset-top)+4px))]` respects the notch/Dynamic Island area on iOS.

---

### 3.4 Animation Smoothness: What transitions are used, and how to make them lively (accelerating first, slowing down at end)?

#### Current Code:
1. Outer Shell ([`MobileSmartIsland.tsx:262`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/MobileSmartIsland.tsx#L262)):
   `transition={{ type: 'spring', stiffness: 360, damping: 28 }}`
   *Evaluation:* Overdamped, heavy feel. Does not have the agile snap of iOS Dynamic Island.
2. Inner Sub-views ([`MobileSmartIsland.tsx:279, 303, 325, 380, 416, 462`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/MobileSmartIsland.tsx)):
   `transition={{ duration: 0.2 }}` / `transition={{ duration: 0.15 }}` (linear/default ease).
   *Evaluation:* Stiff, abrupt opacity transitions with no momentum.

#### Physics & Easing for Lively Animations:
To achieve an animation that **accelerates first and decelerates smoothly at the end**:

1. **Spring Configuration for Shell (`layout` morphing):**
   ```tsx
   transition={{
       type: 'spring',
       stiffness: 420, // High initial acceleration / snappy launch
       damping: 26,    // Controlled settle with subtle natural momentum
       mass: 0.8       // Lightweight responsiveness
   }}
   ```
2. **Cubic-Bezier Easing for Content (`AnimatePresence`):**
   Use Apple's quintessential fluid curve `cubic-bezier(0.32, 0.72, 0, 1)` or `cubic-bezier(0.16, 1, 0.3, 1)`:
   ```tsx
   const islandContentTransition = {
       duration: 0.26,
       ease: [0.32, 0.72, 0, 1] // Accelerates rapidly out of the gate, then gently decelerates
   };
   ```
3. **Micro-Interactions:**
   - Tap feedback: `whileTap={{ scale: 0.94 }}`
   - Coordinated entrance: `initial={{ opacity: 0, scale: 0.92, y: 6 }}`, `animate={{ opacity: 1, scale: 1, y: 0 }}`, `exit={{ opacity: 0, scale: 0.92, y: -6 }}`.

---

## 4. Implementation Action Plan

| Step | Target File | Action |
| :--- | :--- | :--- |
| **1** | [`CloudStatusBanner.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/CloudStatusBanner.tsx#L111) | Add `hidden md:block` to hide the duplicate sync/offline banner on mobile. |
| **2** | [`MobileSmartIsland.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/MobileSmartIsland.tsx#L205) | Add 8s auto-dismiss timeout for `isImminent` and clean up `(!isImminentDismissed && isImminent)` lock. |
| **3** | [`MobileSmartIsland.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/MobileSmartIsland.tsx#L268) | Replace `w-[min(320px,...)]` with fixed `inset-x-3.5 w-auto` for full-width responsive expansion. |
| **4** | [`MobileSmartIsland.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/MobileSmartIsland.tsx#L262) | Upgrade spring to `{ type: 'spring', stiffness: 420, damping: 26, mass: 0.8 }` and child transitions to `ease: [0.32, 0.72, 0, 1]`. |
| **5** | [`SmartIsland.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/extensions/smart_island/SmartIsland.tsx#L917) | Filter out `is_completed: true`, `completed_dates`, `is_all_day`, and `allDay` from `upcoming` and `WelcomeView`. |
| **6** | [`SmartIsland.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/extensions/smart_island/SmartIsland.tsx#L1038) | Align Tablet Mode compact pill with `MobileSmartIsland` countdown / notification semantics. |
