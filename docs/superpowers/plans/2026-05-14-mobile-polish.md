# Mobile Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply 8 targeted UX/visual fixes to the mobile layout — smaller nav, simplified calendar header, multi-day timeline, event card highlight, progress line, smooth animations, and real avatar.

**Architecture:** All changes are in `MobileLayout.tsx`. Tasks are ordered so each leaves the file in a compilable, working state. No new files. Desktop is untouched (`flex md:hidden` wrapper).

**Tech Stack:** React, TypeScript, Framer Motion, Tailwind CSS, date-fns, @dicebear/core (already installed)

---

## File Map

| File | Action |
|------|--------|
| `web/src/components/Layout/MobileLayout.tsx` | All changes (4 tasks) |

---

## Task 1: Nav bar + calendar header + week strip + Avatar

**Files:**
- Modify: `web/src/components/Layout/MobileLayout.tsx`

Read the current file first. Then apply these changes:

- [ ] **Step 1: Reduce nav bar height and icon sizes**

Find the `<nav>` element at the bottom (currently `height: '72px'`). Change to `56px`:

```tsx
<nav
  className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-stretch"
  style={{
    height: '56px',
    backgroundColor: 'rgba(255,255,255,0.95)',
    backdropFilter: 'blur(12px)',
    borderTop: `1px solid ${T.border}`,
  }}
>
```

Change all three `NavTab` icon sizes from `size={22}` to `size={20}`:

```tsx
<NavTab icon={<FileText size={20} />} .../>
<NavTab icon={<CalendarIcon size={20} />} .../>
<NavTab icon={<User size={20} />} .../>
```

Also change the `override` for the back arrow:
```tsx
override={activeTab === 'notes' && isEditingNote ? <ArrowLeft size={20} /> : undefined}
```

Also update `pb-24` on the scrollable content div to `pb-16` (to account for smaller nav):
```tsx
<div className="flex-1 w-full overflow-y-auto no-scrollbar pb-16" onScroll={handleScroll}>
```

- [ ] **Step 2: Remove the calendar header top row (avatar + date + plus button)**

Inside the calendar header `<motion.div key={headerKey} {...tabAnim} className="px-4 pt-10 pb-3">`, delete the entire "Top row" `<div className="flex justify-between items-center px-2 mb-2">` block (avatar, date center, + button). The remaining calendar header div should only contain the collapsible mini-cal / week-strip `AnimatePresence` block.

Update the outer padding to just `pt-10` (no `pb-3`):

```tsx
{activeTab === 'calendar' && (
  <motion.div key={headerKey} {...tabAnim} className="pt-10">
    {/* Collapsible MiniCalendar / week strip */}
    <AnimatePresence mode="wait">
      {/* ... mini-cal and week-strip as before ... */}
    </AnimatePresence>
  </motion.div>
)}
```

- [ ] **Step 3: Remove today highlight from week strip**

In the week strip's `weekDays.map`, the day number circle currently applies `backgroundColor: T.accent` only when `isSelected`. Keep that. But also import `isToday` from `date-fns` and ensure that when a day is today but NOT selected, it renders with no special styling (same as any other unselected day). Remove any `isToday(d)` branch if one exists.

Replace the day number circle style block with exactly:

```tsx
<div
  className="w-9 h-9 flex items-center justify-center rounded-full font-bold text-sm transition-all duration-200"
  style={
    isSelected
      ? { backgroundColor: T.accent, color: '#FFFFFF' }
      : { backgroundColor: 'transparent', color: T.textPrimary }
  }
>
  {format(d, 'd')}
</div>
```

No `isToday` branch at all — only selected day gets blue.

- [ ] **Step 4: Add real Avatar in profile tab**

Add import at top of file (after existing imports):

```tsx
import Avatar from '../Profile/Avatar';
```

In the profile tab avatar section, find this element:

```tsx
<div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg mb-1 uppercase">
  {avatarLetter}
</div>
```

Replace with:

```tsx
{userProfile?.avatar_seed ? (
  <Avatar seed={userProfile.avatar_seed} size={80} style="notionists" />
) : (
  <div
    className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-1 uppercase"
    style={{ background: `linear-gradient(135deg, ${T.accent}, #8B5CF6)` }}
  >
    {avatarLetter}
  </div>
)}
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd web && npx tsc --noEmit
```

Expected: no output (no errors).

---

## Task 2: Animation fix + scroll behavior

**Files:**
- Modify: `web/src/components/Layout/MobileLayout.tsx`

Read the current file. Apply these changes:

- [ ] **Step 1: Remove AnimatePresence from the mini-cal ↔ week-strip toggle**

Find this block inside the calendar header:

```tsx
<AnimatePresence mode="wait">
  {isCalendarExpanded ? (
    <motion.div key="mini-cal" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }} className="overflow-hidden">
      <MiniCalendar selectedDate={activeDate} onSelect={setActiveDate} />
    </motion.div>
  ) : (
    <motion.div key="week-strip" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }} className="overflow-hidden">
      ...week strip...
    </motion.div>
  )}
