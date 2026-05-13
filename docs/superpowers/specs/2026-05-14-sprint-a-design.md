# Sprint A — Tracker Tab + Avatar Salt + PWA Offline Fix
**Date:** 2026-05-14  
**Status:** Approved

## Overview
Three independent fixes, all small scope. Files: `MobileLayout.tsx` + `useDataStore.ts`.

---

## Fix 1 — Tracker 4th Tab

**Where:** `web/src/components/Layout/MobileLayout.tsx`

**What:**
- Add `Dumbbell` to lucide-react imports
- Add `NEXT_PUBLIC_TRACKER_URL` env var (fallback: `''`)
- Bottom nav becomes 4 tabs: Notes | Calendar | Tracker | Profile
- Tracker tab uses `<a href={trackerUrl} className="...">` (not window.location, so PWA can open in browser if needed)
- Nav tab spacing: `flex-1` on each of 4 tabs (already works)

**NavTab for tracker:**
```tsx
<a
  href={process.env.NEXT_PUBLIC_TRACKER_URL || '#'}
  className="flex flex-col items-center justify-center flex-1 h-full gap-1 focus:outline-none"
  style={{ color: T.textMuted }}
>
  <Dumbbell size={20} />
  <div className="w-1 h-1" /> {/* spacer to match NavTab dot height */}
</a>
```

The tracker tab is never "active" (it's an external link), so it always shows muted color, no dot.

**Env var note for user:** Add `NEXT_PUBLIC_TRACKER_URL=https://your-tracker-url` to `.env.local` on the server.

---

## Fix 2 — Avatar Salt

**Where:** `web/src/components/Layout/MobileLayout.tsx`

**What:** Concatenate `avatar_seed` + `_` + `avatar_salt` as the seed passed to `<Avatar>`.

```tsx
{userProfile?.avatar_seed ? (
  <Avatar
    seed={`${userProfile.avatar_seed}_${userProfile.avatar_salt ?? ''}`}
    size={80}
    style="notionists"
  />
) : (
  {/* gradient fallback unchanged */}
)}
```

---

## Fix 3 — PWA Offline Data Loss

**Where:** `web/src/store/useDataStore.ts`

**Root cause:** `loadAllMetadata()` calls `set({ notes: visibleNotes, events: visibleEvents })` unconditionally. When offline, API calls fail silently (empty arrays), overwriting cached data with `[]`.

**Fix:**

**Step A — Guard at function entry:**
```typescript
loadAllMetadata: async () => {
    const state = get();
    if (!state.privateKey || !state.myId) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return; // offline guard
    ...
```

**Step B — Guard the notes/events state update:**
After computing `visibleNotes` and `visibleEvents`, before the `set(...)` call:
```typescript
// Only update if we actually received data, or if we have nothing yet.
// This prevents an API hiccup from clearing locally-cached data.
set(s => ({
    notes: visibleNotes.length > 0 || s.notes.length === 0
        ? visibleNotes
        : s.notes,
    events: visibleEvents.length > 0 || s.events.length === 0
        ? visibleEvents
        : s.events,
    metadataCache: newMetaCache,
}));
```

**Step C — Guard tasks state update:**
In the tasks merge block at the end of `loadAllMetadata`:
```typescript
set(s => {
    // Don't wipe existing tasks if server returned nothing
    if (loadedTasks.length === 0 && s.tasks.length > 0) return {};
    const localMap = new Map(s.tasks.map(t => [t.id, t]));
    const merged = loadedTasks.map(bt => {
        const local = localMap.get(bt.id);
        if (local && local.scheduledDate && !bt.scheduledDate) return { ...bt, scheduledDate: local.scheduledDate };
        if (local && local.isCompleted !== bt.isCompleted) return local;
        return bt;
    });
    return { tasks: merged };
});
```

---

## Files Changed

| File | Change |
|------|--------|
| `web/src/components/Layout/MobileLayout.tsx` | Fix 1 + Fix 2 |
| `web/src/store/useDataStore.ts` | Fix 3 |
