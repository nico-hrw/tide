<!-- AI COMPONENT INDEX — tables not bullets, file paths are absolute from repo root -->
<!-- ⚠️ MANDATORY: Update this file in EVERY session that touches components, lib utilities, or design. No exceptions. -->
# TIDE — Component Index

## Design System

| Module | File | Role |
|--------|------|------|
| designTokens | `web/src/lib/designTokens.ts` | **Single source for all visual constants** — `DT.glass(isDark)`, `DT.chip(active, isDark)`, `DT.radius`, `DT.blur`, `DT.accent`, `DT.cardBg`, `DT.mutedText`, `DT.primaryText`. Import from here; **never hardcode blur/radius/color values inline** in new components. |

## Layout

| Component | File | Role |
|-----------|------|------|
| Sidebar | `web/src/components/Layout/Sidebar.tsx` | Left nav: folder tree, note list |
| TabList | `web/src/components/Layout/TabList.tsx` | Open tabs bar (desktop) |
| MobileLayout | `web/src/components/Layout/MobileLayout.tsx` | Mobile shell V4: calendar-primary default to today's day view; segmented control for Tag/Woche/Monat; month view with mini-calendar + day events list; bottom 2-tab navigation (Kalender, Notizen); first-class Notizen tab with search, recent notes, and folder organization; removed social overlay/chat and infinite scroll carousel for rock-solid stability; SmartIsland hidden on mobile (`hidden md:block`); search panel accessible via top-bar header; Safe-Area insets applied throughout. |
| MobileWeekGrid | `web/src/components/Layout/MobileWeekGrid.tsx` | 7-column week hour grid, pinch-to-zoom (hourH 24-120px, persisted), Google Calendar-style event drag/resize (body=move, edges=resize), long-press creation, current-time indicator, scroll position persisted; hour-lines via CSS gradient; event move drag: invisible pill + DOM overlay approach (no React re-renders during drag); overnight events: `dayEvents()` includes events spanning into a day (start≤dayEnd && end>dayStart), rendering clamps to day window (continuation pill top=0, continued pill bottom=grid-end), dashed top/bottom per-side border + ↑/↓ indicator for multi-day segments. **Border rule**: use 4 individual `borderTop/Right/Bottom/Left` — never mix `border` shorthand with `borderTop`/`borderBottom` on same element (React warns). **Event pill body**: fills full pill height (`top:0, bottom:0`); resize handle bars are absolute overlays (12×1 px, `rgba(255,255,255,0.35)`) so they don't reduce body text area; body padding is dynamic: `handleH+1` px on handle sides to clear the indicator bar. **Move drag hold**: requires 1 s hold before activating — `evPendingMoveRef` blocks column creation; `stopPropagation`/`preventDefault` NOT called initially so week-swipe and native scroll pass through; any movement >8 px before hold fires cancels pending drag. Resize handles (top/bottom) still activate immediately. `colTouchStart` checks `evPendingMoveRef.current` to suppress creation while event hold is pending. **Z-index**: `10 + startMinutes` so later-starting overlapping events render on top. |

### MobileWeekGrid — Event Drag Implementation History (do not repeat failed approaches)

| Approach | Result | Why it failed |
|----------|--------|---------------|
| `colFromX` with rect cached at drag-start | Only adjacent columns worked | `onSwipeMove` applied `translateX` to grid; cached (pre-transform) rect made column indices wrong |
| `elementFromPoint(x,y).closest('[data-col-idx]')` + `flushSync` in onMove | Still only adjacent | `flushSync` inside native touchmove blocks iOS touch pipeline; events dropped after first column change |
| Fresh `getBoundingClientRect()` + RAF | Still only adjacent | Swipe container `transition: transform 0.18s ease-out` animating after swipe-cancel; getBoundingClientRect returned mid-animation coords |
| Plain `setEvDrag` in onMove + `transition:none` via eventDragActive | VISIBLE but still only adjacent | Root cause: `setEvDrag({colIdx:1})` re-renders event from col-0 DOM to col-1 DOM, detaching original touchstart target. Detached elements don't bubble to document → onMove stops firing after first column |
| **Current: DOM overlay + invisible pill + capture listeners** | ✓ Multi-column drag works | Event pill stays in original column (opacity:0, never removed from DOM). DOM overlay follows finger via `style.transform`. Column highlight via `style.background` on col divs. `evDragRef.current` tracks target col (no `setEvDrag` during move). Capture-phase listeners as safety net. React state updated only at drag-start (opacity:0) and drag-end (final position). |

