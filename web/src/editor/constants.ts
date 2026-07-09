/** Top-level grouping a preset belongs to (drives the modal's filter pills). */
export type PresetCategory = 'social' | 'print' | 'book' | 'presentation' | 'video'

export interface SizePreset {
  id: string
  label: string
  width: number
  height: number
  category: PresetCategory
}

export const SIZE_PRESETS: SizePreset[] = [
  // Social
  { id: 'ig-post', label: 'Instagram post', width: 1080, height: 1080, category: 'social' },
  { id: 'ig-story', label: 'Instagram story', width: 1080, height: 1920, category: 'social' },
  { id: 'fb-post', label: 'Facebook post', width: 1200, height: 630, category: 'social' },
  { id: 'x-post', label: 'Twitter/X post', width: 1600, height: 900, category: 'social' },
  { id: 'li-post', label: 'LinkedIn post', width: 1200, height: 627, category: 'social' },
  { id: 'pin', label: 'Pinterest pin', width: 1000, height: 1500, category: 'social' },
  { id: 'logo', label: 'Logo', width: 500, height: 500, category: 'social' },
  // Video
  { id: 'yt-thumb', label: 'YouTube thumbnail', width: 1280, height: 720, category: 'video' },
  { id: 'yt-banner', label: 'YouTube banner', width: 2560, height: 1440, category: 'video' },
  // Presentation
  { id: 'presentation', label: 'Presentation', width: 1920, height: 1080, category: 'presentation' },
  // Print
  { id: 'a4-portrait', label: 'A4 portrait', width: 794, height: 1123, category: 'print' },
  { id: 'a4-landscape', label: 'A4 landscape', width: 1123, height: 794, category: 'print' },
  { id: 'business-card', label: 'Business card', width: 1050, height: 600, category: 'print' },
  { id: 'poster', label: 'Poster', width: 794, height: 1123, category: 'print' },
  { id: 'flyer', label: 'Flyer', width: 794, height: 1123, category: 'print' },
  { id: 'email-header', label: 'Email header', width: 600, height: 200, category: 'print' },
  // Book
  { id: 'book-us-trade', label: 'US Trade', width: 1800, height: 2700, category: 'book' },
  { id: 'book-digest', label: 'Digest', width: 1500, height: 2400, category: 'book' },
  { id: 'book-square', label: 'Square', width: 2400, height: 2400, category: 'book' },
  { id: 'book-a5', label: 'A5', width: 1748, height: 2480, category: 'book' },
]

/** Book-format presets only, in the order shown by the book setup panel (UX-015). */
export const BOOK_PRESETS = SIZE_PRESETS.filter((p) => p.category === 'book')

/** Bleed margin for book pages (UX-015): 0.125in at the book presets' own
 *  resolution (300dpi, unlike the 96dpi screen scale other presets use). */
export const BOOK_BLEED_PX = 38

/** Filter pills shown above the preset grid; 'all' clears the category filter. */
export const PRESET_FILTERS = ['all', 'social', 'print', 'book', 'presentation', 'video'] as const
export type PresetFilter = (typeof PRESET_FILTERS)[number]

/**
 * Custom-size units. `pxPer` converts one unit into screen pixels (1in = 96px
 * at the editor's screen scale), used to normalise a custom size to the px the
 * canvas works in.
 */
export const SIZE_UNITS = [
  { id: 'px', label: 'px', pxPer: 1 },
  { id: 'in', label: 'in', pxPer: 96 },
  { id: 'cm', label: 'cm', pxPer: 96 / 2.54 },
  { id: 'mm', label: 'mm', pxPer: 96 / 25.4 },
] as const
export type UnitId = (typeof SIZE_UNITS)[number]['id']

export const DEFAULT_WIDTH = 1080
export const DEFAULT_HEIGHT = 1080

/** Canvas zoom range and step (UX-013). 1 = 100%. */
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 8
export const ZOOM_STEP = 0.1

/** Grid step (px) used by snap-to-grid (CLR-004); default for the grid overlay. */
export const GRID_SIZE = 10
/** Preset grid sizes (px) offered in the grid settings (UX-005). */
export const GRID_PRESETS = [5, 10, 20, 50]
/** Distance (px) at which alignment guides engage. */
export const SNAP_MARGIN = 6
