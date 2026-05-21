# Tracker Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 8 UX improvements: widget heights, FriendsWidget polish, home scroll fix, muscle intensity coloring, set pre-fill, SetLogger popup height, history multi-expand + tab order, swipe navigation + theme-color.

**Architecture:** All changes are in `tracker/src`. No data model changes. New utility function `getSuggestedSet` added inline in SetLogger. MuscleSVG gains an optional `intensityMap` prop. WeeklyChart gains local `weekOffset` + `viewMode` state. All other changes are purely cosmetic or behavioral within existing components.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind (layout utils only), inline styles for design tokens

---

## File Map

| File | Change |
|---|---|
| `src/app/page.tsx` | Widget height 192px, scroll fix, CTA bottom:56, expandable last workout |
| `src/components/FriendsWidget.tsx` | 10s interval, 44px stat, no dots, swipe support |
| `src/components/WeeklyChart.tsx` | Week navigation (left/right), month view (down swipe) |
| `src/components/MuscleSVG.tsx` | Add optional `intensityMap` prop |
| `src/components/ActiveWorkoutView.tsx` | Compute intensityMap, pass to MuscleSVG |
| `src/components/SetLogger.tsx` | Pre-fill from history, popup extends to bottom |
| `src/app/history/page.tsx` | Multi-expand (Set→string\|null becomes Set\<string\>) |
| `src/components/BottomNav.tsx` | Swap Stats and Verlauf order |
| `src/app/layout.tsx` | Add theme-color viewport meta |

---

## Task 1: page.tsx — Widget Heights, Scroll Fix, CTA Position, Expandable Last Workout

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace page.tsx**