### MobileWeekGrid — Move vs Resize drag

- **Move**: Requires **1-second hold** before drag activates (`evHoldTimerRef`). While waiting, `evPendingMoveRef=true` suppresses column creation; `stopPropagation`/`preventDefault` not called so week-swipe and scroll work normally. Any movement >8 px cancels the pending drag. After hold fires: pill goes invisible (`opacity:0`), DOM overlay created, capture-phase listeners attached with `passive:false`. `evDragRef.current` updated per frame; `setEvDrag` NOT called during drag.
- **Resize**: Activates immediately (small dedicated target). `setEvDrag` called in native listener (safe: event stays in same column, DOM element never removed). Parent `transition:none` (via `eventDragActive` state in MobileLayout) ensures stable `getBoundingClientRect`.

### MobileWeekGrid — Drag State & Scroll Pitfalls (hard-won lessons)

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| `setEvDrag(null)` batched by React 18 | Ghost event at old position after drop | `flushSync(() => setEvDrag(null))` in both `onEnd` handlers (resize + move) |
| `onEventUpdate` called before drag state clears | Zustand optimistic update renders new event list while `evDrag` still set → ghost | Clear drag state (flushSync) → call `onEventDragChange?.(false)` → then call `onEventUpdateRef.current` |
| `onMove` listener not removed on `touchcancel` | Scroll breaks permanently after OS interrupts (notification, etc.) | Both `onEnd` handlers attached to `touchcancel` AND `touchend` on document with `{ capture: true }` |
| iOS scroll freeze after drag | Can't scroll after drop until reload | After `flushSync`, jiggle `scrollRef.current.scrollTop ± 1`. iOS calls `preventDefault()` during drag which locks UIScrollView; jiggle forces re-evaluation. |
| `touchAction: none` on event body | Can't scroll by touching an event | Event body uses `touchAction: isBeingDragged ? 'none' : 'pan-y'`. Note: `touchAction` is evaluated at touchstart — changing it mid-touch doesn't help current sequence. |
| Ghost event persists across week navigation | Switching weeks still shows ghost | `key={weekStartStr}` on MobileWeekGrid forces remount on week change, clearing stuck `evDrag` React state as backstop. |
| Event z-ordering (short events hidden behind long) | Short events unreachable | Sort `colEvents` longest-first before render; dragged event always last (renders on top). Never use z-index for this — it breaks stacking context. |

### MobileLayout — Swipe & Infinite Scroll Pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| `swipeDx` is 0 for time-column swipes | Right-swipe from time column never opens sidebar | `onSwipeEnd` must accept `React.TouchEvent` and compute `dx = e.changedTouches[0].clientX - swipeX0.current` directly. `swipeDx` state is only set when `isSwipingWeek=true`; time column touches never set that flag. |
| `width: '100%'` on slides in flex row | Carousel slides collapse or don't snap | Use `flex: '0 0 100%'` + `height: '100%'` on each slide. `width: 100%` is ambiguous in a flex row with overflow; `flex-basis: 100%` is explicit. |
| `useEffect` for carousel centering | Flash of left/prev slide visible before centering | Use `useLayoutEffect` — fires synchronously after DOM mutations, before paint. Set `el.style.scrollSnapType = 'none'` before jumping `scrollLeft`, restore in RAF callback so user swipes still snap. |
| Snap animation fights programmatic `scrollLeft` | Centering stutters or snaps to wrong position | Temporarily disable `scrollSnapType` via inline style before setting `scrollLeft`, re-enable in next RAF. |
| `infResetting.current` not set before `scrollLeft` write | `handleInfScroll` re-triggers on programmatic scroll | Set `infResetting.current = true` before any `scrollLeft` assignment; reset to `false` in `setTimeout(80ms)` after RAF restores snap. |
| **OPEN: Re-centering snap after week navigation** | User sees a snap/jump when swiping to next week | The 3-slide carousel must re-center after each navigation (otherwise it runs out of slides). `scrollLeft = offsetWidth` in `useLayoutEffect` fires before paint but iOS still shows the jump. Untried fix: `flushSync(() => setActiveDate(...))` in `handleInfScroll` THEN `el.scrollLeft = w` in the same tick — content at new center matches what was at old scroll position, so no visible change. |

### PWA Production Status

