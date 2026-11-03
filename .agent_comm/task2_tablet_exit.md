# Investigation Report: Tablet Mode Exit Bug
**Topic:** Tablet Mode exit bug ("die Notizen ansicht verschwindet nicht wenn man den Tablet Mode beendet")  
**Target:** Why `CentralFolderView` (or "Notizen" view) remains visible when Tablet Mode is disabled.

---

## 1. Executive Summary & Root Cause

When the user disables **Tablet-Mode** ("Tablet-Mode nutzen") in Settings -> Appearance:
1. `navigationMode` is toggled from `'folders'` to `'sidebar'` and saved in `localStorage.getItem('tide_navigation_mode')`.
2. **However, four interlocking flaws prevent the "Notizen" view (`CentralFolderView`) from disappearing:**
   - **Flaw 1 (`openTabs` not cleaned up):** In [`web/src/app/page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L296-L311), `useEffect([navigationMode])` only adds `{ id: 'folders', title: 'Notizen', type: 'folders' }` when `navigationMode === 'folders'`. It has **no cleanup branch** for `navigationMode === 'sidebar'`. The tab `'folders'` remains in `openTabs`.
   - **Flaw 2 (`activeTabId` not transitioned):** If the user is on the "Notizen" tab when disabling Tablet Mode (or if `'folders'` was the active view), `activeTabId` remains `'folders'`.
   - **Flaw 3 (`CentralFolderView` rendering condition):** In [`web/src/app/page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L3529-L3535), `CentralFolderView` is rendered whenever:
     ```tsx
     activeTabId === 'folders' || ((isTablet || navigationMode === 'folders') && !activeNoteId && ...)
     ```
     Because `activeTabId` is still `'folders'`, `CentralFolderView` remains visible in the main workspace!
     Furthermore, on any tablet/iPad or window sized between 768px and 1180px, `isTablet` is `true` (lines 147-158). Because the condition uses `(isTablet || navigationMode === 'folders')`, `isTablet` completely **overrides** `navigationMode === 'sidebar'` and keeps `CentralFolderView` visible even if the user explicitly turned off Tablet Mode!
   - **Flaw 4 (Tab Close blocked):** In [`web/src/app/page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L2809), `handleTabClose` contains:
     ```tsx
     if (id === 'calendar' || id === 'folders') return;
     ```
     Even though [`web/src/components/Layout/TabList.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Layout/TabList.tsx#L242) now displays an "X" (close) button on the "Notizen" tab because `navigationMode !== 'folders'`, clicking the "X" button does nothing because `handleTabClose` unconditionally refuses to close `id === 'folders'`.

---

## 2. Detailed Trace of State Flow

### Step 1: User Toggles Tablet Mode Off
- **File:** [`web/src/components/Settings/tabs/AppearanceTab.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/components/Settings/tabs/AppearanceTab.tsx#L60-L96)
- **Code:**
  ```tsx
  const nextMode = navigationMode === 'folders' ? 'sidebar' : 'folders';
  if (typeof window !== 'undefined') {
      try {
          localStorage.setItem('tide_navigation_mode', nextMode);
      } catch (e) {
          console.warn('Failed to save navigation mode to localStorage', e);
      }
  }
  setNavigationMode(nextMode);
  ```
- **Result:**
  - `navigationMode` in `useDataStore` becomes `'sidebar'`.
  - `localStorage['tide_navigation_mode']` is set to `'sidebar'`.

### Step 2: UiSlice Updates
- **File:** [`web/src/store/slices/createUiSlice.ts`](file:///C:/Users/nicoh/projects/tide/web/src/store/slices/createUiSlice.ts#L69-L73) and [lines 165-175](file:///C:/Users/nicoh/projects/tide/web/src/store/slices/createUiSlice.ts#L165-L175)
- Store emits `navigationMode: 'sidebar'`.

### Step 3: Sidebar Reappears, but Workspace Stays Trapped
- **File:** [`web/src/app/page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L217)
  ```tsx
  const shouldShowSidebar = isSidebarOpen && navigationMode !== 'folders';
  ```
  `shouldShowSidebar` evaluates to `true`, so the left sidebar expands.
- **File:** [`web/src/app/page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L297-L311)
  ```tsx
  useEffect(() => {
      if (navigationMode === 'folders') {
          setOpenTabs(prev => {
              if (prev.some(t => t.id === 'folders')) return prev;
              const calendarIdx = prev.findIndex(t => t.id === 'calendar');
              const foldersTab: Tab = { id: 'folders', title: 'Notizen', type: 'folders' };
              if (calendarIdx !== -1) {
                  const next = [...prev];
                  next.splice(calendarIdx + 1, 0, foldersTab);
                  return next;
              }
              return [...prev, foldersTab];
          });
      }
      // BUG: No else branch! Does not remove 'folders' when navigationMode === 'sidebar'!
  }, [navigationMode]);
  ```
  Because there is no handler for `navigationMode === 'sidebar'`, `openTabs` retains `{ id: 'folders', title: 'Notizen', type: 'folders' }`, and `activeTabId` remains `'folders'`.

### Step 4: `CentralFolderView` Remains Rendered
- **File:** [`web/src/app/page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L3529-L3546)
  ```tsx
  <div className={`absolute inset-0 z-10 bg-[var(--background)] overflow-y-auto ${
      activeTabId === 'folders' || ((isTablet || navigationMode === 'folders') && !activeNoteId && activeTabId !== 'calendar' && activeTabId !== 'todos' && activeTabId !== 'social' && activeTabId !== 'job_planner' && activeTabId !== 'trash' && !activeTabId.startsWith('profile:') && !activeTabId.startsWith('chat-'))
          ? 'block'
          : 'hidden'
  }`}>
  ```
  Since `activeTabId === 'folders'`, it evaluates to `'block'`.
  Even if the user is on another tab and has no active note, if screen width is between 768 and 1180px or iPad (`isTablet === true`), `isTablet` forces `'block'`.

### Step 5: Tab Close Fails
- **File:** [`web/src/app/page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L2809)
  ```tsx
  const handleTabClose = (e: React.MouseEvent | null, id: string) => {
      if (e) e.stopPropagation();
      if (id === 'calendar' || id === 'folders') return;
  ```
  The user sees the close "X" on the "Notizen" tab, clicks it, but the handler ignores `id === 'folders'`.

### Step 6: Session Tab Restoration Re-injects Stale Folders Tab
- **File:** [`web/src/app/page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L1383-L1405)
  When restoring tabs from `sessionStorage` (`tide_open_tabs`), if `savedTabs` contained `'folders'`, it is restored directly without verifying whether `navigationMode` is currently `'sidebar'`.

---

## 3. Concrete Fix Plan

### Fix 1: Auto-close 'folders' tab & transition `activeTabId` when `navigationMode` changes to `'sidebar'`
In [`web/src/app/page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L296-L311):
```tsx
useEffect(() => {
    if (navigationMode === 'folders') {
        setOpenTabs(prev => {
            if (prev.some(t => t.id === 'folders')) return prev;
            const calendarIdx = prev.findIndex(t => t.id === 'calendar');
            const foldersTab: Tab = { id: 'folders', title: 'Notizen', type: 'folders' };
            if (calendarIdx !== -1) {
                const next = [...prev];
                next.splice(calendarIdx + 1, 0, foldersTab);
                return next;
            }
            return [...prev, foldersTab];
        });
    } else {
        // Exiting tablet mode: remove 'folders' tab from openTabs
        setOpenTabs(prev => prev.filter(t => t.id !== 'folders'));
        // If 'folders' was the active tab, switch back to previous tab or calendar
        setActiveTabId(currentActive => {
            if (currentActive === 'folders') {
                return 'calendar';
            }
            return currentActive;
        });
    }
}, [navigationMode]);
```

### Fix 2: Allow closing the `'folders'` tab when not in folders mode
In [`web/src/app/page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L2809):
Change:
```tsx
if (id === 'calendar' || id === 'folders') return;
```
To:
```tsx
if (id === 'calendar' || (navigationMode === 'folders' && id === 'folders')) return;
```

### Fix 3: Remove `isTablet` override from `CentralFolderView` rendering condition
In [`web/src/app/page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L3530) & [line 3534](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L3534):
Change:
```tsx
activeTabId === 'folders' || ((isTablet || navigationMode === 'folders') && !activeNoteId && ...)
```
To:
```tsx
activeTabId === 'folders' || (navigationMode === 'folders' && !activeNoteId && ...)
```
`navigationMode` is the user-facing setting; hardware/viewport `isTablet` must not override the user's explicit choice of `navigationMode === 'sidebar'`.

### Fix 4: Set default `navigationMode` on iPad in `createUiSlice.ts`
In [`web/src/store/slices/createUiSlice.ts`](file:///C:/Users/nicoh/projects/tide/web/src/store/slices/createUiSlice.ts#L69-L73):
```ts
function getInitialNavigationMode(): NavigationMode {
    if (typeof window === 'undefined') return 'sidebar';
    const stored = localStorage.getItem('tide_navigation_mode');
    if (stored === 'folders') return 'folders';
    if (stored === 'sidebar') return 'sidebar';
    
    // Default on iPad / tablet if user hasn't explicitly set a preference
    const isTouch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
    const isPad = /iPad|Macintosh/i.test(navigator.userAgent) && isTouch;
    const w = window.innerWidth;
    if (isPad || (w >= 768 && w <= 1180 && isTouch)) {
        return 'folders';
    }
    return 'sidebar';
}
```
This ensures iPad users still get Tablet Mode by default on fresh visit, but if they toggle it off, their explicit `'sidebar'` preference is strictly honored everywhere.

### Fix 5: Filter `'folders'` when restoring tabs if `navigationMode !== 'folders'`
In [`web/src/app/page.tsx`](file:///C:/Users/nicoh/projects/tide/web/src/app/page.tsx#L1390-L1404):
When restoring tabs from `sessionStorage`, if `localStorage.getItem('tide_navigation_mode') !== 'folders'`, strip `{ id: 'folders' }` from `parsed` tabs and fallback `savedActiveId` if it was `'folders'`.
