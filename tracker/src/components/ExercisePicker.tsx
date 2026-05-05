'use client'
import { useState } from 'react'
import { Search, X } from 'lucide-react'
import { useTrackerStore } from '@/store/useTrackerStore'
import type { TrackerExercise } from '@/types/tracker'

const CATEGORY_LABELS = {
  strength: 'Kraft',
  cardio: 'Cardio',
  flexibility: 'Beweglichkeit',
} as const

const CATEGORY_COLORS = {
  strength: 'bg-blue-100 text-blue-700',
  cardio: 'bg-green-100 text-green-700',
  flexibility: 'bg-purple-100 text-purple-700',
} as const

interface ExercisePickerProps {
  onSelect: (exercise: TrackerExercise) => void
  onClose: () => void
}

export default function ExercisePicker({ onSelect, onClose }: ExercisePickerProps) {
  const { exercises } = useTrackerStore()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string | null>(null)

  const filtered = exercises.filter((e) => {
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter == null || e.category === filter
    return matchSearch && matchFilter
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full max-w-[430px] mx-auto bg-white rounded-t-3xl shadow-2xl p-6 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Übung wählen</h2>
          <button onClick={onClose}>
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="relative mb-3">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suchen…"
            className="w-full bg-gray-50 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none"
          />
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {(['strength', 'cardio', 'flexibility'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(filter === cat ? null : cat)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium ${
                filter === cat ? CATEGORY_COLORS[cat] : 'bg-gray-100 text-gray-600'
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex flex-col gap-2">
          {filtered.map((ex) => (
            <button
              key={ex.id}
              onClick={() => {
                onSelect(ex)
                onClose()
              }}
              className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 text-left hover:bg-gray-100"
            >
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${
                  ex.category === 'strength'
                    ? 'bg-blue-500'
                    : ex.category === 'cardio'
                      ? 'bg-green-500'
                      : 'bg-purple-500'
                }`}
              />
              <div>
                <div className="text-sm font-medium text-black">{ex.name}</div>
                <div className="text-xs text-gray-400">{CATEGORY_LABELS[ex.category]}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