| Item | Status | Notes |
|------|--------|-------|
| Service worker | ✓ | `@ducanh2912/next-pwa`, auto-register, disabled in dev |
| Web manifest | ✓ | icons, standalone display, maskable |
| `apple-mobile-web-app-capable` | ✓ | set in layout.tsx metadata |
| `viewport-fit=cover` | ✓ | added to viewport export |
| Dark theme color | ✓ | media-query themeColor `#0F172A` |
| Safe area insets | ✓ | All headers use `max(52px, calc(env(safe-area-inset-top)+10px))`, bottom bar uses `max(16px, calc(env(safe-area-inset-bottom)+8px))`, calendar uses `calc(68px + env(safe-area-inset-bottom))` |
| iOS word selection | ⚠ | `.ProseMirror { -webkit-user-select: text !important }` added — full single-word granularity limited by iOS contenteditable |
| Content cold-search | ⚠ | `window.__mobileNoteCache` only populated for notes opened this session; background IDB indexing not implemented |
| Event drag | ✓ | Fixed: `transition:none` during drag + React 18 auto-batching |
| Infinite scroll snap | ⚠ | **Known bug**: carousel re-centers after week navigation and on partial swipe, which iOS Safari renders as a visible snap/jump. Root cause: `useLayoutEffect` sets `scrollLeft = offsetWidth` synchronously but browser still shows transition. `flushSync`-before-scrollLeft approach (update slides then jump) may fix it — not yet tried. Approaches that did NOT fix it: `scrollSnapType: 'none'` on container, removing `scrollSnapAlign`, RAF wrapping, temporarily setting `scrollSnapType = 'none'` before jump. |
| BottomSheet | `web/src/components/Layout/BottomSheet.tsx` | Slide-up sheet (mobile modals) |
| AuthGuard | `web/src/components/AuthGuard.tsx` | Route protection wrapper |

## Editor (Notes)

| Component | File | Role |
|-----------|------|------|
| Editor | `web/src/components/Editor.tsx` | TipTap editor wrapper (SSR-disabled). BubbleMenu toolbar: **5 primary actions always visible** (Bold, Italic, Underline, Clear, ▼ expand chevron). Secondary actions (font size, text color, highlight, math, reference, smart island, pop-out, connect image) shown when chevron toggled. `toolbarExpanded` state controls secondary visibility. |
| SlashCommand | `web/src/components/extensions/SlashCommand.tsx` | `/` command menu |
| DateMention | `web/src/components/extensions/DateMentionExtension.tsx` | Inline date chip |
| CalendarEventMention | `web/src/components/extensions/CalendarEventMentionExtension.tsx` | Inline event chip |
| TaskMention | `web/src/components/extensions/TaskMentionExtension.tsx` | Inline task chip |
| ReferenceMark | `web/src/components/extensions/ReferenceMark.ts` | Backlink reference marks |
| MathBlock | `web/src/components/extensions/MathBlock.tsx` | LaTeX math blocks |
| ResizableImage | `web/src/components/extensions/ResizableImage.tsx` | Drag-to-resize image node |
| InlineCommentNode | `web/src/components/extensions/InlineCommentNode.ts` | Inline comment annotations |
| CommentNodeView | `web/src/components/extensions/CommentNodeView.tsx` | Comment render view |
| BlockId | `web/src/components/extensions/BlockId.ts` | Assigns UUID to each block (anchor system) |
| Anchor | `web/src/components/extensions/Anchor.ts` | Scroll-to-block anchor extension |
| Highlight | `web/src/components/extensions/Highlight.ts` | Text highlight |
| FontSize | `web/src/components/extensions/FontSize.ts` | Font size override |
| HighlightContext | `web/src/components/HighlightContext.tsx` | React context for active highlight |

## Smart Island

| Component | File | Role |
|-----------|------|------|
| SmartIsland (root) | `web/src/components/SmartIsland.tsx` | Shell / entry component |
| SmartIsland (ext) | `web/src/components/extensions/smart_island/SmartIsland.tsx` | Core island logic |
| EventSuggestionView | `web/src/components/extensions/smart_island/EventSuggestionView.tsx` | AI event suggestion UI |
| useIslandStore | `web/src/components/extensions/smart_island/useIslandStore.tsx` | Island Zustand store |

## Canvas

