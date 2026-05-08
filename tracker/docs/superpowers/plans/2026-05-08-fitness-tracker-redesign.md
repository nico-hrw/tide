# Fitness Tracker Redesign & Muscle Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the tracker app with a white UI, inline workout flow on the home page, UX fixes, and an SVG muscle map integrated across pre-workout selection, per-exercise indicators, and post-workout summary.

**Architecture:** A static bundle provides all 14 muscle groups and built-in exercise mappings (always offline). The Zustand store grows two new actions (`cancelWorkout`, updated `startWorkout`). The home page manages three local states (idle → starting → active) with CSS transitions. A single `MuscleSVG` component handles all three integration points via a `size` prop.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind CSS 3, Zustand 5, Lucide React. Dev server: `npm run dev` on port 3001.

---

## File Map

| Status | Path | Purpose |
|--------|------|---------|
| Modify | `tailwind.config.js` | bg token → white |
| Modify | `src/app/globals.css` | background-color → white |
| Modify | `src/types/tracker.ts` | Add MuscleId, MuscleGroup, extend TrackerExercise + ActiveWorkout |
| Create | `src/lib/muscles.ts` | 14 MUSCLE_GROUPS with German names |
| Create | `src/lib/builtinExerciseMuscles.ts` | Static exercise → muscle mapping |
| Create | `src/lib/musclePaths.ts` | SVG path strings per muscle, front + back view |
| Create | `src/components/MuscleSVG.tsx` | Body-map component, size sm/md/lg |
| Modify | `src/store/useTrackerStore.ts` | Add cancelWorkout, extend startWorkout signature |
| Modify | `src/components/SetLogger.tsx` | Disable "Satz hinzufügen" when required fields are zero |
| Create | `src/components/ActiveWorkoutView.tsx` | Extracted workout UI (exercise list, add, finish/cancel) |
| Modify | `src/app/page.tsx` | 3-state inline flow + muscle picker + animations |
| Modify | `src/app/workout/page.tsx` | Redirect to home when active workout exists |
| Modify | `src/app/history/page.tsx` | Add MuscleSVG lg to expanded workout detail |
| Modify | `src/components/ExercisePicker.tsx` | Replace text input with muscle pill picker on exercise creation |

---

## Task 1: Visual Redesign

**Files:**
- Modify: `tailwind.config.js`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Change Tailwind bg token to white**

In `tailwind.config.js`, change:
```js
colors: {
  bg: '#FFFFFF',   // was '#F5F4F0'
  card: '#FFFFFF',
  strength: '#3B82F6',
  cardio: '#22C55E',
  flexibility: '#A855F7',
},
```

- [ ] **Step 2: Change globals.css background to white**

In `src/app/globals.css`, change:
```css
html,
body {
  background-color: #ffffff;
  max-width: 430px;
  margin: 0 auto;
  min-height: 100dvh;
  font-family: Inter, system-ui, sans-serif;
}
```

- [ ] **Step 3: Run dev server and verify white background**

```bash
npm run dev
```

Open `http://localhost:3001`. The app background should be white. All pages (Home, Workout, History, Stats) should have a white background. Cards should still appear with their `shadow-sm`.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.js src/app/globals.css
git commit -m "style: change app background to white"
```

---

## Task 2: Muscle Types

**Files:**
- Modify: `src/types/tracker.ts`

- [ ] **Step 1: Add MuscleId and MuscleGroup types**

Add at the top of `src/types/tracker.ts`, before the existing types:

```typescript
export type MuscleId =
  | 'chest'
  | 'front_shoulder'
  | 'rear_shoulder'
  | 'triceps'
  | 'biceps'
  | 'forearms'
  | 'upper_back'
  | 'lats'
  | 'traps'
  | 'abs'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'calves'

