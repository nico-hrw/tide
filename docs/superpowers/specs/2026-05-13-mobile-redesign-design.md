# Mobile Redesign — Design Spec
**Date:** 2026-05-13  
**Status:** Approved

## Goal
Rewrite the mobile UI (`MobileLayout.tsx`) to match a minimalist, clean app-like aesthetic derived from three reference images. Desktop version must not change. Dark mode support is preserved via code comments but not actively styled in this iteration.

## Visual Foundation

### Colors (Light Mode)
- Background: `#F0F4FF` (soft blue-gray, like reference image 3)
- Card background: `#FFFFFF`
- Accent: `#3B82F6` (clean blue)
- Text primary: `#111827`
- Text secondary: `#6B7280`
- Text muted: `#9CA3AF`
- Border: `#E5E7EB` (subtle)
- Bottom nav: `rgba(255,255,255,0.95)` + backdrop-blur

### Typography
- Page titles: `text-2xl font-bold`
- Card headings: `font-semibold text-sm`
- Meta labels: `text-xs font-medium uppercase tracking-wider text-muted`
- Times: `text-xs text-muted`

### Shape Language
- Cards: `rounded-3xl` (24px)
- Dots / avatars / nav icons: `rounded-full`
- Bottom sheet handle: `w-10 h-1 rounded-full bg-gray-200`

## Architecture

### Files Changed
- `web/src/components/Layout/MobileLayout.tsx` — full rewrite
- `web/src/components/Layout/BottomSheet.tsx` — new reusable bottom sheet component

### Files NOT Changed
- All desktop components (Sidebar, CalendarView, WeekView, etc.)
- `page.tsx` props interface stays identical — MobileLayout receives same props

## Components

### BottomSheet.tsx
Reusable bottom sheet with:
- Framer Motion `y` animation: slides in from bottom (`y: "100%"` → `y: 0`)
- Backdrop with fade-in (`opacity: 0` → `opacity: 1`)
- Handle bar at top
- `onClose` called on backdrop tap or drag down
- Props: `isOpen`, `onClose`, `title?`, `children`

### MobileLayout.tsx (rewrite)
**Bottom Nav:** 3 icons (Notes, Calendar, Profile). Active icon gets blue accent dot below, no background pill. Height 72px, white, blur, subtle top border.

**Calendar Tab:**
- Header: greeting + date, avatar top-left, + FAB top-right
- Collapsible MiniCalendar → Week strip on scroll (already works, keep logic)
- Week strip: day letter above number, selected = blue circle
- Timeline: vertical blue line, circle markers, time left, title right. Bold title, muted description.
- Empty state: centered icon + text

**Notes Tab:**
- "My Notes" title header
- Folder items: white card, `rounded-3xl`, folder icon blue
- File items: file icon in light blue circle, semibold title
- Back arrow in header when editing

**Profile Tab:**
- Large avatar circle with gradient
- Name bold, email muted below
- Stats row (could be added later; placeholder kept)
- Menu list: white card, icon + label + chevron rows

## Animations

### Tab transitions
`AnimatePresence` with `initial={{ opacity: 0, y: 8 }}`, `animate={{ opacity: 1, y: 0 }}`, `exit={{ opacity: 0, y: -8 }}`, duration `0.2s ease-out`

### Bottom Sheet (ScheduleModal on mobile)
`initial={{ y: "100%" }}` → `animate={{ y: 0 }}` → `exit={{ y: "100%" }}`, spring with `stiffness: 400, damping: 40`

### Collapsible calendar
Height animation: `initial={{ height: 0, opacity: 0 }}` → `animate={{ height: "auto", opacity: 1 }}`, `0.25s`

### Event expand
Same height animation, `0.2s`

### Nav icon
Scale pulse on tap: `whileTap={{ scale: 0.85 }}`

## Mobile-Only Constraint
All new styles live inside `flex md:hidden` wrapper — desktop is unaffected.

## Dark Mode Notes
Each section that needs dark mode adaptation is marked with:
```
{/* TODO(dark): ... */}
```
Dark mode will be handled in a separate iteration.

## Out of Scope
- Finance dashboard mobile view
- Social hub mobile view
- Canvas mobile view
- Functional changes to event logic / recurrence
