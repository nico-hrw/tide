import type { MuscleId } from '@/types/tracker'

interface MuscleDef {
  primary: MuscleId[]
  secondary: MuscleId[]
}

export const BUILTIN_MUSCLE_MAP: Record<string, MuscleDef> = {
  // Push — Brust
  'Bankdrücken':              { primary: ['chest'], secondary: ['triceps', 'front_shoulder'] },
  'Schrägbankdrücken':        { primary: ['chest'], secondary: ['triceps', 'front_shoulder'] },
  'Liegestütz':               { primary: ['chest'], secondary: ['triceps', 'front_shoulder'] },
  'Kabelflieges':             { primary: ['chest'], secondary: ['front_shoulder'] },
  'Dips':                     { primary: ['triceps', 'chest'], secondary: ['front_shoulder'] },
  'Trizepsdrücken':           { primary: ['triceps'], secondary: [] },
  'Skull Crushers':           { primary: ['triceps'], secondary: [] },

  // Push — Schulter
  'Schulterdrücken':          { primary: ['front_shoulder'], secondary: ['triceps', 'traps'] },
  'Seitheben':                { primary: ['front_shoulder', 'rear_shoulder'], secondary: [] },
  'Frontheben':               { primary: ['front_shoulder'], secondary: [] },

  // Pull — Rücken
  'Klimmzüge':                { primary: ['lats'], secondary: ['biceps', 'upper_back'] },
  'Latziehen':                { primary: ['lats'], secondary: ['biceps', 'upper_back'] },
  'Rudern':                   { primary: ['upper_back', 'lats'], secondary: ['biceps', 'rear_shoulder'] },
  'Kreuzheben':               { primary: ['lats', 'upper_back'], secondary: ['glutes', 'hamstrings'] },
  'Face Pulls':               { primary: ['rear_shoulder', 'traps'], secondary: ['upper_back'] },

  // Pull — Bizeps
  'Bizepscurls':              { primary: ['biceps'], secondary: ['forearms'] },
  'Hammercurls':              { primary: ['biceps', 'forearms'], secondary: [] },

  // Beine
  'Kniebeugen':               { primary: ['quads', 'glutes'], secondary: ['hamstrings', 'calves'] },
  'Beinpresse':               { primary: ['quads', 'glutes'], secondary: ['hamstrings'] },
  'Ausfallschritte':          { primary: ['quads', 'glutes'], secondary: ['hamstrings', 'calves'] },
  'Beinstrecker':             { primary: ['quads'], secondary: [] },
  'Bein Curl':                { primary: ['hamstrings'], secondary: [] },
  'Wadenheben':               { primary: ['calves'], secondary: [] },
  'Hip Thrust':               { primary: ['glutes'], secondary: ['hamstrings'] },

  // Core
  'Plank':                    { primary: ['abs'], secondary: [] },
  'Crunches':                 { primary: ['abs'], secondary: [] },
  'Beinheben':                { primary: ['abs'], secondary: [] },

  // Cardio
  'Laufen':                   { primary: ['quads', 'hamstrings'], secondary: ['calves', 'glutes'] },
  'Radfahren':                { primary: ['quads', 'glutes'], secondary: ['hamstrings', 'calves'] },
}

export function getMusclesForExercise(exerciseName: string): MuscleDef {
  return BUILTIN_MUSCLE_MAP[exerciseName] ?? { primary: [], secondary: [] }
}
