# Fitness Tracker — Redesign & Muscle Integration

**Date:** 2026-05-08
**Status:** Approved

## Overview

Four improvements to the fitness tracker app (`tracker/`):

1. **Visual Redesign** — white background, cleaner premium feel
2. **Inline Workout Flow** — workout starts and runs on the home page without navigation
3. **UX Fixes** — cancel button, empty-set prevention
4. **Muscle Integration** — SVG body map across three phases of a workout

---

## 1. Visual Redesign

**Change:** Replace the beige background (`#F5F4F0`) with white (`#FFFFFF`) globally. Improve overall polish — spacing, typography, shadow depth — so the app feels like a functional product rather than a prototype.

**Scope:**
- `globals.css` and `tailwind.config.js`: change `bg` token from `#F5F4F0` to `#FFFFFF`
- Audit all pages for `bg-bg` usage and ensure consistency
- BottomNav: improve contrast and active-state styling
- StatCards: tighten spacing, slightly stronger shadow
- No new color palette — keep existing black/white/category-colors system

---

## 2. Inline Workout Flow

The home page (`app/page.tsx`) manages three UI states using the existing Zustand `activeWorkout` field plus a new local `startingWorkout` boolean.

### States

**Idle** — `activeWorkout === null && !startingWorkout`
- Shows: greeting, stats cards, "Neues Workout starten" button
- Tapping the button transitions to → Starting

**Starting** — `startingWorkout === true`
- Shows: workout name input + muscle group pill selector (see Section 4)
- "Starten" confirms → writes `startWorkout()` to Zustand, clears `startingWorkout`, transitions to → Active
- "Zurück" cancels → back to Idle

**Active** — `activeWorkout !== null`
- Greeting and stats animate out (`translateY(-100%)`, `opacity 0`, 300ms ease)
- Workout UI fills the page:
  - Header: workout name + elapsed timer
  - Scrollable exercise list (each card shows name, set count, small `MuscleSVG`)
  - "+ Übung hinzufügen" button → opens `ExercisePicker` modal
  - Bottom action row (see UX Fixes)

**Transition animation:** CSS classes toggled on the greeting/stats container. Workout content fades in from below simultaneously.

---

## 3. UX Fixes

### Cancel vs. Finish

| Condition | Button label | Behavior |
|-----------|-------------|----------|
| `exercises.length === 0` | "Abbrechen" | Calls `cancelWorkout()`, returns to Idle, no confirmation |
| `exercises.length > 0` | "Workout abschließen" | Existing finish flow |
| `exercises.length > 0` + secondary link | "Abbrechen" (small, below button) | Confirmation dialog: "Workout abbrechen? Alle Daten gehen verloren." → cancels if confirmed |

New store action: `cancelWorkout()` — clears `activeWorkout` from Zustand and IndexedDB.

### Empty Set Prevention

In `SetLogger.tsx`, the "Satz hinzufügen" button is disabled when:
- `weight_reps` type: `weightKg === 0 && reps === 0`
- `distance_time` type: `distanceMeters === 0 && durationSeconds === 0`
- `time_only` type: `durationSeconds === 0`

Visual treatment: `opacity-40 cursor-not-allowed` on the button.

---

## 4. Muscle Integration

### Data Model

**New type file additions (`types/tracker.ts`):**

```typescript
export type MuscleId =
  | 'chest' | 'front_shoulder' | 'rear_shoulder'
  | 'triceps' | 'biceps' | 'forearms'
  | 'upper_back' | 'lats' | 'traps'
  | 'abs' | 'glutes' | 'quads' | 'hamstrings' | 'calves';

export interface MuscleGroup {
  id: MuscleId;
  name: string;          // German: "Brust", "Latissimus", etc.
  view: 'front' | 'back' | 'both';
}
```

**`TrackerExercise` additions (optional for backwards compatibility):**
```typescript
primaryMuscles?: MuscleId[];
secondaryMuscles?: MuscleId[];
```

**`ActiveWorkout` addition:**
```typescript
targetMuscles: MuscleId[];   // selected during workout start
```

### Static Bundle (offline-first)

Two new files always bundled with the app:

**`lib/muscles.ts`** — exports `MUSCLE_GROUPS: MuscleGroup[]` with all 14 groups, German names, and front/back view assignment. Always available offline.

**`lib/builtinExerciseMuscles.ts`** — exports `BUILTIN_MUSCLE_MAP: Record<string, { primary: MuscleId[], secondary: MuscleId[] }>` keyed by built-in exercise name. Covers ~25 standard exercises. Always available offline.