export interface MuscleGroup {
  id: MuscleId
  name: string
  view: 'front' | 'back' | 'both'
}
```

- [ ] **Step 2: Extend TrackerExercise with optional muscle ID fields**

In the `TrackerExercise` interface, add two optional fields after `muscles`:

```typescript
export interface TrackerExercise {
  id: string
  userId: string | null
  name: string
  category: Category
  defaultTrackingType: TrackingType
  muscles: string
  primaryMuscles?: MuscleId[]
  secondaryMuscles?: MuscleId[]
  createdAt: string
}
```

- [ ] **Step 3: Extend ActiveWorkout with targetMuscles**

In the `ActiveWorkout` interface, add `targetMuscles`:

```typescript
export interface ActiveWorkout {
  id: string
  name: string
  startedAt: string
  exercises: ActiveWorkoutExercise[]
  targetMuscles: MuscleId[]
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors (existing code uses `activeWorkout.exercises` etc. — the new optional fields don't break anything).

- [ ] **Step 5: Commit**

```bash
git add src/types/tracker.ts
git commit -m "feat: add MuscleId types and extend TrackerExercise + ActiveWorkout"
```

---

## Task 3: Static Muscle Data

**Files:**
- Create: `src/lib/muscles.ts`
- Create: `src/lib/builtinExerciseMuscles.ts`

- [ ] **Step 1: Create lib/muscles.ts**

```typescript
import type { MuscleGroup } from '@/types/tracker'

export const MUSCLE_GROUPS: MuscleGroup[] = [
  { id: 'chest',          name: 'Brust',             view: 'front' },
  { id: 'front_shoulder', name: 'Schulter (vorne)',   view: 'front' },
  { id: 'rear_shoulder',  name: 'Schulter (hinten)',  view: 'back'  },
  { id: 'triceps',        name: 'Trizeps',            view: 'back'  },
  { id: 'biceps',         name: 'Bizeps',             view: 'front' },
  { id: 'forearms',       name: 'Unterarme',          view: 'front' },
  { id: 'upper_back',     name: 'Oberer Rücken',      view: 'back'  },
  { id: 'lats',           name: 'Latissimus',         view: 'back'  },
  { id: 'traps',          name: 'Trapez',             view: 'back'  },
  { id: 'abs',            name: 'Bauch',              view: 'front' },
  { id: 'glutes',         name: 'Gesäß',              view: 'back'  },
  { id: 'quads',          name: 'Quadrizeps',         view: 'front' },
  { id: 'hamstrings',     name: 'Hamstrings',         view: 'back'  },
  { id: 'calves',         name: 'Waden',              view: 'both'  },
]

export const MUSCLE_BY_ID = Object.fromEntries(
  MUSCLE_GROUPS.map((m) => [m.id, m])
) as Record<string, MuscleGroup>
```

- [ ] **Step 2: Create lib/builtinExerciseMuscles.ts**

```typescript
import type { MuscleId } from '@/types/tracker'

interface MuscleDef {
  primary: MuscleId[]
  secondary: MuscleId[]
}

export const BUILTIN_MUSCLE_MAP: Record<string, MuscleDef> = {
  // Push — Brust
  'Bankdrücken':              { primary: ['chest'], secondary: ['triceps', 'front_shoulder'] },
  'Schrägbankdrücken':        { primary: ['chest'], secondary: ['triceps', 'front_shoulder'] },
  'Liegestütz':               { primary: ['chest'], secondary: ['triceps', 'front_shoulder'] },
  'Kabelflieges':             { primary: ['chest'], secondary: ['front_shoulder'] },
  'Dips':                     { primary: ['triceps', 'chest'], secondary: ['front_shoulder'] },
  'Trizepsdrücken':           { primary: ['triceps'], secondary: [] },
  'Skull Crushers':           { primary: ['triceps'], secondary: [] },

  // Push — Schulter
  'Schulterdrücken':          { primary: ['front_shoulder'], secondary: ['triceps', 'traps'] },
  'Seitheben':                { primary: ['front_shoulder', 'rear_shoulder'], secondary: [] },
  'Frontheben':               { primary: ['front_shoulder'], secondary: [] },

  // Pull — Rücken
  'Klimmzüge':                { primary: ['lats'], secondary: ['biceps', 'upper_back'] },
  'Latziehen':                { primary: ['lats'], secondary: ['biceps', 'upper_back'] },
  'Rudern':                   { primary: ['upper_back', 'lats'], secondary: ['biceps', 'rear_shoulder'] },
  'Kreuzheben':               { primary: ['lats', 'upper_back'], secondary: ['glutes', 'hamstrings'] },
  'Face Pulls':               { primary: ['rear_shoulder', 'traps'], secondary: ['upper_back'] },

  // Pull — Bizeps
  'Bizepscurls':              { primary: ['biceps'], secondary: ['forearms'] },
  'Hammercurls':              { primary: ['biceps', 'forearms'], secondary: [] },

  // Beine
  'Kniebeugen':               { primary: ['quads', 'glutes'], secondary: ['hamstrings', 'calves'] },
  'Beinpresse':               { primary: ['quads', 'glutes'], secondary: ['hamstrings'] },
  'Ausfallschritte':          { primary: ['quads', 'glutes'], secondary: ['hamstrings', 'calves'] },
  'Beinstrecker':             { primary: ['quads'], secondary: [] },
  'Bein Curl':                { primary: ['hamstrings'], secondary: [] },
  'Wadenheben':               { primary: ['calves'], secondary: [] },
  'Hip Thrust':               { primary: ['glutes'], secondary: ['hamstrings'] },

  // Core
  'Plank':                    { primary: ['abs'], secondary: [] },
  'Crunches':                 { primary: ['abs'], secondary: [] },
  'Beinheben':                { primary: ['abs'], secondary: [] },

  // Cardio
  'Laufen':                   { primary: ['quads', 'hamstrings'], secondary: ['calves', 'glutes'] },
  'Radfahren':                { primary: ['quads', 'glutes'], secondary: ['hamstrings', 'calves'] },
}

export function getMusclesForExercise(exerciseName: string): MuscleDef {
  return BUILTIN_MUSCLE_MAP[exerciseName] ?? { primary: [], secondary: [] }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/muscles.ts src/lib/builtinExerciseMuscles.ts
git commit -m "feat: add static muscle group data and built-in exercise muscle mapping"
```

---

## Task 4: SVG Path Data

**Files:**
- Create: `src/lib/musclePaths.ts`

- [ ] **Step 1: Create lib/musclePaths.ts**

All paths use viewBox `"0 0 60 100"`. Bilateral muscles (left + right) use two subpaths separated by space. Calves appear on both views.

```typescript
import type { MuscleId } from '@/types/tracker'

export interface MusclePath {
  front?: string
  back?: string
}

export const MUSCLE_PATHS: Record<MuscleId, MusclePath> = {
  chest: {
    front: 'M17,14 L43,14 L41,28 L19,28 Z',
  },
  front_shoulder: {
    front: 'M8,13 L17,13 L17,27 L9,27 Z M43,13 L52,13 L51,27 L43,27 Z',
  },
  rear_shoulder: {
    back: 'M8,13 L17,13 L17,25 L9,25 Z M43,13 L52,13 L51,25 L43,25 Z',
  },
  triceps: {
    back: 'M9,26 L17,26 L16,42 L10,42 Z M43,26 L51,26 L50,42 L44,42 Z',
  },
  biceps: {
    front: 'M9,28 L17,28 L16,43 L10,43 Z M43,28 L51,28 L50,43 L44,43 Z',
  },
  forearms: {
    front: 'M10,44 L16,44 L15,56 L11,56 Z M44,44 L50,44 L49,56 L45,56 Z',
  },
  upper_back: {
    back: 'M19,20 L41,20 L39,37 L21,37 Z',
  },
  lats: {
    back: 'M11,22 L19,22 L18,46 L10,46 Z M41,22 L49,22 L50,46 L42,46 Z',
  },
  traps: {
    back: 'M17,11 L43,11 L41,19 L19,19 Z',
  },
  abs: {
    front: 'M20,29 L40,29 L39,54 L21,54 Z',
  },
  glutes: {
    back: 'M18,57 L42,57 L41,71 L19,71 Z',
  },
  quads: {
    front: 'M18,59 L29,59 L28,84 L17,84 Z M31,59 L42,59 L43,84 L32,84 Z',
  },
  hamstrings: {
    back: 'M18,72 L29,72 L28,90 L17,90 Z M31,72 L42,72 L43,90 L32,90 Z',
  },
  calves: {
    front: 'M18,85 L28,85 L27,99 L18,99 Z M32,85 L42,85 L42,99 L33,99 Z',
    back:  'M18,91 L28,91 L27,99 L18,99 Z M32,91 L42,91 L42,99 L33,99 Z',
  },
}

```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/musclePaths.ts
git commit -m "feat: add SVG path data for muscle body map"
```

---

## Task 5: MuscleSVG Component

**Files:**
- Create: `src/components/MuscleSVG.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'
import { MUSCLE_GROUPS } from '@/lib/muscles'
import { MUSCLE_PATHS } from '@/lib/musclePaths'
import type { MuscleId } from '@/types/tracker'

interface MuscleSVGProps {
  primary: MuscleId[]
  secondary: MuscleId[]
  interactive?: boolean
  onToggle?: (id: MuscleId) => void
  size: 'sm' | 'md' | 'lg'
}

const SIZE_MAP = {
  sm: { w: 30, h: 50 },
  md: { w: 55, h: 92 },
  lg: { w: 72, h: 120 },
}

function getFill(id: MuscleId, primary: MuscleId[], secondary: MuscleId[]): string {
  if (primary.includes(id)) return '#111111'
  if (secondary.includes(id)) return '#111111'
  return '#E5E7EB'
}

function getOpacity(id: MuscleId, primary: MuscleId[], secondary: MuscleId[]): number {
  if (primary.includes(id)) return 1
  if (secondary.includes(id)) return 0.3
  return 1
}

interface FigureProps {
  view: 'front' | 'back'
  primary: MuscleId[]
  secondary: MuscleId[]
  interactive: boolean
  onToggle?: (id: MuscleId) => void
  width: number
  height: number
}

function Figure({ view, primary, secondary, interactive, onToggle, width, height }: FigureProps) {
  const muscles = MUSCLE_GROUPS.filter((m) => m.view === view || m.view === 'both')

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 60 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Head outline */}
      <circle
        cx="30" cy="7" r="5.5"
        fill="#E5E7EB"
      />
      {muscles.map((muscle) => {
        const pathData = view === 'front'
          ? MUSCLE_PATHS[muscle.id].front
          : MUSCLE_PATHS[muscle.id].back
        if (!pathData) return null
        const fill = getFill(muscle.id, primary, secondary)
        const opacity = getOpacity(muscle.id, primary, secondary)
        return (
          <path
            key={muscle.id}
            d={pathData}
            fill={fill}
            opacity={opacity}
            style={interactive ? { cursor: 'pointer' } : undefined}
            onClick={interactive && onToggle ? () => onToggle(muscle.id) : undefined}
          />
        )
      })}
    </svg>
  )
}