```tsx
'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
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
  const [lastWorkoutExpanded, setLastWorkoutExpanded] = useState(false)

  const phrase = useMemo(() => PHRASES[Math.floor(Math.random() * PHRASES.length)], [])
  const workoutNameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchWorkouts()
    fetchExercises()
    apiFetch('/auth/me')
      .then((r) => r.json())
      .then((d) => setUsername(d.username ?? null))
      .catch(() => null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (activeWorkout && homeState !== 'active') setHomeState('active')
    if (!activeWorkout && homeState === 'active') setHomeState('idle')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkout])

  useEffect(() => {
    if (homeState === 'starting') {
      const timer = setTimeout(() => workoutNameInputRef.current?.focus(), 300)
      return () => clearTimeout(timer)
    }
  }, [homeState])

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

  // overflowY is 'hidden' for idle (no accidental page scroll) unless last workout is expanded
  const panelStyle = (visible: boolean, direction: 'up' | 'down' = 'up', overflow: 'hidden' | 'auto' = 'auto'): React.CSSProperties => ({
    position: 'absolute',
    inset: 0,
    transition: 'opacity 280ms ease, transform 280ms ease',
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : `translateY(${direction === 'up' ? '-40px' : '40px'})`,
    pointerEvents: visible ? 'auto' : 'none',
    overflowY: overflow,
  })

  return (
    // height (not minHeight) + overflow:hidden prevents the page from growing beyond the viewport
    <div style={{ position: 'relative', height: 'calc(100dvh - 50px)', overflow: 'hidden', background: '#1E1E24' }}>

      {/* ── PANEL: IDLE ── */}
      <div style={panelStyle(homeState === 'idle', 'up', lastWorkoutExpanded ? 'auto' : 'hidden')}>
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

          {/* Hero widgets — 1.6× taller: 192px */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 9 }}>
            <div style={{
              background: '#FF6B3D', borderRadius: 16, padding: '14px 14px 12px',
              height: 192, display: 'flex', flexDirection: 'column',
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
            {/* FriendsWidget height is controlled by the component itself */}
            <div style={{ height: 192 }}>
              <FriendsWidget />
            </div>
          </div>

          {/* Weekly activity */}
          <div style={{ marginBottom: 9 }}>
            <WeeklyChart workouts={workouts} />
          </div>

          {/* Last workout — expandable */}
          {lastWorkout && (
            <div
              style={{ background: '#27272F', borderRadius: 13, padding: '11px 12px', cursor: 'pointer', marginBottom: 9 }}
              onClick={() => setLastWorkoutExpanded(prev => !prev)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
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
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <MuscleSVG size="sm" primary={lastWorkoutMuscles.primary} secondary={lastWorkoutMuscles.secondary} />
                  {lastWorkoutExpanded
                    ? <ChevronUp size={12} color="#6B7280" />
                    : <ChevronDown size={12} color="#6B7280" />}
                </div>
              </div>

              {lastWorkoutExpanded && (
                <div style={{ borderTop: '1px solid #374151', paddingTop: 12, marginTop: 12 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                    <MuscleSVG size="lg" primary={lastWorkoutMuscles.primary} secondary={lastWorkoutMuscles.secondary} />
                  </div>
                  {lastWorkout.exercises.map((we) => {
                    const completedSets = we.sets.filter(s => s.completed && !s.isWarmup)
                    return (
                      <div key={we.id} style={{ marginBottom: 8 }}>
                        <div style={{ color: '#F9FAFB', fontSize: 11, fontWeight: 600 }}>{we.exercise?.name ?? we.exerciseId}</div>
                        <div style={{ color: '#9CA3AF', fontSize: 9, marginTop: 2 }}>
                          {completedSets.length} Sätze
                          {completedSets[0]?.weightKg != null ? ` · bis ${Math.max(...completedSets.map(s => s.weightKg!))}kg` : ''}
                          {completedSets[0]?.reps != null ? ` × ${completedSets[0].reps}` : ''}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
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
            ref={workoutNameInputRef}
            style={{
              width: '100%', background: '#27272F', borderRadius: 12,
              padding: '14px 16px', fontSize: 16, fontWeight: 600,
              color: '#F9FAFB', border: 'none', outline: 'none',
              marginBottom: 24, boxSizing: 'border-box', fontFamily: 'inherit',
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            {/* TODO: Interactive muscle selection — replace pills with direct SVG tap targets.
                Each <path> can receive onClick + visual highlight when interactive=true.
                Also: consider replacing SVG paths with high-quality anatomical PNG/WebP images
                per muscle group for a premium look. The interactive prop and onToggle callback
                are already wired — swap the SVG content when assets are ready. */}
            <MuscleSVG size="md" primary={targetMuscles} secondary={[]} />
          </div>

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

      {/* ── STICKY CTA (idle) — bottom:56 keeps it 6px above the nav ── */}
      {homeState === 'idle' && (
        <div style={{
          position: 'fixed', bottom: 56,
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
          position: 'fixed', bottom: 56,
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

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit` from `tracker/`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: 192px widgets, no-scroll idle, CTA +6px, expandable last workout"
```

---

## Task 2: FriendsWidget — Slower, Bigger, No Dots, Swipe

**Files:**
- Modify: `src/components/FriendsWidget.tsx`

- [ ] **Step 1: Replace FriendsWidget.tsx**

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'

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
  const touchStartX = useRef(0)

  // 10s auto-rotate (was 4s — too fast)
  useEffect(() => {
    if (ACTIVITIES.length <= 1) return
    const id = setInterval(() => setIndex((i) => (i + 1) % ACTIVITIES.length), 10000)
    return () => clearInterval(id)
  }, [])

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }

  function onTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 30) {
      if (dx < 0) setIndex(i => (i + 1) % ACTIVITIES.length)
      else setIndex(i => (i - 1 + ACTIVITIES.length) % ACTIVITIES.length)
    }
  }

  if (ACTIVITIES.length === 0) {
    return (
      <div style={{
        background: '#5BB8FF', borderRadius: 16, padding: '14px 12px',
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxSizing: 'border-box',
      }}>
        <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 11, textAlign: 'center', fontWeight: 500, lineHeight: 1.4 }}>
          Noch keine Freunde aktiv heute 🤫
        </div>
      </div>
    )
  }

  const { name, stat, unit, action, time } = ACTIVITIES[index]

  return (
    <div
      style={{
        background: '#5BB8FF', borderRadius: 16, padding: '14px 13px 13px',
        height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', boxSizing: 'border-box', overflow: 'hidden',
        userSelect: 'none',
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Name — dimmed, subordinate */}
      <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 14, fontWeight: 700, lineHeight: 1, marginBottom: 4 }}>
        {name}
      </div>

      {/* Big stat — watch-face style, fills the widget */}
      <div style={{ color: '#0D1117', fontWeight: 900, lineHeight: 0.9, letterSpacing: '-2px', marginBottom: 6 }}>
        <span style={{ fontSize: 44 }}>{stat}</span>
        <span style={{ fontSize: 22, letterSpacing: '-0.5px' }}> {unit}</span>
      </div>

      {/* Action */}
      <div style={{ color: 'rgba(0,0,0,0.65)', fontSize: 13, fontWeight: 600, lineHeight: 1.2, marginBottom: 3 }}>
        {action}
      </div>

      {/* Timestamp */}
      <div style={{ color: 'rgba(0,0,0,0.35)', fontSize: 10 }}>
        {time}
      </div>

      {/* No dots — removed per user request */}
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/FriendsWidget.tsx
git commit -m "feat: FriendsWidget — 10s rotate, bigger text, no dots, swipe support"
```

