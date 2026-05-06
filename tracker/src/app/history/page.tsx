'use client'
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { useTrackerStore } from '@/store/useTrackerStore'
import type { TrackerWorkout } from '@/types/tracker'

function durationStr(w: TrackerWorkout): string {
  if (!w.finishedAt) return 'Aktiv'
  const ms = new Date(w.finishedAt).getTime() - new Date(w.startedAt).getTime()
  const mins = Math.round(ms / 60000)
  return `${mins} Min`
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
      <div className="px-4 pt-12 text-center text-gray-400 mt-20">
        <p className="text-4xl mb-4">🏋️</p>
        <p className="font-medium">Noch keine Workouts</p>
        <p className="text-sm mt-1">Starte dein erstes Training!</p>
      </div>
    )
  }

  return (
    <div className="px-4 pt-12">
      <h1 className="text-2xl font-bold mb-6">Verlauf</h1>
      <div className="flex flex-col gap-3">
        {workouts.map((w) => (
          <div key={w.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <button
              className="w-full p-4 text-left flex items-center justify-between"
              onClick={() => setExpanded(expanded === w.id ? null : w.id)}
            >
              <div className="flex-1 text-left">
                <div className="font-semibold text-black">{w.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {new Date(w.startedAt).toLocaleDateString('de-DE', {
                    weekday: 'short', day: 'numeric', month: 'short',
                  })}{' '}· {durationStr(w)} · {w.exercises.length} Übungen
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteWorkout(w.id) }}
                className="p-1 text-gray-300 hover:text-red-400 mr-1"
              >
                <Trash2 size={15} />
              </button>
              {expanded === w.id ? (
                <ChevronUp size={18} className="text-gray-400" />
              ) : (
                <ChevronDown size={18} className="text-gray-400" />
              )}
            </button>

            {expanded === w.id && (
              <div className="px-4 pb-4 border-t border-gray-50">
                {w.exercises.map((we) => (
                  <div key={we.id} className="mt-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          we.exercise?.category === 'strength'
                            ? 'bg-blue-500'
                            : we.exercise?.category === 'cardio'
                              ? 'bg-green-500'
                              : 'bg-purple-500'
                        }`}
                      />
                      <span className="text-sm font-medium">
                        {we.exercise?.name ?? we.exerciseId}
                      </span>
                    </div>
                    {we.sets
                      .filter((s) => s.completed)
                      .map((s, i) => (
                        <div key={s.id} className="text-xs text-gray-500 ml-4">
                          Satz {i + 1}
                          {s.isWarmup ? ' (W)' : ''}:
                          {s.weightKg != null ? ` ${s.weightKg}kg` : ''}
                          {s.reps != null ? ` × ${s.reps}` : ''}
                          {s.distanceMeters != null
                            ? ` ${(s.distanceMeters / 1000).toFixed(2)}km`
                            : ''}
                          {s.durationSeconds != null
                            ? ` ${Math.floor(s.durationSeconds / 60)}:${(s.durationSeconds % 60).toString().padStart(2, '0')}`
                            : ''}
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