**`lib/musclePaths.ts`** — exports `MUSCLE_PATHS: Record<MuscleId, { front?: string, back?: string }>` with SVG path `d` strings for each muscle group. Separated from the component so anatomy detail can be upgraded independently.

### Backend Changes (Go API)

- Add `primary_muscles []string` and `secondary_muscles []string` columns to exercises table
- GET `/tracker/exercises` returns both fields (empty arrays if not set)
- POST `/tracker/exercises` accepts both fields on creation
- PATCH `/tracker/exercises/:id` accepts both fields on update

Frontend reads from API when online; falls back to `BUILTIN_MUSCLE_MAP` when offline or when `primaryMuscles` is undefined.

### SVG Component (`components/MuscleSVG.tsx`)

Single component used across all three phases.

**Props:**
```typescript
interface MuscleSVGProps {
  primary: MuscleId[];
  secondary: MuscleId[];
  interactive?: boolean;       // enables click-to-toggle
  onToggle?: (id: MuscleId) => void;
  size: 'sm' | 'md' | 'lg';
}
```

**Size variants:**
- `sm` — inline icon in exercise card (~28×40px), front view only, no labels
- `md` — muscle picker in workout start (~120×160px), front+back or just front, labels on tap
- `lg` — post-workout summary (~160×220px), front+back side-by-side with legend list below

**Rendering:** Each muscle group is an SVG `<path>` (or simplified `<rect>` for initial implementation) with `data-muscle-id`. Primary muscles render at full opacity, secondary at ~35% opacity, inactive at near-zero (`#eee` fill, no stroke).

**Extensibility:** The SVG paths are defined in a separate `lib/musclePaths.ts` so more granular anatomy can be added later without touching the component logic.

### Integration Points

**Phase 1 — Pre-workout (Home page, Starting state)**
- Pill buttons for each `MuscleGroup`, multi-select
- Selected IDs stored as local state, passed to `startWorkout()` as `targetMuscles`
- Optionally: MuscleSVG `md` as an alternative visual selector (tap muscles on the body map directly). Start with pill buttons; SVG picker is a future enhancement.

**Phase 2 — During workout (Exercise cards)**
- Each `ActiveWorkoutExercise` card renders a `MuscleSVG size="sm"` using the exercise's `primaryMuscles` / `secondaryMuscles`
- Falls back to `BUILTIN_MUSCLE_MAP` if API data not available
- Tapping the icon opens a larger `MuscleSVG size="md"` in a bottom sheet for detail view

**Phase 3 — Post-workout summary (History + Stats)**
- Workout completion screen and history detail view show `MuscleSVG size="lg"`
- Aggregated across all exercises in the workout: union of all primary muscles as primary, union of all secondary as secondary
- Legend list below the SVG: muscle name + primary/secondary tag
- Intensity variant (future): opacity proportional to total volume per muscle group

### Offline Behavior

| Scenario | Behavior |
|----------|----------|
| Online, built-in exercise | Muscle data from API |
| Offline, built-in exercise | Muscle data from `BUILTIN_MUSCLE_MAP` |
| Online, user-created exercise | Muscle data from API (set via muscle picker on creation) |
| Offline, user-created exercise | Muscle data from IndexedDB (set when exercise was created) |
| User-created, never synced | `primaryMuscles: []` — no SVG highlight, no error |

---

## File Changes Summary

| File | Change |
|------|--------|
| `types/tracker.ts` | Add `MuscleId`, `MuscleGroup`, extend `TrackerExercise`, `ActiveWorkout` |
| `lib/muscles.ts` | New — 14 muscle groups, German names, view assignments |
| `lib/builtinExerciseMuscles.ts` | New — static muscle mapping for built-in exercises |
| `lib/musclePaths.ts` | New — SVG path data per muscle ID |
| `components/MuscleSVG.tsx` | New — size-aware SVG body map component |
| `app/page.tsx` | Inline workout flow (3 states + animations) |
| `app/globals.css` | Background white, polish tweaks |
| `tailwind.config.js` | `bg` token → white |
| `components/SetLogger.tsx` | Empty set prevention |
| `store/useTrackerStore.ts` | Add `cancelWorkout()`, extend `startWorkout()` with `targetMuscles` |
| `components/ExercisePicker.tsx` | Add muscle picker for user-created exercises |
| Go backend | `primary_muscles`, `secondary_muscles` on exercises |

---

## Out of Scope

- Interactive SVG muscle-tap picker (pill buttons used instead for Phase 1; SVG picker is a future enhancement)
- Intensity heatmap by volume (architecture supports it, implementation deferred)
- More granular anatomy beyond 14 groups (structure is extensible, content deferred)
- i18n / multi-language support