---

## Task 3: WeeklyChart — Week Navigation + Month View

**Files:**
- Modify: `src/components/WeeklyChart.tsx`

- [ ] **Step 1: Replace WeeklyChart.tsx**

```tsx
'use client'
import { useMemo, useRef, useState } from 'react'
import type { TrackerWorkout } from '@/types/tracker'

interface WeeklyChartProps {
  workouts: TrackerWorkout[]
}

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const MAX_BAR_PX = 34

function getWeekStart(offsetWeeks: number): Date {
  const now = new Date()
  const dayOfWeek = (now.getDay() + 6) % 7 // 0 = Monday
  const ws = new Date(now)
  ws.setDate(now.getDate() - dayOfWeek + offsetWeeks * 7)
  ws.setHours(0, 0, 0, 0)
  return ws
}

function getWeekDurations(workouts: TrackerWorkout[], weekStart: Date): number[] {
  const durations = new Array<number>(7).fill(0)
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000)
  for (const w of workouts) {
    if (!w.finishedAt) continue
    const started = new Date(w.startedAt)
    if (started < weekStart || started >= weekEnd) continue
    const dayIndex = Math.min(6, Math.floor((started.getTime() - weekStart.getTime()) / 86_400_000))
    durations[dayIndex] += (new Date(w.finishedAt).getTime() - started.getTime()) / 60_000
  }
  return durations
}

function getMonthWeekTotals(workouts: TrackerWorkout[]): number[] {
  // 4 bars: 3 weeks ago, 2 weeks ago, last week, this week
  return [0, 1, 2, 3].map(i => {
    const ws = getWeekStart(i - 3)
    const we = new Date(ws.getTime() + 7 * 86_400_000)
    return workouts
      .filter(w => {
        if (!w.finishedAt) return false
        const s = new Date(w.startedAt)
        return s >= ws && s < we
      })
      .reduce((sum, w) => sum + (new Date(w.finishedAt!).getTime() - new Date(w.startedAt).getTime()) / 60_000, 0)
  })
}

function weekLabel(offset: number): string {
  if (offset === 0) return 'Diese Woche'
  if (offset === -1) return 'Letzte Woche'
  return `Vor ${-offset} Wochen`
}

export default function WeeklyChart({ workouts }: WeeklyChartProps) {
  const [weekOffset, setWeekOffset] = useState(0) // 0 = current, -1 = last week, etc.
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week')
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)

  const weekStart = useMemo(() => getWeekStart(weekOffset), [weekOffset])
  const todayIndex = weekOffset === 0 ? (new Date().getDay() + 6) % 7 : -1

  const weekDurations = useMemo(() => getWeekDurations(workouts, weekStart), [workouts, weekStart])
  const monthTotals = useMemo(() => getMonthWeekTotals(workouts), [workouts])

  const displayData = viewMode === 'week' ? weekDurations : monthTotals
  const maxDur = Math.max(...displayData, 1)

  const completedDurs = viewMode === 'week'
    ? weekDurations.filter((d, i) => i < todayIndex && d > 0)
    : monthTotals.slice(0, 3).filter(d => d > 0) // past 3 weeks
  const avgDur = completedDurs.length > 0
    ? completedDurs.reduce((a, b) => a + b, 0) / completedDurs.length
    : 0
  const avgBarPx = avgDur > 0 ? Math.round((avgDur / maxDur) * MAX_BAR_PX) : 0

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  function onTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    const isHorizontal = Math.abs(dx) > Math.abs(dy)

    if (!isHorizontal && dy > 40) {
      // Down swipe → month view
      setViewMode(v => v === 'week' ? 'month' : 'week')
      return
    }
    if (isHorizontal && Math.abs(dx) > 30 && viewMode === 'week') {
      // Left → go back in time, right → go forward (max = current week)
      setWeekOffset(o => dx < 0 ? Math.max(o - 1, -52) : Math.min(o + 1, 0))
    }
  }

  const labels = viewMode === 'week' ? DAYS : ['-3W', '-2W', '-1W', '0W']

  return (
    <div
      style={{ background: '#FFFFFF', borderRadius: 14, padding: '12px 13px', userSelect: 'none' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ color: '#374151', fontSize: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {viewMode === 'week' ? weekLabel(weekOffset) : 'Letzter Monat'}
        </div>
        {viewMode === 'month' && (
          <div style={{ color: '#9CA3AF', fontSize: 7 }}>↑ zurück zur Woche</div>
        )}
        {viewMode === 'week' && weekOffset < 0 && (
          <div style={{ color: '#9CA3AF', fontSize: 7 }}>{weekOffset}</div>
        )}
      </div>

      <div style={{ position: 'relative', height: 46 }}>
        {avgBarPx > 0 && (
          <>
            <div style={{
              position: 'absolute', left: 0, right: 20,
              bottom: avgBarPx + 11,
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

        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 38, position: 'relative', zIndex: 1 }}>
          {displayData.map((dur, i) => {
            const barPx = dur > 0 ? Math.max(4, Math.round((dur / maxDur) * MAX_BAR_PX)) : 0
            const isToday = viewMode === 'week' && i === todayIndex
            const isEmpty = barPx === 0
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div style={{
                  width: '100%',
                  borderRadius: '4px 4px 2px 2px',
                  height: isEmpty ? 4 : barPx,
                  background: isEmpty ? '#F3F4F6' : 'linear-gradient(to top, #FF6B3D, #FF9A7A)',
                  ...(isToday && isEmpty ? { border: '1px dashed #FF6B3D', boxSizing: 'border-box' as const } : {}),
                }} />
                <div style={{ color: isToday ? '#FF6B3D' : '#9CA3AF', fontSize: 6.5, fontWeight: isToday ? 700 : 400 }}>
                  {labels[i]}
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

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/WeeklyChart.tsx
git commit -m "feat: WeeklyChart — swipe week navigation, down-swipe month view"
```

