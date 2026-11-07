# Mobile Event & Todo Creation UI Scout Report

## Executive Summary
This report analyzes the reference prototype in `navigationsleiste.html` and maps its design, animations, HTML/Tailwind classes, and interaction patterns to the existing React implementation in `web/src/`. We locate existing creation hooks in `MobileLayout.tsx`, `useDataStore.ts`, `page.tsx`, and `TodoList.tsx`, and provide concrete recommendations for implementation.

---

## 1. Deep Dive: `navigationsleiste.html` Prototype

### A. Bottom Navigation Bar Structure & Styling
- **Container**:
  ```html
  <nav class="w-full box-border bg-white/90 backdrop-blur-md border-t border-gray-200 flex items-center justify-between px-4 py-4 pb-8 sm:pb-6 shadow-[0_-5px_15px_rgba(0,0,0,0.03)] relative z-20">
  ```
- **Button Sizing & Shape**:
  - Exact size: `w-[48px] h-[48px] rounded-[18px]`
  - Active button style: `bg-gray-900 text-white transition-all shadow-md active:scale-95`
  - Inactive button style: `text-gray-400 hover:text-gray-800 hover:bg-gray-100 transition-all active:scale-95`
- **Left Group (`flex items-center gap-2`)**:
  - Button 1: Calendar (`ph ph-calendar-blank text-2xl`) — Active by default
  - Button 2: Journal / Notes (`ph ph-book-open text-[28px]`)
  - Button 3: Checklist / Todos (`ph ph-list-checks text-[28px]`)
- **Right Group (`flex items-center gap-2`)**:
  - Button 4: Search (`ph ph-magnifying-glass text-[28px]`)
  - Button 5: Sliders / Settings / Filters (`ph ph-sliders-horizontal text-[28px]`)
  - Button 6: Plus Button (`w-[48px] h-[48px] rounded-[18px] bg-gray-900 text-white shadow-md hover:bg-black transition-all active:scale-95 relative z-30`)
    - Icon: `ph ph-plus text-2xl transition-transform duration-300`
    - Rotation: Toggles `rotate-45` when menu is open

### B. Floating Add Menu (Popup)
- **Container**:
  ```html
  <div id="add-menu" class="hidden absolute bottom-[60px] right-0 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 flex flex-col w-[170px] z-10 transition-all origin-bottom-right">
  ```
- **Action Items**:
  - **Termin** (`#btn-new-event`):
    ```html
    <button class="flex items-center gap-3 w-full text-left px-3 py-3 text-[15px] font-semibold text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
      <i class="ph ph-calendar-plus text-xl text-blue-500"></i> Termin
    </button>
    ```
  - **To-Do** (`#btn-new-todo`):
    ```html
    <button class="flex items-center gap-3 w-full text-left px-3 py-3 text-[15px] font-semibold text-gray-800 hover:bg-gray-50 rounded-xl transition-colors">
      <i class="ph ph-check-square text-xl text-green-500"></i> To-Do
    </button>
    ```
- **Interaction**:
  - Clicking Plus toggles `#add-menu.hidden` and `#plus-icon.rotate-45`.
  - Clicking outside closes `#add-menu` and removes `rotate-45`.

### C. Create Modal / Overlay
- **Modal Container**:
  ```html
  <div id="create-modal" class="absolute inset-0 bg-[#f4f5f7] z-50 flex flex-col transform translate-y-full transition-transform duration-400 ease-[cubic-bezier(0.32,0.72,0,1)] overflow-hidden">
  ```
  - Slides in from bottom by removing `translate-y-full` with cubic-bezier easing.
- **Modal Header**:
  ```html
  <div class="flex items-center justify-between px-4 py-4 bg-white border-b border-gray-200 z-10 shrink-0">
    <button id="cancel-btn" class="text-blue-500 font-medium text-[16px] hover:text-blue-600 transition-colors px-2 py-1">Abbrechen</button>
    <h2 id="modal-title" class="font-bold text-[17px] text-gray-900 tracking-tight">Neuer Termin</h2>
    <button class="text-gray-400 font-semibold text-[16px] transition-colors px-2 py-1" id="save-btn">Hinzufügen</button>
  </div>
  ```
  - Dynamic Title: switches between `"Neuer Termin"` and `"Neues To-Do"`.
  - Save button validation: `save-btn` is `text-gray-400` when empty; switches to `text-blue-500` when `titleInput.value.trim().length > 0`.
