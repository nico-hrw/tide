<!-- AI COMPONENT INDEX — tables not bullets, file paths are absolute from repo root -->
<!-- ⚠️ MANDATORY: Update this file in EVERY session that touches components, lib utilities, or design. No exceptions. -->
# TIDE — Component Index

## Design System

| Module | File | Role |
|--------|------|------|
| designTokens | `web/src/lib/designTokens.ts` | **Single source for all visual constants** — `DT.glass(isDark)`, `DT.chip(active, isDark)`, `DT.radius`, `DT.blur`, `DT.accent`, `DT.cardBg`, `DT.mutedText`, `DT.primaryText`. Import from here; **never hardcode blur/radius/color values inline** in new components. |

## Dashboard & Orchestration

| Component / Module | File | Role |
|--------------------|------|------|
| Dashboard (`page.tsx`) | `web/src/app/page.tsx` | Clean root orchestrator (<500 lines) wiring `useSessionRestore`, `hooks/dashboard/*` action/listener hooks, desktop `Sidebar` + `DashboardDesktopContent`, `MobileLayout`, and `DashboardModals`. |
| DashboardDesktopContent | `web/src/components/Dashboard/DashboardDesktopContent.tsx` | Desktop workspace shell: renders `TabList` (no floating island in folders/tablet mode any more), calendar drop target (`CalendarView`), `CentralFolderView`, `CanvasWorkspace`, `TodoList`, `SocialHub`, `ProfilePage`, `JobsWorkspace`, and `TrashPanel`. |
| DashboardModals | `web/src/components/Dashboard/DashboardModals.tsx` | Dashboard-level overlays and modals: `CloudStatusBanner`, `EventDragGhost`, `GlobalModalsHost` (share, PIN/security, settings, schedule, daily summary, backup history, delete confirm/error), `SearchOverlay`, and `MoodPopup`. |
| Dashboard types | `web/src/components/Dashboard/types.ts` | Shared Dashboard TypeScript models (`DecryptedFile`, `CalendarEvent`, `UserProfile`, `DashboardStatus`, `SaveStatus`, `DeleteConfirmState`, `DeleteErrorState`, `NoteSecurityModalItem`, `ShareModalFile`, `SummaryStats`, `SessionKeyPair`, `Tab`, `CalendarViewMode`) and `isSameTime` helper. |

### Dashboard Hooks (`web/src/hooks/dashboard/`)

