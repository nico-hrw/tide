# Tide — Bug Fixes & UI Improvements Design Spec
**Date:** 2026-05-19

## Overview
Six distinct issues: one PWA meta fix, one set of sidebar drag/drop bugs, one mention-system timing bug, and three Social-tab improvements (layout, message styling, data package visuals).

---

## 1. PWA Theme Color

**Files:** `web/src/app/layout.tsx`, `web/public/manifest.json`

Change `themeColor` from `"#0F172A"` (dark navy) to `"#FFFFFF"` in both files. This affects the browser chrome color on Android/iOS and the PWA splash background.

- `layout.tsx`: `export const viewport = { themeColor: "#FFFFFF" }`
- `manifest.json`: `"theme_color": "#FFFFFF"`, `"background_color": "#FFFFFF"`
- `appleWebApp.statusBarStyle` in layout.tsx: keep as `"default"` (renders dark text on white bar)

---

## 2. Sidebar Drag & Drop

**File:** `web/src/components/Layout/Sidebar.tsx`

### 2a. Flickering / Layout-Shift Loop
**Root cause:** The current 40px animated drop-zone `<motion.div>` elements are inserted into the normal document flow. Their appearance shifts item bounding boxes downward, causing `onDragLeave` to fire on the item the cursor is over (because its rect moved), which removes the indicator, which shifts everything back — creating a loop.

**Fix:** Replace the 40px drop-zone elements with a **2px absolute-positioned line indicator**. The line sits between items using CSS `top` offset and does not occupy layout space. Implementation:
- Keep `dropIndicator` state: `{ id: string, zone: 'top' | 'middle' | 'bottom' } | null`
- Remove the `motion.div` top/bottom drop-zone blocks entirely
- Add a single absolutely-positioned `<div>` rendered at the bottom of the scrollable list, positioned dynamically based on the target item's offset

### 2b. Indicator Stays After Drag Cancelled
**Fix:** Add `onDragEnd` handler to every draggable `<motion.div>` (and FolderItem/FileItem draggable divs) that calls `setDropIndicator(null)`. This fires whether the drop succeeded, failed, or was cancelled.

### 2c. Auto-Scroll During Drag
**Fix:** In the scrollable notes container (`overflow-y-auto` div), add an `onDragOver` handler (HTML5 DnD fires `dragover` continuously during drag, unlike `mousemove`). Check if `e.clientY` is within 60px of the container's top or bottom edge. If so, use `scrollBy` at a rate proportional to proximity. Use a `useRef` for the scroll interval ID — start a `setInterval` on entry into the scroll zone, clear it on exit or drop.

```
if cursorY < scrollContainer.top + 60 → scroll up
if cursorY > scrollContainer.bottom - 60 → scroll down
```

### 2d. Item Spacing
Reduce `p-2` to `p-1.5` on both `FileItem` and `FolderItem` motion divs. This reduces item height from ~36px to ~32px, fitting ~20% more items in view.

---

## 3. "@" Mention Note Linking

**File:** `web/src/components/extensions/mentionSuggestion.tsx`

**Root cause:** `loadAllMetadata()` is called async in `onStart`. The `items({ query })` function reads `useDataStore.getState().notes` synchronously. On the first (and often second) keystroke after `@`, `loadAllMetadata()` hasn't finished, so notes in subfolders are absent from state. The user sees only "Create File" and hits Enter.

**Fix:** Call `loadAllMetadata()` eagerly at app startup (in `page.tsx`, alongside the initial `fetchDirectory` call), not only in `onStart`. By the time the user types `@`, all note metadata is already in the store.

Additionally, in `mentionSuggestion.tsx` `onStart`, keep the call as a no-op refresh (it will be fast since data is cached).

**Subfolder notes:** No filter change needed — `state.notes` contains all notes after `loadAllMetadata()` runs, including those in nested folders. The existing filters (exclude folders, locked notes, canvas assets) are correct.

---

## 4. Social Tab Layout

**File:** `web/src/components/Social/SocialHub.tsx`, `web/src/components/Chat/PartnerProfileHeader.tsx`

### 4a. Transition from Grid to Chat View
When a contact is clicked from the regular (non-chat) view:
- Call `setActiveChatPartner(...)` AND `setIsChatMode(true)` simultaneously
- Remove the existing separate chat popup (`activeChatPartner && !isChatMode` branch) — this is replaced by the `isChatMode` layout

The contacts animate from grid cards to list rows using Framer Motion `layoutId`. Each contact card gets `layoutId={`contact-${c.partner.id}`}`. In grid mode: full card layout. In chat mode: compact list row (avatar + name, 44px tall).