export default function MuscleSVG({ primary, secondary, interactive = false, onToggle, size }: MuscleSVGProps) {
  const dims = SIZE_MAP[size]

  if (size === 'sm') {
    return (
      <Figure
        view="front"
        primary={primary}
        secondary={secondary}
        interactive={interactive}
        onToggle={onToggle}
        width={dims.w}
        height={dims.h}
      />
    )
  }

  return (
    <div style={{ display: 'flex', gap: size === 'lg' ? 16 : 8, alignItems: 'flex-start' }}>
      <div style={{ textAlign: 'center' }}>
        {size === 'lg' && (
          <p style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 4 }}>Vorne</p>
        )}
        <Figure
          view="front"
          primary={primary}
          secondary={secondary}
          interactive={interactive}
          onToggle={onToggle}
          width={dims.w}
          height={dims.h}
        />
      </div>
      <div style={{ textAlign: 'center' }}>
        {size === 'lg' && (
          <p style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 4 }}>Hinten</p>
        )}
        <Figure
          view="back"
          primary={primary}
          secondary={secondary}
          interactive={interactive}
          onToggle={onToggle}
          width={dims.w}
          height={dims.h}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Quick smoke test in browser**

Temporarily add to `src/app/page.tsx` (top of return, remove after checking):
```tsx
import MuscleSVG from '@/components/MuscleSVG'
// inside JSX:
<MuscleSVG size="lg" primary={['chest', 'triceps']} secondary={['front_shoulder']} />
```
Open `http://localhost:3001`. You should see two body figures: chest and triceps dark, front shoulder lighter gray. All other muscles light gray. Remove the test code.

- [ ] **Step 4: Commit**

