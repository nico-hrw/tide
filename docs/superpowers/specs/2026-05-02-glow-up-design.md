# Tide Glow-Up Design Spec
**Date:** 2026-05-02  
**Scope:** Light mode only. Dark mode tokens are documented inline as `DARK:` comments for a future pass.  
**Approach:** Token-First — globals.css tokens first, then component-by-component sweep.

---

## 1. Design Tokens (`globals.css`)

All new tokens go into the `:root` block. Each line carries a `/* DARK: <value> */` comment for the future dark mode pass.

```css
/* Typography */
--text-body:    #2C2C2C;   /* DARK: #E2E8F0 */
--text-muted:   #737373;   /* DARK: #94A3B8 */
--text-subtle:  #999999;   /* DARK: #64748B */

/* Borders */
--border-grid:  rgba(0, 0, 0, 0.05);   /* DARK: rgba(255,255,255,0.06) */
--border-ui:    rgba(0, 0, 0, 0.08);   /* DARK: rgba(255,255,255,0.10) */

/* Shadows (floated elements: island, modals, toolbar) */
--shadow-float: 0px 8px 24px rgba(0, 0, 0, 0.06), 0px 2px 6px rgba(0, 0, 0, 0.04);
/* DARK: 0px 8px 24px rgba(0,0,0,0.3), 0px 2px 6px rgba(0,0,0,0.2) */

/* Border radius */
--radius:    8px;   /* was 6px — all standard elements */
--radius-lg: 14px;  /* islands, large modals */

/* Interactive */
--hover-bg:      #F5F5F5;  /* DARK: rgba(255,255,255,0.06) */
--today-accent:  #EF4444;  /* DARK: #EF4444 (unchanged) */
```

**Existing tokens kept unchanged:** all `--event-*` color tokens, `--sidebar-bg`, `--background`, `--foreground`.

---

## 2. Kalender (`WeekView.tsx`, `DayColumn.tsx`, `CalendarEventItem.tsx`)

### Grid
- All hour-row borders → `border-bottom: 1px solid var(--border-grid)`
- Day-column vertical separators → `border-right: 1px solid var(--border-grid)`
- Remove any `border-color` hardcodes (e.g. `border-gray-100`, `border-gray-200`)

### Event blocks (`CalendarEventItem.tsx`)
- `padding: 4px 8px`
- `border-radius: var(--radius)`
- Title font-size: `12px`, color: `var(--text-body)` when `shading < 3`
- **Shading contrast rule:** `shading >= 3 → color: #FFFFFF` — add this to `getEventTheme` or directly in the render className logic
- Tags/hints: `font-size: 10px`, `color: var(--text-muted)`

### "Heute"-Indikator (`WeekView.tsx`, column header)
- Remove the filled red background block from the day-header
- Column background stays white
- The day number cell: `width: 28px; height: 28px; border-radius: 50%; background: var(--today-accent); color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-weight: 600`
- Day name (e.g. "SA"): `color: var(--text-subtle); font-size: 10px; letter-spacing: 0.5px; text-transform: uppercase`

### Time labels (left gutter)
- `color: var(--text-muted)`, `font-size: 11px`

---

## 3. Notizen — Editor & Tabellen (`Editor.tsx`, `globals.css`)

### Prose styles
- Editor content container: `line-height: 1.6; max-width: 800px; margin: 0 auto; color: var(--text-body)`
- Headings (`h1`, `h2`, `h3`): `color: #111111; margin-bottom: 0.25em` — one shade darker than body text for hierarchy without color accents

### Tabellen (TipTap table CSS in `globals.css`)
```css
.ProseMirror table {
  border: 1px solid var(--border-ui);
  border-radius: var(--radius);
  overflow: hidden;
  border-collapse: collapse;
  width: 100%;
}
.ProseMirror td, .ProseMirror th {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-grid);
  border-right: none;   /* remove vertical lines */
  border-left: none;
}
.ProseMirror th {
  background: #FAFAFA;
  font-weight: 600;
  color: var(--text-body);
}
```

### Formatierungs-Toolbar (Bubble Menu)
- `box-shadow: var(--shadow-float)`
- `border-radius: var(--radius)`
- `border: 1px solid var(--border-ui)`
- Background: `bg-white` (unchanged)

---

## 4. Sidebar — Navigation & Recent (`Sidebar.tsx`, Layout)

