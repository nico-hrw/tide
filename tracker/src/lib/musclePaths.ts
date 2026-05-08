import type { MuscleId } from '@/types/tracker'

export interface MusclePath {
  front?: string
  back?: string
}

export const MUSCLE_PATHS: Record<MuscleId, MusclePath> = {
  chest: {
    front: 'M17,14 L43,14 L41,28 L19,28 Z',
  },
  front_shoulder: {
    front: 'M8,13 L17,13 L17,27 L9,27 Z M43,13 L52,13 L51,27 L43,27 Z',
  },
  rear_shoulder: {
    back: 'M8,13 L17,13 L17,25 L9,25 Z M43,13 L52,13 L51,25 L43,25 Z',
  },
  triceps: {
    back: 'M9,26 L17,26 L16,42 L10,42 Z M43,26 L51,26 L50,42 L44,42 Z',
  },
  biceps: {
    front: 'M9,28 L17,28 L16,43 L10,43 Z M43,28 L51,28 L50,43 L44,43 Z',
  },
  forearms: {
    front: 'M10,44 L16,44 L15,56 L11,56 Z M44,44 L50,44 L49,56 L45,56 Z',
  },
  upper_back: {
    back: 'M19,20 L41,20 L39,37 L21,37 Z',
  },
  lats: {
    back: 'M11,22 L19,22 L18,46 L10,46 Z M41,22 L49,22 L50,46 L42,46 Z',
  },
  traps: {
    back: 'M17,11 L43,11 L41,19 L19,19 Z',
  },
  abs: {
    front: 'M20,29 L40,29 L39,54 L21,54 Z',
  },
  glutes: {
    back: 'M18,57 L42,57 L41,71 L19,71 Z',
  },
  quads: {
    front: 'M18,59 L29,59 L28,84 L17,84 Z M31,59 L42,59 L43,84 L32,84 Z',
  },
  hamstrings: {
    back: 'M18,72 L29,72 L28,90 L17,90 Z M31,72 L42,72 L43,90 L32,90 Z',
  },
  calves: {
    front: 'M18,85 L28,85 L27,99 L18,99 Z M32,85 L42,85 L42,99 L33,99 Z',
    back:  'M18,91 L28,91 L27,99 L18,99 Z M32,91 L42,91 L42,99 L33,99 Z',
  },
}
