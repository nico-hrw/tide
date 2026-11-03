# Task 2 Investigation Report: Archiv / Safes System & Cross-Safe @-Linking

## 1. Context & User Requirements Summary
The user requested:
- **Archiv & Safes ("Saves"):** Ability to hide/archive notes that aren't currently being worked on.
- **Fast Safe Loading:** Users can save/load named Safes (vaults/workspaces like "Standard", "Archiv", "Arbeit", "Privat", "Projekt X") to instantly filter and restore active work contexts without page reloads or new logins.
- **Multi-Safe Loading:** Ability to combine/load notes from multiple Safes at once or focus on a single Safe.
- **Cross-Safe @-Linking:** Link notes across different Safes using `@nameSafe:noteTitle` (e.g. `@Archiv:ProjektPlan` or `@Arbeit:MeetingNote`).
- **Git Push:** Push changes to GitHub (`main`).

---

## 2. Store & Data Structure (`web/src/store/`)
### Existing Structure:
- `notes: DataItem[]` in [`createNotesSlice.ts`](file:///C:/Users/nicoh/projects/tide/web/src/store/slices/createNotesSlice.ts) and [`types.ts`](file:///C:/Users/nicoh/projects/tide/web/src/store/slices/types.ts).
- `DataItem` supports arbitrary attributes, and backend supports arbitrary JSON in `metadata` on `/api/v1/files/:id` (`PUT` accepts `{ metadata: updatedMeta }`).
- Currently, notes have `id`, `title`, `parent_id`, `type`, `metadata`.

### Proposed Safes Slice (`createSafesSlice.ts`):
Add a dedicated Zustand slice composed into [`useDataStore.ts`](file:///C:/Users/nicoh/projects/tide/web/src/store/useDataStore.ts):
```ts
export interface SafesSlice {
    safes: string[]; // List of available safes, e.g. ['Standard', 'Archiv', 'Arbeit', 'Privat']
    activeSafes: string[]; // Currently loaded/visible safes, e.g. ['Standard'] or ['Standard', 'Archiv']
    
    setActiveSafes: (safes: string[]) => void;
    toggleActiveSafe: (safe: string) => void;
    createSafe: (name: string) => void;
    deleteSafe: (name: string) => void;
    setNoteSafe: (noteId: string, safeName: string) => Promise<void>;
}
```
- **Storage:** Persisted locally via `localStorage.getItem('tide_safes')` and `'tide_active_safes'`. Default safes: `['Standard', 'Archiv']`.
- **Note Safe Assignment:** Each note has `metadata.safe` (and top-level property `safe?: string` on `DataItem`). Default is `'Standard'` when unspecified.
- **Instant Switching (0ms):** Because all notes are already decrypted with user DEKs in memory/cache, switching or combining Safes simply re-filters the displayed list in React—no logout, no key re-derivation, completely seamless!

---

## 3. UI Placement & Note Filtering
### A. Archiv / Safe Switcher in Sidebar:
- **Location:** In [`SidebarQuickNotes.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/sidebar/SidebarQuickNotes.tsx) (above the "Notes" label and quick action buttons) or [`Sidebar.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/Sidebar.tsx).
- **Design:** Compact, clean dropdown/pill button showing:
  - Shield / Archive icon (from `lucide-react`)
  - Current Safe Name (e.g. `🛡️ Standard`, `🗄️ Archiv`, or `💼 Arbeit (2 Safes)`)
- **Dropdown Menu:**
  - Fast 1-click switch between Safes.
  - Checkbox toggle for "Zusammen laden" (multi-safe view).
  - Quick option: "+ Neuer Safe erstellen".
  - "Alle Notizen anzeigen" option.
  - Count of notes in each Safe.

### B. Note Filtering in Sidebar & Central Folder View:
- In [`page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L365-L368):
  `sidebarFiles` filters items based on `activeSafes`:
  ```ts
  const sidebarFiles = useMemo(() => {
      if (!files) return [];
      const isAll = activeSafes.includes('all') || activeSafes.length === 0;
      return files.filter((f: any) => {
          if (f.isGroup || (f.title || '').startsWith('.')) return false;
          if (isAll) return true;
          const safeName = f.safe || f.metadata?.safe || 'Standard';
          return activeSafes.includes(safeName);
      });
  }, [files, activeSafes]);
  ```
- In [`CentralFolderView.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Workspaces/CentralFolderView.tsx):
  Receives the filtered `files` prop or applies safe filtering.

### C. Context Menu & Note Management:
- In [`SidebarContextMenu.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/sidebar/SidebarContextMenu.tsx):
  Add menu items:
  - "In Safe verschieben..." (with quick Safe picker modal/submenu)
  - Quick action: "Ins Archiv verschieben" / "Aus Archiv wiederherstellen".

---

## 4. Cross-Safe @-Linking (`@nameSafe:noteTitle`)
### In [`web/src/components/extensions/mentionSuggestion.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/extensions/mentionSuggestion.tsx):
- Detect when query contains `:` (e.g. `query.includes(':')`):
  ```ts
  const colonIndex = query.indexOf(':');
  if (colonIndex > 0) {
      const targetSafe = query.substring(0, colonIndex).trim().toLowerCase();
      const noteQuery = query.substring(colonIndex + 1).trim().toLowerCase();
      
      const safeNotes = files.filter((f: any) => {
          const s = (f.safe || f.metadata?.safe || 'Standard').toLowerCase();
          return s === targetSafe && (f.title || '').toLowerCase().includes(noteQuery);
      });
      // Return suggestions with label: `@${f.metadata?.safe || 'Safe'}:${f.title}`, safe: targetSafe, id: f.id
      // If no note found: provide action "[+] In Safe '${targetSafe}' erstellen: ${noteQuery}"
  }
  ```
- **In [`useTipTapConfig.ts`](file:///C:/Users/nicoh/projects/tide/web/src/components/Editor/useTipTapConfig.ts) & [`MentionNodeView.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Editor/MentionNodeView.tsx):**
  - Add `safe` attribute to mention node.
  - Display with distinctive safe badge or `@SafeName:Title`.
- **Navigation on Click ([`Editor.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Editor.tsx#L373-L413)):**
  - When clicking a mention node pointing to note in another Safe:
    If `targetSafe` is not in `activeSafes`:
    Automatically add `targetSafe` to `activeSafes` in the store so the note is visible and highlighted in the sidebar.
    Open the note via `setActiveNoteId(id)`.

---

## 5. Git Status
- Working tree clean on `main`.
- Remote: `origin` (`https://github.com/nychel/tide.git`).
- `npm run build` passes with 0 errors. Ready for push after implementation and verification.