| Hook / Helper | File | Role |
|---------------|------|------|
| useSessionRestore | `web/src/hooks/dashboard/useSessionRestore.ts` | Restores auth session, RSA/master keys (`keyStorage`), profile, sanitized `openTabs` (`tabStorage`), and persisted `calendarDate` on mount; redirects to `/auth` on invalid/missing session. |
| useFolderAndGroupActions | `web/src/hooks/dashboard/useFolderAndGroupActions.ts` | Encrypted folder creation (`handleCreateFolder`, `handleCreateFolderCentral`), folder color updates, file moves (`handleMoveFile`, `handleMoveFileToFolder`), and calendar event-group CRUD + visibility toggles. |
| useFileActions | `web/src/hooks/dashboard/useFileActions.ts` | Note/folder/canvas delete flows (`handleDeleteNote`, `executeDeleteNote`), encrypted rename, visibility toggles, sharing (`handleShare`, `performShare`), and PIN/security settings persistence; delegates crypto/API payload helpers to `fileActionHelpers.ts`. |
| fileActionHelpers | `web/src/hooks/dashboard/fileActionHelpers.ts` | Pure/async helpers for `useFileActions`: encrypted rename payloads, metadata resolution, content download/decrypt, visibility conflict retries, V1 contact sharing, and share fallback fetching. |
| useCalendarActions | `web/src/hooks/dashboard/useCalendarActions.ts` | Encrypted calendar event CRUD (`handleEventCreate`, `handleEventUpdate`, `handleEventRename`, `handleEventSave`, `handleDeleteEvent`), batch `handleScheduleApply`, and linked-task synchronization guards. Event PUTs go through `eventWriteGuard` (`putEventGuarded`). File is 558 lines: flagged for splitting (rule 8). |
| useWorkspaceTabs | `web/src/hooks/dashboard/useWorkspaceTabs.ts` | Tab switching (`switchTab`), note/canvas creation (`handleNewNote`, `handleNewCanvasNote`), Markdown export, tab selection/closing, magic-link navigation, chat/messages tab opening, backup restore, calendar week stepping, and logout cleanup. |
| useTaskCalendarSync | `web/src/hooks/dashboard/useTaskCalendarSync.ts` | Keeps Todo tasks (`isTaskVisibleInCalendar`) synchronized with linked calendar events (creates/updates linked events on task changes and handles `event-task:toggle` window events). The todo is the source; the entry is compared normalized (`isLinkedRecurrenceDiff`: "", "NONE", "FREQ=NONE" all mean "no repetition"; `isLinkedCompletionDiff`: a done todo also accepts the entry's own date in `completed_dates`). Each entry is written at most once per todo state per session (`attemptedRef`, keyed by `eventContentSignature`), so a refresh after another client's write never writes back. See "Todo entries and the write brake" below. |
| eventWriteGuard | `web/src/lib/eventWriteGuard.ts` | Write guard for every `handleEventSave` PUT: `eventContentSignature` (normalized, sorted), skip of an identical rewrite while the server version is unchanged, one 409 retry with fresh server state (`GET /api/v1/files/<id>`, own keys merged over it, 250-750 ms backoff) then stop with a console warning, and a per-file brake (burst of 3, then one write per 2 s, max 20 per minute; a waiting write is replaced by a newer one for the same file, console warning when braking). |

#### Todo entries and the write brake

Calendar entries of todos (`is_task`, `linkedTaskId`) are derived from the todo by `useTaskCalendarSync` and written through `handleEventSave` → `putEventGuarded`.

- **Ping-pong of November 2026:** entries with `recurrence_rule: "NONE"` (set by the event popover) and a done todo were rewritten every ~2 s by every open client (versions ~75 000). Cause: the sync compared `"NONE" !== undefined` and `is_completed`, while `handleEventSave` treated `"NONE"` as repeating (`!== "none"` was case-sensitive), so the tick went into `completed_dates` and `is_completed` stayed `false`. The difference never closed, and every refresh (own SSE echo after the 3 s cooldown, the other client's write at once) wrote again; parallel writes produced the 409s. Reproduced in `hooks/dashboard/__tests__/taskEventPingPong.test.tsx` (two clients, fake server with OCC: 42 writes per minute before the fix, at most 2 after).
- **Now:** none-like rules are not stored for todo entries (the key is removed), `handleEventSave` only uses the occurrence path for real rules, un-ticking a non-repeating entry also clears its date in `completed_dates`.
- **Old open tabs** keep the old JavaScript until reloaded and can keep rewriting; reload every open Tide tab after the deploy.
| useDashboardListeners | `web/src/hooks/dashboard/useDashboardListeners.ts` | Centralizes window/global listeners and persistence effects (auth sync, `openTabs`/date persistence, keyboard/custom events, text-to-calendar drag/drop, drag-ghost click-to-insert mention, and canvas block deletion/rebind). |

## Layout

| Component | File | Role |
|-----------|------|------|
| Sidebar | `web/src/components/Layout/Sidebar.tsx` | Left nav: folder tree, note list |
| TabList | `web/src/components/Layout/TabList.tsx` | Open tabs bar (desktop). Todos is a fixed tab (toggle via `onToggleTodos`) in every desktop layout; the sidebar no longer lists it. Todo tabs are not shown as ordinary tabs. Tabs sit in rows of small groups (layout in `localStorage.tide_tab_layout`, logic in `web/src/lib/tabLayout.ts`). |
| TabLayoutView | `web/src/components/Layout/TabLayoutView.tsx` | Draws the tab rows and groups and handles dragging with pointer events (not HTML5 DnD, so it behaves the same in every browser). There is no grid: while a tab is dragged the others make room live. Next to a tab it joins that tab's group; further away (the gap between groups, past a row's end, above, below or between rows) a new group or row appears. The target comes from `resolveDrop` (pure, tested, in `web/src/lib/tabLayout.ts`) against the tab positions measured when the drag starts; the preview is `moveTab` on those rows, and tabs slide to their places (FLIP via the Web Animations API, off with reduced motion). The bar's height eases when rows come and go; the tab area takes about two thirds of the header, groups keep 28 to 128 px apart, rows get extra margin from two rows on. The tab follows the pointer as a ghost, Escape cancels, a press under 6 px is a click. |
| WorkspaceTimeTracker | `web/src/components/Layout/WorkspaceTimeTracker.tsx` | Counts time per workspace (visible app only) and, after a stint of 5+ min ends by switching, offers to save it as a calendar entry (via `useIslandActionsStore.createEvent`). Logic in `web/src/lib/workspaceTime.ts` (pure, tested), state in `useWorkspaceTimeStore`. On by default; off with `localStorage.tide_time_tracking = 'off'`. Nothing leaves the device until the user confirms. |
| MobileLayout | `web/src/components/Layout/MobileLayout.tsx` | Clean mobile shell orchestrator (<500 lines) managing tab/UI/filter/drag state, event expansion (`expandMobileEvents`), theme-color sync, and composing `Layout/mobile/*` (`MobileSidebarDrawer`, `MobileTopHeader`, `MobileCalendarTab`, `MobileNotesTab`, `MobileBottomDock`, `MobileOverlaysAndModals`) plus `MobileTodoView` (`MobileTodoStyleProvider`) and `MoodPopup`. |
| MobileWeekGrid | `web/src/components/Layout/MobileWeekGrid.tsx` | 7-column week hour grid, pinch-to-zoom (hourH 24-120px, persisted), Google Calendar-style event drag/resize (body=move, edges=resize), long-press creation, current-time indicator, scroll position persisted; hour-lines via CSS gradient; event move drag: invisible pill + DOM overlay approach (no React re-renders during drag); overnight events: `dayEvents()` includes events spanning into a day (start≤dayEnd && end>dayStart), rendering clamps to day window (continuation pill top=0, continued pill bottom=grid-end), dashed top/bottom per-side border + ↑/↓ indicator for multi-day segments. **Border rule**: use 4 individual `borderTop/Right/Bottom/Left` — never mix `border` shorthand with `borderTop`/`borderBottom` on same element (React warns). **Event pill body**: fills full pill height (`top:0, bottom:0`); resize handle bars are absolute overlays (12×1 px, `rgba(255,255,255,0.35)`) so they don't reduce body text area; body padding is dynamic: `handleH+1` px on handle sides to clear the indicator bar. **Move drag hold**: requires 1 s hold before activating — `evPendingMoveRef` blocks column creation; `stopPropagation`/`preventDefault` NOT called initially so week-swipe and native scroll pass through; any movement >8 px before hold fires cancels pending drag. Resize handles (top/bottom) still activate immediately. `colTouchStart` checks `evPendingMoveRef.current` to suppress creation while event hold is pending. **Z-index**: `10 + startMinutes` so later-starting overlapping events render on top. **Parallel events**: overlap in a cascade (lane i offset by `min(30, 55/(N-1))%`, `zIndex 4+lane`, outline separator) instead of equal thin columns. |
| MobileHeaderWidgets | `web/src/components/Layout/MobileHeaderWidgets.tsx` | Mobile header helpers. `pickGreetingTemplate(date)`: picks from >=24 German greeting templates (time-of-day pools + general), avoids repeating the last one via localStorage `tide_last_greeting`. `formatGreeting(template, name)`: replaces `{name}` token with ", Name". `CountdownEvent` type. The header island itself is `island/MobileIsland`. |
| MobileSplash | `web/src/components/Layout/mobile/MobileSplash.tsx` | Mobile-only app-start intro controller (renders null, NO React state, no overlay/handwriting font). Once per session (`sessionStorage tide_splash_done`); skipped (`data-intro=done`) for width >= 768 or `prefers-reduced-motion`. Sets `html[data-intro]` = `hidden` -> `greeting` -> `island` -> `content` -> `done` via DOM; typewrites the real header `h1[data-intro-greeting]` text nodes (35-70 ms/char, start 250 ms, fixed min-height, confetti span preserved). At `island` it dispatches `tide-syncing`/`tide-synced` (750 ms) (no longer consumed by the island). CSS: marked "MOBILE INTRO" block in `globals.css` (`.intro-item`/`.intro-fade`/`.intro-island`/`.intro-nav`, `--i` stagger 130 ms, 450 ms cubic-bezier(.16,1,.3,1)). Used in `page.tsx` as `<MobileSplash />`; `MobileLayout` uses plain divs with those classes. |
| GlobalModalsHost | `web/src/components/Layout/GlobalModalsHost.tsx` | Encapsulates `DashboardModals` and modal trigger states (delete confirm, share modal, note security/PIN, backup history, schedule, settings, daily summary). |
| CanvasWorkspace | `web/src/components/Workspaces/CanvasWorkspace.tsx` | Canvas vs standard TipTap editor workspace container: CanvasLayer, CanvasNoteEditor, EditorGutter, read-only banner, collaborators, rename header, save indicator. |

### Mobile Modular Components & Helpers (`web/src/components/Layout/mobile/`)

| Component / Helper | File | Role |
|--------------------|------|------|
| MobileTopHeader | `web/src/components/Layout/mobile/MobileTopHeader.tsx` | Sticky mobile header (`max(52px, env(safe-area-inset-top)+10px)`): greeting (`pickGreetingTemplate`/`formatGreeting`, tappable confetti name), `MobileIsland` slot, calendar view switcher (`Tag`/`Fortlaufend`/`Woche`/`Monat`), today reset button, and `MobileDateWheel`. |
| MobileSidebarDrawer | `web/src/components/Layout/mobile/MobileSidebarDrawer.tsx` | Slide-in mobile navigation drawer (`framer-motion`): quick-notes, recent files, root folders/notes (`FolderItem`/`NoteRow`), drag-to-folder ghost preview, animated-emoji toggle, Job & Uni / Settings triggers. |
| MobileCalendarTab | `web/src/components/Layout/mobile/MobileCalendarTab.tsx` | Mobile calendar tab container supporting `day` (`DbTimelineDay`), `agenda` (`MobileAgendaTimeline`), `week` (`MobileWeekGrid` + all-day rows via `computeWeekAllDayRows`), and `month` (`MiniCalendar`) with horizontal swipe navigation (`useMobileSwipeGestures`). Day view passes `proportional`, `onMoveEvent` (hold + drag a card inside the open list, see `inlineEventDrag`), `onDraftAt` to `DbTimelineDay`, holds the `quickEdit` state and renders `QuickEditGrid` as sibling of the list; swipe is off while it is open (see `quickEditState`). |
| MobileNotesTab | `web/src/components/Layout/mobile/MobileNotesTab.tsx` | Mobile notes tab supporting list (`FolderItem`/`NoteRow`) and grid (`FolderCard`/`NoteCard`/`MobileNoteCard`) views, quick-notes, shared folder accordion, live search filtering, decrypted note preview subscription (`notePreview`), and long-press context menu / touch drag. |
| MobileBottomDock | `web/src/components/Layout/mobile/MobileBottomDock.tsx` | Keyboard-aware (`visualViewport`) mobile bottom dock: hosts `MobileBottomNav`, contextual Todo inline-edit action bar (cancel/delete/subtask/done), expandable quick-create `+` menu (event, todo, note, folder), and today jump action. |
| MobileOverlaysAndModals | `web/src/components/Layout/mobile/MobileOverlaysAndModals.tsx` | Mobile overlay & modal host: full-screen note editor overlay, lazy-loaded `JobPlanner` (`OverlayShell`), `EventSheet`, `MobileEditEventSheet`, `MobileContextMenuSheet`, `MobileRenameModal`, `MobileCreateModal`, `MobileSearchOverlay`, `MobileFilterPopover`, `MobileNewEventSheet`, and `PinPromptModal`. |
| MobileNoteListItems | `web/src/components/Layout/mobile/MobileNoteListItems.tsx` | Mobile list-mode primitives (`NoteRow`, `FolderItem`) with PIN-lock detection (`isItemProtected`, `getItemDisplayTitle`, `PinPromptTarget`), long-press context menu, and folder drag-over drop targets. |
| MobileNoteGridCards | `web/src/components/Layout/mobile/MobileNoteGridCards.tsx` | Mobile grid-mode primitives (`NoteCard`, `FolderCard`) with folder color styling (`getFolderColor`), PIN unlock prompting, and long-press context menu. |
| expandMobileEvents | `web/src/components/Layout/mobile/expandMobileEvents.ts` | Pure mobile calendar helpers: `expandMobileEvents` (expands recurring events around `activeDate`, applies per-day `overrides` and group `effect`s) and `computeWeekAllDayRows` (packs multi-day all-day spans into non-overlapping week rows). |

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
| Editor | `web/src/components/Editor.tsx` | TipTap editor wrapper (SSR-disabled). Features dual modes via `isShared`: (1) **Solo mode** (`isShared=false`): zero WebSocket/Yjs overhead, native undo/redo, instant ProseMirror JSON loading via `content` prop; (2) **Collaborative mode** (`isShared=true`): pre-seeded Yjs doc + WebSocket room. Robust against phantom blank overwrites via `isDocEmpty` checks, late-arriving content recovery, and user typing detection (`userHasTypedRef`). BubbleMenu toolbar: **5 primary actions always visible** (Bold, Italic, Underline, Clear, ▼ expand chevron). Secondary actions (font size, text color, highlight, math, reference, smart island, pop-out, connect image) shown when chevron toggled. `toolbarExpanded` state controls secondary visibility. |
| SlashCommand | `web/src/components/extensions/SlashCommand.tsx` | `/` command menu |
| DateMention | `web/src/components/extensions/DateMentionExtension.tsx` | Inline date chip |
| CalendarEventMention | `web/src/components/extensions/CalendarEventMentionExtension.tsx` | Inline event chip |
| ViewMention | `web/src/components/extensions/ViewMentionExtension.tsx` | Inline chip linking to a saved calendar view (`@` menu, live name/dots from the store, greyed out when deleted). The chip has two buttons: the name opens the calendar, the `Todos` part opens the todo list. Click dispatches `viewMention:click` with `{ viewId, target: 'calendar' | 'todos' }`; `useDashboardListeners` hands it to `hooks/dashboard/viewMentionClick.ts` (`handleViewMentionClick`), which sets BOTH `calendarTagFilter` and `todoTagFilter` to `viewFilters(view, knownTagIds)` and then opens the target tab (calendar also applies the view mode). Mobile follows via `mobile_apply_view_mode` (calendar) and `mobile_open_todos` (todo tab), both handled in `MobileLayout`. Suggestion helpers: `viewSuggestion.ts` |
| TagSuggestion | `web/src/components/extensions/tagSuggestion.ts` | `@#Tag` filtering of the `@` menu (plain search only): `applyTagFilter`/`filterByTagQuery` (AND over notes `tagIds`, events `getEventGroupIds`, todos `tags`), `buildTagRows` (rows `TAG:<id>` for an ambiguous `#token`), `queryAfterTagPick` (picking a row rewrites the query to `@... #FirstWord ` so the menu keeps open), `cleanActionLabelQuery` (Create File/Todo without `#tokens`). Parsing in `tagQuery.ts`. With applied tags, attachments and views are hidden |
| TaskMention | `web/src/components/extensions/TaskMentionExtension.tsx` | Inline task chip |
| ReferenceMark | `web/src/components/extensions/ReferenceMark.ts` | Reference marks: hover shows exactly the typed definition (O(1) lookup via `getReferenceById`), click fires `tide:reference-edit` |
| ReferenceForm | `web/src/components/Editor/ReferenceForm.tsx` | Definition popup (textarea + collapsible colour/emoji) used for creating (bubble-menu "?" button) and editing references |
| ReferenceEditPopover | `web/src/components/Editor/ReferenceEditPopover.tsx` | Edit popup opened by clicking a marked term: change definition/look, remove (with undo), jump to source note |
| FeedbackHost | `web/src/components/Feedback/FeedbackHost.tsx` | Toast stack (undo toasts keep alive while the mouse approaches, ring timer, see `lib/toastTimer.ts`) and the in-app confirm dialog; API in `lib/feedback.ts` (`notify`, `notifyError`, `notifyUndo`, `askConfirm`) — no `alert()`/`confirm()` anywhere (ESLint `no-alert`) |
| PopupTimerBar + `usePopupTimer` | `web/src/components/Popup/PopupTimerBar.tsx`, `web/src/hooks/usePopupTimer.ts`, `web/src/lib/popupTimer.ts` (pure, tested), `web/src/lib/mousePosition.ts` | Position based close timer for popups: the time runs down while the mouse is away, is refilled near the popup and won back while the mouse heads towards it; holds while a text field inside has focus; never expires without a mouse (touch). The bar along the top edge is two rounded segments that always add up to 100% (time left / time used). Usage: `const { fillRef, restRef } = usePopupTimer({ refs: [popupRef], onExpire })` and `<PopupTimerBar fillRef restRef />` inside a positioned popup. Flyouts and lists inside count as part of the popup (`data-popup-part`, `role=listbox/menu`). Used by the note and sidebar context menus, the workspace menu, the Plugins and workspace dropdowns and `EventPopover`. |
| FileContextMenu | `web/src/components/Layout/sidebar/FileContextMenu.tsx` | Right-click menu of a note or folder: neutral icons, one-line rows, icon-only export/import row, "In Workspace verschieben" as a hover option with a flyout (hangs on the row with a transparent bridge). Rendered by `SidebarContextMenu`, which also holds the menu of the empty sidebar area. |
| MathBlock | `web/src/components/extensions/MathBlock.tsx` | LaTeX math blocks |
| ResizableImage | `web/src/components/extensions/ResizableImage.tsx` | Drag-to-resize image node |
| InlineCommentNode | `web/src/components/extensions/InlineCommentNode.ts` | Inline comment annotations |
| CommentNodeView | `web/src/components/extensions/CommentNodeView.tsx` | Comment render view |
| BlockId | `web/src/components/extensions/BlockId.ts` | Assigns UUID to each block (anchor system) |
| Anchor | `web/src/components/extensions/Anchor.ts` | Scroll-to-block anchor extension |
| Highlight | `web/src/components/extensions/Highlight.ts` | Text highlight |
| FontSize | `web/src/components/extensions/FontSize.ts` | Font size override |
| PencilInkExtension | `web/src/components/extensions/PencilInkExtension.ts` | TipTap document-level attribute extension (`inkStrokes`) persisting freehand Apple Pencil vector strokes in ProseMirror JSON. |
| tabStorage | `web/src/lib/tabStorage.ts` | Open tabs are written to `sessionStorage` **without** cached `content`, `_fileKey` and `_saveStatus`; restored tabs are sanitised the same way. A `CryptoKey` serialises to `{}`, which used to reach the Yjs provider after a reload (it could not decrypt, the note opened empty, images/strokes missing, stale cached content shown). A tab cache is reused only together with a live `CryptoKey` (`canReuseTabCache`). |
| ydocRegistry | `web/src/lib/ydocRegistry.ts` | Maps each Yjs doc to its note and records whether the provider loaded the server state completely. `whyNotSavable(doc, noteId)` blocks compaction for a doc of another note or one that failed to hydrate, so an unloaded/empty doc can never be saved over a note (also used by the `tide:overlay-changed` save). The provider re-runs its bootstrap when the right key arrives after a failed one. |
| HighlightContext | `web/src/components/HighlightContext.tsx` | React context for active highlight |
| NoteOutline | `web/src/components/Editor/NoteOutline.tsx` | Tide 2 outline (Gliederung): H1-H3 bars at the top left beside the text (current section longer + `t2-blue`), hover card lists headings, click scrolls. Mounted inside the scroll container in `CanvasWorkspace`. |
| SaveStateIcon | `web/src/components/Editor/SaveStateIcon.tsx` | Animated stroke-only save indicator (saved check draws, saving arc spins, failed `!` shakes, shared-live two-people pulses) + tooltip. State logic stays in `CanvasWorkspace` (`saveStatus`). |
| NoteHistoryLabel | `web/src/components/Editor/NoteHistoryLabel.tsx` | "Zuletzt bearbeitet vor …" in the note header; toggles the on-page version timeline (replaces the clock button). |
| NoteTagsRow | `web/src/components/Editor/NoteTagsRow.tsx` | Tag picker under the note title (owner only; renders nothing for recipients). Reads `tagIds` of the note, drops unknown ids, saves via `useNoteTags().setNoteTags`. |
| NoteHeaderActions | `web/src/components/Workspaces/NoteHeaderActions.tsx` | Note header cluster in two right-aligned rows: "Zuletzt bearbeitet" label (owner only, `note-history-row`) above the icon buttons (Share, VarSheet, save state, options; `note-actions-row`). On the A4 sheet it hangs in the top margin (`lg:absolute lg:bottom-full lg:right-0`). |
| NoteHistoryTimeline | `web/src/components/Editor/NoteHistoryTimeline.tsx` | On-page vertical timeline beside the right edge (line on the left of left-aligned entries, grows, points at heights proportional to age, viewport-clamped `panelHeight` via `height - 96`). Selecting a point shows **Ansehen** (opens `NoteVersionDiffView`, state `isViewingVersion`) and **Wiederherstellen** (`handleApplyHistory` with immediate restore persistence). Content column shifts left via `lg:pr-[300px]` on the scroll container. Replaces the removed `NoteVersionTimeline`. |
| NoteVersionDiffView | `web/src/components/Editor/NoteVersionDiffView.tsx` | Renders smart multi-stage diffs (word/sub-word/whitespace/linebreak highlights with `↵` markers, change summary stats, and Vergleich/Version toggle). |
| NoteBreadcrumb | `web/src/components/Editor/NoteBreadcrumb.tsx` | Small pale folder path above the note title (`text-t2-ink-3`). |
| TextStyleButtons | `web/src/components/Editor/TextStyleButtons.tsx` | Text / H1 / H2 / H3 buttons at the start of the bubble menu; act on the whole block around the selection. Heading sizes come from `.ProseMirror h1-h3` in `globals.css` (Tailwind preflight resets headings to body size). |
| noteChrome.css | `web/src/components/Editor/noteChrome.css` | Keyframes/styles for the three components above, using `--t2-*` tokens. |
| TableCellAttrs | `web/src/components/extensions/TableCellAttrs.ts` | `TableCellAligned` / `TableHeaderAligned`: TipTap table cells with `textAlign` (left/center/right) and `verticalAlign` (top/middle/bottom) attrs. Values are allowlisted on parse **and** render (attrs can arrive through Yjs). Old docs without attrs render unchanged. |
| tableCommands | `web/src/components/Editor/tableCommands.ts` | `setCellAlign`, `canMerge/canSplit`, `mergeSelectedCells`, `splitSelectedCell` — thin wrappers over TipTap table commands (work on a cell or a `CellSelection`). |
| TableCellBar | `web/src/components/Editor/TableCellBar.tsx` | Slim floating bar above the cell with the caret (hidden for text selections, the bubble menu owns those): horizontal/vertical alignment, merge, split. Left click only. |
| TableContextMenu | `web/src/components/Editor/TableContextMenu.tsx` | Right-click menu: Spalte · Zeile · Tabelle side by side (insert/delete, header row toggle). Replaces the old English menu in the removed `EditorToolbar.tsx`; closes on action, outside click, Escape. Table style B lives in `globals.css` ("Table style B"). |
| Formula engine | `web/src/lib/formula/` | Pure TS, no deps. `parser.ts` (`parseFormula`, `parseNumber`: German `1.234,5`, `3,9 %`, `12 €`; `;` or `,` separate arguments, digit,digit is a decimal; supports cross-table refs like `T1!A1`, `Tabelle1!A1`, `Table1!A1`), `evaluate.ts` (`evaluate(expr, EvalContext)`; errors `#DIV/0 #WERT #BEZUG #NAME #ZIRKEL #VAR` are values, never thrown); operators `+ - * / ^ %`, comparisons, and `&` (text concatenation, binds weaker than `+`/`-`, stronger than comparisons; `+` also concatenates when an operand is non-numeric text, e.g. `="a"+1` is `a1`, but `="5"+3` is 8; numbers in text are German-formatted), `functions.ts` (SUMME MITTELWERT MIN MAX ANZAHL RUNDEN WENN ABS WURZEL POTENZ RMZ ZW BW + English aliases; text in ranges is skipped like Excel), `format.ts` (`formatResult`, de-DE, max 4 decimals), `tableCalc.ts` (`computeTable`, `computeDocumentTables` for cross-table references with cycle detection, `gridFromPmTable` respects merged cells: address = top-left), `formulaRefs.ts` (reference colours, `canInsertRefAt`, `sumRangeFor`), `usedGlobals.ts` (`findUsedGlobals`, `applySnapshotToEditor`: resolves global variables/functions referenced in notes and applies snapshots), `variableSuggestions.ts` (collects/filters/sorts suggestion items). Tests in `__tests__/`. |
| TableFormulas | `web/src/components/extensions/TableFormulas.ts` (+ `tableFormulaDecorations.ts`, `tableFormulaUtils.ts`) | ProseMirror plugin. A cell whose text starts with `=` is a formula; when it does not hold the caret it shows its result (`data-result` + `::before`, formula text hidden). While a formula cell has the caret: A/B/1/2 labels, numeric cells glow (`.tt-cand`), referenced cells and the reference text get a colour (`tt-refc-0..5`). Click on a cell (including in another table, inserting `T1!A1` prefix) inserts its reference when the caret sits after `=`/operator/`(`/separator; dragging inserts a range. Results are never stored in the document. `insertSumFormula(view)` backs the Σ button. Variables/functions come from `options.getScope`, supplied by `variablesScope` and `VariableRegistry`. |
| VariablesBlock | `web/src/components/extensions/VariablesBlock.tsx` | TipTap NodeView for note-level variables (`VariablesBlockNode.ts`, `variablesScope.ts`). Edit mode (code) & view mode (formatted results, local/global toggle). |
| InlineFormulas | web/src/components/extensions/InlineFormulas.ts | ProseMirror decoration extension evaluating inline text calculations ==expr== and ==@expr== using note & global variables, formatted subtly in light-gray. |
| FormulaSuggestion | web/src/components/extensions/FormulaSuggestionPlugin.ts | Autocomplete suggestion popup for formula variables & functions in table cells and inline calculations (FormulaSuggestionMenu.tsx, variableSuggestions.ts). |
| VariablesModal | `web/src/components/Variables/VariablesModal.tsx` | Central popup (`VariablesParts.tsx`) displaying global variables from notes, standalone manual variables, user functions, and read-only Tide standard library. |
| VariableRegistry | `web/src/lib/variableRegistry.ts` | Central encrypted variable registry (`variableRegistryStorage.ts`, `variableRegistryInstance.ts`). Synchronizes `@`-pinned global variables across notes to private backend file. |

## Smart Island

| Component | File | Role |
|-----------|------|------|
| SidebarIsland | `web/src/components/Layout/sidebar/SidebarIsland.tsx` | Sidebar slot of the Smart Island (bottom left, in flow, square `aspect-square` full width). Renders `DesktopIsland`. |
| island/islandLogic | `web/src/components/island/islandLogic.ts` | Pure logic (tested in `island/__tests__`): `pickIslandState` (capture > notice > user view > automatic), `nextIslandState` (tap cycle), `findRunning`/`findNext`, `buildWeekRow`, `formatCountdown`, `detectCapture` (preselects Termin/Notiz/Todo from `dateParser` + explicit time via `timeParser`, todo cue words, else note), `resolveCaptureTimes`. |
| useIslandModel | `web/src/components/island/useIslandModel.ts` | ONE content model for every device: state (`rest` / `running` / `next` / `day` / `capture` / `notice`), countdown + progress, week row, agenda, notice (from the `useIslandStore` queue: message, interactive_card, reminder; `event_suggestion` opens capture), capture (`useIslandCapture`), `tap`/`close`. Reads `useIslandSettingsStore` (`expandOnNotification`, `fileShareDisplay`). Clock ticks 1 s only while a countdown is visible, else 15 s. |
| useIslandCapture | `web/src/components/island/useIslandCapture.ts` | Quick capture: text, detected/overridden kind, confirm creates via store (`addTask`, `createNote` + `fetchDirectory`) or `useIslandActionsStore.createEvent`; Edit opens the schedule builder (`editEvent`). Also fed by `smartIslandState` (editor bubble menu). |
| useIslandActionsStore | `web/src/store/useIslandActionsStore.ts` | Bridge: `page.tsx` registers `createEvent` / `editEvent` (needs encryption keys + schedule modal), all island layouts call them. |
| DesktopIsland | `web/src/components/island/DesktopIsland.tsx` | Desktop/tablet layout. Placeholder slot (sidebar: square; hidden in tablet `folders` mode, where no island is shown) + a panel in a portal (`z-[150]`, below modals) anchored at the slot's bottom-left. Rest = square month grid (no list); every other state grows as a 340 px card over the sidebar edge. FLIP animation (transform/opacity only, `prefers-reduced-motion` respected, no blur). Click outside / Escape closes. The model is only mounted while the slot is visible (collapsed sidebar, phone width) so queue and capture never double. |
| MobileIsland | `web/src/components/island/MobileIsland.tsx` | Phone layout (header, top right): square in the running/next event colour via `eventPalette` (neutral ink when idle), tap opens the card, further taps cycle focus > day > month > close. Same `IslandBody` as desktop. |
| IslandBody / IslandViews / IslandMonth / IslandCapture | `web/src/components/island/` | Shared state views: running (countdown + thin progress line), next (calm), day (week row with today + agenda with title/time/description, no calendar), month (rest), notice, capture (three icons with tooltip, hint + chips, Create/Edit; when opened by typing anywhere (`searchFirst`) it lists matching notes/events/todos first via `islandSearch.ts`, click/Enter opens via `useIslandActionsStore.openItem`, a trailing "Create new" row or Ctrl/Cmd+Enter creates). Texts via `useIslandText` -> `i18n` category `island` (de/en). `islandMotion.ts`: FLIP, outside-click, slot rect/visibility hooks. |
| CalendarDetailPanel | `web/src/components/Calendar/CalendarDetailPanel.tsx` | Tide 2 Detailspalte des Desktop-Kalenders (Tag und Fortlaufend), immer sichtbar. Ohne Auswahl: Titel, ein Satz und bis zu drei Kennzahlen. Mit Auswahl: Bereich, Titel, Zeit, Beschreibung, Tags, Aufgaben-Status, Buttons Bearbeiten/Löschen. Flach mit linker Linie, wie die Todo-Details. |
| DesktopAgendaView (Fortlaufend) | `web/src/components/Calendar/DesktopAgendaView.tsx` | Tide 2: Liste links in fester Breite (520 px), `CalendarDetailPanel` rechts. Ganzfarbige Termin-Karten mit Zeitspalte, Punkt und Linie in der Schiene, Pausen ("30 Min. frei") als gestrichelte Schiene, Todos als Pillen (ganztägig unter dem Tageskopf, zeitgebunden als eigene Zeile). Wochenkennzahlen im Ruhezustand. |
| eventPalette | `web/src/components/Layout/mobile/eventPalette.ts` | `paletteFor(color)` maps any stored event colour deterministically onto the 5 Balsam palette entries (`calendarPalette`). |
| AgendaParts | `web/src/components/Layout/mobile/AgendaParts.tsx` | Mobile day agenda pieces: `AllDayTodoPills` (white pills, circle checkbox, diagonal dashed pattern under day header), `TimedTodoRow` (time column, hollow rail dot, >=46px pill without repeated time), `FreeGap` + `formatFree` (dashed rail, "30 Min. frei"; nothing under 15 min). Used by `MobileAgendaTimeline`; event cards there are fully palette-coloured, live card has no progress bar. |
| DayTimelineParts | `web/src/components/Layout/mobile/DayTimelineParts.tsx` | Proportional day list for `DbTimelineDay` when `proportional` is set (day view only; month and agenda keep the legacy list): `buildClusters`, `BlockSeg` (block height = `blockHeightPx`), `GapSeg` (34 px, only the gap holding "now" grows via `gapHeightPx`, animated), `NowLine` placed from `nowPlacement` inside its segment; every segment carries `data-seg`/`data-seg-start`/`data-seg-end` (ms). Also `columnsFor` for overlap columns. |
| QuickEditGrid | `web/src/components/Layout/mobile/QuickEditGrid.tsx` | Mobile quick-edit overlay (portal, `fixed inset-0`, dimmed list): day grid at 56 px/h that scrolls to the active block; body drag moves, 44 px top/bottom handles resize (math in `quickEditMath.ts`: `moveRange`/`resizeStart`/`resizeEnd`, 10 min snap, min 10 min; state keeps the true range, only drawing is clipped via `visibleRange`, so midnight-crossing events keep their real start/end and length), body grab area >= 24 px, 6 px dead zone, first finger only, touchcancel reverts, live time label, faint non-interactive context events, dashed block in `draft` mode. ✓ (`Übernehmen`) → `onConfirm(start, end)`, ✕ (`Abbrechen`) → `onCancel`; persists nothing itself. |
| quickEditState | `web/src/components/Layout/mobile/quickEditState.ts` | Pure state helpers wiring `QuickEditGrid` into `MobileCalendarTab` (day view only; grid is a sibling of the list's scroll container, day swipe is off while it is open). `quickEditForEvent` (hold → edit target), `quickEditForDraft` (double tap → draft, `DRAFT_EVENT_COLOR` = `MobileCreateModal` default), `quickEditContext` (other real timed events of the day), `confirmQuickEdit` (edit: `onEventUpdate(id, start, end)` only if the range changed; draft: editing event `{ id: '', title: '', recurrence: 'none' }` for `MobileEditEventSheet`). `MobileOverlaysAndModals` saves an `id === ''` draft via `onNewEvent(start, end, draftNewEventMeta(meta))` (blank title → `Neuer Termin`), no delete, no store update, no rename; the draft sheet submits once, has a colour row (`CALENDAR_CATEGORIES` hex in `meta.color`) and saves an end of `00:00` after the start as next-day midnight. `isRecurringOccurrence(ev)`: instance id `${id}_${ms}` or a recurrence → no quick edit. `NewEventMeta` (in `MobileOverlaysAndModals`) is the shared `onNewEvent` meta type. |
| listGestures / useDayListGestures | `web/src/components/Layout/mobile/listGestures.ts`, `useDayListGestures.ts` | Day-list gestures for `DbTimelineDay` (active only with `proportional` and `onQuickEdit` or `onDraftAt`; otherwise no handlers). `createListGestures`: pure detector, hold 450 ms → `onHold`, double tap (≤ 300 ms, ≤ 24 px) → `onDoubleTap`, > 10 px movement cancels both; only observes, never blocks scroll or day swipe. Hook: hold on a timed event card → `onQuickEdit(ev)` (todos/all-day and occurrences of recurring events via `isRecurringOccurrence` ignored); root gets `onContextMenu` preventDefault and `NO_CALLOUT_STYLE` (no selection / iOS callout); double tap → `[data-seg]` rects → `timeFromTap` → `draftRangeFromTime` → `onDraftAt(start, end)` (empty day: `emptyDayDraft`, 09:00 or next full hour today, max 23:00); controls inside cards (`button, a, input, textarea, [role=button]`, except the card body marked `data-card-body`) never take part; a double tap undoes the expand of its first tap; the click after a gesture is swallowed. |
| timelineMath | `web/src/components/Layout/mobile/timelineMath.ts` | Pure math for the proportional day list (no React): constants `DAY_PX_PER_MIN` 0.8, `DAY_MIN_BLOCK_PX` 68, `GAP_PX` 34, `SNAP_MIN` 10, `DEFAULT_DURATION_MIN` 60. `blockHeightPx`, `gapHeightPx` (only the gap containing now grows), `nowPlacement` (before-first / in-block / in-gap / after-last + fraction), `timeFromTap` (tap y + `SegRect[]` → ms; outside the list extrapolated at `pxPerMin`, in a hole → nearest edge), `roundToStep`, `draftRangeFromTime` (10 min rounding, 60 min, start clamped to the day). |
| inlineEventDrag | `web/src/components/Layout/mobile/inlineEventDrag.ts` | In-list move of one event card in the mobile day view (no overlay): `setPressLevel` (light lift ~70 ms after touching, stronger when armed at 280 ms hold), `startInlineDrag` (card follows the finger via DOM transform, all other cards faded + `pointer-events: none` so overlapping events cannot be grabbed, time badge, auto-scroll near the edges, document-level capture listeners stop the day swipe; `moveRange` snaps to 10 min at `DAY_PX_PER_MIN`). Commits via `onCommit` on release, touchcancel reverts. Wired by `useDayListGestures` (`onMoveEvent`). |
| quickEditMath | `web/src/components/Layout/mobile/quickEditMath.ts` | Pure range math for `QuickEditGrid`: `visibleRange` (range clipped to the day, min 10 min, drawing only), `moveRange` (keeps length, clamps only the start), `resizeStart`/`resizeEnd` (10 min snap relative to local midnight, keep true start/end beyond the day), `pxToMin`. All take the true range, never the clipped one. |
| MobileAgendaTimeline (`DbTimelineDay`) | `web/src/components/Layout/mobile/MobileAgendaTimeline.tsx` | Day/agenda/month list. Props `proportional` (set only by the day view in `MobileCalendarTab`; month and agenda keep the legacy list), `onQuickEdit(ev)` and `onDraftAt(start, end)` (gestures, only active with `proportional`; see `useDayListGestures`). Segments from `DayTimelineParts`, cards/pills from `AgendaParts`. |
| MobileTodoStyle | `web/src/components/Todo/MobileTodoStyle.tsx` | Context + helpers for the Tide 2 mobile todo cards. `MobileLayout` wraps `TodoList` in `MobileTodoStyleProvider`; `TodoTreeItem` then uses grey-tint card (`color-mix(#5C6E6C 8%, --t2-bg)`), Balsam green today card (white text via `.tide-m-today` in globals.css), ChevronUp/Minus/ChevronDown priority icons (#A9623F/#C0893A/#7E9A83) and a grey clock + "Überfällig" (no red). Desktop unaffected.
| useIslandStore | `web/src/components/extensions/smart_island/useIslandStore.tsx` | Island notification queue (React context): push/dismiss, focus mode (`ALL`/`IMPORTANT`/`DND`), daily summary mode, display timer. `EventSuggestionPayload` type lives in `island/islandTypes.ts`. |

## Canvas

| Component | File | Role |
|-----------|------|------|
| CanvasLayer | `web/src/components/Canvas/CanvasLayer.tsx` | Floating element overlay (images, text widgets) |
| CanvasElement | `web/src/components/Canvas/CanvasElement.tsx` | Single draggable canvas element. Drag keeps images inside the page and snaps them to the left/right/top edge (`lib/canvasSnap.ts`, `snapX` is stored and follows the edge when the page width changes). |
| CanvasImageWidget | `web/src/components/Canvas/CanvasImageWidget.tsx` | Loads and decrypts one note image. New images carry their own key (`bek`) in the encrypted sidecar and open for collaborators; legacy images (`encryptedKey`) open for the owner only. Failures show a message with a retry button. |
| PageEdgeHatch | `web/src/components/Canvas/PageEdgeHatch.tsx` | Hatched strip in the page margin next to the edge an image touches (while dragging and on hover). |
| CanvasNoteEditor | `web/src/components/Canvas/CanvasNoteEditor.tsx` | Full free-canvas note mode |
| CanvasNoteItem | `web/src/components/Canvas/CanvasNoteItem.tsx` | Individual canvas note item |
| EditorGutter | `web/src/components/Canvas/EditorGutter.tsx` | Right gutter for canvas elements alongside editor |
| useStyleFile | `web/src/components/Canvas/useStyleFile.ts` | Load/save `.{noteId}_style.json` sidecar |
| useCanvasImageUpload | `web/src/components/Canvas/useCanvasImageUpload.ts` | Image upload for the free-canvas note type (keys in the Yjs `assets` map). Note images use `lib/noteImageAssets.ts` (`storeNoteImage` / `loadNoteImage`): per-image key, child file with `parent_file_id` (the server derives collaborator access from it), retries. Edits to the Yjs overlay (images, strokes) dispatch `tide:overlay-changed`, which schedules a save in `useAutoSaveSync`. |
| PencilInkLayer | `web/src/components/Canvas/PencilInkLayer.tsx` | SVG freehand drawing overlay supporting iPadOS Scribble passthrough (`mode === 'text'`), 240Hz Apple Pencil coalesced sampling, palm rejection, Ballpoint Pen, Highlighter Marker, stroke Eraser, and Lasso Selection tool (point-in-polygon encircling & dragging strokes). |
| PencilToolbox | `web/src/components/Canvas/PencilToolbox.tsx` | Bottom-centre floating toolbar for iPad/Apple Pencil in Tide 2 tokens (no blur, 40px touch targets): Text vs. Draw mode, Pen/Marker/Eraser/Lasso, colour and stroke presets, Undo/Redo, minimize. |

## Calendar

| Component | File | Role |
|-----------|------|------|
| CalendarView | `web/src/components/Calendar/CalendarView.tsx` | Main month/week view + global drag state |
| useWeekWindow | `web/src/components/Calendar/useWeekWindow.ts` | Virtual week window for the infinite week view: renders visible weeks ± 2 between spacer divs, scrolls on programmatic `date` changes, reports the center day after 150 ms scroll rest (no feedback loop), re-anchors beyond 26 weeks. Week math in `web/src/lib/calendarWeeks.ts`. |
| useFixedWeekNavigation | `web/src/components/Calendar/useFixedWeekNavigation.ts` | Fixed one-week mode (`calendarScrollMode === 'fixed'`): ←/→ (not in text fields) and horizontal wheel/touch gestures move `date` by ±7 days, one week per gesture via `swipeGate.ts` (80 px, 400 ms lock); disabled while an event is dragged. `CalendarView` renders one fluid-width week (`DayColumn fluid`), `useWeekWindow` is `enabled: false`. |
| CalendarToolbar | `web/src/components/Calendar/CalendarToolbar.tsx` | Title row, view-mode pills, import button and group chips extracted from `CalendarView`; shows prev / next / today buttons when `fixedWeekNav` is given. |
| ImportTagSettings | `web/src/components/Calendar/ImportTagSettings.tsx` | Vorschau-Schritt von `CalendarImportModal`: Pflicht-Haupt-Tag (bestehend oder neu, Vorbelegung Dateiname) und Filterregeln (`lib/importRules.ts`: Titel/Beschreibung beginnt mit/enthaelt -> Neben-Tag, `Vorschlag aus Titeln` aus `X:`-Praefixen; Regeln in localStorage `tide_calendar_import_rules`). Importer setzt `groupIds` (Haupt-Tag zuerst) und `parent_id`. |
| Tag-Farb-Override | `web/src/lib/tagColorOverride.ts` | Neben-Tags mit Schalter `Ueberschreibt Farbe des Haupt-Tags` (Einstellungen > Kalender > Tags, Store `calendarTagColorOverrideIds`, localStorage) ersetzen die Terminfarbe; angewandt in `useTagCalendarView`. |
| Termine eines Tags loeschen | `web/src/lib/deleteTagEvents.ts` | `Termine loeschen` im Tag-Stil-Panel: loescht alle eigenen Termine mit dem Tag (Haupt- oder Neben-Tag), der Tag bleibt. Verdrahtet in `Dashboard/DashboardModals`. |
| RecurrenceScopeDialog | `web/src/components/Calendar/RecurrenceScopeDialog.tsx` | Abfrage `Nur dieser Termin / Alle Wiederholungen / Abbrechen` fuer wiederholende Termine, einmal in `app/page.tsx` gemountet; angesprochen ueber `askRecurrenceScope` (`lib/recurrenceScopePrompt.ts`, null = abgebrochen oder kein Dialog). `handleEventSave` fragt beim Verschieben einer Wiederholung (`lib/recurrence.ts`): `Nur dieser` nimmt das Datum in `exdates` und legt eine eigene Kopie an, `Alle` verschiebt den Serienstart (und `exdates`/`recurrence_end`) um denselben Betrag. `handleDeleteEvent` fragt bei der ersten Wiederholung ebenso (absagen oder Serie loeschen). Mobile blendet `exdates` aus. |
| CalendarTagFilter | `web/src/components/Calendar/CalendarTagFilter.tsx` | Desktop toolbar tag filter: one `Tags` button (count of active filters) opening a searchable multi-select list incl. `Ohne Tag` and reset, plus removable chips for the active tags. Replaces the row of `CalendarTagPills` on desktop (mobile keeps the pills). |
| PluginsMenu | `web/src/components/Layout/PluginsMenu.tsx` | `Plugins` button of the top bar with a panel of tiles (palette-coloured icon, title, hint, open-marker) and a footer for Variablen / Einstellungen. Used by `TabList`. |
| NoteIcon | `web/src/components/Icons/NoteIcon.tsx` | Tide's note icon (rounded card, three lines), same props as lucide icons; used for notes in the sidebar, tabs, @ menu, inline search and island. |
| useTextCollector | `web/src/hooks/useTextCollector.ts` | Type anywhere (no input focused, no dialog): the first printable key opens the island's quick capture via `smartIslandState` with the text so far; only while an island is on screen (`[data-island-state]`), otherwise the key is left alone. |
| CalendarTagPills | `web/src/components/Calendar/CalendarTagPills.tsx` | Multi-select tag filter pills (OR) with `Ohne Tag` and a reset chip, bound to the store `calendarTagFilter`; used by `CalendarToolbar` (desktop) and `MobileCalendarTab`. |
| CalendarViewsMenu | `web/src/components/Calendar/CalendarViewsMenu.tsx` | `Ansichten` dropdown: saved views (tag filter + mode; click applies via `lib/applyView.ts`), inline rename, two-click delete, `Aktuellen Filter speichern` (name only) and `Todos zu diesen Tags` (copies the pruned calendar filter to `todoTagFilter` and opens the todo list via the optional `onOpenTodos`; desktop dispatches `tide:navigate` with `{ tab: 'todos' }`, mobile switches tab). Used by `CalendarToolbar` and `MobileCalendarTab`. |
| useCalendarScroll | `web/src/components/Calendar/useCalendarScroll.ts` | Popover state + dismissal, `calendar:scroll-to` / `editingEventId` navigation, day-view initial scroll, `tide_calendar_scroll_y` persistence, visible range, directional "Today" button |
| WeekView | `web/src/components/Calendar/WeekView.tsx` | Week grid |
| DayColumn | `web/src/components/Calendar/DayColumn.tsx` | Single-day column (pure reflector, no drag logic) |
| DayEventsSkeleton | `web/src/components/Calendar/DayEventsSkeleton.tsx` | Three pulsing grey bars (fixed positions, `--hover-bg`) shown by `DayColumn` while `eventsLoaded` is false and the day has no events. `eventsLoaded` is set by `fetchDirectory(root)` / `loadAllMetadata` after the first response or on error. |
| CalendarEventItem | `web/src/components/Calendar/CalendarEventItem.tsx` | Event pill rendering. **Z-index overlap**: `zIndex = 10 + startMinutes` so later-starting events render on top of earlier ones when they overlap. |
| useSlotCreateGesture | `web/src/hooks/useSlotCreateGesture.ts` (+ `Calendar/slotResolvers.ts`) | **Touch create gesture** for the desktop calendar views used on tablets: double tap (2 taps within 300 ms, within 30 px) or long press (450 ms, finger moves at most 10 px) on an empty spot opens the normal create flow (`onEventCreate`, same as the "+" button / drag). Only `pointerType === "touch"`; mouse and pen keep click and drag. Week/day: grid cells carry `data-slot-grid="yyyy-MM-dd"` (set in `DayColumn`, missing when `readOnly`); minute = touched y floored to 15 min, 60 min long (clamped at midnight). Month: `data-month-day` on cells, 9:00-10:00 like "+". Existing events, buttons and popovers are skipped (`[data-event-id]`, `.event-item`, `button`, `[data-slot-ignore]`, ...). The gesture only listens (capture, never `preventDefault` on pointer events, no `touch-action` change), so scroll, swipes and `useCalendarTouch` stay untouched; it aborts on movement over the slop, `scroll`, `pointercancel`, a second finger, and a touch within 120 ms after a scroll (momentum stop). Feedback: faint highlight band after 160 ms (`--t2-accent`, no animation under `prefers-reduced-motion`) and `navigator.vibrate(30)` when it fires. The click following a created slot is swallowed once (no day open in tablet month). Month grid sets `touch-action: manipulation` (no double-tap zoom). Tablet month: a quick double tap now creates; a slower second tap still opens the day view. Mobile phone grids already had their own gestures (`MobileWeekGrid` long press / tap, day list double tap). Tests: `hooks/__tests__/useSlotCreateGesture.test.ts`. |
| DragGhost | `web/src/components/Calendar/DragGhost.tsx` | Visual ghost for creation drag |
| EventDragGhost | `web/src/components/Calendar/EventDragGhost.tsx` | Visual ghost for event move drag |
| EventPopover | `web/src/components/Calendar/EventPopover.tsx` | Event detail popover |
| EventPreview | `web/src/components/Calendar/EventPreview.tsx` | Compact event preview |
| MagnifiedEventView | `web/src/components/Calendar/MagnifiedEventView.tsx` | Precise-mode time magnifier |
| EventDock | `web/src/components/Calendar/EventDock.tsx` | Bottom dock for event list |
| MiniCalendar | `web/src/components/Calendar/MiniCalendar.tsx` | Thumbnail month picker with wheel scroll and touch swipe navigation over month title and days grid, and `onMonthChange` callback |
| QuickEventSheet | `web/src/components/Calendar/QuickEventSheet.tsx` | GCal-style quick-add **and edit** bottom sheet. `editEvent` prop pre-fills all fields for "Bearbeiten" flow; `onSave` always called, caller decides create vs update. Date chip opens `InlineCalendar`; **GCal range UX**: first tap = anchor (`pickerFirstClick=true`, picker stays open), second tap forward = extend range (Ganztags+allDay auto-enabled), tap at/before current start = collapse back to single day. Window never auto-closes in start-picker mode. Time row: clock icon independently toggles drum picker per side (side-by-side if both open); pickers use `DT.glass`, close on outside tap. **Calendar picker** next to Ganztags: fetches enabled calendars from `GET /api/v1/integrations/gcal/calendars` on open; only shown when at least one calendar is available; color dot + truncated name; deselectable via "Kalender entfernen". Note-link button: `NotePicker` (folder-organized, `type=note/canvas` only, deselectable, no recents). "Mehr Optionen": freq chips, interval ±stepper, weekday chips, end-condition; "Bis zum" uses `InlineCalendar`. All tokens from `DT`. `onSave` receives `{title, start, end, color, allDay, recurrence_rule?, linkedNoteId?, calendarId?}`. |
| ScheduleModal | `web/src/components/Calendar/ScheduleModal.tsx` | Batch event builder (group/theme, multi-event, recurrence, import/export) — accessed via SmartIsland edit or direct open |
| CalendarImportModal | `web/src/components/Calendar/CalendarImportModal.tsx` | Modal dialog for importing Google Calendar / RFC 5545 `.ics` calendar files into Tide's encrypted storage. Supports drag & drop file upload, event parsing preview, category selection, batch encryption/upload with progress feedback, and Google Calendar export instructions. Associated utilities: `web/src/lib/icsParser.ts` (RFC 5545 parser) and `web/src/lib/calendarImporter.ts` (batch encryption and file upload). |

## Chat

| Component | File | Role |
|-----------|------|------|
| ChatPanel | `web/src/components/Chat/ChatPanel.tsx` | Main chat view (WebSocket-driven) |
| PartnerProfileHeader | `web/src/components/Chat/PartnerProfileHeader.tsx` | Contact header in chat |

## Social & Profile

| Component | File | Role |
|-----------|------|------|
| SocialHub | `web/src/components/Social/SocialHub.tsx` | Social hub / contacts, discover & requests management |
| SocialContactCard | `web/src/components/Social/SocialContactCard.tsx` | Contact card with status, actions, and menu |
| SocialSplitChat | `web/src/components/Social/SocialSplitChat.tsx` | Split chat container with contact list and chat panel |
| ProfilePage | `web/src/components/Profile/ProfilePage.tsx` | User profile view with public calendar integration, public document cards, and direct copy-to-vault actions |
| ProfileWeekCalendar | `web/src/components/Profile/ProfileWeekCalendar.tsx` | Interactive 7-day public calendar view with event adoption support |
| Avatar | `web/src/components/Profile/Avatar.tsx` | User avatar display |

## Sharing

| Component | File | Role |
|-----------|------|------|
| ShareModal | `web/src/components/ShareModal.tsx` | Share a note with another user |
| ShareManagementPanel | `web/src/components/ShareManagementPanel.tsx` | Manage existing shares |
| ShareManagementModal | `web/src/components/Modals/ShareManagementModal.tsx` | Modal wrapper for share mgmt |
| VisibilityBadge / visibilityState | `web/src/components/Visibility/VisibilityBadge.tsx`, `visibilityState.ts` | Small icon (lock = private, people count = shared, globe = public) derived by `getVisibilityState`; used in sidebar `FileItem`, `CalendarEventItem`, `TodoTreeItem`, `SaveStatusMenu` and `CalendarGroupsSection`. Inherits the text colour. Indicator spots pass `hideWhenPrivate`, so private (the default) shows nothing; only `SaveStatusMenu` always shows the state. |
| MentionMenuChrome / mentionGroups | `web/src/components/extensions/MentionMenuChrome.tsx`, `mentionGroups.ts` | Chrome of the `@` menu (filter chips Alle/Notizen/Termine/Personen/…, group headers) and the grouping logic. Contacts appear only for a non-empty query and are not offered in quicknotes. |
| islandSearch / islandEnter | `web/src/components/island/islandSearch.ts`, `islandEnter.ts` | Smart Island is search-first (notes, events, todos), create is secondary. Enter opens only on an explicit pick (arrows/click) or an exact case-insensitive title match, otherwise it creates; Ctrl+Enter always creates. | `buildIslandSearchItems` yields one result per thing from the real store data: a note only as note, an event only as event (recurrence instances collapse to the base id), a todo with an existing calendar entry (`linkedTaskId` found in `tasks`) only as todo, ids that are both event and note count as the event, non-note types (`event`, `index`, `views`, ...) are never notes. No row offers a target that does not exist.
| monthEventOrder | `web/src/components/Calendar/monthEventOrder.ts` | Month view ordering: todos first (no colour bar), then events early to late. |
| MentionShareToast | `web/src/components/Editor/MentionShareToast.tsx` | Hint next to a new @-contact chip: "Mit {Name} geteilt · Ansehen ▾ · Rückgängig", failed (retry) or blocked reason; mounted in `Editor.tsx` |
| ContactMentionChip / ContactProfileCard | `web/src/components/Editor/ContactMentionChip.tsx`, `ContactProfileCard.tsx` | Chip for `@contact` mentions (avatar + live name, grey "nicht geteilt" when `shareable === false`); click opens a card with "Profil öffnen" which dispatches `tide:open-profile` (handled in `useDashboardListeners`). Rendered by `MentionNodeView` for `type === 'contact'` |
| mentionShare (lib) | `web/src/lib/mentionShare.ts` | @-contact mention shares the note ("view", owner only), undo/revoke, chip-deletion revoke question; counts in `useMentionShareStore` (`localStorage` `tide_mention_shares`) |
| CalendarShareDialog / CalendarShareForm | `web/src/components/Settings/calendar/CalendarShareDialog.tsx`, `CalendarShareForm.tsx` | Dialog shell (re-reads the rules first, error + retry) and form. | "Kalender „X“ teilen": people with Ansehen/Bearbeiten, "@ Kontakt hinzufügen", "Neue Termine automatisch teilen", status/progress line with retry. Opened by the share button in `CalendarGroupsSection` (which shows a `VisibilityBadge` people count per shared group) |
| EventMentionField | `web/src/components/Calendar/EventMentionField.tsx` (logic: `lib/eventMentions.ts`, `lib/eventMentionShare.ts`) | Description textarea with `@` contact picker (combobox/listbox), "Mit" chip row, share hint via `MentionShareToast` (`onUndo`/`onRetry`/`zIndex` props). A pick shares the event with `view` (owner only, never when `private`). Mentions are stored inline in the description as `[@name](tide://contact/<id>)`; the textarea shows `@name`. Used in `EventPopover` and `MobileEventEditSheet` (not for drafts). Todo-list tasks (`/api/v1/todos`) are not files and cannot be shared |
| SharePeopleList / ShareOriginLabel / shareOrigins | `web/src/components/Share/SharePeopleList.tsx`, `ShareOriginLabel.tsx`, `shareOrigins.ts` | Person list of `ShareModal`: owner row first, per person an origin line (`Über @-Erwähnung` from `useMentionShareStore.origin`, `Aus Kalender „X“` from a calendar rule of a group the event belongs to), rights menu Ansehen/Bearbeiten, `Darf weiterteilen` under "Mehr" (maps to the `share` permission). Only the owner gets controls. Also used for the origin line in `ShareManagementPanel` |
| EventPrivateToggle | `web/src/components/Calendar/EventPrivateToggle.tsx` | Event lock "Privat halten" (`private` on the event) in `EventPopover`'s expanded section and in `MobileEditEventSheet` (via `onSetPrivate`); asks, then revokes group recipients' shares of that event. Own events only |
| VaultExportSection | `web/src/components/Settings/account/VaultExportSection.tsx` | Settings > Account card "Alle Daten exportieren": runs `exportVault` (`web/src/lib/vaultExport/`), shows progress and downloads the ZIP. The report separates "Inhalt fehlt" (loss), "Zusatzdetails fehlen" (partial) and notes without loss, counted per cause (`export.kind.*`, from `manifest.summary`). Counts PIN-locked files on mount (`countPinProtected`) and offers an opt-in toggle (off by default; when on, the export button needs a second click). Format: `web/docs/schemas/VAULT_EXPORT_FORMAT.md` |
| VaultImportRow | `web/src/components/Settings/account/VaultImportRow.tsx` | Import half of the export card: choose ZIP, summary, confirm, progress, report. Runs `importVault` (`web/src/lib/vaultExport/importVault.ts`); resumable via a localStorage journal. Old style sidecars are merged into their note, old canvas images get new keys, PIN-skipped notes are listed as not imported |
| calendarShare / calendarShareActions (lib) | `web/src/lib/calendarShare.ts`, `calendarShareActions.ts` | Pure planner (`planGroupShares`, `applyGroupShares`, `shareNewEvent`, rule parsing) and the network side (owner-only, `performMessengerShare`, sequential with progress). Auto-share runs from `handleEventCreate` / `handleEventSave` when an event enters a group. Rules stored by `useCalendarShareStore` as one encrypted `calendar_shares` file per user |

## Extensions (lazy-loaded modules)

| Component | File | Role |
|-----------|------|------|
| JobPlanner | `web/src/components/JobPlanner/JobPlanner.tsx` | Job & study planning module |

## Public API Docs (no login)

Public page `/docs/api` plus plain-Markdown edition `/docs/api.md` (Route Handler, `text/markdown`). Both are generated from ONE data tree in `web/src/lib/apiDocs/`; edit the content there, never in the components. `/docs/api` is allow-listed in `AuthGuard` (`PUBLIC_PATHS` logic); `/docs/api.md` is a route handler and bypasses it. Content must stay in sync with the Go handlers in `cloud/internal/api/` (`external.go`, `todos.go`, `api_tokens.go`); mark anything not provable from code as `unverified`.

| Component | File | Role |
|-----------|------|------|
| ApiDocsView | `web/src/components/Docs/ApiDocsView.tsx` | Page shell (server component): header with "Öffentlich, ohne Login erreichbar", "Link kopieren", Markdown link, TOC + sections. t2 tokens only. |
| DocSectionView | `web/src/components/Docs/DocBlocks.tsx` | Renders `DocBlock`s (paragraph, list, note, table, code with copy button, endpoint). Inline syntax: `` `code` `` and `**bold**`. |
| DocToc | `web/src/components/Docs/DocToc.tsx` | Sticky TOC (desktop) / chip bar (mobile), scroll-spy highlight |
| CopyButton | `web/src/components/Docs/CopyButton.tsx` | Clipboard button (`text` or `currentUrl`) with "Kopiert" feedback |
| apiDocs content | `web/src/lib/apiDocs/content*.ts`, `types.ts` | Structured doc data (`API_DOC`), base URL `https://hrw.rocks/api/v1` |
| toMarkdown | `web/src/lib/apiDocs/markdown.ts` | `ApiDoc` → Markdown (tested in `lib/__tests__/apiDocsMarkdown.test.ts`) |

## Settings

| Component | File | Role |
|-----------|------|------|
| SettingsModal | `web/src/components/Settings/SettingsModal.tsx` | Settings shell: sidebar groups (Persoenlich: Konto, Darstellung; Arbeitsbereich: Kalender, Notizen, Todos; Erweitert: Erweiterungen, Zugriff) plus separate bottom entry "Ueber Tide" (incl. Debug section). Mobile: list, then page with back. Pages in `Settings/pages/*`, building blocks in `Settings/ui/` (SettingsPage, SettingsSection, SettingsCard, SettingsRow, SettingsLinkRow, Toggle, Segmented, SelectField, ConfirmButton). Nav data and legacy tab mapping: `settingsPages.ts`. Texts: `lib/i18n/settings*.{de,en}.ts` (typed SettingsKey, `useT`). Extensions: `Settings/extensions/` (catalog + search filter, list, subpage shell, `configs/*`; disabling needs a confirm step). Access: `Settings/access/` (scope plain-text mapping, token hooks/form), links to public `/docs/api`. |
| OfflineStorageSection | `web/src/components/Settings/about/OfflineStorageSection.tsx` | Block "Speicher auf diesem Gerät" in "Über Tide": belegt/Quota (`navigator.storage.estimate`), Status "dauerhaft gesichert" (`persisted`), Zeitpunkt des letzten Offline-Stands, Knopf "Offline-Daten löschen" (2-Schritt, nur aktueller Nutzer). Logik in `lib/offline/store.ts`. |
| AccessPage | `web/src/components/Settings/pages/AccessPage.tsx` | PAT management (Zugriff): plain-language rights (technical scope names unchanged in requests), calm token list, one-time secret copy, two-step revoke, link to `/docs/api`. events:write is marked planned (server has no write endpoints); notes:read/write are implemented. |
| BackupHistory | `web/src/components/BackupHistory.tsx` | Backup/restore UI |
| PasskeySection | `web/src/components/Settings/account/PasskeySection.tsx` (+ `useMailCode.ts`) | Konto → "Passkeys": list (name, added, last used), add (name → mail code → PIN → passkey with PRF envelope), remove (confirm → mail code → key proof). Hints for missing WebAuthn, missing PRF, server without passkey config. |
| RecoverySection | `web/src/components/Settings/account/RecoverySection.tsx` | Konto → "Wiederherstellungsschlüssel": status (`GET /auth/recovery-vault?status=1`), set up / renew via mail code (fresh session, `apiFetch` `keepSessionOn401`) → PIN → new secret → key proof → `PUT /auth/recovery-vault`; shows the secret once. See `docs/crypto/VAULT_AND_PIN_SECURITY.md`. |

## Auth (sign-up, unlock, vault recovery)

| Component | File | Role |
|-----------|------|------|
| Auth page | `web/src/app/auth/page.tsx` | Steps identifier → code → pin / details → recovery-key, plus pin-recovery. Over 500 lines (pre-existing), flagged for splitting. |
| AuthInputs | `web/src/components/Auth/AuthInputs.tsx` | `SegmentedDigitInput` (OTP/PIN boxes) and `ActionButton`, moved unchanged from the auth page. |
| RecoverySecretCard | `web/src/components/Auth/RecoverySecretCard.tsx` | Shows a recovery secret with "An mich selbst mailen" (`mailto:` draft, Tide sends nothing), copy, download (.txt). Optional translated labels. Secret only in props/state. |
| RecoveryKeyStep | `web/src/components/Auth/RecoveryKeyStep.tsx` | Step after sign-up; continue needs a confirmation, skip needs a second click after a loss warning. Only shown when the server answers `recovery_saved: true`. |
| PasskeyLoginButton | `web/src/components/Auth/PasskeyLoginButton.tsx` | "Mit Passkey anmelden" on the identifier step (only with WebAuthn, detected via `useSyncExternalStore` so SSR stays stable). Assertion + PRF → `login/verify` → envelope → `completeLogin`; failures fall back to mail code + PIN. |
| PinRecovery / VaultReplacedNotice | `web/src/components/Auth/PinRecovery.tsx` | "PIN vergessen?": recovery secret + new PIN twice → `recoverWithSecret` (local verify, key proof, `replace-vault`) → normal unlock. Accounts without recovery vault get an explanation (no reset). Notice shows `vault_replaced_at` (≤ 30 days) on the unlock step. |
| Recovery lib | `web/src/lib/recovery/` | `recoverySecret` (160-bit Crockford-Base32, tolerant input), `recoveryVault` (envelope list `{v:1, envelopes:[{kind:'mail-secret',…}]}`, PBKDF2 200k), `recoveryFlow` (PIN re-wrap, recover, settings set-up), `keyProof` (RSA-OAEP challenge), `recoveryApi`, `recoveryMail`. Uses `crypto.ts` exports only. Vitest: `lib/recovery/__tests__/`. |
| Passkey lib | `web/src/lib/passkey/` | `webauthnJson` (base64url conversion, never forwards extension results), `passkeySupport` (feature detection, PRF input/result), `passkeyEnvelope` (HKDF → AES-GCM envelope with key + e-mail), `passkeyFlow` (register, sign in, open vault for recovery), `passkeyApi`. Vitest: `lib/passkey/__tests__/`. |

## Stores (Zustand)

| Store | File | State |
|-------|------|-------|
| useDataStore | `web/src/store/useDataStore.ts` | Notes, events, tasks, activeNoteId, crypto keys, lazy dir loading. GCal event metaData includes `gcal_calendar_id` (from `public_meta.gcal_calendar_id`) so the field is accessible on event objects for filtering. |
| useDragGhost | `web/src/store/useDragGhost.ts` | Calendar drag ghost position |
| useSocialStore | `web/src/store/useSocialStore.ts` | Contacts, messages |
| useLinkStore | `web/src/store/useLinkStore.ts` | Graph link cache |
| useReferenceStore | `web/src/store/useReferenceStore.ts` | Backlink reference tracking |
| useJobPlannerStore | `web/src/store/useJobPlannerStore.ts` | Job & Study planner module state |
| useIslandStore | `web/src/components/extensions/smart_island/useIslandStore.tsx` | Smart island state |

## Lib Utilities

| Module | File | Role |
|--------|------|------|
| tagFilter | `web/src/lib/tagFilter.ts` | Todo tag filter (`TagFilter`, `matchesTagFilter` OR semantics, `pruneTagFilter` drops deleted ids). State lives in ui slice `todoTagFilter`. |
| TodoTagFilterPanel | `web/src/components/Todo/TodoTagFilterPanel.tsx` | Multi-select tag filter + "Ohne Tag" in the todo filter popover. |
| TagPicker | `web/src/components/Tags/TagPicker.tsx` (+ `TagPickerPanel.tsx`) | Compact tag field: selected tags as removable chips (selection order) plus a `+ Tag` button opening a searchable `role=listbox` panel (portaled, fixed-positioned, flips upward near the viewport bottom so overflow-hidden ancestors cannot clip it). Rows toggle tags and keep the panel open; a `Neu anlegen »query«` row appears when `canCreateTag` (trimmed, double-submit guarded, returned id appended; input kept if creation returns nothing). Keyboard: arrows, Enter, Escape; outside mousedown closes. Props `tags`, `value`, `onChange`, `onCreate`, `compact` (spacing only). Helpers `filterTagsByQuery`/`canCreateTag` in `lib/tags.ts`. No "Ohne Tag" chip. |
| NoTagConfirm | `web/src/components/Tags/NoTagConfirm.tsx` | Inline row "Ohne Tag speichern?" with buttons "Ohne Tag speichern" (`onConfirm`) and "Tag wählen" (`onChoose`). |
| useTagCreate | `web/src/components/Tags/useTagCreate.tsx` | `useTagCreate()` returns a creator over `useTagRegistry(...).ensureTag` (reuses same normalized name, dedupes in-flight) backed by `TagCreateProvider`, mounted in `app/page.tsx` with `handleCreateEventGroup`. Pass the result as `TagPicker.onCreate`. |
| useTodoTags | `web/src/components/Todo/useTodoTags.ts` | Tag registry hook for todos (`tags`, `resolve`, `ensureTag` reuses by normalized name and dedupes in-flight creations). |
| designTokens | `web/src/lib/designTokens.ts` | Global visual constants — import `DT` for glass, chip, radius, blur, accent, cardBg, mutedText, primaryText. Always use this instead of inline values. |
| apiFetch / getApiBase | `web/src/lib/api.ts` | All HTTP calls to Go backend |
| crypto (v1) | `web/src/lib/crypto.ts` | AES-GCM + RSA E2E encryption |
| cryptoV2 | `web/src/lib/cryptoV2.ts` | Newer crypto primitives |
| idb | `web/src/lib/idb.ts` | IndexedDB wrapper (offline cache) |
| searchIndex | `web/src/lib/searchIndex.ts` | Client-side full-text search |
| shareLogic | `web/src/lib/shareLogic.ts` | Share key wrapping logic |
| calendarUtils | `web/src/lib/calendarUtils.ts` | Date/time helpers for calendar |
| icsParser | `web/src/lib/icsParser.ts` | RFC 5545 `.ics` calendar file parser for event import |
| calendarImporter | `web/src/lib/calendarImporter.ts` | Batch encryption and upload utility for imported calendar events |
| dateParser | `web/src/lib/dateParser.ts` | Natural language date parsing |
| timeParser | `web/src/lib/timeParser.ts` | Time string parsing |
| i18n | `web/src/lib/i18n.ts` | Localisation |
| diff | `web/src/lib/diff.ts` | 4-stage Myers diff + semantic cleanup + rich TipTap plain-text extraction |
| noteBackupCascade | `web/src/lib/noteBackupCascade.ts` | GFS rolling 6-tier snapshot cascade with deduplication |

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
| Passkeys | `cloud/internal/api/passkey.go`, `passkey_handlers.go`, `passkey_login.go` | GET /api/v1/auth/passkeys, POST /api/v1/auth/passkey/{register/options,register/finish,delete,login/options,login/verify} via go-webauthn. Store: `cloud/internal/store/sqlite_webauthn.go`. |
| Vault recovery | `cloud/internal/api/auth_recovery.go`, `auth_challenge.go`, `auth_notify.go` | GET/PUT /api/v1/auth/recovery-vault, POST /api/v1/auth/key-challenge, POST /api/v1/auth/replace-vault (fresh session ≤ 10 min + key proof, 24 h replace cooldown, notice mail). Store: `cloud/internal/store/sqlite_recovery.go`. |
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
| Extensions | `cloud/internal/api/extensions.go` | Extension toggle |
| Middleware | `cloud/internal/api/middleware.go` | Auth middleware (JWT) |

## Note Specification & Bundle Import/Export

| Module | File | Role |
|--------|------|------|
| NOTE_SPECIFICATION | `web/docs/NOTE_SPECIFICATION.md` | Complete specification of supported TipTap ProseMirror schema, blocks, marks, custom mention chips (`dateMention`, `calendarEventMention`, `taskMention`), math, and `.tide.json` bundle format. |
| bundleImportExport | `web/src/lib/bundleImportExport.ts` | Complete TIDE bundle import/export engine. Supports AST reference rewriting (`rewriteTipTapReferences`), ID remapping for inter-connected notes, folders, and calendar events, Markdown conversion (`tipTapToMarkdown`, `markdownToTipTap`), and V2 DEK encryption. |


## Todos – Desktop (Tide 2)

`<TodoList variant="desktop">` (used by `app/page.tsx`) renders the two-column view; the default variant (used by `MobileLayout`) keeps the inline-edit list unchanged.

| Component | File | Role |
|-----------|------|------|
| TodoDesktopView | `web/src/components/Todo/TodoDesktopView.tsx` | Layout: fixed 520px list column + detail pane, 40px gap/side padding. Groups Überfällig / Heute / Morgen / Demnächst / Ohne Datum, plus collapsible "Kürzlich erledigt" and Archiv. Owns `selectedId` / `expandedId`. Click rule: card with subtasks → first click expands all subtasks, second click selects into the detail pane; without subtasks → select immediately. No search field. |
| TodoCard | `web/src/components/Todo/TodoCard.tsx` | Card (grey tint `color-mix(#5C6E6C 8%, --t2-bg)`; today = `cal-praktikum` with white text; selected = faint ring only). Peek: up to 3 open subtasks + "+ n weitere"; ticking fades the row for 420ms, then toggles and the next one rotates in. Overdue: no red, grey clock icon + "Überfällig". With `onReschedule` + `onToggleReschedule` the overdue badge of an open todo is a button that opens `TodoRescheduleBar` below the title (`rescheduleOpen`). |
| TodoCardParts | `web/src/components/Todo/TodoCardParts.tsx` | `TodoPriorityIcon` (lucide ChevronUp/Minus/ChevronDown; high `#A9623F`, medium `#C0893A`, low `#7E9A83`) and `TodoCheckbox`. |
| TodoDetailPane | `web/src/components/Todo/TodoDetailPane.tsx` | Right pane: folder label, editable 28px title, rows Fällig / Priorität / Ordner / Notiz, "Untertodos · x von y" with checkable rows and "Untertodo hinzufügen". Plain-text description textarea (`todo-description`, saves on blur) for every todo. For a subtask: "Untertodo von «Eltern»" link back to the parent, due date bounded by the parent's (`max` + `clampSubtaskDate`), no sub-subtasks. Remount via `key={task.id}`. Overdue open todo: "Überfällig" next to the date and `TodoRescheduleBar` below the Fällig row (always visible, subtask options bounded by the parent date). |
| TodoRescheduleBar | `web/src/components/Todo/TodoRescheduleBar.tsx` (+ `reschedule.ts`) | **Quick reschedule for overdue open todos** (desktop; `isOverdueOpen`: date before today, not completed, not archived). Buttons Jetzt (today, current local time HH:mm) / Heute / Morgen / Übermorgen / Nächste Woche (coming Monday; from a Monday the next one) / Datum wählen… (native date picker via `showPicker`, `min` today) / Ohne Datum. Day options keep the todo's time of day (midnight counts as all-day), all values in the store's local formats (`yyyy-MM-dd` / `yyyy-MM-ddTHH:mm:ss`). Each choice = **one** `updateTask(id, { dueDate, scheduledDate })`; recurrence and other fields untouched. A linked calendar entry is then moved once by `useTaskCalendarSync` (or deleted for "Ohne Datum"); a repeating entry raises the existing series prompt once. Options later than a subtask's parent date are disabled (no clamping). In the list the "Überfällig" badge of `TodoCard` is a button (`aria-expanded`, Escape closes) that opens the bar under the title; `TodoDesktopView` keeps one open at a time. Mobile keeps its own badge menu (Auf heute / Morgen / date) in `MobileTodoView`. Tests: `Todo/__tests__/reschedule.test.ts` (dates per option, weekends, month/year/leap/DST, 4 time zones), `rescheduleUi.test.tsx` (visibility, one call per click), `rescheduleLinkedEvent.test.tsx` (linked entry: one todo write, at most one entry write, then quiet). |
| SubtaskRow | `web/src/components/Todo/SubtaskRow.tsx` | Subtask line in the detail pane: checkbox, title button (opens the subtask in the pane, `selectedId` may be a subtask; the left list then highlights the parent), delete X. |
| MobileTodoDetail | `web/src/components/Todo/MobileTodoDetail.tsx` | Mobile full-screen todo detail: editable title/date/priority/folder, description textarea (saves on blur, all todos incl. subtasks), subtask list (checkbox toggles, title calls `onOpenSubtask`). For a subtask (`parent` prop) the date input is capped at the parent's due date (`subtaskDateMax`/`clampSubtaskDate`), 'Untertodo von «…»' is shown and there is no add-subtask input. `MobileTodoView` owns navigation: back from a subtask returns to the parent detail. |

| todoHierarchy | `web/src/components/Todo/todoHierarchy.ts` | Placement rule for subtodos (tests: `Todo/__tests__/todoHierarchy.test.ts`). `groupRootsByDay` (sections Überfällig/Heute/Morgen/Demnächst/Ohne Datum, used by `TodoDesktopView`) and `filterTodoRoots` (status/tag/priority/date filter + search, used by `TodoList`) work on top-level todos only; subtodos stay under their parent whatever their own date, and go with a completed/archived/filtered-out parent (search looks into subtodos and shows the parent with them). `placeDayTodos` orders the all-day todo list of `DayColumn`: a subtodo directly under its parent (indent per level, sorted by `order`); with the parent not on that day it gets its own row without indentation and "↳ Eltern-Titel". Hierarchy comes from the todo's `parentId`; an entry's `parent_id` (usually a tag/group id) only counts when it names another entry of that day. |

Known gaps vs. the old inline editor in the desktop variant: description, tags, recurrence and "in Kalender anzeigen" are not editable in the detail pane yet; the date-filter strip is not shown.


## Offline-Spiegel (lib/offline)

`apiFetch` spiegelt erfolgreiche GET-Antworten (so wie der Server sie liefert, zusätzlich mit dem gerätelokalen Cache-Key aus `offlineCacheCrypto` versiegelt) in IndexedDB unter `api_cache_u:<userId>:<endpoint>`; Wert enthält Zeitstempel. Fällt der Abruf aus (Netzfehler oder 502/503/504), liefert `serveFromMirror` den Stand desselben Nutzers (Header `X-Tide-Offline`, `X-Tide-Cached-At`) und feuert `tide-offline` mit `{ cachedAt }`; `CloudStatusBanner` zeigt "Offline – Stand von ...". Nie gespiegelt: Mutationen, Auth-Endpunkte, URLs mit `token=`. Ohne Nutzer-ID wird weder gespiegelt noch ausgeliefert. `clearAllSessionData` löscht den Spiegel aller Nutzer. `CloudStatusBanner` fordert still `navigator.storage.persist()` an. Schreiben offline: unverändert die bestehende `syncQueue` (keine neue Warteschlange).

**Live-only (`offline: 'never'`):** Teilen, Entziehen, Share-Listen, Kontaktliste im Teilen-Dialog und die Regeldatei der Kalenderfreigaben (`createEncryptedSingletonStorage` mit `liveOnly`) rufen `apiFetch` mit `{ offline: 'never' }` auf: keine Spiegel-Antwort (auch nicht bei 502-504), keine Warteschlange mit erfundener 200-Antwort; bei Netzfehler wird der echte Fehler geworfen. Ein nicht gesendeter Revoke bleibt dadurch in `pendingRevoke` bzw. im Mention-Eintrag und wird beim nächsten Online-Lauf wiederholt.