| Component | File | Role |
|-----------|------|------|
| CanvasLayer | `web/src/components/Canvas/CanvasLayer.tsx` | Floating element overlay (images, text widgets) |
| CanvasElement | `web/src/components/Canvas/CanvasElement.tsx` | Single draggable canvas element |
| CanvasNoteEditor | `web/src/components/Canvas/CanvasNoteEditor.tsx` | Full free-canvas note mode |
| CanvasNoteItem | `web/src/components/Canvas/CanvasNoteItem.tsx` | Individual canvas note item |
| EditorGutter | `web/src/components/Canvas/EditorGutter.tsx` | Right gutter for canvas elements alongside editor |
| useStyleFile | `web/src/components/Canvas/useStyleFile.ts` | Load/save `.{noteId}_style.json` sidecar |
| useCanvasImageUpload | `web/src/components/Canvas/useCanvasImageUpload.ts` | Encrypt + upload image to blob store |

## Calendar

| Component | File | Role |
|-----------|------|------|
| CalendarView | `web/src/components/Calendar/CalendarView.tsx` | Main month/week view + global drag state |
| WeekView | `web/src/components/Calendar/WeekView.tsx` | Week grid |
| DayColumn | `web/src/components/Calendar/DayColumn.tsx` | Single-day column (pure reflector, no drag logic) |
| CalendarEventItem | `web/src/components/Calendar/CalendarEventItem.tsx` | Event pill rendering. **Z-index overlap**: `zIndex = 10 + startMinutes` so later-starting events render on top of earlier ones when they overlap. |
| DragGhost | `web/src/components/Calendar/DragGhost.tsx` | Visual ghost for creation drag |
| EventDragGhost | `web/src/components/Calendar/EventDragGhost.tsx` | Visual ghost for event move drag |
| EventPopover | `web/src/components/Calendar/EventPopover.tsx` | Event detail popover |
| EventPreview | `web/src/components/Calendar/EventPreview.tsx` | Compact event preview |
| MagnifiedEventView | `web/src/components/Calendar/MagnifiedEventView.tsx` | Precise-mode time magnifier |
| EventDock | `web/src/components/Calendar/EventDock.tsx` | Bottom dock for event list |
| MiniCalendar | `web/src/components/Calendar/MiniCalendar.tsx` | Thumbnail month picker |
| DailySummary | `web/src/components/Calendar/DailySummary.tsx` | Day summary panel |
| QuickEventSheet | `web/src/components/Calendar/QuickEventSheet.tsx` | GCal-style quick-add **and edit** bottom sheet. `editEvent` prop pre-fills all fields for "Bearbeiten" flow; `onSave` always called, caller decides create vs update. Date chip opens `InlineCalendar`; **GCal range UX**: first tap = anchor (`pickerFirstClick=true`, picker stays open), second tap forward = extend range (Ganztags+allDay auto-enabled), tap at/before current start = collapse back to single day. Window never auto-closes in start-picker mode. Time row: clock icon independently toggles drum picker per side (side-by-side if both open); pickers use `DT.glass`, close on outside tap. **Calendar picker** next to Ganztags: fetches enabled calendars from `GET /api/v1/integrations/gcal/calendars` on open; only shown when at least one calendar is available; color dot + truncated name; deselectable via "Kalender entfernen". Note-link button: `NotePicker` (folder-organized, `type=note/canvas` only, deselectable, no recents). "Mehr Optionen": freq chips, interval ±stepper, weekday chips, end-condition; "Bis zum" uses `InlineCalendar`. All tokens from `DT`. `onSave` receives `{title, start, end, color, allDay, recurrence_rule?, linkedNoteId?, calendarId?}`. |
| ScheduleModal | `web/src/components/Calendar/ScheduleModal.tsx` | Batch event builder (group/theme, multi-event, recurrence, import/export) — accessed via SmartIsland edit or direct open |

## Chat

| Component | File | Role |
|-----------|------|------|
| ChatPanel | `web/src/components/Chat/ChatPanel.tsx` | Main chat view (WebSocket-driven) |
| PartnerProfileHeader | `web/src/components/Chat/PartnerProfileHeader.tsx` | Contact header in chat |

## Social & Profile

| Component | File | Role |
|-----------|------|------|
| SocialHub | `web/src/components/Social/SocialHub.tsx` | Social feed / contact management |
| ProfilePage | `web/src/components/Profile/ProfilePage.tsx` | User profile view |
| Avatar | `web/src/components/Profile/Avatar.tsx` | User avatar display |