- **Modal Content (`overflow-y-auto p-4 flex flex-col gap-6 pb-12`)**:
  1. **Title & Color Card**:
     - `flex items-center gap-4 bg-white rounded-2xl p-4 shadow-sm`
     - Circle color picker: `relative shrink-0 w-8 h-8 rounded-full overflow-hidden shadow-sm border border-gray-200` enclosing `<input type="color" class="absolute top-[-10px] left-[-10px] w-[50px] h-[50px] cursor-pointer outline-none">`
     - Title input: `w-full text-2xl font-semibold text-gray-900 placeholder-gray-300 outline-none bg-transparent`
  2. **Date / Time Card (iOS Grouped List style)**:
     - `bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col`
     - Row 1 (Datum): `flex justify-between items-center px-4 py-3.5 border-b border-gray-100` (`<input type="date">` / `placeholder="Auswählen"`)
     - Row 2 (Von): `flex justify-between items-center px-4 py-3.5 border-b border-gray-100` (`<input type="time">` / `placeholder="Zeit wählen"`)
     - Row 3 (Bis): `flex justify-between items-center px-4 py-3.5` (`<input type="time">` / `placeholder="Zeit wählen"`)
  3. **Wiederholung (Recurrence) Card**:
     - `bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col transition-all duration-300`
     - Recurrence selector: `<select id="repeat-select">` with options: `nie` ("Nie"), `Tage` ("Täglich"), `Wochen` ("Wöchentlich"), `Monate` ("Monatlich"), `Jahre` ("Jährlich")
     - Dynamic Expansion (`#repeat-details`):
       - Interval: `alle [number input: 1] [repeat-unit: Tage/Wochen/Monate/Jahre]`
       - End date: `Endet am [date picker / placeholder="Nie"]`
  4. **To-Do Specific Card (`#todo-fields`, conditionally shown)**:
     - `bg-white rounded-2xl shadow-sm overflow-hidden flex-col transition-all duration-300`
     - Priorität: `<select>` with `none` ("Keine"), `low` ("Niedrig"), `medium` ("Mittel", selected), `high` ("Hoch")
     - Tags: `<input type="text" placeholder="#Hinzufügen">`

---

## 2. Current React App Implementation Analysis (`web/src/`)

