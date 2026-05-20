# Sport Tracker UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the tracker app from a plain white mockup to a polished dark-mode app with Outfit font, coral `#FF6B3D` + electric blue `#5BB8FF` accents, and a 3-tab nav with Home+Workout merged into one animated screen.

**Architecture:** Pure visual transformation of existing components — no data model or API changes. Two new components (`FriendsWidget`, `WeeklyChart`) are extracted to keep `page.tsx` manageable. Home page gains a `'idle' | 'starting' | 'active'` state machine that drives CSS fly-up transitions when a workout is started. All panels are absolutely positioned inside a `min-height: 100dvh` wrapper and shown/hidden via opacity + transform transitions.

**Tech Stack:** Next.js 14+, React 18, TypeScript, Tailwind CSS (arbitrary values), Lucide React icons, Recharts

**Spec:** `docs/superpowers/specs/2026-05-20-sport-tracker-redesign.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/app/globals.css` | Modify | Dark background, Outfit font, antialiasing |
| `src/app/layout.tsx` | Modify | Load Outfit via `next/font/google`, pb-[50px] |
| `src/components/BottomNav.tsx` | Modify | 3 tabs (Home/Verlauf/Stats), dark style |
| `src/components/MuscleSVG.tsx` | Modify | Add future-interactivity TODO comment, darken inactive fills |
| `src/components/FriendsWidget.tsx` | **Create** | Blue social widget, auto-rotating mock activities |
| `src/components/WeeklyChart.tsx` | **Create** | White bar chart card with average dashed line |
| `src/app/page.tsx` | Modify | Full Home redesign: idle/starting/active state machine |
| `src/components/ActiveWorkoutView.tsx` | Modify | Dark theme, orange header card |
| `src/components/ExercisePicker.tsx` | Modify | Dark bottom sheet |
| `src/components/SetLogger.tsx` | Modify | Dark bottom sheet, orange sticky CTA |
| `src/app/workout/page.tsx` | Modify | Redirect to `/` (merged into Home) |
| `src/app/history/page.tsx` | Modify | Dark theme pass |
| `src/app/stats/page.tsx` | Modify | Dark theme + Recharts restyled |

---

## Task 1: Design Foundation — globals.css + layout + font

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Update globals.css**

