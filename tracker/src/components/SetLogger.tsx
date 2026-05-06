'use client'
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useTrackerStore } from '@/store/useTrackerStore'
import type { ActiveWorkoutExercise, TrackerSet } from '@/types/tracker'

interface SetLoggerProps {
  workoutExercise: ActiveWorkoutExercise
  onClose: () => void
}

function parseDuration(s: string): number {
  const parts = s.split(':')
  if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1])
  return parseInt(s) * 60
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
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [distance, setDistance] = useState('')
  const [duration, setDuration] = useState('')
  const [isWarmup, setIsWarmup] = useState(false)

  // swipe-to-close
  const touchStartY = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 280)
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY
  }

  function onTouchEnd(e: React.TouchEvent) {
    const delta = e.changedTouches[0].clientY - touchStartY.current
    if (delta > 60) handleClose()
  }

  const catColor =
    ex.category === 'strength'
      ? 'bg-blue-500'
      : ex.category === 'cardio'
        ? 'bg-green-500'
        : 'bg-purple-500'

  const currentSets =
    activeWorkout?.exercises.find((we) => we.id === workoutExercise.id)?.sets ?? []

  async function handleAddSet() {
    const setData: Partial<TrackerSet> = { isWarmup, completed: true }
    if (type === 'weight_reps') {
      if (weight) setData.weightKg = parseFloat(weight)
      if (reps) setData.reps = parseInt(reps)
    } else if (type === 'distance_time') {
      if (distance) setData.distanceMeters = parseFloat(distance) * 1000
      if (duration) setData.durationSeconds = parseDuration(duration)
    } else {
      if (duration) setData.durationSeconds = parseDuration(duration)
    }
    await addSet(workoutExercise.id, setData)
    setWeight('')
    setReps('')
    setDistance('')
    setDuration('')
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end transition-colors duration-300 ${visible ? 'bg-black/20' : 'bg-transparent'}`}
      onClick={handleClose}
    >
      <div
        ref={sheetRef}
        className={`w-full max-w-[430px] mx-auto bg-white rounded-t-3xl shadow-2xl p-6 flex flex-col transform transition-transform duration-300 ease-out ${visible ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '65vh' }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* drag handle */}
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5 cursor-grab" />

        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className={`w-1 h-6 rounded-full ${catColor}`} />
              <h2 className="text-xl font-bold text-black">{ex.name}</h2>
            </div>
            <p className="text-sm text-gray-500 ml-3 capitalize">{ex.category}</p>
          </div>
          <button onClick={handleClose}>
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* scrollable content */}
        <div className="overflow-y-auto flex-1 min-h-0">
          <div className="flex flex-col gap-3 mb-4">
            {type === 'weight_reps' && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Gewicht (kg)</label>
                  <input
                    type="number" inputMode="decimal" value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    className="w-full text-3xl font-bold bg-gray-50 rounded-xl px-4 py-3 outline-none"
                    placeholder="0"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Wdh.</label>
                  <input
                    type="number" inputMode="numeric" value={reps}
                    onChange={(e) => setReps(e.target.value)}
                    className="w-full text-3xl font-bold bg-gray-50 rounded-xl px-4 py-3 outline-none"
                    placeholder="0"
                  />
                </div>
              </div>
            )}
            {type === 'distance_time' && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Distanz (km)</label>
                  <input
                    type="number" inputMode="decimal" value={distance}
                    onChange={(e) => setDistance(e.target.value)}
                    className="w-full text-3xl font-bold bg-gray-50 rounded-xl px-4 py-3 outline-none"
                    placeholder="0.0"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Dauer (mm:ss)</label>
                  <input
                    type="text" value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-full text-3xl font-bold bg-gray-50 rounded-xl px-4 py-3 outline-none"
                    placeholder="00:00"
                  />
                </div>
              </div>
            )}
            {type === 'time_only' && (
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Dauer (mm:ss)</label>
                <input
                  type="text" value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-full text-3xl font-bold bg-gray-50 rounded-xl px-4 py-3 outline-none"
                  placeholder="00:00"
                />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={isWarmup} onChange={(e) => setIsWarmup(e.target.checked)} className="rounded" />
              Aufwärmsatz
            </label>
          </div>

          {currentSets.length > 0 && (
            <div className="mb-4 flex flex-col gap-1">
              {currentSets.map((s, i) => (
                <div key={s.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                  <span className="text-sm text-gray-700">
                    Satz {i + 1}{s.isWarmup ? ' (W)' : ''}{' '}
                    {s.weightKg != null ? `${s.weightKg}kg` : ''}
                    {s.reps != null ? ` × ${s.reps}` : ''}
                    {s.distanceMeters != null ? ` ${(s.distanceMeters / 1000).toFixed(1)}km` : ''}
                    {s.durationSeconds != null ? ` ${formatSecs(s.durationSeconds)}` : ''}
                  </span>
                  <button onClick={() => removeSet(workoutExercise.id, s.id)} className="text-gray-300 hover:text-red-400 ml-2">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => { void handleAddSet() }}
          className="w-full bg-black text-white rounded-2xl py-4 font-semibold text-base mt-3 shrink-0"
        >
          + Satz hinzufügen
        </button>
      </div>
    </div>
  )
}
