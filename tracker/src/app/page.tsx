'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
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

  // Sync state machine with store
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
            ref={workoutNameInputRef}
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
