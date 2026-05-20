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