</AnimatePresence>
```

Replace the entire block with a plain conditional (no animation, instant switch):

```tsx
{isCalendarExpanded ? (
  <MiniCalendar selectedDate={activeDate} onSelect={setActiveDate} />
) : (
  <div className="flex justify-between items-center px-5 pb-3 pt-1">
    {/* Tap month label to re-expand */}
    <button
      onClick={() => setIsCalendarExpanded(true)}
      className="flex items-center gap-1 active:opacity-70"
      style={{ color: T.textMuted }}
    >
      {/* TODO(dark): dark:text-gray-500 */}
      <span className="text-xs font-semibold uppercase tracking-widest">
        {format(activeDate, 'MMM yyyy', { locale: enUS })}
      </span>
      <ChevronRight size={12} className="rotate-90" style={{ color: T.textMuted }} />
    </button>

    {weekDays.map(d => {
      const isSelected = isSameDay(d, activeDate);
      return (
        <button
          key={d.toISOString()}
          onClick={() => setActiveDate(d)}
          className="flex flex-col items-center gap-1"
        >
          <span className="text-[10px] font-semibold uppercase" style={{ color: T.textMuted }}>
            {format(d, 'eeeee', { locale: enUS })}
          </span>
          <div
            className="w-9 h-9 flex items-center justify-center rounded-full font-bold text-sm"
            style={
              isSelected
                ? { backgroundColor: T.accent, color: '#FFFFFF' }
                : { backgroundColor: 'transparent', color: T.textPrimary }
            }
          >
            {format(d, 'd')}
          </div>
        </button>
      );
    })}
  </div>
)}
```

Note: `ChevronRight` with `rotate-90` Tailwind class points downward. Make sure `ChevronRight` is already imported (it is).

- [ ] **Step 2: Fix scroll handler — remove re-expand on scroll back to top**

Find `handleScroll`:

```tsx
const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
  if (activeTab !== 'calendar') return;
  if (e.currentTarget.scrollTop > 10) {
    setIsCalendarExpanded(false);
  } else if (e.currentTarget.scrollTop === 0) {
    setIsCalendarExpanded(true);
  }
};
```

Remove the `else if` branch entirely:

```tsx
const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
  if (activeTab !== 'calendar') return;
  if (e.currentTarget.scrollTop > 10) {
    setIsCalendarExpanded(false);
  }
};
```

The mini-calendar only re-expands when the user explicitly taps the month label in the week strip (added in Step 1).

- [ ] **Step 3: Make tab switch animations faster**

Change `tabAnim` duration from `0.18` to `0.12`:

```tsx
const tabAnim = {
  initial:    { opacity: 0, y: 8 },
  animate:    { opacity: 1, y: 0 },
  exit:       { opacity: 0, y: -8 },
  transition: { duration: 0.12, ease: 'easeOut' as const },
};
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd web && npx tsc --noEmit
```

Expected: no output.

---

## Task 3: Multi-day timeline

**Files:**
- Modify: `web/src/components/Layout/MobileLayout.tsx`

Read the current file. Apply these changes:

- [ ] **Step 1: Extract recurrence filter into a module-level helper**

Add this pure function **above** the `MobileLayout` component (after the `NavTab` component definition):

```tsx
// ─── Recurrence-aware event filter for a given date ──────────────────────────
function filterEventsForDate(events: any[], targetDate: Date): any[] {
  return events
    .filter(e => {
      const startNode = new Date(e.start);
      const occDateKey = format(targetDate, 'yyyy-MM-dd');
      if (e.exdates && e.exdates.includes(occDateKey)) return false;

      const rule = (e as any).recurrence_rule;
      const rrule =
        rule ||
        `FREQ=${e.recurrence && e.recurrence !== 'none' ? e.recurrence.toUpperCase() : 'NONE'};INTERVAL=1`;

      let freq = 'none';
      let interval = 1;
      const matchFreq = rrule.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY|NONE)/i);
      if (matchFreq) freq = matchFreq[1].toLowerCase();
      const matchInterval = rrule.match(/INTERVAL=(\d+)/i);
      if (matchInterval) interval = parseInt(matchInterval[1], 10);
      interval = Math.max(1, interval);

      if (freq === 'none') return isSameDay(startNode, targetDate);

      let current = new Date(startNode);
      const safeRecEnd = (e as any).recurrence_end
        ? new Date((e as any).recurrence_end)
        : new Date(targetDate.getTime() + 31_536_000_000);

      let count = 0;
      const targetTime = new Date(
        targetDate.getFullYear(),
        targetDate.getMonth(),
        targetDate.getDate()
      ).getTime();
      const endTime = new Date(
        safeRecEnd.getFullYear(),
        safeRecEnd.getMonth(),
        safeRecEnd.getDate()
      ).getTime();

      while (count < 1000) {
        const curTime = new Date(
          current.getFullYear(),
          current.getMonth(),
          current.getDate()
        ).getTime();
        if (curTime === targetTime) return true;
        if (curTime > targetTime || curTime > endTime) break;
        if (freq === 'daily') current.setDate(current.getDate() + interval);
        else if (freq === 'weekly') current.setDate(current.getDate() + interval * 7);
        else if (freq === 'monthly') current.setMonth(current.getMonth() + interval);
        else if (freq === 'yearly') current.setFullYear(current.getFullYear() + interval);
        else break;
        count++;
      }
      return false;
    })
    .map(e => {
      const startNode = new Date(e.start);
      const endNode = e.end ? new Date(e.end) : startNode;
      const duration = endNode.getTime() - startNode.getTime();
      const mappedStart = new Date(targetDate);
      mappedStart.setHours(startNode.getHours(), startNode.getMinutes(), 0, 0);
      return {
        ...e,
        id: isSameDay(new Date(e.start), targetDate) ? e.id : `${e.id}_${mappedStart.getTime()}`,
        start: mappedStart.toISOString(),
        end: new Date(mappedStart.getTime() + duration).toISOString(),
      };
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}
```

- [ ] **Step 2: Replace `todaysEvents` useMemo with `upcomingDays`**

Remove the entire `todaysEvents` useMemo. Replace with:

```tsx
// Shows activeDate + 4 more days so the timeline always has scrollable content
const upcomingDays = useMemo(() => {
  return Array.from({ length: 5 }).map((_, i) => {
    const date = addDays(activeDate, i);
    return { date, events: filterEventsForDate(events, date) };
  });
}, [events, activeDate]);
```

- [ ] **Step 3: Replace the calendar tab content with a multi-day view**

Find the calendar tab `<motion.div key={contentKey} {...tabAnim} className="p-4">` section. Replace the entire inner `<div className="rounded-3xl p-5" ...>` content with:

```tsx
{/* TODO(dark): card bg dark:bg-gray-900, border dark:border-gray-800 */}
<div
  className="rounded-3xl overflow-hidden"
  style={{ backgroundColor: T.card, border: `1px solid ${T.border}` }}
>
  <div className="p-5 pb-32">
    {upcomingDays.map(({ date, events: dayEvents }, dayIdx) => {
      const isToday = isSameDay(date, new Date());

      // Compute progress percentage for today's vertical line
      let lineGradient = T.border;
      if (isToday && dayEvents.length >= 2) {
        const firstStart = new Date(dayEvents[0].start).getTime();
        const lastStart = new Date(dayEvents[dayEvents.length - 1].start).getTime();
        const now = Date.now();
        const pct = lastStart === firstStart ? 0
          : Math.min(100, Math.max(0, ((now - firstStart) / (lastStart - firstStart)) * 100));
        lineGradient = `linear-gradient(to bottom, ${T.accent} ${pct}%, ${T.border} ${pct}%)`;
      }

      return (
        <div key={date.toISOString()} className={dayIdx > 0 ? 'mt-8' : ''}>
          {/* Date separator */}
          <div className="flex items-center gap-4 mb-5">
            {/* TODO(dark): dark:text-gray-500 */}
            <span
              className="text-xs font-semibold uppercase tracking-widest shrink-0"
              style={{ color: T.textMuted }}
            >
              {isToday ? `Today · ${format(date, 'EEE d', { locale: enUS })}` : format(date, 'EEEE d', { locale: enUS })}
            </span>
            {/* TODO(dark): dark:bg-gray-800 */}
            <div className="flex-1 h-px" style={{ backgroundColor: T.border }} />
          </div>

          {dayEvents.length === 0 ? (
            <p className="text-xs py-2 mb-2" style={{ color: T.textMuted }}>No events</p>
          ) : (
            <div className="relative flex flex-col gap-6">
              {/* Vertical timeline line — progress-aware for today */}
              <div
                className="absolute top-2 bottom-4 w-0.5 z-0"
                style={{ left: '4rem', background: lineGradient }}
                /* TODO(dark): base color dark:bg-gray-700 */
              />

              {dayEvents.map((event, idx) => {
                const startDate = new Date(event.start);
                const endDate = event.end ? new Date(event.end) : startDate;
                const now = new Date();
                const isPast = endDate < now;
                const isActive = startDate <= now && now < endDate;
                const dotColor = isPast || isActive ? (event.color || T.accent) : '#D1D5DB';
                const isExpanded = expandedEventId === event.id;

                return (
                  <div
                    key={`${event.id}-${idx}`}
                    onClick={() => {
                      setExpandedEventId(isExpanded ? null : event.id);
                      onEventClick?.(event.id);
                    }}
                    className="flex gap-4 cursor-pointer relative z-10"
                  >
                    {/* Time column */}
                    <div className="w-12 flex flex-col text-right pt-0.5 shrink-0">
                      {/* TODO(dark): dark:text-gray-500 */}
                      <span className="text-xs font-medium" style={{ color: T.textSec }}>
                        {format(startDate, 'HH:mm')}
                      </span>
                      {event.end && (
                        <span className="text-[10px] mt-0.5" style={{ color: T.textMuted }}>
                          {format(endDate, 'HH:mm')}
                        </span>
                      )}
                    </div>

                    {/* Dot + content */}
                    <div className="flex flex-col relative w-full">
                      {/* Colored dot — slightly larger when active */}
                      {/* TODO(dark): ring-white → dark:ring-gray-900 */}
                      <div
                        className="rounded-full absolute top-1 ring-4 ring-white z-10 transition-all"
                        style={{
                          backgroundColor: dotColor,
                          width: isActive ? '14px' : '10px',
                          height: isActive ? '14px' : '10px',
                          left: isActive ? '-7px' : '-5px',
                        }}
                      />

                      <div
                        className="pl-4 pb-1 rounded-2xl transition-all"
                        style={isExpanded ? {
                          backgroundColor: (event.color || T.accent) + '15',
                          outline: `1px solid ${event.color || T.accent}33`,
                          padding: '8px 8px 8px 16px',
                          marginTop: '-2px',
                        } : {}}
                      >
                        {/* TODO(dark): dark:text-white */}
                        <h3
                          className="font-semibold text-sm leading-tight"
                          style={{ color: T.textPrimary }}
                        >
                          {event.title || 'Untitled Event'}
                        </h3>
                        {event.description && !isExpanded && (
                          <p className="text-xs mt-0.5 line-clamp-1" style={{ color: T.textSec }}>
                            {event.description}
                          </p>
                        )}

                        {/* Expanded detail — added in Task 4 */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              key="event-detail"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.15, ease: 'easeOut' }}
                              className="overflow-hidden"
                            >
                              {/* Time info placeholder — filled in Task 4 */}
                              <div className="mt-2 text-xs" style={{ color: T.textSec }}>
                                {event.description && (
                                  <p className="mb-2">{event.description}</p>
                                )}
                              </div>
                              <button
                                onClick={ev => { ev.stopPropagation(); onEventDelete?.(event.id); }}
                                className="text-red-500 text-xs font-medium px-2 py-1"
                              >
                                Delete
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    })}
  </div>
</div>
```

- [ ] **Step 4: Add `isToday` import from date-fns**

In the existing `import { isSameDay, format, startOfWeek, addDays } from 'date-fns';` line, add `isToday` to the import:

```tsx
import { isSameDay, isToday, format, startOfWeek, addDays } from 'date-fns';
```

Wait — `isToday` is imported from date-fns but we're now using `isSameDay(date, new Date())` directly in the code above (which is equivalent and avoids the import). Remove any `isToday` references and use `isSameDay(date, new Date())` consistently. Keep the import list as-is.

Actually: in the code above I used `isSameDay(date, new Date())` — no `isToday` needed. No import change required.

- [ ] **Step 5: Remove now-unused `todaysEvents` references**

Ensure there are no remaining references to `todaysEvents` in the file. Search and confirm. The variable is removed in Step 2 and replaced by `upcomingDays`.

- [ ] **Step 6: Verify TypeScript**

```bash
cd web && npx tsc --noEmit
```

Expected: no output.

---

## Task 4: Event time info in expanded card + progress line position fix

**Files:**
- Modify: `web/src/components/Layout/MobileLayout.tsx`

Read the current file. Apply these changes:

- [ ] **Step 1: Add a `now` state that ticks every minute**

Add this state + effect inside the `MobileLayout` component body (after existing state declarations):

```tsx
const [now, setNow] = useState(() => new Date());
useEffect(() => {
  const id = setInterval(() => setNow(new Date()), 60_000);
  return () => clearInterval(id);
}, []);
```

- [ ] **Step 2: Add time info helper function**

Add this pure function above the `MobileLayout` component (after `filterEventsForDate`):

```tsx
function formatTimeInfo(startDate: Date, endDate: Date, now: Date): { status: string; duration: string } {
  const diffStart = startDate.getTime() - now.getTime();
  const diffEnd = endDate.getTime() - now.getTime();
  const durationMs = endDate.getTime() - startDate.getTime();

  const minsToStr = (ms: number) => {
    const m = Math.round(Math.abs(ms) / 60_000);
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h${m % 60 > 0 ? ` ${m % 60}m` : ''}`;
  };

  let status = '';
  if (diffStart > 0) {
    status = `Starts in ${minsToStr(diffStart)}`;
  } else if (diffEnd > 0) {
    status = `Running — ${minsToStr(diffEnd)} left`;
  } else {
    status = `Ended ${minsToStr(diffEnd)} ago`;
  }

  const duration = durationMs > 0 ? `Duration: ${minsToStr(durationMs)}` : '';
  return { status, duration };
}
```

- [ ] **Step 3: Wire time info into the expanded detail panel**

Inside the `upcomingDays.map` → `dayEvents.map`, find the expanded detail block:

```tsx
{/* Time info placeholder — filled in Task 4 */}
<div className="mt-2 text-xs" style={{ color: T.textSec }}>
  {event.description && (
    <p className="mb-2">{event.description}</p>
  )}
</div>
```

Replace with:

```tsx
<div className="mt-2 flex flex-col gap-1">
  {(() => {
    const { status, duration } = formatTimeInfo(startDate, endDate, now);
    return (
      <>
        {/* TODO(dark): dark:bg-gray-800 dark:text-gray-300 */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold"
          style={{ backgroundColor: (event.color || T.accent) + '22', color: event.color || T.accent }}
        >
          {status}
        </div>
        {duration && (
          <p className="text-xs px-1" style={{ color: T.textMuted }}>{duration}</p>
        )}
        {event.description && (
          <p className="text-xs px-1 mt-1" style={{ color: T.textSec }}>{event.description}</p>
        )}
      </>
    );
  })()}
</div>
```

- [ ] **Step 4: Fix vertical timeline line horizontal position**

In the `upcomingDays.map` render, find the vertical timeline line div:

```tsx
style={{ left: '4rem', background: lineGradient }}
```

Confirm it is at `left: '4rem'` (64px). The time column is `w-12` (48px) + `gap-4` (16px) = 64px to content start. The dot is `absolute top-1` inside content, at `left: '-5px'`, width `10px`. Dot center = 64 - 5 + 5 = 64px. Line at 64px is correct. If the value differs, update it to `left: '4rem'`.

- [ ] **Step 5: Verify TypeScript**

```bash
cd web && npx tsc --noEmit
```

Expected: no output.

---

## Self-Review

**Spec coverage:**
- ✅ Fix 1 (Nav bar 56px) → Task 1 Step 1
- ✅ Fix 2 (Multi-day timeline, scroll fix) → Task 2 Step 2, Task 3
- ✅ Fix 3 (Event card + time info + progress line) → Task 3 Step 3 (card bg, dot color, line gradient), Task 4 (time info)
- ✅ Fix 4 (Animation smooth, no fly-in) → Task 2 Steps 1+3
- ✅ Fix 5 (Remove avatar + plus from calendar header) → Task 1 Step 2
- ✅ Fix 6 (Remove today glow from week strip) → Task 1 Step 3
- ✅ Fix 7 (Remove avatar from calendar header) → Task 1 Step 2 (same as Fix 5)
- ✅ Fix 8 (Real profile picture) → Task 1 Step 4

**Type consistency:**
- `filterEventsForDate(events: any[], targetDate: Date): any[]` — called in `upcomingDays` useMemo with `(events, date)` ✅
- `formatTimeInfo(startDate, endDate, now)` — called inside `dayEvents.map` with correctly typed `Date` objects ✅
- `upcomingDays` is `{ date: Date; events: any[] }[]` — destructured as `{ date, events: dayEvents }` ✅

**No placeholders:** All steps contain complete code. ✅
