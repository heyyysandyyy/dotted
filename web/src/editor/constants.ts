export type PresetId = 'social' | 'presentation' | 'a4' | 'custom'

export interface SizePreset {
  id: PresetId
  label: string
  width: number
  height: number
}

export const SIZE_PRESETS: SizePreset[] = [
  { id: 'social', label: 'Social Post', width: 1080, height: 1080 },
  { id: 'presentation', label: 'Presentation', width: 1920, height: 1080 },
  { id: 'a4', label: 'A4 Portrait', width: 794, height: 1123 },
]

export const DEFAULT_WIDTH = 1080
export const DEFAULT_HEIGHT = 1080

export const DARK_SURROUND = '#1e1e1e'