---

## Task 4: MuscleSVG Intensity + ActiveWorkoutView

**Files:**
- Modify: `src/components/MuscleSVG.tsx`
- Modify: `src/components/ActiveWorkoutView.tsx`

- [ ] **Step 1: Update MuscleSVG.tsx — add intensityMap prop**

Replace the entire file:

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
  /** Optional: when provided, overrides primary/secondary coloring.
   *  Values are 0–1 (normalized frequency). Higher = more orange / more opaque. */
  intensityMap?: Partial<Record<MuscleId, number>>
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
  intensityMap?: Partial<Record<MuscleId, number>>,
): { fill: string; opacity: number } {
  if (intensityMap) {
    const intensity = intensityMap[id]
    if (intensity != null) {
      // opacity: 0.3 (one exercise) → 1.0 (most-hit muscle in this workout)
      return { fill: '#FF6B3D', opacity: 0.3 + intensity * 0.7 }
    }
    return { fill: '#4B5563', opacity: 1 }
  }
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
  intensityMap?: Partial<Record<MuscleId, number>>
}

function Figure({ view, primary, secondary, interactive, onToggle, width, height, intensityMap }: FigureProps) {
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
        const style = getMuscleStyle(muscle.id, primary, secondary, intensityMap)
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

export default function MuscleSVG({ primary, secondary, interactive = false, onToggle, size, intensityMap }: MuscleSVGProps) {
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
        intensityMap={intensityMap}
      />
    )
  }

  return (
    <div style={{ display: 'flex', gap: size === 'lg' ? 16 : 8, alignItems: 'flex-start' }}>
      <div style={{ textAlign: 'center' }}>
        {size === 'lg' && <p style={{ fontSize: 10, color: '#6B7280', marginBottom: 4 }}>Vorne</p>}
        <Figure view="front" primary={primary} secondary={secondary} interactive={interactive} onToggle={onToggle} width={dims.w} height={dims.h} intensityMap={intensityMap} />
      </div>
      <div style={{ textAlign: 'center' }}>
        {size === 'lg' && <p style={{ fontSize: 10, color: '#6B7280', marginBottom: 4 }}>Hinten</p>}
        <Figure view="back" primary={primary} secondary={secondary} interactive={interactive} onToggle={onToggle} width={dims.w} height={dims.h} intensityMap={intensityMap} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update ActiveWorkoutView.tsx — compute intensityMap**

Add the helper function and pass intensityMap to MuscleSVG. Replace the entire file:

```tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import { Plus, CheckCircle, X } from 'lucide-react'
import { useTrackerStore } from '@/store/useTrackerStore'
import ExercisePicker from '@/components/ExercisePicker'
import SetLogger from '@/components/SetLogger'
import MuscleSVG from '@/components/MuscleSVG'
import { getMusclesForExercise } from '@/lib/builtinExerciseMuscles'
import type { ActiveWorkout, ActiveWorkoutExercise, TrackerExercise, MuscleId } from '@/types/tracker'

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

/** Returns a 0–1 intensity map: each muscle's count normalized to the most-hit muscle. */
function buildIntensityMap(workout: ActiveWorkout): Partial<Record<MuscleId, number>> {
  const counts: Partial<Record<MuscleId, number>> = {}
  for (const we of workout.exercises) {
    const primaryMuscles = we.exercise.primaryMuscles?.length
      ? we.exercise.primaryMuscles
      : getMusclesForExercise(we.exercise.name).primary
    for (const id of primaryMuscles) {
      counts[id] = (counts[id] ?? 0) + 1
    }
  }
  const max = Math.max(...Object.values(counts).filter(Boolean) as number[], 1)
  const result: Partial<Record<MuscleId, number>> = {}
  for (const [id, count] of Object.entries(counts)) {
    result[id as MuscleId] = count! / max
  }
  return result
}

export default function ActiveWorkoutView({ onFinish }: ActiveWorkoutViewProps) {
  const { activeWorkout, addExerciseToWorkout, removeExerciseFromWorkout, finishWorkout, cancelWorkout } = useTrackerStore()
  const [showPicker, setShowPicker] = useState(false)
  const [activeExercise, setActiveExercise] = useState<ActiveWorkoutExercise | null>(null)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const elapsed = useElapsedTimer(activeWorkout?.startedAt ?? null)

  // Rebuild intensity map whenever exercises change
  const intensityMap = useMemo(
    () => activeWorkout ? buildIntensityMap(activeWorkout) : {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeWorkout?.exercises.length]
  )

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
                {/* intensityMap shows how often each muscle is hit across the whole workout */}
                <MuscleSVG
                  size="sm"
                  primary={muscles.primary}
                  secondary={muscles.secondary}
                  intensityMap={intensityMap}
                />
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

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/MuscleSVG.tsx src/components/ActiveWorkoutView.tsx
git commit -m "feat: muscle intensity coloring — more orange = more exercises hit that muscle"
```

---

## Task 5: SetLogger — Pre-fill from History + Popup Height Fix

**Files:**
- Modify: `src/components/SetLogger.tsx`

- [ ] **Step 1: Replace SetLogger.tsx**

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useTrackerStore } from '@/store/useTrackerStore'
import SpinnerInput from '@/components/SpinnerInput'
import type { ActiveWorkoutExercise, TrackerSet, TrackerWorkout } from '@/types/tracker'