### A. Bottom Navigation Bar in `MobileLayout.tsx`
- **File**: `web/src/components/Layout/MobileLayout.tsx`
- **Lines**: 2209–2444
- **Current State**:
  - Container is `fixed left-0 right-0 flex items-center justify-between z-20 px-3 sm:px-5 pt-2.5 sm:pt-3`.
  - Buttons are `w-10 h-10` or `w-9 h-9` with `rounded-xl sm:rounded-2xl` (slightly smaller than prototype's `w-[48px] h-[48px] rounded-[18px]`).
  - Active tab switches between `'calendar'`, `'notes'`, and `'todos'`.
  - Search triggers `setIsSearchOpen(true)`.
  - Filter triggers `window.dispatchEvent(new CustomEvent('tide:toggle-todo-filter'))`.
  - Plus button currently behaves differently depending on the active tab:
    - On `'calendar'`: opens `isNewEventSheetOpen = true` directly (bottom sheet).
    - On `'notes'`: opens popup menu with "Notiz erstellen" and "Ordner erstellen".
    - On `'todos'`: opens popup menu with "Aufgabe erstellen" and "Ordner erstellen".
    - **Difference from Prototype**: The prototype provides a unified Plus menu with direct access to "Termin" and "To-Do" regardless of tab, and opens a full modal view rather than an inline card or bottom sheet drawer.

### B. Event Creation Implementation
- **Component**: `MobileNewEventSheet` in `web/src/components/Layout/mobile/MobileBottomSheets.tsx` (Lines 250–500).
  - Renders a sliding bottom sheet (`maxHeight: '88vh'`).
  - Form fields: title, date, start time, end time, group/category selection, color palette, description, recurrence (daily, weekly, monthly, yearly, end date).
  - Callback: `onSave(start: Date, end: Date, meta: { title, color, description, parent_id, recurrence, ... })`.
- **App Page Integration**: `web/src/app/page.tsx`
  - Line 3043: `onNewEvent` prop passed to `<MobileLayout />`.
  - Lines 2060–2090: `handleEventCreate(start, end, isAllDay, extraMeta)`:
    - Encrypts metadata using `cryptoLib.encryptMetadata` and content using `cryptoV2.encryptFileV2`.
    - Dispatches POST request to `/api/v1/files` with `type: 'event'`.
    - Updates local data store.

### C. Todo Creation Implementation
- **Component**: `TodoList.tsx` (`web/src/components/Todo/TodoList.tsx`) & `TodoCreateCard.tsx` (`web/src/components/Todo/TodoCreateCard.tsx`).
  - Lines 283–299 in `TodoList.tsx`: Listens to `window.addEventListener('tide:new-todo', handleNewTodoEvent)`.
  - In `TodoList.tsx`, `handleNewTodoEvent` sets `setIsCreateOpen(true)`, rendering `TodoCreateCard` inline at the top of the tasks list.
  - `TodoCreateCard.tsx` (Lines 1–245) provides draft inputs for title, description, priority (`'low' | 'medium' | 'high'`), dueDate, recurrence, recurrenceEnd, folder, tags, and showInCalendar.
- **Store Slice**: `web/src/store/slices/createTodosSlice.ts`
  - Lines 47–150: `addTask: async (taskDraft)`:
    - Accepts draft task object (`title`, `priority`, `dueDate`, `recurrence`, `tags`, etc.).
    - Generates client UUID fallback.
    - Encrypts task metadata and POSTs to `/api/v1/files` (or saves to offline cache `tide_offline_tasks`).
    - Updates `tasks` array in Zustand store.
    - Exported via `useDataStore.getState().addTask(...)`.

---

## 3. Icon Mapping (Phosphor -> Lucide React)
The project uses `lucide-react` (`v0.564.0`), not Phosphor Icons. The direct equivalents:
| Prototype (Phosphor) | React (`lucide-react`) |
|---|---|
| `ph-calendar-blank` | `Calendar` |
| `ph-book-open` | `BookOpen` |
| `ph-list-checks` | `ListChecks` or `ListTodo` |
| `ph-magnifying-glass` | `Search` |
| `ph-sliders-horizontal` | `SlidersHorizontal` |
| `ph-plus` | `Plus` |
| `ph-calendar-plus` | `CalendarPlus` |
| `ph-check-square` | `CheckSquare` |

---

## 4. Key Recommendations & Proposed Changes

1. **Refactor Bottom Navigation in `MobileLayout.tsx`**:
   - Update button sizes to `w-[48px] h-[48px] rounded-[18px]` for consistent touch targets.
   - Standardize Plus button click to toggle the add popup with rotation animation (`transition-transform duration-300`, `rotate-45`).
   - In the popup, provide unified options:
     - **Termin** (`CalendarPlus`, `#3b82f6`) -> opens unified creation modal in `'event'` mode.
     - **To-Do** (`CheckSquare`, `#22c55e`) -> opens unified creation modal in `'todo'` mode.
     - (Keep Note / Folder options accessible when in Note tab if desired, or support full unified creation).

2. **Unified Mobile Creation Modal (`MobileCreateModal.tsx`)**:
   - Create a clean modal component implementing the exact visual language of `navigationsleiste.html`:
     - Fullscreen slide-up (`translate-y-full` to `translate-y-0`) with iOS spring/ease animation.
     - Header: "Abbrechen" (blue), Title ("Neuer Termin" / "Neues To-Do"), "Hinzufügen" (disabled gray -> active blue).
     - Card 1: Title input with embedded color picker disc.
     - Card 2: Date, Von, Bis rows in an iOS grouped list card.
     - Card 3: Wiederholung with dropdown and dynamic accordion expansion for interval count + unit and end date.
     - Card 4 (Todo mode): Priority dropdown + Tags chip/input.
   - Integrate with dark mode using tokens from `mobileTheme.ts` (`T.card`, `T.bg`, `T.brd`, `T.pri`, `T.sec`, `T.mut`).

3. **Wire Event and Todo Handlers**:
   - For Event mode: Invoke `onNewEvent(start, end, meta)` (already cleanly supported by `MobileLayout`).
   - For Todo mode: Directly invoke `useDataStore.getState().addTask(...)` (or pass an `onNewTodo` callback), passing:
     ```ts
     {
       title,
       priority, // 'none' | 'low' | 'medium' | 'high'
       dueDate,
       recurrence, // 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
       recurrenceEnd,
       tags,
       showInCalendar: true,
     }
     ```
   - Automatically close modal and blur inputs on submit or cancel.

---
*Report generated by Targeted Read-Only Code Scout.*