```bash
git add src/components/MuscleSVG.tsx
git commit -m "feat: add MuscleSVG body map component (sm/md/lg sizes)"
```

---

## Task 6: Store Extensions

**Files:**
- Modify: `src/store/useTrackerStore.ts`

- [ ] **Step 1: Add cancelWorkout to the TrackerState interface**

In the `TrackerState` interface, add after `finishWorkout`:
```typescript
cancelWorkout: () => Promise<void>
```

- [ ] **Step 2: Update startWorkout signature**

In the `TrackerState` interface, change:
```typescript
startWorkout: (name: string, targetMuscles?: MuscleId[]) => Promise<void>
```

Add the import at top of the file:
```typescript
import type {
  TrackerExercise,
  TrackerWorkout,
  ActiveWorkout,
  ActiveWorkoutExercise,
  TrackerSet,
  SyncQueueEntry,
  BulkWorkoutPayload,
  MuscleId,
} from '@/types/tracker'
```

- [ ] **Step 3: Implement the updated startWorkout**

Replace the existing `startWorkout` implementation:
```typescript
startWorkout: async (name, targetMuscles = []) => {
  const workout: ActiveWorkout = {
    id: uid(),
    name,
    startedAt: new Date().toISOString(),
    exercises: [],
    targetMuscles,
  }
  await idb.saveActiveWorkout(workout)
  set({ activeWorkout: workout })
},
```

- [ ] **Step 4: Implement cancelWorkout**

Add after `finishWorkout`:
```typescript
cancelWorkout: async () => {
  await idb.clearActiveWorkout()
  set({ activeWorkout: null })
},
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. The existing call `startWorkout(name)` in `workout/page.tsx` is still valid since `targetMuscles` is optional.

- [ ] **Step 6: Commit**

```bash
git add src/store/useTrackerStore.ts
git commit -m "feat: add cancelWorkout action and targetMuscles to startWorkout"
```

---

## Task 7: Empty Set Prevention

**Files:**
- Modify: `src/components/SetLogger.tsx`

- [ ] **Step 1: Add isAddDisabled computation**

In `SetLogger.tsx`, add this computed variable directly above the `return` statement (after all the state declarations and handlers):

```typescript
const isAddDisabled = (() => {
  if (type === 'weight_reps') {
    return (!weightKg || weightKg === 0) && (!reps || reps === 0)
  }
  if (type === 'distance_time') {
    const secs = ((durationMin ?? 0) * 60) + (durationSec ?? 0)
    return (!distanceKm || distanceKm === 0) && secs === 0
  }
  // time_only
  const secs = ((durationMin ?? 0) * 60) + (durationSec ?? 0)
  return secs === 0
})()
```

- [ ] **Step 2: Apply disabled state to the button**

Find the "Satz hinzufügen" button and update it:
```tsx
<button
  onClick={() => { void handleAddSet() }}
  disabled={isAddDisabled}
  className="w-full bg-black text-white rounded-2xl py-4 font-semibold text-base mt-4 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
>
  + Satz hinzufügen
</button>
```

- [ ] **Step 3: Verify in browser**

Run `npm run dev`, navigate to Workout, start a workout, add an exercise and open the SetLogger. The "Satz hinzufügen" button should be grayed out at 40% opacity. Enter a weight or reps value — the button becomes active. Clear both back to zero — it goes disabled again.

- [ ] **Step 4: Commit**

```bash
git add src/components/SetLogger.tsx
git commit -m "fix: disable set submit button when all required fields are zero"
```

---

## Task 8: Extract ActiveWorkoutView Component

**Files:**
- Create: `src/components/ActiveWorkoutView.tsx`
- Modify: `src/app/workout/page.tsx`

This extracts the active-workout UI from `workout/page.tsx` into a reusable component so the home page can embed it.

- [ ] **Step 1: Create ActiveWorkoutView.tsx**

```typescript
'use client'
import { useEffect, useState } from 'react'
import { Plus, CheckCircle, X } from 'lucide-react'
import { useTrackerStore } from '@/store/useTrackerStore'
import ExercisePicker from '@/components/ExercisePicker'
import SetLogger from '@/components/SetLogger'
import MuscleSVG from '@/components/MuscleSVG'
import { getMusclesForExercise } from '@/lib/builtinExerciseMuscles'
import type { ActiveWorkoutExercise, TrackerExercise } from '@/types/tracker'

interface ActiveWorkoutViewProps {
  onFinish?: () => void
}

