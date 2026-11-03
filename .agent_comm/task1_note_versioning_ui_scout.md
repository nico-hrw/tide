# Scout Investigation Report: Task 1 - Note Versioning Interface Fixes

## 1. Components Examined
- **`web/src/components/Workspaces/CanvasWorkspace.tsx`**
  - Note header / title row: lines 335–420
  - History mode state & handlers: lines 109–172
  - History diff view rendering: lines 543–552
  - Timeline component mounting: lines 677–688
- **`web/src/components/Editor/NoteVersionTimeline.tsx`**
  - Timeline component layout, header, buttons, track, dots, labels: lines 1–237
- **`web/src/components/Editor/NoteVersionDiffView.tsx`**
  - Visual diff rendering alongside live/historical versions: lines 1–151
- **`web/src/hooks/useNoteBackups.ts`**
  - Backup slot definitions (`"10 minutes"`, `"30 minutes"`, etc.), decryption, and `NoteBackupPoint` structure.

*(Note: `web/src/components/Editor/EditorHeader.tsx` does not exist; the editor header with title input and action buttons is directly in `CanvasWorkspace.tsx`).*

---

## 2. Root Cause: Why Two Menus Open Over Each Other With Duplicate Buttons
When the user clicks the Clock button (`CanvasWorkspace.tsx`, line 384):
1. **Title Bar Menu (Duplicate 1):** In `CanvasWorkspace.tsx` (lines 398–417), `isHistoryMode` triggers the conditional rendering of:
   ```tsx
   <button onClick={handleCancelHistory}>
       <X size={14} /><span>Abbrechen</span>
   </button>
   <button onClick={handleApplyHistory}>
       <Check size={14} /><span>Übernehmen</span>
   </button>
   ```
2. **Timeline Header Menu (Duplicate 2):** At the same time, `NoteVersionTimeline.tsx` (lines 109–150) renders its own header card with a "Versionsverlauf" badge and a second set of buttons:
   ```tsx
   <button onClick={onCancel}>
       <X className="w-3.5 h-3.5" /><span>Abbrechen</span>
   </button>
   <button onClick={onApply}>
       <Check className="w-3.5 h-3.5" /><span>Übernehmen</span>
   </button>
   ```
3. **Collision / Stacking:** In `CanvasWorkspace.tsx` (line 678), `NoteVersionTimeline` is placed inside the note flex row with `shrink-0 pl-3 sm:pl-6 sticky top-12 z-10 self-start`. This places the timeline header directly adjacent to and overlapping the note title bar buttons, creating two stacked menus with identical "Abbrechen" and "Übernehmen" actions.
4. **Modal Check:** `BackupHistory.tsx` modal in `DashboardModals.tsx` was already unmounted in commit `3ace16e` and does not render.

---

## 3. The "Wall" / Borders / Card Background to Remove
1. **In `web/src/components/Editor/NoteVersionTimeline.tsx`:**
   - **Line 104 (`border-l`):** `border-l border-gray-200/80 dark:border-white/10` forms a visible vertical divider ("Wand") separating the timeline from the note content.
   - **Lines 109 & 125:** `border-b border-gray-100 dark:border-white/5` dividers under the header and buttons.
   - **Line 117:** Pill background `bg-gray-100 dark:bg-white/10`.
   - **Lines 187–191:** Point card backgrounds `bg-indigo-50/80 dark:bg-indigo-950/30` and `hover:bg-gray-100/60 dark:hover:bg-white/[0.04]`.
   - **Lines 196–200:** Fancy highlight rings `ring-4 ring-indigo-500/25 scale-110 shadow-sm border-2 border-indigo-600`.
   - **Lines 130 & 142:** Button wrapper backgrounds and borders.
2. **In `web/src/components/Workspaces/CanvasWorkspace.tsx`:**
   - **Lines 202–206:** The layout unnaturally widened the note container when `isHistoryMode` was active (`max-w-4xl` -> `max-w-5xl`) to accommodate the embedded sidebar inside the text flow.
   - **Line 678:** Embedding the timeline inside `<div className="w-full mx-auto flex flex-row items-start ...">` with `pl-3 sm:pl-6 sticky top-12` cut into the note canvas space instead of sitting along the viewport's right margin.

