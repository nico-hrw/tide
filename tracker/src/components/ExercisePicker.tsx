'use client'
import { useEffect, useRef, useState } from 'react'
import { Search, Trash2, X, Plus } from 'lucide-react'
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

const DOT_COLORS = {
  strength: 'bg-blue-500',
  cardio: 'bg-green-500',
  flexibility: 'bg-purple-500',
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

  // new exercise form
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState<'strength' | 'cardio' | 'flexibility'>('strength')
  const [newTracking, setNewTracking] = useState<'weight_reps' | 'distance_time' | 'time_only'>('weight_reps')
  const [newMuscles, setNewMuscles] = useState('')
  const [creating, setCreating] = useState(false)

  const touchStartY = useRef(0)

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 280)
  }

  function onTouchStart(e: React.TouchEvent) { touchStartY.current = e.touches[0].clientY }
  function onTouchEnd(e: React.TouchEvent) {
    if (e.changedTouches[0].clientY - touchStartY.current > 60) handleClose()
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await createExercise(newName.trim(), newCategory, newTracking, newMuscles.trim())
      setNewName(''); setNewMuscles(''); setShowCreate(false)
    } finally {
      setCreating(false)
    }
  }

  const filtered = exercises.filter((e) => {
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter == null || e.category === filter
    return matchSearch && matchFilter
  })

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end transition-colors duration-300 ${visible ? 'bg-black/20' : 'bg-transparent'}`}
      onClick={handleClose}
    >
      <div
        className={`w-full max-w-[430px] mx-auto bg-white rounded-t-3xl shadow-2xl p-6 flex flex-col transform transition-transform duration-300 ease-out ${visible ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ height: '88vh' }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4 cursor-grab shrink-0" />

        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 className="text-lg font-bold">Übung wählen</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="flex items-center gap-1 text-xs bg-black text-white rounded-full px-3 py-1.5"
            >
              <Plus size={13} /> Neue Übung
            </button>
            <button onClick={handleClose}><X size={20} className="text-gray-400" /></button>
          </div>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="bg-gray-50 rounded-2xl p-4 mb-4 flex flex-col gap-3 shrink-0">
            <input
              type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="Name der Übung"
              className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none border border-gray-200"
            />
            <input
              type="text" value={newMuscles} onChange={(e) => setNewMuscles(e.target.value)}
              placeholder="Muskeln (z.B. Brust, Trizeps)"
              className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none border border-gray-200"
            />
            <div className="flex gap-2">
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as typeof newCategory)}
                className="flex-1 bg-white rounded-xl px-3 py-2.5 text-sm outline-none border border-gray-200"
              >
                <option value="strength">Kraft</option>
                <option value="cardio">Cardio</option>
                <option value="flexibility">Beweglichkeit</option>
              </select>
              <select
                value={newTracking}
                onChange={(e) => setNewTracking(e.target.value as typeof newTracking)}
                className="flex-1 bg-white rounded-xl px-3 py-2.5 text-sm outline-none border border-gray-200"
              >
                <option value="weight_reps">Gewicht + Wdh.</option>
                <option value="distance_time">Distanz + Zeit</option>
                <option value="time_only">Nur Zeit</option>
              </select>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="w-full bg-black text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {creating ? 'Erstelle…' : 'Übung erstellen'}
            </button>
          </div>
        )}

        <div className="relative mb-3 shrink-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Suchen…"
            className="w-full bg-gray-50 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none"
          />
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto pb-1 shrink-0">
          {(['strength', 'cardio', 'flexibility'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(filter === cat ? null : cat)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium ${filter === cat ? CATEGORY_COLORS[cat] : 'bg-gray-100 text-gray-600'}`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 flex flex-col gap-2 pb-16">
          {filtered.map((ex) => (
            <div key={ex.id} className="flex items-center gap-2">
              <button
                onClick={() => { onSelect(ex); handleClose() }}
                className="flex-1 flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 text-left hover:bg-gray-100"
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${DOT_COLORS[ex.category]}`} />
                <div>
                  <div className="text-sm font-medium text-black">{ex.name}</div>
                  {ex.muscles ? (
                    <div className="text-xs text-gray-400">{ex.muscles}</div>
                  ) : (
                    <div className="text-xs text-gray-400">{CATEGORY_LABELS[ex.category]}</div>
                  )}
                </div>
              </button>
              {ex.userId != null && (
                <button onClick={() => deleteExercise(ex.id)} className="p-2 text-gray-300 hover:text-red-400">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
