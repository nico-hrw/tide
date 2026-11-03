# Task 2 Investigation: Note Versioning / History UI

## 1. Current State & Where History/Versioning Lives
- **Legacy Popup Modal:** `web/src/components/BackupHistory.tsx`
  - Previously mounted as a fixed-overlay centered modal in `web/src/components/Layout/DashboardModals.tsx` when `showBackups && activeNoteId`.
  - In commit `3ace16e`, the popup was disconnected from `DashboardModals.tsx` in favor of an in-note versioning flow.
- **In-Note Timeline Component:** `web/src/components/Editor/NoteVersionTimeline.tsx`
  - Introduced in commit `c2e0466`.
  - Currently mounted on the right side of the editor in `web/src/components/Workspaces/CanvasWorkspace.tsx` (lines 671–680).
- **In-Note Diff View Component:** `web/src/components/Editor/NoteVersionDiffView.tsx`
  - Introduced in commit `c2e0466`.
  - Replaces the active editor with a visual diff comparison when `isHistoryMode` is active in `CanvasWorkspace.tsx` (lines 537–546).
- **Backend / Decryption Hook:** `web/src/hooks/useNoteBackups.ts`
  - Fetches slot metadata via `GET /api/v1/files/:fileId/backups`.
  - Fetches individual encrypted backups via `GET /api/v1/files/:fileId/backups/:slotName`.
  - Handles decryption for both V1 (RSA encrypted metadata) and V2 (wrapped DEK with unwrapDEKData + AES-GCM).
  - Handles delta patches by fetching base 1-week backup and applying `applyLinePatch`.
  - Computes word-level diffs via `diffWords(backupPlainText, currentPlainText)`.
- **Root State & Restore Handler:** `web/src/app/page.tsx`
  - State: `showBackups` (boolean, line 200).
  - Handler: `handleRestoreBackup` (lines 2944–2963). Sets `editorContent`, triggers `editor:restore-content` CustomEvent, saves via `performSave`, and updates tabs.

---

## 2. How Versioning Works (Storage, Loading, Decryption, Preview & Restore)
1. **Slots on the Server:**
   - Fixed slots: `"10 minutes"`, `"30 minutes"`, `"1 hour"`, `"1 day"`, `"2 days"`, `"1 week"`.
   - Plus the current live document as index 0 (`"Jetzt"`).
2. **Decryption Flow:**
   - Server returns AES-GCM encrypted blobs and wrapped access keys.
   - Client decrypts with user's private key (`privateKey`) and user ID (`myId`).
   - If slot is a delta patch (JSON array of `LinePatchOp`), `useNoteBackups` reconstructs the full JSON string against the 1-week base backup.
3. **Diff & Preview:**
   - `useNoteBackups` converts TipTap JSON to plain text (`getPlainTextFromJSON`) and computes additions/removals with `diffWords`.
   - When historical index is active, `NoteVersionDiffView` displays colored diffs (green = added since, red = deleted since).
4. **Restoration:**
   - `handleRestoreBackup(content)` in `page.tsx` overwrites `editorContent`, saves to the server, and exits history mode.

---

## 3. Discrepancies Against User Requirements & Proposed Refinements

### User Requirement:
1. Replace popup with an in-note timeline.
2. Right next to the note text (on the right side), a vertical bar going from top to bottom with dots representing saved states.
3. Clicking/tapping a dot loads/previews that version.
4. "Abbrechen" (Cancel) and "Übernehmen" (Apply) buttons to cancel or confirm/revert to that state.
5. Clean layout embedding alongside the note text.

### Current Implementation Gaps:
1. **Buttons Placement & Naming:**
   - Currently in `CanvasWorkspace.tsx` (lines 373–410), the buttons are located in the note title bar next to the title input, rather than anchored with the timeline or in a dedicated version control toolbar.
   - The confirmation button is currently labeled **"Speichern"** instead of **"Übernehmen"**.
   - Proposed Fix:
     - Place "Abbrechen" and "Übernehmen" buttons clearly visible in the vertical timeline bar (or a sticky top/bottom anchor bar of the timeline sidebar), and rename "Speichern" -> "Übernehmen".
2. **Visual Design of Timeline Bar:**
   - `NoteVersionTimeline.tsx` currently renders an enclosed card (`w-48 sm:w-56 bg-gray-50/80 rounded-2xl border`).
   - For a cleaner vertical bar look right next to the text:
     - Render a sleek vertical line/rail from top to bottom with dots.
     - Dots can show tooltips or compact pill labels with timestamp on hover/active.
     - Sticky alongside the editor so it remains accessible during scrolling.
3. **Editor Preview Integration:**
   - Currently in `CanvasWorkspace.tsx`:
     - When `isHistoryMode` is active, it completely hides `<Editor>` and shows `<NoteVersionDiffView>`.
     - Clicking a dot switches `activeIndex` which immediately updates `NoteVersionDiffView`.
     - Clicking "Übernehmen" restores `selectedContent` via `onRestoreBackup(selectedContent)`.
     - Clicking "Abbrechen" sets `isHistoryMode = false` and resets `activeIndex = 0`.