---

## 4. Proposed Layout Redesign (Implementation Spec for Coder)

### A. Placement & Height (`CanvasWorkspace.tsx`)
- Remove `<NoteVersionTimeline>` from inside the centered note flex row (lines 677–688).
- Remove the layout width change at lines 202–206 so the note width remains consistent (`max-w-4xl` etc.) and add right padding (`pr-36` or `pr-44`) only on full-width/narrow layouts during `isHistoryMode` to avoid diff text colliding with the rail.
- Mount `<NoteVersionTimeline>` as a fixed right rail inside `CanvasWorkspace.tsx` (above or as a sibling to the scroll container):
  ```tsx
  {isHistoryMode && (
      <aside className="fixed right-3 sm:right-6 top-14 bottom-4 z-30 pointer-events-auto select-none">
          <NoteVersionTimeline
              points={points}
              activeIndex={activeIndex}
              onSelectIndex={setActiveIndex}
              isLoading={isBackupLoading}
              onCancel={handleCancelHistory}
              onApply={handleApplyHistory}
          />
      </aside>
  )}
  ```
  This makes the timeline span from the very top (`top-14`, below the tab bar) to the very bottom (`bottom-4`) along the right edge, staying fully accessible regardless of note scroll.

### B. Single Clean Action Buttons (Deduplication)
- **In `CanvasWorkspace.tsx` (lines 398–417):** Remove the duplicate `<button>` elements for "Abbrechen" and "Übernehmen". The `<Clock>` icon remains as the toggle and active indicator.
- **In `NoteVersionTimeline.tsx`:** Provide a single, clean, minimal action bar at the top of the right rail:
  - Clean "Abbrechen" button (subtle neutral hover).
  - Clean "Übernehmen" button (subtle emerald/solid button).
  - No duplicate top bars or floating boxes.

### C. Minimal Vertical Rail & Layout (`NoteVersionTimeline.tsx`)
- **Transparent / Directly on Page Background:**
  Remove `border-l`, card backgrounds, and padding dividers. The timeline renders directly on the page background (`bg-transparent`).
- **Continuous Vertical Line on Far Right:**
  ```tsx
  <div className="w-px bg-gray-200 dark:bg-white/10 absolute right-[7px] top-2 bottom-2 pointer-events-none" />
  ```
- **Descriptions to the LEFT of the Dots:**
  Each save state row is formatted right-to-left:
  ```tsx
  <div
      key={point.id || index}
      onClick={() => onSelectIndex(index)}
      className="flex items-center justify-end gap-3 text-right group cursor-pointer py-1.5"
  >
      <div className="flex flex-col items-end text-right min-w-0">
          <span className={`text-xs leading-tight transition-colors ${
              isActive
                  ? 'font-semibold text-gray-900 dark:text-gray-100'
                  : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-200'
          }`}>
              {point.label || (index === 0 ? "Jetzt" : `Version ${points.length - index}`)}
          </span>
          {formattedTime && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">
                  {formattedTime}
              </span>
          )}
      </div>
      {/* Interactive Dot on the Rail */}
      <div className="relative flex items-center justify-center w-4 h-4 shrink-0">
          <div className={`rounded-full transition-all duration-150 ${
              isActive
                  ? 'w-2.5 h-2.5 bg-gray-900 dark:bg-white ring-2 ring-gray-900/10 dark:ring-white/20'
                  : 'w-1.5 h-1.5 bg-gray-300 dark:bg-zinc-600 group-hover:bg-gray-500 group-hover:scale-125'
          }`} />
      </div>
  </div>
  ```
- **No Fancy Highlight:**
  - Removed: `ring-4 ring-indigo-500/25`, `scale-110`, `shadow-2xs`, colored background cards.
  - Minimal clean dots and high-contrast typography directly on the background.