## Sharing

| Component | File | Role |
|-----------|------|------|
| ShareModal | `web/src/components/ShareModal.tsx` | Share a note with another user |
| ShareManagementPanel | `web/src/components/ShareManagementPanel.tsx` | Manage existing shares |
| ShareManagementModal | `web/src/components/Modals/ShareManagementModal.tsx` | Modal wrapper for share mgmt |

## Extensions (lazy-loaded modules)

| Component | File | Role |
|-----------|------|------|
| FinanceDashboard | `web/src/components/Finance/FinanceDashboard.tsx` | Finance extension root |
| AccountNode | `web/src/components/Finance/AccountNode.tsx` | Finance account node |
| ExamsPlanner | `web/src/components/Exams/ExamsPlanner.tsx` | Exam planning module |

## Settings

| Component | File | Role |
|-----------|------|------|
| SettingsModal | `web/src/components/Settings/SettingsModal.tsx` | App settings modal. Accepts `onCalendarToggle?: (calendarId, enabled) => void` — called after successful `PATCH /calendars/{id}` so caller can update its disabled-calendar filter immediately. |
| BackupHistory | `web/src/components/BackupHistory.tsx` | Backup/restore UI |

## Stores (Zustand)

| Store | File | State |
|-------|------|-------|
| useDataStore | `web/src/store/useDataStore.ts` | Notes, events, tasks, activeNoteId, crypto keys, lazy dir loading. GCal event metaData includes `gcal_calendar_id` (from `public_meta.gcal_calendar_id`) so the field is accessible on event objects for filtering. |
| useDragGhost | `web/src/store/useDragGhost.ts` | Calendar drag ghost position |
| useSocialStore | `web/src/store/useSocialStore.ts` | Contacts, messages |
| useLinkStore | `web/src/store/useLinkStore.ts` | Graph link cache |
| useReferenceStore | `web/src/store/useReferenceStore.ts` | Backlink reference tracking |
| useExamsStore | `web/src/store/useExamsStore.ts` | Exams module state |
| useIslandStore | `web/src/components/extensions/smart_island/useIslandStore.tsx` | Smart island state |

## Lib Utilities

| Module | File | Role |
|--------|------|------|
| designTokens | `web/src/lib/designTokens.ts` | Global visual constants — import `DT` for glass, chip, radius, blur, accent, cardBg, mutedText, primaryText. Always use this instead of inline values. |
| apiFetch / getApiBase | `web/src/lib/api.ts` | All HTTP calls to Go backend |
| crypto (v1) | `web/src/lib/crypto.ts` | AES-GCM + RSA E2E encryption |
| cryptoV2 | `web/src/lib/cryptoV2.ts` | Newer crypto primitives |
| idb | `web/src/lib/idb.ts` | IndexedDB wrapper (offline cache) |
| searchIndex | `web/src/lib/searchIndex.ts` | Client-side full-text search |
| shareLogic | `web/src/lib/shareLogic.ts` | Share key wrapping logic |
| calendarUtils | `web/src/lib/calendarUtils.ts` | Date/time helpers for calendar |
| dateParser | `web/src/lib/dateParser.ts` | Natural language date parsing |
| timeParser | `web/src/lib/timeParser.ts` | Time string parsing |
| i18n | `web/src/lib/i18n.ts` | Localisation |

## Google Calendar Sync