function useElapsedTimer(startedAt: string): string {
  const [elapsed, setElapsed] = useState('')
  useEffect(() => {
    function update() {
      const ms = Date.now() - new Date(startedAt).getTime()
      const totalSecs = Math.floor(ms / 1000)
      const m = Math.floor(totalSecs / 60)
      const s = totalSecs % 60
      setElapsed(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [startedAt])
  return elapsed
}

export default function ActiveWorkoutView({ onFinish }: ActiveWorkoutViewProps) {
  const { activeWorkout, addExerciseToWorkout, removeExerciseFromWorkout, finishWorkout, cancelWorkout } =
    useTrackerStore()
  const [showPicker, setShowPicker] = useState(false)
  const [activeExercise, setActiveExercise] = useState<ActiveWorkoutExercise | null>(null)
  const [confirmFinish, setConfirmFinish] = useState(false)

  const elapsed = useElapsedTimer(activeWorkout?.startedAt ?? new Date().toISOString())

  if (!activeWorkout) return null

  async function handleSelectExercise(ex: TrackerExercise) {
    const newWe = await addExerciseToWorkout(ex)
    if (newWe) setActiveExercise(newWe)
  }

  async function handleFinish() {
    await finishWorkout()
    onFinish?.()
  }

  async function handleCancel() {
    await cancelWorkout()
  }

  const hasExercises = activeWorkout.exercises.length > 0

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="bg-black text-white rounded-2xl px-4 py-3 mb-4 flex items-center justify-between">
        <div>
          <div className="font-semibold text-base">{activeWorkout.name}</div>
          <div className="text-xs text-white/60 mt-0.5">{elapsed}</div>
        </div>
      </div>

      {/* Exercise list */}
      <div className="flex flex-col gap-3 mb-4">
        {activeWorkout.exercises.map((we) => {
          const completedSets = we.sets.filter((s) => s.completed).length
          const muscles = we.exercise.primaryMuscles?.length
            ? { primary: we.exercise.primaryMuscles, secondary: we.exercise.secondaryMuscles ?? [] }
            : getMusclesForExercise(we.exercise.name)

          return (
            <div key={we.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-2">
              <button
                onClick={() => setActiveExercise(we)}
                className="flex-1 text-left flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        we.exercise.category === 'strength'
                          ? 'bg-blue-500'
                          : we.exercise.category === 'cardio'
                            ? 'bg-green-500'
                            : 'bg-purple-500'
                      }`}
                    />
                    <span className="font-semibold text-black">{we.exercise.name}</span>
                  </div>
                  <span className="text-xs text-gray-500 ml-4">{completedSets} Sätze</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {completedSets > 0 && <CheckCircle size={18} className="text-green-500" />}
                  <MuscleSVG
                    size="sm"
                    primary={muscles.primary}
                    secondary={muscles.secondary}
                  />
                </div>
              </button>
              <button
                onClick={() => removeExerciseFromWorkout(we.id)}
                className="p-1 text-gray-300 hover:text-red-400 shrink-0"
              >
                <X size={16} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Add exercise */}
      <button
        onClick={() => setShowPicker(true)}
        className="w-full border-2 border-dashed border-gray-200 rounded-2xl py-4 flex items-center justify-center gap-2 text-gray-500 mb-6"
      >
        <Plus size={18} /> Übung hinzufügen
      </button>

      {/* Finish / Cancel */}
      {hasExercises ? (
        !confirmFinish ? (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setConfirmFinish(true)}
              className="w-full bg-black text-white rounded-2xl py-4 font-semibold text-base"
            >
              Workout abschließen
            </button>
            <button
              onClick={handleCancel}
              className="w-full text-gray-400 text-sm py-2"
            >
              Abbrechen
            </button>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-2xl p-4 flex flex-col gap-3">
            <p className="text-sm text-gray-700 text-center font-medium">Workout wirklich beenden?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmFinish(false)}
                className="flex-1 border border-gray-200 rounded-xl py-3 text-sm text-gray-500"
              >
                Zurück
              </button>
              <button
                onClick={handleFinish}
                className="flex-1 bg-black text-white rounded-xl py-3 text-sm font-semibold"
              >
                Beenden ✓
              </button>
            </div>
          </div>
        )
      ) : (
        <button
          onClick={handleCancel}
          className="w-full border border-gray-200 text-gray-500 rounded-2xl py-4 text-sm font-medium"
        >
          Abbrechen
        </button>
      )}

      {showPicker && (
        <ExercisePicker onSelect={handleSelectExercise} onClose={() => setShowPicker(false)} />
      )}
      {activeExercise && (
        <SetLogger
          workoutExercise={
            activeWorkout.exercises.find((e) => e.id === activeExercise.id) ?? activeExercise
          }
          onClose={() => setActiveExercise(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update workout/page.tsx to use the component**

Replace the entire contents of `src/app/workout/page.tsx`:

```typescript
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useTrackerStore } from '@/store/useTrackerStore'
import ActiveWorkoutView from '@/components/ActiveWorkoutView'

export default function WorkoutPage() {
  const { activeWorkout, startWorkout, fetchExercises } = useTrackerStore()
  const router = useRouter()
  const [workoutName, setWorkoutName] = useState('')

  useEffect(() => {
    fetchExercises()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleStart() {
    const name = workoutName.trim() || 'Training'
    await startWorkout(name)
  }

  if (activeWorkout) {
    return (
      <div className="px-4 pt-12 pb-24">
        <ActiveWorkoutView onFinish={() => router.push('/')} />
      </div>
    )
  }

  return (
    <div className="px-4 pt-12">
      <h1 className="text-2xl font-bold mb-6">Neues Workout</h1>
      <input
        type="text"
        value={workoutName}
        onChange={(e) => setWorkoutName(e.target.value)}
        placeholder="Name (z.B. Push Day)"
        className="w-full bg-white rounded-2xl px-4 py-4 text-lg font-medium outline-none shadow-sm mb-4"
      />
      <button
        onClick={handleStart}
        className="w-full bg-black text-white rounded-2xl py-4 font-semibold text-base"
      >
        Starten
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Verify dev server and workout page**

```bash
npm run dev
```

Navigate to the Workout tab. The flow should still work: name input → start → exercise list with small muscle icons next to each exercise, cancel button when no exercises, abschließen when exercises exist.

- [ ] **Step 4: Commit**

```bash
git add src/components/ActiveWorkoutView.tsx src/app/workout/page.tsx
git commit -m "feat: extract ActiveWorkoutView component with muscle icons and cancel button"
```

---

## Task 9: Inline Workout Flow — Home Page

**Files:**
- Modify: `src/app/page.tsx`

This replaces the current `router.push('/workout')` buttons with an inline 3-state flow.

- [ ] **Step 1: Replace app/page.tsx**

```typescript
'use client'
import { useEffect, useRef, useState } from 'react'
import { useTrackerStore } from '@/store/useTrackerStore'
import StatCard from '@/components/StatCard'
import SyncStatus from '@/components/SyncStatus'
import ActiveWorkoutView from '@/components/ActiveWorkoutView'
import { MUSCLE_GROUPS } from '@/lib/muscles'
import { calcStreak, workoutsThisWeek, volumeThisWeek } from '@/lib/analytics'
import { apiFetch } from '@/lib/api'
import type { MuscleId } from '@/types/tracker'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Guten Morgen'
  if (h < 18) return 'Guten Tag'
  return 'Guten Abend'
}

export default function HomePage() {
  const { workouts, activeWorkout, fetchWorkouts, startWorkout, fetchExercises } = useTrackerStore()
  const [username, setUsername] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [workoutName, setWorkoutName] = useState('')
  const [targetMuscles, setTargetMuscles] = useState<MuscleId[]>([])
  const [contentVisible, setContentVisible] = useState(true)
  const hasActive = activeWorkout !== null

  useEffect(() => {
    fetchWorkouts()
    fetchExercises()
    apiFetch('/auth/me')
      .then((r) => r.json())
      .then((data) => setUsername(data.username ?? null))
      .catch(() => null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Animate idle content out when workout becomes active
  useEffect(() => {
    if (hasActive) {
      setContentVisible(false)
    } else {
      // Small delay so the transition plays on re-entry
      const id = setTimeout(() => setContentVisible(true), 50)
      return () => clearTimeout(id)
    }
  }, [hasActive])

  const streak = calcStreak(workouts)
  const thisWeek = workoutsThisWeek(workouts)
  const weekVol = volumeThisWeek(workouts)

  function toggleMuscle(id: MuscleId) {
    setTargetMuscles((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    )
  }

  async function handleStart() {
    const name = workoutName.trim() || 'Training'
    await startWorkout(name, targetMuscles)
    setStarting(false)
    setWorkoutName('')
    setTargetMuscles([])
  }

  function handleCancelStart() {
    setStarting(false)
    setWorkoutName('')
    setTargetMuscles([])
  }

  // Active workout view
  if (hasActive) {
    return (
      <div
        className="px-4 pt-12 pb-24 transition-opacity duration-300"
        style={{ opacity: contentVisible ? 0 : 1 }}
        // Re-show after mount
        ref={(el) => { if (el) requestAnimationFrame(() => el.style.opacity = '1') }}
      >
        <ActiveWorkoutView />
      </div>
    )
  }

  // Starting state (muscle picker)
  if (starting) {
    return (
      <div className="px-4 pt-12 pb-24">
        <h1 className="text-2xl font-bold text-black mb-1">Neues Workout</h1>
        <p className="text-sm text-gray-500 mb-6">
          {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>

        <input
          type="text"
          value={workoutName}
          onChange={(e) => setWorkoutName(e.target.value)}
          placeholder="Name (z.B. Push Day)"
          className="w-full bg-white rounded-2xl px-4 py-4 text-lg font-medium outline-none shadow-sm mb-6"
          autoFocus
        />

        <p className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wide">
          Heute trainieren
        </p>
        <div className="flex flex-wrap gap-2 mb-8">
          {MUSCLE_GROUPS.map((m) => {
            const active = targetMuscles.includes(m.id)
            return (
              <button
                key={m.id}
                onClick={() => toggleMuscle(m.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  active
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {active ? '✓ ' : ''}{m.name}
              </button>
            )
          })}
        </div>

        <button
          onClick={handleStart}
          className="w-full bg-black text-white rounded-2xl py-4 font-semibold text-base mb-3"
        >
          Starten →
        </button>
        <button
          onClick={handleCancelStart}
          className="w-full text-gray-400 text-sm py-2"
        >
          Zurück
        </button>
      </div>
    )
  }

  // Idle state
  return (
    <div
      className="px-4 pt-12 pb-4 transition-all duration-300"
      style={{ opacity: contentVisible ? 1 : 0, transform: contentVisible ? 'translateY(0)' : 'translateY(-16px)' }}
    >
      <h1 className="text-2xl font-bold text-black mb-0.5">
        {greeting()}{username ? `, ${username}` : ''} 👋
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="Streak" value={streak} icon="🔥" />
        <StatCard label="Diese Woche" value={thisWeek} />
        <StatCard
          label="Volumen"
          value={weekVol > 0 ? `${Math.round(weekVol / 1000)}t` : '—'}
        />
      </div>

      <SyncStatus />

      <div className="mt-6">
        <button
          onClick={() => setStarting(true)}
          className="w-full bg-black text-white rounded-2xl py-4 font-semibold text-base"
        >
          + Neues Workout starten
        </button>
      </div>

      {workouts.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wide">
            Letzte Sessions
          </h2>
          <div className="flex flex-col gap-2">
            {workouts.slice(0, 3).map((w) => (
              <div key={w.id} className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="font-semibold text-black">{w.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {new Date(w.startedAt).toLocaleDateString('de-DE')} ·{' '}
                  {w.exercises.length} Übungen
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify the full flow in browser**

```bash
npm run dev
```

Test:
1. Home page shows idle state (greeting, stats, button) — background white
2. Tap "Neues Workout starten" → muscle picker appears with name input and muscle pills
3. Select muscles, enter a name, tap "Starten →" → workout starts inline, greeting/stats gone
4. Timer counts up in workout header
5. Small muscle icons visible next to each exercise card
6. With 0 exercises: "Abbrechen" button → returns to idle
7. With exercises: "Workout abschließen" + confirm dialog → finishes, returns to idle

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: inline workout flow on home page with 3-state UI and muscle picker"
```

---

## Task 10: Post-Workout Muscle Summary in History

**Files:**
- Modify: `src/app/history/page.tsx`

- [ ] **Step 1: Add muscle aggregation helper**

Add this function at the top of `src/app/history/page.tsx` (after imports):

```typescript
import MuscleSVG from '@/components/MuscleSVG'
import { getMusclesForExercise } from '@/lib/builtinExerciseMuscles'
import type { MuscleId, TrackerWorkout } from '@/types/tracker'
import { MUSCLE_BY_ID } from '@/lib/muscles'

function aggregateMuscles(w: TrackerWorkout): { primary: MuscleId[]; secondary: MuscleId[] } {
  const primary = new Set<MuscleId>()
  const secondary = new Set<MuscleId>()
  for (const we of w.exercises) {
    const muscles = we.exercise?.primaryMuscles?.length
      ? { primary: we.exercise.primaryMuscles, secondary: we.exercise.secondaryMuscles ?? [] }
      : getMusclesForExercise(we.exercise?.name ?? '')
    muscles.primary.forEach((m) => primary.add(m))
    muscles.secondary.forEach((m) => {
      if (!primary.has(m)) secondary.add(m)
    })
  }
  return { primary: Array.from(primary), secondary: Array.from(secondary) }
}
```

- [ ] **Step 2: Add MuscleSVG to the expanded workout detail**

Inside the `{expanded === w.id && ...}` block in history/page.tsx, add the muscle summary after the delete button and before the exercise list:

```tsx
{expanded === w.id && (
  <div className="px-4 pb-4 border-t border-gray-50">
    <button
      onClick={() => { if (confirm('Workout löschen?')) deleteWorkout(w.id) }}
      className="flex items-center gap-1.5 text-xs text-red-400 mt-3 mb-3"
    >
      <Trash2 size={13} /> Workout löschen
    </button>

    {/* Muscle summary */}
    {(() => {
      const muscles = aggregateMuscles(w)
      if (muscles.primary.length === 0 && muscles.secondary.length === 0) return null
      return (
        <div className="mb-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Trainierte Muskeln</p>
          <div className="flex items-start gap-4">
            <MuscleSVG size="lg" primary={muscles.primary} secondary={muscles.secondary} />
            <div className="flex flex-col gap-1 mt-1">
              {muscles.primary.map((id) => (
                <div key={id} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-black" />
                  <span className="text-xs text-gray-700">{MUSCLE_BY_ID[id]?.name ?? id}</span>
                </div>
              ))}
              {muscles.secondary.map((id) => (
                <div key={id} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-gray-300" />
                  <span className="text-xs text-gray-400">{MUSCLE_BY_ID[id]?.name ?? id}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    })()}

    {/* existing exercise list */}
    {w.exercises.map((we) => (
      // ... existing code unchanged
    ))}
  </div>
)}
```

**Important:** Keep the existing exercise list (`{w.exercises.map(...)}`) exactly as it was — only insert the muscle summary block above it.

- [ ] **Step 3: Verify in browser**

Open History, expand a workout. You should see:
- "Trainierte Muskeln" heading
- Front + back SVG figures with the worked muscles highlighted
- Legend list with black dots for primary, gray dots for secondary muscles

If no muscles are resolved (exercise not in BUILTIN_MUSCLE_MAP and no API data), the section is hidden — that's correct.

- [ ] **Step 4: Commit**

```bash
git add src/app/history/page.tsx
git commit -m "feat: add muscle summary with SVG body map to workout history detail"
```

---

## Task 11: Muscle Picker in ExercisePicker

**Files:**
- Modify: `src/components/ExercisePicker.tsx`

Replace the free-text "Muskeln" input with structured muscle pill selection when creating a new exercise.

- [ ] **Step 1: Add muscle state and imports**

At the top of `ExercisePicker.tsx`, add imports:
```typescript
import { MUSCLE_GROUPS } from '@/lib/muscles'
import type { MuscleId } from '@/types/tracker'
```

In the component state declarations (alongside `newName`, `newCategory` etc.), add:
```typescript
const [newPrimaryMuscles, setNewPrimaryMuscles] = useState<MuscleId[]>([])
```

Remove `newMuscles` and `setNewMuscles` state (and the input that uses it).

- [ ] **Step 2: Update createExercise call**

The store's `createExercise` currently accepts a `muscles` string. Update the call in `handleCreate` to pass the text representation derived from selected muscle IDs, plus store the IDs:

```typescript
async function handleCreate() {
  if (!newName.trim()) return
  setCreating(true)
  try {
    await createExercise(
      newName.trim(),
      newCategory,
      newTracking,
      newPrimaryMuscles.join(', '), // legacy text field, kept for API compatibility
    )
    setNewName('')
    setNewPrimaryMuscles([])
    setShowCreate(false)
  } finally {
    setCreating(false)
  }
}
```

- [ ] **Step 3: Replace the muscle text input with pill selector**

In the create form JSX, replace:
```tsx
<input
  type="text" value={newMuscles} onChange={(e) => setNewMuscles(e.target.value)}
  placeholder="Muskeln (z.B. Brust, Trizeps)"
  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none border border-gray-200"
/>
```

With:
```tsx
<div>
  <p className="text-xs text-gray-500 mb-1.5">Muskeln (Primär)</p>
  <div className="flex flex-wrap gap-1.5">
    {MUSCLE_GROUPS.map((m) => {
      const active = newPrimaryMuscles.includes(m.id)
      return (
        <button
          key={m.id}
          type="button"
          onClick={() =>
            setNewPrimaryMuscles((prev) =>
              prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id]
            )
          }
          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
            active
              ? 'bg-black text-white border-black'
              : 'bg-white text-gray-600 border-gray-200'
          }`}
        >
          {m.name}
        </button>
      )
    })}
  </div>
</div>
```

- [ ] **Step 4: Verify in browser**

Open Workout, open ExercisePicker, tap "Neue Übung". The muscle input should now be a set of pill buttons. Select "Brust" and "Trizeps", create the exercise. It should appear in the list with `muscles: "chest, triceps"` (visible in the API or DevTools network tab).

- [ ] **Step 5: Note on user-created exercise muscle icons**

Custom exercises created here will **not** show muscle icons until Task 12 (backend) is complete. The muscle IDs are currently passed as a comma-separated text string to the `muscles` field, but `primaryMuscles[]` is not yet persisted or returned by the API. Built-in exercises (in `BUILTIN_MUSCLE_MAP`) work immediately. This is expected behavior per the spec.

- [ ] **Step 6: Commit**

```bash
git add src/components/ExercisePicker.tsx
git commit -m "feat: replace free-text muscle input with pill selector in exercise creation"
```

---

## Task 12: Backend — Go API

**Note:** This task requires access to the Go backend codebase. The frontend is already fully functional without these changes (falls back to static muscle data). Do this task when you are ready to persist muscle IDs server-side.

**Files to modify in the Go codebase:**
- The `exercises` database table definition
- The exercises HTTP handler (GET, POST, PATCH)
- The exercise model/struct

- [ ] **Step 1: Add columns to exercises table**

Add a database migration:
```sql
ALTER TABLE exercises
  ADD COLUMN primary_muscles TEXT NOT NULL DEFAULT '',
  ADD COLUMN secondary_muscles TEXT NOT NULL DEFAULT '';
```

`primary_muscles` and `secondary_muscles` store comma-separated `MuscleId` strings (e.g., `"chest,triceps"`).

- [ ] **Step 2: Update exercise struct**

In the Go exercise struct, add:
```go
PrimaryMuscles   []string `json:"primary_muscles"`
SecondaryMuscles []string `json:"secondary_muscles"`
```

Use a custom scanner or split/join helpers to convert between `[]string` and the comma-separated DB column.

- [ ] **Step 3: Update GET /tracker/exercises**

Include `primary_muscles` and `secondary_muscles` in the JSON response. The frontend mapper in `useTrackerStore.fetchExercises()` already reads snake_case — add:
```typescript
primaryMuscles: (e.primary_muscles ?? '').split(',').filter(Boolean) as MuscleId[],
secondaryMuscles: (e.secondary_muscles ?? '').split(',').filter(Boolean) as MuscleId[],
```
to the exercise mapping in `fetchExercises` in `src/store/useTrackerStore.ts`.

- [ ] **Step 4: Update POST /tracker/exercises and PATCH /tracker/exercises/:id**

Accept `primary_muscles` and `secondary_muscles` in the request body. Write them to the database.

Update `createExercise` in `src/store/useTrackerStore.ts` to send muscle IDs:
```typescript
createExercise: async (name, category, defaultTrackingType, muscles = '', primaryMuscles = [], secondaryMuscles = []) => {
  const res = await apiFetch('/tracker/exercises', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      category,
      default_tracking_type: defaultTrackingType,
      muscles,
      primary_muscles: primaryMuscles,
      secondary_muscles: secondaryMuscles,
    }),
  })
  if (!res.ok) throw new Error('Failed to create exercise')
  await get().fetchExercises()
},
```

Update the `createExercise` signature in both `TrackerState` interface and the `ExercisePicker` call to pass `newPrimaryMuscles`.

- [ ] **Step 5: Verify end-to-end**

Create a custom exercise with muscles selected. Refresh the page. The exercise should still show its muscle icons (now loaded from API, not from `BUILTIN_MUSCLE_MAP`).

- [ ] **Step 6: Commit**

```bash
# In the Go repo:
git add <migration file> <exercise handler> <exercise model>
git commit -m "feat: add primary_muscles and secondary_muscles to exercises API"

# In the frontend:
git add src/store/useTrackerStore.ts src/components/ExercisePicker.tsx
git commit -m "feat: wire muscle IDs to backend exercise API"
```

---

## Self-Review Checklist

- [x] Visual redesign (Task 1) — bg token + globals.css
- [x] Inline flow, 3 states (Task 9) — idle / starting / active
- [x] Muscle picker pre-workout (Task 9 — Starting state)
- [x] Per-exercise muscle icon during workout (Task 8 — ActiveWorkoutView)
- [x] Post-workout muscle summary (Task 10 — History page)
- [x] Cancel button (Task 8 — ActiveWorkoutView, 0 exercises = cancel, n exercises = abschließen + cancel link)
- [x] Empty set prevention (Task 7 — SetLogger)
- [x] cancelWorkout store action (Task 6)
- [x] targetMuscles in ActiveWorkout (Task 2 + 6)
- [x] Static offline data (Tasks 3 + 4 — always bundled)
- [x] ExercisePicker muscle pills (Task 11)
- [x] Backend (Task 12 — deferred, frontend works without it)
- [x] Timer in active workout header (Task 8 — useElapsedTimer hook)