### TabList removal
- Remove `<TabList>` from `layout.tsx` / `page.tsx` (the import and JSX)
- Keep `TabList.tsx` on disk, unused — do not delete

### New structure (top to bottom in Sidebar)
1. Avatar / Logo area (unchanged)
2. **Navigation icons** — Calendar, Social, Finance (if enabled)
3. **RECENT section** — open documents
4. **NOTES section** — folder/file tree (existing)
5. Smart Island + Mini-Calendar (bottom, unchanged position)

### Props changes to `Sidebar.tsx`
The navigation icon callbacks currently live on TabList. They must be added as new Sidebar props:
- `onOpenCalendar: () => void`
- `onOpenSocial: () => void`
- `onOpenFinance?: () => void`
- `activeTabId: string` (to determine active icon highlight)

These are already passed from the parent to TabList, so the parent just needs to forward them to Sidebar instead.

### Navigation icons
- Button size: `32×32px`, `border-radius: var(--radius)`
- Hover: `background: var(--hover-bg)`
- Active: `background: #EBEBEB`
- Icon size: `16px`, `color: var(--text-muted)` (inactive) / `#111111` (active)
- Remove the black pill / `bg-gray-900` active state

### RECENT section header
```
font-size: 11px
letter-spacing: 1px
color: var(--text-subtle)
text-transform: uppercase
margin-bottom: 4px
```

### RECENT items (open documents — replaces TabList document tabs)
- Keep `Reorder.Group` with `axis="y"` for drag-to-reorder
- Item layout: `[Icon] [Title] ... [X on hover]`
- `padding: 6px 8px; border-radius: var(--radius); gap: 4px`
- Hover: `background: var(--hover-bg)`
- **Active item:** `background: #EBEBEB; border-left: 2px solid #111111` (Notion-style left accent instead of filled pill)
- Icon: `FileText` / `MessageSquare` / `User` at `14px`, `color: var(--text-muted)`
- Title: `font-size: 13px`, truncated, `color: var(--text-body)`
- X button: `opacity: 0` default → `opacity: 1` on parent hover, `14×14px`, same onClick as `onTabClose`
- Save-status dot (unsaved indicator): keep if present, align right of title

### Empty state (no open documents)
```tsx
<p style={{ fontSize: 12, color: 'var(--text-subtle)', padding: '6px 8px' }}>
  Nichts geöffnet
</p>
```

### Folder/file tree items (existing NOTES section)
- Same padding and hover style as RECENT items: `padding: 6px 8px; border-radius: var(--radius)`
- Hover: `background: var(--hover-bg)`
- Vertical gap between items: `4px`

---

## 5. Smart Island (`SmartIsland.tsx`, `MiniCalendar.tsx`)

### Island container
- `border: 1px solid var(--border-ui)`
- `box-shadow: var(--shadow-float)`
- `backdrop-filter: blur(10px)` (unchanged)
- Background: `bg-white/85` (was `/80`)
- `border-radius: var(--radius-lg)`
- Padding: `p-5` (was `p-4`)

### Island typography
- "Calendar Capture" label: `font-size: 11px; letter-spacing: 1px; color: var(--text-subtle); text-transform: uppercase`
- Captured text: `color: var(--text-body)`
- Time string: `color: var(--text-muted)`

### Island buttons
- `border-radius: var(--radius)` (was `rounded-xl` / 12px)
- Colors unchanged (yellow/green)

### MiniCalendar (in Sidebar)
- Container padding: `p-5` (was `p-4`)
- Day numbers: `color: var(--text-body)`
- Today number: same red circle as main calendar (`28×28px`, `var(--today-accent)`, white text)
- Weekday headers: `color: var(--text-subtle)`, `font-size: 10px`, `letter-spacing: 0.5px`

---

## Dark Mode — Future Pass

When applying to dark mode, replace every token in `:root` with the `DARK:` values listed in Section 1 inside the `.dark {}` block. Component-level Tailwind classes using `dark:` variants stay as-is where they already exist; only hardcoded hex colors that reference the new tokens need updating.

Priority order for dark mode pass:
1. `globals.css` token swap
2. `CalendarEventItem.tsx` shading contrast rule (already color-agnostic if using tokens)
3. `SmartIsland.tsx` bg opacity
4. Sidebar Recent items (active state border-left color)
5. Table styles in `globals.css`
