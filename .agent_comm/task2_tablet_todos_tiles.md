# Investigation Report: Tablet Mode, Todos Opening, Mobile Notes Tiles, and Color Persistence

**Date:** 2026-11-02  
**Scout:** Subagent (Investigation Target 2)  
**Status:** COMPLETED  

---

## 1. Where is "Tablet Mode" Implemented (PC / iPad)?

Tablet Mode is implemented through a combination of responsive detection, UI slice state, and conditional workspace rendering:

1. **Responsive / Hardware Detection:**
   - File: [`web/src/app/page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L147-L158)
   - Code snippet:
     ```tsx
     const [isTablet, setIsTablet] = useState(false);
     useEffect(() => {
         const checkTablet = () => {
             const w = window.innerWidth;
             const isTouch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
             const isPad = /iPad|Macintosh/i.test(navigator.userAgent) && isTouch;
             setIsTablet((w >= 768 && w <= 1180) || isPad);
         };
         checkTablet();
         window.addEventListener('resize', checkTablet);
         return () => window.removeEventListener('resize', checkTablet);
     }, []);
     ```
   - Also detected in Canvas layers: [`web/src/components/Canvas/CanvasLayer.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Canvas/CanvasLayer.tsx#L14-L25) and [`web/src/components/Canvas/PencilToolbox.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Canvas/PencilToolbox.tsx#L12-L25) via `detectIPadOrTablet()`.

2. **Zustand Store Navigation Mode:**
   - File: [`web/src/store/slices/createUiSlice.ts`](file:///C:/Users/nicoh/projects/tide/web/src/store/slices/createUiSlice.ts#L70-L73, #L95)
   - Stored in localStorage under `'tide_navigation_mode'` (`'sidebar'` vs `'folders'`).

3. **Settings Switch:**
   - File: [`web/src/components/Settings/tabs/AppearanceTab.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Settings/tabs/AppearanceTab.tsx#L60-L93)
   - Label: *"Tablet-Mode nutzen"* ("Zeigt Ordner und Notizen übersichtlich auf der Startseite im Tablet-Modus an (Standard auf dem iPad)").
   - Sets `navigationMode` to `'folders'`.

4. **Central Folder View in Tablet Mode:**
   - File: [`web/src/app/page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L3481-L3498)
   - When `activeTabId === 'folders' || ((isTablet || navigationMode === 'folders') && !activeNoteId && ...)`, it displays `<CentralFolderView>` instead of standard editor tabs.

5. **Sidebar Suppression in Tablet Mode:**
   - File: [`web/src/app/page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L217, #L3126-L3131)
   - `const shouldShowSidebar = isSidebarOpen && navigationMode !== 'folders';`
   - Sidebar is collapsed to `width: 0px`, `opacity-0`, `pointer-events-none`.
   - File: [`web/src/components/Layout/TabList.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/TabList.tsx#L162): Sidebar toggle button is hidden when `navigationMode === 'folders'`.

---

## 2. Why Can't Todos Be Opened / Clicked When Tablet Mode Is Active?

The root causes why Todos cannot be opened or interacted with in Tablet Mode are:

### Root Cause A: All Primary Entry Points Are Removed in Tablet Mode
1. **Sidebar Todo button is completely hidden:**
   - In Normal Mode, the desktop entry point for Todos is at the bottom of the sidebar: [`web/src/components/Layout/Sidebar.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/Sidebar.tsx#L371-L386):
     ```tsx
     {navigationMode !== 'folders' && (
         <div className="absolute bottom-4 left-4 z-[500] ...">
             {(!enabledExtensions || enabledExtensions.includes('todos')) && (
                 <button onClick={() => onToggleTodos ? onToggleTodos() : onOpenTodos?.()} title="Todos">
                     <ListTodo size={18} />
                 </button>
             )}
     ...
     ```
   - In Tablet Mode (`navigationMode === 'folders'`), `shouldShowSidebar` is `false` ([`page.tsx:217`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L217)), hiding the entire sidebar. Furthermore, line 371 in `Sidebar.tsx` specifically excludes the island and Todo button when `navigationMode === 'folders'`.

2. **Floating Smart Island in Folder Mode drops the Todo button:**
   - File: [`web/src/app/page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L3180-L3190)
   - When `navigationMode === 'folders'`, a floating `<SmartIsland>` is rendered, but **it omits the `<button title="Todos">`** that accompanied SmartIsland in the sidebar!

3. **CentralFolderView has NO Todos card or link:**
   - File: [`web/src/components/Workspaces/CentralFolderView.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Workspaces/CentralFolderView.tsx)
   - Displays only folders and notes (`sortedFolders` and `sortedNotes`). There is no entry point, icon, or card for Todos.

4. **TabList does NOT include Todos in default tabs:**
   - File: [`web/src/app/page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L170-L179, #L298-L311)
   - In folder mode, `openTabs` only ensures `calendar` and `folders` tabs are present. The Todos tab is missing unless opened via the nested Plugins dropdown.

### Root Cause B: Calendar Floating Tasks Card Has No Click Handlers
- File: [`web/src/app/page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L3261-L3347)
- The bottom-right floating "Unscheduled Tasks Panel" shows Todos when the calendar tab is active.
- However:
  1. The header (`<div className="flex items-center gap-2"><ListTodo ... /><span>Todos</span></div>` at line 3262) is a non-clickable `div`. It has no `onClick` to switch to `activeTabId = 'todos'`.
  2. Each task card (`line 3308`) only has handlers for checkbox toggle (`toggleTask`, line 3324) and delete (`deleteTask`, line 3341). Clicking anywhere on the task row does **nothing** (no handler to open the task details or open the Todo view).

### Root Cause C: Touch Event & Context Menu Interception on Touch Devices
- File: [`web/src/hooks/useTouchContextMenu.ts`](file:///C:/Users/nicoh/projects/tide/web/src/hooks/useTouchContextMenu.ts#L90-L98):
  - Mounted globally on `page.tsx:145`.
  - On touch start / timeout, it attaches a capture-phase `click` listener that calls `e.preventDefault(); e.stopPropagation();`.
- File: [`web/src/components/Todo/TodoTreeItem.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Todo/TodoTreeItem.tsx#L165-L210):
  - Touch event listeners track swipe offsets. If `justSwipedRef.current` is set by touch jitter (> 8px movement during tap), `handleClick()` returns early without opening or expanding the task.

---

## 3. Where is the Mobile Notes "Kacheln" (Grid) View Implemented?

The mobile notes grid view is implemented entirely within:
- File: [`web/src/components/Layout/MobileLayout.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/MobileLayout.tsx)

Key locations:
1. **View mode toggle state:**
   - Line 692: `const [notesViewMode, setNotesViewMode] = useState<'list' | 'grid'>('list');`
2. **Segmented Control buttons ("Liste" vs "Kacheln"):**
   - Lines 1824–1852: Toggle buttons switching between `'list'` and `'grid'`.
3. **Grid rendering sections:**
   - Search results grid: Lines 1866–1877 (`<div className="grid grid-cols-2 gap-2.5 p-1">`)
   - Shared notes grid: Lines 1955–1975
   - Recent notes grid: Lines 2020–2030
   - Folder contents grid: Lines 2053–2065
   - All notes grid: Lines 2096–2105
4. **Tile component implementations:**
   - `NoteCard`: Lines 372–464
   - `FolderCard`: Lines 476–649

---

## 4. What Styling Does Tablet Mode Use That Needs to Be Applied to Mobile "Kacheln" View?

Comparing [`web/src/components/Workspaces/CentralFolderView.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Workspaces/CentralFolderView.tsx) to [`web/src/components/Layout/MobileLayout.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/MobileLayout.tsx):

| Visual Element | Tablet Mode (`CentralFolderView.tsx`) | Current Mobile Notes Kacheln (`MobileLayout.tsx`) | Required Fix for Mobile Kacheln |
| :--- | :--- | :--- | :--- |
| **Tile Container** | Open, borderless macOS/iPadOS icon item: `group relative flex flex-col items-center cursor-pointer select-none p-2 rounded-2xl transition-all hover:bg-gray-100/50 dark:hover:bg-white/5` | Rigid box card with 1px border: `w-full flex flex-col items-center justify-center text-center p-3.5 rounded-2xl border`, `minHeight: 110`, solid white / dark background | Adopt borderless tile layout with rounded soft hover/touch feedback. |
| **Folder Icon** | Large SVG icon: `<Folder className="w-16 h-16" strokeWidth={1.4} />` with dynamic color fill: `style={{ color: colorDef.hex, fill: `${colorDef.hex}26` }}` | Tiny 24px icon inside a small square box: `w-11 h-11 rounded-xl bg-amber-500/12 text-amber-500` | Render prominent folder SVG with folder color fill/stroke from `FOLDER_PALETTE`. |
| **Folder Item Count** | Floating colored badge: `absolute bottom-1 right-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold text-white shadow-xs` with `backgroundColor: colorDef.hex` | Small text below folder title: `text-[10px] text-gray-400 mt-0.5` | Use pill badge overlaid on folder icon matching folder color. |
| **Note Icon** | Prominent document SVG: `<FileText className="w-14 h-16 text-slate-500 dark:text-slate-400 group-hover:text-blue-500" strokeWidth={1.25} fillOpacity={0.06} fill="currentColor" />` | Small 24px icon inside `w-11 h-11 bg-blue-500/12` box | Render large document SVG icon with subtle opacity fill. |
| **Typography** | `text-xs font-semibold text-center line-clamp-2 max-w-[100px] mt-2 text-gray-800 dark:text-gray-200` | `text-xs font-bold line-clamp-2 max-w-full leading-tight` | Center label beneath icon with `mt-2` and clamp. |

---

## 5. Why Are Note / Folder Colors Not Saved / Persisted Currently?

Tracing the full flow from frontend store to backend API and database reveals 3 separate breakages:

### Breakage 1: HTTP 405 Method Not Allowed on API Call
- In [`web/src/app/page.tsx:1109-1115`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L1109-L1115):
  ```tsx
  const handleUpdateFolderColor = async (folderId: string, color: string) => {
      try {
          useDataStore.getState().updateFile(folderId, { color });
          await apiFetch(`/api/v1/files/${folderId}`, {
              method: 'PATCH',
              body: JSON.stringify({ metadata: { color } })
          });
          useDataStore.getState().updateSpecificMetadataCache(folderId, { color });
      } catch (err) {
          console.error('Failed to update folder color', err);
      }
  };
  ```
- In [`cloud/internal/api/files.go:54`](file:///C:/Users/nicoh/projects/tide/cloud/internal/api/files.go#L54):
  ```go
  r.Get("/{fileID}", h.GetFileMetadata)
  r.Put("/{fileID}", h.UpdateFile)
  r.Delete("/{fileID}", h.DeleteFile)
  ```
  The Go Chi router registers **only `PUT /{fileID}`**, NOT `PATCH /{fileID}`!
  Any call using `method: 'PATCH'` immediately fails with **HTTP 405 Method Not Allowed**.

### Breakage 2: Crypto / Metadata Desynchronization on Decrypt & Reload
- Folders are created in [`page.tsx:1126-1135`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L1126-L1135) with encrypted `secured_meta`:
  ```tsx
  const meta = { title: name, parent_id: parentId, color: folderColor };
  const securedMeta = await cryptoLib.encryptMetadata(meta, publicKey);
  ```
  Folders default to `version: 1`.
- When fetching files on startup or refresh, [`web/src/store/slices/fsHelpers.ts:360-385`](file:///C:/Users/nicoh/projects/tide/web/src/store/slices/fsHelpers.ts#L360-L385) runs:
  ```tsx
  } else if ((file.version ?? 0) >= 2 && file.metadata) {
      ...
  } else if (file.secured_meta && privateKey) {
      const meta = await cryptoLib.decryptMetadata(file.secured_meta, privateKey, `${cachePrefix}-${file.id}`);
      if (!meta.isLocked) {
          metaData = { ...meta, title: meta.title || 'Untitled', isLocked: false };
      ...
  ```
- Because folders are version 1, `fsHelpers.ts` **only decrypts `secured_meta`** and completely ignores `file.metadata`!
- Since `handleUpdateFolderColor` only tried to send `{ metadata: { color } }` without re-encrypting `secured_meta`, even if the API call succeeded, on reload `fsHelpers.ts` reads the old color from `secured_meta`.

### Breakage 3: Notes Completely Lack Color Selection and Persistence
- While folders have `handleUpdateFolderColor` and `FOLDER_PALETTE`, **Notes do not have any color picker or update handler** in `CentralFolderView` or `MobileLayout`.
- `NoteCard` and `CentralFolderView` have hardcoded colors (`#3b82f6` / `text-slate-500`).
- There is no flow connecting note items to `updateFile` with encrypted `color` in `secured_meta`.

---

## 6. Actionable Fix Recommendations for the Chief Architect

1. **Fix Tablet Mode Todos Accessibility:**
   - In [`web/src/app/page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L3181), add the `<button onClick={handleToggleTodos}>` with `<ListTodo />` to the floating folder-mode Smart Island container (matching line 375 of `Sidebar.tsx`).
   - In [`web/src/app/page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L3262), add `onClick={handleToggleTodos}` and `cursor-pointer` to the header of the Unscheduled Tasks panel.
   - In [`web/src/components/Workspaces/CentralFolderView.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Workspaces/CentralFolderView.tsx), add a Todos tile/shortcut or action in the header to open Todos.
   - In [`web/src/app/page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L298-L311), ensure `openTabs` retains the `todos` tab if previously opened.

2. **Replicate Tablet Styling in Mobile Notes "Kacheln" View:**
   - In [`web/src/components/Layout/MobileLayout.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/MobileLayout.tsx#L372-L649):
     - Refactor `FolderCard` to import `getFolderColor` from `@/lib/folderColors`.
     - Replace the `w-11 h-11 bg-amber-500/12` box with a large `Folder` SVG (`w-16 h-16`) styled with `color: colorDef.hex, fill: `${colorDef.hex}26``.
     - Add the count pill badge on the bottom-right of the folder icon.
     - Refactor `NoteCard` to render the large `FileText` SVG (`w-14 h-16`) with fill opacity `0.06`.
     - Strip the hard rectangular border and white card box in favor of clean icon-grid tiles with soft active scale and hover/touch highlights.

3. **Fix Color Persistence Flow:**
   - In [`cloud/internal/api/files.go`](file:///C:/Users/nicoh/projects/tide/cloud/internal/api/files.go#L54), add `r.Patch("/{fileID}", h.UpdateFile)` or update [`page.tsx:1112`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L1112) to use `PUT`.
   - In [`web/src/app/page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L1109-L1120), when updating folder/note color:
     - Encrypt the updated metadata (including `color`) into `secured_meta` using `publicKey`.
     - Pass both `metadata: { color }` and `secured_meta` in the `PUT` payload.
     - Update `useDataStore.getState().updateFile(id, { color })`.
   - In [`web/src/store/slices/fsHelpers.ts`](file:///C:/Users/nicoh/projects/tide/web/src/store/slices/fsHelpers.ts#L360-L385), ensure `file.metadata?.color` is used as a fallback if `secured_meta` did not include a color.
