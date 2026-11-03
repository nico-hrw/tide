# Scout 3 Findings: Tab-Icons Styling on Active Tab

## 1. User Requirement
"die Tab-Icons sollen bei dem aktiven Tab nicht blau werden sondern einfach ein kräftigeres Schwarz."
(The tab icons on the active tab should not turn blue, but simply a stronger black.)

## 2. Component & File Location
- **File**: `web/src/components/Layout/TabList.tsx`
- **Location**: Lines 220–235 in `TabList.tsx`
- **Usage**: Used in `web/src/app/page.tsx` (line 3219) as the horizontal desktop tab bar for open tabs (`tabs={openTabs}`, `activeTabId={activeTabId}`).

## 3. Current Implementation
In `web/src/components/Layout/TabList.tsx`:
```tsx
// Lines 220-224 (Tab item container)
className={`group relative flex items-center gap-2 min-h-[32px] px-3 py-1.5 text-xs font-medium cursor-pointer transition-all duration-150 max-w-[190px] min-w-[100px] border
    ${isActive
        ? 'bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 shadow-sm border-gray-200/90 dark:border-slate-700/80 font-semibold'
        : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-slate-900/40 border-transparent'
    }`}

// Line 227 (Tab icon wrapper)
<div className={`shrink-0 ${isActive ? 'text-blue-500' : 'text-gray-400 dark:text-slate-500 group-hover:text-gray-600 dark:group-hover:text-slate-300 transition-colors'}`}>
    {getTabIcon(tab.type)}
</div>
```
When `isActive` is true, the icon has `text-blue-500`.

## 4. Recommended Fix for Coder Agent
In `web/src/components/Layout/TabList.tsx` line 227:
Replace:
```tsx
<div className={`shrink-0 ${isActive ? 'text-blue-500' : 'text-gray-400 dark:text-slate-500 group-hover:text-gray-600 dark:group-hover:text-slate-300 transition-colors'}`}>
```
With:
```tsx
<div className={`shrink-0 ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-500 group-hover:text-gray-600 dark:group-hover:text-slate-300 transition-colors'}`}>
```
(or `text-black dark:text-white` / `text-gray-950 dark:text-gray-100` depending on preference, matching the dark text `text-gray-900` of the tab text).

## 5. Related Secondary Locations (for completeness)
- `web/src/components/Layout/sidebar/SidebarQuickNotes.tsx`:
  - Lines 32 & 53: Social and Job & Uni navigation buttons in sidebar also use `text-blue-500` when `activeTabId === 'social'` or `activeTabId === 'job_planner' | 'exams'`.
- `web/src/components/Layout/TabList.tsx` lines 293, 297:
  - Plugin button uses `text-blue-500` / `text-blue-600` when `isPluginMenuOpen` is true.
