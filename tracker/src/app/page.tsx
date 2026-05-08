'use client'
import { useEffect, useState } from 'react'
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
  const [activeVisible, setActiveVisible] = useState(false)
  const [startingWorkout, setStartingWorkout] = useState(false)
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

  useEffect(() => {
    if (!hasActive) {
      setActiveVisible(false)
      return
    }
    const id = requestAnimationFrame(() => setActiveVisible(true))
    return () => cancelAnimationFrame(id)
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
    if (startingWorkout) return
    setStartingWorkout(true)
    try {
      const name = workoutName.trim() || 'Training'
      await startWorkout(name, targetMuscles)
      setStarting(false)
      setWorkoutName('')
      setTargetMuscles([])
    } finally {
      setStartingWorkout(false)
    }
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
        style={{ opacity: activeVisible ? 1 : 0 }}
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
          disabled={startingWorkout}
          className="w-full bg-black text-white rounded-2xl py-4 font-semibold text-base mb-3 disabled:opacity-60"
        >
          {startingWorkout ? '…' : 'Starten →'}
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
    <div className="px-4 pt-12 pb-4">
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