| Component | File | Role |
|-----------|------|-------|
| GCal service | `cloud/internal/gcal/gcal.go` | OAuth URL generation (HMAC-signed state), token exchange + refresh, outbound push (`PushCreate/Update/Delete`), inbound polling (`StartPoller` → every 10 min). **Multi-calendar**: `syncAllCalendars` iterates all enabled calendars and calls `fullSyncCal`/`incrementalSyncCal` per-calendar with individual `syncToken`s. Loop prevention: outbound push returns early if `gcal_origin:true`. Dedup: `DeduplicateGCalEvents` + `DeleteWeekNumberEvents` (deletes "Kalenderwoche …" / "Week …" GCal markers) both run at sync start. `GCalIDExists` check before any create. Per-user sync mutex. **Calendar routing**: `TideEventMeta.CalendarID` (`gcal_calendar_id` in JSON) holds the target calendar; `CreateGCalEvent`/`UpdateGCalEvent`/`DeleteGCalEvent` prefer this field, fall back to `firstEnabledCalendarID`. **Outbound push**: `public_meta` now includes `title/start/end/allDay/color/gcal_calendar_id` for TIDE-created events so `PushCreate`/`PushUpdate` can push to the right calendar. **`upsertTIDEEvent` signature**: `(ctx, userID, gcalEv, calColor, calID string)` — `calID` is stored as `public_meta.gcal_calendar_id` on each inbound event. |
| GCal handler | `cloud/internal/api/gcal_handler.go` | `GET /connect`, `GET /callback` (redirects to `FRONTEND_URL/?gcal_connected=1`, default `http://localhost:3001`), `GET /status`, `DELETE /disconnect`, **`GET /calendars`** (list all calendars with enabled state), **`PATCH /calendars/{calendarId}`** (toggle calendar on/off). All under `/api/v1/integrations/gcal/`. |
| user_integrations table | `cloud/internal/store/sqlite.go` | Per-user GCal tokens: `access_token`, `refresh_token`, `token_expiry`, `calendars_json` (JSON array of `CalendarInfo`). Methods: `UpsertGCalIntegration`, `GetGCalIntegration`, `DeleteGCalIntegration`, `ListGCalIntegrations`, `GetFileByGCalID`, `GCalIDExists`, `DeduplicateGCalEvents`, `DeleteWeekNumberEvents`, `DeleteGCalEventsByCalendarID`. |
| Settings UI | `web/src/components/Settings/SettingsModal.tsx` | "Integrations" tab: connect button, status, **calendar list** with color dot + name + enable/disable toggle per calendar (fetched from `GET /calendars`, toggled via `PATCH /calendars/{id}`). `?gcal_connected=1` param triggers auto-refresh after 3 s. Calls `onCalendarToggle` prop after successful toggle. |

### Multi-calendar architecture

`calendars_json` column stores a JSON array of `CalendarInfo` structs:
```go
type CalendarInfo struct {
    ID        string `json:"id"`
    Name      string `json:"name"`
    Color     string `json:"color"`   // hex from GCal background color
    Enabled   bool   `json:"enabled"` // user toggle
    SyncToken string `json:"sync_token"`
}
```
On first connect, `listGoogleCalendars` fetches `GET /users/me/calendarList` (no access role filter — all calendars included) and saves them all as enabled. Each subsequent sync uses per-calendar `syncToken` for incremental updates.

### All-day event date convention

GCal uses **exclusive** end dates (1-day event on July 2 → `end.date="2026-07-03"`). TIDE uses **inclusive** end dates. Conversion in `gcalToTide`: `end = t.AddDate(0,0,-1)`. Conversion in `tideToGCal`: `end = t.AddDate(0,0,+1)`. WeekView renders all-day strip with `checkD <= endD` (inclusive).

### Color mapping

GCal color ID → TIDE palette hex:

| GCal ID | Name | TIDE hex |
|---------|------|----------|
| 1 | Tomato | `#ef4444` |
| 2 | Flamingo | `#ec4899` |
| 3 | Tangerine | `#f97316` |
| 4 | Banana | `#f59e0b` |
| 5 | Sage | `#10b981` |
| 6 | Basil | `#10b981` |
| 7 | Peacock | `#06b6d4` |
| 8 | Blueberry | `#3b82f6` |
| 9 | Lavender | `#6366f1` |
| 10 | Grape | `#8b5cf6` |
| 11 | Graphite | `#64748b` |

Full reverse mapping (TIDE → GCal) lives in `gcal.go`.

### Setup (required before use)
1. Create Google Cloud project → enable Calendar API → create OAuth 2.0 Web client
2. Set env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URL` (defaults to `http://localhost:8080/api/v1/integrations/gcal/callback`), `FRONTEND_URL` (defaults to `http://localhost:3001`)
3. Add redirect URL to Google Console's authorized redirect URIs
4. For localhost testing: add yourself as a test user in OAuth consent screen (Testing mode)
5. Legal pages: `web/src/app/privacy/page.tsx` and `web/src/app/terms/page.tsx` — both public routes

### Event public_meta fields
- `gcal_id` — GCal event ID
- `gcal_origin: true` — marks inbound-imported events (outbound push skips them to prevent loops)
- `gcal_calendar_id` — which GCal calendar this event belongs to (set on inbound sync AND by QuickEventSheet picker; used by `CreateGCalEvent`/`UpdateGCalEvent` for routing; also used by frontend filter)
- `title`, `start`, `end`, `allDay`, `color` — all stored in `public_meta` (unencrypted) for GCal events **and** TIDE-created events; `useDataStore` reads them directly without decryption

