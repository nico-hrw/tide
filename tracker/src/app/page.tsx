'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTrackerStore } from '@/store/useTrackerStore'
import StatCard from '@/components/StatCard'
import SyncStatus from '@/components/SyncStatus'
import { calcStreak, workoutsThisWeek, volumeThisWeek } from '@/lib/analytics'
import { apiFetch } from '@/lib/api'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Guten Morgen'
  if (h < 18) return 'Guten Tag'
  return 'Guten Abend'
}

export default function HomePage() {
  const { workouts, activeWorkout, fetchWorkouts } = useTrackerStore()
  const router = useRouter()
  const [username, setUsername] = useState<string | null>(null)

  useEffect(() => {
    fetchWorkouts()
    apiFetch('/auth/me')
      .then((r) => r.json())
      .then((data) => setUsername(data.username ?? null))
      .catch(() => null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const streak = calcStreak(workouts)
  const thisWeek = workoutsThisWeek(workouts)
  const weekVol = volumeThisWeek(workouts)

  return (
    <div className="px-4 pt-12 pb-4">
      <h1 className="text-2xl font-bold text-black mb-0.5">
        {greeting()}{username ? `, ${username}` : ''} 👋
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {new Date().toLocaleDateString('de-DE', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
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
        {activeWorkout ? (
          <button
            onClick={() => router.push('/workout')}
            className="w-full bg-black text-white rounded-2xl py-4 font-semibold text-base"
          >
            Workout fortsetzen → {activeWorkout.name}
          </button>
        ) : (
          <button
            onClick={() => router.push('/workout')}
            className="w-full bg-black text-white rounded-2xl py-4 font-semibold text-base"
          >
            + Neues Workout starten
          </button>
        )}
      </div>

      {workouts.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wide">
            Letzte Sessions
          </h2>
          <div className="flex flex-col gap-2">
            {workouts.slice(0, 3).map((w) => (
              <button
                key={w.id}
                onClick={() => router.push('/history')}
                className="bg-white rounded-2xl p-4 shadow-sm text-left w-full"
              >
                <div className="font-semibold text-black">{w.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {new Date(w.startedAt).toLocaleDateString('de-DE')} ·{' '}
                  {w.exercises.length} Übungen
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