Going back: a "← Zurück" icon-button is added to the top of the left contacts column. Clicking it sets `setIsChatMode(false)` and `setActiveChatPartner(null)`.

**Compact mode (mobile) is unchanged** — it still uses the existing BottomSheet for chat. The grid→list animation and inline chat layout only apply to the non-compact (desktop) view.

### 4b. PartnerProfileHeader Expansion
The header currently animates between 56px (compact) and 200px (expanded) via `maxHeight`. Expand to ~320px when expanded.

**Expanded content** (fetched lazily on first expand):
- Avatar (64px) + username + verified badge
- Title (if any)
- Bio (if any, max 2 lines)
- Section: "Öffentliche Notizen" — list of partner's public files (max 4, tappable → opens file)
- Section: "Geteilte Termine" — list of shared events (max 3, tappable → opens calendar)

**Trigger:** Click on the compact header row toggles expanded state (not hover, for mobile compatibility). The `onScroll` callback from ChatPanel still collapses on scroll-down.

**Data fetching:** Add a `useEffect` in `PartnerProfileHeader` that fires when `expanded` becomes `true` for the first time (lazy, one-time). Fetches `/api/v1/files/public/${partner.id}` for public notes. For shared events: fetch `/api/v1/events?partner_id=${partner.id}` directly in the header component. Both fetches use `apiFetch` and store results in local state.

---

## 5. Message Styling (iMessage-like)

**File:** `web/src/components/Chat/ChatPanel.tsx`

Replace current glassmorphism bubbles with clean iMessage-style bubbles:

**Own messages (isMe = true):**
- `bg-blue-500 text-white`
- `rounded-2xl rounded-br-sm` (small tail bottom-right)
- Right-aligned (`justify-end`)
- `max-w-[72%]`
- Timestamp: `text-[10px] text-blue-200/80 text-right mt-1`

**Others' messages (isMe = false):**
- `bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white`
- `rounded-2xl rounded-bl-sm` (small tail bottom-left)
- Left-aligned (`justify-start`)
- `max-w-[72%]`
- Timestamp: `text-[10px] text-gray-400 mt-1`

Remove `backdrop-blur-md`, `border border-white/50`, and `shadow-float-sm` from message bubbles.

---

## 6. Data Package Visual (Share Cards)

**File:** `web/src/components/Chat/ChatPanel.tsx` (the `isShareRequest` render branch)

Replace the current large card layout with a compact attachment card embedded in the message bubble:

**Structure (own message / sent):**
```
[Bubble bg-blue-500]
  [Card bg-black/20 rounded-xl p-3]
    [Icon 32px]  [File name bold]
                 [Type badge xs]
  "Datenpaket übertragen" caption
```

**Structure (received, pending):**
```
[Bubble bg-gray-100]
  [Card bg-white dark:bg-black/30 rounded-xl p-3]
    [Icon 32px]  [File name bold]
                 [Type badge xs]
    [Preview text italic, max 2 lines, if available]
  [Action row: 3 compact icon+label buttons]
    [📂 Öffnen]  [⊕ Klonen]  [✕ Ablehnen]
```

**Received, accepted/declined:** Replace action row with a single status chip (`✓ Gespeichert` green / `✕ Abgelehnt` red).

**Sizing:** `max-w-[260px]`, card interior `p-3`, icon `32px`. No full-width stretching.

**Type colors:**
- Note/Folder: `bg-indigo-100 dark:bg-indigo-900/30`, indigo icon
- Event: `bg-amber-100 dark:bg-amber-900/30`, amber icon

---

## Files to Change

| File | Changes |
|------|---------|
| `web/src/app/layout.tsx` | themeColor → `#FFFFFF` |
| `web/public/manifest.json` | theme_color + background_color → `#FFFFFF` |
| `web/src/components/Layout/Sidebar.tsx` | Drop indicator rewrite, onDragEnd, auto-scroll, spacing |
| `web/src/components/extensions/mentionSuggestion.tsx` | Minor: keep onStart call |
| `web/src/app/page.tsx` | Add `loadAllMetadata()` call on app init |
| `web/src/components/Social/SocialHub.tsx` | Auto-switch to chat mode on contact click, remove old popup branch |
| `web/src/components/Chat/PartnerProfileHeader.tsx` | Expanded view with public notes + events |
| `web/src/components/Chat/ChatPanel.tsx` | iMessage bubbles + data package card redesign |
