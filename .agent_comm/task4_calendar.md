# Investigation Report: Calendar Month View & Day View (PC / iPad)

**Date**: 2026-11-02  
**Target Areas**: Month View improvements & Day View fixes on PC / iPad  
**Files Investigated**:
- `web/src/components/Calendar/CalendarView.tsx`
- `web/src/components/Calendar/DesktopMonthView.tsx`
- `web/src/components/Calendar/DesktopDayView.tsx`
- `web/src/components/Calendar/DayColumn.tsx`
- `web/src/components/Calendar/CalendarEventPopoverHost.tsx`
- `web/src/components/Calendar/EventPopover.tsx`
- `web/src/components/Calendar/useCalendarScroll.ts`
- `web/src/app/globals.css`
- `web/src/app/page.tsx`

---

## 1. Calendar Components Architecture & Locations

| Component | File Path | Role |
| :--- | :--- | :--- |
| **Calendar Main View** | [`CalendarView.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Calendar/CalendarView.tsx) | View mode switching (`day`, `week`, `month`, `continuous`), toolbar, date navigation, scroll synchronization, floating popover host. |
| **Month View** | [`DesktopMonthView.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Calendar/DesktopMonthView.tsx) | 7-column month grid, weekday header, day cell rendering, mini event pills, task indicators. |
| **Day View** | [`DesktopDayView.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Calendar/DesktopDayView.tsx) | Single 24-hour timeline column (`DayColumn`) alongside sticky right sidebar containing Live Status, Event Details card, and Day Summary stats. |
| **Timeline Column** | [`DayColumn.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Calendar/DayColumn.tsx) | 1440px height timeline, hour slots, event drag/resize handling, current time indicator. |
| **Floating Popovers** | [`CalendarEventPopoverHost.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Calendar/CalendarEventPopoverHost.tsx) / [`EventPopover.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Calendar/EventPopover.tsx) | Floating popover positioned at event DOM rect for editing/viewing events. |
| **Scroll Hook** | [`useCalendarScroll.ts`](file:///C:/Users/nicoh/projects/tide/web/src/components/Calendar/useCalendarScroll.ts) | 2D trackpad/mousewheel scroll handling, infinite horizontal week loading, directional jump-to-today button. |

---

## 2. Month View Improvements

### 2.1 Outer Borders & Margins ("Kleine Ränder außenherum")

#### Location
- [`DesktopMonthView.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Calendar/DesktopMonthView.tsx#L56-L73)

#### Current Code
```tsx
return (
    <div className="flex-1 flex flex-col h-full select-none overflow-hidden bg-transparent">
        {/* Weekday Header */}
        <div className="grid grid-cols-7 border-b border-gray-200/80 dark:border-white/10 bg-white/40 dark:bg-slate-950/40 backdrop-blur-sm z-10">
...
        {/* Month Day Grid */}
        <div className="grid grid-cols-7 flex-1 auto-rows-fr overflow-y-auto divide-x divide-y divide-gray-150 dark:divide-white/10 border-b border-gray-200/80 dark:border-white/10">
```

#### Problem
The container has `p-0` and `m-0`, expanding directly against the outer edges of the viewport. In addition, the grid only has inner dividers (`divide-x divide-y`) and a bottom border (`border-b`). It lacks an enclosing border box (left, right, top), giving it a raw, uncontained look with no visual margins.

#### Solution
1. Wrap the Month View in an outer container with padding/margin (`p-3 md:p-4` or `m-3 md:m-4`).
2. Enclose the Weekday Header and Month Day Grid inside a unified bordered card container with rounded corners:
```tsx
return (
    <div className="flex-1 flex flex-col h-full select-none overflow-hidden bg-transparent p-3 sm:p-4">
        <div className="flex-1 flex flex-col rounded-2xl border border-gray-200/80 dark:border-white/10 bg-white/50 dark:bg-slate-900/40 shadow-xs overflow-hidden">
            {/* Weekday Header */}
            <div className="grid grid-cols-7 border-b border-gray-200/80 dark:border-white/10 bg-gray-50/70 dark:bg-white/[0.03] backdrop-blur-sm z-10">
                {/* wd labels */}
            </div>

            {/* Month Day Grid */}
            <div className="grid grid-cols-7 flex-1 auto-rows-fr overflow-y-auto divide-x divide-y divide-gray-150 dark:divide-white/10">
                {/* cells */}
            </div>
        </div>
    </div>
);
```

---

### 2.2 Highlighting "Today" Much More Clearly ("Markiere den heutigen Tag etwas mehr")

#### Location
- [`DesktopMonthView.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Calendar/DesktopMonthView.tsx#L93-L124)

#### Current Code
```tsx
const isTod = isToday(day);
...
return (
    <div
        key={day.toISOString()}
        onClick={() => onDayClick(day)}
        className={`group relative flex flex-col p-1.5 transition-colors cursor-pointer min-h-[96px] ${
            isCurMonth
                ? "bg-white/60 dark:bg-slate-900/40 hover:bg-gray-50/90 dark:hover:bg-white/[0.04]"
                : "bg-gray-50/50 dark:bg-black/20 text-gray-400 dark:text-gray-600 hover:bg-gray-100/50 dark:hover:bg-white/[0.02]"
        }`}
    >
        <div className="flex items-center justify-between mb-1 min-h-[24px]">
            <div className="flex items-center gap-1 min-w-0">
                <span
                    className={`inline-flex items-center justify-center text-xs font-bold transition-transform ${
                        isTod
                            ? "w-6 h-6 rounded-full bg-blue-600 text-white shadow-sm"
                            : isCurMonth
                            ? "text-gray-800 dark:text-gray-200 group-hover:scale-105"
                            : "text-gray-400 dark:text-gray-500"
                    }`}
                >
                    {format(day, "d")}
                </span>
```

#### Problem
The day cell itself has **no background styling, no border, and no accent** for today. The only indicator in a dense 35–42 cell grid is a tiny 24×24px blue circle on the date number. When glancing across the whole month, the eye completely loses it.

#### Solution
1. Apply an **accentuated background tint and inset ring/border** to the entire day cell:
   ```tsx
   isTod
       ? "bg-blue-50/80 dark:bg-blue-950/30 ring-2 ring-inset ring-blue-500/80 dark:ring-blue-400/90 shadow-sm z-[2]"
       : isCurMonth
       ? "bg-white/60 dark:bg-slate-900/40 hover:bg-gray-50/90 dark:hover:bg-white/[0.04]"
       : "bg-gray-50/50 dark:bg-black/20 text-gray-400 dark:text-gray-600 hover:bg-gray-100/50 dark:hover:bg-white/[0.02]"
   ```
2. Add a prominent badge or top accent bar:
   - For example, an eye-catching pill `<span className="px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-600 text-white shadow-xs">Heute</span>` next to the day number.
   - Alternatively, a top accent bar `<div className="absolute top-0 left-0 right-0 h-1 bg-blue-600 dark:bg-blue-500 rounded-t" />`.

---

## 3. Day View Fixes

### 3.1 Scrolling Not Working (Overflow, Height & Parent Container Root Cause)

#### Locations
- [`CalendarView.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Calendar/CalendarView.tsx#L551-L557)
- [`globals.css`](file:///C:/Users/nicoh/projects/tide/web/src/app/globals.css#L412-L416)
- [`useCalendarScroll.ts`](file:///C:/Users/nicoh/projects/tide/web/src/components/Calendar/useCalendarScroll.ts#L330-L336)

#### The Root Causes
1. **The Hard CSS Lock (`overflow: hidden !important;`)**:
   In `CalendarView.tsx` line 554:
   ```tsx
   {viewMode === 'day' && (
       <div
           ref={scrollContainerRef}
           className="flex-1 relative flex overflow-y-auto overflow-x-hidden trackpad-scroll-free transition-all duration-300"
           style={{ touchAction: 'pan-y' }}
       >
           <DesktopDayView ... />
       </div>
   )}
   ```
   In `globals.css` line 412:
   ```css
   .trackpad-scroll-free {
     overflow: hidden !important;
     touch-action: none;
     overscroll-behavior: none;
   }
   ```
   The class `.trackpad-scroll-free` contains `overflow: hidden !important;` and `touch-action: none;`! This rule overrides `overflow-y-auto`, completely disabling native browser vertical scrolling on PC trackpads/mousewheels and iPad touch gestures.
2. **Wheel Handler Bypass**:
   In `useCalendarScroll.ts` line 333:
   ```ts
   const isHorizontalPanning = scrollableX && (Math.abs(e.deltaX) > 0 || e.shiftKey);
   if (!isHorizontalPanning) {
       return; // Does not intercept vertical wheel events, expects browser native scroll
   }
   ```
   `useCalendarScroll` intentionally delegates vertical wheel scrolling to the native browser. But because `.trackpad-scroll-free` forced `overflow: hidden !important;`, the browser cannot scroll!

#### Solution
Remove `trackpad-scroll-free` from the Day View container in `CalendarView.tsx` line 554:
```tsx
{viewMode === 'day' && (
    <div
        ref={scrollContainerRef}
        className="flex-1 relative flex overflow-y-auto overflow-x-hidden transition-all duration-300"
        style={{ touchAction: 'pan-y' }}
    >
        <DesktopDayView ... />
    </div>
)}
```
*(Keep `trackpad-scroll-free` only on `viewMode === 'week'` where 2D custom trackpad panning is required).*

---

### 3.2 Not Landing on Current / Selected Day by Default

#### Locations
- [`CalendarView.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Calendar/CalendarView.tsx#L283-L291)
- [`CalendarView.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Calendar/CalendarView.tsx#L82-L88)

#### Current Code
```tsx
// Initial scroll for day view
useEffect(() => {
    if (viewMode === 'day' && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const nowMinutes = getHours(new Date()) * 60 + getMinutes(new Date());
        const targetScrollY = Math.max(0, nowMinutes - 120);
        container.scrollTop = targetScrollY;
    }
}, [viewMode, date]);
```

#### Problem
1. **Synchronous Execution Before DOM Layout**: When switching view modes (e.g. from Month View to Day View), `DesktopDayView` is mounted fresh. When this synchronous `useEffect` runs, the children have not finished rendering or layout. At that exact tick, `container.scrollHeight <= container.clientHeight`, so `container.scrollTop = targetScrollY` is clamped to 0. (Week View avoided this by using `setTimeout(..., 50)`).
2. **Non-Today Dates Scroll to Current Clock Time**: If the user selects another day (e.g. 15th of next month) with events at 10:00, or in the evening, `getHours(new Date())` calculates the time of *today's wall clock*, which might scroll down to midnight or nowhere relevant to that day.
3. **`handleToday` Toolbar Handler**: In `CalendarView.tsx` line 82:
   ```tsx
   const handleToday = () => {
       const today = new Date();
       onDateChange(today);
       if (viewMode === 'week') {
           handleScrollToToday();
       }
   };
   ```
   When in `viewMode === 'day'`, clicking "Heute" only changes the date, but does not trigger a smooth scroll to the current time!

#### Solution
1. Use `requestAnimationFrame` or `setTimeout(..., 60)` to allow the 1440px timeline column to layout before setting `scrollTop`.
2. Determine the scroll target intelligently:
   - If the selected `date` is today: scroll to `(currentHour * 60 + currentMinute) - 120`.
   - If the selected `date` has scheduled events: scroll to `firstEventStartMinutes - 60`.
   - If no events: scroll to standard workday start `08:00` (480 - 60 = 420px).
3. In `handleToday`, if `viewMode === 'day'`, smoothly scroll `container.scrollTo({ top: targetScrollY, behavior: 'smooth' })`.

---

### 3.3 Day Details / Information Cut Off from Screen

#### Locations
- [`DesktopDayView.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Calendar/DesktopDayView.tsx#L158)
- [`DesktopDayView.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Calendar/DesktopDayView.tsx#L233-L235)

#### Current Code
```tsx
<div className="flex-1 flex max-w-7xl mx-auto px-4 w-full gap-6 min-h-full py-4">
...
{/* Right Column (Sidebar) */}
<div className="hidden md:flex w-72 xl:w-80 flex-col shrink-0 rounded-2xl bg-white/70 dark:bg-white/[0.04] border border-gray-200/80 dark:border-white/10 p-4 gap-4 sticky top-4 self-start max-h-[calc(100vh-140px)] overflow-y-auto">
```

#### Problem
1. **Faulty Height Calculation (`max-h-[calc(100vh-140px)]`)**:
   `CalendarView` is embedded inside `page.tsx`, which contains the app header, tab bar, and `CalendarView` toolbar. These outer elements consume ~180px–220px of height.
   On an iPad (e.g. 768px height) or a 1080p/laptop screen:
   `calc(100vh - 140px)` evaluates to ~628px, but the actual available height in the container is only ~450–550px.
   As a result, the sidebar exceeds the viewport, and the bottom widget (Tagesübersicht / Day Summary Stats) is pushed below the fold and cut off.
2. **Deadly Combination with Broken Scrolling**:
   Because outer scrolling was disabled by `trackpad-scroll-free`, the user could not scroll down to see the cut-off cards.
3. **iPad Portrait Breakpoint**:
   On iPad in portrait (768px wide) or split screen, `hidden md:flex` completely hides the right sidebar, removing all day details from view.

#### Solution
1. Change the sidebar max-height to fit inside the parent container properly:
   ```tsx
   className="hidden md:flex w-80 xl:w-96 flex-col shrink-0 rounded-2xl bg-white/70 dark:bg-white/[0.04] border border-gray-200/80 dark:border-white/10 p-4 gap-4 sticky top-4 self-start max-h-[calc(100vh-210px)] overflow-y-auto"
   ```
2. Make each card slightly more compact (e.g. reduce padding `p-3`, compact headers).
3. On smaller screens / tablets where sidebar is hidden or constrained, provide a bottom sheet or toggle button to view day details.

---

### 3.4 Event Details: Currently in a Popup vs Fixed Box in Day View

#### Locations
- [`DesktopDayView.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Calendar/DesktopDayView.tsx#L149-L155)
- [`DesktopDayView.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Calendar/DesktopDayView.tsx#L280-L410)
- [`CalendarView.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Calendar/CalendarView.tsx#L373-L407)
- [`CalendarView.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Calendar/CalendarView.tsx#L642-L653)

#### Current Code & Behavior
In `DesktopDayView.tsx`:
```tsx
const handleEventClick: ComponentProps<typeof DayColumn>["onEventClick"] = (clickedEvent, rect) => {
    const id = typeof clickedEvent === "string" ? clickedEvent : (clickedEvent as CalendarEvent)?.id;
    if (id) {
        setSelectedEventState({ dayKey, id }); // Updates the fixed sidebar box!
    }
    onDayEventClick?.(clickedEvent, rect); // BUBBLES UP TO CalendarView!
};
```
In `CalendarView.tsx`:
```tsx
const handleDayEventClick: ComponentProps<typeof DayColumn>['onEventClick'] = (clickedEvent, rect) => {
    ...
    if (rect) {
        lastPopoverOpenTimeRef.current = Date.now();
        setActivePopover(prev => prev?.id === id ? null : { id, rect }); // OPENS FLOATING POPUP OVER GRID!
    }
};
```
And in `DesktopDayView.tsx` lines 280-410, there is **ALREADY a dedicated right sidebar card called "Termindetails"**!
When an event is clicked, BOTH happen:
1. The sidebar card displays the event details.
2. A large floating modal popup (`CalendarEventPopoverHost`) covers the screen right over the day column!

#### Solution
In `CalendarView.tsx`, suppress the floating popover when in Day View:
```tsx
const handleDayEventClick: ComponentProps<typeof DayColumn>['onEventClick'] = (clickedEvent, rect) => {
    if (!isDraggingRef.current) {
        const id = typeof clickedEvent === 'string' ? clickedEvent : (clickedEvent as any).id;
        const e = events.find(ev => ev.id === id || (id && typeof id === 'string' && id.startsWith(ev.id + "_")));

        // Magic link handling
        if (highlight.isSelectingLink && highlight.onLinkSelect && e) {
            highlight.onLinkSelect({ id: e.id, title: e.title, type: 'event', start: e.start, rect });
            return;
        }

        // In Day View, display event details exclusively in the dedicated fixed sidebar box
        if (viewMode === 'day') {
            return;
        }

        // Other views (week, month): use floating popover
        if (rect) {
            lastPopoverOpenTimeRef.current = Date.now();
            setActivePopover(prev => prev?.id === id ? null : { id, rect });
        } else if (onEventClick) {
            onEventClick(id);
        }
    }
};
```
Or in `DesktopDayView.tsx` line 154:
Call `onDayEventClick?.(clickedEvent, undefined)` so no `rect` is passed.
Additionally, enhance the fixed "Termindetails" card in `DesktopDayView.tsx` with full editing controls (inline title edit, time inputs, folder/theme dropdown, tags, delete button, save callback) so the user has the complete edit experience embedded inside the fixed sidebar box.

---

### 3.5 Making Day View Slightly Wider

#### Location
- [`DesktopDayView.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Calendar/DesktopDayView.tsx#L158)
- [`DesktopDayView.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Calendar/DesktopDayView.tsx#L234)

#### Current Code
```tsx
<div className="flex-1 flex max-w-7xl mx-auto px-4 w-full gap-6 min-h-full py-4">
    {/* Left: 24h timeline grid */}
    <div className="flex-1 min-w-[300px] md:min-w-0 flex relative min-h-full">
...
    {/* Right: Sidebar */}
    <div className="hidden md:flex w-72 xl:w-80 flex-col shrink-0 ...">
```

#### Problem
`max-w-7xl` constrains the maximum container width to `80rem` (1280px).
On standard desktop displays (1920×1080, 2560×1440, or 4K) and tablets, this leaves large empty whitespace margins on the left and right, artificially narrowing the Day Column and squeezing events into a tight strip.

#### Solution
1. Expand the container width from `max-w-7xl` to `max-w-[1600px]` or `max-w-full px-6 lg:px-8`:
   ```tsx
   <div className="flex-1 flex max-w-[1600px] mx-auto px-6 w-full gap-8 min-h-full py-4">
   ```
2. Allow the single day column to expand generously across the left and center space (`flex-1`).
3. Widen the right details sidebar slightly from `w-72 xl:w-80` to `w-80 xl:w-96` so event titles, tags, and descriptions in the fixed box have more breathing room.

---

## 4. Summary Action Plan for Coder Agents

1. **`DesktopMonthView.tsx`**:
   - Add outer padding `p-3 md:p-4` and wrap grid in a rounded bordered card `rounded-2xl border border-gray-200/80 dark:border-white/10 bg-white/40 dark:bg-slate-900/40`.
   - Update `isTod` cell styling with `ring-2 ring-inset ring-blue-500/80 dark:ring-blue-400 bg-blue-50/80 dark:bg-blue-950/30 z-[2]` and add a prominent "Heute" badge.
2. **`CalendarView.tsx`**:
   - Remove `trackpad-scroll-free` on line 554 for `viewMode === 'day'`.
   - Update `useEffect` on line 284 with `setTimeout(..., 50)` and intelligent scroll target (current time if today, first event if other day, or 08:00 default).
   - In `handleDayEventClick` (line 373), suppress floating popover when `viewMode === 'day'`.
   - In `handleToday` (line 82), trigger scroll to current time in Day View.
3. **`DesktopDayView.tsx`**:
   - Change `max-w-7xl` to `max-w-[1600px] px-6` (or `max-w-full`).
   - Fix sidebar height from `max-h-[calc(100vh-140px)]` to `max-h-[calc(100vh-210px)]` with smooth `overflow-y-auto`.
   - Ensure event click in Day View only populates the fixed sidebar card. Optionally add full inline editing to the fixed card.