Replace the entire file contents:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html,
body {
  background-color: #1E1E24;
  color: #F9FAFB;
  max-width: 430px;
  margin: 0 auto;
  min-height: 100dvh;
  font-family: 'Outfit', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 2: Update layout.tsx to load Outfit via next/font**

```tsx
import type { Metadata } from 'next'
import { Outfit } from 'next/font/google'
import './globals.css'
import BottomNav from '@/components/BottomNav'
import SyncInit from '@/components/SyncInit'

const outfit = Outfit({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Tide Tracker',
  description: 'Sport Tracker',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={outfit.className}>
      <body>
        <main className="min-h-dvh pb-[50px]">{children}</main>
        <BottomNav />
        <SyncInit />
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit` from `tracker/`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat: dark foundation — Outfit font, #1E1E24 background"
```

---

## Task 2: BottomNav — 3 Tabs, Dark Style

**Files:**
- Modify: `src/components/BottomNav.tsx`

- [ ] **Step 1: Replace BottomNav with 3-tab dark version**

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, History, BarChart2 } from 'lucide-react'

const tabs = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/history', label: 'Verlauf', icon: History },
  { href: '/stats', label: 'Stats', icon: BarChart2 },
]

export default function BottomNav() {
  const path = usePathname()
  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] h-[50px] flex justify-around items-center pb-1 z-50"
      style={{ background: '#18181F', borderTop: '1px solid #2E2E38' }}
    >
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = path === href
        return (
          <Link key={href} href={href} className="flex flex-col items-center gap-0.5 px-4 py-1">
            <Icon
              size={20}
              color={active ? '#FF6B3D' : '#4B5563'}
              strokeWidth={active ? 2.5 : 1.8}
            />
            <span
              className="text-[7px] font-semibold"
              style={{ color: active ? '#FF6B3D' : '#4B5563' }}
            >
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Start dev server and check nav visually**

Run: `npm run dev` from `tracker/`
Open: `http://localhost:3000`
Verify:
- Dark nav bar at bottom (`#18181F` background, 1px top border)
- 3 tabs: Home (orange active), Verlauf, Stats (grey inactive)
- No "Workout" tab

- [ ] **Step 4: Commit**

```bash
git add src/components/BottomNav.tsx
git commit -m "feat: 3-tab dark nav (Home/Verlauf/Stats)"
```

---

## Task 3: MuscleSVG — Dark Theme Colors + Future-Interactivity Comment

**Files:**
- Modify: `src/components/MuscleSVG.tsx`

- [ ] **Step 1: Update muscle highlight colors and add TODO comment**

Replace `getMuscleStyle` and add the comment block in the `Figure` component:

```tsx
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

function getMuscleStyle(
  id: MuscleId,
  primary: MuscleId[],
  secondary: MuscleId[],
): { fill: string; opacity: number } {
  if (primary.includes(id)) return { fill: '#FF6B3D', opacity: 1 }
  if (secondary.includes(id)) return { fill: '#5BB8FF', opacity: 0.7 }
  return { fill: '#4B5563', opacity: 1 }
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
    <svg width={width} height={height} viewBox="0 0 60 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* TODO: Interactive muscle selection — replace pills with direct SVG tap targets.
          Each <path> receives onClick + visual highlight when interactive=true.
          Also: consider replacing SVG paths with high-quality anatomical PNG/WebP images
          per muscle group for a premium look. The interactive prop and onToggle callback
          are already wired — swap the SVG content when assets are ready. */}
      <circle cx="30" cy="7" r="5.5" fill="#4B5563" />
      {muscles.map((muscle) => {
        const pathData = view === 'front'
          ? MUSCLE_PATHS[muscle.id].front
          : MUSCLE_PATHS[muscle.id].back
        if (!pathData) return null
        const style = getMuscleStyle(muscle.id, primary, secondary)
        return (
          <path
            key={muscle.id}
            d={pathData}
            fill={style.fill}
            opacity={style.opacity}
            style={interactive && onToggle ? { cursor: 'pointer' } : undefined}
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
        {size === 'lg' && <p style={{ fontSize: 10, color: '#6B7280', marginBottom: 4 }}>Vorne</p>}
        <Figure view="front" primary={primary} secondary={secondary} interactive={interactive} onToggle={onToggle} width={dims.w} height={dims.h} />
      </div>
      <div style={{ textAlign: 'center' }}>
        {size === 'lg' && <p style={{ fontSize: 10, color: '#6B7280', marginBottom: 4 }}>Hinten</p>}
        <Figure view="back" primary={primary} secondary={secondary} interactive={interactive} onToggle={onToggle} width={dims.w} height={dims.h} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/MuscleSVG.tsx
git commit -m "feat: MuscleSVG dark colors (orange primary, blue secondary) + TODO comment"
```

---

## Task 4: FriendsWidget — New Component

**Files:**
- Create: `src/components/FriendsWidget.tsx`

- [ ] **Step 1: Create FriendsWidget.tsx**

```tsx
'use client'
import { useEffect, useState } from 'react'

interface FriendActivity {
  name: string
  stat: string
  unit: string
  action: string
  time: string
}

// Static mock data — replace with real social API when available
const ACTIVITIES: FriendActivity[] = [
  { name: 'Jim', stat: '6', unit: 'km', action: 'gelaufen 🏃', time: 'vor 2 Std.' },
  { name: 'Oli', stat: '320', unit: 'kcal', action: 'verbrannt 🔥', time: 'vor 4 Std.' },
  { name: 'Max', stat: '45', unit: 'min', action: 'trainiert 💪', time: 'vor 6 Std.' },
]

export default function FriendsWidget() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (ACTIVITIES.length <= 1) return
    const id = setInterval(() => setIndex((i) => (i + 1) % ACTIVITIES.length), 4000)
    return () => clearInterval(id)
  }, [])

  if (ACTIVITIES.length === 0) {
    return (
      <div style={{
        background: '#5BB8FF', borderRadius: 16, padding: '14px 12px',
        height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxSizing: 'border-box',
      }}>
        <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 10, textAlign: 'center', fontWeight: 500, lineHeight: 1.4 }}>
          Noch keine Freunde aktiv heute 🤫
        </div>
      </div>
    )
  }

  const { name, stat, unit, action, time } = ACTIVITIES[index]

  return (
    <div style={{
      background: '#5BB8FF', borderRadius: 16, padding: '13px 12px 11px',
      height: 120, display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between', boxSizing: 'border-box', overflow: 'hidden',
    }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
        <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 13, fontWeight: 700, lineHeight: 1 }}>
          {name}
        </div>
        <div style={{ color: '#0D1117', fontWeight: 900, lineHeight: 0.95, letterSpacing: '-1.5px' }}>
          <span style={{ fontSize: 34 }}>{stat}</span>
          <span style={{ fontSize: 20, letterSpacing: '-0.5px' }}> {unit}</span>
        </div>
        <div style={{ color: 'rgba(0,0,0,0.6)', fontSize: 11, fontWeight: 600, lineHeight: 1.2, marginTop: 3 }}>
          {action}
        </div>
        <div style={{ color: 'rgba(0,0,0,0.35)', fontSize: 9, marginTop: 2 }}>
          {time}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {ACTIVITIES.map((_, i) => (
          <div key={i} style={{
            width: 5, height: 5, borderRadius: '50%',
            background: i === index ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.2)',
          }} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/FriendsWidget.tsx
git commit -m "feat: FriendsWidget — blue social widget with auto-rotating mock activities"
```

---

## Task 5: WeeklyChart — New Component

**Files:**
- Create: `src/components/WeeklyChart.tsx`

- [ ] **Step 1: Create WeeklyChart.tsx**

```tsx
'use client'
import { useMemo } from 'react'
import type { TrackerWorkout } from '@/types/tracker'

interface WeeklyChartProps {
  workouts: TrackerWorkout[]
}

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const MAX_BAR_PX = 34

function getWeekDurationsMinutes(workouts: TrackerWorkout[]): number[] {
  const now = new Date()
  const dayOfWeek = (now.getDay() + 6) % 7 // 0 = Monday
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - dayOfWeek)
  weekStart.setHours(0, 0, 0, 0)

  const durations = new Array<number>(7).fill(0)
  for (const w of workouts) {
    if (!w.finishedAt) continue
    const started = new Date(w.startedAt)
    if (started < weekStart) continue
    const dayIndex = Math.min(6, Math.floor((started.getTime() - weekStart.getTime()) / 86_400_000))
    durations[dayIndex] += (new Date(w.finishedAt).getTime() - started.getTime()) / 60_000
  }
  return durations
}

export default function WeeklyChart({ workouts }: WeeklyChartProps) {
  const durations = useMemo(() => getWeekDurationsMinutes(workouts), [workouts])
  const todayIndex = (new Date().getDay() + 6) % 7
  const maxDur = Math.max(...durations, 1)

  // Average over completed workout days only (past days with a workout)
  const completedDurs = durations.filter((d, i) => i < todayIndex && d > 0)
  const avgDur = completedDurs.length > 0
    ? completedDurs.reduce((a, b) => a + b, 0) / completedDurs.length
    : 0
  const avgBarPx = avgDur > 0 ? Math.round((avgDur / maxDur) * MAX_BAR_PX) : 0

  return (
    <div style={{ background: '#FFFFFF', borderRadius: 14, padding: '12px 13px' }}>
      <div style={{
        color: '#374151', fontSize: 8, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
      }}>
        Aktivität diese Woche
      </div>

      <div style={{ position: 'relative', height: 46 }}>
        {/* Average dashed line */}
        {avgBarPx > 0 && (
          <>
            <div style={{
              position: 'absolute', left: 0, right: 20,
              bottom: avgBarPx + 8,
              borderTop: '1.5px dashed #D1D5DB', zIndex: 2,
            }} />
            <div style={{
              position: 'absolute', right: 0, bottom: avgBarPx + 10,
              background: '#F3F4F6', borderRadius: 3, padding: '1px 4px', zIndex: 3,
            }}>
              <div style={{ color: '#9CA3AF', fontSize: 6, fontWeight: 700 }}>Ø</div>
            </div>
          </>
        )}

        {/* Bars */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 38, position: 'relative', zIndex: 1 }}>
          {DAYS.map((day, i) => {
            const barPx = durations[i] > 0
              ? Math.max(4, Math.round((durations[i] / maxDur) * MAX_BAR_PX))
              : 0
            const isToday = i === todayIndex
            const isEmpty = barPx === 0
            return (
              <div key={day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div style={{
                  width: '100%',
                  borderRadius: '4px 4px 2px 2px',
                  height: isEmpty ? 4 : barPx,
                  background: isEmpty ? '#F3F4F6' : 'linear-gradient(to top, #FF6B3D, #FF9A7A)',
                  ...(isToday && isEmpty ? { border: '1px dashed #FF6B3D', boxSizing: 'border-box' as const } : {}),
                }} />
                <div style={{ color: isToday ? '#FF6B3D' : '#9CA3AF', fontSize: 6.5, fontWeight: isToday ? 700 : 400 }}>
                  {day}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/WeeklyChart.tsx
git commit -m "feat: WeeklyChart — white bar chart card with Ø dashed average line"
```

---

## Task 6: Home Page — Idle State

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace page.tsx with full redesign**

This replaces the entire file. The `homeState` machine has three panels rendered as `position:absolute` inside a `position:relative` wrapper, shown/hidden via opacity + transform transitions.

```tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import { useTrackerStore } from '@/store/useTrackerStore'
import ActiveWorkoutView from '@/components/ActiveWorkoutView'
import FriendsWidget from '@/components/FriendsWidget'
import WeeklyChart from '@/components/WeeklyChart'
import MuscleSVG from '@/components/MuscleSVG'
import { getMusclesForExercise } from '@/lib/builtinExerciseMuscles'
import { calcStreak } from '@/lib/analytics'
import { apiFetch } from '@/lib/api'
import { MUSCLE_GROUPS } from '@/lib/muscles'
import type { MuscleId } from '@/types/tracker'

type HomeState = 'idle' | 'starting' | 'active'

const PHRASES = [
  "Los geht's! 💪",
  'Worauf wartest du?',
  'Jetzt oder nie 💪',
  'Mach es. Jetzt.',
  'Dein besseres Ich wartet.',
  'Heute zählt. 🔥',
  'Kein Aufschub mehr.',
  'Eine Einheit. Mehr nicht.',
  'Du weißt, dass du es willst.',
  'Stärker als gestern.',
  'Keine Ausreden. 💪',
  'Die beste Zeit ist jetzt.',
]

const MUSCLE_REGIONS: { label: string; ids: MuscleId[] }[] = [
  { label: 'Oberkörper', ids: ['chest', 'front_shoulder', 'rear_shoulder', 'triceps', 'biceps', 'forearms'] },
  { label: 'Rücken & Core', ids: ['upper_back', 'lats', 'traps', 'abs'] },
  { label: 'Unterkörper', ids: ['glutes', 'quads', 'hamstrings', 'calves'] },
]

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Guten Morgen'
  if (h < 18) return 'Guten Tag'
  return 'Guten Abend'
}

export default function HomePage() {
  const { workouts, activeWorkout, fetchWorkouts, startWorkout, fetchExercises } = useTrackerStore()
  const [username, setUsername] = useState<string | null>(null)
  const [homeState, setHomeState] = useState<HomeState>(activeWorkout ? 'active' : 'idle')
  const [workoutName, setWorkoutName] = useState('')
  const [targetMuscles, setTargetMuscles] = useState<MuscleId[]>([])
  const [submitting, setSubmitting] = useState(false)

  const phrase = useMemo(() => PHRASES[Math.floor(Math.random() * PHRASES.length)], [])

  useEffect(() => {
    fetchWorkouts()
    fetchExercises()
    apiFetch('/auth/me')
      .then((r) => r.json())
      .then((d) => setUsername(d.username ?? null))
      .catch(() => null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync state machine with store
  useEffect(() => {
    if (activeWorkout && homeState !== 'active') setHomeState('active')
    if (!activeWorkout && homeState === 'active') setHomeState('idle')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkout])

  const streak = calcStreak(workouts)
  const lastWorkout = workouts[0] ?? null

  const lastWorkoutMuscles = useMemo(() => {
    if (!lastWorkout) return { primary: [] as MuscleId[], secondary: [] as MuscleId[] }
    const primary = new Set<MuscleId>()
    const secondary = new Set<MuscleId>()
    for (const we of lastWorkout.exercises) {
      const m = we.exercise?.primaryMuscles?.length
        ? { primary: we.exercise.primaryMuscles, secondary: we.exercise.secondaryMuscles ?? [] }
        : getMusclesForExercise(we.exercise?.name ?? '')
      m.primary.forEach((id) => primary.add(id))
      m.secondary.forEach((id) => { if (!primary.has(id)) secondary.add(id) })
    }
    return { primary: Array.from(primary), secondary: Array.from(secondary) }
  }, [lastWorkout])

  function toggleMuscle(id: MuscleId) {
    setTargetMuscles((prev) => prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id])
  }

  async function handleStart() {
    if (submitting) return
    setSubmitting(true)
    try {
      await startWorkout(workoutName.trim() || 'Training', targetMuscles)
      setWorkoutName('')
      setTargetMuscles([])
    } finally {
      setSubmitting(false)
    }
  }

  const panelStyle = (visible: boolean, direction: 'up' | 'down' = 'up'): React.CSSProperties => ({
    position: 'absolute',
    inset: 0,
    transition: 'opacity 280ms ease, transform 280ms ease',
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : `translateY(${direction === 'up' ? '-40px' : '40px'})`,
    pointerEvents: visible ? 'auto' : 'none',
    overflowY: 'auto',
  })

  return (
    <div style={{ position: 'relative', minHeight: 'calc(100dvh - 50px)', background: '#1E1E24' }}>

      {/* ── PANEL: IDLE ── */}
      <div style={panelStyle(homeState === 'idle', 'up')}>
        <div style={{ padding: '20px 16px 0' }}>

          {/* Header */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 500, marginBottom: 3 }}>
              {greeting()} 👋
            </div>
            <div style={{ color: '#F9FAFB', fontSize: 28, fontWeight: 900, letterSpacing: '-0.8px', lineHeight: 1.05 }}>
              {username ?? 'Nico'}
            </div>
          </div>

          {/* Hero widgets */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 9 }}>
            <div style={{
              background: '#FF6B3D', borderRadius: 16, padding: '14px 14px 12px',
              height: 120, display: 'flex', flexDirection: 'column',
              justifyContent: 'space-between', boxSizing: 'border-box',
            }}>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 600 }}>
                Streak
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, padding: '4px 0 2px' }}>
                <div style={{ color: '#FFF', fontSize: 52, fontWeight: 900, lineHeight: 1, letterSpacing: '-2px' }}>{streak}</div>
                <div style={{ fontSize: 38, lineHeight: 1, marginTop: 2 }}>🔥</div>
              </div>
            </div>
            <FriendsWidget />
          </div>

          {/* Weekly activity */}
          <div style={{ marginBottom: 9 }}>
            <WeeklyChart workouts={workouts} />
          </div>

          {/* Last workout */}
          {lastWorkout && (
            <div style={{
              background: '#27272F', borderRadius: 13, padding: '11px 12px',
              display: 'flex', alignItems: 'center', gap: 9,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#6B7280', fontSize: 7, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, marginBottom: 3 }}>
                  Letztes Workout
                </div>
                <div style={{ color: '#F9FAFB', fontSize: 12, fontWeight: 700 }}>{lastWorkout.name}</div>
                <div style={{ color: '#6B7280', fontSize: 9, marginTop: 1 }}>
                  {new Date(lastWorkout.startedAt).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })}
                </div>
                <div style={{ display: 'flex', gap: 3, marginTop: 5, flexWrap: 'wrap' }}>
                  {lastWorkoutMuscles.primary.slice(0, 3).map((id) => (
                    <div key={id} style={{ background: 'rgba(255,107,61,0.2)', borderRadius: 20, padding: '2px 7px', color: '#FF6B3D', fontSize: 7, fontWeight: 500 }}>
                      {MUSCLE_GROUPS.find((m) => m.id === id)?.name ?? id}
                    </div>
                  ))}
                  {lastWorkoutMuscles.secondary.slice(0, 2).map((id) => (
                    <div key={id} style={{ background: 'rgba(91,184,255,0.15)', borderRadius: 20, padding: '2px 7px', color: '#5BB8FF', fontSize: 7, fontWeight: 500 }}>
                      {MUSCLE_GROUPS.find((m) => m.id === id)?.name ?? id}
                    </div>
                  ))}
                </div>
              </div>
              <MuscleSVG size="sm" primary={lastWorkoutMuscles.primary} secondary={lastWorkoutMuscles.secondary} />
            </div>
          )}
        </div>
      </div>

      {/* ── PANEL: STARTING ── */}
      <div style={panelStyle(homeState === 'starting', 'down')}>
        <div style={{ padding: '20px 16px 140px' }}>
          <div style={{ color: '#F9FAFB', fontSize: 22, fontWeight: 900, marginBottom: 4 }}>Neues Workout</div>
          <div style={{ color: '#6B7280', fontSize: 10, marginBottom: 20 }}>
            {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>

          <input
            type="text"
            value={workoutName}
            onChange={(e) => setWorkoutName(e.target.value)}
            placeholder="Name (z.B. Push Day)"
            autoFocus={homeState === 'starting'}
            style={{
              width: '100%', background: '#27272F', borderRadius: 12,
              padding: '14px 16px', fontSize: 16, fontWeight: 600,
              color: '#F9FAFB', border: 'none', outline: 'none',
              marginBottom: 24, boxSizing: 'border-box', fontFamily: 'inherit',
            }}
          />

          {/* Front + back SVG preview */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            {/* TODO: Interactive muscle selection — replace pills with direct SVG tap targets.
                Each <path> can receive onClick + visual highlight when interactive=true.
                Also: consider replacing SVG paths with high-quality anatomical PNG/WebP images
                per muscle group for a premium look. The interactive prop and onToggle callback
                are already wired — swap the SVG content when assets are ready. */}
            <MuscleSVG size="md" primary={targetMuscles} secondary={[]} />
          </div>

          {/* Grouped muscle pills */}
          {MUSCLE_REGIONS.map((region) => (
            <div key={region.label} style={{ marginBottom: 16 }}>
              <div style={{ color: '#6B7280', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 8 }}>
                {region.label}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {MUSCLE_GROUPS.filter((m) => region.ids.includes(m.id)).map((m) => {
                  const active = targetMuscles.includes(m.id)
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleMuscle(m.id)}
                      style={{
                        padding: '6px 12px', borderRadius: 20, fontSize: 11,
                        fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer',
                        border: active ? 'none' : '1px solid #2E2E38',
                        background: active ? '#FF6B3D' : '#27272F',
                        color: active ? '#FFF' : '#9CA3AF',
                      }}
                    >
                      {m.name}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          <button
            onClick={() => { setHomeState('idle'); setWorkoutName(''); setTargetMuscles([]) }}
            style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', marginTop: 8 }}
          >
            ← Zurück
          </button>
        </div>
      </div>

      {/* ── PANEL: ACTIVE WORKOUT ── */}
      <div style={panelStyle(homeState === 'active', 'down')}>
        <div style={{ padding: '20px 16px 80px' }}>
          <ActiveWorkoutView />
        </div>
      </div>

      {/* ── STICKY CTA (idle) ── */}
      {homeState === 'idle' && (
        <div style={{
          position: 'fixed', bottom: 50,
          left: '50%', transform: 'translateX(-50%)',
          width: '100%', maxWidth: 430,
          padding: '10px 16px 0',
          background: 'linear-gradient(to top, #1E1E24 65%, transparent)',
          zIndex: 40,
        }}>
          <button
            onClick={() => setHomeState('starting')}
            style={{
              width: '100%', background: '#FF6B3D', borderRadius: 15, padding: 16,
              border: 'none', color: '#FFF', fontSize: 14, fontWeight: 800,
              fontFamily: 'inherit', cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(255,107,61,0.4)',
            }}
          >
            {phrase}
          </button>
        </div>
      )}

      {/* ── STICKY START BUTTON (starting) ── */}
      {homeState === 'starting' && (
        <div style={{
          position: 'fixed', bottom: 50,
          left: '50%', transform: 'translateX(-50%)',
          width: '100%', maxWidth: 430,
          padding: '10px 16px 0',
          background: 'linear-gradient(to top, #1E1E24 65%, transparent)',
          zIndex: 40,
        }}>
          <button
            onClick={handleStart}
            disabled={submitting}
            style={{
              width: '100%', background: '#FF6B3D', borderRadius: 15, padding: 16,
              border: 'none', color: '#FFF', fontSize: 14, fontWeight: 800,
              fontFamily: 'inherit', cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.6 : 1,
              boxShadow: '0 4px 20px rgba(255,107,61,0.4)',
            }}
          >
            {submitting ? '…' : 'Starten →'}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Visual check in browser**

Run: `npm run dev`  
Verify idle state:
- Dark bg `#1E1E24`, Outfit font
- Greeting small + name large (28px bold)
- Streak widget orange (120px), Friends widget blue (120px)
- Weekly chart on white card with gradient bars + Ø line
- Last workout card (only if workouts exist) — no left color stripe
- Orange CTA button sticky above nav, random phrase

Verify tap CTA:
- Home content fades up and out
- Start screen fades in from below
- Front+back SVG preview shows, grouped pills below
- Orange "Starten →" button sticky at bottom

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: Home page redesign — idle/starting/active state machine, fly-up transition"
```

---

## Task 7: ActiveWorkoutView — Dark Theme

**Files:**
- Modify: `src/components/ActiveWorkoutView.tsx`

- [ ] **Step 1: Replace ActiveWorkoutView with dark-themed version**

```tsx
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

function useElapsedTimer(startedAt: string | null): string {
  const [elapsed, setElapsed] = useState('')
  useEffect(() => {
    if (!startedAt) return
    function update() {
      const ms = Date.now() - new Date(startedAt!).getTime()
      const m = Math.floor(ms / 60000)
      const s = Math.floor((ms % 60000) / 1000)
      setElapsed(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [startedAt])
  return elapsed
}

export default function ActiveWorkoutView({ onFinish }: ActiveWorkoutViewProps) {
  const { activeWorkout, addExerciseToWorkout, removeExerciseFromWorkout, finishWorkout, cancelWorkout } = useTrackerStore()
  const [showPicker, setShowPicker] = useState(false)
  const [activeExercise, setActiveExercise] = useState<ActiveWorkoutExercise | null>(null)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const elapsed = useElapsedTimer(activeWorkout?.startedAt ?? null)

  if (!activeWorkout) return null

  async function handleSelectExercise(ex: TrackerExercise) {
    const newWe = await addExerciseToWorkout(ex)
    if (newWe) setActiveExercise(newWe)
  }

  async function handleFinish() {
    if (submitting) return
    setSubmitting(true)
    try {
      await finishWorkout()
      onFinish?.()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel() {
    if (submitting) return
    setSubmitting(true)
    await cancelWorkout()
  }

  const hasExercises = activeWorkout.exercises.length > 0

  const dotColor = (cat: string) =>
    cat === 'strength' ? '#5BB8FF' : cat === 'cardio' ? '#4ADE80' : '#A855F7'

  return (
    <div className="flex flex-col gap-3">
      {/* Header — orange card */}
      <div style={{
        background: '#FF6B3D', borderRadius: 14,
        padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ color: '#FFF', fontSize: 14, fontWeight: 800 }}>{activeWorkout.name}</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: 700, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
            {elapsed}
          </div>
        </div>
      </div>

      {/* Exercise list */}
      {activeWorkout.exercises.map((we) => {
        const completedSets = we.sets.filter((s) => s.completed).length
        const muscles = we.exercise.primaryMuscles?.length
          ? { primary: we.exercise.primaryMuscles, secondary: we.exercise.secondaryMuscles ?? [] }
          : getMusclesForExercise(we.exercise.name)
        const isActive = activeExercise?.id === we.id

        return (
          <div
            key={we.id}
            style={{
              background: '#27272F', borderRadius: 12, padding: '10px 12px',
              display: 'flex', alignItems: 'center', gap: 8,
              border: isActive ? '1px solid #FF6B3D' : '1px solid transparent',
            }}
          >
            <button onClick={() => setActiveExercise(we)} className="flex-1 text-left flex items-center justify-between">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor(we.exercise.category), flexShrink: 0 }} />
                  <span style={{ color: '#F9FAFB', fontSize: 11, fontWeight: 600 }}>{we.exercise.name}</span>
                </div>
                <span style={{ color: '#6B7280', fontSize: 8, marginLeft: 14 }}>{completedSets} Sätze</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {completedSets > 0 && <CheckCircle size={16} color="#4ADE80" />}
                <MuscleSVG size="sm" primary={muscles.primary} secondary={muscles.secondary} />
              </div>
            </button>
            <button onClick={() => removeExerciseFromWorkout(we.id)} style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
              <X size={15} color="#4B5563" />
            </button>
          </div>
        )
      })}

      {/* Add exercise */}
      <button
        onClick={() => setShowPicker(true)}
        style={{
          width: '100%', border: '1.5px dashed #2A2A35', borderRadius: 12,
          padding: '14px', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 8, background: 'none', cursor: 'pointer',
          color: '#6B7280', fontSize: 12, fontFamily: 'inherit',
        }}
      >
        <Plus size={16} color="#6B7280" /> Übung hinzufügen
      </button>

      {/* Finish / Cancel */}
      {hasExercises ? (
        !confirmFinish ? (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setConfirmFinish(true)}
              style={{
                width: '100%', background: '#27272F', border: '1px solid #374151',
                borderRadius: 14, padding: 14, color: '#9CA3AF', fontSize: 12,
                fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              Workout beenden
            </button>
            <button
              onClick={handleCancel}
              disabled={submitting}
              style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', padding: 8, opacity: submitting ? 0.4 : 1 }}
            >
              Abbrechen
            </button>
          </div>
        ) : (
          <div style={{ background: '#27272F', borderRadius: 14, padding: 14 }}>
            <p style={{ color: '#F9FAFB', fontSize: 12, textAlign: 'center', fontWeight: 600, marginBottom: 12 }}>
              Workout wirklich beenden?
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setConfirmFinish(false)}
                style={{ flex: 1, border: '1px solid #374151', borderRadius: 10, padding: 12, fontSize: 12, color: '#9CA3AF', background: 'none', fontFamily: 'inherit', cursor: 'pointer' }}
              >
                Zurück
              </button>
              <button
                onClick={handleFinish}
                disabled={submitting}
                style={{ flex: 1, background: '#FF6B3D', border: 'none', borderRadius: 10, padding: 12, fontSize: 12, color: '#FFF', fontWeight: 700, fontFamily: 'inherit', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}
              >
                {submitting ? '…' : 'Beenden ✓'}
              </button>
            </div>
          </div>
        )
      ) : (
        <button
          onClick={handleCancel}
          disabled={submitting}
          style={{ width: '100%', border: '1px solid #2E2E38', borderRadius: 14, padding: 14, color: '#6B7280', fontSize: 12, background: 'none', fontFamily: 'inherit', cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}
        >
          Abbrechen
        </button>
      )}

      {showPicker && <ExercisePicker onSelect={handleSelectExercise} onClose={() => setShowPicker(false)} />}
      {activeExercise && (
        <SetLogger
          workoutExercise={activeWorkout.exercises.find((e) => e.id === activeExercise.id) ?? activeExercise}
          onClose={() => setActiveExercise(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Visual check**

Start a workout via the Home screen. Verify:
- Orange header card with workout name + elapsed timer
- Exercise rows on `#27272F` cards, category dots, active exercise has orange border
- Dashed "Übung hinzufügen" border
- "Workout beenden" on dark card

- [ ] **Step 4: Commit**

```bash
git add src/components/ActiveWorkoutView.tsx
git commit -m "feat: ActiveWorkoutView dark theme — orange header, dark cards"
```

---

## Task 8: ExercisePicker — Dark Bottom Sheet

**Files:**
- Modify: `src/components/ExercisePicker.tsx`

- [ ] **Step 1: Apply dark theme to ExercisePicker**

Only the styling changes — logic is unchanged. Replace the JSX className/style attributes:

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { Search, Trash2, X, Plus } from 'lucide-react'
import { useTrackerStore } from '@/store/useTrackerStore'
import type { TrackerExercise, MuscleId } from '@/types/tracker'
import { MUSCLE_GROUPS } from '@/lib/muscles'

const CATEGORY_LABELS = {
  strength: 'Kraft',
  cardio: 'Cardio',
  flexibility: 'Beweglichkeit',
} as const

const CATEGORY_ACTIVE_COLORS = {
  strength: { background: '#1D4ED8', color: '#FFF' },
  cardio: { background: '#15803D', color: '#FFF' },
  flexibility: { background: '#7E22CE', color: '#FFF' },
} as const

const DOT_COLORS = {
  strength: '#5BB8FF',
  cardio: '#4ADE80',
  flexibility: '#A855F7',
} as const

interface ExercisePickerProps {
  onSelect: (exercise: TrackerExercise) => void
  onClose: () => void
}

export default function ExercisePicker({ onSelect, onClose }: ExercisePickerProps) {
  const { exercises, deleteExercise, createExercise } = useTrackerStore()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState<'strength' | 'cardio' | 'flexibility'>('strength')
  const [newTracking, setNewTracking] = useState<'weight_reps' | 'distance_time' | 'time_only'>('weight_reps')
  const [newPrimaryMuscles, setNewPrimaryMuscles] = useState<MuscleId[]>([])
  const [creating, setCreating] = useState(false)
  const touchStartY = useRef(0)

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  function handleClose() { setVisible(false); setTimeout(onClose, 280) }
  function onTouchStart(e: React.TouchEvent) { touchStartY.current = e.touches[0].clientY }
  function onTouchEnd(e: React.TouchEvent) { if (e.changedTouches[0].clientY - touchStartY.current > 60) handleClose() }

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await createExercise(newName.trim(), newCategory, newTracking, '', newPrimaryMuscles)
      setNewName(''); setNewPrimaryMuscles([]); setShowCreate(false)
    } finally { setCreating(false) }
  }

  const filtered = exercises.filter((e) => {
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter == null || e.category === filter
    return matchSearch && matchFilter
  })

  const sheetStyle: React.CSSProperties = {
    width: '100%', maxWidth: 430, background: '#2E2E38',
    borderRadius: '24px 24px 0 0', boxShadow: '0 -4px 32px rgba(0,0,0,0.4)',
    padding: 24, display: 'flex', flexDirection: 'column',
    height: '88vh',
    transform: visible ? 'translateY(0)' : 'translateY(100%)',
    transition: 'transform 280ms ease-out',
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', background: visible ? 'rgba(0,0,0,0.5)' : 'transparent', transition: 'background 280ms' }}
      onClick={handleClose}
    >
      <div style={sheetStyle} onClick={(e) => e.stopPropagation()} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div style={{ width: 40, height: 4, background: '#4B5563', borderRadius: 9999, margin: '0 auto 16px', cursor: 'grab', flexShrink: 0 }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
          <h2 style={{ color: '#F9FAFB', fontSize: 18, fontWeight: 800 }}>Übung wählen</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setShowCreate(!showCreate)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, background: '#FF6B3D', color: '#FFF', borderRadius: 9999, padding: '6px 12px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
            >
              <Plus size={13} /> Neue Übung
            </button>
            <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
              <X size={20} color="#6B7280" />
            </button>
          </div>
        </div>

        {/* Create form */}
        {showCreate && (
          <div style={{ background: '#27272F', borderRadius: 14, padding: 14, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
            <input
              type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="Name der Übung"
              style={{ background: '#1E1E24', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#F9FAFB', border: '1px solid #374151', outline: 'none', fontFamily: 'inherit' }}
            />
            <div>
              <p style={{ color: '#6B7280', fontSize: 10, marginBottom: 6 }}>Muskeln (Primär)</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {MUSCLE_GROUPS.map((m) => {
                  const active = newPrimaryMuscles.includes(m.id)
                  return (
                    <button key={m.id} type="button" onClick={() => setNewPrimaryMuscles((prev) => prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id])}
                      style={{ padding: '4px 10px', borderRadius: 20, fontSize: 10, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', border: 'none', background: active ? '#FF6B3D' : '#374151', color: active ? '#FFF' : '#9CA3AF' }}
                    >{m.name}</button>
                  )
                })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['strength', 'cardio', 'flexibility'] as const).map((cat) => (
                <button key={cat} onClick={() => setNewCategory(cat)}
                  style={{ flex: 1, padding: '8px 4px', borderRadius: 10, fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', border: 'none', background: newCategory === cat ? '#FF6B3D' : '#374151', color: newCategory === cat ? '#FFF' : '#9CA3AF', fontWeight: 500 }}
                >{CATEGORY_LABELS[cat]}</button>
              ))}
            </div>
            <button onClick={handleCreate} disabled={creating || !newName.trim()}
              style={{ background: '#FF6B3D', border: 'none', borderRadius: 10, padding: '10px', fontSize: 12, color: '#FFF', fontWeight: 700, fontFamily: 'inherit', cursor: creating ? 'not-allowed' : 'pointer', opacity: (creating || !newName.trim()) ? 0.5 : 1 }}
            >{creating ? 'Erstelle…' : 'Übung erstellen'}</button>
          </div>
        )}

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 12, flexShrink: 0 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#6B7280' }} />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Suchen…"
            style={{ width: '100%', background: '#27272F', borderRadius: 12, paddingLeft: 36, paddingRight: 16, paddingTop: 10, paddingBottom: 10, fontSize: 13, color: '#F9FAFB', border: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>

        {/* Category filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexShrink: 0 }}>
          {(['strength', 'cardio', 'flexibility'] as const).map((cat) => {
            const active = filter === cat
            return (
              <button key={cat} onClick={() => setFilter(active ? null : cat)}
                style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', border: 'none', fontWeight: 500, ...(active ? CATEGORY_ACTIVE_COLORS[cat] : { background: '#27272F', color: '#9CA3AF' }) }}
              >{CATEGORY_LABELS[cat]}</button>
            )
          })}
        </div>

        {/* Exercise list */}
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 64 }}>
          {filtered.map((ex) => (
            <div key={ex.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => { onSelect(ex); handleClose() }}
                style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, background: '#27272F', borderRadius: 12, padding: '11px 14px', textAlign: 'left', border: 'none', cursor: 'pointer' }}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: DOT_COLORS[ex.category], flexShrink: 0 }} />
                <div>
                  <div style={{ color: '#F9FAFB', fontSize: 13, fontWeight: 600 }}>{ex.name}</div>
                  <div style={{ color: '#6B7280', fontSize: 11, marginTop: 1 }}>{ex.muscles || CATEGORY_LABELS[ex.category]}</div>
                </div>
              </button>
              {ex.userId != null && (
                <button onClick={() => deleteExercise(ex.id)} style={{ padding: 8, background: 'none', border: 'none', cursor: 'pointer' }}>
                  <Trash2 size={15} color="#4B5563" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ExercisePicker.tsx
git commit -m "feat: ExercisePicker dark bottom sheet"
```

---

## Task 9: SetLogger — Dark Bottom Sheet + Orange CTA

**Files:**
- Modify: `src/components/SpinnerInput.tsx`
- Modify: `src/components/SetLogger.tsx`

- [ ] **Step 1: Restyle SpinnerInput for dark theme**

The component's touch/drag logic is unchanged — only styling:

```tsx
'use client'
import { useEffect, useRef } from 'react'

interface SpinnerInputProps {
  label: string
  value: number | undefined
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  decimals?: number
  placeholder?: string
  unit?: string
}

export default function SpinnerInput({
  label, value, onChange, step = 1, min = 0, max = 9999, decimals = 0, placeholder = '0', unit,
}: SpinnerInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  useEffect(() => { valueRef.current = value }, [value])
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const startY = { current: 0 }
    const startVal = { current: 0 }
    const dragging = { current: false }
    function onTouchStart(e: TouchEvent) {
      startY.current = e.touches[0].clientY
      startVal.current = valueRef.current ?? 0
      dragging.current = false
    }
    function onTouchMove(e: TouchEvent) {
      const dy = startY.current - e.touches[0].clientY
      if (Math.abs(dy) > 6) {
        if (!dragging.current) dragging.current = true
        e.preventDefault()
        const steps = Math.round(dy / 14)
        const raw = startVal.current + steps * step
        const clamped = Math.max(min, Math.min(max, raw))
        onChangeRef.current(parseFloat(clamped.toFixed(decimals)))
      }
    }
    function onTouchEnd() { if (dragging.current) el?.blur() }
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    return () => {
      el?.removeEventListener('touchstart', onTouchStart)
      el?.removeEventListener('touchmove', onTouchMove)
      el?.removeEventListener('touchend', onTouchEnd)
    }
  }, [step, min, max, decimals])

  return (
    <div className="flex-1">
      <label style={{ display: 'block', color: '#6B7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 4, userSelect: 'none' }}>
        {label}{unit ? ` (${unit})` : ''}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="number"
          inputMode="decimal"
          value={value ?? ''}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!isNaN(v)) onChange(Math.max(min, Math.min(max, parseFloat(v.toFixed(decimals)))))
            else if (e.target.value === '') onChange(0)
          }}
          placeholder={placeholder}
          style={{
            width: '100%', fontSize: 28, fontWeight: 800,
            background: '#1E1E24', borderRadius: 12,
            padding: '12px 36px 12px 14px',
            outline: 'none', border: 'none',
            color: '#F9FAFB', touchAction: 'none',
            fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
        <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 2, pointerEvents: 'none' }}>
          <div style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '6px solid #4B5563' }} />
          <div style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '6px solid #4B5563' }} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Apply dark theme to SetLogger**

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useTrackerStore } from '@/store/useTrackerStore'
import SpinnerInput from '@/components/SpinnerInput'
import type { ActiveWorkoutExercise, TrackerSet } from '@/types/tracker'

interface SetLoggerProps {
  workoutExercise: ActiveWorkoutExercise
  onClose: () => void
}

function formatSecs(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function SetLogger({ workoutExercise, onClose }: SetLoggerProps) {
  const { addSet, removeSet, activeWorkout } = useTrackerStore()
  const ex = workoutExercise.exercise
  const type = ex.defaultTrackingType

  const [visible, setVisible] = useState(false)
  const [weightKg, setWeightKg] = useState<number | undefined>(undefined)
  const [reps, setReps] = useState<number | undefined>(undefined)
  const [distanceKm, setDistanceKm] = useState<number | undefined>(undefined)
  const [durationMin, setDurationMin] = useState<number | undefined>(undefined)
  const [durationSec, setDurationSec] = useState<number | undefined>(undefined)
  const [isWarmup, setIsWarmup] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [rir, setRir] = useState<number | undefined>(undefined)
  const [rpe, setRpe] = useState<number | undefined>(undefined)
  const touchStartY = useRef(0)

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  function handleClose() { setVisible(false); setTimeout(onClose, 280) }
  function onTouchStart(e: React.TouchEvent) { touchStartY.current = e.touches[0].clientY }
  function onTouchEnd(e: React.TouchEvent) { if (e.changedTouches[0].clientY - touchStartY.current > 60) handleClose() }

  const catColor = ex.category === 'strength' ? '#5BB8FF' : ex.category === 'cardio' ? '#4ADE80' : '#A855F7'

  const currentSets = activeWorkout?.exercises.find((we) => we.id === workoutExercise.id)?.sets ?? []

  async function handleAddSet() {
    const setData: Partial<TrackerSet> = { isWarmup, completed: true }
    if (rir != null) setData.rir = rir
    if (rpe != null) setData.rpe = rpe
    if (type === 'weight_reps') {
      if (weightKg != null) setData.weightKg = weightKg
      if (reps != null) setData.reps = reps
    } else if (type === 'distance_time') {
      if (distanceKm != null) setData.distanceMeters = distanceKm * 1000
      const totalSecs = ((durationMin ?? 0) * 60) + (durationSec ?? 0)
      if (totalSecs > 0) setData.durationSeconds = totalSecs
    } else {
      const totalSecs = ((durationMin ?? 0) * 60) + (durationSec ?? 0)
      if (totalSecs > 0) setData.durationSeconds = totalSecs
    }
    await addSet(workoutExercise.id, setData)
    setWeightKg(undefined); setReps(undefined); setDistanceKm(undefined)
    setDurationMin(undefined); setDurationSec(undefined); setRir(undefined); setRpe(undefined)
  }

  const isAddDisabled = (() => {
    if (type === 'weight_reps') return (!weightKg || weightKg === 0) && (!reps || reps === 0)
    const secs = ((durationMin ?? 0) * 60) + (durationSec ?? 0)
    if (type === 'distance_time') return (!distanceKm || distanceKm === 0) && secs === 0
    return secs === 0
  })()

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', background: visible ? 'rgba(0,0,0,0.5)' : 'transparent', transition: 'background 280ms' }}
      onClick={handleClose}
    >
      <div
        style={{
          width: '100%', maxWidth: 430, background: '#2E2E38',
          borderRadius: '24px 24px 0 0', padding: 24,
          display: 'flex', flexDirection: 'column',
          maxHeight: 'calc(88vh - 50px)', marginBottom: 50,
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 280ms ease-out',
          boxShadow: '0 -4px 32px rgba(0,0,0,0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
      >
        <div style={{ width: 40, height: 4, background: '#4B5563', borderRadius: 9999, margin: '0 auto 20px', cursor: 'grab', flexShrink: 0 }} />

        {/* Exercise header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 3, height: 24, borderRadius: 9999, background: catColor, flexShrink: 0 }} />
              <h2 style={{ color: '#F9FAFB', fontSize: 20, fontWeight: 800 }}>{ex.name}</h2>
            </div>
            <p style={{ color: '#9CA3AF', fontSize: 12, marginLeft: 11, marginTop: 2, textTransform: 'capitalize' }}>{ex.category}</p>
          </div>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={20} color="#6B7280" />
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {/* Input fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            {type === 'weight_reps' && (
              <div style={{ display: 'flex', gap: 12 }}>
                <SpinnerInput label="Gewicht" unit="kg" value={weightKg} onChange={setWeightKg} step={2.5} decimals={1} min={0} max={500} />
                <SpinnerInput label="Wdh." value={reps} onChange={setReps} step={1} min={0} max={100} />
              </div>
            )}
            {type === 'distance_time' && (
              <div style={{ display: 'flex', gap: 12 }}>
                <SpinnerInput label="Distanz" unit="km" value={distanceKm} onChange={setDistanceKm} step={0.1} decimals={2} min={0} max={999} placeholder="0.0" />
                <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                  <SpinnerInput label="Min" value={durationMin} onChange={setDurationMin} step={1} min={0} max={999} />
                  <SpinnerInput label="Sek" value={durationSec} onChange={setDurationSec} step={5} min={0} max={59} />
                </div>
              </div>
            )}
            {type === 'time_only' && (
              <div style={{ display: 'flex', gap: 12 }}>
                <SpinnerInput label="Min" value={durationMin} onChange={setDurationMin} step={1} min={0} max={999} />
                <SpinnerInput label="Sek" value={durationSec} onChange={setDurationSec} step={5} min={0} max={59} />
              </div>
            )}

            {/* Toggles */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => setIsWarmup(!isWarmup)}
                style={{ fontSize: 11, padding: '5px 12px', borderRadius: 20, border: isWarmup ? '1px solid #F97316' : '1px solid #374151', background: isWarmup ? 'rgba(249,115,22,0.15)' : 'none', color: isWarmup ? '#F97316' : '#6B7280', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                🔥 Aufwärmsatz
              </button>
              <button
                onClick={() => setShowDetails(!showDetails)}
                style={{ fontSize: 11, padding: '5px 12px', borderRadius: 20, border: showDetails ? '1px solid #6B7280' : '1px solid #374151', background: showDetails ? '#374151' : 'none', color: showDetails ? '#F9FAFB' : '#6B7280', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                RIR / RPE
              </button>
            </div>

            {showDetails && (
              <div style={{ display: 'flex', gap: 12 }}>
                <SpinnerInput label="RIR" value={rir} onChange={setRir} step={1} min={0} max={5} placeholder="—" />
                <SpinnerInput label="RPE" value={rpe} onChange={setRpe} step={0.5} min={6} max={10} decimals={1} placeholder="—" />
              </div>
            )}
          </div>

          {/* Logged sets */}
          {currentSets.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
              {currentSets.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#27272F', borderRadius: 10, padding: '8px 12px' }}>
                  <span style={{ color: '#F9FAFB', fontSize: 12 }}>
                    Satz {i + 1}{s.isWarmup ? ' (W)' : ''}{' '}
                    {s.weightKg != null ? `${s.weightKg}kg` : ''}
                    {s.reps != null ? ` × ${s.reps}` : ''}
                    {s.distanceMeters != null ? ` ${(s.distanceMeters / 1000).toFixed(1)}km` : ''}
                    {s.durationSeconds != null ? ` ${formatSecs(s.durationSeconds)}` : ''}
                  </span>
                  <button onClick={() => removeSet(workoutExercise.id, s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#4B5563', fontSize: 14 }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={() => { void handleAddSet() }}
          disabled={isAddDisabled}
          style={{
            width: '100%', background: '#FF6B3D', border: 'none', borderRadius: 14,
            padding: 16, color: '#FFF', fontSize: 14, fontWeight: 800,
            fontFamily: 'inherit', cursor: isAddDisabled ? 'not-allowed' : 'pointer',
            marginTop: 14, opacity: isAddDisabled ? 0.4 : 1, flexShrink: 0,
            boxShadow: isAddDisabled ? 'none' : '0 4px 16px rgba(255,107,61,0.35)',
          }}
        >
          + Satz hinzufügen
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/SpinnerInput.tsx src/components/SetLogger.tsx
git commit -m "feat: SetLogger + SpinnerInput dark theme, orange sticky CTA"
```

---

## Task 10: Workout Page — Redirect

**Files:**
- Modify: `src/app/workout/page.tsx`

- [ ] **Step 1: Replace with redirect**

```tsx
import { redirect } from 'next/navigation'

export default function WorkoutPage() {
  redirect('/')
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/workout/page.tsx
git commit -m "feat: redirect /workout to / (merged into Home)"
```

---

## Task 11: History Page — Dark Theme Pass

**Files:**
- Modify: `src/app/history/page.tsx`

- [ ] **Step 1: Apply dark theme**

Replace the entire file:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { useTrackerStore } from '@/store/useTrackerStore'
import MuscleSVG from '@/components/MuscleSVG'
import { getMusclesForExercise } from '@/lib/builtinExerciseMuscles'
import { MUSCLE_BY_ID } from '@/lib/muscles'
import type { MuscleId, TrackerWorkout } from '@/types/tracker'

function durationStr(w: TrackerWorkout): string {
  if (!w.finishedAt) return 'Aktiv'
  const mins = Math.round((new Date(w.finishedAt).getTime() - new Date(w.startedAt).getTime()) / 60000)
  return `${mins} Min`
}

function aggregateMuscles(w: TrackerWorkout): { primary: MuscleId[]; secondary: MuscleId[] } {
  const primary = new Set<MuscleId>()
  const secondary = new Set<MuscleId>()
  for (const we of w.exercises) {
    const muscles = we.exercise?.primaryMuscles?.length
      ? { primary: we.exercise.primaryMuscles, secondary: we.exercise.secondaryMuscles ?? [] }
      : getMusclesForExercise(we.exercise?.name ?? '')
    muscles.primary.forEach((m) => primary.add(m))
    muscles.secondary.forEach((m) => { if (!primary.has(m)) secondary.add(m) })
  }
  return { primary: Array.from(primary), secondary: Array.from(secondary) }
}

export default function HistoryPage() {
  const { workouts, fetchWorkouts, deleteWorkout } = useTrackerStore()
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetchWorkouts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (workouts.length === 0) {
    return (
      <div style={{ padding: '48px 16px', textAlign: 'center', color: '#6B7280' }}>
        <p style={{ fontSize: 36, marginBottom: 16 }}>🏋️</p>
        <p style={{ color: '#F9FAFB', fontWeight: 600, fontSize: 15 }}>Noch keine Workouts</p>
        <p style={{ fontSize: 12, marginTop: 4 }}>Starte dein erstes Training!</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 16px 16px' }}>
      <h1 style={{ color: '#F9FAFB', fontSize: 24, fontWeight: 900, marginBottom: 20 }}>Verlauf</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {workouts.map((w) => (
          <div key={w.id} style={{ background: '#27272F', borderRadius: 14, overflow: 'hidden' }}>
            <button
              style={{ width: '100%', padding: '14px 16px', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => setExpanded(expanded === w.id ? null : w.id)}
            >
              <div style={{ flex: 1 }}>
                <div style={{ color: '#F9FAFB', fontSize: 13, fontWeight: 700 }}>{w.name}</div>
                <div style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>
                  {new Date(w.startedAt).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })}
                  {' · '}{durationStr(w)}{' · '}{w.exercises.length} Übungen
                </div>
              </div>
              {expanded === w.id
                ? <ChevronUp size={16} color="#6B7280" />
                : <ChevronDown size={16} color="#6B7280" />}
            </button>

            {expanded === w.id && (
              <div style={{ padding: '0 16px 16px', borderTop: '1px solid #2E2E38' }}>
                <button
                  onClick={() => { if (confirm('Workout löschen?')) deleteWorkout(w.id) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#EF4444', fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', marginTop: 12, marginBottom: 4, fontFamily: 'inherit' }}
                >
                  <Trash2 size={12} /> Workout löschen
                </button>

                {/* Muscle summary */}
                {(() => {
                  const muscles = aggregateMuscles(w)
                  if (!muscles.primary.length && !muscles.secondary.length) return null
                  return (
                    <div style={{ marginBottom: 14 }}>
                      <p style={{ color: '#6B7280', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, marginBottom: 8 }}>Trainierte Muskeln</p>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                        <MuscleSVG size="lg" primary={muscles.primary} secondary={muscles.secondary} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                          {muscles.primary.map((id) => (
                            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF6B3D' }} />
                              <span style={{ color: '#F9FAFB', fontSize: 11 }}>{MUSCLE_BY_ID[id]?.name ?? id}</span>
                            </div>
                          ))}
                          {muscles.secondary.map((id) => (
                            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#5BB8FF', opacity: 0.7 }} />
                              <span style={{ color: '#6B7280', fontSize: 11 }}>{MUSCLE_BY_ID[id]?.name ?? id}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* Set details */}
                {w.exercises.map((we) => (
                  <div key={we.id} style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: we.exercise?.category === 'strength' ? '#5BB8FF' : we.exercise?.category === 'cardio' ? '#4ADE80' : '#A855F7' }} />
                      <span style={{ color: '#F9FAFB', fontSize: 12, fontWeight: 600 }}>{we.exercise?.name ?? we.exerciseId}</span>
                    </div>
                    {we.sets.filter((s) => s.completed).map((s, i) => (
                      <div key={s.id} style={{ color: '#9CA3AF', fontSize: 11, marginLeft: 14, marginBottom: 2 }}>
                        Satz {i + 1}{s.isWarmup ? ' (W)' : ''}:{' '}
                        {s.weightKg != null ? `${s.weightKg}kg` : ''}
                        {s.reps != null ? ` × ${s.reps}` : ''}
                        {s.distanceMeters != null ? ` ${(s.distanceMeters / 1000).toFixed(2)}km` : ''}
                        {s.durationSeconds != null ? ` ${Math.floor(s.durationSeconds / 60)}:${(s.durationSeconds % 60).toString().padStart(2, '0')}` : ''}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/history/page.tsx
git commit -m "feat: History page dark theme — dark cards, orange/blue muscle legend"
```

---

## Task 12: Stats Page — Dark Theme + Recharts Restyled

**Files:**
- Modify: `src/app/stats/page.tsx`

- [ ] **Step 1: Apply dark theme and restyle charts**

```tsx
'use client'
import { useEffect, useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { useTrackerStore } from '@/store/useTrackerStore'
import {
  buildChartData, calcStreak, workoutsThisWeek,
  calcVolume, calcOneRM, formatPace,
} from '@/lib/analytics'
import type { TrackerWorkout } from '@/types/tracker'

function avgDurationMin(workouts: TrackerWorkout[]): number {
  const finished = workouts.filter((w) => w.finishedAt)
  if (!finished.length) return 0
  const total = finished.reduce((sum, w) => sum + (new Date(w.finishedAt!).getTime() - new Date(w.startedAt).getTime()), 0)
  return Math.round(total / finished.length / 60000)
}

function totalSetsCompleted(workouts: TrackerWorkout[]): number {
  return workouts.flatMap((w) => w.exercises.flatMap((e) => e.sets)).filter((s) => s.completed).length
}

const TOOLTIP_STYLE = {
  contentStyle: { background: '#27272F', border: '1px solid #374151', borderRadius: 8, color: '#F9FAFB', fontSize: 11 },
  labelStyle: { color: '#9CA3AF' },
  cursor: { stroke: '#374151' },
}

export default function StatsPage() {
  const { workouts, exercises, fetchWorkouts, fetchExercises } = useTrackerStore()

  useEffect(() => {
    fetchWorkouts()
    fetchExercises()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const streak = calcStreak(workouts)
  const thisWeek = workoutsThisWeek(workouts)
  const avgMin = avgDurationMin(workouts)
  const totalSets = totalSetsCompleted(workouts)

  const exercisesInHistory = useMemo(() => {
    const ids = new Set(workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId)))
    return exercises.filter((ex) => ids.has(ex.id))
  }, [workouts, exercises])

  const statCards = [
    { label: 'Tage Streak', value: streak, accent: '#FF6B3D' },
    { label: 'Workouts / Woche', value: thisWeek, accent: '#5BB8FF' },
    { label: 'Ø Dauer', value: avgMin > 0 ? `${avgMin} min` : '—', accent: null },
    { label: 'Sätze gesamt', value: totalSets, accent: null },
  ]

  return (
    <div style={{ padding: '20px 16px 32px' }}>
      <h1 style={{ color: '#F9FAFB', fontSize: 24, fontWeight: 900, marginBottom: 20 }}>Statistiken</h1>

      {/* Summary grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
        {statCards.map(({ label, value, accent }) => (
          <div key={label} style={{ background: '#27272F', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: accent ?? '#F9FAFB', marginBottom: 2 }}>{value}</div>
            <div style={{ fontSize: 10, color: '#6B7280' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Per-exercise charts */}
      {exercisesInHistory.length > 0 && (
        <div>
          <h2 style={{ color: '#6B7280', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
            Fortschritt pro Übung
          </h2>
          <div style={{ display: 'flex', overflowX: 'auto', gap: 12, paddingBottom: 8, scrollbarWidth: 'none' }}>
            {exercisesInHistory.map((ex) => {
              const data = buildChartData(workouts, ex.id, ex.defaultTrackingType)
              if (!data.length) return null

              const latestSets = workouts
                .flatMap((w) => w.exercises.filter((e) => e.exerciseId === ex.id).flatMap((e) => e.sets))
                .filter((s) => s.completed && !s.isWarmup)

              const best1RM = ex.defaultTrackingType === 'weight_reps' ? calcOneRM(latestSets) : 0
              const totalVol = ex.defaultTrackingType === 'weight_reps' ? calcVolume(latestSets) : 0

              const dotColor = ex.category === 'strength' ? '#5BB8FF' : ex.category === 'cardio' ? '#4ADE80' : '#A855F7'

              return (
                <div
                  key={ex.id}
                  style={{ flexShrink: 0, background: '#27272F', borderRadius: 14, padding: '14px 16px', width: 'calc(100vw - 48px)', maxWidth: 382, scrollSnapAlign: 'center' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor }} />
                    <span style={{ color: '#F9FAFB', fontSize: 13, fontWeight: 700 }}>{ex.name}</span>
                  </div>

                  {ex.defaultTrackingType === 'weight_reps' && best1RM > 0 && (
                    <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
                      <div>
                        <div style={{ color: '#FF6B3D', fontSize: 18, fontWeight: 800 }}>{Math.round(best1RM)} kg</div>
                        <div style={{ color: '#6B7280', fontSize: 10 }}>1RM (Epley)</div>
                      </div>
                      <div>
                        <div style={{ color: '#5BB8FF', fontSize: 18, fontWeight: 800 }}>{Math.round(totalVol)} kg</div>
                        <div style={{ color: '#6B7280', fontSize: 10 }}>Gesamtvolumen</div>
                      </div>
                    </div>
                  )}

                  {ex.defaultTrackingType === 'weight_reps' && (
                    <>
                      <p style={{ color: '#6B7280', fontSize: 10, marginBottom: 4 }}>Volumen</p>
                      <ResponsiveContainer width="100%" height={100}>
                        <LineChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2E2E38" />
                          <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6B7280' }} tickFormatter={(d: string) => d.slice(5)} />
                          <YAxis tick={{ fontSize: 9, fill: '#6B7280' }} width={35} />
                          <Tooltip {...TOOLTIP_STYLE} formatter={(v: unknown) => [`${Math.round(Number(v))} kg`, 'Vol']} />
                          <Line type="monotone" dataKey="volume" stroke="#FF6B3D" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                      <p style={{ color: '#6B7280', fontSize: 10, marginBottom: 4, marginTop: 12 }}>1RM</p>
                      <ResponsiveContainer width="100%" height={100}>
                        <LineChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2E2E38" />
                          <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6B7280' }} tickFormatter={(d: string) => d.slice(5)} />
                          <YAxis tick={{ fontSize: 9, fill: '#6B7280' }} width={35} />
                          <Tooltip {...TOOLTIP_STYLE} formatter={(v: unknown) => [`${Math.round(Number(v))} kg`, '1RM']} />
                          <Line type="monotone" dataKey="oneRM" stroke="#5BB8FF" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </>
                  )}

                  {ex.defaultTrackingType === 'distance_time' && (
                    <>
                      <p style={{ color: '#6B7280', fontSize: 10, marginBottom: 4 }}>Pace (min/km)</p>
                      <ResponsiveContainer width="100%" height={100}>
                        <LineChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2E2E38" />
                          <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6B7280' }} tickFormatter={(d: string) => d.slice(5)} />
                          <YAxis tick={{ fontSize: 9, fill: '#6B7280' }} width={40} tickFormatter={(v: number) => `${Math.floor(v)}:${Math.round((v % 1) * 60).toString().padStart(2, '0')}`} />
                          <Tooltip {...TOOLTIP_STYLE} formatter={(v: unknown) => [formatPace(Number(v)), 'Pace']} />
                          <Line type="monotone" dataKey="paceMinPerKm" stroke="#4ADE80" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                      <p style={{ color: '#6B7280', fontSize: 10, marginBottom: 4, marginTop: 12 }}>Distanz (km)</p>
                      <ResponsiveContainer width="100%" height={100}>
                        <BarChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2E2E38" />
                          <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6B7280' }} tickFormatter={(d: string) => d.slice(5)} />
                          <YAxis tick={{ fontSize: 9, fill: '#6B7280' }} width={35} />
                          <Tooltip {...TOOLTIP_STYLE} formatter={(v: unknown) => [`${Number(v).toFixed(2)} km`, 'Dist']} />
                          <Bar dataKey="distanceKm" fill="#4ADE80" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </>
                  )}

                  {ex.defaultTrackingType === 'time_only' && (
                    <>
                      <p style={{ color: '#6B7280', fontSize: 10, marginBottom: 4 }}>Dauer (min)</p>
                      <ResponsiveContainer width="100%" height={100}>
                        <BarChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2E2E38" />
                          <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6B7280' }} tickFormatter={(d: string) => d.slice(5)} />
                          <YAxis tick={{ fontSize: 9, fill: '#6B7280' }} width={35} />
                          <Tooltip {...TOOLTIP_STYLE} formatter={(v: unknown) => [`${Math.round(Number(v))} min`, 'Dauer']} />
                          <Bar dataKey="durationMin" fill="#A855F7" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </>
                  )}

                  <p style={{ color: '#374151', fontSize: 9, textAlign: 'center', marginTop: 8 }}>← swipen →</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {workouts.length === 0 && (
        <div style={{ textAlign: 'center', color: '#6B7280', marginTop: 80 }}>
          <p style={{ fontSize: 36, marginBottom: 16 }}>📊</p>
          <p style={{ color: '#F9FAFB', fontWeight: 600, fontSize: 14 }}>Noch keine Daten</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>Beende dein erstes Workout, um Statistiken zu sehen.</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Final build check**

Run: `npm run build`
Expected: `✓ Compiled successfully` — no TypeScript errors, no missing imports

- [ ] **Step 4: Full visual review**

Start dev: `npm run dev`

Check each screen:
- **Home idle**: dark bg, Outfit font, orange Streak widget (52px), blue Friends widget (watch-face), white weekly chart, last workout card (no color stripe), sticky orange CTA
- **Home → tap CTA**: home content slides up/fades, start screen fades in
- **Start screen**: dark input, front+back SVG preview, grouped pills (orange active)
- **Active workout**: orange header, dark exercise rows, orange CTA in SetLogger
- **Verlauf**: dark accordion cards, orange/blue muscle legend in expanded state
- **Stats**: dark cards, orange/blue line charts, dark chart grid

- [ ] **Step 5: Commit**

```bash
git add src/app/stats/page.tsx
git commit -m "feat: Stats page dark theme — orange/blue recharts, dark tooltip"
```