interface SetLoggerProps {
  workoutExercise: ActiveWorkoutExercise
  onClose: () => void
}

function formatSecs(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

interface Suggestion {
  weightKg?: number
  reps?: number
  distanceKm?: number
  durationSeconds?: number
  isWarmup?: boolean
}

/**
 * Suggest values for the next set to be added (index = currentSets.length).
 * A) Previous workout at same set index for this exercise
 * B) Last logged set in current workout
 * C) null → use 0
 */
function getSuggestedSet(
  exerciseId: string,
  nextSetIndex: number,
  historicWorkouts: TrackerWorkout[],
  currentSets: TrackerSet[],
): Suggestion | null {
  // A: most recent past finished workout containing this exercise
  for (const workout of historicWorkouts) {
    const we = workout.exercises.find(e => e.exerciseId === exerciseId)
    if (!we) continue
    const sorted = [...we.sets].sort((a, b) => a.sortOrder - b.sortOrder)
    const candidate = sorted[nextSetIndex]
    if (candidate) {
      return {
        weightKg: candidate.weightKg,
        reps: candidate.reps,
        distanceKm: candidate.distanceMeters != null ? candidate.distanceMeters / 1000 : undefined,
        durationSeconds: candidate.durationSeconds,
        isWarmup: candidate.isWarmup,
      }
    }
  }
  // B: last set in current workout for this exercise
  if (currentSets.length > 0) {
    const last = currentSets[currentSets.length - 1]
    return {
      weightKg: last.weightKg,
      reps: last.reps,
      distanceKm: last.distanceMeters != null ? last.distanceMeters / 1000 : undefined,
      durationSeconds: last.durationSeconds,
      isWarmup: last.isWarmup,
    }
  }
  return null
}

export default function SetLogger({ workoutExercise, onClose }: SetLoggerProps) {
  const { addSet, removeSet, activeWorkout, workouts } = useTrackerStore()
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

  const currentSets = activeWorkout?.exercises.find((we) => we.id === workoutExercise.id)?.sets ?? []

  // Pre-fill inputs whenever currentSets.length changes (new set added → suggest next)
  useEffect(() => {
    const suggestion = getSuggestedSet(ex.id, currentSets.length, workouts, currentSets)
    if (suggestion) {
      if (type === 'weight_reps') {
        setWeightKg(suggestion.weightKg)
        setReps(suggestion.reps)
      } else if (type === 'distance_time') {
        setDistanceKm(suggestion.distanceKm)
        if (suggestion.durationSeconds != null) {
          setDurationMin(Math.floor(suggestion.durationSeconds / 60))
          setDurationSec(suggestion.durationSeconds % 60)
        }
      } else {
        if (suggestion.durationSeconds != null) {
          setDurationMin(Math.floor(suggestion.durationSeconds / 60))
          setDurationSec(suggestion.durationSeconds % 60)
        }
      }
      if (suggestion.isWarmup != null) setIsWarmup(suggestion.isWarmup)
    } else {
      // C: no suggestion — default to undefined (SpinnerInput shows placeholder)
      setWeightKg(undefined); setReps(undefined)
      setDistanceKm(undefined); setDurationMin(undefined); setDurationSec(undefined)
      setIsWarmup(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSets.length])

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  function handleClose() { setVisible(false); setTimeout(onClose, 280) }
  function onTouchStart(e: React.TouchEvent) { touchStartY.current = e.touches[0].clientY }
  function onTouchEnd(e: React.TouchEvent) { if (e.changedTouches[0].clientY - touchStartY.current > 60) handleClose() }

  const catColor = ex.category === 'strength' ? '#5BB8FF' : ex.category === 'cardio' ? '#4ADE80' : '#A855F7'

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
    setRir(undefined); setRpe(undefined)
    // Values are reset by the useEffect on currentSets.length (pre-fill next suggestion)
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
          // Popup extends to bottom of screen (covers nav) — no marginBottom
          maxHeight: '90vh',
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

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/SetLogger.tsx
git commit -m "feat: SetLogger — pre-fill from workout history, popup extends to bottom"
```

---

## Task 6: History Multi-Expand + Tab Order + Theme-Color

**Files:**
- Modify: `src/app/history/page.tsx`
- Modify: `src/components/BottomNav.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: history/page.tsx — change expanded from string|null to Set\<string\>**

Only change the state management — everything else stays the same. Find and replace these two lines:

Old state declaration (line 31):
```tsx
const [expanded, setExpanded] = useState<string | null>(null)
```

New:
```tsx
const [expanded, setExpanded] = useState<Set<string>>(new Set())
```

Old toggle handler in the button's onClick (line ~60):
```tsx
onClick={() => setExpanded(expanded === w.id ? null : w.id)}
```

New:
```tsx
onClick={() => setExpanded(prev => {
  const next = new Set(prev)
  next.has(w.id) ? next.delete(w.id) : next.add(w.id)
  return next
})}
```

Old expanded check (line ~66):
```tsx
{expanded === w.id
  ? <ChevronUp size={16} color="#6B7280" />
  : <ChevronDown size={16} color="#6B7280" />}
```

New:
```tsx
{expanded.has(w.id)
  ? <ChevronUp size={16} color="#6B7280" />
  : <ChevronDown size={16} color="#6B7280" />}
```

Old expanded section conditional (line ~71):
```tsx
{expanded === w.id && (
```

New:
```tsx
{expanded.has(w.id) && (
```

- [ ] **Step 2: BottomNav.tsx — swap Stats and Verlauf order**

Change the tabs array from:
```tsx
const tabs = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/history', label: 'Verlauf', icon: History },
  { href: '/stats', label: 'Stats', icon: BarChart2 },
]
```

To:
```tsx
const tabs = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/stats', label: 'Stats', icon: BarChart2 },
  { href: '/history', label: 'Verlauf', icon: History },
]
```

- [ ] **Step 3: layout.tsx — add theme-color viewport meta**

Replace the file:
```tsx
import type { Metadata, Viewport } from 'next'
import { Outfit } from 'next/font/google'
import './globals.css'
import BottomNav from '@/components/BottomNav'
import SyncInit from '@/components/SyncInit'

const outfit = Outfit({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Tide Tracker',
  description: 'Sport Tracker',
}

export const viewport: Viewport = {
  themeColor: '#1E1E24',
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

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/app/history/page.tsx src/components/BottomNav.tsx src/app/layout.tsx
git commit -m "feat: history multi-expand, Stats/Verlauf swap, browser theme-color #1E1E24"
```
