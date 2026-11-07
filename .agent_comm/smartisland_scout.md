# SmartIsland Component Investigation Report

**Date:** 2026-11-07  
**Scout:** Targeted Read-Only Code Scout  
**Status:** COMPLETE  

---

## 1. Inventory of All SmartIsland-Related Files

The SmartIsland architecture in `web/src/` spans mobile header widgets, desktop sidebar extensions, tablet floating pills, and editor quick-capture modals:

| File Path | Role & Description |
| :--- | :--- |
| [`web/src/components/Layout/MobileSmartIsland.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/MobileSmartIsland.tsx) | **Mobile Smart Island Component** (982 lines). Concentric 92×92px square with RAF-driven multi-layer loading spinner (`drehendes_quadrat.html`), spring width expansion to full width (`100vw - 32px`), countdown display ("TERMIN IN / NOCH"), offline indicator, and incoming message view. |
| [`web/src/components/extensions/smart_island/SmartIsland.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/extensions/smart_island/SmartIsland.tsx) | **Desktop Sidebar Smart Island** (1691 lines). Embedded in the left sidebar. Houses `MiniCalendar`, `InMeetingBar`, the expandable "Nächster Termin" pill, expanded 704px appointment/message card, `DailySummaryView`, and plugin views (`WelcomeView`, `TimelineView`, `NextEventView`, `EventPreviewView`, `ReminderView`, `TextCollectorView`). |
| [`web/src/components/Layout/MobileHeaderWidgets.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/MobileHeaderWidgets.tsx) | Wrapper exporting `MobileSmartIsland` as `NextEventCountdown` (lines 84–85). |
| [`web/src/components/Layout/MobileLayout.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/MobileLayout.tsx#L1587) | Mounts `<NextEventCountdown>` in the sticky mobile top header next to the date greeting. |
| [`web/src/components/Layout/Sidebar.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/Sidebar.tsx#L395-L405) | Desktop sidebar bottom mounting `<SmartIsland>` when `smart_island` extension is enabled, falling back to standalone `<MiniCalendar>`. |
| [`web/src/app/page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L3275) | Mounts `<MobileSmartIsland placement="bottom-left">` (line 3275) for tablet/folder navigation mode, and `<CalendarCaptureIsland>` (line 40) for editor NLP capture. |
| [`web/src/components/SmartIsland.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/SmartIsland.tsx) | **Calendar Capture Island** (67 lines). Floating NLP toast/modal when selecting text in TipTap editor to create a calendar event. |
| [`web/src/components/Calendar/MiniCalendar.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Calendar/MiniCalendar.tsx) | Embedded inside `SmartIsland.tsx` (line 1508) and `Sidebar.tsx` (line 403). |
| [`web/src/components/extensions/smart_island/useIslandStore.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/extensions/smart_island/useIslandStore.tsx) | Zustand store managing active island card queue, messages, and daily summaries. |
| [`web/src/store/useIslandStore.ts`](file:///C:/Users/nicoh/projects/tide/web/src/store/useIslandStore.ts) | Store re-export for root data layer. |
| [`web/src/store/useIslandSettingsStore.ts`](file:///C:/Users/nicoh/projects/tide/web/src/store/useIslandSettingsStore.ts) | Persistent settings for island (expand on notification, display duration, preview options). |
| [`web/src/components/Settings/tabs/SmartIslandExtensionConfig.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Settings/tabs/SmartIslandExtensionConfig.tsx) | Settings tab UI for configuring Smart Island behavior. |
| [`web/src/store/slices/createUiSlice.ts`](file:///C:/Users/nicoh/projects/tide/web/src/store/slices/createUiSlice.ts) & [`types.ts`](file:///C:/Users/nicoh/projects/tide/web/src/store/slices/types.ts) | Zustand UI slice storing `smartIslandState` for text editor date capture. |
| [`web/src/hooks/useDateDetection.ts`](file:///C:/Users/nicoh/projects/tide/web/src/hooks/useDateDetection.ts) & [`web/src/lib/dateParser.ts`](file:///C:/Users/nicoh/projects/tide/web/src/lib/dateParser.ts) | German NLP date parser feeding event suggestion cards to Smart Island. |

---

## 2. Root Cause Analysis: Mobile Animation Lag & Stutter

Mobile animation lag in [`MobileSmartIsland.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/MobileSmartIsland.tsx) stems from five distinct performance bottlenecks:

### 1. Main-Thread Layout Thrashing via CSS `width` Animation
- **Lines 651–653 & 675–677**:
  ```css
  .smart-island-spring {
    transition: width 0.55s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .smart-island-base.expanded {
    width: calc(100vw - 32px);
  }
  ```
- **Problem**: Animating `width` forces browser **Reflow (Layout) + Recalculate Styles + Repaint** on every single frame for 550ms. Unlike `transform` or `opacity`, `width` cannot be offloaded to the GPU compositor thread; it runs on the main JavaScript thread. Any concurrent React render, event handler, or timer causes dropped frames (micro-stutter).
- **Remedy**:
  - Keep the outer base dimension fixed or animate width using GPU-composited transforms:
    - Use `transform: scaleX(...)` with `transform-origin: right center` (or `left center` for bottom-left placement).
    - Or keep the container sized to full width with `pointer-events: none` and use `clip-path` / inner transformed wrapper.
  - Add `contain: paint layout size` strictly during animation.

### 2. GPU Overdraw from 4 Stacked Layers with Box Shadows
- **Lines 720–740 & 782**:
  - Layer 1 (`navySquareRef`): `bg-[#001f3f] shadow-md shadow-[#001f3f]/20`
  - Layer 2 (`purpleSquareRef`): `bg-[#7928ca] shadow-md shadow-[#7928ca]/20`
  - Layer 3 (`offsetSquareRef`): `bg-[#212226] shadow-md shadow-black/20`
  - Layer 5 (`baseSquareRef`): `bg-[#212226] shadow-lg shadow-black/25`
- **Problem**: Each of these 4 layers has an independent blurred box shadow. During the RAF loop (`updateLoop`), all 4 layers rotate and scale concurrently. On mobile GPUs (iOS WebKit / Android Mali/Adreno), rotating elements with blurred box shadows cannot use cached bitmaps; the GPU must re-rasterize Gaussian blur passes on 4 overlapping layers every frame (16.6ms).
- **Remedy**:
  - Remove box shadows from the spinning background layers (`navySquareRef`, `purpleSquareRef`, `offsetSquareRef`).
  - Keep a single subtle shadow on the static container or apply `filter: drop-shadow(...)` only when stopped.

### 3. Frequent 1-Second React Interval Triggering Full Re-render
- **Lines 205–212**:
  ```ts
  useEffect(() => {
    const timer = setInterval(() => {
      if (animRef.current.state === 'IDLE') {
        setNow(new Date());
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  ```
- **Problem**: Calling `setNow(new Date())` every 1000ms triggers a full React component re-render, recalculating `target`, `diffSec`, `displayTitle`, `displaySubtitle`, `timeMain`, and re-generating JSX. If a user taps to expand right around the 1-second mark, React's reconciliation coincides with the 550ms width spring transition, resulting in visible jank.
- **Remedy**:
  - Isolate the text ticker to a small isolated leaf component (`<IslandClock />`) or update the text DOM node directly via ref during animations so the main wrapper never re-renders.

### 4. Direct DOM String Manipulation in RAF Loop (6 Elements Every Frame)
- **Lines 496–529**:
  ```ts
  idleText.style.opacity = anim.textProgress.toFixed(3);
  baseSquare.style.transform = `translate3d(0,0,0) scale(1) rotate(${anim.mainAngle.toFixed(2)}deg)`;
  offsetSquare.style.opacity = easedOffset.toFixed(3);
  offsetSquare.style.transform = `translate3d(0,0,0) scale(${...}) rotate(...)`;
  loaderIcon.style.opacity = easedLoader.toFixed(3);
  loaderIcon.style.transform = `translate3d(0,0,0) scale(${...}) rotate(...)`;
  navySquare.style.opacity = ...;
  navySquare.style.transform = ...;
  purpleSquare.style.opacity = ...;
  purpleSquare.style.transform = ...;
  ```
- **Problem**: Generating 10+ template strings and setting inline styles via string parsing (`.toFixed(...)`) on every frame creates garbage collection pressure and DOM property writes that can cause micro-stutter on low-end mobile devices.

### 5. Touch Event Listeners Without `touch-action` Control
- **Lines 779–781 & 611–630**:
  - `onTouchStart`, `onTouchEnd`, `onTouchMove` handle long-press detection (`500ms`).
  - No `touch-action: manipulation` or `touch-action: pan-y` is declared on `.smart-island-base`.
  - When scrolling the mobile header vertically, touch start events compete with native page scrolling.

---

## 3. Desktop/PC Mode: "Nächster Termin" (Next Event) Bar Analysis

### Location & Implementation
In [`web/src/components/extensions/smart_island/SmartIsland.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/extensions/smart_island/SmartIsland.tsx#L1517-L1551):
```tsx
{/* Expand Pill: Termin nach rechts anzeigen */}
<div
    onClick={toggleExpand}
    className="mt-1 mx-0.5 px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] border border-white/5 flex items-center justify-between cursor-pointer transition-all group"
    title="Terminübersicht aufklappen"
>
    <div className="flex items-center gap-2 min-w-0">
        <span
            className={`w-2 h-2 rounded-full shrink-0 ${
                activeOrUpcomingEvent?.isOngoing
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-blue-400'
            }`}
        />
        <span className="text-xs font-bold text-white truncate max-w-[120px]">
            {activeOrUpcomingEvent ? activeOrUpcomingEvent.title : 'Nächster Termin'}
        </span>
    </div>
    <div className="flex items-center gap-1.5 text-blue-400 text-xs font-semibold shrink-0">
        <span className="text-[11px] font-bold text-blue-300">
            {countdownDisplay.countdownText}
        </span>
        <svg
            className={`w-3.5 h-3.5 transition-transform duration-300 ${
                isUserExpanded ? 'rotate-180' : 'group-hover:translate-x-0.5'
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
        >
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>
    </div>
</div>
```

### How It is Conditionally Rendered
1. It is inside `si-calendarView` (lines 1490–1554), which renders when `state.current && state.current.type !== 'message'` is false (i.e. default calendar view).
2. **Current Defect**: It is rendered **unconditionally**, even when `activeOrUpcomingEvent` is `null`!
   - When no events exist, line 1532 falls back to `'Nächster Termin'`.
   - Line 1537 falls back to `{countdownDisplay.countdownText}` which evaluates to `'Kein Termin'` (line 1055).
   - This produces an awkward `[Blue Dot] Nächster Termin | Kein Termin ->` bar that expands to an empty view.
3. Also note: Above it at line 1514 is `<InMeetingBar events={todayEvents} />`, which renders a 2px progress bar only when a meeting is active (lines 848–860).

### What Needs to be Removed or Hidden on Desktop/PC
- **Option A (Hide when no upcoming event)**: Wrap lines 1517–1551 in:
  ```tsx
  {activeOrUpcomingEvent && (
      <div onClick={toggleExpand} ...>
          ...
      </div>
  )}
  ```
- **Option B (Completely remove the pill on Desktop/PC)**:
  - On desktop, the user already has the full desktop calendar with the Day view live card ([`DesktopDayView.tsx:257`](file:///C:/Users/nicoh/projects/tide/web/src/components/Calendar/DesktopDayView.tsx#L257): `Live Status` / `Aktueller Termin` / `Nächster Termin`).
  - Having a redundant expand pill in the sidebar bottom widget that opens a 704px wide overlay across the sidebar is often unwanted.
  - To remove: delete lines 1517–1551 (and if the 704px appointment overlay is no longer needed, remove `appointmentViewRef` lines 1557–1675 and related expand logic).

---

## 4. Text Color Issues in SmartIsland (Dark Gray / Black on Black)

### Core Architectural Root Cause
In [`SmartIsland.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/extensions/smart_island/SmartIsland.tsx#L1487):
```tsx
<div
    ref={widgetBaseRef}
    id="si-widgetBase"
    className="absolute inset-0 bg-[#1a1c1e] rounded-[24px] shadow-2xl border border-white/10 overflow-hidden transition-colors"
>
```
1. The widget background is hardcoded to dark anthracite `#1a1c1e` in both Light and Dark app themes.
2. **The widget container does NOT have the `.dark` class!**
3. When the user uses Tide in Light Theme (the root `<html>` element does not have `.dark`), **all Tailwind `dark:...` classes are ignored, and the default light-theme text colors are applied!**
   - `text-gray-900 dark:text-gray-100` -> resolves to `text-gray-900` (`#111827`, pure black) against `#1a1c1e` (black)!
   - `text-gray-800 dark:text-gray-100` -> resolves to `text-gray-800` (`#1f2937`, charcoal) against `#1a1c1e`!
   - `text-neutral-800 dark:text-neutral-100` -> resolves to `text-neutral-800` (`#262626`) against `#1a1c1e`!
   - `text-gray-500 dark:text-gray-400` -> resolves to `text-gray-500` (`#6b7280`) against `#1a1c1e`!

### Specific Unreadable Text Color Lines & Fixes

| File | Line | Current Class / Style | Problem | Recommended Fix |
| :--- | :--- | :--- | :--- | :--- |
| `SmartIsland.tsx` | Line 1487 | `className="... bg-[#1a1c1e] ..."` | Root lacks `dark` class; light theme renders black text on `#1a1c1e` | Add `dark` to class: `className="... bg-[#1a1c1e] dark ..."` |
| `MiniCalendar.tsx` | Line 79 | `text-neutral-800 dark:text-neutral-100` | Month title is dark gray `#262626` in light theme on dark island | In SmartIsland context, must be `text-zinc-100` or `text-white` |
| `MiniCalendar.tsx` | Line 88, 95 | `text-neutral-600 dark:text-neutral-300` | Chevrons are dark gray `#525252` | `text-zinc-400 hover:text-white` |
| `MiniCalendar.tsx` | Line 105 | `text-neutral-500 dark:text-neutral-400` | Weekday labels (Mo, Di, Mi...) are dark `#737373` | `text-zinc-400 font-semibold` |
| `MiniCalendar.tsx` | Line 172 | `text-neutral-800 dark:text-neutral-100` | Calendar day numbers are black `#262626` in light theme | `text-zinc-200 font-medium` |
| `SmartIsland.tsx` | Line 144, 147 | `isPast ? 'text-gray-400 dark:text-gray-600' : ... 'text-gray-800 dark:text-gray-100'` | `dark:text-gray-600` is `#4b5563` on `#1a1c1e` (contrast ratio 2:1); in light mode `text-gray-800` is black | `text-zinc-400` for past, `text-white` for current/upcoming |
| `SmartIsland.tsx` | Line 180, 182, 188 | `text-gray-400 dark:text-gray-500`, `text-gray-900 dark:text-gray-100` | `NextEventView` titles & labels are black/dark gray on black | `text-zinc-400` (labels) and `text-white` (titles) |
| `SmartIsland.tsx` | Line 213, 216, 218 | `text-gray-900 dark:text-gray-100`, `text-gray-500`, `text-gray-800` | Message preview sender and text are charcoal on black | `text-white` and `text-zinc-300` |
| `SmartIsland.tsx` | Line 346, 353, 357, 361 | `text-gray-500 dark:text-gray-400`, `text-gray-400 dark:text-gray-600` | `EventPreviewView` details are dark gray on black | `text-zinc-400` (subtitles) and `text-white` (titles) |
| `SmartIsland.tsx` | Line 423, 431, 435 | `text-gray-500 dark:text-gray-400`, `text-gray-900 dark:text-gray-100`, `text-gray-600 dark:text-gray-300` | `ReminderView` event description & labels are dark gray on black | `text-zinc-400` and `text-zinc-200` |
| `SmartIsland.tsx` | Line 1373 | `text-zinc-600 dark:text-zinc-500` | Separator `\|` in compact pill is nearly invisible | `text-white/20` or `text-zinc-400` |
| `MobileSmartIsland.tsx` | Line 817 | `text-[#9498a3]` | Subtitle ("IN", "NOCH", "MORGEN") contrast is low in outdoor daylight | Change to `text-neutral-300` or `text-zinc-300` (`#d4d4d4`) |
| `MobileSmartIsland.tsx` | Line 874, 895 | `text-neutral-400` | Muted subtitle labels are dark gray on `#212226` | Change to `text-neutral-300` |

---

## 5. Recommended Implementation Steps

1. **Fix Text Legibility**:
   - In `SmartIsland.tsx:1487`, add `dark` to `className="absolute inset-0 bg-[#1a1c1e] dark rounded-[24px]..."` so all child components always render their dark variants regardless of global theme.
   - Replace any remaining `dark:text-gray-600` and `text-gray-500` inside SmartIsland views with `text-zinc-400` / `text-zinc-200` / `text-white`.
   - In `MobileSmartIsland.tsx:817`, upgrade `text-[#9498a3]` to `text-zinc-300`.
2. **Fix Mobile Animation Smoothness**:
   - In `MobileSmartIsland.tsx`:
     - Remove `shadow-md` from rotating layers (`navySquareRef`, `purpleSquareRef`, `offsetSquareRef`).
     - Isolate 1-second interval timer or skip re-renders while animating (`animRef.current.state !== 'IDLE'`).
     - Optimize width expansion by setting fixed width container with GPU-scaled contents or hardware-composited transitions.
     - Add `touch-action: manipulation` to `.smart-island-base`.
3. **Handle Desktop/PC "Nächster Termin" Bar**:
   - In `SmartIsland.tsx:1517`, wrap the expand pill in `{activeOrUpcomingEvent && ( ... )}` so it is hidden when there are no events scheduled, or remove it if desktop sidebar redundancy is undesired.
