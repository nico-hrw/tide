import type { MuscleGroup } from '@/types/tracker'

export const MUSCLE_GROUPS: MuscleGroup[] = [
  { id: 'chest',          name: 'Brust',             view: 'front' },
  { id: 'front_shoulder', name: 'Schulter (vorne)',   view: 'front' },
  { id: 'rear_shoulder',  name: 'Schulter (hinten)',  view: 'back'  },
  { id: 'triceps',        name: 'Trizeps',            view: 'back'  },
  { id: 'biceps',         name: 'Bizeps',             view: 'front' },
  { id: 'forearms',       name: 'Unterarme',          view: 'front' },
  { id: 'upper_back',     name: 'Oberer Rücken',      view: 'back'  },
  { id: 'lats',           name: 'Latissimus',         view: 'back'  },
  { id: 'traps',          name: 'Trapez',             view: 'back'  },
  { id: 'abs',            name: 'Bauch',              view: 'front' },
  { id: 'glutes',         name: 'Gesäß',              view: 'back'  },
  { id: 'quads',          name: 'Quadrizeps',         view: 'front' },
  { id: 'hamstrings',     name: 'Hamstrings',         view: 'back'  },
  { id: 'calves',         name: 'Waden',              view: 'both'  },
]

export const MUSCLE_BY_ID = Object.fromEntries(
  MUSCLE_GROUPS.map((m) => [m.id, m])
) as Record<string, MuscleGroup>
