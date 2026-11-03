# Scout 4 Investigation Report: Tasks 5 & 6 (Smart Island Regression & Tablet Mode)

## 1. Task 5: Smart Island Design & Animation Regression

### 1.1 Relevant Files
- `web/src/components/Layout/MobileSmartIsland.tsx`: The 80x80px square widget rendered on mobile in `MobileLayout.tsx`.
- `web/src/components/Layout/MobileHeaderWidgets.tsx`: Exports `NextEventCountdown` which wraps `MobileSmartIsland`.
- `web/src/components/Layout/MobileLayout.tsx`: Line 1587 renders `<NextEventCountdown events={expandedEvents} onTap={handleCountdownTap} className="-mt-1.5" />`.
- `web/src/components/extensions/smart_island/SmartIsland.tsx`: The full liquidGlass island (desktop sidebar, modal, or compact horizontal pill).
- `web/src/components/extensions/smart_island/useIslandStore.ts`: Zustand store for island messages, notifications, daily summaries.

### 1.2 Git History & The "Old Design"
- **Commit `46297c0a` & `798742f1` (Oct 29, 2026):** Originally created in `MobileHeaderWidgets.tsx`:
  ```tsx
  <span className="text-xs font-bold text-white truncate max-w-full leading-tight">
    {target.event.title || 'Termin'}
  </span>
  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider leading-none">
    {target.isActive ? 'NOCH' : 'STARTET IN'}
  </span>
  <span className="text-2xl sm:text-[26px] font-black tracking-tight tabular-nums text-white leading-none">
    {formattedHoursMins}
  </span>
  ```
- **Commit `2a402206` ("mobile v3"):** Extracted into `MobileSmartIsland.tsx`. Clean 3-tier vertical structure:
  1. Top: Title (`text-xs font-bold text-white`)
  2. Middle: Label (`text-[10px] font-semibold text-gray-400 uppercase tracking-wider`)
  3. Bottom: Number (`text-2xl sm:text-[26px] font-black tracking-tight tabular-nums text-white`)
- **Commit `c8b542ff` ("style(web): harmonize black accent with mobile calendar and format island countdown"):**
  - Harmonized background to `bg-[#18181b]/95 dark:bg-[#09090b]/95 backdrop-blur-xl border border-white/15 rounded-2xl`.
  - Added minute format when `< 1h` (`${diffMin} Min` vs `${h}:${pad(m)}h`).

### 1.3 What Caused the Regression (Commit `34f4bbe7`)
In commit `34f4bbe7`, the clean 3-line layout was replaced with an overcrowded, low-contrast design inside the 80x80 container:
- Replaced the large bold number (`text-2xl`) with tiny badges (`text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300`).
- Added a 1px progress bar (`h-1 bg-white/10`) with green gradient.
- Added monospace time intervals (`text-[9px] text-white/60 font-mono`).
- Replaced the simple "Frei" empty state with calendar icons, dates, badges ("Keine Termine Heute frei"), and tomorrow's event text in `text-[8px]`.
- Result: Visually cramped, low readability, cluttered colors (emerald, indigo, teal, white/60).

### 1.4 Why Border Radii Get Pointy/Stretched and Lag During Expansion
In `MobileSmartIsland.tsx:360-375`:
1. **Framer Motion Layout Scale Distortion:**
   `<motion.div layout ... className="... rounded-2xl ...">`
   When `isExpanded` changes from false (80px wide) to true (~380px wide), Framer Motion performs `layout` animation using CSS transforms: `scaleX(~4.75)` and `scaleY(1.0)`.
   Because `rounded-2xl` (16px) is a static CSS class, the non-uniform scale transform stretches the horizontal border radius ellipse into a deformed, pointy corner.
   **Fix:**
   - In Framer Motion, pass `borderRadius: 16` directly in the `style` prop of `motion.div` so Framer Motion can counter-project the radius, OR
   - Animate `width` / `maxWidth` directly instead of relying on transform layout projection, OR
   - Render the expanded banner as a separate overlay portal/fixed component via `<AnimatePresence>` rather than morphing the 80x80 inline container.
2. **Position Jumping:**
   Switching between `position: absolute` (unexpanded) and `position: fixed` (expanded) breaks Framer Motion's layout projection coordinates, causing jumps.
3. **GPU Lag / Stutter:**
   `backdrop-blur-xl` dynamically scaling over hundreds of pixels triggers expensive WebKit backdrop texture re-generation every frame. Combining this with high spring stiffness (`stiffness: 350-420, damping: 26-28`) causes severe mobile stutter.

---

## 2. Task 6: Smart Island Tablet Mode Positioning

### 2.1 Tablet Mode Detection
- State: `navigationMode === 'folders'` in `useDataStore` (from `createUiSlice.ts:69-82`).
- Auto-detected on iPad and touch screens between 768px and 1180px:
  `const isTouch = navigator.maxTouchPoints > 0; const isPad = /iPad|Macintosh/i.test(navigator.userAgent) && isTouch;`
- Manually toggled in `AppearanceTab.tsx:62-95`:
  `Tablet-Mode nutzen` -> toggles `navigationMode` between `'sidebar'` and `'folders'`.
- In `page.tsx`:
  When `navigationMode === 'folders'`, `shouldShowSidebar` is `false` (sidebar is hidden).

### 2.2 Where Smart Island Currently Sits (Faulty)
- In commit `34f4bbe7`, `<MobileSmartIsland events={events} onEventClick={onEventClick} />` was added in `CentralFolderView.tsx:289-295` in the subheader between the breadcrumb navigation and the action buttons.
- Flaws:
  - It only appears when on the folders overview screen, disappearing when the user opens notes, calendar, todos, or other tabs.
  - It clutters the breadcrumb row.

### 2.3 Required Positioning ("oben links in die Navigationsleiste linksbündig an den rand, rechts von den offenen Tabs")
- Target component: `web/src/components/Layout/TabList.tsx` (the top navigation bar).
- Currently in `TabList.tsx`:
  - Zone 1 (left): Only renders the sidebar toggle if `navigationMode !== 'folders'`. When `navigationMode === 'folders'`, Zone 1 is empty (`flex-1`).
  - Zone 2 (center): Renders `tabs` horizontally centered via `mx-auto`.
  - Zone 3 (right): Renders `pluginSlot`, plugins menu, and user avatar.
- Target layout in Tablet Mode (`navigationMode === 'folders'`):
  1. Remove `MobileSmartIsland` from `CentralFolderView.tsx`.
  2. In `TabList.tsx`:
     - When `navigationMode === 'folders'`:
       Align tabs to the left margin (`justify-start` instead of `mx-auto` centering).
     - Directly to the right of the open tabs (and '+' button): Render the Smart Island.
     - Component to render: `SmartIsland` in `compact={true}` mode (already has built-in `"Active or upcoming event for compact pill in Good-Notes / Tablet mode"` support in `SmartIsland.tsx:926-1115` with pill layout, event title, countdown, and event tap handling).