### Calendar visibility filter (frontend)
`page.tsx` fetches `GET /api/v1/integrations/gcal/calendars` on mount and builds `disabledGCalCalendarIds: Set<string>`. The `events` array is `useMemo`-filtered to exclude events whose `gcal_calendar_id` is in this set — **hiding** disabled calendar events without deleting them. `SettingsModal.onCalendarToggle` updates the set immediately on toggle (no re-fetch needed). Using `useMemo` is critical: a plain `.filter()` creates a new array every render, causing infinite loops via useEffect deps (`setIdlePayload` effect).

## Security

| Area | File | Notes |
|------|------|-------|
| HTTP security headers | `web/next.config.ts` | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `X-XSS-Protection`, **`Strict-Transport-Security`** (1y + preload), **`Content-Security-Policy`** on all Next.js routes. Go API also sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` via middleware. |
| Upload size limit | `cloud/internal/api/files.go` | `http.MaxBytesReader` caps file uploads at 50 MB; `CreateFile`/`UpdateFile` JSON bodies capped at 2 MB; auth endpoints capped at 4–512 KB. |
| SERVER_MASTER_KEY | `cloud/cmd/server/main.go` | Missing key = `log.Fatal` unless `TIDE_DEV_MODE=1`. Must be exactly 32 bytes. |
| JWT_SECRET | `cloud/internal/api/middleware.go` | `ValidateJWTSecret()` at startup — fatal if unset |
| Cookie security | `cloud/internal/api/auth.go` | `HttpOnly: true`; `Secure: true` when `X-Forwarded-Proto: https` header present or `HTTPS_MODE=1` env set |
| Rate limiting | `cloud/internal/api/auth.go` | In-memory per-IP/per-email token bucket: `/register` — 5 req/hr; `/request-otp` — 5 req/10 min (per email + per IP); `/verify-otp` — 10 req/5 min. Cleanup goroutine runs every 5 min. |
| OTP security | `cloud/internal/api/auth.go` | 6-digit numeric OTP (`crypto/rand`); 5-min expiry; never returned in HTTP response when `RESEND_API_KEY` is set; case-sensitive exact-match comparison; cleanup goroutine removes expired entries |
| Visibility validation | `cloud/internal/api/files.go` | `SetVisibility` rejects values other than `"public"` / `"private"` |
| Permission validation | `cloud/internal/api/files.go` + `store` | `UpdateSharePermission` validates `"view"` / `"edit"` / `"share"` at both handler and store layers |
| Error message sanitization | `cloud/internal/api/*.go` | All HTTP error responses use generic messages; internal details (UUIDs, emails, err.Error()) only go to server logs |
| GCal sync scope | `cloud/internal/gcal/gcal.go` | OAuth scope: `https://www.googleapis.com/auth/calendar` (full access required — narrower scopes cause some calendars to be omitted) |
| GCal HTTP client | `cloud/internal/gcal/gcal.go` | Custom `http.Client{Timeout: 30s}` — no unbounded hangs on Google API |

## Go Backend Handlers

| Handler | File | Endpoints |
|---------|------|-----------|
| Auth | `cloud/internal/api/auth.go` | POST /api/auth/* |
| Files | `cloud/internal/api/files.go` | GET/POST/PUT/DELETE /api/files — 50 MB cap |
| Links | `cloud/internal/api/links.go` | GET/POST/DELETE /api/links |
| Events | `cloud/internal/api/events.go` | Calendar events |
| Tasks | `cloud/internal/api/tasks.go` | Task CRUD |
| Messages | `cloud/internal/api/messages.go` | Chat messages |
| WebSocket | `cloud/internal/api/websocket.go` | Real-time WS hub |
| Contacts | `cloud/internal/api/contacts.go` | Social contacts |
| Profiles | `cloud/internal/api/profiles.go` | Public profiles |
| Finance | `cloud/internal/api/finance.go` | Finance extension |
| Tabs | `cloud/internal/api/tabs.go` | Browser-style tabs state |
| Tracker | `cloud/internal/api/tracker.go` | Tracker module |
| Extensions | `cloud/internal/api/extensions.go` | Extension toggle |
| Middleware | `cloud/internal/api/middleware.go` | Auth middleware (JWT) |
